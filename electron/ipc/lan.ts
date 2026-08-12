import { IPC, type ActionResult } from "../../shared/ipc";
import type {
  LanConfigUpdateInput,
  LanDiscoveredServer,
  LanRuntimeStatus,
} from "../../shared/lan";
import { registerHandler } from "./register";
import {
  getLanStatus,
  listLanDiscoveries,
  saveAndApplyLanConfig,
  testLanClientConnection,
} from "../lan";
import { startDiscoveryListen } from "../lan/discover";
import { listLocalIPv4 } from "../lan/runtime";

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

function wrap<T>(fn: () => Promise<T> | T): Promise<ActionResult<T>> {
  return Promise.resolve()
    .then(() => fn())
    .then((data) => ok(data))
    .catch((err) =>
      fail(err instanceof Error ? err.message : "LAN operation failed")
    );
}

/**
 * LAN config is local to this PC (lan-config.json). No login required so a
 * cashier can still switch back to “This PC alone” if the main PC is offline.
 */
export function registerLanHandlers(): void {
  registerHandler(
    IPC.LAN_STATUS,
    async (): Promise<ActionResult<LanRuntimeStatus>> => wrap(() => getLanStatus()),
    { localOnly: true }
  );

  registerHandler(
    IPC.LAN_UPDATE,
    async (_e, input: LanConfigUpdateInput): Promise<ActionResult<LanRuntimeStatus>> =>
      wrap(() => saveAndApplyLanConfig(input ?? {})),
    { localOnly: true }
  );

  registerHandler(
    IPC.LAN_TEST,
    async (
      _e,
      input?: { host?: string; port?: number; accessKey?: string }
    ): Promise<ActionResult<{ name: string }>> =>
      wrap(async () => {
        const res = await testLanClientConnection(input);
        if (!res.ok) throw new Error(res.error);
        return { name: res.name };
      }),
    { localOnly: true }
  );

  registerHandler(
    IPC.LAN_DISCOVER,
    async (): Promise<ActionResult<LanDiscoveredServer[]>> =>
      wrap(() => {
        startDiscoveryListen();
        return listLanDiscoveries();
      }),
    { localOnly: true }
  );

  registerHandler(
    IPC.LAN_LOCAL_ADDRESSES,
    async (): Promise<ActionResult<string[]>> => wrap(() => listLocalIPv4()),
    { localOnly: true }
  );
}
