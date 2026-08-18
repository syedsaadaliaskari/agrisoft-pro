import { registerHandler } from "./register";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  IPC,
  type ActionResult,
  type Sale,
  type SaleItem,
  type CreateSaleInput,
  type SaleReturn,
  type SaleReturnItem,
  type CreateSaleReturnInput,
  type PaymentMode,
} from "../../shared/ipc";
import { getDb } from "../db";
import { nextDocumentNumber } from "../db/counters";
import { requireAccountByCode } from "../db/accounts";
import { getSettingsMap } from "../db/settings";
import { netAmount, returnedTotalForSale } from "../db/returnsNet";
import { readShopLogoDataUrl } from "../db/branding";
import { writeAuditLog } from "../db/audit";
import {
  sales,
  saleItems,
  saleReturns,
  saleReturnItems,
  vouchers,
  voucherEntries,
  productVariants,
  products,
  customers,
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

function money(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
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

function mapSaleItem(row: typeof saleItems.$inferSelect): SaleItem {
  return {
    id: row.id,
    saleId: row.saleId,
    variantId: row.variantId,
    productName: row.productName,
    size: row.size,
    color: row.color,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    costPrice: row.costPrice,
    discountAmount: row.discountAmount,
    taxAmount: row.taxAmount,
    lineTotal: row.lineTotal,
    lineOrder: row.lineOrder,
  };
}

function mapReturnItem(row: typeof saleReturnItems.$inferSelect): SaleReturnItem {
  return {
    id: row.id,
    saleReturnId: row.saleReturnId,
    variantId: row.variantId,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    lineTotal: row.lineTotal,
  };
}

function enrichSale(id: string, withItems = true): Sale | null {
  const db = getDb();
  const row = db.select().from(sales).where(eq(sales.id, id)).get();
  if (!row) return null;

  const customer = row.customerId
    ? db.select().from(customers).where(eq(customers.id, row.customerId)).get()
    : null;
  const settings = getSettingsMap(db);
  const returnedTotal = returnedTotalForSale(db, id);

  const base: Sale = {
    id: row.id,
    voucherId: row.voucherId,
    invoiceNo: row.invoiceNo,
    invoiceDate: row.invoiceDate,
    customerId: row.customerId,
    customerName: customer?.name ?? null,
    paymentMode: row.paymentMode as PaymentMode,
    subtotal: row.subtotal,
    discountAmount: row.discountAmount,
    additionAmount: row.additionAmount,
    taxAmount: row.taxAmount,
    grandTotal: row.grandTotal,
    returnedTotal,
    netTotal: netAmount(row.grandTotal, returnedTotal),
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
      .from(saleItems)
      .where(eq(saleItems.saleId, id))
      .orderBy(asc(saleItems.lineOrder))
      .all()
      .map(mapSaleItem);
  }
  return base;
}

function enrichSaleReturn(id: string, withItems = true): SaleReturn | null {
  const db = getDb();
  const row = db.select().from(saleReturns).where(eq(saleReturns.id, id)).get();
  if (!row) return null;
  const customer = row.customerId
    ? db.select().from(customers).where(eq(customers.id, row.customerId)).get()
    : null;

  const base: SaleReturn = {
    id: row.id,
    voucherId: row.voucherId,
    returnNo: row.returnNo,
    returnDate: row.returnDate,
    saleId: row.saleId,
    customerId: row.customerId,
    customerName: customer?.name ?? null,
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
      .from(saleReturnItems)
      .where(eq(saleReturnItems.saleReturnId, id))
      .all()
      .map(mapReturnItem);
  }
  return base;
}

function insertEntry(
  voucherId: string,
  accountId: string,
  debit: number,
  credit: number,
  narration: string,
  lineOrder: number
) {
  if (money(debit) === 0 && money(credit) === 0) return;
  getDb()
    .insert(voucherEntries)
    .values({
      id: randomUUID(),
      voucherId,
      accountId,
      debit: money(debit),
      credit: money(credit),
      narration,
      lineOrder,
    })
    .run();
}

export function registerSalesHandlers(): void {
  registerHandler(IPC.SALES_LIST, async (): Promise<ActionResult<Sale[]>> =>
    guarded(() => requirePermission("sales.view"), async () => {
      const rows = getDb()
        .select({ id: sales.id })
        .from(sales)
        .where(ne(sales.status, "deleted"))
        .orderBy(desc(sales.invoiceDate), desc(sales.createdAt))
        .all();
      return ok(rows.map((r) => enrichSale(r.id, false)!).filter(Boolean));
    })
  );

  registerHandler(IPC.SALES_GET, async (_e, id: string): Promise<ActionResult<Sale>> =>
    guarded(() => requirePermission("sales.view"), async () => {
      const sale = enrichSale(id, true);
      if (!sale || sale.status === "deleted") return fail("Sale not found");
      return ok(sale);
    })
  );

  registerHandler(IPC.SALES_LIST_BY_CUSTOMER, async (_e, customerId: string): Promise<ActionResult<Sale[]>> =>
    guarded(() => requirePermission("sales.view"), async () => {
      const rows = getDb()
        .select({ id: sales.id })
        .from(sales)
        .where(and(eq(sales.customerId, customerId), ne(sales.status, "deleted")))
        .orderBy(desc(sales.invoiceDate))
        .all();
      return ok(rows.map((r) => enrichSale(r.id, false)!).filter(Boolean));
    })
  );

  registerHandler(IPC.SALES_CREATE, async (_e, input: CreateSaleInput): Promise<ActionResult<Sale>> =>
    guarded(() => requirePermission("sales.create"), async () => {
      if (!input.items?.length) return fail("Add at least one line item");
      if (!input.invoiceDate?.trim()) return fail("Invoice date is required");

      const mode = (input.paymentMode || "cash") as PaymentMode;
      if (!["cash", "credit", "bank"].includes(mode)) return fail("Invalid payment mode");

      if (mode === "credit" && !input.customerId) {
        return fail("Customer is required for credit sales");
      }

      const db = getDb();
      const session = getCurrentSession();

      if (input.customerId) {
        const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get();
        if (!customer || !customer.isActive) return fail("Customer not found or inactive");
      }

      type BuiltLine = {
        variantId: string;
        productName: string;
        size: string | null;
        color: string | null;
        quantity: number;
        unitPrice: number;
        costPrice: number;
        discountAmount: number;
        taxAmount: number;
        lineTotal: number;
      };

      const built: BuiltLine[] = [];
      let computedSubtotal = 0;
      let lineTaxSum = 0;
      const neededByVariant = new Map<string, number>();

      for (let i = 0; i < input.items.length; i++) {
        const line = input.items[i];
        const qty = Number(line.quantity);
        const unitPrice = Number(line.unitPrice);
        if (!line.variantId) return fail(`Line ${i + 1}: variant is required`);
        if (Number.isNaN(qty) || qty <= 0) return fail(`Line ${i + 1}: quantity must be positive`);
        if (Number.isNaN(unitPrice) || unitPrice < 0) return fail(`Line ${i + 1}: invalid unit price`);

        const variant = db
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, line.variantId))
          .get();
        if (!variant || !variant.isActive) return fail(`Line ${i + 1}: pack not found or inactive`);

        const alreadyNeeded = neededByVariant.get(variant.id) ?? 0;
        if (variant.stockQty < alreadyNeeded + qty) {
          return fail(
            `Insufficient stock for ${variant.sku}: available ${money(variant.stockQty - alreadyNeeded)}, needed ${qty}`
          );
        }
        neededByVariant.set(variant.id, money(alreadyNeeded + qty));

        const product = db.select().from(products).where(eq(products.id, variant.productId)).get();
        if (!product || !product.isActive) return fail(`Line ${i + 1}: product not found or inactive`);

        const discountAmount = money(Number(line.discountAmount ?? 0));
        const taxAmount = money(Number(line.taxAmount ?? 0));
        const lineTotal = money(qty * unitPrice - discountAmount + taxAmount);
        if (lineTotal < 0) return fail(`Line ${i + 1}: line total cannot be negative`);

        built.push({
          variantId: variant.id,
          productName: product.name,
          size: variant.size,
          color: variant.color,
          quantity: qty,
          unitPrice: money(unitPrice),
          costPrice: money(Number(variant.costPrice ?? product.costPrice ?? 0)),
          discountAmount,
          taxAmount,
          lineTotal,
        });
        computedSubtotal = money(computedSubtotal + qty * unitPrice);
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
      if (paidAmount < 0) return fail("Paid amount cannot be negative");
      if (paidAmount > grandTotal) return fail("Paid amount cannot exceed grand total");

      const due = money(grandTotal - paidAmount);
      if (due > 0 && !input.customerId) {
        return fail("Customer is required when there is an unpaid balance");
      }

      let payAccountId: string | null = input.accountId ?? null;
      if (paidAmount > 0) {
        if (!payAccountId) {
          const fallback = requireAccountByCode(db, mode === "bank" ? "1200" : "1100", "Cash/Bank");
          payAccountId = fallback.id;
        } else {
          const acct = db.select().from(accounts).where(eq(accounts.id, payAccountId)).get();
          if (!acct || !acct.isActive) return fail("Payment account not found");
        }
      }

      const salesAcct = requireAccountByCode(db, "4100", "Sales Revenue");
      const arAcct = requireAccountByCode(db, "1300", "Accounts Receivable");
      const invAcct = requireAccountByCode(db, "1400", "Inventory Asset");
      const cogsAcct = requireAccountByCode(db, "5100", "Cost of Goods Sold");

      const cogsTotal = money(built.reduce((s, l) => s + l.costPrice * l.quantity, 0));

      const invoiceNo = nextDocumentNumber(db, "sale");
      const voucherId = randomUUID();
      const saleId = randomUUID();
      const ts = nowIso();

      db.insert(vouchers)
        .values({
          id: voucherId,
          voucherNo: invoiceNo,
          voucherType: "sale",
          voucherDate: input.invoiceDate,
          partyType: input.customerId ? "customer" : null,
          partyId: input.customerId ?? null,
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
      if (paidAmount > 0 && payAccountId) {
        insertEntry(voucherId, payAccountId, paidAmount, 0, `Sale ${invoiceNo} receipt`, order++);
      }
      if (due > 0) {
        insertEntry(voucherId, arAcct.id, due, 0, `Sale ${invoiceNo} credit`, order++);
      }
      insertEntry(voucherId, salesAcct.id, 0, grandTotal, `Sale ${invoiceNo} revenue`, order++);

      if (cogsTotal > 0) {
        insertEntry(voucherId, cogsAcct.id, cogsTotal, 0, `Sale ${invoiceNo} COGS`, order++);
        insertEntry(voucherId, invAcct.id, 0, cogsTotal, `Sale ${invoiceNo} stock out`, order++);
      }

      db.insert(sales)
        .values({
          id: saleId,
          voucherId,
          invoiceNo,
          invoiceDate: input.invoiceDate,
          customerId: input.customerId ?? null,
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
        db.insert(saleItems)
          .values({
            id: randomUUID(),
            saleId,
            variantId: line.variantId,
            productName: line.productName,
            size: line.size,
            color: line.color,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            costPrice: line.costPrice,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            lineOrder: idx,
          })
          .run();

        const variant = db
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, line.variantId))
          .get()!;
        const newQty = money(variant.stockQty - line.quantity);
        db.update(productVariants)
          .set({ stockQty: newQty, updatedAt: ts })
          .where(eq(productVariants.id, line.variantId))
          .run();

        db.insert(stockMovements)
          .values({
            id: randomUUID(),
            variantId: line.variantId,
            movementType: "out",
            quantity: line.quantity,
            referenceType: "sale",
            referenceId: saleId,
            notes: `Sale ${invoiceNo}`,
            createdBy: session?.id ?? null,
          })
          .run();
      });

      writeAuditLog(db, {
        userId: session?.id ?? null,
        action: "create",
        module: "sales",
        entityId: saleId,
        details: `Sale ${invoiceNo} total ${grandTotal}`,
      });

      return ok(enrichSale(saleId, true)!);
    })
  );

  registerHandler(
    IPC.SALES_UPDATE,
    async (_e, id: string, input: CreateSaleInput): Promise<ActionResult<Sale>> =>
      guarded(() => requirePermission("sales.create"), async () => {
        if (!input.items?.length) return fail("Add at least one line item");
        if (!input.invoiceDate?.trim()) return fail("Invoice date is required");

        const mode = (input.paymentMode || "cash") as PaymentMode;
        if (!["cash", "credit", "bank"].includes(mode)) return fail("Invalid payment mode");
        if (mode === "credit" && !input.customerId) {
          return fail("Customer is required for credit sales");
        }

        const db = getDb();
        const session = getCurrentSession();
        const existing = db.select().from(sales).where(eq(sales.id, id)).get();
        if (!existing || existing.status === "deleted") return fail("Sale not found");
        if (existing.status === "returned") return fail("Cannot edit a returned sale");
        const saleHasReturns = db
          .select()
          .from(saleReturns)
          .where(eq(saleReturns.saleId, id))
          .all();
        if (saleHasReturns.length > 0) {
          return fail("Cannot edit: sale has returns");
        }

        if (input.customerId) {
          const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get();
          if (!customer || !customer.isActive) return fail("Customer not found or inactive");
        }

        const oldItems = db.select().from(saleItems).where(eq(saleItems.saleId, id)).all();
        const oldQtyByVariant = new Map<string, number>();
        for (const item of oldItems) {
          oldQtyByVariant.set(item.variantId, money((oldQtyByVariant.get(item.variantId) ?? 0) + item.quantity));
        }
        const ts = nowIso();

        type BuiltLine = {
          variantId: string;
          productName: string;
          size: string | null;
          color: string | null;
          quantity: number;
          unitPrice: number;
          costPrice: number;
          discountAmount: number;
          taxAmount: number;
          lineTotal: number;
        };
        const built: BuiltLine[] = [];
        let computedSubtotal = 0;
        let lineTaxSum = 0;
        const neededByVariant = new Map<string, number>();

        for (let i = 0; i < input.items.length; i++) {
          const line = input.items[i];
          const qty = Number(line.quantity);
          const unitPrice = Number(line.unitPrice);
          if (!line.variantId) return fail(`Line ${i + 1}: variant is required`);
          if (Number.isNaN(qty) || qty <= 0) return fail(`Line ${i + 1}: quantity must be positive`);
          if (Number.isNaN(unitPrice) || unitPrice < 0) return fail(`Line ${i + 1}: invalid unit price`);

          const variant = db
            .select()
            .from(productVariants)
            .where(eq(productVariants.id, line.variantId))
            .get();
          if (!variant || !variant.isActive) return fail(`Line ${i + 1}: pack not found or inactive`);

          const available = money(variant.stockQty + (oldQtyByVariant.get(variant.id) ?? 0));
          const alreadyNeeded = neededByVariant.get(variant.id) ?? 0;
          if (available < alreadyNeeded + qty) {
            return fail(
              `Insufficient stock for ${variant.sku}: available ${available - alreadyNeeded}, needed ${qty}`
            );
          }
          neededByVariant.set(variant.id, money(alreadyNeeded + qty));

          const product = db.select().from(products).where(eq(products.id, variant.productId)).get();
          if (!product || !product.isActive) return fail(`Line ${i + 1}: product not found or inactive`);

          const discountAmount = money(Number(line.discountAmount ?? 0));
          const taxAmount = money(Number(line.taxAmount ?? 0));
          const lineTotal = money(qty * unitPrice - discountAmount + taxAmount);
          if (lineTotal < 0) return fail(`Line ${i + 1}: line total cannot be negative`);

          built.push({
            variantId: variant.id,
            productName: product.name,
            size: variant.size,
            color: variant.color,
            quantity: qty,
            unitPrice: money(unitPrice),
            costPrice: money(Number(variant.costPrice ?? product.costPrice ?? 0)),
            discountAmount,
            taxAmount,
            lineTotal,
          });
          computedSubtotal = money(computedSubtotal + qty * unitPrice);
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
        if (paidAmount < 0) return fail("Paid amount cannot be negative");
        if (paidAmount > grandTotal) return fail("Paid amount cannot exceed grand total");

        const due = money(grandTotal - paidAmount);
        if (due > 0 && !input.customerId) {
          return fail("Customer is required when there is an unpaid balance");
        }

        let payAccountId: string | null = input.accountId ?? null;
        if (paidAmount > 0) {
          if (!payAccountId) {
            const fallback = requireAccountByCode(db, mode === "bank" ? "1200" : "1100", "Cash/Bank");
            payAccountId = fallback.id;
          } else {
            const acct = db.select().from(accounts).where(eq(accounts.id, payAccountId)).get();
            if (!acct || !acct.isActive) return fail("Payment account not found");
          }
        }

        const salesAcct = requireAccountByCode(db, "4100", "Sales Revenue");
        const arAcct = requireAccountByCode(db, "1300", "Accounts Receivable");
        const invAcct = requireAccountByCode(db, "1400", "Inventory Asset");
        const cogsAcct = requireAccountByCode(db, "5100", "Cost of Goods Sold");
        const cogsTotal = money(built.reduce((s, l) => s + l.costPrice * l.quantity, 0));
        const voucherId = existing.voucherId;

        // Mutate only after validation passed
        for (const item of oldItems) {
          const variant = db
            .select()
            .from(productVariants)
            .where(eq(productVariants.id, item.variantId))
            .get();
          if (variant) {
            db.update(productVariants)
              .set({ stockQty: money(variant.stockQty + item.quantity), updatedAt: ts })
              .where(eq(productVariants.id, variant.id))
              .run();
          }
        }

        db.delete(saleItems).where(eq(saleItems.saleId, id)).run();
        db.delete(voucherEntries).where(eq(voucherEntries.voucherId, voucherId)).run();

        db.update(vouchers)
          .set({
            voucherDate: input.invoiceDate,
            partyType: input.customerId ? "customer" : null,
            partyId: input.customerId ?? null,
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
        if (paidAmount > 0 && payAccountId) {
          insertEntry(voucherId, payAccountId, paidAmount, 0, `Sale ${existing.invoiceNo} receipt`, order++);
        }
        if (due > 0) {
          insertEntry(voucherId, arAcct.id, due, 0, `Sale ${existing.invoiceNo} credit`, order++);
        }
        insertEntry(voucherId, salesAcct.id, 0, grandTotal, `Sale ${existing.invoiceNo} revenue`, order++);
        if (cogsTotal > 0) {
          insertEntry(voucherId, cogsAcct.id, cogsTotal, 0, `Sale ${existing.invoiceNo} COGS`, order++);
          insertEntry(voucherId, invAcct.id, 0, cogsTotal, `Sale ${existing.invoiceNo} stock out`, order++);
        }

        db.update(sales)
          .set({
            invoiceDate: input.invoiceDate,
            customerId: input.customerId ?? null,
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
          .where(eq(sales.id, id))
          .run();

        built.forEach((line, idx) => {
          db.insert(saleItems)
            .values({
              id: randomUUID(),
              saleId: id,
              variantId: line.variantId,
              productName: line.productName,
              size: line.size,
              color: line.color,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              costPrice: line.costPrice,
              discountAmount: line.discountAmount,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
              lineOrder: idx,
            })
            .run();

          const variant = db
            .select()
            .from(productVariants)
            .where(eq(productVariants.id, line.variantId))
            .get()!;
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
              referenceType: "sale",
              referenceId: id,
              notes: `Edit sale ${existing.invoiceNo}`,
              createdBy: session?.id ?? null,
            })
            .run();
        });

        writeAuditLog(db, {
          userId: session?.id ?? null,
          action: "update",
          module: "sales",
          entityId: id,
          details: `Updated sale ${existing.invoiceNo} total ${grandTotal}`,
        });

        return ok(enrichSale(id, true)!);
      })
  );

  registerHandler(IPC.SALES_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requirePermission("sales.create"), async () => {
      const db = getDb();
      const session = getCurrentSession();
      const sale = db.select().from(sales).where(eq(sales.id, id)).get();
      if (!sale || sale.status === "deleted") return fail("Sale not found");

      const linkedReturns = db
        .select()
        .from(saleReturns)
        .where(eq(saleReturns.saleId, id))
        .all();
      if (linkedReturns.length > 0) {
        return fail("Cannot delete: sale has returns. Stock was already restored by the return.");
      }

      const items = db.select().from(saleItems).where(eq(saleItems.saleId, id)).all();
      const ts = nowIso();

      for (const item of items) {
        const variant = db
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, item.variantId))
          .get();
        if (variant) {
          db.update(productVariants)
            .set({ stockQty: money(variant.stockQty + item.quantity), updatedAt: ts })
            .where(eq(productVariants.id, variant.id))
            .run();
          db.insert(stockMovements)
            .values({
              id: randomUUID(),
              variantId: variant.id,
              movementType: "in",
              quantity: item.quantity,
              referenceType: "sale",
              referenceId: id,
              notes: `Delete sale ${sale.invoiceNo} — stock restore`,
              createdBy: session?.id ?? null,
            })
            .run();
        }
      }

      db.update(sales)
        .set({ status: "deleted", updatedAt: ts })
        .where(eq(sales.id, id))
        .run();
      db.update(vouchers)
        .set({ status: "cancelled", updatedAt: ts })
        .where(eq(vouchers.id, sale.voucherId))
        .run();

      writeAuditLog(db, {
        userId: session?.id ?? null,
        action: "delete",
        module: "sales",
        entityId: id,
        details: `Deleted sale ${sale.invoiceNo}`,
      });

      return ok(undefined);
    })
  );

  registerHandler(IPC.SALE_RETURNS_LIST, async (): Promise<ActionResult<SaleReturn[]>> =>
    guarded(() => requirePermission("sales.return"), async () => {
      const rows = getDb()
        .select({ id: saleReturns.id })
        .from(saleReturns)
        .orderBy(desc(saleReturns.returnDate), desc(saleReturns.createdAt))
        .all();
      return ok(rows.map((r) => enrichSaleReturn(r.id, false)!).filter(Boolean));
    })
  );

  registerHandler(IPC.SALE_RETURNS_GET, async (_e, id: string): Promise<ActionResult<SaleReturn>> =>
    guarded(() => requirePermission("sales.return"), async () => {
      const doc = enrichSaleReturn(id, true);
      if (!doc) return fail("Sale return not found");
      return ok(doc);
    })
  );

  registerHandler(
    IPC.SALE_RETURNS_CREATE,
    async (_e, input: CreateSaleReturnInput): Promise<ActionResult<SaleReturn>> =>
      guarded(() => requirePermission("sales.return"), async () => {
        if (!input.items?.length) return fail("Add at least one return line");
        if (!input.returnDate?.trim()) return fail("Return date is required");

        const mode = (input.refundMode || "cash") as PaymentMode;
        if (!["cash", "credit", "bank"].includes(mode)) return fail("Invalid refund mode");

        const db = getDb();
        const session = getCurrentSession();

        let remainingByVariant: Map<string, number> | null = null;
        if (input.saleId) {
          const sale = db.select().from(sales).where(eq(sales.id, input.saleId)).get();
          if (!sale || sale.status === "deleted") return fail("Original sale not found");

          const soldQty = new Map<string, number>();
          for (const item of db.select().from(saleItems).where(eq(saleItems.saleId, input.saleId)).all()) {
            soldQty.set(item.variantId, money((soldQty.get(item.variantId) ?? 0) + item.quantity));
          }
          const alreadyReturned = new Map<string, number>();
          const priorReturns = db
            .select()
            .from(saleReturns)
            .where(eq(saleReturns.saleId, input.saleId))
            .all();
          for (const ret of priorReturns) {
            for (const ri of db
              .select()
              .from(saleReturnItems)
              .where(eq(saleReturnItems.saleReturnId, ret.id))
              .all()) {
              alreadyReturned.set(
                ri.variantId,
                money((alreadyReturned.get(ri.variantId) ?? 0) + ri.quantity)
              );
            }
          }
          remainingByVariant = new Map<string, number>();
          for (const [variantId, sold] of soldQty) {
            remainingByVariant.set(variantId, money(sold - (alreadyReturned.get(variantId) ?? 0)));
          }
          const anyLeft = [...remainingByVariant.values()].some((q) => q > 0);
          if (!anyLeft) return fail("This sale is already fully returned");
        }

        if (input.customerId) {
          const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get();
          if (!customer) return fail("Customer not found");
        }

        type Built = {
          variantId: string;
          quantity: number;
          unitPrice: number;
          lineTotal: number;
          costPrice: number;
        };
        const built: Built[] = [];
        let subtotal = 0;
        const returnQtyByVariant = new Map<string, number>();

        for (let i = 0; i < input.items.length; i++) {
          const line = input.items[i];
          const qty = Number(line.quantity);
          const unitPrice = Number(line.unitPrice);
          if (!line.variantId) return fail(`Line ${i + 1}: variant is required`);
          if (Number.isNaN(qty) || qty <= 0) return fail(`Line ${i + 1}: quantity must be positive`);
          if (Number.isNaN(unitPrice) || unitPrice < 0) return fail(`Line ${i + 1}: invalid unit price`);

          const variant = db
            .select()
            .from(productVariants)
            .where(eq(productVariants.id, line.variantId))
            .get();
          if (!variant) return fail(`Line ${i + 1}: pack not found`);

          if (remainingByVariant) {
            const remaining = remainingByVariant.get(variant.id) ?? 0;
            const alreadyInThis = returnQtyByVariant.get(variant.id) ?? 0;
            if (alreadyInThis + qty > remaining) {
              return fail(
                `Line ${i + 1}: cannot return more than remaining sold qty (${money(remaining - alreadyInThis)})`
              );
            }
          }
          returnQtyByVariant.set(
            variant.id,
            money((returnQtyByVariant.get(variant.id) ?? 0) + qty)
          );

          const product = db.select().from(products).where(eq(products.id, variant.productId)).get();
          const lineTotal = money(qty * unitPrice);
          built.push({
            variantId: variant.id,
            quantity: qty,
            unitPrice: money(unitPrice),
            lineTotal,
            costPrice: money(Number(variant.costPrice ?? product?.costPrice ?? 0)),
          });
          subtotal = money(subtotal + lineTotal);
        }

        const taxAmount = money(Number(input.taxAmount ?? 0));
        const grandTotal = money(subtotal + taxAmount);
        const cogsTotal = money(built.reduce((s, l) => s + l.costPrice * l.quantity, 0));

        let payAccountId: string | null = input.accountId ?? null;
        if (mode === "cash" || mode === "bank") {
          if (!payAccountId) {
            payAccountId = requireAccountByCode(db, mode === "bank" ? "1200" : "1100", "Cash/Bank").id;
          } else {
            const acct = db.select().from(accounts).where(eq(accounts.id, payAccountId)).get();
            if (!acct) return fail("Refund account not found");
          }
        }

        const salesAcct = requireAccountByCode(db, "4100", "Sales Revenue");
        const arAcct = requireAccountByCode(db, "1300", "Accounts Receivable");
        const invAcct = requireAccountByCode(db, "1400", "Inventory Asset");
        const cogsAcct = requireAccountByCode(db, "5100", "Cost of Goods Sold");

        const returnNo = nextDocumentNumber(db, "sale_return");
        const voucherId = randomUUID();
        const returnId = randomUUID();
        const ts = nowIso();

        db.insert(vouchers)
          .values({
            id: voucherId,
            voucherNo: returnNo,
            voucherType: "sale_return",
            voucherDate: input.returnDate,
            partyType: input.customerId ? "customer" : null,
            partyId: input.customerId ?? null,
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
        insertEntry(voucherId, salesAcct.id, grandTotal, 0, `Sale return ${returnNo}`, order++);
        if (mode === "credit") {
          if (!input.customerId) return fail("Customer is required for credit refund");
          insertEntry(voucherId, arAcct.id, 0, grandTotal, `Sale return ${returnNo} AR`, order++);
        } else if (payAccountId) {
          insertEntry(voucherId, payAccountId, 0, grandTotal, `Sale return ${returnNo} refund`, order++);
        }

        if (cogsTotal > 0) {
          insertEntry(voucherId, invAcct.id, cogsTotal, 0, `Sale return ${returnNo} stock in`, order++);
          insertEntry(voucherId, cogsAcct.id, 0, cogsTotal, `Sale return ${returnNo} COGS reverse`, order++);
        }

        db.insert(saleReturns)
          .values({
            id: returnId,
            voucherId,
            returnNo,
            returnDate: input.returnDate,
            saleId: input.saleId ?? null,
            customerId: input.customerId ?? null,
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
          db.insert(saleReturnItems)
            .values({
              id: randomUUID(),
              saleReturnId: returnId,
              variantId: line.variantId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
            })
            .run();

          const variant = db
            .select()
            .from(productVariants)
            .where(eq(productVariants.id, line.variantId))
            .get()!;
          db.update(productVariants)
            .set({ stockQty: money(variant.stockQty + line.quantity), updatedAt: ts })
            .where(eq(productVariants.id, line.variantId))
            .run();

          db.insert(stockMovements)
            .values({
              id: randomUUID(),
              variantId: line.variantId,
              movementType: "in",
              quantity: line.quantity,
              referenceType: "sale_return",
              referenceId: returnId,
              notes: `Sale return ${returnNo}`,
              createdBy: session?.id ?? null,
            })
            .run();
        }

        if (input.saleId && remainingByVariant) {
          let fullyReturned = true;
          for (const [variantId, remaining] of remainingByVariant) {
            const returnedNow = returnQtyByVariant.get(variantId) ?? 0;
            if (money(remaining - returnedNow) > 0) {
              fullyReturned = false;
              break;
            }
          }
          for (const [variantId] of returnQtyByVariant) {
            if (!remainingByVariant.has(variantId)) {
              fullyReturned = false;
              break;
            }
          }
          if (fullyReturned) {
            db.update(sales)
              .set({ status: "returned", updatedAt: ts })
              .where(eq(sales.id, input.saleId))
              .run();
          }
        }

        writeAuditLog(db, {
          userId: session?.id ?? null,
          action: "create",
          module: "sales",
          entityId: returnId,
          details: `Sale return ${returnNo} total ${grandTotal}`,
        });

        return ok(enrichSaleReturn(returnId, true)!);
      })
  );
}
