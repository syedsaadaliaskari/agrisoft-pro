"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FolderOpen,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  OpsEmptyState,
  OpsListSkeleton,
  OpsStatStrip,
} from "@/components/ops/DocumentWorkspace";
import { Alert, Button, DataTable } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { BackupStatus } from "@shared/ipc";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatWhen(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function BackupPage() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getApi().getBackupStatus();
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      setStatus(null);
      return;
    }
    setStatus(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onManual = async () => {
    setBusy(true);
    setError("");
    setOkMsg("");
    const res = await getApi().runManualBackup();
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (!res.data) {
      setOkMsg("Backup cancelled");
      return;
    }
    setOkMsg(`Backup saved: ${res.data.path}`);
    await load();
  };

  const onAutoNow = async () => {
    setBusy(true);
    setError("");
    setOkMsg("");
    const res = await getApi().runAutoBackupNow();
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.data) {
      setOkMsg(`Today's auto backup refreshed: ${res.data.fileName}`);
    }
    await load();
  };

  const onRestore = async (filePath?: string) => {
    setBusy(true);
    setError("");
    setOkMsg("");
    let path = filePath;
    if (!path) {
      const pick = await getApi().pickBackupFile();
      if (!pick.ok) {
        setBusy(false);
        setError(pick.error);
        return;
      }
      if (!pick.data) {
        setBusy(false);
        setOkMsg("Restore cancelled");
        return;
      }
      path = pick.data;
    }
    const res = await getApi().restoreBackup(path);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg("Restoring — app is restarting…");
  };

  const onOpenFolder = async () => {
    const res = await getApi().openBackupFolder();
    if (!res.ok) setError(res.error);
  };

  return (
    <AppShell
      title="Backup & Restore"
      subtitle="Local database snapshots — free, on this PC only"
      permission="settings.manage"
    >
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {okMsg ? (
        <div className="mb-4">
          <Alert tone="info">{okMsg}</Alert>
        </div>
      ) : null}

      {loading && !status ? (
        <OpsListSkeleton rows={4} />
      ) : (
        <>
          <OpsStatStrip
            items={[
              {
                label: "Last auto backup",
                value: status?.lastAutoBackupAt
                  ? formatWhen(status.lastAutoBackupAt)
                  : "None yet",
                hint: status?.lastAutoBackupPath
                  ? status.lastAutoBackupPath.split(/[/\\]/).pop()
                  : "Created on app start / close",
                tone: "accent",
                icon: HardDrive,
              },
              {
                label: "Auto copies kept",
                value: String(status?.autoBackups.length ?? 0),
                hint: `Keeps last ${status?.keepDays ?? 14} days`,
                icon: ShieldCheck,
              },
            ]}
          />

          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
                Backup
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">Save a restore point</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Manual backup asks where to save (Documents or USB). Auto backups land in the app backup
                folder without asking.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void onManual()} disabled={busy}>
                  <Save size={14} /> Backup now
                </Button>
                <Button variant="secondary" onClick={() => void onAutoNow()} disabled={busy}>
                  <RefreshCw size={14} /> Refresh today&apos;s auto
                </Button>
                <Button variant="secondary" onClick={() => void onOpenFolder()} disabled={busy}>
                  <FolderOpen size={14} /> Open folder
                </Button>
              </div>
              {status ? (
                <div className="mt-4 space-y-1 rounded-xl border border-[var(--border)] bg-[var(--bg-soft)]/60 px-3 py-2 text-[11px] text-[var(--text-muted)]">
                  <div>
                    <span className="font-medium text-[var(--text)]">Live data: </span>
                    {status.liveDbPath}
                  </div>
                  <div>
                    <span className="font-medium text-[var(--text)]">Backups: </span>
                    {status.backupRoot}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--danger)]">
                Restore
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">Replace live data</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Pick any <code className="text-[var(--text)]">.db</code> backup. Current data is replaced
                and the app restarts. A <code className="text-[var(--text)]">.before-restore.db</code>{" "}
                safety copy is kept when possible.
              </p>
              <div className="mt-4">
                <Button variant="danger" onClick={() => void onRestore()} disabled={busy}>
                  <RotateCcw size={14} /> Restore from file…
                </Button>
              </div>
            </section>
          </div>

          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Auto backup history</h2>
              <p className="text-xs text-[var(--text-muted)]">
                One file per day — overwritten on app close with the latest data
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy || loading}>
              <RefreshCw size={14} /> Refresh
            </Button>
          </div>

          {!status?.autoBackups.length ? (
            <OpsEmptyState
              title="No auto backups yet"
              hint="Open or close the app once on a work day and today's auto backup will appear here."
            />
          ) : (
            <DataTable headers={["File", "Saved", "Size", ""]} empty={false}>
              {status.autoBackups.map((row) => (
                <tr
                  key={row.path}
                  className="border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--bg-soft)]/60"
                >
                  <td className="px-4 py-3.5">
                    <div className="font-mono text-xs font-semibold">{row.fileName}</div>
                    <div className="mt-0.5 max-w-md truncate text-[11px] text-[var(--text-muted)]">
                      {row.path}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm">{formatWhen(row.modifiedAt)}</td>
                  <td className="px-4 py-3.5 tabular-nums text-sm">{formatBytes(row.sizeBytes)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void onRestore(row.path)}
                        title="Restore this backup"
                      >
                        <RotateCcw size={14} /> Restore
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </>
      )}
    </AppShell>
  );
}
