"use client";

import { useEffect, useState } from "react";
import {
  Banknote,
  Package,
  ShoppingCart,
  Users,
  Truck,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { DbStats } from "@shared/ipc";

export default function DashboardPage() {
  const [stats, setStats] = useState<DbStats | null>(null);

  useEffect(() => {
    void getApi()
      .getDbStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const kpis = [
    {
      label: "Today's sales",
      value: "Rs 0.00",
      sub: stats ? `${stats.sales} sales docs` : "0 invoices",
      icon: ShoppingCart,
      color: "var(--success)",
    },
    {
      label: "Cash in hand",
      value: "Rs 0.00",
      sub: "Awaiting ledger wiring",
      icon: Banknote,
      color: "var(--accent)",
    },
    {
      label: "Customers",
      value: stats ? String(stats.customers) : "—",
      sub: "In database",
      icon: Users,
      color: "var(--info)",
    },
    {
      label: "Vendors",
      value: stats ? String(stats.vendors) : "—",
      sub: "In database",
      icon: Truck,
      color: "var(--danger)",
    },
    {
      label: "Products",
      value: stats ? String(stats.products) : "—",
      sub: "In catalog",
      icon: Package,
      color: "var(--accent)",
    },
    {
      label: "Users",
      value: stats ? String(stats.users) : "—",
      sub: "RBAC accounts",
      icon: Wallet,
      color: "var(--text-muted)",
    },
  ];

  return (
    <AppShell title="Dashboard" subtitle="Overview of your agri business" permission="dashboard.view">
      <Alert tone="info">
        Step 3 schema is seeded. Open via Electron (`npm run dev`) to see live SQLite counts. Auth comes in Step 4.
      </Alert>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 transition hover:border-[var(--border-strong)]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    {kpi.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{kpi.value}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{kpi.sub}</p>
                </div>
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ background: `color-mix(in srgb, ${kpi.color} 18%, transparent)`, color: kpi.color }}
                >
                  <Icon size={18} strokeWidth={1.75} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-8 text-center">
          <p className="text-sm font-medium">Sales trend</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Charts arrive with live dashboard data.</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-8 text-center">
          <p className="text-sm font-medium">Payment mix</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Charts arrive with live dashboard data.</p>
        </div>
      </div>
    </AppShell>
  );
}
