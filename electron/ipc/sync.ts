import { registerHandler } from "./register";
import { IPC, type ActionResult } from "../../shared/ipc";
import {
  getCloudSyncStatus,
  publishShopCloudMeta,
  recordSyncError,
  runShopCloudSync,
  type CloudSyncResult,
  type CloudSyncStatus,
} from "../sync/shop";
import { SyncError } from "../sync/client";
import { getDb } from "../db";
import { settings } from "../db/schema";
import { eq } from "drizzle-orm";

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

export function registerSyncHandlers() {
  registerHandler(IPC.CLOUD_SYNC_STATUS, async (): Promise<ActionResult<CloudSyncStatus>> => {
    try {
      const status = getCloudSyncStatus();
      if (status.configured && status.tenantId) {
        const shopName =
          getDb().select().from(settings).where(eq(settings.key, "shop_name")).get()?.value?.trim() ||
          "Shop";
        try {
          await publishShopCloudMeta(status.tenantId, shopName);
        } catch {
          /* SQL not applied yet, or offline */
        }
      }
      return ok(getCloudSyncStatus());
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Failed to read sync status");
    }
  });

  registerHandler(IPC.CLOUD_SYNC_NOW, async (): Promise<ActionResult<CloudSyncResult>> => {
    try {
      const result = await runShopCloudSync();
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
