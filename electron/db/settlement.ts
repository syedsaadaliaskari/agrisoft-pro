import type { Db } from "./index";
import { eq } from "drizzle-orm";
import type { PaymentMode } from "../../shared/ipc";
import { requireAccountByCode } from "./accounts";
import { money } from "./ledger";
import { voucherEntries } from "./schema";

export type SettlementInput = {
  paymentMode?: PaymentMode | string | null;
  paidAmount?: number | null;
  cashPaid?: number | null;
  bankPaid?: number | null;
  accountId?: string | null;
  cashAccountId?: string | null;
  bankAccountId?: string | null;
  grandTotal: number;
};

export type ResolvedSettlement = {
  cashPaid: number;
  bankPaid: number;
  paidAmount: number;
  due: number;
  paymentMode: PaymentMode;
  cashAccountId: string | null;
  bankAccountId: string | null;
  /** Primary cash/bank account for voucher header */
  headerAccountId: string | null;
};

/** Resolve cash / bank / credit split for a sale or purchase bill. */
export function resolveSettlement(db: Db, input: SettlementInput): ResolvedSettlement | { error: string } {
  const grandTotal = money(input.grandTotal);
  if (grandTotal < 0) return { error: "Grand total cannot be negative" };

  const hasSplitFields = input.cashPaid != null || input.bankPaid != null;
  let cashPaid = 0;
  let bankPaid = 0;

  if (hasSplitFields) {
    cashPaid = money(Number(input.cashPaid ?? 0));
    bankPaid = money(Number(input.bankPaid ?? 0));
  } else {
    const mode = (input.paymentMode || "cash") as string;
    let paid = money(Number(input.paidAmount ?? 0));
    if ((mode === "cash" || mode === "bank") && paid <= 0) paid = grandTotal;
    if (mode === "credit" && (input.paidAmount == null || Number.isNaN(Number(input.paidAmount)))) {
      paid = 0;
    }
    if (paid < 0) return { error: "Paid amount cannot be negative" };
    if (paid > grandTotal) return { error: "Paid amount cannot exceed grand total" };

    if (mode === "bank") {
      bankPaid = paid;
      cashPaid = 0;
    } else if (mode === "credit") {
      // Partial payment on a credit bill → cash by default unless account is bank
      if (paid > 0 && input.accountId) {
        const acct = requireAccountByCode(db, "1200", "Bank");
        if (input.accountId === acct.id) {
          bankPaid = paid;
          cashPaid = 0;
        } else {
          cashPaid = paid;
          bankPaid = 0;
        }
      } else {
        cashPaid = paid;
        bankPaid = 0;
      }
    } else if (mode === "split") {
      return { error: "Split settlement requires cash and bank amounts" };
    } else {
      // cash (default)
      cashPaid = paid;
      bankPaid = 0;
    }
  }

  if (Number.isNaN(cashPaid) || Number.isNaN(bankPaid)) return { error: "Invalid paid amounts" };
  if (cashPaid < 0 || bankPaid < 0) return { error: "Paid amounts cannot be negative" };

  const paidAmount = money(cashPaid + bankPaid);
  if (paidAmount > grandTotal) return { error: "Paid amount cannot exceed grand total" };
  const due = money(grandTotal - paidAmount);

  const defaultCash = requireAccountByCode(db, "1100", "Cash").id;
  const defaultBank = requireAccountByCode(db, "1200", "Bank").id;

  let cashAccountId: string | null = null;
  let bankAccountId: string | null = null;

  if (cashPaid > 0) {
    cashAccountId = input.cashAccountId || (input.accountId && !bankPaid ? input.accountId : null) || defaultCash;
  }
  if (bankPaid > 0) {
    bankAccountId = input.bankAccountId || (input.accountId && !cashPaid ? input.accountId : null) || defaultBank;
  }

  // Prefer explicit accountId when only one side is paid
  if (cashPaid > 0 && bankPaid === 0 && input.accountId) cashAccountId = input.accountId;
  if (bankPaid > 0 && cashPaid === 0 && input.accountId) bankAccountId = input.accountId;

  let paymentMode: PaymentMode;
  if (paidAmount === 0) paymentMode = "credit";
  else if (cashPaid > 0 && bankPaid > 0) paymentMode = "split";
  else if (bankPaid > 0) paymentMode = "bank";
  else paymentMode = "cash";

  const headerAccountId = cashAccountId || bankAccountId || null;

  return {
    cashPaid,
    bankPaid,
    paidAmount,
    due,
    paymentMode,
    cashAccountId,
    bankAccountId,
    headerAccountId,
  };
}

/** Read cash/bank legs already posted on a voucher (sales debit, purchases credit). */
export function cashBankFromVoucher(
  db: Db,
  voucherId: string,
  side: "debit" | "credit"
): { cashPaid: number; bankPaid: number; cashAccountId: string; bankAccountId: string } {
  const cash = requireAccountByCode(db, "1100", "Cash");
  const bank = requireAccountByCode(db, "1200", "Bank");
  const entries = db.select().from(voucherEntries).where(eq(voucherEntries.voucherId, voucherId)).all();
  let cashPaid = 0;
  let bankPaid = 0;
  for (const e of entries) {
    const amt = side === "debit" ? Number(e.debit) : Number(e.credit);
    if (e.accountId === cash.id) cashPaid = money(cashPaid + amt);
    if (e.accountId === bank.id) bankPaid = money(bankPaid + amt);
  }
  return {
    cashPaid,
    bankPaid,
    cashAccountId: cash.id,
    bankAccountId: bank.id,
  };
}

/** Split a refund/reversal amount across cash and bank in the same ratio as the original paid legs. */
export function splitReversalAcrossCashBank(
  reversePaidTotal: number,
  originalCashPaid: number,
  originalBankPaid: number
): { cashPart: number; bankPart: number } {
  const paid = money(originalCashPaid + originalBankPaid);
  if (paid <= 0 || reversePaidTotal <= 0) return { cashPart: 0, bankPart: 0 };
  const cashPart = money(reversePaidTotal * (originalCashPaid / paid));
  const bankPart = money(reversePaidTotal - cashPart);
  return { cashPart, bankPart };
}
