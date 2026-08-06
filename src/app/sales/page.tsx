"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Plus, Printer, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
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
import { buildSaleReceiptHtml } from "@/lib/receipt";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type {
  Account,
  Customer,
  InventoryRow,
  PaymentMode,
  Sale,
} from "@shared/ipc";

type DraftLine = {
  key: string;
  variantId: string;
  label: string;
  stockQty: number;
  quantity: string;
  unitPrice: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function SalesPage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, "sales.create");

  const [rows, setRows] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composer, setComposer] = useState(false);
  const [saving, setSaving] = useState(false);

  const [invoiceDate, setInvoiceDate] = useState(today());
  const [customerId, setCustomerId] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [accountId, setAccountId] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [additionAmount, setAdditionAmount] = useState("0");
  const [taxAmount, setTaxAmount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickVariantId, setPickVariantId] = useState("");

  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<Sale | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const api = getApi();
    const [salesRes, custRes, invRes, acctRes] = await Promise.all([
      api.listSales(),
      api.listCustomers(),
      api.listInventory(),
      api.listAccounts({ cashBankOnly: true }),
    ]);
    if (!salesRes.ok) setError(salesRes.error);
    else setRows(salesRes.data);
    if (custRes.ok) setCustomers(custRes.data.filter((c) => c.isActive));
    if (invRes.ok) setInventory(invRes.data.filter((r) => r.isActive));
    if (acctRes.ok) {
      setAccounts(acctRes.data);
      if (!accountId && acctRes.data[0]) setAccountId(acctRes.data[0].id);
    }
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.invoiceNo.toLowerCase().includes(q) ||
        (r.customerName ?? "").toLowerCase().includes(q) ||
        r.paymentMode.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const productOptions = useMemo(
    () => [
      { value: "", label: "— Select pack —" },
      ...inventory.map((r) => ({
        value: r.variantId,
        label: `${r.productName} · ${r.size}/${r.color} (stock ${r.stockQty})`,
      })),
    ],
    [inventory]
  );

  const subtotal = useMemo(
    () =>
      lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0),
    [lines]
  );
  const grand = useMemo(
    () =>
      Math.round(
        (subtotal -
          Number(discountAmount || 0) +
          Number(additionAmount || 0) +
          Number(taxAmount || 0)) *
          100
      ) / 100,
    [subtotal, discountAmount, additionAmount, taxAmount]
  );

  const resetComposer = () => {
    setInvoiceDate(today());
    setCustomerId("");
    setPaymentMode("cash");
    setDiscountAmount("0");
    setAdditionAmount("0");
    setTaxAmount("0");
    setPaidAmount("");
    setNotes("");
    setLines([]);
    setPickVariantId("");
    setError("");
    if (accounts[0]) setAccountId(accounts[0].id);
  };

  const openComposer = () => {
    resetComposer();
    setComposer(true);
  };

  const addLine = () => {
    if (!pickVariantId) return;
    const row = inventory.find((r) => r.variantId === pickVariantId);
    if (!row) return;
    if (lines.some((l) => l.variantId === pickVariantId)) {
      setError("Pack already added — change quantity on the existing line");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: `${pickVariantId}-${Date.now()}`,
        variantId: row.variantId,
        label: `${row.productName} (${row.size}/${row.color})`,
        stockQty: row.stockQty,
        quantity: "1",
        unitPrice: String(row.salePrice),
      },
    ]);
    setPickVariantId("");
    setError("");
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const printSale = async (sale: Sale) => {
    let toPrint = sale;
    if (!sale.items) {
      const res = await getApi().getSale(sale.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toPrint = res.data;
    }
    const html = buildSaleReceiptHtml(toPrint);
    const res = await getApi().printHtml(html);
    if (!res.ok) setError(res.error);
  };

  const onSave = async (andPrint: boolean) => {
    setSaving(true);
    setError("");
    const payload = {
      invoiceDate,
      customerId: customerId || null,
      paymentMode,
      accountId: paymentMode === "credit" ? null : accountId || null,
      paidAmount:
        paidAmount === ""
          ? paymentMode === "credit"
            ? 0
            : grand
          : Number(paidAmount),
      discountAmount: Number(discountAmount || 0),
      additionAmount: Number(additionAmount || 0),
      taxAmount: Number(taxAmount || 0),
      notes: notes || null,
      items: lines.map((l) => ({
        variantId: l.variantId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
      })),
    };
    const res = await getApi().createSale(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setComposer(false);
    await load();
    if (andPrint) await printSale(res.data);
  };

  const openView = async (row: Sale) => {
    const res = await getApi().getSale(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setViewing(res.data);
    setViewOpen(true);
  };

  const onDelete = async (row: Sale) => {
    if (!confirm(`Delete sale ${row.invoiceNo}? Stock will be restored.`)) return;
    const res = await getApi().deleteSale(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  };

  return (
    <AppShell title="Sale" subtitle="POS sale entry, stock out, and print" permission="sales.view">
      {error && !composer ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <PageToolbar
        search={search}
        onSearch={setSearch}
        onAdd={canCreate ? openComposer : undefined}
        addLabel="New sale"
      />

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      ) : (
        <DataTable
          headers={["Invoice", "Date", "Customer", "Mode", "Total", "Paid", "Status", "Actions"]}
          empty={filtered.length === 0}
        >
          {filtered.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-mono text-xs font-medium">{row.invoiceNo}</td>
              <td className="px-4 py-3">{row.invoiceDate}</td>
              <td className="px-4 py-3">{row.customerName || "Walk-in"}</td>
              <td className="px-4 py-3 capitalize text-[var(--text-muted)]">{row.paymentMode}</td>
              <td className="px-4 py-3">{row.grandTotal.toLocaleString()}</td>
              <td className="px-4 py-3">{row.paidAmount.toLocaleString()}</td>
              <td className="px-4 py-3 capitalize">{row.status}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => void openView(row)} title="View">
                    <Eye size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void printSale(row)} title="Print">
                    <Printer size={14} />
                  </Button>
                  {canCreate ? (
                    <Button variant="ghost" size="sm" onClick={() => void onDelete(row)} title="Delete">
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
        title="New sale"
        onClose={() => setComposer(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setComposer(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => void onSave(true)} disabled={saving || lines.length === 0}>
              {saving ? "Saving..." : "Save & print"}
            </Button>
            <Button onClick={() => void onSave(false)} disabled={saving || lines.length === 0}>
              {saving ? "Saving..." : "Save sale"}
            </Button>
          </>
        }
      >
        {error ? <Alert>{error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Invoice date"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
          <Select
            label="Customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            options={[
              { value: "", label: "Walk-in" },
              ...customers.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
            ]}
          />
          <Select
            label="Payment mode"
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
            options={[
              { value: "cash", label: "Cash" },
              { value: "bank", label: "Bank" },
              { value: "credit", label: "Credit" },
            ]}
          />
          {paymentMode !== "credit" ? (
            <Select
              label="Cash / Bank account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              options={accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
            />
          ) : (
            <div />
          )}
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
                  <div>
                    <div className="text-sm font-medium">{line.label}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">Stock {line.stockQty}</div>
                  </div>
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
                    label="Price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key ? { ...l, unitPrice: e.target.value } : l
                        )
                      )
                    }
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeLine(line.key)}>
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Input
            label="Discount"
            type="number"
            min={0}
            step="0.01"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
          />
          <Input
            label="Additions"
            type="number"
            min={0}
            step="0.01"
            value={additionAmount}
            onChange={(e) => setAdditionAmount(e.target.value)}
          />
          <Input
            label="Tax"
            type="number"
            min={0}
            step="0.01"
            value={taxAmount}
            onChange={(e) => setTaxAmount(e.target.value)}
          />
          <Input
            label="Paid amount"
            type="number"
            min={0}
            step="0.01"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            placeholder={String(grand)}
          />
        </div>

        <div className="flex justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-4 py-3 text-sm">
          <span className="text-[var(--text-muted)]">Subtotal {subtotal.toFixed(2)}</span>
          <span className="font-semibold">Grand total {grand.toFixed(2)}</span>
        </div>

        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Modal>

      <Modal
        open={viewOpen}
        title={viewing ? `Sale ${viewing.invoiceNo}` : "Sale"}
        onClose={() => setViewOpen(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setViewOpen(false)}>
              Close
            </Button>
            {viewing ? (
              <Button onClick={() => void printSale(viewing)}>
                <Printer size={14} /> Print
              </Button>
            ) : null}
          </>
        }
      >
        {viewing ? (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>Date: {viewing.invoiceDate}</div>
              <div>Customer: {viewing.customerName || "Walk-in"}</div>
              <div className="capitalize">Mode: {viewing.paymentMode}</div>
              <div>Status: {viewing.status}</div>
            </div>
            <DataTable headers={["Product", "Pack", "Qty", "Price", "Total"]} empty={!viewing.items?.length}>
              {(viewing.items ?? []).map((it) => (
                <tr key={it.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3">{it.productName}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {it.size} / {it.color}
                  </td>
                  <td className="px-4 py-3">{it.quantity}</td>
                  <td className="px-4 py-3">{it.unitPrice.toLocaleString()}</td>
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
