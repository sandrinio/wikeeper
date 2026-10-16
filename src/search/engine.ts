// src/search/engine.ts
// Contract C10 — contract/S-02-search (owner STORY-004-02). Frozen exports. Consumers: STORY-004-03, 004-04, 004-05;
// STORY-004-06 builds from C13 (004-02's own Developer commit). minisearch arrives with STORY-004-02, not here.
import type { ResolvedPaths } from "../core/paths.js";
import type { Entity, Page } from "../wiki/parse-page.js";

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C10)`);
}

export interface WhereFilter {
  key: string;
  value: string;
}
export interface SearchFilters {
  type: string | null;
  where: WhereFilter[];
  status: string | null;
  since: string | null;
}
export interface SearchHit {
  path: string;
  file: string;
  title: string;
  entity: string;
  type: string | null;
  section: string;
  line: number;
  snippet: string;
  score: number;
  sources: string[];
}
export interface FactView {
  path: string;
  entity: string;
  section: string;
  line: number;
  date: string;
  status: "decided" | "tentative";
  text: string;
  sources: string[];
  contradiction: boolean;
}
export interface EntityMatch {
  key: string;
  name: string;
  type: string | null;
  path: string;
  file: string;
  section: string;
  line: number;
  aliases: string[];
  matched: "name" | "alias";
  matched_alias: string | null;
  summary: string | null;
  typed_links: Array<{ key: string; value: string; targets: string[] }>;
  facts: FactView[];
  backlinks: Array<{ path: string; section: string; line: number; context: string }>;
  also_matches: Array<{ name: string; path: string; section: string; line: number }>;
}
export interface SinceChanges {
  since: string;
  facts: FactView[];
  pages: Array<{ path: string; change: "created" | "updated" | "deleted"; source_id: string | null; at: string }>;
}
export interface MissSummary {
  query: string | null;
  filters: SearchFilters;
  entity: string | null;
  count: number;
  first_at: string;
  last_at: string;
}
export interface SearchData {
  mode: "query" | "entity" | "misses";
  query: string | null;
  filters: SearchFilters;
  entity_query: string | null;
  total: number;
  results: SearchHit[];
  entity: EntityMatch | null;
  changes: SinceChanges | null;
  misses: MissSummary[] | null;
}
export interface SearchRequest {
  query: string | null;
  limit: number;
  filters: SearchFilters;
  entity: string | null;
  misses: boolean;
}
export interface SearchDeps {
  now?: () => Date;
  useCache?: boolean;
}
const EMPTY: SearchFilters = { type: null, where: [], status: null, since: null };
/** Shared and frozen: copy before use (`{ ...EMPTY_FILTERS, where: [] }`), never mutate `where`. */
export const EMPTY_FILTERS: Readonly<SearchFilters> = Object.freeze(EMPTY);
export interface SearchDoc {
  id: number;
  path: string;
  section: number;
  heading: string;
  line: number;
  title: string;
  entityKey: string;
  aliases: string;
  text: string;
}
export interface RankedHit {
  doc: SearchDoc;
  score: number;
  terms: string[];
}
export interface SearchIndex {
  readonly docs: readonly SearchDoc[];
  query(text: string): RankedHit[];
}
export interface SearchCorpus {
  pages: Page[];
  entities: Entity[];
  index: SearchIndex;
  warnings: string[];
}

export function buildDocs(pages: readonly Page[]): SearchDoc[] {
  return stub("buildDocs");
}
export async function createSearchIndex(docs: readonly SearchDoc[]): Promise<SearchIndex> {
  return stub("createSearchIndex");
}
export async function loadSearchCorpus(
  paths: ResolvedPaths,
  opts?: { useCache?: boolean; onRebuild?: () => void },
): Promise<SearchCorpus> {
  return stub("loadSearchCorpus");
}
export function makeSnippet(text: string, terms: readonly string[]): string {
  return stub("makeSnippet");
}
export function hitSources(page: Page, section: number): string[] {
  return stub("hitSources");
}
