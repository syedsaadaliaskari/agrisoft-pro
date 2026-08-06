"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Pencil, Plus, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
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
    <AppShell title="Journal" subtitle="Manual double-entry voucher" permission="transactions.create">
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
      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <h2 className="text-sm font-semibold">{editingId ? "Edit journal" : "New journal"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Date" type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
          <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {lines.map((line) => (
          <div
            key={line.key}
            className="grid gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-[1.4fr_90px_90px_1fr_36px]"
          >
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
        <div className="flex flex-wrap gap-2">
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
          <Button onClick={() => void onSave()} disabled={saving}>
            {saving ? "Saving..." : editingId ? "Update journal" : "Post journal"}
          </Button>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Recent journals</h2>
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading...</p>
        ) : (
          <DataTable headers={["Voucher", "Date", "Amount", "Notes", "Status", "Actions"]} empty={rows.length === 0}>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 font-mono text-xs font-medium">{row.voucherNo}</td>
                <td className="px-4 py-3">{row.voucherDate}</td>
                <td className="px-4 py-3">{row.grandTotal.toLocaleString()}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{row.notes || "—"}</td>
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
            ))}
          </DataTable>
        )}
      </div>
    </AppShell>
  );
}
