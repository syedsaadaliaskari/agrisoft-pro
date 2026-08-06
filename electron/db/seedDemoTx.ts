import { count, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Db } from "./index";
import { requireAccountByCode } from "./accounts";
import { writeAuditLog } from "./audit";
import { nextDocumentNumber } from "./counters";
import {
  customers,
  productVariants,
  products,
  purchaseItems,
  purchaseReturnItems,
  purchaseReturns,
  purchases,
  saleItems,
  saleReturnItems,
  saleReturns,
  sales,
  settings,
  stockMovements,
  vendors,
  voucherEntries,
  vouchers,
} from "./schema";

const SEED_FLAG = "demo_full_seeded_v1";

function settingExists(db: Db, key: string): boolean {
  return !!db.select().from(settings).where(eq(settings.key, key)).get();
}

function upsertSetting(db: Db, key: string, value: string, groupName: string) {
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  const now = new Date().toISOString();
  if (existing) {
    db.update(settings).set({ value, updatedAt: now }).where(eq(settings.id, existing.id)).run();
  } else {
    db.insert(settings)
      .values({ id: randomUUID(), key, value, groupName, createdAt: now, updatedAt: now })
      .run();
  }
}

function money(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function insertEntry(
  db: Db,
  voucherId: string,
  accountId: string,
  debit: number,
  credit: number,
  narration: string,
  lineOrder: number
) {
  db.insert(voucherEntries)
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

type VariantRow = {
  id: string;
  size: string | null;
  color: string | null;
  costPrice: number | null;
  salePrice: number | null;
  stockQty: number;
  productName: string;
};

/**
 * Full demo transaction pack for QA: purchases, sales, returns,
 * receipts, payments, expense, income, journal — plus audit rows.
 * Runs once when `demo_full_seeded_v1` is absent.
 * If an older partial seed exists, transactional tables are cleared and refilled.
 */
export async function seedDemoTransactions(db: Db): Promise<void> {
  if (settingExists(db, SEED_FLAG)) return;

  const variants: VariantRow[] = db
    .select({
      id: productVariants.id,
      size: productVariants.size,
      color: productVariants.color,
      costPrice: productVariants.costPrice,
      salePrice: productVariants.salePrice,
      stockQty: productVariants.stockQty,
      productName: products.name,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .all();

  const customerRows = db.select().from(customers).all();
  const vendorRows = db.select().from(vendors).all();

  if (!variants.length || !customerRows.length || !vendorRows.length) {
    upsertSetting(db, SEED_FLAG, new Date().toISOString(), "system");
    return;
  }

  // Clear any prior transaction demo so print/export/lists have a clean full pack
  const priorSales = db.select({ value: count() }).from(sales).get()?.value ?? 0;
  if (priorSales > 0 || settingExists(db, "demo_tx_seeded")) {
    db.delete(saleReturnItems).run();
    db.delete(saleReturns).run();
    db.delete(saleItems).run();
    db.delete(sales).run();
    db.delete(purchaseReturnItems).run();
    db.delete(purchaseReturns).run();
    db.delete(purchaseItems).run();
    db.delete(purchases).run();
    db.delete(stockMovements).run();
    db.delete(voucherEntries).run();
    db.delete(vouchers).run();
  }

  const cash = requireAccountByCode(db, "1100", "Cash");
  const bank = requireAccountByCode(db, "1200", "Bank");
  const ar = requireAccountByCode(db, "1300", "AR");
  const ap = requireAccountByCode(db, "2100", "AP");
  const inv = requireAccountByCode(db, "1400", "Inventory");
  const salesRev = requireAccountByCode(db, "4100", "Sales");
  const otherIncome = requireAccountByCode(db, "4200", "Other Income");
  const cogs = requireAccountByCode(db, "5100", "COGS");
  const opex = requireAccountByCode(db, "5200", "Operating Expenses");

  const pick = (i: number) => variants[i % variants.length];
  const ts = new Date().toISOString();
  const createdPurchases: { id: string; vendorId: string; variantId: string; unitCost: number }[] = [];
  const createdSales: { id: string; customerId: string; variantId: string; unitPrice: number }[] = [];

  const bumpStock = (variantId: string, delta: number) => {
    const current = db.select().from(productVariants).where(eq(productVariants.id, variantId)).get()!;
    db.update(productVariants)
      .set({ stockQty: money(Math.max(0, current.stockQty + delta)), updatedAt: ts })
      .where(eq(productVariants.id, variantId))
      .run();
  };

  // ── Purchases ───────────────────────────────────────────────
  const purchasePlans = [
    { day: 12, vendor: 0, mode: "credit" as const, lines: [{ vi: 0, qty: 40 }, { vi: 2, qty: 20 }] },
    { day: 10, vendor: 1, mode: "cash" as const, lines: [{ vi: 1, qty: 15 }, { vi: 3, qty: 10 }] },
    { day: 8, vendor: 0, mode: "bank" as const, lines: [{ vi: 4, qty: 18 }, { vi: 5, qty: 12 }] },
    { day: 6, vendor: 1, mode: "credit" as const, lines: [{ vi: 2, qty: 25 }, { vi: 6, qty: 8 }] },
    { day: 4, vendor: 0, mode: "cash" as const, lines: [{ vi: 0, qty: 30 }, { vi: 3, qty: 14 }] },
    { day: 2, vendor: 1, mode: "credit" as const, lines: [{ vi: 1, qty: 10 }, { vi: 4, qty: 8 }] },
  ];

  for (const plan of purchasePlans) {
    const vendor = vendorRows[plan.vendor % vendorRows.length];
    const built = plan.lines.map((l) => {
      const v = pick(l.vi);
      const unitCost = money(Number(v.costPrice ?? 0));
      return {
        variantId: v.id,
        productName: v.productName,
        size: v.size,
        color: v.color,
        quantity: l.qty,
        unitCost,
        lineTotal: money(l.qty * unitCost),
      };
    });
    const subtotal = money(built.reduce((s, l) => s + l.lineTotal, 0));
    const taxAmount = money(subtotal * 0.02);
    const grandTotal = money(subtotal + taxAmount);
    const paidAmount = plan.mode === "credit" ? 0 : grandTotal;
    const payAccountId = plan.mode === "bank" ? bank.id : plan.mode === "cash" ? cash.id : null;
    const invoiceNo = nextDocumentNumber(db, "purchase");
    const voucherId = randomUUID();
    const purchaseId = randomUUID();
    const invoiceDate = daysAgo(plan.day);

    db.insert(vouchers)
      .values({
        id: voucherId,
        voucherNo: invoiceNo,
        voucherType: "purchase",
        voucherDate: invoiceDate,
        partyType: "vendor",
        partyId: vendor.id,
        accountId: payAccountId,
        notes: "Demo purchase seed",
        subtotal,
        discountAmount: 0,
        additionAmount: 0,
        taxAmount,
        grandTotal,
        paidAmount,
        status: "posted",
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    let order = 0;
    insertEntry(db, voucherId, inv.id, grandTotal, 0, `Purchase ${invoiceNo}`, order++);
    if (paidAmount > 0 && payAccountId) {
      insertEntry(db, voucherId, payAccountId, 0, paidAmount, `Purchase ${invoiceNo} payment`, order++);
    }
    if (grandTotal - paidAmount > 0) {
      insertEntry(db, voucherId, ap.id, 0, money(grandTotal - paidAmount), `Purchase ${invoiceNo} payable`, order++);
    }

    db.insert(purchases)
      .values({
        id: purchaseId,
        voucherId,
        invoiceNo,
        invoiceDate,
        vendorId: vendor.id,
        paymentMode: plan.mode,
        subtotal,
        discountAmount: 0,
        additionAmount: 0,
        taxAmount,
        grandTotal,
        paidAmount,
        notes: "Demo purchase seed",
        status: "completed",
        createdBy: null,
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
          discountAmount: 0,
          taxAmount: 0,
          lineTotal: line.lineTotal,
          lineOrder: idx,
        })
        .run();
      bumpStock(line.variantId, line.quantity);
      db.insert(stockMovements)
        .values({
          id: randomUUID(),
          variantId: line.variantId,
          movementType: "in",
          quantity: line.quantity,
          referenceType: "purchase",
          referenceId: purchaseId,
          notes: `Demo purchase ${invoiceNo}`,
          createdBy: null,
        })
        .run();
      createdPurchases.push({
        id: purchaseId,
        vendorId: vendor.id,
        variantId: line.variantId,
        unitCost: line.unitCost,
      });
    });

    writeAuditLog(db, {
      userId: null,
      action: "create",
      module: "purchases",
      entityId: purchaseId,
      details: `Seed purchase ${invoiceNo}`,
    });
  }

  // ── Sales ───────────────────────────────────────────────────
  const salePlans = [
    { day: 11, customer: 0, mode: "cash" as const, lines: [{ vi: 0, qty: 6 }, { vi: 2, qty: 2 }] },
    { day: 9, customer: 1, mode: "credit" as const, lines: [{ vi: 1, qty: 4 }, { vi: 3, qty: 2 }] },
    { day: 8, customer: 0, mode: "bank" as const, lines: [{ vi: 4, qty: 3 }] },
    { day: 7, customer: 2, mode: "cash" as const, lines: [{ vi: 5, qty: 3 }, { vi: 0, qty: 4 }] },
    { day: 5, customer: 1, mode: "cash" as const, lines: [{ vi: 2, qty: 2 }, { vi: 6, qty: 1 }] },
    { day: 4, customer: 0, mode: "credit" as const, lines: [{ vi: 3, qty: 5 }, { vi: 1, qty: 2 }] },
    { day: 3, customer: 1, mode: "bank" as const, lines: [{ vi: 0, qty: 8 }] },
    { day: 2, customer: 0, mode: "cash" as const, lines: [{ vi: 4, qty: 2 }, { vi: 5, qty: 2 }] },
    { day: 1, customer: 2, mode: "credit" as const, lines: [{ vi: 2, qty: 3 }, { vi: 6, qty: 1 }] },
    { day: 0, customer: 1, mode: "cash" as const, lines: [{ vi: 0, qty: 5 }, { vi: 3, qty: 2 }] },
  ];

  for (const plan of salePlans) {
    const customer = customerRows[plan.customer % customerRows.length];
    const built = plan.lines.map((l) => {
      const v = pick(l.vi);
      const unitPrice = money(Number(v.salePrice ?? 0));
      const costPrice = money(Number(v.costPrice ?? 0));
      return {
        variantId: v.id,
        productName: v.productName,
        size: v.size,
        color: v.color,
        quantity: l.qty,
        unitPrice,
        costPrice,
        lineTotal: money(l.qty * unitPrice),
      };
    });
    const subtotal = money(built.reduce((s, l) => s + l.lineTotal, 0));
    const discountAmount = plan.day % 3 === 0 ? money(75) : 0;
    const additionAmount = plan.day % 4 === 0 ? money(50) : 0;
    const taxAmount = money(subtotal * 0.03);
    const grandTotal = money(subtotal - discountAmount + additionAmount + taxAmount);
    const paidAmount = plan.mode === "credit" ? money(grandTotal * 0.35) : grandTotal;
    const due = money(grandTotal - paidAmount);
    const payAccountId = plan.mode === "bank" ? bank.id : cash.id;
    const invoiceNo = nextDocumentNumber(db, "sale");
    const voucherId = randomUUID();
    const saleId = randomUUID();
    const invoiceDate = daysAgo(plan.day);
    const cogsTotal = money(built.reduce((s, l) => s + l.costPrice * l.quantity, 0));

    db.insert(vouchers)
      .values({
        id: voucherId,
        voucherNo: invoiceNo,
        voucherType: "sale",
        voucherDate: invoiceDate,
        partyType: "customer",
        partyId: customer.id,
        accountId: paidAmount > 0 ? payAccountId : null,
        notes: "Demo sale seed",
        subtotal,
        discountAmount,
        additionAmount,
        taxAmount,
        grandTotal,
        paidAmount,
        status: "posted",
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    let order = 0;
    if (paidAmount > 0) {
      insertEntry(db, voucherId, payAccountId, paidAmount, 0, `Sale ${invoiceNo} receipt`, order++);
    }
    if (due > 0) {
      insertEntry(db, voucherId, ar.id, due, 0, `Sale ${invoiceNo} credit`, order++);
    }
    insertEntry(db, voucherId, salesRev.id, 0, grandTotal, `Sale ${invoiceNo} revenue`, order++);
    if (cogsTotal > 0) {
      insertEntry(db, voucherId, cogs.id, cogsTotal, 0, `Sale ${invoiceNo} COGS`, order++);
      insertEntry(db, voucherId, inv.id, 0, cogsTotal, `Sale ${invoiceNo} stock out`, order++);
    }

    db.insert(sales)
      .values({
        id: saleId,
        voucherId,
        invoiceNo,
        invoiceDate,
        customerId: customer.id,
        paymentMode: plan.mode,
        subtotal,
        discountAmount,
        additionAmount,
        taxAmount,
        grandTotal,
        paidAmount,
        notes: "Demo sale seed",
        status: "completed",
        createdBy: null,
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
          discountAmount: 0,
          taxAmount: 0,
          lineTotal: line.lineTotal,
          lineOrder: idx,
        })
        .run();
      bumpStock(line.variantId, -line.quantity);
      db.insert(stockMovements)
        .values({
          id: randomUUID(),
          variantId: line.variantId,
          movementType: "out",
          quantity: line.quantity,
          referenceType: "sale",
          referenceId: saleId,
          notes: `Demo sale ${invoiceNo}`,
          createdBy: null,
        })
        .run();
      createdSales.push({
        id: saleId,
        customerId: customer.id,
        variantId: line.variantId,
        unitPrice: line.unitPrice,
      });
    });

    writeAuditLog(db, {
      userId: null,
      action: "create",
      module: "sales",
      entityId: saleId,
      details: `Seed sale ${invoiceNo}`,
    });
  }

  // ── Sale returns ────────────────────────────────────────────
  for (const sample of createdSales.slice(0, 3)) {
    const qty = 1;
    const unitPrice = sample.unitPrice;
    const subtotal = money(qty * unitPrice);
    const taxAmount = money(subtotal * 0.03);
    const grandTotal = money(subtotal + taxAmount);
    const v = db.select().from(productVariants).where(eq(productVariants.id, sample.variantId)).get()!;
    const costPrice = money(Number(v.costPrice ?? 0));
    const cogsTotal = money(costPrice * qty);
    const returnNo = nextDocumentNumber(db, "sale_return");
    const voucherId = randomUUID();
    const returnId = randomUUID();
    const returnDate = daysAgo(1);

    db.insert(vouchers)
      .values({
        id: voucherId,
        voucherNo: returnNo,
        voucherType: "sale_return",
        voucherDate: returnDate,
        partyType: "customer",
        partyId: sample.customerId,
        accountId: cash.id,
        notes: "Demo sale return",
        subtotal,
        taxAmount,
        grandTotal,
        paidAmount: grandTotal,
        status: "posted",
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    let order = 0;
    insertEntry(db, voucherId, salesRev.id, grandTotal, 0, `Sale return ${returnNo}`, order++);
    insertEntry(db, voucherId, cash.id, 0, grandTotal, `Sale return ${returnNo} refund`, order++);
    if (cogsTotal > 0) {
      insertEntry(db, voucherId, inv.id, cogsTotal, 0, `Sale return ${returnNo} stock in`, order++);
      insertEntry(db, voucherId, cogs.id, 0, cogsTotal, `Sale return ${returnNo} COGS reverse`, order++);
    }

    db.insert(saleReturns)
      .values({
        id: returnId,
        voucherId,
        returnNo,
        returnDate,
        saleId: sample.id,
        customerId: sample.customerId,
        subtotal,
        taxAmount,
        grandTotal,
        notes: "Demo sale return",
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    db.insert(saleReturnItems)
      .values({
        id: randomUUID(),
        saleReturnId: returnId,
        variantId: sample.variantId,
        quantity: qty,
        unitPrice,
        lineTotal: subtotal,
      })
      .run();

    bumpStock(sample.variantId, qty);
    db.insert(stockMovements)
      .values({
        id: randomUUID(),
        variantId: sample.variantId,
        movementType: "in",
        quantity: qty,
        referenceType: "sale_return",
        referenceId: returnId,
        notes: `Demo sale return ${returnNo}`,
        createdBy: null,
      })
      .run();
  }

  // ── Purchase returns ────────────────────────────────────────
  for (const sample of createdPurchases.slice(0, 2)) {
    const qty = 2;
    const unitCost = sample.unitCost;
    const subtotal = money(qty * unitCost);
    const taxAmount = money(subtotal * 0.02);
    const grandTotal = money(subtotal + taxAmount);
    const returnNo = nextDocumentNumber(db, "purchase_return");
    const voucherId = randomUUID();
    const returnId = randomUUID();
    const returnDate = daysAgo(1);

    db.insert(vouchers)
      .values({
        id: voucherId,
        voucherNo: returnNo,
        voucherType: "purchase_return",
        voucherDate: returnDate,
        partyType: "vendor",
        partyId: sample.vendorId,
        accountId: cash.id,
        notes: "Demo purchase return",
        subtotal,
        taxAmount,
        grandTotal,
        paidAmount: grandTotal,
        status: "posted",
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    insertEntry(db, voucherId, cash.id, grandTotal, 0, `Purchase return ${returnNo} refund`, 0);
    insertEntry(db, voucherId, inv.id, 0, grandTotal, `Purchase return ${returnNo} stock out`, 1);

    db.insert(purchaseReturns)
      .values({
        id: returnId,
        voucherId,
        returnNo,
        returnDate,
        purchaseId: sample.id,
        vendorId: sample.vendorId,
        subtotal,
        taxAmount,
        grandTotal,
        notes: "Demo purchase return",
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    db.insert(purchaseReturnItems)
      .values({
        id: randomUUID(),
        purchaseReturnId: returnId,
        variantId: sample.variantId,
        quantity: qty,
        unitCost,
        lineTotal: subtotal,
      })
      .run();

    bumpStock(sample.variantId, -qty);
    db.insert(stockMovements)
      .values({
        id: randomUUID(),
        variantId: sample.variantId,
        movementType: "out",
        quantity: qty,
        referenceType: "purchase_return",
        referenceId: returnId,
        notes: `Demo purchase return ${returnNo}`,
        createdBy: null,
      })
      .run();
  }

  // ── Receive payment (customer) ──────────────────────────────
  {
    const customer = customerRows[0];
    const amount = 2500;
    const voucherNo = nextDocumentNumber(db, "receipt");
    const id = randomUUID();
    db.insert(vouchers)
      .values({
        id,
        voucherNo,
        voucherType: "receipt",
        voucherDate: daysAgo(1),
        partyType: "customer",
        partyId: customer.id,
        accountId: cash.id,
        notes: "Demo customer receipt",
        grandTotal: amount,
        paidAmount: amount,
        status: "posted",
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    insertEntry(db, id, cash.id, amount, 0, `Receipt ${voucherNo}`, 0);
    insertEntry(db, id, ar.id, 0, amount, `Receipt ${voucherNo}`, 1);
    writeAuditLog(db, {
      userId: null,
      action: "create",
      module: "transactions",
      entityId: id,
      details: `Seed receipt ${voucherNo}`,
    });
  }

  // ── Make payment (vendor) ───────────────────────────────────
  {
    const vendor = vendorRows[0];
    const amount = 5000;
    const voucherNo = nextDocumentNumber(db, "payment");
    const id = randomUUID();
    db.insert(vouchers)
      .values({
        id,
        voucherNo,
        voucherType: "payment",
        voucherDate: daysAgo(2),
        partyType: "vendor",
        partyId: vendor.id,
        accountId: bank.id,
        notes: "Demo vendor payment",
        grandTotal: amount,
        paidAmount: amount,
        status: "posted",
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    insertEntry(db, id, ap.id, amount, 0, `Payment ${voucherNo}`, 0);
    insertEntry(db, id, bank.id, 0, amount, `Payment ${voucherNo}`, 1);
  }

  // ── Expense ─────────────────────────────────────────────────
  {
    const amount = 1200;
    const voucherNo = nextDocumentNumber(db, "expense");
    const id = randomUUID();
    db.insert(vouchers)
      .values({
        id,
        voucherNo,
        voucherType: "expense",
        voucherDate: daysAgo(3),
        accountId: cash.id,
        notes: "Demo rent / utilities",
        grandTotal: amount,
        paidAmount: amount,
        status: "posted",
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    insertEntry(db, id, opex.id, amount, 0, `Expense ${voucherNo}`, 0);
    insertEntry(db, id, cash.id, 0, amount, `Expense ${voucherNo}`, 1);
  }

  // ── Other income ────────────────────────────────────────────
  {
    const amount = 800;
    const voucherNo = nextDocumentNumber(db, "income");
    const id = randomUUID();
    db.insert(vouchers)
      .values({
        id,
        voucherNo,
        voucherType: "income",
        voucherDate: daysAgo(2),
        partyType: "customer",
        partyId: customerRows[1]?.id ?? null,
        accountId: cash.id,
        notes: "Demo miscellaneous income",
        grandTotal: amount,
        paidAmount: amount,
        status: "posted",
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    insertEntry(db, id, cash.id, amount, 0, `Income ${voucherNo}`, 0);
    insertEntry(db, id, otherIncome.id, 0, amount, `Income ${voucherNo}`, 1);
  }

  // ── Journal ─────────────────────────────────────────────────
  {
    const amount = 1500;
    const voucherNo = nextDocumentNumber(db, "journal");
    const id = randomUUID();
    db.insert(vouchers)
      .values({
        id,
        voucherNo,
        voucherType: "journal",
        voucherDate: daysAgo(4),
        notes: "Demo journal — cash to bank transfer",
        grandTotal: amount,
        paidAmount: 0,
        status: "posted",
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    insertEntry(db, id, bank.id, amount, 0, `Journal ${voucherNo} bank`, 0);
    insertEntry(db, id, cash.id, 0, amount, `Journal ${voucherNo} cash`, 1);
  }

  upsertSetting(db, SEED_FLAG, new Date().toISOString(), "system");
  upsertSetting(db, "demo_tx_seeded", new Date().toISOString(), "system");
}
