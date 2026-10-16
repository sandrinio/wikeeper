// src/ingest/lock.ts
// Contract C8 — contract/S-02-lock-snapshot (owner STORY-003-08). Frozen exports. Consumer: STORY-003-09. The lock
// file is paths.lockFile (.wiki/.lock); the guard (src/commands/hook.ts) allows page writes exactly while it exists.
import { readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import type { ResolvedPaths } from "../core/paths.js";
import { plural } from "../commands/doctor.js";
import { isSourceId } from "./source-id.js";

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

function parseLock(text: string): LockInfo | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o["source_id"] !== "string" || !isSourceId(o["source_id"])) return null;
  if (typeof o["pid"] !== "number" || !Number.isFinite(o["pid"])) return null;
  if (typeof o["hostname"] !== "string") return null;
  if (typeof o["acquired_at"] !== "string" || Number.isNaN(Date.parse(o["acquired_at"]))) return null;
  return { source_id: o["source_id"], pid: o["pid"], hostname: o["hostname"], acquired_at: o["acquired_at"] };
}

export async function readLock(paths: ResolvedPaths, now: Date = new Date()): Promise<LockState> {
  let text: string;
  try {
    text = await readFile(paths.lockFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { held: false, lock: null, stale: false, age_ms: null };
    return { held: true, lock: null, stale: true, age_ms: null };
  }
  const lock = parseLock(text);
  if (lock === null) return { held: true, lock: null, stale: true, age_ms: null };
  const age = now.getTime() - Date.parse(lock.acquired_at);
  return { held: true, lock, stale: age > STALE_LOCK_MS, age_ms: age };
}

function age(ms: number): string {
  return ms < 3_600_000
    ? plural(Math.floor(ms / 60_000), "minute")
    : plural(Math.floor(ms / 3_600_000), "hour");
}

function lockedError(code: "locked" | "lock_not_stale", state: LockState): WikeeperError {
  const holder = state.lock?.source_id ?? null;
  const details = { holder, acquired_at: state.lock?.acquired_at ?? null, age_ms: state.age_ms, stale: state.stale };
  let message: string;
  if (holder === null) {
    message = ".wiki/.lock is unreadable and counts as stale: rerun with --force-unlock to take it over";
  } else {
    message =
      `ingest ${holder} holds the write lock (acquired ${age(state.age_ms ?? 0)} ago); ` +
      `finish it, or run wikeeper ingest abort ${holder} to restore its pages`;
    if (state.stale) message += "; the lock is stale (older than 2 hours): rerun with --force-unlock to take it over";
  }
  if (code === "lock_not_stale") {
    message = `${message}; the lock is not stale, so --force-unlock does not apply`;
  }
  return new WikeeperError(ExitCode.ERROR, code, message, details);
}

async function create(paths: ResolvedPaths, lock: LockInfo): Promise<boolean> {
  try {
    await writeFile(paths.lockFile, JSON.stringify(lock, null, 2) + "\n", { flag: "wx" });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
}

/** Throws WikeeperError "locked" or "lock_not_stale". */
export async function acquireLock(
  paths: ResolvedPaths,
  sourceId: string,
  opts?: { now?: Date; forceStale?: boolean },
): Promise<{ lock: LockInfo; already_held: boolean; replaced: LockInfo | null }> {
  const now = opts?.now ?? new Date();
  const lock: LockInfo = {
    source_id: sourceId,
    pid: process.pid,
    hostname: os.hostname(),
    acquired_at: now.toISOString(),
  };
  if (await create(paths, lock)) return { lock, already_held: false, replaced: null };
  const state = await readLock(paths, now);
  if (!state.held) {
    // released between the two calls: one more try
    if (await create(paths, lock)) return { lock, already_held: false, replaced: null };
    throw lockedError("locked", await readLock(paths, now));
  }
  if (state.lock?.source_id === sourceId) return { lock: state.lock, already_held: true, replaced: null };
  if (opts?.forceStale !== true) throw lockedError("locked", state);
  if (!state.stale) throw lockedError("lock_not_stale", state);
  try {
    await unlink(paths.lockFile);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  if (await create(paths, lock)) return { lock, already_held: false, replaced: state.lock };
  throw lockedError("locked", await readLock(paths, now));
}

/** false when the lock names another id (or there is no lock). */
export async function releaseLock(paths: ResolvedPaths, sourceId: string): Promise<boolean> {
  const state = await readLock(paths);
  if (state.lock?.source_id !== sourceId) return false;
  try {
    await unlink(paths.lockFile);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return true;
}
