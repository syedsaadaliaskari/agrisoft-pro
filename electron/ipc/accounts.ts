import { registerHandler } from "./register";
import { asc, eq } from "drizzle-orm";
import {
  IPC,
  type ActionResult,
  type Account,
  type AccountListFilter,
} from "../../shared/ipc";
import { getDb } from "../db";
import { accounts } from "../db/schema";
import { requirePermission, requireSession, PermissionError } from "./session";

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
}
