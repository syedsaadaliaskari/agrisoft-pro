import http from "http";
import { IPC } from "../../shared/ipc";
import { loadLanConfig } from "./config";
import { setLanRuntime } from "./runtime";

let sessionToken: string | null = null;

export function clearLanClientSession(): void {
  sessionToken = null;
}

export function getLanClientSessionToken(): string | null {
  return sessionToken;
}

function requestJson(opts: {
  host: string;
  port: number;
  path: string;
  method: "GET" | "POST";
  accessKey: string;
  body?: unknown;
  sessionToken?: string | null;
}): Promise<{ status: number; json: Record<string, unknown>; sessionToken: string | null }> {
  const payload = opts.body !== undefined ? JSON.stringify(opts.body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: opts.host,
        port: opts.port,
        path: opts.path,
        method: opts.method,
        headers: {
          "Content-Type": "application/json",
          "X-Access-Key": opts.accessKey,
          ...(opts.sessionToken ? { "X-Session-Token": opts.sessionToken } : {}),
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: Record<string, unknown> = {};
          try {
            json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
          } catch {
            json = { ok: false, error: "Invalid response from main PC" };
          }
          const tokenHeader = res.headers["x-session-token"];
          const token =
            typeof tokenHeader === "string"
              ? tokenHeader
              : Array.isArray(tokenHeader)
                ? tokenHeader[0] || null
                : null;
          resolve({ status: res.statusCode || 0, json, sessionToken: token });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Main PC timed out"));
    });
    req.on("error", (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

export async function probeLanServer(
  host: string,
  port: number,
  accessKey: string
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  try {
    const res = await requestJson({
      host,
      port,
      path: "/v1/hello",
      method: "GET",
      accessKey,
    });
    if (res.status === 401) return { ok: false, error: "Invalid access key" };
    if (res.status >= 200 && res.status < 300 && res.json.ok) {
      return { ok: true, name: String(res.json.name || "Main PC") };
    }
    return { ok: false, error: String(res.json.error || "Could not reach main PC") };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach main PC" };
  }
}

export async function invokeLanRpc(channel: string, args: unknown[]): Promise<unknown> {
  const cfg = loadLanConfig();
  if (cfg.mode !== "client") {
    throw new Error("Not in client mode");
  }
  if (!cfg.clientHost) {
    throw new Error("Main PC address is not set");
  }
  if (!cfg.clientAccessKey) {
    throw new Error("Access key is not set");
  }

  try {
    const res = await requestJson({
      host: cfg.clientHost,
      port: cfg.clientPort,
      path: "/v1/rpc",
      method: "POST",
      accessKey: cfg.clientAccessKey,
      sessionToken,
      body: { channel, args },
    });

    if (res.sessionToken) sessionToken = res.sessionToken;
    if (channel === IPC.AUTH_LOGOUT) sessionToken = null;

    if (res.status === 401) {
      setLanRuntime({
        connected: false,
        lastError: "Invalid access key",
        message: "Access key rejected by main PC",
      });
      throw new Error("Invalid access key");
    }

    setLanRuntime({
      connected: true,
      lastError: null,
      message: `Connected to ${cfg.clientHost}:${cfg.clientPort}`,
      clientTarget: `${cfg.clientHost}:${cfg.clientPort}`,
      active: true,
    });

    if (!res.json.ok) {
      throw new Error(String(res.json.error || "Main PC request failed"));
    }
    return res.json.result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Main PC unreachable";
    setLanRuntime({
      connected: false,
      lastError: message,
      message: `Cannot reach main PC (${cfg.clientHost}:${cfg.clientPort})`,
      clientTarget: `${cfg.clientHost}:${cfg.clientPort}`,
      active: true,
    });
    throw err instanceof Error ? err : new Error(message);
  }
}
