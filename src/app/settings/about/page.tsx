"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Languages,
  MessageCircle,
  Package,
  ShoppingCart,
  Users,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { VENDOR_SUPPORT, whatsappVendorHelpUrl } from "@shared/support";

const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: "about.feature.sales", icon: ShoppingCart },
  { key: "about.feature.stock", icon: Package },
  { key: "about.feature.parties", icon: Users },
  { key: "about.feature.ledgers", icon: BookOpen },
  { key: "about.feature.reports", icon: BarChart3 },
  { key: "about.feature.language", icon: Languages },
  { key: "about.feature.offline", icon: WifiOff },
];

export default function AboutPage() {
  const { t } = useI18n();
  const [version, setVersion] = useState("—");

  const load = useCallback(async () => {
    try {
      const info = await getApi().getAppInfo();
      setVersion(info.version || "—");
    } catch {
      setVersion("—");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onWhatsApp = () => {
    window.open(whatsappVendorHelpUrl(), "_blank", "noopener,noreferrer");
  };

  return (
    <AppShell title="About" adminOnly>
      <div className="mx-auto max-w-4xl">
        <section className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="pointer-events-none absolute -end-24 -top-24 h-64 w-64 rounded-full bg-[var(--accent-soft)]" />
          <div
            className="pointer-events-none absolute -start-16 bottom-0 h-48 w-48 rounded-full"
            style={{ background: "var(--atmosphere-2)" }}
          />
          <div className="relative grid gap-8 p-8 sm:p-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
                {t("about.house")}
              </p>
              <div className="mt-4 flex items-center gap-4">
                <img
                  src="/logo-mark.png"
                  alt=""
                  className="h-14 w-14 shrink-0 object-contain"
                />
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">Agri Soft Pro</h1>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
                    {t("about.tagline")}
                  </p>
                </div>
              </div>
              <p className="mt-6 inline-flex rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--text-muted)]">
                {t("about.version")} {version} · {t("about.desktop")}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/80 p-5 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {t("about.houseLine")}
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{t("about.house")}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{t("about.productOf")}</p>
            </div>
          </div>
        </section>

        <section className="mt-5">
          <h2 className="mb-3 text-sm font-semibold">{t("about.includes")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <span className="text-sm">{t(key)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
            <h2 className="text-lg font-semibold tracking-tight">{t("about.aboutUsTitle")}</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">{t("about.aboutUsBody")}</p>
            <div className="mt-6 space-y-4 border-t border-[var(--border)] pt-5">
              <div>
                <h3 className="text-sm font-semibold">{t("about.dataTitle")}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{t("about.dataBody")}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t("about.licenseTitle")}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{t("about.licenseBody")}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t("about.helpTitle")}</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">{t("about.helpHint")}</p>
            </div>
            <Button type="button" className="mt-6 w-full" onClick={onWhatsApp}>
              <MessageCircle size={15} /> {t("about.whatsapp")} {VENDOR_SUPPORT.aboutWhatsappDisplay}
            </Button>
          </div>
        </section>

        <footer className="mt-8 border-t border-[var(--border)] pt-6 text-center">
          <p className="text-sm font-semibold tracking-[0.16em] text-[var(--accent)]">{t("about.house")}</p>
          <p className="mt-2 text-sm text-[var(--text)]">{t("about.rights")}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t("about.productOf")}</p>
        </footer>
      </div>
    </AppShell>
  );
}
