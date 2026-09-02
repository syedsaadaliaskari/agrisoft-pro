"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApi } from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";
import type { CashBankSnapshot, PaymentMode } from "@shared/ipc";

function signed(n: number) {
  const v = Math.round(Number(n || 0) * 100) / 100;
  const abs = formatMoney(Math.abs(v));
  if (Math.abs(v) < 0.005) return abs;
  return `${v > 0 ? "+" : "−"}${abs}`;
}

/** Signed amount: debit cash/bank increases the book, credit decreases it. */
export function signedMoneyFlow(flow: "in" | "out", amount: number) {
  const n = Math.round(Number(amount || 0) * 100) / 100;
  return flow === "in" ? n : -n;
}

export function refundCashBank(
  grand: number,
  refundMode: PaymentMode,
  linked?: { paidAmount: number; grandTotal: number; cashPaid?: number; bankPaid?: number } | null
) {
  const total = Math.round(Number(grand || 0) * 100) / 100;
  if (total <= 0) return { cash: 0, bank: 0 };
  if (linked && linked.grandTotal > 0) {
    const origCash = Number(linked.cashPaid ?? (linked.paidAmount && linked.bankPaid == null ? linked.paidAmount : 0));
    const origBank = Number(linked.bankPaid ?? 0);
    const origPaid = Math.round((origCash + origBank) * 100) / 100 || Number(linked.paidAmount || 0);
    const reversePaid = Math.round(total * Math.min(1, Math.max(0, origPaid / linked.grandTotal)) * 100) / 100;
    if (origPaid <= 0 || reversePaid <= 0) return { cash: 0, bank: 0 };
    const cash = Math.round(reversePaid * (origCash / origPaid) * 100) / 100;
    return { cash, bank: Math.round((reversePaid - cash) * 100) / 100 };
  }
  if (refundMode === "bank") return { cash: 0, bank: total };
  if (refundMode === "credit") return { cash: 0, bank: 0 };
  return { cash: total, bank: 0 };
}

function BookRow({
  label,
  now,
  delta,
  after,
}: {
  label: string;
  now: number;
  delta: number;
  after: number;
}) {
  const up = delta > 0.004;
  const down = delta < -0.004;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-sm">
      <span className="w-10 shrink-0 font-medium text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 flex-1 break-all tabular-nums">{formatMoney(now)}</span>
      <span
        className={cn(
          "shrink-0 tabular-nums font-semibold",
          up ? "text-[var(--success)]" : down ? "text-[var(--danger)]" : "text-[var(--text-muted)]"
        )}
      >
        {signed(delta)}
      </span>
      <span className="w-full break-all tabular-nums font-semibold sm:w-auto">
        → {formatMoney(after)}
      </span>
    </div>
  );
}

/** Live cash/bank totals: now, this document's +/−, and after save. */
export function CashBankEffect({
  cashDelta,
  bankDelta,
  replaceCashDelta = 0,
  replaceBankDelta = 0,
}: {
  cashDelta: number;
  bankDelta: number;
  replaceCashDelta?: number;
  replaceBankDelta?: number;
}) {
  const [snap, setSnap] = useState<CashBankSnapshot | null>(null);
  const hadMove = useRef(false);

  const load = useCallback(async () => {
    const api = getApi();
    if (typeof api.getCashBankSnapshot === "function") {
      const res = await api.getCashBankSnapshot();
      if (res.ok) {
        setSnap(res.data);
        return;
      }
    }
    const dash = await api.getDashboardSummary();
    if (!dash.ok) return;
    const d = dash.data;
    setSnap({
      currencySymbol: d.currencySymbol,
      cash: {
        openingBalance: 0,
        openingToday: d.cashOpeningToday,
        inToday: d.cashInToday,
        outToday: d.cashOutToday,
        closingToday: d.cashClosingToday,
      },
      bank: {
        openingBalance: 0,
        openingToday: d.bankOpeningToday ?? 0,
        inToday: d.bankInToday ?? 0,
        outToday: d.bankOutToday ?? 0,
        closingToday: d.bankClosingToday ?? d.bankBalance,
      },
      todayMoves: d.cashBankMovesToday ?? [],
    });
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    const moving = Math.abs(cashDelta) > 0.004 || Math.abs(bankDelta) > 0.004;
    if (moving) {
      hadMove.current = true;
      return;
    }
    if (hadMove.current) {
      hadMove.current = false;
      void load();
    }
  }, [cashDelta, bankDelta, load]);

  const netCash = Math.round((Number(cashDelta || 0) - Number(replaceCashDelta || 0)) * 100) / 100;
  const netBank = Math.round((Number(bankDelta || 0) - Number(replaceBankDelta || 0)) * 100) / 100;
  const cashNow = snap?.cash.closingToday ?? 0;
  const bankNow = snap?.bank.closingToday ?? 0;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2.5 space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Cash & bank after this
      </p>
      <BookRow label="Cash" now={cashNow} delta={netCash} after={cashNow + netCash} />
      <BookRow label="Bank" now={bankNow} delta={netBank} after={bankNow + netBank} />
    </div>
  );
}
