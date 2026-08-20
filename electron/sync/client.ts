import { loadSupabaseEnv, type SupabaseEnv } from "./env";
import { getDb } from "../db";
import { settings } from "../db/schema";
import { eq } from "drizzle-orm";

export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncError";
  }
}

export type TenantSource = "activation" | "env" | "";

function readLocalTenantId(): string {
  try {
    const db = getDb();
    return (
      db.select().from(settings).where(eq(settings.key, "supabase_tenant_id")).get()?.value?.trim() ||
      ""
    );
  } catch {
    return "";
  }
}

function requireCredentials(): SupabaseEnv {
  const env = loadSupabaseEnv();
  if (!env) {
    throw new SyncError(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env"
    );
  }
  return env;
}

/** Shop tenant: activation setting first, then .env fallback (vendor/dev). */
export function resolveTenant(): { tenantId: string; source: TenantSource } {
  const fromActivation = readLocalTenantId();
  if (fromActivation) return { tenantId: fromActivation, source: "activation" };
  const env = loadSupabaseEnv();
  if (env?.envTenantId) return { tenantId: env.envTenantId, source: "env" };
  return { tenantId: "", source: "" };
}

export function getSyncConfig() {
  const env = loadSupabaseEnv();
  const { tenantId, source } = resolveTenant();
  return {
    configured: Boolean(env?.url && env?.serviceRoleKey && tenantId),
    url: env?.url ?? "",
    tenantId,
    tenantSource: source,
    hasServiceKey: Boolean(env?.serviceRoleKey),
  };
}

/** PostgREST helper using service_role (bypasses RLS for desktop sync). */
export async function supabaseRest<T = unknown>(
  table: string,
  options: {
    method?: string;
    query?: string;
    body?: unknown;
    prefer?: string;
  } = {}
): Promise<T> {
  const env = requireCredentials();
  const method = options.method ?? "GET";
  const qs = options.query ? `?${options.query}` : "";
  const url = `${env.url}/rest/v1/${table}${qs}`;

  const headers: Record<string, string> = {
    apikey: env.serviceRoleKey,
    Authorization: `Bearer ${env.serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  if (options.prefer) headers.Prefer = options.prefer;

  const res = await fetch(url, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new SyncError(`Supabase ${method} ${table} failed (${res.status}): ${text.slice(0, 240)}`);
  }
  if (!text) return [] as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function supabaseUpsert(table: string, rows: unknown[]): Promise<number> {
  if (!rows.length) return 0;
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await supabaseRest(table, {
      method: "POST",
      query: "on_conflict=id",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: rows.slice(i, i + chunkSize),
    });
  }
  return rows.length;
}

export function tenantId(): string {
  const { tenantId: id } = resolveTenant();
  if (!id) {
    throw new SyncError(
      "No shop cloud ID yet. Activate Pro with a new code, or set SUPABASE_TENANT_ID in .env for development."
    );
  }
  return id;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "shop";
}

/** Ensure this shop exists in public.tenants (idempotent upsert). */
export async function ensureCloudTenant(id: string, name: string): Promise<void> {
  const now = new Date().toISOString();
  await supabaseRest("tenants", {
    method: "POST",
    query: "on_conflict=id",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: [
      {
        id,
        name: name.trim() || "Shop",
        slug: `${slugify(name)}-${id.slice(0, 8)}`,
        is_active: true,
        updated_at: now,
        deleted_at: null,
      },
    ],
  });
}
