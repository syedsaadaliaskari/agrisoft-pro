import { registerHandler } from "./register";
import {
  IPC,
  type ActionResult,
  type SettingsMap,
  type SettingsUpdateInput,
  type AuditListQuery,
  type AuditListResult,
} from "../../shared/ipc";
import { getDb } from "../db";
import { getSettingsMapWithBranding, updateSettings } from "../db/settings";
import { listAuditLogs, writeAuditLog } from "../db/audit";
import { clearShopLogo, saveShopLogoFromDataUrl } from "../db/branding";
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
  registerHandler(IPC.SETTINGS_GET_ALL, async (): Promise<ActionResult<SettingsMap>> => {
    try {
      requirePermission("settings.manage");
      return ok(getSettingsMapWithBranding(getDb()));
    } catch (err) {
      return fail(asError(err));
    }
  });

  registerHandler(
    IPC.SETTINGS_UPDATE,
    async (_e, input: SettingsUpdateInput): Promise<ActionResult<SettingsMap>> => {
      try {
        const session = requirePermission("settings.manage");
        updateSettings(getDb(), input ?? {});
        writeAuditLog(getDb(), {
          userId: session.id,
          action: "update",
          module: "settings",
          details: "Updated shop settings",
        });
        return ok(getSettingsMapWithBranding(getDb()));
      } catch (err) {
        return fail(asError(err));
      }
    }
  );

  registerHandler(
    IPC.SETTINGS_SET_LOGO,
    async (_e, dataUrl: string): Promise<ActionResult<SettingsMap>> => {
      try {
        const session = requirePermission("settings.manage");
        const result = saveShopLogoFromDataUrl(dataUrl ?? "");
        if (!result.ok) return fail(result.error);
        writeAuditLog(getDb(), {
          userId: session.id,
          action: "update",
          module: "settings",
          details: "Updated shop logo branding",
        });
        return ok(getSettingsMapWithBranding(getDb()));
      } catch (err) {
        return fail(asError(err));
      }
    }
  );

  registerHandler(IPC.SETTINGS_CLEAR_LOGO, async (): Promise<ActionResult<SettingsMap>> => {
    try {
      const session = requirePermission("settings.manage");
      clearShopLogo();
      writeAuditLog(getDb(), {
        userId: session.id,
        action: "update",
        module: "settings",
        details: "Removed shop logo branding",
      });
      return ok(getSettingsMapWithBranding(getDb()));
    } catch (err) {
      return fail(asError(err));
    }
  });

  registerHandler(
    IPC.AUDIT_LIST,
    async (_e, query?: AuditListQuery): Promise<ActionResult<AuditListResult>> => {
      try {
        requirePermission("settings.manage");
        return ok(listAuditLogs(getDb(), query ?? {}));
      } catch (err) {
        return fail(asError(err));
      }
    }
  );
}
