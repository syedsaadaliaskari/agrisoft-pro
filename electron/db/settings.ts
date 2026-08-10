import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Db } from "./index";
import { settings } from "./schema";
import type { SettingsMap, SettingsUpdateInput } from "../../shared/ipc";
import { hasShopLogo, readShopLogoDataUrl } from "./branding";

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

/** Settings map plus live logo data URL for UI/print (not stored in DB as blob). */
export function getSettingsMapWithBranding(db: Db): SettingsMap {
  const map = getSettingsMap(db);
  map.shop_logo = hasShopLogo() ? "1" : "";
  const dataUrl = readShopLogoDataUrl();
  if (dataUrl) map.shop_logo_data_url = dataUrl;
  else delete map.shop_logo_data_url;
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

  return getSettingsMapWithBranding(db);
}
