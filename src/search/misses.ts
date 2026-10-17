// src/search/misses.ts
// STORY-004-05: record searches that found nothing as `miss` log events and summarise them.
import { compareCodeUnits } from "../core/compare.js";
import { toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { readLogEvents, writeLogEvent } from "../ingest/log.js";
import type { StoredLogEvent } from "../ingest/log.js";
import { normalizeName } from "../wiki/parse-page.js";
import { describeFilters } from "./filters.js";
import type { MissSummary, SearchData, SearchFilters } from "./engine.js";
import type { SinceBound } from "./since.js";

type RawFilters = Record<string, string | string[]>;

/** A zero-result search is a miss; the misses listing itself is never recorded. */
export function shouldRecordMiss(data: SearchData): boolean {
  return data.mode !== "misses" && data.total === 0;
}

/** Only the set parts, in the order type, where, status, since, entity. */
export function encodeMissFilters(filters: SearchFilters, entity: string | null): RawFilters {
  const out: RawFilters = {};
  if (filters.type !== null) out["type"] = filters.type;
  if (filters.where.length > 0) out["where"] = filters.where.map((w) => `${w.key}=${w.value}`);
  if (filters.status !== null) out["status"] = filters.status;
  if (filters.since !== null) out["since"] = filters.since;
  if (filters.mark !== undefined) out["mark"] = filters.mark;
  if (entity !== null) out["entity"] = entity;
  return out;
}

function scalarOf(v: string | string[] | undefined): string | null {
  if (v === undefined) return null;
  return typeof v === "string" ? v : v.join(", ");
}

export function decodeMissFilters(raw: RawFilters): { filters: SearchFilters; entity: string | null } {
  const whereRaw = raw["where"];
  const items = whereRaw === undefined ? [] : typeof whereRaw === "string" ? [whereRaw] : whereRaw;
  const where = items.map((item) => {
    const i = item.indexOf("=");
    return i === -1
      ? { key: item.trim(), value: "" }
      : { key: item.slice(0, i).trim(), value: item.slice(i + 1).trim() };
  });
  const filters: SearchFilters = {
    type: scalarOf(raw["type"]),
    where,
    status: scalarOf(raw["status"]),
    since: scalarOf(raw["since"]),
  };
  const mark = raw["mark"];
  if (mark === "decided" || mark === "tentative") filters.mark = mark;
  return { filters, entity: scalarOf(raw["entity"]) };
}

export async function recordMiss(
  paths: ResolvedPaths,
  data: SearchData,
  now: Date,
): Promise<{ logged: boolean; warning: string | null }> {
  try {
    await writeLogEvent(paths, {
      type: "miss",
      at: now.toISOString(),
      query: data.query ?? "",
      filters: encodeMissFilters(data.filters, data.entity_query),
    });
    return { logged: true, warning: null };
  } catch (err) {
    const e = err as { code?: unknown; message?: unknown };
    const reason = typeof e.code === "string" ? e.code : String(e.message ?? err);
    return { logged: false, warning: `miss not logged: ${toPosixRelative(paths.root, paths.logDir)}: ${reason}` };
  }
}

function validFilters(f: unknown): f is RawFilters {
  if (typeof f !== "object" || f === null || Array.isArray(f)) return false;
  return Object.values(f).every((v) => typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string")));
}

interface Group {
  key: string;
  nq: string | null;
  rep: { at: string; ms: number; query: string; raw: RawFilters };
  count: number;
  first: { at: string; ms: number };
  last: { at: string; ms: number };
}

export function summarizeMisses(events: readonly StoredLogEvent[]): MissSummary[] {
  const groups = new Map<string, Group>();
  for (const { event } of events) {
    if (event.type !== "miss") continue;
    const query: unknown = event.query;
    const filters: unknown = event.filters;
    if (typeof query !== "string" || !validFilters(filters)) continue;
    const { filters: f, entity } = decodeMissFilters(filters);
    const nq = query === "" ? null : normalizeName(query);
    const ne = entity === null ? null : normalizeName(entity);
    const key = JSON.stringify([nq, { type: f.type, where: f.where, status: f.status, since: f.since, mark: f.mark ?? null }, ne]);
    const ms = Date.parse(event.at);
    const g = groups.get(key);
    if (g === undefined) {
      groups.set(key, { key, nq, rep: { at: event.at, ms, query, raw: filters }, count: 1, first: { at: event.at, ms }, last: { at: event.at, ms } });
      continue;
    }
    g.count++;
    if (ms < g.first.ms) {
      g.first = { at: event.at, ms };
      g.rep = { at: event.at, ms, query, raw: filters };
    }
    if (ms > g.last.ms) g.last = { at: event.at, ms };
  }
  const list = [...groups.values()].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    if (a.last.ms !== b.last.ms) return b.last.ms - a.last.ms;
    if (a.nq !== b.nq) {
      if (a.nq === null) return 1;
      if (b.nq === null) return -1;
      return compareCodeUnits(a.nq, b.nq);
    }
    return compareCodeUnits(a.key, b.key);
  });
  return list.map((g) => {
    const { filters, entity } = decodeMissFilters(g.rep.raw);
    return { query: g.nq === null ? null : g.rep.query, filters, entity, count: g.count, first_at: g.first.at, last_at: g.last.at };
  });
}

export async function listMisses(paths: ResolvedPaths, bound: SinceBound | null): Promise<MissSummary[]> {
  const res = await readLogEvents(paths, bound === null ? { type: "miss" } : { type: "miss", since: bound.instant });
  return summarizeMisses(res.events);
}

/** R6 human output. */
export function renderMisses(data: SearchData): string {
  const misses = data.misses ?? [];
  if (data.total === 0) return "no recorded misses";
  const m = data.total;
  const n = data.events ?? misses.reduce((sum, x) => sum + x.count, 0);
  const lines = [`${n} ${n === 1 ? "miss" : "misses"}, ${m} distinct ${m === 1 ? "query" : "queries"}`];
  for (const m of misses) {
    let line = `${m.count}×`;
    if (m.query !== null) line += ` "${m.query}"`;
    const filters = describeFilters(m.filters);
    if (filters !== "") line += ` ${filters}`;
    if (m.entity !== null) line += ` entity ${m.entity}`;
    line += ` (last ${new Date(Date.parse(m.last_at)).toISOString().slice(0, 10)})`;
    lines.push(line);
  }
  return lines.join("\n");
}
