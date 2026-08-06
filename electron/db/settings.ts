import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Db } from "./index";
import { settings } from "./schema";
import type { SettingsMap, SettingsUpdateInput } from "../../shared/ipc";

const EDITABLE_KEYS = [
  "shop_name",
  "shop_phone",
  "shop_address",
  "currency_symbol",
  "currency_code",
  "tax_mode",
  "receipt_footer",
] as const;

export function getSettingsMap(db: Db): SettingsMap {
  const rows = db.select().from(settings).all();
  const map: SettingsMap = {};
  for (const row of rows) {
    map[row.key] = row.value ?? "";
  }
  return map;
}

export function updateSettings(db: Db, input: SettingsUpdateInput): SettingsMap {
  const now = new Date().toISOString();

  for (const key of EDITABLE_KEYS) {
    if (input[key] === undefined) continue;
    const value = String(input[key] ?? "");
    const existing = db.select().from(settings).where(eq(settings.key, key)).get();
    if (existing) {
      db.update(settings)
        .set({ value, updatedAt: now })
        .where(eq(settings.id, existing.id))
        .run();
    } else {
      const groupName =
        key.startsWith("shop_") ? "shop" : key.startsWith("currency_") ? "general" : key === "tax_mode" ? "tax" : key === "receipt_footer" ? "receipt" : "general";
      db.insert(settings)
        .values({
          id: randomUUID(),
          key,
          value,
          groupName,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  }

  return getSettingsMap(db);
}
