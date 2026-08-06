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
import { buildSaleReturnPrintHtml } from "@/lib/print";
import type {
  Account,
  Customer,
  InventoryRow,
  PaymentMode,
  ReceiptSize,
  Sale,
  SaleReturn,
} from "@shared/ipc";

type DraftLine = {
  key: string;
  variantId: string;
  label: string;
  quantity: string;
  unitPrice: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function SaleReturnsPage() {
  const [rows, setRows] = useState<SaleReturn[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [returnDate, setReturnDate] = useState(today());
  const [saleId, setSaleId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [refundMode, setRefundMode] = useState<PaymentMode>("cash");
  const [accountId, setAccountId] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickVariantId, setPickVariantId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const api = getApi();
    const [retRes, salesRes, custRes, invRes, acctRes] = await Promise.all([
      api.listSaleReturns(),
      api.listSales(),
      api.listCustomers(),
      api.listInventory(),
      api.listAccounts({ cashBankOnly: true }),
    ]);
    if (!retRes.ok) setError(retRes.error);
    else setRows(retRes.data);
    if (salesRes.ok) setSales(salesRes.data.filter((s) => s.status !== "deleted"));
    if (custRes.ok) setCustomers(custRes.data.filter((c) => c.isActive));
    if (invRes.ok) setInventory(invRes.data.filter((r) => r.isActive));
    if (acctRes.ok) {
      setAccounts(acctRes.data);
      if (acctRes.data[0]) setAccountId(acctRes.data[0].id);
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
        r.returnNo.toLowerCase().includes(q) ||
        (r.customerName ?? "").toLowerCase().includes(q)
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
    () => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0),
    [lines]
  );
  const grand = useMemo(
    () => Math.round((subtotal + Number(taxAmount || 0)) * 100) / 100,
    [subtotal, taxAmount]
  );

  const openCreate = () => {
    setReturnDate(today());
    setSaleId("");
    setCustomerId("");
    setRefundMode("cash");
    setTaxAmount("0");
    setNotes("");
    setLines([]);
    setPickVariantId("");
    setError("");
    if (accounts[0]) setAccountId(accounts[0].id);
    setOpen(true);
  };

  const onSaleLink = async (id: string) => {
    setSaleId(id);
    if (!id) return;
    const res = await getApi().getSale(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCustomerId(res.data.customerId ?? "");
    setLines(
      (res.data.items ?? []).map((it) => ({
        key: it.id,
        variantId: it.variantId,
        label: `${it.productName} (${it.size}/${it.color})`,
        quantity: String(it.quantity),
        unitPrice: String(it.unitPrice),
      }))
    );
  };

  const addLine = () => {
    if (!pickVariantId) return;
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
        unitPrice: String(row.salePrice),
      },
    ]);
    setPickVariantId("");
    setError("");
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    const res = await getApi().createSaleReturn({
      returnDate,
      saleId: saleId || null,
      customerId: customerId || null,
      refundMode,
      accountId: refundMode === "credit" ? null : accountId || null,
      taxAmount: Number(taxAmount || 0),
      notes: notes || null,
      items: lines.map((l) => ({
        variantId: l.variantId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
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

  const printReturn = async (row: SaleReturn, size: ReceiptSize = "thermal") => {
    let toPrint = row;
    if (!row.items?.length) {
      const res = await getApi().getSaleReturn(row.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toPrint = res.data;
    }
    const html = buildSaleReturnPrintHtml(toPrint, size);
    const res = await getApi().printHtml(html);
    if (!res.ok) setError(res.error);
  };

  return (
    <AppShell
      title="Sale Return"
      subtitle="Return goods, restore stock, reverse ledger"
      permission="sales.return"
    >
      {error && !open ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <PageToolbar
        search={search}
        onSearch={setSearch}
        onAdd={openCreate}
        addLabel="New return"
        actions={
          <ExportMenu
            filename="sale-returns"
            title="Sale returns"
            columns={[
              { key: "returnNo", label: "Return #" },
              { key: "returnDate", label: "Date" },
              { key: "customerName", label: "Customer" },
              { key: "grandTotal", label: "Total" },
              { key: "notes", label: "Notes" },
            ]}
            rows={filtered.map((r) => ({
              returnNo: r.returnNo,
              returnDate: r.returnDate,
              customerName: r.customerName ?? "",
              grandTotal: r.grandTotal,
              notes: r.notes ?? "",
            }))}
          />
        }
      />

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      ) : (
        <DataTable
          headers={["Return #", "Date", "Customer", "Total", "Notes", "Actions"]}
          empty={filtered.length === 0}
        >
          {filtered.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-mono text-xs font-medium">{row.returnNo}</td>
              <td className="px-4 py-3">{row.returnDate}</td>
              <td className="px-4 py-3">{row.customerName || "—"}</td>
              <td className="px-4 py-3">{row.grandTotal.toLocaleString()}</td>
              <td className="px-4 py-3 text-[var(--text-muted)]">{row.notes || "—"}</td>
              <td className="px-4 py-3">
                <PrintMenu onPrint={(size) => printReturn(row, size)} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={open}
        title="New sale return"
        onClose={() => setOpen(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onSave()} disabled={saving || lines.length === 0}>
              {saving ? "Saving..." : "Save return"}
            </Button>
          </>
        }
      >
        {error ? <Alert>{error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Return date"
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
          />
          <Select
            label="Link original sale (optional)"
            value={saleId}
            onChange={(e) => void onSaleLink(e.target.value)}
            options={[
              { value: "", label: "— None —" },
              ...sales.map((s) => ({
                value: s.id,
                label: `${s.invoiceNo} · ${s.customerName || "Walk-in"} · ${s.grandTotal}`,
              })),
            ]}
          />
          <Select
            label="Customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            options={[
              { value: "", label: "— None —" },
              ...customers.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
            ]}
          />
          <Select
            label="Refund mode"
            value={refundMode}
            onChange={(e) => setRefundMode(e.target.value as PaymentMode)}
            options={[
              { value: "cash", label: "Cash" },
              { value: "bank", label: "Bank" },
              { value: "credit", label: "Credit (AR)" },
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
          <Input
            label="Tax"
            type="number"
            min={0}
            step="0.01"
            value={taxAmount}
            onChange={(e) => setTaxAmount(e.target.value)}
          />
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-3">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Select
                label="Add pack"
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                  >
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-4 py-3 text-sm">
          <span className="text-[var(--text-muted)]">Subtotal {subtotal.toFixed(2)}</span>
          <span className="font-semibold">Grand total {grand.toFixed(2)}</span>
        </div>
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Modal>
    </AppShell>
  );
}
