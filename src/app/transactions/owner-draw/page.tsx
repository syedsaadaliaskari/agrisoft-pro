"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Pencil, Plus, Receipt, UserRound } from "lucide-react";
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
import { Alert, Button, DataTable, Input, Modal, PageToolbar, Textarea } from "@/components/ui/form";
import { PrintMenu } from "@/components/PrintMenu";
import { getApi } from "@/lib/api";
import { printVoucherNow, voucherPrintHtml } from "@/lib/print-actions";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type { Voucher } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

type ListFilter = "all" | "today";

export default function OwnerDrawPage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, "transactions.create");

  const [rows, setRows] = useState<Voucher[]>([]);
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState(false);
  const [voucherDate, setVoucherDate] = useState(today());
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
    const v = await api.listVouchers({ voucherType: "owner_draw", includeCancelled: true });
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const t = today();
    return rows.filter((r) => {
      if (listFilter === "today" && r.voucherDate !== t) return false;
      if (!q) return true;
      return r.voucherNo.toLowerCase().includes(q) || (r.notes ?? "").toLowerCase().includes(q);
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
      amount: Number(amount) || Number(cashPaid || 0) + Number(bankPaid || 0),
      cashPaid: Number(cashPaid || 0),
      bankPaid: Number(bankPaid || 0),
      notes: notes || null,
    };
    const res = editingId
      ? await getApi().updateOwnerDraw(editingId, payload)
      : await getApi().postOwnerDraw(payload);
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
    if (!confirm(`Cancel owner draw ${row.voucherNo}?`)) return;
    const res = await getApi().cancelVoucher(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (editingId === row.id) closeComposer();
    await load();
  };

  const canSave = !saving && splitCoversAmount(amount, cashPaid, bankPaid) && canCreate;
  const filterCounts = {
    all: rows.length,
    today: rows.filter((r) => r.voucherDate === today()).length,
  };

  return (
    <AppShell title="Owner Draw" permission="transactions.create">
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
            label: "Today's draws",
            value: money(stats.todayTotal),
            hint: `${stats.todayCount} voucher${stats.todayCount === 1 ? "" : "s"}`,
            tone: "accent",
            icon: UserRound,
          },
          {
            label: "Active draws",
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
        addLabel="New draw"
        actions={
          <ExportMenu
            filename="owner-draw"
            title="Owner draw"
            columns={[
              { key: "voucherNo", label: "Voucher" },
              { key: "voucherDate", label: "Date" },
              { key: "paidFrom", label: "Taken from" },
              { key: "grandTotal", label: "Amount" },
              { key: "status", label: "Status" },
            ]}
            rows={filtered.map((r) => ({
              voucherNo: r.voucherNo,
              voucherDate: r.voucherDate,
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
          title={search || listFilter !== "all" ? "No matching draws" : "No owner draws yet"}
          action={
            canCreate && !search && listFilter === "all" ? (
              <Button onClick={openComposer}>
                <Plus size={14} /> New draw
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
          <DataTable headers={["Voucher", "Taken from", "Amount", "Status", ""]} empty={false}>
            {filtered.map((row) => (
              <tr
                key={row.id}
                className="group border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--bg-soft)]/60"
              >
                <td className="px-4 py-3.5">
                  <div className="font-mono text-xs font-semibold tracking-wide">{row.voucherNo}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{row.voucherDate}</div>
                </td>
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
            ))}
          </DataTable>
        </div>
      )}

      <Modal
        open={composer}
        size="full"
        title={editingId ? "Edit owner draw" : "New owner draw"}
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
          grandLabel="Draw"
          fields={
            <Input
              label="Date"
              type="date"
              value={voucherDate}
              onChange={(e) => setVoucherDate(e.target.value)}
            />
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
