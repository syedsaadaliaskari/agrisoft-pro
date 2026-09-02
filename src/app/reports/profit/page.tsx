"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { Alert, Button, DataTable, Input } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { ProductProfitPoint, ProductProfitRow, ProfitReport } from "@shared/ipc";

const tooltipStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 8,
};

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgoIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function money(cur: string, n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}${cur} ${Math.abs(Number(n || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function chartRows(series: ProductProfitPoint[]) {
  return series.map((d) => ({
    ...d,
    label: d.date.slice(5),
  }));
}

export default function ProfitReportPage() {
  const [fromDate, setFromDate] = useState(() => daysAgoIso(29));
  const [toDate, setToDate] = useState(() => todayIso());
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getApi().getProfitReport({
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setReport(res.data);
    setSelectedId((prev) => {
      if (prev === "all") return prev;
      return res.data.byProduct.some((p) => p.productId === prev) ? prev : "all";
    });
  }, [fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const cur = report?.currencySymbol || "Rs";
  const products = report?.byProduct ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.productName.toLowerCase().includes(q) || (p.categoryName ?? "").toLowerCase().includes(q)
    );
  }, [products, query]);

  const selected: ProductProfitRow | null =
    selectedId === "all" ? null : products.find((p) => p.productId === selectedId) ?? null;

  const heroSeries = chartRows(selected?.series ?? report?.byDay ?? []);
  const heroProfit = selected ? selected.profit : report?.grossProfit ?? 0;
  const heroRevenue = selected ? selected.revenue : report?.salesRevenue ?? 0;
  const heroCogs = selected ? selected.cogs : report?.cogs ?? 0;
  const heroTitle = selected ? selected.productName : "All crops";
  const profitColor = heroProfit >= 0 ? "#34d399" : "#f87171";

  const marginPct =
    heroRevenue === 0 ? 0 : Math.round((heroProfit / heroRevenue) * 1000) / 10;

  return (
    <AppShell
      title="Profit & Loss"
      permission="reports.view"
    >
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <Button onClick={() => void load()} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
        {report ? (
          <ExportMenu
            filename="report-profit"
            title="Profit and loss by crop"
            columns={[
              { key: "crop", label: "Crop" },
              { key: "category", label: "Category" },
              { key: "qty", label: "Qty sold" },
              { key: "revenue", label: "Revenue" },
              { key: "cogs", label: "COGS" },
              { key: "profit", label: "Profit" },
              { key: "margin", label: "Margin %" },
            ]}
            rows={[
              {
                crop: "Sale returns (all crops)",
                category: "",
                qty: "",
                revenue: -(report.saleReturnsRevenue ?? 0),
                cogs: -(report.saleReturnsCogs ?? 0),
                profit: "",
                margin: "",
              },
              ...products.map((p) => ({
              crop: p.productName,
              category: p.categoryName || "",
              qty: p.qtySold,
              revenue: p.revenue,
              cogs: p.cogs,
              profit: p.profit,
              margin: p.marginPct,
            })),
            ]}
          />
        ) : null}
      </div>

      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Gross sales", value: report.grossSalesRevenue ?? report.salesRevenue },
              {
                label: "Sale returns",
                value: -(report.saleReturnsRevenue ?? 0),
                danger: true,
              },
              { label: "Net revenue", value: report.salesRevenue },
              { label: "Cost of goods", value: report.cogs },
              { label: "Net profit", value: report.netProfit },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
              >
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  {kpi.label}
                </p>
                <p
                  className={`mt-1.5 text-xl font-semibold tabular-nums ${
                    kpi.danger || kpi.value < 0 ? "text-[var(--danger)]" : ""
                  }`}
                >
                  {money(cur, kpi.value)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
                  {heroTitle}
                </p>
                <p
                  className="mt-1 text-3xl font-semibold tabular-nums tracking-tight"
                  style={{ color: profitColor }}
                >
                  {money(cur, heroProfit)}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Revenue {money(cur, heroRevenue)} · Cost {money(cur, heroCogs)} · Margin {marginPct}%
                  {selectedId === "all" && (report.saleReturnsRevenue ?? 0) > 0 ? (
                    <span className="text-[var(--danger)]">
                      {" "}
                      · Returns −{money(cur, report.saleReturnsRevenue)}
                    </span>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId("all")}
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  selectedId === "all"
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]"
                }`}
              >
                All crops
              </button>
            </div>

            <div className="h-72">
              {heroSeries.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={heroSeries}>
                    <defs>
                      <linearGradient id="plProfitFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={profitColor} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={profitColor} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="plRevenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => [
                        money(cur, Number(value || 0)),
                        name === "profit" ? "Profit" : name === "revenue" ? "Revenue" : "Cost",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="revenue"
                      stroke="#22d3ee"
                      fill="url(#plRevenueFill)"
                      strokeWidth={1.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      name="profit"
                      stroke={profitColor}
                      fill="url(#plProfitFill)"
                      strokeWidth={2.25}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                  No sales in this period
                </p>
              )}
            </div>
          </div>

          {products.length ? (
            <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <p className="mb-3 text-sm font-medium">Profit by crop</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={products} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="productName"
                      tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                      interval={0}
                      angle={products.length > 6 ? -25 : 0}
                      textAnchor={products.length > 6 ? "end" : "middle"}
                      height={products.length > 6 ? 56 : 28}
                    />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => [money(cur, Number(value || 0)), "Profit"]}
                    />
                    <Bar dataKey="profit" name="Profit" radius={[4, 4, 0, 0]}>
                      {products.map((p) => (
                        <Cell key={p.productId} fill={p.profit >= 0 ? "#34d399" : "#f87171"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          <div className="mt-5 mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Each crop</p>
            </div>
            <Input
              label="Find crop"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {filtered.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => (
                <CropCard
                  key={p.productId}
                  row={p}
                  cur={cur}
                  active={selectedId === p.productId}
                  onSelect={() => setSelectedId(p.productId)}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              No crops sold in this period
            </p>
          )}

          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold">Crop totals</p>
            <DataTable
              headers={["Crop", "Category", "Qty", "Revenue", "Cost", "Profit", "Margin"]}
              empty={products.length === 0}
            >
              {products.map((p) => (
                <tr
                  key={p.productId}
                  className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-soft)]"
                  onClick={() => setSelectedId(p.productId)}
                >
                  <td className="px-4 py-3 font-medium">{p.productName}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{p.categoryName || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{p.qtySold.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums">{money(cur, p.revenue)}</td>
                  <td className="px-4 py-3 tabular-nums">{money(cur, p.cogs)}</td>
                  <td
                    className={`px-4 py-3 font-medium tabular-nums ${
                      p.profit < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"
                    }`}
                  >
                    {money(cur, p.profit)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.marginPct}%</td>
                </tr>
              ))}
            </DataTable>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

function CropCard({
  row,
  cur,
  active,
  onSelect,
}: {
  row: ProductProfitRow;
  cur: string;
  active: boolean;
  onSelect: () => void;
}) {
  const color = row.profit >= 0 ? "#34d399" : "#f87171";
  const gid = `cropFill-${row.productId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const data = chartRows(row.series);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl border bg-[var(--bg-elevated)] p-4 text-left transition ${
        active
          ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.productName}</p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
            {row.categoryName || "Uncategorized"} · {row.qtySold.toLocaleString()} sold
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums" style={{ color }}>
          {money(cur, row.profit)}
        </p>
      </div>
      <div className="mt-3 h-24">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [money(cur, Number(value || 0)), "Profit"]}
                labelFormatter={(label) => String(label)}
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke={color}
                fill={`url(#${gid})`}
                strokeWidth={1.75}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        In {money(cur, row.revenue)} · Cost {money(cur, row.cogs)} · {row.marginPct}% margin
      </p>
    </button>
  );
}
