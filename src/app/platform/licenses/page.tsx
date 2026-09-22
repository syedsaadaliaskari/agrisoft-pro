"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Ban, CloudUpload, Copy } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { OpsEmptyState } from "@/components/ops/DocumentWorkspace";
import { Alert, Button, DataTable, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import {
  LICENSE_EXPORT_COLUMNS,
  licenseEnded,
  licenseExpiresLabel,
  licenseStatusLabel,
  toLicenseExportRow,
} from "@/lib/vendorLicenseUi";
import type { LicenseRow } from "@shared/ipc";

export default function ActivatedListPage() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [thisInstallId, setThisInstallId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "ended">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [list, status] = await Promise.all([
      getApi().listLicenses(),
      getApi().getLicenseStatus(),
    ]);
    setLoading(false);
    if (!list.ok) {
      setError(list.error);
      return;
    }
    setRows(list.data);
    if (status.ok) setThisInstallId(status.data.installId);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === "active") return rows.filter((r) => !licenseEnded(r));
    if (filter === "ended") return rows.filter((r) => licenseEnded(r));
    return rows;
  }, [rows, filter]);

  const exportRows = useMemo(() => visible.map(toLicenseExportRow), [visible]);

  const onCopyCode = async (row: LicenseRow) => {
    try {
      await navigator.clipboard.writeText(row.activationCode);
      setOkMsg(`Copied ${row.name}`);
      setError("");
    } catch {
      setError("Could not copy activation code");
    }
  };

  const onStopAccess = async (row: LicenseRow) => {
    const isThisPc = thisInstallId && row.installId === thisInstallId;
    if (
      !confirm(
        isThisPc
          ? `Stop access on this PC for ${row.name}?`
          : `Remove activation for ${row.name}?`
      )
    ) {
      return;
    }
    setError("");
    setOkMsg("");
    const res = await getApi().deleteLicense(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (isThisPc) {
      setOkMsg("Access stopped on this PC. Opening lock screen…");
      await logout();
      router.replace("/activate");
      return;
    }
    setOkMsg(`Removed activation for ${row.name}.`);
    await load();
  };

  const onPublishCloud = async () => {
    setPublishing(true);
    setError("");
    setOkMsg("");
    const res = await getApi().publishLicensesToCloud();
    setPublishing(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg(`Uploaded ${res.data.published} company(ies) to cloud for the phone Super Admin list.`);
  };

  return (
    <AppShell title="Activated list" permission="license.view">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {okMsg ? (
        <div className="mb-4">
          <Alert tone="info">{okMsg}</Alert>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <Select
          label="Show"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "active" | "ended")}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "ended", label: "Ended" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ExportMenu
            filename="activated-companies"
            title="Activated companies"
            columns={LICENSE_EXPORT_COLUMNS}
            rows={exportRows}
            disabled={!exportRows.length}
          />
          <Button variant="secondary" size="sm" onClick={() => void onPublishCloud()} disabled={publishing || !rows.length}>
            <CloudUpload size={14} /> Upload to phone
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {!loading && !visible.length ? (
        <OpsEmptyState title="No activated companies yet" />
      ) : (
        <DataTable
          headers={["Company", "Phone", "Plan", "Start", "End", "Status", ""]}
          empty={false}
        >
          {visible.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 text-sm font-medium">{row.name}</td>
              <td className="px-4 py-3 text-sm">{row.phone || "—"}</td>
              <td className="px-4 py-3 text-sm capitalize">{row.plan}</td>
              <td className="px-4 py-3 text-sm">{row.activatedAt}</td>
              <td className="px-4 py-3 text-sm">{licenseExpiresLabel(row)}</td>
              <td className="px-4 py-3 text-sm">
                <span className={licenseEnded(row) ? "text-[var(--danger)]" : "text-emerald-600"}>
                  {licenseStatusLabel(row)}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void onCopyCode(row)}
                    title="Copy activation code"
                  >
                    <Copy size={14} /> Code
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void onStopAccess(row)}
                    title="Stop access"
                  >
                    <Ban size={14} /> Stop
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </AppShell>
  );
}
