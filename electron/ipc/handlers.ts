import { registerHandler } from "./register";
import bcrypt from "bcryptjs";
import { eq, count, sql } from "drizzle-orm";
import { IPC, type SessionUser, type LoginResult, type DbStats, type AppInfo, type ActionResult } from "../../shared/ipc";
import { getDb, getDbPath } from "../db";
import {
  users,
  roles,
  permissions,
  rolePermissions,
  products,
  customers,
  vendors,
  sales,
  purchases,
  settings,
} from "../db/schema";
import { changeOwnPassword, unlockVendorSuperAdmin, UsersError } from "../db/users";
import { registerMasterHandlers } from "./masters";
import { registerProductHandlers } from "./products";
import { registerPartyHandlers } from "./parties";
import { registerAccountHandlers } from "./accounts";
import { registerSalesHandlers } from "./sales";
import { registerPurchaseHandlers } from "./purchases";
import { registerLedgerHandlers } from "./ledger";
import { registerDashboardHandlers } from "./dashboard";
import { registerSettingsHandlers } from "./settings";
import { registerUserHandlers } from "./users";
import { registerCompanyHandlers } from "./companies";
import { registerBackupHandlers } from "./backup";
import { registerLicenseHandlers } from "./license";
import { registerN8nHandlers } from "./n8n";
import { registerSyncHandlers } from "./sync";
import { getCurrentSession, setCurrentSession, PermissionError, requireSession } from "./session";
import { writeAuditLog } from "../db/audit";

function loadUserSession(userId: string): SessionUser | null {
  const db = getDb();
  const row = db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      roleId: users.roleId,
      roleName: roles.name,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId))
    .get();

  if (!row) return null;

  const perms = db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, row.roleId))
    .all();

  const mustChange = false;

  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    roleId: row.roleId,
    roleName: row.roleName,
    permissions: perms.map((p) => p.code),
    mustChangePassword: mustChange,
  };
}

export function registerIpcHandlers(appVersion: string, isDev: boolean): void {
  registerHandler(IPC.PING, async () => "pong");

  registerHandler(IPC.GET_APP_INFO, async (): Promise<AppInfo> => ({
    name: "Agri Soft Pro",
    version: appVersion,
    dbPath: getDbPath(),
    isDev,
  }));

  registerHandler(IPC.AUTH_LOGIN, async (_e, username: string, password: string): Promise<LoginResult> => {
    const db = getDb();
    const normalized = String(username ?? "").trim().toLowerCase();
    const user = db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = ${normalized}`)
      .get();

    if (!user || !user.isActive) {
      return { ok: false, error: "Invalid username or password" };
    }

    const valid = await bcrypt.compare(String(password ?? ""), user.passwordHash);
    if (!valid) {
      return { ok: false, error: "Invalid username or password" };
    }

    db.update(users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(users.id, user.id))
      .run();

    const session = loadUserSession(user.id);
    if (!session) {
      return { ok: false, error: "Failed to load user session" };
    }

    setCurrentSession(session);
    writeAuditLog(db, {
      userId: session.id,
      action: "login",
      module: "auth",
      entityId: session.id,
      details: `User ${session.username} signed in`,
    });
    return { ok: true, user: session };
  });

  registerHandler(IPC.AUTH_LOGOUT, async () => {
    const session = getCurrentSession();
    if (session) {
      writeAuditLog(getDb(), {
        userId: session.id,
        action: "logout",
        module: "auth",
        entityId: session.id,
        details: `User ${session.username} signed out`,
      });
    }
    setCurrentSession(null);
  });

  registerHandler(IPC.AUTH_CURRENT_USER, async (): Promise<SessionUser | null> => {
    const session = getCurrentSession();
    if (!session) return null;
    // Refresh permissions from DB (RBAC / ensurePermissions may have changed on boot)
    const fresh = loadUserSession(session.id);
    if (fresh) setCurrentSession(fresh);
    return fresh;
  });

  registerHandler(
    IPC.AUTH_CHANGE_PASSWORD,
    async (_e, currentPassword: string, newPassword: string): Promise<ActionResult> => {
      try {
        const session = requireSession();
        await changeOwnPassword(getDb(), session.id, currentPassword ?? "", newPassword ?? "");
        const db = getDb();
        const flag = db.select().from(settings).where(eq(settings.key, "must_change_password")).get();
        if (flag) {
          db.update(settings)
            .set({ value: "0", updatedAt: new Date().toISOString() })
            .where(eq(settings.id, flag.id))
            .run();
        }
        const refreshed = loadUserSession(session.id);
        if (refreshed) setCurrentSession(refreshed);
        return { ok: true, data: undefined };
      } catch (err) {
        const message =
          err instanceof PermissionError || err instanceof UsersError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not change password";
        return { ok: false, error: message };
      }
    }
  );

  registerHandler(
    IPC.AUTH_VENDOR_UNLOCK,
    async (_e, code: string): Promise<ActionResult<SessionUser>> => {
      try {
        const session = requireSession();
        const next = unlockVendorSuperAdmin(getDb(), session.id, String(code ?? ""));
        setCurrentSession(next);
        return { ok: true, data: next };
      } catch (err) {
        const message =
          err instanceof PermissionError || err instanceof UsersError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Vendor unlock failed";
        return { ok: false, error: message };
      }
    }
  );

  registerHandler(IPC.DB_STATS, async (): Promise<DbStats> => {
    const db = getDb();
    const one = (
      table:
        | typeof products
        | typeof customers
        | typeof vendors
        | typeof sales
        | typeof purchases
        | typeof users
    ) => db.select({ value: count() }).from(table).get()?.value ?? 0;

    return {
      products: one(products),
      customers: one(customers),
      vendors: one(vendors),
      sales: one(sales),
      purchases: one(purchases),
      users: one(users),
    };
  });

  registerMasterHandlers();
  registerProductHandlers();
  registerPartyHandlers();
  registerAccountHandlers();
  registerSalesHandlers();
  registerPurchaseHandlers();
  registerLedgerHandlers();
  registerDashboardHandlers();
  registerSettingsHandlers();
  registerUserHandlers();
  registerCompanyHandlers();
  registerBackupHandlers();
  registerLicenseHandlers(isDev);
  registerN8nHandlers();
  registerSyncHandlers();
}
