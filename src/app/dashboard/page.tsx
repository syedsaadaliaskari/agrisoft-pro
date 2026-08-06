"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Package,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, DataTable } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { DashboardSummary } from "@shared/ipc";

const PIE_COLORS = ["#22d3ee", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#60a5fa"];
const tooltipStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 8,
};

function fmt(cur: string, n: number) {
  return `${cur} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState<"7" | "30">("7");

  useEffect(() => {
    void getApi()
      .getDashboardSummary()
      .then((res) => {
        if (!res.ok) setError(res.error);
        else setSummary(res.data);
      })
      .catch(() => setError("Failed to load dashboard"));
  }, []);

  const cur = summary?.currencySymbol || "Rs";

  const trend = useMemo(() => {
    const src = range === "7" ? summary?.last7Days ?? [] : summary?.last30Days ?? [];
    return src.map((d) => ({
      ...d,
      label: d.date.slice(5),
      margin: d.salesTotal - d.purchasesTotal,
    }));
  }, [summary, range]);

  const mix = (summary?.salesByPaymentMode ?? []).map((m) => ({
    name: m.mode,
    value: m.total,
    count: m.count,
  }));

  const topProducts = (summary?.topProducts ?? []).map((p) => ({
    name: p.productName.length > 16 ? `${p.productName.slice(0, 16)}…` : p.productName,
    revenue: p.revenue,
    quantity: p.quantity,
  }));

  const kpis = [
    {
      label: "Today's sales",
      value: summary ? fmt(cur, summary.todaySalesTotal) : "…",
      sub: summary ? `${summary.todaySalesCount} invoices` : "",
      icon: ShoppingCart,
      color: "var(--success)",
    },
    {
      label: "Today's purchases",
      value: summary ? fmt(cur, summary.todayPurchasesTotal) : "…",
      sub: summary ? `${summary.todayPurchasesCount} invoices` : "",
      icon: Truck,
      color: "var(--accent)",
    },
    {
      label: "Month profit est.",
      value: summary ? fmt(cur, summary.monthProfitEstimate) : "…",
      sub: summary ? `Sales ${fmt(cur, summary.monthSalesTotal)}` : "",
      icon: TrendingUp,
      color: "var(--info)",
    },
    {
      label: "Cash + bank",
      value: summary ? fmt(cur, summary.cashBalance + summary.bankBalance) : "…",
      sub: summary ? `Cash ${fmt(cur, summary.cashBalance)} · Bank ${fmt(cur, summary.bankBalance)}` : "",
      icon: Banknote,
      color: "var(--accent)",
    },
    {
      label: "Receivables",
      value: summary ? fmt(cur, summary.arBalance) : "…",
      sub: summary ? `${summary.openSaleInvoices} open invoices · AP ${fmt(cur, summary.apBalance)}` : "",
      icon: Users,
      color: "var(--info)",
    },
    {
      label: "Inventory value",
      value: summary ? fmt(cur, summary.inventoryValue) : "…",
      sub: summary ? `${summary.productCount} products · ${summary.lowStockCount} low stock` : "",
      icon: Warehouse,
      color: "var(--danger)",
    },
    {
      label: "Customers",
      value: summary ? String(summary.customerCount) : "…",
      sub: "Active parties",
      icon: Users,
      color: "var(--info)",
    },
    {
      label: "Vendors",
      value: summary ? String(summary.vendorCount) : "…",
      sub: "Suppliers",
      icon: Package,
      color: "var(--danger)",
    },
  ];

  return (
    <AppShell title="Dashboard" subtitle="Live books overview" permission="dashboard.view">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 transition hover:border-[var(--border-strong)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    {kpi.label}
                  </p>
                  <p className="mt-1.5 truncate text-xl font-semibold tracking-tight">{kpi.value}</p>
                  <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{kpi.sub}</p>
                </div>
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: `color-mix(in srgb, ${kpi.color} 18%, transparent)`, color: kpi.color }}
                >
                  <Icon size={16} strokeWidth={1.75} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-[var(--accent)]" />
              <p className="text-sm font-medium">Sales vs purchases</p>
            </div>
            <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 ${range === "7" ? "bg-[var(--accent)] text-[var(--logo-ink)]" : "text-[var(--text-muted)]"}`}
                onClick={() => setRange("7")}
              >
                7 days
              </button>
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 ${range === "30" ? "bg-[var(--accent)] text-[var(--logo-ink)]" : "text-[var(--text-muted)]"}`}
                onClick={() => setRange("30")}
              >
                30 days
              </button>
            </div>
          </div>
          <div className="h-72">
            {trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="purchaseFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="salesTotal"
                    name="Sales"
                    stroke="#22d3ee"
                    fill="url(#salesFill)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="purchasesTotal"
                    name="Purchases"
                    stroke="#34d399"
                    fill="url(#purchaseFill)"
                    strokeWidth={2}
                  />
                  <Line type="monotone" dataKey="margin" name="Net flow" stroke="#fbbf24" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="pt-24 text-center text-sm text-[var(--text-muted)]">No trend data yet</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <p className="mb-3 text-sm font-medium">Sales by payment mode</p>
          <div className="h-72">
            {mix.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  >
                    {mix.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="pt-24 text-center text-sm text-[var(--text-muted)]">No sales yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <p className="mb-3 text-sm font-medium">Top products by revenue</p>
          <div className="h-64">
            {topProducts.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="revenue" name="Revenue" fill="#22d3ee" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="pt-20 text-center text-sm text-[var(--text-muted)]">No product sales yet</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-[var(--danger)]" />
            <p className="text-sm font-medium">Low stock watch</p>
          </div>
          <DataTable
            headers={["Product", "Pack", "Stock", "Reorder"]}
            empty={!summary?.lowStockItems?.length}
          >
            {(summary?.lowStockItems ?? []).map((row, i) => (
              <tr key={`${row.productName}-${i}`} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-2.5">{row.productName}</td>
                <td className="px-4 py-2.5 text-[var(--text-muted)]">
                  {[row.size, row.color].filter(Boolean).join(" / ") || "-"}
                </td>
                <td className="px-4 py-2.5 font-medium text-[var(--danger)]">{row.stockQty}</td>
                <td className="px-4 py-2.5 text-[var(--text-muted)]">{row.reorderLevel}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <p className="mb-3 text-sm font-medium">Recent sales</p>
        <DataTable
          headers={["Invoice", "Date", "Customer", "Mode", "Total"]}
          empty={!summary?.recentSales?.length}
        >
          {(summary?.recentSales ?? []).map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-2.5 font-mono text-xs">{row.invoiceNo}</td>
              <td className="px-4 py-2.5">{row.invoiceDate}</td>
              <td className="px-4 py-2.5">{row.customerName || "Walk-in"}</td>
              <td className="px-4 py-2.5 capitalize text-[var(--text-muted)]">{row.paymentMode}</td>
              <td className="px-4 py-2.5">{fmt(cur, row.grandTotal)}</td>
            </tr>
          ))}
        </DataTable>
      </div>
    </AppShell>
  );
}
