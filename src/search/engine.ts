// src/search/engine.ts
// Contract C10 (owner STORY-004-02). Frozen exports. Consumers: STORY-004-03, 004-04, 004-05;
// STORY-004-06 builds from C13 (004-02's own Developer commit).
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Options } from "minisearch";
import { compareCodeUnits } from "../core/compare.js";
import type { ResolvedPaths } from "../core/paths.js";
import { CITATION_RE, listPageFiles, owningEntityKey, pageEntities, parsePage } from "../wiki/parse-page.js";
import type { Entity, Page } from "../wiki/parse-page.js";

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

export const MINISEARCH_OPTIONS: Options<SearchDoc> = {
  fields: ["title", "heading", "aliases", "text"],
  idField: "id",
};

const SEARCH_OPTIONS = {
  combineWith: "AND" as const,
  prefix: (term: string): boolean => term.length >= 3,
  fuzzy: (term: string): number | false => (term.length >= 5 ? 0.2 : false),
  boost: { heading: 2, aliases: 2, title: 1.5, text: 1 },
};

export function buildDocs(pages: readonly Page[]): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const page of pages) {
    const aliasesByKey = new Map<string, string>();
    for (const e of pageEntities(page)) aliasesByKey.set(e.key, e.aliases.join(" "));
    for (const sec of page.sections) {
      if (sec.heading === "" && sec.text.trim() === "") continue;
      const entityKey = owningEntityKey(page, sec.index);
      docs.push({
        id: docs.length,
        path: page.path,
        section: sec.index,
        heading: sec.heading,
        line: sec.line,
        title: page.title,
        entityKey,
        aliases: aliasesByKey.get(entityKey) ?? "",
        text: sec.text,
      });
    }
  }
  return docs;
}

export async function createSearchIndex(docs: readonly SearchDoc[]): Promise<SearchIndex> {
  const { default: MiniSearch } = await import("minisearch");
  const mini = new MiniSearch<SearchDoc>(MINISEARCH_OPTIONS);
  mini.addAll(docs as SearchDoc[]);
  return {
    docs,
    query(text: string): RankedHit[] {
      const hits: RankedHit[] = [];
      for (const r of mini.search(text, SEARCH_OPTIONS)) {
        const doc = docs[r.id as number];
        if (doc) hits.push({ doc, score: r.score, terms: r.terms });
      }
      return hits.sort(
        (a, b) => b.score - a.score || compareCodeUnits(a.doc.path, b.doc.path) || a.doc.line - b.doc.line,
      );
    },
  };
}

export async function loadSearchCorpus(
  paths: ResolvedPaths,
  _opts?: { useCache?: boolean; onRebuild?: () => void },
): Promise<SearchCorpus> {
  // Same result as loadPages(paths.pagesDir), with the file reads in parallel (performance budget, R8).
  const files = await listPageFiles(paths.pagesDir);
  const pages = await Promise.all(
    files.map(async (rel) => parsePage(await readFile(path.join(paths.pagesDir, ...rel.split("/")), "utf8"), rel)),
  );
  const entities = pages.flatMap(pageEntities);
  const index = await createSearchIndex(buildDocs(pages));
  return { pages, entities, index, warnings: [] };
}

const SNIPPET_MAX = 160;

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function makeSnippet(text: string, terms: readonly string[]): string {
  const lowered = terms.map((t) => t.toLowerCase()).filter((t) => t !== "");
  for (const raw of text.split("\n")) {
    const line = collapse(raw);
    if (line === "") continue;
    const lower = line.toLowerCase();
    let at = -1;
    for (const t of lowered) {
      const i = lower.indexOf(t);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    if (at < 0) continue;
    if (line.length <= SNIPPET_MAX) return line;
    let start = Math.max(0, at - Math.floor((SNIPPET_MAX - 1) / 4));
    let end = Math.min(line.length, start + SNIPPET_MAX);
    start = Math.max(0, end - SNIPPET_MAX);
    if (start > 0) {
      const sp = line.indexOf(" ", start);
      if (sp >= 0 && sp < at) start = sp + 1;
    }
    if (end < line.length) {
      const sp = line.lastIndexOf(" ", end);
      if (sp > at && sp > start) end = sp;
    }
    return `${start > 0 ? "…" : ""}${line.slice(start, end).trim()}${end < line.length ? "…" : ""}`;
  }
  const flat = collapse(text);
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX).trimEnd()}…` : flat;
}

export function hitSources(page: Page, section: number): string[] {
  const ids: string[] = [];
  for (const link of page.links) {
    if (link.section === section && CITATION_RE.test(link.target) && !ids.includes(link.target)) ids.push(link.target);
  }
  return ids.length > 0 ? ids : [...page.frontmatter.sources];
}
