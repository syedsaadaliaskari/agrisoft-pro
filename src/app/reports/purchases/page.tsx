"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { Alert, Button, DataTable, Input } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { PurchasesReport } from "@shared/ipc";

export default function PurchasesReportPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState<PurchasesReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getApi().getPurchasesReport({
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    });
    setLoading(false);
    if (!res.ok) setError(res.error);
    else setReport(res.data);
  }, [fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell title="Purchase Report" subtitle="Purchase totals by period" permission="reports.view">
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <Button onClick={() => void load()} disabled={loading}>{loading ? "Loading..." : "Refresh"}</Button>
        {report ? (
          <ExportMenu
            filename="report-purchases"
            title="Purchase report"
            columns={[
              { key: "invoiceNo", label: "Invoice" },
              { key: "invoiceDate", label: "Date" },
              { key: "vendorName", label: "Vendor" },
              { key: "paymentMode", label: "Mode" },
              { key: "grandTotal", label: "Total" },
              { key: "paidAmount", label: "Paid" },
            ]}
            rows={report.rows.map((r) => ({
              invoiceNo: r.invoiceNo,
              invoiceDate: r.invoiceDate,
              vendorName: r.vendorName ?? "",
              paymentMode: r.paymentMode,
              grandTotal: r.grandTotal,
              paidAmount: r.paidAmount,
            }))}
          />
        ) : null}
      </div>
      {report ? (
        <>
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            Purchased {(report.totalGross ?? report.totalGrand).toLocaleString()} · Returns{" "}
            <span className="text-[var(--danger)]">-{(report.totalReturns ?? 0).toLocaleString()}</span> · Net{" "}
            {report.totalGrand.toLocaleString()} · Paid {report.totalPaid.toLocaleString()}
          </p>
          <DataTable
            headers={["Invoice", "Date", "Vendor", "Mode", "Total", "Returned", "Net", "Paid"]}
            empty={report.rows.length === 0}
          >
            {report.rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{r.invoiceNo}</td>
                <td className="px-4 py-3">{r.invoiceDate}</td>
                <td className="px-4 py-3">{r.vendorName || "—"}</td>
                <td className="px-4 py-3 capitalize">{r.paymentMode}</td>
                <td className="px-4 py-3">{r.grandTotal.toLocaleString()}</td>
                <td className="px-4 py-3 text-[var(--danger)]">
                  {r.returnedTotal ? `-${r.returnedTotal.toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3 font-medium">
                  {(r.netTotal ?? r.grandTotal).toLocaleString()}
                </td>
                <td className="px-4 py-3">{r.paidAmount.toLocaleString()}</td>
              </tr>
            ))}
          </DataTable>

          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold">
              Purchase returns in this period{" "}
              <span className="font-normal text-[var(--text-muted)]">
                ({report.returnRows?.length ?? 0})
              </span>
            </p>
            <DataTable
              headers={["Return no", "Date", "Vendor", "Against bill", "Amount"]}
              empty={(report.returnRows?.length ?? 0) === 0}
            >
              {(report.returnRows ?? []).map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{r.returnNo}</td>
                  <td className="px-4 py-3">{r.returnDate}</td>
                  <td className="px-4 py-3">{r.partyName || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.againstInvoiceNo || "—"}</td>
                  <td className="px-4 py-3 text-[var(--danger)]">-{r.grandTotal.toLocaleString()}</td>
                </tr>
              ))}
            </DataTable>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
