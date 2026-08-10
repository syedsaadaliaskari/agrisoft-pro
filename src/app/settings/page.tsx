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
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState<AuditLogRow[]>([]);

  const applyMap = (map: SettingsMap) => {
    setForm({
      shop_name: map.shop_name ?? "",
      shop_phone: map.shop_phone ?? "",
      shop_address: map.shop_address ?? "",
      currency_symbol: map.currency_symbol ?? "Rs",
      currency_code: map.currency_code ?? "PKR",
      tax_mode: map.tax_mode ?? "exclusive",
      receipt_footer: map.receipt_footer ?? "",
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
  }, []);

  const loadAudit = useCallback(async () => {
    const res = await getApi().listAuditLogs({ limit: 8 });
    if (res.ok) setAudit(res.data.rows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

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
    setSuccess("Shop logo saved — it will appear on printed receipts");
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

  return (
    <AppShell title="Settings" subtitle="Shop profile, security, and shortcuts" permission="settings.manage">
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
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
                Update the password for your signed-in account.
              </p>
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
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
                Full activity history — search, filter, and export.
              </p>
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
                  Users & RBAC
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
                  Add users and tick which menus each role can see — including License & Activated
                  list.
                </p>
              </div>
            </Link>
          ) : null}
        </section>

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
            <div className="text-xs font-medium text-[var(--text-muted)]">Shop logo (receipts)</div>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Your shop brand on printed sales / purchase tickets — not the Agri Soft Pro app icon.
              PNG, JPG, or WebP under 1.5 MB.
            </p>
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
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
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
              Open full audit log →
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
