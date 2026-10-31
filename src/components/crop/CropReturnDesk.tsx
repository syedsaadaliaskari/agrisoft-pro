"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SettlementPanel, money } from "@/components/ops/DocumentWorkspace";
import { Alert, Button, Input, Modal, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import type { CropPurchase, CropSale, CropSlipReturn } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function n(value: string) {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
}

type OpenSlip = {
  id: string;
  docNo: string;
  party: string;
  product: string;
  load: number;
  safi: number;
  stock: number;
  gross: number;
  unit: string;
};

function buySlip(row: CropPurchase): OpenSlip {
  const typed = row.vehicles.reduce((sum, vehicle) => sum + Number(vehicle.totalWeight), 0);
  const stock = row.stockWeight != null ? Number(row.stockWeight) : Number(row.safiWeight);
  const load = typed > 0 ? typed : stock;
  const safi = typed > 0 && stock > 0 ? (Number(row.safiWeight) * load) / stock : Number(row.safiWeight);
  return {
    id: row.id,
    docNo: row.docNo,
    party: row.partyName || "—",
    product: row.productName,
    load,
    safi,
    stock,
    gross: Number(row.grossAmount),
    unit: row.vehicles[0]?.weighUnit || "",
  };
}

function sellSlip(row: CropSale): OpenSlip {
  const load = Number(row.weight);
  const factor = Number(row.stockFactor || 1) || 1;
  const safiStored = row.safiWeight != null ? Number(row.safiWeight) : load;
  return {
    id: row.id,
    docNo: row.docNo,
    party: row.customerName || "—",
    product: row.productName,
    load,
    safi: factor > 0 ? safiStored / factor : safiStored,
    stock: load * factor,
    gross: Number(row.amount),
    unit: row.weighUnit || "",
  };
}

export function CropReturnDesk({ kind }: { kind: "buy" | "sell" }) {
  const buy = kind === "buy";
  const [slips, setSlips] = useState<OpenSlip[]>([]);
  const [returns, setReturns] = useState<CropSlipReturn[]>([]);
  const [open, setOpen] = useState(false);
  const [docDate, setDocDate] = useState(today());
  const [sourceId, setSourceId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [cashPaid, setCashPaid] = useState("0");
  const [bankPaid, setBankPaid] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const api = getApi();
    if (buy) {
      const [list, prior] = await Promise.all([api.listCropPurchases(), api.listCropPurchaseReturns()]);
      if (list.ok) setSlips(list.data.map(buySlip));
      else setError(list.error);
      if (prior.ok) setReturns(prior.data);
      else setError(prior.error);
    } else {
      const [list, prior] = await Promise.all([api.listCropSales(), api.listCropSaleReturns()]);
      if (list.ok) setSlips(list.data.map(sellSlip));
      else setError(list.error);
      if (prior.ok) setReturns(prior.data);
      else setError(prior.error);
    }
    setLoading(false);
  }, [buy]);

  useEffect(() => {
    void load();
  }, [load]);

  const chosen = slips.find((row) => row.id === sourceId) ?? null;
  const already = useMemo(
    () => returns.filter((row) => row.sourceId === sourceId).reduce((sum, row) => sum + row.quantity, 0),
    [returns, sourceId]
  );
  const qty = n(quantity);
  const left = chosen ? Math.max(0, chosen.load - already) : 0;
  const ratio = chosen && chosen.load > 0 && qty > 0 ? qty / chosen.load : 0;
  const safi = chosen ? chosen.safi * ratio : 0;
  const amount = chosen ? chosen.gross * ratio : 0;
  const stock = chosen ? chosen.stock * ratio : 0;
  const unit = chosen?.unit || "unit";

  const save = async () => {
    setSaving(true);
    setError("");
    const api = getApi();
    const res = buy
      ? await api.createCropPurchaseReturn({ docDate, sourceId, quantity: qty, cashPaid: n(cashPaid), bankPaid: n(bankPaid), remarks })
      : await api.createCropSaleReturn({ docDate, sourceId, quantity: qty, cashPaid: n(cashPaid), bankPaid: n(bankPaid), remarks });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    setSourceId("");
    setQuantity("");
    setCashPaid("0");
    setBankPaid("0");
    setRemarks("");
    await load();
  };

  const reverse = async (row: CropSlipReturn) => {
    if (!window.confirm(`Reverse ${row.docNo}? Stock and khata for this return go back.`)) return;
    const api = getApi();
    const res = buy ? await api.deleteCropPurchaseReturn(row.id) : await api.deleteCropSaleReturn(row.id);
    if (!res.ok) setError(res.error);
    else await load();
  };

  return (
    <AppShell title={buy ? "Return crop buy" : "Return crop sale"} permission={buy ? "purchases.return" : "sales.return"}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          {buy
            ? "The buy slip stays. Only the quantity you write leaves stock, and only its safi money comes back."
            : "The sale slip stays. Only the quantity you write comes back into stock, and only its safi money is given back."}
        </p>
        <Button
          onClick={() => {
            setError("");
            setDocDate(today());
            setOpen(true);
          }}
        >
          <Plus size={16} /> New return
        </Button>
      </div>
      {error && !open ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {loading ? <p className="text-sm text-[var(--text-muted)]">Loading...</p> : null}
      {!loading && returns.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No crop returns yet.</p> : null}
      <div className="space-y-2">
        {returns.map((row) => (
          <div key={row.id} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {row.docNo} · {row.sourceNo} · {row.partyName} · {row.productName}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">
                  {row.quantity} {row.unitName || ""} · safi {row.safiWeight} · {formatMoney(row.amount)}
                </span>
                <Button variant="ghost" size="sm" title="Reverse" onClick={() => void reverse(row)}>
                  <Trash2 size={14} />
                </Button>
              </span>
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={buy ? "Return part of a crop buy" : "Return part of a crop sale"} size="lg">
        <div className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Date" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
            <Select
              label="Slip"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              options={[
                { value: "", label: "Choose" },
                ...slips.flatMap((row) => {
                  const used = returns.filter((item) => item.sourceId === row.id).reduce((sum, item) => sum + item.quantity, 0);
                  const remain = Math.max(0, row.load - used);
                  if (remain <= 0) return [];
                  return [
                    {
                      value: row.id,
                      label: `${row.docNo} · ${row.party} · ${row.product} · ${Math.round(remain * 1000) / 1000} ${row.unit} left`,
                    },
                  ];
                }),
              ]}
            />
            <Input label={`Quantity coming back (${unit})`} type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <Input label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          {chosen && qty > 0 ? (
            <p className="text-sm tabular-nums">
              Left on the slip {Math.round(left * 1000) / 1000} {unit}. This return is safi {Math.round(safi * 1000) / 1000} {unit}, stock {Math.round(stock * 1000) / 1000} {unit}, money {money(amount)}. Charges stay on the original slip.
            </p>
          ) : null}
          <SettlementPanel
            compact
            grandTotal={Math.max(0, amount)}
            cashPaid={cashPaid}
            bankPaid={bankPaid}
            onCashPaid={setCashPaid}
            onBankPaid={setBankPaid}
            dueLabel="Left on khata"
          />
          <p className="text-xs text-[var(--text-muted)]">
            {buy ? "Cash and bank here are money you receive back." : "Cash and bank here are money you give back."} What you leave empty stays on the khata.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving || !sourceId || !(qty > 0)} onClick={() => void save()}>
              {saving ? "Saving..." : "Save return"}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
