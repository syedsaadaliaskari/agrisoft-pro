import { ipcMain } from "electron";
import bcrypt from "bcryptjs";
import { eq, count } from "drizzle-orm";
import { IPC, type SessionUser, type LoginResult, type DbStats, type AppInfo } from "../../shared/ipc";
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
} from "../db/schema";
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
import { getCurrentSession, setCurrentSession } from "./session";
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

  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    roleId: row.roleId,
    roleName: row.roleName,
    permissions: perms.map((p) => p.code),
  };
}

export function registerIpcHandlers(appVersion: string, isDev: boolean): void {
  ipcMain.handle(IPC.PING, async () => "pong");

  ipcMain.handle(IPC.GET_APP_INFO, async (): Promise<AppInfo> => ({
    name: "Agri Soft Pro",
    version: appVersion,
    dbPath: getDbPath(),
    isDev,
  }));

  ipcMain.handle(IPC.AUTH_LOGIN, async (_e, username: string, password: string): Promise<LoginResult> => {
    const db = getDb();
    const user = db.select().from(users).where(eq(users.username, username)).get();

    if (!user || !user.isActive) {
      return { ok: false, error: "Invalid username or password" };
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
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

  ipcMain.handle(IPC.AUTH_LOGOUT, async () => {
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

  ipcMain.handle(IPC.AUTH_CURRENT_USER, async (): Promise<SessionUser | null> => getCurrentSession());

  ipcMain.handle(IPC.DB_STATS, async (): Promise<DbStats> => {
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
}
