import { AsyncLocalStorage } from "async_hooks";
import type { SessionUser } from "../../shared/ipc";

type RequestContext = {
  /** Authenticated user for this request (null = anonymous). */
  user: SessionUser | null;
  /** True when serving a LAN cashier request (not the local UI session). */
  remote: boolean;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

/** Local UI session on this PC (Mode A / main PC operator). */
let localSession: SessionUser | null = null;

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContext.run(ctx, fn);
}

export async function runWithRequestContextAsync<T>(
  ctx: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return requestContext.run(ctx, fn);
}

export function isRemoteRequest(): boolean {
  return requestContext.getStore()?.remote === true;
}

export function setCurrentSession(user: SessionUser | null): void {
  if (isRemoteRequest()) {
    // Remote sessions are token-backed; do not clobber the main PC UI session.
    const store = requestContext.getStore();
    if (store) store.user = user;
    return;
  }
  localSession = user;
}

export function getCurrentSession(): SessionUser | null {
  const store = requestContext.getStore();
  if (store) return store.user;
  return localSession;
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export function requireSession(): SessionUser {
  const session = getCurrentSession();
  if (!session) throw new PermissionError("Not authenticated");
  return session;
}

export function sessionHasPermission(user: SessionUser, code: string): boolean {
  if (user.roleName === "Super Admin") return true;
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
