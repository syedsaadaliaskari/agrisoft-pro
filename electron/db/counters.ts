import { eq, sql } from "drizzle-orm";
import type { Db } from "./index";
import { documentCounters } from "./schema";
import type { DocType } from "../../shared/ipc";

/** Atomically allocate the next document number (e.g. #00001). */
export function nextDocumentNumber(db: Db, docType: DocType): string {
  const row = db.select().from(documentCounters).where(eq(documentCounters.docType, docType)).get();

  if (!row) {
    throw new Error(`Document counter not found for type: ${docType}`);
  }

  const number = row.nextNumber;
  const padded = String(number).padStart(row.padLength, "0");
  const prefix = row.prefix || "#";
  const code = `${prefix}${padded}`;

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
  const row = db.select().from(documentCounters).where(eq(documentCounters.docType, docType)).get();
  if (!row) {
    throw new Error(`Document counter not found for type: ${docType}`);
  }
  const padded = String(row.nextNumber).padStart(row.padLength, "0");
  const prefix = row.prefix || "#";
  return `${prefix}${padded}`;
}

/** Migrate legacy INV-/PUR- prefixes to simple # for all document types. */
export function ensureSimpleDocumentPrefixes(db: Db): void {
  const rows = db.select().from(documentCounters).all();
  for (const row of rows) {
    if (row.prefix === "#") continue;
    db.update(documentCounters)
      .set({ prefix: "#", updatedAt: sql`(datetime('now'))` })
      .where(eq(documentCounters.id, row.id))
      .run();
  }
}
