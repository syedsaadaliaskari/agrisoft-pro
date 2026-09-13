import { getSetting, setSetting } from "./store";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const SHOP_JOIN_CODE_KEY = "shop_join_code";

export function normalizeShopCode(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function formatShopCode(raw: string | null | undefined): string {
  const code = normalizeShopCode(raw);
  if (code.length !== 8) return code;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function generateShopCode(): string {
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function readLocalShopCode(): string {
  return normalizeShopCode(getSetting(SHOP_JOIN_CODE_KEY));
}

export function rememberShopCode(code: string) {
  setSetting(SHOP_JOIN_CODE_KEY, normalizeShopCode(code));
}

export function displayShopCode(): string {
  const local = readLocalShopCode();
  return local ? formatShopCode(local) : "";
}

export function ensureLocalShopCode(): string {
  const existing = readLocalShopCode();
  if (existing.length === 8) return existing;
  const next = generateShopCode();
  rememberShopCode(next);
  return next;
}
