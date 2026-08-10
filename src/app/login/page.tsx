"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Languages, Moon, Sun } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/lib/theme";
import { isElectron } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";

export default function LoginPage() {
  const router = useRouter();
  const { user, hydrated, hydrate, login, loading } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [welcomeLine, setWelcomeLine] = useState(0);

  const welcomeLines = useMemo(
    () => [t("login.welcome1"), t("login.welcome2"), t("login.welcome3")],
    [t]
  );

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && user && !welcome) {
      setWelcome(true);
      const dest = user.mustChangePassword ? "/settings/password" : "/dashboard";
      const timer = setTimeout(() => router.replace(dest), 700);
      return () => clearTimeout(timer);
    }
  }, [hydrated, user, router, welcome]);

  useEffect(() => {
    if (!welcome && !submitting && !loading) return;
    const id = setInterval(() => {
      setWelcomeLine((i) => (i + 1) % welcomeLines.length);
    }, 900);
    return () => clearInterval(id);
  }, [welcome, submitting, loading, welcomeLines.length]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || loading || welcome) return;
    setError("");
    if (!username.trim() || !password) {
      setError(t("login.enterBoth"));
      return;
    }
    if (!isElectron()) {
      setError(t("login.needElectron"));
      return;
    }
    setSubmitting(true);
    setWelcome(true);
    try {
      const result = await login(username.trim(), password);
      if (result.ok) {
        await new Promise((r) => setTimeout(r, 650));
        router.replace(result.user.mustChangePassword ? "/settings/password" : "/dashboard");
      } else {
        setWelcome(false);
        setError(result.error ?? t("login.failed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const busy = loading || submitting || welcome;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 55% at 15% 10%, var(--atmosphere-1), transparent), radial-gradient(ellipse 50% 40% at 90% 80%, var(--atmosphere-2), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 70% 70% at 50% 45%, black, transparent)",
        }}
      />

      <div className="absolute end-4 top-4 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => setLocale((locale === "ur" ? "en" : "ur") as Locale)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]/90 px-3 py-1.5 text-xs text-[var(--text-muted)] backdrop-blur transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          title={t("lang.switch")}
        >
          <Languages size={14} />
          {locale === "ur" ? t("lang.english") : t("lang.urdu")}
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]/90 px-3 py-1.5 text-xs text-[var(--text-muted)] backdrop-blur transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          title={theme === "light" ? t("topbar.dark") : t("topbar.light")}
        >
          {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          {theme === "light" ? t("topbar.dark") : t("topbar.light")}
        </button>
      </div>

      {welcome ? (
        <div className="relative z-10 w-full max-w-md text-center animate-[fadeIn_280ms_ease-out]">
          <img
            src="/logo.png"
            alt="Agri Soft Pro"
            className="mx-auto mb-6 h-20 w-20 rounded-2xl object-cover shadow-lg shadow-[var(--accent)]/30 ring-1 ring-[var(--border)]"
          />
          <h1 className="text-2xl font-semibold tracking-tight">{t("login.welcome")}</h1>
          <p
            className="mt-3 text-sm text-[var(--text-muted)]"
            style={{ animation: "welcomePulse 1.6s ease-in-out infinite" }}
          >
            {welcomeLines[welcomeLine]}
          </p>
          <div className="mx-auto mt-8 flex max-w-xs justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1.5 w-8 rounded-full transition ${
                  welcomeLine === i ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                }`}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="relative w-full max-w-[400px] animate-[fadeIn_220ms_ease-out]">
          <div className="mb-8 text-center">
            <img
              src="/logo.png"
              alt="Agri Soft Pro"
              className="mx-auto mb-5 h-16 w-16 rounded-2xl object-cover shadow-lg shadow-[var(--accent)]/25 ring-1 ring-[var(--border)]"
            />
            <h1
              className="text-3xl font-semibold tracking-tight text-[var(--text)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("brand.name")} {t("brand.pro")}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{t("login.subtitle")}</p>
          </div>

          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/95 p-7 shadow-2xl shadow-black/15 backdrop-blur"
            autoComplete="off"
          >
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                {t("login.username")}
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none ring-[var(--accent)] focus:ring-1"
                autoComplete="username"
                autoFocus
                disabled={busy}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                {t("login.password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none ring-[var(--accent)] focus:ring-1"
                autoComplete="current-password"
                disabled={busy}
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--logo-ink)] transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {t("login.signIn")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
