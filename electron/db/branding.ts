import fs from "fs";
import path from "path";
import { app } from "electron";

const LOGO_SETTING_KEY = "shop_logo_file";

function brandingDir(): string {
  const isDev = !app.isPackaged;
  const root = isDev
    ? path.join(process.cwd(), "data", "branding")
    : path.join(app.getPath("userData"), "branding");
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

export function getShopLogoFilePath(): string {
  return path.join(brandingDir(), "shop-logo.bin");
}

export function getShopLogoMetaPath(): string {
  return path.join(brandingDir(), "shop-logo.meta.json");
}

type LogoMeta = { mime: string; updatedAt: string };

/** Save logo from a data URL (image/png|jpeg|webp). Returns true if saved. */
export function saveShopLogoFromDataUrl(dataUrl: string): { ok: true } | { ok: false; error: string } {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    return { ok: false, error: "Use a PNG, JPG, or WebP image" };
  }
  const mime = match[1]!.toLowerCase().replace("image/jpg", "image/jpeg");
  const buf = Buffer.from(match[2]!, "base64");
  if (buf.length > 1_500_000) {
    return { ok: false, error: "Logo must be under 1.5 MB" };
  }
  if (buf.length < 32) {
    return { ok: false, error: "Image file is empty or invalid" };
  }

  fs.writeFileSync(getShopLogoFilePath(), buf);
  const meta: LogoMeta = { mime, updatedAt: new Date().toISOString() };
  fs.writeFileSync(getShopLogoMetaPath(), JSON.stringify(meta));
  return { ok: true };
}

export function clearShopLogo(): void {
  for (const p of [getShopLogoFilePath(), getShopLogoMetaPath()]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

export function hasShopLogo(): boolean {
  return fs.existsSync(getShopLogoFilePath()) && fs.existsSync(getShopLogoMetaPath());
}

/** Data URL for preview / print embed, or null if none. */
export function readShopLogoDataUrl(): string | null {
  if (!hasShopLogo()) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(getShopLogoMetaPath(), "utf8")) as LogoMeta;
    const buf = fs.readFileSync(getShopLogoFilePath());
    return `data:${meta.mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export { LOGO_SETTING_KEY };
