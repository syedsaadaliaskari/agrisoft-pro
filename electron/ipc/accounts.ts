import { registerHandler } from "./register";
import { asc, eq } from "drizzle-orm";
import {
  IPC,
  type ActionResult,
  type Account,
  type AccountListFilter,
  type CashBankSnapshot,
} from "../../shared/ipc";
import { getDb } from "../db";
import { accounts } from "../db/schema";
import { requireAccountByCode } from "../db/accounts";
import { getCashBankSnapshot } from "../db/cashBank";
import { money } from "../db/ledger";
import { writeAuditLog } from "../db/audit";
import { requirePermission, requireSession, PermissionError, getCurrentSession } from "./session";

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

export function registerAccountHandlers(): void {
  registerHandler(IPC.ACCOUNTS_LIST, async (_e, filter?: AccountListFilter): Promise<ActionResult<Account[]>> =>
    guarded(() => requireSession(), async () => {
      const db = getDb();
      let rows = db.select().from(accounts).orderBy(asc(accounts.code)).all();

      if (filter?.accountType) {
        rows = rows.filter((r) => r.accountType === filter.accountType);
      }
      if (filter?.activeOnly !== false) {
        rows = rows.filter((r) => r.isActive);
      }
      if (filter?.cashBankOnly) {
        rows = rows.filter((r) => r.code === "1100" || r.code === "1200");
      }

      return ok(rows.map(mapAccount));
    })
  );

  registerHandler(IPC.ACCOUNTS_GET, async (_e, id: string): Promise<ActionResult<Account>> =>
    guarded(() => requirePermission("ledgers.view"), async () => {
      const row = getDb().select().from(accounts).where(eq(accounts.id, id)).get();
      if (!row) return fail("Account not found");
      return ok(mapAccount(row));
    })
  );

  registerHandler(
    IPC.ACCOUNTS_SET_CASH_BANK_OPENING,
    async (
      _e,
      input: { cashOpening: number; bankOpening: number }
    ): Promise<ActionResult<{ cashOpening: number; bankOpening: number }>> =>
      guarded(() => requirePermission("settings.manage"), async () => {
        const cashAmt = money(Number(input.cashOpening) || 0);
        const bankAmt = money(Number(input.bankOpening) || 0);
        if (cashAmt < 0 || bankAmt < 0) return fail("Opening cash and bank cannot be negative");

        const db = getDb();
        const cash = requireAccountByCode(db, "1100", "Cash");
        const bank = requireAccountByCode(db, "1200", "Bank");
        const equity = requireAccountByCode(db, "3100", "Owner Equity");
        const now = new Date().toISOString();
        const delta = money(cashAmt - cash.openingBalance + (bankAmt - bank.openingBalance));

        db.update(accounts)
          .set({ openingBalance: cashAmt, updatedAt: now })
          .where(eq(accounts.id, cash.id))
          .run();
        db.update(accounts)
          .set({ openingBalance: bankAmt, updatedAt: now })
          .where(eq(accounts.id, bank.id))
          .run();
        if (delta !== 0) {
          db.update(accounts)
            .set({ openingBalance: money(equity.openingBalance + delta), updatedAt: now })
            .where(eq(accounts.id, equity.id))
            .run();
        }

        writeAuditLog(db, {
          userId: getCurrentSession()?.id ?? null,
          action: "update",
          module: "settings",
          entityId: cash.id,
          details: `Opening cash ${cashAmt}, bank ${bankAmt}`,
        });

        return ok({ cashOpening: cashAmt, bankOpening: bankAmt });
      })
  );

  registerHandler(IPC.ACCOUNTS_CASH_BANK_SNAPSHOT, async (): Promise<ActionResult<CashBankSnapshot>> =>
    guarded(() => requireSession(), async () => ok(getCashBankSnapshot(getDb())))
  );
}
