"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { Alert, Button, DataTable } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { StockReport } from "@shared/ipc";

export default function StockReportPage() {
  const [report, setReport] = useState<StockReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getApi().getStockReport();
    setLoading(false);
    if (!res.ok) setError(res.error);
    else setReport(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell title="Stock Report" permission="reports.view">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Button onClick={() => void load()} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
        {report ? (
          <ExportMenu
            filename="report-stock"
            title="Stock report"
            columns={[
              { key: "sku", label: "SKU" },
              { key: "productName", label: "Product" },
              { key: "pack", label: "Pack" },
              { key: "stockQty", label: "Qty" },
              { key: "costPrice", label: "Cost" },
              { key: "valuation", label: "Value" },
              { key: "lowStock", label: "Low?" },
            ]}
            rows={report.rows.map((r) => ({
              sku: r.sku,
              productName: r.productName,
              pack: `${r.size} / ${r.color}`,
              stockQty: r.stockQty,
              costPrice: r.costPrice,
              valuation: r.valuation,
              lowStock: r.isLowStock ? "Yes" : "",
            }))}
          />
        ) : null}
      </div>
      {report ? (
        <>
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            Qty {report.totalQty.toLocaleString()} · Valuation {report.totalValuation.toLocaleString()} · Low stock{" "}
            {report.lowStockCount}
          </p>
          <DataTable
            headers={["SKU", "Product", "Pack", "Qty", "Cost", "Value", "Low?"]}
            empty={report.rows.length === 0}
          >
            {report.rows.map((r) => (
              <tr key={r.variantId} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{r.sku}</td>
                <td className="px-4 py-3">{r.productName}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">
                  {r.size} / {r.color}
                </td>
                <td className="px-4 py-3">{r.stockQty}</td>
                <td className="px-4 py-3">{r.costPrice.toLocaleString()}</td>
                <td className="px-4 py-3">{r.valuation.toLocaleString()}</td>
                <td className="px-4 py-3">{r.isLowStock ? "Yes" : ""}</td>
              </tr>
            ))}
          </DataTable>
        </>
      ) : null}
    </AppShell>
  );
}
