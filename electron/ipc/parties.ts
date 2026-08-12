import { registerHandler } from "./register";
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
import { requireAccountByCode } from "../db/accounts";
import { money } from "../db/ledger";
import { customers, vendors, sales, purchases, accounts } from "../db/schema";
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

/** Party opening signed: debit = positive (customer owes / vendor prepaid). */
function partyOpeningSigned(amount: number, balanceType: string): number {
  const amt = money(Number(amount) || 0);
  return balanceType === "debit" ? amt : -amt;
}

/**
 * Keep AR (1300) / AP (2100) account opening in sync with party openings.
 * Customer debit OB increases AR; vendor credit OB increases AP.
 */
function syncControlOpening(
  partyType: "customer" | "vendor",
  oldSigned: number,
  newSigned: number
) {
  const delta = money(newSigned - oldSigned);
  if (delta === 0) return;
  const db = getDb();
  if (partyType === "customer") {
    const ar = requireAccountByCode(db, "1300", "Accounts Receivable");
    db.update(accounts)
      .set({ openingBalance: money(ar.openingBalance + delta), updatedAt: nowIso() })
      .where(eq(accounts.id, ar.id))
      .run();
  } else {
    // Vendor credit OB (negative partySigned) increases AP liability opening
    const ap = requireAccountByCode(db, "2100", "Accounts Payable");
    db.update(accounts)
      .set({ openingBalance: money(ap.openingBalance - delta), updatedAt: nowIso() })
      .where(eq(accounts.id, ap.id))
      .run();
  }
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
  registerHandler(IPC.CUSTOMERS_LIST, async (): Promise<ActionResult<Customer[]>> =>
    guarded(() => requirePermission("customers.view"), async () => {
      const rows = getDb().select().from(customers).orderBy(asc(customers.name)).all();
      return ok(rows.map(mapCustomer));
    })
  );

  registerHandler(IPC.CUSTOMERS_CREATE, async (_e, input: CustomerInput): Promise<ActionResult<Customer>> =>
    guarded(() => requirePermission("customers.manage"), async () => {
      const name = input.name?.trim();
      if (!name) return fail("Name is required");

      const db = getDb();
      const code = allocatePartyCode("customer", input.code, (c) =>
        !!db.select().from(customers).where(eq(customers.code, c)).get()
      );

      const id = randomUUID();
      const openingBalance = Number(input.openingBalance ?? 0);
      const balanceType = input.balanceType ?? "debit";
      db.insert(customers)
        .values({
          id,
          code,
          name,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          address: input.address?.trim() || null,
          city: input.city?.trim() || null,
          openingBalance,
          balanceType,
          creditLimit: Number(input.creditLimit ?? 0),
          isActive: input.isActive ?? true,
        })
        .run();

      syncControlOpening("customer", 0, partyOpeningSigned(openingBalance, balanceType));

      const row = db.select().from(customers).where(eq(customers.id, id)).get()!;
      return ok(mapCustomer(row));
    })
  );

  registerHandler(
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

        const oldSigned = partyOpeningSigned(current.openingBalance, current.balanceType);
        const openingBalance =
          input.openingBalance === undefined
            ? current.openingBalance
            : Number(input.openingBalance);
        const balanceType = input.balanceType ?? current.balanceType;

        db.update(customers)
          .set({
            code,
            name,
            phone: input.phone === undefined ? current.phone : input.phone?.trim() || null,
            email: input.email === undefined ? current.email : input.email?.trim() || null,
            address: input.address === undefined ? current.address : input.address?.trim() || null,
            city: input.city === undefined ? current.city : input.city?.trim() || null,
            openingBalance,
            balanceType,
            creditLimit:
              input.creditLimit === undefined ? current.creditLimit : Number(input.creditLimit),
            isActive: input.isActive ?? current.isActive,
            updatedAt: nowIso(),
          })
          .where(eq(customers.id, id))
          .run();

        syncControlOpening("customer", oldSigned, partyOpeningSigned(openingBalance, balanceType));

        const row = db.select().from(customers).where(eq(customers.id, id)).get()!;
        return ok(mapCustomer(row));
      })
  );

  registerHandler(IPC.CUSTOMERS_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("customers.manage"), async () => {
      const db = getDb();
      const current = db.select().from(customers).where(eq(customers.id, id)).get();
      if (!current) return fail("Customer not found");

      const used =
        db.select({ value: count() }).from(sales).where(eq(sales.customerId, id)).get()?.value ?? 0;
      if (used > 0) return fail("Cannot delete: customer has sales. Deactivate instead.");

      syncControlOpening(
        "customer",
        partyOpeningSigned(current.openingBalance, current.balanceType),
        0
      );
      db.delete(customers).where(eq(customers.id, id)).run();
      return ok(undefined);
    })
  );

  registerHandler(IPC.VENDORS_LIST, async (): Promise<ActionResult<Vendor[]>> =>
    guarded(() => requirePermission("vendors.view"), async () => {
      const rows = getDb().select().from(vendors).orderBy(asc(vendors.name)).all();
      return ok(rows.map(mapVendor));
    })
  );

  registerHandler(IPC.VENDORS_CREATE, async (_e, input: VendorInput): Promise<ActionResult<Vendor>> =>
    guarded(() => requirePermission("vendors.manage"), async () => {
      const name = input.name?.trim();
      if (!name) return fail("Name is required");

      const db = getDb();
      const code = allocatePartyCode("vendor", input.code, (c) =>
        !!db.select().from(vendors).where(eq(vendors.code, c)).get()
      );

      const id = randomUUID();
      const openingBalance = Number(input.openingBalance ?? 0);
      const balanceType = input.balanceType ?? "credit";
      db.insert(vendors)
        .values({
          id,
          code,
          name,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          address: input.address?.trim() || null,
          city: input.city?.trim() || null,
          openingBalance,
          balanceType,
          isActive: input.isActive ?? true,
        })
        .run();

      syncControlOpening("vendor", 0, partyOpeningSigned(openingBalance, balanceType));

      const row = db.select().from(vendors).where(eq(vendors.id, id)).get()!;
      return ok(mapVendor(row));
    })
  );

  registerHandler(
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

        const oldSigned = partyOpeningSigned(current.openingBalance, current.balanceType);
        const openingBalance =
          input.openingBalance === undefined
            ? current.openingBalance
            : Number(input.openingBalance);
        const balanceType = input.balanceType ?? current.balanceType;

        db.update(vendors)
          .set({
            code,
            name,
            phone: input.phone === undefined ? current.phone : input.phone?.trim() || null,
            email: input.email === undefined ? current.email : input.email?.trim() || null,
            address: input.address === undefined ? current.address : input.address?.trim() || null,
            city: input.city === undefined ? current.city : input.city?.trim() || null,
            openingBalance,
            balanceType,
            isActive: input.isActive ?? current.isActive,
            updatedAt: nowIso(),
          })
          .where(eq(vendors.id, id))
          .run();

        syncControlOpening("vendor", oldSigned, partyOpeningSigned(openingBalance, balanceType));

        const row = db.select().from(vendors).where(eq(vendors.id, id)).get()!;
        return ok(mapVendor(row));
      })
  );

  registerHandler(IPC.VENDORS_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("vendors.manage"), async () => {
      const db = getDb();
      const current = db.select().from(vendors).where(eq(vendors.id, id)).get();
      if (!current) return fail("Vendor not found");

      const used =
        db.select({ value: count() }).from(purchases).where(eq(purchases.vendorId, id)).get()?.value ??
        0;
      if (used > 0) return fail("Cannot delete: vendor has purchases. Deactivate instead.");

      syncControlOpening(
        "vendor",
        partyOpeningSigned(current.openingBalance, current.balanceType),
        0
      );
      db.delete(vendors).where(eq(vendors.id, id)).run();
      return ok(undefined);
    })
  );
}
