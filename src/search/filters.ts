// src/search/filters.ts
// STORY-004-03: structured search filters (--type, --where, --status) over entities.
import path from "node:path";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { normalizeName } from "../wiki/parse-page.js";
import type { Entity, Page } from "../wiki/parse-page.js";
import { hitSources } from "./engine.js";
import type { SearchFilters, SearchHit, WhereFilter } from "./engine.js";

const SNIPPET_LIMIT = 160;

/** Splits `key=value` at the first `=`; an empty side is `invalid_filter` (exit 2). */
export function parseWhere(raw: string): WhereFilter {
  const at = raw.indexOf("=");
  const key = at < 0 ? "" : raw.slice(0, at).trim();
  const value = at < 0 ? "" : raw.slice(at + 1).trim();
  if (at < 0 || key === "" || value === "") {
    throw new WikeeperError(ExitCode.USAGE, "invalid_filter", `--where needs key=value, got "${raw}"`, {
      expected: "key=value",
      got: raw,
    });
  }
  return { key, value };
}

/** `--type` / `--status` value: `undefined` -> null; blank -> `invalid_filter`; otherwise trimmed. */
export function parseFilterValue(flag: "--type" | "--status", raw: string | undefined): string | null {
  if (raw === undefined) return null;
  if (raw.trim() === "") {
    throw new WikeeperError(ExitCode.USAGE, "invalid_filter", `${flag} needs a non-empty value`, {
      expected: "a non-empty value",
      got: raw,
    });
  }
  return raw.trim();
}

/** True when a type, where or status filter is set. `since` is deliberately excluded (STORY-004-04 owns it). */
export function hasFilters(filters: SearchFilters): boolean {
  return filters.type !== null || filters.where.length > 0 || filters.status !== null;
}

/** Human text for the set filters, e.g. `--type risk --where owner=Product`. */
export function describeFilters(filters: SearchFilters): string {
  const parts: string[] = [];
  if (filters.type !== null) parts.push(`--type ${filters.type}`);
  for (const w of filters.where) parts.push(`--where ${w.key}=${w.value}`);
  if (filters.status !== null) parts.push(`--status ${filters.status}`);
  if (filters.since !== null) parts.push(`--since ${filters.since}`);
  return parts.join(" ");
}

function tokens(s: string): string[] {
  return normalizeName(s).split(" ").filter(Boolean);
}

function scalar(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function candidates(entity: Entity, page: Page, key: string): string[] {
  const k = key.toLowerCase();
  const out: string[] = [];
  for (const link of entity.typedLinks) {
    if (link.key.toLowerCase() !== k) continue;
    if (link.targets.length > 0) out.push(...link.targets);
    else out.push(link.value);
  }
  if (entity.kind === "page") {
    for (const [fk, fv] of Object.entries(page.frontmatter.data)) {
      if (fk.toLowerCase() !== k) continue;
      if (Array.isArray(fv)) {
        for (const el of fv) {
          const s = scalar(el);
          if (s !== null) out.push(s);
        }
      } else {
        const s = scalar(fv);
        if (s !== null) out.push(s);
      }
    }
  }
  return out;
}

function valueMatches(value: string, candidate: string): boolean {
  const want = tokens(value);
  if (want.length === 0) return false;
  const have = new Set(tokens(candidate));
  return want.every((t) => have.has(t));
}

/** Pure AND of the type, where and status filters against one entity (and its page, for frontmatter). */
export function matchesFilters(entity: Entity, filters: SearchFilters, page: Page): boolean {
  if (filters.type !== null) {
    if (entity.type === null || normalizeName(entity.type) !== normalizeName(filters.type)) return false;
  }
  for (const w of filters.where) {
    if (!candidates(entity, page, w.key).some((c) => valueMatches(w.value, c))) return false;
  }
  if (filters.status !== null) {
    const want = normalizeName(filters.status);
    if (!candidates(entity, page, "status").some((c) => normalizeName(c) === want)) return false;
  }
  return true;
}

/** One `SearchHit` for an entity that passed the filters (no query). */
export function entityHit(entity: Entity, page: Page, root: string, paths: ResolvedPaths): SearchHit {
  const section = page.sections[entity.section];
  let text = entity.summary;
  if (text === null || text.trim() === "") {
    text = (section?.text ?? "").split(/\r?\n/).map((l) => l.trim()).find((l) => l !== "") ?? "";
  }
  return {
    path: entity.path,
    file: toPosixRelative(root, path.join(paths.pagesDir, ...entity.path.split("/"))),
    title: page.title,
    entity: entity.name,
    type: entity.type,
    section: section?.heading ?? "",
    line: entity.line,
    snippet: text.replace(/\s+/g, " ").trim().slice(0, SNIPPET_LIMIT),
    score: 0,
    sources: hitSources(page, entity.section),
  };
}
