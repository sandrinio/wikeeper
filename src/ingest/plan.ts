// src/ingest/plan.ts
// Contract C9 — owner STORY-003-05. Frozen exports. Read-only: hashes files, stores nothing, runs no hook.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import type { WikeeperConfig } from "../core/config.js";
import { isInside } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { evaluatePermission } from "./permissions.js";
import { fileOrigin, findDuplicate, hashSource, listSources } from "./registry.js";

export type PlanStatus = "new" | "duplicate" | "denied";
export type PlanPrior = { id: string; captured_at: string; match: "sha256" } | { path: string; match: "in_plan" };
export interface PlanEntry {
  path: string; // the origin `ingest start` would record (fileOrigin)
  size: number;
  sha256: string;
  status: PlanStatus;
  needs_approval: boolean;
  kind_pending: boolean;
  reason: string;
  prior: PlanPrior | null;
}
export interface PlanSkip {
  path: string;
  reason: "hidden" | "wiki" | "symlink";
}
export interface IngestPlan {
  dir: string; // repo-relative POSIX, or absolute when outside the repo
  mode: WikeeperConfig["ingest"]["permission"];
  kind: string | null;
  entries: PlanEntry[];
  skipped: PlanSkip[];
  totals: { new: number; duplicate: number; denied: number; needs_approval: number };
}

function inWiki(paths: ResolvedPaths, abs: string): boolean {
  return (
    abs === paths.wikiDir ||
    abs === paths.contentDir ||
    isInside(paths.wikiDir, abs) ||
    isInside(paths.contentDir, abs)
  );
}

export async function planDirectory(
  paths: ResolvedPaths,
  config: WikeeperConfig,
  dirAbs: string,
  options: { kind: string | null },
): Promise<IngestPlan> {
  const root = paths.root;
  const dir = dirAbs === root ? "." : fileOrigin(root, dirAbs);
  const kind = options.kind;
  const plan: IngestPlan = {
    dir,
    mode: config.ingest.permission,
    kind,
    entries: [],
    skipped: [],
    totals: { new: 0, duplicate: 0, denied: 0, needs_approval: 0 },
  };
  if (inWiki(paths, dirAbs)) {
    plan.skipped.push({ path: dir, reason: "wiki" });
    return plan;
  }

  const candidates: Array<{ abs: string; origin: string }> = [];
  async function walk(d: string): Promise<void> {
    const dirents = await readdir(d, { withFileTypes: true });
    for (const e of dirents) {
      const abs = path.join(d, e.name);
      if (inWiki(paths, abs)) {
        plan.skipped.push({ path: fileOrigin(root, abs), reason: "wiki" });
      } else if (e.isSymbolicLink()) {
        plan.skipped.push({ path: fileOrigin(root, abs), reason: "symlink" });
      } else if (e.name.startsWith(".")) {
        plan.skipped.push({ path: fileOrigin(root, abs), reason: "hidden" });
      } else if (e.isDirectory()) {
        await walk(abs);
      } else if (e.isFile()) {
        candidates.push({ abs, origin: fileOrigin(root, abs) });
      }
    }
  }
  await walk(dirAbs);
  candidates.sort((a, b) => compareCodeUnits(a.origin, b.origin));
  plan.skipped.sort((a, b) => compareCodeUnits(a.path, b.path));

  const sources = await listSources(paths);
  const firstNew = new Map<string, string>();
  for (const { abs, origin } of candidates) {
    const { sha256, size } = await hashSource({ originalPath: abs, text: null });
    const base = { path: origin, size, sha256, needs_approval: false, kind_pending: false };
    const dup = findDuplicate(sources, { sha256, originType: "file", origin });
    if (dup !== null) {
      plan.entries.push({
        ...base,
        status: "duplicate",
        reason: `already ingested as ${dup.meta.id}`,
        prior: { id: dup.meta.id, captured_at: dup.meta.captured_at, match: "sha256" },
      });
      continue;
    }
    const earlier = firstNew.get(sha256);
    if (earlier !== undefined) {
      plan.entries.push({
        ...base,
        status: "duplicate",
        reason: `same content as ${earlier}, earlier in this plan`,
        prior: { path: earlier, match: "in_plan" },
      });
      continue;
    }
    const r = evaluatePermission(config.ingest, { origin, originType: "file", kind, approved: false });
    if (r.decision === "denied") {
      plan.entries.push({ ...base, status: "denied", kind_pending: r.kind_pending, reason: r.reason, prior: null });
    } else {
      firstNew.set(sha256, origin);
      plan.entries.push({
        ...base,
        status: "new",
        needs_approval: r.decision === "needs_approval",
        kind_pending: r.kind_pending,
        reason: r.reason,
        prior: null,
      });
    }
  }
  for (const e of plan.entries) {
    plan.totals[e.status] += 1;
    if (e.status === "new" && e.needs_approval) plan.totals.needs_approval += 1;
  }
  return plan;
}
