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
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [autoRefreshDone, setAutoRefreshDone] = useState(false);
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
    if (busy || autoRefreshDone) return;
    setBusy(true);
    setError("");
    setOkMsg("");
    const res = await getApi().runAutoBackupNow();
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAutoRefreshDone(true);
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
                label: t("backup.lastAuto"),
                value: status?.lastAutoBackupAt
                  ? formatWhen(status.lastAutoBackupAt)
                  : t("backup.noneYet"),
                hint: status?.lastAutoBackupPath
                  ? status.lastAutoBackupPath.split(/[/\\]/).pop()
                  : t("backup.createdOn"),
                tone: "accent",
                icon: HardDrive,
              },
              {
                label: t("backup.autoKept"),
                value: String(status?.autoBackups.length ?? 0),
                hint: t("backup.keepsDays", { n: status?.keepDays ?? 14 }),
                icon: ShieldCheck,
              },
            ]}
          />

          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
                {t("backup.backup")}
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">{t("backup.savePoint")}</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{t("backup.backupHint")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void onManual()} disabled={busy}>
                  <Save size={14} /> {t("backup.backupNow")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void onAutoNow()}
                  disabled={busy || autoRefreshDone}
                >
                  <RefreshCw size={14} />{" "}
                  {autoRefreshDone ? t("backup.refreshDone") : t("backup.refreshAuto")}
                </Button>
                <Button variant="secondary" onClick={() => void onOpenFolder()} disabled={busy}>
                  <FolderOpen size={14} /> {t("backup.openFolder")}
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--danger)]">
                {t("backup.restore")}
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">{t("backup.replaceData")}</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{t("backup.restoreHint")}</p>
              <div className="mt-4">
                <Button variant="danger" onClick={() => void onRestore()} disabled={busy}>
                  <RotateCcw size={14} /> {t("backup.restoreFromFile")}
                </Button>
              </div>
            </section>
          </div>

          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t("backup.history")}</h2>
              <p className="text-xs text-[var(--text-muted)]">{t("backup.historyHint")}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy || loading}>
              <RefreshCw size={14} /> {t("common.refresh")}
            </Button>
          </div>

          {!status?.autoBackups.length ? (
            <OpsEmptyState title={t("backup.noAuto")} hint={t("backup.noAutoHint")} />
          ) : (
            <DataTable
              headers={[t("backup.file"), t("backup.saved"), t("backup.size"), ""]}
              empty={false}
            >
              {status.autoBackups.map((row) => (
                <tr
                  key={row.path}
                  className="border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--bg-soft)]/60"
                >
                  <td className="px-4 py-3.5">
                    <div className="font-mono text-xs font-semibold">{row.fileName}</div>
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
                        title={t("backup.restoreRow")}
                      >
                        <RotateCcw size={14} /> {t("backup.restoreRow")}
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
