import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { productVariants, products } from "../db/schema";
import { supabaseRest, supabaseUpsert, tenantId } from "./client";
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

export async function syncProducts(): Promise<{
  pushedProducts: number;
  pulledProducts: number;
  pushedVariants: number;
  pulledVariants: number;
}> {
  const tid = tenantId();
  const db = getDb();

  const localProducts = db.select().from(products).all();
  const productPayload: CloudProduct[] = localProducts.map((row) => ({
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
  }));
  const pushedProducts = await supabaseUpsert("products", productPayload);

  const localVariants = db.select().from(productVariants).all();
  const variantPayload: CloudVariant[] = localVariants.map((row) => ({
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
  }));
  const pushedVariants = await supabaseUpsert("product_variants", variantPayload);

  const remoteProducts = await supabaseRest<CloudProduct[]>("products", {
    method: "GET",
    query: `tenant_id=eq.${encodeURIComponent(tid)}&deleted_at=is.null&select=*`,
  });

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

  const remoteVariants = await supabaseRest<CloudVariant[]>("product_variants", {
    method: "GET",
    query: `tenant_id=eq.${encodeURIComponent(tid)}&deleted_at=is.null&select=*`,
  });

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

  return { pushedProducts, pulledProducts, pushedVariants, pulledVariants };
}
