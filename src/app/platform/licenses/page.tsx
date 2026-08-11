"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { OpsEmptyState } from "@/components/ops/DocumentWorkspace";
import { Alert, Button, DataTable } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { LicenseRow } from "@shared/ipc";

export default function ActivatedListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [thisInstallId, setThisInstallId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [loading, setLoading] = useState(true);

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

  const onStopAccess = async (row: LicenseRow) => {
    const isThisPc = thisInstallId && row.installId === thisInstallId;
    if (
      !confirm(
        isThisPc
          ? `Stop access on THIS PC now for ${row.name}?\n\nApp will lock and show the Activate / QR screen.`
          : `Stop access for ${row.name} (${row.installId})?\n\nThis only removes the record on this PC. It does not remotely lock another computer.`
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
      router.replace("/activate");
      return;
    }
    setOkMsg(`Removed activation for ${row.name}.`);
    await load();
  };

  return (
    <AppShell
      title="Activated list"
      subtitle="Companies activated for Pro — stop access anytime"
      permission="license.view"
    >
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

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-xs text-[var(--text-muted)]">
          Use <span className="font-medium text-[var(--text)]">Stop access</span> anytime (half
          payment, etc.). On this PC it locks immediately with QR. On another customer PC you must
          run Stop there (or use Setup → License → Stop access now).
        </p>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {!loading && !rows.length ? (
        <OpsEmptyState
          title="No activated companies yet"
          hint="Open Setup → License, paste an Install ID, and activate Monthly / Yearly / Forever."
        />
      ) : (
        <DataTable
          headers={["Company", "Install ID", "Plan", "Activated", "Expires", ""]}
          empty={false}
        >
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 text-sm font-medium">{row.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.installId}</td>
              <td className="px-4 py-3 text-sm capitalize">{row.plan}</td>
              <td className="px-4 py-3 text-sm">{row.activatedAt}</td>
              <td className="px-4 py-3 text-sm">{row.expiresAt ?? "Never"}</td>
              <td className="px-4 py-3">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void onStopAccess(row)}
                  title="Stop access"
                >
                  <Ban size={14} /> Stop access
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </AppShell>
  );
}
