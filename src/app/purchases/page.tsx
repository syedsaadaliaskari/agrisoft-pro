"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Plus, Trash2, X } from "lucide-react";
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
import { buildPurchasePrintHtml } from "@/lib/print";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type { Account, InventoryRow, PaymentMode, Purchase, ReceiptSize, Vendor } from "@shared/ipc";

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

export default function PurchasesPage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, "purchases.create");
  const [rows, setRows] = useState<Purchase[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composer, setComposer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [vendorId, setVendorId] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("credit");
  const [accountId, setAccountId] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [additionAmount, setAdditionAmount] = useState("0");
  const [taxAmount, setTaxAmount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickVariantId, setPickVariantId] = useState("");
  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<Purchase | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const api = getApi();
    const [p, v, inv, acct] = await Promise.all([
      api.listPurchases(),
      api.listVendors(),
      api.listInventory(),
      api.listAccounts({ cashBankOnly: true }),
    ]);
    if (!p.ok) setError(p.error);
    else setRows(p.data);
    if (v.ok) setVendors(v.data.filter((x) => x.isActive));
    if (inv.ok) setInventory(inv.data.filter((x) => x.isActive));
    if (acct.ok) {
      setAccounts(acct.data);
      if (acct.data[0]) setAccountId(acct.data[0].id);
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
      (r) =>
        r.invoiceNo.toLowerCase().includes(q) ||
        (r.vendorName ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const productOptions = useMemo(
    () => [
      { value: "", label: "— Select pack —" },
      ...inventory.map((r) => ({
        value: r.variantId,
        label: `${r.productName} · ${r.size}/${r.color}`,
      })),
    ],
    [inventory]
  );

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitCost || 0), 0),
    [lines]
  );
  const grand = useMemo(
    () =>
      Math.round(
        (subtotal - Number(discountAmount || 0) + Number(additionAmount || 0) + Number(taxAmount || 0)) *
          100
      ) / 100,
    [subtotal, discountAmount, additionAmount, taxAmount]
  );

  const openComposer = () => {
    setInvoiceDate(today());
    setVendorId(vendors[0]?.id ?? "");
    setPaymentMode("credit");
    setDiscountAmount("0");
    setAdditionAmount("0");
    setTaxAmount("0");
    setPaidAmount("");
    setNotes("");
    setLines([]);
    setPickVariantId("");
    setError("");
    if (accounts[0]) setAccountId(accounts[0].id);
    setComposer(true);
  };

  const addLine = () => {
    const row = inventory.find((r) => r.variantId === pickVariantId);
    if (!row) return;
    if (lines.some((l) => l.variantId === pickVariantId)) {
      setError("Pack already added");
      return;
    }
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
    setError("");
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    const res = await getApi().createPurchase({
      invoiceDate,
      vendorId,
      paymentMode,
      accountId: paymentMode === "credit" && !paidAmount ? null : accountId || null,
      paidAmount:
        paidAmount === "" ? (paymentMode === "credit" ? 0 : grand) : Number(paidAmount),
      discountAmount: Number(discountAmount || 0),
      additionAmount: Number(additionAmount || 0),
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
    setComposer(false);
    await load();
  };

  const openView = async (row: Purchase) => {
    const res = await getApi().getPurchase(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setViewing(res.data);
    setViewOpen(true);
  };

  const onDelete = async (row: Purchase) => {
    if (!confirm(`Delete purchase ${row.invoiceNo}? Stock will be reversed.`)) return;
    const res = await getApi().deletePurchase(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  };

  const printPurchase = async (row: Purchase, size: ReceiptSize = "a4") => {
    let toPrint = row;
    if (!row.items) {
      const res = await getApi().getPurchase(row.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toPrint = res.data;
    }
    const html = buildPurchasePrintHtml(toPrint, size);
    const res = await getApi().printHtml(html);
    if (!res.ok) setError(res.error);
  };

  return (
    <AppShell title="Purchase" subtitle="Stock in and payables posting" permission="purchases.view">
      {error && !composer ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <PageToolbar
        search={search}
        onSearch={setSearch}
        onAdd={canCreate ? openComposer : undefined}
        addLabel="New purchase"
        actions={
          <ExportMenu
            filename="purchases"
            title="Purchases list"
            columns={[
              { key: "invoiceNo", label: "Invoice" },
              { key: "invoiceDate", label: "Date" },
              { key: "vendorName", label: "Vendor" },
              { key: "paymentMode", label: "Mode" },
              { key: "grandTotal", label: "Total" },
              { key: "paidAmount", label: "Paid" },
              { key: "status", label: "Status" },
            ]}
            rows={filtered.map((r) => ({
              invoiceNo: r.invoiceNo,
              invoiceDate: r.invoiceDate,
              vendorName: r.vendorName || "",
              paymentMode: r.paymentMode,
              grandTotal: r.grandTotal,
              paidAmount: r.paidAmount,
              status: r.status,
            }))}
          />
        }
      />
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      ) : (
        <DataTable
          headers={["Invoice", "Date", "Vendor", "Mode", "Total", "Paid", "Status", "Actions"]}
          empty={filtered.length === 0}
        >
          {filtered.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-mono text-xs font-medium">{row.invoiceNo}</td>
              <td className="px-4 py-3">{row.invoiceDate}</td>
              <td className="px-4 py-3">{row.vendorName || "-"}</td>
              <td className="px-4 py-3 capitalize text-[var(--text-muted)]">{row.paymentMode}</td>
              <td className="px-4 py-3">{row.grandTotal.toLocaleString()}</td>
              <td className="px-4 py-3">{row.paidAmount.toLocaleString()}</td>
              <td className="px-4 py-3 capitalize">{row.status}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => void openView(row)}>
                    <Eye size={14} />
                  </Button>
                  <PrintMenu defaultSize="a4" onPrint={(size) => printPurchase(row, size)} />
                  {canCreate ? (
                    <Button variant="ghost" size="sm" onClick={() => void onDelete(row)}>
                      <Trash2 size={14} />
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={composer}
        title="New purchase"
        onClose={() => setComposer(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setComposer(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onSave()} disabled={saving || lines.length === 0 || !vendorId}>
              {saving ? "Saving..." : "Save purchase"}
            </Button>
          </>
        }
      >
        {error ? <Alert>{error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Invoice date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
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
            label="Payment mode"
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
            options={[
              { value: "credit", label: "Credit" },
              { value: "cash", label: "Cash" },
              { value: "bank", label: "Bank" },
            ]}
          />
          <Select
            label="Cash / Bank account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
          />
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-3">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Select
                label="Add product pack"
                value={pickVariantId}
                onChange={(e) => setPickVariantId(e.target.value)}
                options={productOptions}
              />
            </div>
            <Button size="sm" onClick={addLine} disabled={!pickVariantId}>
              <Plus size={14} /> Add line
            </Button>
          </div>
          {lines.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No lines yet</p>
          ) : (
            <div className="space-y-2">
              {lines.map((line) => (
                <div
                  key={line.key}
                  className="grid grid-cols-[1fr_90px_110px_36px] items-end gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-2"
                >
                  <div className="text-sm font-medium">{line.label}</div>
                  <Input
                    label="Qty"
                    type="number"
                    min={0.01}
                    step="0.01"
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
                    min={0}
                    step="0.01"
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
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Input label="Discount" type="number" min={0} step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
          <Input label="Additions" type="number" min={0} step="0.01" value={additionAmount} onChange={(e) => setAdditionAmount(e.target.value)} />
          <Input label="Tax" type="number" min={0} step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
          <Input label="Paid amount" type="number" min={0} step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder={grand ? String(grand) : undefined} />
        </div>
        <div className="flex justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-4 py-3 text-sm">
          <span className="text-[var(--text-muted)]">Subtotal {subtotal.toFixed(2)}</span>
          <span className="font-semibold">Grand total {grand.toFixed(2)}</span>
        </div>
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Modal>

      <Modal
        open={viewOpen}
        title={viewing ? `Purchase ${viewing.invoiceNo}` : "Purchase"}
        onClose={() => setViewOpen(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setViewOpen(false)}>
              Close
            </Button>
            {viewing ? (
              <PrintMenu
                variant="primary"
                size="md"
                label="Print"
                defaultSize="a4"
                onPrint={(size) => printPurchase(viewing, size)}
              />
            ) : null}
          </>
        }
      >
        {viewing ? (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>Date: {viewing.invoiceDate}</div>
              <div>Vendor: {viewing.vendorName || "-"}</div>
              <div className="capitalize">Mode: {viewing.paymentMode}</div>
              <div>Status: {viewing.status}</div>
            </div>
            <DataTable headers={["Product", "Pack", "Qty", "Cost", "Total"]} empty={!viewing.items?.length}>
              {(viewing.items ?? []).map((it) => (
                <tr key={it.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3">{it.productName}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {it.size} / {it.color}
                  </td>
                  <td className="px-4 py-3">{it.quantity}</td>
                  <td className="px-4 py-3">{it.unitCost.toLocaleString()}</td>
                  <td className="px-4 py-3">{it.lineTotal.toLocaleString()}</td>
                </tr>
              ))}
            </DataTable>
            <div className="text-right text-sm font-semibold">
              Grand total {viewing.grandTotal.toLocaleString()} · Paid {viewing.paidAmount.toLocaleString()}
            </div>
          </>
        ) : null}
      </Modal>
    </AppShell>
  );
}
