"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  CalendarRange,
  Scale,
  Search,
} from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";
import {
  OpsEmptyState,
  OpsListSkeleton,
  OpsStatStrip,
  money,
} from "@/components/ops/DocumentWorkspace";
import { Alert, Button, Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { LedgerLine } from "@shared/ipc";

export type LedgerPickItem = {
  id: string;
  code: string;
  name: string;
  hint?: string;
};

export type LedgerStatement = {
  title: string;
  subtitle?: string;
  fromDate: string | null;
  toDate: string | null;
  openingBalance: number;
  openingSide: string;
  closingBalance: number;
  closingSide: string;
  totalDebit: number;
  totalCredit: number;
  lines: LedgerLine[];
};

function sideLabel(side: string) {
  const s = (side || "").toLowerCase();
  if (s === "debit" || s === "dr") return "Dr";
  if (s === "credit" || s === "cr") return "Cr";
  return side;
}

function VoucherTypeChip({ type }: { type: string }) {
  const label = type.replace(/_/g, " ");
  return (
    <span className="inline-flex rounded-md bg-[var(--bg-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      {label}
    </span>
  );
}

export function LedgerInquiry({
  title,
  subtitle,
  pickerLabel,
  items,
  selectedId,
  onSelect,
  fromDate,
  toDate,
  onFromDate,
  onToDate,
  onLoad,
  loading,
  error,
  statement,
  exportFilename,
  emptyHint,
}: {
  title: string;
  subtitle: string;
  pickerLabel: string;
  items: LedgerPickItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  fromDate: string;
  toDate: string;
  onFromDate: (v: string) => void;
  onToDate: (v: string) => void;
  onLoad: () => void;
  loading: boolean;
  error: string;
  statement: LedgerStatement | null;
  exportFilename: string;
  emptyHint: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.code.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        (i.hint ?? "").toLowerCase().includes(q)
    );
  }, [items, query]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  // Auto-load when entity first becomes available / changes (dates still require Load or Enter)
  useEffect(() => {
    if (selectedId) onLoad();
    // intentionally only when selection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div className="space-y-5">
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* Inquiry desk — left */}
        <aside className="flex h-fit flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[0_1px_0_rgba(0,0,0,0.04)] xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)]">
          <div className="border-b border-[var(--border)] px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
              Ledger desk
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitle}</p>
          </div>

          <div className="space-y-3 border-b border-[var(--border)] px-4 py-3">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] py-2 pl-9 pr-3 text-sm outline-none ring-[var(--accent)] focus:ring-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="From"
                type="date"
                value={fromDate}
                onChange={(e) => onFromDate(e.target.value)}
              />
              <Input
                label="To"
                type="date"
                value={toDate}
                onChange={(e) => onToDate(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={onLoad} disabled={!selectedId || loading}>
              {loading ? "Loading…" : "Load statement"}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-[var(--text-muted)]">No matches</p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(item.id)}
                        className={cn(
                          "w-full rounded-xl px-3 py-2.5 text-left transition",
                          active
                            ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]"
                            : "hover:bg-[var(--bg-soft)]"
                        )}
                      >
                        <div
                          className={cn(
                            "truncate text-sm font-medium",
                            active && "text-[var(--accent)]"
                          )}
                        >
                          {item.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                          <span className="font-mono">{item.code}</span>
                          {item.hint ? (
                            <>
                              <span>·</span>
                              <span className="truncate">{item.hint}</span>
                            </>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Statement — right */}
        <section className="min-w-0 space-y-4">
          {loading && !statement ? (
            <OpsListSkeleton rows={8} />
          ) : !statement ? (
            <OpsEmptyState
              title={`Select a ${pickerLabel.toLowerCase()}`}
              hint={emptyHint}
            />
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    <BookOpen size={12} />
                    Statement
                  </div>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">{statement.title}</h2>
                  {statement.subtitle ? (
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">{statement.subtitle}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1">
                      <CalendarRange size={12} />
                      {statement.fromDate || "Start"} → {statement.toDate || "Today"}
                    </span>
                    {selected ? (
                      <span className="font-mono text-[11px]">{selected.code}</span>
                    ) : null}
                  </div>
                </div>
                <ExportMenu
                  filename={exportFilename}
                  title={statement.title}
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "voucherNo", label: "Voucher" },
                    { key: "voucherType", label: "Type" },
                    { key: "narration", label: "Narration" },
                    { key: "debit", label: "Debit" },
                    { key: "credit", label: "Credit" },
                    { key: "balance", label: "Balance" },
                  ]}
                  rows={statement.lines.map((l) => ({
                    date: l.date,
                    voucherNo: l.voucherNo,
                    voucherType: l.voucherType.replace("_", " "),
                    narration: l.narration ?? "",
                    debit: l.debit || "",
                    credit: l.credit || "",
                    balance: l.balance,
                  }))}
                />
              </div>

              <OpsStatStrip
                items={[
                  {
                    label: "Opening",
                    value: `${money(statement.openingBalance)} ${sideLabel(statement.openingSide)}`,
                    hint: "Brought forward",
                    icon: Scale,
                  },
                  {
                    label: "Total debit",
                    value: money(statement.totalDebit),
                    hint: `${statement.lines.filter((l) => l.debit > 0).length} lines`,
                    tone: "accent",
                    icon: ArrowDownLeft,
                  },
                  {
                    label: "Total credit",
                    value: money(statement.totalCredit),
                    hint: `${statement.lines.filter((l) => l.credit > 0).length} lines`,
                    icon: ArrowUpRight,
                  },
                  {
                    label: "Closing",
                    value: `${money(statement.closingBalance)} ${sideLabel(statement.closingSide)}`,
                    hint: "Carry forward",
                    tone: "success",
                    icon: Scale,
                  },
                ]}
              />

              {statement.lines.length === 0 ? (
                <OpsEmptyState
                  title="No movements in this period"
                  hint="Try widening the date range, or post a voucher that hits this ledger."
                />
              ) : (
                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-[var(--border)] bg-[var(--bg-soft)] text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Date</th>
                          <th className="px-4 py-3 font-semibold">Voucher</th>
                          <th className="px-4 py-3 font-semibold">Narration</th>
                          <th className="px-4 py-3 text-right font-semibold">Debit</th>
                          <th className="px-4 py-3 text-right font-semibold">Credit</th>
                          <th className="px-4 py-3 text-right font-semibold">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40">
                          <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]" colSpan={3}>
                            Opening balance
                          </td>
                          <td className="px-4 py-2.5" />
                          <td className="px-4 py-2.5" />
                          <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">
                            {money(statement.openingBalance)}{" "}
                            <span className="text-[11px] font-medium text-[var(--text-muted)]">
                              {sideLabel(statement.openingSide)}
                            </span>
                          </td>
                        </tr>
                        {statement.lines.map((l, i) => (
                          <tr
                            key={`${l.voucherId}-${i}`}
                            className="border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--bg-soft)]/50"
                          >
                            <td className="px-4 py-3 whitespace-nowrap text-[var(--text-muted)]">
                              {l.date}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-mono text-xs font-semibold">{l.voucherNo}</div>
                              <div className="mt-1">
                                <VoucherTypeChip type={l.voucherType} />
                              </div>
                            </td>
                            <td className="px-4 py-3 max-w-[280px] text-[var(--text-muted)]">
                              {l.narration || "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {l.debit ? (
                                <span className="font-medium text-[var(--text)]">{money(l.debit)}</span>
                              ) : (
                                <span className="text-[var(--text-muted)]">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {l.credit ? (
                                <span className="font-medium text-[var(--text)]">{money(l.credit)}</span>
                              ) : (
                                <span className="text-[var(--text-muted)]">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums">
                              {money(l.balance)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-[var(--bg-soft)]">
                          <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]" colSpan={3}>
                            Period totals / closing
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            {money(statement.totalDebit)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            {money(statement.totalCredit)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            {money(statement.closingBalance)}{" "}
                            <span className="text-[11px] font-medium text-[var(--text-muted)]">
                              {sideLabel(statement.closingSide)}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
