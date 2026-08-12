import { registerHandler } from "./register";
import { eq, asc, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  IPC,
  type ActionResult,
  type Unit,
  type UnitInput,
  type Category,
  type CategoryInput,
  type Tax,
  type TaxInput,
  type Discount,
  type DiscountInput,
  type Addition,
  type AdditionInput,
  type DocType,
} from "../../shared/ipc";
import { getDb } from "../db";
import { nextDocumentNumber } from "../db/counters";
import { units, categories, taxes, discounts, additions, products } from "../db/schema";
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

function nowIso() {
  return new Date().toISOString();
}

function mapUnit(row: typeof units.$inferSelect): Unit {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCategory(row: typeof categories.$inferSelect): Category {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTax(row: typeof taxes.$inferSelect): Tax {
  return {
    id: row.id,
    name: row.name,
    rate: row.rate,
    isInclusive: row.isInclusive,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapDiscount(row: typeof discounts.$inferSelect): Discount {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Discount["type"],
    value: row.value,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAddition(row: typeof additions.$inferSelect): Addition {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Addition["type"],
    value: row.value,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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

export function registerMasterHandlers(): void {
  registerHandler(IPC.DOCS_NEXT_NUMBER, async (_e, docType: DocType): Promise<ActionResult<string>> =>
    guarded(() => requireSession(), async () => {
      const code = nextDocumentNumber(getDb(), docType);
      return ok(code);
    })
  );

  registerHandler(IPC.UNITS_LIST, async (): Promise<ActionResult<Unit[]>> =>
    guarded(() => requirePermission("products.view"), async () => {
      const rows = getDb().select().from(units).orderBy(asc(units.name)).all();
      return ok(rows.map(mapUnit));
    })
  );

  registerHandler(IPC.UNITS_CREATE, async (_e, input: UnitInput): Promise<ActionResult<Unit>> =>
    guarded(() => requirePermission("products.manage"), async () => {
      const name = input.name?.trim();
      const shortName = input.shortName?.trim();
      if (!name || !shortName) return fail("Name and short name are required");

      const db = getDb();
      const exists = db.select().from(units).where(eq(units.name, name)).get();
      if (exists) return fail("A unit with this name already exists");

      const id = randomUUID();
      db.insert(units)
        .values({ id, name, shortName, isActive: input.isActive ?? true })
        .run();

      const row = db.select().from(units).where(eq(units.id, id)).get()!;
      return ok(mapUnit(row));
    })
  );

  registerHandler(IPC.UNITS_UPDATE, async (_e, id: string, input: UnitInput): Promise<ActionResult<Unit>> =>
    guarded(() => requirePermission("products.manage"), async () => {
      const name = input.name?.trim();
      const shortName = input.shortName?.trim();
      if (!name || !shortName) return fail("Name and short name are required");

      const db = getDb();
      const current = db.select().from(units).where(eq(units.id, id)).get();
      if (!current) return fail("Unit not found");

      const clash = db.select().from(units).where(eq(units.name, name)).get();
      if (clash && clash.id !== id) return fail("A unit with this name already exists");

      db.update(units)
        .set({
          name,
          shortName,
          isActive: input.isActive ?? current.isActive,
          updatedAt: nowIso(),
        })
        .where(eq(units.id, id))
        .run();

      const row = db.select().from(units).where(eq(units.id, id)).get()!;
      return ok(mapUnit(row));
    })
  );

  registerHandler(IPC.UNITS_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("products.manage"), async () => {
      const db = getDb();
      const current = db.select().from(units).where(eq(units.id, id)).get();
      if (!current) return fail("Unit not found");

      const inUse = db.select({ value: count() }).from(products).where(eq(products.unitId, id)).get()?.value ?? 0;
      if (inUse > 0) return fail("Cannot delete: unit is used by products. Deactivate it instead.");

      db.delete(units).where(eq(units.id, id)).run();
      return ok(undefined);
    })
  );

  registerHandler(IPC.CATEGORIES_LIST, async (): Promise<ActionResult<Category[]>> =>
    guarded(() => requirePermission("products.view"), async () => {
      const rows = getDb().select().from(categories).orderBy(asc(categories.name)).all();
      return ok(rows.map(mapCategory));
    })
  );

  registerHandler(IPC.CATEGORIES_CREATE, async (_e, input: CategoryInput): Promise<ActionResult<Category>> =>
    guarded(() => requirePermission("products.manage"), async () => {
      const name = input.name?.trim();
      if (!name) return fail("Name is required");

      const db = getDb();
      const exists = db.select().from(categories).where(eq(categories.name, name)).get();
      if (exists) return fail("A category with this name already exists");

      if (input.parentId) {
        const parent = db.select().from(categories).where(eq(categories.id, input.parentId)).get();
        if (!parent) return fail("Parent category not found");
      }

      const id = randomUUID();
      db.insert(categories)
        .values({
          id,
          name,
          parentId: input.parentId ?? null,
          description: input.description?.trim() || null,
          isActive: input.isActive ?? true,
        })
        .run();

      const row = db.select().from(categories).where(eq(categories.id, id)).get()!;
      return ok(mapCategory(row));
    })
  );

  registerHandler(
    IPC.CATEGORIES_UPDATE,
    async (_e, id: string, input: CategoryInput): Promise<ActionResult<Category>> =>
      guarded(() => requirePermission("products.manage"), async () => {
        const name = input.name?.trim();
        if (!name) return fail("Name is required");

        const db = getDb();
        const current = db.select().from(categories).where(eq(categories.id, id)).get();
        if (!current) return fail("Category not found");

        const clash = db.select().from(categories).where(eq(categories.name, name)).get();
        if (clash && clash.id !== id) return fail("A category with this name already exists");

        if (input.parentId === id) return fail("Category cannot be its own parent");
        if (input.parentId) {
          const parent = db.select().from(categories).where(eq(categories.id, input.parentId)).get();
          if (!parent) return fail("Parent category not found");
        }

        db.update(categories)
          .set({
            name,
            parentId: input.parentId === undefined ? current.parentId : input.parentId,
            description:
              input.description === undefined
                ? current.description
                : input.description?.trim() || null,
            isActive: input.isActive ?? current.isActive,
            updatedAt: nowIso(),
          })
          .where(eq(categories.id, id))
          .run();

        const row = db.select().from(categories).where(eq(categories.id, id)).get()!;
        return ok(mapCategory(row));
      })
  );

  registerHandler(IPC.CATEGORIES_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("products.manage"), async () => {
      const db = getDb();
      const current = db.select().from(categories).where(eq(categories.id, id)).get();
      if (!current) return fail("Category not found");

      const inUse =
        db.select({ value: count() }).from(products).where(eq(products.categoryId, id)).get()?.value ?? 0;
      if (inUse > 0) return fail("Cannot delete: category is used by products. Deactivate it instead.");

      const childCount =
        db.select({ value: count() }).from(categories).where(eq(categories.parentId, id)).get()?.value ?? 0;
      if (childCount > 0) {
        return fail("Cannot delete: category has child categories. Move or delete children first.");
      }

      db.delete(categories).where(eq(categories.id, id)).run();
      return ok(undefined);
    })
  );

  registerHandler(IPC.TAXES_LIST, async (): Promise<ActionResult<Tax[]>> =>
    guarded(() => requireSession(), async () => {
      const rows = getDb().select().from(taxes).orderBy(asc(taxes.name)).all();
      return ok(rows.map(mapTax));
    })
  );

  registerHandler(IPC.TAXES_CREATE, async (_e, input: TaxInput): Promise<ActionResult<Tax>> =>
    guarded(() => requirePermission("settings.manage"), async () => {
      const name = input.name?.trim();
      if (!name) return fail("Name is required");
      if (input.rate == null || Number.isNaN(Number(input.rate)) || input.rate < 0) {
        return fail("Rate must be a non-negative number");
      }

      const db = getDb();
      const exists = db.select().from(taxes).where(eq(taxes.name, name)).get();
      if (exists) return fail("A tax with this name already exists");

      const id = randomUUID();
      db.insert(taxes)
        .values({
          id,
          name,
          rate: Number(input.rate),
          isInclusive: input.isInclusive ?? false,
          isActive: input.isActive ?? true,
        })
        .run();

      const row = db.select().from(taxes).where(eq(taxes.id, id)).get()!;
      return ok(mapTax(row));
    })
  );

  registerHandler(IPC.TAXES_UPDATE, async (_e, id: string, input: TaxInput): Promise<ActionResult<Tax>> =>
    guarded(() => requirePermission("settings.manage"), async () => {
      const name = input.name?.trim();
      if (!name) return fail("Name is required");
      if (input.rate == null || Number.isNaN(Number(input.rate)) || input.rate < 0) {
        return fail("Rate must be a non-negative number");
      }

      const db = getDb();
      const current = db.select().from(taxes).where(eq(taxes.id, id)).get();
      if (!current) return fail("Tax not found");

      const clash = db.select().from(taxes).where(eq(taxes.name, name)).get();
      if (clash && clash.id !== id) return fail("A tax with this name already exists");

      db.update(taxes)
        .set({
          name,
          rate: Number(input.rate),
          isInclusive: input.isInclusive ?? current.isInclusive,
          isActive: input.isActive ?? current.isActive,
          updatedAt: nowIso(),
        })
        .where(eq(taxes.id, id))
        .run();

      const row = db.select().from(taxes).where(eq(taxes.id, id)).get()!;
      return ok(mapTax(row));
    })
  );

  registerHandler(IPC.TAXES_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("settings.manage"), async () => {
      const db = getDb();
      const current = db.select().from(taxes).where(eq(taxes.id, id)).get();
      if (!current) return fail("Tax not found");

      const inUse = db.select({ value: count() }).from(products).where(eq(products.taxId, id)).get()?.value ?? 0;
      if (inUse > 0) return fail("Cannot delete: tax is used by products. Deactivate it instead.");

      db.delete(taxes).where(eq(taxes.id, id)).run();
      return ok(undefined);
    })
  );

  registerHandler(IPC.DISCOUNTS_LIST, async (): Promise<ActionResult<Discount[]>> =>
    guarded(() => requireSession(), async () => {
      const rows = getDb().select().from(discounts).orderBy(asc(discounts.name)).all();
      return ok(rows.map(mapDiscount));
    })
  );

  registerHandler(IPC.DISCOUNTS_CREATE, async (_e, input: DiscountInput): Promise<ActionResult<Discount>> =>
    guarded(() => requirePermission("settings.manage"), async () => {
      const name = input.name?.trim();
      if (!name) return fail("Name is required");
      if (!input.type || !["percent", "fixed"].includes(input.type)) return fail("Type must be percent or fixed");
      if (input.value == null || Number.isNaN(Number(input.value)) || input.value < 0) {
        return fail("Value must be a non-negative number");
      }

      const db = getDb();
      const exists = db.select().from(discounts).where(eq(discounts.name, name)).get();
      if (exists) return fail("A discount with this name already exists");

      const id = randomUUID();
      db.insert(discounts)
        .values({
          id,
          name,
          type: input.type,
          value: Number(input.value),
          isActive: input.isActive ?? true,
        })
        .run();

      const row = db.select().from(discounts).where(eq(discounts.id, id)).get()!;
      return ok(mapDiscount(row));
    })
  );

  registerHandler(
    IPC.DISCOUNTS_UPDATE,
    async (_e, id: string, input: DiscountInput): Promise<ActionResult<Discount>> =>
      guarded(() => requirePermission("settings.manage"), async () => {
        const name = input.name?.trim();
        if (!name) return fail("Name is required");
        if (!input.type || !["percent", "fixed"].includes(input.type)) return fail("Type must be percent or fixed");
        if (input.value == null || Number.isNaN(Number(input.value)) || input.value < 0) {
          return fail("Value must be a non-negative number");
        }

        const db = getDb();
        const current = db.select().from(discounts).where(eq(discounts.id, id)).get();
        if (!current) return fail("Discount not found");

        const clash = db.select().from(discounts).where(eq(discounts.name, name)).get();
        if (clash && clash.id !== id) return fail("A discount with this name already exists");

        db.update(discounts)
          .set({
            name,
            type: input.type,
            value: Number(input.value),
            isActive: input.isActive ?? current.isActive,
            updatedAt: nowIso(),
          })
          .where(eq(discounts.id, id))
          .run();

        const row = db.select().from(discounts).where(eq(discounts.id, id)).get()!;
        return ok(mapDiscount(row));
      })
  );

  registerHandler(IPC.DISCOUNTS_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("settings.manage"), async () => {
      const db = getDb();
      const current = db.select().from(discounts).where(eq(discounts.id, id)).get();
      if (!current) return fail("Discount not found");
      db.delete(discounts).where(eq(discounts.id, id)).run();
      return ok(undefined);
    })
  );

  registerHandler(IPC.ADDITIONS_LIST, async (): Promise<ActionResult<Addition[]>> =>
    guarded(() => requireSession(), async () => {
      const rows = getDb().select().from(additions).orderBy(asc(additions.name)).all();
      return ok(rows.map(mapAddition));
    })
  );

  registerHandler(IPC.ADDITIONS_CREATE, async (_e, input: AdditionInput): Promise<ActionResult<Addition>> =>
    guarded(() => requirePermission("settings.manage"), async () => {
      const name = input.name?.trim();
      if (!name) return fail("Name is required");
      if (!input.type || !["percent", "fixed"].includes(input.type)) return fail("Type must be percent or fixed");
      if (input.value == null || Number.isNaN(Number(input.value)) || input.value < 0) {
        return fail("Value must be a non-negative number");
      }

      const db = getDb();
      const exists = db.select().from(additions).where(eq(additions.name, name)).get();
      if (exists) return fail("An addition with this name already exists");

      const id = randomUUID();
      db.insert(additions)
        .values({
          id,
          name,
          type: input.type,
          value: Number(input.value),
          isActive: input.isActive ?? true,
        })
        .run();

      const row = db.select().from(additions).where(eq(additions.id, id)).get()!;
      return ok(mapAddition(row));
    })
  );

  registerHandler(
    IPC.ADDITIONS_UPDATE,
    async (_e, id: string, input: AdditionInput): Promise<ActionResult<Addition>> =>
      guarded(() => requirePermission("settings.manage"), async () => {
        const name = input.name?.trim();
        if (!name) return fail("Name is required");
        if (!input.type || !["percent", "fixed"].includes(input.type)) return fail("Type must be percent or fixed");
        if (input.value == null || Number.isNaN(Number(input.value)) || input.value < 0) {
          return fail("Value must be a non-negative number");
        }

        const db = getDb();
        const current = db.select().from(additions).where(eq(additions.id, id)).get();
        if (!current) return fail("Addition not found");

        const clash = db.select().from(additions).where(eq(additions.name, name)).get();
        if (clash && clash.id !== id) return fail("An addition with this name already exists");

        db.update(additions)
          .set({
            name,
            type: input.type,
            value: Number(input.value),
            isActive: input.isActive ?? current.isActive,
            updatedAt: nowIso(),
          })
          .where(eq(additions.id, id))
          .run();

        const row = db.select().from(additions).where(eq(additions.id, id)).get()!;
        return ok(mapAddition(row));
      })
  );

  registerHandler(IPC.ADDITIONS_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("settings.manage"), async () => {
      const db = getDb();
      const current = db.select().from(additions).where(eq(additions.id, id)).get();
      if (!current) return fail("Addition not found");
      db.delete(additions).where(eq(additions.id, id)).run();
      return ok(undefined);
    })
  );
}
