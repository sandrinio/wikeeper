import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { STALE_LOCK_MS, acquireLock, readLock, releaseLock } from "../../src/ingest/lock.js";
import {
  hashOutside,
  hashTree,
  readSnapshot,
  removeSnapshot,
  restoreSnapshot,
  snapshotDir,
  takeSnapshot,
} from "../../src/ingest/snapshot.js";

const A = "src-2026-10-16-a";
const B = "src-2026-10-16-b";
const NOW = new Date("2026-10-16T12:00:00Z");
const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function fresh(): Promise<ResolvedPaths> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-lock-"));
  tmpDirs.push(root);
  const paths = resolvePaths(root, DEFAULT_CONFIG);
  for (const d of [paths.pagesDir, paths.rawDir, paths.logDir]) await mkdir(d, { recursive: true });
  return paths;
}
async function put(file: string, body: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}
const exists = (f: string) => stat(f).then(() => true, () => false);

describe("STORY-003-08 lock (red)", () => {
  it("STALE_LOCK_MS is 2 hours", () => {
    expect(STALE_LOCK_MS).toBe(7_200_000);
  });

  it("acquire writes JSON; second id is locked; same id is already_held", async () => {
    const p = await fresh();
    const first = await acquireLock(p, A, { now: NOW });
    expect(first.already_held).toBe(false);
    expect(JSON.parse(await readFile(p.lockFile, "utf8")).source_id).toBe(A);
    expect((await acquireLock(p, A, { now: NOW })).already_held).toBe(true);
    await expect(acquireLock(p, B, { now: NOW })).rejects.toMatchObject({ code: "locked" });
  });

  it("exclusive-create race: exactly one winner", async () => {
    const p = await fresh();
    const res = await Promise.allSettled([acquireLock(p, A, { now: NOW }), acquireLock(p, B, { now: NOW })]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(res.filter((x) => x.status === "rejected")).toHaveLength(1);
  });

  it("stale only past 2 h; unreadable is held, stale, lock null", async () => {
    const p = await fresh();
    await acquireLock(p, A, { now: NOW });
    const at = (ms: number) => new Date(NOW.getTime() + ms);
    expect((await readLock(p, at(STALE_LOCK_MS))).stale).toBe(false);
    const st = await readLock(p, at(STALE_LOCK_MS + 1));
    expect(st.stale).toBe(true);
    expect(st.lock?.source_id).toBe(A);
    await writeFile(p.lockFile, "not json");
    expect(await readLock(p, NOW)).toEqual({ held: true, lock: null, stale: true, age_ms: null });
    await rm(p.lockFile);
    expect(await readLock(p, NOW)).toEqual({ held: false, lock: null, stale: false, age_ms: null });
  });

  it("forceStale: lock_not_stale when fresh, takeover when stale", async () => {
    const p = await fresh();
    await acquireLock(p, A, { now: NOW });
    await expect(acquireLock(p, B, { now: NOW, forceStale: true })).rejects.toMatchObject({ code: "lock_not_stale" });
    const later = new Date(NOW.getTime() + STALE_LOCK_MS + 1000);
    const got = await acquireLock(p, B, { now: later, forceStale: true });
    expect(got.replaced?.source_id).toBe(A);
  });

  it("releaseLock by a non-owner returns false and leaves the file", async () => {
    const p = await fresh();
    await acquireLock(p, A, { now: NOW });
    expect(await releaseLock(p, B)).toBe(false);
    expect(await exists(p.lockFile)).toBe(true);
    expect(await releaseLock(p, A)).toBe(true);
    expect(await exists(p.lockFile)).toBe(false);
  });
});

describe("STORY-003-08 snapshot (red)", () => {
  it("hashOutside: index, log, raw; facts files excluded", async () => {
    const p = await fresh();
    await put(path.join(p.contentDir, "index.md"), "i");
    await put(path.join(p.logDir, "e.json"), "{}");
    await put(path.join(p.rawDir, "x.md"), "x");
    await put(path.join(p.rawDir, "x.facts.json"), "{}");
    const keys = Object.keys(await hashOutside(p));
    expect(keys).toEqual(expect.arrayContaining(["index.md", "log/e.json", "raw/x.md"]));
    expect(keys).not.toContain("raw/x.facts.json");
  });

  it("hashTree includes dot files, skips a missing dir", async () => {
    const p = await fresh();
    await put(path.join(p.pagesDir, ".gitkeep"), "");
    await put(path.join(p.pagesDir, "a", "b.md"), "b");
    expect(Object.keys(await hashTree(p.pagesDir))).toEqual([".gitkeep", "a/b.md"]);
    expect(await hashTree(path.join(p.pagesDir, "nope"))).toEqual({});
  });

  it("take / read / remove", async () => {
    const p = await fresh();
    await put(path.join(p.pagesDir, "team.md"), "t");
    const info = await takeSnapshot(p, A, "f".repeat(64), NOW);
    expect(info.source_id).toBe(A);
    expect(Object.keys(info.pages)).toContain("team.md");
    expect(snapshotDir(p, A)).toBe(path.join(p.wikiDir, ".snapshots", A));
    expect((await readSnapshot(p, A))?.facts_sha256).toBe("f".repeat(64));
    await removeSnapshot(p, A);
    expect(await readSnapshot(p, A)).toBeNull();
  });

  it("restore: edited, deleted, created; emptied dirs removed, pre-existing empty kept", async () => {
    const p = await fresh();
    await put(path.join(p.pagesDir, "team.md"), "t");
    await put(path.join(p.pagesDir, "risks.md"), "r");
    await mkdir(path.join(p.pagesDir, "keep"), { recursive: true });
    await takeSnapshot(p, A, "f".repeat(64), NOW);
    await put(path.join(p.pagesDir, "team.md"), "edited");
    await rm(path.join(p.pagesDir, "risks.md"));
    await put(path.join(p.pagesDir, "projects", "new", "atlas.md"), "a");
    const res = await restoreSnapshot(p, A);
    expect(res.restored).toEqual(["risks.md", "team.md"]);
    expect(res.removed).toEqual(["projects/new/atlas.md"]);
    expect(await readFile(path.join(p.pagesDir, "team.md"), "utf8")).toBe("t");
    expect(await exists(path.join(p.pagesDir, "projects"))).toBe(false);
    expect(await exists(path.join(p.pagesDir, "keep"))).toBe(true);
    expect(await exists(p.pagesDir)).toBe(true);
  });

  it("restore without a snapshot throws snapshot_missing", async () => {
    const p = await fresh();
    await expect(restoreSnapshot(p, A)).rejects.toMatchObject({ code: "snapshot_missing" });
  });
});
