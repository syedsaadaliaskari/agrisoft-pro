import type { LicenseRow } from "@shared/ipc";
import type { ExportColumn } from "@/lib/export";

export function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function licenseEnded(row: LicenseRow, today = todayIsoDate()): boolean {
  if (row.plan === "forever" || !row.expiresAt) return false;
  return row.expiresAt < today;
}

export function licenseStatusLabel(row: LicenseRow, today = todayIsoDate()): "Active" | "Ended" {
  return licenseEnded(row, today) ? "Ended" : "Active";
}

export function licenseExpiresLabel(row: LicenseRow): string {
  if (row.plan === "forever" || !row.expiresAt) return "Never";
  return row.expiresAt;
}

export type LicenseExportRow = {
  company: string;
  phone: string;
  plan: string;
  started: string;
  ends: string;
  status: string;
};

export function toLicenseExportRow(row: LicenseRow): LicenseExportRow {
  return {
    company: row.name,
    phone: row.phone ?? "",
    plan: row.plan,
    started: row.activatedAt,
    ends: licenseExpiresLabel(row),
    status: licenseStatusLabel(row),
  };
}

export const LICENSE_EXPORT_COLUMNS: ExportColumn<LicenseExportRow>[] = [
  { key: "company", label: "Company" },
  { key: "phone", label: "Phone" },
  { key: "plan", label: "Plan" },
  { key: "started", label: "Start" },
  { key: "ends", label: "End" },
  { key: "status", label: "Status" },
];
