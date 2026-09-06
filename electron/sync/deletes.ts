import { supabasePatch, supabaseRest, tenantId } from "./client";
import { getSetting } from "./store";
import {
  captureVanished,
  clearPendingWipe,
  getPendingWipeTenantId,
  isTombstoned,
  markShopWipe,
  rememberTombstones,
  setLastLiveIds,
  tombstoneIdSet,
  tombstonesFor,
} from "./tombstones";

/** Cloud shop tables that use deleted_at. Do not invent a scheme for others. */
export const CLOUD_SHOP_TABLES = [
  "customers",
  "vendors",
  "accounts",
  "units",
  "categories",
  "taxes",
  "discounts",
  "additions",
  "products",
  "product_variants",
  "vouchers",
  "voucher_entries",
  "sales",
  "sale_items",
  "purchases",
  "purchase_items",
  "sale_returns",
  "sale_return_items",
  "purchase_returns",
  "purchase_return_items",
  "stock_movements",
  "document_counters",
] as const;

export function rememberLocalDelete(table: string, ids: string | string[]) {
  rememberTombstones(table, Array.isArray(ids) ? ids : [ids]);
}

export async function pushTableTombstones(table: string): Promise<number> {
  const rows = tombstonesFor(table);
  if (!rows.length) return 0;
  const tid = tenantId();
  const chunkSize = 40;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const ids = chunk.map((row) => row.id).join(",");
    const at = chunk[chunk.length - 1]?.at || new Date().toISOString();
    try {
      await supabasePatch(
        table,
        `id=in.(${ids})&tenant_id=eq.${encodeURIComponent(tid)}`,
        { deleted_at: at, updated_at: at }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (missingDeletedAt(message)) {
        console.warn(`Cloud table ${table} has no deleted_at — skip tombstones`);
        return 0;
      }
      throw err;
    }
  }
  return rows.length;
}

export async function fetchCloudDeletedIds(table: string): Promise<Set<string>> {
  const tid = tenantId();
  try {
    const rows = await supabaseRest<{ id: string }[]>(table, {
      method: "GET",
      query: `tenant_id=eq.${encodeURIComponent(tid)}&deleted_at=not.is.null&select=id`,
    });
    return new Set((rows || []).map((row) => row.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (missingDeletedAt(message)) return new Set();
    throw err;
  }
}

/** Local row is gone from the live cloud set and should not be kept or re-uploaded. */
export function shouldRemoveLocal(table: string, id: string, localUpdatedAt: string, cloudLiveIds: Set<string>) {
  if (cloudLiveIds.has(id)) return false;
  if (isTombstoned(table, id)) return true;
  const lastPull = getSetting("cloud_last_sync_at");
  if (!lastPull) return false;
  if (new Date(localUpdatedAt).getTime() > new Date(lastPull).getTime()) return false;
  return true;
}

export function skipLivePush(table: string, id: string): boolean {
  return isTombstoned(table, id);
}

export function liveRows<T extends { id: string }>(table: string, rows: T[]): T[] {
  const dead = tombstoneIdSet(table);
  return rows.filter((row) => !dead.has(row.id));
}

export function beginTableDeletes(table: string, currentIds: string[], extraDeletedIds: string[] = []) {
  const at = new Date().toISOString();
  if (extraDeletedIds.length) rememberTombstones(table, extraDeletedIds, at);
  captureVanished(table, currentIds, at);
}

export function finishTableSnapshot(table: string, liveIds: string[]) {
  setLastLiveIds(table, liveIds);
}

export function markPendingShopWipe(tenantIdValue: string) {
  markShopWipe(tenantIdValue);
}

/** Soft-delete every live cloud row for this shop. Used on wipe and on the next online sync if wipe was offline. */
export async function pushPendingShopWipe(): Promise<boolean> {
  const pending = getPendingWipeTenantId();
  if (!pending) return false;
  const at = new Date().toISOString();
  for (const table of CLOUD_SHOP_TABLES) {
    try {
      await supabasePatch(
        table,
        `tenant_id=eq.${encodeURIComponent(pending)}&deleted_at=is.null`,
        { deleted_at: at, updated_at: at }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (missingDeletedAt(message)) {
        console.warn(`Cloud table ${table} has no deleted_at — skip wipe tombstone`);
        continue;
      }
      throw err;
    }
  }
  clearPendingWipe();
  return true;
}

function missingDeletedAt(message: string): boolean {
  return /deleted_at/i.test(message) && /column|schema cache|42703/i.test(message);
}
