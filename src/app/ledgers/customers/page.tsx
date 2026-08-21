"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { LedgerInquiry } from "@/components/ops/LedgerInquiry";
import { Button } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type { Customer, PartyLedger } from "@shared/ipc";

export default function CustomerLedgerPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canReceive = hasPermission(user, "transactions.create");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [ledger, setLedger] = useState<PartyLedger | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getApi()
      .listCustomers()
      .then((res) => {
        if (res.ok) {
          setCustomers(res.data);
          if (res.data[0]) setCustomerId(res.data[0].id);
        }
      });
  }, []);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError("");
    const res = await getApi().getPartyLedger("customer", customerId, {
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
  }, [customerId, fromDate, toDate]);

  const items = useMemo(
    () =>
      customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        hint: c.city || c.phone || undefined,
      })),
    [customers]
  );

  return (
    <AppShell title="Customer Ledger" subtitle="Receivables by customer" permission="ledgers.view">
      <LedgerInquiry
        title="Customers"
        subtitle="Pick a party to open receivables"
        pickerLabel="Customer"
        items={items}
        selectedId={customerId}
        onSelect={setCustomerId}
        fromDate={fromDate}
        toDate={toDate}
        onFromDate={setFromDate}
        onToDate={setToDate}
        onLoad={() => void load()}
        loading={loading}
        error={error}
        exportFilename="customer-ledger"
        emptyHint="Choose a customer from the left to see sales, receipts, returns, and running balance."
        headerActions={
          canReceive && customerId ? (
            <Button
              size="sm"
              type="button"
              onClick={() =>
                router.push(`/transactions/receive?customerId=${encodeURIComponent(customerId)}`)
              }
            >
              <ArrowDownLeft size={14} />
              Receive payment
            </Button>
          ) : null
        }
        statement={
          ledger
            ? {
                title: `${ledger.partyCode} — ${ledger.partyName}`,
                subtitle: "Customer receivables",
                fromDate: ledger.fromDate,
                toDate: ledger.toDate,
                openingBalance: ledger.openingBalance,
                openingSide: ledger.openingSide,
                closingBalance: ledger.closingBalance,
                closingSide: ledger.closingSide,
                totalDebit: ledger.totalDebit,
                totalCredit: ledger.totalCredit,
                lines: ledger.lines,
              }
            : null
        }
      />
    </AppShell>
  );
}
