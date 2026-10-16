// src/ingest/snapshot.ts
// Contract C8 — contract/S-02-lock-snapshot (owner STORY-003-08). Frozen exports. Consumer: STORY-003-09. Snapshots
// live under <wikiDir>/.snapshots/<id>/ (pages/ copy + snapshot.json), even when content_dir moves pages/.
import type { ResolvedPaths } from "../core/paths.js";

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C8)`);
}

export interface SnapshotInfo {
  source_id: string;
  taken_at: string; // ISO-8601 UTC
  facts_sha256: string;
  pages: Record<string, string>; // path relative to pages/, POSIX -> sha256
  outside: Record<string, string>; // path relative to the content directory, POSIX -> sha256
}

export function snapshotDir(paths: ResolvedPaths, sourceId: string): string {
  return stub("snapshotDir");
}
export async function hashTree(dir: string, exclude?: (rel: string) => boolean): Promise<Record<string, string>> {
  return stub("hashTree");
}
export async function hashOutside(paths: ResolvedPaths): Promise<Record<string, string>> {
  return stub("hashOutside");
}
export async function takeSnapshot(
  paths: ResolvedPaths,
  sourceId: string,
  factsSha256: string,
  now?: Date,
): Promise<SnapshotInfo> {
  return stub("takeSnapshot");
}
export async function readSnapshot(paths: ResolvedPaths, sourceId: string): Promise<SnapshotInfo | null> {
  return stub("readSnapshot");
}
export async function restoreSnapshot(
  paths: ResolvedPaths,
  sourceId: string,
): Promise<{ restored: string[]; removed: string[] }> {
  return stub("restoreSnapshot");
}
export async function removeSnapshot(paths: ResolvedPaths, sourceId: string): Promise<void> {
  return stub("removeSnapshot");
}
