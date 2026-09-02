import { app, BrowserWindow, shell, protocol, dialog, nativeImage, clipboard } from "electron";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { initDatabase, closeDatabase } from "./db";
import { runAutoBackup, shouldSkipQuitAutoBackup } from "./db/backup";
import { registerIpcHandlers } from "./ipc/handlers";
import { registerHandler } from "./ipc/register";
import { setupAutoUpdater } from "./updater";
import { startCloudSyncScheduler } from "./sync/scheduler";
import { IPC, type ActionResult } from "../shared/ipc";

let quitting = false;

const isDev = !app.isPackaged;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function registerStaticAppProtocol() {
  const outDir = path.resolve(app.getAppPath(), "out");

  protocol.handle("app", (request) => {
    try {
      const url = new URL(request.url);
      // Strip leading slashes so path.join never treats the segment as absolute on Windows
      let rel = decodeURIComponent(url.pathname || "").replace(/^\/+/, "");

      if (!rel || rel.endsWith("/")) {
        rel = `${rel}index.html`;
      } else if (!path.extname(rel)) {
        rel = `${rel}/index.html`;
      }

      let filePath = path.resolve(outDir, ...rel.split("/").filter(Boolean));
      const outPrefix = outDir.endsWith(path.sep) ? outDir : outDir + path.sep;
      if (filePath !== outDir && !filePath.startsWith(outPrefix)) {
        return new Response("Not found", { status: 404 });
      }

      // Next export uses trailingSlash folders — never feed a directory to the fetcher
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return new Response("Not found", { status: 404 });
      }

      const data = fs.readFileSync(filePath);
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": mimeFor(filePath) },
      });
    } catch (err) {
      console.error("app:// protocol error:", err);
      return new Response("Not found", { status: 404 });
    }
  });
}

function writeTempReceiptHtml(html: string): string {
  const dir = path.join(app.getPath("temp"), "agri-soft-pro-print");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(file, html, "utf8");
  return file;
}

function removeTempFileLater(file: string) {
  setTimeout(() => {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }, 30_000);
}

async function loadReceiptHtml(win: BrowserWindow, html: string): Promise<void> {
  const file = writeTempReceiptHtml(html);
  removeTempFileLater(file);
  await win.loadFile(file);
}

async function printHtmlDocument(html: string): Promise<ActionResult> {
  const printWin = new BrowserWindow({
    width: 420,
    height: 640,
    show: true,
    autoHideMenuBar: true,
    parent: mainWindow ?? undefined,
    modal: false,
    title: "Print preview",
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await loadReceiptHtml(printWin, html);
    await new Promise((r) => setTimeout(r, 200));

    const success = await new Promise<boolean>((resolve) => {
      printWin.webContents.print(
        { silent: false, printBackground: true },
        (ok, failureReason) => {
          if (!ok && failureReason) {
            console.warn("Print failed:", failureReason);
          }
          resolve(ok);
        }
      );
    });

    if (!success) {
      return { ok: false, error: "Print cancelled" };
    }
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Print failed",
    };
  } finally {
    if (!printWin.isDestroyed()) {
      printWin.close();
    }
  }
}

function safeReceiptFileName(name: string) {
  const cleaned = String(name || "receipt")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "receipt";
}

function isPngBuffer(buf: Buffer) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length > 200 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

function runPowerShell(command: string, extraEnv?: Record<string, string>): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", command],
      {
        windowsHide: true,
        timeout: 20_000,
        env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
      },
      (err) => resolve(!err)
    );
  });
}

/** Windows Share sheet — user picks WhatsApp, then a chat, with the file already attached. */
async function showWindowsShareDialog(filePath: string): Promise<boolean> {
  if (process.platform !== "win32") return false;
  const ok = await runPowerShell(
    `
$path = $env:AGRI_SHARE_FILE
if (-not $path -or -not (Test-Path -LiteralPath $path)) { exit 1 }
try {
  Start-Process -LiteralPath $path -Verb Share -ErrorAction Stop
  Start-Sleep -Milliseconds 600
  exit 0
} catch { }
$shell = New-Object -ComObject Shell.Application
$folder = Split-Path -LiteralPath $path
$name = Split-Path -LiteralPath $path -Leaf
$item = $shell.NameSpace($folder).ParseName($name)
if (-not $item) { exit 1 }
$done = $false
foreach ($verb in $item.Verbs()) {
  $label = (($verb.Name -replace '&','') + '').Trim()
  if ($label -match '(?i)^share') { $verb.DoIt(); $done = $true; break }
}
if (-not $done) {
  try { $item.InvokeVerb('Share') ; $done = $true } catch { }
}
if (-not $done) { exit 1 }
Start-Sleep -Milliseconds 600
exit 0
`,
    { AGRI_SHARE_FILE: filePath }
  );
  return ok;
}

