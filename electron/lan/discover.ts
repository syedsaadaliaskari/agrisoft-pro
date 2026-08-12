import dgram from "dgram";
import {
  LAN_DISCOVERY_PORT,
  LAN_MAGIC,
  LAN_PROTOCOL_VERSION,
  type LanDiscoveredServer,
} from "../../shared/lan";
import { loadLanConfig } from "./config";
import { listLocalIPv4 } from "./runtime";

let announceTimer: NodeJS.Timeout | null = null;
let announceSocket: dgram.Socket | null = null;
let listenSocket: dgram.Socket | null = null;

const discovered = new Map<string, LanDiscoveredServer>();

function serverKey(host: string, port: number) {
  return `${host}:${port}`;
}

export function getDiscoveredServers(): LanDiscoveredServer[] {
  const now = Date.now();
  for (const [k, v] of discovered) {
    if (now - Date.parse(v.lastSeenAt) > 15_000) discovered.delete(k);
  }
  return [...discovered.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function startDiscoveryAnnounce(): void {
  stopDiscoveryAnnounce();
  const cfg = loadLanConfig();
  if (cfg.mode !== "server") return;

  try {
    announceSocket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    announceSocket.bind(() => {
      try {
        announceSocket?.setBroadcast(true);
      } catch {
        /* ignore */
      }
    });

    const tick = () => {
      const c = loadLanConfig();
      if (c.mode !== "server") return;
      const payload = Buffer.from(
        JSON.stringify({
          magic: LAN_MAGIC,
          v: LAN_PROTOCOL_VERSION,
          name: c.displayName || "Main PC",
          port: c.serverPort,
          addresses: listLocalIPv4(),
        }),
        "utf8"
      );
      try {
        announceSocket?.send(payload, 0, payload.length, LAN_DISCOVERY_PORT, "255.255.255.255");
      } catch {
        /* ignore */
      }
    };

    tick();
    announceTimer = setInterval(tick, 3000);
  } catch (err) {
    console.warn("LAN discovery announce failed:", err);
  }
}

export function stopDiscoveryAnnounce(): void {
  if (announceTimer) {
    clearInterval(announceTimer);
    announceTimer = null;
  }
  if (announceSocket) {
    try {
      announceSocket.close();
    } catch {
      /* ignore */
    }
    announceSocket = null;
  }
}

export function startDiscoveryListen(): void {
  stopDiscoveryListen();
  try {
    listenSocket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    listenSocket.on("message", (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString("utf8")) as {
          magic?: string;
          v?: number;
          name?: string;
          port?: number;
          addresses?: string[];
        };
        if (data.magic !== LAN_MAGIC) return;
        const port = Number(data.port);
        if (!port) return;
        const hosts = [
          ...(Array.isArray(data.addresses) ? data.addresses : []),
          rinfo.address,
        ].filter(Boolean);
        const host = hosts.find((h) => h && h !== "127.0.0.1") || rinfo.address;
        const row: LanDiscoveredServer = {
          name: String(data.name || "Main PC"),
          host,
          port,
          version: Number(data.v) || 1,
          lastSeenAt: new Date().toISOString(),
        };
        discovered.set(serverKey(host, port), row);
      } catch {
        /* ignore bad packets */
      }
    });
    listenSocket.bind(LAN_DISCOVERY_PORT);
  } catch (err) {
    console.warn("LAN discovery listen failed:", err);
  }
}

export function stopDiscoveryListen(): void {
  if (listenSocket) {
    try {
      listenSocket.close();
    } catch {
      /* ignore */
    }
    listenSocket = null;
  }
}
