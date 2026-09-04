"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackageMinus, Plus, RotateCcw, X } from "lucide-react";
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
import { buildPurchaseReturnPrintHtml } from "@/lib/print";
import type {
  Account,
  InventoryRow,
  PaymentMode,
  Purchase,
  PurchaseReturn,
  ReceiptSize,
  Vendor,
} from "@shared/ipc";

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
  const [filter, setFilter] = useState<"all" | "today" | "linked">("all");
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
  const [linkedPurchase, setLinkedPurchase] = useState<Purchase | null>(null);

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

  const stats = useMemo(() => {
    const t = today();
    const todayRows = rows.filter((r) => r.returnDate === t);
    return {
      count: rows.length,
      todayCount: todayRows.length,
      todayTotal: todayRows.reduce((s, r) => s + r.grandTotal, 0),
      total: rows.reduce((s, r) => s + r.grandTotal, 0),
      linked: rows.filter((r) => r.purchaseId).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const t = today();
    return rows.filter((r) => {
      if (filter === "today" && r.returnDate !== t) return false;
      if (filter === "linked" && !r.purchaseId) return false;
      if (!q) return true;
      return (
        r.returnNo.toLowerCase().includes(q) ||
        (r.vendorName ?? "").toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitCost || 0), 0),
    [lines]
  );
  const grand = useMemo(
    () => Math.round((subtotal + Number(taxAmount || 0)) * 100) / 100,
    [subtotal, taxAmount]
  );

  const openCreate = () => {
    setError("");
    setReturnDate(today());
    setPurchaseId("");
    setVendorId(vendors[0]?.id ?? "");
    setRefundMode("cash");
    setTaxAmount("0");
    setNotes("");
    setLines([]);
    setPickVariantId("");
    setLinkedPurchase(null);
    if (accounts[0]) setAccountId(accounts[0].id);
    setOpen(true);
  };

  const onPurchaseLink = async (id: string) => {
    setPurchaseId(id);
    if (!id) {
      setLinkedPurchase(null);
      return;
    }
    const res = await getApi().getPurchase(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLinkedPurchase(res.data);
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

  const onSave = async (andPrint = false) => {
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
    if (andPrint) await printReturn(res.data);
  };

  const returnHtml = async (row: PurchaseReturn, size: ReceiptSize = "a4") => {
    let toPrint = row;
    if (!row.items?.length) {
      const res = await getApi().getPurchaseReturn(row.id);
      if (!res.ok) throw new Error(res.error);
      toPrint = res.data;
    }
    return buildPurchaseReturnPrintHtml(
      {
        ...toPrint,
        items: (toPrint.items ?? []).map((it) => ({
          ...it,
          unit: it.unit ?? inventory.find((inv) => inv.variantId === it.variantId)?.unit ?? null,
        })),
      },
      size
    );
  };

  const printReturn = async (row: PurchaseReturn, size: ReceiptSize = "a4") => {
    try {
      const html = await returnHtml(row, size);
      const res = await getApi().printHtml(html);
      if (!res.ok) setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Print failed");
    }
  };

  return (
    <AppShell
      title="Purchase Return"
      permission="purchases.return"
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
            icon: PackageMinus,
          },
          {
            label: "All returns",
            value: String(stats.count),
            hint: money(stats.total),
            icon: RotateCcw,
          },
          {
            label: "Linked to bill",
            value: String(stats.linked),
          },
          {
            label: "Avg return",
            value: money(stats.count ? stats.total / stats.count : 0),
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
          title={search || filter !== "all" ? "No matching returns" : "No purchase returns yet"}
          action={
            !search && filter === "all" ? (
              <Button onClick={openCreate}>
                <Plus size={14} /> New return
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable headers={["Return #", "Vendor", "Total", "Notes", ""]} empty={false}>
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
                <div className="font-medium">{row.vendorName || "—"}</div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {row.purchaseId ? "Linked to purchase" : "Standalone return"}
                </div>
              </td>
              <td className="px-4 py-3.5 font-semibold tabular-nums">{money(row.grandTotal)}</td>
              <td className="px-4 py-3.5 max-w-[220px] truncate text-[var(--text-muted)]">
                {row.notes || "—"}
              </td>
              <td className="px-4 py-3.5">
                <div className="flex justify-end">
                  <PrintMenu
                    defaultSize="a4"
                    fileName={row.returnNo}
                    getHtml={(size) => returnHtml(row, size)}
                    onError={setError}
                  />
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={open}
        size="full"
        title="New purchase return"
        onClose={() => setOpen(false)}
        footer={
          <>
            <div className="mr-auto hidden text-xs text-[var(--text-muted)] sm:block">
              {lines.length} line{lines.length === 1 ? "" : "s"} · {money(grand)}
            </div>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => void onSave(true)}
              disabled={saving || !vendorId || lines.length === 0}
            >
              {saving ? "Saving..." : "Save & print"}
            </Button>
            <Button onClick={() => void onSave(false)} disabled={saving || !vendorId || lines.length === 0}>
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
                  label="Original purchase"
                  value={purchaseId}
                  onChange={(e) => void onPurchaseLink(e.target.value)}
                  options={[
                    { value: "", label: "None" },
                    ...purchases.map((p) => ({
                      value: p.id,
                      label: `${p.invoiceNo} · ${p.vendorName || "Vendor"}`,
                    })),
                  ]}
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
                      options={[
                        { value: "", label: "Select product" },
                        ...inventory.map((r) => ({
                          value: r.variantId,
                          label: `${r.productName} (${r.size}/${r.color})`,
                        })),
                      ]}
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
              {purchaseId ? (
                <Select
                  label="Refund account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  options={[
                    { value: "", label: "Original purchase account" },
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
                headers={["Product", "Qty", "Cost", "Total", ""]}
                empty={lines.length === 0}
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
        </ComposerShell>
      </Modal>
    </AppShell>
  );
}
