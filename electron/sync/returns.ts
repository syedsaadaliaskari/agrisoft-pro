import { eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  customers,
  productVariants,
  purchaseReturnItems,
  purchaseReturns,
  purchases,
  saleReturnItems,
  saleReturns,
  sales,
  vendors,
  vouchers,
} from "../db/schema";
import { supabaseUpsert, tenantId } from "./client";
import { fetchTenantRows, type SyncCounts } from "./pull";
import { isNewer } from "./store";

export async function syncReturns(): Promise<{ saleReturns: SyncCounts; purchaseReturns: SyncCounts }> {
  const tid = tenantId();
  const db = getDb();

  const localSaleReturns = db.select().from(saleReturns).all();
  const pushedSaleReturns = await supabaseUpsert(
    "sale_returns",
    localSaleReturns.map((row) => ({
      id: row.id,
      tenant_id: tid,
      voucher_id: row.voucherId,
      return_no: row.returnNo,
      return_date: row.returnDate,
      sale_id: row.saleId,
      customer_id: row.customerId,
      subtotal: row.subtotal,
      tax_amount: row.taxAmount,
      grand_total: row.grandTotal,
      notes: row.notes,
      created_by: null,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );

  const localSaleReturnItems = db.select().from(saleReturnItems).all();
  await supabaseUpsert(
    "sale_return_items",
    localSaleReturnItems.map((row) => {
      const parent = localSaleReturns.find((r) => r.id === row.saleReturnId);
      const stamp = parent?.updatedAt || parent?.createdAt || new Date().toISOString();
      return {
        id: row.id,
        tenant_id: tid,
        sale_return_id: row.saleReturnId,
        variant_id: row.variantId,
        quantity: row.quantity,
        unit_price: row.unitPrice,
        line_total: row.lineTotal,
        created_at: stamp,
        updated_at: stamp,
        deleted_at: null,
      };
    })
  );

  let pulledSaleReturns = 0;
  for (const row of await fetchTenantRows<{
    id: string;
    voucher_id: string;
    return_no: string;
    return_date: string;
    sale_id: string | null;
    customer_id: string | null;
    subtotal: number;
    tax_amount: number;
    grand_total: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>("sale_returns")) {
    if (!db.select().from(vouchers).where(eq(vouchers.id, row.voucher_id)).get()) continue;
    if (row.sale_id && !db.select().from(sales).where(eq(sales.id, row.sale_id)).get()) continue;
    if (row.customer_id && !db.select().from(customers).where(eq(customers.id, row.customer_id)).get()) {
      continue;
    }
    const existing = db.select().from(saleReturns).where(eq(saleReturns.id, row.id)).get();
    const mapped = {
      id: row.id,
      voucherId: row.voucher_id,
      returnNo: row.return_no,
      returnDate: row.return_date,
      saleId: row.sale_id,
      customerId: row.customer_id,
      subtotal: Number(row.subtotal || 0),
      taxAmount: Number(row.tax_amount || 0),
      grandTotal: Number(row.grand_total || 0),
      notes: row.notes,
      createdBy: null as string | null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(saleReturns).values(mapped).run();
      pulledSaleReturns += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(saleReturns).set(mapped).where(eq(saleReturns.id, row.id)).run();
      pulledSaleReturns += 1;
    }
  }

  for (const row of await fetchTenantRows<{
    id: string;
    sale_return_id: string;
    variant_id: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>("sale_return_items")) {
    if (!db.select().from(saleReturns).where(eq(saleReturns.id, row.sale_return_id)).get()) continue;
    if (!db.select().from(productVariants).where(eq(productVariants.id, row.variant_id)).get()) continue;
    const existing = db.select().from(saleReturnItems).where(eq(saleReturnItems.id, row.id)).get();
    const mapped = {
      id: row.id,
      saleReturnId: row.sale_return_id,
      variantId: row.variant_id,
      quantity: Number(row.quantity || 0),
      unitPrice: Number(row.unit_price || 0),
      lineTotal: Number(row.line_total || 0),
    };
    if (!existing) db.insert(saleReturnItems).values(mapped).run();
    else db.update(saleReturnItems).set(mapped).where(eq(saleReturnItems.id, row.id)).run();
  }

  const localPurchaseReturns = db.select().from(purchaseReturns).all();
  const pushedPurchaseReturns = await supabaseUpsert(
    "purchase_returns",
    localPurchaseReturns.map((row) => ({
      id: row.id,
      tenant_id: tid,
      voucher_id: row.voucherId,
      return_no: row.returnNo,
      return_date: row.returnDate,
      purchase_id: row.purchaseId,
      vendor_id: row.vendorId,
      subtotal: row.subtotal,
      tax_amount: row.taxAmount,
      grand_total: row.grandTotal,
      notes: row.notes,
      created_by: null,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );

  const localPurchaseReturnItems = db.select().from(purchaseReturnItems).all();
  await supabaseUpsert(
    "purchase_return_items",
    localPurchaseReturnItems.map((row) => {
      const parent = localPurchaseReturns.find((r) => r.id === row.purchaseReturnId);
      const stamp = parent?.updatedAt || parent?.createdAt || new Date().toISOString();
      return {
        id: row.id,
        tenant_id: tid,
        purchase_return_id: row.purchaseReturnId,
        variant_id: row.variantId,
        quantity: row.quantity,
        unit_cost: row.unitCost,
        line_total: row.lineTotal,
        created_at: stamp,
        updated_at: stamp,
        deleted_at: null,
      };
    })
  );

  let pulledPurchaseReturns = 0;
  for (const row of await fetchTenantRows<{
    id: string;
    voucher_id: string;
    return_no: string;
    return_date: string;
    purchase_id: string | null;
    vendor_id: string | null;
    subtotal: number;
    tax_amount: number;
    grand_total: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>("purchase_returns")) {
    if (!db.select().from(vouchers).where(eq(vouchers.id, row.voucher_id)).get()) continue;
    if (row.purchase_id && !db.select().from(purchases).where(eq(purchases.id, row.purchase_id)).get()) {
      continue;
    }
    if (row.vendor_id && !db.select().from(vendors).where(eq(vendors.id, row.vendor_id)).get()) continue;
    const existing = db.select().from(purchaseReturns).where(eq(purchaseReturns.id, row.id)).get();
    const mapped = {
      id: row.id,
      voucherId: row.voucher_id,
      returnNo: row.return_no,
      returnDate: row.return_date,
      purchaseId: row.purchase_id,
      vendorId: row.vendor_id,
      subtotal: Number(row.subtotal || 0),
      taxAmount: Number(row.tax_amount || 0),
      grandTotal: Number(row.grand_total || 0),
      notes: row.notes,
      createdBy: null as string | null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(purchaseReturns).values(mapped).run();
      pulledPurchaseReturns += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(purchaseReturns).set(mapped).where(eq(purchaseReturns.id, row.id)).run();
      pulledPurchaseReturns += 1;
    }
  }

  for (const row of await fetchTenantRows<{
    id: string;
    purchase_return_id: string;
    variant_id: string;
    quantity: number;
    unit_cost: number;
    line_total: number;
  }>("purchase_return_items")) {
    if (!db.select().from(purchaseReturns).where(eq(purchaseReturns.id, row.purchase_return_id)).get()) {
      continue;
    }
    if (!db.select().from(productVariants).where(eq(productVariants.id, row.variant_id)).get()) continue;
    const existing = db
      .select()
      .from(purchaseReturnItems)
      .where(eq(purchaseReturnItems.id, row.id))
      .get();
    const mapped = {
      id: row.id,
      purchaseReturnId: row.purchase_return_id,
      variantId: row.variant_id,
      quantity: Number(row.quantity || 0),
      unitCost: Number(row.unit_cost || 0),
      lineTotal: Number(row.line_total || 0),
    };
    if (!existing) db.insert(purchaseReturnItems).values(mapped).run();
    else db.update(purchaseReturnItems).set(mapped).where(eq(purchaseReturnItems.id, row.id)).run();
  }

  return {
    saleReturns: { pushed: pushedSaleReturns, pulled: pulledSaleReturns },
    purchaseReturns: { pushed: pushedPurchaseReturns, pulled: pulledPurchaseReturns },
  };
}
