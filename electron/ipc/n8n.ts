import { ipcMain } from "electron";
import {
  IPC,
  type ActionResult,
} from "../../shared/ipc";
import { getDb } from "../db";
import {
  enqueueTestMessage,
  flushN8nQueue,
  getN8nConfig,
  runN8nAutomationPass,
} from "../db/n8n";
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

export function registerN8nHandlers(): void {
  ipcMain.handle(IPC.N8N_STATUS, async (): Promise<ActionResult<{ enabled: boolean; webhookUrl: string; paymentDaysBefore: number; minDueAmount: number }>> =>
    guarded(() => requireAnyPermission("license.manage", "settings.manage", "platform.view"), async () =>
      getN8nConfig(getDb())
    )
  );

  ipcMain.handle(IPC.N8N_FLUSH, async (): Promise<ActionResult<{ sent: number; remaining: number; enqueued: number; error?: string }>> =>
    guarded(() => requireAnyPermission("license.manage", "settings.manage", "platform.view"), async () =>
      runN8nAutomationPass(getDb())
    )
  );

  ipcMain.handle(
    IPC.N8N_TEST,
    async (_e, to?: string | null): Promise<ActionResult<{ sent: number; remaining: number; error?: string }>> =>
      guarded(() => requireAnyPermission("license.manage", "settings.manage", "platform.view"), async () => {
        enqueueTestMessage(getDb(), to);
        return flushN8nQueue(getDb());
      })
  );
}
