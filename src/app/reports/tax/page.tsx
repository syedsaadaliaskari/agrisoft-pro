"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { Alert, Button, Input } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { TaxReport } from "@shared/ipc";

export default function TaxReportPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState<TaxReport | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await getApi().getTaxReport({
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
    <AppShell title="Tax Report" subtitle="Sales vs purchase tax" permission="reports.view">
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <Button onClick={() => void load()}>Refresh</Button>
        {report ? (
          <ExportMenu
            filename="report-tax"
            title="Tax report"
            columns={[
              { key: "metric", label: "Metric" },
              { key: "amount", label: "Amount" },
            ]}
            rows={[
              { metric: `Sales tax (${report.salesCount})`, amount: report.salesTax },
              { metric: `Purchase tax (${report.purchaseCount})`, amount: report.purchaseTax },
              { metric: "Net tax", amount: report.netTax },
            ]}
          />
        ) : null}
      </div>
      {report ? (
        <div className="grid max-w-lg gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 text-sm">
          <div className="flex justify-between"><span>Sales tax ({report.salesCount})</span><strong>{report.salesTax.toLocaleString()}</strong></div>
          <div className="flex justify-between"><span>Purchase tax ({report.purchaseCount})</span><strong>{report.purchaseTax.toLocaleString()}</strong></div>
          <div className="flex justify-between border-t border-[var(--border)] pt-3"><span>Net tax</span><strong>{report.netTax.toLocaleString()}</strong></div>
        </div>
      ) : null}
    </AppShell>
  );
}
