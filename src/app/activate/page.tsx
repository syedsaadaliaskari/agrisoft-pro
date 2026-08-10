"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  KeyRound,
  LogOut,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Alert, Button } from "@/components/ui/form";
import { InstallIdQr } from "@/components/license/InstallIdQr";
import { getApi } from "@/lib/api";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import { VENDOR_SUPPORT, whatsappActivationUrl } from "@shared/support";
import type { LicenseStatus } from "@shared/ipc";

export default function ActivatePage() {
  const router = useRouter();
  const { user, hydrated, hydrate, logout } = useAuthStore();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const canActivateLicense = hasAnyPermission(user, ["license.manage", "platform.view"]);
  const canViewActivated = hasAnyPermission(user, [
    "license.view",
    "license.manage",
    "platform.view",
  ]);
  const installId = status?.installId ?? "";

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
    if (!installId) return;
    try {
      await navigator.clipboard.writeText(installId);
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
      setOkMsg("Not activated yet. After the vendor activates this Install ID, tap Check again.");
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 55% at 15% 10%, var(--atmosphere-1), transparent), radial-gradient(ellipse 50% 40% at 90% 80%, var(--atmosphere-2), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 70% 70% at 50% 45%, black, transparent)",
        }}
      />

      <div className="relative z-10 w-full max-w-lg animate-[fadeIn_220ms_ease-out]">
        <div className="mb-6 text-center">
          <img
            src="/logo.png"
            alt="Agri Soft Pro"
            className="mx-auto mb-4 h-14 w-14 rounded-2xl object-cover shadow-lg shadow-[var(--accent)]/25 ring-1 ring-[var(--border)]"
          />
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Agri Soft Pro
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/95 p-6 shadow-2xl shadow-black/15 backdrop-blur sm:p-8">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <KeyRound size={20} />
            </div>
            <div>
              <h1
                className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Activate Pro
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
                Your 7-day trial has ended. Pay your vendor, then send them this Install ID
                (WhatsApp or message) so they can activate Monthly, Yearly, or Forever.
              </p>
            </div>
          </div>

          {error ? (
            <div className="mt-5">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          {okMsg ? (
            <div className="mt-5">
              <Alert tone="info">{okMsg}</Alert>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col items-center">
            {installId ? (
              <InstallIdQr installId={installId} size={200} />
            ) : (
              <div className="flex h-[232px] w-[232px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-soft)] text-sm text-[var(--text-muted)]">
                Loading ID…
              </div>
            )}
            <p className="mt-4 max-w-sm text-center text-xs leading-relaxed text-[var(--text-muted)]">
              Scan this QR with your phone camera or Google Lens to see your Install ID. Or copy
              the ID below and send it on WhatsApp.
            </p>
          </div>

          <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-soft)]/70 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Install ID
            </div>
            <div className="mt-2 break-all font-mono text-base font-semibold tracking-wide text-[var(--text)]">
              {installId || "—"}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void onCopy()} disabled={!installId}>
                <Copy size={14} /> {copied ? "Copied" : "Copy ID"}
              </Button>
              <Button
                variant="secondary"
                disabled={!installId}
                onClick={() => {
                  if (!installId) return;
                  window.open(whatsappActivationUrl(installId), "_blank", "noopener,noreferrer");
                }}
              >
                <MessageCircle size={14} /> {VENDOR_SUPPORT.label}
              </Button>
              <Button onClick={() => void onCheck()} disabled={busy}>
                <RefreshCw size={14} className={busy ? "animate-spin" : undefined} /> Check
                activation
              </Button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
              After payment, send this Install ID on WhatsApp ({VENDOR_SUPPORT.whatsappDisplay}). Your
              vendor activates Monthly / Yearly / Forever from Super Admin → Setup → License — you do
              not type a product key.
            </p>
          </div>

          {status?.isDevBypass ? (
            <p className="mt-4 text-xs text-[var(--accent)]">
              Dev mode: lock is bypassed while using <code>npm run dev</code>. Use a packaged
              install to test the real lock, or open License and use “Expire trial (test)”.
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-5">
            {canActivateLicense ? (
              <Button variant="secondary" size="sm" onClick={() => router.push("/settings/license")}>
                Setup → License
              </Button>
            ) : null}
            {canViewActivated ? (
              <Button size="sm" onClick={() => router.push("/platform/licenses")}>
                <ShieldCheck size={14} /> Activated list
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" className="ms-auto" onClick={() => void onLogout()}>
              <LogOut size={14} /> Logout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
