"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button, Input, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { LicensePlan, LicenseStatus } from "@shared/ipc";

export default function LicenseInfoPage() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    installId: "",
    plan: "forever" as LicensePlan,
    notes: "",
    phone: "",
  });

  const load = useCallback(async () => {
    setError("");
    const res = await getApi().getLicenseStatus();
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

  const onCopy = async () => {
    if (!status?.installId) return;
    try {
      await navigator.clipboard.writeText(status.installId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy");
    }
  };

  const onCopyCode = async () => {
    if (!lastCode) return;
    try {
      await navigator.clipboard.writeText(lastCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1500);
    } catch {
      setError("Could not copy activation code");
    }
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setOkMsg("");
    setLastCode("");
    const res = await getApi().createLicense({
      name: form.name,
      installId: form.installId,
      plan: form.plan,
      notes: form.notes || null,
      phone: form.phone || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLastCode(res.data.activationCode);
    setOkMsg(`Activated ${res.data.plan} for ${res.data.name}. Copy the activation code and send it.`);
    setForm({ name: "", installId: "", plan: "forever", notes: "", phone: "" });
    await load();
  };

  const forceQrLockScreen = async (next: LicenseStatus) => {
    setStatus(next);
    if (!next.allowed) {
      await logout();
      router.replace("/activate");
    }
  };

  const onExpireTrial = async () => {
    if (!confirm("Set trial as expired for THIS install? (for testing lock screen)")) return;
    setError("");
    const res = await getApi().expireTrialForTesting();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.data.allowed) {
      setOkMsg(
        `Trial date expired, but Status is still ${res.data.mode === "pro" ? "Pro" : "open"}. Use “Stop access now” to remove Pro and show the QR lock screen.`
      );
      setStatus(res.data);
      return;
    }
    setOkMsg("Locked — opening Activate Pro (QR)…");
    await forceQrLockScreen(res.data);
  };

  const onLockNow = async () => {
    if (
      !confirm(
        "Stop access on THIS PC now?\n\nRemoves Pro for this Install ID and shows the Activate / QR lock screen immediately. Unlock later by sending yourself a fresh activation code from another Super Admin PC, or activate again before locking."
      )
    ) {
      return;
    }
    setError("");
    const res = await getApi().lockThisInstallNow();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg("Access stopped. Opening lock screen…");
    await forceQrLockScreen(res.data);
  };

  const modeLabel =
    status?.mode === "pro"
      ? `Pro (${status.plan ?? "—"})`
      : status?.mode === "trial"
        ? `Trial — ${status.trialDaysLeft} day(s) left`
        : "Locked — activate Pro";

  return (
    <AppShell
      title="License"
      subtitle="Activate companies and send them an activation code"
      permission="license.manage"
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

      <div className="space-y-5">
        <section className="max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <div className="flex items-center gap-2 text-[var(--accent)]">
            <KeyRound size={18} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">This install</span>
          </div>
          <h2 className="mt-2 text-lg font-semibold">Install ID</h2>
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-soft)]/60 px-3 py-3 font-mono text-sm font-semibold">
            {status?.installId ?? "…"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void onCopy()} disabled={!status}>
              <Copy size={14} /> {copied ? "Copied" : "Copy Install ID"}
            </Button>
            <Button variant="ghost" onClick={() => void load()}>
              Refresh
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onExpireTrial()}>
              Expire trial (test)
            </Button>
            <Button type="button" variant="danger" onClick={() => void onLockNow()}>
              Stop access now
            </Button>
          </div>
          <div className="mt-4 space-y-1 text-sm text-[var(--text-muted)]">
            <div>
              <span className="font-medium text-[var(--text)]">Status: </span>
              {modeLabel}
            </div>
            <div>
              <span className="font-medium text-[var(--text)]">Installed: </span>
              {status?.installedAt ?? "—"}
            </div>
            <div>
              <span className="font-medium text-[var(--text)]">Trial ends: </span>
              {status?.trialEndsAt ?? "—"}
            </div>
            {status?.expiresAt ? (
              <div>
                <span className="font-medium text-[var(--text)]">Pro expires: </span>
                {status.expiresAt}
              </div>
            ) : null}
          </div>
        </section>

        <form
          onSubmit={onCreate}
          className="grid max-w-3xl gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-2 text-sm font-semibold">Activate a company</div>
          <Input
            label="Company / name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Select
            label="Plan"
            value={form.plan}
            onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value as LicensePlan }))}
            options={[
              { value: "forever", label: "Forever" },
              { value: "yearly", label: "Yearly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
          <div className="sm:col-span-2">
            <Input
              label="Install ID"
              value={form.installId}
              onChange={(e) => setForm((f) => ({ ...f, installId: e.target.value }))}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              label="Customer WhatsApp (for n8n auto-send)"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              <Plus size={14} /> {saving ? "Saving…" : "Activate Pro"}
            </Button>
          </div>
        </form>

        {lastCode ? (
          <section className="max-w-3xl rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent-soft)]/40 p-5">
            <div className="text-sm font-semibold text-[var(--text)]">Activation code — send on WhatsApp</div>
            <div className="mt-3 break-all rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 font-mono text-xs leading-relaxed">
              {lastCode}
            </div>
            <div className="mt-3">
              <Button variant="secondary" onClick={() => void onCopyCode()}>
                <Copy size={14} /> {copiedCode ? "Copied" : "Copy activation code"}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
