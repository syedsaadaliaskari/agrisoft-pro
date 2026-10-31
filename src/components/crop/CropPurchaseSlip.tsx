"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ComposerShell, LineItemsTable, SettlementPanel, TotalsPanel, money } from "@/components/ops/DocumentWorkspace";
import { PrintMenu } from "@/components/PrintMenu";
import { Alert, Button, Input, Modal, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { buildCropPurchasePrintHtml } from "@/lib/print";
import { shopBits } from "@/lib/print-actions";
import { formatMoney } from "@/lib/utils";
import type { CropPurchase, Customer, InventoryRow, Product, ReceiptSize, Unit, Vendor } from "@shared/ipc";

type Party = "customer" | "vendor";

type VehicleDraft = {
  key: string;
  vehicleNo: string;
  bags: string;
  perBag: string;
  totalWeight: string;
  kaat: string;
  rate: string;
};

const emptyVehicle = (): VehicleDraft => ({
  key: `${Date.now()}-${Math.random()}`,
  vehicleNo: "",
  bags: "",
  perBag: "",
  totalWeight: "",
  kaat: "0",
  rate: "",
});

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

export function CropPurchaseSlip({
  partyType,
  title,
}: {
  partyType: Party;
  title: string;
}) {
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [rows, setRows] = useState<CropPurchase[]>([]);
  const [docDate, setDocDate] = useState(today());
  const [partyId, setPartyId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [weighUnitId, setWeighUnitId] = useState("");
  const [vehicles, setVehicles] = useState<VehicleDraft[]>([emptyVehicle()]);
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
    const [inv, cust, ven, list, unitRes, productRes] = await Promise.all([
      api.listInventory(),
      api.listCustomers(),
      api.listVendors(),
      api.listCropPurchases(partyType),
      api.listUnits(),
      api.listProducts(),
    ]);
    if (inv.ok) setInventory(inv.data.filter((row) => row.isActive && row.isCrop));
    if (unitRes.ok) setUnits(unitRes.data.filter((row) => row.isActive));
    if (productRes.ok) setProducts(productRes.data);
    if (cust.ok) setCustomers(cust.data.filter((row) => row.isActive));
    if (ven.ok) setVendors(ven.data.filter((row) => row.isActive));
    if (list.ok) setRows(list.data);
    else setError(list.error);
    setLoading(false);
  }, [partyType]);

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
  const unitKg = chosenKg;
  const usePerBag = unit.toLowerCase() !== "bag";
  const priced = useMemo(
    () =>
      vehicles.map((vehicle) => {
        const bags = n(vehicle.bags);
        const perBag = n(vehicle.perBag);
        const typed = n(vehicle.totalWeight);
        const total = usePerBag && bags > 0 && perBag > 0 ? bags * perBag : typed;
        const kaat = n(vehicle.kaat);
        const totalKaatKg = total * kaat;
        const kaatUnits = unitKg && unitKg > 0 ? totalKaatKg / unitKg : 0;
        const safi = Math.max(0, total - kaatUnits);
        const amount = safi * n(vehicle.rate);
        return { ...vehicle, total, safi, totalKaatKg, amount, stock: total * factor };
      }),
    [usePerBag, vehicles, factor, unitKg]
  );
  const stockIn = priced.reduce((sum, vehicle) => sum + vehicle.stock, 0);
  const gross = priced.reduce((sum, vehicle) => sum + vehicle.amount, 0);
  const deductions = n(commission) + n(brokerage) + n(mazdoori) + n(fees) + n(bardana);
  const net = gross - deductions;

  const purchaseHtml = async (row: CropPurchase, size: ReceiptSize) => {
    const shop = await shopBits();
    return buildCropPurchasePrintHtml({ ...row, ...shop }, size);
  };

  const printPurchase = async (row: CropPurchase, size: ReceiptSize = "a4") => {
    try {
      const html = await purchaseHtml(row, size);
      const res = await getApi().printHtml(html);
      if (!res.ok) setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Print failed");
    }
  };

  const resetForm = () => {
    setDocDate(today());
    setPartyId("");
    setVariantId("");
    setWeighUnitId("");
    setVehicles([emptyVehicle()]);
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

  const openNew = () => {
    resetForm();
    setComposer(true);
  };

  const openEdit = (row: CropPurchase) => {
    setEditingId(row.id);
    setDocDate(row.docDate);
    setPartyId(row.partyId);
    setVariantId(row.variantId);
    const savedUnit = row.vehicles[0]?.weighUnit;
    setWeighUnitId(units.find((unit) => unit.shortName === savedUnit)?.id ?? "");
    setVehicles(
      row.vehicles.map((vehicle) => ({
        key: `${vehicle.vehicleNo}-${Math.random()}`,
        vehicleNo: vehicle.vehicleNo,
        bags: String(vehicle.bags || ""),
        perBag: "",
        totalWeight: String(vehicle.totalWeight),
        kaat: String(vehicle.kaat),
        rate: String(vehicle.rate),
      }))
    );
    setCommission(String(row.commission));
    setBrokerage(String(row.brokerage));
    setMazdoori(String(row.mazdoori));
    setFees(String(row.fees));
    setBardana(String(row.bardana));
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
      partyType,
      partyId,
      variantId,
      commission: n(commission),
      brokerage: n(brokerage),
      mazdoori: n(mazdoori),
      fees: n(fees),
      bardana: n(bardana),
      cashPaid: n(cashPaid),
      bankPaid: n(bankPaid),
      remarks: remarks || null,
      weighUnitId: weighUnitId || null,
      vehicles: priced.map((vehicle) => ({
        vehicleNo: vehicle.vehicleNo,
        bags: n(vehicle.bags),
        totalWeight: vehicle.total,
        kaat: n(vehicle.kaat),
        rate: n(vehicle.rate),
      })),
    };
    const res = editingId
      ? await getApi().updateCropPurchase(editingId, payload)
      : await getApi().createCropPurchase(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setComposer(false);
    resetForm();
    if (andPrint) await printPurchase(res.data);
    await load();
  };

  const reverseSlip = async (row: CropPurchase) => {
    if (!window.confirm(`Reverse ${row.docNo}? The full quantity goes back out of stock and the khata entry is removed.`)) return;
    setError("");
    const res = await getApi().deleteCropPurchase(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  };

  const parties = partyType === "customer" ? customers : vendors;

  return (
    <AppShell title={title} permission="purchases.view">
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <Plus size={14} /> New crop purchase
        </Button>
      </div>
      {error && !composer ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {!loading && inventory.length === 0 ? (
        <div className="mb-4">
          <Alert>Open Products and mark one item as a crop before using this slip.</Alert>
        </div>
      ) : null}

      <Modal
        open={composer}
        size="full"
        title={editingId ? "Edit crop purchase" : "New crop purchase"}
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
            label={partyType === "customer" ? "Farmer" : "Supplier"}
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            options={[
              { value: "", label: partyType === "customer" ? "Select farmer" : "Select supplier" },
              ...parties.map((party) => ({ value: party.id, label: party.name })),
            ]}
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
        <div className="space-y-4">
        <LineItemsTable
          headers={
            usePerBag
              ? ["Vehicle", "Bags", `${unit} / bag`, `Total ${unit}`, `kg / ${unit}`, "Safi", `Rate / ${unit}`, "Amount", ""]
              : ["Vehicle", "Bags", `Total ${unit}`, `kg / ${unit}`, "Safi", `Rate / ${unit}`, "Amount", ""]
          }
        >
              {priced.map((vehicle) => (
                <tr key={vehicle.key}>
                  <td className="px-3 py-2">
                    <input
                      value={vehicle.vehicleNo}
                      onChange={(e) =>
                        setVehicles((prev) =>
                          prev.map((row) => (row.key === vehicle.key ? { ...row, vehicleNo: e.target.value } : row))
                        )
                      }
                      className="w-28 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      value={vehicle.bags}
                      onChange={(e) =>
                        setVehicles((prev) =>
                          prev.map((row) => (row.key === vehicle.key ? { ...row, bags: e.target.value } : row))
                        )
                      }
                      className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                    />
                  </td>
                  {usePerBag ? (
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={vehicle.perBag}
                        onChange={(e) =>
                          setVehicles((prev) =>
                            prev.map((row) => (row.key === vehicle.key ? { ...row, perBag: e.target.value } : row))
                          )
                        }
                        className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      value={usePerBag && n(vehicle.bags) > 0 && n(vehicle.perBag) > 0 ? String(vehicle.total) : vehicle.totalWeight}
                      onChange={(e) =>
                        setVehicles((prev) =>
                          prev.map((row) =>
                            row.key === vehicle.key ? { ...row, totalWeight: e.target.value, perBag: "" } : row
                          )
                        )
                      }
                      className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      value={vehicle.kaat}
                      onChange={(e) =>
                        setVehicles((prev) =>
                          prev.map((row) => (row.key === vehicle.key ? { ...row, kaat: e.target.value } : row))
                        )
                      }
                      className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <div>
                      {Math.round(vehicle.safi * 1000) / 1000} {unit}
                    </div>
                    {vehicle.totalKaatKg > 0 ? (
                      <div className="text-xs text-[var(--text-muted)]">{Math.round(vehicle.totalKaatKg * 1000) / 1000} kg cut</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      value={vehicle.rate}
                      onChange={(e) =>
                        setVehicles((prev) =>
                          prev.map((row) => (row.key === vehicle.key ? { ...row, rate: e.target.value } : row))
                        )
                      }
                      className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium tabular-nums">{money(vehicle.amount)}</td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVehicles((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.key !== vehicle.key)))}
                    >
                      <X size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
        </LineItemsTable>
        <Button size="sm" variant="secondary" onClick={() => setVehicles((prev) => [...prev, emptyVehicle()])}>
          <Plus size={14} /> Add vehicle
        </Button>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <TotalsPanel
            rows={[
              { label: "Safi", value: money(gross) },
              {
                label: "Stock in",
                value: `${Math.round(stockIn * 1000) / 1000} ${productUnit?.shortName || unit}`,
              },
              { label: "Deductions", value: money(deductions), negative: deductions > 0 },
            ]}
            grandLabel="Net payable"
            grand={money(Math.max(0, net))}
          />
          <SettlementPanel compact grandTotal={Math.max(0, net)} cashPaid={cashPaid} bankPaid={bankPaid} onCashPaid={setCashPaid} onBankPaid={setBankPaid} dueLabel="Left on khata" />
        </div>
        </div>
        </ComposerShell>
      </Modal>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Recent slips</h2>
        {loading ? <p className="text-sm text-[var(--text-muted)]">Loading...</p> : null}
        {!loading && rows.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No crop purchases yet.</p> : null}
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{row.docNo} · {row.partyName} · {row.productName}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{formatMoney(row.netPayable)}</span>
                  <PrintMenu
                    defaultSize="a4"
                    fileName={row.docNo}
                    getHtml={(size) => purchaseHtml(row, size)}
                    onError={setError}
                  />
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
      </div>
    </AppShell>
  );
}
