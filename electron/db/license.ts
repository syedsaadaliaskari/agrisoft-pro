import { createHmac, randomUUID } from "crypto";
import { eq, desc } from "drizzle-orm";
import type { Db } from "./index";
import { licenses, settings } from "./schema";

/** Shared app secret so activation codes work offline between vendor PC and customer PC. */
const ACTIVATION_HMAC_SECRET = "agri-soft-pro-activation-v1";

export const TRIAL_DAYS = 7;
export const CLOUD_TENANT_SETTING_KEY = "supabase_tenant_id";

export type LicensePlan = "monthly" | "yearly" | "forever";

export type LicenseStatus = {
  installId: string;
  installedAt: string;
  trialEndsAt: string;
  trialDaysLeft: number;
  mode: "trial" | "pro" | "locked";
  allowed: boolean;
  plan: LicensePlan | null;
  expiresAt: string | null;
  licenseName: string | null;
  /** Unpackaged Electron — never locks so development stays open */
  isDevBypass: boolean;
  /** Shop cloud namespace (from activation). Empty until Pro code applied / env used. */
  cloudTenantId: string | null;
};

export type LicenseRow = {
  id: string;
  name: string;
  installId: string;
  plan: LicensePlan;
  activatedAt: string;
  expiresAt: string | null;
  notes: string | null;
  phone: string | null;
  tenantId: string | null;
  createdAt: string;
  activationCode: string;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(isoDate: string, days: number) {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonthsIso(isoDate: string, months: number) {
  const d = new Date(isoDate + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string) {
  const a = new Date(fromIso + "T12:00:00").getTime();
  const b = new Date(toIso + "T12:00:00").getTime();
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function getSetting(db: Db, key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

function setSetting(db: Db, key: string, value: string, groupName = "license") {
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  const now = new Date().toISOString();
  if (existing) {
    db.update(settings)
      .set({ value, updatedAt: now })
      .where(eq(settings.id, existing.id))
      .run();
  } else {
    db.insert(settings)
      .values({ id: randomUUID(), key, value, groupName })
      .run();
  }
}

function makeInstallId() {
  const part = () => randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `ASP-${part()}-${part()}-${part()}`;
}

/** Ensure this install has a stable Install ID + first-run date. */
export function ensureInstallIdentity(db: Db): { installId: string; installedAt: string } {
  let installId = getSetting(db, "license_install_id");
  let installedAt = getSetting(db, "license_installed_at");
  if (!installId) {
    installId = makeInstallId();
    setSetting(db, "license_install_id", installId);
  }
  if (!installedAt) {
    installedAt = todayIsoDate();
    setSetting(db, "license_installed_at", installedAt);
  }
  return { installId, installedAt };
}

function mapLicense(row: typeof licenses.$inferSelect): LicenseRow {
  const base = {
    id: row.id,
    name: row.name,
    installId: row.installId,
    plan: row.plan as LicensePlan,
    activatedAt: row.activatedAt,
    expiresAt: row.expiresAt,
    notes: row.notes,
    phone: row.phone ?? null,
    tenantId: row.tenantId ?? null,
    createdAt: row.createdAt,
  };
  return { ...base, activationCode: buildActivationCode(base) };
}

type ActivationPayloadV1 = {
  v: 1;
  installId: string;
  name: string;
  plan: LicensePlan;
  activatedAt: string;
  expiresAt: string | null;
};

type ActivationPayloadV2 = {
  v: 2;
  installId: string;
  name: string;
  plan: LicensePlan;
  activatedAt: string;
  expiresAt: string | null;
  tenantId: string;
};

type ActivationPayload = ActivationPayloadV1 | ActivationPayloadV2;

export function buildActivationCode(
  row: Pick<LicenseRow, "installId" | "name" | "plan" | "activatedAt" | "expiresAt" | "tenantId">
): string {
  const tenantId = row.tenantId?.trim();
  const payload: ActivationPayload = tenantId
    ? {
        v: 2,
        installId: row.installId,
        name: row.name,
        plan: row.plan,
        activatedAt: row.activatedAt,
        expiresAt: row.expiresAt,
        tenantId,
      }
    : {
        v: 1,
        installId: row.installId,
        name: row.name,
        plan: row.plan,
        activatedAt: row.activatedAt,
        expiresAt: row.expiresAt,
      };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", ACTIVATION_HMAC_SECRET).update(body).digest("base64url").slice(0, 24);
  return `ASP1.${body}.${sig}`;
}

function findActiveLicense(db: Db, installId: string): LicenseRow | null {
  const rows = db
    .select()
    .from(licenses)
    .where(eq(licenses.installId, installId))
    .orderBy(desc(licenses.activatedAt))
    .all();
  const today = todayIsoDate();
  for (const row of rows) {
    if (row.plan === "forever" || !row.expiresAt) {
      return mapLicense(row);
    }
    if (row.expiresAt >= today) {
      return mapLicense(row);
    }
  }
  return null;
}

function resolveTenantForInstall(db: Db, installId: string): string {
  const prior = db
    .select()
    .from(licenses)
    .where(eq(licenses.installId, installId))
    .orderBy(desc(licenses.createdAt))
    .all();
  for (const row of prior) {
    const tid = row.tenantId?.trim();
    if (tid) return tid;
  }
  return randomUUID();
}

export function getLicenseStatus(db: Db, _isDev: boolean): LicenseStatus {
  const { installId, installedAt } = ensureInstallIdentity(db);
  const trialEndsAt = addDaysIso(installedAt, TRIAL_DAYS);
  const today = todayIsoDate();
  const elapsed = daysBetween(installedAt, today);
  const trialDaysLeft = Math.max(0, TRIAL_DAYS - elapsed);
  const cloudTenantId = getSetting(db, CLOUD_TENANT_SETTING_KEY);

  const active = findActiveLicense(db, installId);
  if (active) {
    return {
      installId,
      installedAt,
      trialEndsAt,
      trialDaysLeft,
      mode: "pro",
      allowed: true,
      plan: active.plan,
      expiresAt: active.expiresAt,
      licenseName: active.name,
      isDevBypass: false,
      cloudTenantId: cloudTenantId || active.tenantId,
    };
  }

  if (trialDaysLeft > 0) {
    return {
      installId,
      installedAt,
      trialEndsAt,
      trialDaysLeft,
      mode: "trial",
      allowed: true,
      plan: null,
      expiresAt: null,
      licenseName: null,
      isDevBypass: false,
      cloudTenantId,
    };
  }

  return {
    installId,
    installedAt,
    trialEndsAt,
    trialDaysLeft: 0,
    mode: "locked",
    allowed: false,
    plan: null,
    expiresAt: null,
    licenseName: null,
    isDevBypass: false,
    cloudTenantId,
  };
}

export function listLicenses(db: Db): LicenseRow[] {
  return db.select().from(licenses).orderBy(desc(licenses.createdAt)).all().map(mapLicense);
}

export function createLicense(
  db: Db,
  input: {
    name: string;
    installId: string;
    plan: LicensePlan;
    notes?: string | null;
    phone?: string | null;
  }
): LicenseRow {
  const name = input.name.trim();
  const installId = input.installId.trim().toUpperCase();
  if (!name) throw new Error("Name is required");
  if (!installId) throw new Error("Install ID is required");
  if (!["monthly", "yearly", "forever"].includes(input.plan)) {
    throw new Error("Invalid plan");
  }

  const activatedAt = todayIsoDate();
  let expiresAt: string | null = null;
  if (input.plan === "monthly") expiresAt = addMonthsIso(activatedAt, 1);
  if (input.plan === "yearly") expiresAt = addMonthsIso(activatedAt, 12);

  const tenantId = resolveTenantForInstall(db, installId);
  const id = randomUUID();
  const now = new Date().toISOString();
  const phone = input.phone?.trim() || null;
  db.insert(licenses)
    .values({
      id,
      name,
      installId,
      plan: input.plan,
      activatedAt,
      expiresAt,
      notes: input.notes?.trim() || null,
      phone,
      tenantId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return mapLicense(db.select().from(licenses).where(eq(licenses.id, id)).get()!);
}

export function deleteLicense(db: Db, id: string): void {
  const row = db.select().from(licenses).where(eq(licenses.id, id)).get();
  db.delete(licenses).where(eq(licenses.id, id)).run();
  // If we removed Pro for THIS PC and nothing else covers it, lock immediately
  // (do not wait for trial days or month end).
  if (row) {
    const { installId } = ensureInstallIdentity(db);
    if (row.installId === installId && !findActiveLicense(db, installId)) {
      expireTrialNow(db);
    }
  }
}

/** Testing helper: set install date so trial is already over. */
export function expireTrialNow(db: Db): void {
  ensureInstallIdentity(db);
  setSetting(db, "license_installed_at", addDaysIso(todayIsoDate(), -(TRIAL_DAYS + 1)));
}

/**
 * Immediately lock THIS install: remove its Pro rows and end trial.
 * Does not affect other Install IDs stored in the activated list.
 */
export function lockThisInstallNow(db: Db): LicenseStatus {
  const { installId } = ensureInstallIdentity(db);
  const rows = db.select().from(licenses).where(eq(licenses.installId, installId)).all();
  for (const row of rows) {
    db.delete(licenses).where(eq(licenses.id, row.id)).run();
  }
  expireTrialNow(db);
  return getLicenseStatus(db, false);
}

function storeCloudTenantId(db: Db, tenantId: string) {
  setSetting(db, CLOUD_TENANT_SETTING_KEY, tenantId.trim(), "sync");
}

/** Customer PC: paste code from vendor WhatsApp to unlock this install. */
export function applyActivationCode(db: Db, rawCode: string): LicenseStatus {
  const code = rawCode.trim().replace(/\s+/g, "");
  const parts = code.split(".");
  if (parts.length !== 3 || parts[0] !== "ASP1") {
    throw new Error("Invalid activation code");
  }
  const [, body, sig] = parts;
  const expected = createHmac("sha256", ACTIVATION_HMAC_SECRET)
    .update(body)
    .digest("base64url")
    .slice(0, 24);
  if (sig !== expected) {
    throw new Error("Invalid or tampered activation code");
  }

  let payload: ActivationPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ActivationPayload;
  } catch {
    throw new Error("Invalid activation code");
  }

  if ((payload?.v !== 1 && payload?.v !== 2) || !payload.installId || !payload.plan) {
    throw new Error("Invalid activation code");
  }
  if (!["monthly", "yearly", "forever"].includes(payload.plan)) {
    throw new Error("Invalid plan in activation code");
  }

  const tenantFromCode =
    payload.v === 2 && typeof payload.tenantId === "string" ? payload.tenantId.trim() : "";

  const { installId } = ensureInstallIdentity(db);
  if (payload.installId.toUpperCase() !== installId) {
    throw new Error(
      `This code is for ${payload.installId}, but this PC is ${installId}`
    );
  }

  if (payload.plan !== "forever" && payload.expiresAt && payload.expiresAt < todayIsoDate()) {
    throw new Error("This activation code has expired");
  }

  if (tenantFromCode) {
    storeCloudTenantId(db, tenantFromCode);
  }

  if (findActiveLicense(db, installId)) {
    return getLicenseStatus(db, false);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const tenantId = tenantFromCode || resolveTenantForInstall(db, installId);
  if (!tenantFromCode) {
    storeCloudTenantId(db, tenantId);
  }

  db.insert(licenses)
    .values({
      id,
      name: (payload.name || "Activated").trim() || "Activated",
      installId,
      plan: payload.plan,
      activatedAt: payload.activatedAt || todayIsoDate(),
      expiresAt: payload.plan === "forever" ? null : payload.expiresAt,
      notes: "Applied from activation code",
      tenantId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return getLicenseStatus(db, false);
}
