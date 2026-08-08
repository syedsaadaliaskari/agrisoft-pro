"use client";

import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[var(--border)]/70 motion-reduce:animate-none",
        className
      )}
    />
  );
}

/** Full app chrome placeholder while session boots */
export function AppShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <aside
        className="fixed inset-y-0 start-0 border-e border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-4"
        style={{ width: "var(--sidebar-width)" }}
      >
        <div className="mb-6 flex items-center gap-3 px-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-2 w-10" />
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="mb-2 px-2">
            <Skeleton className="mb-2 h-2 w-14" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        ))}
      </aside>
      <div style={{ marginInlineStart: "var(--sidebar-width)" }} className="min-h-screen flex-1 p-6">
        <div className="mb-6 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-80 rounded-xl xl:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton({ platform }: { platform?: boolean }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-80 rounded-xl xl:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      {platform ? (
        <div className="grid gap-4 xl:grid-cols-5">
          <Skeleton className="h-72 rounded-xl xl:col-span-2" />
          <Skeleton className="h-72 rounded-xl xl:col-span-3" />
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <Skeleton className="h-56 rounded-xl" />
    </div>
  );
}
