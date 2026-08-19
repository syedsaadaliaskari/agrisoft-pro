"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Copy } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { OpsEmptyState } from "@/components/ops/DocumentWorkspace";
import { Alert, Button, DataTable } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { LicenseRow } from "@shared/ipc";

export default function ActivatedListPage() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
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

  const onCopyCode = async (row: LicenseRow) => {
    try {
      await navigator.clipboard.writeText(row.activationCode);
      setOkMsg(`Activation code copied for ${row.name}. Send it on WhatsApp.`);
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
          ? `Stop access on THIS PC now for ${row.name}?\n\nApp will lock and show the Activate / QR screen.`
          : `Remove activation record for ${row.name} (${row.installId}) on this PC?\n\nTo lock their PC you must Stop access on their machine (or they stay locked until they get a new code).`
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

  return (
    <AppShell
      title="Activated list"
      subtitle="Copy activation codes · stop access anytime"
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
          <span className="font-medium text-[var(--text)]">Copy code</span> → WhatsApp to customer.
          They paste it on their lock screen.{" "}
          <span className="font-medium text-[var(--text)]">Stop access</span> on this PC locks
          immediately.
        </p>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {!loading && !rows.length ? (
        <OpsEmptyState
          title="No activated companies yet"
          hint="Open Setup → License, paste an Install ID, activate, then copy the activation code."
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
