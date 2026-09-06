import fs from "fs";
import path from "path";
import { app } from "electron";

export type Tombstone = { table: string; id: string; at: string };

type SyncState = {
  tombstones: Tombstone[];
  lastLiveIds: Record<string, string[]>;
  pendingWipeTenantId: string | null;
};

const EMPTY: SyncState = { tombstones: [], lastLiveIds: {}, pendingWipeTenantId: null };

function statePath(): string {
  try {
    return path.join(app.getPath("userData"), "cloud-sync-state.json");
  } catch {
    return path.join(process.cwd(), "cloud-sync-state.json");
  }
}

function readState(): SyncState {
  try {
    const raw = fs.readFileSync(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    return {
      tombstones: Array.isArray(parsed.tombstones) ? parsed.tombstones : [],
      lastLiveIds: parsed.lastLiveIds && typeof parsed.lastLiveIds === "object" ? parsed.lastLiveIds : {},
      pendingWipeTenantId: typeof parsed.pendingWipeTenantId === "string" ? parsed.pendingWipeTenantId : null,
    };
  } catch {
    return { ...EMPTY, lastLiveIds: {} };
  }
}

function writeState(state: SyncState) {
  const next: SyncState = {
    tombstones: state.tombstones.slice(-50_000),
    lastLiveIds: state.lastLiveIds,
    pendingWipeTenantId: state.pendingWipeTenantId,
  };
  fs.writeFileSync(statePath(), JSON.stringify(next));
}

export function rememberTombstone(table: string, id: string, at = new Date().toISOString()) {
  if (!table || !id) return;
  const state = readState();
  const existing = state.tombstones.find((row) => row.table === table && row.id === id);
  if (existing) {
    existing.at = at;
  } else {
    state.tombstones.push({ table, id, at });
  }
  writeState(state);
}

export function rememberTombstones(table: string, ids: string[], at = new Date().toISOString()) {
  for (const id of ids) rememberTombstone(table, id, at);
}

export function isTombstoned(table: string, id: string): boolean {
  return readState().tombstones.some((row) => row.table === table && row.id === id);
}

export function tombstonesFor(table: string): Tombstone[] {
  return readState().tombstones.filter((row) => row.table === table);
}

export function tombstoneIdSet(table: string): Set<string> {
  return new Set(tombstonesFor(table).map((row) => row.id));
}

export function getLastLiveIds(table: string): string[] {
  return readState().lastLiveIds[table] ?? [];
}

export function setLastLiveIds(table: string, ids: string[]) {
  const state = readState();
  state.lastLiveIds[table] = [...new Set(ids)];
  writeState(state);
}

/** IDs that were live last sync but are gone from SQLite now. */
export function captureVanished(table: string, currentIds: string[], at = new Date().toISOString()) {
  const current = new Set(currentIds);
  const gone = getLastLiveIds(table).filter((id) => !current.has(id));
  if (gone.length) rememberTombstones(table, gone, at);
}

export function getPendingWipeTenantId(): string | null {
  return readState().pendingWipeTenantId;
}

export function markShopWipe(tenantId: string) {
  const state = readState();
  state.pendingWipeTenantId = tenantId;
  writeState(state);
}

export function clearPendingWipe() {
  const state = readState();
  state.pendingWipeTenantId = null;
  state.lastLiveIds = {};
  writeState(state);
}
