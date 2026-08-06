"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Companies live on the Super Admin dashboard now. */
export default function ClientCompaniesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">
      Opening dashboard…
    </div>
  );
}
