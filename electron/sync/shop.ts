import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { customers, settings } from "../db/schema";
import { ensureCloudTenant, getSyncConfig, SyncError, tenantId, type TenantSource } from "./client";
import { syncAccounts } from "./accounts";
import { syncDocumentCounters } from "./counters";
import { syncCustomers } from "./customers";
import { syncMasters } from "./masters";
import { syncProducts } from "./products";
import { syncPurchases } from "./purchases";
import { syncReturns } from "./returns";
import { syncSales } from "./sales";
import { syncStockMovements } from "./stock";
import { getSetting, recordSyncError, setSetting } from "./store";
import { syncVendors } from "./vendors";
import { syncVouchers } from "./vouchers";

export type CloudSyncStatus = {
  configured: boolean;
  url: string;
  tenantId: string;
  tenantSource: TenantSource;
  lastSyncAt: string | null;
  lastError: string | null;
  localCustomerCount: number;
};

export type CloudSyncResult = {
  pushedCustomers: number;
  pulledCustomers: number;
  pushedProducts: number;
  pulledProducts: number;
  pushedSales: number;
  pulledSales: number;
  pushedVendors: number;
  pulledVendors: number;
  pushedPurchases: number;
  pulledPurchases: number;
  pushedVouchers: number;
  pulledVouchers: number;
  lastSyncAt: string;
};

export { recordSyncError };

export function getCloudSyncStatus(): CloudSyncStatus {
  const cfg = getSyncConfig();
  const db = getDb();
  const localCustomerCount = db.select().from(customers).all().length;
  return {
    configured: cfg.configured,
    url: cfg.url,
    tenantId: cfg.tenantId,
    tenantSource: cfg.tenantSource,
    lastSyncAt: getSetting("cloud_last_sync_at") || null,
    lastError: getSetting("cloud_last_sync_error") || null,
    localCustomerCount,
  };
}

/** Full shop sync to Supabase (auto + Sync now). */
export async function runShopCloudSync(): Promise<CloudSyncResult> {
  const cfg = getSyncConfig();
  if (!cfg.configured) {
    throw new SyncError(
      "Supabase is not configured. Add URL + service role key, and activate Pro (or set SUPABASE_TENANT_ID for dev)."
    );
  }

  const tid = tenantId();
  const db = getDb();
  const shopName =
    db.select().from(settings).where(eq(settings.key, "shop_name")).get()?.value?.trim() || "Shop";

  await ensureCloudTenant(tid, shopName);
  await syncMasters();
  const customerResult = await syncCustomers();
  const vendorResult = await syncVendors();
  const accountResult = await syncAccounts();
  const productResult = await syncProducts();
  const voucherResult = await syncVouchers();
  const saleResult = await syncSales();
  const purchaseResult = await syncPurchases();
  await syncReturns();
  await syncStockMovements();
  await syncDocumentCounters();

  const lastSyncAt = new Date().toISOString();
  setSetting("cloud_last_sync_at", lastSyncAt);
  setSetting("cloud_last_sync_error", "");

  return {
    pushedCustomers: customerResult.pushed,
    pulledCustomers: customerResult.pulled,
    pushedProducts: productResult.pushedProducts,
    pulledProducts: productResult.pulledProducts,
    pushedSales: saleResult.pushed,
    pulledSales: saleResult.pulled,
    pushedVendors: vendorResult.pushed,
    pulledVendors: vendorResult.pulled,
    pushedPurchases: purchaseResult.pushed,
    pulledPurchases: purchaseResult.pulled,
    pushedVouchers: voucherResult.pushed + accountResult.pushed,
    pulledVouchers: voucherResult.pulled + accountResult.pulled,
    lastSyncAt,
  };
}

export async function runCustomerCloudSync(): Promise<CloudSyncResult> {
  return runShopCloudSync();
}
