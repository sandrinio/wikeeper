// Page and outside diffs against the apply-time snapshot (STORY-003-09 R2, R3).
import { compareCodeUnits } from "../core/compare.js";
import type { ResolvedPaths } from "../core/paths.js";
import { hashOutside, hashTree } from "./snapshot.js";
import type { SnapshotInfo } from "./snapshot.js";

export interface TreeDiff {
  created: string[];
  updated: string[];
  deleted: string[];
}
export interface PageDiff extends TreeDiff {
  archive?: TreeDiff; // K9; always set by diffPages, optional in the type only
}

const keep = (rel: string): boolean => !rel.split("/").some((seg) => seg.startsWith("."));

function filtered(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) if (keep(k)) out[k] = v;
  return out;
}

function diffTree(before: Record<string, string>, now: Record<string, string>): TreeDiff {
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  for (const [rel, hash] of Object.entries(now)) {
    if (!(rel in before)) created.push(rel);
    else if (before[rel] !== hash) updated.push(rel);
  }
  for (const rel of Object.keys(before)) if (!(rel in now)) deleted.push(rel);
  return {
    created: created.sort(compareCodeUnits),
    updated: updated.sort(compareCodeUnits),
    deleted: deleted.sort(compareCodeUnits),
  };
}

export async function diffPages(paths: ResolvedPaths, snapshot: SnapshotInfo): Promise<PageDiff> {
  return {
    ...diffTree(filtered(snapshot.pages), filtered(await hashTree(paths.pagesDir))),
    archive: diffTree(filtered(snapshot.archive ?? {}), filtered(await hashTree(paths.archiveDir))),
  };
}

export async function diffOutside(
  paths: ResolvedPaths,
  snapshot: SnapshotInfo,
): Promise<{ modified: string[]; deleted: string[] }> {
  const now = await hashOutside(paths);
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const [rel, hash] of Object.entries(snapshot.outside)) {
    if (!(rel in now)) deleted.push(rel);
    else if (now[rel] !== hash) modified.push(rel);
  }
  return { modified: modified.sort(compareCodeUnits), deleted: deleted.sort(compareCodeUnits) };
}
