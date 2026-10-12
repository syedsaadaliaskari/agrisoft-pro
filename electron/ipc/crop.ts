import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import {
  IPC,
  type ActionResult,
  type CreateCropPurchaseInput,
  type CreateCropSaleInput,
  type CropPurchase,
  type CropSale,
  type CropVehicle,
} from "../../shared/ipc";
import { getDb } from "../db";
import { nextDocumentNumber } from "../db/counters";
import { requireAccountByCode } from "../db/accounts";
import { insertVoucherEntry, money } from "../db/ledger";
import { resolveSettlement } from "../db/settlement";
import {
  cropPurchases,
  cropPurchaseVehicles,
  cropSales,
  customers,
  productVariants,
  products,
  stockMovements,
  vendors,
  vouchers,
} from "../db/schema";
import { registerHandler } from "./register";
import { getCurrentSession, PermissionError, requirePermission } from "./session";

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}
function asError(err: unknown): string {
  if (err instanceof PermissionError) return err.message;
  if (err instanceof Error) return err.message;
  return "Request failed";
}
function nowIso() {
  return new Date().toISOString();
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isNaN(n) ? NaN : n;
}

function mapPurchase(id: string): CropPurchase | null {
  const db = getDb();
  const row = db.select().from(cropPurchases).where(eq(cropPurchases.id, id)).get();
  if (!row) return null;
  const party =
    row.partyType === "customer"
      ? db.select().from(customers).where(eq(customers.id, row.partyId)).get()
      : db.select().from(vendors).where(eq(vendors.id, row.partyId)).get();
  const vehicles = db
    .select()
    .from(cropPurchaseVehicles)
    .where(eq(cropPurchaseVehicles.cropPurchaseId, row.id))
    .all()
    .map(
      (vehicle): CropVehicle => ({
        vehicleNo: vehicle.vehicleNo,
        bags: vehicle.bags,
        totalWeight: vehicle.totalWeight,
        kaat: vehicle.kaat,
        safiWeight: vehicle.safiWeight,
        rate: vehicle.rate,
        amount: vehicle.amount,
      })
    );
  return {
    id: row.id,
    docNo: row.docNo,
    docDate: row.docDate,
    partyType: row.partyType as "customer" | "vendor",
    partyId: row.partyId,
    partyName: party?.name ?? null,
    productName: row.productName,
    safiWeight: row.safiWeight,
    grossAmount: row.grossAmount,
    commission: row.commission,
    brokerage: row.brokerage,
    mazdoori: row.mazdoori,
    fees: row.fees,
    bardana: row.bardana,
    deductionAmount: row.deductionAmount,
    netPayable: row.netPayable,
    paidAmount: row.paidAmount,
    remarks: row.remarks,
    vehicles,
  };
}

