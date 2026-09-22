"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { OpsEmptyState } from "@/components/ops/DocumentWorkspace";
import { Alert, Button, DataTable, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { licenseEnded, licenseExpiresLabel, licenseStatusLabel } from "@/lib/vendorLicenseUi";
import {
  VENDOR_MESSAGE_TEMPLATES,
  fillVendorMessage,
  vendorWhatsAppUrl,
  whatsappDigits,
  type VendorMsgLang,
} from "@shared/vendorMessages";
import type { LicenseRow } from "@shared/ipc";

export default function VendorMessagesPage() {
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<VendorMsgLang>("en");
  const [templateId, setTemplateId] = useState("renewal_en");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "active" | "ended">("all");
  const [queue, setQueue] = useState<LicenseRow[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const list = await getApi().listLicenses();
    setLoading(false);
    if (!list.ok) {
      setError(list.error);
      return;
    }
    setRows(list.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const templates = useMemo(
    () => VENDOR_MESSAGE_TEMPLATES.filter((t) => t.lang === lang),
    [lang]
  );

  useEffect(() => {
    if (!templates.some((t) => t.id === templateId)) {
      setTemplateId(templates[0]?.id ?? "");
    }
  }, [templates, templateId]);

  const template = templates.find((t) => t.id === templateId) ?? templates[0];

  const visible = useMemo(() => {
    if (filter === "active") return rows.filter((r) => !licenseEnded(r));
    if (filter === "ended") return rows.filter((r) => licenseEnded(r));
    return rows;
  }, [rows, filter]);

  const selectedRows = visible.filter((r) => selected[r.id]);
  const withPhone = selectedRows.filter((r) => whatsappDigits(r.phone));
  const missingPhone = selectedRows.length - withPhone.length;

  const previewText = template
    ? fillVendorMessage(template.body, {
        name: withPhone[0]?.name || selectedRows[0]?.name || "Company",
        plan: withPhone[0]?.plan || selectedRows[0]?.plan || "yearly",
        expires: licenseExpiresLabel(withPhone[0] || selectedRows[0] || ({ plan: "forever" } as LicenseRow)),
      })
    : "";

  const toggle = (id: string, on: boolean) => {
    setSelected((prev) => ({ ...prev, [id]: on }));
  };

  const toggleAll = (on: boolean) => {
    const next: Record<string, boolean> = { ...selected };
    for (const row of visible) next[row.id] = on;
    setSelected(next);
  };

  const openRow = (row: LicenseRow) => {
    if (!template) return;
    const digits = whatsappDigits(row.phone);
    if (!digits) {
      setError(`No phone on ${row.name}`);
      return;
    }
    const text = fillVendorMessage(template.body, {
      name: row.name,
      plan: row.plan,
      expires: licenseExpiresLabel(row),
    });
    window.open(vendorWhatsAppUrl(row.phone ?? "", text), "_blank", "noopener,noreferrer");
    setOkMsg(`WhatsApp opened for ${row.name}. Tap Send.`);
    setError("");
  };

  const startQueue = () => {
    if (!withPhone.length) {
      setError("Select companies that have a phone number");
      return;
    }
    setQueue(withPhone);
    setQueueIndex(0);
    openRow(withPhone[0]);
  };

  const openNext = () => {
    const next = queueIndex + 1;
    if (next >= queue.length) {
      setOkMsg("All selected chats opened. Tap Send on each.");
      setQueue([]);
      setQueueIndex(0);
      return;
    }
    setQueueIndex(next);
    openRow(queue[next]);
  };

  return (
    <AppShell title="Messages" permission="license.view">
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

      <p className="mb-4 max-w-3xl text-sm text-[var(--text-muted)]">
        Free WhatsApp only. Pick companies, choose English or Urdu, then open WhatsApp with the
        message filled in. You tap Send. Nothing is billed and no SMS gateway is used.
      </p>

      <div className="mb-4 grid max-w-4xl gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 sm:grid-cols-3">
        <Select
          label="Language"
          value={lang}
          onChange={(e) => setLang(e.target.value as VendorMsgLang)}
          options={[
            { value: "en", label: "English" },
            { value: "ur", label: "Urdu" },
          ]}
        />
        <Select
          label="Template"
          value={template?.id ?? ""}
          onChange={(e) => setTemplateId(e.target.value)}
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
        />
        <Select
          label="Show"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "active" | "ended")}
          options={[
            { value: "all", label: "All companies" },
            { value: "active", label: "Active plans" },
            { value: "ended", label: "Ended plans" },
          ]}
        />
        <div className="sm:col-span-3">
          <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">Preview</p>
          <pre className="whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm">
            {previewText}
          </pre>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-3">
          <Button onClick={startQueue} disabled={!withPhone.length}>
            <MessageCircle size={14} /> Open WhatsApp ({withPhone.length})
          </Button>
          {queue.length > 0 ? (
            <Button variant="secondary" onClick={openNext}>
              Next ({Math.min(queueIndex + 1, queue.length)} / {queue.length})
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
          {missingPhone > 0 ? (
            <span className="text-xs text-[var(--text-muted)]">{missingPhone} selected have no phone</span>
          ) : null}
        </div>
      </div>

      {!loading && !visible.length ? (
        <OpsEmptyState title="No companies in this list" />
      ) : (
        <DataTable headers={["", "Company", "Phone", "Plan", "Ends", "Status", ""]} empty={false}>
          <tr className="border-b border-[var(--border)] bg-[var(--bg-soft)]/50">
            <td className="px-4 py-2" colSpan={7}>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={visible.length > 0 && visible.every((r) => selected[r.id])}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Select all on this list
              </label>
            </td>
          </tr>
          {visible.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={Boolean(selected[row.id])}
                  onChange={(e) => toggle(row.id, e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                  aria-label={`Select ${row.name}`}
                />
              </td>
              <td className="px-4 py-3 text-sm font-medium">{row.name}</td>
              <td className="px-4 py-3 text-sm">{row.phone || "—"}</td>
              <td className="px-4 py-3 text-sm capitalize">{row.plan}</td>
              <td className="px-4 py-3 text-sm">{licenseExpiresLabel(row)}</td>
              <td className="px-4 py-3 text-sm">
                <span className={licenseEnded(row) ? "text-[var(--danger)]" : "text-emerald-600"}>
                  {licenseStatusLabel(row)}
                </span>
              </td>
              <td className="px-4 py-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openRow(row)}
                  disabled={!whatsappDigits(row.phone)}
                >
                  <MessageCircle size={14} /> WhatsApp
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </AppShell>
  );
}
