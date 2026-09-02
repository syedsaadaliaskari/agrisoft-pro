"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Ban,
  BookOpen,
  Pencil,
  Plus,
  Scale,
  X,
} from "lucide-react";
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
import { CashBankEffect } from "@/components/ops/CashBankEffect";
import { Alert, Button, DataTable, Input, Select, Textarea } from "@/components/ui/form";
import { PrintMenu } from "@/components/PrintMenu";
import { getApi } from "@/lib/api";
import { printVoucherNow, voucherPrintHtml } from "@/lib/print-actions";
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
  const [linkAmounts, setLinkAmounts] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [postedCashDelta, setPostedCashDelta] = useState(0);
  const [postedBankDelta, setPostedBankDelta] = useState(0);
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

  const cashAccount = useMemo(() => accounts.find((a) => a.code === "1100"), [accounts]);
  const bankAccount = useMemo(() => accounts.find((a) => a.code === "1200"), [accounts]);

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
    setLinkAmounts(false);
    setEditingId(null);
    setPostedCashDelta(0);
    setPostedBankDelta(0);
    setError("");
  };

  // Preset pairs stay balanced automatically: the amount typed on one line mirrors to the other.
  const setLineAmount = (key: string, side: "debit" | "credit", value: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key === key) {
          return side === "debit"
            ? { ...l, debit: value, credit: "" }
            : { ...l, credit: value, debit: "" };
        }
        if (!linkAmounts || prev.length !== 2) return l;
        return side === "debit"
          ? { ...l, credit: value, debit: "" }
          : { ...l, debit: value, credit: "" };
      })
    );
  };

  const cashBankFromLines = (rows: Line[]) => {
    let cash = 0;
    let bank = 0;
    for (const l of rows) {
      const signed = Number(l.debit || 0) - Number(l.credit || 0);
      if (cashAccount && l.accountId === cashAccount.id) cash += signed;
      if (bankAccount && l.accountId === bankAccount.id) bank += signed;
    }
    return { cash: Math.round(cash * 100) / 100, bank: Math.round(bank * 100) / 100 };
  };

  const draftBooks = useMemo(() => cashBankFromLines(lines), [lines, cashAccount, bankAccount]);

  const applyTransferPreset = (direction: "deposit" | "withdraw") => {
    if (!cashAccount || !bankAccount) return;
    const narration =
      direction === "deposit" ? "Cash deposited to bank" : "Cash withdrawn from bank";
    const debitAccount = direction === "deposit" ? bankAccount : cashAccount;
    const creditAccount = direction === "deposit" ? cashAccount : bankAccount;
    setLines([
      { key: "1", accountId: debitAccount.id, debit: "", credit: "", narration },
      { key: "2", accountId: creditAccount.id, debit: "", credit: "", narration },
    ]);
    setNotes(narration);
    setLinkAmounts(true);
    setError("");
    setOkMsg("");
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
    const posted = cashBankFromLines(entries);
    setPostedCashDelta(posted.cash);
    setPostedBankDelta(posted.bank);
    setLinkAmounts(false);
    setError("");
    setOkMsg("");
  };

  const onSave = async (andPrint = false) => {
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
    setOkMsg(editingId ? "Updated" : "Saved");
    resetForm();
    await load();
    if (andPrint) {
      const pr = await printVoucherNow(res.data);
      if (!pr.ok) setError(pr.error);
    }
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
    <AppShell title="Journal" permission="transactions.create">
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
            tone: "accent",
            icon: BookOpen,
          },
          {
            label: "Active journals",
            value: String(stats.count),
            hint: money(stats.total),
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

          {cashAccount && bankAccount ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">Quick presets</span>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => applyTransferPreset("deposit")}
              >
                <ArrowDownToLine size={14} /> Deposit cash to bank
              </Button>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => applyTransferPreset("withdraw")}
              >
                <ArrowUpFromLine size={14} /> Withdraw cash from bank
              </Button>
            </div>
          ) : null}

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
                    { value: "", label: "Select" },
                    ...accounts.map((a) => ({ value: a.id, label: `${a.name}` })),
                  ]}
                />
                <Input
                  label={idx === 0 ? "Debit" : undefined}
                  type="number"
                  value={line.debit}
                  onChange={(e) => setLineAmount(line.key, "debit", e.target.value)}
                />
                <Input
                  label={idx === 0 ? "Credit" : undefined}
                  type="number"
                  value={line.credit}
                  onChange={(e) => setLineAmount(line.key, "credit", e.target.value)}
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
                  onClick={() => {
                    setLinkAmounts(false);
                    setLines((prev) => prev.filter((l) => l.key !== line.key));
                  }}
                >
                  <X size={14} />
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <CashBankEffect
              cashDelta={draftBooks.cash}
              bankDelta={draftBooks.bank}
              replaceCashDelta={postedCashDelta}
              replaceBankDelta={postedBankDelta}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLinkAmounts(false);
                setLines((prev) => [
                  ...prev,
                  { key: String(Date.now()), accountId: "", debit: "", credit: "", narration: "" },
                ]);
              }}
            >
              <Plus size={14} /> Add line
            </Button>
            {editingId ? (
              <Button variant="secondary" onClick={resetForm}>
                Cancel edit
              </Button>
            ) : null}
            {!editingId ? (
              <Button
                variant="secondary"
                onClick={() => void onSave(true)}
                disabled={saving || !canCreate || !balanced}
              >
                {saving ? "Saving..." : "Save & print"}
              </Button>
            ) : null}
            <Button onClick={() => void onSave(false)} disabled={saving || !canCreate || !balanced}>
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
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Journal register</h2>
        </div>
        {loading ? (
          <OpsListSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <OpsEmptyState title="No journals yet" />
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
                  <div className="flex justify-end gap-0.5">
                    <PrintMenu
                      fileName={row.voucherNo}
                      getHtml={(size) => voucherPrintHtml(row, size)}
                      onError={setError}
                      onNotice={setOkMsg}
                    />
                    {canCreate && row.status !== "cancelled" ? (
                      <>
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
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </AppShell>
  );
}
