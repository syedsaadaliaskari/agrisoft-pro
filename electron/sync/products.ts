import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { productVariants, products, stockMovements } from "../db/schema";
import { supabaseUpsert, tenantId } from "./client";
import {
  beginTableDeletes,
  fetchCloudDeletedIds,
  finishTableSnapshot,
  liveRows,
  pushTableTombstones,
  shouldRemoveLocal,
} from "./deletes";
import { fetchTenantRows } from "./pull";
import { isNewer } from "./store";

type CloudProduct = {
  id: string;
  tenant_id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  unit_id: string | null;
  brand: string | null;
  gender: string | null;
  season: string | null;
  cost_price: number;
  sale_price: number;
  wholesale_price: number | null;
  tax_id: string | null;
  reorder_level: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CloudVariant = {
  id: string;
  tenant_id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  size: string;
  color: string;
  cost_price: number | null;
  sale_price: number | null;
  stock_qty: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function removeProductLocal(id: string) {
  const db = getDb();
  const variants = db.select().from(productVariants).where(eq(productVariants.productId, id)).all();
  for (const variant of variants) {
    db.delete(stockMovements).where(eq(stockMovements.variantId, variant.id)).run();
    db.delete(productVariants).where(eq(productVariants.id, variant.id)).run();
  }
  db.delete(products).where(eq(products.id, id)).run();
}

export async function syncProducts(): Promise<{
  pushedProducts: number;
  pulledProducts: number;
  pushedVariants: number;
  pulledVariants: number;
}> {
  const tid = tenantId();
  const db = getDb();

  const localProducts = db.select().from(products).all();
  beginTableDeletes("products", localProducts.map((row) => row.id));
  await pushTableTombstones("products");

  const remoteProducts = await fetchTenantRows<CloudProduct>("products");
  const productLiveIds = new Set(remoteProducts.map((row) => row.id));
  const productDeletedIds = await fetchCloudDeletedIds("products");

  let pulledProducts = 0;
  for (const row of remoteProducts) {
    const existing = db.select().from(products).where(eq(products.id, row.id)).get();
    const mapped = {
      id: row.id,
      sku: row.sku,
      barcode: row.barcode,
      name: row.name,
      description: row.description,
      categoryId: row.category_id,
      unitId: row.unit_id,
      brand: row.brand,
      gender: row.gender,
      season: row.season,
      costPrice: Number(row.cost_price || 0),
      salePrice: Number(row.sale_price || 0),
      wholesalePrice: row.wholesale_price == null ? 0 : Number(row.wholesale_price),
      taxId: row.tax_id,
      reorderLevel: Number(row.reorder_level || 0),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(products).values(mapped).run();
      pulledProducts += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(products).set(mapped).where(eq(products.id, row.id)).run();
      pulledProducts += 1;
    }
  }

  for (const row of db.select().from(products).all()) {
    if (productDeletedIds.has(row.id) || shouldRemoveLocal("products", row.id, row.updatedAt, productLiveIds)) {
      removeProductLocal(row.id);
    }
  }

  const remainingProducts = liveRows("products", db.select().from(products).all());
  const pushedProducts = await supabaseUpsert(
    "products",
    remainingProducts.map((row) => ({
      id: row.id,
      tenant_id: tid,
      sku: row.sku,
      barcode: row.barcode,
      name: row.name,
      description: row.description,
      category_id: row.categoryId,
      unit_id: row.unitId,
      brand: row.brand,
      gender: row.gender,
      season: row.season,
      cost_price: row.costPrice,
      sale_price: row.salePrice,
      wholesale_price: row.wholesalePrice,
      tax_id: row.taxId,
      reorder_level: row.reorderLevel,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );
  finishTableSnapshot("products", remainingProducts.map((row) => row.id));

  const localVariants = db.select().from(productVariants).all();
  beginTableDeletes("product_variants", localVariants.map((row) => row.id));
  await pushTableTombstones("product_variants");

  const remoteVariants = await fetchTenantRows<CloudVariant>("product_variants");
  const variantLiveIds = new Set(remoteVariants.map((row) => row.id));
  const variantDeletedIds = await fetchCloudDeletedIds("product_variants");

  let pulledVariants = 0;
  for (const row of remoteVariants) {
    const product = db.select().from(products).where(eq(products.id, row.product_id)).get();
    if (!product) continue;
    const existing = db.select().from(productVariants).where(eq(productVariants.id, row.id)).get();
    const mapped = {
      id: row.id,
      productId: row.product_id,
      sku: row.sku,
      barcode: row.barcode,
      size: row.size || "Default",
      color: row.color || "Default",
      costPrice: row.cost_price == null ? null : Number(row.cost_price),
      salePrice: row.sale_price == null ? null : Number(row.sale_price),
      stockQty: Number(row.stock_qty || 0),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(productVariants).values(mapped).run();
      pulledVariants += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(productVariants).set(mapped).where(eq(productVariants.id, row.id)).run();
      pulledVariants += 1;
    }
  }

  for (const row of db.select().from(productVariants).all()) {
    if (variantDeletedIds.has(row.id) || shouldRemoveLocal("product_variants", row.id, row.updatedAt, variantLiveIds)) {
      db.delete(stockMovements).where(eq(stockMovements.variantId, row.id)).run();
      db.delete(productVariants).where(eq(productVariants.id, row.id)).run();
    }
  }

  const remainingVariants = liveRows("product_variants", db.select().from(productVariants).all());
  const pushedVariants = await supabaseUpsert(
    "product_variants",
    remainingVariants.map((row) => ({
      id: row.id,
      tenant_id: tid,
      product_id: row.productId,
      sku: row.sku,
      barcode: row.barcode,
      size: row.size,
      color: row.color,
      cost_price: row.costPrice,
      sale_price: row.salePrice,
      stock_qty: row.stockQty,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );
  finishTableSnapshot("product_variants", remainingVariants.map((row) => row.id));

  return { pushedProducts, pulledProducts, pushedVariants, pulledVariants };
}
