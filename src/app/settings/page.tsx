"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button, DataTable, Input, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { AuditLogRow, SettingsMap } from "@shared/ipc";

function monthStartIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SettingsPage() {
  const [form, setForm] = useState({
    shop_name: "",
    shop_phone: "",
    shop_address: "",
    currency_symbol: "Rs",
    currency_code: "PKR",
    tax_mode: "exclusive",
    receipt_footer: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState<AuditLogRow[]>([]);
  const [fromDate, setFromDate] = useState(monthStartIsoDate());
  const [toDate, setToDate] = useState(todayIsoDate());

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
    const res = await getApi().listAuditLogs({ fromDate, toDate, limit: 50 });
    if (res.ok) setAudit(res.data);
  }, [fromDate, toDate]);

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

  return (
    <AppShell title="Settings" subtitle="Shop profile, receipt, and audit log" permission="settings.manage">
      <div className="space-y-6">
        {error ? <Alert>{error}</Alert> : null}
        {success ? <Alert tone="info">{success}</Alert> : null}

        <form
          onSubmit={onSave}
          className="grid max-w-3xl gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 sm:grid-cols-2"
        >
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-sm font-semibold">Audit log</h2>
            <div className="flex flex-wrap items-end gap-2">
              <Input label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              <Button type="button" variant="secondary" onClick={() => void loadAudit()}>
                Refresh
              </Button>
            </div>
          </div>
          <DataTable headers={["When", "User", "Module", "Action", "Details"]} empty={!audit.length}>
            {audit.map((row) => (
              <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 text-[var(--text-muted)]">
                  {row.createdAt.replace("T", " ").slice(0, 19)}
                </td>
                <td className="px-4 py-2.5">{row.username ?? "—"}</td>
                <td className="px-4 py-2.5">{row.module}</td>
                <td className="px-4 py-2.5">{row.action}</td>
                <td className="px-4 py-2.5 text-[var(--text-muted)]">{row.details ?? "—"}</td>
              </tr>
            ))}
          </DataTable>
        </section>
      </div>
    </AppShell>
  );
}
