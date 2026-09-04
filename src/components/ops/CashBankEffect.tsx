"use client";

import type { PaymentMode } from "@shared/ipc";

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
