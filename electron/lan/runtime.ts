import os from "os";
import {
  LAN_DEFAULT_PORT,
  type LanConfig,
  type LanDiscoveredServer,
  type LanRuntimeStatus,
} from "../../shared/lan";
import { loadLanConfig } from "./config";

let runtime: {
  active: boolean;
  connected: boolean;
  message: string;
  lastError: string | null;
  clientTarget: string | null;
} = {
  active: false,
  connected: false,
  message: "This PC alone (offline)",
  lastError: null,
  clientTarget: null,
};

export function listLocalIPv4(): string[] {
  const out: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue;
    for (const e of entries) {
      if (e.family === "IPv4" && !e.internal) out.push(e.address);
    }
  }
  return out;
}

export function setLanRuntime( partial: Partial<typeof runtime>): void {
  runtime = { ...runtime, ...partial };
}

export function getLanRuntimeStatus(config?: LanConfig): LanRuntimeStatus {
  const cfg = config ?? loadLanConfig();
  return {
    mode: cfg.mode,
    config: {
      ...cfg,
      // Never hide key from the main PC UI — cashiers need it. Client key is local.
    },
    active: runtime.active,
    message: runtime.message,
    localAddresses: listLocalIPv4(),
    serverPort: cfg.mode === "server" ? cfg.serverPort || LAN_DEFAULT_PORT : null,
    clientTarget: runtime.clientTarget,
    connected: runtime.connected,
    lastError: runtime.lastError,
  };
}
