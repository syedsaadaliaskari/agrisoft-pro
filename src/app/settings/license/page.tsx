"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button, Input, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { LicensePlan, LicenseStatus } from "@shared/ipc";

export default function LicenseInfoPage() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    installId: "",
    plan: "forever" as LicensePlan,
    notes: "",
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

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setOkMsg("");
    const res = await getApi().createLicense({
      name: form.name,
      installId: form.installId,
      plan: form.plan,
      notes: form.notes || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg(`Activated ${res.data.plan} for ${res.data.name} (${res.data.installId})`);
    setForm({ name: "", installId: "", plan: "forever", notes: "" });
    await load();
  };

  const onExpireTrial = async () => {
    if (!confirm("Set trial as expired for THIS install? (for testing lock screen)")) return;
    setError("");
    const res = await getApi().expireTrialForTesting();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg("Trial expired for testing. Activate Pro with this Install ID to unlock again.");
    setStatus(res.data);
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
      subtitle="Your Install ID and activate companies"
      permission="platform.view"
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
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Copy this ID when you need it. Paste it into the form below only when you want to activate
            this PC (or paste a customer&apos;s ID to activate them).
          </p>
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
          <p className="sm:col-span-2 -mt-1 text-xs text-[var(--text-muted)]">
            Enter company name and Install ID, choose plan, then activate. Fields stay empty until you
            type or paste.
          </p>
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
              label="Notes (optional)"
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
      </div>
    </AppShell>
  );
}