async function putFileOnClipboard(filePath: string): Promise<boolean> {
  if (process.platform !== "win32") return false;
  return runPowerShell(
    `
$path = $env:AGRI_SHARE_FILE
if (-not $path -or -not (Test-Path -LiteralPath $path)) { exit 1 }
Set-Clipboard -LiteralPath $path
exit 0
`,
    { AGRI_SHARE_FILE: filePath }
  );
}

async function htmlToPng(html: string, size: "thermal" | "a4"): Promise<Buffer> {
  const width = size === "a4" ? 860 : 340;
  const scale = 2;
  const win = new BrowserWindow({
    width,
    height: 900,
    show: false,
    frame: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    paintWhenInitiallyHidden: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const captureCdp = async (h: number): Promise<Buffer | null> => {
    const wc = win.webContents;
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
      await wc.debugger.sendCommand("Emulation.setDeviceMetricsOverride", {
        width,
        height: h,
        deviceScaleFactor: scale,
        mobile: false,
      });
      await new Promise((r) => setTimeout(r, 160));
      const shot = (await wc.debugger.sendCommand("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: true,
      })) as { data?: string };
      const buf = shot?.data ? Buffer.from(shot.data, "base64") : null;
      return buf && isPngBuffer(buf) ? buf : null;
    } catch {
      return null;
    } finally {
      try {
        if (wc.debugger.isAttached()) wc.debugger.detach();
      } catch {
        /* ignore */
      }
    }
  };

  try {
    await loadReceiptHtml(win, html);
    win.webContents.setFrameRate(30);
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => resolve(), 1500);
      win.webContents.once("paint", () => {
        clearTimeout(t);
        resolve();
      });
    });
    const height = await win.webContents.executeJavaScript(`
      (async () => {
        const imgs = Array.from(document.images || []);
        await Promise.all(imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return img.decode ? img.decode().catch(() => undefined) : new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }));
        return Math.ceil(Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          document.documentElement.offsetHeight,
          200
        ));
      })()
    `);
    const h = Math.min(Math.max(Number(height) || 400, 200), 14000);
    win.setContentSize(width, h);
    await new Promise((r) => setTimeout(r, 160));

    const fromCdp = await captureCdp(h);
    if (fromCdp) return fromCdp;

    const image = await win.webContents.capturePage({ x: 0, y: 0, width, height: h });
    if (!image.isEmpty()) {
      const buf = image.toPNG();
      if (isPngBuffer(buf)) return buf;
    }
    throw new Error("Could not create picture");
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

