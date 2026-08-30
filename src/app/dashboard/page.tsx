"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Building2,
  MapPinned,
  Package,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { Alert, Button, DataTable, Input, Modal, Select, Textarea } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { isSuperAdminUser } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type {
  ClientCompany,
  CompaniesDemandSummary,
  DashboardSummary,
} from "@shared/ipc";

const PIE_COLORS = ["#22d3ee", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#60a5fa"];
const tooltipStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 8,
};

function fmt(cur: string, n: number) {
  return `${cur} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const emptyCompany = {
  companyName: "",
  area: "",
  joinedAt: today(),
  notes: "",
  isActive: true,
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  /** Vendor Super Admin: client companies + area demand only (not shop sales). */
  const isVendor = isSuperAdminUser(user);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [companies, setCompanies] = useState<ClientCompany[]>([]);
  const [demand, setDemand] = useState<CompaniesDemandSummary | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState<"7" | "30">("7");
  const [loading, setLoading] = useState(true);

  const [companyOpen, setCompanyOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCompany);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const api = getApi();

    if (isVendor) {
      setSummary(null);
      const [list, dem] = await Promise.all([api.listClientCompanies(), api.getCompaniesDemand()]);
      if (!list.ok) {
        setError(list.error);
        setCompanies([]);
      } else {
        setCompanies(list.data);
      }
      if (!dem.ok) {
        setError((prev) => prev || dem.error);
        setDemand(null);
      } else {
        setDemand(dem.data);
      }
    } else {
      setCompanies([]);
      setDemand(null);
      const dash = await api.getDashboardSummary();
      if (!dash.ok) setError(dash.error);
      else setSummary(dash.data);
    }
    setLoading(false);
  }, [isVendor]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const shopKpis = [
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
      label: "Money today",
      value: summary ? fmt(cur, summary.moneyClosingToday ?? summary.cashClosingToday) : "…",
      sub: summary
        ? `Open ${fmt(cur, summary.moneyOpeningToday ?? summary.cashOpeningToday)} · In ${fmt(cur, summary.moneyInToday ?? summary.cashInToday)} · Out ${fmt(cur, summary.moneyOutToday ?? summary.cashOutToday)}`
        : "",
      icon: Banknote,
      color: "var(--accent)",
    },
    {
      label: "Bank now",
      value: summary ? fmt(cur, summary.bankBalance) : "…",
      sub: summary ? `Cash now ${fmt(cur, summary.cashBalance)}` : "",
      icon: Building2,
      color: "var(--info)",
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

  const vendorKpis = [
    {
      label: "Total companies",
      value: demand ? String(demand.totalCompanies) : "…",
      sub: "Registered clients",
      icon: Building2,
      color: "var(--accent)",
    },
    {
      label: "Active companies",
      value: demand ? String(demand.activeCompanies) : "…",
      sub: demand
        ? `${Math.max(0, demand.totalCompanies - demand.activeCompanies)} inactive`
        : "",
      icon: Users,
      color: "var(--success)",
    },
    {
      label: "Areas covered",
      value: demand ? String(demand.areaDemand.length) : "…",
      sub: "Cities / regions",
      icon: MapPinned,
      color: "var(--info)",
    },
    {
      label: "Top area",
      value: demand?.areaDemand[0]?.area ?? "—",
      sub: demand?.areaDemand[0]
        ? `${demand.areaDemand[0].companyCount} companies`
        : "Add companies",
      icon: TrendingUp,
      color: "var(--accent)",
    },
  ];

  const kpis = isVendor ? vendorKpis : shopKpis;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyCompany);
    setCompanyOpen(true);
  };

  const openEdit = (row: ClientCompany) => {
    setEditingId(row.id);
    setForm({
      companyName: row.companyName,
      area: row.area,
      joinedAt: row.joinedAt.slice(0, 10),
      notes: row.notes ?? "",
      isActive: row.isActive,
    });
    setCompanyOpen(true);
  };

  const onSaveCompany = async () => {
    setSaving(true);
    setError("");
    const payload = {
      companyName: form.companyName,
      area: form.area,
      joinedAt: form.joinedAt,
      notes: form.notes || null,
      isActive: form.isActive,
    };
    const res = editingId
      ? await getApi().updateClientCompany(editingId, payload)
      : await getApi().createClientCompany(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCompanyOpen(false);
    const [list, dem] = await Promise.all([
      getApi().listClientCompanies(),
      getApi().getCompaniesDemand(),
    ]);
    if (list.ok) setCompanies(list.data);
    if (dem.ok) setDemand(dem.data);
  };

  const onDeleteCompany = async (row: ClientCompany) => {
    if (!confirm(`Remove ${row.companyName}?`)) return;
    const res = await getApi().deleteClientCompany(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const [list, dem] = await Promise.all([
      getApi().listClientCompanies(),
      getApi().getCompaniesDemand(),
    ]);
    if (list.ok) setCompanies(list.data);
    if (dem.ok) setDemand(dem.data);
  };

  return (
    <AppShell
      title="Dashboard"
      subtitle={isVendor ? "Client network overview" : "Live books overview"}
      permission="dashboard.view"
    >
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loading && !(isVendor ? demand : summary) ? (
        <DashboardSkeleton platform={isVendor} />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
                {greeting}
                {user?.fullName ? ` · ${user.fullName.split(" ")[0]}` : ""}
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                {isVendor ? "Vendor command center" : "Today at a glance"}
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {isVendor
                  ? "Companies using Agri Soft Pro — totals and demand by area."
                  : "Sales, stock, cash, and recent activity."}
              </p>
            </div>
          </div>

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
                      style={{
                        background: `color-mix(in srgb, ${kpi.color} 18%, transparent)`,
                        color: kpi.color,
                      }}
                    >
                      <Icon size={16} strokeWidth={1.75} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!isVendor && summary ? (
            <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
                Money day book (today)
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                {[
                  { label: "Opening", value: summary.moneyOpeningToday ?? summary.cashOpeningToday },
                  { label: "In", value: summary.moneyInToday ?? summary.cashInToday },
                  { label: "Out", value: summary.moneyOutToday ?? summary.cashOutToday },
                  { label: "Closing", value: summary.moneyClosingToday ?? summary.cashClosingToday },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
                  >
                    <p className="text-[11px] text-[var(--text-muted)]">{row.label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {fmt(cur, Number(row.value || 0))}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
                  <p className="text-[11px] text-[var(--text-muted)]">Received today</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--success)]">
                    {fmt(cur, Number(summary.receivedToday || 0))}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
                  <p className="text-[11px] text-[var(--text-muted)]">Paid out today</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--danger)]">
                    {fmt(cur, Number(summary.paidOutToday || 0))}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Cash alone: open {fmt(cur, summary.cashOpeningToday)} · in{" "}
                {fmt(cur, summary.cashInToday)} · out {fmt(cur, summary.cashOutToday)} · close{" "}
                {fmt(cur, summary.cashClosingToday)}
              </p>
            </div>
          ) : null}

          {isVendor ? (
            <div className="mt-5 overflow-visible rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                    <MapPinned size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Client network</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Companies using Agri Soft Pro · demand by area
                    </p>
                  </div>
                </div>
                <div className="relative z-30 flex flex-wrap items-center gap-2">
                  <ExportMenu
                    filename="client-companies"
                    title="Client companies"
                    columns={[
                      { key: "companyName", label: "Company" },
                      { key: "area", label: "Area" },
                      { key: "joinedAt", label: "Joined" },
                      { key: "isActive", label: "Active" },
                    ]}
                    rows={companies.map((r) => ({
                      companyName: r.companyName,
                      area: r.area,
                      joinedAt: r.joinedAt.slice(0, 10),
                      isActive: r.isActive,
                    }))}
                  />
                  <Button size="sm" onClick={openCreate}>
                    <Plus size={14} /> Add company
                  </Button>
                </div>
              </div>

              <div className="grid gap-0 xl:grid-cols-5">
                <div className="border-b border-[var(--border)] p-5 xl:col-span-2 xl:border-b-0 xl:border-r">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Demand by area
                  </p>
                  <div className="h-56">
                    {demand?.areaDemand?.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={demand.areaDemand}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="area" tick={{ fill: "var(--text-muted)", fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 10 }} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar
                            dataKey="companyCount"
                            name="Companies"
                            fill="var(--accent)"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="pt-16 text-center text-sm text-[var(--text-muted)]">
                        Add companies to see demand
                      </p>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto p-5 xl:col-span-3">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Companies
                  </p>
                  <DataTable
                    headers={["Company", "Area", "Joined", "Status", ""]}
                    empty={companies.length === 0}
                  >
                    {companies.map((row) => (
                      <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Building2 size={14} className="text-[var(--accent)]" />
                            <span className="font-medium">{row.companyName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">{row.area}</td>
                        <td className="px-4 py-2.5 text-[var(--text-muted)]">{row.joinedAt.slice(0, 10)}</td>
                        <td className="px-4 py-2.5">{row.isActive ? "Active" : "Inactive"}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                              <Pencil size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => void onDeleteCompany(row)}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              </div>
            </div>
          ) : (
            <>
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
                          <Line
                            type="monotone"
                            dataKey="margin"
                            name="Net flow"
                            stroke="#fbbf24"
                            strokeWidth={1.5}
                            dot={false}
                          />
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
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={100}
                            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                          />
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
            </>
          )}
        </>
      )}

      <Modal
        open={companyOpen}
        onClose={() => setCompanyOpen(false)}
        title={editingId ? "Edit company" : "Add company"}
      >
        <div className="space-y-3">
          <Input
            label="Company name"
            value={form.companyName}
            onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
          />
          <Input
            label="Area / city"
            value={form.area}
            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
          />
          <Input
            label="Joined / started using"
            type="date"
            value={form.joinedAt}
            onChange={(e) => setForm((f) => ({ ...f, joinedAt: e.target.value }))}
          />
          <Select
            label="Status"
            value={form.isActive ? "1" : "0"}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.value === "1" }))}
            options={[
              { value: "1", label: "Active" },
              { value: "0", label: "Inactive" },
            ]}
          />
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCompanyOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void onSaveCompany()}
              disabled={saving || !form.companyName || !form.area}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
