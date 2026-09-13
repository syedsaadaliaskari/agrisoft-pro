import { getDb } from "../db";
import { clearLocalShopData } from "../db/shop-clear";
import { applyJoinedShopLicense } from "../db/license";
import { ensurePermissions } from "../db/seed";
import { supabaseRest, SyncError, resolveTenant } from "./client";
import { normalizeShopCode, rememberShopCode } from "./shopCode";
import { setSetting } from "./store";
import { resetLocalSyncState } from "./tombstones";
import { runShopCloudSync } from "./shop";
import { syncUsers } from "./users";

export type CloudTenant = {
  id: string;
  name: string;
  join_code: string | null;
  plan: string | null;
  license_expires_at: string | null;
  license_name: string | null;
  is_active: boolean;
};

export async function lookupShopByJoinCode(rawCode: string): Promise<CloudTenant> {
  const code = normalizeShopCode(rawCode);
  if (code.length < 6) {
    throw new SyncError("Shop code is not valid");
  }
  try {
    const rows = await supabaseRest<CloudTenant[]>("tenants", {
      query: `join_code=eq.${encodeURIComponent(code)}&deleted_at=is.null&is_active=eq.true&select=id,name,join_code,plan,license_expires_at,license_name,is_active`,
    });
    const shop = (rows || [])[0];
    if (!shop?.id) throw new SyncError("Shop code is not valid");
    return shop;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/join_code|42703|schema cache/i.test(message)) {
      throw new SyncError("Run supabase/shop-join.sql in the Supabase SQL Editor first.");
    }
    if (err instanceof SyncError) throw err;
    throw new SyncError(message || "Could not reach the shop cloud");
  }
}

/** Connect this PC to the shop for `code`, then pull that shop. */
export async function joinShopByCode(rawCode: string): Promise<void> {
  const shop = await lookupShopByJoinCode(rawCode);
  const current = resolveTenant().tenantId;
  rememberShopCode(shop.join_code || rawCode);
  applyJoinedShopLicense(getDb(), {
    tenantId: shop.id,
    plan: shop.plan,
    expiresAt: shop.license_expires_at,
    name: shop.license_name || shop.name,
  });

  if (current === shop.id) {
    await syncUsers();
    return;
  }

  resetLocalSyncState();
  setSetting("cloud_last_sync_at", "");
  setSetting("cloud_last_sync_error", "");
  clearLocalShopData();
  rememberShopCode(shop.join_code || rawCode);
  applyJoinedShopLicense(getDb(), {
    tenantId: shop.id,
    plan: shop.plan,
    expiresAt: shop.license_expires_at,
    name: shop.license_name || shop.name,
  });
  if (shop.name?.trim()) {
    setSetting("shop_name", shop.name.trim());
  }
  await runShopCloudSync();
  ensurePermissions(getDb());
}
