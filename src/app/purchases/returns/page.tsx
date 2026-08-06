"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { PrintMenu } from "@/components/PrintMenu";
import {
  Alert,
  Button,
  DataTable,
  Input,
  Modal,
  PageToolbar,
  Select,
  Textarea,
} from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { buildPurchaseReturnPrintHtml } from "@/lib/print";
import type { Account, InventoryRow, PaymentMode, Purchase, PurchaseReturn, ReceiptSize, Vendor } from "@shared/ipc";

type DraftLine = {
  key: string;
  variantId: string;
  label: string;
  quantity: string;
  unitCost: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function PurchaseReturnsPage() {
  const [rows, setRows] = useState<PurchaseReturn[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [returnDate, setReturnDate] = useState(today());
  const [purchaseId, setPurchaseId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [refundMode, setRefundMode] = useState<PaymentMode>("cash");
  const [accountId, setAccountId] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickVariantId, setPickVariantId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const api = getApi();
    const [r, p, v, inv, a] = await Promise.all([
      api.listPurchaseReturns(),
      api.listPurchases(),
      api.listVendors(),
      api.listInventory(),
      api.listAccounts({ cashBankOnly: true }),
    ]);
    if (!r.ok) setError(r.error);
    else setRows(r.data);
    if (p.ok) setPurchases(p.data);
    if (v.ok) setVendors(v.data.filter((x) => x.isActive));
    if (inv.ok) setInventory(inv.data.filter((x) => x.isActive));
    if (a.ok) {
      setAccounts(a.data);
      if (a.data[0]) setAccountId(a.data[0].id);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.returnNo.toLowerCase().includes(q) || (r.vendorName ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitCost || 0), 0),
    [lines]
  );
  const grand = useMemo(
    () => Math.round((subtotal + Number(taxAmount || 0)) * 100) / 100,
    [subtotal, taxAmount]
  );

  const onPurchaseLink = async (id: string) => {
    setPurchaseId(id);
    if (!id) return;
    const res = await getApi().getPurchase(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setVendorId(res.data.vendorId ?? "");
    setLines(
      (res.data.items ?? []).map((it) => ({
        key: it.id,
        variantId: it.variantId,
        label: `${it.productName} (${it.size}/${it.color})`,
        quantity: String(it.quantity),
        unitCost: String(it.unitCost),
      }))
    );
  };

  const addLine = () => {
    const row = inventory.find((r) => r.variantId === pickVariantId);
    if (!row) return;
    setLines((prev) => [
      ...prev,
      {
        key: `${pickVariantId}-${Date.now()}`,
        variantId: row.variantId,
        label: `${row.productName} (${row.size}/${row.color})`,
        quantity: "1",
        unitCost: String(row.costPrice),
      },
    ]);
    setPickVariantId("");
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    const res = await getApi().createPurchaseReturn({
      returnDate,
      vendorId,
      purchaseId: purchaseId || null,
      refundMode,
      accountId: refundMode === "credit" ? null : accountId || null,
      taxAmount: Number(taxAmount || 0),
      notes: notes || null,
      items: lines.map((l) => ({
        variantId: l.variantId,
        quantity: Number(l.quantity),
        unitCost: Number(l.unitCost),
      })),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    await load();
  };

  const printReturn = async (row: PurchaseReturn, size: ReceiptSize = "a4") => {
    let toPrint = row;
    if (!row.items?.length) {
      const res = await getApi().getPurchaseReturn(row.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toPrint = res.data;
    }
    const html = buildPurchaseReturnPrintHtml(toPrint, size);
    const res = await getApi().printHtml(html);
    if (!res.ok) setError(res.error);
  };

  return (
    <AppShell
      title="Purchase Return"
      subtitle="Return to vendor, stock out, reverse payable"
      permission="purchases.return"
    >
      {error && !open ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <PageToolbar
        search={search}
        onSearch={setSearch}
        onAdd={() => {
          setError("");
          setReturnDate(today());
          setPurchaseId("");
          setVendorId(vendors[0]?.id ?? "");
          setRefundMode("cash");
          setTaxAmount("0");
          setNotes("");
          setLines([]);
          setOpen(true);
        }}
        addLabel="New return"
        actions={
          <ExportMenu
            filename="purchase-returns"
            title="Purchase returns"
            columns={[
              { key: "returnNo", label: "Return #" },
              { key: "returnDate", label: "Date" },
              { key: "vendorName", label: "Vendor" },
              { key: "grandTotal", label: "Total" },
              { key: "notes", label: "Notes" },
            ]}
            rows={filtered.map((r) => ({
              returnNo: r.returnNo,
              returnDate: r.returnDate,
              vendorName: r.vendorName ?? "",
              grandTotal: r.grandTotal,
              notes: r.notes ?? "",
            }))}
          />
        }
      />
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      ) : (
        <DataTable headers={["Return #", "Date", "Vendor", "Total", "Notes", "Actions"]} empty={filtered.length === 0}>
          {filtered.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-mono text-xs font-medium">{row.returnNo}</td>
              <td className="px-4 py-3">{row.returnDate}</td>
              <td className="px-4 py-3">{row.vendorName || "—"}</td>
              <td className="px-4 py-3">{row.grandTotal.toLocaleString()}</td>
              <td className="px-4 py-3 text-[var(--text-muted)]">{row.notes || "—"}</td>
              <td className="px-4 py-3">
                <PrintMenu defaultSize="a4" onPrint={(size) => printReturn(row, size)} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={open}
        title="New purchase return"
        onClose={() => setOpen(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onSave()} disabled={saving || !vendorId || lines.length === 0}>
              {saving ? "Saving..." : "Save return"}
            </Button>
          </>
        }
      >
        {error ? <Alert>{error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Return date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          <Select
            label="Link purchase (optional)"
            value={purchaseId}
            onChange={(e) => void onPurchaseLink(e.target.value)}
            options={[
              { value: "", label: "— None —" },
              ...purchases.map((p) => ({
                value: p.id,
                label: `${p.invoiceNo} · ${p.vendorName || "—"}`,
              })),
            ]}
          />
          <Select
            label="Vendor"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            options={[
              { value: "", label: "— Select —" },
              ...vendors.map((v) => ({ value: v.id, label: `${v.code} — ${v.name}` })),
            ]}
          />
          <Select
            label="Refund mode"
            value={refundMode}
            onChange={(e) => setRefundMode(e.target.value as PaymentMode)}
            options={[
              { value: "cash", label: "Cash" },
              { value: "bank", label: "Bank" },
              { value: "credit", label: "Credit (AP)" },
            ]}
          />
          {refundMode !== "credit" ? (
            <Select
              label="Refund account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              options={accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
            />
          ) : null}
          <Input label="Tax" type="number" min={0} step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-3">
          <div className="mb-2 flex gap-2">
            <div className="flex-1">
              <Select
                label="Add pack"
                value={pickVariantId}
                onChange={(e) => setPickVariantId(e.target.value)}
                options={[
                  { value: "", label: "— Select —" },
                  ...inventory.map((r) => ({
                    value: r.variantId,
                    label: `${r.productName} · ${r.size}/${r.color}`,
                  })),
                ]}
              />
            </div>
            <Button size="sm" className="self-end" onClick={addLine} disabled={!pickVariantId}>
              <Plus size={14} /> Add
            </Button>
          </div>
          {lines.map((line) => (
            <div
              key={line.key}
              className="mb-2 grid grid-cols-[1fr_90px_110px_36px] items-end gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-2"
            >
              <div className="text-sm font-medium">{line.label}</div>
              <Input
                label="Qty"
                type="number"
                value={line.quantity}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value } : l))
                  )
                }
              />
              <Input
                label="Cost"
                type="number"
                value={line.unitCost}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l) => (l.key === line.key ? { ...l, unitCost: e.target.value } : l))
                  )
                }
              />
              <Button variant="ghost" size="sm" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-sm font-semibold">
          <span>Subtotal {subtotal.toFixed(2)}</span>
          <span>Grand {grand.toFixed(2)}</span>
        </div>
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Modal>
    </AppShell>
  );
}
