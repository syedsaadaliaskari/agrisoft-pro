import type { SessionUser } from "../../shared/ipc";

let currentSession: SessionUser | null = null;

export function setCurrentSession(user: SessionUser | null): void {
  currentSession = user;
}

export function getCurrentSession(): SessionUser | null {
  return currentSession;
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export function requireSession(): SessionUser {
  if (!currentSession) throw new PermissionError("Not authenticated");
  return currentSession;
}

export function sessionHasPermission(user: SessionUser, code: string): boolean {
  if (user.permissions.includes("*")) return true;
  return user.permissions.includes(code);
}

export function requirePermission(code: string): SessionUser {
  const session = requireSession();
  if (!sessionHasPermission(session, code)) {
    throw new PermissionError(`Missing permission: ${code}`);
  }
  return session;
}

export function requireAnyPermission(...codes: string[]): SessionUser {
  const session = requireSession();
  if (codes.some((code) => sessionHasPermission(session, code))) return session;
  throw new PermissionError(`Missing permission: ${codes.join(" or ")}`);
}
