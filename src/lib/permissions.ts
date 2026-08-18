import type { SessionUser } from "@shared/ipc";

/** Vendor console (Super Admin): licenses, client companies, settings — not shop ERP. */
export const VENDOR_CONSOLE_PERMISSIONS = new Set([
  "dashboard.view",
  "license.manage",
  "license.view",
  "platform.view",
  "settings.manage",
  "users.manage",
]);

export function isSuperAdminUser(user: SessionUser | null | undefined): boolean {
  return user?.roleName === "Super Admin";
}

export function hasPermission(user: SessionUser | null | undefined, code: string): boolean {
  if (!user) return false;
  if (user.roleName === "Super Admin") return true;
  if (user.permissions.includes("*")) return true;
  return user.permissions.includes(code);
}

export function hasAnyPermission(
  user: SessionUser | null | undefined,
  codes: string[]
): boolean {
  return codes.some((c) => hasPermission(user, c));
}

/** Screen gate for AppShell — Super Admin only opens vendor-console pages. */
export function canAccessScreen(
  user: SessionUser | null | undefined,
  permission?: string
): boolean {
  if (!user) return false;
  if (!permission) return true;

  if (isSuperAdminUser(user)) {
    return VENDOR_CONSOLE_PERMISSIONS.has(permission);
  }

  if (hasPermission(user, permission)) return true;
  if (
    permission === "license.manage" &&
    hasAnyPermission(user, ["license.manage", "platform.view"])
  ) {
    return true;
  }
  if (
    permission === "license.view" &&
    hasAnyPermission(user, ["license.view", "platform.view", "license.manage"])
  ) {
    return true;
  }
  return false;
}
