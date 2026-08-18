import { registerHandler } from "./register";
import { IPC, type ActionResult } from "../../shared/ipc";
import { loadLanConfig } from "../lan/config";
import {
  getCloudSyncStatus,
  recordSyncError,
  runCustomerCloudSync,
  type CloudSyncResult,
  type CloudSyncStatus,
} from "../sync/customers";
import { SyncError } from "../sync/client";

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

function guardNotLanClient(): string | null {
  try {
    if (loadLanConfig().mode === "client") {
      return "Cloud sync runs on the main / standalone PC only";
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function registerSyncHandlers() {
  registerHandler(IPC.CLOUD_SYNC_STATUS, async (): Promise<ActionResult<CloudSyncStatus>> => {
    try {
      return ok(getCloudSyncStatus());
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Failed to read sync status");
    }
  });

  registerHandler(IPC.CLOUD_SYNC_NOW, async (): Promise<ActionResult<CloudSyncResult>> => {
    const blocked = guardNotLanClient();
    if (blocked) return fail(blocked);
    try {
      const result = await runCustomerCloudSync();
      return ok(result);
    } catch (err) {
      const message = err instanceof SyncError || err instanceof Error ? err.message : "Sync failed";
      try {
        recordSyncError(message);
      } catch {
        /* ignore */
      }
      return fail(message);
    }
  });
}
