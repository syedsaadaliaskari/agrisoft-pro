import { and, eq, sql } from "drizzle-orm";
import type { CashBankMove, CashBankSnapshot, VoucherType } from "../../shared/ipc";
import type { Db } from "./index";
import { requireAccountByCode } from "./accounts";
import { computeAccountOpening, money, sumAccountEntries } from "./ledger";
import { voucherEntries, vouchers } from "./schema";
import { getSettingsMap } from "./settings";

export function localToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function bookFor(db: Db, accountId: string, date: string) {
  const opening = computeAccountOpening(db, accountId, date);
  const openingToday = money(opening?.signed ?? 0);
  const move = sumAccountEntries(db, accountId, { fromDate: date, toDate: date });
  const inToday = money(move.debit);
  const outToday = money(move.credit);
  return {
    openingBalance: money(opening?.account.openingBalance ?? 0),
    openingToday,
    inToday,
    outToday,
    closingToday: money(openingToday + inToday - outToday),
  };
}

const TYPE_ORDER: VoucherType[] = [
  "sale",
  "sale_return",
  "purchase",
  "purchase_return",
  "receipt",
  "payment",
  "income",
  "expense",
  "owner_draw",
  "journal",
];

/** Opening + today's in/out for cash and bank, plus movement by voucher type. */
export function getCashBankSnapshot(db: Db, date = localToday()): CashBankSnapshot {
  const settings = getSettingsMap(db);
  const cash = requireAccountByCode(db, "1100", "Cash");
  const bank = requireAccountByCode(db, "1200", "Bank");

  const rows = db
    .select({
      voucherType: vouchers.voucherType,
      accountId: voucherEntries.accountId,
      debit: sql<number>`coalesce(sum(${voucherEntries.debit}), 0)`,
      credit: sql<number>`coalesce(sum(${voucherEntries.credit}), 0)`,
    })
    .from(voucherEntries)
    .innerJoin(vouchers, eq(voucherEntries.voucherId, vouchers.id))
    .where(
      and(
        eq(vouchers.status, "posted"),
        eq(vouchers.voucherDate, date),
        sql`(${voucherEntries.accountId} = ${cash.id} or ${voucherEntries.accountId} = ${bank.id})`
      )
    )
    .groupBy(vouchers.voucherType, voucherEntries.accountId)
    .all();

  const byType = new Map<string, CashBankMove>();
  const take = (type: string) => {
    let row = byType.get(type);
    if (!row) {
      row = {
        voucherType: type as VoucherType,
        cashIn: 0,
        cashOut: 0,
        bankIn: 0,
        bankOut: 0,
      };
      byType.set(type, row);
    }
    return row;
  };

  for (const r of rows) {
    const row = take(r.voucherType);
    const debit = money(Number(r.debit || 0));
    const credit = money(Number(r.credit || 0));
    if (r.accountId === cash.id) {
      row.cashIn = money(row.cashIn + debit);
      row.cashOut = money(row.cashOut + credit);
    } else if (r.accountId === bank.id) {
      row.bankIn = money(row.bankIn + debit);
      row.bankOut = money(row.bankOut + credit);
    }
  }

  const todayMoves: CashBankMove[] = [];
  for (const type of TYPE_ORDER) {
    const row = byType.get(type);
    if (row && (row.cashIn || row.cashOut || row.bankIn || row.bankOut)) todayMoves.push(row);
  }
  for (const [type, row] of byType) {
    if (TYPE_ORDER.includes(type as VoucherType)) continue;
    if (row.cashIn || row.cashOut || row.bankIn || row.bankOut) todayMoves.push(row);
  }

  return {
    currencySymbol: settings.currency_symbol || "Rs",
    cash: bookFor(db, cash.id, date),
    bank: bookFor(db, bank.id, date),
    todayMoves,
  };
}
