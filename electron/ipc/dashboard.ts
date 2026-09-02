import { registerHandler } from "./register";
import { and, asc, count, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import {
  IPC,
  type ActionResult,
  type DashboardSummary,
  type ReportDateRange,
  type SalesReport,
  type PurchasesReport,
  type ProfitReport,
  type ProductProfitPoint,
  type ProductProfitRow,
  type StockReport,
  type TaxReport,
  type DeletedDocumentsReport,
} from "../../shared/ipc";
import { getDb } from "../db";
import { getSettingsMap } from "../db/settings";
import { requireAccountByCode } from "../db/accounts";
import { getCashBankSnapshot } from "../db/cashBank";
import { computeAccountOpening, money } from "../db/ledger";
import {
  sales,
  saleItems,
  purchases,
  products,
  productVariants,
  customers,
  vendors,
  categories,
  auditLogs,
  users,
  vouchers,
  saleReturns,
  saleReturnItems,
  purchaseReturns,
} from "../db/schema";
import {
  netAmount,
  purchaseReturnedTotalsMap,
  saleReturnedTotalsMap,
  returnedTotalForSale,
  sumPurchaseReturnTaxInRange,
  sumPurchaseReturnsInRange,
  sumPurchaseReturnsOnDate,
  sumSaleReturnCogsInRange,
  sumSaleReturnTaxInRange,
  sumSaleReturnsInRange,
  sumSaleReturnsOnDate,
} from "../db/returnsNet";
import { allSaleCollectedAmounts } from "../db/invoiceCollections";
import { requirePermission, PermissionError } from "./session";

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

function resolveDeletedByName(entityId: string, module: string): string | null {
  const db = getDb();
  const log = db
    .select()
    .from(auditLogs)
    .where(
      and(eq(auditLogs.entityId, entityId), eq(auditLogs.action, "delete"), eq(auditLogs.module, module))
    )
    .orderBy(desc(auditLogs.createdAt))
    .get();
  if (!log?.userId) return null;
  const u = db.select().from(users).where(eq(users.id, log.userId)).get();
  if (!u) return null;
  return u.fullName?.trim() || u.username;
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

function today() {
  // Local calendar day (not UTC) so PK shops see today's cash correctly
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function registerDashboardHandlers(): void {
  registerHandler(IPC.DASHBOARD_SUMMARY, async (): Promise<ActionResult<DashboardSummary>> =>
    guarded(() => requirePermission("dashboard.view"), async () => {
      const db = getDb();
      const settings = getSettingsMap(db);
      const t = today();
      const monthStart = `${t.slice(0, 7)}-01`;

      const dayAgg = (date: string) => {
        const s = db
          .select({
            total: sql<number>`coalesce(sum(${sales.grandTotal}), 0)`,
            cnt: sql<number>`coalesce(count(*), 0)`,
          })
          .from(sales)
          .where(and(eq(sales.invoiceDate, date), ne(sales.status, "deleted")))
          .get();
        const p = db
          .select({
            total: sql<number>`coalesce(sum(${purchases.grandTotal}), 0)`,
            cnt: sql<number>`coalesce(count(*), 0)`,
          })
          .from(purchases)
          .where(and(eq(purchases.invoiceDate, date), ne(purchases.status, "deleted")))
          .get();
        const saleReturnsTotal = sumSaleReturnsOnDate(db, date);
        const purchaseReturnsTotal = sumPurchaseReturnsOnDate(db, date);
        return {
          date,
          salesTotal: money(Number(s?.total ?? 0) - saleReturnsTotal),
          salesCount: Number(s?.cnt ?? 0),
          purchasesTotal: money(Number(p?.total ?? 0) - purchaseReturnsTotal),
          purchasesCount: Number(p?.cnt ?? 0),
        };
      };

      const todaySales = dayAgg(t);

      const monthSalesGross = Number(
        db
          .select({ total: sql<number>`coalesce(sum(${sales.grandTotal}), 0)` })
          .from(sales)
          .where(and(gte(sales.invoiceDate, monthStart), lte(sales.invoiceDate, t), ne(sales.status, "deleted")))
          .get()?.total ?? 0
      );
      const monthPurchasesGross = Number(
        db
          .select({ total: sql<number>`coalesce(sum(${purchases.grandTotal}), 0)` })
          .from(purchases)
          .where(
            and(gte(purchases.invoiceDate, monthStart), lte(purchases.invoiceDate, t), ne(purchases.status, "deleted"))
          )
          .get()?.total ?? 0
      );
      const monthSaleReturns = sumSaleReturnsInRange(db, monthStart, t);
      const monthPurchaseReturns = sumPurchaseReturnsInRange(db, monthStart, t);

      const monthCogsGross = Number(
        db
          .select({
            total: sql<number>`coalesce(sum(${saleItems.costPrice} * ${saleItems.quantity}), 0)`,
          })
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.saleId, sales.id))
          .where(and(gte(sales.invoiceDate, monthStart), lte(sales.invoiceDate, t), ne(sales.status, "deleted")))
          .get()?.total ?? 0
      );
      const monthCogsReturned = sumSaleReturnCogsInRange(db, monthStart, t);

      const books = getCashBankSnapshot(db, t);
      const ar = requireAccountByCode(db, "1300", "AR");
      const ap = requireAccountByCode(db, "2100", "AP");
      const fullBal = (accountId: string) => computeAccountOpening(db, accountId, "9999-99-99")!.signed;

      const cashOpeningToday = books.cash.openingToday;
      const cashInToday = books.cash.inToday;
      const cashOutToday = books.cash.outToday;
      const cashClosingToday = books.cash.closingToday;
      const bankOpeningToday = books.bank.openingToday;
      const bankInToday = books.bank.inToday;
      const bankOutToday = books.bank.outToday;
      const bankClosingToday = books.bank.closingToday;
      const moneyOpeningToday = money(cashOpeningToday + bankOpeningToday);
      const moneyInToday = money(cashInToday + bankInToday);
      const moneyOutToday = money(cashOutToday + bankOutToday);
      const moneyClosingToday = money(cashClosingToday + bankClosingToday);
      const cashBalance = books.cash.closingToday;
      const bankBalance = books.bank.closingToday;

      const voucherTotalOnDate = (voucherType: "receipt" | "payment", onDate: string) =>
        money(
          Number(
            db
              .select({
                total: sql<number>`coalesce(sum(case when ${vouchers.paidAmount} > 0 then ${vouchers.paidAmount} else ${vouchers.grandTotal} end), 0)`,
              })
              .from(vouchers)
              .where(
                and(
                  eq(vouchers.voucherType, voucherType),
                  eq(vouchers.status, "posted"),
                  eq(vouchers.voucherDate, onDate)
                )
              )
              .get()?.total ?? 0
          )
        );

      const receivedToday = voucherTotalOnDate("receipt", t);
      const paidOutToday = voucherTotalOnDate("payment", t);

      const inventoryValue =
        db
          .select({
            value: sql<number>`coalesce(sum(${productVariants.stockQty} * ${productVariants.costPrice}), 0)`,
          })
          .from(productVariants)
          .get()?.value ?? 0;

      const lowStockItems = db
        .select({
          productName: products.name,
          size: productVariants.size,
          color: productVariants.color,
          stockQty: productVariants.stockQty,
          reorderLevel: products.reorderLevel,
        })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(sql`${productVariants.stockQty} <= ${products.reorderLevel}`)
        .orderBy(asc(productVariants.stockQty))
        .limit(8)
        .all();

      const last7: DashboardSummary["last7Days"] = [];
      for (let i = 6; i >= 0; i--) last7.push(dayAgg(daysAgo(i)));

      const last30: DashboardSummary["last30Days"] = [];
      for (let i = 29; i >= 0; i--) last30.push(dayAgg(daysAgo(i)));

      const payRows = db
        .select({
          mode: sales.paymentMode,
          total: sql<number>`coalesce(sum(${sales.grandTotal}), 0)`,
          cnt: sql<number>`coalesce(count(*), 0)`,
        })
        .from(sales)
        .where(ne(sales.status, "deleted"))
        .groupBy(sales.paymentMode)
        .all();

      const topProducts = db
        .select({
          productName: saleItems.productName,
          quantity: sql<number>`coalesce(sum(${saleItems.quantity}), 0)`,
          revenue: sql<number>`coalesce(sum(${saleItems.lineTotal}), 0)`,
        })
        .from(saleItems)
        .innerJoin(sales, eq(saleItems.saleId, sales.id))
        .where(ne(sales.status, "deleted"))
        .groupBy(saleItems.productName)
        .orderBy(desc(sql`sum(${saleItems.lineTotal})`))
        .limit(6)
        .all();

      const recentSales = db
        .select({
          id: sales.id,
          invoiceNo: sales.invoiceNo,
          invoiceDate: sales.invoiceDate,
          customerId: sales.customerId,
          grandTotal: sales.grandTotal,
          paymentMode: sales.paymentMode,
        })
        .from(sales)
        .where(ne(sales.status, "deleted"))
        .orderBy(desc(sales.invoiceDate), desc(sales.createdAt))
        .limit(8)
        .all();

      const collected = allSaleCollectedAmounts(db);
      const openSaleInvoices = db
        .select()
        .from(sales)
        .where(ne(sales.status, "deleted"))
        .all()
        .filter((r) => {
          const returned = returnedTotalForSale(db, r.id);
          const net = money(r.grandTotal - returned);
          const got = collected.get(r.id) ?? money(Math.min(r.paidAmount, net));
          return net > got;
        }).length;

      const monthSalesTotal = money(monthSalesGross - monthSaleReturns);
      const monthPurchasesTotal = money(monthPurchasesGross - monthPurchaseReturns);
      const monthCogsNet = money(monthCogsGross - monthCogsReturned);
      const monthProfitEstimate = money(monthSalesTotal - monthCogsNet);

      return ok({
        todaySalesTotal: todaySales.salesTotal,
        todaySalesCount: todaySales.salesCount,
        todayPurchasesTotal: todaySales.purchasesTotal,
        todayPurchasesCount: todaySales.purchasesCount,
        monthSalesTotal,
        monthPurchasesTotal,
        monthProfitEstimate,
        cashBalance,
        bankBalance,
        cashOpeningToday,
        cashInToday,
        cashOutToday,
        cashClosingToday,
        bankOpeningToday,
        bankInToday,
        bankOutToday,
        bankClosingToday,
        moneyOpeningToday,
        moneyInToday,
        moneyOutToday,
        moneyClosingToday,
        cashBankMovesToday: books.todayMoves,
        receivedToday,
        paidOutToday,
        arBalance: money(Math.abs(fullBal(ar.id))),
        apBalance: money(Math.abs(fullBal(ap.id))),
        inventoryValue: money(Number(inventoryValue)),
        lowStockCount: lowStockItems.length,
        productCount: db.select({ value: count() }).from(products).get()?.value ?? 0,
        customerCount: db.select({ value: count() }).from(customers).get()?.value ?? 0,
        vendorCount: db.select({ value: count() }).from(vendors).get()?.value ?? 0,
        openSaleInvoices,
        currencySymbol: settings.currency_symbol || "Rs",
        last7Days: last7,
        last30Days: last30,
        salesByPaymentMode: payRows.map((r) => ({
          mode: r.mode,
          total: Number(r.total),
          count: Number(r.cnt),
        })),
        topProducts: topProducts.map((r) => ({
          productName: r.productName,
          quantity: Number(r.quantity),
          revenue: Number(r.revenue),
        })),
        lowStockItems: lowStockItems.map((r) => ({
          productName: r.productName,
          size: r.size,
          color: r.color,
          stockQty: r.stockQty,
          reorderLevel: r.reorderLevel,
        })),
        recentSales: recentSales.map((r) => {
          const cust = r.customerId
            ? db.select().from(customers).where(eq(customers.id, r.customerId)).get()
            : null;
          return {
            id: r.id,
            invoiceNo: r.invoiceNo,
            invoiceDate: r.invoiceDate,
            customerName: cust?.name ?? null,
            grandTotal: r.grandTotal,
            paymentMode: r.paymentMode,
          };
        }),
      });
    })
  );

  registerHandler(IPC.REPORTS_SALES, async (_e, query?: ReportDateRange): Promise<ActionResult<SalesReport>> =>
    guarded(() => requirePermission("reports.view"), async () => {
      const db = getDb();
      const conditions = [ne(sales.status, "deleted")];
      if (query?.fromDate) conditions.push(gte(sales.invoiceDate, query.fromDate));
      if (query?.toDate) conditions.push(lte(sales.invoiceDate, query.toDate));

      const rows = db
        .select({
          id: sales.id,
          invoiceNo: sales.invoiceNo,
          invoiceDate: sales.invoiceDate,
          customerId: sales.customerId,
          paymentMode: sales.paymentMode,
          subtotal: sales.subtotal,
          discountAmount: sales.discountAmount,
          taxAmount: sales.taxAmount,
          grandTotal: sales.grandTotal,
          paidAmount: sales.paidAmount,
        })
        .from(sales)
        .where(and(...conditions))
        .orderBy(desc(sales.invoiceDate))
        .all();

      const returnedMap = saleReturnedTotalsMap(db);
      const mapped = rows.map((r) => {
        const returnedTotal = returnedMap.get(r.id) ?? 0;
        return {
          id: r.id,
          invoiceNo: r.invoiceNo,
          invoiceDate: r.invoiceDate,
          customerName: r.customerId
            ? db.select().from(customers).where(eq(customers.id, r.customerId)).get()?.name ?? null
            : null,
          paymentMode: r.paymentMode,
          subtotal: r.subtotal,
          discountAmount: r.discountAmount,
          taxAmount: r.taxAmount,
          grandTotal: r.grandTotal,
          returnedTotal,
          netTotal: netAmount(r.grandTotal, returnedTotal),
          paidAmount: r.paidAmount,
        };
      });

      const returnConditions = [];
      if (query?.fromDate) returnConditions.push(gte(saleReturns.returnDate, query.fromDate));
      if (query?.toDate) returnConditions.push(lte(saleReturns.returnDate, query.toDate));
      const returnRows = db
        .select()
        .from(saleReturns)
        .where(returnConditions.length ? and(...returnConditions) : undefined)
        .orderBy(desc(saleReturns.returnDate), desc(saleReturns.createdAt))
        .all()
        .map((r) => ({
          id: r.id,
          returnNo: r.returnNo,
          returnDate: r.returnDate,
          partyName: r.customerId
            ? db.select().from(customers).where(eq(customers.id, r.customerId)).get()?.name ?? null
            : null,
          againstInvoiceNo: r.saleId
            ? db.select().from(sales).where(eq(sales.id, r.saleId)).get()?.invoiceNo ?? null
            : null,
          taxAmount: r.taxAmount,
          grandTotal: r.grandTotal,
        }));

      const returnsTotal = sumSaleReturnsInRange(db, query?.fromDate, query?.toDate);
      const returnsTax = sumSaleReturnTaxInRange(db, query?.fromDate, query?.toDate);

      const byMode = new Map<string, { count: number; total: number }>();
      const byDay = new Map<string, { count: number; total: number }>();
      for (const r of mapped) {
        const m = byMode.get(r.paymentMode) ?? { count: 0, total: 0 };
        m.count += 1;
        m.total = money(m.total + r.grandTotal);
        byMode.set(r.paymentMode, m);
        const d = byDay.get(r.invoiceDate) ?? { count: 0, total: 0 };
        d.count += 1;
        d.total = money(d.total + r.grandTotal);
        byDay.set(r.invoiceDate, d);
      }

      return ok({
        fromDate: query?.fromDate ?? null,
        toDate: query?.toDate ?? null,
        rows: mapped,
        returnRows,
        totalGross: money(mapped.reduce((s, r) => s + r.grandTotal, 0)),
        totalReturns: money(returnsTotal),
        totalSubtotal: money(mapped.reduce((s, r) => s + r.subtotal, 0)),
        totalDiscount: money(mapped.reduce((s, r) => s + r.discountAmount, 0)),
        totalTax: money(mapped.reduce((s, r) => s + r.taxAmount, 0) - returnsTax),
        totalGrand: money(mapped.reduce((s, r) => s + r.grandTotal, 0) - returnsTotal),
        totalPaid: money(mapped.reduce((s, r) => s + r.paidAmount, 0)),
        byPaymentMode: [...byMode.entries()].map(([mode, v]) => ({ mode, ...v })),
        byDay: [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
      });
    })
  );

  registerHandler(
    IPC.REPORTS_PURCHASES,
    async (_e, query?: ReportDateRange): Promise<ActionResult<PurchasesReport>> =>
      guarded(() => requirePermission("reports.view"), async () => {
        const db = getDb();
        const conditions = [ne(purchases.status, "deleted")];
        if (query?.fromDate) conditions.push(gte(purchases.invoiceDate, query.fromDate));
        if (query?.toDate) conditions.push(lte(purchases.invoiceDate, query.toDate));

        const rows = db
          .select()
          .from(purchases)
          .where(and(...conditions))
          .orderBy(desc(purchases.invoiceDate))
          .all();

        const returnedMap = purchaseReturnedTotalsMap(db);
        const mapped = rows.map((r) => {
          const returnedTotal = returnedMap.get(r.id) ?? 0;
          return {
            id: r.id,
            invoiceNo: r.invoiceNo,
            invoiceDate: r.invoiceDate,
            vendorName: r.vendorId
              ? db.select().from(vendors).where(eq(vendors.id, r.vendorId)).get()?.name ?? null
              : null,
            paymentMode: r.paymentMode,
            subtotal: r.subtotal,
            discountAmount: r.discountAmount,
            taxAmount: r.taxAmount,
            grandTotal: r.grandTotal,
            returnedTotal,
            netTotal: netAmount(r.grandTotal, returnedTotal),
            paidAmount: r.paidAmount,
          };
        });

        const returnConditions = [];
        if (query?.fromDate) returnConditions.push(gte(purchaseReturns.returnDate, query.fromDate));
        if (query?.toDate) returnConditions.push(lte(purchaseReturns.returnDate, query.toDate));
        const returnRows = db
          .select()
          .from(purchaseReturns)
          .where(returnConditions.length ? and(...returnConditions) : undefined)
          .orderBy(desc(purchaseReturns.returnDate), desc(purchaseReturns.createdAt))
          .all()
          .map((r) => ({
            id: r.id,
            returnNo: r.returnNo,
            returnDate: r.returnDate,
            partyName: r.vendorId
              ? db.select().from(vendors).where(eq(vendors.id, r.vendorId)).get()?.name ?? null
              : null,
            againstInvoiceNo: r.purchaseId
              ? db.select().from(purchases).where(eq(purchases.id, r.purchaseId)).get()?.invoiceNo ?? null
              : null,
            taxAmount: r.taxAmount,
            grandTotal: r.grandTotal,
          }));

        const returnsTotal = sumPurchaseReturnsInRange(db, query?.fromDate, query?.toDate);
        const returnsTax = sumPurchaseReturnTaxInRange(db, query?.fromDate, query?.toDate);

        const byMode = new Map<string, { count: number; total: number }>();
        const byDay = new Map<string, { count: number; total: number }>();
        for (const r of mapped) {
          const m = byMode.get(r.paymentMode) ?? { count: 0, total: 0 };
          m.count += 1;
          m.total = money(m.total + r.grandTotal);
          byMode.set(r.paymentMode, m);
          const d = byDay.get(r.invoiceDate) ?? { count: 0, total: 0 };
          d.count += 1;
          d.total = money(d.total + r.grandTotal);
          byDay.set(r.invoiceDate, d);
        }

        return ok({
          fromDate: query?.fromDate ?? null,
          toDate: query?.toDate ?? null,
          rows: mapped,
          returnRows,
          totalGross: money(mapped.reduce((s, r) => s + r.grandTotal, 0)),
          totalReturns: money(returnsTotal),
          totalSubtotal: money(mapped.reduce((s, r) => s + r.subtotal, 0)),
          totalDiscount: money(mapped.reduce((s, r) => s + r.discountAmount, 0)),
          totalTax: money(mapped.reduce((s, r) => s + r.taxAmount, 0) - returnsTax),
          totalGrand: money(mapped.reduce((s, r) => s + r.grandTotal, 0) - returnsTotal),
          totalPaid: money(mapped.reduce((s, r) => s + r.paidAmount, 0)),
          byPaymentMode: [...byMode.entries()].map(([mode, v]) => ({ mode, ...v })),
          byDay: [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
        });
      })
  );

type DayAgg = { revenue: number; cogs: number; qty: number };

function bumpDay(map: Map<string, DayAgg>, date: string, revenue: number, cogs: number, qty: number) {
  const cur = map.get(date) ?? { revenue: 0, cogs: 0, qty: 0 };
  cur.revenue += revenue;
  cur.cogs += cogs;
  cur.qty += qty;
  map.set(date, cur);
}

function eachDateInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return out;
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return out;
}

function seriesFromDays(days: Map<string, DayAgg>, dateKeys: string[]): ProductProfitPoint[] {
  return dateKeys.map((date) => {
    const d = days.get(date) ?? { revenue: 0, cogs: 0, qty: 0 };
    const revenue = money(d.revenue);
    const cogs = money(d.cogs);
    return { date, revenue, cogs, profit: money(revenue - cogs) };
  });
}

  registerHandler(IPC.REPORTS_PROFIT, async (_e, query?: ReportDateRange): Promise<ActionResult<ProfitReport>> =>
    guarded(() => requirePermission("reports.view"), async () => {
      const db = getDb();
      const settings = getSettingsMap(db);
      const inRange = (date: string | null | undefined) => {
        if (!date) return false;
        if (query?.fromDate && date < query.fromDate) return false;
        if (query?.toDate && date > query.toDate) return false;
        return true;
      };

      const saleCond = [ne(sales.status, "deleted")];
      if (query?.fromDate) saleCond.push(gte(sales.invoiceDate, query.fromDate));
      if (query?.toDate) saleCond.push(lte(sales.invoiceDate, query.toDate));

      const saleLines = db
        .select({
          productId: products.id,
          productName: products.name,
          categoryName: categories.name,
          date: sales.invoiceDate,
          revenue: sql<number>`coalesce(sum(${saleItems.lineTotal} - ${saleItems.taxAmount}), 0)`,
          cogs: sql<number>`coalesce(sum(${saleItems.costPrice} * ${saleItems.quantity}), 0)`,
          qty: sql<number>`coalesce(sum(${saleItems.quantity}), 0)`,
        })
        .from(saleItems)
        .innerJoin(sales, eq(saleItems.saleId, sales.id))
        .innerJoin(productVariants, eq(saleItems.variantId, productVariants.id))
        .innerJoin(products, eq(productVariants.productId, products.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(and(...saleCond))
        .groupBy(products.id, products.name, categories.name, sales.invoiceDate)
        .all();

      const costBySaleVariant = new Map<string, number>();
      for (const row of db
        .select({
          saleId: saleItems.saleId,
          variantId: saleItems.variantId,
          unitCost: sql<number>`coalesce(sum(${saleItems.costPrice} * ${saleItems.quantity}) / nullif(sum(${saleItems.quantity}), 0), 0)`,
        })
        .from(saleItems)
        .groupBy(saleItems.saleId, saleItems.variantId)
        .all()) {
        costBySaleVariant.set(`${row.saleId}:${row.variantId}`, Number(row.unitCost || 0));
      }

      const returnLines = db
        .select({
          productId: products.id,
          productName: products.name,
          categoryName: categories.name,
          returnDate: saleReturns.returnDate,
          saleId: saleReturns.saleId,
          saleInvoiceDate: sales.invoiceDate,
          variantId: saleReturnItems.variantId,
          revenue: sql<number>`coalesce(sum(${saleReturnItems.lineTotal}), 0)`,
          fallbackCogs: sql<number>`coalesce(sum(${saleReturnItems.quantity} * coalesce(${productVariants.costPrice}, ${products.costPrice}, 0)), 0)`,
          qty: sql<number>`coalesce(sum(${saleReturnItems.quantity}), 0)`,
        })
        .from(saleReturnItems)
        .innerJoin(saleReturns, eq(saleReturnItems.saleReturnId, saleReturns.id))
        .innerJoin(productVariants, eq(saleReturnItems.variantId, productVariants.id))
        .innerJoin(products, eq(productVariants.productId, products.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .leftJoin(sales, eq(saleReturns.saleId, sales.id))
        .groupBy(
          products.id,
          products.name,
          categories.name,
          saleReturns.returnDate,
          saleReturns.saleId,
          sales.invoiceDate,
          saleReturnItems.variantId
        )
        .all();

      type ProductBucket = {
        productId: string;
        productName: string;
        categoryName: string | null;
        days: Map<string, DayAgg>;
      };
      const productsMap = new Map<string, ProductBucket>();
      const shopDays = new Map<string, DayAgg>();

      const take = (
        productId: string,
        productName: string,
        categoryName: string | null,
        date: string,
        revenue: number,
        lineCogs: number,
        qty: number
      ) => {
        let bucket = productsMap.get(productId);
        if (!bucket) {
          bucket = { productId, productName, categoryName, days: new Map() };
          productsMap.set(productId, bucket);
        }
        bumpDay(bucket.days, date, revenue, lineCogs, qty);
        bumpDay(shopDays, date, revenue, lineCogs, qty);
      };

      let grossSalesRevenue = 0;
      let grossCogs = 0;
      for (const r of saleLines) {
        const revenue = Number(r.revenue);
        const lineCogs = Number(r.cogs);
        grossSalesRevenue += revenue;
        grossCogs += lineCogs;
        take(r.productId, r.productName, r.categoryName ?? null, r.date, revenue, lineCogs, Number(r.qty));
      }

      let saleReturnsRevenue = 0;
      let saleReturnsCogs = 0;
      for (const r of returnLines) {
        const qty = Number(r.qty);
        const revenue = Number(r.revenue);
        const unitCost = r.saleId ? costBySaleVariant.get(`${r.saleId}:${r.variantId}`) : undefined;
        const lineCogs = unitCost != null ? unitCost * qty : Number(r.fallbackCogs);

        const originalDate = r.saleInvoiceDate ?? null;
        let applyDate: string | null = null;
        if (originalDate && inRange(originalDate)) {
          applyDate = originalDate;
        } else if (inRange(r.returnDate)) {
          applyDate = r.returnDate;
        }
        if (!applyDate) continue;

        saleReturnsRevenue += revenue;
        saleReturnsCogs += lineCogs;
        take(r.productId, r.productName, r.categoryName ?? null, applyDate, -revenue, -lineCogs, -qty);
      }

      const dataDates = [...shopDays.keys()].sort();
      const from = query?.fromDate || dataDates[0];
      const to = query?.toDate || dataDates[dataDates.length - 1];
      const dateKeys =
        from && to ? eachDateInclusive(from, to) : dataDates.length ? dataDates : [];
      const keys = dateKeys.length ? dateKeys : dataDates;

      const byProduct: ProductProfitRow[] = [...productsMap.values()]
        .map((p) => {
          const series = seriesFromDays(p.days, keys);
          const revenue = money(series.reduce((s, d) => s + d.revenue, 0));
          const lineCogs = money(series.reduce((s, d) => s + d.cogs, 0));
          const profit = money(revenue - lineCogs);
          const qtySold = money([...p.days.values()].reduce((s, d) => s + d.qty, 0));
          return {
            productId: p.productId,
            productName: p.productName,
            categoryName: p.categoryName,
            qtySold,
            revenue,
            cogs: lineCogs,
            profit,
            marginPct: revenue === 0 ? 0 : money((profit / revenue) * 100),
            series,
          };
        })
        .sort((a, b) => b.profit - a.profit);

      const byDay = seriesFromDays(shopDays, keys);
      const salesRevenue = money(grossSalesRevenue - saleReturnsRevenue);
      const cogs = money(grossCogs - saleReturnsCogs);
      const grossProfit = money(salesRevenue - cogs);
      return ok({
        fromDate: query?.fromDate ?? null,
        toDate: query?.toDate ?? null,
        currencySymbol: settings.currency_symbol || "Rs",
        grossSalesRevenue: money(grossSalesRevenue),
        saleReturnsRevenue: money(saleReturnsRevenue),
        salesRevenue,
        grossCogs: money(grossCogs),
        saleReturnsCogs: money(saleReturnsCogs),
        cogs,
        grossProfit,
        otherIncome: 0,
        operatingExpenses: 0,
        netProfit: grossProfit,
        incomeLines: [{ accountCode: "4100", accountName: "Sales Revenue (net of returns)", amount: salesRevenue }],
        expenseLines: [{ accountCode: "5100", accountName: "Cost of Goods Sold (net)", amount: cogs }],
        byDay,
        byProduct,
      });
    })
  );

  registerHandler(IPC.REPORTS_STOCK, async (): Promise<ActionResult<StockReport>> =>
    guarded(() => requirePermission("reports.view"), async () => {
      const db = getDb();
      const rows = db
        .select({
          variantId: productVariants.id,
          sku: productVariants.sku,
          productName: products.name,
          size: productVariants.size,
          color: productVariants.color,
          categoryId: products.categoryId,
          stockQty: productVariants.stockQty,
          costPrice: sql<number>`coalesce(${productVariants.costPrice}, ${products.costPrice})`,
          salePrice: sql<number>`coalesce(${productVariants.salePrice}, ${products.salePrice})`,
          reorderLevel: products.reorderLevel,
        })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .orderBy(desc(products.createdAt), asc(products.name), asc(productVariants.size))
        .all();

      const mapped = rows.map((r) => {
        const cat = r.categoryId
          ? db.select().from(categories).where(eq(categories.id, r.categoryId)).get()
          : null;
        const cost = Number(r.costPrice);
        const qty = Number(r.stockQty);
        return {
          variantId: r.variantId,
          sku: r.sku,
          productName: r.productName,
          size: r.size,
          color: r.color,
          categoryName: cat?.name ?? null,
          stockQty: qty,
          costPrice: cost,
          salePrice: Number(r.salePrice),
          valuation: money(qty * cost),
          reorderLevel: Number(r.reorderLevel),
          isLowStock: qty <= Number(r.reorderLevel),
        };
      });

      return ok({
        rows: mapped,
        totalQty: money(mapped.reduce((s, r) => s + r.stockQty, 0)),
        totalValuation: money(mapped.reduce((s, r) => s + r.valuation, 0)),
        lowStockCount: mapped.filter((r) => r.isLowStock).length,
      });
    })
  );

  registerHandler(IPC.REPORTS_TAX, async (_e, query?: ReportDateRange): Promise<ActionResult<TaxReport>> =>
    guarded(() => requirePermission("reports.view"), async () => {
      const db = getDb();
      const sCond = [ne(sales.status, "deleted")];
      const pCond = [ne(purchases.status, "deleted")];
      if (query?.fromDate) {
        sCond.push(gte(sales.invoiceDate, query.fromDate));
        pCond.push(gte(purchases.invoiceDate, query.fromDate));
      }
      if (query?.toDate) {
        sCond.push(lte(sales.invoiceDate, query.toDate));
        pCond.push(lte(purchases.invoiceDate, query.toDate));
      }
      const s = db
        .select({
          tax: sql<number>`coalesce(sum(${sales.taxAmount}), 0)`,
          cnt: sql<number>`count(*)`,
        })
        .from(sales)
        .where(and(...sCond))
        .get();
      const p = db
        .select({
          tax: sql<number>`coalesce(sum(${purchases.taxAmount}), 0)`,
          cnt: sql<number>`count(*)`,
        })
        .from(purchases)
        .where(and(...pCond))
        .get();
      const salesTax = money(
        Number(s?.tax ?? 0) - sumSaleReturnTaxInRange(db, query?.fromDate, query?.toDate)
      );
      const purchaseTax = money(
        Number(p?.tax ?? 0) - sumPurchaseReturnTaxInRange(db, query?.fromDate, query?.toDate)
      );
      return ok({
        fromDate: query?.fromDate ?? null,
        toDate: query?.toDate ?? null,
        salesTax,
        purchaseTax,
        netTax: money(salesTax - purchaseTax),
        salesCount: Number(s?.cnt ?? 0),
        purchaseCount: Number(p?.cnt ?? 0),
      });
    })
  );

  registerHandler(
    IPC.REPORTS_DELETED,
    async (_e, query?: ReportDateRange): Promise<ActionResult<DeletedDocumentsReport>> =>
      guarded(() => requirePermission("reports.view"), async () => {
        const db = getDb();
        const sCond = [eq(sales.status, "deleted")];
        const pCond = [eq(purchases.status, "deleted")];
        if (query?.fromDate) {
          sCond.push(gte(sales.updatedAt, query.fromDate));
          pCond.push(gte(purchases.updatedAt, query.fromDate));
        }
        if (query?.toDate) {
          sCond.push(lte(sales.updatedAt, `${query.toDate}T23:59:59`));
          pCond.push(lte(purchases.updatedAt, `${query.toDate}T23:59:59`));
        }

        const sRows = db.select().from(sales).where(and(...sCond)).all();
        const pRows = db.select().from(purchases).where(and(...pCond)).all();

        const rows = [
          ...sRows.map((r) => ({
            id: r.id,
            documentType: "sale" as const,
            documentNo: r.invoiceNo,
            documentDate: r.invoiceDate,
            partyName: r.customerId
              ? db.select().from(customers).where(eq(customers.id, r.customerId)).get()?.name ?? null
              : null,
            paymentMode: r.paymentMode,
            grandTotal: r.grandTotal,
            deletedAt: r.updatedAt,
            deletedBy: resolveDeletedByName(r.id, "sales"),
            details: r.notes,
          })),
          ...pRows.map((r) => ({
            id: r.id,
            documentType: "purchase" as const,
            documentNo: r.invoiceNo,
            documentDate: r.invoiceDate,
            partyName: r.vendorId
              ? db.select().from(vendors).where(eq(vendors.id, r.vendorId)).get()?.name ?? null
              : null,
            paymentMode: r.paymentMode,
            grandTotal: r.grandTotal,
            deletedAt: r.updatedAt,
            deletedBy: resolveDeletedByName(r.id, "purchases"),
            details: r.notes,
          })),
        ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

        return ok({
          fromDate: query?.fromDate ?? null,
          toDate: query?.toDate ?? null,
          rows,
          totalAmount: money(rows.reduce((s, r) => s + r.grandTotal, 0)),
          salesCount: sRows.length,
          purchasesCount: pRows.length,
        });
      })
  );
}
