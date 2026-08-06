import { randomUUID } from "crypto";
import type { Db } from "./index";
import { auditLogs, users } from "./schema";
import { desc, eq } from "drizzle-orm";
import type { AuditListQuery, AuditLogRow } from "../../shared/ipc";

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

export function listAuditLogs(db: Db, query: AuditListQuery = {}): AuditLogRow[] {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
  const fromDate = query.fromDate?.trim() || null;
  const toDate = query.toDate?.trim() || null;
  const module = query.module?.trim() || null;

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

  return rows
    .filter((r) => {
      if (module && r.module !== module) return false;
      const day = r.createdAt.slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    })
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      username: r.username,
      action: r.action,
      module: r.module,
      entityId: r.entityId,
      details: r.details,
      createdAt: r.createdAt,
    }));
}
