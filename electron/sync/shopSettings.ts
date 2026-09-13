import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb } from "../db";
import { settings } from "../db/schema";
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

const SHOP_KEYS = new Set([
  "shop_name",
  "shop_phone",
  "shop_address",
  "currency_symbol",
  "currency_code",
  "tax_mode",
  "receipt_footer",
]);

type CloudSetting = {
  id: string;
  tenant_id: string;
  key: string;
  value: string | null;
  group_name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export async function syncShopSettings(): Promise<void> {
  const tid = tenantId();
  const db = getDb();
  const local = db
    .select()
    .from(settings)
    .all()
    .filter((row) => SHOP_KEYS.has(row.key));
  beginTableDeletes("settings", local.map((row) => row.id));
  await pushTableTombstones("settings");

  const remote = (await fetchTenantRows<CloudSetting>("settings")).filter((row) => SHOP_KEYS.has(row.key));
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds("settings");

  for (const row of remote) {
    const existing = db.select().from(settings).where(eq(settings.id, row.id)).get();
    const keyClash = db.select().from(settings).where(eq(settings.key, row.key)).get();
    if (keyClash && keyClash.id !== row.id) {
      db.delete(settings).where(eq(settings.id, keyClash.id)).run();
    }
    const mapped = {
      id: row.id,
      key: row.key,
      value: row.value,
      groupName: row.group_name || "general",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(settings).values(mapped).run();
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(settings).set(mapped).where(eq(settings.id, row.id)).run();
    }
  }

  for (const row of db.select().from(settings).all()) {
    if (!SHOP_KEYS.has(row.key)) continue;
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal("settings", row.id, row.updatedAt, cloudLiveIds)) {
      db.delete(settings).where(eq(settings.id, row.id)).run();
    }
  }

  const remaining = liveRows(
    "settings",
    db
      .select()
      .from(settings)
      .all()
      .filter((row) => SHOP_KEYS.has(row.key))
  );
  await supabaseUpsert(
    "settings",
    remaining.map((row) => ({
      id: row.id || randomUUID(),
      tenant_id: tid,
      key: row.key,
      value: row.value,
      group_name: row.groupName || "general",
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );
  finishTableSnapshot(
    "settings",
    remaining.map((row) => row.id)
  );
}
