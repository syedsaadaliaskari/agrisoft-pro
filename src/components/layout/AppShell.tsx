"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AppShellSkeleton } from "@/components/ui/Skeleton";
import { useAuthStore } from "@/store/auth";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { normalizePath, PAGE_META, useI18n } from "@/lib/i18n";
import { getApi } from "@/lib/api";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  permission?: string;
};

export function AppShell({ title, subtitle, children, permission }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, hydrated, hydrate, logout } = useAuthStore();
  const { t } = useI18n();
  const [licenseReady, setLicenseReady] = useState(false);

  const path = normalizePath(pathname);
  const meta = PAGE_META[path];
  const displayTitle = meta ? t(meta.title) : title;
  const displaySubtitle = meta?.subtitle ? t(meta.subtitle) : subtitle;

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && !user) {
      router.replace("/login");
    }
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!user) {
      setLicenseReady(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await getApi().getLicenseStatus();
      if (cancelled) return;
      if (res.ok && !res.data.allowed) {
        // Hard lock: no app screens at all — QR gate only (after logout).
        await logout();
        router.replace("/activate");
        return;
      }
      setLicenseReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, path, router, logout]);

  useEffect(() => {
    const routes = [
      "/dashboard",
      "/sales",
      "/purchases",
      "/inventory",
      "/products",
      "/customers",
      "/reports/sales",
    ];
    for (const href of routes) {
      try {
        router.prefetch(href);
      } catch {
        /* ignore */
      }
    }
  }, [router, user?.id]);

  if (!hydrated && !user) {
    return <AppShellSkeleton />;
  }

  if (hydrated && !user) {
    return <AppShellSkeleton />;
  }

  if (!user) return null;

  if (!licenseReady) {
    return <AppShellSkeleton />;
  }

  if (permission && !hasPermission(user, permission) && !(
    (permission === "license.manage" && hasAnyPermission(user, ["license.manage", "platform.view"])) ||
    (permission === "license.view" && hasAnyPermission(user, ["license.view", "platform.view", "license.manage"]))
  )) {
    return (
      <div className="min-h-screen">
        <Sidebar />
        <div style={{ marginInlineStart: "var(--sidebar-width)" }} className="min-h-screen">
          <Topbar title={displayTitle} subtitle={displaySubtitle} />
          <main className="p-6">
            <div className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-5 py-8 text-center">
              <div className="text-sm font-semibold text-[var(--danger)]">{t("common.accessDenied")}</div>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {t("common.accessDeniedHint")}{" "}
                <span className="font-mono text-[var(--text)]">{permission}</span>.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" key={pathname}>
      <Sidebar />
      <div style={{ marginInlineStart: "var(--sidebar-width)" }} className="min-h-screen">
        <Topbar title={displayTitle} subtitle={displaySubtitle} />
        <main className="animate-[fadeIn_180ms_ease-out] p-6">{children}</main>
      </div>
    </div>
  );
}
