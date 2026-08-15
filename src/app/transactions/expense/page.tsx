"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Pencil, Receipt, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  DocStatusBadge,
  OpsEmptyState,
  OpsListSkeleton,
  OpsStatStrip,
  VoucherWorkspace,
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

export default function ExpensePage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, "transactions.create");

  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [cashAccounts, setCashAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [voucherDate, setVoucherDate] = useState(today());
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const api = getApi();
    const [e, c, v] = await Promise.all([
      api.listAccounts({ accountType: "expense", activeOnly: true }),
      api.listAccounts({ cashBankOnly: true }),
      api.listVouchers({ voucherType: "expense", includeCancelled: true }),
    ]);
    if (e.ok) {
      setExpenseAccounts(e.data);
      if (e.data[0]) setExpenseAccountId((prev) => prev || e.data[0].id);
    }
    if (c.ok) {
      setCashAccounts(c.data);
      if (c.data[0]) setAccountId((prev) => prev || c.data[0].id);
    }
    if (v.ok) setRows(v.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const resetForm = () => {
    setVoucherDate(today());
    setAmount("");
    setNotes("");
    setEditingId(null);
    setError("");
    if (expenseAccounts[0]) setExpenseAccountId(expenseAccounts[0].id);
    if (cashAccounts[0]) setAccountId(cashAccounts[0].id);
  };

  const openEdit = (row: Voucher) => {
    if (row.status === "cancelled") return;
    setEditingId(row.id);
    setVoucherDate(row.voucherDate);
    if (row.accountId) setAccountId(row.accountId);
    const expLine = row.entries?.find((e) => e.debit > 0);
    if (expLine?.accountId) setExpenseAccountId(expLine.accountId);
    setAmount(String(row.grandTotal));
    setNotes(row.notes ?? "");
    setError("");
    setOkMsg("");
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    setOkMsg("");
    const payload = {
      voucherDate,
      expenseAccountId,
      accountId,
      amount: Number(amount),
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
    setOkMsg(editingId ? `Updated ${res.data.voucherNo}` : `Saved ${res.data.voucherNo}`);
    resetForm();
    await load();
  };

  const onCancel = async (row: Voucher) => {
    if (row.status === "cancelled") return;
    if (!confirm(`Cancel expense ${row.voucherNo}?`)) return;
    const res = await getApi().cancelVoucher(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (editingId === row.id) resetForm();
    await load();
  };

  return (
    <AppShell title="Expense" subtitle="Operating expenses from cash or bank" permission="transactions.create">
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

      <VoucherWorkspace
        formTitle={editingId ? "Edit expense" : "New expense"}
        formHint="Debit expense head and credit cash/bank"
        stats={
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
                hint: money(stats.total) + " posted",
                icon: Receipt,
              },
            ]}
          />
        }
        form={
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
              options={expenseAccounts.map((a) => ({ value: a.id, label: `${a.name}` }))}
            />
            <Select
              label="Paid from"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              options={cashAccounts.map((a) => ({ value: a.id, label: `${a.name}` }))}
            />
            <Input
              label="Amount"
              type="number"
              min={0.01}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="flex flex-wrap gap-2 pt-1">
              {editingId ? (
                <Button variant="secondary" onClick={resetForm}>
                  Cancel edit
                </Button>
              ) : null}
              <Button
                onClick={() => void onSave()}
                disabled={saving || !amount || !expenseAccountId || !accountId || !canCreate}
              >
                {saving ? "Saving..." : editingId ? "Update expense" : "Post expense"}
              </Button>
            </div>
          </>
        }
        listTitle="Expense register"
        list={
          loading ? (
            <OpsListSkeleton rows={5} />
          ) : rows.length === 0 ? (
            <OpsEmptyState title="No expenses yet" hint="Post rent, utilities, wages, and other operating costs." />
          ) : (
            <DataTable
              headers={["Voucher", "Expense acct", "Paid from", "Amount", "Status", ""]}
              empty={false}
            >
              {rows.map((row) => {
                const expLine = row.entries?.find((e) => e.debit > 0);
                return (
                  <tr
                    key={row.id}
                    className="group border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--bg-soft)]/60"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-mono text-xs font-semibold">{row.voucherNo}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{row.voucherDate}</div>
                    </td>
                    <td className="px-4 py-3.5 text-sm">{expLine?.accountName || "—"}</td>
                    <td className="px-4 py-3.5 text-[var(--text-muted)]">{row.accountName || "—"}</td>
                    <td className="px-4 py-3.5 font-semibold tabular-nums">{money(row.grandTotal)}</td>
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
                );
              })}
            </DataTable>
          )
        }
      />
    </AppShell>
  );
}
