import { app, BrowserWindow, shell, ipcMain, protocol, net, dialog } from "electron";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import { initDatabase, closeDatabase } from "./db";
import { runAutoBackup, shouldSkipQuitAutoBackup } from "./db/backup";
import { registerIpcHandlers } from "./ipc/handlers";
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

function registerStaticAppProtocol() {
  const outDir = path.resolve(app.getAppPath(), "out");

  protocol.handle("app", (request) => {
    try {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);

      if (!pathname || pathname === "/") {
        pathname = "/index.html";
      } else if (pathname.endsWith("/")) {
        pathname = `${pathname}index.html`;
      } else if (!path.extname(pathname)) {
        pathname = `${pathname}/index.html`;
      }

      const filePath = path.resolve(path.join(outDir, pathname));
      const outPrefix = outDir.endsWith(path.sep) ? outDir : outDir + path.sep;
      if (filePath !== outDir && !filePath.startsWith(outPrefix)) {
        return new Response("Not found", { status: 404 });
      }

      return net.fetch(pathToFileURL(filePath).href);
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

  // Auto daily backup on start if today's file is missing
  try {
    await runAutoBackup(false);
  } catch (err) {
    console.warn("Auto backup on start failed:", err);
  }

  ipcMain.handle(IPC.APP_PRINT_HTML, async (_event, html: string): Promise<ActionResult> => {
    if (!html || typeof html !== "string") {
      return { ok: false, error: "Nothing to print" };
    }
    return printHtmlDocument(html);
  });

  ipcMain.handle(
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
    }
  );

  await createWindow();

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
      // Refresh today's auto backup with end-of-day data
      await runAutoBackup(true);
    } catch (err) {
      console.warn("Auto backup on quit failed:", err);
    } finally {
      closeDatabase();
      app.exit(0);
    }
  })();
});
