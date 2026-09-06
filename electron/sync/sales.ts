import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { productVariants, saleItems, sales, vouchers } from "../db/schema";
import { supabaseUpsert, tenantId } from "./client";
import {
  beginTableDeletes,
  fetchCloudDeletedIds,
  finishTableSnapshot,
  liveRows,
  pushTableTombstones,
  rememberLocalDelete,
  shouldRemoveLocal,
} from "./deletes";
import { fetchTenantRows, type SyncCounts } from "./pull";
import { isNewer } from "./store";

function removeSaleLocal(id: string) {
  const db = getDb();
  db.delete(saleItems).where(eq(saleItems.saleId, id)).run();
  db.delete(sales).where(eq(sales.id, id)).run();
}

export async function syncSales(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const localSales = db.select().from(sales).all();
  const deletedSales = localSales.filter((row) => row.status === "deleted");
  rememberLocalDelete(
    "sales",
    deletedSales.map((row) => row.id)
  );
  rememberLocalDelete(
    "vouchers",
    deletedSales.map((row) => row.voucherId)
  );
  beginTableDeletes(
    "sales",
    localSales.filter((row) => row.status !== "deleted").map((row) => row.id)
  );
  await pushTableTombstones("sales");

  const remote = await fetchTenantRows<{
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
  }>("sales");
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds("sales");

  let pulled = 0;
  for (const row of remote) {
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

  for (const row of db.select().from(sales).all()) {
    if (row.status === "deleted") continue;
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal("sales", row.id, row.updatedAt, cloudLiveIds)) {
      rememberLocalDelete("sales", row.id);
      removeSaleLocal(row.id);
    }
  }

  const remainingSales = liveRows(
    "sales",
    db.select().from(sales).all().filter((row) => row.status !== "deleted")
  );
  const pushed = await supabaseUpsert(
    "sales",
    remainingSales.map((row) => ({
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
  finishTableSnapshot("sales", remainingSales.map((row) => row.id));

  const localItems = db.select().from(saleItems).all();
  const liveSaleIds = new Set(remainingSales.map((row) => row.id));
  const orphanItemIds = localItems.filter((row) => !liveSaleIds.has(row.saleId)).map((row) => row.id);
  beginTableDeletes("sale_items", localItems.map((row) => row.id), orphanItemIds);
  await pushTableTombstones("sale_items");

  const remoteItems = await fetchTenantRows<{
    id: string;
    sale_id: string;
    variant_id: string;
    product_name: string;
    size: string | null;
    color: string | null;
    quantity: number;
    unit: string | null;
    unit_price: number;
    cost_price: number;
    discount_amount: number;
    tax_amount: number;
    line_total: number;
    line_order: number;
  }>("sale_items");
  const itemLiveIds = new Set(remoteItems.map((row) => row.id));
  const itemDeletedIds = await fetchCloudDeletedIds("sale_items");

  for (const row of remoteItems) {
    const sale = db.select().from(sales).where(eq(sales.id, row.sale_id)).get();
    const variant = db.select().from(productVariants).where(eq(productVariants.id, row.variant_id)).get();
    if (!sale || sale.status === "deleted" || !variant) continue;
    const existing = db.select().from(saleItems).where(eq(saleItems.id, row.id)).get();
    const mapped = {
      id: row.id,
      saleId: row.sale_id,
      variantId: row.variant_id,
      productName: row.product_name,
      size: row.size,
      color: row.color,
      quantity: Number(row.quantity || 0),
      unit: row.unit ?? null,
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

  for (const row of db.select().from(saleItems).all()) {
    const parent = db.select().from(sales).where(eq(sales.id, row.saleId)).get();
    const stamp = parent?.updatedAt || parent?.createdAt || "";
    if (itemDeletedIds.has(row.id) || shouldRemoveLocal("sale_items", row.id, stamp, itemLiveIds)) {
      db.delete(saleItems).where(eq(saleItems.id, row.id)).run();
    }
  }

  const remainingItems = liveRows("sale_items", db.select().from(saleItems).all()).filter((row) =>
    liveSaleIds.has(row.saleId)
  );
  await supabaseUpsert(
    "sale_items",
    remainingItems.map((row) => {
      const parent = remainingSales.find((sale) => sale.id === row.saleId);
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
        unit: row.unit,
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
  finishTableSnapshot("sale_items", remainingItems.map((row) => row.id));

  return { pushed, pulled };
}
