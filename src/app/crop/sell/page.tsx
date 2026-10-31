"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ComposerShell, SettlementPanel, TotalsPanel, money } from "@/components/ops/DocumentWorkspace";
import { PrintMenu } from "@/components/PrintMenu";
import { Alert, Button, Input, Modal, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { buildCropSalePrintHtml } from "@/lib/print";
import { shopBits } from "@/lib/print-actions";
import { formatMoney } from "@/lib/utils";
import type { CropSale, Customer, InventoryRow, Product, ReceiptSize, Unit } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function n(value: string) {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function kilograms(unit: Unit | undefined) {
  if (!unit) return null;
  if (unit.equalsKg != null && unit.equalsKg > 0) return unit.equalsKg;
  const label = `${unit.shortName} ${unit.name}`.toLowerCase();
  if (label.includes("kg") || label.includes("kilogram")) return 1;
  return null;
}

export default function SellCropPage() {
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rows, setRows] = useState<CropSale[]>([]);
  const [docDate, setDocDate] = useState(today());
  const [customerId, setCustomerId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [weighUnitId, setWeighUnitId] = useState("");
  const [bags, setBags] = useState("");
  const [perBag, setPerBag] = useState("");
  const [weight, setWeight] = useState("");
  const [kaat, setKaat] = useState("0");
  const [rate, setRate] = useState("");
  const [commission, setCommission] = useState("0");
  const [brokerage, setBrokerage] = useState("0");
  const [mazdoori, setMazdoori] = useState("0");
  const [fees, setFees] = useState("0");
  const [bardana, setBardana] = useState("0");
  const [cashPaid, setCashPaid] = useState("0");
  const [bankPaid, setBankPaid] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [composer, setComposer] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const api = getApi();
    const [inv, cust, list, unitRes, productRes] = await Promise.all([
      api.listInventory(),
      api.listCustomers(),
      api.listCropSales(),
      api.listUnits(),
      api.listProducts(),
    ]);
    if (inv.ok) setInventory(inv.data.filter((row) => row.isActive && row.isCrop));
    if (unitRes.ok) setUnits(unitRes.data.filter((row) => row.isActive));
    if (productRes.ok) setProducts(productRes.data);
    if (cust.ok) setCustomers(cust.data.filter((row) => row.isActive));
    if (list.ok) setRows(list.data);
    else setError(list.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = inventory.find((row) => row.variantId === variantId);
  const productUnit = units.find((unit) => unit.id === products.find((product) => product.id === selected?.productId)?.unitId);
  const weighChoices = units.filter((unit) => unit.id === productUnit?.id || kilograms(unit) != null);
  const chosenUnit = units.find((unit) => unit.id === weighUnitId) ?? productUnit;
  const unit = chosenUnit?.shortName || selected?.unit?.trim() || "qty";
  const chosenKg = kilograms(chosenUnit);
  const productKg = kilograms(productUnit);
  const factor =
    chosenUnit && productUnit && chosenUnit.id !== productUnit.id && chosenKg && productKg ? chosenKg / productKg : 1;
  const usePerBag = unit.toLowerCase() !== "bag";
  const quantity = usePerBag && n(bags) > 0 && n(perBag) > 0 ? n(bags) * n(perBag) : n(weight);
  const unitKg = chosenKg;
  const kaatKg = n(kaat);
  const totalKaatKg = quantity * kaatKg;
  const kaatUnits = unitKg && unitKg > 0 ? totalKaatKg / unitKg : 0;
  const safi = Math.max(0, quantity - kaatUnits);
  const amount = safi * n(rate);
  const stockOut = quantity * factor;
  const deductions = n(commission) + n(brokerage) + n(mazdoori) + n(fees) + n(bardana);
  const net = amount - deductions;

  const saleHtml = async (row: CropSale, size: ReceiptSize) => {
    const shop = await shopBits();
    return buildCropSalePrintHtml({ ...row, ...shop }, size);
  };

  const printSale = async (row: CropSale, size: ReceiptSize = "thermal") => {
    try {
      const html = await saleHtml(row, size);
      const res = await getApi().printHtml(html);
      if (!res.ok) setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Print failed");
    }
  };

  const resetForm = () => {
    setDocDate(today());
    setCustomerId("");
    setVariantId("");
    setWeighUnitId("");
    setBags("");
    setPerBag("");
    setWeight("");
    setKaat("0");
    setRate("");
    setCommission("0");
    setBrokerage("0");
    setMazdoori("0");
    setFees("0");
    setBardana("0");
    setCashPaid("0");
    setBankPaid("0");
    setRemarks("");
    setEditingId(null);
  };

  const openEdit = (row: CropSale) => {
    setEditingId(row.id);
    setDocDate(row.docDate);
    setCustomerId(row.customerId || "");
    setVariantId(row.variantId);
    setWeighUnitId(units.find((unit) => unit.shortName === row.weighUnit)?.id ?? "");
    setBags("");
    setPerBag("");
    setWeight(String(row.weight));
    setKaat(String(row.kaat || 0));
    setRate(String(row.rate));
    setCommission(String(row.commission || 0));
    setBrokerage(String(row.brokerage || 0));
    setMazdoori(String(row.mazdoori || 0));
    setFees(String(row.fees || 0));
    setBardana(String(row.bardana || 0));
    setCashPaid(String(row.paidAmount));
    setBankPaid("0");
    setRemarks(row.remarks || "");
    setComposer(true);
  };

  const save = async (andPrint: boolean) => {
    setSaving(true);
    setError("");
    const payload = {
      docDate,
      customerId,
      variantId,
      weight: quantity,
      kaat: n(kaat),
      rate: n(rate),
      commission: n(commission),
      brokerage: n(brokerage),
      mazdoori: n(mazdoori),
      fees: n(fees),
      bardana: n(bardana),
      cashPaid: n(cashPaid),
      bankPaid: n(bankPaid),
      remarks: remarks || null,
      weighUnitId: weighUnitId || null,
    };
    const res = editingId ? await getApi().updateCropSale(editingId, payload) : await getApi().createCropSale(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setComposer(false);
    resetForm();
    if (andPrint) await printSale(res.data);
    await load();
  };

  const reverseSlip = async (row: CropSale) => {
    if (!window.confirm(`Reverse ${row.docNo}? The quantity goes back into stock and the khata entry is removed.`)) return;
    setError("");
    const res = await getApi().deleteCropSale(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  };

  return (
    <AppShell title="Sell crop" permission="sales.view">
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            resetForm();
            setComposer(true);
          }}
        >
          <Plus size={14} /> New crop sale
        </Button>
      </div>
      {error && !composer ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Modal
        open={composer}
        size="full"
        title={editingId ? "Edit crop sale" : "New crop sale"}
        onClose={() => {
          setComposer(false);
          resetForm();
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setComposer(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            {!editingId ? (
              <Button variant="secondary" onClick={() => void save(true)} disabled={saving}>
                {saving ? "Saving..." : "Save & print"}
              </Button>
            ) : null}
            <Button onClick={() => void save(false)} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Save"}
            </Button>
          </>
        }
      >
        {error ? <Alert>{error}</Alert> : null}
        <ComposerShell
          header={
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
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
              <Select
                label="Unit"
                value={weighUnitId || productUnit?.id || ""}
                onChange={(e) => setWeighUnitId(e.target.value)}
                options={[
                  { value: "", label: "Unit" },
                  ...weighChoices.map((unitRow) => ({
                    value: unitRow.id,
                    label: unitRow.equalsKg ? `${unitRow.shortName} = ${unitRow.equalsKg} kg` : unitRow.shortName,
                  })),
                ]}
              />
              <Input label="Commission" type="number" min={0} value={commission} onChange={(e) => setCommission(e.target.value)} />
              <Input label="Brokerage" type="number" min={0} value={brokerage} onChange={(e) => setBrokerage(e.target.value)} />
              <Input label="Mazdoori" type="number" min={0} value={mazdoori} onChange={(e) => setMazdoori(e.target.value)} />
              <Input label="Fees" type="number" min={0} value={fees} onChange={(e) => setFees(e.target.value)} />
              <Input label="Bardana" type="number" min={0} value={bardana} onChange={(e) => setBardana(e.target.value)} />
              <Input label="Notes" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
          }
        >
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="grid gap-3 sm:grid-cols-2">
                {usePerBag ? (
                  <>
                    <Input label="Bags" type="number" min={0} value={bags} onChange={(e) => setBags(e.target.value)} />
                    <Input label={`${unit} / bag`} type="number" min={0} value={perBag} onChange={(e) => setPerBag(e.target.value)} />
                  </>
                ) : null}
                <Input
                  label={`Quantity (${unit})`}
                  type="number"
                  min={0}
                  value={usePerBag && n(bags) > 0 && n(perBag) > 0 ? String(quantity) : weight}
                  onChange={(e) => {
                    setWeight(e.target.value);
                    setBags("");
                    setPerBag("");
                  }}
                />
                <Input label={`Rate / ${unit}`} type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} />
                <Input label={`Kaat kg / ${unit}`} type="number" min={0} value={kaat} onChange={(e) => setKaat(e.target.value)} />
                <div className="self-end pb-2 text-sm tabular-nums">
                  Safi {Math.round(safi * 1000) / 1000} {unit}
                  {totalKaatKg > 0 ? ` · ${Math.round(totalKaatKg * 1000) / 1000} kg cut` : ""}
                  {" · "}Stock out {Math.round(stockOut * 1000) / 1000} {productUnit?.shortName || unit}
                </div>
              </div>
              <div className="space-y-3">
                <TotalsPanel
                  rows={[
                    { label: "Safi", value: money(amount) },
                    { label: "Deductions", value: money(deductions), negative: deductions > 0 },
                  ]}
                  grandLabel="Net"
                  grand={money(Math.max(0, net))}
                />
                <SettlementPanel
                  compact
                  grandTotal={Math.max(0, net)}
                  cashPaid={cashPaid}
                  bankPaid={bankPaid}
                  onCashPaid={setCashPaid}
                  onBankPaid={setBankPaid}
                  dueLabel="Left on khata"
                />
              </div>
            </div>
        </ComposerShell>
      </Modal>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Recent crop sales</h2>
        {loading ? <p className="text-sm text-[var(--text-muted)]">Loading...</p> : null}
        {!loading && rows.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No crop sales yet.</p> : null}
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {row.docNo} · {row.customerName} · {row.productName}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{formatMoney(row.netAmount || row.amount)}</span>
                <PrintMenu defaultSize="thermal" fileName={row.docNo} getHtml={(size) => saleHtml(row, size)} onError={setError} />
                <Button variant="ghost" size="sm" title="Edit" onClick={() => openEdit(row)}>
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="sm" title="Reverse" onClick={() => void reverseSlip(row)}>
                  <Trash2 size={14} />
                </Button>
              </span>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
