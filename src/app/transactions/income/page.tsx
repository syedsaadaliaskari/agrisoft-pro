"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button, Input, Select, Textarea } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { Account } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function IncomePage() {
  const [incomeAccounts, setIncomeAccounts] = useState<Account[]>([]);
  const [cashAccounts, setCashAccounts] = useState<Account[]>([]);
  const [voucherDate, setVoucherDate] = useState(today());
  const [incomeAccountId, setIncomeAccountId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const api = getApi();
      const [i, c] = await Promise.all([
        api.listAccounts({ accountType: "income", activeOnly: true }),
        api.listAccounts({ cashBankOnly: true }),
      ]);
      if (i.ok) {
        setIncomeAccounts(i.data);
        if (i.data[0]) setIncomeAccountId(i.data[0].id);
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
    const res = await getApi().postIncome({
      voucherDate,
      incomeAccountId,
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
    <AppShell title="Income" subtitle="Post other income voucher" permission="transactions.create">
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {okMsg ? <div className="mb-4"><Alert tone="info">{okMsg}</Alert></div> : null}
      <div className="max-w-xl space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
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
        <Input label="Amount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button onClick={() => void onSave()} disabled={saving || !amount}>
          {saving ? "Saving..." : "Post income"}
        </Button>
      </div>
    </AppShell>
  );
}
