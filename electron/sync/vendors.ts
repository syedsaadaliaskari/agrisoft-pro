import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { vendors } from "../db/schema";
import { supabaseUpsert, tenantId } from "./client";
import {
  beginTableDeletes,
  fetchCloudDeletedIds,
  finishTableSnapshot,
  liveRows,
  pushTableTombstones,
  shouldRemoveLocal,
} from "./deletes";
import { fetchTenantRows, type SyncCounts } from "./pull";
import { isNewer } from "./store";

export async function syncVendors(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const table = "vendors";
  const local = db.select().from(vendors).all();
  beginTableDeletes(table, local.map((row) => row.id));
  await pushTableTombstones(table);

  const remote = await fetchTenantRows<{
    id: string;
    code: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    opening_balance: number;
    balance_type: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>(table);
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds(table);

  let pulled = 0;
  for (const row of remote) {
    const existing = db.select().from(vendors).where(eq(vendors.id, row.id)).get();
    const mapped = {
      id: row.id,
      code: row.code,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      openingBalance: Number(row.opening_balance || 0),
      balanceType: row.balance_type || "credit",
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(vendors).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(vendors).set(mapped).where(eq(vendors.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(vendors).all()) {
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal(table, row.id, row.updatedAt, cloudLiveIds)) {
      db.delete(vendors).where(eq(vendors.id, row.id)).run();
    }
  }

  const remaining = liveRows(table, db.select().from(vendors).all());
  const pushed = await supabaseUpsert(
    table,
    remaining.map((row) => ({
      id: row.id,
      tenant_id: tid,
      code: row.code,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      opening_balance: row.openingBalance,
      balance_type: row.balanceType,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );
  finishTableSnapshot(table, remaining.map((row) => row.id));
  return { pushed, pulled };
}
