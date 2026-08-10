import { randomUUID } from "crypto";
import type { Db } from "./index";
import { auditLogs, users } from "./schema";
import { desc, eq } from "drizzle-orm";
import type { AuditListQuery, AuditListResult, AuditLogRow } from "../../shared/ipc";

export type AuditWriteInput = {
  userId?: string | null;
  action: string;
  module: string;
  entityId?: string | null;
  details?: string | null;
};

export function writeAuditLog(db: Db, input: AuditWriteInput): void {
  db.insert(auditLogs)
    .values({
      id: randomUUID(),
      userId: input.userId ?? null,
      action: input.action,
      module: input.module,
      entityId: input.entityId ?? null,
      details: input.details ?? null,
      createdAt: new Date().toISOString(),
    })
    .run();
}

export function listAuditLogs(db: Db, query: AuditListQuery = {}): AuditListResult {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 1000);
  const offset = Math.max(query.offset ?? 0, 0);
  const fromDate = query.fromDate?.trim() || null;
  const toDate = query.toDate?.trim() || null;
  const module = query.module?.trim() || null;
  const action = query.action?.trim() || null;
  const search = query.search?.trim().toLowerCase() || null;

  const rows = db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      username: users.username,
      action: auditLogs.action,
      module: auditLogs.module,
      entityId: auditLogs.entityId,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .all();

  const filtered = rows.filter((r) => {
    if (module && r.module !== module) return false;
    if (action && r.action !== action) return false;
    const day = r.createdAt.slice(0, 10);
    if (fromDate && day < fromDate) return false;
    if (toDate && day > toDate) return false;
    if (search) {
      const hay = `${r.username ?? ""} ${r.module} ${r.action} ${r.details ?? ""} ${r.entityId ?? ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const mapped: AuditLogRow[] = filtered.slice(offset, offset + limit).map((r) => ({
    id: r.id,
    userId: r.userId,
    username: r.username,
    action: r.action,
    module: r.module,
    entityId: r.entityId,
    details: r.details,
    createdAt: r.createdAt,
  }));

  return {
    rows: mapped,
    total: filtered.length,
    ...listAuditFacets(db),
  };
}

/** Distinct modules/actions for filter dropdowns */
export function listAuditFacets(db: Db): { modules: string[]; actions: string[] } {
  const rows = db
    .select({ module: auditLogs.module, action: auditLogs.action })
    .from(auditLogs)
    .all();
  const modules = [...new Set(rows.map((r) => r.module))].sort();
  const actions = [...new Set(rows.map((r) => r.action))].sort();
  return { modules, actions };
}
