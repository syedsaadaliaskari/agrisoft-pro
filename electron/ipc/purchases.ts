import { registerHandler } from "./register";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  IPC,
  type ActionResult,
  type Purchase,
  type PurchaseItem,
  type CreatePurchaseInput,
  type PurchaseReturn,
  type PurchaseReturnItem,
  type CreatePurchaseReturnInput,
  type PaymentMode,
} from "../../shared/ipc";
import { getDb } from "../db";
import { nextDocumentNumber } from "../db/counters";
import { requireAccountByCode } from "../db/accounts";
import { writeAuditLog } from "../db/audit";
import { insertVoucherEntry, money } from "../db/ledger";
import { getSettingsMap } from "../db/settings";
import { readShopLogoDataUrl } from "../db/branding";
import {
  purchases,
  purchaseItems,
  purchaseReturns,
  purchaseReturnItems,
  vouchers,
  voucherEntries,
  productVariants,
  products,
  vendors,
  accounts,
  stockMovements,
} from "../db/schema";
import { requirePermission, getCurrentSession, PermissionError } from "./session";

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}
function asError(err: unknown, fallback = "Request failed"): string {
  if (err instanceof PermissionError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
function nowIso() {
  return new Date().toISOString();
}
type Handler<T> = () => Promise<ActionResult<T>> | ActionResult<T>;
async function guarded<T>(check: () => void, fn: Handler<T>): Promise<ActionResult<T>> {
  try {
    check();
    return await fn();
  } catch (err) {
    return fail(asError(err));
  }
}

function mapItem(row: typeof purchaseItems.$inferSelect): PurchaseItem {
  return {
    id: row.id,
    purchaseId: row.purchaseId,
    variantId: row.variantId,
    productName: row.productName,
    size: row.size,
    color: row.color,
    quantity: row.quantity,
    unitCost: row.unitCost,
    discountAmount: row.discountAmount,
    taxAmount: row.taxAmount,
    lineTotal: row.lineTotal,
    lineOrder: row.lineOrder,
  };
}

function mapReturnItem(row: typeof purchaseReturnItems.$inferSelect): PurchaseReturnItem {
  return {
    id: row.id,
    purchaseReturnId: row.purchaseReturnId,
    variantId: row.variantId,
    quantity: row.quantity,
    unitCost: row.unitCost,
    lineTotal: row.lineTotal,
  };
}

function enrichPurchase(id: string, withItems = true): Purchase | null {
  const db = getDb();
  const row = db.select().from(purchases).where(eq(purchases.id, id)).get();
  if (!row) return null;
  const vendor = row.vendorId
    ? db.select().from(vendors).where(eq(vendors.id, row.vendorId)).get()
    : null;
  const settings = getSettingsMap(db);
  const base: Purchase = {
    id: row.id,
    voucherId: row.voucherId,
    invoiceNo: row.invoiceNo,
    invoiceDate: row.invoiceDate,
    vendorId: row.vendorId,
    vendorName: vendor?.name ?? null,
    paymentMode: row.paymentMode as PaymentMode,
    subtotal: row.subtotal,
    discountAmount: row.discountAmount,
    additionAmount: row.additionAmount,
    taxAmount: row.taxAmount,
    grandTotal: row.grandTotal,
    paidAmount: row.paidAmount,
    notes: row.notes,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    shopName: settings.shop_name || "Agri Soft Pro",
    shopPhone: settings.shop_phone || "",
    shopAddress: settings.shop_address || "",
    receiptFooter: settings.receipt_footer || "",
    shopLogoDataUrl: readShopLogoDataUrl(),
  };
  if (withItems) {
    base.items = db
      .select()
      .from(purchaseItems)
      .where(eq(purchaseItems.purchaseId, id))
      .orderBy(asc(purchaseItems.lineOrder))
      .all()
      .map(mapItem);
  }
  return base;
}

function enrichReturn(id: string, withItems = true): PurchaseReturn | null {
  const db = getDb();
  const row = db.select().from(purchaseReturns).where(eq(purchaseReturns.id, id)).get();
  if (!row) return null;
  const vendor = row.vendorId
    ? db.select().from(vendors).where(eq(vendors.id, row.vendorId)).get()
    : null;
  const base: PurchaseReturn = {
    id: row.id,
    voucherId: row.voucherId,
    returnNo: row.returnNo,
    returnDate: row.returnDate,
    purchaseId: row.purchaseId,
    vendorId: row.vendorId,
    vendorName: vendor?.name ?? null,
    subtotal: row.subtotal,
    taxAmount: row.taxAmount,
    grandTotal: row.grandTotal,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (withItems) {
    base.items = db
      .select()
      .from(purchaseReturnItems)
      .where(eq(purchaseReturnItems.purchaseReturnId, id))
      .all()
      .map(mapReturnItem);
  }
  return base;
}

export function registerPurchaseHandlers(): void {
  registerHandler(IPC.PURCHASES_LIST, async (): Promise<ActionResult<Purchase[]>> =>
    guarded(() => requirePermission("purchases.view"), async () => {
      const rows = getDb()
        .select({ id: purchases.id })
        .from(purchases)
        .where(ne(purchases.status, "deleted"))
        .orderBy(desc(purchases.invoiceDate), desc(purchases.createdAt))
        .all();
      return ok(rows.map((r) => enrichPurchase(r.id, false)!).filter(Boolean));
    })
  );

  registerHandler(IPC.PURCHASES_GET, async (_e, id: string): Promise<ActionResult<Purchase>> =>
    guarded(() => requirePermission("purchases.view"), async () => {
      const row = enrichPurchase(id, true);
      if (!row || row.status === "deleted") return fail("Purchase not found");
      return ok(row);
    })
  );

  registerHandler(IPC.PURCHASES_LIST_BY_VENDOR, async (_e, vendorId: string): Promise<ActionResult<Purchase[]>> =>
    guarded(() => requirePermission("purchases.view"), async () => {
      const rows = getDb()
        .select({ id: purchases.id })
        .from(purchases)
        .where(and(eq(purchases.vendorId, vendorId), ne(purchases.status, "deleted")))
        .orderBy(desc(purchases.invoiceDate))
        .all();
      return ok(rows.map((r) => enrichPurchase(r.id, false)!).filter(Boolean));
    })
  );

  registerHandler(IPC.PURCHASES_CREATE, async (_e, input: CreatePurchaseInput): Promise<ActionResult<Purchase>> =>
    guarded(() => requirePermission("purchases.create"), async () => {
      if (!input.items?.length) return fail("Add at least one line item");
      if (!input.invoiceDate?.trim()) return fail("Invoice date is required");
      if (!input.vendorId) return fail("Vendor is required");

      const mode = (input.paymentMode || "credit") as PaymentMode;
      if (!["cash", "credit", "bank"].includes(mode)) return fail("Invalid payment mode");

      const db = getDb();
      const session = getCurrentSession();
      const vendor = db.select().from(vendors).where(eq(vendors.id, input.vendorId)).get();
      if (!vendor || !vendor.isActive) return fail("Vendor not found or inactive");

      type Built = {
        variantId: string;
        productName: string;
        size: string | null;
        color: string | null;
        quantity: number;
        unitCost: number;
        discountAmount: number;
        taxAmount: number;
        lineTotal: number;
      };
      const built: Built[] = [];
      let computedSubtotal = 0;
      let lineTaxSum = 0;

      for (let i = 0; i < input.items.length; i++) {
        const line = input.items[i];
        const qty = Number(line.quantity);
        const unitCost = Number(line.unitCost);
        if (!line.variantId) return fail(`Line ${i + 1}: variant required`);
        if (Number.isNaN(qty) || qty <= 0) return fail(`Line ${i + 1}: quantity must be positive`);
        if (Number.isNaN(unitCost) || unitCost < 0) return fail(`Line ${i + 1}: invalid unit cost`);

        const variant = db.select().from(productVariants).where(eq(productVariants.id, line.variantId)).get();
        if (!variant || !variant.isActive) return fail(`Line ${i + 1}: pack not found`);
        const product = db.select().from(products).where(eq(products.id, variant.productId)).get();
        if (!product) return fail(`Line ${i + 1}: product not found`);

        const discountAmount = money(Number(line.discountAmount ?? 0));
        const taxAmount = money(Number(line.taxAmount ?? 0));
        const lineTotal = money(qty * unitCost - discountAmount + taxAmount);
        built.push({
          variantId: variant.id,
          productName: product.name,
          size: variant.size,
          color: variant.color,
          quantity: qty,
          unitCost: money(unitCost),
          discountAmount,
          taxAmount,
          lineTotal,
        });
        computedSubtotal = money(computedSubtotal + qty * unitCost);
        lineTaxSum = money(lineTaxSum + taxAmount);
      }

      const discountAmount = money(Number(input.discountAmount ?? 0));
      const additionAmount = money(Number(input.additionAmount ?? 0));
      const taxAmount = money(Number(input.taxAmount ?? lineTaxSum));
      const grandTotal = money(computedSubtotal - discountAmount + additionAmount + taxAmount);
      if (grandTotal < 0) return fail("Grand total cannot be negative");

      let paidAmount = money(Number(input.paidAmount ?? 0));
      if (mode === "cash" || mode === "bank") {
        if (paidAmount <= 0) paidAmount = grandTotal;
      }
      if (paidAmount < 0 || paidAmount > grandTotal) return fail("Invalid paid amount");
      const due = money(grandTotal - paidAmount);

      let payAccountId: string | null = input.accountId ?? null;
      if (paidAmount > 0) {
        if (!payAccountId) {
          payAccountId = requireAccountByCode(db, mode === "bank" ? "1200" : "1100", "Cash/Bank").id;
        } else {
          const acct = db.select().from(accounts).where(eq(accounts.id, payAccountId)).get();
          if (!acct) return fail("Payment account not found");
        }
      }

      const invAcct = requireAccountByCode(db, "1400", "Inventory Asset");
      const apAcct = requireAccountByCode(db, "2100", "Accounts Payable");

      const invoiceNo = nextDocumentNumber(db, "purchase");
      const voucherId = randomUUID();
      const purchaseId = randomUUID();
      const ts = nowIso();

      db.insert(vouchers)
        .values({
          id: voucherId,
          voucherNo: invoiceNo,
          voucherType: "purchase",
          voucherDate: input.invoiceDate,
          partyType: "vendor",
          partyId: input.vendorId,
          accountId: payAccountId,
          referenceNo: input.referenceNo?.trim() || null,
          notes: input.notes?.trim() || null,
          subtotal: computedSubtotal,
          discountAmount,
          additionAmount,
          taxAmount,
          grandTotal,
          paidAmount,
          status: "posted",
          createdBy: session?.id ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      let order = 0;
      insertVoucherEntry(db, voucherId, invAcct.id, grandTotal, 0, `Purchase ${invoiceNo}`, order++);
      if (paidAmount > 0 && payAccountId) {
        insertVoucherEntry(db, voucherId, payAccountId, 0, paidAmount, `Purchase ${invoiceNo} paid`, order++);
      }
      if (due > 0) {
        insertVoucherEntry(db, voucherId, apAcct.id, 0, due, `Purchase ${invoiceNo} payable`, order++);
      }

      db.insert(purchases)
        .values({
          id: purchaseId,
          voucherId,
          invoiceNo,
          invoiceDate: input.invoiceDate,
          vendorId: input.vendorId,
          paymentMode: mode,
          subtotal: computedSubtotal,
          discountAmount,
          additionAmount,
          taxAmount,
          grandTotal,
          paidAmount,
          notes: input.notes?.trim() || null,
          status: "completed",
          createdBy: session?.id ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      built.forEach((line, idx) => {
        db.insert(purchaseItems)
          .values({
            id: randomUUID(),
            purchaseId,
            variantId: line.variantId,
            productName: line.productName,
            size: line.size,
            color: line.color,
            quantity: line.quantity,
            unitCost: line.unitCost,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            lineOrder: idx,
          })
          .run();

        const variant = db.select().from(productVariants).where(eq(productVariants.id, line.variantId)).get()!;
        db.update(productVariants)
          .set({
            stockQty: money(variant.stockQty + line.quantity),
            costPrice: line.unitCost,
            updatedAt: ts,
          })
          .where(eq(productVariants.id, line.variantId))
          .run();

        db.insert(stockMovements)
          .values({
            id: randomUUID(),
            variantId: line.variantId,
            movementType: "in",
            quantity: line.quantity,
            referenceType: "purchase",
            referenceId: purchaseId,
            notes: `Purchase ${invoiceNo}`,
            createdBy: session?.id ?? null,
          })
          .run();
      });

      writeAuditLog(db, {
        userId: session?.id ?? null,
        action: "create",
        module: "purchases",
        entityId: purchaseId,
        details: `Purchase ${invoiceNo} total ${grandTotal}`,
      });

      return ok(enrichPurchase(purchaseId, true)!);
    })
  );

  registerHandler(
    IPC.PURCHASES_UPDATE,
    async (_e, id: string, input: CreatePurchaseInput): Promise<ActionResult<Purchase>> =>
      guarded(() => requirePermission("purchases.create"), async () => {
        if (!input.items?.length) return fail("Add at least one line item");
        if (!input.invoiceDate?.trim()) return fail("Invoice date is required");
        if (!input.vendorId) return fail("Vendor is required");

        const mode = (input.paymentMode || "credit") as PaymentMode;
        if (!["cash", "credit", "bank"].includes(mode)) return fail("Invalid payment mode");

        const db = getDb();
        const session = getCurrentSession();
        const existing = db.select().from(purchases).where(eq(purchases.id, id)).get();
        if (!existing || existing.status === "deleted") return fail("Purchase not found");
        if (existing.status === "returned") return fail("Cannot edit a returned purchase");
        const purchaseHasReturns = db
          .select()
          .from(purchaseReturns)
          .where(eq(purchaseReturns.purchaseId, id))
          .all();
        if (purchaseHasReturns.length > 0) {
          return fail("Cannot edit: purchase has returns");
        }

        const vendor = db.select().from(vendors).where(eq(vendors.id, input.vendorId)).get();
        if (!vendor || !vendor.isActive) return fail("Vendor not found or inactive");

        const oldItems = db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id)).all();
        const oldQtyByVariant = new Map<string, number>();
        for (const item of oldItems) {
          oldQtyByVariant.set(item.variantId, money((oldQtyByVariant.get(item.variantId) ?? 0) + item.quantity));
        }
        const ts = nowIso();

        // Validate reverse is possible before mutating (aggregate duplicate lines)
        for (const [variantId, totalOld] of oldQtyByVariant) {
          const variant = db.select().from(productVariants).where(eq(productVariants.id, variantId)).get();
          if (!variant) continue;
          if (variant.stockQty < totalOld) {
            const name = oldItems.find((i) => i.variantId === variantId)?.productName ?? variant.sku;
            return fail(`Cannot edit: insufficient stock to reverse ${name}`);
          }
        }

        type Built = {
          variantId: string;
          productName: string;
          size: string | null;
          color: string | null;
          quantity: number;
          unitCost: number;
          discountAmount: number;
          taxAmount: number;
          lineTotal: number;
        };
        const built: Built[] = [];
        let computedSubtotal = 0;
        let lineTaxSum = 0;

        for (let i = 0; i < input.items.length; i++) {
          const line = input.items[i];
          const qty = Number(line.quantity);
          const unitCost = Number(line.unitCost);
          if (!line.variantId) return fail(`Line ${i + 1}: variant required`);
          if (Number.isNaN(qty) || qty <= 0) return fail(`Line ${i + 1}: quantity must be positive`);
          if (Number.isNaN(unitCost) || unitCost < 0) return fail(`Line ${i + 1}: invalid unit cost`);

          const variant = db.select().from(productVariants).where(eq(productVariants.id, line.variantId)).get();
          if (!variant || !variant.isActive) return fail(`Line ${i + 1}: pack not found`);
          const product = db.select().from(products).where(eq(products.id, variant.productId)).get();
          if (!product) return fail(`Line ${i + 1}: product not found`);

          const discountAmount = money(Number(line.discountAmount ?? 0));
          const taxAmount = money(Number(line.taxAmount ?? 0));
          const lineTotal = money(qty * unitCost - discountAmount + taxAmount);
          built.push({
            variantId: variant.id,
            productName: product.name,
            size: variant.size,
            color: variant.color,
            quantity: qty,
            unitCost: money(unitCost),
            discountAmount,
            taxAmount,
            lineTotal,
          });
          computedSubtotal = money(computedSubtotal + qty * unitCost);
          lineTaxSum = money(lineTaxSum + taxAmount);
        }

        const discountAmount = money(Number(input.discountAmount ?? 0));
        const additionAmount = money(Number(input.additionAmount ?? 0));
        const taxAmount = money(Number(input.taxAmount ?? lineTaxSum));
        const grandTotal = money(computedSubtotal - discountAmount + additionAmount + taxAmount);
        if (grandTotal < 0) return fail("Grand total cannot be negative");

        let paidAmount = money(Number(input.paidAmount ?? 0));
        if (mode === "cash" || mode === "bank") {
          if (paidAmount <= 0) paidAmount = grandTotal;
        }
        if (paidAmount < 0 || paidAmount > grandTotal) return fail("Invalid paid amount");
        const due = money(grandTotal - paidAmount);

        let payAccountId: string | null = input.accountId ?? null;
        if (paidAmount > 0) {
          if (!payAccountId) {
            payAccountId = requireAccountByCode(db, mode === "bank" ? "1200" : "1100", "Cash/Bank").id;
          } else {
            const acct = db.select().from(accounts).where(eq(accounts.id, payAccountId)).get();
            if (!acct) return fail("Payment account not found");
          }
        }

        const invAcct = requireAccountByCode(db, "1400", "Inventory Asset");
        const apAcct = requireAccountByCode(db, "2100", "Accounts Payable");
        const voucherId = existing.voucherId;

        // Reverse previous stock-in only after validation (aggregate by variant)
        for (const [variantId, totalOld] of oldQtyByVariant) {
          const variant = db.select().from(productVariants).where(eq(productVariants.id, variantId)).get();
          if (!variant) continue;
          db.update(productVariants)
            .set({ stockQty: money(variant.stockQty - totalOld), updatedAt: ts })
            .where(eq(productVariants.id, variant.id))
            .run();
        }

        db.delete(purchaseItems).where(eq(purchaseItems.purchaseId, id)).run();
        db.delete(voucherEntries).where(eq(voucherEntries.voucherId, voucherId)).run();

        db.update(vouchers)
          .set({
            voucherDate: input.invoiceDate,
            partyType: "vendor",
            partyId: input.vendorId,
            accountId: payAccountId,
            referenceNo: input.referenceNo?.trim() || null,
            notes: input.notes?.trim() || null,
            subtotal: computedSubtotal,
            discountAmount,
            additionAmount,
            taxAmount,
            grandTotal,
            paidAmount,
            status: "posted",
            updatedAt: ts,
          })
          .where(eq(vouchers.id, voucherId))
          .run();

        let order = 0;
        insertVoucherEntry(db, voucherId, invAcct.id, grandTotal, 0, `Purchase ${existing.invoiceNo}`, order++);
        if (paidAmount > 0 && payAccountId) {
          insertVoucherEntry(db, voucherId, payAccountId, 0, paidAmount, `Purchase ${existing.invoiceNo} paid`, order++);
        }
        if (due > 0) {
          insertVoucherEntry(db, voucherId, apAcct.id, 0, due, `Purchase ${existing.invoiceNo} payable`, order++);
        }

        db.update(purchases)
          .set({
            invoiceDate: input.invoiceDate,
            vendorId: input.vendorId,
            paymentMode: mode,
            subtotal: computedSubtotal,
            discountAmount,
            additionAmount,
            taxAmount,
            grandTotal,
            paidAmount,
            notes: input.notes?.trim() || null,
            status: "completed",
            updatedAt: ts,
          })
          .where(eq(purchases.id, id))
          .run();

        built.forEach((line, idx) => {
          db.insert(purchaseItems)
            .values({
              id: randomUUID(),
              purchaseId: id,
              variantId: line.variantId,
              productName: line.productName,
              size: line.size,
              color: line.color,
              quantity: line.quantity,
              unitCost: line.unitCost,
              discountAmount: line.discountAmount,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
              lineOrder: idx,
            })
            .run();

          const variant = db.select().from(productVariants).where(eq(productVariants.id, line.variantId)).get()!;
          db.update(productVariants)
            .set({
              stockQty: money(variant.stockQty + line.quantity),
              costPrice: line.unitCost,
              updatedAt: ts,
            })
            .where(eq(productVariants.id, line.variantId))
            .run();

          db.insert(stockMovements)
            .values({
              id: randomUUID(),
              variantId: line.variantId,
              movementType: "in",
              quantity: line.quantity,
              referenceType: "purchase",
              referenceId: id,
              notes: `Edit purchase ${existing.invoiceNo}`,
              createdBy: session?.id ?? null,
            })
            .run();
        });

        writeAuditLog(db, {
          userId: session?.id ?? null,
          action: "update",
          module: "purchases",
          entityId: id,
          details: `Updated purchase ${existing.invoiceNo} total ${grandTotal}`,
        });

        return ok(enrichPurchase(id, true)!);
      })
  );

  registerHandler(IPC.PURCHASES_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("purchases.create"), async () => {
      const db = getDb();
      const session = getCurrentSession();
      const purchase = db.select().from(purchases).where(eq(purchases.id, id)).get();
      if (!purchase || purchase.status === "deleted") return fail("Purchase not found");

      const linkedReturns = db
        .select()
        .from(purchaseReturns)
        .where(eq(purchaseReturns.purchaseId, id))
        .all();
      if (linkedReturns.length > 0) {
        return fail("Cannot delete: purchase has returns. Stock was already adjusted by the return.");
      }

      const items = db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id)).all();
      const qtyByVariant = new Map<string, { qty: number; name: string }>();
      for (const item of items) {
        const prev = qtyByVariant.get(item.variantId);
        qtyByVariant.set(item.variantId, {
          qty: money((prev?.qty ?? 0) + item.quantity),
          name: item.productName,
        });
      }

      for (const [variantId, { qty, name }] of qtyByVariant) {
        const variant = db.select().from(productVariants).where(eq(productVariants.id, variantId)).get();
        if (!variant) continue;
        if (variant.stockQty < qty) {
          return fail(`Cannot delete: insufficient stock to reverse ${name}`);
        }
      }

      const ts = nowIso();
      for (const [variantId, { qty }] of qtyByVariant) {
        const variant = db.select().from(productVariants).where(eq(productVariants.id, variantId)).get();
        if (!variant) continue;
        db.update(productVariants)
          .set({ stockQty: money(variant.stockQty - qty), updatedAt: ts })
          .where(eq(productVariants.id, variant.id))
          .run();
        db.insert(stockMovements)
          .values({
            id: randomUUID(),
            variantId: variant.id,
            movementType: "out",
            quantity: qty,
            referenceType: "purchase",
            referenceId: id,
            notes: `Delete purchase ${purchase.invoiceNo}`,
            createdBy: session?.id ?? null,
          })
          .run();
      }

      db.update(purchases).set({ status: "deleted", updatedAt: ts }).where(eq(purchases.id, id)).run();
      db.update(vouchers).set({ status: "cancelled", updatedAt: ts }).where(eq(vouchers.id, purchase.voucherId)).run();

      writeAuditLog(db, {
        userId: session?.id ?? null,
        action: "delete",
        module: "purchases",
        entityId: id,
        details: `Deleted purchase ${purchase.invoiceNo}`,
      });
      return ok(undefined);
    })
  );

  registerHandler(IPC.PURCHASE_RETURNS_LIST, async (): Promise<ActionResult<PurchaseReturn[]>> =>
    guarded(() => requirePermission("purchases.return"), async () => {
      const rows = getDb()
        .select({ id: purchaseReturns.id })
        .from(purchaseReturns)
        .orderBy(desc(purchaseReturns.returnDate), desc(purchaseReturns.createdAt))
        .all();
      return ok(rows.map((r) => enrichReturn(r.id, false)!).filter(Boolean));
    })
  );

  registerHandler(IPC.PURCHASE_RETURNS_GET, async (_e, id: string): Promise<ActionResult<PurchaseReturn>> =>
    guarded(() => requirePermission("purchases.return"), async () => {
      const doc = enrichReturn(id, true);
      if (!doc) return fail("Purchase return not found");
      return ok(doc);
    })
  );

  registerHandler(
    IPC.PURCHASE_RETURNS_CREATE,
    async (_e, input: CreatePurchaseReturnInput): Promise<ActionResult<PurchaseReturn>> =>
      guarded(() => requirePermission("purchases.return"), async () => {
        if (!input.items?.length) return fail("Add at least one return line");
        if (!input.returnDate?.trim()) return fail("Return date is required");
        if (!input.vendorId) return fail("Vendor is required");

        const mode = (input.refundMode || "cash") as PaymentMode;
        const db = getDb();
        const session = getCurrentSession();
        const vendor = db.select().from(vendors).where(eq(vendors.id, input.vendorId)).get();
        if (!vendor) return fail("Vendor not found");

        let remainingByVariant: Map<string, number> | null = null;
        if (input.purchaseId) {
          const p = db.select().from(purchases).where(eq(purchases.id, input.purchaseId)).get();
          if (!p || p.status === "deleted") return fail("Original purchase not found");

          const purchasedQty = new Map<string, number>();
          for (const item of db
            .select()
            .from(purchaseItems)
            .where(eq(purchaseItems.purchaseId, input.purchaseId))
            .all()) {
            purchasedQty.set(item.variantId, money((purchasedQty.get(item.variantId) ?? 0) + item.quantity));
          }
          const alreadyReturned = new Map<string, number>();
          for (const ret of db
            .select()
            .from(purchaseReturns)
            .where(eq(purchaseReturns.purchaseId, input.purchaseId))
            .all()) {
            for (const ri of db
              .select()
              .from(purchaseReturnItems)
              .where(eq(purchaseReturnItems.purchaseReturnId, ret.id))
              .all()) {
              alreadyReturned.set(
                ri.variantId,
                money((alreadyReturned.get(ri.variantId) ?? 0) + ri.quantity)
              );
            }
          }
          remainingByVariant = new Map<string, number>();
          for (const [variantId, bought] of purchasedQty) {
            remainingByVariant.set(variantId, money(bought - (alreadyReturned.get(variantId) ?? 0)));
          }
          if (![...remainingByVariant.values()].some((q) => q > 0)) {
            return fail("This purchase is already fully returned");
          }
        }

        type Built = { variantId: string; quantity: number; unitCost: number; lineTotal: number };
        const built: Built[] = [];
        let subtotal = 0;
        const returnQtyByVariant = new Map<string, number>();

        for (let i = 0; i < input.items.length; i++) {
          const line = input.items[i];
          const qty = Number(line.quantity);
          const unitCost = Number(line.unitCost);
          if (!line.variantId || Number.isNaN(qty) || qty <= 0) return fail(`Line ${i + 1} invalid`);
          const variant = db.select().from(productVariants).where(eq(productVariants.id, line.variantId)).get();
          if (!variant) return fail(`Line ${i + 1}: pack not found`);

          if (remainingByVariant) {
            const remaining = remainingByVariant.get(variant.id) ?? 0;
            const alreadyInThis = returnQtyByVariant.get(variant.id) ?? 0;
            if (alreadyInThis + qty > remaining) {
              return fail(
                `Line ${i + 1}: cannot return more than remaining purchased qty (${money(remaining - alreadyInThis)})`
              );
            }
          }
          returnQtyByVariant.set(
            variant.id,
            money((returnQtyByVariant.get(variant.id) ?? 0) + qty)
          );

          const alreadyNeeded = returnQtyByVariant.get(variant.id)! - qty;
          if (variant.stockQty < alreadyNeeded + qty) {
            return fail(`Insufficient stock to return for ${variant.sku}`);
          }
          const lineTotal = money(qty * unitCost);
          built.push({ variantId: variant.id, quantity: qty, unitCost: money(unitCost), lineTotal });
          subtotal = money(subtotal + lineTotal);
        }

        const taxAmount = money(Number(input.taxAmount ?? 0));
        const grandTotal = money(subtotal + taxAmount);

        let payAccountId: string | null = input.accountId ?? null;
        if (mode === "cash" || mode === "bank") {
          if (!payAccountId) {
            payAccountId = requireAccountByCode(db, mode === "bank" ? "1200" : "1100", "Cash/Bank").id;
          }
        }

        const invAcct = requireAccountByCode(db, "1400", "Inventory Asset");
        const apAcct = requireAccountByCode(db, "2100", "Accounts Payable");

        const returnNo = nextDocumentNumber(db, "purchase_return");
        const voucherId = randomUUID();
        const returnId = randomUUID();
        const ts = nowIso();

        db.insert(vouchers)
          .values({
            id: voucherId,
            voucherNo: returnNo,
            voucherType: "purchase_return",
            voucherDate: input.returnDate,
            partyType: "vendor",
            partyId: input.vendorId,
            accountId: payAccountId,
            notes: input.notes?.trim() || null,
            subtotal,
            taxAmount,
            grandTotal,
            paidAmount: mode === "credit" ? 0 : grandTotal,
            status: "posted",
            createdBy: session?.id ?? null,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();

        let order = 0;
        if (mode === "credit") {
          insertVoucherEntry(db, voucherId, apAcct.id, grandTotal, 0, `Purchase return ${returnNo}`, order++);
        } else if (payAccountId) {
          insertVoucherEntry(db, voucherId, payAccountId, grandTotal, 0, `Purchase return ${returnNo} refund`, order++);
        }
        insertVoucherEntry(db, voucherId, invAcct.id, 0, grandTotal, `Purchase return ${returnNo} stock out`, order++);

        db.insert(purchaseReturns)
          .values({
            id: returnId,
            voucherId,
            returnNo,
            returnDate: input.returnDate,
            purchaseId: input.purchaseId ?? null,
            vendorId: input.vendorId,
            subtotal,
            taxAmount,
            grandTotal,
            notes: input.notes?.trim() || null,
            createdBy: session?.id ?? null,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();

        for (const line of built) {
          db.insert(purchaseReturnItems)
            .values({
              id: randomUUID(),
              purchaseReturnId: returnId,
              variantId: line.variantId,
              quantity: line.quantity,
              unitCost: line.unitCost,
              lineTotal: line.lineTotal,
            })
            .run();

          const variant = db.select().from(productVariants).where(eq(productVariants.id, line.variantId)).get()!;
          db.update(productVariants)
            .set({ stockQty: money(variant.stockQty - line.quantity), updatedAt: ts })
            .where(eq(productVariants.id, line.variantId))
            .run();

          db.insert(stockMovements)
            .values({
              id: randomUUID(),
              variantId: line.variantId,
              movementType: "out",
              quantity: line.quantity,
              referenceType: "purchase_return",
              referenceId: returnId,
              notes: `Purchase return ${returnNo}`,
              createdBy: session?.id ?? null,
            })
            .run();
        }

        writeAuditLog(db, {
          userId: session?.id ?? null,
          action: "create",
          module: "purchases",
          entityId: returnId,
          details: `Purchase return ${returnNo} total ${grandTotal}`,
        });

        if (input.purchaseId && remainingByVariant) {
          let fullyReturned = true;
          for (const [variantId, remaining] of remainingByVariant) {
            const returnedNow = returnQtyByVariant.get(variantId) ?? 0;
            if (money(remaining - returnedNow) > 0) {
              fullyReturned = false;
              break;
            }
          }
          if (fullyReturned) {
            db.update(purchases)
              .set({ status: "returned", updatedAt: ts })
              .where(eq(purchases.id, input.purchaseId))
              .run();
          }
        }

        return ok(enrichReturn(returnId, true)!);
      })
  );
}
