// src/commands/search.ts
// Contract C10 (owner STORY-004-02). Consumers write only at their own INSERTION POINT lines; the owner keeps
// every anchor line exactly as written.
import { access } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { compareCodeUnits } from "../core/compare.js";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { findRepoRoot, resolvePaths, toPosixRelative } from "../core/paths.js";
import type { CommandModule } from "../program.js";
import { readLogEvents } from "../ingest/log.js";
import { resolveEntity, toEntityMatch } from "../search/aliases.js";
import { factsSince, pagesChangedSince, parseSince } from "../search/since.js";
import type { SinceBound } from "../search/since.js";
import type { SinceChanges } from "../search/engine.js";
import { buildBacklinks, normalizeName } from "../wiki/parse-page.js";
import { EMPTY_FILTERS, hitSources, loadSearchCorpus, makeSnippet } from "../search/engine.js";
import type { RankedHit, SearchData, SearchDeps, SearchHit, SearchRequest } from "../search/engine.js";
import type { Entity, Page } from "../wiki/parse-page.js";
import { describeFilters, entityHit, hasFilters, markHits, matchesFilters, parseFilterValue, parseMark, parseWhere } from "../search/filters.js";
import { plural } from "./doctor.js";
import { listMisses, recordMiss, renderMisses, shouldRecordMiss } from "../search/misses.js";

const warningsOf = new WeakMap<SearchData, string[]>();

/** Warnings collected while `executeSearch` built `data` (the envelope's `warnings`). */
export function searchWarnings(data: SearchData): readonly string[] {
  return warningsOf.get(data) ?? [];
}

/** STORY-004-04: --entity is exclusive with a query and the 004-03 filters (R5); --since must parse (R6). */
function entitySinceBound(req: SearchRequest): SinceBound | null {
  if (req.entity !== null && req.entity.trim() === "") {
    throw new WikeeperError(ExitCode.USAGE, "usage", "--entity needs a name");
  }
  if (req.entity !== null && (req.query !== null || hasFilters(req.filters))) {
    throw new WikeeperError(ExitCode.USAGE, "usage", "--entity cannot be combined with a query, --type, --where or --status");
  }
  return req.filters.since === null ? null : parseSince(req.filters.since);
}

function where(path: string, section: string): string {
  return section === "" ? path : `${path} › ${section}`;
}

function renderChanges(c: SinceChanges): string {
  if (c.facts.length === 0 && c.pages.length === 0) return `no changes since ${c.since}`;
  const lines = [
    `changes since ${c.since}: ${plural(c.facts_total ?? c.facts.length, "fact")}, ${plural(c.pages_total ?? c.pages.length, "page change")}`,
  ];
  for (const f of c.facts) lines.push(`- ${f.date} · ${f.status} · ${f.text} (${where(f.path, f.section)})`);
  for (const p of c.pages) lines.push(`- ${p.change} ${p.path} · ${p.source_id ?? "no source"} · ${p.at}`);
  return lines.join("\n");
}

