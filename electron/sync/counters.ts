import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { documentCounters } from "../db/schema";
import { supabaseUpsert, tenantId } from "./client";
import { fetchTenantRows, type SyncCounts } from "./pull";
import { isNewer } from "./store";

export async function syncDocumentCounters(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const local = db.select().from(documentCounters).all();
  const pushed = await supabaseUpsert(
    "document_counters",
    local.map((row) => ({
      id: row.id,
      tenant_id: tid,
      doc_type: row.docType,
      prefix: row.prefix,
      next_number: row.nextNumber,
      pad_length: row.padLength,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );

  let pulled = 0;
  for (const row of await fetchTenantRows<{
    id: string;
    doc_type: string;
    prefix: string;
    next_number: number;
    pad_length: number;
    created_at: string;
    updated_at: string;
  }>("document_counters")) {
    const existing = db.select().from(documentCounters).where(eq(documentCounters.id, row.id)).get();
    const mapped = {
      id: row.id,
      docType: row.doc_type,
      prefix: row.prefix,
      nextNumber: Number(row.next_number || 1),
      padLength: Number(row.pad_length || 5),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      // Avoid unique doc_type clash if same type exists with different id
      const byType = db
        .select()
        .from(documentCounters)
        .where(eq(documentCounters.docType, row.doc_type))
        .get();
      if (byType) {
        if (isNewer(row.updated_at, byType.updatedAt) && row.next_number > byType.nextNumber) {
          db.update(documentCounters)
            .set({ nextNumber: mapped.nextNumber, updatedAt: mapped.updatedAt })
            .where(eq(documentCounters.id, byType.id))
            .run();
          pulled += 1;
        }
        continue;
      }
      db.insert(documentCounters).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(documentCounters)
        .set({
          prefix: mapped.prefix,
          nextNumber: Math.max(existing.nextNumber, mapped.nextNumber),
          padLength: mapped.padLength,
          updatedAt: mapped.updatedAt,
        })
        .where(eq(documentCounters.id, row.id))
        .run();
      pulled += 1;
    }
  }

  return { pushed, pulled };
}
