import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { app } from "electron";
import { and, eq, asc } from "drizzle-orm";
import type { Db } from "./index";
import { customers, licenses, settings, vouchers } from "./schema";
import { money, partySignedBalance } from "./ledger";
import type { LicenseRow } from "./license";

export type N8nEvent =
  | "license.activated"
  | "license.payment_due"
  | "customer.payment_due"
  | "n8n.test";

export type N8nPayload = {
  event: N8nEvent;
  channel: "whatsapp";
  to: string | null;
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
};

type QueueItem = N8nPayload & {
  id: string;
  attempts: number;
  dedupeKey: string;
  lastError?: string;
};

function isDev(): boolean {
  return !app.isPackaged;
}

function userDataDir(): string {
  return isDev()
    ? path.join(process.cwd(), "data")
    : path.join(app.getPath("userData"), "data");
}

function queuePath(): string {
  return path.join(userDataDir(), "n8n-queue.json");
}

function getSetting(db: Db, key: string): string {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? "";
}

function setSetting(db: Db, key: string, value: string, groupName = "n8n") {
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  const now = new Date().toISOString();
  if (existing) {
    db.update(settings)
      .set({ value, updatedAt: now })
      .where(eq(settings.id, existing.id))
      .run();
  } else {
    db.insert(settings)
      .values({ id: randomUUID(), key, value, groupName, createdAt: now, updatedAt: now })
      .run();
  }
}

export function getN8nConfig(db: Db) {
  return {
    enabled: getSetting(db, "n8n_enabled") === "1",
    webhookUrl: getSetting(db, "n8n_webhook_url").trim(),
    paymentDaysBefore: Math.max(0, Number(getSetting(db, "n8n_payment_days_before") || "3") || 3),
    minDueAmount: Math.max(0, Number(getSetting(db, "n8n_min_due_amount") || "1") || 1),
  };
}

