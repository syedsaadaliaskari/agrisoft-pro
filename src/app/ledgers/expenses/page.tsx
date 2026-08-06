"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { Alert, Button, DataTable, Input, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { Account, AccountLedger } from "@shared/ipc";

function AccountTypeLedger({
  title,
  subtitle,
  accountType,
}: {
  title: string;
  subtitle: string;
  accountType: "expense" | "income";
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [ledger, setLedger] = useState<AccountLedger | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getApi()
      .listAccounts({ accountType, activeOnly: true })
      .then((res) => {
        if (res.ok) {
          setAccounts(res.data);
          if (res.data[0]) setAccountId(res.data[0].id);
        }
      });
  }, [accountType]);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError("");
    const res = await getApi().getAccountLedger(accountId, {
      fromDate: fromDate || null,
      toDate: toDate || null,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLedger(res.data);
  }, [accountId, fromDate, toDate]);

  return (
    <AppShell title={title} subtitle={subtitle} permission="ledgers.view">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Select
          label="Account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
        />
        <Input label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <div className="flex items-end gap-2">
          <Button onClick={() => void load()} disabled={!accountId || loading}>
            {loading ? "Loading..." : "Load ledger"}
          </Button>
          <ExportMenu
            filename={`${accountType}-ledger`}
            title={`${title} lines`}
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
              Closing {ledger.closingBalance.toLocaleString()} {ledger.closingSide}
            </span>
            <span>Dr {ledger.totalDebit.toLocaleString()}</span>
            <span>Cr {ledger.totalCredit.toLocaleString()}</span>
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
        <p className="text-sm text-[var(--text-muted)]">Select an account and load the ledger.</p>
      )}
    </AppShell>
  );
}

export default function ExpenseLedgerPage() {
  return (
    <AccountTypeLedger title="Expense Ledger" subtitle="Expense account movements" accountType="expense" />
  );
}
