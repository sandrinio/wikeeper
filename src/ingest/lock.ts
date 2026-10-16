// src/ingest/lock.ts
// Contract C8 — contract/S-02-lock-snapshot (owner STORY-003-08). Frozen exports. Consumer: STORY-003-09. The lock
// file is paths.lockFile (.wiki/.lock); the guard (src/commands/hook.ts) allows page writes exactly while it exists.
import type { ResolvedPaths } from "../core/paths.js";

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C8)`);
}

export const STALE_LOCK_MS: number = 7_200_000;

export interface LockInfo {
  source_id: string;
  pid: number;
  hostname: string;
  acquired_at: string; // ISO-8601 UTC
}
export interface LockState {
  held: boolean;
  lock: LockInfo | null; // null when not held, or held but unreadable
  stale: boolean;
  age_ms: number | null;
}

export async function readLock(paths: ResolvedPaths, now?: Date): Promise<LockState> {
  return stub("readLock");
}
/** Throws WikeeperError "locked" or "lock_not_stale". */
export async function acquireLock(
  paths: ResolvedPaths,
  sourceId: string,
  opts?: { now?: Date; forceStale?: boolean },
): Promise<{ lock: LockInfo; already_held: boolean; replaced: LockInfo | null }> {
  return stub("acquireLock");
}
/** false when the lock names another id (or there is no lock). */
export async function releaseLock(paths: ResolvedPaths, sourceId: string): Promise<boolean> {
  return stub("releaseLock");
}