function readQueue(): QueueItem[] {
  try {
    const p = queuePath();
    if (!fs.existsSync(p)) return [];
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as QueueItem[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueueItem[]) {
  const dir = userDataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(queuePath(), JSON.stringify(items, null, 2), "utf8");
}

function readSentMap(db: Db): Record<string, string> {
  try {
    const raw = getSetting(db, "n8n_sent_reminders");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSentMap(db: Db, map: Record<string, string>) {
  setSetting(db, "n8n_sent_reminders", JSON.stringify(map));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(isoDate: string): number {
  const a = new Date(todayIso() + "T12:00:00").getTime();
  const b = new Date(isoDate + "T12:00:00").getTime();
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

export function enqueueN8n(db: Db, item: Omit<QueueItem, "id" | "attempts"> & { id?: string }) {
  const cfg = getN8nConfig(db);
  if (!cfg.enabled || !cfg.webhookUrl) return { queued: false, reason: "n8n disabled or URL empty" };

  const queue = readQueue();
  if (item.dedupeKey && queue.some((q) => q.dedupeKey === item.dedupeKey)) {
    return { queued: false, reason: "already queued" };
  }
  queue.push({
    id: item.id ?? randomUUID(),
    attempts: 0,
    event: item.event,
    channel: item.channel,
    to: item.to,
    message: item.message,
    data: item.data,
    createdAt: item.createdAt,
    dedupeKey: item.dedupeKey,
  });
  writeQueue(queue);
  return { queued: true };
}

async function postWebhook(url: string, body: N8nPayload): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook HTTP ${res.status}${text ? `: ${text.slice(0, 180)}` : ""}`);
  }
}

/** Try sending queued webhooks. Safe offline — failures stay in queue. */
export async function flushN8nQueue(db: Db): Promise<{ sent: number; remaining: number; error?: string }> {
  const cfg = getN8nConfig(db);
  if (!cfg.enabled || !cfg.webhookUrl) {
    return { sent: 0, remaining: readQueue().length, error: "n8n disabled or URL empty" };
  }

  const queue = readQueue();
  if (!queue.length) return { sent: 0, remaining: 0 };

  const remaining: QueueItem[] = [];
  let sent = 0;
  let lastError: string | undefined;

  for (const item of queue) {
    try {
      const { id: _id, attempts: _a, dedupeKey: _d, lastError: _e, ...payload } = item;
      await postWebhook(cfg.webhookUrl, payload);
      sent += 1;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Webhook failed";
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError,
      });
    }
  }

  writeQueue(remaining);
  return { sent, remaining: remaining.length, error: lastError };
}

export function buildActivationWhatsAppMessage(row: {
  name: string;
  installId: string;
  plan: string;
  activationCode: string;
}): string {
  return [
    `Hello ${row.name},`,
    `Your Agri Soft Pro is activated (${row.plan}).`,
    `Install ID: ${row.installId}`,
    ``,
    `Activation code:`,
    row.activationCode,
    ``,
    `Paste this code on the Activate Pro screen, then use normal login.`,
  ].join("\n");
}

export function enqueueLicenseActivated(
  db: Db,
  row: LicenseRow,
  phone?: string | null
): { queued: boolean; reason?: string } {
  const to = (phone || "").trim() || null;
  const message = buildActivationWhatsAppMessage(row);
  return enqueueN8n(db, {
    event: "license.activated",
    channel: "whatsapp",
    to,
    message,
    createdAt: new Date().toISOString(),
    dedupeKey: `license.activated:${row.id}`,
    data: {
      name: row.name,
      installId: row.installId,
      plan: row.plan,
      tenantId: row.tenantId,
      expiresAt: row.expiresAt,
      activationCode: row.activationCode,
      phone: to,
    },
  });
}

function customerPartyMove(v: typeof vouchers.$inferSelect) {
  const t = v.voucherType;
  const amt = money(v.grandTotal);
  const isCreditRefund = money(v.paidAmount) === 0;
  if (t === "sale") return { debit: amt, credit: money(v.paidAmount) };
  if (t === "sale_return") {
    return isCreditRefund ? { debit: 0, credit: amt } : { debit: 0, credit: 0 };
  }
  if (t === "receipt") return { debit: 0, credit: money(v.paidAmount || v.grandTotal) };
  return { debit: 0, credit: 0 };
}

function customerOwedBalance(db: Db, customerId: string, openingBalance: number, balanceType: string) {
  const rows = db
    .select()
    .from(vouchers)
    .where(
      and(
        eq(vouchers.partyType, "customer"),
        eq(vouchers.partyId, customerId),
        eq(vouchers.status, "posted")
      )
    )
    .orderBy(asc(vouchers.voucherDate), asc(vouchers.createdAt))
    .all();

  let debit = 0;
  let credit = 0;
  for (const v of rows) {
    const m = customerPartyMove(v);
    debit = money(debit + m.debit);
    credit = money(credit + m.credit);
  }
  const bal = partySignedBalance(openingBalance, balanceType as "debit" | "credit", debit, credit);
  // Positive signed with debit nature = customer owes us
  return bal.signed > 0.009 ? money(bal.signed) : 0;
}

/** Scan licenses + customer dues and enqueue WhatsApp reminders (once per day per key). */
export function scanAndEnqueueReminders(db: Db): { enqueued: number } {
  const cfg = getN8nConfig(db);
  if (!cfg.enabled || !cfg.webhookUrl) return { enqueued: 0 };

  const sent = readSentMap(db);
  const today = todayIso();
  let enqueued = 0;
  const shopName = getSetting(db, "shop_name") || "Agri Soft Pro";
  const currency = getSetting(db, "currency_symbol") || "Rs";

  // 1) License renewal
  const licenseRows = db.select().from(licenses).all();
  for (const row of licenseRows) {
    if (!row.expiresAt || row.plan === "forever") continue;
    const left = daysUntil(row.expiresAt);
    if (left < 0 || left > cfg.paymentDaysBefore) continue;
    const dedupeKey = `license.payment_due:${row.installId}:${row.expiresAt}:${today}`;
    if (sent[dedupeKey]) continue;

    const phone = (row.phone || "").trim() || null;
    let to = phone;
    if (!to && row.notes) {
      const m = /phone\s*[:=]\s*([+\d][\d\s-]{6,})/i.exec(row.notes);
      if (m) to = m[1].replace(/\s+/g, "");
    }

    const message = [
      `Hello ${row.name},`,
      `Your Agri Soft Pro ${row.plan} plan expires on ${row.expiresAt} (${left} day(s) left).`,
      `Install ID: ${row.installId}`,
      `Please arrange payment to renew.`,
      `— ${shopName}`,
    ].join("\n");

    const result = enqueueN8n(db, {
      event: "license.payment_due",
      channel: "whatsapp",
      to,
      message,
      createdAt: new Date().toISOString(),
      dedupeKey,
      data: {
        name: row.name,
        installId: row.installId,
        plan: row.plan,
        expiresAt: row.expiresAt,
        daysLeft: left,
        phone: to,
      },
    });
    if (result.queued) {
      sent[dedupeKey] = today;
      enqueued += 1;
    }
  }

  // 2) Customer dues
  const custRows = db.select().from(customers).where(eq(customers.isActive, true)).all();
  for (const c of custRows) {
    const phone = (c.phone || "").trim();
    if (!phone) continue;
    const owed = customerOwedBalance(db, c.id, c.openingBalance, c.balanceType);
    if (owed < cfg.minDueAmount) continue;

    const dedupeKey = `customer.payment_due:${c.id}:${today}`;
    if (sent[dedupeKey]) continue;

    const message = [
      `Hello ${c.name},`,
      `Your outstanding balance is ${currency} ${owed.toFixed(2)}.`,
      `Please clear payment at your earliest.`,
      `Thank you — ${shopName}`,
    ].join("\n");

    const result = enqueueN8n(db, {
      event: "customer.payment_due",
      channel: "whatsapp",
      to: phone,
      message,
      createdAt: new Date().toISOString(),
      dedupeKey,
      data: {
        customerId: c.id,
        name: c.name,
        phone,
        balance: owed,
        currency,
      },
    });
    if (result.queued) {
      sent[dedupeKey] = today;
      enqueued += 1;
    }
  }

  writeSentMap(db, sent);
  return { enqueued };
}

export async function runN8nAutomationPass(db: Db) {
  const scanned = scanAndEnqueueReminders(db);
  const flushed = await flushN8nQueue(db);
  return { ...scanned, ...flushed };
}

export function enqueueTestMessage(db: Db, to?: string | null) {
  const phone = (to || "").trim() || null;
  return enqueueN8n(db, {
    event: "n8n.test",
    channel: "whatsapp",
    to: phone,
    message: "Agri Soft Pro n8n test: webhook is working.",
    createdAt: new Date().toISOString(),
    dedupeKey: `n8n.test:${Date.now()}`,
    data: { phone },
  });
}