async function receiptImageAction(input: {
  html: string;
  size?: "thermal" | "a4";
  mode: "save" | "whatsapp";
  defaultFileName: string;
}): Promise<ActionResult<{ path: string | null; copied?: boolean; shared?: boolean }>> {
  const png = await htmlToPng(input.html, input.size === "a4" ? "a4" : "thermal");
  if (!isPngBuffer(png)) {
    return { ok: false, error: "Could not create picture" };
  }
  const baseName = safeReceiptFileName(input.defaultFileName);

  if (input.mode === "save") {
    const pictures = app.getPath("pictures");
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(pictures, `${baseName}.png`),
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
    if (result.canceled || !result.filePath) {
      return { ok: true, data: { path: null } };
    }
    const out = result.filePath.toLowerCase().endsWith(".png")
      ? result.filePath
      : `${result.filePath}.png`;
    fs.writeFileSync(out, png);
    return { ok: true, data: { path: out } };
  }

  const dir = path.join(app.getPath("pictures"), "Agri Soft Pro");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${baseName}-${Date.now()}.png`);
  fs.writeFileSync(dest, png);

  const shared = await showWindowsShareDialog(dest);
  const filed = await putFileOnClipboard(dest);
  if (shared) {
    return { ok: true, data: { path: dest, shared: true } };
  }
  if (!filed) {
    clipboard.writeImage(nativeImage.createFromBuffer(png));
  }
  try {
    await shell.openExternal("whatsapp://send");
  } catch {
    try {
      await shell.openExternal("https://web.whatsapp.com/");
    } catch {
      /* WhatsApp not installed — picture is still saved */
    }
  }
  return { ok: true, data: { path: dest, copied: true } };
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "Agri Soft Pro",
    backgroundColor: "#12151a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === "about:blank") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          parent: mainWindow ?? undefined,
          show: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    await mainWindow.loadURL("http://localhost:3000");
  } else {
    await mainWindow.loadURL("app://localhost/");
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  if (!isDev) {
    registerStaticAppProtocol();
  }

  await initDatabase();
  registerIpcHandlers(app.getVersion(), isDev);

  try {
    await runAutoBackup(false);
  } catch (err) {
    console.warn("Auto backup on start failed:", err);
  }

  // n8n WhatsApp queue: scan reminders + flush (needs internet to send)
  const runN8nPass = async () => {
    try {
      const { getDb } = await import("./db");
      const { runN8nAutomationPass } = await import("./db/n8n");
      await runN8nAutomationPass(getDb());
    } catch (err) {
      console.warn("n8n automation pass failed:", err);
    }
  };
  void runN8nPass();
  setInterval(() => void runN8nPass(), 6 * 60 * 60 * 1000);

  // Cloud sync customers when online (startup, every 15 min, network return)
  try {
    startCloudSyncScheduler();
  } catch (err) {
    console.warn("Cloud sync scheduler failed to start:", err);
  }

  registerHandler(
    IPC.APP_PRINT_HTML,
    async (_event, html: string): Promise<ActionResult> => {
      if (!html || typeof html !== "string") {
        return { ok: false, error: "Nothing to print" };
      }
      return printHtmlDocument(html);
    },
    { localOnly: true }
  );

  registerHandler(
    IPC.APP_RECEIPT_IMAGE,
    async (
      _event,
      input: {
        html: string;
        size?: "thermal" | "a4";
        mode: "save" | "whatsapp";
        defaultFileName: string;
      }
    ): Promise<ActionResult<{ path: string | null; copied?: boolean; shared?: boolean }>> => {
      if (!input?.html || typeof input.html !== "string") {
        return { ok: false, error: "Nothing to save" };
      }
      try {
        return await receiptImageAction(input);
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Could not save image",
        };
      }
    },
    { localOnly: true }
  );

  registerHandler(
    IPC.APP_SAVE_FILE,
    async (
      _event,
      input: {
        defaultPath: string;
        dataBase64: string;
        filters?: { name: string; extensions: string[] }[];
      }
    ): Promise<ActionResult<{ path: string } | null>> => {
      try {
        if (!input?.dataBase64 || typeof input.dataBase64 !== "string") {
          return { ok: false, error: "Nothing to save" };
        }
        const result = await dialog.showSaveDialog({
          defaultPath: input.defaultPath || "export.txt",
          filters: input.filters?.length
            ? input.filters
            : [{ name: "All files", extensions: ["*"] }],
        });
        if (result.canceled || !result.filePath) {
          return { ok: true, data: null };
        }
        const buf = Buffer.from(input.dataBase64, "base64");
        fs.writeFileSync(result.filePath, buf);
        return { ok: true, data: { path: result.filePath } };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Save failed",
        };
      }
    },
    { localOnly: true }
  );

  await createWindow();

  setupAutoUpdater();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (quitting) return;
  if (shouldSkipQuitAutoBackup()) {
    closeDatabase();
    return;
  }
  event.preventDefault();
  quitting = true;
  void (async () => {
    try {
      await runAutoBackup(true);
    } catch (err) {
      console.warn("Auto backup on quit failed:", err);
    } finally {
      closeDatabase();
      app.exit(0);
    }
  })();
});
