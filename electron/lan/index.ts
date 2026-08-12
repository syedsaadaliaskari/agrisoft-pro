import type { LanConfigUpdateInput, LanRuntimeStatus, LanDiscoveredServer } from "../../shared/lan";
import { loadLanConfig, updateLanConfig } from "./config";
import { startLanServer, stopLanServer } from "./server";
import { clearLanClientSession, probeLanServer } from "./client";
import {
  getDiscoveredServers,
  startDiscoveryListen,
  stopDiscoveryListen,
} from "./discover";
import { getLanRuntimeStatus, setLanRuntime } from "./runtime";

export async function applyLanModeFromConfig(): Promise<LanRuntimeStatus> {
  const cfg = loadLanConfig();
  clearLanClientSession();
  await stopLanServer();
  stopDiscoveryListen();

  if (cfg.mode === "standalone") {
    setLanRuntime({
      active: false,
      connected: false,
      message: "This PC alone (offline)",
      lastError: null,
      clientTarget: null,
    });
    return getLanRuntimeStatus(cfg);
  }

  if (cfg.mode === "server") {
    try {
      await startLanServer();
    } catch (err) {
      setLanRuntime({
        active: false,
        connected: false,
        message: "Could not start LAN server",
        lastError: err instanceof Error ? err.message : "Listen failed",
      });
    }
    return getLanRuntimeStatus();
  }

  // client
  startDiscoveryListen();
  setLanRuntime({
    active: true,
    connected: false,
    message: cfg.clientHost
      ? `Ready to use main PC at ${cfg.clientHost}:${cfg.clientPort}`
      : "Client mode — enter main PC address",
    lastError: null,
    clientTarget: cfg.clientHost ? `${cfg.clientHost}:${cfg.clientPort}` : null,
  });

  if (cfg.clientHost && cfg.clientAccessKey) {
    const probe = await probeLanServer(cfg.clientHost, cfg.clientPort, cfg.clientAccessKey);
    if (probe.ok) {
      setLanRuntime({
        connected: true,
        message: `Connected to ${probe.name} (${cfg.clientHost}:${cfg.clientPort})`,
        lastError: null,
      });
    } else {
      setLanRuntime({
        connected: false,
        message: `Cannot reach main PC yet`,
        lastError: probe.error,
      });
    }
  }

  return getLanRuntimeStatus();
}

export async function saveAndApplyLanConfig(
  input: LanConfigUpdateInput
): Promise<LanRuntimeStatus> {
  updateLanConfig(input);
  return applyLanModeFromConfig();
}

export async function testLanClientConnection(input?: {
  host?: string;
  port?: number;
  accessKey?: string;
}): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const cfg = loadLanConfig();
  const host = (input?.host ?? cfg.clientHost).trim();
  const port = Number(input?.port ?? cfg.clientPort);
  const accessKey = input?.accessKey ?? cfg.clientAccessKey;
  if (!host) return { ok: false, error: "Enter main PC address (IP)" };
  if (!accessKey) return { ok: false, error: "Enter access key from main PC" };
  return probeLanServer(host, port, accessKey);
}

export function listLanDiscoveries(): LanDiscoveredServer[] {
  return getDiscoveredServers();
}

export function getLanStatus(): LanRuntimeStatus {
  return getLanRuntimeStatus();
}
