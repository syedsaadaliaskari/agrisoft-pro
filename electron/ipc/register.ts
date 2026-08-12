import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { IPC, type LoginResult, type SessionUser, type ActionResult } from "../../shared/ipc";
import { getLanMode, invokeLanClient } from "../lan/client-bridge";
import { setCurrentSession } from "./session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (event: IpcMainInvokeEvent, ...args: any[]) => any;

const handlers = new Map<string, AnyHandler>();
const localOnly = new Set<string>();

/** Channels that always run on this PC (printer, file dialogs, LAN setup). */
export const LOCAL_ONLY_CHANNELS = new Set<string>([
  IPC.PING,
  IPC.GET_APP_INFO,
  IPC.APP_PRINT_HTML,
  IPC.APP_SAVE_FILE,
  IPC.BACKUP_PICK_FILE,
  IPC.BACKUP_OPEN_FOLDER,
]);

export function isLocalOnlyChannel(channel: string): boolean {
  return localOnly.has(channel) || LOCAL_ONLY_CHANNELS.has(channel) || channel.startsWith("lan:");
}

export function getRegisteredHandler(channel: string): AnyHandler | undefined {
  return handlers.get(channel);
}

export function listLanExposableChannels(): string[] {
  return [...handlers.keys()].filter((c) => !isLocalOnlyChannel(c));
}

function mirrorClientSession(channel: string, result: unknown): void {
  if (channel === IPC.AUTH_LOGIN) {
    const login = result as LoginResult;
    if (login?.ok) setCurrentSession(login.user);
    return;
  }
  if (channel === IPC.AUTH_LOGOUT) {
    setCurrentSession(null);
    return;
  }
  if (channel === IPC.AUTH_CURRENT_USER) {
    setCurrentSession((result as SessionUser | null) ?? null);
    return;
  }
  if (channel === IPC.AUTH_VENDOR_UNLOCK) {
    const res = result as ActionResult<SessionUser>;
    if (res?.ok) setCurrentSession(res.data);
  }
}

/**
 * Register an IPC handler that can also be dispatched by the LAN server,
 * and automatically proxied to the main PC when this install is in client mode.
 */
export function registerHandler(
  channel: string,
  listener: AnyHandler,
  options?: { localOnly?: boolean }
): void {
  if (options?.localOnly) localOnly.add(channel);
  handlers.set(channel, listener);

  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    if (!isLocalOnlyChannel(channel) && getLanMode() === "client") {
      if (channel === IPC.BACKUP_RESTORE) {
        return {
          ok: false,
          error: "Restore backup only on the main PC",
        };
      }
      const result = await invokeLanClient(channel, args);
      mirrorClientSession(channel, result);
      return result;
    }
    return listener(event, ...args);
  });
}

/** Invoke a registered handler without going through Electron IPC (LAN server). */
export async function dispatchLocalHandler(channel: string, args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`Unknown channel: ${channel}`);
  }
  if (isLocalOnlyChannel(channel)) {
    throw new Error(`Channel not available over LAN: ${channel}`);
  }
  return handler(null as unknown as IpcMainInvokeEvent, ...args);
}
