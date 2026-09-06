import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { customers } from "../db/schema";
import { supabaseUpsert, tenantId } from "./client";
import {
  beginTableDeletes,
  fetchCloudDeletedIds,
  finishTableSnapshot,
  liveRows,
  pushTableTombstones,
  shouldRemoveLocal,
} from "./deletes";
import { fetchTenantRows } from "./pull";
import { isNewer } from "./store";

type CloudCustomer = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  opening_balance: number;
  balance_type: string;
  credit_limit: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export async function syncCustomers(): Promise<{ pushed: number; pulled: number }> {
  const tid = tenantId();
  const db = getDb();
  const table = "customers";
  const local = db.select().from(customers).all();
  beginTableDeletes(table, local.map((row) => row.id));
  await pushTableTombstones(table);

  const remote = await fetchTenantRows<CloudCustomer>(table);
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds(table);

  let pulled = 0;
  for (const row of remote) {
    const existing = db.select().from(customers).where(eq(customers.id, row.id)).get();
    const mapped = {
      id: row.id,
      code: row.code,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      openingBalance: Number(row.opening_balance || 0),
      balanceType: row.balance_type || "debit",
      creditLimit: row.credit_limit == null ? 0 : Number(row.credit_limit),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    if (!existing) {
      db.insert(customers).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(customers).set(mapped).where(eq(customers.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(customers).all()) {
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal(table, row.id, row.updatedAt, cloudLiveIds)) {
      db.delete(customers).where(eq(customers.id, row.id)).run();
    }
  }

  const remaining = liveRows(table, db.select().from(customers).all());
  const payload: CloudCustomer[] = remaining.map((row) => ({
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
    credit_limit: row.creditLimit,
    is_active: row.isActive,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    deleted_at: null,
  }));
  const pushed = await supabaseUpsert(table, payload);
  finishTableSnapshot(table, remaining.map((row) => row.id));
  return { pushed, pulled };
}
