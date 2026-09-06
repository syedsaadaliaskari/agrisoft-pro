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
import {
  beginTableDeletes,
  fetchCloudDeletedIds,
  finishTableSnapshot,
  liveRows,
  pushTableTombstones,
  shouldRemoveLocal,
} from "./deletes";
import { fetchTenantRows, type SyncCounts } from "./pull";
import { isNewer } from "./store";

export async function syncReturns(): Promise<{ saleReturns: SyncCounts; purchaseReturns: SyncCounts }> {
  const saleReturnsCounts = await syncSaleReturns();
  const purchaseReturnsCounts = await syncPurchaseReturns();
  return { saleReturns: saleReturnsCounts, purchaseReturns: purchaseReturnsCounts };
}

async function syncSaleReturns(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const local = db.select().from(saleReturns).all();
  beginTableDeletes("sale_returns", local.map((row) => row.id));
  await pushTableTombstones("sale_returns");

  const remote = await fetchTenantRows<{
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
  }>("sale_returns");
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds("sale_returns");

  let pulled = 0;
  for (const row of remote) {
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
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(saleReturns).set(mapped).where(eq(saleReturns.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(saleReturns).all()) {
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal("sale_returns", row.id, row.updatedAt, cloudLiveIds)) {
      db.delete(saleReturnItems).where(eq(saleReturnItems.saleReturnId, row.id)).run();
      db.delete(saleReturns).where(eq(saleReturns.id, row.id)).run();
    }
  }

  const remaining = liveRows("sale_returns", db.select().from(saleReturns).all());
  const pushed = await supabaseUpsert(
    "sale_returns",
    remaining.map((row) => ({
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
  finishTableSnapshot("sale_returns", remaining.map((row) => row.id));

  const localItems = db.select().from(saleReturnItems).all();
  const liveParentIds = new Set(remaining.map((row) => row.id));
  const orphanIds = localItems.filter((row) => !liveParentIds.has(row.saleReturnId)).map((row) => row.id);
  beginTableDeletes("sale_return_items", localItems.map((row) => row.id), orphanIds);
  await pushTableTombstones("sale_return_items");

  const remoteItems = await fetchTenantRows<{
    id: string;
    sale_return_id: string;
    variant_id: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>("sale_return_items");
  const itemLiveIds = new Set(remoteItems.map((row) => row.id));
  const itemDeletedIds = await fetchCloudDeletedIds("sale_return_items");

  for (const row of remoteItems) {
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

  for (const row of db.select().from(saleReturnItems).all()) {
    const parent = db.select().from(saleReturns).where(eq(saleReturns.id, row.saleReturnId)).get();
    const stamp = parent?.updatedAt || parent?.createdAt || "";
    if (itemDeletedIds.has(row.id) || shouldRemoveLocal("sale_return_items", row.id, stamp, itemLiveIds)) {
      db.delete(saleReturnItems).where(eq(saleReturnItems.id, row.id)).run();
    }
  }

  const remainingItems = liveRows("sale_return_items", db.select().from(saleReturnItems).all()).filter((row) =>
    liveParentIds.has(row.saleReturnId)
  );
  await supabaseUpsert(
    "sale_return_items",
    remainingItems.map((row) => {
      const parent = remaining.find((r) => r.id === row.saleReturnId);
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
  finishTableSnapshot("sale_return_items", remainingItems.map((row) => row.id));
  return { pushed, pulled };
}

async function syncPurchaseReturns(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const local = db.select().from(purchaseReturns).all();
  beginTableDeletes("purchase_returns", local.map((row) => row.id));
  await pushTableTombstones("purchase_returns");

  const remote = await fetchTenantRows<{
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
  }>("purchase_returns");
  const cloudLiveIds = new Set(remote.map((row) => row.id));
  const cloudDeletedIds = await fetchCloudDeletedIds("purchase_returns");

  let pulled = 0;
  for (const row of remote) {
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
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(purchaseReturns).set(mapped).where(eq(purchaseReturns.id, row.id)).run();
      pulled += 1;
    }
  }

  for (const row of db.select().from(purchaseReturns).all()) {
    if (cloudDeletedIds.has(row.id) || shouldRemoveLocal("purchase_returns", row.id, row.updatedAt, cloudLiveIds)) {
      db.delete(purchaseReturnItems).where(eq(purchaseReturnItems.purchaseReturnId, row.id)).run();
      db.delete(purchaseReturns).where(eq(purchaseReturns.id, row.id)).run();
    }
  }

  const remaining = liveRows("purchase_returns", db.select().from(purchaseReturns).all());
  const pushed = await supabaseUpsert(
    "purchase_returns",
    remaining.map((row) => ({
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
  finishTableSnapshot("purchase_returns", remaining.map((row) => row.id));

  const localItems = db.select().from(purchaseReturnItems).all();
  const liveParentIds = new Set(remaining.map((row) => row.id));
  const orphanIds = localItems.filter((row) => !liveParentIds.has(row.purchaseReturnId)).map((row) => row.id);
  beginTableDeletes("purchase_return_items", localItems.map((row) => row.id), orphanIds);
  await pushTableTombstones("purchase_return_items");

  const remoteItems = await fetchTenantRows<{
    id: string;
    purchase_return_id: string;
    variant_id: string;
    quantity: number;
    unit_cost: number;
    line_total: number;
  }>("purchase_return_items");
  const itemLiveIds = new Set(remoteItems.map((row) => row.id));
  const itemDeletedIds = await fetchCloudDeletedIds("purchase_return_items");

  for (const row of remoteItems) {
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

  for (const row of db.select().from(purchaseReturnItems).all()) {
    const parent = db.select().from(purchaseReturns).where(eq(purchaseReturns.id, row.purchaseReturnId)).get();
    const stamp = parent?.updatedAt || parent?.createdAt || "";
    if (itemDeletedIds.has(row.id) || shouldRemoveLocal("purchase_return_items", row.id, stamp, itemLiveIds)) {
      db.delete(purchaseReturnItems).where(eq(purchaseReturnItems.id, row.id)).run();
    }
  }

  const remainingItems = liveRows("purchase_return_items", db.select().from(purchaseReturnItems).all()).filter(
    (row) => liveParentIds.has(row.purchaseReturnId)
  );
  await supabaseUpsert(
    "purchase_return_items",
    remainingItems.map((row) => {
      const parent = remaining.find((r) => r.id === row.purchaseReturnId);
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
  finishTableSnapshot("purchase_return_items", remainingItems.map((row) => row.id));
  return { pushed, pulled };
}
