import { randomBytes } from "crypto";
import type { SessionUser } from "../../shared/ipc";

type TokenRecord = {
  token: string;
  user: SessionUser;
  createdAt: number;
  lastSeenAt: number;
};

const tokens = new Map<string, TokenRecord>();
const TTL_MS = 12 * 60 * 60 * 1000;

function prune(): void {
  const now = Date.now();
  for (const [k, v] of tokens) {
    if (now - v.lastSeenAt > TTL_MS) tokens.delete(k);
  }
}

export function createSessionToken(user: SessionUser): string {
  prune();
  const token = randomBytes(24).toString("base64url");
  const now = Date.now();
  tokens.set(token, { token, user, createdAt: now, lastSeenAt: now });
  return token;
}

export function getSessionByToken(token: string | null | undefined): SessionUser | null {
  if (!token) return null;
  prune();
  const row = tokens.get(token);
  if (!row) return null;
  row.lastSeenAt = Date.now();
  return row.user;
}

export function updateSessionToken(token: string | null | undefined, user: SessionUser): void {
  if (!token) return;
  const row = tokens.get(token);
  if (!row) return;
  row.user = user;
  row.lastSeenAt = Date.now();
}

export function revokeSessionToken(token: string | null | undefined): void {
  if (!token) return;
  tokens.delete(token);
}
