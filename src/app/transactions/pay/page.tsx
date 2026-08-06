"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button, Input, Select, Textarea } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { Account, Vendor } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function MakePaymentPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [voucherDate, setVoucherDate] = useState(today());
  const [vendorId, setVendorId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const api = getApi();
      const [v, a] = await Promise.all([api.listVendors(), api.listAccounts({ cashBankOnly: true })]);
      if (v.ok) {
        setVendors(v.data.filter((x) => x.isActive));
        if (v.data[0]) setVendorId(v.data[0].id);
      }
      if (a.ok) {
        setAccounts(a.data);
        if (a.data[0]) setAccountId(a.data[0].id);
      }
    })();
  }, []);

  const onSave = async () => {
    setSaving(true);
    setError("");
    setOkMsg("");
    const res = await getApi().makePayment({
      voucherDate,
      vendorId,
      accountId,
      amount: Number(amount),
      referenceNo: referenceNo || null,
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
    <AppShell title="Make Payment" subtitle="Vendor payment from cash/bank" permission="transactions.create">
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {okMsg ? <div className="mb-4"><Alert tone="info">{okMsg}</Alert></div> : null}
      <div className="max-w-xl space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <Input label="Date" type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
        <Select
          label="Vendor"
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          options={vendors.map((v) => ({ value: v.id, label: `${v.code} — ${v.name}` }))}
        />
        <Select
          label="Pay from"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
        />
        <Input label="Amount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Reference" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button onClick={() => void onSave()} disabled={saving || !vendorId || !accountId || !amount}>
          {saving ? "Saving..." : "Post payment"}
        </Button>
      </div>
    </AppShell>
  );
}
