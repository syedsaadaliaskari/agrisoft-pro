"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { getApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function HomePage() {
  const router = useRouter();
  const { user, hydrated, hydrate } = useAuthStore();
  const { t } = useI18n();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const go = (path: string) => {
      if (!cancelled) router.replace(path);
    };
    const timer = setTimeout(() => go(user ? "/dashboard" : "/login"), 4000);
    void (async () => {
      try {
        const res = await getApi().getLicenseStatus();
        if (cancelled) return;
        if (res.ok && !res.data.allowed && user) {
          go("/activate");
          return;
        }
        go(user ? "/dashboard" : "/login");
      } catch {
        go(user ? "/dashboard" : "/login");
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hydrated, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-[var(--text-muted)]">
      {t("common.starting")}
    </div>
  );
}
