"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";

const SCROLL_KEY = "agri_sidebar_scroll";

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { t } = useI18n();
  const isSuperAdmin = user?.roleName === "Super Admin";
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) {
      const y = Number(saved);
      if (!Number.isNaN(y)) el.scrollTop = y;
    }
    const onScroll = () => {
      sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <aside
      className="fixed inset-y-0 start-0 z-30 flex w-[var(--sidebar-width)] flex-col border-e border-[var(--border)] bg-[var(--bg-elevated)]"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="flex h-16 items-center gap-3 border-b border-[var(--border)] px-5">
        <img
          src="/logo.png"
          alt="Agri Soft Pro"
          className="h-9 w-9 rounded-lg object-cover shadow-sm ring-1 ring-[var(--border)]"
        />
        <div>
          <div className="text-sm font-semibold tracking-wide text-[var(--text)]">{t("brand.name")}</div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]">{t("brand.pro")}</div>
        </div>
      </div>

      <nav ref={navRef} className="flex-1 overflow-y-auto px-3 py-4">
        {navigation.map((group) => {
          const items = group.items.filter((item) => {
            if (isSuperAdmin) return true;
            if (item.anyOfPermissions?.length) {
              return hasAnyPermission(user, item.anyOfPermissions);
            }
            return !item.permission || hasPermission(user, item.permission);
          });
          if (!items.length) return null;
          return (
            <div key={group.titleKey} className="mb-5">
              <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {t(group.titleKey)}
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href + "/")) ||
                    pathname === item.href + "/";
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        prefetch
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                          active
                            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "text-[var(--text-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--text)]"
                        )}
                      >
                        <Icon size={16} strokeWidth={1.75} />
                        <span className="flex-1 truncate">{t(item.labelKey)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
