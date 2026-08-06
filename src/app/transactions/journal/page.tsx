"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button, Input, Select, Textarea } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { Account } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

type Line = { key: string; accountId: string; debit: string; credit: string; narration: string };

export default function JournalPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [voucherDate, setVoucherDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { key: "1", accountId: "", debit: "", credit: "", narration: "" },
    { key: "2", accountId: "", debit: "", credit: "", narration: "" },
  ]);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getApi()
      .listAccounts({ activeOnly: true })
      .then((res) => {
        if (res.ok) setAccounts(res.data);
      });
  }, []);

  const onSave = async () => {
    setSaving(true);
    setError("");
    setOkMsg("");
    const res = await getApi().postVoucher({
      voucherType: "journal",
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
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg(`Saved ${res.data.voucherNo}`);
    setLines([
      { key: "1", accountId: "", debit: "", credit: "", narration: "" },
      { key: "2", accountId: "", debit: "", credit: "", narration: "" },
    ]);
    setNotes("");
  };

  return (
    <AppShell title="Journal" subtitle="Manual double-entry voucher" permission="transactions.create">
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {okMsg ? <div className="mb-4"><Alert tone="info">{okMsg}</Alert></div> : null}
      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Date" type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
          <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {lines.map((line) => (
          <div key={line.key} className="grid gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-[1.4fr_90px_90px_1fr_36px]">
            <Select
              label="Account"
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
              label="Debit"
              type="number"
              value={line.debit}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l) => (l.key === line.key ? { ...l, debit: e.target.value, credit: "" } : l))
                )
              }
            />
            <Input
              label="Credit"
              type="number"
              value={line.credit}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l) => (l.key === line.key ? { ...l, credit: e.target.value, debit: "" } : l))
                )
              }
            />
            <Input
              label="Narration"
              value={line.narration}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l) => (l.key === line.key ? { ...l, narration: e.target.value } : l))
                )
              }
            />
            <Button
              variant="ghost"
              size="sm"
              className="self-end"
              onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
            >
              <X size={14} />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
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
          <Button onClick={() => void onSave()} disabled={saving}>
            {saving ? "Saving..." : "Post journal"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
