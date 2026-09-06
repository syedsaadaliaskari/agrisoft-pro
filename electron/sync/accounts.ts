import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { accounts } from "../db/schema";
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

export async function syncAccounts(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const table = "accounts";
  const local = db.select().from(accounts).all();
  beginTableDeletes(table, local.map((row) => row.id));
  await pushTableTombstones(table);

  const remote = await fetchTenantRows<{
    id: string;
    code: string;
    name: string;
    account_type: string;
    parent_id: string | null;
    is_system: boolean;
    is_active: boolean;
    opening_balance: number;
    created_at: string;
    updated_at: string;
  }>(table);
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds(table);

  let pulled = 0;
  for (const row of remote) {
    const existing = db.select().from(accounts).where(eq(accounts.id, row.id)).get();
    const mapped = {
      id: row.id,
      code: row.code,
      name: row.name,
      accountType: row.account_type,
      parentId: row.parent_id,
      isSystem: Boolean(row.is_system),
      isActive: Boolean(row.is_active),
      openingBalance: Number(row.opening_balance || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(accounts).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(accounts).set(mapped).where(eq(accounts.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(accounts).all()) {
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal(table, row.id, row.updatedAt, cloudLiveIds)) {
      db.delete(accounts).where(eq(accounts.id, row.id)).run();
    }
  }

  const remaining = liveRows(table, db.select().from(accounts).all());
  const pushed = await supabaseUpsert(
    table,
    remaining.map((row) => ({
      id: row.id,
      tenant_id: tid,
      code: row.code,
      name: row.name,
      account_type: row.accountType,
      parent_id: row.parentId,
      is_system: row.isSystem,
      is_active: row.isActive,
      opening_balance: row.openingBalance,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );
  finishTableSnapshot(table, remaining.map((row) => row.id));
  return { pushed, pulled };
}
