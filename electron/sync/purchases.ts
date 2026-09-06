import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { productVariants, purchaseItems, purchases, vendors, vouchers } from "../db/schema";
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

function removePurchaseLocal(id: string) {
  const db = getDb();
  db.delete(purchaseItems).where(eq(purchaseItems.purchaseId, id)).run();
  db.delete(purchases).where(eq(purchases.id, id)).run();
}

export async function syncPurchases(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const localPurchases = db.select().from(purchases).all();
  const deletedPurchases = localPurchases.filter((row) => row.status === "deleted");
  rememberLocalDelete(
    "purchases",
    deletedPurchases.map((row) => row.id)
  );
  rememberLocalDelete(
    "vouchers",
    deletedPurchases.map((row) => row.voucherId)
  );
  beginTableDeletes(
    "purchases",
    localPurchases.filter((row) => row.status !== "deleted").map((row) => row.id)
  );
  await pushTableTombstones("purchases");

  const remote = await fetchTenantRows<{
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
  }>("purchases");
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds("purchases");

  let pulled = 0;
  for (const row of remote) {
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

  for (const row of db.select().from(purchases).all()) {
    if (row.status === "deleted") continue;
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal("purchases", row.id, row.updatedAt, cloudLiveIds)) {
      rememberLocalDelete("purchases", row.id);
      removePurchaseLocal(row.id);
    }
  }

  const remainingPurchases = liveRows(
    "purchases",
    db.select().from(purchases).all().filter((row) => row.status !== "deleted")
  );
  const pushed = await supabaseUpsert(
    "purchases",
    remainingPurchases.map((row) => ({
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
  finishTableSnapshot("purchases", remainingPurchases.map((row) => row.id));

  const localItems = db.select().from(purchaseItems).all();
  const livePurchaseIds = new Set(remainingPurchases.map((row) => row.id));
  const orphanItemIds = localItems.filter((row) => !livePurchaseIds.has(row.purchaseId)).map((row) => row.id);
  beginTableDeletes("purchase_items", localItems.map((row) => row.id), orphanItemIds);
  await pushTableTombstones("purchase_items");

  const remoteItems = await fetchTenantRows<{
    id: string;
    purchase_id: string;
    variant_id: string;
    product_name: string;
    size: string | null;
    color: string | null;
    quantity: number;
    unit: string | null;
    unit_cost: number;
    discount_amount: number;
    tax_amount: number;
    line_total: number;
    line_order: number;
  }>("purchase_items");
  const itemLiveIds = new Set(remoteItems.map((row) => row.id));
  const itemDeletedIds = await fetchCloudDeletedIds("purchase_items");

  for (const row of remoteItems) {
    const purchase = db.select().from(purchases).where(eq(purchases.id, row.purchase_id)).get();
    const variant = db.select().from(productVariants).where(eq(productVariants.id, row.variant_id)).get();
    if (!purchase || purchase.status === "deleted" || !variant) continue;
    const existing = db.select().from(purchaseItems).where(eq(purchaseItems.id, row.id)).get();
    const mapped = {
      id: row.id,
      purchaseId: row.purchase_id,
      variantId: row.variant_id,
      productName: row.product_name,
      size: row.size,
      color: row.color,
      quantity: Number(row.quantity || 0),
      unit: row.unit ?? null,
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

  for (const row of db.select().from(purchaseItems).all()) {
    const parent = db.select().from(purchases).where(eq(purchases.id, row.purchaseId)).get();
    const stamp = parent?.updatedAt || parent?.createdAt || "";
    if (itemDeletedIds.has(row.id) || shouldRemoveLocal("purchase_items", row.id, stamp, itemLiveIds)) {
      db.delete(purchaseItems).where(eq(purchaseItems.id, row.id)).run();
    }
  }

  const remainingItems = liveRows("purchase_items", db.select().from(purchaseItems).all()).filter((row) =>
    livePurchaseIds.has(row.purchaseId)
  );
  await supabaseUpsert(
    "purchase_items",
    remainingItems.map((row) => {
      const parent = remainingPurchases.find((p) => p.id === row.purchaseId);
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
        unit: row.unit,
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
  finishTableSnapshot("purchase_items", remainingItems.map((row) => row.id));

  return { pushed, pulled };
}
