import { app } from "electron";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { applySharedShopLicense, readLocalShopLicense, type SharedShopLicense } from "../db/license";
import { settings } from "../db/schema";
import { getSyncConfig, supabaseRpc } from "./client";

function vendorUnlockOnThisPc(): boolean {
  const row = getDb().select().from(settings).where(eq(settings.key, "vendor_unlocked")).get();
  return row?.value === "1";
}

/**
 * One Install ID, trial, and activation for this shop.
 * Super Admin / vendor unlock and unpackaged dev do not call this and do not publish a free unlock.
 * The SQL function decides the merge. This only saves the row it returns.
 */
export async function syncDesktopShopLicense(): Promise<void> {
  if (!app.isPackaged) return;
  if (vendorUnlockOnThisPc()) return;

  const cfg = getSyncConfig();
  if (!cfg.configured || !cfg.tenantId || cfg.tenantSource === "env") return;

  const local = readLocalShopLicense(getDb());
  let shop: SharedShopLicense | null = null;
  try {
    shop = await supabaseRpc<SharedShopLicense>("sync_shop_license", {
      p_tenant_id: cfg.tenantId,
      p_install_id: local.installId,
      p_trial_started_at: local.installedAt,
      p_plan: local.plan,
      p_expires_at: local.expiresAt,
      p_license_name: local.licenseName,
      p_source: "desktop",
    });
  } catch (err) {
    console.warn("Shop license sync failed:", err instanceof Error ? err.message : err);
    return;
  }
  if (!shop || typeof shop !== "object") return;
  applySharedShopLicense(getDb(), shop, local.installId);
}
