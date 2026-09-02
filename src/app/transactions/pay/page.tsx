"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Ban, Pencil, Receipt } from "lucide-react";
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
import type { Vendor, Voucher } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function MakePaymentPageInner() {
  const searchParams = useSearchParams();
  const prefVendorId = searchParams.get("vendorId") || "";
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, "transactions.create");

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [rows, setRows] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [voucherDate, setVoucherDate] = useState(today());
  const [vendorId, setVendorId] = useState(prefVendorId);
  const [amount, setAmount] = useState("");
  const [cashPaid, setCashPaid] = useState("");
  const [bankPaid, setBankPaid] = useState("0");
  const [postedCash, setPostedCash] = useState(0);
  const [postedBank, setPostedBank] = useState(0);
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const api = getApi();
    const [v, list] = await Promise.all([
      api.listVendors(),
      api.listVouchers({ voucherType: "payment" }),
    ]);
    if (v.ok) {
      const active = v.data.filter((x) => x.isActive);
      setVendors(active);
      setVendorId((prev) => {
        if (prefVendorId && active.some((x) => x.id === prefVendorId)) return prefVendorId;
        return prev || active[0]?.id || "";
      });
    }
    if (list.ok) setRows(list.data);
    setLoading(false);
  }, [prefVendorId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (prefVendorId) setVendorId(prefVendorId);
  }, [prefVendorId]);

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
    setVendorId(vendors[0]?.id ?? "");
    setAmount("");
    setCashPaid("");
    setBankPaid("0");
    setPostedCash(0);
    setPostedBank(0);
    setReferenceNo("");
    setNotes("");
    setEditingId(null);
    setError("");
  };

  const openEdit = (row: Voucher) => {
    if (row.status === "cancelled") return;
    setEditingId(row.id);
    setVoucherDate(row.voucherDate);
    setVendorId(row.partyId ?? "");
    setAmount(String(row.grandTotal));
    const legs = legsFromVoucher(row);
    setCashPaid(legs.cashPaid);
    setBankPaid(legs.bankPaid);
    setPostedCash(Number(legs.cashPaid || 0));
    setPostedBank(Number(legs.bankPaid || 0));
    setReferenceNo(row.referenceNo ?? "");
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
      vendorId,
      amount: Number(amount) || Number(cashPaid || 0) + Number(bankPaid || 0),
      cashPaid: Number(cashPaid || 0),
      bankPaid: Number(bankPaid || 0),
      referenceNo: referenceNo || null,
      notes: notes || null,
    };
    const res = editingId
      ? await getApi().updateMakePayment(editingId, payload)
      : await getApi().makePayment(payload);
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
    if (!confirm(`Cancel payment ${row.voucherNo}?`)) return;
    const res = await getApi().cancelVoucher(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (editingId === row.id) resetForm();
    await load();
  };

  return (
    <AppShell
      title="Make Payment"
      permission="transactions.create"
    >
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
        formTitle={editingId ? "Edit payment" : "New payment"}
        stats={
          <OpsStatStrip
            items={[
              {
                label: "Today paid",
                value: money(stats.todayTotal),
                hint: `${stats.todayCount} payment${stats.todayCount === 1 ? "" : "s"}`,
                tone: "accent",
                icon: ArrowUpRight,
              },
              {
                label: "Active payments",
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
              label="Vendor"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              options={vendors.map((v) => ({ value: v.id, label: `${v.name}` }))}
            />
            <MoneySplitFields
              amount={amount}
              cashPaid={cashPaid}
              bankPaid={bankPaid}
              onAmount={setAmount}
              onCashPaid={setCashPaid}
              onBankPaid={setBankPaid}
              moneyFlow="out"
              postedCash={postedCash}
              postedBank={postedBank}
            />
            <Input
              label="Reference"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
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
                  disabled={saving || !vendorId || !splitCoversAmount(amount, cashPaid, bankPaid) || !canCreate}
                >
                  {saving ? "Saving..." : "Save & print"}
                </Button>
              ) : null}
              <Button
                onClick={() => void onSave(false)}
                disabled={saving || !vendorId || !splitCoversAmount(amount, cashPaid, bankPaid) || !canCreate}
              >
                {saving ? "Saving..." : editingId ? "Update payment" : "Post payment"}
              </Button>
            </div>
          </>
        }
        listTitle="Payment register"
        list={
          loading ? (
            <OpsListSkeleton rows={5} />
          ) : rows.length === 0 ? (
            <OpsEmptyState title="No payments yet" />
          ) : (
            <DataTable
              headers={["Voucher", "Vendor", "Cash / bank", "Amount", "Status", ""]}
              empty={false}
            >
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="group border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--bg-soft)]/60"
                >
                  <td className="px-4 py-3.5">
                    <div className="font-mono text-xs font-semibold">{row.voucherNo}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{row.voucherDate}</div>
                  </td>
                  <td className="px-4 py-3.5 font-medium">{row.partyName || "—"}</td>
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
              ))}
            </DataTable>
          )
        }
      />
    </AppShell>
  );
}

export default function MakePaymentPage() {
  return (
    <Suspense fallback={null}>
      <MakePaymentPageInner />
    </Suspense>
  );
}
