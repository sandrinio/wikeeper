// src/ingest/log.ts
// Contract C6 — contract/S-02-log-index (owner STORY-003-07); C11 (contract/S-02-search-log-index) is a cherry-pick of
// this commit. Frozen exports. Consumers: STORY-003-06, 003-08, 003-09 (C6); STORY-004-04, 004-05 (C11). The owner
// builds from C1, so at a consumer's integration the owner's file replaces this one (owner's file wins).
import type { IngestPermission } from "../core/config.js";
import type { ResolvedPaths } from "../core/paths.js";

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C6)`);
}

export type LogEventType = "ingest" | "abort" | "miss" | "rule-proposal";
export const LOG_EVENT_TYPES: readonly LogEventType[] = ["ingest", "abort", "miss", "rule-proposal"];

export interface IngestLogEvent {
  type: "ingest";
  at: string; // ISO-8601 UTC, supplied by the caller
  source_id: string;
  kind: string;
  rule_version: number | null;
  permission: IngestPermission;
  origin: string;
  created: string[]; // paths relative to pages/, POSIX
  updated: string[];
  deleted: string[];
  contradictions: number;
  rule_suggestions: number;
}
export interface AbortLogEvent {
  type: "abort";
  at: string;
  source_id: string;
  dropped: boolean;
  restored: string[]; // paths relative to pages/, POSIX
}
export interface MissLogEvent {
  type: "miss";
  at: string;
  query: string;
  filters: Record<string, string | string[]>;
}
export interface RuleProposalLogEvent {
  type: "rule-proposal";
  at: string;
  source_id?: string;
  [field: string]: unknown;
}
export type LogEvent = IngestLogEvent | AbortLogEvent | MissLogEvent | RuleProposalLogEvent;

export interface StoredLogEvent {
  file: string; // relative to paths.root, POSIX
  event: LogEvent;
}
export interface LogFilter {
  type?: LogEventType;
  sourceId?: string;
  since?: string; // "YYYY-MM-DD" (00:00 UTC that day) or a full ISO timestamp; keeps events with at >= since
}
export interface LogReadResult {
  events: StoredLogEvent[]; // sorted by at, then file name
  skipped: Array<{ file: string; reason: string }>;
}

export async function writeLogEvent(paths: ResolvedPaths, event: LogEvent): Promise<string> {
  return stub("writeLogEvent");
}
export async function readLogEvents(paths: ResolvedPaths, filter?: LogFilter): Promise<LogReadResult> {
  return stub("readLogEvents");
}
export function renderLogView(events: readonly StoredLogEvent[]): string {
  return stub("renderLogView");
}
export async function regenerateLogView(paths: ResolvedPaths): Promise<{ file: string; events: number }> {
  return stub("regenerateLogView");
}
