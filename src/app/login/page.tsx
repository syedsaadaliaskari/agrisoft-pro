"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun, Sprout } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/form";

export default function LoginPage() {
  const router = useRouter();
  const { user, hydrated, hydrate, login, enterPreview, loading } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

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
    setError("");
    const result = await login(username.trim(), password);
    if (result.ok) {
      router.replace("/dashboard");
    } else {
      setError(result.error ?? "Login failed");
    }
  };

  const onPreview = () => {
    enterPreview();
    router.replace("/dashboard");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      >
        {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
        {theme === "light" ? "Dark" : "Light"}
      </button>

      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8 shadow-2xl shadow-black/20">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--logo-ink)]">
            <Sprout size={28} strokeWidth={1.75} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Agri Soft Pro</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Local desktop agri ERP</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none ring-[var(--accent)] focus:ring-1"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none ring-[var(--accent)] focus:ring-1"
              autoComplete="current-password"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--logo-ink)] transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <p className="mb-3 text-center text-xs text-[var(--text-muted)]">
            Auth is wired in Step 4. Explore the shell now:
          </p>
          <Button type="button" variant="secondary" className="w-full" onClick={onPreview}>
            Continue as preview
          </Button>
        </div>
      </div>
    </div>
  );
}