function renderEntity(data: SearchData): string {
  const e = data.entity;
  if (e === null) return `no entity named "${data.entity_query ?? ""}"`;
  const lines = [
    `${e.name}${e.type === null ? "" : ` (${e.type})`} · ${where(e.path, e.section)}${e.matched === "alias" ? ` · matched alias "${e.matched_alias ?? ""}"` : ""}`,
  ];
  if (e.aliases.length > 0) lines.push(`aliases: ${e.aliases.join(", ")}`);
  if (e.summary !== null && e.summary !== "") lines.push(`summary: ${e.summary}`);
  for (const t of e.typed_links) lines.push(`${t.key}:: ${t.value}`);
  for (const f of e.facts) lines.push(`- ${f.date} · ${f.status} · ${f.text}`);
  if (e.backlinks.length > 0) {
    lines.push(`linked from ${plural(e.backlinks.length, "place")}:`);
    for (const b of e.backlinks) lines.push(`  ${where(b.path, b.section)}:${b.line}  ${b.context}`);
  }
  if (e.also_matches.length > 0) {
    lines.push(`also matches: ${e.also_matches.map((m) => `${m.name} (${where(m.path, m.section)})`).join(", ")}`);
  }
  return lines.join("\n");
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** R4: one line naming every list that `--limit` cut, or null. */
function limitNote(data: SearchData): string | null {
  const parts: string[] = [];
  const countsChanges = data.query === null && !hasFilters(data.filters) && data.changes !== null;
  if (data.mode === "query" && !countsChanges && data.results.length < data.total) {
    parts.push(`${data.results.length} of ${data.total} results`);
  }
  const c = data.changes;
  if (c !== null) {
    if (c.facts_total !== undefined && c.facts.length < c.facts_total) parts.push(`${c.facts.length} of ${c.facts_total} facts`);
    if (c.pages_total !== undefined && c.pages.length < c.pages_total) parts.push(`${c.pages.length} of ${c.pages_total} page changes`);
  }
  if (data.mode === "misses" && data.misses !== null && data.misses.length < data.total) {
    parts.push(`${data.misses.length} of ${data.total} distinct queries`);
  }
  return parts.length === 0 ? null : `showing ${joinParts(parts)}; use --limit to see more`;
}

function renderSearch(data: SearchData): string {
  const body = renderSearchBody(data);
  const note = limitNote(data);
  return note === null ? body : `${body}\n${note}`;
}

function renderSearchBody(data: SearchData): string {
  if (data.mode === "misses") return renderMisses(data);
  if (data.mode === "entity") {
    const head = renderEntity(data);
    return data.changes === null ? head : `${head}\n\n${renderChanges(data.changes)}`;
  }
  if (data.changes === null) return renderHuman(data);
  if (data.query === null && !hasFilters(data.filters)) return renderChanges(data.changes);
  return `${renderHuman(data)}\n\n${renderChanges(data.changes)}`;
}

export async function executeSearch(root: string, req: SearchRequest, deps: SearchDeps = {}): Promise<SearchData> {
  // 1. usage: req.limit not an integer 1..100; or no query, no filter (type/where/status/since), no entity and no misses
  //    -> WikeeperError(ExitCode.USAGE, "usage", "give a query or a filter")
  if (!Number.isInteger(req.limit) || req.limit < 1 || req.limit > 100) {
    throw new WikeeperError(ExitCode.USAGE, "usage", "--limit must be an integer from 1 to 100");
  }
  markUsage(req);
  const f = req.filters;
  if (
    req.query === null &&
    f.type === null &&
    f.where.length === 0 &&
    f.status === null &&
    f.since === null &&
    f.mark === undefined &&
    req.entity === null &&
    !req.misses
  ) {
    throw new WikeeperError(ExitCode.USAGE, "usage", "give a query or a filter");
  }
  // 2. const paths = resolvePaths(root, (await loadConfig(root)).config); no paths.configFile -> ExitCode.ERROR "not_initialised"
  const paths = resolvePaths(root, (await loadConfig(root)).config);
  try {
    await access(paths.configFile);
  } catch {
    throw new WikeeperError(ExitCode.ERROR, "not_initialised", "not initialised — run wikeeper init");
  }
  // 3. const corpus = await loadSearchCorpus(paths, { useCache: deps.useCache, onRebuild: deps.onRebuild });
  const corpus = await loadSearchCorpus(paths, { useCache: deps.useCache, onRebuild: deps.onRebuild });
  const warnings: string[] = [...corpus.warnings];
  let ranked: RankedHit[] = req.query === null ? [] : corpus.index.query(req.query);
  // INSERTION POINT STORY-004-03: filter step (req.filters.type / .where / .status) on the ranked hits.
  let entityHits: SearchHit[] | null = null;
  if (hasFilters(req.filters)) {
    const pageOf = new Map(corpus.pages.map((p) => [p.path, p]));
    const passing = corpus.entities.filter((e) => matchesFilters(e, req.filters, pageOf.get(e.path)!));
    if (req.query !== null) {
      const keys = new Set(passing.map((e) => e.key));
      ranked = ranked.filter((h) => keys.has(h.doc.entityKey));
    } else {
      entityHits = passing
        .sort((a, b) => compareCodeUnits(a.path, b.path) || a.line - b.line)
        .map((e) => entityHit(e, pageOf.get(e.path)!, root, paths));
    }
  }
  if (f.mark !== undefined && req.entity === null && f.since === null) {
    entityHits = markHits(corpus.entities, corpus.pages, f.mark, req.filters, root, paths);
  }
  // 4. build the data
  const pageByPath = new Map<string, Page>(corpus.pages.map((p) => [p.path, p]));
  const entityByKey = new Map<string, Entity>(corpus.entities.map((e) => [e.key, e]));
  const toHit = (r: RankedHit): SearchHit => {
    const { doc } = r;
    const entity = entityByKey.get(doc.entityKey);
    return {
      path: doc.path,
      file: toPosixRelative(root, path.join(paths.pagesDir, ...doc.path.split("/"))),
      title: doc.title,
      entity: entity?.name ?? doc.title,
      type: entity?.type ?? null,
      section: doc.heading,
      line: doc.line,
      snippet: makeSnippet(doc.text, r.terms),
      score: Math.round(r.score * 1000) / 1000,
      sources: hitSources(pageByPath.get(doc.path)!, doc.section),
    };
  };
  let data: SearchData = {
    mode: "query",
    query: req.query,
    filters: req.filters,
    entity_query: null,
    total: entityHits === null ? ranked.length : entityHits.length,
    results: entityHits === null ? ranked.slice(0, req.limit).map(toHit) : entityHits.slice(0, req.limit),
    entity: null,
    changes: null,
    misses: null,
  };
  // INSERTION POINT STORY-004-04: entity mode (req.entity) and the --since changes (req.filters.since).
  const sinceBound = entitySinceBound(req);
  if (!req.misses && (req.entity !== null || sinceBound !== null)) {
    const changedPages =
      sinceBound === null
        ? []
        : pagesChangedSince((await readLogEvents(paths, { type: "ingest", since: sinceBound.instant })).events);
    const sinceDate = sinceBound === null ? "" : sinceBound.date;
    if (req.entity !== null) {
      const res = resolveEntity(corpus.entities, req.entity);
      let entity = res === null ? null : toEntityMatch(res, corpus.pages, root, paths, buildBacklinks(corpus.pages));
      let changes: SinceChanges | null = null;
      if (sinceBound !== null) {
        if (entity !== null) entity = { ...entity, facts: entity.facts.filter((x) => x.date >= sinceDate) };
        const eFacts = res === null ? [] : factsSince([res.entity], corpus.pages, sinceBound).filter((x) => f.mark === undefined || x.status === f.mark);
        const ePages = res === null || f.mark !== undefined ? [] : changedPages.filter((p) => p.path === res.entity.path);
        changes = {
          since: req.filters.since!,
          facts: eFacts.slice(0, req.limit),
          pages: ePages.slice(0, req.limit),
          facts_total: eFacts.length,
          pages_total: ePages.length,
        };
      }
      if (f.mark !== undefined && entity !== null) entity = { ...entity, facts: entity.facts.filter((x) => x.status === f.mark) };
      data = { ...data, mode: "entity", entity_query: req.entity, total: entity === null ? 0 : 1, results: [], entity, changes };
    } else if (sinceBound !== null) {
      const changed = new Set(changedPages.map((p) => p.path));
      const passes = (e: Entity | undefined): e is Entity =>
        e !== undefined && (e.facts.some((x) => x.date >= sinceDate) || changed.has(e.path));
      const sinceOnly = req.query === null && !hasFilters(req.filters);
      let kept: Entity[] = corpus.entities;
      if (!sinceOnly) {
        ranked = ranked.filter((h) => passes(entityByKey.get(h.doc.entityKey)));
        const keys = new Set(ranked.map((h) => h.doc.entityKey));
        if (entityHits !== null) {
          const byHit = new Map(corpus.entities.map((e) => [`${e.path}\u0000${e.line}\u0000${e.name}`, e]));
          entityHits = entityHits.filter((h) => {
            const e = byHit.get(`${h.path}\u0000${h.line}\u0000${h.entity}`);
            if (!passes(e)) return false;
            keys.add(e.key);
            return true;
          });
        }
        data = {
          ...data,
          total: entityHits === null ? ranked.length : entityHits.length,
          results: entityHits === null ? ranked.slice(0, req.limit).map(toHit) : entityHits.slice(0, req.limit),
        };
        kept = corpus.entities.filter((e) => keys.has(e.key));
      }
      const keptPaths = new Set(kept.map((e) => e.path));
      const facts = factsSince(kept, corpus.pages, sinceBound).filter((x) => f.mark === undefined || x.status === f.mark);
      const pages = f.mark !== undefined ? [] : sinceOnly ? changedPages : changedPages.filter((p) => keptPaths.has(p.path));
      data = {
        ...data,
        total: sinceOnly ? facts.length + pages.length : data.total,
        changes: {
          since: req.filters.since!,
          facts: facts.slice(0, req.limit),
          pages: pages.slice(0, req.limit),
          facts_total: facts.length,
          pages_total: pages.length,
        },
      };
    }
  }
  // INSERTION POINT STORY-004-05: misses mode (req.misses) and miss recording.
  if (req.misses) {
    missesUsage(req);
    const misses = await listMisses(paths, sinceBound);
    data = {
      ...data,
      mode: "misses",
      query: null,
      entity_query: null,
      total: misses.length,
      results: [],
      entity: null,
      changes: null,
      misses: misses.slice(0, req.limit),
      events: misses.reduce((n, m) => n + m.count, 0),
    };
  }
  if (data.mode !== "misses" && data.total === 0) {
    const status = normalizeName(f.status ?? "");
    if (status === "decided" || status === "tentative") {
      warnings.push(`fact marks are filtered with --mark: wikeeper search --mark ${status}`);
    }
  }
  if (!req.noMiss && shouldRecordMiss(data)) {
    const miss = await recordMiss(paths, data, (deps.now ?? (() => new Date()))());
    if (miss.warning !== null) warnings.push(miss.warning);
  }
  // 5.
  warningsOf.set(data, warnings);
  return data;
}

function renderHuman(data: SearchData): string {
  const label = data.query !== null ? `"${data.query}"` : describeFilters(data.filters);
  if (data.results.length === 0) return `no results for ${label}`;
  const lines = [`${plural(data.total, "result")} for ${label}`];
  data.results.forEach((hit, i) => {
    lines.push(`${i + 1}. ${hit.path}${hit.section === "" ? "" : ` › ${hit.section}`}`);
    if (hit.snippet !== "") lines.push(`   ${hit.snippet}`);
    if (hit.sources.length > 0) lines.push(`   sources: ${hit.sources.join(", ")}`);
  });
  return lines.join("\n");
}

interface SearchOptions {
  limit: string;
  // INSERTION POINT STORY-004-03: type?: string; where?: string[]; status?: string;
  type?: string;
  where?: string[];
  status?: string;
  // INSERTION POINT STORY-004-04: entity?: string; since?: string;
  entity?: string;
  since?: string;
  // INSERTION POINT STORY-004-05: misses?: boolean;
  misses?: boolean;
  mark?: string;
  miss: boolean;
}

export function createSearchCommand(deps: SearchDeps = {}): CommandModule {
  return {
    register(program: Command): void {
      program
        .command("search")
        .description("search the wiki pages")
        .argument("[query...]", "words to search for")
        .option("--limit <n>", "maximum number of results (1-100)", "10")
        // INSERTION POINT STORY-004-03: --type <type>, --where <key=value> (repeatable), --status <status>
        .option("--type <type>", "entity type: frontmatter type, or a section's type:: link")
        .option(
          "--where <key=value>",
          "typed-link or frontmatter condition; repeatable, all must hold",
          (v: string, acc: string[]) => [...acc, v],
          [] as string[],
        )
        .option("--status <status>", "status:: value, or frontmatter status")
        // INSERTION POINT STORY-004-04: --entity <name>, --since <date>
        .option("--entity <name>", "look up one entity by name or alias, with its facts and backlinks")
        .option("--since <date>", "facts dated, and pages changed by an ingest, on or after this date (YYYY-MM-DD or ISO 8601)")
        // INSERTION POINT STORY-004-05: --misses
        .option("--misses", "list the searches that found nothing, grouped and counted (only with --since and --limit)")
        .option("--mark <mark>", "only fact lines marked decided or tentative; with --type, --where, --status, --entity or --since")
        .option("--no-miss", "do not record this search as a miss when it finds nothing (for triage and routing searches)")
        .action(async (words: string[], opts: SearchOptions, command: Command) => {
          const ctx = getOutputContext(command);
          const req: SearchRequest = {
            query: words.length > 0 ? words.join(" ") : null,
            limit: Number(opts.limit),
            filters: { ...EMPTY_FILTERS, where: [] },
            entity: null,
            misses: false,
          };
          // INSERTION POINT STORY-004-03: req.filters.type / .where / .status from opts
          req.filters.type = parseFilterValue("--type", opts.type);
          req.filters.where = (opts.where ?? []).map(parseWhere);
          req.filters.status = parseFilterValue("--status", opts.status);
          const mark = parseMark(opts.mark);
          if (mark !== undefined) req.filters.mark = mark;
          // INSERTION POINT STORY-004-04: req.entity and req.filters.since from opts
          if (opts.entity !== undefined) req.entity = opts.entity;
          if (opts.since !== undefined) req.filters.since = opts.since;
          entitySinceBound(req);
          // INSERTION POINT STORY-004-05: req.misses from opts
          req.misses = opts.misses === true;
          missesUsage(req);
          req.noMiss = opts.miss === false;
          markUsage(req);
          const data = await executeSearch(findRepoRoot(ctx.cwd), req, deps);
          emitResult(ctx, { command: "search", data, warnings: [...searchWarnings(data)], message: renderSearch(data) });
        });
    },
  };
}

export const searchCommand: CommandModule = createSearchCommand();

/** STORY-004-05 R5: --misses lists recorded misses; it combines only with --since and --limit. */
function missesUsage(req: SearchRequest): void {
  if (req.misses && (req.query !== null || hasFilters(req.filters) || req.filters.mark !== undefined || req.entity !== null)) {
    throw new WikeeperError(
      ExitCode.USAGE,
      "usage",
      "--misses cannot be combined with a query, --type, --where, --status, --mark or --entity",
    );
  }
}

/** STORY-004-07 R7: --mark lists fact lines, so it does not take a text query. */
function markUsage(req: SearchRequest): void {
  if (req.filters.mark !== undefined && req.query !== null) {
    throw new WikeeperError(
      ExitCode.USAGE,
      "usage",
      "--mark cannot be combined with a query; use --type, --where, --status, --entity or --since",
    );
  }
}
