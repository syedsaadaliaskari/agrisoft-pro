import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "./index";
import { money } from "./ledger";
import { stockBatches } from "./schema";

export function receiveBatch(
  db: Db,
  variantId: string,
  batchNo: string,
  expiryDate: string | null,
  qty: number,
  ts: string
) {
  const existing = db
    .select()
    .from(stockBatches)
    .where(and(eq(stockBatches.variantId, variantId), eq(stockBatches.batchNo, batchNo)))
    .get();
  if (existing) {
    db.update(stockBatches)
      .set({
        qty: money(existing.qty + qty),
        expiryDate: expiryDate || existing.expiryDate,
        updatedAt: ts,
      })
      .where(eq(stockBatches.id, existing.id))
      .run();
    return;
  }
  db.insert(stockBatches)
    .values({
      id: randomUUID(),
      variantId,
      batchNo,
      expiryDate,
      qty: money(qty),
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

/** Take quantity from one batch. Returns null when this pack has no batches yet. */
export function takeBatch(
  db: Db,
  variantId: string,
  batchNo: string | null,
  qty: number,
  ts: string
): { batchNo: string; expiryDate: string | null } | null {
  const rows = db
    .select()
    .from(stockBatches)
    .where(eq(stockBatches.variantId, variantId))
    .all()
    .filter((row) => row.qty > 0)
    .sort((a, b) => (a.expiryDate || "9999").localeCompare(b.expiryDate || "9999"));
  if (!rows.length) return null;

  const picked = batchNo ? rows.find((row) => row.batchNo === batchNo) : rows[0];
  if (!picked) throw new Error(`Batch ${batchNo} was not found for this pack`);
  if (picked.qty < qty) {
    throw new Error(`Batch ${picked.batchNo} has ${money(picked.qty)} left, and this line needs ${qty}`);
  }
  db.update(stockBatches)
    .set({ qty: money(picked.qty - qty), updatedAt: ts })
    .where(eq(stockBatches.id, picked.id))
    .run();
  return { batchNo: picked.batchNo, expiryDate: picked.expiryDate };
}

export function listBatches(db: Db) {
  return db.select().from(stockBatches).orderBy(asc(stockBatches.expiryDate)).all();
}
