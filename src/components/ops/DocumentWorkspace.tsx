"use client";

import type { LucideIcon } from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { useI18n } from "@/lib/i18n";
import type { PaymentMode } from "@shared/ipc";

export function money(n: number) {
  return formatMoney(Number(n || 0));
}

export function OpsStatStrip({
  items,
}: {
  items: {
    label: string;
    value: string;
    hint?: string;
    tone?: "default" | "accent" | "success" | "warn" | "danger";
    icon?: LucideIcon;
  }[];
}) {
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        const tone =
          item.tone === "accent"
            ? "from-[var(--accent-soft)] to-transparent text-[var(--accent)]"
            : item.tone === "success"
              ? "from-[var(--success)]/15 to-transparent text-[var(--success)]"
              : item.tone === "warn"
                ? "from-amber-500/15 to-transparent text-amber-600 dark:text-amber-400"
                : item.tone === "danger"
                  ? "from-[var(--danger)]/15 to-transparent text-[var(--danger)]"
                  : "from-[var(--bg-soft)] to-transparent text-[var(--text)]";
        return (
          <div
            key={item.label}
            className={cn(
              "relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4",
              "bg-gradient-to-br",
              tone
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {item.label}
                </div>
                <div className="mt-1.5 truncate text-xl font-semibold tracking-tight text-[var(--text)]">
                  {item.value}
                </div>
                {item.hint ? (
                  <div className="mt-1 text-[11px] text-[var(--text-muted)]">{item.hint}</div>
                ) : null}
              </div>
              {Icon ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/70 p-2 text-[var(--text-muted)]">
                  <Icon size={16} />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FilterChips({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; count?: number }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
              active
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
            )}
          >
            {o.label}
            {typeof o.count === "number" ? (
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] tabular-nums",
                  active ? "bg-[var(--bg)]/60" : "bg-[var(--bg-soft)]"
                )}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function DocStatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const tone =
    s === "posted" || s === "completed" || s === "active"
      ? "bg-[var(--success)]/15 text-[var(--success)]"
      : s === "returned" || s === "partial"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : s === "deleted" || s === "cancelled"
          ? "bg-[var(--danger)]/15 text-[var(--danger)]"
          : s === "credit" || s === "draft"
            ? "bg-[var(--info)]/15 text-[var(--info)]"
            : "bg-[var(--bg-soft)] text-[var(--text-muted)]";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", tone)}>
      {status || "—"}
    </span>
  );
}

export function PaymentModeBadge({ mode }: { mode: string }) {
  const { t } = useI18n();
  const m = (mode || "").toLowerCase();
  const tone =
    m === "cash"
      ? "bg-[var(--success)]/12 text-[var(--success)]"
      : m === "bank"
        ? "bg-[var(--info)]/12 text-[var(--info)]"
        : "bg-amber-500/12 text-amber-700 dark:text-amber-300";
  const label =
    m === "cash" ? t("payment.cash") : m === "bank" ? t("payment.bank") : m === "credit" ? t("payment.credit") : mode;
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold", tone)}>
      {label}
    </span>
  );
}

export function PaymentModePicker({
  value,
  onChange,
  options,
}: {
  value: PaymentMode;
  onChange: (v: PaymentMode) => void;
  options?: { value: PaymentMode; label: string; hint?: string }[];
}) {
  const { t } = useI18n();
  const resolved =
    options ??
    ([
      { value: "cash", label: t("payment.cash") },
      { value: "bank", label: t("payment.bank") },
      { value: "credit", label: t("payment.credit") },
    ] as const);
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-[var(--text-muted)]">{t("payment.mode")}</div>
      <div className="grid grid-cols-3 gap-2">
        {resolved.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-center transition",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_0_1px_var(--accent)]"
                  : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--border-strong)]"
              )}
            >
              <div className={cn("text-sm font-semibold", active && "text-[var(--accent)]")}>{o.label}</div>
              {o.hint ? <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{o.hint}</div> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ComposerSection({
  title,
  hint,
  children,
  className,
  action,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--border)] bg-[var(--bg)]/40 p-4",
        className
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
          {hint ? <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TotalsPanel({
  rows,
  grandLabel = "Grand total",
  grand,
  due,
  dueLabel = "Balance due",
  accent,
}: {
  rows: { label: string; value: string; muted?: boolean; negative?: boolean }[];
  grandLabel?: string;
  grand: string;
  due?: string;
  dueLabel?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        accent
          ? "border-[var(--accent)]/40 bg-gradient-to-b from-[var(--accent-soft)] to-[var(--bg)]"
          : "border-[var(--border)] bg-[var(--bg-soft)]/80"
      )}
    >
      <div className="space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <span className={cn(r.muted ? "text-[var(--text-muted)]" : "text-[var(--text)]")}>{r.label}</span>
            <span
              className={cn(
                "tabular-nums font-medium",
                r.negative ? "text-[var(--danger)]" : "text-[var(--text)]"
              )}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
      <div className="my-3 h-px bg-[var(--border)]" />
      <div className="flex items-end justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {grandLabel}
        </span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{grand}</span>
      </div>
      {due !== undefined ? (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm">
          <span className="text-[var(--text-muted)]">{dueLabel}</span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              Number(due.replace(/[^0-9.-]/g, "")) > 0 ? "text-amber-600 dark:text-amber-300" : "text-[var(--success)]"
            )}
          >
            {due}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function LineItemsTable({
  headers,
  empty,
  emptyTitle = "No items yet",
  emptyHint,
  children,
}: {
  headers: string[];
  empty?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  children: React.ReactNode;
}) {
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-soft)]/40 px-4 py-8 text-center">
        <div className="text-sm text-[var(--text-muted)]">{emptyTitle}</div>
        {emptyHint ? <p className="mt-1 max-w-sm text-xs text-[var(--text-muted)]">{emptyHint}</p> : null}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg-soft)] text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <tr>
              {headers.map((h, i) => (
                <th key={`${h}-${i}`} className="px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] bg-[var(--bg)]">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function OpsEmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] px-6 py-16 text-center">
      <div className="mb-4 h-14 w-14 rounded-2xl bg-gradient-to-br from-[var(--accent-soft)] to-[var(--atmosphere-2)]" />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-[var(--text-muted)]">{hint}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function OpsListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-4 py-3">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="divide-y divide-[var(--border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-48" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DocMetaGrid({
  items,
}: {
  items: { label: string; value: React.ReactNode }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)]/50 px-3 py-2.5"
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {item.label}
          </div>
          <div className="mt-1 text-sm font-medium">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function VoucherWorkspace({
  formTitle,
  formHint,
  form,
  listTitle,
  list,
  stats,
}: {
  formTitle: string;
  formHint?: string;
  form: React.ReactNode;
  listTitle: string;
  list: React.ReactNode;
  stats?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      {stats}
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[0_1px_0_rgba(0,0,0,0.04)] xl:sticky xl:top-4">
          <div className="mb-4 border-b border-[var(--border)] pb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
              Entry desk
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">{formTitle}</h2>
            {formHint ? <p className="mt-1 text-xs text-[var(--text-muted)]">{formHint}</p> : null}
          </div>
          <div className="space-y-4">{form}</div>
        </aside>
        <section className="min-w-0 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{listTitle}</h2>
              <p className="text-xs text-[var(--text-muted)]">Posted documents in this register</p>
            </div>
          </div>
          {list}
        </section>
      </div>
    </div>
  );
}
