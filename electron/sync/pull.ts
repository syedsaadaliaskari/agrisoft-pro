import { supabaseRest, tenantId } from "./client";

export async function fetchTenantRows<T>(table: string, extraQuery = ""): Promise<T[]> {
  const tid = tenantId();
  const extra = extraQuery ? `&${extraQuery}` : "";
  return supabaseRest<T[]>(table, {
    method: "GET",
    query: `tenant_id=eq.${encodeURIComponent(tid)}&deleted_at=is.null&select=*${extra}`,
  });
}

export type SyncCounts = { pushed: number; pulled: number };
