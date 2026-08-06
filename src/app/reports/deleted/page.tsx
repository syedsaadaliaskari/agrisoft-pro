"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { Alert, Button, DataTable, Input } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { DeletedDocumentsReport } from "@shared/ipc";

export default function DeletedReportPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState<DeletedDocumentsReport | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await getApi().getDeletedDocumentsReport({
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    });
    if (!res.ok) setError(res.error);
    else setReport(res.data);
  }, [fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell title="Deleted Data" subtitle="Soft-deleted sales and purchases" permission="reports.view">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <Button onClick={() => void load()}>Refresh</Button>
        {report ? (
          <ExportMenu
            filename="report-deleted"
            title="Deleted documents"
            columns={[
              { key: "documentType", label: "Type" },
              { key: "documentNo", label: "Doc #" },
              { key: "documentDate", label: "Date" },
              { key: "partyName", label: "Party" },
              { key: "grandTotal", label: "Total" },
              { key: "deletedBy", label: "Deleted by" },
              { key: "deletedAt", label: "Deleted at" },
            ]}
            rows={report.rows.map((r) => ({
              documentType: r.documentType,
              documentNo: r.documentNo,
              documentDate: r.documentDate,
              partyName: r.partyName ?? "",
              grandTotal: r.grandTotal,
              deletedBy: r.deletedBy ?? "",
              deletedAt: r.deletedAt.slice(0, 19),
            }))}
          />
        ) : null}
      </div>
      {report ? (
        <>
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            {report.salesCount} sales · {report.purchasesCount} purchases ·{" "}
            {report.totalAmount.toLocaleString()}
          </p>
          <DataTable
            headers={["Type", "Doc #", "Date", "Party", "Total", "Deleted by", "Deleted at"]}
            empty={report.rows.length === 0}
          >
            {report.rows.map((r) => (
              <tr key={`${r.documentType}-${r.id}`} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 capitalize">{r.documentType}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.documentNo}</td>
                <td className="px-4 py-3">{r.documentDate}</td>
                <td className="px-4 py-3">{r.partyName || "—"}</td>
                <td className="px-4 py-3">{r.grandTotal.toLocaleString()}</td>
                <td className="px-4 py-3 font-medium">{r.deletedBy || "—"}</td>
                <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{r.deletedAt.slice(0, 19)}</td>
              </tr>
            ))}
          </DataTable>
        </>
      ) : null}
    </AppShell>
  );
}
