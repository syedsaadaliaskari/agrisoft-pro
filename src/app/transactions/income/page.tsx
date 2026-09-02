"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Ban, Pencil, Receipt, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  DocStatusBadge,
  OpsEmptyState,
  OpsListSkeleton,
  OpsStatStrip,
  VoucherWorkspace,
  MoneySplitFields,
  cashBankSummary,
  legsFromVoucher,
  splitCoversAmount,
  money,
} from "@/components/ops/DocumentWorkspace";
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

function IncomePageInner() {
  const searchParams = useSearchParams();
  const prefIncomeAccountId = searchParams.get("incomeAccountId") || "";
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, "transactions.create");

  const [incomeAccounts, setIncomeAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [voucherDate, setVoucherDate] = useState(today());
  const [incomeAccountId, setIncomeAccountId] = useState(prefIncomeAccountId);
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
    const [i, v] = await Promise.all([
      api.listAccounts({ accountType: "income", activeOnly: true }),
      api.listVouchers({ voucherType: "income", includeCancelled: true }),
    ]);
    if (i.ok) {
      setIncomeAccounts(i.data);
      setIncomeAccountId((prev) => {
        if (prefIncomeAccountId && i.data.some((x) => x.id === prefIncomeAccountId)) {
          return prefIncomeAccountId;
        }
        return prev || i.data[0]?.id || "";
      });
    }
    if (v.ok) setRows(v.data);
    setLoading(false);
  }, [prefIncomeAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (prefIncomeAccountId) setIncomeAccountId(prefIncomeAccountId);
  }, [prefIncomeAccountId]);

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
    setCashPaid("");
    setBankPaid("0");
    setPostedCash(0);
    setPostedBank(0);
    setNotes("");
    setEditingId(null);
    setError("");
    if (incomeAccounts[0]) setIncomeAccountId(incomeAccounts[0].id);
  };

  const openEdit = (row: Voucher) => {
    if (row.status === "cancelled") return;
    setEditingId(row.id);
    setVoucherDate(row.voucherDate);
    const incLine = row.entries?.find((e) => e.credit > 0);
    if (incLine?.accountId) setIncomeAccountId(incLine.accountId);
    setAmount(String(row.grandTotal));
    const legs = legsFromVoucher(row);
    setCashPaid(legs.cashPaid);
    setBankPaid(legs.bankPaid);
    setPostedCash(Number(legs.cashPaid || 0));
    setPostedBank(Number(legs.bankPaid || 0));
    setNotes(row.notes ?? "");
    setError("");
    setOkMsg("");
  };

  const onSave = async (andPrint = false) => {
    setSaving(true);
    setError("");
    setOkMsg("");
    const payload = {
      voucherDate,
      incomeAccountId,
      amount: Number(amount) || Number(cashPaid || 0) + Number(bankPaid || 0),
      cashPaid: Number(cashPaid || 0),
      bankPaid: Number(bankPaid || 0),
      notes: notes || null,
    };
    const res = editingId
      ? await getApi().updateIncome(editingId, payload)
      : await getApi().postIncome(payload);
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
    if (!confirm(`Cancel income ${row.voucherNo}?`)) return;
    const res = await getApi().cancelVoucher(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (editingId === row.id) resetForm();
    await load();
  };

  return (
    <AppShell title="Income" permission="transactions.create">
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
        formTitle={editingId ? "Edit income" : "New income"}
        stats={
          <OpsStatStrip
            items={[
              {
                label: "Today's income",
                value: money(stats.todayTotal),
                hint: `${stats.todayCount} voucher${stats.todayCount === 1 ? "" : "s"}`,
                tone: "accent",
                icon: TrendingUp,
              },
              {
                label: "Active income",
                value: String(stats.count),
                hint: money(stats.total),
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
              label="Income account"
              value={incomeAccountId}
              onChange={(e) => setIncomeAccountId(e.target.value)}
              options={incomeAccounts.map((a) => ({ value: a.id, label: `${a.name}` }))}
            />
            <MoneySplitFields
              amount={amount}
              cashPaid={cashPaid}
              bankPaid={bankPaid}
              onAmount={setAmount}
              onCashPaid={setCashPaid}
              onBankPaid={setBankPaid}
              moneyFlow="in"
              postedCash={postedCash}
              postedBank={postedBank}
            />
            <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="flex flex-wrap gap-2 pt-1">
              {editingId ? (
                <Button variant="secondary" onClick={resetForm}>
                  Cancel edit
                </Button>
              ) : null}
              {!editingId ? (
                <Button
                  variant="secondary"
                  onClick={() => void onSave(true)}
                  disabled={
                    saving || !incomeAccountId || !splitCoversAmount(amount, cashPaid, bankPaid) || !canCreate
                  }
                >
                  {saving ? "Saving..." : "Save & print"}
                </Button>
              ) : null}
              <Button
                onClick={() => void onSave(false)}
                disabled={
                  saving || !incomeAccountId || !splitCoversAmount(amount, cashPaid, bankPaid) || !canCreate
                }
              >
                {saving ? "Saving..." : editingId ? "Update income" : "Post income"}
              </Button>
            </div>
          </>
        }
        listTitle="Income register"
        list={
          loading ? (
            <OpsListSkeleton rows={5} />
          ) : rows.length === 0 ? (
            <OpsEmptyState title="No income vouchers yet" />
          ) : (
            <DataTable
              headers={["Voucher", "Income acct", "Received in", "Amount", "Status", ""]}
              empty={false}
            >
              {rows.map((row) => {
                const incLine = row.entries?.find((e) => e.credit > 0);
                return (
                  <tr
                    key={row.id}
                    className="group border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--bg-soft)]/60"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-mono text-xs font-semibold">{row.voucherNo}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{row.voucherDate}</div>
                    </td>
                    <td className="px-4 py-3.5 text-sm">{incLine?.accountName || "—"}</td>
                    <td className="px-4 py-3.5 text-[var(--text-muted)]">{cashBankSummary(row)}</td>
                    <td className="px-4 py-3.5 font-semibold tabular-nums">{money(row.grandTotal)}</td>
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
                );
              })}
            </DataTable>
          )
        }
      />
    </AppShell>
  );
}

export default function IncomePage() {
  return (
    <Suspense fallback={null}>
      <IncomePageInner />
    </Suspense>
  );
}
