"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Button } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { VENDOR_SUPPORT, whatsappVendorHelpUrl } from "@shared/support";
import type { LicenseStatus } from "@shared/ipc";

const FEATURE_KEYS = [
  "about.feature.sales",
  "about.feature.stock",
  "about.feature.parties",
  "about.feature.ledgers",
  "about.feature.reports",
  "about.feature.language",
  "about.feature.offline",
] as const;

function planLabel(status: LicenseStatus | null, t: (key: string) => string): string {
  if (!status) return "—";
  if (status.mode === "pro") {
    if (status.plan === "forever") return t("about.planForever");
    if (status.plan === "yearly") return t("about.planYearly");
    if (status.plan === "monthly") return t("about.planMonthly");
    return t("about.planPro");
  }
  if (status.mode === "trial") return t("about.planTrial");
  return t("about.planLocked");
}

function validUntil(status: LicenseStatus | null, t: (key: string) => string): string {
  if (!status) return "—";
  if (status.mode === "pro" && (status.plan === "forever" || !status.expiresAt)) {
    return t("about.never");
  }
  if (status.expiresAt) return status.expiresAt;
  if (status.mode === "trial" && status.trialEndsAt) return status.trialEndsAt;
  return "—";
}

export default function AboutPage() {
  const { t } = useI18n();
  const [version, setVersion] = useState("—");
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const [info, license] = await Promise.all([getApi().getAppInfo(), getApi().getLicenseStatus()]);
    setVersion(info.version || "—");
    if (!license.ok) {
      setError(license.error);
      return;
    }
    setStatus(license.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCopyId = async () => {
    if (!status?.installId) return;
    try {
      await navigator.clipboard.writeText(status.installId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t("about.copyFailed"));
    }
  };

  const onWhatsApp = () => {
    window.open(whatsappVendorHelpUrl(status?.installId), "_blank", "noopener,noreferrer");
  };

  return (
    <AppShell title="About" adminOnly>
      <div className="mx-auto max-w-2xl space-y-5">
        {error ? <Alert>{error}</Alert> : null}

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 text-center">
          <img
            src="/logo.png"
            alt="Agri Soft Pro"
            className="mx-auto h-auto w-44 object-contain"
          />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Agri Soft Pro</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{t("about.tagline")}</p>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {t("about.version")}: {version} · {t("about.desktop")}
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <h2 className="text-sm font-semibold">{t("about.helpTitle")}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t("about.helpHint")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={onWhatsApp}>
              <MessageCircle size={14} /> {t("about.whatsapp")} {VENDOR_SUPPORT.aboutWhatsappDisplay}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <h2 className="text-sm font-semibold">{t("about.thisPc")}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-muted)]">{t("about.plan")}</dt>
              <dd className="font-medium">{planLabel(status, t)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-muted)]">{t("about.validUntil")}</dt>
              <dd className="font-medium">{validUntil(status, t)}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="pt-1 text-[var(--text-muted)]">{t("about.installId")}</dt>
              <dd className="text-right font-mono text-xs font-semibold">{status?.installId ?? "—"}</dd>
            </div>
          </dl>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => void onCopyId()} disabled={!status?.installId}>
              <Copy size={14} /> {copied ? t("about.copied") : t("about.copyId")}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <h2 className="text-sm font-semibold">{t("about.includes")}</h2>
          <ul className="mt-3 list-disc space-y-1.5 ps-5 text-sm text-[var(--text)]">
            {FEATURE_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <h2 className="text-sm font-semibold">{t("about.dataTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{t("about.dataBody")}</p>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <h2 className="text-sm font-semibold">{t("about.licenseTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{t("about.licenseBody")}</p>
        </section>

        <p className="px-1 text-center text-xs text-[var(--text-muted)]">{t("about.credit")}</p>
      </div>
    </AppShell>
  );
}
