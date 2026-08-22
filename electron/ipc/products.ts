import { registerHandler } from "./register";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  IPC,
  type ActionResult,
  type Product,
  type ProductInput,
  type ProductVariant,
  type ProductVariantInput,
  type InventoryRow,
  type StockAdjustInput,
} from "../../shared/ipc";
import { getDb } from "../db";
import { nextDocumentNumber } from "../db/counters";
import {
  products,
  productVariants,
  categories,
  units,
  taxes,
  stockMovements,
  saleItems,
  purchaseItems,
} from "../db/schema";
import { requirePermission, requireAnyPermission, getCurrentSession, PermissionError } from "./session";

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

function mapVariant(row: typeof productVariants.$inferSelect): ProductVariant {
  return {
    id: row.id,
    productId: row.productId,
    sku: row.sku,
    barcode: row.barcode,
    size: row.size,
    color: row.color,
    costPrice: row.costPrice,
    salePrice: row.salePrice,
    stockQty: row.stockQty,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function enrichProduct(id: string): Product | null {
  const db = getDb();
  const row = db.select().from(products).where(eq(products.id, id)).get();
  if (!row) return null;

  const category = row.categoryId
    ? db.select().from(categories).where(eq(categories.id, row.categoryId)).get()
    : null;
  const unit = row.unitId ? db.select().from(units).where(eq(units.id, row.unitId)).get() : null;
  const tax = row.taxId ? db.select().from(taxes).where(eq(taxes.id, row.taxId)).get() : null;
  const variantCount =
    db.select({ value: count() }).from(productVariants).where(eq(productVariants.productId, id)).get()
      ?.value ?? 0;
  const stockRow = db
    .select({ total: sql<number>`coalesce(sum(${productVariants.stockQty}), 0)` })
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .get();

  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    unitId: row.unitId,
    brand: row.brand,
    gender: row.gender,
    season: row.season,
    costPrice: row.costPrice,
    salePrice: row.salePrice,
    wholesalePrice: row.wholesalePrice,
    taxId: row.taxId,
    reorderLevel: row.reorderLevel,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    categoryName: category?.name ?? null,
    unitName: unit?.shortName ?? unit?.name ?? null,
    taxName: tax?.name ?? null,
    variantCount,
    totalStock: Number(stockRow?.total ?? 0),
  };
}

function allocateSku(preferred?: string): string {
  const db = getDb();
  if (preferred?.trim()) {
    const sku = preferred.trim();
    const exists = db.select().from(products).where(eq(products.sku, sku)).get();
    if (exists) throw new Error("A product with this SKU already exists");
    return sku;
  }
  for (let i = 0; i < 40; i++) {
    const sku = nextDocumentNumber(db, "product");
    const exists = db.select().from(products).where(eq(products.sku, sku)).get();
    if (!exists) return sku;
  }
  throw new Error("Could not allocate a unique SKU");
}

function variantSkuFor(productSku: string, size: string, color: string): string {
  const slug = `${size}-${color}`.replace(/\s+/g, "").replace(/[^a-zA-Z0-9-_]/g, "");
  return `${productSku}-${slug || "VAR"}`;
}

function allocateVariantSku(productSku: string, size: string, color: string, preferred?: string): string {
  const db = getDb();
  if (preferred?.trim()) {
    const sku = preferred.trim();
    const exists = db.select().from(productVariants).where(eq(productVariants.sku, sku)).get();
    if (exists) throw new Error("A variant with this SKU already exists");
    return sku;
  }
  let base = variantSkuFor(productSku, size, color);
  let candidate = base;
  let n = 1;
  while (db.select().from(productVariants).where(eq(productVariants.sku, candidate)).get()) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

export function registerProductHandlers(): void {
  registerHandler(IPC.PRODUCTS_LIST, async (): Promise<ActionResult<Product[]>> =>
    guarded(() => requirePermission("products.view"), async () => {
      const rows = getDb()
        .select({ id: products.id })
        .from(products)
        .orderBy(desc(products.createdAt), asc(products.name))
        .all();
      return ok(rows.map((r) => enrichProduct(r.id)!).filter(Boolean));
    })
  );

  registerHandler(IPC.PRODUCTS_GET, async (_e, id: string): Promise<ActionResult<Product>> =>
    guarded(() => requirePermission("products.view"), async () => {
      const product = enrichProduct(id);
      if (!product) return fail("Product not found");
      return ok(product);
    })
  );

  registerHandler(IPC.PRODUCTS_CREATE, async (_e, input: ProductInput): Promise<ActionResult<Product>> =>
    guarded(() => requirePermission("products.manage"), async () => {
      const name = input.name?.trim();
      if (!name) return fail("Name is required");
      if (input.costPrice == null || Number.isNaN(Number(input.costPrice)) || input.costPrice < 0) {
        return fail("Cost price must be a non-negative number");
      }
      if (input.salePrice == null || Number.isNaN(Number(input.salePrice)) || input.salePrice < 0) {
        return fail("Sale price must be a non-negative number");
      }

      const db = getDb();
      if (input.categoryId) {
        const cat = db.select().from(categories).where(eq(categories.id, input.categoryId)).get();
        if (!cat) return fail("Category not found");
      }
      if (input.unitId) {
        const unit = db.select().from(units).where(eq(units.id, input.unitId)).get();
        if (!unit) return fail("Unit not found");
      }
      if (input.taxId) {
        const tax = db.select().from(taxes).where(eq(taxes.id, input.taxId)).get();
        if (!tax) return fail("Tax not found");
      }

      const id = randomUUID();
      const sku = allocateSku(input.sku);
      db.insert(products)
        .values({
          id,
          sku,
          barcode: input.barcode?.trim() || null,
          name,
          description: input.description?.trim() || null,
          categoryId: input.categoryId ?? null,
          unitId: input.unitId ?? null,
          brand: input.brand?.trim() || null,
          gender: input.gender?.trim() || null,
          season: input.season?.trim() || null,
          costPrice: Number(input.costPrice),
          salePrice: Number(input.salePrice),
          wholesalePrice:
            input.wholesalePrice == null || input.wholesalePrice === undefined
              ? null
              : Number(input.wholesalePrice),
          taxId: input.taxId ?? null,
          reorderLevel: Number(input.reorderLevel ?? 0),
          isActive: input.isActive ?? true,
        })
        .run();

      // Default pack so inventory/sales can attach stock immediately
      const variantId = randomUUID();
      db.insert(productVariants)
        .values({
          id: variantId,
          productId: id,
          sku: allocateVariantSku(sku, "Default", "Standard"),
          size: "Default",
          color: "Standard",
          costPrice: Number(input.costPrice),
          salePrice: Number(input.salePrice),
          stockQty: 0,
          isActive: true,
        })
        .run();

      return ok(enrichProduct(id)!);
    })
  );

  registerHandler(
    IPC.PRODUCTS_UPDATE,
    async (_e, id: string, input: ProductInput): Promise<ActionResult<Product>> =>
      guarded(() => requirePermission("products.manage"), async () => {
        const name = input.name?.trim();
        if (!name) return fail("Name is required");
        if (input.costPrice == null || Number.isNaN(Number(input.costPrice)) || input.costPrice < 0) {
          return fail("Cost price must be a non-negative number");
        }
        if (input.salePrice == null || Number.isNaN(Number(input.salePrice)) || input.salePrice < 0) {
          return fail("Sale price must be a non-negative number");
        }

        const db = getDb();
        const current = db.select().from(products).where(eq(products.id, id)).get();
        if (!current) return fail("Product not found");

        let sku = current.sku;
        if (input.sku?.trim() && input.sku.trim() !== current.sku) {
          sku = allocateSku(input.sku);
        }

        if (input.categoryId) {
          const cat = db.select().from(categories).where(eq(categories.id, input.categoryId)).get();
          if (!cat) return fail("Category not found");
        }
        if (input.unitId) {
          const unit = db.select().from(units).where(eq(units.id, input.unitId)).get();
          if (!unit) return fail("Unit not found");
        }
        if (input.taxId) {
          const tax = db.select().from(taxes).where(eq(taxes.id, input.taxId)).get();
          if (!tax) return fail("Tax not found");
        }

        db.update(products)
          .set({
            sku,
            barcode: input.barcode === undefined ? current.barcode : input.barcode?.trim() || null,
            name,
            description:
              input.description === undefined
                ? current.description
                : input.description?.trim() || null,
            categoryId: input.categoryId === undefined ? current.categoryId : input.categoryId,
            unitId: input.unitId === undefined ? current.unitId : input.unitId,
            brand: input.brand === undefined ? current.brand : input.brand?.trim() || null,
            gender: input.gender === undefined ? current.gender : input.gender?.trim() || null,
            season: input.season === undefined ? current.season : input.season?.trim() || null,
            costPrice: Number(input.costPrice),
            salePrice: Number(input.salePrice),
            wholesalePrice:
              input.wholesalePrice === undefined
                ? current.wholesalePrice
                : input.wholesalePrice == null
                  ? null
                  : Number(input.wholesalePrice),
            taxId: input.taxId === undefined ? current.taxId : input.taxId,
            reorderLevel:
              input.reorderLevel === undefined ? current.reorderLevel : Number(input.reorderLevel),
            isActive: input.isActive ?? current.isActive,
            updatedAt: nowIso(),
          })
          .where(eq(products.id, id))
          .run();

        return ok(enrichProduct(id)!);
      })
  );

  registerHandler(IPC.PRODUCTS_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("products.manage"), async () => {
      const db = getDb();
      const current = db.select().from(products).where(eq(products.id, id)).get();
      if (!current) return fail("Product not found");

      const variants = db.select().from(productVariants).where(eq(productVariants.productId, id)).all();
      for (const v of variants) {
        const sold =
          db.select({ value: count() }).from(saleItems).where(eq(saleItems.variantId, v.id)).get()
            ?.value ?? 0;
        const purchased =
          db.select({ value: count() }).from(purchaseItems).where(eq(purchaseItems.variantId, v.id)).get()
            ?.value ?? 0;
        if (sold > 0 || purchased > 0) {
          return fail("Cannot delete: product has sales/purchase history. Deactivate it instead.");
        }
      }

      for (const v of variants) {
        db.delete(stockMovements).where(eq(stockMovements.variantId, v.id)).run();
        db.delete(productVariants).where(eq(productVariants.id, v.id)).run();
      }
      db.delete(products).where(eq(products.id, id)).run();
      return ok(undefined);
    })
  );

  registerHandler(IPC.VARIANTS_LIST, async (_e, productId: string): Promise<ActionResult<ProductVariant[]>> =>
    guarded(() => requirePermission("products.view"), async () => {
      const db = getDb();
      const product = db.select().from(products).where(eq(products.id, productId)).get();
      if (!product) return fail("Product not found");
      const rows = db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, productId))
        .orderBy(asc(productVariants.size), asc(productVariants.color))
        .all();
      return ok(rows.map(mapVariant));
    })
  );

  registerHandler(
    IPC.VARIANTS_CREATE,
    async (_e, productId: string, input: ProductVariantInput): Promise<ActionResult<ProductVariant>> =>
      guarded(() => requirePermission("products.manage"), async () => {
        const size = input.size?.trim();
        const color = input.color?.trim();
        if (!size || !color) return fail("Pack size and grade/type are required");

        const db = getDb();
        const product = db.select().from(products).where(eq(products.id, productId)).get();
        if (!product) return fail("Product not found");

        const clash = db
          .select()
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, productId),
              eq(productVariants.size, size),
              eq(productVariants.color, color)
            )
          )
          .get();
        if (clash) return fail("A pack with this size and grade already exists");

        const id = randomUUID();
        const sku = allocateVariantSku(product.sku, size, color, input.sku);
        const stockQty = Number(input.stockQty ?? 0);
        if (Number.isNaN(stockQty) || stockQty < 0) return fail("Stock must be a non-negative number");

        db.insert(productVariants)
          .values({
            id,
            productId,
            sku,
            barcode: input.barcode?.trim() || null,
            size,
            color,
            costPrice: input.costPrice == null ? product.costPrice : Number(input.costPrice),
            salePrice: input.salePrice == null ? product.salePrice : Number(input.salePrice),
            stockQty,
            isActive: input.isActive ?? true,
          })
          .run();

        if (stockQty > 0) {
          const session = getCurrentSession();
          db.insert(stockMovements)
            .values({
              id: randomUUID(),
              variantId: id,
              movementType: "in",
              quantity: stockQty,
              referenceType: "adjustment",
              notes: "Initial stock on pack create",
              createdBy: session?.id ?? null,
            })
            .run();
        }

        const row = db.select().from(productVariants).where(eq(productVariants.id, id)).get()!;
        return ok(mapVariant(row));
      })
  );

  registerHandler(
    IPC.VARIANTS_UPDATE,
    async (_e, id: string, input: ProductVariantInput): Promise<ActionResult<ProductVariant>> =>
      guarded(() => requirePermission("products.manage"), async () => {
        const size = input.size?.trim();
        const color = input.color?.trim();
        if (!size || !color) return fail("Pack size and grade/type are required");

        const db = getDb();
        const current = db.select().from(productVariants).where(eq(productVariants.id, id)).get();
        if (!current) return fail("Variant not found");

        const clash = db
          .select()
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, current.productId),
              eq(productVariants.size, size),
              eq(productVariants.color, color)
            )
          )
          .get();
        if (clash && clash.id !== id) return fail("A pack with this size and grade already exists");

        let sku = current.sku;
        if (input.sku?.trim() && input.sku.trim() !== current.sku) {
          const exists = db
            .select()
            .from(productVariants)
            .where(eq(productVariants.sku, input.sku.trim()))
            .get();
          if (exists) return fail("A variant with this SKU already exists");
          sku = input.sku.trim();
        }

        db.update(productVariants)
          .set({
            sku,
            barcode: input.barcode === undefined ? current.barcode : input.barcode?.trim() || null,
            size,
            color,
            costPrice:
              input.costPrice === undefined
                ? current.costPrice
                : input.costPrice == null
                  ? null
                  : Number(input.costPrice),
            salePrice:
              input.salePrice === undefined
                ? current.salePrice
                : input.salePrice == null
                  ? null
                  : Number(input.salePrice),
            isActive: input.isActive ?? current.isActive,
            updatedAt: nowIso(),
          })
          .where(eq(productVariants.id, id))
          .run();

        const row = db.select().from(productVariants).where(eq(productVariants.id, id)).get()!;
        return ok(mapVariant(row));
      })
  );

  registerHandler(IPC.VARIANTS_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("products.manage"), async () => {
      const db = getDb();
      const current = db.select().from(productVariants).where(eq(productVariants.id, id)).get();
      if (!current) return fail("Variant not found");

      const siblingCount =
        db
          .select({ value: count() })
          .from(productVariants)
          .where(eq(productVariants.productId, current.productId))
          .get()?.value ?? 0;
      if (siblingCount <= 1) return fail("Cannot delete the last pack. Deactivate the product instead.");

      const sold =
        db.select({ value: count() }).from(saleItems).where(eq(saleItems.variantId, id)).get()?.value ??
        0;
      const purchased =
        db.select({ value: count() }).from(purchaseItems).where(eq(purchaseItems.variantId, id)).get()
          ?.value ?? 0;
      if (sold > 0 || purchased > 0) {
        return fail("Cannot delete: pack has sales/purchase history. Deactivate it instead.");
      }

      db.delete(stockMovements).where(eq(stockMovements.variantId, id)).run();
      db.delete(productVariants).where(eq(productVariants.id, id)).run();
      return ok(undefined);
    })
  );

  registerHandler(IPC.INVENTORY_LIST, async (): Promise<ActionResult<InventoryRow[]>> =>
    guarded(() => requirePermission("inventory.view"), async () => {
      const db = getDb();
      const rows = db
        .select({
          variantId: productVariants.id,
          productId: products.id,
          productName: products.name,
          productSku: products.sku,
          variantSku: productVariants.sku,
          barcode: productVariants.barcode,
          productBarcode: products.barcode,
          size: productVariants.size,
          color: productVariants.color,
          stockQty: productVariants.stockQty,
          unit: units.shortName,
          costPrice: sql<number>`coalesce(${productVariants.costPrice}, ${products.costPrice})`,
          salePrice: sql<number>`coalesce(${productVariants.salePrice}, ${products.salePrice})`,
          reorderLevel: products.reorderLevel,
          isActive: productVariants.isActive,
        })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .leftJoin(units, eq(products.unitId, units.id))
        .orderBy(desc(products.createdAt), asc(products.name), asc(productVariants.size))
        .all();

      return ok(
        rows.map((r) => ({
          variantId: r.variantId,
          productId: r.productId,
          productName: r.productName,
          productSku: r.productSku,
          variantSku: r.variantSku,
          barcode: r.barcode,
          productBarcode: r.productBarcode,
          size: r.size,
          color: r.color,
          stockQty: Number(r.stockQty),
          unit: r.unit ?? null,
          costPrice: Number(r.costPrice),
          salePrice: Number(r.salePrice),
          reorderLevel: Number(r.reorderLevel),
          isLowStock: Number(r.stockQty) <= Number(r.reorderLevel),
          isActive: r.isActive,
        }))
      );
    })
  );

  registerHandler(
    IPC.INVENTORY_FIND_BARCODE,
    async (_e, barcode: string): Promise<ActionResult<InventoryRow>> =>
      guarded(() => requireAnyPermission("sales.create", "purchases.create", "inventory.view"), async () => {
        const code = String(barcode ?? "").trim();
        if (!code) return fail("Scan or enter a barcode");

        const db = getDb();
        const selectRow = {
          variantId: productVariants.id,
          productId: products.id,
          productName: products.name,
          productSku: products.sku,
          variantSku: productVariants.sku,
          barcode: productVariants.barcode,
          productBarcode: products.barcode,
          size: productVariants.size,
          color: productVariants.color,
          stockQty: productVariants.stockQty,
          unit: units.shortName,
          costPrice: sql<number>`coalesce(${productVariants.costPrice}, ${products.costPrice})`,
          salePrice: sql<number>`coalesce(${productVariants.salePrice}, ${products.salePrice})`,
          reorderLevel: products.reorderLevel,
          isActive: productVariants.isActive,
        };

        const toRow = (r: {
          variantId: string;
          productId: string;
          productName: string;
          productSku: string;
          variantSku: string;
          barcode: string | null;
          productBarcode: string | null;
          size: string;
          color: string;
          stockQty: number;
          unit: string | null;
          costPrice: number;
          salePrice: number;
          reorderLevel: number;
          isActive: boolean;
        }): InventoryRow => ({
          variantId: r.variantId,
          productId: r.productId,
          productName: r.productName,
          productSku: r.productSku,
          variantSku: r.variantSku,
          barcode: r.barcode,
          productBarcode: r.productBarcode,
          size: r.size,
          color: r.color,
          stockQty: Number(r.stockQty),
          unit: r.unit ?? null,
          costPrice: Number(r.costPrice),
          salePrice: Number(r.salePrice),
          reorderLevel: Number(r.reorderLevel),
          isLowStock: Number(r.stockQty) <= Number(r.reorderLevel),
          isActive: r.isActive,
        });

        // 1) Exact pack/variant barcode
        const byVariant = db
          .select(selectRow)
          .from(productVariants)
          .innerJoin(products, eq(productVariants.productId, products.id))
          .leftJoin(units, eq(products.unitId, units.id))
          .where(and(eq(productVariants.barcode, code), eq(productVariants.isActive, true)))
          .all();
        if (byVariant.length === 1) return ok(toRow(byVariant[0]!));
        if (byVariant.length > 1) {
          return fail("Multiple packs share this barcode — pick from the list");
        }

        // 2) Product-level barcode → prefer single active pack
        const byProduct = db
          .select(selectRow)
          .from(productVariants)
          .innerJoin(products, eq(productVariants.productId, products.id))
          .leftJoin(units, eq(products.unitId, units.id))
          .where(
            and(
              eq(products.barcode, code),
              eq(productVariants.isActive, true),
              eq(products.isActive, true)
            )
          )
          .all();
        if (byProduct.length === 1) return ok(toRow(byProduct[0]!));
        if (byProduct.length > 1) {
          return fail("This product has multiple packs — select the pack manually");
        }

        return fail("No product found for this barcode");
      })
  );

  registerHandler(
    IPC.INVENTORY_ADJUST,
    async (_e, input: StockAdjustInput): Promise<ActionResult<InventoryRow>> =>
      guarded(() => requirePermission("inventory.manage"), async () => {
        const newQty = Number(input.newQty);
        if (Number.isNaN(newQty) || newQty < 0) return fail("Quantity must be a non-negative number");

        const db = getDb();
        const variant = db
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, input.variantId))
          .get();
        if (!variant) return fail("Variant not found");

        const product = db.select().from(products).where(eq(products.id, variant.productId)).get();
        if (!product) return fail("Product not found");

        const delta = newQty - variant.stockQty;
        db.update(productVariants)
          .set({ stockQty: newQty, updatedAt: nowIso() })
          .where(eq(productVariants.id, variant.id))
          .run();

        if (delta !== 0) {
          const session = getCurrentSession();
          db.insert(stockMovements)
            .values({
              id: randomUUID(),
              variantId: variant.id,
              movementType: "adjust",
              quantity: delta,
              referenceType: "adjustment",
              notes: input.notes?.trim() || "Manual stock adjustment",
              createdBy: session?.id ?? null,
            })
            .run();
        }

        const row: InventoryRow = {
          variantId: variant.id,
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          variantSku: variant.sku,
          barcode: variant.barcode,
          productBarcode: product.barcode,
          size: variant.size,
          color: variant.color,
          stockQty: newQty,
          unit: product.unitId
            ? db.select().from(units).where(eq(units.id, product.unitId)).get()?.shortName ?? null
            : null,
          costPrice: Number(variant.costPrice ?? product.costPrice),
          salePrice: Number(variant.salePrice ?? product.salePrice),
          reorderLevel: product.reorderLevel,
          isLowStock: newQty <= product.reorderLevel,
          isActive: variant.isActive,
        };
        return ok(row);
      })
  );
}
