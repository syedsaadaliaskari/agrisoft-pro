"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, BookOpen, Pencil, Plus, Scale, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  ComposerSection,
  DocStatusBadge,
  OpsEmptyState,
  OpsListSkeleton,
  OpsStatStrip,
  TotalsPanel,
  money,
} from "@/components/ops/DocumentWorkspace";
import { Alert, Button, DataTable, Input, Select, Textarea } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type { Account, Voucher } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

type Line = { key: string; accountId: string; debit: string; credit: string; narration: string };

function blankLines(): Line[] {
  return [
    { key: "1", accountId: "", debit: "", credit: "", narration: "" },
    { key: "2", accountId: "", debit: "", credit: "", narration: "" },
  ];
}

export default function JournalPage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, "transactions.create");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [voucherDate, setVoucherDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>(blankLines());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const api = getApi();
    const [a, v] = await Promise.all([
      api.listAccounts({ activeOnly: true }),
      api.listVouchers({ voucherType: "journal", includeCancelled: true }),
    ]);
    if (a.ok) setAccounts(a.data);
    if (v.ok) setRows(v.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const debitTotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.debit || 0), 0),
    [lines]
  );
  const creditTotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.credit || 0), 0),
    [lines]
  );
  const balanced = Math.abs(debitTotal - creditTotal) < 0.005 && debitTotal > 0;

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status !== "cancelled");
    const t = today();
    const todayRows = active.filter((r) => r.voucherDate === t);
    return {
      count: active.length,
      todayCount: todayRows.length,
      total: active.reduce((s, r) => s + r.grandTotal, 0),
    };
  }, [rows]);

  const resetForm = () => {
    setVoucherDate(today());
    setNotes("");
    setLines(blankLines());
    setEditingId(null);
    setError("");
  };

  const openEdit = (row: Voucher) => {
    if (row.status === "cancelled") return;
    setEditingId(row.id);
    setVoucherDate(row.voucherDate);
    setNotes(row.notes ?? "");
    const entries = row.entries?.length
      ? row.entries.map((e, i) => ({
          key: String(i + 1),
          accountId: e.accountId,
          debit: e.debit > 0 ? String(e.debit) : "",
          credit: e.credit > 0 ? String(e.credit) : "",
          narration: e.narration ?? "",
        }))
      : blankLines();
    setLines(entries);
    setError("");
    setOkMsg("");
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    setOkMsg("");
    const payload = {
      voucherType: "journal" as const,
      voucherDate,
      notes: notes || null,
      entries: lines
        .filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          narration: l.narration || null,
        })),
    };
    const res = editingId
      ? await getApi().updateVoucher(editingId, payload)
      : await getApi().postVoucher(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg(editingId ? `Updated ${res.data.voucherNo}` : `Saved ${res.data.voucherNo}`);
    resetForm();
    await load();
  };

  const onCancel = async (row: Voucher) => {
    if (row.status === "cancelled") return;
    if (!confirm(`Cancel journal ${row.voucherNo}?`)) return;
    const res = await getApi().cancelVoucher(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (editingId === row.id) resetForm();
    await load();
  };

  return (
    <AppShell title="Journal" subtitle="Manual double-entry voucher desk" permission="transactions.create">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {okMsg ? (
        <div className="mb-4">
          <Alert tone="info">{okMsg}</Alert>
        </div>
      ) : null}

      <OpsStatStrip
        items={[
          {
            label: "Today's journals",
            value: String(stats.todayCount),
            hint: "Posted today",
            tone: "accent",
            icon: BookOpen,
          },
          {
            label: "Active journals",
            value: String(stats.count),
            hint: money(stats.total) + " volume",
            icon: Scale,
          },
          {
            label: "Draft debit",
            value: money(debitTotal),
            hint: balanced ? "Balanced" : "Must equal credit",
            tone: balanced ? "success" : "warn",
          },
          {
            label: "Draft credit",
            value: money(creditTotal),
            hint: balanced ? "Ready to post" : "Out of balance",
            tone: balanced ? "success" : "warn",
          },
        ]}
      />

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <ComposerSection
          title={editingId ? "Edit journal voucher" : "New journal voucher"}
          hint="Debits must equal credits before posting"
          action={
            <span
              className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                balanced
                  ? "bg-[var(--success)]/15 text-[var(--success)]"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              }`}
            >
              {balanced ? "In balance" : "Out of balance"}
            </span>
          }
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Input
              label="Date"
              type="date"
              value={voucherDate}
              onChange={(e) => setVoucherDate(e.target.value)}
            />
            <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div
                key={line.key}
                className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-3 sm:grid-cols-[1.5fr_100px_100px_1fr_36px]"
              >
                <Select
                  label={idx === 0 ? "Account" : undefined}
                  value={line.accountId}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, accountId: e.target.value } : l))
                    )
                  }
                  options={[
                    { value: "", label: "— Select —" },
                    ...accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })),
                  ]}
                />
                <Input
                  label={idx === 0 ? "Debit" : undefined}
                  type="number"
                  value={line.debit}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, debit: e.target.value, credit: "" } : l
                      )
                    )
                  }
                />
                <Input
                  label={idx === 0 ? "Credit" : undefined}
                  type="number"
                  value={line.credit}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, credit: e.target.value, debit: "" } : l
                      )
                    )
                  }
                />
                <Input
                  label={idx === 0 ? "Narration" : undefined}
                  value={line.narration}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, narration: e.target.value } : l
                      )
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className={idx === 0 ? "self-end" : "self-center"}
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                >
                  <X size={14} />
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  { key: String(Date.now()), accountId: "", debit: "", credit: "", narration: "" },
                ])
              }
            >
              <Plus size={14} /> Add line
            </Button>
            {editingId ? (
              <Button variant="secondary" onClick={resetForm}>
                Cancel edit
              </Button>
            ) : null}
            <Button onClick={() => void onSave()} disabled={saving || !canCreate || !balanced}>
              {saving ? "Saving..." : editingId ? "Update journal" : "Post journal"}
            </Button>
          </div>
        </ComposerSection>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <TotalsPanel
            accent
            rows={[
              { label: "Total debit", value: money(debitTotal), muted: true },
              { label: "Total credit", value: money(creditTotal), muted: true },
              {
                label: "Difference",
                value: money(Math.abs(debitTotal - creditTotal)),
                muted: true,
                negative: !balanced && (debitTotal > 0 || creditTotal > 0),
              },
            ]}
            grand={money(Math.max(debitTotal, creditTotal))}
            grandLabel="Voucher amount"
          />
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Each journal must balance. Use this for adjustments, opening balances, and non-standard
            postings that sales/purchase vouchers do not cover.
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Journal register</h2>
          <p className="text-xs text-[var(--text-muted)]">Posted manual vouchers</p>
        </div>
        {loading ? (
          <OpsListSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <OpsEmptyState title="No journals yet" hint="Create a balanced double-entry voucher above." />
        ) : (
          <DataTable headers={["Voucher", "Amount", "Notes", "Status", ""]} empty={false}>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="group border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--bg-soft)]/60"
              >
                <td className="px-4 py-3.5">
                  <div className="font-mono text-xs font-semibold">{row.voucherNo}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{row.voucherDate}</div>
                </td>
                <td className="px-4 py-3.5 font-semibold tabular-nums">{money(row.grandTotal)}</td>
                <td className="px-4 py-3.5 max-w-[240px] truncate text-[var(--text-muted)]">
                  {row.notes || "—"}
                </td>
                <td className="px-4 py-3.5">
                  <DocStatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3.5">
                  {canCreate && row.status !== "cancelled" ? (
                    <div className="flex justify-end gap-0.5">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)} title="Edit">
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void onCancel(row)}
                        title="Cancel voucher"
                      >
                        <Ban size={14} />
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </AppShell>
  );
}
