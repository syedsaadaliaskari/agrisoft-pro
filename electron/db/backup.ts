import fs from "fs";
import path from "path";
import { app, dialog, type BrowserWindow } from "electron";
import type { BackupFileInfo, BackupStatus } from "../../shared/ipc";
import {
  closeDatabase,
  createDbBackupFile,
  getDbPath,
  getDbRelatedPaths,
  initDatabase,
} from "./index";

export const AUTO_KEEP_DAYS = 14;

/** When true, before-quit skips auto backup (used during restore relaunch). */
let skipQuitAutoBackup = false;

export function setSkipQuitAutoBackup(value: boolean) {
  skipQuitAutoBackup = value;
}

export function shouldSkipQuitAutoBackup() {
  return skipQuitAutoBackup;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function stampWithTime(d = new Date()) {
  return `${todayStamp(d)}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function getBackupRoot(): string {
  return path.join(app.getPath("documents"), "Agri Soft Pro Backups");
}

export function getAutoBackupDir(): string {
  return path.join(getBackupRoot(), "auto");
}

function autoFileForDate(dateStamp: string) {
  return path.join(getAutoBackupDir(), `agri-auto-${dateStamp}.db`);
}

function fileInfo(filePath: string, kind: "auto" | "manual"): BackupFileInfo {
  const st = fs.statSync(filePath);
  return {
    path: filePath,
    fileName: path.basename(filePath),
    sizeBytes: st.size,
    modifiedAt: st.mtime.toISOString(),
    kind,
  };
}

export function listAutoBackups(): BackupFileInfo[] {
  const dir = getAutoBackupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("agri-auto-") && f.endsWith(".db"))
    .map((f) => fileInfo(path.join(dir, f), "auto"))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function getBackupStatus(): BackupStatus {
  const autos = listAutoBackups();
  const last = autos[0] ?? null;
  return {
    liveDbPath: getDbPath(),
    backupRoot: getBackupRoot(),
    autoDir: getAutoBackupDir(),
    keepDays: AUTO_KEEP_DAYS,
    lastAutoBackupAt: last?.modifiedAt ?? null,
    lastAutoBackupPath: last?.path ?? null,
    autoBackups: autos,
  };
}

export function pruneAutoBackups(keepDays = AUTO_KEEP_DAYS): void {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const file of listAutoBackups()) {
    const m = file.fileName.match(/^agri-auto-(\d{4}-\d{2}-\d{2})\.db$/);
    let t = new Date(file.modifiedAt).getTime();
    if (m?.[1]) {
      t = new Date(`${m[1]}T00:00:00`).getTime();
    }
    if (t < cutoff) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Auto backup for today.
 * @param force overwrite today's file even if it exists (use on app close)
 */
export async function runAutoBackup(force = false): Promise<BackupFileInfo | null> {
  const stamp = todayStamp();
  const dest = autoFileForDate(stamp);
  ensureDir(getAutoBackupDir());
  if (!force && fs.existsSync(dest)) {
    return fileInfo(dest, "auto");
  }
  await createDbBackupFile(dest);
  pruneAutoBackups();
  return fileInfo(dest, "auto");
}

/** Manual backup via Save dialog. Returns null if user cancels. */
export async function runManualBackup(
  parent?: BrowserWindow | null
): Promise<BackupFileInfo | null> {
  ensureDir(getBackupRoot());
  const defaultPath = path.join(getBackupRoot(), `agri-backup-${stampWithTime()}.db`);
  const options = {
    title: "Backup Agri Soft Pro data",
    defaultPath,
    filters: [{ name: "SQLite database", extensions: ["db"] }],
  };
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) {
    return null;
  }
  const dest = result.filePath.endsWith(".db") ? result.filePath : `${result.filePath}.db`;
  await createDbBackupFile(dest);
  return fileInfo(dest, "manual");
}

function removeIfExists(p: string) {
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/**
 * Replace live DB with a backup file. Caller must relaunch the app afterward.
 * Saves the previous live DB as *.before-restore.db when possible.
 */
export function restoreFromBackupFile(sourcePath: string): { beforeRestorePath: string | null } {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error("Backup file not found");
  }
  if (!sourcePath.toLowerCase().endsWith(".db")) {
    throw new Error("Choose a .db backup file");
  }

  const live = getDbPath();
  if (!live) {
    throw new Error("Live database path is unknown");
  }

  closeDatabase();

  const beforeRestorePath = `${live}.before-restore.db`;
  try {
    if (fs.existsSync(live)) {
      removeIfExists(beforeRestorePath);
      fs.copyFileSync(live, beforeRestorePath);
    }
  } catch {
    // continue even if safety copy fails
  }

  for (const p of getDbRelatedPaths(live)) {
    removeIfExists(p);
  }

  fs.copyFileSync(sourcePath, live);
  setSkipQuitAutoBackup(true);
  return { beforeRestorePath: fs.existsSync(beforeRestorePath) ? beforeRestorePath : null };
}

/** After a failed restore attempt mid-flight, try to reopen DB. */
export async function reopenDatabase(): Promise<void> {
  await initDatabase();
}
