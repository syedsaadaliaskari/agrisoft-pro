import { app, BrowserWindow, shell, protocol, dialog } from "electron";
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
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((r) => setTimeout(r, 150));

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
