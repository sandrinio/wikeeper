// src/kb/rule-decisions.ts
// Contract C3 — contract/S-03-rule-decisions (owner STORY-005-06). Frozen exports: the owner replaces the bodies and
// never renames or retypes an export. Consumer: STORY-005-05 (`listDecisions`).
import { createHash } from "node:crypto";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import type { ResolvedPaths } from "../core/paths.js";
import { isValidKindId, normalizeKindId } from "../ingest/kind-rules.js";
import { readLogEvents, writeLogEvent } from "../ingest/log.js";
import { isSourceId } from "../ingest/source-id.js";
import { KB_PROPOSAL_SECTION_KEYS, KB_SECTION_KEYS } from "./parse-instructions.js";

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

const REFUSED_KINDS: readonly string[] = (KB_SECTION_KEYS as readonly string[]).filter(
  (k) => !(KB_PROPOSAL_SECTION_KEYS as readonly string[]).includes(k),
);

export function normalizeSummary(summary: string): string {
  return summary.trim().replace(/\s+/g, " ");
}

export function fingerprint(kind: string, summary: string): string {
  return createHash("sha256")
    .update(normalizeKindId(kind) + "\n" + normalizeSummary(summary).toLowerCase())
    .digest("hex")
    .slice(0, 12);
}

function usage(message: string): WikeeperError {
  return new WikeeperError(ExitCode.USAGE, "usage", message);
}

export async function recordDecision(
  paths: ResolvedPaths,
  input: { kind: string; summary: string; decision: RuleDecisionKind; sourceId?: string; at: string },
): Promise<{ file: string; fingerprint: string; previouslyRejected: boolean }> {
  if (!isValidKindId(input.kind) || REFUSED_KINDS.includes(normalizeKindId(input.kind))) {
    throw usage(`--kind must be a source kind id or one of ${KB_PROPOSAL_SECTION_KEYS.join(", ")}: ${input.kind}`);
  }
  const summary = normalizeSummary(input.summary);
  if (summary === "") throw usage("--summary must not be empty");
  if (input.sourceId !== undefined && !isSourceId(input.sourceId)) {
    throw usage(`--from must be a source id: ${input.sourceId}`);
  }
  const fp = fingerprint(input.kind, summary);
  const previouslyRejected = (await readDecisions(paths)).decisions.some(
    (d) => d.fingerprint === fp && d.decision === "rejected",
  );
  const file = await writeLogEvent(paths, {
    type: "rule-proposal",
    at: input.at,
    ...(input.sourceId !== undefined ? { source_id: input.sourceId } : {}),
    kind: normalizeKindId(input.kind),
    summary,
    fingerprint: fp,
    decision: input.decision,
  } as never);
  return { file, fingerprint: fp, previouslyRejected };
}

export async function readDecisions(
  paths: ResolvedPaths,
): Promise<{ decisions: RuleDecision[]; skipped: Array<{ file: string; reason: string }> }> {
  const { events } = await readLogEvents(paths, { type: "rule-proposal" });
  const decisions: RuleDecision[] = [];
  const skipped: Array<{ file: string; reason: string }> = [];
  const rejected = new Set<string>();
  for (const stored of events) {
    const e = stored.event as unknown as Record<string, unknown>;
    const kind = e["kind"];
    const summary = e["summary"];
    const decision = e["decision"];
    if (
      typeof kind !== "string" ||
      !isValidKindId(kind) ||
      typeof summary !== "string" ||
      summary.trim() === "" ||
      (decision !== "accepted" && decision !== "rejected")
    ) {
      skipped.push({
        file: stored.file,
        reason: "not a recorded rule decision (needs kind, summary and decision accepted or rejected)",
      });
      continue;
    }
    const fp = fingerprint(kind, summary);
    decisions.push({
      kind,
      summary,
      fingerprint: fp,
      decision,
      at: String(e["at"]),
      source_id: typeof e["source_id"] === "string" ? e["source_id"] : null,
      previously_rejected: rejected.has(fp),
      file: stored.file,
    });
    if (decision === "rejected") rejected.add(fp);
  }
  return { decisions, skipped };
}

export async function listDecisions(paths: ResolvedPaths): Promise<RuleDecision[]> {
  return (await readDecisions(paths)).decisions;
}
