import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { productVariants, stockMovements } from "../db/schema";
import { supabaseUpsert, tenantId } from "./client";
import { fetchTenantRows, type SyncCounts } from "./pull";

export async function syncStockMovements(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const local = db.select().from(stockMovements).all();
  const pushed = await supabaseUpsert(
    "stock_movements",
    local.map((row) => ({
      id: row.id,
      tenant_id: tid,
      variant_id: row.variantId,
      movement_type: row.movementType,
      quantity: row.quantity,
      reference_type: row.referenceType,
      reference_id: row.referenceId,
      notes: row.notes,
      created_by: null,
      created_at: row.createdAt,
      updated_at: row.createdAt,
      deleted_at: null,
    }))
  );

  let pulled = 0;
  for (const row of await fetchTenantRows<{
    id: string;
    variant_id: string;
    movement_type: string;
    quantity: number;
    reference_type: string | null;
    reference_id: string | null;
    notes: string | null;
    created_at: string;
  }>("stock_movements")) {
    if (!db.select().from(productVariants).where(eq(productVariants.id, row.variant_id)).get()) continue;
    const existing = db.select().from(stockMovements).where(eq(stockMovements.id, row.id)).get();
    const mapped = {
      id: row.id,
      variantId: row.variant_id,
      movementType: row.movement_type,
      quantity: Number(row.quantity || 0),
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      notes: row.notes,
      createdBy: null as string | null,
      createdAt: row.created_at,
    };
    if (!existing) {
      db.insert(stockMovements).values(mapped).run();
      pulled += 1;
    }
  }

  return { pushed, pulled };
}
