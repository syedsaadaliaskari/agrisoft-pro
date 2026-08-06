import type { ElectronAPI, AppInfo, DbStats, LoginResult, SessionUser, ActionResult } from "@shared/ipc";

declare global {
  interface Window {
    api?: ElectronAPI;
  }
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && typeof window.api !== "undefined";
}

/** Browser mock so `next dev` works without Electron */
function createBrowserMock(): ElectronAPI {
  const notReady = <T = never>(): ActionResult<T> => ({
    ok: false,
    error: "Open via Electron (`npm run dev`) for full IPC",
  });

  const mock: Partial<ElectronAPI> = {
    ping: async () => "pong-browser",
    getAppInfo: async (): Promise<AppInfo> => ({
      name: "Agri Soft Pro",
      version: "0.1.0-browser",
      dbPath: "(browser — no SQLite)",
      isDev: true,
    }),
    login: async (): Promise<LoginResult> => ({ ok: false, error: "Auth arrives in Step 4" }),
    logout: async () => undefined,
    getCurrentUser: async (): Promise<SessionUser | null> => null,
    getDbStats: async (): Promise<DbStats> => ({
      products: 0,
      customers: 0,
      vendors: 0,
      sales: 0,
      purchases: 0,
      users: 0,
    }),
  };

  return new Proxy(mock as ElectronAPI, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      return () => Promise.resolve(notReady());
    },
  });
}

export function getApi(): ElectronAPI {
  if (typeof window !== "undefined" && window.api) {
    return window.api;
  }
  return createBrowserMock();
}
