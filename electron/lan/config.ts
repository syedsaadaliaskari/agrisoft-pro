import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { app } from "electron";
import {
  defaultLanConfig,
  type LanConfig,
  type LanConfigUpdateInput,
  type LanMode,
  LAN_DEFAULT_PORT,
} from "../../shared/lan";

let cached: LanConfig | null = null;

function configPath(): string {
  return path.join(app.getPath("userData"), "lan-config.json");
}

function normalize(raw: Partial<LanConfig> | null | undefined): LanConfig {
  const base = defaultLanConfig();
  if (!raw || typeof raw !== "object") return base;
  const mode = raw.mode;
  const validMode: LanMode =
    mode === "server" || mode === "client" || mode === "standalone" ? mode : "standalone";
  const serverPort = Number(raw.serverPort) || LAN_DEFAULT_PORT;
  const clientPort = Number(raw.clientPort) || LAN_DEFAULT_PORT;
  return {
    mode: validMode,
    displayName: String(raw.displayName || base.displayName).trim() || base.displayName,
    serverPort: serverPort > 0 && serverPort < 65536 ? serverPort : LAN_DEFAULT_PORT,
    accessKey: String(raw.accessKey || ""),
    clientHost: String(raw.clientHost || "").trim(),
    clientPort: clientPort > 0 && clientPort < 65536 ? clientPort : LAN_DEFAULT_PORT,
    clientAccessKey: String(raw.clientAccessKey || ""),
  };
}

export function generateAccessKey(): string {
  return randomBytes(9).toString("base64url").slice(0, 12).toUpperCase();
}

export function loadLanConfig(): LanConfig {
  if (cached) return cached;
  try {
    const p = configPath();
    if (!fs.existsSync(p)) {
      cached = defaultLanConfig();
      return cached;
    }
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<LanConfig>;
    cached = normalize(raw);
    return cached;
  } catch {
    cached = defaultLanConfig();
    return cached;
  }
}

export function saveLanConfig(next: LanConfig): LanConfig {
  const normalized = normalize(next);
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(normalized, null, 2), "utf8");
  cached = normalized;
  return normalized;
}

export function updateLanConfig(input: LanConfigUpdateInput): LanConfig {
  const current = loadLanConfig();
  const next: LanConfig = {
    ...current,
    mode: input.mode ?? current.mode,
    displayName: input.displayName !== undefined ? String(input.displayName) : current.displayName,
    serverPort: input.serverPort !== undefined ? Number(input.serverPort) : current.serverPort,
    accessKey: input.accessKey !== undefined ? String(input.accessKey) : current.accessKey,
    clientHost: input.clientHost !== undefined ? String(input.clientHost) : current.clientHost,
    clientPort: input.clientPort !== undefined ? Number(input.clientPort) : current.clientPort,
    clientAccessKey:
      input.clientAccessKey !== undefined ? String(input.clientAccessKey) : current.clientAccessKey,
  };

  if (input.regenerateAccessKey || (next.mode === "server" && !next.accessKey)) {
    next.accessKey = generateAccessKey();
  }

  return saveLanConfig(next);
}
