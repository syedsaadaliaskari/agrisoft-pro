import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { accounts } from "./schema";

export function getAccountByCode(db: Db, code: string) {
  return db.select().from(accounts).where(eq(accounts.code, code)).get() ?? null;
}

export function requireAccountByCode(db: Db, code: string, label: string) {
  const row = getAccountByCode(db, code);
  if (!row) throw new Error(`System account missing: ${label} (${code})`);
  return row;
}
