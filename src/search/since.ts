// src/search/since.ts
// Contract C12 — contract/S-02-since (owner STORY-004-04). Frozen exports: parseSince and SinceBound.
// Consumer: STORY-004-05 (--misses --since).
import { compareCodeUnits } from "../core/compare.js";
import { DATE_RE, isCalendarDate } from "../core/dates.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import type { StoredLogEvent } from "../ingest/log.js";
import type { Entity, Fact, Page } from "../wiki/parse-page.js";
import type { FactView, SinceChanges } from "./engine.js";

export interface SinceBound {
  date: string; // YYYY-MM-DD, compared with fact dates
  instant: string; // ISO-8601 UTC instant, passed to readLogEvents({ since })
}

const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Throws WikeeperError(ExitCode.USAGE, "invalid_since", …, { expected: "YYYY-MM-DD", got }). */
export function parseSince(raw: string): SinceBound {
  const bad = (): WikeeperError =>
    new WikeeperError(
      ExitCode.USAGE,
      "invalid_since",
      `invalid --since value "${raw}": use YYYY-MM-DD or an ISO 8601 date-time with Z or an offset`,
      { expected: "YYYY-MM-DD", got: raw },
    );
  if (DATE_RE.test(raw)) {
    if (!isCalendarDate(raw)) throw bad();
    return { date: raw, instant: new Date(Date.parse(`${raw}T00:00:00Z`)).toISOString() };
  }
  const m = DATETIME_RE.exec(raw);
  if (m === null || !isCalendarDate(m[1]!)) throw bad();
  if (Number(m[2]) > 23 || Number(m[3]) > 59 || (m[4] !== undefined && Number(m[4]) > 59)) throw bad();
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) throw bad();
  return { date: m[1]!, instant: new Date(ms).toISOString() };
}

export function toFactView(fact: Fact, entity: Entity, page: Page, archived = false): FactView {
  return {
    path: page.path,
    entity: entity.name,
    section: page.sections[fact.section]?.heading ?? "",
    line: fact.line,
    date: fact.date,
    status: fact.status,
    text: fact.text,
    sources: fact.sources,
    contradiction: fact.contradiction,
    archived,
  };
}

/** Date descending, then path, live before archived, then line. */
export function compareFactViews(a: FactView, b: FactView): number {
  return (
    (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) ||
    compareCodeUnits(a.path, b.path) ||
    Number(a.archived) - Number(b.archived) ||
    a.line - b.line
  );
}

export function factsSince(entities: readonly Entity[], pages: readonly Page[], bound: SinceBound, archived = false): FactView[] {
  const pageByPath = new Map(pages.map((p) => [p.path, p]));
  const out: FactView[] = [];
  for (const e of entities) {
    const page = pageByPath.get(e.path);
    if (page === undefined) continue;
    for (const f of e.facts) if (f.date >= bound.date) out.push(toFactView(f, e, page, archived));
  }
  return out.sort(compareFactViews);
}

export function pagesChangedSince(events: readonly StoredLogEvent[]): SinceChanges["pages"] {
  const out: Array<SinceChanges["pages"][number] & { ms: number }> = [];
  for (const stored of events) {
    const ev = stored.event as unknown as Record<string, unknown>;
    if (ev["type"] !== "ingest" || typeof ev["at"] !== "string") continue;
    const ms = Date.parse(ev["at"]);
    if (Number.isNaN(ms)) continue;
    const sourceId = typeof ev["source_id"] === "string" ? ev["source_id"] : null;
    for (const change of ["created", "updated", "deleted"] as const) {
      const list = ev[change];
      if (!Array.isArray(list)) continue;
      for (const p of list) if (typeof p === "string") out.push({ path: p, change, source_id: sourceId, at: ev["at"], ms });
    }
  }
  out.sort((a, b) => b.ms - a.ms || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out.map(({ ms: _ms, ...rest }) => rest);
}
