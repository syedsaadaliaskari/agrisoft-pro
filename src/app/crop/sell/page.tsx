"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SettlementPanel } from "@/components/ops/DocumentWorkspace";
import { Alert, Button, Input, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import type { CropSale, Customer, InventoryRow } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function SellCropPage() {
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rows, setRows] = useState<CropSale[]>([]);
  const [docDate, setDocDate] = useState(today());
  const [customerId, setCustomerId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [weight, setWeight] = useState("");
  const [rate, setRate] = useState("");
  const [cashPaid, setCashPaid] = useState("0");
  const [bankPaid, setBankPaid] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const api = getApi();
    const [inv, cust, list] = await Promise.all([
      api.listInventory(),
      api.listCustomers(),
      api.listCropSales(),
    ]);
    if (inv.ok) setInventory(inv.data.filter((row) => row.isActive && row.isCrop));
    if (cust.ok) setCustomers(cust.data.filter((row) => row.isActive));
    if (list.ok) setRows(list.data);
    else setError(list.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const amount = Number(weight || 0) * Number(rate || 0);

  const save = async () => {
    setSaving(true);
    setError("");
    const res = await getApi().createCropSale({
      docDate,
      customerId,
      variantId,
      weight: Number(weight || 0),
      rate: Number(rate || 0),
      cashPaid: Number(cashPaid || 0),
      bankPaid: Number(bankPaid || 0),
      remarks: remarks || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setWeight("");
    setRate("");
    setCashPaid("0");
    setBankPaid("0");
    setRemarks("");
    await load();
  };

  return (
    <AppShell
      title="Sell crop"
      subtitle="Weight leaves the crop stock. Batch and expiry are not on this slip."
      permission="sales.view"
    >
      <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-muted)]">
        A fertilizer sale stays on Sale. This screen only sells a product marked as a crop.
      </div>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Date" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          <Select
            label="Buyer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            options={[{ value: "", label: "Select buyer" }, ...customers.map((row) => ({ value: row.id, label: row.name }))]}
          />
          <Select
            label="Crop"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            options={[
              { value: "", label: "Select crop" },
              ...inventory.map((row) => ({
                value: row.variantId,
                label: `${row.productName} — ${row.stockQty}${row.unit ? ` ${row.unit}` : ""} in stock`,
              })),
            ]}
          />
          <Input label="Weight" type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} />
          <Input label="Rate" type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} />
          <Input label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="text-sm font-semibold">Amount {formatMoney(Number.isNaN(amount) ? 0 : amount)}</div>
          <SettlementPanel
            compact
            grandTotal={Number.isNaN(amount) ? 0 : amount}
            cashPaid={cashPaid}
            bankPaid={bankPaid}
            onCashPaid={setCashPaid}
            onBankPaid={setBankPaid}
            dueLabel="Left on khata"
          />
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving..." : "Save crop sale"}
        </Button>
      </div>
      <div className="mt-6 space-y-2">
        <h2 className="text-sm font-semibold">Recent crop sales</h2>
        {loading ? <p className="text-sm text-[var(--text-muted)]">Loading...</p> : null}
        {!loading && rows.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No crop sales yet.</p> : null}
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{row.docNo} · {row.customerName} · {row.productName}</span>
              <span className="tabular-nums">{formatMoney(row.amount)}</span>
            </div>
            <div className="mt-1 text-[var(--text-muted)]">{row.docDate} · weight {row.weight} · rate {formatMoney(row.rate)}</div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
