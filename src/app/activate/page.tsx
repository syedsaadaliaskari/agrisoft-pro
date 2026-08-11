"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, MessageCircle, RefreshCw } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui/form";
import { InstallIdQr } from "@/components/license/InstallIdQr";
import { getApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { VENDOR_SUPPORT, whatsappActivationUrl } from "@shared/support";
import type { LicenseStatus } from "@shared/ipc";

export default function ActivatePage() {
  const router = useRouter();
  const { hydrated, hydrate, logout } = useAuthStore();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activationCode, setActivationCode] = useState("");

  const installId = status?.installId ?? "";

  const goLoginAfterUnlock = useCallback(async () => {
    await logout();
    router.replace("/login");
  }, [logout, router]);

  const load = useCallback(async () => {
    const res = await getApi().getLicenseStatus();
    if (!res.ok) {
      setError(res.error);
      setStatus(null);
      return res;
    }
    setStatus(res.data);
    if (res.data.allowed) {
      setOkMsg("Pro is active. Opening login…");
      await goLoginAfterUnlock();
    }
    return res;
  }, [goLoginAfterUnlock]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

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
    const res = await load();
    setBusy(false);
    if (res && res.ok && !res.data.allowed) {
      setOkMsg("Still locked. Paste the activation code your vendor sent, then tap Activate.");
    }
  };

  const onApplyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationCode.trim()) {
      setError("Paste the activation code from your vendor");
      return;
    }
    setBusy(true);
    setError("");
    setOkMsg("");
    const res = await getApi().applyActivationCode(activationCode.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (!res.data.allowed) {
      setError("Code applied but this PC is still locked. Contact your vendor.");
      setStatus(res.data);
      return;
    }
    setOkMsg("Activated. Opening login…");
    await goLoginAfterUnlock();
  };

  if (!hydrated && !status) {
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
                Send your Install ID to the vendor. When they reply with an activation code, paste it
                below — then use the normal login screen.
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
              Scan this QR or copy the Install ID and send it on WhatsApp ({VENDOR_SUPPORT.whatsappDisplay}).
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
              </Button>
            </div>
          </div>

          <form
            onSubmit={(e) => void onApplyCode(e)}
            className="mt-5 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-4"
          >
            <div className="text-sm font-semibold">Activation code from vendor</div>
            <Input
              label="Paste code"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value)}
              placeholder="ASP1.…"
              autoComplete="off"
            />
            <Button type="submit" disabled={busy || !activationCode.trim()}>
              Activate with code
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
