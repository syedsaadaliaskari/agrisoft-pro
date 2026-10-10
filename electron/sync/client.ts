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

export async function supabasePatch(table: string, query: string, body: unknown): Promise<void> {
  await supabaseRest(table, {
    method: "PATCH",
    query,
    prefer: "return=minimal",
    body,
  });
}

/** Call a Postgres function with the service role. auth.uid() is null; auth.role() is service_role. */
export async function supabaseRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const env = requireCredentials();
  const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new SyncError(`Supabase RPC ${fn} failed (${res.status}): ${text.slice(0, 240)}`);
  }
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

function isCloudRowConflict(message: string): boolean {
  return (
    message.includes("23505") ||
    message.includes("23503") ||
    message.includes("duplicate key") ||
    message.includes("violates foreign key")
  );
}

function cloudRowId(row: unknown): string {
  if (row && typeof row === "object" && "id" in row) {
    const id = (row as { id?: unknown }).id;
    if (typeof id === "string" && id) return id;
  }
  return "?";
}

/** Unique columns that stay taken even after a soft delete. */
const NATURAL_KEY: Record<string, string> = {
  settings: "key",
  units: "name",
  categories: "name",
  taxes: "name",
  discounts: "name",
  additions: "name",
  customers: "code",
  vendors: "code",
  accounts: "code",
  products: "sku",
  product_variants: "sku",
  vouchers: "voucher_no",
  sales: "invoice_no",
  purchases: "invoice_no",
  sale_returns: "return_no",
  purchase_returns: "return_no",
  document_counters: "doc_type",
};

const SOFT_DELETE_CHILDREN: Record<string, { table: string; column: string }[]> = {
  products: [{ table: "product_variants", column: "product_id" }],
  product_variants: [
    { table: "sale_items", column: "variant_id" },
    { table: "purchase_items", column: "variant_id" },
    { table: "stock_movements", column: "variant_id" },
  ],
  sales: [{ table: "sale_items", column: "sale_id" }],
  purchases: [{ table: "purchase_items", column: "purchase_id" }],
  vouchers: [{ table: "voucher_entries", column: "voucher_id" }],
  accounts: [{ table: "voucher_entries", column: "account_id" }],
};

function isUniqueViolation(message: string): boolean {
  return message.includes("23505") || message.includes("duplicate key") || message.includes("unique constraint");
}

/** A deleted cloud row still owns the shop code/sku/invoice. Drop it so the current row can upload. */
async function releaseSoftDeletedKey(table: string, row: Record<string, unknown>): Promise<boolean> {
  const keyColumn = NATURAL_KEY[table];
  const tenant = row.tenant_id;
  const key = keyColumn ? row[keyColumn] : undefined;
  const id = row.id;
  if (!keyColumn || typeof tenant !== "string" || key == null || key === "" || typeof id !== "string") return false;
  const found = await supabaseRest<{ id: string; deleted_at: string | null }[]>(table, {
    query: `tenant_id=eq.${encodeURIComponent(tenant)}&${keyColumn}=eq.${encodeURIComponent(String(key))}&select=id,deleted_at`,
  });
  const blocker = (found || []).find((item) => item.id !== id && item.deleted_at);
  if (!blocker) return false;
  await deleteSoftDeletedRow(table, blocker.id);
  return true;
}

async function deleteSoftDeletedRow(table: string, id: string): Promise<void> {
  for (const child of SOFT_DELETE_CHILDREN[table] || []) {
    const kids = await supabaseRest<{ id: string; deleted_at: string | null }[]>(child.table, {
      query: `${child.column}=eq.${encodeURIComponent(id)}&select=id,deleted_at`,
    });
    for (const kid of kids || []) {
      if (!kid.deleted_at) continue;
      await deleteSoftDeletedRow(child.table, kid.id);
    }
  }
  await supabaseRest(table, {
    method: "DELETE",
    query: `id=eq.${encodeURIComponent(id)}&deleted_at=not.is.null`,
  });
}

export async function supabaseUpsert(table: string, rows: unknown[]): Promise<number> {
  if (!rows.length) return 0;
  const chunkSize = 200;
  let pushed = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    try {
      await supabaseRest(table, {
        method: "POST",
        query: "on_conflict=id",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: chunk,
      });
      pushed += chunk.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!isCloudRowConflict(message)) throw err;
      for (const row of chunk) {
        try {
          await supabaseRest(table, {
            method: "POST",
            query: "on_conflict=id",
            prefer: "resolution=merge-duplicates,return=minimal",
            body: [row],
          });
          pushed += 1;
        } catch (rowErr) {
          const rowMessage = rowErr instanceof Error ? rowErr.message : "";
          if (
            isUniqueViolation(rowMessage) &&
            row &&
            typeof row === "object" &&
            (await releaseSoftDeletedKey(table, row as Record<string, unknown>))
          ) {
            await supabaseRest(table, {
              method: "POST",
              query: "on_conflict=id",
              prefer: "resolution=merge-duplicates,return=minimal",
              body: [row],
            });
            pushed += 1;
            continue;
          }
          if (isUniqueViolation(rowMessage)) {
            throw new SyncError(
              `Cloud sync could not save ${table} ${cloudRowId(row)}. An older shop row still uses that code.`
            );
          }
          if (isCloudRowConflict(rowMessage)) {
            throw new SyncError(`Cloud sync could not save ${table} ${cloudRowId(row)}.`);
          }
          throw rowErr;
        }
      }
    }
  }
  return pushed;
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
export async function ensureCloudTenant(
  id: string,
  name: string,
  extra?: {
    joinCode?: string;
    plan?: string | null;
    licenseExpiresAt?: string | null;
    licenseName?: string | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const body: Record<string, unknown> = {
    id,
    name: name.trim() || "Shop",
    slug: `${slugify(name)}-${id.slice(0, 8)}`,
    is_active: true,
    updated_at: now,
    deleted_at: null,
  };
  if (extra?.joinCode) body.join_code = extra.joinCode;
  if (extra?.plan !== undefined) body.plan = extra.plan;
  if (extra?.licenseExpiresAt !== undefined) body.license_expires_at = extra.licenseExpiresAt;
  if (extra?.licenseName !== undefined) body.license_name = extra.licenseName;
  await supabaseRest("tenants", {
    method: "POST",
    query: "on_conflict=id",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: [body],
  });
}
