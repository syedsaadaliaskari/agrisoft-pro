"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SettlementPanel } from "@/components/ops/DocumentWorkspace";
import { Alert, Button, Input, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import type { CropPurchase, Customer, InventoryRow, Vendor } from "@shared/ipc";

type Party = "customer" | "vendor";

type VehicleDraft = {
  key: string;
  vehicleNo: string;
  bags: string;
  totalWeight: string;
  kaat: string;
  rate: string;
};

const emptyVehicle = (): VehicleDraft => ({
  key: `${Date.now()}-${Math.random()}`,
  vehicleNo: "",
  bags: "",
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

export function CropPurchaseSlip({
  partyType,
  title,
  subtitle,
}: {
  partyType: Party;
  title: string;
  subtitle: string;
}) {
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [rows, setRows] = useState<CropPurchase[]>([]);
  const [docDate, setDocDate] = useState(today());
  const [partyId, setPartyId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [vehicles, setVehicles] = useState<VehicleDraft[]>([emptyVehicle()]);
  const [commission, setCommission] = useState("0");
  const [brokerage, setBrokerage] = useState("0");
  const [mazdoori, setMazdoori] = useState("0");
  const [fees, setFees] = useState("0");
  const [bardana, setBardana] = useState("0");
  const [cashPaid, setCashPaid] = useState("0");
  const [bankPaid, setBankPaid] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const api = getApi();
    const [inv, cust, ven, list] = await Promise.all([
      api.listInventory(),
      api.listCustomers(),
      api.listVendors(),
      api.listCropPurchases(partyType),
    ]);
    if (inv.ok) setInventory(inv.data.filter((row) => row.isActive && row.isCrop));
    if (cust.ok) setCustomers(cust.data.filter((row) => row.isActive));
    if (ven.ok) setVendors(ven.data.filter((row) => row.isActive));
    if (list.ok) setRows(list.data);
    else setError(list.error);
    setLoading(false);
  }, [partyType]);

  useEffect(() => {
    void load();
  }, [load]);

  const priced = useMemo(
    () =>
      vehicles.map((vehicle) => {
        const totalWeight = n(vehicle.totalWeight);
        const kaat = n(vehicle.kaat);
        const safi = Math.max(0, totalWeight - kaat);
        const amount = safi * n(vehicle.rate);
        return { ...vehicle, safi, amount };
      }),
    [vehicles]
  );
  const gross = priced.reduce((sum, vehicle) => sum + vehicle.amount, 0);
  const deductions = n(commission) + n(brokerage) + n(mazdoori) + n(fees) + n(bardana);
  const net = gross - deductions;

  const save = async () => {
    setSaving(true);
    setError("");
    const res = await getApi().createCropPurchase({
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
      vehicles: vehicles.map((vehicle) => ({
        vehicleNo: vehicle.vehicleNo,
        bags: n(vehicle.bags),
        totalWeight: n(vehicle.totalWeight),
        kaat: n(vehicle.kaat),
        rate: n(vehicle.rate),
      })),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setVehicles([emptyVehicle()]);
    setCommission("0");
    setBrokerage("0");
    setMazdoori("0");
    setFees("0");
    setBardana("0");
    setCashPaid("0");
    setBankPaid("0");
    setRemarks("");
    await load();
  };

  const parties = partyType === "customer" ? customers : vendors;

  return (
    <AppShell title={title} subtitle={subtitle} permission="purchases.view">
      <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-muted)]">
        This slip is only for a crop. Kaat cuts the weight of each vehicle. Commission, brokerage, mazdoori, fees, and bardana cut the money once, under the vehicles. Seed and pesticide stay on Purchase.
      </div>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {!loading && inventory.length === 0 ? (
        <div className="mb-4">
          <Alert>Open Products and mark one item as a crop before using this slip.</Alert>
        </div>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div className="grid gap-3 md:grid-cols-3">
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--text-muted)]">
              <tr>
                <th className="py-2 pr-2">Vehicle</th>
                <th className="py-2 pr-2">Bags</th>
                <th className="py-2 pr-2">Total weight</th>
                <th className="py-2 pr-2">Kaat</th>
                <th className="py-2 pr-2">Safi</th>
                <th className="py-2 pr-2">Rate</th>
                <th className="py-2 pr-2">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {priced.map((vehicle) => (
                <tr key={vehicle.key} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-2">
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
                  <td className="py-2 pr-2">
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
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      value={vehicle.totalWeight}
                      onChange={(e) =>
                        setVehicles((prev) =>
                          prev.map((row) =>
                            row.key === vehicle.key ? { ...row, totalWeight: e.target.value } : row
                          )
                        )
                      }
                      className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                    />
                  </td>
                  <td className="py-2 pr-2">
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
                  <td className="py-2 pr-2 tabular-nums">{vehicle.safi}</td>
                  <td className="py-2 pr-2">
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
                  <td className="py-2 pr-2 font-medium tabular-nums">{formatMoney(vehicle.amount)}</td>
                  <td className="py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVehicles((prev) => prev.filter((row) => row.key !== vehicle.key))}
                    >
                      <X size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setVehicles((prev) => [...prev, emptyVehicle()])}>
          <Plus size={14} /> Add vehicle
        </Button>

        <div className="grid gap-3 md:grid-cols-5">
          <Input label="Commission" type="number" min={0} value={commission} onChange={(e) => setCommission(e.target.value)} />
          <Input label="Brokerage" type="number" min={0} value={brokerage} onChange={(e) => setBrokerage(e.target.value)} />
          <Input label="Mazdoori" type="number" min={0} value={mazdoori} onChange={(e) => setMazdoori(e.target.value)} />
          <Input label="Fees" type="number" min={0} value={fees} onChange={(e) => setFees(e.target.value)} />
          <Input label="Bardana" type="number" min={0} value={bardana} onChange={(e) => setBardana(e.target.value)} />
        </div>
        <Input label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Vehicle total</span><span className="tabular-nums">{formatMoney(gross)}</span></div>
            <div className="flex justify-between"><span>Deductions</span><span className="tabular-nums">{formatMoney(deductions)}</span></div>
            <div className="flex justify-between font-semibold"><span>Net payable</span><span className="tabular-nums">{formatMoney(net)}</span></div>
          </div>
          <SettlementPanel compact grandTotal={Math.max(0, net)} cashPaid={cashPaid} bankPaid={bankPaid} onCashPaid={setCashPaid} onBankPaid={setBankPaid} dueLabel="Left on khata" />
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving..." : "Save crop purchase"}
        </Button>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Recent slips</h2>
        {loading ? <p className="text-sm text-[var(--text-muted)]">Loading...</p> : null}
        {!loading && rows.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No crop purchases yet.</p> : null}
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{row.docNo} · {row.partyName} · {row.productName}</span>
                <span className="tabular-nums">{formatMoney(row.netPayable)}</span>
              </div>
              <div className="mt-1 text-[var(--text-muted)]">
                {row.docDate} · safi {row.safiWeight} · kaat on {row.vehicles.length} vehicle{row.vehicles.length === 1 ? "" : "s"} · deductions {formatMoney(row.deductionAmount)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
