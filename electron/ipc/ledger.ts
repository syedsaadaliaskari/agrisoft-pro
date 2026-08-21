import { registerHandler } from "./register";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  IPC,
  type ActionResult,
  type Voucher,
  type VoucherEntry,
  type PostVoucherInput,
  type AccountLedger,
  type PartyLedger,
  type LedgerQuery,
  type VoucherListFilter,
  type ReceivePaymentInput,
  type MakePaymentInput,
  type ExpenseVoucherInput,
  type IncomeVoucherInput,
  type OwnerDrawInput,
  type PartyType,
  type Account,
  type VoucherType,
} from "../../shared/ipc";
import { getDb } from "../db";
import { nextDocumentNumber } from "../db/counters";
import { requireAccountByCode } from "../db/accounts";
import { writeAuditLog } from "../db/audit";
import {
  computeAccountOpening,
  insertVoucherEntry,
  listAccountLedgerLines,
  money,
  partySignedBalance,
} from "../db/ledger";
import {
  vouchers,
  voucherEntries,
  accounts,
  customers,
  vendors,
} from "../db/schema";
import { requirePermission, getCurrentSession, PermissionError } from "./session";

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}
function asError(err: unknown, fallback = "Request failed"): string {
  if (err instanceof PermissionError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
function nowIso() {
  return new Date().toISOString();
}
type Handler<T> = () => Promise<ActionResult<T>> | ActionResult<T>;
async function guarded<T>(check: () => void, fn: Handler<T>): Promise<ActionResult<T>> {
  try {
    check();
    return await fn();
  } catch (err) {
    return fail(asError(err));
  }
}

function mapAccount(row: typeof accounts.$inferSelect): Account {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    accountType: row.accountType as Account["accountType"],
    parentId: row.parentId,
    isSystem: row.isSystem,
    isActive: row.isActive,
    openingBalance: row.openingBalance,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEntry(row: typeof voucherEntries.$inferSelect, acct?: typeof accounts.$inferSelect | null): VoucherEntry {
  return {
    id: row.id,
    voucherId: row.voucherId,
    accountId: row.accountId,
    accountCode: acct?.code,
    accountName: acct?.name,
    debit: row.debit,
    credit: row.credit,
    narration: row.narration,
    lineOrder: row.lineOrder,
  };
}

function enrichVoucher(id: string): Voucher | null {
  const db = getDb();
  const row = db.select().from(vouchers).where(eq(vouchers.id, id)).get();
  if (!row) return null;

  let partyName: string | null = null;
  if (row.partyType === "customer" && row.partyId) {
    partyName = db.select().from(customers).where(eq(customers.id, row.partyId)).get()?.name ?? null;
  } else if (row.partyType === "vendor" && row.partyId) {
    partyName = db.select().from(vendors).where(eq(vendors.id, row.partyId)).get()?.name ?? null;
  }
  const acct = row.accountId
    ? db.select().from(accounts).where(eq(accounts.id, row.accountId)).get()
    : null;

  const entries = db
    .select()
    .from(voucherEntries)
    .where(eq(voucherEntries.voucherId, id))
    .orderBy(asc(voucherEntries.lineOrder))
    .all()
    .map((e) => {
      const a = db.select().from(accounts).where(eq(accounts.id, e.accountId)).get();
      return mapEntry(e, a);
    });

  return {
    id: row.id,
    voucherNo: row.voucherNo,
    voucherType: row.voucherType as Voucher["voucherType"],
    voucherDate: row.voucherDate,
    partyType: row.partyType as Voucher["partyType"],
    partyId: row.partyId,
    partyName,
    accountId: row.accountId,
    accountName: acct?.name ?? null,
    referenceNo: row.referenceNo,
    notes: row.notes,
    subtotal: row.subtotal,
    discountAmount: row.discountAmount,
    additionAmount: row.additionAmount,
    taxAmount: row.taxAmount,
    grandTotal: row.grandTotal,
    paidAmount: row.paidAmount,
    status: row.status as Voucher["status"],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    entries,
  };
}

function validateBalanced(entries: { debit: number; credit: number }[]) {
  const d = money(entries.reduce((s, e) => s + Number(e.debit || 0), 0));
  const c = money(entries.reduce((s, e) => s + Number(e.credit || 0), 0));
  if (d !== c) throw new Error(`Voucher not balanced: debit ${d} vs credit ${c}`);
  if (d === 0) throw new Error("Voucher has no amounts");
}

export function registerLedgerHandlers(): void {
  registerHandler(IPC.VOUCHERS_POST, async (_e, input: PostVoucherInput): Promise<ActionResult<Voucher>> =>
    guarded(() => requirePermission("transactions.create"), async () => {
      if (!input.entries?.length) return fail("Entries required");
      validateBalanced(input.entries);
      const db = getDb();
      const session = getCurrentSession();
      const docType =
        input.voucherType === "payment"
          ? "payment"
          : input.voucherType === "receipt"
            ? "receipt"
            : input.voucherType === "expense"
              ? "expense"
              : input.voucherType === "income"
                ? "income"
                : "journal";
      const voucherNo = nextDocumentNumber(db, docType);
      const id = randomUUID();
      const ts = nowIso();
      const total = money(input.entries.reduce((s, e) => s + Number(e.debit || 0), 0));

      db.insert(vouchers)
        .values({
          id,
          voucherNo,
          voucherType: input.voucherType,
          voucherDate: input.voucherDate,
          partyType: input.partyType ?? null,
          partyId: input.partyId ?? null,
          accountId: input.accountId ?? null,
          referenceNo: input.referenceNo?.trim() || null,
          notes: input.notes?.trim() || null,
          subtotal: money(input.subtotal ?? total),
          discountAmount: money(input.discountAmount ?? 0),
          additionAmount: money(input.additionAmount ?? 0),
          taxAmount: money(input.taxAmount ?? 0),
          grandTotal: money(input.grandTotal ?? total),
          paidAmount: money(input.paidAmount ?? total),
          status: "posted",
          createdBy: session?.id ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      input.entries.forEach((e, i) => {
        const acct = db.select().from(accounts).where(eq(accounts.id, e.accountId)).get();
        if (!acct) throw new Error(`Account not found: ${e.accountId}`);
        insertVoucherEntry(db, id, e.accountId, Number(e.debit || 0), Number(e.credit || 0), e.narration || "", i);
      });

      writeAuditLog(db, {
        userId: session?.id ?? null,
        action: "create",
        module: "transactions",
        entityId: id,
        details: `${input.voucherType} ${voucherNo}`,
      });
      return ok(enrichVoucher(id)!);
    })
  );

  registerHandler(IPC.VOUCHERS_GET, async (_e, id: string): Promise<ActionResult<Voucher>> =>
    guarded(() => requirePermission("transactions.view"), async () => {
      const v = enrichVoucher(id);
      if (!v) return fail("Voucher not found");
      return ok(v);
    })
  );

  registerHandler(IPC.VOUCHERS_LIST, async (_e, filter?: VoucherListFilter): Promise<ActionResult<Voucher[]>> =>
    guarded(() => requirePermission("transactions.create"), async () => {
      const db = getDb();
      const types = filter?.voucherType
        ? Array.isArray(filter.voucherType)
          ? filter.voucherType
          : [filter.voucherType]
        : null;

      let rows = db.select().from(vouchers).orderBy(desc(vouchers.voucherDate), desc(vouchers.createdAt)).all();
      if (types?.length) {
        rows = rows.filter((r) => types.includes(r.voucherType as VoucherType));
      }
      if (!filter?.includeCancelled) {
        rows = rows.filter((r) => r.status !== "cancelled");
      }
      return ok(rows.map((r) => enrichVoucher(r.id)!).filter(Boolean));
    })
  );

  registerHandler(IPC.VOUCHERS_CANCEL, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("transactions.create"), async () => {
      const db = getDb();
      const row = db.select().from(vouchers).where(eq(vouchers.id, id)).get();
      if (!row) return fail("Voucher not found");
      if (row.status === "cancelled") return fail("Already cancelled");
      db.update(vouchers)
        .set({ status: "cancelled", updatedAt: nowIso() })
        .where(eq(vouchers.id, id))
        .run();
      return ok(undefined);
    })
  );

  registerHandler(
    IPC.VOUCHERS_UPDATE,
    async (_e, id: string, input: PostVoucherInput): Promise<ActionResult<Voucher>> =>
      guarded(() => requirePermission("transactions.create"), async () => {
        if (!input.entries?.length) return fail("Entries required");
        validateBalanced(input.entries);
        const db = getDb();
        const existing = db.select().from(vouchers).where(eq(vouchers.id, id)).get();
        if (!existing || existing.voucherType !== "journal") return fail("Journal voucher not found");
        if (existing.status === "cancelled") return fail("Cannot edit cancelled voucher");

        const session = getCurrentSession();
        const ts = nowIso();
        const total = money(input.entries.reduce((s, e) => s + Number(e.debit || 0), 0));

        db.delete(voucherEntries).where(eq(voucherEntries.voucherId, id)).run();
        db.update(vouchers)
          .set({
            voucherDate: input.voucherDate,
            partyType: input.partyType ?? null,
            partyId: input.partyId ?? null,
            accountId: input.accountId ?? null,
            referenceNo: input.referenceNo?.trim() || null,
            notes: input.notes?.trim() || null,
            subtotal: money(input.subtotal ?? total),
            discountAmount: money(input.discountAmount ?? 0),
            additionAmount: money(input.additionAmount ?? 0),
            taxAmount: money(input.taxAmount ?? 0),
            grandTotal: money(input.grandTotal ?? total),
            paidAmount: money(input.paidAmount ?? total),
            status: "posted",
            updatedAt: ts,
          })
          .where(eq(vouchers.id, id))
          .run();

        input.entries.forEach((e, i) => {
          const acct = db.select().from(accounts).where(eq(accounts.id, e.accountId)).get();
          if (!acct) throw new Error(`Account not found: ${e.accountId}`);
          insertVoucherEntry(db, id, e.accountId, Number(e.debit || 0), Number(e.credit || 0), e.narration || "", i);
        });

        writeAuditLog(db, {
          userId: session?.id ?? null,
          action: "update",
          module: "transactions",
          entityId: id,
          details: `Updated journal ${existing.voucherNo}`,
        });
        return ok(enrichVoucher(id)!);
      })
  );

  registerHandler(
    IPC.LEDGER_ACCOUNT,
    async (_e, accountId: string, query?: LedgerQuery): Promise<ActionResult<AccountLedger>> =>
      guarded(() => requirePermission("ledgers.view"), async () => {
        const db = getDb();
        const opening = computeAccountOpening(db, accountId, query?.fromDate);
        if (!opening) return fail("Account not found");

        const lines = listAccountLedgerLines(db, accountId, query?.fromDate, query?.toDate);
        let running = opening.signed;
        const isDebitNature =
          opening.account.accountType === "asset" || opening.account.accountType === "expense";

        const withBal = lines.map((line) => {
          running += isDebitNature ? line.debit - line.credit : line.credit - line.debit;
          return { ...line, balance: money(Math.abs(running)) };
        });

        const totalDebit = money(withBal.reduce((s, l) => s + l.debit, 0));
        const totalCredit = money(withBal.reduce((s, l) => s + l.credit, 0));
        const closingSide = running >= 0
          ? isDebitNature
            ? "debit"
            : "credit"
          : isDebitNature
            ? "credit"
            : "debit";

        return ok({
          account: mapAccount(opening.account),
          fromDate: query?.fromDate ?? null,
          toDate: query?.toDate ?? null,
          openingBalance: money(opening.balance),
          openingSide: opening.side,
          lines: withBal,
          totalDebit,
          totalCredit,
          closingBalance: money(Math.abs(running)),
          closingSide,
        });
      })
  );

  registerHandler(
    IPC.LEDGER_PARTY,
    async (
      _e,
      partyType: PartyType,
      partyId: string,
      query?: LedgerQuery
    ): Promise<ActionResult<PartyLedger>> =>
      guarded(() => requirePermission("ledgers.view"), async () => {
        const db = getDb();
        const party =
          partyType === "customer"
            ? db.select().from(customers).where(eq(customers.id, partyId)).get()
            : db.select().from(vendors).where(eq(vendors.id, partyId)).get();
        if (!party) return fail("Party not found");

        const conditions = [
          eq(vouchers.partyType, partyType),
          eq(vouchers.partyId, partyId),
          eq(vouchers.status, "posted"),
        ];
        if (query?.fromDate) conditions.push(gte(vouchers.voucherDate, query.fromDate));
        if (query?.toDate) conditions.push(lte(vouchers.voucherDate, query.toDate));

        // Party movement from voucher header amounts is incomplete; use AR/AP entry impact
        // Simpler approach: debit = amount increasing receivable/payable nature from related entries
        // For party ledger we treat voucher grandTotal / paidAmount:
        // sale/receipt increase customer debit; sale_return/receive reduce
        const rows = db
          .select()
          .from(vouchers)
          .where(and(...conditions))
          .orderBy(asc(vouchers.voucherDate), asc(vouchers.createdAt))
          .all();

        const priorConditions = [
          eq(vouchers.partyType, partyType),
          eq(vouchers.partyId, partyId),
          eq(vouchers.status, "posted"),
        ];
        if (query?.fromDate) {
          priorConditions.push(sql`${vouchers.voucherDate} < ${query.fromDate}`);
        }

        const priorRows = query?.fromDate
          ? db.select().from(vouchers).where(and(...priorConditions)).all()
          : [];

        const partyMove = (v: typeof vouchers.$inferSelect) => {
          // Returns { debit, credit } from party perspective
          const t = v.voucherType;
          const amt = money(v.grandTotal);
          const cashSettled = money(v.paidAmount);
          // Credit/party impact is only the unpaid portion of the document.
          // Mixed returns (part cash + part credit) must still move AR/AP for creditPart.
          const creditPart = money(Math.max(0, amt - cashSettled));
          if (partyType === "customer") {
            if (t === "sale") return { debit: amt, credit: cashSettled };
            if (t === "sale_return") return { debit: 0, credit: creditPart };
            if (t === "receipt") return { debit: 0, credit: money(v.paidAmount || v.grandTotal) };
            if (t === "income") return { debit: 0, credit: 0 };
            return { debit: 0, credit: 0 };
          }
          // vendor
          if (t === "purchase") return { debit: cashSettled, credit: amt };
          if (t === "purchase_return") return { debit: creditPart, credit: 0 };
          if (t === "payment") return { debit: money(v.paidAmount || v.grandTotal), credit: 0 };
          return { debit: 0, credit: 0 };
        };

        let priorDebit = 0;
        let priorCredit = 0;
        for (const v of priorRows) {
          const m = partyMove(v);
          priorDebit = money(priorDebit + m.debit);
          priorCredit = money(priorCredit + m.credit);
        }

        const opening = partySignedBalance(
          party.openingBalance,
          party.balanceType as "debit" | "credit",
          priorDebit,
          priorCredit
        );

        let running = opening.signed;
        const lines = rows.map((v) => {
          const m = partyMove(v);
          running = money(running + m.debit - m.credit);
          return {
            date: v.voucherDate,
            voucherId: v.id,
            voucherNo: v.voucherNo,
            voucherType: v.voucherType as PartyLedger["lines"][0]["voucherType"],
            narration: v.notes,
            debit: m.debit,
            credit: m.credit,
            balance: money(Math.abs(running)),
          };
        });

        const totalDebit = money(lines.reduce((s, l) => s + l.debit, 0));
        const totalCredit = money(lines.reduce((s, l) => s + l.credit, 0));

        return ok({
          partyType,
          partyId,
          partyCode: party.code,
          partyName: party.name,
          fromDate: query?.fromDate ?? null,
          toDate: query?.toDate ?? null,
          openingBalance: money(opening.balance),
          openingSide: opening.side,
          lines,
          totalDebit,
          totalCredit,
          closingBalance: money(Math.abs(running)),
          closingSide: running >= 0 ? "debit" : "credit",
        });
      })
  );

  registerHandler(IPC.TX_RECEIVE, async (_e, input: ReceivePaymentInput): Promise<ActionResult<Voucher>> =>
    guarded(() => requirePermission("transactions.create"), async () => {
      const amount = money(Number(input.amount));
      if (amount <= 0) return fail("Amount must be positive");
      const db = getDb();
      const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get();
      if (!customer) return fail("Customer not found");
      const cash = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
      if (!cash) return fail("Account not found");
      const ar = requireAccountByCode(db, "1300", "Accounts Receivable");
      const session = getCurrentSession();
      const voucherNo = nextDocumentNumber(db, "receipt");
      const id = randomUUID();
      const ts = nowIso();
      db.insert(vouchers)
        .values({
          id,
          voucherNo,
          voucherType: "receipt",
          voucherDate: input.voucherDate,
          partyType: "customer",
          partyId: input.customerId,
          accountId: input.accountId,
          referenceNo: input.referenceNo?.trim() || null,
          notes: input.notes?.trim() || null,
          grandTotal: amount,
          paidAmount: amount,
          status: "posted",
          createdBy: session?.id ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      insertVoucherEntry(db, id, input.accountId, amount, 0, `Receipt ${voucherNo}`, 0);
      insertVoucherEntry(db, id, ar.id, 0, amount, `Receipt ${voucherNo}`, 1);
      writeAuditLog(db, {
        userId: session?.id ?? null,
        action: "create",
        module: "transactions",
        entityId: id,
        details: `Receipt ${voucherNo} ${amount}`,
      });
      return ok(enrichVoucher(id)!);
    })
  );

  registerHandler(
    IPC.TX_RECEIVE_UPDATE,
    async (_e, id: string, input: ReceivePaymentInput): Promise<ActionResult<Voucher>> =>
      guarded(() => requirePermission("transactions.create"), async () => {
        const amount = money(Number(input.amount));
        if (amount <= 0) return fail("Amount must be positive");
        const db = getDb();
        const existing = db.select().from(vouchers).where(eq(vouchers.id, id)).get();
        if (!existing || existing.voucherType !== "receipt") return fail("Receipt not found");
        if (existing.status === "cancelled") return fail("Cannot edit cancelled receipt");

        const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get();
        if (!customer) return fail("Customer not found");
        const cash = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
        if (!cash) return fail("Account not found");
        const ar = requireAccountByCode(db, "1300", "Accounts Receivable");
        const session = getCurrentSession();
        const ts = nowIso();

        db.delete(voucherEntries).where(eq(voucherEntries.voucherId, id)).run();
        db.update(vouchers)
          .set({
            voucherDate: input.voucherDate,
            partyType: "customer",
            partyId: input.customerId,
            accountId: input.accountId,
            referenceNo: input.referenceNo?.trim() || null,
            notes: input.notes?.trim() || null,
            grandTotal: amount,
            paidAmount: amount,
            status: "posted",
            updatedAt: ts,
          })
          .where(eq(vouchers.id, id))
          .run();
        insertVoucherEntry(db, id, input.accountId, amount, 0, `Receipt ${existing.voucherNo}`, 0);
        insertVoucherEntry(db, id, ar.id, 0, amount, `Receipt ${existing.voucherNo}`, 1);
        writeAuditLog(db, {
          userId: session?.id ?? null,
          action: "update",
          module: "transactions",
          entityId: id,
          details: `Updated receipt ${existing.voucherNo} ${amount}`,
        });
        return ok(enrichVoucher(id)!);
      })
  );

  registerHandler(IPC.TX_PAY, async (_e, input: MakePaymentInput): Promise<ActionResult<Voucher>> =>
    guarded(() => requirePermission("transactions.create"), async () => {
      const amount = money(Number(input.amount));
      if (amount <= 0) return fail("Amount must be positive");
      const db = getDb();
      const vendor = db.select().from(vendors).where(eq(vendors.id, input.vendorId)).get();
      if (!vendor) return fail("Vendor not found");
      const cash = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
      if (!cash) return fail("Account not found");
      const ap = requireAccountByCode(db, "2100", "Accounts Payable");
      const session = getCurrentSession();
      const voucherNo = nextDocumentNumber(db, "payment");
      const id = randomUUID();
      const ts = nowIso();
      db.insert(vouchers)
        .values({
          id,
          voucherNo,
          voucherType: "payment",
          voucherDate: input.voucherDate,
          partyType: "vendor",
          partyId: input.vendorId,
          accountId: input.accountId,
          referenceNo: input.referenceNo?.trim() || null,
          notes: input.notes?.trim() || null,
          grandTotal: amount,
          paidAmount: amount,
          status: "posted",
          createdBy: session?.id ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      insertVoucherEntry(db, id, ap.id, amount, 0, `Payment ${voucherNo}`, 0);
      insertVoucherEntry(db, id, input.accountId, 0, amount, `Payment ${voucherNo}`, 1);
      writeAuditLog(db, {
        userId: session?.id ?? null,
        action: "create",
        module: "transactions",
        entityId: id,
        details: `Payment ${voucherNo} ${amount}`,
      });
      return ok(enrichVoucher(id)!);
    })
  );

  registerHandler(
    IPC.TX_PAY_UPDATE,
    async (_e, id: string, input: MakePaymentInput): Promise<ActionResult<Voucher>> =>
      guarded(() => requirePermission("transactions.create"), async () => {
        const amount = money(Number(input.amount));
        if (amount <= 0) return fail("Amount must be positive");
        const db = getDb();
        const existing = db.select().from(vouchers).where(eq(vouchers.id, id)).get();
        if (!existing || existing.voucherType !== "payment") return fail("Payment not found");
        if (existing.status === "cancelled") return fail("Cannot edit cancelled payment");

        const vendor = db.select().from(vendors).where(eq(vendors.id, input.vendorId)).get();
        if (!vendor) return fail("Vendor not found");
        const cash = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
        if (!cash) return fail("Account not found");
        const ap = requireAccountByCode(db, "2100", "Accounts Payable");
        const session = getCurrentSession();
        const ts = nowIso();

        db.delete(voucherEntries).where(eq(voucherEntries.voucherId, id)).run();
        db.update(vouchers)
          .set({
            voucherDate: input.voucherDate,
            partyType: "vendor",
            partyId: input.vendorId,
            accountId: input.accountId,
            referenceNo: input.referenceNo?.trim() || null,
            notes: input.notes?.trim() || null,
            grandTotal: amount,
            paidAmount: amount,
            status: "posted",
            updatedAt: ts,
          })
          .where(eq(vouchers.id, id))
          .run();
        insertVoucherEntry(db, id, ap.id, amount, 0, `Payment ${existing.voucherNo}`, 0);
        insertVoucherEntry(db, id, input.accountId, 0, amount, `Payment ${existing.voucherNo}`, 1);
        writeAuditLog(db, {
          userId: session?.id ?? null,
          action: "update",
          module: "transactions",
          entityId: id,
          details: `Updated payment ${existing.voucherNo} ${amount}`,
        });
        return ok(enrichVoucher(id)!);
      })
  );

  registerHandler(IPC.TX_EXPENSE, async (_e, input: ExpenseVoucherInput): Promise<ActionResult<Voucher>> =>
    guarded(() => requirePermission("transactions.create"), async () => {
      const amount = money(Number(input.amount));
      if (amount <= 0) return fail("Amount must be positive");
      const db = getDb();
      const exp = db.select().from(accounts).where(eq(accounts.id, input.expenseAccountId)).get();
      if (!exp || exp.accountType !== "expense") return fail("Expense account required");
      const cash = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
      if (!cash) return fail("Cash/Bank account not found");
      const session = getCurrentSession();
      const voucherNo = nextDocumentNumber(db, "expense");
      const id = randomUUID();
      const ts = nowIso();
      db.insert(vouchers)
        .values({
          id,
          voucherNo,
          voucherType: "expense",
          voucherDate: input.voucherDate,
          partyType: input.vendorId ? "vendor" : null,
          partyId: input.vendorId ?? null,
          accountId: input.accountId,
          referenceNo: input.referenceNo?.trim() || null,
          notes: input.notes?.trim() || null,
          grandTotal: amount,
          paidAmount: amount,
          status: "posted",
          createdBy: session?.id ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      insertVoucherEntry(db, id, input.expenseAccountId, amount, 0, `Expense ${voucherNo}`, 0);
      insertVoucherEntry(db, id, input.accountId, 0, amount, `Expense ${voucherNo}`, 1);
      writeAuditLog(db, {
        userId: session?.id ?? null,
        action: "create",
        module: "transactions",
        entityId: id,
        details: `Expense ${voucherNo} ${amount}`,
      });
      return ok(enrichVoucher(id)!);
    })
  );

  registerHandler(
    IPC.TX_EXPENSE_UPDATE,
    async (_e, id: string, input: ExpenseVoucherInput): Promise<ActionResult<Voucher>> =>
      guarded(() => requirePermission("transactions.create"), async () => {
        const amount = money(Number(input.amount));
        if (amount <= 0) return fail("Amount must be positive");
        const db = getDb();
        const existing = db.select().from(vouchers).where(eq(vouchers.id, id)).get();
        if (!existing || existing.voucherType !== "expense") return fail("Expense not found");
        if (existing.status === "cancelled") return fail("Cannot edit cancelled expense");

        const exp = db.select().from(accounts).where(eq(accounts.id, input.expenseAccountId)).get();
        if (!exp || exp.accountType !== "expense") return fail("Expense account required");
        const cash = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
        if (!cash) return fail("Cash/Bank account not found");
        const session = getCurrentSession();
        const ts = nowIso();

        db.delete(voucherEntries).where(eq(voucherEntries.voucherId, id)).run();
        db.update(vouchers)
          .set({
            voucherDate: input.voucherDate,
            partyType: input.vendorId ? "vendor" : null,
            partyId: input.vendorId ?? null,
            accountId: input.accountId,
            referenceNo: input.referenceNo?.trim() || null,
            notes: input.notes?.trim() || null,
            grandTotal: amount,
            paidAmount: amount,
            status: "posted",
            updatedAt: ts,
          })
          .where(eq(vouchers.id, id))
          .run();
        insertVoucherEntry(db, id, input.expenseAccountId, amount, 0, `Expense ${existing.voucherNo}`, 0);
        insertVoucherEntry(db, id, input.accountId, 0, amount, `Expense ${existing.voucherNo}`, 1);
        writeAuditLog(db, {
          userId: session?.id ?? null,
          action: "update",
          module: "transactions",
          entityId: id,
          details: `Updated expense ${existing.voucherNo} ${amount}`,
        });
        return ok(enrichVoucher(id)!);
      })
  );

  registerHandler(IPC.TX_INCOME, async (_e, input: IncomeVoucherInput): Promise<ActionResult<Voucher>> =>
    guarded(() => requirePermission("transactions.create"), async () => {
      const amount = money(Number(input.amount));
      if (amount <= 0) return fail("Amount must be positive");
      const db = getDb();
      const inc = db.select().from(accounts).where(eq(accounts.id, input.incomeAccountId)).get();
      if (!inc || inc.accountType !== "income") return fail("Income account required");
      const cash = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
      if (!cash) return fail("Cash/Bank account not found");
      const session = getCurrentSession();
      const voucherNo = nextDocumentNumber(db, "income");
      const id = randomUUID();
      const ts = nowIso();
      db.insert(vouchers)
        .values({
          id,
          voucherNo,
          voucherType: "income",
          voucherDate: input.voucherDate,
          partyType: input.customerId ? "customer" : null,
          partyId: input.customerId ?? null,
          accountId: input.accountId,
          referenceNo: input.referenceNo?.trim() || null,
          notes: input.notes?.trim() || null,
          grandTotal: amount,
          paidAmount: amount,
          status: "posted",
          createdBy: session?.id ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      insertVoucherEntry(db, id, input.accountId, amount, 0, `Income ${voucherNo}`, 0);
      insertVoucherEntry(db, id, input.incomeAccountId, 0, amount, `Income ${voucherNo}`, 1);
      writeAuditLog(db, {
        userId: session?.id ?? null,
        action: "create",
        module: "transactions",
        entityId: id,
        details: `Income ${voucherNo} ${amount}`,
      });
      return ok(enrichVoucher(id)!);
    })
  );

  registerHandler(
    IPC.TX_INCOME_UPDATE,
    async (_e, id: string, input: IncomeVoucherInput): Promise<ActionResult<Voucher>> =>
      guarded(() => requirePermission("transactions.create"), async () => {
        const amount = money(Number(input.amount));
        if (amount <= 0) return fail("Amount must be positive");
        const db = getDb();
        const existing = db.select().from(vouchers).where(eq(vouchers.id, id)).get();
        if (!existing || existing.voucherType !== "income") return fail("Income not found");
        if (existing.status === "cancelled") return fail("Cannot edit cancelled income");

        const inc = db.select().from(accounts).where(eq(accounts.id, input.incomeAccountId)).get();
        if (!inc || inc.accountType !== "income") return fail("Income account required");
        const cash = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
        if (!cash) return fail("Cash/Bank account not found");
        const session = getCurrentSession();
        const ts = nowIso();

        db.delete(voucherEntries).where(eq(voucherEntries.voucherId, id)).run();
        db.update(vouchers)
          .set({
            voucherDate: input.voucherDate,
            partyType: input.customerId ? "customer" : null,
            partyId: input.customerId ?? null,
            accountId: input.accountId,
            referenceNo: input.referenceNo?.trim() || null,
            notes: input.notes?.trim() || null,
            grandTotal: amount,
            paidAmount: amount,
            status: "posted",
            updatedAt: ts,
          })
          .where(eq(vouchers.id, id))
          .run();
        insertVoucherEntry(db, id, input.accountId, amount, 0, `Income ${existing.voucherNo}`, 0);
        insertVoucherEntry(db, id, input.incomeAccountId, 0, amount, `Income ${existing.voucherNo}`, 1);
        writeAuditLog(db, {
          userId: session?.id ?? null,
          action: "update",
          module: "transactions",
          entityId: id,
          details: `Updated income ${existing.voucherNo} ${amount}`,
        });
        return ok(enrichVoucher(id)!);
      })
  );

  registerHandler(IPC.TX_OWNER_DRAW, async (_e, input: OwnerDrawInput): Promise<ActionResult<Voucher>> =>
    guarded(() => requirePermission("transactions.create"), async () => {
      const amount = money(Number(input.amount));
      if (amount <= 0) return fail("Amount must be positive");
      const db = getDb();
      const cash = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
      if (!cash) return fail("Cash/Bank account not found");
      if (cash.code !== "1100" && cash.code !== "1200") {
        return fail("Owner draw must come from Cash or Bank");
      }
      const drawAcct = requireAccountByCode(db, "3200", "Owner Draw");
      const session = getCurrentSession();
      const voucherNo = nextDocumentNumber(db, "owner_draw");
      const id = randomUUID();
      const ts = nowIso();
      db.insert(vouchers)
        .values({
          id,
          voucherNo,
          voucherType: "owner_draw",
          voucherDate: input.voucherDate,
          partyType: null,
          partyId: null,
          accountId: input.accountId,
          referenceNo: input.referenceNo?.trim() || null,
          notes: input.notes?.trim() || null,
          grandTotal: amount,
          paidAmount: amount,
          status: "posted",
          createdBy: session?.id ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      // Debit Owner Draw (reduces equity), credit Cash/Bank (money leaves shop)
      insertVoucherEntry(db, id, drawAcct.id, amount, 0, `Owner draw ${voucherNo}`, 0);
      insertVoucherEntry(db, id, input.accountId, 0, amount, `Owner draw ${voucherNo}`, 1);
      writeAuditLog(db, {
        userId: session?.id ?? null,
        action: "create",
        module: "transactions",
        entityId: id,
        details: `Owner draw ${voucherNo} ${amount}`,
      });
      return ok(enrichVoucher(id)!);
    })
  );

  registerHandler(
    IPC.TX_OWNER_DRAW_UPDATE,
    async (_e, id: string, input: OwnerDrawInput): Promise<ActionResult<Voucher>> =>
      guarded(() => requirePermission("transactions.create"), async () => {
        const amount = money(Number(input.amount));
        if (amount <= 0) return fail("Amount must be positive");
        const db = getDb();
        const existing = db.select().from(vouchers).where(eq(vouchers.id, id)).get();
        if (!existing || existing.voucherType !== "owner_draw") return fail("Owner draw not found");
        if (existing.status === "cancelled") return fail("Cannot edit cancelled owner draw");

        const cash = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
        if (!cash) return fail("Cash/Bank account not found");
        if (cash.code !== "1100" && cash.code !== "1200") {
          return fail("Owner draw must come from Cash or Bank");
        }
        const drawAcct = requireAccountByCode(db, "3200", "Owner Draw");
        const session = getCurrentSession();
        const ts = nowIso();

        db.delete(voucherEntries).where(eq(voucherEntries.voucherId, id)).run();
        db.update(vouchers)
          .set({
            voucherDate: input.voucherDate,
            accountId: input.accountId,
            referenceNo: input.referenceNo?.trim() || null,
            notes: input.notes?.trim() || null,
            grandTotal: amount,
            paidAmount: amount,
            status: "posted",
            updatedAt: ts,
          })
          .where(eq(vouchers.id, id))
          .run();
        insertVoucherEntry(db, id, drawAcct.id, amount, 0, `Owner draw ${existing.voucherNo}`, 0);
        insertVoucherEntry(db, id, input.accountId, 0, amount, `Owner draw ${existing.voucherNo}`, 1);
        writeAuditLog(db, {
          userId: session?.id ?? null,
          action: "update",
          module: "transactions",
          entityId: id,
          details: `Updated owner draw ${existing.voucherNo} ${amount}`,
        });
        return ok(enrichVoucher(id)!);
      })
  );
}
