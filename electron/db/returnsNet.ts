import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "./index";
import {
  purchaseReturns,
  saleReturnItems,
  saleReturns,
  productVariants,
  products,
} from "./schema";
import { money } from "./ledger";

/** Sum of sale returns on a calendar day (by returnDate). */
export function sumSaleReturnsOnDate(db: Db, date: string): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${saleReturns.grandTotal}), 0)` })
    .from(saleReturns)
    .where(eq(saleReturns.returnDate, date))
    .get();
  return Number(row?.total ?? 0);
}

export function sumPurchaseReturnsOnDate(db: Db, date: string): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${purchaseReturns.grandTotal}), 0)` })
    .from(purchaseReturns)
    .where(eq(purchaseReturns.returnDate, date))
    .get();
  return Number(row?.total ?? 0);
}

export function sumSaleReturnsInRange(db: Db, fromDate?: string | null, toDate?: string | null): number {
  const conditions = [];
  if (fromDate) conditions.push(gte(saleReturns.returnDate, fromDate));
  if (toDate) conditions.push(lte(saleReturns.returnDate, toDate));
  const row = db
    .select({ total: sql<number>`coalesce(sum(${saleReturns.grandTotal}), 0)` })
    .from(saleReturns)
    .where(conditions.length ? and(...conditions) : undefined)
    .get();
  return Number(row?.total ?? 0);
}

export function sumPurchaseReturnsInRange(
  db: Db,
  fromDate?: string | null,
  toDate?: string | null
): number {
  const conditions = [];
  if (fromDate) conditions.push(gte(purchaseReturns.returnDate, fromDate));
  if (toDate) conditions.push(lte(purchaseReturns.returnDate, toDate));
  const row = db
    .select({ total: sql<number>`coalesce(sum(${purchaseReturns.grandTotal}), 0)` })
    .from(purchaseReturns)
    .where(conditions.length ? and(...conditions) : undefined)
    .get();
  return Number(row?.total ?? 0);
}

export function sumSaleReturnTaxInRange(
  db: Db,
  fromDate?: string | null,
  toDate?: string | null
): number {
  const conditions = [];
  if (fromDate) conditions.push(gte(saleReturns.returnDate, fromDate));
  if (toDate) conditions.push(lte(saleReturns.returnDate, toDate));
  const row = db
    .select({ total: sql<number>`coalesce(sum(${saleReturns.taxAmount}), 0)` })
    .from(saleReturns)
    .where(conditions.length ? and(...conditions) : undefined)
    .get();
  return Number(row?.total ?? 0);
}

export function sumPurchaseReturnTaxInRange(
  db: Db,
  fromDate?: string | null,
  toDate?: string | null
): number {
  const conditions = [];
  if (fromDate) conditions.push(gte(purchaseReturns.returnDate, fromDate));
  if (toDate) conditions.push(lte(purchaseReturns.returnDate, toDate));
  const row = db
    .select({ total: sql<number>`coalesce(sum(${purchaseReturns.taxAmount}), 0)` })
    .from(purchaseReturns)
    .where(conditions.length ? and(...conditions) : undefined)
    .get();
  return Number(row?.total ?? 0);
}

/** Approx COGS of returned sale lines (variant/product cost × qty) in date range. */
export function sumSaleReturnCogsInRange(
  db: Db,
  fromDate?: string | null,
  toDate?: string | null
): number {
  const conditions = [];
  if (fromDate) conditions.push(gte(saleReturns.returnDate, fromDate));
  if (toDate) conditions.push(lte(saleReturns.returnDate, toDate));
  const row = db
    .select({
      total: sql<number>`coalesce(sum(${saleReturnItems.quantity} * coalesce(${productVariants.costPrice}, ${products.costPrice}, 0)), 0)`,
    })
    .from(saleReturnItems)
    .innerJoin(saleReturns, eq(saleReturnItems.saleReturnId, saleReturns.id))
    .innerJoin(productVariants, eq(saleReturnItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .get();
  return Number(row?.total ?? 0);
}

export function returnedTotalForSale(db: Db, saleId: string): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${saleReturns.grandTotal}), 0)` })
    .from(saleReturns)
    .where(eq(saleReturns.saleId, saleId))
    .get();
  return money(Number(row?.total ?? 0));
}

export function returnedTotalForPurchase(db: Db, purchaseId: string): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${purchaseReturns.grandTotal}), 0)` })
    .from(purchaseReturns)
    .where(eq(purchaseReturns.purchaseId, purchaseId))
    .get();
  return money(Number(row?.total ?? 0));
}

/** Map saleId → returned grand total (all returns). */
export function saleReturnedTotalsMap(db: Db): Map<string, number> {
  const rows = db
    .select({
      saleId: saleReturns.saleId,
      total: sql<number>`coalesce(sum(${saleReturns.grandTotal}), 0)`,
    })
    .from(saleReturns)
    .groupBy(saleReturns.saleId)
    .all();
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.saleId) map.set(r.saleId, money(Number(r.total)));
  }
  return map;
}

export function purchaseReturnedTotalsMap(db: Db): Map<string, number> {
  const rows = db
    .select({
      purchaseId: purchaseReturns.purchaseId,
      total: sql<number>`coalesce(sum(${purchaseReturns.grandTotal}), 0)`,
    })
    .from(purchaseReturns)
    .groupBy(purchaseReturns.purchaseId)
    .all();
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.purchaseId) map.set(r.purchaseId, money(Number(r.total)));
  }
  return map;
}

export function netAmount(gross: number, returned: number): number {
  return money(Math.max(0, Number(gross || 0) - Number(returned || 0)));
}
