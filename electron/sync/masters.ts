import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { additions, categories, discounts, taxes, units } from "../db/schema";
import { supabaseUpsert, tenantId } from "./client";
import { fetchTenantRows, type SyncCounts } from "./pull";
import { isNewer } from "./store";

export async function syncMasters(): Promise<{
  units: SyncCounts;
  categories: SyncCounts;
  taxes: SyncCounts;
  discounts: SyncCounts;
  additions: SyncCounts;
}> {
  const tid = tenantId();
  const db = getDb();

  const unitRows = db.select().from(units).all();
  const pushedUnits = await supabaseUpsert(
    "units",
    unitRows.map((row) => ({
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
  let pulledUnits = 0;
  for (const row of await fetchTenantRows<{
    id: string;
    name: string;
    short_name: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>("units")) {
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
      pulledUnits += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(units).set(mapped).where(eq(units.id, row.id)).run();
      pulledUnits += 1;
    }
  }

  const categoryRows = db.select().from(categories).all();
  const pushedCategories = await supabaseUpsert(
    "categories",
    categoryRows.map((row) => ({
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
  let pulledCategories = 0;
  for (const row of await fetchTenantRows<{
    id: string;
    name: string;
    parent_id: string | null;
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>("categories")) {
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
      pulledCategories += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(categories).set(mapped).where(eq(categories.id, row.id)).run();
      pulledCategories += 1;
    }
  }

  const taxRows = db.select().from(taxes).all();
  const pushedTaxes = await supabaseUpsert(
    "taxes",
    taxRows.map((row) => ({
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
  let pulledTaxes = 0;
  for (const row of await fetchTenantRows<{
    id: string;
    name: string;
    rate: number;
    is_inclusive: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>("taxes")) {
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
      pulledTaxes += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(taxes).set(mapped).where(eq(taxes.id, row.id)).run();
      pulledTaxes += 1;
    }
  }

  const discountRows = db.select().from(discounts).all();
  const pushedDiscounts = await supabaseUpsert(
    "discounts",
    discountRows.map((row) => ({
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
  let pulledDiscounts = 0;
  for (const row of await fetchTenantRows<{
    id: string;
    name: string;
    type: string;
    value: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>("discounts")) {
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
      pulledDiscounts += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(discounts).set(mapped).where(eq(discounts.id, row.id)).run();
      pulledDiscounts += 1;
    }
  }

  const additionRows = db.select().from(additions).all();
  const pushedAdditions = await supabaseUpsert(
    "additions",
    additionRows.map((row) => ({
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
  let pulledAdditions = 0;
  for (const row of await fetchTenantRows<{
    id: string;
    name: string;
    type: string;
    value: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>("additions")) {
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
      pulledAdditions += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(additions).set(mapped).where(eq(additions.id, row.id)).run();
      pulledAdditions += 1;
    }
  }

  return {
    units: { pushed: pushedUnits, pulled: pulledUnits },
    categories: { pushed: pushedCategories, pulled: pulledCategories },
    taxes: { pushed: pushedTaxes, pulled: pulledTaxes },
    discounts: { pushed: pushedDiscounts, pulled: pulledDiscounts },
    additions: { pushed: pushedAdditions, pulled: pulledAdditions },
  };
}
