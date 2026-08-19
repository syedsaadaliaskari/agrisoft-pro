import { net } from "electron";
import { getSyncConfig } from "./client";
import { recordSyncError, runCustomerCloudSync } from "./customers";

let syncing = false;
let lastAttemptAt = 0;
let wasOnline = true;
let intervalId: ReturnType<typeof setInterval> | null = null;
let onlinePollId: ReturnType<typeof setInterval> | null = null;

const MIN_GAP_MS = 60_000;
const INTERVAL_MS = 15 * 60 * 1000;
const ONLINE_POLL_MS = 30_000;

export async function maybeRunCustomerCloudSync(
  reason: string,
  options?: { force?: boolean }
): Promise<void> {
  const cfg = getSyncConfig();
  if (!cfg.configured) return;
  if (syncing) return;
  if (!options?.force && Date.now() - lastAttemptAt < MIN_GAP_MS) return;
  if (!net.isOnline()) return;

  syncing = true;
  lastAttemptAt = Date.now();
  try {
    await runCustomerCloudSync();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    try {
      recordSyncError(message);
    } catch {
      /* ignore */
    }
    console.warn(`Cloud sync (${reason}) failed:`, err);
  } finally {
    syncing = false;
  }
}

/** Start auto cloud sync: on launch, every 15 min, and when the network returns. */
export function startCloudSyncScheduler(): void {
  wasOnline = net.isOnline();
  void maybeRunCustomerCloudSync("startup");

  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => void maybeRunCustomerCloudSync("interval"), INTERVAL_MS);

  if (onlinePollId) clearInterval(onlinePollId);
  onlinePollId = setInterval(() => {
    const online = net.isOnline();
    if (online && !wasOnline) {
      void maybeRunCustomerCloudSync("online");
    }
    wasOnline = online;
  }, ONLINE_POLL_MS);
}
