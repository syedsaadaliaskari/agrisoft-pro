import { ipcMain } from "electron";
import {
  IPC,
  type ActionResult,
  type LicensePlan,
  type LicenseRow,
  type LicenseStatus,
} from "../../shared/ipc";
import { getDb } from "../db";
import {
  applyActivationCode,
  createLicense,
  deleteLicense,
  expireTrialNow,
  getLicenseStatus,
  listLicenses,
  lockThisInstallNow,
} from "../db/license";
import { enqueueLicenseActivated, flushN8nQueue } from "../db/n8n";
import { PermissionError, requireAnyPermission } from "./session";

type Handler<T> = () => T | Promise<T>;

async function guarded<T>(check: () => void, fn: Handler<T>): Promise<ActionResult<T>> {
  try {
    check();
    return { ok: true, data: await fn() };
  } catch (err) {
    const message =
      err instanceof PermissionError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Request failed";
    return { ok: false, error: message };
  }
}

let isDevFlag = false;

export function registerLicenseHandlers(isDev: boolean): void {
  isDevFlag = isDev;

  ipcMain.handle(IPC.LICENSE_STATUS, async (): Promise<ActionResult<LicenseStatus>> => {
    try {
      return { ok: true, data: getLicenseStatus(getDb(), isDevFlag) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "License status failed" };
    }
  });

  ipcMain.handle(IPC.LICENSE_LIST, async (): Promise<ActionResult<LicenseRow[]>> =>
    guarded(
      () => requireAnyPermission("license.view", "license.manage", "platform.view"),
      async () => listLicenses(getDb())
    )
  );

  ipcMain.handle(
    IPC.LICENSE_CREATE,
    async (
      _e,
      input: {
        name: string;
        installId: string;
        plan: LicensePlan;
        notes?: string | null;
        phone?: string | null;
      }
    ): Promise<ActionResult<LicenseRow>> =>
      guarded(() => requireAnyPermission("license.manage", "platform.view"), async () => {
        const row = createLicense(getDb(), input);
        enqueueLicenseActivated(getDb(), row, input.phone ?? row.phone);
        // Fire-and-forget flush; offline keeps item in queue
        void flushN8nQueue(getDb());
        return row;
      })
  );

  ipcMain.handle(IPC.LICENSE_DELETE, async (_e, id: string): Promise<ActionResult> =>
    guarded(() => requireAnyPermission("license.manage", "platform.view"), async () => {
      deleteLicense(getDb(), id);
    })
  );

  ipcMain.handle(IPC.LICENSE_EXPIRE_TRIAL, async (): Promise<ActionResult<LicenseStatus>> =>
    guarded(() => requireAnyPermission("license.manage", "platform.view"), async () => {
      expireTrialNow(getDb());
      return getLicenseStatus(getDb(), isDevFlag);
    })
  );

  ipcMain.handle(IPC.LICENSE_LOCK_NOW, async (): Promise<ActionResult<LicenseStatus>> =>
    guarded(() => requireAnyPermission("license.manage", "platform.view"), async () =>
      lockThisInstallNow(getDb())
    )
  );

  // Public: locked customers paste the code you send on WhatsApp (no login required).
  ipcMain.handle(
    IPC.LICENSE_APPLY_CODE,
    async (_e, code: string): Promise<ActionResult<LicenseStatus>> => {
      try {
        return { ok: true, data: applyActivationCode(getDb(), String(code ?? "")) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Activation failed" };
      }
    }
  );
}
