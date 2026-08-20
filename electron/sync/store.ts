import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { settings } from "../db/schema";

export function getSetting(key: string): string {
  const db = getDb();
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? "";
}

export function setSetting(key: string, value: string) {
  const db = getDb();
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  const now = new Date().toISOString();
  if (existing) {
    db.update(settings).set({ value, updatedAt: now }).where(eq(settings.id, existing.id)).run();
    return;
  }
  db.insert(settings)
    .values({
      id: randomUUID(),
      key,
      value,
      groupName: "sync",
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export function recordSyncError(message: string) {
  setSetting("cloud_last_sync_error", message);
}

export function isNewer(remoteUpdatedAt: string, localUpdatedAt: string): boolean {
  return new Date(remoteUpdatedAt).getTime() > new Date(localUpdatedAt).getTime();
}
