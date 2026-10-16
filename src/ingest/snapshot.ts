// src/ingest/snapshot.ts
// Contract C8 — contract/S-02-lock-snapshot (owner STORY-003-08). Frozen exports. Consumer: STORY-003-09. Snapshots
// live under <wikiDir>/.snapshots/<id>/ (pages/ copy + snapshot.json), even when content_dir moves pages/.
import { copyFile, cp, lstat, mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { sha256File } from "../core/manifest.js";
import { toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";

export interface SnapshotInfo {
  source_id: string;
  taken_at: string; // ISO-8601 UTC
  facts_sha256: string;
  pages: Record<string, string>; // path relative to pages/, POSIX -> sha256
  outside: Record<string, string>; // path relative to the content directory, POSIX -> sha256
}

export function snapshotDir(paths: ResolvedPaths, sourceId: string): string {
  return path.join(paths.wikiDir, ".snapshots", sourceId);
}

function sortedRecord(entries: Array<[string, string]>): Record<string, string> {
  entries.sort((a, b) => compareCodeUnits(a[0], b[0]));
  const out: Record<string, string> = {};
  for (const [k, v] of entries) out[k] = v;
  return out;
}

async function walk(dir: string, base: string, out: Array<[string, string]>, exclude?: (rel: string) => boolean): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT" || (err as NodeJS.ErrnoException).code === "ENOTDIR") return;
    throw err;
  }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(abs, base, out, exclude);
    } else if (e.isFile()) {
      const rel = toPosixRelative(base, abs);
      if (exclude?.(rel)) continue;
      out.push([rel, await sha256File(abs)]);
    }
  }
}

export async function hashTree(dir: string, exclude?: (rel: string) => boolean): Promise<Record<string, string>> {
  const out: Array<[string, string]> = [];
  await walk(dir, dir, out, exclude);
  return sortedRecord(out);
}

export async function hashOutside(paths: ResolvedPaths): Promise<Record<string, string>> {
  const out: Array<[string, string]> = [];
  try {
    const st = await lstat(paths.indexFile);
    if (st.isFile()) out.push(["index.md", await sha256File(paths.indexFile)]);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await walk(paths.logDir, paths.contentDir, out);
  await walk(paths.rawDir, paths.contentDir, out, (rel) => rel.endsWith(".facts.json"));
  return sortedRecord(out);
}

export async function takeSnapshot(
  paths: ResolvedPaths,
  sourceId: string,
  factsSha256: string,
  now: Date = new Date(),
): Promise<SnapshotInfo> {
  const dir = snapshotDir(paths, sourceId);
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  const copy = path.join(dir, "pages");
  await mkdir(copy, { recursive: true });
  try {
    await cp(paths.pagesDir, copy, {
      recursive: true,
      filter: async (src) => !(await lstat(src)).isSymbolicLink(),
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const info: SnapshotInfo = {
    source_id: sourceId,
    taken_at: now.toISOString(),
    facts_sha256: factsSha256,
    pages: await hashTree(copy),
    outside: await hashOutside(paths),
  };
  await writeFile(path.join(dir, "snapshot.json"), JSON.stringify(info, null, 2) + "\n");
  return info;
}

function isStringMap(v: unknown): v is Record<string, string> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.values(v as Record<string, unknown>).every((x) => typeof x === "string")
  );
}

export async function readSnapshot(paths: ResolvedPaths, sourceId: string): Promise<SnapshotInfo | null> {
  const dir = snapshotDir(paths, sourceId);
  let v: unknown;
  try {
    v = JSON.parse(await readFile(path.join(dir, "snapshot.json"), "utf8"));
  } catch {
    return null;
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o["source_id"] !== sourceId) return null;
  if (typeof o["taken_at"] !== "string" || typeof o["facts_sha256"] !== "string") return null;
  if (!isStringMap(o["pages"]) || !isStringMap(o["outside"])) return null;
  try {
    if (!(await stat(path.join(dir, "pages"))).isDirectory()) return null;
  } catch {
    return null;
  }
  return {
    source_id: sourceId,
    taken_at: o["taken_at"],
    facts_sha256: o["facts_sha256"],
    pages: o["pages"],
    outside: o["outside"],
  };
}

export async function restoreSnapshot(
  paths: ResolvedPaths,
  sourceId: string,
): Promise<{ restored: string[]; removed: string[] }> {
  const info = await readSnapshot(paths, sourceId);
  if (info === null) {
    throw new WikeeperError(ExitCode.ERROR, "snapshot_missing", `no readable snapshot for ${sourceId}`);
  }
  const copy = path.join(snapshotDir(paths, sourceId), "pages");
  const current = await hashTree(paths.pagesDir);
  const restored: string[] = [];
  const removed: string[] = [];
  const failed: string[] = [];
  const native = (rel: string) => path.join(paths.pagesDir, ...rel.split("/"));

  for (const [rel, hash] of Object.entries(info.pages)) {
    if (current[rel] === hash) continue;
    try {
      const dest = native(rel);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(path.join(copy, ...rel.split("/")), dest);
      restored.push(rel);
    } catch (err) {
      failed.push(`${rel} (${(err as Error).message})`);
    }
  }
  for (const rel of Object.keys(current)) {
    if (rel in info.pages) continue;
    try {
      await rm(native(rel), { force: true });
      removed.push(rel);
      let dir = path.dirname(native(rel));
      while (dir !== paths.pagesDir && dir.startsWith(paths.pagesDir)) {
        if ((await readdir(dir)).length > 0) break;
        await rmdir(dir);
        dir = path.dirname(dir);
      }
    } catch (err) {
      failed.push(`${rel} (${(err as Error).message})`);
    }
  }
  if (failed.length > 0) {
    throw new WikeeperError(
      ExitCode.ERROR,
      "restore_failed",
      `could not restore ${failed.length} page file(s): ${failed.join(", ")}; close them and rerun wikeeper ingest abort ${sourceId}`,
      { failed },
    );
  }
  restored.sort(compareCodeUnits);
  removed.sort(compareCodeUnits);
  return { restored, removed };
}

export async function removeSnapshot(paths: ResolvedPaths, sourceId: string): Promise<void> {
  await rm(snapshotDir(paths, sourceId), { recursive: true, force: true, maxRetries: 3 });
}
