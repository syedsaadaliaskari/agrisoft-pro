"use client";

import { AppShell } from "@/components/layout/AppShell";
import { Alert } from "@/components/ui/form";

export function ComingSoonPage({
  title,
  subtitle,
  step,
  permission,
}: {
  title: string;
  subtitle?: string;
  step: string;
  permission?: string;
}) {
  return (
    <AppShell title={title} subtitle={subtitle} permission={permission}>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-12 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">{step}</p>
        <h2 className="mt-2 text-xl font-semibold">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
          Screen shell is ready. Full module logic will be wired in a later build step.
        </p>
        <div className="mx-auto mt-6 max-w-md">
          <Alert tone="info">UI kit, navigation, and theme are active — data APIs come next.</Alert>
        </div>
      </div>
    </AppShell>
  );
}
