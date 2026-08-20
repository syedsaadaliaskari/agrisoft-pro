import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { productVariants, purchaseItems, purchases, vendors, vouchers } from "../db/schema";
import { supabaseUpsert, tenantId } from "./client";
import { fetchTenantRows, type SyncCounts } from "./pull";
import { isNewer } from "./store";

export async function syncPurchases(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const localPurchases = db.select().from(purchases).all();

  const pushed = await supabaseUpsert(
    "purchases",
    localPurchases.map((row) => ({
      id: row.id,
      tenant_id: tid,
      voucher_id: row.voucherId,
      invoice_no: row.invoiceNo,
      invoice_date: row.invoiceDate,
      vendor_id: row.vendorId,
      payment_mode: row.paymentMode,
      subtotal: row.subtotal,
      discount_amount: row.discountAmount,
      addition_amount: row.additionAmount,
      tax_amount: row.taxAmount,
      grand_total: row.grandTotal,
      paid_amount: row.paidAmount,
      notes: row.notes,
      status: row.status,
      created_by: null,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );

  const localItems = db.select().from(purchaseItems).all();
  await supabaseUpsert(
    "purchase_items",
    localItems.map((row) => {
      const parent = localPurchases.find((p) => p.id === row.purchaseId);
      const stamp = parent?.updatedAt || parent?.createdAt || new Date().toISOString();
      return {
        id: row.id,
        tenant_id: tid,
        purchase_id: row.purchaseId,
        variant_id: row.variantId,
        product_name: row.productName,
        size: row.size,
        color: row.color,
        quantity: row.quantity,
        unit_cost: row.unitCost,
        discount_amount: row.discountAmount,
        tax_amount: row.taxAmount,
        line_total: row.lineTotal,
        line_order: row.lineOrder,
        created_at: stamp,
        updated_at: stamp,
        deleted_at: null,
      };
    })
  );

  let pulled = 0;
  for (const row of await fetchTenantRows<{
    id: string;
    voucher_id: string;
    invoice_no: string;
    invoice_date: string;
    vendor_id: string | null;
    payment_mode: string;
    subtotal: number;
    discount_amount: number;
    addition_amount: number;
    tax_amount: number;
    grand_total: number;
    paid_amount: number;
    notes: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  }>("purchases")) {
    const voucher = db.select().from(vouchers).where(eq(vouchers.id, row.voucher_id)).get();
    if (!voucher) continue;
    if (row.vendor_id && !db.select().from(vendors).where(eq(vendors.id, row.vendor_id)).get()) continue;
    const existing = db.select().from(purchases).where(eq(purchases.id, row.id)).get();
    const mapped = {
      id: row.id,
      voucherId: row.voucher_id,
      invoiceNo: row.invoice_no,
      invoiceDate: row.invoice_date,
      vendorId: row.vendor_id,
      paymentMode: row.payment_mode || "credit",
      subtotal: Number(row.subtotal || 0),
      discountAmount: Number(row.discount_amount || 0),
      additionAmount: Number(row.addition_amount || 0),
      taxAmount: Number(row.tax_amount || 0),
      grandTotal: Number(row.grand_total || 0),
      paidAmount: Number(row.paid_amount || 0),
      notes: row.notes,
      status: row.status || "completed",
      createdBy: null as string | null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(purchases).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(purchases).set(mapped).where(eq(purchases.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of await fetchTenantRows<{
    id: string;
    purchase_id: string;
    variant_id: string;
    product_name: string;
    size: string | null;
    color: string | null;
    quantity: number;
    unit_cost: number;
    discount_amount: number;
    tax_amount: number;
    line_total: number;
    line_order: number;
  }>("purchase_items")) {
    const purchase = db.select().from(purchases).where(eq(purchases.id, row.purchase_id)).get();
    const variant = db.select().from(productVariants).where(eq(productVariants.id, row.variant_id)).get();
    if (!purchase || !variant) continue;
    const existing = db.select().from(purchaseItems).where(eq(purchaseItems.id, row.id)).get();
    const mapped = {
      id: row.id,
      purchaseId: row.purchase_id,
      variantId: row.variant_id,
      productName: row.product_name,
      size: row.size,
      color: row.color,
      quantity: Number(row.quantity || 0),
      unitCost: Number(row.unit_cost || 0),
      discountAmount: Number(row.discount_amount || 0),
      taxAmount: Number(row.tax_amount || 0),
      lineTotal: Number(row.line_total || 0),
      lineOrder: Number(row.line_order || 0),
    };
    if (!existing) {
      db.insert(purchaseItems).values(mapped).run();
    } else {
      db.update(purchaseItems).set(mapped).where(eq(purchaseItems.id, row.id)).run();
    }
  }

  return { pushed, pulled };
}
