import http from "http";
import { IPC, type LoginResult, type SessionUser } from "../../shared/ipc";
import { dispatchLocalHandler } from "../ipc/register";
import { runWithRequestContextAsync } from "../ipc/session";
import { loadLanConfig } from "./config";
import {
  createSessionToken,
  getSessionByToken,
  revokeSessionToken,
  updateSessionToken,
} from "./tokens";
import { setLanRuntime } from "./runtime";
import { startDiscoveryAnnounce, stopDiscoveryAnnounce } from "./discover";

let server: http.Server | null = null;
let queue: Promise<unknown> = Promise.resolve();

function withDbQueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>
): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Key, X-Session-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...extraHeaders,
  });
  res.end(data);
}

function checkAccessKey(req: http.IncomingMessage): boolean {
  const cfg = loadLanConfig();
  const key = String(req.headers["x-access-key"] || "");
  return Boolean(cfg.accessKey) && key === cfg.accessKey;
}

async function handleRpc(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (!checkAccessKey(req)) {
    sendJson(res, 401, { ok: false, error: "Invalid access key" });
    return;
  }

  const raw = await readBody(req);
  let parsed: { channel?: string; args?: unknown[] };
  try {
    parsed = JSON.parse(raw || "{}") as { channel?: string; args?: unknown[] };
  } catch {
    sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
    return;
  }

  const channel = String(parsed.channel || "");
  const args = Array.isArray(parsed.args) ? parsed.args : [];
  if (!channel) {
    sendJson(res, 400, { ok: false, error: "Missing channel" });
    return;
  }

  const incomingToken = String(req.headers["x-session-token"] || "") || null;
  let session = getSessionByToken(incomingToken);

  // Login establishes a new remote session; do not require prior token.
  if (channel !== IPC.AUTH_LOGIN && channel !== IPC.LICENSE_STATUS && channel !== IPC.PING) {
    // Most channels need auth; LICENSE_STATUS allowed so lock screen works before login.
  }

  try {
    const result = await withDbQueue(() =>
      runWithRequestContextAsync({ user: session, remote: true }, async () => {
        const out = await dispatchLocalHandler(channel, args);

        if (channel === IPC.AUTH_LOGIN) {
          const login = out as LoginResult;
          if (login && login.ok) {
            const token = createSessionToken(login.user);
            return { result: out, token };
          }
          return { result: out, token: null as string | null };
        }

        if (channel === IPC.AUTH_LOGOUT) {
          revokeSessionToken(incomingToken);
          return { result: out, token: null as string | null };
        }

        if (channel === IPC.AUTH_CURRENT_USER) {
          const user = out as SessionUser | null;
          if (user && incomingToken) updateSessionToken(incomingToken, user);
          return { result: out, token: incomingToken };
        }

        if (channel === IPC.AUTH_CHANGE_PASSWORD || channel === IPC.AUTH_VENDOR_UNLOCK) {
          // Session user may have been refreshed inside the handler via setCurrentSession.
          const { getCurrentSession } = await import("../ipc/session");
          const fresh = getCurrentSession();
          if (fresh && incomingToken) updateSessionToken(incomingToken, fresh);
          return { result: out, token: incomingToken };
        }

        return { result: out, token: incomingToken };
      })
    );

    const headers: Record<string, string> = {};
    if (result.token) headers["X-Session-Token"] = result.token;
    sendJson(res, 200, { ok: true, result: result.result }, headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : "LAN request failed";
    sendJson(res, 200, { ok: false, error: message });
  }
}

export async function startLanServer(): Promise<void> {
  await stopLanServer();
  const cfg = loadLanConfig();
  if (cfg.mode !== "server") return;
  if (!cfg.accessKey) {
    setLanRuntime({
      active: false,
      connected: false,
      message: "Server mode needs an access key",
      lastError: "Missing access key",
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server = http.createServer((req, res) => {
      void (async () => {
        try {
          if (req.method === "OPTIONS") {
            sendJson(res, 204, {});
            return;
          }
          const url = req.url || "/";
          if (req.method === "GET" && (url === "/v1/hello" || url === "/hello")) {
            if (!checkAccessKey(req)) {
              sendJson(res, 401, { ok: false, error: "Invalid access key" });
              return;
            }
            const c = loadLanConfig();
            sendJson(res, 200, {
              ok: true,
              name: c.displayName,
              port: c.serverPort,
              app: "Agri Soft Pro",
            });
            return;
          }
          if (req.method === "POST" && (url === "/v1/rpc" || url === "/rpc")) {
            await handleRpc(req, res);
            return;
          }
          sendJson(res, 404, { ok: false, error: "Not found" });
        } catch (err) {
          sendJson(res, 500, {
            ok: false,
            error: err instanceof Error ? err.message : "Server error",
          });
        }
      })();
    });

    server.once("error", (err) => {
      setLanRuntime({
        active: false,
        connected: false,
        message: "LAN server failed to start",
        lastError: err instanceof Error ? err.message : "Listen failed",
      });
      reject(err);
    });

    server.listen(cfg.serverPort, "0.0.0.0", () => {
      setLanRuntime({
        active: true,
        connected: true,
        message: `Main PC sharing on port ${cfg.serverPort}`,
        lastError: null,
        clientTarget: null,
      });
      startDiscoveryAnnounce();
      resolve();
    });
  });
}

export async function stopLanServer(): Promise<void> {
  stopDiscoveryAnnounce();
  if (!server) return;
  const s = server;
  server = null;
  await new Promise<void>((resolve) => {
    s.close(() => resolve());
  });
}
