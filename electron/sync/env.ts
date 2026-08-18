import fs from "fs";
import path from "path";
import { app } from "electron";

export type SupabaseEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  tenantId: string;
};

let cached: SupabaseEnv | null | undefined;

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Load .env from project root (dev) or next to userData (optional later). */
export function loadSupabaseEnv(): SupabaseEnv | null {
  if (cached !== undefined) return cached;

  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(app.getAppPath(), ".env"),
  ];

  let fileVars: Record<string, string> = {};
  for (const p of candidates) {
    fileVars = { ...fileVars, ...parseEnvFile(p) };
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || fileVars.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    fileVars.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();
  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    fileVars.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
  const tenantId = (process.env.SUPABASE_TENANT_ID || fileVars.SUPABASE_TENANT_ID || "").trim();

  if (!url || !serviceRoleKey || !tenantId) {
    cached = null;
    return cached;
  }

  cached = { url: url.replace(/\/$/, ""), anonKey, serviceRoleKey, tenantId };
  return cached;
}

export function resetSupabaseEnvCache() {
  cached = undefined;
}
