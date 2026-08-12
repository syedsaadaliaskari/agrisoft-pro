/** LAN multi-PC mode — shared types/constants (no Node APIs). */

export const LAN_DEFAULT_PORT = 4747;
export const LAN_DISCOVERY_PORT = 4748;
export const LAN_MAGIC = "agri-soft-pro-lan";
export const LAN_PROTOCOL_VERSION = 1;

export type LanMode = "standalone" | "server" | "client";

export type LanConfig = {
  mode: LanMode;
  /** Friendly name shown in discovery (server). */
  displayName: string;
  /** HTTP API port when this PC is the main/server. */
  serverPort: number;
  /** Secret cashiers must enter to connect. */
  accessKey: string;
  /** Client: main PC host/IP. */
  clientHost: string;
  /** Client: main PC port. */
  clientPort: number;
  /** Client: access key for the main PC. */
  clientAccessKey: string;
};

export type LanDiscoveredServer = {
  name: string;
  host: string;
  port: number;
  version: number;
  lastSeenAt: string;
};

export type LanRuntimeStatus = {
  mode: LanMode;
  config: LanConfig;
  /** Server listening / client reachable. */
  active: boolean;
  /** Human-readable state. */
  message: string;
  /** Local IPv4 addresses (for main PC display). */
  localAddresses: string[];
  serverPort: number | null;
  clientTarget: string | null;
  connected: boolean;
  lastError: string | null;
};

export type LanConfigUpdateInput = {
  mode?: LanMode;
  displayName?: string;
  serverPort?: number;
  accessKey?: string;
  clientHost?: string;
  clientPort?: number;
  clientAccessKey?: string;
  /** Regenerate a new access key (server). */
  regenerateAccessKey?: boolean;
};

export function defaultLanConfig(): LanConfig {
  return {
    mode: "standalone",
    displayName: "Main PC",
    serverPort: LAN_DEFAULT_PORT,
    accessKey: "",
    clientHost: "",
    clientPort: LAN_DEFAULT_PORT,
    clientAccessKey: "",
  };
}
