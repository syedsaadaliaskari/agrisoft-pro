import { ipcMain } from "electron";
import {
  IPC,
  type ActionResult,
  type SettingsMap,
  type SettingsUpdateInput,
  type AuditListQuery,
  type AuditLogRow,
} from "../../shared/ipc";
import { getDb } from "../db";
import { getSettingsMap, updateSettings } from "../db/settings";
import { listAuditLogs } from "../db/audit";
import { writeAuditLog } from "../db/audit";
import { PermissionError, requirePermission } from "./session";

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

function asError(err: unknown): string {
  if (err instanceof PermissionError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unexpected settings error";
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET_ALL, async (): Promise<ActionResult<SettingsMap>> => {
    try {
      requirePermission("settings.manage");
      return ok(getSettingsMap(getDb()));
    } catch (err) {
      return fail(asError(err));
    }
  });

  ipcMain.handle(
    IPC.SETTINGS_UPDATE,
    async (_e, input: SettingsUpdateInput): Promise<ActionResult<SettingsMap>> => {
      try {
        const session = requirePermission("settings.manage");
        const map = updateSettings(getDb(), input ?? {});
        writeAuditLog(getDb(), {
          userId: session.id,
          action: "update",
          module: "settings",
          details: "Updated shop settings",
        });
        return ok(map);
      } catch (err) {
        return fail(asError(err));
      }
    }
  );

  ipcMain.handle(
    IPC.AUDIT_LIST,
    async (_e, query?: AuditListQuery): Promise<ActionResult<AuditLogRow[]>> => {
      try {
        requirePermission("settings.manage");
        return ok(listAuditLogs(getDb(), query ?? {}));
      } catch (err) {
        return fail(asError(err));
      }
    }
  );
}