export function registerCropHandlers() {
  registerHandler(IPC.CROP_PURCHASES_LIST, async (_e, partyType?: "customer" | "vendor") =>
    guardedList(async () => {
      requirePermission("purchases.view");
      const db = getDb();
      const rows = db.select().from(cropPurchases).orderBy(desc(cropPurchases.createdAt)).all();
      return rows
        .filter((row) => !partyType || row.partyType === partyType)
        .map((row) => mapPurchase(row.id))
        .filter((row): row is CropPurchase => Boolean(row));
    })
  );

  registerHandler(IPC.CROP_PURCHASES_CREATE, async (_e, input: CreateCropPurchaseInput) =>
    guardedList(async () => {
      requirePermission("purchases.create");
      if (!input?.docDate?.trim()) throw new Error("Date is required");
      if (input.partyType !== "customer" && input.partyType !== "vendor") throw new Error("Choose a farmer or a supplier");
      if (!input.partyId) throw new Error(input.partyType === "customer" ? "Farmer is required" : "Supplier is required");
      if (!input.variantId) throw new Error("Crop is required");
      if (!input.vehicles?.length) throw new Error("Add at least one vehicle");

      const db = getDb();
      const variant = db.select().from(productVariants).where(eq(productVariants.id, input.variantId)).get();
      if (!variant || !variant.isActive) throw new Error("Crop pack was not found");
      const product = db.select().from(products).where(eq(products.id, variant.productId)).get();
      if (!product?.isCrop) throw new Error("Mark this product as a crop on the product page first");

      const party =
        input.partyType === "customer"
          ? db.select().from(customers).where(eq(customers.id, input.partyId)).get()
          : db.select().from(vendors).where(eq(vendors.id, input.partyId)).get();
      if (!party || !party.isActive) throw new Error("That person was not found");

      const vehicles: CropVehicle[] = [];
      for (let i = 0; i < input.vehicles.length; i++) {
        const vehicle = input.vehicles[i];
        const vehicleNo = String(vehicle.vehicleNo ?? "").trim();
        const bags = num(vehicle.bags);
        const totalWeight = num(vehicle.totalWeight);
        const kaat = num(vehicle.kaat);
        const rate = num(vehicle.rate);
        if (!vehicleNo) throw new Error(`Vehicle ${i + 1}: number is required`);
        if (!(totalWeight > 0)) throw new Error(`Vehicle ${i + 1}: total weight must be greater than 0`);
        if (Number.isNaN(kaat) || kaat < 0) throw new Error(`Vehicle ${i + 1}: kaat cannot be negative`);
        if (kaat >= totalWeight) throw new Error(`Vehicle ${i + 1}: kaat must be less than total weight`);
        if (Number.isNaN(rate) || rate < 0) throw new Error(`Vehicle ${i + 1}: rate is invalid`);
        const safiWeight = money(totalWeight - kaat);
        vehicles.push({
          vehicleNo,
          bags: money(Number.isNaN(bags) ? 0 : bags),
          totalWeight: money(totalWeight),
          kaat: money(kaat),
          safiWeight,
          rate: money(rate),
          amount: money(safiWeight * rate),
        });
      }

      const charges = {
        commission: money(num(input.commission)),
        brokerage: money(num(input.brokerage)),
        mazdoori: money(num(input.mazdoori)),
        fees: money(num(input.fees)),
        bardana: money(num(input.bardana)),
      };
      for (const [name, value] of Object.entries(charges)) {
        if (Number.isNaN(value) || value < 0) throw new Error(`${name} cannot be negative`);
      }
      const grossAmount = money(vehicles.reduce((sum, vehicle) => sum + vehicle.amount, 0));
      const deductionAmount = money(
        charges.commission + charges.brokerage + charges.mazdoori + charges.fees + charges.bardana
      );
      const netPayable = money(grossAmount - deductionAmount);
      if (netPayable < 0) throw new Error("Deductions are higher than the crop amount");
      const safiWeight = money(vehicles.reduce((sum, vehicle) => sum + vehicle.safiWeight, 0));

      const settled = resolveSettlement(db, {
        cashPaid: input.cashPaid,
        bankPaid: input.bankPaid,
        grandTotal: netPayable,
      });
      if ("error" in settled) throw new Error(settled.error);

      const session = getCurrentSession();
      const ts = nowIso();
      const docNo =
        input.partyType === "customer" ? nextDocumentNumber(db, "crop_purchase") : nextDocumentNumber(db, "purchase");
      const voucherId = randomUUID();
      const purchaseId = randomUUID();
      const invAcct = requireAccountByCode(db, "1400", "Inventory Asset");
      const dueAccount =
        input.partyType === "customer"
          ? requireAccountByCode(db, "1300", "Accounts Receivable")
          : requireAccountByCode(db, "2100", "Accounts Payable");

      db.insert(vouchers)
        .values({
          id: voucherId,
          voucherNo: docNo,
          voucherType: input.partyType === "customer" ? "crop_purchase" : "purchase",
          voucherDate: input.docDate,
          partyType: input.partyType,
          partyId: input.partyId,
          accountId: settled.headerAccountId,
          notes: input.remarks?.trim() || null,
          subtotal: grossAmount,
          discountAmount: deductionAmount,
          additionAmount: 0,
          taxAmount: 0,
          grandTotal: netPayable,
          paidAmount: settled.paidAmount,
          status: "posted",
          createdBy: session?.id ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      let order = 0;
      insertVoucherEntry(db, voucherId, invAcct.id, netPayable, 0, `Crop purchase ${docNo}`, order++);
      if (settled.cashPaid > 0 && settled.cashAccountId) {
        insertVoucherEntry(db, voucherId, settled.cashAccountId, 0, settled.cashPaid, `Crop purchase ${docNo} cash`, order++);
      }
      if (settled.bankPaid > 0 && settled.bankAccountId) {
        insertVoucherEntry(db, voucherId, settled.bankAccountId, 0, settled.bankPaid, `Crop purchase ${docNo} bank`, order++);
      }
      if (settled.due > 0) {
        insertVoucherEntry(db, voucherId, dueAccount.id, 0, settled.due, `Crop purchase ${docNo} balance`, order++);
      }

      db.insert(cropPurchases)
        .values({
          id: purchaseId,
          voucherId,
          docNo,
          docDate: input.docDate,
          partyType: input.partyType,
          partyId: input.partyId,
          variantId: variant.id,
          productName: product.name,
          safiWeight,
          grossAmount,
          ...charges,
          deductionAmount,
          netPayable,
          paidAmount: settled.paidAmount,
          remarks: input.remarks?.trim() || null,
          status: "completed",
          createdBy: session?.id ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      vehicles.forEach((vehicle, index) => {
        db.insert(cropPurchaseVehicles)
          .values({
            id: randomUUID(),
            cropPurchaseId: purchaseId,
            vehicleNo: vehicle.vehicleNo,
            bags: vehicle.bags,
            totalWeight: vehicle.totalWeight,
            kaat: vehicle.kaat,
            safiWeight: vehicle.safiWeight,
            rate: vehicle.rate,
            amount: vehicle.amount,
            lineOrder: index,
          })
          .run();
      });

      db.update(productVariants)
        .set({ stockQty: money(variant.stockQty + safiWeight), costPrice: safiWeight > 0 ? money(netPayable / safiWeight) : variant.costPrice, updatedAt: ts })
        .where(eq(productVariants.id, variant.id))
        .run();
      db.insert(stockMovements)
        .values({
          id: randomUUID(),
          variantId: variant.id,
          movementType: "in",
          quantity: safiWeight,
          referenceType: "crop_purchase",
          referenceId: purchaseId,
          notes: docNo,
          createdBy: session?.id ?? null,
        })
        .run();

      const saved = mapPurchase(purchaseId);
      if (!saved) throw new Error("Crop purchase could not be read back");
      return saved;
    })
  );

  registerHandler(IPC.CROP_SALES_LIST, async () =>
    guardedList(async () => {
      requirePermission("sales.view");
      const db = getDb();
      return db
        .select()
        .from(cropSales)
        .orderBy(desc(cropSales.createdAt))
        .all()
        .map((row): CropSale => {
          const customer = row.customerId
            ? db.select().from(customers).where(eq(customers.id, row.customerId)).get()
            : null;
          return {
            id: row.id,
            docNo: row.docNo,
            docDate: row.docDate,
            customerId: row.customerId,
            customerName: customer?.name ?? null,
            productName: row.productName,
            weight: row.weight,
            rate: row.rate,
            amount: row.amount,
            paidAmount: row.paidAmount,
            remarks: row.remarks,
          };
        });
    })
  );

  registerHandler(IPC.CROP_SALES_CREATE, async (_e, input: CreateCropSaleInput) =>
    guardedList(async () => {
      requirePermission("sales.create");
      if (!input?.docDate?.trim()) throw new Error("Date is required");
      if (!input.customerId) throw new Error("Buyer is required");
      if (!input.variantId) throw new Error("Crop is required");
      const weight = num(input.weight);
      const rate = num(input.rate);
      if (!(weight > 0)) throw new Error("Weight must be greater than 0");
      if (Number.isNaN(rate) || rate < 0) throw new Error("Rate is invalid");

      const db = getDb();
      const variant = db.select().from(productVariants).where(eq(productVariants.id, input.variantId)).get();
      if (!variant || !variant.isActive) throw new Error("Crop pack was not found");
      const product = db.select().from(products).where(eq(products.id, variant.productId)).get();
      if (!product?.isCrop) throw new Error("Mark this product as a crop on the product page first");
      if (variant.stockQty < weight) throw new Error(`Only ${money(variant.stockQty)} is in stock`);
      const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get();
      if (!customer || !customer.isActive) throw new Error("Buyer was not found");

      const amount = money(weight * rate);
      const settled = resolveSettlement(db, {
        cashPaid: input.cashPaid,
        bankPaid: input.bankPaid,
        grandTotal: amount,
      });
      if ("error" in settled) throw new Error(settled.error);

      const session = getCurrentSession();
      const ts = nowIso();
      const docNo = nextDocumentNumber(db, "crop_sale");
      const voucherId = randomUUID();
      const saleId = randomUUID();
      const cost = money(weight * Number(variant.costPrice ?? product.costPrice ?? 0));
      const salesAcct = requireAccountByCode(db, "4100", "Sales Revenue");
      const arAcct = requireAccountByCode(db, "1300", "Accounts Receivable");
      const invAcct = requireAccountByCode(db, "1400", "Inventory Asset");
      const cogsAcct = requireAccountByCode(db, "5100", "Cost of Goods Sold");

      db.insert(vouchers)
        .values({
          id: voucherId,
          voucherNo: docNo,
          voucherType: "crop_sale",
          voucherDate: input.docDate,
          partyType: "customer",
          partyId: input.customerId,
          accountId: settled.headerAccountId,
          notes: input.remarks?.trim() || null,
          subtotal: amount,
          discountAmount: 0,
          additionAmount: 0,
          taxAmount: 0,
          grandTotal: amount,
          paidAmount: settled.paidAmount,
          status: "posted",
          createdBy: session?.id ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      let order = 0;
      if (settled.cashPaid > 0 && settled.cashAccountId) {
        insertVoucherEntry(db, voucherId, settled.cashAccountId, settled.cashPaid, 0, `Crop sale ${docNo} cash`, order++);
      }
      if (settled.bankPaid > 0 && settled.bankAccountId) {
        insertVoucherEntry(db, voucherId, settled.bankAccountId, settled.bankPaid, 0, `Crop sale ${docNo} bank`, order++);
      }
      if (settled.due > 0) {
        insertVoucherEntry(db, voucherId, arAcct.id, settled.due, 0, `Crop sale ${docNo} credit`, order++);
      }
      insertVoucherEntry(db, voucherId, salesAcct.id, 0, amount, `Crop sale ${docNo}`, order++);
      if (cost > 0) {
        insertVoucherEntry(db, voucherId, cogsAcct.id, cost, 0, `Crop sale ${docNo} cost`, order++);
        insertVoucherEntry(db, voucherId, invAcct.id, 0, cost, `Crop sale ${docNo} stock out`, order++);
      }

      db.insert(cropSales)
        .values({
          id: saleId,
          voucherId,
          docNo,
          docDate: input.docDate,
          customerId: input.customerId,
          variantId: variant.id,
          productName: product.name,
          weight: money(weight),
          rate: money(rate),
          amount,
          paidAmount: settled.paidAmount,
          remarks: input.remarks?.trim() || null,
          status: "completed",
          createdBy: session?.id ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      db.update(productVariants)
        .set({ stockQty: money(variant.stockQty - weight), updatedAt: ts })
        .where(eq(productVariants.id, variant.id))
        .run();
      db.insert(stockMovements)
        .values({
          id: randomUUID(),
          variantId: variant.id,
          movementType: "out",
          quantity: money(weight),
          referenceType: "crop_sale",
          referenceId: saleId,
          notes: docNo,
          createdBy: session?.id ?? null,
        })
        .run();

      return {
        id: saleId,
        docNo,
        docDate: input.docDate,
        customerId: input.customerId,
        customerName: customer.name,
        productName: product.name,
        weight: money(weight),
        rate: money(rate),
        amount,
        paidAmount: settled.paidAmount,
        remarks: input.remarks?.trim() || null,
      } satisfies CropSale;
    })
  );
}

async function guardedList<T>(fn: () => Promise<T> | T): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(asError(err));
  }
}
