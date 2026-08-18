import { loadSupabaseEnv, type SupabaseEnv } from "./env";

export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncError";
  }
}

function requireEnv(): SupabaseEnv {
  const env = loadSupabaseEnv();
  if (!env) {
    throw new SyncError(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_TENANT_ID to .env"
    );
  }
  return env;
}

export function getSyncConfig() {
  const env = loadSupabaseEnv();
  return {
    configured: Boolean(env),
    url: env?.url ?? "",
    tenantId: env?.tenantId ?? "",
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
  const env = requireEnv();
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

export function tenantId(): string {
  return requireEnv().tenantId;
}
