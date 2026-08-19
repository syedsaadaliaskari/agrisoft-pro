import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { customers, settings } from "../db/schema";
import {
  ensureCloudTenant,
  getSyncConfig,
  supabaseRest,
  tenantId,
  SyncError,
  type TenantSource,
} from "./client";

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
  lastSyncAt: string;
};

function getSetting(key: string): string {
  const db = getDb();
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? "";
}

function setSetting(key: string, value: string) {
  const db = getDb();
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  const now = new Date().toISOString();
  if (existing) {
    db.update(settings).set({ value, updatedAt: now }).where(eq(settings.id, existing.id)).run();
  } else {
    db.insert(settings)
      .values({
        id: randomUUID(),
        key,
        value,
        groupName: "sync",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

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

function toCloud(row: typeof customers.$inferSelect): CloudCustomer {
  return {
    id: row.id,
    tenant_id: tenantId(),
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
  };
}

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

/** First sync spike: push all local customers, then pull cloud customers for this tenant. */
export async function runCustomerCloudSync(): Promise<CloudSyncResult> {
  const cfg = getSyncConfig();
  if (!cfg.configured) {
    throw new SyncError(
      "Supabase is not configured. Add URL + service role key, and activate Pro (or set SUPABASE_TENANT_ID for dev)."
    );
  }

  const tid = tenantId();
  const db = getDb();
  const shopName =
    db.select().from(settings).where(eq(settings.key, "shop_name")).get()?.value?.trim() ||
    "Shop";

  await ensureCloudTenant(tid, shopName);

  const local = db.select().from(customers).all();
  const payload = local.map(toCloud);

  let pushed = 0;
  if (payload.length) {
    await supabaseRest("customers", {
      method: "POST",
      query: "on_conflict=id",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: payload,
    });
    pushed = payload.length;
  }

  const remote = await supabaseRest<CloudCustomer[]>("customers", {
    method: "GET",
    query: `tenant_id=eq.${encodeURIComponent(tid)}&deleted_at=is.null&select=*`,
  });

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
    } else if (new Date(row.updated_at).getTime() > new Date(existing.updatedAt).getTime()) {
      db.update(customers).set(mapped).where(eq(customers.id, row.id)).run();
      pulled += 1;
    }
  }

  const lastSyncAt = new Date().toISOString();
  setSetting("cloud_last_sync_at", lastSyncAt);
  setSetting("cloud_last_sync_error", "");

  return { pushedCustomers: pushed, pulledCustomers: pulled, lastSyncAt };
}

export function recordSyncError(message: string) {
  setSetting("cloud_last_sync_error", message);
}
