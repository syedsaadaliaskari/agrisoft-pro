"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, Undo2, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { PrintMenu } from "@/components/PrintMenu";
import {
  ComposerShell,
  FilterChips,
  LineItemsTable,
  OpsEmptyState,
  OpsListSkeleton,
  OpsStatStrip,
  PaymentModePicker,
  money,
} from "@/components/ops/DocumentWorkspace";
import {
  Alert,
  Button,
  DataTable,
  Input,
  Modal,
  PageToolbar,
  Select,
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
  const [filter, setFilter] = useState<"all" | "today" | "linked">("all");
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

  const stats = useMemo(() => {
    const t = today();
    const todayRows = rows.filter((r) => r.returnDate === t);
    return {
      count: rows.length,
      todayCount: todayRows.length,
      todayTotal: todayRows.reduce((s, r) => s + r.grandTotal, 0),
      total: rows.reduce((s, r) => s + r.grandTotal, 0),
      linked: rows.filter((r) => r.saleId).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const t = today();
    return rows.filter((r) => {
      if (filter === "today" && r.returnDate !== t) return false;
      if (filter === "linked" && !r.saleId) return false;
      if (!q) return true;
      return (
        r.returnNo.toLowerCase().includes(q) ||
        (r.customerName ?? "").toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  const productOptions = useMemo(
    () => [
      { value: "", label: "Select product" },
      ...inventory.map((r) => ({
        value: r.variantId,
        label: `${r.productName} (${r.size}/${r.color})`,
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
    const html = buildSaleReturnPrintHtml(
      {
        ...toPrint,
        items: (toPrint.items ?? []).map((it) => ({
          ...it,
          unit: it.unit ?? inventory.find((row) => row.variantId === it.variantId)?.unit ?? null,
        })),
      },
      size
    );
    const res = await getApi().printHtml(html);
    if (!res.ok) setError(res.error);
  };

  return (
    <AppShell
      title="Sale Return"
      subtitle="Returns desk — restore stock and reverse settlement"
      permission="sales.return"
    >
      {error && !open ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <OpsStatStrip
        items={[
          {
            label: "Today's returns",
            value: money(stats.todayTotal),
            hint: `${stats.todayCount} document${stats.todayCount === 1 ? "" : "s"}`,
            tone: "accent",
            icon: Undo2,
          },
          {
            label: "All returns",
            value: String(stats.count),
            hint: money(stats.total) + " lifetime",
            icon: RotateCcw,
          },
          {
            label: "Linked to sale",
            value: String(stats.linked),
            hint: "Pulled from original invoice",
          },
          {
            label: "Avg return",
            value: money(stats.count ? stats.total / stats.count : 0),
            hint: "Mean credit note",
          },
        ]}
      />

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

      <div className="mb-4">
        <FilterChips
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          options={[
            { value: "all", label: "All", count: rows.length },
            { value: "today", label: "Today", count: stats.todayCount },
            { value: "linked", label: "Linked", count: stats.linked },
          ]}
        />
      </div>

      {loading ? (
        <OpsListSkeleton />
      ) : filtered.length === 0 ? (
        <OpsEmptyState
          title={search || filter !== "all" ? "No matching returns" : "No sale returns yet"}
          action={
            !search && filter === "all" ? (
              <Button onClick={openCreate}>
                <Plus size={14} /> New return
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable headers={["Return #", "Customer", "Total", "Notes", ""]} empty={false}>
          {filtered.map((row) => (
            <tr
              key={row.id}
              className="group border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--bg-soft)]/60"
            >
              <td className="px-4 py-3.5">
                <div className="font-mono text-xs font-semibold">{row.returnNo}</div>
                <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{row.returnDate}</div>
              </td>
              <td className="px-4 py-3.5">
                <div className="font-medium">{row.customerName || "—"}</div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {row.saleId ? "Linked to sale" : "Standalone return"}
                </div>
              </td>
              <td className="px-4 py-3.5 font-semibold tabular-nums">{money(row.grandTotal)}</td>
              <td className="px-4 py-3.5 max-w-[220px] truncate text-[var(--text-muted)]">
                {row.notes || "—"}
              </td>
              <td className="px-4 py-3.5">
                <div className="flex justify-end">
                  <PrintMenu onPrint={(size) => printReturn(row, size)} />
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={open}
        size="full"
        title="New sale return"
        subtitle="Restore stock and issue refund / credit"
        onClose={() => setOpen(false)}
        footer={
          <>
            <div className="mr-auto hidden text-xs text-[var(--text-muted)] sm:block">
              {lines.length} line{lines.length === 1 ? "" : "s"} · {money(grand)}
            </div>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onSave()} disabled={saving || lines.length === 0}>
              {saving ? "Saving..." : "Post return"}
            </Button>
          </>
        }
      >
        {error ? <Alert>{error}</Alert> : null}
        <ComposerShell
          header={
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Input
                  label="Date"
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
                <Select
                  label="Original sale"
                  value={saleId}
                  onChange={(e) => void onSaleLink(e.target.value)}
                  options={[
                    { value: "", label: "None" },
                    ...sales.map((s) => ({
                      value: s.id,
                      label: `${s.invoiceNo} · ${s.customerName || "Walk-in"}`,
                    })),
                  ]}
                />
                <Select
                  label="Customer"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  options={[
                    { value: "", label: "None" },
                    ...customers.map((c) => ({ value: c.id, label: c.name })),
                  ]}
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
                  label="Notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Select
                      label="Product"
                      value={pickVariantId}
                      onChange={(e) => setPickVariantId(e.target.value)}
                      options={productOptions}
                    />
                  </div>
                  <Button size="sm" onClick={addLine} disabled={!pickVariantId}>
                    <Plus size={14} /> Add
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm">
                  <span className="text-[var(--text-muted)]">Total</span>
                  <span className="font-semibold tabular-nums">{money(grand)}</span>
                </div>
              </div>
              {saleId ? (
                <Select
                  label="Refund account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  options={[
                    { value: "", label: "Original sale account" },
                    ...accounts.map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <PaymentModePicker value={refundMode} onChange={setRefundMode} />
                  {refundMode !== "credit" ? (
                    <Select
                      label="Account"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                    />
                  ) : null}
                </div>
              )}
            </div>
          }
        >
            <LineItemsTable
                headers={["Product", "Qty", "Price", "Total", ""]}
                empty={lines.length === 0}
              >
                {lines.map((line) => {
                  const lineTotal = Number(line.quantity || 0) * Number(line.unitPrice || 0);
                  return (
                    <tr key={line.key}>
                      <td className="px-3 py-2.5 font-medium">{line.label}</td>
                      <td className="px-3 py-2.5 w-[100px]">
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={line.quantity}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key ? { ...l, quantity: e.target.value } : l
                              )
                            )
                          }
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm outline-none ring-[var(--accent)] focus:ring-1"
                        />
                      </td>
                      <td className="px-3 py-2.5 w-[120px]">
                        <input
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
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm outline-none ring-[var(--accent)] focus:ring-1"
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium tabular-nums">{money(lineTotal)}</td>
                      <td className="px-3 py-2.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                        >
                          <X size={14} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </LineItemsTable>
        </ComposerShell>
      </Modal>
    </AppShell>
  );
}
