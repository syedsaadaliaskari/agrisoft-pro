"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Ban, Pencil, Plus, Receipt, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import {
  ComposerSection,
  DocStatusBadge,
  FilterChips,
  MoneyComposerBody,
  OpsEmptyState,
  OpsListSkeleton,
  OpsStatStrip,
  cashBankSummary,
  legsFromVoucher,
  splitCoversAmount,
  money,
} from "@/components/ops/DocumentWorkspace";
import { Alert, Button, DataTable, Input, Modal, PageToolbar, Select, Textarea } from "@/components/ui/form";
import { PrintMenu } from "@/components/PrintMenu";
import { getApi } from "@/lib/api";
import { printVoucherNow, voucherPrintHtml } from "@/lib/print-actions";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type { Account, Voucher } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

type ListFilter = "all" | "today";

function ExpensePageInner() {
  const searchParams = useSearchParams();
  const prefExpenseAccountId = searchParams.get("expenseAccountId") || "";
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, "transactions.create");

  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<Voucher[]>([]);
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState(false);
  const [voucherDate, setVoucherDate] = useState(today());
  const [expenseAccountId, setExpenseAccountId] = useState(prefExpenseAccountId);
  const [amount, setAmount] = useState("");
  const [cashPaid, setCashPaid] = useState("");
  const [bankPaid, setBankPaid] = useState("0");
  const [postedCash, setPostedCash] = useState(0);
  const [postedBank, setPostedBank] = useState(0);
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const api = getApi();
    const [e, v] = await Promise.all([
      api.listAccounts({ accountType: "expense", activeOnly: true }),
      api.listVouchers({ voucherType: "expense", includeCancelled: true }),
    ]);
    if (e.ok) {
      setExpenseAccounts(e.data);
      setExpenseAccountId((prev) => {
        if (prefExpenseAccountId && e.data.some((x) => x.id === prefExpenseAccountId)) {
          return prefExpenseAccountId;
        }
        return prev || e.data[0]?.id || "";
      });
    }
    if (v.ok) setRows(v.data);
    setLoading(false);
  }, [prefExpenseAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (prefExpenseAccountId) {
      setExpenseAccountId(prefExpenseAccountId);
      setComposer(true);
    }
  }, [prefExpenseAccountId]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status !== "cancelled");
    const t = today();
    const todayRows = active.filter((r) => r.voucherDate === t);
    return {
      count: active.length,
      todayTotal: todayRows.reduce((s, r) => s + r.grandTotal, 0),
      todayCount: todayRows.length,
      total: active.reduce((s, r) => s + r.grandTotal, 0),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const t = today();
    return rows.filter((r) => {
      if (listFilter === "today" && r.voucherDate !== t) return false;
      if (!q) return true;
      const acct = r.entries?.find((e) => e.debit > 0)?.accountName ?? "";
      return (
        r.voucherNo.toLowerCase().includes(q) ||
        acct.toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, listFilter]);

  const resetForm = () => {
    setVoucherDate(today());
    setAmount("");
    setCashPaid("");
    setBankPaid("0");
    setPostedCash(0);
    setPostedBank(0);
    setNotes("");
    setEditingId(null);
    setError("");
    if (expenseAccounts[0]) setExpenseAccountId(expenseAccounts[0].id);
  };

  const closeComposer = () => {
    setComposer(false);
    resetForm();
  };

  const openComposer = () => {
    resetForm();
    setComposer(true);
  };

  const openEdit = (row: Voucher) => {
    if (row.status === "cancelled") return;
    setEditingId(row.id);
    setVoucherDate(row.voucherDate);
    const expLine = row.entries?.find((e) => e.debit > 0);
    if (expLine?.accountId) setExpenseAccountId(expLine.accountId);
    setAmount(String(row.grandTotal));
    const legs = legsFromVoucher(row);
    setCashPaid(legs.cashPaid);
    setBankPaid(legs.bankPaid);
    setPostedCash(Number(legs.cashPaid || 0));
    setPostedBank(Number(legs.bankPaid || 0));
    setNotes(row.notes ?? "");
    setError("");
    setOkMsg("");
    setComposer(true);
  };

  const onSave = async (andPrint = false) => {
    setSaving(true);
    setError("");
    setOkMsg("");
    const payload = {
      voucherDate,
      expenseAccountId,
      amount: Number(amount) || Number(cashPaid || 0) + Number(bankPaid || 0),
      cashPaid: Number(cashPaid || 0),
      bankPaid: Number(bankPaid || 0),
      notes: notes || null,
    };
    const res = editingId
      ? await getApi().updateExpense(editingId, payload)
      : await getApi().postExpense(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg(editingId ? "Updated" : "Saved");
    setComposer(false);
    resetForm();
    await load();
    if (andPrint) {
      const pr = await printVoucherNow(res.data);
      if (!pr.ok) setError(pr.error);
    }
  };

  const onCancel = async (row: Voucher) => {
    if (row.status === "cancelled") return;
    if (!confirm(`Cancel expense ${row.voucherNo}?`)) return;
    const res = await getApi().cancelVoucher(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (editingId === row.id) closeComposer();
    await load();
  };

  const canSave =
    !saving && !!expenseAccountId && splitCoversAmount(amount, cashPaid, bankPaid) && canCreate;
  const filterCounts = {
    all: rows.length,
    today: rows.filter((r) => r.voucherDate === today()).length,
  };

  return (
    <AppShell title="Expense" permission="transactions.create">
      {error && !composer ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {okMsg && !composer ? (
        <div className="mb-4">
          <Alert tone="info">{okMsg}</Alert>
        </div>
      ) : null}

      <OpsStatStrip
        items={[
          {
            label: "Today's expenses",
            value: money(stats.todayTotal),
            hint: `${stats.todayCount} voucher${stats.todayCount === 1 ? "" : "s"}`,
            tone: "accent",
            icon: Wallet,
          },
          {
            label: "Active expenses",
            value: String(stats.count),
            hint: money(stats.total),
            icon: Receipt,
          },
        ]}
      />

      <PageToolbar
        search={search}
        onSearch={setSearch}
        onAdd={canCreate ? openComposer : undefined}
        addLabel="New expense"
        actions={
          <ExportMenu
            filename="expenses"
            title="Expense"
            columns={[
              { key: "voucherNo", label: "Voucher" },
              { key: "voucherDate", label: "Date" },
              { key: "account", label: "Account" },
              { key: "paidFrom", label: "Cash / bank" },
              { key: "grandTotal", label: "Amount" },
              { key: "status", label: "Status" },
            ]}
            rows={filtered.map((r) => ({
              voucherNo: r.voucherNo,
              voucherDate: r.voucherDate,
              account: r.entries?.find((e) => e.debit > 0)?.accountName || "—",
              paidFrom: cashBankSummary(r),
              grandTotal: r.grandTotal,
              status: r.status,
            }))}
          />
        }
      />

      <div className="mb-4">
        <FilterChips
          value={listFilter}
          onChange={(v) => setListFilter(v as ListFilter)}
          options={[
            { value: "all", label: "All", count: filterCounts.all },
            { value: "today", label: "Today", count: filterCounts.today },
          ]}
        />
      </div>

      {loading ? (
        <OpsListSkeleton />
      ) : filtered.length === 0 ? (
        <OpsEmptyState
          title={search || listFilter !== "all" ? "No matching expenses" : "No expenses yet"}
          action={
            canCreate && !search && listFilter === "all" ? (
              <Button onClick={openComposer}>
                <Plus size={14} /> New expense
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
          <DataTable headers={["Voucher", "Expense acct", "Paid from", "Amount", "Status", ""]} empty={false}>
            {filtered.map((row) => {
              const expLine = row.entries?.find((e) => e.debit > 0);
              return (
                <tr
                  key={row.id}
                  className="group border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--bg-soft)]/60"
                >
                  <td className="px-4 py-3.5">
                    <div className="font-mono text-xs font-semibold tracking-wide">{row.voucherNo}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{row.voucherDate}</div>
                  </td>
                  <td className="px-4 py-3.5 text-sm">{expLine?.accountName || "—"}</td>
                  <td className="px-4 py-3.5 text-[var(--text-muted)]">{cashBankSummary(row)}</td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums">{money(row.grandTotal)}</td>
                  <td className="px-4 py-3.5">
                    <DocStatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex justify-end gap-0.5 opacity-80 transition group-hover:opacity-100">
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
                          <Button variant="ghost" size="sm" onClick={() => void onCancel(row)} title="Cancel voucher">
                            <Ban size={14} />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      )}

      <Modal
        open={composer}
        size="full"
        title={editingId ? "Edit expense" : "New expense"}
        onClose={closeComposer}
        footer={
          <>
            <Button variant="secondary" onClick={closeComposer}>
              Cancel
            </Button>
            {!editingId ? (
              <Button variant="secondary" onClick={() => void onSave(true)} disabled={!canSave}>
                {saving ? "Saving..." : "Save & print"}
              </Button>
            ) : null}
            <Button onClick={() => void onSave(false)} disabled={!canSave}>
              {saving ? "Saving..." : editingId ? "Update" : "Save"}
            </Button>
          </>
        }
      >
        {error ? <Alert>{error}</Alert> : null}
        <MoneyComposerBody
          editingId={editingId}
          amount={amount}
          cashPaid={cashPaid}
          bankPaid={bankPaid}
          onAmount={setAmount}
          onCashPaid={setCashPaid}
          onBankPaid={setBankPaid}
          grandLabel="Expense"
          fields={
            <>
              <Input
                label="Date"
                type="date"
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
              />
              <Select
                label="Expense account"
                value={expenseAccountId}
                onChange={(e) => setExpenseAccountId(e.target.value)}
                options={expenseAccounts.map((a) => ({ value: a.id, label: a.name }))}
              />
            </>
          }
        >
          <ComposerSection title="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </ComposerSection>
        </MoneyComposerBody>
      </Modal>
    </AppShell>
  );
}

export default function ExpensePage() {
  return (
    <Suspense fallback={null}>
      <ExpensePageInner />
    </Suspense>
  );
}
