// src/ingest/facts.ts
// Contract C7 — contract/S-02-facts (owner STORY-003-06). Frozen exports. Consumers: STORY-003-08, 003-09, 006-04.
// `Fact` and `FactStatus` here describe an extracted fact; src/wiki/parse-page.ts exports a page's fact line under the
// same names. A file that needs both aliases one of them on import.
import type { ResolvedPaths } from "../core/paths.js";

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C7)`);
}

export const FACT_STATUSES: readonly ["decided", "tentative"] = ["decided", "tentative"];
export type FactStatus = (typeof FACT_STATUSES)[number];
export interface Fact {
  entity: string; // "<type>:<name>", FACT_ENTITY_RE
  field: string; // non-empty
  value: string | number | boolean;
  status: FactStatus;
  as_of: string; // a real calendar date YYYY-MM-DD, FACT_AS_OF_RE
  anchor: string; // non-empty
  page: string; // relative to pages/, POSIX, ends in .md, FACT_PAGE_RE
  exists: boolean;
}
export interface FactsFile {
  source_id: string;
  kind: string; // isValidKindId (C2)
  rule_version: number | null; // integer >= 1, or null when no rule exists for the kind
  facts: Fact[];
  new_entities: string[]; // normalised to [] when absent
  uncovered: string[];
}
export interface FactsError {
  path: string; // "$", "notes", "facts[2].status"
  message: string;
}
export type FactsValidation = { ok: true; value: FactsFile } | { ok: false; errors: FactsError[] };

export const FACTS_SCHEMA_REL: ".wiki/system/schemas/facts.schema.json" = ".wiki/system/schemas/facts.schema.json";
export const FACTS_KEYS: readonly string[] = ["source_id", "kind", "rule_version", "facts", "new_entities", "uncovered"];
export const FACTS_REQUIRED: readonly string[] = ["source_id", "kind", "rule_version", "facts"];
export const FACT_KEYS: readonly string[] = ["entity", "field", "value", "status", "as_of", "anchor", "page", "exists"];
export const FACT_REQUIRED: readonly string[] = ["entity", "field", "value", "status", "as_of", "anchor", "page", "exists"];
export const FACT_ENTITY_RE: RegExp = /^[a-z][a-z0-9-]*:\S(?:.*\S)?$/;
export const FACT_AS_OF_RE: RegExp = /^\d{4}-\d{2}-\d{2}$/;
export const FACT_PAGE_RE: RegExp = /^(?![/\\])(?!(?:.*\/)?\.\.(?:\/|$))[^\\]+\.md$/;

export function validateFacts(input: unknown): FactsValidation {
  return stub("validateFacts");
}
/** Absolute native path of raw/<id>.facts.json (under paths.rawDir). */
export function factsFilePath(paths: ResolvedPaths, sourceId: string): string {
  return stub("factsFilePath");
}
export async function readFacts(paths: ResolvedPaths, sourceId: string): Promise<FactsFile | null> {
  return stub("readFacts");
}
/** `file` is relative to paths.root, POSIX; `sha256` is the hash of the written file. */
export async function writeFacts(
  paths: ResolvedPaths,
  facts: FactsFile,
): Promise<{ file: string; replaced: boolean; sha256: string }> {
  return stub("writeFacts");
}
