"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun, Sprout } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/lib/theme";
import { isElectron } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { user, hydrated, hydrate, login, loading } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && user) {
      router.replace("/dashboard");
    }
  }, [hydrated, user, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || loading) return;
    setError("");
    if (!username.trim() || !password) {
      setError("Enter username and password");
      return;
    }
    if (!isElectron()) {
      setError("Open the desktop app with npm run dev — login needs Electron + SQLite.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await login(username.trim(), password);
      if (result.ok) {
        router.replace("/dashboard");
      } else {
        setError(result.error ?? "Login failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const busy = loading || submitting;

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

      <button
        type="button"
        onClick={toggleTheme}
        className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]/90 px-3 py-1.5 text-xs text-[var(--text-muted)] backdrop-blur transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      >
        {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
        {theme === "light" ? "Dark" : "Light"}
      </button>

      <div className="relative w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--logo-ink)] shadow-lg shadow-[var(--accent)]/25">
            <Sprout size={32} strokeWidth={1.75} />
          </div>
          <h1
            className="text-3xl font-semibold tracking-tight text-[var(--text)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Agri Soft Pro
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Sign in to your workspace</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/95 p-7 shadow-2xl shadow-black/15 backdrop-blur"
          autoComplete="off"
        >
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none ring-[var(--accent)] placeholder:text-[var(--text-muted)]/50 focus:ring-1"
              autoComplete="username"
              autoFocus
              disabled={busy}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none ring-[var(--accent)] placeholder:text-[var(--text-muted)]/50 focus:ring-1"
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
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
