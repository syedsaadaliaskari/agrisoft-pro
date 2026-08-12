import type { SessionUser } from "@shared/ipc";

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
