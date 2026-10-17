// src/lint/staleness.ts
// STORY-005-08: stale-fact — open statuses and tentative planned dates older than lint.stale_after_days.
// Pure: reads only ctx.pages, ctx.config and ctx.now. Imports ./checks.js with `import type` only.
import { isCalendarDate } from "../core/dates.js";
import { pageEntities } from "../wiki/parse-page.js";
import type { LintFinding } from "../ingest/lint-hook.js";
import type { Entity, Page } from "../wiki/parse-page.js";
import type { LintCheck, LintContext } from "./checks.js";
import { pagePath } from "./paths.js";

export const FINAL_STATUSES: readonly string[] = [
  "done",
  "complete",
  "completed",
  "closed",
  "cancelled",
  "canceled",
  "superseded",
  "rejected",
  "resolved",
  "shipped",
  "released",
  "archived",
];

const DAY_MS = 86_400_000;
const WIKILINK_RE = /!?\[\[[^\]]*\]\]/g;
const DATE_IN_TEXT_RE = /\d{4}-\d{2}-\d{2}/g;

function utcDay(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const d = new Date(Date.UTC(2000, Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
  d.setUTCFullYear(y);
  return d.getTime();
}

function isFinal(value: string): boolean {
  const m = /\p{L}+/u.exec(value);
  return m !== null && FINAL_STATUSES.includes(m[0].toLowerCase());
}

function statusOf(page: Page, entity: Entity): { value: string; line?: number } | null {
  for (let i = entity.typedLinks.length - 1; i >= 0; i--) {
    const l = entity.typedLinks[i]!;
    if (l.key.toLowerCase() === "status") return { value: l.value, line: l.line };
  }
  if (entity.kind === "page") {
    const data = page.frontmatter.data as Record<string, unknown>;
    for (const [k, v] of Object.entries(data)) {
      if (k.toLowerCase() === "status" && typeof v === "string") return { value: v };
    }
  }
  return null;
}

function plannedDate(text: string): string | null {
  for (const m of text.replace(WIKILINK_RE, "").matchAll(DATE_IN_TEXT_RE)) {
    if (isCalendarDate(m[0])) return m[0];
  }
  return null;
}

export const staleFactCheck: LintCheck = {
  id: "stale-fact",
  severity: "warning",
  scope: "pages",
  async run(ctx: LintContext): Promise<LintFinding[]> {
    const now = ctx.now;
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const limit = ctx.config.lint.stale_after_days;
    const ageOf = (date: string): number => Math.round((today - utcDay(date)) / DAY_MS);
    const out: LintFinding[] = [];
    for (const page of ctx.pages) {
      const path = pagePath(ctx.paths, page.path);
      for (const entity of pageEntities(page)) {
        if (entity.facts.length === 0) continue;
        const newest = entity.facts.reduce((a, f) => (f.date > a ? f.date : a), "");
        const age = ageOf(newest);
        const status = statusOf(page, entity);
        if (status !== null && !isFinal(status.value) && age > limit) {
          const f: LintFinding = {
            id: "stale-fact",
            severity: "warning",
            path,
            message: `${entity.name}: status "${status.value}" was last dated ${newest}, ${age} days ago (lint.stale_after_days is ${limit})`,
          };
          if (status.line !== undefined) f.line = status.line;
          out.push(f);
        }
        if (age <= limit) continue;
        for (const fact of entity.facts) {
          if (fact.status !== "tentative" || fact.date !== newest) continue;
          const planned = plannedDate(fact.text);
          if (planned === null) continue;
          out.push({
            id: "stale-fact",
            severity: "warning",
            path,
            line: fact.line,
            message: `${entity.name}: tentative fact from ${fact.date} names ${planned}, and nothing newer is recorded (${age} days ago; lint.stale_after_days is ${limit})`,
          });
        }
      }
    }
    return out;
  },
};
