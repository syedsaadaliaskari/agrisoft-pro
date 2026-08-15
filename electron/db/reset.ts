import fs from "fs";
import path from "path";
import { app } from "electron";
import { eq } from "drizzle-orm";
import {
  closeDatabase,
  getDb,
  getDbPath,
  getDbRelatedPaths,
  initDatabase,
} from "./index";
import { licenses, settings } from "./schema";
import { setSkipQuitAutoBackup } from "./backup";
import { loadLanConfig } from "../lan/config";

function removeIfExists(p: string) {
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

type LicenseSnapshot = {
  id: string;
  name: string;
  installId: string;
  plan: string;
  activatedAt: string;
  expiresAt: string | null;
  notes: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Wipe shop data and reseed a clean DB.
 * Keeps Install ID + Pro licenses + vendor unlock so activation is not lost.
 * Blocks LAN client mode (reset only on standalone / main PC).
 */
export async function resetShopDatabase(): Promise<{ relaunching: true }> {
  if (loadLanConfig().mode === "client") {
    throw new Error("Reset shop data only on the main PC (or This PC alone mode)");
  }

  const live = getDbPath();
  if (!live) throw new Error("Database path unknown");

  const db = getDb();
  const keepKeys = ["license_install_id", "license_installed_at", "vendor_unlocked"] as const;
  const keptSettings: { key: string; value: string; groupName: string }[] = [];
  for (const key of keepKeys) {
    const row = db.select().from(settings).where(eq(settings.key, key)).get();
    if (row?.value) {
      keptSettings.push({
        key: row.key,
        value: row.value,
        groupName: row.groupName || "system",
      });
    }
  }
  const keptLicenses: LicenseSnapshot[] = db.select().from(licenses).all().map((r) => ({
    id: r.id,
    name: r.name,
    installId: r.installId,
    plan: r.plan,
    activatedAt: r.activatedAt,
    expiresAt: r.expiresAt,
    notes: r.notes,
    phone: r.phone,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  closeDatabase();

  for (const p of getDbRelatedPaths(live)) {
    removeIfExists(p);
  }

  // Optional: clear shop logo
  try {
    const brandingDir = path.join(app.getPath("userData"), "branding");
    if (fs.existsSync(brandingDir)) {
      for (const f of fs.readdirSync(brandingDir)) {
        removeIfExists(path.join(brandingDir, f));
      }
    }
  } catch {
    /* ignore */
  }

  // Optional: clear n8n queue file
  try {
    const queue = path.join(path.dirname(live), "n8n-queue.json");
    removeIfExists(queue);
  } catch {
    /* ignore */
  }

  await initDatabase();
  const fresh = getDb();
  const now = new Date().toISOString();

  for (const s of keptSettings) {
    const existing = fresh.select().from(settings).where(eq(settings.key, s.key)).get();
    if (existing) {
      fresh
        .update(settings)
        .set({ value: s.value, updatedAt: now })
        .where(eq(settings.id, existing.id))
        .run();
    } else {
      const { randomUUID } = await import("crypto");
      fresh
        .insert(settings)
        .values({
          id: randomUUID(),
          key: s.key,
          value: s.value,
          groupName: s.groupName,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  }

  for (const row of keptLicenses) {
    const exists = fresh.select().from(licenses).where(eq(licenses.id, row.id)).get();
    if (exists) continue;
    fresh.insert(licenses).values(row).run();
  }

  setSkipQuitAutoBackup(true);
  app.relaunch();
  app.exit(0);
  return { relaunching: true };
}
