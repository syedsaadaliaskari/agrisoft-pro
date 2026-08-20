import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { accounts } from "../db/schema";
import { supabaseUpsert, tenantId } from "./client";
import { fetchTenantRows, type SyncCounts } from "./pull";
import { isNewer } from "./store";

export async function syncAccounts(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const local = db.select().from(accounts).all();
  const pushed = await supabaseUpsert(
    "accounts",
    local.map((row) => ({
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

  let pulled = 0;
  for (const row of await fetchTenantRows<{
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
  }>("accounts")) {
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

  return { pushed, pulled };
}
