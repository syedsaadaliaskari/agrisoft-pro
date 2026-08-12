"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Network, RefreshCw, Server, MonitorSmartphone, Wifi, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button, Input } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { LanDiscoveredServer, LanMode, LanRuntimeStatus } from "@shared/ipc";

function LanSettingsBody() {
  const [status, setStatus] = useState<LanRuntimeStatus | null>(null);
  const [discovered, setDiscovered] = useState<LanDiscoveredServer[]>([]);
  const [mode, setMode] = useState<LanMode>("standalone");
  const [displayName, setDisplayName] = useState("Main PC");
  const [serverPort, setServerPort] = useState("4747");
  const [accessKey, setAccessKey] = useState("");
  const [clientHost, setClientHost] = useState("");
  const [clientPort, setClientPort] = useState("4747");
  const [clientAccessKey, setClientAccessKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const applyStatus = (s: LanRuntimeStatus) => {
    setStatus(s);
    setMode(s.config.mode);
    setDisplayName(s.config.displayName || "Main PC");
    setServerPort(String(s.config.serverPort || 4747));
    setAccessKey(s.config.accessKey || "");
    setClientHost(s.config.clientHost || "");
    setClientPort(String(s.config.clientPort || 4747));
    setClientAccessKey(s.config.clientAccessKey || "");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getApi().getLanStatus();
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    applyStatus(res.data);
    setLoading(false);
  }, []);

  const refreshDiscover = useCallback(async () => {
    const res = await getApi().discoverLanServers();
    if (res.ok) setDiscovered(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mode !== "client") return;
    void refreshDiscover();
    const id = setInterval(() => void refreshDiscover(), 4000);
    return () => clearInterval(id);
  }, [mode, refreshDiscover]);

  const save = async (extra?: { regenerateAccessKey?: boolean }) => {
    setBusy(true);
    setError("");
    setOkMsg("");
    const res = await getApi().updateLanConfig({
      mode,
      displayName,
      serverPort: Number(serverPort) || 4747,
      accessKey: mode === "server" ? accessKey : undefined,
      clientHost: mode === "client" ? clientHost.trim() : undefined,
      clientPort: mode === "client" ? Number(clientPort) || 4747 : undefined,
      clientAccessKey: mode === "client" ? clientAccessKey : undefined,
      regenerateAccessKey: extra?.regenerateAccessKey,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    applyStatus(res.data);
    setOkMsg(
      mode === "client"
        ? "Saved. Sign in with a user from the main PC."
        : "LAN settings saved."
    );
  };

  const testConnection = async () => {
    setBusy(true);
    setError("");
    setOkMsg("");
    const res = await getApi().testLanConnection({
      host: clientHost.trim(),
      port: Number(clientPort) || 4747,
      accessKey: clientAccessKey,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg(`Connected to “${res.data.name}”.`);
  };

  const pickDiscovered = (row: LanDiscoveredServer) => {
    setClientHost(row.host);
    setClientPort(String(row.port));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {okMsg ? <Alert tone="info">{okMsg}</Alert> : null}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[var(--bg-soft)] p-2.5 text-[var(--accent)]">
            <Network size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">How this PC works</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Same installer. Choose one mode. Cashiers need the main PC on and on the same Wi‑Fi.
            </p>
            {status ? (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Status: {status.message}
                {status.lastError ? ` — ${status.lastError}` : ""}
              </p>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading || busy}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(
            [
              {
                id: "standalone" as const,
                title: "This PC alone",
                hint: "Fully offline (current default)",
                icon: MonitorSmartphone,
              },
              {
                id: "server" as const,
                title: "This PC is main",
                hint: "Shares users, stock, sales",
                icon: Server,
              },
              {
                id: "client" as const,
                title: "Connect to main",
                hint: "Cashier / second counter",
                icon: Wifi,
              },
            ] as const
          ).map((opt) => {
            const Icon = opt.icon;
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id)}
                className={`rounded-xl border p-4 text-left transition ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--border)] hover:bg-[var(--bg-soft)]/60"
                }`}
              >
                <Icon size={18} className={active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"} />
                <div className="mt-2 text-sm font-semibold">{opt.title}</div>
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">{opt.hint}</div>
              </button>
            );
          })}
        </div>
      </section>

      {mode === "server" ? (
        <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <h3 className="text-sm font-semibold">Main PC settings</h3>
          <Input
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Front counter"
          />
          <Input
            label="Port"
            value={serverPort}
            onChange={(e) => setServerPort(e.target.value)}
            placeholder="4747"
          />
          <div>
            <Input
              label="Access key (give this to cashier PCs)"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="Generated on save"
            />
            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void save({ regenerateAccessKey: true })}
              >
                Generate new key
              </Button>
            </div>
          </div>
          {status?.localAddresses?.length ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)]/50 p-3 text-xs">
              <div className="font-semibold">This PC addresses (type one on cashiers)</div>
              <ul className="mt-1 space-y-0.5 font-mono text-[var(--text-muted)]">
                {status.localAddresses.map((ip) => (
                  <li key={ip}>
                    {ip}:{serverPort || "4747"}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[var(--text-muted)]">
                Allow Agri Soft Pro through Windows Firewall if cashiers cannot connect.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {mode === "client" ? (
        <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <h3 className="text-sm font-semibold">Connect to main PC</h3>
          <Input
            label="Main PC address (IP)"
            value={clientHost}
            onChange={(e) => setClientHost(e.target.value)}
            placeholder="192.168.1.10"
          />
          <Input
            label="Port"
            value={clientPort}
            onChange={(e) => setClientPort(e.target.value)}
            placeholder="4747"
          />
          <Input
            label="Access key (from main PC)"
            value={clientAccessKey}
            onChange={(e) => setClientAccessKey(e.target.value)}
            placeholder="Ask shop admin"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void testConnection()}>
              Test connection
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refreshDiscover()}>
              <RefreshCw size={14} /> Find on Wi‑Fi
            </Button>
          </div>
          {discovered.length ? (
            <div className="rounded-xl border border-[var(--border)] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Found on LAN
              </div>
              <ul className="mt-2 space-y-2">
                {discovered.map((row) => (
                  <li key={`${row.host}:${row.port}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--bg-soft)]/60"
                      onClick={() => pickDiscovered(row)}
                    >
                      <span>
                        <span className="font-semibold">{row.name}</span>
                        <span className="ml-2 font-mono text-xs text-[var(--text-muted)]">
                          {row.host}:{row.port}
                        </span>
                      </span>
                      <span className="text-xs text-[var(--accent)]">Use</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              No main PC discovered yet — type the address, or wait after the main PC is set to “This PC is
              main”.
            </p>
          )}
        </section>
      ) : null}

      {mode === "standalone" ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <p className="text-sm text-[var(--text-muted)]">
            This PC keeps its own offline database. Switch to main or connect only when you need shared
            counters.
          </p>
        </section>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button disabled={busy || loading} onClick={() => void save()}>
          Save LAN mode
        </Button>
      </div>
    </div>
  );
}

export default function LanSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--text-muted)]">Loading…</div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
        <div className="mx-auto mb-6 flex max-w-3xl items-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={16} /> Back to login
          </Link>
        </div>
        <LanSettingsBody />
      </div>
    );
  }

  return (
    <AppShell title="Multi-PC (LAN)" subtitle="Share one shop database across counters on Wi‑Fi">
      <LanSettingsBody />
    </AppShell>
  );
}
