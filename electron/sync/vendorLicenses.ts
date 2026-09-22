import { loadSupabaseEnv } from "./env";
import { supabasePatch, supabaseUpsert } from "./client";
import type { LicenseRow } from "../../shared/ipc";

function cloudReady(): boolean {
  const env = loadSupabaseEnv();
  return Boolean(env?.url && env.serviceRoleKey);
}

function cloudRow(row: LicenseRow, deletedAt: string | null) {
  return {
    id: row.id,
    name: row.name,
    install_id: row.installId,
    plan: row.plan,
    activated_at: row.activatedAt,
    expires_at: row.expiresAt,
    notes: row.notes,
    phone: row.phone,
    tenant_id: row.tenantId,
    updated_at: new Date().toISOString(),
    deleted_at: deletedAt,
  };
}

/** Push one activation to public.licenses so the phone Super Admin list can read it. */
export async function publishVendorLicense(row: LicenseRow): Promise<void> {
  if (!cloudReady()) return;
  await supabaseUpsert("licenses", [cloudRow(row, null)]);
}

export async function unpublishVendorLicense(id: string): Promise<void> {
  if (!cloudReady()) return;
  const at = new Date().toISOString();
  await supabasePatch("licenses", `id=eq.${encodeURIComponent(id)}`, {
    deleted_at: at,
    updated_at: at,
  });
}

export async function publishAllVendorLicenses(rows: LicenseRow[]): Promise<number> {
  if (!cloudReady()) {
    throw new Error("Cloud is not configured on this PC");
  }
  if (!rows.length) return 0;
  await supabaseUpsert(
    "licenses",
    rows.map((row) => cloudRow(row, null))
  );
  return rows.length;
}
