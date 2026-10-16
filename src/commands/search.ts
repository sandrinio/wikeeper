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
import { EMPTY_FILTERS, hitSources, loadSearchCorpus, makeSnippet } from "../search/engine.js";
import type { RankedHit, SearchData, SearchDeps, SearchHit, SearchRequest } from "../search/engine.js";
import type { Entity, Page } from "../wiki/parse-page.js";
import { describeFilters, entityHit, hasFilters, matchesFilters, parseFilterValue, parseWhere } from "../search/filters.js";
import { plural } from "./doctor.js";

const warningsOf = new WeakMap<SearchData, string[]>();

/** Warnings collected while `executeSearch` built `data` (the envelope's `warnings`). */
export function searchWarnings(data: SearchData): readonly string[] {
  return warningsOf.get(data) ?? [];
}

export async function executeSearch(root: string, req: SearchRequest, deps: SearchDeps = {}): Promise<SearchData> {
  // 1. usage: req.limit not an integer 1..100; or no query, no filter (type/where/status/since), no entity and no misses
  //    -> WikeeperError(ExitCode.USAGE, "usage", "give a query or a filter")
  if (!Number.isInteger(req.limit) || req.limit < 1 || req.limit > 100) {
    throw new WikeeperError(ExitCode.USAGE, "usage", "--limit must be an integer from 1 to 100");
  }
  const f = req.filters;
  if (
    req.query === null &&
    f.type === null &&
    f.where.length === 0 &&
    f.status === null &&
    f.since === null &&
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
  // 3. const corpus = await loadSearchCorpus(paths, { useCache: deps.useCache });
  const corpus = await loadSearchCorpus(paths, { useCache: deps.useCache });
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
  // INSERTION POINT STORY-004-05: misses mode (req.misses) and miss recording.
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
  // INSERTION POINT STORY-004-05: misses?: boolean;
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
        // INSERTION POINT STORY-004-05: --misses
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
          // INSERTION POINT STORY-004-04: req.entity and req.filters.since from opts
          // INSERTION POINT STORY-004-05: req.misses from opts
          const data = await executeSearch(findRepoRoot(ctx.cwd), req, deps);
          emitResult(ctx, { command: "search", data, warnings: [...searchWarnings(data)], message: renderHuman(data) });
        });
    },
  };
}

export const searchCommand: CommandModule = createSearchCommand();
