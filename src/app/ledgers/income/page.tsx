"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { LedgerInquiry } from "@/components/ops/LedgerInquiry";
import { Button } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type { Account, AccountLedger } from "@shared/ipc";

export default function IncomeLedgerPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, "transactions.create");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [ledger, setLedger] = useState<AccountLedger | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getApi()
      .listAccounts({ accountType: "income", activeOnly: true })
      .then((res) => {
        if (res.ok) {
          setAccounts(res.data);
          if (res.data[0]) setAccountId(res.data[0].id);
        }
      });
  }, []);

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
    <AppShell title="Income Ledger" subtitle="Income account movements" permission="ledgers.view">
      <LedgerInquiry
        title="Income heads"
        subtitle="Pick an income account for its statement"
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
        exportFilename="income-ledger"
        headerActions={
          canCreate ? (
            <Button
              size="sm"
              type="button"
              onClick={() =>
                router.push(
                  accountId
                    ? `/transactions/income?incomeAccountId=${encodeURIComponent(accountId)}`
                    : "/transactions/income"
                )
              }
            >
              <Plus size={14} />
              New income
            </Button>
          ) : null
        }
        statement={
          ledger
            ? {
                title: `${ledger.account.name}`,
                subtitle: "Income account",
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
