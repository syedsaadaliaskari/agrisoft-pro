"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Pencil } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button, DataTable, Input, Select, Textarea } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type { Account, Voucher } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function IncomePage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, "transactions.create");

  const [incomeAccounts, setIncomeAccounts] = useState<Account[]>([]);
  const [cashAccounts, setCashAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [voucherDate, setVoucherDate] = useState(today());
  const [incomeAccountId, setIncomeAccountId] = useState("");
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
    const [i, c, v] = await Promise.all([
      api.listAccounts({ accountType: "income", activeOnly: true }),
      api.listAccounts({ cashBankOnly: true }),
      api.listVouchers({ voucherType: "income", includeCancelled: true }),
    ]);
    if (i.ok) {
      setIncomeAccounts(i.data);
      if (i.data[0]) setIncomeAccountId((prev) => prev || i.data[0].id);
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

  const resetForm = () => {
    setVoucherDate(today());
    setAmount("");
    setNotes("");
    setEditingId(null);
    setError("");
    if (incomeAccounts[0]) setIncomeAccountId(incomeAccounts[0].id);
    if (cashAccounts[0]) setAccountId(cashAccounts[0].id);
  };

  const openEdit = (row: Voucher) => {
    if (row.status === "cancelled") return;
    setEditingId(row.id);
    setVoucherDate(row.voucherDate);
    if (row.accountId) setAccountId(row.accountId);
    const incLine = row.entries?.find((e) => e.credit > 0);
    if (incLine?.accountId) setIncomeAccountId(incLine.accountId);
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
      incomeAccountId,
      accountId,
      amount: Number(amount),
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
    setOkMsg(editingId ? `Updated ${res.data.voucherNo}` : `Saved ${res.data.voucherNo}`);
    resetForm();
    await load();
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
    <AppShell title="Income" subtitle="Post other income voucher" permission="transactions.create">
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
      <div className="max-w-xl space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <h2 className="text-sm font-semibold">{editingId ? "Edit income" : "New income"}</h2>
        <Input label="Date" type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
        <Select
          label="Income account"
          value={incomeAccountId}
          onChange={(e) => setIncomeAccountId(e.target.value)}
          options={incomeAccounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
        />
        <Select
          label="Received in"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={cashAccounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
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
        <div className="flex flex-wrap gap-2">
          {editingId ? (
            <Button variant="secondary" onClick={resetForm}>
              Cancel edit
            </Button>
          ) : null}
          <Button onClick={() => void onSave()} disabled={saving || !amount || !incomeAccountId || !accountId}>
            {saving ? "Saving..." : editingId ? "Update income" : "Post income"}
          </Button>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Recent income</h2>
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading...</p>
        ) : (
          <DataTable
            headers={["Voucher", "Date", "Income acct", "Received in", "Amount", "Status", "Actions"]}
            empty={rows.length === 0}
          >
            {rows.map((row) => {
              const incLine = row.entries?.find((e) => e.credit > 0);
              return (
                <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{row.voucherNo}</td>
                  <td className="px-4 py-3">{row.voucherDate}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{incLine?.accountName || "—"}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{row.accountName || "—"}</td>
                  <td className="px-4 py-3">{row.grandTotal.toLocaleString()}</td>
                  <td className="px-4 py-3 capitalize">{row.status}</td>
                  <td className="px-4 py-3">
                    {canCreate && row.status !== "cancelled" ? (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)} title="Edit">
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void onCancel(row)} title="Cancel voucher">
                          <Ban size={14} />
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </div>
    </AppShell>
  );
}
