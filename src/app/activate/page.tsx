"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { Alert, Button } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type { LicenseStatus } from "@shared/ipc";

export default function ActivatePage() {
  const router = useRouter();
  const { user, hydrated, hydrate, logout } = useAuthStore();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const isPlatform = hasPermission(user, "platform.view");

  const load = useCallback(async () => {
    const res = await getApi().getLicenseStatus();
    if (!res.ok) {
      setError(res.error);
      setStatus(null);
      return;
    }
    setStatus(res.data);
    if (res.data.allowed) {
      router.replace("/dashboard");
    }
  }, [router]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && !user) {
      router.replace("/login");
      return;
    }
    if (user) void load();
  }, [hydrated, user, router, load]);

  const onCopy = async () => {
    if (!status?.installId) return;
    try {
      await navigator.clipboard.writeText(status.installId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy — select and copy manually");
    }
  };

  const onCheck = async () => {
    setBusy(true);
    setError("");
    setOkMsg("");
    await load();
    setBusy(false);
    const res = await getApi().getLicenseStatus();
    if (res.ok && res.data.allowed) {
      setOkMsg("Pro activated — opening dashboard…");
      router.replace("/dashboard");
    } else {
      setOkMsg("Not activated yet. Add this Install ID under Licenses (Super Admin), then check again.");
    }
  };

  const onLogout = async () => {
    await logout();
    router.replace("/login");
  };

  if (!hydrated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <KeyRound size={22} />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Activate Pro</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Your 7-day trial has ended. Send this Install ID to your vendor after payment, or activate it
          yourself if you are Super Admin.
        </p>

        {error ? (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        {okMsg ? (
          <div className="mt-4">
            <Alert tone="info">{okMsg}</Alert>
          </div>
        ) : null}

        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-soft)]/60 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Install ID
          </div>
          <div className="mt-2 break-all font-mono text-sm font-semibold text-[var(--text)]">
            {status?.installId ?? "—"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void onCopy()} disabled={!status}>
              <Copy size={14} /> {copied ? "Copied" : "Copy ID"}
            </Button>
            <Button size="sm" onClick={() => void onCheck()} disabled={busy}>
              <RefreshCw size={14} /> Check activation
            </Button>
          </div>
        </div>

        {status?.isDevBypass ? (
          <p className="mt-3 text-xs text-[var(--accent)]">
            Dev mode: lock is bypassed while using <code>npm run dev</code>. Use a packaged install to
            test the real lock, or open Licenses and use “Expire trial (test)”.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {isPlatform ? (
            <>
              <Button variant="secondary" onClick={() => router.push("/settings/license")}>
                Setup → License (activate)
              </Button>
              <Button onClick={() => router.push("/platform/licenses")}>
                <ShieldCheck size={14} /> Activated list
              </Button>
            </>
          ) : null}
          <Button variant="ghost" onClick={() => void onLogout()}>
            <LogOut size={14} /> Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
