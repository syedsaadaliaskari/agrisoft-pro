import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { additions, categories, discounts, taxes, units } from "../db/schema";
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

export async function syncMasters(): Promise<{
  units: SyncCounts;
  categories: SyncCounts;
  taxes: SyncCounts;
  discounts: SyncCounts;
  additions: SyncCounts;
}> {
  return {
    units: await syncUnits(),
    categories: await syncCategories(),
    taxes: await syncTaxes(),
    discounts: await syncDiscounts(),
    additions: await syncAdditions(),
  };
}

async function syncUnits(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const table = "units";
  const local = db.select().from(units).all();
  beginTableDeletes(table, local.map((row) => row.id));
  await pushTableTombstones(table);

  const remote = await fetchTenantRows<{
    id: string;
    name: string;
    short_name: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>(table);
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds(table);

  let pulled = 0;
  for (const row of remote) {
    const existing = db.select().from(units).where(eq(units.id, row.id)).get();
    const mapped = {
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(units).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(units).set(mapped).where(eq(units.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(units).all()) {
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal(table, row.id, row.updatedAt, cloudLiveIds)) {
      db.delete(units).where(eq(units.id, row.id)).run();
    }
  }

  const remaining = liveRows(table, db.select().from(units).all());
  const pushed = await supabaseUpsert(
    table,
    remaining.map((row) => ({
      id: row.id,
      tenant_id: tid,
      name: row.name,
      short_name: row.shortName,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );
  finishTableSnapshot(table, remaining.map((row) => row.id));
  return { pushed, pulled };
}

async function syncCategories(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const table = "categories";
  const local = db.select().from(categories).all();
  beginTableDeletes(table, local.map((row) => row.id));
  await pushTableTombstones(table);

  const remote = await fetchTenantRows<{
    id: string;
    name: string;
    parent_id: string | null;
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>(table);
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds(table);

  let pulled = 0;
  for (const row of remote) {
    const existing = db.select().from(categories).where(eq(categories.id, row.id)).get();
    const mapped = {
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      description: row.description,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(categories).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(categories).set(mapped).where(eq(categories.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(categories).all()) {
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal(table, row.id, row.updatedAt, cloudLiveIds)) {
      db.delete(categories).where(eq(categories.id, row.id)).run();
    }
  }

  const remaining = liveRows(table, db.select().from(categories).all());
  const pushed = await supabaseUpsert(
    table,
    remaining.map((row) => ({
      id: row.id,
      tenant_id: tid,
      name: row.name,
      parent_id: row.parentId,
      description: row.description,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );
  finishTableSnapshot(table, remaining.map((row) => row.id));
  return { pushed, pulled };
}

async function syncTaxes(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const table = "taxes";
  const local = db.select().from(taxes).all();
  beginTableDeletes(table, local.map((row) => row.id));
  await pushTableTombstones(table);

  const remote = await fetchTenantRows<{
    id: string;
    name: string;
    rate: number;
    is_inclusive: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>(table);
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds(table);

  let pulled = 0;
  for (const row of remote) {
    const existing = db.select().from(taxes).where(eq(taxes.id, row.id)).get();
    const mapped = {
      id: row.id,
      name: row.name,
      rate: Number(row.rate || 0),
      isInclusive: Boolean(row.is_inclusive),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(taxes).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(taxes).set(mapped).where(eq(taxes.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(taxes).all()) {
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal(table, row.id, row.updatedAt, cloudLiveIds)) {
      db.delete(taxes).where(eq(taxes.id, row.id)).run();
    }
  }

  const remaining = liveRows(table, db.select().from(taxes).all());
  const pushed = await supabaseUpsert(
    table,
    remaining.map((row) => ({
      id: row.id,
      tenant_id: tid,
      name: row.name,
      rate: row.rate,
      is_inclusive: row.isInclusive,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );
  finishTableSnapshot(table, remaining.map((row) => row.id));
  return { pushed, pulled };
}

async function syncDiscounts(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const table = "discounts";
  const local = db.select().from(discounts).all();
  beginTableDeletes(table, local.map((row) => row.id));
  await pushTableTombstones(table);

  const remote = await fetchTenantRows<{
    id: string;
    name: string;
    type: string;
    value: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>(table);
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds(table);

  let pulled = 0;
  for (const row of remote) {
    const existing = db.select().from(discounts).where(eq(discounts.id, row.id)).get();
    const mapped = {
      id: row.id,
      name: row.name,
      type: row.type || "percent",
      value: Number(row.value || 0),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(discounts).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(discounts).set(mapped).where(eq(discounts.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(discounts).all()) {
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal(table, row.id, row.updatedAt, cloudLiveIds)) {
      db.delete(discounts).where(eq(discounts.id, row.id)).run();
    }
  }

  const remaining = liveRows(table, db.select().from(discounts).all());
  const pushed = await supabaseUpsert(
    table,
    remaining.map((row) => ({
      id: row.id,
      tenant_id: tid,
      name: row.name,
      type: row.type,
      value: row.value,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );
  finishTableSnapshot(table, remaining.map((row) => row.id));
  return { pushed, pulled };
}

async function syncAdditions(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const table = "additions";
  const local = db.select().from(additions).all();
  beginTableDeletes(table, local.map((row) => row.id));
  await pushTableTombstones(table);

  const remote = await fetchTenantRows<{
    id: string;
    name: string;
    type: string;
    value: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>(table);
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds(table);

  let pulled = 0;
  for (const row of remote) {
    const existing = db.select().from(additions).where(eq(additions.id, row.id)).get();
    const mapped = {
      id: row.id,
      name: row.name,
      type: row.type || "fixed",
      value: Number(row.value || 0),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(additions).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(additions).set(mapped).where(eq(additions.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(additions).all()) {
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal(table, row.id, row.updatedAt, cloudLiveIds)) {
      db.delete(additions).where(eq(additions.id, row.id)).run();
    }
  }

  const remaining = liveRows(table, db.select().from(additions).all());
  const pushed = await supabaseUpsert(
    table,
    remaining.map((row) => ({
      id: row.id,
      tenant_id: tid,
      name: row.name,
      type: row.type,
      value: row.value,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );
  finishTableSnapshot(table, remaining.map((row) => row.id));
  return { pushed, pulled };
}
