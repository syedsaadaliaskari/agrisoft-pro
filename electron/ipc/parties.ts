import { ipcMain } from "electron";
import { asc, count, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  IPC,
  type ActionResult,
  type Customer,
  type CustomerInput,
  type Vendor,
  type VendorInput,
  type DocType,
} from "../../shared/ipc";
import { getDb } from "../db";
import { nextDocumentNumber } from "../db/counters";
import { customers, vendors, sales, purchases } from "../db/schema";
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

function mapCustomer(row: typeof customers.$inferSelect): Customer {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    openingBalance: row.openingBalance,
    balanceType: row.balanceType as Customer["balanceType"],
    creditLimit: row.creditLimit ?? 0,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapVendor(row: typeof vendors.$inferSelect): Vendor {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    openingBalance: row.openingBalance,
    balanceType: row.balanceType as Vendor["balanceType"],
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function allocatePartyCode(
  docType: Extract<DocType, "customer" | "vendor">,
  preferred: string | undefined,
  existsFn: (code: string) => boolean
): string {
  if (preferred?.trim()) {
    const code = preferred.trim();
    if (existsFn(code)) throw new Error(`A ${docType} with this code already exists`);
    return code;
  }
  const db = getDb();
  for (let i = 0; i < 40; i++) {
    const code = nextDocumentNumber(db, docType);
    if (!existsFn(code)) return code;
  }
  throw new Error(`Could not allocate a unique ${docType} code`);
}

export function registerPartyHandlers(): void {
  ipcMain.handle(IPC.CUSTOMERS_LIST, async (): Promise<ActionResult<Customer[]>> =>
    guarded(() => requirePermission("customers.view"), async () => {
      const rows = getDb().select().from(customers).orderBy(asc(customers.name)).all();
      return ok(rows.map(mapCustomer));
    })
  );

  ipcMain.handle(IPC.CUSTOMERS_CREATE, async (_e, input: CustomerInput): Promise<ActionResult<Customer>> =>
    guarded(() => requirePermission("customers.manage"), async () => {
      const name = input.name?.trim();
      if (!name) return fail("Name is required");

      const db = getDb();
      const code = allocatePartyCode("customer", input.code, (c) =>
        !!db.select().from(customers).where(eq(customers.code, c)).get()
      );

      const id = randomUUID();
      db.insert(customers)
        .values({
          id,
          code,
          name,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          address: input.address?.trim() || null,
          city: input.city?.trim() || null,
          openingBalance: Number(input.openingBalance ?? 0),
          balanceType: input.balanceType ?? "debit",
          creditLimit: Number(input.creditLimit ?? 0),
          isActive: input.isActive ?? true,
        })
        .run();

      const row = db.select().from(customers).where(eq(customers.id, id)).get()!;
      return ok(mapCustomer(row));
    })
  );

  ipcMain.handle(
    IPC.CUSTOMERS_UPDATE,
    async (_e, id: string, input: CustomerInput): Promise<ActionResult<Customer>> =>
      guarded(() => requirePermission("customers.manage"), async () => {
        const name = input.name?.trim();
        if (!name) return fail("Name is required");

        const db = getDb();
        const current = db.select().from(customers).where(eq(customers.id, id)).get();
        if (!current) return fail("Customer not found");

        let code = current.code;
        if (input.code?.trim() && input.code.trim() !== current.code) {
          const clash = db.select().from(customers).where(eq(customers.code, input.code.trim())).get();
          if (clash) return fail("A customer with this code already exists");
          code = input.code.trim();
        }

        db.update(customers)
          .set({
            code,
            name,
            phone: input.phone === undefined ? current.phone : input.phone?.trim() || null,
            email: input.email === undefined ? current.email : input.email?.trim() || null,
            address: input.address === undefined ? current.address : input.address?.trim() || null,
            city: input.city === undefined ? current.city : input.city?.trim() || null,
            openingBalance:
              input.openingBalance === undefined
                ? current.openingBalance
                : Number(input.openingBalance),
            balanceType: input.balanceType ?? current.balanceType,
            creditLimit:
              input.creditLimit === undefined ? current.creditLimit : Number(input.creditLimit),
            isActive: input.isActive ?? current.isActive,
            updatedAt: nowIso(),
          })
          .where(eq(customers.id, id))
          .run();

        const row = db.select().from(customers).where(eq(customers.id, id)).get()!;
        return ok(mapCustomer(row));
      })
  );

  ipcMain.handle(IPC.CUSTOMERS_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("customers.manage"), async () => {
      const db = getDb();
      const current = db.select().from(customers).where(eq(customers.id, id)).get();
      if (!current) return fail("Customer not found");

      const used =
        db.select({ value: count() }).from(sales).where(eq(sales.customerId, id)).get()?.value ?? 0;
      if (used > 0) return fail("Cannot delete: customer has sales. Deactivate instead.");

      db.delete(customers).where(eq(customers.id, id)).run();
      return ok(undefined);
    })
  );

  ipcMain.handle(IPC.VENDORS_LIST, async (): Promise<ActionResult<Vendor[]>> =>
    guarded(() => requirePermission("vendors.view"), async () => {
      const rows = getDb().select().from(vendors).orderBy(asc(vendors.name)).all();
      return ok(rows.map(mapVendor));
    })
  );

  ipcMain.handle(IPC.VENDORS_CREATE, async (_e, input: VendorInput): Promise<ActionResult<Vendor>> =>
    guarded(() => requirePermission("vendors.manage"), async () => {
      const name = input.name?.trim();
      if (!name) return fail("Name is required");

      const db = getDb();
      const code = allocatePartyCode("vendor", input.code, (c) =>
        !!db.select().from(vendors).where(eq(vendors.code, c)).get()
      );

      const id = randomUUID();
      db.insert(vendors)
        .values({
          id,
          code,
          name,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          address: input.address?.trim() || null,
          city: input.city?.trim() || null,
          openingBalance: Number(input.openingBalance ?? 0),
          balanceType: input.balanceType ?? "credit",
          isActive: input.isActive ?? true,
        })
        .run();

      const row = db.select().from(vendors).where(eq(vendors.id, id)).get()!;
      return ok(mapVendor(row));
    })
  );

  ipcMain.handle(
    IPC.VENDORS_UPDATE,
    async (_e, id: string, input: VendorInput): Promise<ActionResult<Vendor>> =>
      guarded(() => requirePermission("vendors.manage"), async () => {
        const name = input.name?.trim();
        if (!name) return fail("Name is required");

        const db = getDb();
        const current = db.select().from(vendors).where(eq(vendors.id, id)).get();
        if (!current) return fail("Vendor not found");

        let code = current.code;
        if (input.code?.trim() && input.code.trim() !== current.code) {
          const clash = db.select().from(vendors).where(eq(vendors.code, input.code.trim())).get();
          if (clash) return fail("A vendor with this code already exists");
          code = input.code.trim();
        }

        db.update(vendors)
          .set({
            code,
            name,
            phone: input.phone === undefined ? current.phone : input.phone?.trim() || null,
            email: input.email === undefined ? current.email : input.email?.trim() || null,
            address: input.address === undefined ? current.address : input.address?.trim() || null,
            city: input.city === undefined ? current.city : input.city?.trim() || null,
            openingBalance:
              input.openingBalance === undefined
                ? current.openingBalance
                : Number(input.openingBalance),
            balanceType: input.balanceType ?? current.balanceType,
            isActive: input.isActive ?? current.isActive,
            updatedAt: nowIso(),
          })
          .where(eq(vendors.id, id))
          .run();

        const row = db.select().from(vendors).where(eq(vendors.id, id)).get()!;
        return ok(mapVendor(row));
      })
  );

  ipcMain.handle(IPC.VENDORS_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("vendors.manage"), async () => {
      const db = getDb();
      const current = db.select().from(vendors).where(eq(vendors.id, id)).get();
      if (!current) return fail("Vendor not found");

      const used =
        db.select({ value: count() }).from(purchases).where(eq(purchases.vendorId, id)).get()?.value ??
        0;
      if (used > 0) return fail("Cannot delete: vendor has purchases. Deactivate instead.");

      db.delete(vendors).where(eq(vendors.id, id)).run();
      return ok(undefined);
    })
  );
}
