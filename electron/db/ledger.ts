import { randomUUID } from "crypto";
import { and, eq, gte, lte, sql, asc } from "drizzle-orm";
import type { Db } from "./index";
import { accounts, voucherEntries, vouchers } from "./schema";
import type { BalanceType, LedgerLine, VoucherType } from "../../shared/ipc";

export function money(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function insertVoucherEntry(
  db: Db,
  voucherId: string,
  accountId: string,
  debit: number,
  credit: number,
  narration: string,
  lineOrder: number
) {
  if (money(debit) === 0 && money(credit) === 0) return;
  db.insert(voucherEntries)
    .values({
      id: randomUUID(),
      voucherId,
      accountId,
      debit: money(debit),
      credit: money(credit),
      narration,
      lineOrder,
    })
    .run();
}

export function accountSignedBalance(opening: number, debit: number, credit: number, accountType: string) {
  // Assets/expenses increase with debit; liabilities/equity/income with credit
  const isDebitNature = accountType === "asset" || accountType === "expense";
  const movement = isDebitNature ? debit - credit : credit - debit;
  const closing = opening + movement;
  const side: BalanceType = closing >= 0 ? (isDebitNature ? "debit" : "credit") : isDebitNature ? "credit" : "debit";
  return { balance: Math.abs(closing), side, signed: closing };
}

export function sumAccountEntries(
  db: Db,
  accountId: string,
  opts?: { beforeDate?: string | null; fromDate?: string | null; toDate?: string | null; postedOnly?: boolean }
) {
  const conditions = [eq(voucherEntries.accountId, accountId)];
  if (opts?.postedOnly !== false) {
    conditions.push(eq(vouchers.status, "posted"));
  }
  if (opts?.beforeDate) {
    conditions.push(lte(vouchers.voucherDate, opts.beforeDate));
    // strictly before: use < by subtracting — for opening we want date < fromDate
  }
  if (opts?.fromDate) conditions.push(gte(vouchers.voucherDate, opts.fromDate));
  if (opts?.toDate) conditions.push(lte(vouchers.voucherDate, opts.toDate));

  const row = db
    .select({
      debit: sql<number>`coalesce(sum(${voucherEntries.debit}), 0)`,
      credit: sql<number>`coalesce(sum(${voucherEntries.credit}), 0)`,
    })
    .from(voucherEntries)
    .innerJoin(vouchers, eq(voucherEntries.voucherId, vouchers.id))
    .where(and(...conditions))
    .get();

  return { debit: Number(row?.debit ?? 0), credit: Number(row?.credit ?? 0) };
}

/** Opening = account.openingBalance adjusted by posted entries before fromDate */
export function computeAccountOpening(db: Db, accountId: string, fromDate?: string | null) {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) return null;

  let debit = 0;
  let credit = 0;
  if (fromDate) {
    const prior = db
      .select({
        debit: sql<number>`coalesce(sum(${voucherEntries.debit}), 0)`,
        credit: sql<number>`coalesce(sum(${voucherEntries.credit}), 0)`,
      })
      .from(voucherEntries)
      .innerJoin(vouchers, eq(voucherEntries.voucherId, vouchers.id))
      .where(
        and(
          eq(voucherEntries.accountId, accountId),
          eq(vouchers.status, "posted"),
          sql`${vouchers.voucherDate} < ${fromDate}`
        )
      )
      .get();
    debit = Number(prior?.debit ?? 0);
    credit = Number(prior?.credit ?? 0);
  }

  const result = accountSignedBalance(account.openingBalance, debit, credit, account.accountType);
  return { account, ...result };
}

export function listAccountLedgerLines(
  db: Db,
  accountId: string,
  fromDate?: string | null,
  toDate?: string | null
): LedgerLine[] {
  const conditions = [eq(voucherEntries.accountId, accountId), eq(vouchers.status, "posted")];
  if (fromDate) conditions.push(gte(vouchers.voucherDate, fromDate));
  if (toDate) conditions.push(lte(vouchers.voucherDate, toDate));

  const rows = db
    .select({
      date: vouchers.voucherDate,
      voucherId: vouchers.id,
      voucherNo: vouchers.voucherNo,
      voucherType: vouchers.voucherType,
      narration: voucherEntries.narration,
      debit: voucherEntries.debit,
      credit: voucherEntries.credit,
    })
    .from(voucherEntries)
    .innerJoin(vouchers, eq(voucherEntries.voucherId, vouchers.id))
    .where(and(...conditions))
    .orderBy(asc(vouchers.voucherDate), asc(vouchers.createdAt))
    .all();

  return rows.map((r) => ({
    date: r.date,
    voucherId: r.voucherId,
    voucherNo: r.voucherNo,
    voucherType: r.voucherType as VoucherType,
    narration: r.narration,
    debit: r.debit,
    credit: r.credit,
    balance: 0,
  }));
}

export function partySignedBalance(opening: number, balanceType: BalanceType, debit: number, credit: number) {
  // Customer debit nature (owes us); vendor credit nature (we owe)
  const openingSigned = balanceType === "debit" ? opening : -opening;
  const signed = openingSigned + debit - credit;
  return {
    balance: Math.abs(signed),
    side: (signed >= 0 ? "debit" : "credit") as BalanceType,
    signed,
  };
}
