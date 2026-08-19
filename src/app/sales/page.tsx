"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CreditCard,
  Eye,
  Pencil,
  Plus,
  Receipt,
  ShoppingCart,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { PrintMenu } from "@/components/PrintMenu";
import {
  ComposerSection,
  DocMetaGrid,
  DocStatusBadge,
  FilterChips,
  LineItemsTable,
  OpsEmptyState,
  OpsListSkeleton,
  OpsStatStrip,
  PaymentModeBadge,
  PaymentModePicker,
  TotalsPanel,
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
  Textarea,
} from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { buildSalePrintHtml } from "@/lib/print";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type {
  Account,
  Customer,
  InventoryRow,
  PaymentMode,
  ReceiptSize,
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

type ModeFilter = "all" | "cash" | "bank" | "credit" | "today";

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
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composer, setComposer] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status !== "deleted");
    const t = today();
    const todayRows = active.filter((r) => r.invoiceDate === t);
    const netOf = (r: (typeof active)[0]) => r.netTotal ?? r.grandTotal;
    const todayTotal = todayRows.reduce((s, r) => s + netOf(r), 0);
    const creditDue = active.reduce((s, r) => s + Math.max(0, netOf(r) - r.paidAmount), 0);
    const avg = active.length ? active.reduce((s, r) => s + netOf(r), 0) / active.length : 0;
    return {
      count: active.length,
      todayCount: todayRows.length,
      todayTotal,
      creditDue,
      avg,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const t = today();
    return rows.filter((r) => {
      if (modeFilter === "today" && r.invoiceDate !== t) return false;
      if (modeFilter === "cash" || modeFilter === "bank" || modeFilter === "credit") {
        if (r.paymentMode !== modeFilter) return false;
      }
      if (!q) return true;
      return (
        r.invoiceNo.toLowerCase().includes(q) ||
        (r.customerName ?? "").toLowerCase().includes(q) ||
        r.paymentMode.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    });
  }, [rows, search, modeFilter]);

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
    () =>
      Math.round(
        (subtotal - Number(discountAmount || 0) + Number(additionAmount || 0) + Number(taxAmount || 0)) *
          100
      ) / 100,
    [subtotal, discountAmount, additionAmount, taxAmount]
  );
  const effectivePaid =
    paidAmount === "" ? (paymentMode === "credit" ? 0 : grand) : Number(paidAmount || 0);
  const balanceDue = Math.max(0, Math.round((grand - effectivePaid) * 100) / 100);

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
    setEditingId(null);
    setComposer(true);
  };

  const openEdit = async (row: Sale) => {
    const res = await getApi().getSale(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const sale = res.data;
    setEditingId(sale.id);
    setInvoiceDate(sale.invoiceDate);
    setCustomerId(sale.customerId || "");
    setPaymentMode(sale.paymentMode);
    setDiscountAmount(String(sale.discountAmount));
    setAdditionAmount(String(sale.additionAmount));
    setTaxAmount(String(sale.taxAmount));
    setPaidAmount(String(sale.paidAmount));
    setNotes(sale.notes || "");
    setPickVariantId("");
    setError("");
    setLines(
      (sale.items ?? []).map((it) => {
        const inv = inventory.find((r) => r.variantId === it.variantId);
        return {
          key: `${it.variantId}-${it.id}`,
          variantId: it.variantId,
          label: `${it.productName} (${it.size}/${it.color})`,
          stockQty: (inv?.stockQty ?? 0) + it.quantity,
          quantity: String(it.quantity),
          unitPrice: String(it.unitPrice),
        };
      })
    );
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

  const printSale = async (sale: Sale, size: ReceiptSize = "thermal") => {
    let toPrint = sale;
    if (!sale.items) {
      const res = await getApi().getSale(sale.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toPrint = res.data;
    }
    const html = buildSalePrintHtml(toPrint, size);
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
        paidAmount === "" ? (paymentMode === "credit" ? 0 : grand) : Number(paidAmount),
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
    const res = editingId
      ? await getApi().updateSale(editingId, payload)
      : await getApi().createSale(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setComposer(false);
    setEditingId(null);
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

  const filterCounts = useMemo(() => {
    const t = today();
    return {
      all: rows.length,
      today: rows.filter((r) => r.invoiceDate === t).length,
      cash: rows.filter((r) => r.paymentMode === "cash").length,
      bank: rows.filter((r) => r.paymentMode === "bank").length,
      credit: rows.filter((r) => r.paymentMode === "credit").length,
    };
  }, [rows]);

  return (
    <AppShell title="Sale" subtitle="Invoice desk — stock out, ledger, and print" permission="sales.view">
      {error && !composer ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <OpsStatStrip
        items={[
          {
            label: "Today's sales",
            value: money(stats.todayTotal),
            hint: `${stats.todayCount} invoice${stats.todayCount === 1 ? "" : "s"} today`,
            tone: "accent",
            icon: ShoppingCart,
          },
          {
            label: "Invoices",
            value: String(stats.count),
            hint: "All posted sales",
            icon: Receipt,
          },
          {
            label: "Credit outstanding",
            value: money(stats.creditDue),
            hint: "Unpaid balance across sales",
            tone: stats.creditDue > 0 ? "warn" : "success",
            icon: CreditCard,
          },
          {
            label: "Avg ticket",
            value: money(stats.avg),
            hint: "Mean invoice value",
            icon: TrendingUp,
          },
        ]}
      />

      <PageToolbar
        search={search}
        onSearch={setSearch}
        onAdd={canCreate ? openComposer : undefined}
        addLabel="New sale"
        actions={
          <ExportMenu
            filename="sales"
            title="Sales list"
            columns={[
              { key: "invoiceNo", label: "Invoice" },
              { key: "invoiceDate", label: "Date" },
              { key: "customerName", label: "Customer" },
              { key: "paymentMode", label: "Mode" },
              { key: "grandTotal", label: "Total" },
              { key: "paidAmount", label: "Paid" },
              { key: "status", label: "Status" },
            ]}
            rows={filtered.map((r) => ({
              invoiceNo: r.invoiceNo,
              invoiceDate: r.invoiceDate,
              customerName: r.customerName || "Walk-in",
              paymentMode: r.paymentMode,
              grandTotal: r.netTotal ?? r.grandTotal,
              paidAmount: r.paidAmount,
              status: r.status,
            }))}
          />
        }
      />

      <div className="mb-4">
        <FilterChips
          value={modeFilter}
          onChange={(v) => setModeFilter(v as ModeFilter)}
          options={[
            { value: "all", label: "All", count: filterCounts.all },
            { value: "today", label: "Today", count: filterCounts.today },
            { value: "cash", label: "Cash", count: filterCounts.cash },
            { value: "bank", label: "Bank", count: filterCounts.bank },
            { value: "credit", label: "Credit", count: filterCounts.credit },
          ]}
        />
      </div>

      {loading ? (
        <OpsListSkeleton />
      ) : filtered.length === 0 ? (
        <OpsEmptyState
          title={search || modeFilter !== "all" ? "No matching sales" : "No sales yet"}
          hint={
            search || modeFilter !== "all"
              ? "Try clearing filters or search to see the full register."
              : "Create your first invoice — add packs, set payment, and post to stock & ledger."
          }
          action={
            canCreate && !search && modeFilter === "all" ? (
              <Button onClick={openComposer}>
                <Plus size={14} /> New sale
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
          <DataTable
            headers={["Invoice", "Customer", "Mode", "Total", "Paid / Due", "Status", ""]}
            empty={false}
          >
            {filtered.map((row) => {
              const net = row.netTotal ?? row.grandTotal;
              const due = Math.max(0, net - row.paidAmount);
              return (
                <tr
                  key={row.id}
                  className="group border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--bg-soft)]/60"
                >
                  <td className="px-4 py-3.5">
                    <div className="font-mono text-xs font-semibold tracking-wide">{row.invoiceNo}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{row.invoiceDate}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium">{row.customerName || "Walk-in"}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {row.customerName ? "Account customer" : "Counter sale"}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <PaymentModeBadge mode={row.paymentMode} />
                  </td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums">
                    {money(net)}
                    {(row.returnedTotal ?? 0) > 0 ? (
                      <div className="mt-0.5 text-[11px] font-normal text-[var(--text-muted)]">
                        Returned {money(row.returnedTotal ?? 0)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="tabular-nums text-sm">{money(row.paidAmount)}</div>
                    <div
                      className={`text-[11px] ${due > 0 ? "text-amber-600 dark:text-amber-300" : "text-[var(--success)]"}`}
                    >
                      {due > 0 ? `Due ${money(due)}` : "Settled"}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <DocStatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex justify-end gap-0.5 opacity-80 transition group-hover:opacity-100">
                      <Button variant="ghost" size="sm" onClick={() => void openView(row)} title="View">
                        <Eye size={14} />
                      </Button>
                      {canCreate && row.status !== "returned" ? (
                        <Button variant="ghost" size="sm" onClick={() => void openEdit(row)} title="Edit">
                          <Pencil size={14} />
                        </Button>
                      ) : null}
                      <PrintMenu onPrint={(size) => printSale(row, size)} />
                      {canCreate ? (
                        <Button variant="ghost" size="sm" onClick={() => void onDelete(row)} title="Delete">
                          <Trash2 size={14} />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      )}

      <Modal
        open={composer}
        size="full"
        title={editingId ? "Edit sale" : "New sale"}
        onClose={() => {
          setComposer(false);
          setEditingId(null);
        }}
        footer={
          <>
            <div className="mr-auto hidden items-center gap-2 text-xs text-[var(--text-muted)] sm:flex">
              <Banknote size={14} />
              {lines.length} item{lines.length === 1 ? "" : "s"} · {money(grand)}
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setComposer(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
            {!editingId ? (
              <Button
                variant="secondary"
                onClick={() => void onSave(true)}
                disabled={saving || lines.length === 0}
              >
                {saving ? "Saving..." : "Save & print"}
              </Button>
            ) : null}
            <Button onClick={() => void onSave(false)} disabled={saving || lines.length === 0}>
              {saving ? "Saving..." : editingId ? "Update" : "Save"}
            </Button>
          </>
        }
      >
        {error ? <Alert>{error}</Alert> : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <ComposerSection title="Invoice">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Date"
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
                    ...customers.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>
            </ComposerSection>

            <ComposerSection title="Payment">
              <PaymentModePicker value={paymentMode} onChange={setPaymentMode} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {paymentMode !== "credit" ? (
                  <Select
                    label="Account"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                  />
                ) : (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)]/50 px-3 py-2 text-xs text-[var(--text-muted)]">
                    Credit — customer will owe the balance
                  </div>
                )}
                <Input
                  label="Paid now"
                  type="number"
                  min={0}
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
              </div>
            </ComposerSection>

            <ComposerSection
              title="Products"
              action={
                <span className="rounded-lg bg-[var(--bg-soft)] px-2 py-1 text-[11px] tabular-nums text-[var(--text-muted)]">
                  {lines.length} item{lines.length === 1 ? "" : "s"}
                </span>
              }
            >
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
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

              <LineItemsTable
                headers={["Product", "Stock", "Qty", "Price", "Total", ""]}
                empty={lines.length === 0}
              >
                {lines.map((line) => {
                  const lineTotal = Number(line.quantity || 0) * Number(line.unitPrice || 0);
                  const overStock = Number(line.quantity || 0) > line.stockQty;
                  return (
                    <tr key={line.key} className="align-middle">
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{line.label}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-xs tabular-nums ${overStock ? "font-semibold text-[var(--danger)]" : "text-[var(--text-muted)]"}`}
                        >
                          {line.stockQty}
                        </span>
                      </td>
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
                        <Button variant="ghost" size="sm" onClick={() => removeLine(line.key)}>
                          <X size={14} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </LineItemsTable>
            </ComposerSection>

            <ComposerSection title="Discount, tax & notes">
              <div className="grid gap-3 sm:grid-cols-3">
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
              </div>
              <div className="mt-3">
                <Textarea
                  label="Notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </ComposerSection>
          </div>

          <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
            <TotalsPanel
              accent
              rows={[
                { label: "Subtotal", value: money(subtotal), muted: true },
                {
                  label: "Discount",
                  value: `- ${money(Number(discountAmount || 0))}`,
                  muted: true,
                  negative: Number(discountAmount || 0) > 0,
                },
                { label: "Additions", value: money(Number(additionAmount || 0)), muted: true },
                { label: "Tax", value: money(Number(taxAmount || 0)), muted: true },
                { label: "Paid now", value: money(effectivePaid), muted: true },
              ]}
              grand={money(grand)}
              due={money(balanceDue)}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={viewOpen}
        size="xl"
        title={viewing ? `Sale ${viewing.invoiceNo}` : "Sale"}
        subtitle="Posted invoice detail"
        onClose={() => setViewOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setViewOpen(false)}>
              Close
            </Button>
            {viewing && canCreate && viewing.status !== "returned" ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setViewOpen(false);
                  void openEdit(viewing);
                }}
              >
                Edit
              </Button>
            ) : null}
            {viewing ? (
              <PrintMenu
                variant="primary"
                size="md"
                label="Print"
                onPrint={(size) => printSale(viewing, size)}
              />
            ) : null}
          </>
        }
      >
        {viewing ? (
          <div className="space-y-4">
            <DocMetaGrid
              items={[
                { label: "Date", value: viewing.invoiceDate },
                { label: "Customer", value: viewing.customerName || "Walk-in" },
                { label: "Payment", value: <PaymentModeBadge mode={viewing.paymentMode} /> },
                { label: "Status", value: <DocStatusBadge status={viewing.status} /> },
              ]}
            />
            <LineItemsTable
              headers={["Product", "Pack", "Qty", "Price", "Total"]}
              empty={!viewing.items?.length}
              emptyTitle="No items on this sale"
              emptyHint=""
            >
              {(viewing.items ?? []).map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2.5 font-medium">{it.productName}</td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)]">
                    {it.size} / {it.color}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{it.quantity}</td>
                  <td className="px-3 py-2.5 tabular-nums">{money(it.unitPrice)}</td>
                  <td className="px-3 py-2.5 font-medium tabular-nums">{money(it.lineTotal)}</td>
                </tr>
              ))}
            </LineItemsTable>
            <TotalsPanel
              rows={[
                { label: "Subtotal", value: money(viewing.subtotal), muted: true },
                { label: "Discount", value: money(viewing.discountAmount), muted: true },
                { label: "Additions", value: money(viewing.additionAmount), muted: true },
                { label: "Tax", value: money(viewing.taxAmount), muted: true },
                { label: "Paid", value: money(viewing.paidAmount), muted: true },
                ...(viewing.returnedTotal
                  ? [{ label: "Returned", value: money(viewing.returnedTotal), muted: true }]
                  : []),
              ]}
              grand={money(viewing.netTotal ?? viewing.grandTotal)}
              due={money(Math.max(0, (viewing.netTotal ?? viewing.grandTotal) - viewing.paidAmount))}
            />
            {viewing.notes ? (
              <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm text-[var(--text-muted)]">
                {viewing.notes}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}
