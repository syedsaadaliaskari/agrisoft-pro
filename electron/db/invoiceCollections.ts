import { and, asc, eq, ne } from "drizzle-orm";
import type { Db } from "./index";
import { money } from "./ledger";
import { netAmount, returnedTotalForPurchase, returnedTotalForSale } from "./returnsNet";
import { purchases, sales, vouchers } from "./schema";

type OpenDoc = {
  id: string;
  invoiceDate: string;
  createdAt: string;
  invoicePaid: number;
  netTotal: number;
  remaining: number;
};

/**
 * Allocate customer receipts (FIFO) onto open sales.
 * Invoice-time paidAmount stays unchanged (returns still reverse correctly);
 * collected = invoice paid + later receipts allocated to that bill.
 */
export function collectedAmountsForCustomer(db: Db, customerId: string): Map<string, number> {
  const saleRows = db
    .select()
    .from(sales)
    .where(and(eq(sales.customerId, customerId), ne(sales.status, "deleted")))
    .orderBy(asc(sales.invoiceDate), asc(sales.createdAt))
    .all();

  const docs: OpenDoc[] = saleRows.map((r) => {
    const returned = returnedTotalForSale(db, r.id);
    const net = netAmount(r.grandTotal, returned);
    const invoicePaid = money(Math.min(r.paidAmount, net));
    return {
      id: r.id,
      invoiceDate: r.invoiceDate,
      createdAt: r.createdAt,
      invoicePaid,
      netTotal: net,
      remaining: money(Math.max(0, net - invoicePaid)),
    };
  });

  const receipts = db
    .select()
    .from(vouchers)
    .where(
      and(
        eq(vouchers.partyType, "customer"),
        eq(vouchers.partyId, customerId),
        eq(vouchers.voucherType, "receipt"),
        eq(vouchers.status, "posted")
      )
    )
    .orderBy(asc(vouchers.voucherDate), asc(vouchers.createdAt))
    .all();

  for (const receipt of receipts) {
    let left = money(receipt.paidAmount || receipt.grandTotal);
    for (const doc of docs) {
      if (left <= 0) break;
      if (doc.remaining <= 0) continue;
      const take = money(Math.min(left, doc.remaining));
      doc.remaining = money(doc.remaining - take);
      left = money(left - take);
    }
  }

  const map = new Map<string, number>();
  for (const doc of docs) {
    map.set(doc.id, money(doc.netTotal - doc.remaining));
  }
  return map;
}

/** Allocate vendor payments (FIFO) onto open purchases. */
export function collectedAmountsForVendor(db: Db, vendorId: string): Map<string, number> {
  const purchaseRows = db
    .select()
    .from(purchases)
    .where(and(eq(purchases.vendorId, vendorId), ne(purchases.status, "deleted")))
    .orderBy(asc(purchases.invoiceDate), asc(purchases.createdAt))
    .all();

  const docs: OpenDoc[] = purchaseRows.map((r) => {
    const returned = returnedTotalForPurchase(db, r.id);
    const net = netAmount(r.grandTotal, returned);
    const invoicePaid = money(Math.min(r.paidAmount, net));
    return {
      id: r.id,
      invoiceDate: r.invoiceDate,
      createdAt: r.createdAt,
      invoicePaid,
      netTotal: net,
      remaining: money(Math.max(0, net - invoicePaid)),
    };
  });

  const payments = db
    .select()
    .from(vouchers)
    .where(
      and(
        eq(vouchers.partyType, "vendor"),
        eq(vouchers.partyId, vendorId),
        eq(vouchers.voucherType, "payment"),
        eq(vouchers.status, "posted")
      )
    )
    .orderBy(asc(vouchers.voucherDate), asc(vouchers.createdAt))
    .all();

  for (const payment of payments) {
    let left = money(payment.paidAmount || payment.grandTotal);
    for (const doc of docs) {
      if (left <= 0) break;
      if (doc.remaining <= 0) continue;
      const take = money(Math.min(left, doc.remaining));
      doc.remaining = money(doc.remaining - take);
      left = money(left - take);
    }
  }

  const map = new Map<string, number>();
  for (const doc of docs) {
    map.set(doc.id, money(doc.netTotal - doc.remaining));
  }
  return map;
}

/** Build collected map for every open sale (grouped by customer). */
export function allSaleCollectedAmounts(db: Db): Map<string, number> {
  const map = new Map<string, number>();
  const customerIds = new Set(
    db
      .select({ customerId: sales.customerId })
      .from(sales)
      .where(ne(sales.status, "deleted"))
      .all()
      .map((r) => r.customerId)
      .filter((id): id is string => !!id)
  );
  for (const customerId of customerIds) {
    for (const [saleId, collected] of collectedAmountsForCustomer(db, customerId)) {
      map.set(saleId, collected);
    }
  }
  // Walk-in / no customer: collected = invoice paid only
  const orphans = db
    .select()
    .from(sales)
    .where(and(ne(sales.status, "deleted")))
    .all()
    .filter((r) => !r.customerId);
  for (const r of orphans) {
    const net = netAmount(r.grandTotal, returnedTotalForSale(db, r.id));
    map.set(r.id, money(Math.min(r.paidAmount, net)));
  }
  return map;
}

export function allPurchaseCollectedAmounts(db: Db): Map<string, number> {
  const map = new Map<string, number>();
  const vendorIds = new Set(
    db
      .select({ vendorId: purchases.vendorId })
      .from(purchases)
      .where(ne(purchases.status, "deleted"))
      .all()
      .map((r) => r.vendorId)
      .filter((id): id is string => !!id)
  );
  for (const vendorId of vendorIds) {
    for (const [purchaseId, collected] of collectedAmountsForVendor(db, vendorId)) {
      map.set(purchaseId, collected);
    }
  }
  return map;
}
