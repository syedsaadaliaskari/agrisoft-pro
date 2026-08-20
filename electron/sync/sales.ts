import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { productVariants, saleItems, sales, vouchers } from "../db/schema";
import { supabaseUpsert, tenantId } from "./client";
import { fetchTenantRows, type SyncCounts } from "./pull";
import { isNewer } from "./store";

/** Sales headers + lines. Vouchers must already be synced. */
export async function syncSales(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const localSales = db.select().from(sales).all();

  const pushed = await supabaseUpsert(
    "sales",
    localSales.map((row) => ({
      id: row.id,
      tenant_id: tid,
      voucher_id: row.voucherId,
      invoice_no: row.invoiceNo,
      invoice_date: row.invoiceDate,
      customer_id: row.customerId,
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

  const localItems = db.select().from(saleItems).all();
  await supabaseUpsert(
    "sale_items",
    localItems.map((row) => {
      const parent = localSales.find((sale) => sale.id === row.saleId);
      const stamp = parent?.updatedAt || parent?.createdAt || new Date().toISOString();
      return {
        id: row.id,
        tenant_id: tid,
        sale_id: row.saleId,
        variant_id: row.variantId,
        product_name: row.productName,
        size: row.size,
        color: row.color,
        quantity: row.quantity,
        unit_price: row.unitPrice,
        cost_price: row.costPrice,
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
    customer_id: string | null;
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
  }>("sales")) {
    const voucher = db.select().from(vouchers).where(eq(vouchers.id, row.voucher_id)).get();
    if (!voucher) continue;
    const existing = db.select().from(sales).where(eq(sales.id, row.id)).get();
    const mapped = {
      id: row.id,
      voucherId: row.voucher_id,
      invoiceNo: row.invoice_no,
      invoiceDate: row.invoice_date,
      customerId: row.customer_id,
      paymentMode: row.payment_mode || "cash",
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
      db.insert(sales).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(sales).set(mapped).where(eq(sales.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of await fetchTenantRows<{
    id: string;
    sale_id: string;
    variant_id: string;
    product_name: string;
    size: string | null;
    color: string | null;
    quantity: number;
    unit_price: number;
    cost_price: number;
    discount_amount: number;
    tax_amount: number;
    line_total: number;
    line_order: number;
  }>("sale_items")) {
    const sale = db.select().from(sales).where(eq(sales.id, row.sale_id)).get();
    const variant = db.select().from(productVariants).where(eq(productVariants.id, row.variant_id)).get();
    if (!sale || !variant) continue;
    const existing = db.select().from(saleItems).where(eq(saleItems.id, row.id)).get();
    const mapped = {
      id: row.id,
      saleId: row.sale_id,
      variantId: row.variant_id,
      productName: row.product_name,
      size: row.size,
      color: row.color,
      quantity: Number(row.quantity || 0),
      unitPrice: Number(row.unit_price || 0),
      costPrice: Number(row.cost_price || 0),
      discountAmount: Number(row.discount_amount || 0),
      taxAmount: Number(row.tax_amount || 0),
      lineTotal: Number(row.line_total || 0),
      lineOrder: Number(row.line_order || 0),
    };
    if (!existing) {
      db.insert(saleItems).values(mapped).run();
    } else {
      db.update(saleItems).set(mapped).where(eq(saleItems.id, row.id)).run();
    }
  }

  return { pushed, pulled };
}
