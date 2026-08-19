import { ipcMain, type IpcMainInvokeEvent } from "electron";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (event: IpcMainInvokeEvent, ...args: any[]) => any;

/**
 * Register an IPC handler on the main process.
 * `localOnly` is kept for call-site compatibility (no longer used for LAN proxying).
 */
export function registerHandler(
  channel: string,
  listener: AnyHandler,
  _options?: { localOnly?: boolean }
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, listener);
}
