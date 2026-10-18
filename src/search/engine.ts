// src/search/engine.ts
// Contract C10 (owner STORY-004-02). Frozen exports. Consumers: STORY-004-03, 004-04, 004-05;
// STORY-004-06 builds from C13 (004-02's own Developer commit).
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type MiniSearch from "minisearch";
import type { AsPlainObject, Options } from "minisearch";
import { compareCodeUnits } from "../core/compare.js";
import { toPosixRelative } from "../core/paths.js";
import { estimateTokens } from "../core/tokens.js";
import type { ResolvedPaths } from "../core/paths.js";
import { readPackageVersion } from "../core/templates.js";
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
  mark?: "decided" | "tentative";
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
  page_tokens: number;
}
export type SearchHitBase = Omit<SearchHit, "page_tokens">;
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
  facts_total?: number;
  pages_total?: number;
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
  events?: number;
}
export interface SearchRequest {
  query: string | null;
  limit: number;
  filters: SearchFilters;
  entity: string | null;
  misses: boolean;
  noMiss?: boolean;
}
export interface SearchDeps {
  now?: () => Date;
  useCache?: boolean;
  onRebuild?: () => void;
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
  pageTokens(path: string): number;
}

export const MINISEARCH_OPTIONS: Options<SearchDoc> = {
  fields: ["title", "heading", "aliases", "text"],
  idField: "id",
};

export const SEARCH_CACHE_VERSION = 1 as const;

export function searchCacheFile(paths: ResolvedPaths): string {
  return path.join(paths.wikiDir, ".cache", "search.json");
}

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

async function newMiniSearch(docs: readonly SearchDoc[]): Promise<MiniSearch<SearchDoc>> {
  const { default: MiniSearchCtor } = await import("minisearch");
  const mini = new MiniSearchCtor<SearchDoc>(MINISEARCH_OPTIONS);
  mini.addAll(docs as SearchDoc[]);
  return mini;
}

function wrapIndex(mini: MiniSearch<SearchDoc>, docs: readonly SearchDoc[]): SearchIndex {
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

export async function createSearchIndex(docs: readonly SearchDoc[]): Promise<SearchIndex> {
  return wrapIndex(await newMiniSearch(docs), docs);
}

interface CacheFileKey {
  path: string;
  sha256: string;
}
interface SearchCacheFile {
  version: typeof SEARCH_CACHE_VERSION;
  package_version: string;
  files: CacheFileKey[];
  pages: Page[];
  docs: SearchDoc[];
  index: AsPlainObject;
}

let cachedPackageVersion: string | null = null;
function packageVersion(): string {
  cachedPackageVersion ??= readPackageVersion();
  return cachedPackageVersion;
}
let tmpSeq = 0;

function isUsableCache(c: unknown, keys: readonly CacheFileKey[]): c is SearchCacheFile {
  if (typeof c !== "object" || c === null) return false;
  const o = c as Record<string, unknown>;
  if (o.version !== SEARCH_CACHE_VERSION || o.package_version !== packageVersion()) return false;
  if (!Array.isArray(o.pages) || !Array.isArray(o.docs)) return false;
  if (typeof o.index !== "object" || o.index === null) return false;
  const files = o.files;
  if (!Array.isArray(files) || files.length !== keys.length) return false;
  return keys.every((k, i) => {
    const f = files[i] as Partial<CacheFileKey> | null;
    return typeof f === "object" && f !== null && f.path === k.path && f.sha256 === k.sha256;
  });
}

export async function loadSearchCorpus(
  paths: ResolvedPaths,
  opts: { useCache?: boolean; onRebuild?: () => void } = {},
): Promise<SearchCorpus> {
  const useCache = opts.useCache ?? true;
  const files = await listPageFiles(paths.pagesDir);
  const bufs = await Promise.all(files.map((rel) => readFile(path.join(paths.pagesDir, ...rel.split("/")))));
  const keys: CacheFileKey[] = files.map((p, i) => ({
    path: p,
    sha256: createHash("sha256").update(bufs[i] as Buffer).digest("hex"),
  }));
  const file = searchCacheFile(paths);
  // page_tokens (STORY-007-05): estimated when asked, from the bytes already read; never cached. UTF-8 with the BOM kept.
  const at = new Map(files.map((f, i) => [f, i]));
  const memo = new Map<string, number>();
  const pageTokens = (p: string): number => {
    const i = at.get(p);
    if (i === undefined) return 0;
    let n = memo.get(p);
    if (n === undefined) {
      n = estimateTokens((bufs[i] as Buffer).toString("utf8"));
      memo.set(p, n);
    }
    return n;
  };

  if (useCache) {
    try {
      const cache: unknown = JSON.parse(await readFile(file, "utf8"));
      if (isUsableCache(cache, keys)) {
        const { default: MiniSearchCtor } = await import("minisearch");
        const mini = MiniSearchCtor.loadJS(cache.index, MINISEARCH_OPTIONS);
        return {
          pages: cache.pages,
          entities: cache.pages.flatMap(pageEntities),
          index: wrapIndex(mini, cache.docs),
          warnings: [],
          pageTokens,
        };
      }
    } catch {
      // unreadable or invalid cache: rebuild silently
    }
  }

  const pages = files.map((rel, i) => parsePage((bufs[i] as Buffer).toString("utf8"), rel));
  const docs = buildDocs(pages);
  const mini = await newMiniSearch(docs);
  const warnings: string[] = [];
  if (useCache) {
    opts.onRebuild?.();
    const dir = path.dirname(file);
    const tmp = path.join(dir, `search.json.${process.pid}.${++tmpSeq}.tmp`);
    try {
      const body: SearchCacheFile = {
        version: SEARCH_CACHE_VERSION,
        package_version: packageVersion(),
        files: keys,
        pages,
        docs,
        index: mini.toJSON(),
      };
      await mkdir(dir, { recursive: true });
      await writeFile(tmp, JSON.stringify(body));
      await rename(tmp, file);
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => undefined);
      const e = err as NodeJS.ErrnoException;
      warnings.push(`search cache not written: ${toPosixRelative(paths.root, file)}: ${e.code ?? e.message}`);
    }
  }
  return { pages, entities: pages.flatMap(pageEntities), index: wrapIndex(mini, docs), warnings, pageTokens };
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
