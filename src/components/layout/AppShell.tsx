"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AppShellSkeleton } from "@/components/ui/Skeleton";
import { useAuthStore } from "@/store/auth";
import { hasPermission } from "@/lib/permissions";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  permission?: string;
};

export function AppShell({ title, subtitle, children, permission }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, hydrated, hydrate } = useAuthStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && !user) {
      router.replace("/login");
    }
  }, [hydrated, user, router]);

  // Prefetch common routes so sidebar clicks feel instant
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

  if (permission && !hasPermission(user, permission)) {
    return (
      <div className="min-h-screen">
        <Sidebar />
        <div style={{ marginLeft: "var(--sidebar-width)" }} className="min-h-screen">
          <Topbar title={title} subtitle={subtitle} />
          <main className="p-6">
            <div className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-5 py-8 text-center">
              <div className="text-sm font-semibold text-[var(--danger)]">Access denied</div>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                You do not have permission <span className="font-mono text-[var(--text)]">{permission}</span>.
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
      <div style={{ marginLeft: "var(--sidebar-width)" }} className="min-h-screen">
        <Topbar title={title} subtitle={subtitle} />
        <main className="animate-[fadeIn_180ms_ease-out] p-6">{children}</main>
      </div>
    </div>
  );
}
