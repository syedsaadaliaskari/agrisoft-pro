"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { LedgerInquiry } from "@/components/ops/LedgerInquiry";
import { Button } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type { PartyLedger, Vendor } from "@shared/ipc";

export default function VendorLedgerPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canPay = hasPermission(user, "transactions.create");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [ledger, setLedger] = useState<PartyLedger | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getApi()
      .listVendors()
      .then((res) => {
        if (res.ok) {
          setVendors(res.data);
          if (res.data[0]) setVendorId(res.data[0].id);
        }
      });
  }, []);

  const load = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);
    setError("");
    const res = await getApi().getPartyLedger("vendor", vendorId, {
      fromDate: fromDate || null,
      toDate: toDate || null,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      setLedger(null);
      return;
    }
    setLedger(res.data);
  }, [vendorId, fromDate, toDate]);

  const items = useMemo(
    () =>
      vendors.map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        hint: v.city || v.phone || undefined,
      })),
    [vendors]
  );

  return (
    <AppShell title="Vendor Ledger" subtitle="Payables by vendor" permission="ledgers.view">
      <LedgerInquiry
        title="Vendors"
        subtitle="Pick a supplier to open payables"
        pickerLabel="Vendor"
        items={items}
        selectedId={vendorId}
        onSelect={setVendorId}
        fromDate={fromDate}
        toDate={toDate}
        onFromDate={setFromDate}
        onToDate={setToDate}
        onLoad={() => void load()}
        loading={loading}
        error={error}
        exportFilename="vendor-ledger"
        headerActions={
          canPay && vendorId ? (
            <Button
              size="sm"
              type="button"
              onClick={() =>
                router.push(`/transactions/pay?vendorId=${encodeURIComponent(vendorId)}`)
              }
            >
              <ArrowUpRight size={14} />
              Make payment
            </Button>
          ) : null
        }
        statement={
          ledger
            ? {
                title: `${ledger.partyCode} — ${ledger.partyName}`,
                subtitle: "Vendor payables",
                fromDate: ledger.fromDate,
                toDate: ledger.toDate,
                openingBalance: ledger.openingBalance,
                openingSide: ledger.openingSide,
                closingBalance: ledger.closingBalance,
                closingSide: ledger.closingSide,
                totalDebit: ledger.totalDebit,
                totalCredit: ledger.totalCredit,
                lines: ledger.lines,
                documents: ledger.documents,
              }
            : null
        }
      />
    </AppShell>
  );
}
