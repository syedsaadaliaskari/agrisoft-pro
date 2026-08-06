"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { Alert, Button, Input } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { ProfitReport } from "@shared/ipc";

export default function ProfitReportPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const res = await getApi().getProfitReport({
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
    <AppShell title="Profit & Loss" subtitle="Sales revenue vs COGS" permission="reports.view">
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <Button onClick={() => void load()}>Refresh</Button>
        {report ? (
          <ExportMenu
            filename="report-profit"
            title="Profit and loss"
            columns={[
              { key: "metric", label: "Metric" },
              { key: "amount", label: "Amount" },
            ]}
            rows={[
              { metric: "Sales revenue", amount: report.salesRevenue },
              { metric: "COGS", amount: report.cogs },
              { metric: "Gross profit", amount: report.grossProfit },
              { metric: "Net profit", amount: report.netProfit },
            ]}
          />
        ) : null}
      </div>
      {report ? (
        <div className="grid max-w-lg gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 text-sm">
          <div className="flex justify-between"><span>Sales revenue</span><strong>{report.salesRevenue.toLocaleString()}</strong></div>
          <div className="flex justify-between"><span>COGS</span><strong>{report.cogs.toLocaleString()}</strong></div>
          <div className="flex justify-between border-t border-[var(--border)] pt-3"><span>Gross profit</span><strong>{report.grossProfit.toLocaleString()}</strong></div>
          <div className="flex justify-between"><span>Net profit</span><strong>{report.netProfit.toLocaleString()}</strong></div>
        </div>
      ) : null}
    </AppShell>
  );
}
