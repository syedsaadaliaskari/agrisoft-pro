"use client";

import { Languages, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useRouter } from "next/navigation";
import { isElectron } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";

type TopbarProps = {
  title: string;
  subtitle?: string;
};

export function Topbar({ title, subtitle }: TopbarProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();

  const onLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const toggleLanguage = () => {
    setLocale((locale === "ur" ? "en" : "ur") as Locale);
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)]/80 px-6 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold text-[var(--text)]">{title}</h1>
        {subtitle ? <p className="text-xs text-[var(--text-muted)]">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleLanguage}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          title={t("lang.switch")}
        >
          <Languages size={14} />
          <span className="hidden sm:inline">{locale === "ur" ? t("lang.english") : t("lang.urdu")}</span>
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          title={theme === "light" ? t("topbar.dark") : t("topbar.light")}
        >
          {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          <span className="hidden sm:inline">{theme === "light" ? t("topbar.dark") : t("topbar.light")}</span>
        </button>
        <div className="hidden items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] sm:flex">
          <Monitor size={12} />
          {isElectron() ? t("topbar.desktop") : t("topbar.browser")}
        </div>
        <div className="text-end">
          <div className="text-sm font-medium">{user?.fullName ?? t("topbar.guest")}</div>
          <div className="text-[11px] text-[var(--text-muted)]">{user?.roleName ?? "—"}</div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
        >
          <LogOut size={14} />
          {t("topbar.logout")}
        </button>
      </div>
    </header>
  );
}
