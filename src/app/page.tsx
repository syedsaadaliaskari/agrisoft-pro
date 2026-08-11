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
    void (async () => {
      const res = await getApi().getLicenseStatus();
      if (cancelled) return;
      if (res.ok && !res.data.allowed) {
        router.replace("/activate");
        return;
      }
      router.replace(user ? "/dashboard" : "/login");
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-[var(--text-muted)]">
      {t("common.starting")}
    </div>
  );
}
