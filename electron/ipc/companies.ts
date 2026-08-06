import { ipcMain } from "electron";
import { asc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  IPC,
  type ActionResult,
  type ClientCompany,
  type ClientCompanyInput,
  type CompaniesDemandSummary,
} from "../../shared/ipc";
import { getDb } from "../db";
import { clientCompanies } from "../db/schema";
import { requirePermission, PermissionError } from "./session";

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

function mapCompany(row: typeof clientCompanies.$inferSelect): ClientCompany {
  return {
    id: row.id,
    companyName: row.companyName,
    area: row.area,
    joinedAt: row.joinedAt,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function registerCompanyHandlers(): void {
  ipcMain.handle(IPC.COMPANIES_LIST, async (): Promise<ActionResult<ClientCompany[]>> =>
    guarded(() => requirePermission("platform.view"), async () => {
      const rows = getDb()
        .select()
        .from(clientCompanies)
        .orderBy(asc(clientCompanies.companyName))
        .all();
      return ok(rows.map(mapCompany));
    })
  );

  ipcMain.handle(
    IPC.COMPANIES_CREATE,
    async (_e, input: ClientCompanyInput): Promise<ActionResult<ClientCompany>> =>
      guarded(() => requirePermission("platform.view"), async () => {
        const companyName = input.companyName?.trim();
        const area = input.area?.trim();
        const joinedAt = input.joinedAt?.trim();
        if (!companyName) return fail("Company name is required");
        if (!area) return fail("Area / city is required");
        if (!joinedAt) return fail("Joined date is required");

        const db = getDb();
        const id = randomUUID();
        const ts = nowIso();
        db.insert(clientCompanies)
          .values({
            id,
            companyName,
            area,
            joinedAt,
            notes: input.notes?.trim() || null,
            isActive: input.isActive ?? true,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();
        return ok(mapCompany(db.select().from(clientCompanies).where(eq(clientCompanies.id, id)).get()!));
      })
  );

  ipcMain.handle(
    IPC.COMPANIES_UPDATE,
    async (_e, id: string, input: ClientCompanyInput): Promise<ActionResult<ClientCompany>> =>
      guarded(() => requirePermission("platform.view"), async () => {
        const companyName = input.companyName?.trim();
        const area = input.area?.trim();
        const joinedAt = input.joinedAt?.trim();
        if (!companyName) return fail("Company name is required");
        if (!area) return fail("Area / city is required");
        if (!joinedAt) return fail("Joined date is required");

        const db = getDb();
        const current = db.select().from(clientCompanies).where(eq(clientCompanies.id, id)).get();
        if (!current) return fail("Company not found");

        db.update(clientCompanies)
          .set({
            companyName,
            area,
            joinedAt,
            notes: input.notes === undefined ? current.notes : input.notes?.trim() || null,
            isActive: input.isActive ?? current.isActive,
            updatedAt: nowIso(),
          })
          .where(eq(clientCompanies.id, id))
          .run();

        return ok(mapCompany(db.select().from(clientCompanies).where(eq(clientCompanies.id, id)).get()!));
      })
  );

  ipcMain.handle(IPC.COMPANIES_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("platform.view"), async () => {
      const db = getDb();
      const current = db.select().from(clientCompanies).where(eq(clientCompanies.id, id)).get();
      if (!current) return fail("Company not found");
      db.delete(clientCompanies).where(eq(clientCompanies.id, id)).run();
      return ok(undefined);
    })
  );

  ipcMain.handle(IPC.COMPANIES_DEMAND, async (): Promise<ActionResult<CompaniesDemandSummary>> =>
    guarded(() => requirePermission("platform.view"), async () => {
      const db = getDb();
      const all = db.select().from(clientCompanies).all();
      const byArea = new Map<string, number>();
      let active = 0;
      for (const row of all) {
        if (row.isActive) active += 1;
        const key = row.area.trim() || "Unknown";
        byArea.set(key, (byArea.get(key) ?? 0) + 1);
      }
      const areaDemand = [...byArea.entries()]
        .map(([area, companyCount]) => ({ area, companyCount }))
        .sort((a, b) => b.companyCount - a.companyCount || a.area.localeCompare(b.area));

      return ok({
        totalCompanies: all.length,
        activeCompanies: active,
        areaDemand,
      });
    })
  );
}
