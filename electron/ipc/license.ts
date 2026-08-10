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
  createLicense,
  deleteLicense,
  expireTrialNow,
  getLicenseStatus,
  listLicenses,
} from "../db/license";
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
      input: { name: string; installId: string; plan: LicensePlan; notes?: string | null }
    ): Promise<ActionResult<LicenseRow>> =>
      guarded(
        () => requireAnyPermission("license.manage", "platform.view"),
        async () => createLicense(getDb(), input)
      )
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
}
