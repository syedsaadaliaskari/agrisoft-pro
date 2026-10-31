import { eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  cropPurchaseVehicles,
  cropPurchases,
  cropSales,
  productVariants,
  stockBatches,
  vouchers,
} from "../db/schema";
import { cloudColumnReady, supabaseRest, supabaseUpsert, tenantId } from "./client";
import { trySyncWrite } from "./constraints";
import { fetchTenantRows } from "./pull";
import { isNewer } from "./store";

type CloudBatch = {
  id: string;
  variant_id: string;
  batch_no: string;
  manufactured_date: string | null;
  expiry_date: string | null;
  qty: number;
  created_at: string;
  updated_at: string;
};

type CloudCropPurchase = {
  id: string;
  voucher_id: string;
  doc_no: string;
  doc_date: string;
  party_type: string;
  party_id: string;
  variant_id: string;
  product_name: string;
  safi_weight: number;
  gross_amount: number;
  commission: number;
  brokerage: number;
  mazdoori: number;
  fees: number;
  bardana: number;
  deduction_amount: number;
  net_payable: number;
  paid_amount: number;
  remarks: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type CloudVehicle = {
  id: string;
  crop_purchase_id: string;
  vehicle_no: string;
  bags: number;
  total_weight: number;
  kaat: number;
  safi_weight: number;
  rate: number;
  amount: number;
  stock_factor?: number | null;
  weigh_unit?: string | null;
  kaat_factor?: number | null;
  kaat_unit?: string | null;
  line_order: number;
};

type CloudCropSale = {
  id: string;
  voucher_id: string;
  doc_no: string;
  doc_date: string;
  customer_id: string | null;
  variant_id: string;
  product_name: string;
  weight: number;
  rate: number;
  amount: number;
  stock_factor?: number | null;
  weigh_unit?: string | null;
  commission?: number;
  brokerage?: number;
  mazdoori?: number;
  fees?: number;
  bardana?: number;
  deduction_amount?: number;
  net_amount?: number;
  cost_amount?: number;
  paid_amount: number;
  remarks: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function deletedIds(table: string) {
  const tid = tenantId();
  try {
    return await supabaseRest<{ id: string; deleted_at: string }[]>(table, {
      query: `tenant_id=eq.${encodeURIComponent(tid)}&deleted_at=not.is.null&select=id,deleted_at`,
    });
  } catch {
    return [];
  }
}

function applyRemoteDelete(table: "crop_purchases" | "crop_sales", id: string, deletedAt: string) {
  const db = getDb();
  if (table === "crop_purchases") {
    const local = db.select().from(cropPurchases).where(eq(cropPurchases.id, id)).get();
    if (!local || local.status === "deleted") return;
    if (isNewer(local.updatedAt, deletedAt)) return;
    db.update(cropPurchases).set({ status: "deleted", updatedAt: deletedAt }).where(eq(cropPurchases.id, id)).run();
    return;
  }
  const local = db.select().from(cropSales).where(eq(cropSales.id, id)).get();
  if (!local || local.status === "deleted") return;
  if (isNewer(local.updatedAt, deletedAt)) return;
  db.update(cropSales).set({ status: "deleted", updatedAt: deletedAt }).where(eq(cropSales.id, id)).run();
}

async function syncBatches() {
  if (!(await cloudColumnReady("stock_batches", "id"))) return;
  const db = getDb();
  const tid = tenantId();
  const remote = await fetchTenantRows<CloudBatch>("stock_batches");
  for (const row of remote) {
    if (!db.select().from(productVariants).where(eq(productVariants.id, row.variant_id)).get()) continue;
    const existing = db.select().from(stockBatches).where(eq(stockBatches.id, row.id)).get();
    const mapped = {
      id: row.id,
      variantId: row.variant_id,
      batchNo: row.batch_no,
      manufacturedDate: row.manufactured_date,
      expiryDate: row.expiry_date,
      qty: num(row.qty),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) trySyncWrite(() => db.insert(stockBatches).values(mapped).run());
    else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(stockBatches).set(mapped).where(eq(stockBatches.id, row.id)).run();
    }
  }
  await supabaseUpsert(
    "stock_batches",
    db
      .select()
      .from(stockBatches)
      .all()
      .filter((row) => db.select().from(productVariants).where(eq(productVariants.id, row.variantId)).get())
      .map((row) => ({
        id: row.id,
        tenant_id: tid,
        variant_id: row.variantId,
        batch_no: row.batchNo,
        manufactured_date: row.manufacturedDate,
        expiry_date: row.expiryDate,
        qty: row.qty,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        deleted_at: null,
      }))
  );
}

async function syncCropPurchases() {
  if (!(await cloudColumnReady("crop_purchases", "id"))) return;
  if (!(await cloudColumnReady("crop_purchase_vehicles", "id"))) return;
  const db = getDb();
  const tid = tenantId();
  for (const row of await deletedIds("crop_purchases")) applyRemoteDelete("crop_purchases", row.id, row.deleted_at);

  const remote = await fetchTenantRows<CloudCropPurchase>("crop_purchases");
  const vehicles = await fetchTenantRows<CloudVehicle>("crop_purchase_vehicles");
  for (const row of remote) {
    if (!db.select().from(vouchers).where(eq(vouchers.id, row.voucher_id)).get()) continue;
    if (!db.select().from(productVariants).where(eq(productVariants.id, row.variant_id)).get()) continue;
    const existing = db.select().from(cropPurchases).where(eq(cropPurchases.id, row.id)).get();
    if (existing?.status === "deleted" && !isNewer(row.updated_at, existing.updatedAt)) continue;
    const mapped = {
      id: row.id,
      voucherId: row.voucher_id,
      docNo: row.doc_no,
      docDate: row.doc_date,
      partyType: row.party_type,
      partyId: row.party_id,
      variantId: row.variant_id,
      productName: row.product_name,
      safiWeight: num(row.safi_weight),
      grossAmount: num(row.gross_amount),
      commission: num(row.commission),
      brokerage: num(row.brokerage),
      mazdoori: num(row.mazdoori),
      fees: num(row.fees),
      bardana: num(row.bardana),
      deductionAmount: num(row.deduction_amount),
      netPayable: num(row.net_payable),
      paidAmount: num(row.paid_amount),
      remarks: row.remarks,
      status: row.status || "completed",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    const saved = existing
      ? isNewer(row.updated_at, existing.updatedAt)
        ? (db.update(cropPurchases).set(mapped).where(eq(cropPurchases.id, row.id)).run(), true)
        : false
      : trySyncWrite(() => db.insert(cropPurchases).values(mapped).run());
    if (!saved) continue;
    db.delete(cropPurchaseVehicles).where(eq(cropPurchaseVehicles.cropPurchaseId, row.id)).run();
    for (const vehicle of vehicles.filter((item) => item.crop_purchase_id === row.id)) {
      trySyncWrite(() =>
        db
          .insert(cropPurchaseVehicles)
          .values({
            id: vehicle.id,
            cropPurchaseId: row.id,
            vehicleNo: vehicle.vehicle_no,
            bags: num(vehicle.bags),
            totalWeight: num(vehicle.total_weight),
            kaat: num(vehicle.kaat),
            safiWeight: num(vehicle.safi_weight),
            rate: num(vehicle.rate),
            amount: num(vehicle.amount),
            stockFactor: num(vehicle.stock_factor) || 1,
            weighUnit: vehicle.weigh_unit || null,
            kaatFactor: vehicle.kaat_factor == null ? num(vehicle.stock_factor) || 1 : num(vehicle.kaat_factor) || 1,
            kaatUnit: vehicle.kaat_unit || null,
            lineOrder: num(vehicle.line_order),
          })
          .run()
      );
    }
  }

  const sendFactor = await cloudColumnReady("crop_purchase_vehicles", "stock_factor");
  const sendKaatUnit = await cloudColumnReady("crop_purchase_vehicles", "kaat_unit");
  const local = db.select().from(cropPurchases).all();
  await supabaseUpsert(
    "crop_purchases",
    local.map((row) => ({
      id: row.id,
      tenant_id: tid,
      voucher_id: row.voucherId,
      doc_no: row.docNo,
      doc_date: row.docDate,
      party_type: row.partyType,
      party_id: row.partyId,
      variant_id: row.variantId,
      product_name: row.productName,
      safi_weight: row.safiWeight,
      gross_amount: row.grossAmount,
      commission: row.commission,
      brokerage: row.brokerage,
      mazdoori: row.mazdoori,
      fees: row.fees,
      bardana: row.bardana,
      deduction_amount: row.deductionAmount,
      net_payable: row.netPayable,
      paid_amount: row.paidAmount,
      remarks: row.remarks,
      status: row.status,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: row.status === "deleted" ? row.updatedAt : null,
    }))
  );
  const liveIds = new Set(local.filter((row) => row.status !== "deleted").map((row) => row.id));
  await supabaseUpsert(
    "crop_purchase_vehicles",
    db
      .select()
      .from(cropPurchaseVehicles)
      .all()
      .filter((row) => liveIds.has(row.cropPurchaseId))
      .map((row) => ({
        id: row.id,
        tenant_id: tid,
        crop_purchase_id: row.cropPurchaseId,
        vehicle_no: row.vehicleNo,
        bags: row.bags,
        total_weight: row.totalWeight,
        kaat: row.kaat,
        safi_weight: row.safiWeight,
        rate: row.rate,
        amount: row.amount,
        line_order: row.lineOrder,
        ...(sendFactor ? { stock_factor: row.stockFactor ?? 1, weigh_unit: row.weighUnit } : {}),
        ...(sendKaatUnit ? { kaat_factor: row.kaatFactor ?? row.stockFactor ?? 1, kaat_unit: row.kaatUnit } : {}),
        deleted_at: null,
      }))
  );
}

async function syncCropSales() {
  if (!(await cloudColumnReady("crop_sales", "id"))) return;
  const sendCharges = await cloudColumnReady("crop_sales", "mazdoori");
  const sendFactor = await cloudColumnReady("crop_sales", "stock_factor");
  const db = getDb();
  const tid = tenantId();
  for (const row of await deletedIds("crop_sales")) applyRemoteDelete("crop_sales", row.id, row.deleted_at);

  const remote = await fetchTenantRows<CloudCropSale>("crop_sales");
  for (const row of remote) {
    if (!db.select().from(vouchers).where(eq(vouchers.id, row.voucher_id)).get()) continue;
    if (!db.select().from(productVariants).where(eq(productVariants.id, row.variant_id)).get()) continue;
    const existing = db.select().from(cropSales).where(eq(cropSales.id, row.id)).get();
    if (existing?.status === "deleted" && !isNewer(row.updated_at, existing.updatedAt)) continue;
    const deductionAmount = num(row.deduction_amount);
    const storedNet = num(row.net_amount);
    const mapped = {
      id: row.id,
      voucherId: row.voucher_id,
      docNo: row.doc_no,
      docDate: row.doc_date,
      customerId: row.customer_id,
      variantId: row.variant_id,
      productName: row.product_name,
      weight: num(row.weight),
      rate: num(row.rate),
      amount: num(row.amount),
      stockFactor: num(row.stock_factor) || 1,
      weighUnit: row.weigh_unit || null,
      commission: num(row.commission),
      brokerage: num(row.brokerage),
      mazdoori: num(row.mazdoori),
      fees: num(row.fees),
      bardana: num(row.bardana),
      deductionAmount,
      netAmount: deductionAmount > 0 || storedNet > 0 ? storedNet : num(row.amount),
      costAmount: num(row.cost_amount),
      paidAmount: num(row.paid_amount),
      remarks: row.remarks,
      status: row.status || "completed",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) trySyncWrite(() => db.insert(cropSales).values(mapped).run());
    else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(cropSales).set(mapped).where(eq(cropSales.id, row.id)).run();
    }
  }

  await supabaseUpsert(
    "crop_sales",
    db
      .select()
      .from(cropSales)
      .all()
      .map((row) => ({
        id: row.id,
        tenant_id: tid,
        voucher_id: row.voucherId,
        doc_no: row.docNo,
        doc_date: row.docDate,
        customer_id: row.customerId,
        variant_id: row.variantId,
        product_name: row.productName,
        weight: row.weight,
        rate: row.rate,
        amount: row.amount,
        paid_amount: row.paidAmount,
        ...(sendFactor ? { stock_factor: row.stockFactor ?? 1, weigh_unit: row.weighUnit } : {}),
        remarks: row.remarks,
        status: row.status,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        deleted_at: row.status === "deleted" ? row.updatedAt : null,
        ...(sendCharges
          ? {
              commission: row.commission,
              brokerage: row.brokerage,
              mazdoori: row.mazdoori,
              fees: row.fees,
              bardana: row.bardana,
              deduction_amount: row.deductionAmount,
              net_amount: row.netAmount,
              cost_amount: row.costAmount,
            }
          : {}),
      }))
  );
}

/** Crop slips, vehicles, and batches. Skips quietly until the cloud tables exist. */
export async function syncCropTrading() {
  await syncBatches();
  await syncCropPurchases();
  await syncCropSales();
}
