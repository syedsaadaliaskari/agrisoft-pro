import { ipcMain } from "electron";
import { and, asc, count, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import {
  IPC,
  type ActionResult,
  type DashboardSummary,
  type ReportDateRange,
  type SalesReport,
  type PurchasesReport,
  type ProfitReport,
  type StockReport,
  type TaxReport,
  type DeletedDocumentsReport,
} from "../../shared/ipc";
import { getDb } from "../db";
import { getSettingsMap } from "../db/settings";
import { requireAccountByCode } from "../db/accounts";
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
} from "../db/schema";
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
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function registerDashboardHandlers(): void {
  ipcMain.handle(IPC.DASHBOARD_SUMMARY, async (): Promise<ActionResult<DashboardSummary>> =>
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
        return {
          date,
          salesTotal: Number(s?.total ?? 0),
          salesCount: Number(s?.cnt ?? 0),
          purchasesTotal: Number(p?.total ?? 0),
          purchasesCount: Number(p?.cnt ?? 0),
        };
      };

      const todaySales = dayAgg(t);

      const monthSales = db
        .select({ total: sql<number>`coalesce(sum(${sales.grandTotal}), 0)` })
        .from(sales)
        .where(and(gte(sales.invoiceDate, monthStart), lte(sales.invoiceDate, t), ne(sales.status, "deleted")))
        .get();
      const monthPurchases = db
        .select({ total: sql<number>`coalesce(sum(${purchases.grandTotal}), 0)` })
        .from(purchases)
        .where(
          and(gte(purchases.invoiceDate, monthStart), lte(purchases.invoiceDate, t), ne(purchases.status, "deleted"))
        )
        .get();

      const monthCogs = db
        .select({
          total: sql<number>`coalesce(sum(${saleItems.costPrice} * ${saleItems.quantity}), 0)`,
        })
        .from(saleItems)
        .innerJoin(sales, eq(saleItems.saleId, sales.id))
        .where(and(gte(sales.invoiceDate, monthStart), lte(sales.invoiceDate, t), ne(sales.status, "deleted")))
        .get();

      const cash = requireAccountByCode(db, "1100", "Cash");
      const bank = requireAccountByCode(db, "1200", "Bank");
      const ar = requireAccountByCode(db, "1300", "AR");
      const ap = requireAccountByCode(db, "2100", "AP");
      const fullBal = (accountId: string) => computeAccountOpening(db, accountId, "9999-99-99")!.signed;

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

      const openSaleInvoices =
        db
          .select({ value: count() })
          .from(sales)
          .where(
            and(
              ne(sales.status, "deleted"),
              sql`${sales.grandTotal} > ${sales.paidAmount}`
            )
          )
          .get()?.value ?? 0;

      const monthSalesTotal = Number(monthSales?.total ?? 0);
      const monthPurchasesTotal = Number(monthPurchases?.total ?? 0);
      const monthProfitEstimate = money(monthSalesTotal - Number(monthCogs?.total ?? 0));

      return ok({
        todaySalesTotal: todaySales.salesTotal,
        todaySalesCount: todaySales.salesCount,
        todayPurchasesTotal: todaySales.purchasesTotal,
        todayPurchasesCount: todaySales.purchasesCount,
        monthSalesTotal,
        monthPurchasesTotal,
        monthProfitEstimate,
        cashBalance: money(fullBal(cash.id)),
        bankBalance: money(fullBal(bank.id)),
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

  ipcMain.handle(IPC.REPORTS_SALES, async (_e, query?: ReportDateRange): Promise<ActionResult<SalesReport>> =>
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

      const mapped = rows.map((r) => ({
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
        paidAmount: r.paidAmount,
      }));

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
        totalSubtotal: money(mapped.reduce((s, r) => s + r.subtotal, 0)),
        totalDiscount: money(mapped.reduce((s, r) => s + r.discountAmount, 0)),
        totalTax: money(mapped.reduce((s, r) => s + r.taxAmount, 0)),
        totalGrand: money(mapped.reduce((s, r) => s + r.grandTotal, 0)),
        totalPaid: money(mapped.reduce((s, r) => s + r.paidAmount, 0)),
        byPaymentMode: [...byMode.entries()].map(([mode, v]) => ({ mode, ...v })),
        byDay: [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
      });
    })
  );

  ipcMain.handle(
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

        const mapped = rows.map((r) => ({
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
          paidAmount: r.paidAmount,
        }));

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
          totalSubtotal: money(mapped.reduce((s, r) => s + r.subtotal, 0)),
          totalDiscount: money(mapped.reduce((s, r) => s + r.discountAmount, 0)),
          totalTax: money(mapped.reduce((s, r) => s + r.taxAmount, 0)),
          totalGrand: money(mapped.reduce((s, r) => s + r.grandTotal, 0)),
          totalPaid: money(mapped.reduce((s, r) => s + r.paidAmount, 0)),
          byPaymentMode: [...byMode.entries()].map(([mode, v]) => ({ mode, ...v })),
          byDay: [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
        });
      })
  );

  ipcMain.handle(IPC.REPORTS_PROFIT, async (_e, query?: ReportDateRange): Promise<ActionResult<ProfitReport>> =>
    guarded(() => requirePermission("reports.view"), async () => {
      const db = getDb();
      const saleCond = [ne(sales.status, "deleted")];
      if (query?.fromDate) saleCond.push(gte(sales.invoiceDate, query.fromDate));
      if (query?.toDate) saleCond.push(lte(sales.invoiceDate, query.toDate));

      const salesRevenue = Number(
        db
          .select({ t: sql<number>`coalesce(sum(${sales.grandTotal} - ${sales.taxAmount}), 0)` })
          .from(sales)
          .where(and(...saleCond))
          .get()?.t ?? 0
      );

      // Approximate COGS from sale items
      const cogs = Number(
        db
          .select({
            t: sql<number>`coalesce(sum(${saleItems.costPrice} * ${saleItems.quantity}), 0)`,
          })
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.saleId, sales.id))
          .where(and(...saleCond))
          .get()?.t ?? 0
      );

      const grossProfit = money(salesRevenue - cogs);
      return ok({
        fromDate: query?.fromDate ?? null,
        toDate: query?.toDate ?? null,
        salesRevenue: money(salesRevenue),
        cogs: money(cogs),
        grossProfit,
        otherIncome: 0,
        operatingExpenses: 0,
        netProfit: grossProfit,
        incomeLines: [{ accountCode: "4100", accountName: "Sales Revenue", amount: money(salesRevenue) }],
        expenseLines: [{ accountCode: "5100", accountName: "Cost of Goods Sold", amount: money(cogs) }],
      });
    })
  );

  ipcMain.handle(IPC.REPORTS_STOCK, async (): Promise<ActionResult<StockReport>> =>
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

  ipcMain.handle(IPC.REPORTS_TAX, async (_e, query?: ReportDateRange): Promise<ActionResult<TaxReport>> =>
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
      const salesTax = Number(s?.tax ?? 0);
      const purchaseTax = Number(p?.tax ?? 0);
      return ok({
        fromDate: query?.fromDate ?? null,
        toDate: query?.toDate ?? null,
        salesTax: money(salesTax),
        purchaseTax: money(purchaseTax),
        netTax: money(salesTax - purchaseTax),
        salesCount: Number(s?.cnt ?? 0),
        purchaseCount: Number(p?.cnt ?? 0),
      });
    })
  );

  ipcMain.handle(
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
            deletedBy: r.createdBy,
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
            deletedBy: r.createdBy,
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
