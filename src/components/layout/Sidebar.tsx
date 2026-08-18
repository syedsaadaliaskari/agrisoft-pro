"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  navigation,
  isNavGroupActive,
  isNavHrefActive,
  type NavAudience,
  type NavGroup,
  type NavItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { hasAnyPermission, hasPermission, isSuperAdminUser } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";

const SCROLL_KEY = "agri_sidebar_scroll";
const OPEN_KEY = "agri_sidebar_open";

function audienceAllows(audience: NavAudience | undefined, vendor: boolean) {
  const a = audience ?? "shop";
  if (a === "both") return true;
  return vendor ? a === "platform" : a === "shop";
}

function canSeeItem(
  item: NavItem,
  user: ReturnType<typeof useAuthStore.getState>["user"],
  vendor: boolean
) {
  if (!audienceAllows(item.audience, vendor)) return false;
  if (vendor) return true;
  if (item.anyOfPermissions?.length) {
    return hasAnyPermission(user, item.anyOfPermissions);
  }
  return !item.permission || hasPermission(user, item.permission);
}

function loadOpenGroups(): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(OPEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveOpenGroups(map: Record<string, boolean>) {
  try {
    sessionStorage.setItem(OPEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { t } = useI18n();
  const vendor = isSuperAdminUser(user);
  const navRef = useRef<HTMLElement | null>(null);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

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

  useEffect(() => {
    const saved = loadOpenGroups();
    const next = { ...saved };
    for (const group of navigation) {
      if (isNavGroupActive(pathname, group)) {
        next[group.titleKey] = true;
      }
    }
    setOpenMap(next);
    setHydrated(true);
  }, [pathname]);

  function toggleGroup(group: NavGroup) {
    setOpenMap((prev) => {
      const next = { ...prev, [group.titleKey]: !prev[group.titleKey] };
      saveOpenGroups(next);
      return next;
    });
  }

  function isOpen(group: NavGroup) {
    if (!hydrated && isNavGroupActive(pathname, group)) return true;
    return Boolean(openMap[group.titleKey]);
  }

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
        <ul className="space-y-1">
          {navigation.map((group) => {
            const items = group.items.filter((item) => canSeeItem(item, user, vendor));
            if (!items.length) return null;

            const GroupIcon = group.icon;
            const open = isOpen(group);
            const groupActive = isNavGroupActive(pathname, group);

            return (
              <li key={group.titleKey}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={open}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                    groupActive
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "text-[var(--text)] hover:bg-[var(--bg-soft)]"
                  )}
                >
                  <GroupIcon size={16} strokeWidth={1.75} />
                  <span className="flex-1 truncate text-start">{t(group.titleKey)}</span>
                  <ChevronDown
                    size={14}
                    strokeWidth={2}
                    className={cn(
                      "shrink-0 text-[var(--text-muted)] transition-transform duration-200",
                      open ? "rotate-0" : "-rotate-90"
                    )}
                  />
                </button>

                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out",
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <ul className="overflow-hidden ps-2 pt-0.5">
                    {items.map((item) => {
                      const active = isNavHrefActive(pathname, item.href);
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            prefetch
                            className={cn(
                              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                              active
                                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                                : "text-[var(--text-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--text)]"
                            )}
                          >
                            <Icon size={15} strokeWidth={1.75} />
                            <span className="flex-1 truncate">{t(item.labelKey)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
