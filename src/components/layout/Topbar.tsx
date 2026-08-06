"use client";

import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useRouter } from "next/navigation";
import { isElectron } from "@/lib/api";
import { useTheme } from "@/lib/theme";

type TopbarProps = {
  title: string;
  subtitle?: string;
};

export function Topbar({ title, subtitle }: TopbarProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const onLogout = async () => {
    await logout();
    router.replace("/login");
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
          onClick={toggleTheme}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
        >
          {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          <span className="hidden sm:inline">{theme === "light" ? "Dark" : "Light"}</span>
        </button>
        <div className="hidden items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] sm:flex">
          <Monitor size={12} />
          {isElectron() ? "Desktop" : "Browser preview"}
        </div>
        <div className="text-right">
          <div className="text-sm font-medium">{user?.fullName ?? "Guest"}</div>
          <div className="text-[11px] text-[var(--text-muted)]">{user?.roleName ?? "—"}</div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  );
}
