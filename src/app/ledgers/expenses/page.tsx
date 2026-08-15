"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { LedgerInquiry } from "@/components/ops/LedgerInquiry";
import { getApi } from "@/lib/api";
import type { Account, AccountLedger } from "@shared/ipc";

function AccountTypeLedgerPage({
  title,
  subtitle,
  accountType,
  exportFilename,
}: {
  title: string;
  subtitle: string;
  accountType: "expense" | "income";
  exportFilename: string;
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
      setLedger(null);
      return;
    }
    setLedger(res.data);
  }, [accountId, fromDate, toDate]);

  const items = useMemo(
    () =>
      accounts.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        hint: a.accountType.replace(/_/g, " "),
      })),
    [accounts]
  );

  return (
    <AppShell title={title} subtitle={subtitle} permission="ledgers.view">
      <LedgerInquiry
        title={accountType === "expense" ? "Expense heads" : "Income heads"}
        subtitle={`Pick a ${accountType} account for its statement`}
        pickerLabel="Account"
        items={items}
        selectedId={accountId}
        onSelect={setAccountId}
        fromDate={fromDate}
        toDate={toDate}
        onFromDate={setFromDate}
        onToDate={setToDate}
        onLoad={() => void load()}
        loading={loading}
        error={error}
        exportFilename={exportFilename}
        emptyHint={`Choose a ${accountType} account from the left to see period movements and closing balance.`}
        statement={
          ledger
            ? {
                title: `${ledger.account.name}`,
                subtitle: `${accountType} account`,
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

export default function ExpenseLedgerPage() {
  return (
    <AccountTypeLedgerPage
      title="Expense Ledger"
      subtitle="Expense account movements"
      accountType="expense"
      exportFilename="expense-ledger"
    />
  );
}
