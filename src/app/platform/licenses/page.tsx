"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { OpsEmptyState } from "@/components/ops/DocumentWorkspace";
import { Alert, Button, DataTable } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { LicenseRow } from "@shared/ipc";

export default function ActivatedListPage() {
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const list = await getApi().listLicenses();
    setLoading(false);
    if (!list.ok) {
      setError(list.error);
      return;
    }
    setRows(list.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = async (row: LicenseRow) => {
    if (!confirm(`Remove activation for ${row.name} (${row.installId})?`)) return;
    const res = await getApi().deleteLicense(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  };

  return (
    <AppShell
      title="Activated list"
      subtitle="Companies activated for Pro"
      permission="license.view"
    >
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mb-3 flex justify-end">
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
                <Button variant="ghost" size="sm" onClick={() => void onDelete(row)} title="Remove">
                  <Trash2 size={14} />
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </AppShell>
  );
}
