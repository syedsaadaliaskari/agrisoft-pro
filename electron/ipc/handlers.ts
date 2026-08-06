import { ipcMain } from "electron";
import { count } from "drizzle-orm";
import { IPC, type AppInfo, type DbStats, type LoginResult, type SessionUser } from "../../shared/ipc";
import { getDb, getDbPath } from "../db";
import { products, customers, vendors, sales, purchases, users } from "../db/schema";

const notReady = <T = never>(): { ok: false; error: string } => ({
  ok: false,
  error: "Not implemented yet — coming in a later build step",
});

export function registerIpcHandlers(appVersion: string, isDev: boolean): void {
  ipcMain.handle(IPC.PING, async () => "pong");

  ipcMain.handle(IPC.GET_APP_INFO, async (): Promise<AppInfo> => ({
    name: "Agri Soft Pro",
    version: appVersion,
    dbPath: getDbPath(),
    isDev,
  }));

  ipcMain.handle(IPC.AUTH_LOGIN, async (): Promise<LoginResult> => ({
    ok: false,
    error: "Auth arrives in Step 4",
  }));

  ipcMain.handle(IPC.AUTH_LOGOUT, async () => undefined);

  ipcMain.handle(IPC.AUTH_CURRENT_USER, async (): Promise<SessionUser | null> => null);

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

  const stubChannels = [
    IPC.DOCS_NEXT_NUMBER,
    IPC.UNITS_LIST,
    IPC.UNITS_CREATE,
    IPC.UNITS_UPDATE,
    IPC.UNITS_DELETE,
    IPC.CATEGORIES_LIST,
    IPC.CATEGORIES_CREATE,
    IPC.CATEGORIES_UPDATE,
    IPC.CATEGORIES_DELETE,
    IPC.TAXES_LIST,
    IPC.TAXES_CREATE,
    IPC.TAXES_UPDATE,
    IPC.TAXES_DELETE,
    IPC.DISCOUNTS_LIST,
    IPC.DISCOUNTS_CREATE,
    IPC.DISCOUNTS_UPDATE,
    IPC.DISCOUNTS_DELETE,
    IPC.ADDITIONS_LIST,
    IPC.ADDITIONS_CREATE,
    IPC.ADDITIONS_UPDATE,
    IPC.ADDITIONS_DELETE,
    IPC.PRODUCTS_LIST,
    IPC.PRODUCTS_GET,
    IPC.PRODUCTS_CREATE,
    IPC.PRODUCTS_UPDATE,
    IPC.PRODUCTS_DELETE,
    IPC.VARIANTS_LIST,
    IPC.VARIANTS_CREATE,
    IPC.VARIANTS_UPDATE,
    IPC.VARIANTS_DELETE,
    IPC.INVENTORY_LIST,
    IPC.INVENTORY_ADJUST,
    IPC.CUSTOMERS_LIST,
    IPC.CUSTOMERS_CREATE,
    IPC.CUSTOMERS_UPDATE,
    IPC.CUSTOMERS_DELETE,
    IPC.VENDORS_LIST,
    IPC.VENDORS_CREATE,
    IPC.VENDORS_UPDATE,
    IPC.VENDORS_DELETE,
    IPC.ACCOUNTS_LIST,
    IPC.ACCOUNTS_GET,
    IPC.VOUCHERS_POST,
    IPC.VOUCHERS_GET,
    IPC.VOUCHERS_CANCEL,
    IPC.LEDGER_ACCOUNT,
    IPC.LEDGER_PARTY,
    IPC.TX_RECEIVE,
    IPC.TX_PAY,
    IPC.TX_EXPENSE,
    IPC.TX_INCOME,
    IPC.PURCHASES_LIST,
    IPC.PURCHASES_GET,
    IPC.PURCHASES_LIST_BY_VENDOR,
    IPC.PURCHASES_CREATE,
    IPC.PURCHASES_DELETE,
    IPC.PURCHASE_RETURNS_LIST,
    IPC.PURCHASE_RETURNS_CREATE,
    IPC.SALES_LIST,
    IPC.SALES_GET,
    IPC.SALES_LIST_BY_CUSTOMER,
    IPC.SALES_CREATE,
    IPC.SALES_DELETE,
    IPC.SALE_RETURNS_LIST,
    IPC.SALE_RETURNS_CREATE,
    IPC.DASHBOARD_SUMMARY,
    IPC.REPORTS_SALES,
    IPC.REPORTS_PURCHASES,
    IPC.REPORTS_PROFIT,
    IPC.REPORTS_STOCK,
    IPC.REPORTS_TAX,
    IPC.REPORTS_DELETED,
    IPC.SETTINGS_GET_ALL,
    IPC.SETTINGS_UPDATE,
    IPC.USERS_LIST,
    IPC.USERS_CREATE,
    IPC.USERS_UPDATE,
    IPC.USERS_SET_PASSWORD,
    IPC.ROLES_LIST,
    IPC.PERMISSIONS_LIST,
    IPC.ROLES_SET_PERMISSIONS,
    IPC.AUDIT_LIST,
  ] as const;

  for (const channel of stubChannels) {
    ipcMain.handle(channel, async () => notReady());
  }
}
