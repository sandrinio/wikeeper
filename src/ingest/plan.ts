// src/ingest/plan.ts
// Contract C9 — contract/S-02-plan (owner STORY-003-05). Frozen exports. Consumer: STORY-003-09 (the end-to-end test
// reads IngestPlan.entries[].path / status). The owner builds from C5, so at 003-09's integration the owner's file
// replaces this one (owner's file wins).
import type { WikeeperConfig } from "../core/config.js";
import type { ResolvedPaths } from "../core/paths.js";

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C9)`);
}

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

export async function planDirectory(
  paths: ResolvedPaths,
  config: WikeeperConfig,
  dirAbs: string,
  options: { kind: string | null },
): Promise<IngestPlan> {
  return stub("planDirectory");
}
