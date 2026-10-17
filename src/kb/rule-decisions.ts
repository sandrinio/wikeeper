// src/kb/rule-decisions.ts
// Contract C3 — contract/S-03-rule-decisions (owner STORY-005-06). Frozen exports: the owner replaces the bodies and
// never renames or retypes an export. Consumer: STORY-005-05 (`listDecisions`).
import type { ResolvedPaths } from "../core/paths.js";

export type RuleDecisionKind = "accepted" | "rejected";

export interface RuleDecision {
  kind: string;
  summary: string;
  fingerprint: string;
  decision: RuleDecisionKind;
  at: string;
  source_id: string | null;
  previously_rejected: boolean;
  file: string; // the event's log file, relative to the repository root, POSIX
}

export function normalizeSummary(summary: string): string {
  throw new Error("contract stub C3");
}

export function fingerprint(kind: string, summary: string): string {
  throw new Error("contract stub C3");
}

export async function recordDecision(
  paths: ResolvedPaths,
  input: { kind: string; summary: string; decision: RuleDecisionKind; sourceId?: string; at: string },
): Promise<{ file: string; fingerprint: string; previouslyRejected: boolean }> {
  throw new Error("contract stub C3");
}

export async function readDecisions(
  paths: ResolvedPaths,
): Promise<{ decisions: RuleDecision[]; skipped: Array<{ file: string; reason: string }> }> {
  throw new Error("contract stub C3");
}

export async function listDecisions(paths: ResolvedPaths): Promise<RuleDecision[]> {
  throw new Error("contract stub C3");
}
