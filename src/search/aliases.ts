// src/search/aliases.ts — STORY-004-04: resolve `--entity <name>` by name or alias, with backlinks.
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import { toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { normalizeName, owningEntityKey } from "../wiki/parse-page.js";
import type { Backlink, Entity, Page } from "../wiki/parse-page.js";
import type { EntityMatch } from "./engine.js";
import { toFactView } from "./since.js";

export interface EntityResolution {
  entity: Entity;
  matched: "name" | "alias";
  matchedAlias: string | null;
  others: Entity[];
}

function distinctKeys(keys: string[]): string[] {
  return [...new Set(keys.filter((k) => k !== ""))];
}

export function entityKeys(entity: Entity): { names: string[]; aliases: string[] } {
  const names = [normalizeName(entity.name)];
  if (entity.kind === "page") names.push(normalizeName(path.posix.basename(entity.path, ".md")));
  return { names: distinctKeys(names), aliases: distinctKeys(entity.aliases.map(normalizeName)) };
}

interface Candidate {
  entity: Entity;
  rank: number;
  alias: string | null;
}

export function resolveEntity(entities: readonly Entity[], name: string): EntityResolution | null {
  const q = normalizeName(name);
  if (q === "") return null;
  const found: Candidate[] = [];
  for (const entity of entities) {
    const keys = entityKeys(entity);
    if (keys.names.includes(q)) found.push({ entity, rank: 0, alias: null });
    else if (keys.aliases.includes(q)) {
      found.push({ entity, rank: 1, alias: entity.aliases.find((a) => normalizeName(a) === q) ?? null });
    }
  }
  if (found.length === 0) return null;
  found.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.entity.kind === b.entity.kind ? 0 : a.entity.kind === "page" ? -1 : 1) ||
      compareCodeUnits(a.entity.path, b.entity.path) ||
      a.entity.line - b.entity.line,
  );
  const best = found[0]!;
  return {
    entity: best.entity,
    matched: best.rank === 0 ? "name" : "alias",
    matchedAlias: best.alias,
    others: found.slice(1).map((c) => c.entity),
  };
}

export function entityBacklinks(
  entity: Entity,
  pages: readonly Page[],
  backlinks: Map<string, Backlink[]>,
): EntityMatch["backlinks"] {
  const pageByPath = new Map(pages.map((p) => [p.path, p]));
  const keys = entityKeys(entity);
  const seen = new Map<string, EntityMatch["backlinks"][number]>();
  for (const key of [...keys.names, ...keys.aliases]) {
    for (const b of backlinks.get(key) ?? []) {
      const page = pageByPath.get(b.path);
      if (page !== undefined && owningEntityKey(page, b.section) === entity.key) continue;
      const id = `${b.path}:${b.line}`;
      if (!seen.has(id)) seen.set(id, { path: b.path, section: b.heading, line: b.line, context: b.context });
    }
  }
  return [...seen.values()].sort((a, b) => compareCodeUnits(a.path, b.path) || a.line - b.line);
}

export function toEntityMatch(
  res: EntityResolution,
  pages: readonly Page[],
  root: string,
  paths: ResolvedPaths,
  backlinks: Map<string, Backlink[]>,
): EntityMatch {
  const e = res.entity;
  const page = pages.find((p) => p.path === e.path)!;
  const sectionOf = (ent: Entity): string => (ent.kind === "page" ? "" : (pages.find((p) => p.path === ent.path)?.sections[ent.section]?.heading ?? ""));
  return {
    key: e.key,
    name: e.name,
    type: e.type,
    path: e.path,
    file: toPosixRelative(root, path.join(paths.pagesDir, ...e.path.split("/"))),
    section: sectionOf(e),
    line: e.line,
    aliases: e.aliases,
    matched: res.matched,
    matched_alias: res.matchedAlias,
    summary: e.summary,
    typed_links: e.typedLinks.map((t) => ({ key: t.key, value: t.value, targets: t.targets })),
    facts: e.facts
      .map((f) => toFactView(f, e, page))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || a.line - b.line),
    backlinks: entityBacklinks(e, pages, backlinks),
    also_matches: res.others.map((o) => ({ name: o.name, path: o.path, section: sectionOf(o), line: o.line })),
  };
}
