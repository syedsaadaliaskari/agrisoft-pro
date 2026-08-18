"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  PackagePlus,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
  Truck,
  Wallet,
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

type ModeFilter = "all" | "cash" | "bank" | "credit" | "today";

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
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composer, setComposer] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status !== "deleted");
    const t = today();
    const todayRows = active.filter((r) => r.invoiceDate === t);
    const payable = active.reduce((s, r) => s + Math.max(0, r.grandTotal - r.paidAmount), 0);
    const avg = active.length ? active.reduce((s, r) => s + r.grandTotal, 0) / active.length : 0;
    return {
      count: active.length,
      todayCount: todayRows.length,
      todayTotal: todayRows.reduce((s, r) => s + r.grandTotal, 0),
      payable,
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
        (r.vendorName ?? "").toLowerCase().includes(q) ||
        r.paymentMode.toLowerCase().includes(q)
      );
    });
  }, [rows, search, modeFilter]);

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
  const effectivePaid =
    paidAmount === "" ? (paymentMode === "credit" ? 0 : grand) : Number(paidAmount || 0);
  const balanceDue = Math.max(0, Math.round((grand - effectivePaid) * 100) / 100);

  const resetComposer = () => {
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
  };

  const openComposer = () => {
    resetComposer();
    setEditingId(null);
    setComposer(true);
  };

  const openEdit = async (row: Purchase) => {
    const res = await getApi().getPurchase(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const purchase = res.data;
    setEditingId(purchase.id);
    setInvoiceDate(purchase.invoiceDate);
    setVendorId(purchase.vendorId ?? "");
    setPaymentMode(purchase.paymentMode);
    setDiscountAmount(String(purchase.discountAmount));
    setAdditionAmount(String(purchase.additionAmount));
    setTaxAmount(String(purchase.taxAmount));
    setPaidAmount(String(purchase.paidAmount));
    setNotes(purchase.notes || "");
    setPickVariantId("");
    setError("");
    setLines(
      (purchase.items ?? []).map((it) => ({
        key: `${it.variantId}-${it.id}`,
        variantId: it.variantId,
        label: `${it.productName} (${it.size}/${it.color})`,
        quantity: String(it.quantity),
        unitCost: String(it.unitCost),
      }))
    );
    setComposer(true);
  };

  const addLine = () => {
    const row = inventory.find((r) => r.variantId === pickVariantId);
    if (!row) return;
    if (lines.some((l) => l.variantId === pickVariantId)) {
      setError("Pack already added — adjust quantity on the existing line");
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
    const payload = {
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
    };
    const res = editingId
      ? await getApi().updatePurchase(editingId, payload)
      : await getApi().createPurchase(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setComposer(false);
    setEditingId(null);
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
    <AppShell title="Purchase" subtitle="Receiving desk — stock in and payables" permission="purchases.view">
      {error && !composer ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <OpsStatStrip
        items={[
          {
            label: "Today's purchases",
            value: money(stats.todayTotal),
            hint: `${stats.todayCount} bill${stats.todayCount === 1 ? "" : "s"} today`,
            tone: "accent",
            icon: PackagePlus,
          },
          {
            label: "Purchase bills",
            value: String(stats.count),
            hint: "All posted purchases",
            icon: Receipt,
          },
          {
            label: "Payables open",
            value: money(stats.payable),
            hint: "Unpaid vendor balance",
            tone: stats.payable > 0 ? "warn" : "success",
            icon: Wallet,
          },
          {
            label: "Avg bill",
            value: money(stats.avg),
            hint: "Mean purchase value",
            icon: TrendingDown,
          },
        ]}
      />

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

      <div className="mb-4">
        <FilterChips
          value={modeFilter}
          onChange={(v) => setModeFilter(v as ModeFilter)}
          options={[
            { value: "all", label: "All", count: filterCounts.all },
            { value: "today", label: "Today", count: filterCounts.today },
            { value: "credit", label: "Credit", count: filterCounts.credit },
            { value: "cash", label: "Cash", count: filterCounts.cash },
            { value: "bank", label: "Bank", count: filterCounts.bank },
          ]}
        />
      </div>

      {loading ? (
        <OpsListSkeleton />
      ) : filtered.length === 0 ? (
        <OpsEmptyState
          title={search || modeFilter !== "all" ? "No matching purchases" : "No purchases yet"}
          hint={
            search || modeFilter !== "all"
              ? "Clear filters or search to see the full receiving register."
              : "Record a vendor bill — stock increases and payables post automatically."
          }
          action={
            canCreate && !search && modeFilter === "all" ? (
              <Button onClick={openComposer}>
                <Plus size={14} /> New purchase
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          headers={["Invoice", "Vendor", "Mode", "Total", "Paid / Due", "Status", ""]}
          empty={false}
        >
          {filtered.map((row) => {
            const due = Math.max(0, row.grandTotal - row.paidAmount);
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
                  <div className="flex items-center gap-2">
                    <span className="hidden rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-1.5 text-[var(--text-muted)] sm:inline-flex">
                      <Truck size={12} />
                    </span>
                    <div>
                      <div className="font-medium">{row.vendorName || "—"}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">Supplier bill</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <PaymentModeBadge mode={row.paymentMode} />
                </td>
                <td className="px-4 py-3.5 font-semibold tabular-nums">{money(row.grandTotal)}</td>
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
                    <PrintMenu defaultSize="a4" onPrint={(size) => printPurchase(row, size)} />
                    {canCreate ? (
                      <Button variant="ghost" size="sm" onClick={() => void onDelete(row)}>
                        <Trash2 size={14} />
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      <Modal
        open={composer}
        size="full"
        title={editingId ? "Edit purchase" : "New purchase"}
        onClose={() => {
          setComposer(false);
          setEditingId(null);
        }}
        footer={
          <>
            <div className="mr-auto hidden text-xs text-[var(--text-muted)] sm:block">
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
            <Button
              onClick={() => void onSave()}
              disabled={saving || lines.length === 0 || !vendorId}
            >
              {saving ? "Saving..." : editingId ? "Update" : "Save"}
            </Button>
          </>
        }
      >
        {error ? <Alert>{error}</Alert> : null}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <ComposerSection title="Bill">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Date"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
                <Select
                  label="Vendor"
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  options={[
                    { value: "", label: "Select vendor" },
                    ...vendors.map((v) => ({ value: v.id, label: v.name })),
                  ]}
                />
              </div>
            </ComposerSection>

            <ComposerSection title="Payment">
              <PaymentModePicker value={paymentMode} onChange={setPaymentMode} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Select
                  label="Account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                />
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
                <span className="rounded-lg bg-[var(--bg-soft)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
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
                headers={["Product", "Qty", "Unit cost", "Line total", ""]}
                empty={lines.length === 0}
                emptyHint="Select a pack to receive into stock."
              >
                {lines.map((line) => {
                  const lineTotal = Number(line.quantity || 0) * Number(line.unitCost || 0);
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
                          value={line.unitCost}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key ? { ...l, unitCost: e.target.value } : l
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
              dueLabel="Payable balance"
            />
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/50 p-4 text-xs leading-relaxed text-[var(--text-muted)]">
              Posting increases stock at cost, creates a purchase voucher, and updates vendor payables when
              unpaid.
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={viewOpen}
        size="xl"
        title={viewing ? `Purchase ${viewing.invoiceNo}` : "Purchase"}
        subtitle="Posted purchase bill"
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
                defaultSize="a4"
                onPrint={(size) => printPurchase(viewing, size)}
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
                { label: "Vendor", value: viewing.vendorName || "—" },
                { label: "Payment", value: <PaymentModeBadge mode={viewing.paymentMode} /> },
                { label: "Status", value: <DocStatusBadge status={viewing.status} /> },
              ]}
            />
            <LineItemsTable
              headers={["Product", "Pack", "Qty", "Cost", "Total"]}
              empty={!viewing.items?.length}
              emptyTitle="No items"
              emptyHint=""
            >
              {(viewing.items ?? []).map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2.5 font-medium">{it.productName}</td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)]">
                    {it.size} / {it.color}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{it.quantity}</td>
                  <td className="px-3 py-2.5 tabular-nums">{money(it.unitCost)}</td>
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
              ]}
              grand={money(viewing.grandTotal)}
              due={money(Math.max(0, viewing.grandTotal - viewing.paidAmount))}
              dueLabel="Payable balance"
            />
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}
