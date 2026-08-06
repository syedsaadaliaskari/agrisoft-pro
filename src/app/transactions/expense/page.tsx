"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button, Input, Select, Textarea } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { Account } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpensePage() {
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [cashAccounts, setCashAccounts] = useState<Account[]>([]);
  const [voucherDate, setVoucherDate] = useState(today());
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const api = getApi();
      const [e, c] = await Promise.all([
        api.listAccounts({ accountType: "expense", activeOnly: true }),
        api.listAccounts({ cashBankOnly: true }),
      ]);
      if (e.ok) {
        setExpenseAccounts(e.data);
        if (e.data[0]) setExpenseAccountId(e.data[0].id);
      }
      if (c.ok) {
        setCashAccounts(c.data);
        if (c.data[0]) setAccountId(c.data[0].id);
      }
    })();
  }, []);

  const onSave = async () => {
    setSaving(true);
    setError("");
    setOkMsg("");
    const res = await getApi().postExpense({
      voucherDate,
      expenseAccountId,
      accountId,
      amount: Number(amount),
      notes: notes || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg(`Saved ${res.data.voucherNo}`);
    setAmount("");
    setNotes("");
  };

  return (
    <AppShell title="Expense" subtitle="Post operating expense voucher" permission="transactions.create">
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {okMsg ? <div className="mb-4"><Alert tone="info">{okMsg}</Alert></div> : null}
      <div className="max-w-xl space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <Input label="Date" type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
        <Select
          label="Expense account"
          value={expenseAccountId}
          onChange={(e) => setExpenseAccountId(e.target.value)}
          options={expenseAccounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
        />
        <Select
          label="Paid from"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={cashAccounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
        />
        <Input label="Amount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button onClick={() => void onSave()} disabled={saving || !amount}>
          {saving ? "Saving..." : "Post expense"}
        </Button>
      </div>
    </AppShell>
  );
}
