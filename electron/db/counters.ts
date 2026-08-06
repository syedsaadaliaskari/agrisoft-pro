import { eq, sql } from "drizzle-orm";
import type { Db } from "./index";
import { documentCounters } from "./schema";
import type { DocType } from "../../shared/ipc";

/** Atomically allocate the next document number for a doc type (e.g. INV-00001). */
export function nextDocumentNumber(db: Db, docType: DocType): string {
  const row = db.select().from(documentCounters).where(eq(documentCounters.docType, docType)).get();

  if (!row) {
    throw new Error(`Document counter not found for type: ${docType}`);
  }

  const number = row.nextNumber;
  const padded = String(number).padStart(row.padLength, "0");
  const code = `${row.prefix}${padded}`;

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
  return `${row.prefix}${padded}`;
}
