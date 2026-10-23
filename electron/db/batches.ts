import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "./index";
import { money } from "./ledger";
import { stockBatches } from "./schema";

/** Local calendar day, plus `days`, as YYYY-MM-DD. */
export function expirySoonCutoff(days = 30): string {
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  const y = limit.getFullYear();
  const m = String(limit.getMonth() + 1).padStart(2, "0");
  const d = String(limit.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** A number the shop can read when the pack has no printed batch. */
export function allocateBatchNo(db: Db): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const prefix = `B-${stamp}-`;
  const used = new Set(db.select({ batchNo: stockBatches.batchNo }).from(stockBatches).all().map((row) => row.batchNo));
  let n = 1;
  while (used.has(`${prefix}${String(n).padStart(3, "0")}`)) n += 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}

export function readBatchDates(
  input: { manufacturedDate?: string | null; expiryDate?: string | null },
  label: string
): { manufacturedDate: string; expiryDate: string } | { error: string } {
  const manufacturedDate = String(input.manufacturedDate ?? "").trim();
  const expiryDate = String(input.expiryDate ?? "").trim();
  if (!manufacturedDate) return { error: `${label}: manufactured date is required` };
  if (!expiryDate) return { error: `${label}: expiry date is required` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manufacturedDate) || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
    return { error: `${label}: use a real date` };
  }
  if (manufacturedDate > expiryDate) return { error: `${label}: manufactured date is after the expiry date` };
  return { manufacturedDate, expiryDate };
}

export function receiveBatch(
  db: Db,
  variantId: string,
  batchNo: string,
  expiryDate: string | null,
  qty: number,
  ts: string,
  manufacturedDate?: string | null
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
        manufacturedDate: manufacturedDate || existing.manufacturedDate,
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
      manufacturedDate: manufacturedDate || null,
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
