// src/kb/parse-instructions.ts
// Contract C1 — contract/S-03-kb-parser (owner STORY-005-01). Frozen exports: the owner replaces the two function
// bodies and never renames or retypes an export; the three lists keep exactly these values, in this order.
// Consumers: STORY-005-02, 005-04, 005-05, 005-06, 006-10, 006-11.
import type { ResolvedPaths } from "../core/paths.js";
import type { SourceKindRule } from "../ingest/kind-rules.js";

/** The `## ` section keys, in STORY-005-01 R3 order. */
export const KB_SECTION_KEYS = [
  "questions",
  "entities",
  "capture-signals",
  "source-kinds",
  "write-policy",
  "never-capture",
  "rule-changelog",
] as const;
export type KbSectionKey = (typeof KB_SECTION_KEYS)[number];

/** The sections a rule proposal names instead of a source kind (`wikeeper rules record --kind`, STORY-005-06). */
export const KB_PROPOSAL_SECTION_KEYS = [
  "questions",
  "entities",
  "capture-signals",
  "write-policy",
  "never-capture",
] as const;

export const KB_ISSUE_CODES = [
  "unknown-question-ref",
  "malformed-question",
  "malformed-entity",
  "ambiguous-line",
  "missing-section",
] as const;

export interface KbSection {
  heading: string;
  key: KbSectionKey | null;
  line: number;
}
export interface KbQuestion {
  id: string; // "Q4"
  text: string;
  datedFacts: boolean;
  line: number;
}
export interface KbEntity {
  name: string;
  fields: string[];
  page: string;
  questionRefs: string[];
  line: number;
}
export interface KbNote {
  section: string; // a KbSectionKey, or "" before the first heading or under an unknown heading
  text: string;
  line: number;
}
export interface KbChangelogEntry {
  date: string; // YYYY-MM-DD
  text: string;
  line: number;
}
export interface KbIssue {
  line: number; // 0 = whole file
  code: string; // one of KB_ISSUE_CODES
  message: string;
}
export interface KbInstructions {
  purpose: string | null;
  sections: KbSection[];
  questions: KbQuestion[];
  entities: KbEntity[];
  kinds: SourceKindRule[]; // exactly parseSourceKinds(text) (SPRINT-02 C2)
  notes: KbNote[];
  neverCapture: string[];
  changelog: KbChangelogEntry[];
  issues: KbIssue[]; // sorted by line, then code
}

export function parseInstructions(text: string): KbInstructions {
  throw new Error("contract stub C1");
}

export async function loadInstructions(paths: ResolvedPaths): Promise<{ text: string; kb: KbInstructions } | null> {
  throw new Error("contract stub C1");
}
