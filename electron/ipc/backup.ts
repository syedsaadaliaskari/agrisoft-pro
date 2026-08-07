import { app, dialog, ipcMain, shell, BrowserWindow } from "electron";
import fs from "fs";
import {
  IPC,
  type ActionResult,
  type BackupStatus,
  type BackupFileInfo,
} from "../../shared/ipc";
import {
  getBackupStatus,
  runAutoBackup,
  runManualBackup,
  restoreFromBackupFile,
  reopenDatabase,
  getBackupRoot,
} from "../db/backup";
import { writeAuditLog } from "../db/audit";
import { getDb } from "../db";
import { PermissionError, requirePermission } from "./session";

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

function asError(err: unknown): string {
  if (err instanceof PermissionError) return err.message;
  if (err instanceof Error) return err.message;
  return "Backup operation failed";
}

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow();
}

export function registerBackupHandlers(): void {
  ipcMain.handle(IPC.BACKUP_STATUS, async (): Promise<ActionResult<BackupStatus>> => {
    try {
      requirePermission("settings.manage");
      return ok(getBackupStatus());
    } catch (err) {
      return fail(asError(err));
    }
  });

  ipcMain.handle(IPC.BACKUP_RUN_MANUAL, async (): Promise<ActionResult<BackupFileInfo | null>> => {
    try {
      const session = requirePermission("settings.manage");
      const file = await runManualBackup(focusedWindow());
      if (file) {
        try {
          writeAuditLog(getDb(), {
            userId: session.id,
            action: "backup",
            module: "backup",
            details: `Manual backup → ${file.path}`,
          });
        } catch {
          // audit optional if db busy
        }
      }
      return ok(file);
    } catch (err) {
      return fail(asError(err));
    }
  });

  ipcMain.handle(IPC.BACKUP_RUN_AUTO, async (): Promise<ActionResult<BackupFileInfo | null>> => {
    try {
      requirePermission("settings.manage");
      const file = await runAutoBackup(true);
      return ok(file);
    } catch (err) {
      return fail(asError(err));
    }
  });

  ipcMain.handle(
    IPC.BACKUP_RESTORE,
    async (_e, sourcePath: string): Promise<ActionResult<{ relaunching: true }>> => {
      try {
        const session = requirePermission("settings.manage");
        if (!sourcePath || typeof sourcePath !== "string") {
          return fail("No backup file selected");
        }

        const win = focusedWindow();
        const confirm = win
          ? await dialog.showMessageBox(win, {
              type: "warning",
              buttons: ["Cancel", "Restore and restart"],
              defaultId: 0,
              cancelId: 0,
              title: "Restore backup",
              message: "Replace all current data with this backup?",
              detail:
                "Everything after this backup will be lost. The current database will be saved as a .before-restore.db safety copy when possible. The app will restart.",
            })
          : await dialog.showMessageBox({
              type: "warning",
              buttons: ["Cancel", "Restore and restart"],
              defaultId: 0,
              cancelId: 0,
              title: "Restore backup",
              message: "Replace all current data with this backup?",
              detail:
                "Everything after this backup will be lost. The current database will be saved as a .before-restore.db safety copy when possible. The app will restart.",
            });
        if (confirm.response !== 1) {
          return fail("Restore cancelled");
        }

        try {
          writeAuditLog(getDb(), {
            userId: session.id,
            action: "restore",
            module: "backup",
            details: `Restore from ${sourcePath}`,
          });
        } catch {
          // continue
        }

        restoreFromBackupFile(sourcePath);
        app.relaunch();
        app.exit(0);
        return ok({ relaunching: true });
      } catch (err) {
        try {
          await reopenDatabase();
        } catch {
          // ignore
        }
        return fail(asError(err));
      }
    }
  );

  ipcMain.handle(IPC.BACKUP_PICK_FILE, async (): Promise<ActionResult<string | null>> => {
    try {
      requirePermission("settings.manage");
      const win = focusedWindow();
      const result = win
        ? await dialog.showOpenDialog(win, {
            title: "Choose backup file to restore",
            defaultPath: getBackupRoot(),
            properties: ["openFile"],
            filters: [{ name: "SQLite database", extensions: ["db"] }],
          })
        : await dialog.showOpenDialog({
            title: "Choose backup file to restore",
            defaultPath: getBackupRoot(),
            properties: ["openFile"],
            filters: [{ name: "SQLite database", extensions: ["db"] }],
          });
      if (result.canceled || !result.filePaths[0]) {
        return ok(null);
      }
      return ok(result.filePaths[0]);
    } catch (err) {
      return fail(asError(err));
    }
  });

  ipcMain.handle(IPC.BACKUP_OPEN_FOLDER, async (): Promise<ActionResult> => {
    try {
      requirePermission("settings.manage");
      const root = getBackupRoot();
      if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
      }
      await shell.openPath(root);
      return ok(undefined);
    } catch (err) {
      return fail(asError(err));
    }
  });
}
