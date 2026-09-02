"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, ImagePlus, KeyRound, Shield } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button, DataTable, Input, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { formatAuditAction, formatAuditModule, formatAuditWhen } from "@/lib/auditLabels";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import type { AuditLogRow, SettingsMap } from "@shared/ipc";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const canManageUsers = hasPermission(user, "users.manage");
  const [form, setForm] = useState({
    shop_name: "",
    shop_phone: "",
    shop_address: "",
    currency_symbol: "Rs",
    currency_code: "PKR",
    tax_mode: "exclusive",
    receipt_footer: "",
    n8n_enabled: "0",
    n8n_webhook_url: "",
    n8n_payment_days_before: "3",
    n8n_min_due_amount: "1",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [n8nBusy, setN8nBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncInfo, setSyncInfo] = useState<{
    configured: boolean;
    url: string;
    tenantId: string;
    tenantSource: "activation" | "env" | "";
    lastSyncAt: string | null;
    lastError: string | null;
    localCustomerCount: number;
  } | null>(null);
  const [vendorCode, setVendorCode] = useState("");
  const [vendorBusy, setVendorBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [cashOpening, setCashOpening] = useState("0");
  const [bankOpening, setBankOpening] = useState("0");
  const [openingBusy, setOpeningBusy] = useState(false);
  const [audit, setAudit] = useState<AuditLogRow[]>([]);
  const hydrate = useAuthStore((s) => s.hydrate);
  const isSuperAdmin = user?.roleName === "Super Admin";

  const applyMap = (map: SettingsMap) => {
    setForm({
      shop_name: map.shop_name ?? "",
      shop_phone: map.shop_phone ?? "",
      shop_address: map.shop_address ?? "",
      currency_symbol: map.currency_symbol ?? "Rs",
      currency_code: map.currency_code ?? "PKR",
      tax_mode: map.tax_mode ?? "exclusive",
      receipt_footer: map.receipt_footer ?? "",
      n8n_enabled: map.n8n_enabled === "1" ? "1" : "0",
      n8n_webhook_url: map.n8n_webhook_url ?? "",
      n8n_payment_days_before: map.n8n_payment_days_before || "3",
      n8n_min_due_amount: map.n8n_min_due_amount || "1",
    });
    setLogoPreview(map.shop_logo_data_url || null);
  };

  const load = useCallback(async () => {
    setError("");
    const res = await getApi().getSettings();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    applyMap(res.data);
    const books = await getApi().listAccounts({ cashBankOnly: true, activeOnly: true });
    if (books.ok) {
      const cash = books.data.find((a) => a.code === "1100");
      const bank = books.data.find((a) => a.code === "1200");
      setCashOpening(String(cash?.openingBalance ?? 0));
      setBankOpening(String(bank?.openingBalance ?? 0));
    }
  }, []);

  const loadAudit = useCallback(async () => {
    const res = await getApi().listAuditLogs({ limit: 8 });
    if (res.ok) setAudit(res.data.rows);
  }, []);

  const loadSync = useCallback(async () => {
    const res = await getApi().getCloudSyncStatus();
    if (res.ok) setSyncInfo(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  useEffect(() => {
    void loadSync();
  }, [loadSync]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const res = await getApi().updateSettings(form);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    applyMap(res.data);
    setSuccess("Settings saved");
    void loadAudit();
  };

  const onSaveOpenings = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpeningBusy(true);
    setError("");
    setSuccess("");
    const res = await getApi().setCashBankOpenings({
      cashOpening: Number(cashOpening || 0),
      bankOpening: Number(bankOpening || 0),
    });
    setOpeningBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCashOpening(String(res.data.cashOpening));
    setBankOpening(String(res.data.bankOpening));
    setSuccess("Saved");
    void loadAudit();
  };

  const onLogoPick = async (file: File | null) => {
    if (!file) return;
    setError("");
    setSuccess("");
    if (!file.type.startsWith("image/")) {
      setError("Choose a PNG, JPG, or WebP image");
      return;
    }
    if (file.size > 1_500_000) {
      setError("Logo must be under 1.5 MB");
      return;
    }
    setLogoBusy(true);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    }).catch(() => null);
    if (!dataUrl) {
      setLogoBusy(false);
      setError("Could not read image file");
      return;
    }
    const res = await getApi().setShopLogo(dataUrl);
    setLogoBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    applyMap(res.data);
    setSuccess("Saved");
    void loadAudit();
  };

  const onClearLogo = async () => {
    setLogoBusy(true);
    setError("");
    setSuccess("");
    const res = await getApi().clearShopLogo();
    setLogoBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    applyMap(res.data);
    setSuccess("Shop logo removed");
    void loadAudit();
  };

  const onN8nFlush = async () => {
    setN8nBusy(true);
    setError("");
    setSuccess("");
    const res = await getApi().flushN8nQueue();
    setN8nBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(
      `n8n: enqueued ${res.data.enqueued}, sent ${res.data.sent}, remaining ${res.data.remaining}${
        res.data.error ? ` (${res.data.error})` : ""
      }`
    );
  };

  const onN8nTest = async () => {
    setN8nBusy(true);
    setError("");
    setSuccess("");
    const res = await getApi().testN8nWebhook(form.shop_phone || null);
    setN8nBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(
      `Test webhook: sent ${res.data.sent}, remaining ${res.data.remaining}${
        res.data.error ? ` — ${res.data.error}` : ""
      }`
    );
  };

  const onCloudSync = async () => {
    setSyncBusy(true);
    setError("");
    setSuccess("");
    const res = await getApi().runCloudSyncNow();
    setSyncBusy(false);
    void loadSync();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess("Cloud sync finished. Shop data is up to date.");
  };

  const onVendorUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setVendorBusy(true);
    setError("");
    setSuccess("");
    const res = await getApi().vendorUnlock(vendorCode);
    setVendorBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setVendorCode("");
    setSuccess("Unlocked");
    await hydrate();
  };

  return (
    <AppShell title="Settings" permission="settings.manage">
      <div className="space-y-6">
        {error ? <Alert>{error}</Alert> : null}
        {success ? <Alert tone="info">{success}</Alert> : null}

        <section className="grid max-w-3xl gap-3 sm:grid-cols-2">
          <Link
            href="/settings/password"
            className="group flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/30"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <KeyRound size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--accent)]">
                Change password
              </div>
            </div>
          </Link>
          <Link
            href="/settings/audit"
            className="group flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/30"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <ClipboardList size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--accent)]">
                Audit log
              </div>
            </div>
          </Link>
          {canManageUsers ? (
            <Link
              href="/settings/users"
              className="group flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/30 sm:col-span-2"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <Shield size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--accent)]">
                  Users
                </div>
              </div>
            </Link>
          ) : null}
        </section>

        {!isSuperAdmin ? (
          <form
            onSubmit={(e) => void onVendorUnlock(e)}
            className="max-w-3xl space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5"
          >
            <div className="text-sm font-semibold">Vendor unlock</div>
            <Input
              label="Vendor unlock code"
              type="password"
              value={vendorCode}
              onChange={(e) => setVendorCode(e.target.value)}
              autoComplete="off"
              required
            />
            <Button type="submit" disabled={vendorBusy || !vendorCode.trim()}>
              {vendorBusy ? "Unlocking…" : "Unlock Super Admin"}
            </Button>
          </form>
        ) : (
          <div className="max-w-3xl rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 px-5 py-3 text-sm text-[var(--text)]">
            Super Admin
          </div>
        )}

        <form
          onSubmit={onSave}
          className="grid max-w-3xl gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-2 text-sm font-semibold">Company / shop details</div>
          <Input
            label="Shop name"
            value={form.shop_name}
            onChange={(e) => setForm((f) => ({ ...f, shop_name: e.target.value }))}
          />
          <Input
            label="Phone"
            value={form.shop_phone}
            onChange={(e) => setForm((f) => ({ ...f, shop_phone: e.target.value }))}
          />
          <div className="sm:col-span-2">
            <Input
              label="Address"
              value={form.shop_address}
              onChange={(e) => setForm((f) => ({ ...f, shop_address: e.target.value }))}
            />
          </div>
          <Input
            label="Currency symbol"
            value={form.currency_symbol}
            onChange={(e) => setForm((f) => ({ ...f, currency_symbol: e.target.value }))}
          />
          <Input
            label="Currency code"
            value={form.currency_code}
            onChange={(e) => setForm((f) => ({ ...f, currency_code: e.target.value }))}
          />
          <Select
            label="Tax mode"
            value={form.tax_mode}
            onChange={(e) => setForm((f) => ({ ...f, tax_mode: e.target.value }))}
            options={[
              { value: "exclusive", label: "Exclusive (tax added)" },
              { value: "inclusive", label: "Inclusive (tax in price)" },
            ]}
          />
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-[var(--text-muted)]">Shop logo</div>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">PNG, JPG, or WebP. Max 1.5 MB.</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="flex h-20 w-28 items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-soft)]">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Shop logo" className="max-h-16 max-w-[6.5rem] object-contain" />
                ) : (
                  <ImagePlus size={22} className="text-[var(--text-muted)]" />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-3.5 py-2 text-sm font-medium text-[var(--text)] hover:border-[var(--border-strong)]">
                  {logoBusy ? "Saving…" : logoPreview ? "Replace logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={logoBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      void onLogoPick(file);
                    }}
                  />
                </label>
                {logoPreview ? (
                  <Button type="button" variant="ghost" disabled={logoBusy} onClick={() => void onClearLogo()}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Input
              label="Receipt footer"
              value={form.receipt_footer}
              onChange={(e) => setForm((f) => ({ ...f, receipt_footer: e.target.value }))}
            />
          </div>

          <div className="sm:col-span-2 border-t border-[var(--border)] pt-4 text-sm font-semibold">
            Cloud sync
          </div>
          <div className="sm:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--bg-soft)]/40 px-3 py-3 text-xs text-[var(--text-muted)]">
            {syncInfo?.configured ? (
              <>
                <div>
                  Last sync:{" "}
                  <span className="text-[var(--text)]">
                    {syncInfo.lastSyncAt ? new Date(syncInfo.lastSyncAt).toLocaleString() : "Never"}
                  </span>
                </div>
                {syncInfo.lastError ? (
                  <div className="mt-1 text-[var(--danger)]">{syncInfo.lastError}</div>
                ) : null}
              </>
            ) : (
              <div>Cloud sync is not set up on this PC.</div>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={syncBusy || !syncInfo?.configured}
              onClick={() => void onCloudSync()}
            >
              {syncBusy ? "Syncing…" : "Sync now"}
            </Button>
          </div>

          <div className="sm:col-span-2 border-t border-[var(--border)] pt-4 text-sm font-semibold">
            WhatsApp
          </div>
          <Select
            label="Enabled"
            value={form.n8n_enabled}
            onChange={(e) => setForm((f) => ({ ...f, n8n_enabled: e.target.value }))}
            options={[
              { value: "0", label: "Off" },
              { value: "1", label: "On" },
            ]}
          />
          <Input
            label="Remind license (days before expiry)"
            value={form.n8n_payment_days_before}
            onChange={(e) => setForm((f) => ({ ...f, n8n_payment_days_before: e.target.value }))}
          />
          <div className="sm:col-span-2">
            <Input
              label="Webhook URL"
              value={form.n8n_webhook_url}
              onChange={(e) => setForm((f) => ({ ...f, n8n_webhook_url: e.target.value }))}
            />
          </div>
          <Input
            label="Min customer due to remind"
            value={form.n8n_min_due_amount}
            onChange={(e) => setForm((f) => ({ ...f, n8n_min_due_amount: e.target.value }))}
          />
          <div className="flex flex-wrap items-end gap-2">
            <Button type="button" variant="secondary" disabled={n8nBusy} onClick={() => void onN8nTest()}>
              {n8nBusy ? "…" : "Send test"}
            </Button>
            <Button type="button" variant="ghost" disabled={n8nBusy} onClick={() => void onN8nFlush()}>
              Flush now
            </Button>
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>

        <form
          onSubmit={(e) => void onSaveOpenings(e)}
          className="grid max-w-3xl gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-2 text-sm font-semibold">Opening cash & bank</div>
          <Input
            label="Opening cash"
            type="number"
            min={0}
            step="0.01"
            value={cashOpening}
            onChange={(e) => setCashOpening(e.target.value)}
          />
          <Input
            label="Opening bank"
            type="number"
            min={0}
            step="0.01"
            value={bankOpening}
            onChange={(e) => setBankOpening(e.target.value)}
          />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={openingBusy}>
              {openingBusy ? "Saving…" : "Save opening cash & bank"}
            </Button>
          </div>
        </form>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Latest activity</h2>
            <Link
              href="/settings/audit"
              className="text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Open audit log
            </Link>
          </div>
          <DataTable headers={["When", "User", "Module", "Action", "Details"]} empty={!audit.length}>
            {audit.map((row) => (
              <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 text-[var(--text-muted)]">
                  {formatAuditWhen(row.createdAt)}
                </td>
                <td className="px-4 py-2.5">{row.username ?? "—"}</td>
                <td className="px-4 py-2.5">{formatAuditModule(row.module)}</td>
                <td className="px-4 py-2.5">{formatAuditAction(row.action)}</td>
                <td className="px-4 py-2.5 text-[var(--text-muted)]">{row.details ?? "—"}</td>
              </tr>
            ))}
          </DataTable>
        </section>
      </div>
    </AppShell>
  );
}
