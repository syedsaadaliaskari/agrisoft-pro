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
  ComposerShell,
  DocMetaGrid,
  DocStatusBadge,
  FilterChips,
  LineItemsTable,
  OpsEmptyState,
  OpsListSkeleton,
  OpsStatStrip,
  PaymentModeBadge,
  SettlementPanel,
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
} from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { buildPurchasePrintHtml } from "@/lib/print";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type {
  Account,
  InventoryRow,
  PaymentMode,
  Purchase,
  ReceiptSize,
  Unit,
  Vendor,
} from "@shared/ipc";

type DraftLine = {
  key: string;
  variantId: string;
  label: string;
  stockQty: number;
  quantity: string;
  unit: string;
  unitCost: string;
};

type ModeFilter = "all" | "cash" | "bank" | "credit" | "split" | "today";

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function PurchasesPage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, "purchases.create");
  const [rows, setRows] = useState<Purchase[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
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
  const [accountId, setAccountId] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [additionAmount, setAdditionAmount] = useState("0");
  const [taxAmount, setTaxAmount] = useState("0");
  const [cashPaid, setCashPaid] = useState("0");
  const [bankPaid, setBankPaid] = useState("0");
  const [postedCash, setPostedCash] = useState(0);
  const [postedBank, setPostedBank] = useState(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickVariantId, setPickVariantId] = useState("");
  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<Purchase | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const api = getApi();
    const [p, v, inv, acct, unitRes] = await Promise.all([
      api.listPurchases(),
      api.listVendors(),
      api.listInventory(),
      api.listAccounts({ cashBankOnly: true }),
      api.listUnits(),
    ]);
    if (!p.ok) setError(p.error);
    else setRows(p.data);
    if (v.ok) setVendors(v.data.filter((x) => x.isActive));
    if (inv.ok) setInventory(inv.data.filter((x) => x.isActive));
    if (unitRes.ok) setUnits(unitRes.data.filter((u) => u.isActive));
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
    const netOf = (r: (typeof active)[0]) => r.netTotal ?? r.grandTotal;
    const payable = active.reduce(
      (s, r) => s + (r.dueAmount ?? Math.max(0, netOf(r) - (r.collectedAmount ?? r.paidAmount))),
      0
    );
    const avg = active.length ? active.reduce((s, r) => s + netOf(r), 0) / active.length : 0;
    return {
      count: active.length,
      todayCount: todayRows.length,
      todayTotal: todayRows.reduce((s, r) => s + netOf(r), 0),
      payable,
      avg,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const t = today();
    return rows.filter((r) => {
      if (modeFilter === "today" && r.invoiceDate !== t) return false;
      if (
        modeFilter === "cash" ||
        modeFilter === "bank" ||
        modeFilter === "credit" ||
        modeFilter === "split"
      ) {
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
      split: rows.filter((r) => r.paymentMode === "split").length,
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

  const unitChoices = useMemo(() => units.map((u) => u.shortName), [units]);

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
  const cashNum = Number(cashPaid || 0);
  const bankNum = Number(bankPaid || 0);
  const effectivePaid = Math.round((cashNum + bankNum) * 100) / 100;
  const balanceDue = Math.max(0, Math.round((grand - effectivePaid) * 100) / 100);

  const resetComposer = () => {
    setInvoiceDate(today());
    setVendorId(vendors[0]?.id ?? "");
    setDiscountAmount("0");
    setAdditionAmount("0");
    setTaxAmount("0");
    setCashPaid("0");
    setBankPaid("0");
    setPostedCash(0);
    setPostedBank(0);
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
    setDiscountAmount(String(purchase.discountAmount));
    setAdditionAmount(String(purchase.additionAmount));
    setTaxAmount(String(purchase.taxAmount));
    if (purchase.cashPaid != null || purchase.bankPaid != null) {
      setCashPaid(String(purchase.cashPaid ?? 0));
      setBankPaid(String(purchase.bankPaid ?? 0));
      setPostedCash(Number(purchase.cashPaid ?? 0));
      setPostedBank(Number(purchase.bankPaid ?? 0));
    } else if (purchase.paymentMode === "bank") {
      setCashPaid("0");
      setBankPaid(String(purchase.paidAmount));
      setPostedCash(0);
      setPostedBank(Number(purchase.paidAmount || 0));
    } else {
      setCashPaid(String(purchase.paidAmount));
      setBankPaid("0");
      setPostedCash(Number(purchase.paidAmount || 0));
      setPostedBank(0);
    }
    setNotes(purchase.notes || "");
    setPickVariantId("");
    setError("");
    setLines(
      (purchase.items ?? []).map((it) => {
        const inv = inventory.find((r) => r.variantId === it.variantId);
        return {
          key: `${it.variantId}-${it.id}`,
          variantId: it.variantId,
          label: `${it.productName} (${it.size}/${it.color})`,
          stockQty: inv?.stockQty ?? 0,
          quantity: String(it.quantity),
          unit: it.unit ?? inv?.unit ?? "",
          unitCost: String(it.unitCost),
        };
      })
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
        stockQty: row.stockQty,
        quantity: "1",
        unit: row.unit ?? "",
        unitCost: String(row.costPrice),
      },
    ]);
    setPickVariantId("");
    setError("");
  };

  const onSave = async (andPrint = false) => {
    setSaving(true);
    setError("");
    const cash =
      cashPaid === "" && (bankPaid === "" || bankPaid === "0")
        ? grand
        : Number(cashPaid || 0);
    const bank =
      cashPaid === "" && (bankPaid === "" || bankPaid === "0")
        ? 0
        : Number(bankPaid || 0);
    const paymentMode: PaymentMode =
      cash + bank === 0
        ? "credit"
        : cash > 0 && bank > 0
          ? "split"
          : bank > 0
            ? "bank"
            : "cash";
    const payload = {
      invoiceDate,
      vendorId,
      paymentMode,
      accountId: paymentMode === "credit" ? null : accountId || null,
      cashPaid: cash,
      bankPaid: bank,
      paidAmount: cash + bank,
      discountAmount: Number(discountAmount || 0),
      additionAmount: Number(additionAmount || 0),
      taxAmount: Number(taxAmount || 0),
      notes: notes || null,
      items: lines.map((l) => ({
        variantId: l.variantId,
        quantity: Number(l.quantity),
        unit: l.unit || null,
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
    if (andPrint) await printPurchase(res.data);
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

  const purchaseHtml = async (row: Purchase, size: ReceiptSize = "a4") => {
    let toPrint = row;
    if (!row.items) {
      const res = await getApi().getPurchase(row.id);
      if (!res.ok) throw new Error(res.error);
      toPrint = res.data;
    }
    return buildPurchasePrintHtml(toPrint, size);
  };

  const printPurchase = async (row: Purchase, size: ReceiptSize = "a4") => {
    try {
      const html = await purchaseHtml(row, size);
      const res = await getApi().printHtml(html);
      if (!res.ok) setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Print failed");
    }
  };

  return (
    <AppShell title="Purchase" permission="purchases.view">
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
            icon: Receipt,
          },
          {
            label: "Payables open",
            value: money(stats.payable),
            tone: stats.payable > 0 ? "warn" : "success",
            icon: Wallet,
          },
          {
            label: "Avg bill",
            value: money(stats.avg),
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
            { value: "credit", label: "Credit", count: filterCounts.credit },
            { value: "cash", label: "Cash", count: filterCounts.cash },
            { value: "bank", label: "Bank", count: filterCounts.bank },
            { value: "split", label: "Split", count: filterCounts.split },
          ]}
        />
      </div>

      {loading ? (
        <OpsListSkeleton />
      ) : filtered.length === 0 ? (
        <OpsEmptyState
          title={search || modeFilter !== "all" ? "No matching purchases" : "No purchases yet"}
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
            const net = row.netTotal ?? row.grandTotal;
            const due =
              row.dueAmount ?? Math.max(0, net - (row.collectedAmount ?? row.paidAmount));
            const collected = row.collectedAmount ?? row.paidAmount;
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
                    </div>
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
                  <div className="tabular-nums text-sm">{money(collected)}</div>
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
                    <PrintMenu
                      defaultSize="a4"
                      fileName={row.invoiceNo}
                      getHtml={(size) => purchaseHtml(row, size)}
                      onError={setError}
                    />
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
            {!editingId ? (
              <Button
                variant="secondary"
                onClick={() => void onSave(true)}
                disabled={saving || lines.length === 0 || !vendorId}
              >
                {saving ? "Saving..." : "Save & print"}
              </Button>
            ) : null}
            <Button
              onClick={() => void onSave(false)}
              disabled={saving || lines.length === 0 || !vendorId}
            >
              {saving ? "Saving..." : editingId ? "Update" : "Save"}
            </Button>
          </>
        }
      >
        {error ? <Alert>{error}</Alert> : null}
        <ComposerShell
          header={
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
                  label="Notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
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
                <div className="space-y-2">
                  <SettlementPanel
                    compact
                    grandTotal={grand}
                    cashPaid={cashPaid}
                    bankPaid={bankPaid}
                    onCashPaid={setCashPaid}
                    onBankPaid={setBankPaid}
                    dueLabel="Payable"
                    moneyFlow="out"
                    postedCash={postedCash}
                    postedBank={postedBank}
                  />
                  <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm">
                    <span className="text-[var(--text-muted)]">Total</span>
                    <span className="font-semibold tabular-nums">{money(grand)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
                    <span className="text-[var(--text-muted)]">Payable</span>
                    <span
                      className={`font-semibold tabular-nums ${balanceDue > 0 ? "text-amber-700 dark:text-amber-300" : "text-[var(--success)]"}`}
                    >
                      {money(balanceDue)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          }
        >
            <LineItemsTable
                headers={["Product", "In stock", "Qty", "Unit", "Unit cost", "Line total", ""]}
                empty={lines.length === 0}
              >
                {lines.map((line) => {
                  const lineTotal = Number(line.quantity || 0) * Number(line.unitCost || 0);
                  return (
                    <tr key={line.key}>
                      <td className="px-3 py-2.5 font-medium">{line.label}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs tabular-nums text-[var(--text-muted)]">
                          {line.stockQty}
                          {line.unit ? ` ${line.unit}` : ""}
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
                      <td className="px-3 py-2.5 w-[96px]">
                        <select
                          value={line.unit}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key ? { ...l, unit: e.target.value } : l
                              )
                            )
                          }
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm outline-none ring-[var(--accent)] focus:ring-1"
                        >
                          <option value="">—</option>
                          {(unitChoices.includes(line.unit) || !line.unit
                            ? unitChoices
                            : [line.unit, ...unitChoices]
                          ).map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
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
        </ComposerShell>
      </Modal>

      <Modal
        open={viewOpen}
        size="xl"
        title={viewing ? `Purchase ${viewing.invoiceNo}` : "Purchase"}
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
                fileName={viewing.invoiceNo}
                getHtml={(size) => purchaseHtml(viewing, size)}
                onError={setError}
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
            >
              {(viewing.items ?? []).map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2.5 font-medium">{it.productName}</td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)]">
                    {it.size} / {it.color}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {it.quantity}
                    {it.unit ? <span className="ml-1 text-[var(--text-muted)]">{it.unit}</span> : null}
                  </td>
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
                { label: "Paid on bill", value: money(viewing.paidAmount), muted: true },
                {
                  label: "Settled",
                  value: money(viewing.collectedAmount ?? viewing.paidAmount),
                  muted: true,
                },
                ...(viewing.returnedTotal
                  ? [{ label: "Returned", value: money(viewing.returnedTotal), muted: true }]
                  : []),
              ]}
              grand={money(viewing.netTotal ?? viewing.grandTotal)}
              due={money(
                viewing.dueAmount ??
                  Math.max(
                    0,
                    (viewing.netTotal ?? viewing.grandTotal) -
                      (viewing.collectedAmount ?? viewing.paidAmount)
                  )
              )}
              dueLabel="Payable"
            />
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}
