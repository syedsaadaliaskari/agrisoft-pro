import { randomUUID } from "crypto";
import { eq, desc } from "drizzle-orm";
import type { Db } from "./index";
import { licenses, settings } from "./schema";

export const TRIAL_DAYS = 7;

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
};

export type LicenseRow = {
  id: string;
  name: string;
  installId: string;
  plan: LicensePlan;
  activatedAt: string;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
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
  return {
    id: row.id,
    name: row.name,
    installId: row.installId,
    plan: row.plan as LicensePlan,
    activatedAt: row.activatedAt,
    expiresAt: row.expiresAt,
    notes: row.notes,
    createdAt: row.createdAt,
  };
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

export function getLicenseStatus(db: Db, _isDev: boolean): LicenseStatus {
  const { installId, installedAt } = ensureInstallIdentity(db);
  const trialEndsAt = addDaysIso(installedAt, TRIAL_DAYS);
  const today = todayIsoDate();
  const elapsed = daysBetween(installedAt, today);
  const trialDaysLeft = Math.max(0, TRIAL_DAYS - elapsed);

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
  };
}

export function listLicenses(db: Db): LicenseRow[] {
  return db.select().from(licenses).orderBy(desc(licenses.createdAt)).all().map(mapLicense);
}

export function createLicense(
  db: Db,
  input: { name: string; installId: string; plan: LicensePlan; notes?: string | null }
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

  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(licenses)
    .values({
      id,
      name,
      installId,
      plan: input.plan,
      activatedAt,
      expiresAt,
      notes: input.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return mapLicense(db.select().from(licenses).where(eq(licenses.id, id)).get()!);
}

export function deleteLicense(db: Db, id: string): void {
  db.delete(licenses).where(eq(licenses.id, id)).run();
}

/** Testing helper: set install date so trial is already over. */
export function expireTrialNow(db: Db): void {
  ensureInstallIdentity(db);
  setSetting(db, "license_installed_at", addDaysIso(todayIsoDate(), -(TRIAL_DAYS + 1)));
}
