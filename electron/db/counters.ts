import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import type { Db } from "./index";
import { documentCounters, vouchers } from "./schema";
import type { DocType } from "../../shared/ipc";

/**
 * Every voucher-backed document shares one globally unique `vouchers.voucher_no`,
 * so each type needs its own prefix — otherwise sale #00001 and purchase #00001
 * collide and the second one fails to save.
 */
export const DOC_PREFIXES: Record<DocType, string> = {
  sale: "S",
  sale_return: "SR",
  purchase: "P",
  purchase_return: "PR",
  payment: "PY",
  receipt: "R",
  journal: "J",
  expense: "E",
  income: "IN",
  owner_draw: "OD",
  customer: "C",
  vendor: "V",
  product: "PRD",
};

const VOUCHER_DOC_TYPES = new Set<DocType>([
  "sale",
  "sale_return",
  "purchase",
  "purchase_return",
  "payment",
  "receipt",
  "journal",
  "expense",
  "income",
  "owner_draw",
]);

function formatDocumentNumber(prefix: string | null, number: number, padLength: number): string {
  return `${prefix || "#"}${String(number).padStart(padLength, "0")}`;
}

/** Atomically allocate the next document number (e.g. S00001). */
export function nextDocumentNumber(db: Db, docType: DocType): string {
  ensureDocumentPrefixes(db);
  const row = db.select().from(documentCounters).where(eq(documentCounters.docType, docType)).get();

  if (!row) {
    throw new Error(`Document counter not found for type: ${docType}`);
  }

  let number = row.nextNumber;
  let code = formatDocumentNumber(row.prefix, number, row.padLength);

  // Legacy data may already hold this number under an older prefix scheme — skip past it.
  if (VOUCHER_DOC_TYPES.has(docType)) {
    while (db.select().from(vouchers).where(eq(vouchers.voucherNo, code)).get()) {
      number += 1;
      code = formatDocumentNumber(row.prefix, number, row.padLength);
    }
  }

  db.update(documentCounters)
    .set({
      nextNumber: number + 1,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(documentCounters.id, row.id))
    .run();

  return code;
}

/** Peek next number without consuming it */
export function peekDocumentNumber(db: Db, docType: DocType): string {
  ensureDocumentPrefixes(db);
  const row = db.select().from(documentCounters).where(eq(documentCounters.docType, docType)).get();
  if (!row) {
    throw new Error(`Document counter not found for type: ${docType}`);
  }
  return formatDocumentNumber(row.prefix, row.nextNumber, row.padLength);
}

/** Create any missing bill-number rows and keep prefixes correct. */
export function ensureDocumentPrefixes(db: Db): void {
  for (const [docType, prefix] of Object.entries(DOC_PREFIXES) as [DocType, string][]) {
    const row = db.select().from(documentCounters).where(eq(documentCounters.docType, docType)).get();
    if (!row) {
      db.insert(documentCounters)
        .values({
          id: randomUUID(),
          docType,
          prefix,
          nextNumber: 1,
        })
        .run();
      continue;
    }
    if (row.prefix === prefix) continue;
    db.update(documentCounters)
      .set({ prefix, updatedAt: sql`(datetime('now'))` })
      .where(eq(documentCounters.id, row.id))
      .run();
  }
}
