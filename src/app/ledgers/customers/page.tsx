"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { Alert, Button, DataTable, Input, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { Customer, PartyLedger } from "@shared/ipc";

export default function CustomerLedgerPage() {
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
      return;
    }
    setLedger(res.data);
  }, [customerId, fromDate, toDate]);

  return (
    <AppShell title="Customer Ledger" subtitle="Receivables by customer" permission="ledgers.view">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Select
          label="Customer"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          options={customers.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
        />
        <Input label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <div className="flex items-end gap-2">
          <Button onClick={() => void load()} disabled={!customerId || loading}>
            {loading ? "Loading..." : "Load ledger"}
          </Button>
          <ExportMenu
            filename="customer-ledger"
            title="Customer ledger"
            columns={[
              { key: "date", label: "Date" },
              { key: "voucherNo", label: "Voucher" },
              { key: "voucherType", label: "Type" },
              { key: "narration", label: "Narration" },
              { key: "debit", label: "Debit" },
              { key: "credit", label: "Credit" },
              { key: "balance", label: "Balance" },
            ]}
            rows={
              ledger?.lines.map((l) => ({
                date: l.date,
                voucherNo: l.voucherNo,
                voucherType: l.voucherType.replace("_", " "),
                narration: l.narration ?? "",
                debit: l.debit ?? "",
                credit: l.credit ?? "",
                balance: l.balance,
              })) ?? []
            }
          />
        </div>
      </div>
      {ledger ? (
        <>
          <div className="mb-3 flex flex-wrap gap-4 text-sm">
            <span>
              {ledger.partyCode} {ledger.partyName}
            </span>
            <span>
              Opening {ledger.openingBalance.toLocaleString()} {ledger.openingSide}
            </span>
            <span>
              Closing {ledger.closingBalance.toLocaleString()} {ledger.closingSide}
            </span>
          </div>
          <DataTable
            headers={["Date", "Voucher", "Type", "Narration", "Debit", "Credit", "Balance"]}
            empty={ledger.lines.length === 0}
          >
            {ledger.lines.map((l, i) => (
              <tr key={`${l.voucherId}-${i}`} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3">{l.date}</td>
                <td className="px-4 py-3 font-mono text-xs">{l.voucherNo}</td>
                <td className="px-4 py-3 capitalize">{l.voucherType.replace("_", " ")}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{l.narration || "—"}</td>
                <td className="px-4 py-3">{l.debit ? l.debit.toLocaleString() : ""}</td>
                <td className="px-4 py-3">{l.credit ? l.credit.toLocaleString() : ""}</td>
                <td className="px-4 py-3 font-medium">{l.balance.toLocaleString()}</td>
              </tr>
            ))}
          </DataTable>
        </>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">Select a customer and load the ledger.</p>
      )}
    </AppShell>
  );
}
