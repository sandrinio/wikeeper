// src/lint/checks.ts
// Contract C2 — contract/S-03-lint (owner STORY-005-02). Frozen exports: the owner replaces the bodies and never
// renames or retypes an export. Consumers (STORY-005-03, 005-04, 005-08) add their line directly below their own
// INSERTION POINT comment. The owner keeps every INSERTION POINT line and every "keep this line" line exactly as
// written, adds its own imports above the first import line, and adds nothing below RULE_CHECKS.
// Check modules (links.ts, citations.ts, unlogged.ts, staleness.ts, rules-lint.ts) import this file with
// `import type` only, and take pagePath from ./paths.js: a value import of this file makes a load cycle in which
// PAGE_CHECKS reads an uninitialised check (ReferenceError) whenever a check module is imported first.
import { readFile } from "node:fs/promises";
import { compareCodeUnits } from "../core/compare.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { toPosixRelative } from "../core/paths.js";
import { buildIndex } from "../ingest/index-builder.js";
import { plural } from "../commands/doctor.js";
import { pagePath } from "./paths.js";
import type { WikeeperConfig } from "../core/config.js";
import type { ResolvedPaths } from "../core/paths.js";
import type { LintFinding } from "../ingest/lint-hook.js";
import type { StoredLogEvent } from "../ingest/log.js";
import type { KbInstructions } from "../kb/parse-instructions.js";
import type { Page } from "../wiki/parse-page.js";
import { uncitedClaimCheck } from "./citations.js";
import { brokenLinkCheck, orphanPageCheck } from "./links.js";
// INSERTION POINT STORY-005-03: import { unloggedChangeCheck } from "./unlogged.js";
// (keep this line: it separates the STORY-005-03 and STORY-005-04 imports)
// INSERTION POINT STORY-005-04: import { RULES_LINT_CHECKS } from "./rules-lint.js";
// (keep this line: it separates the STORY-005-04 and STORY-005-08 imports)
// INSERTION POINT STORY-005-08: import { staleFactCheck } from "./staleness.js";

export { pagePath } from "./paths.js";

export type LintScope = "pages" | "rules";

export interface LintContext {
  paths: ResolvedPaths;
  config: WikeeperConfig;
  pages: Page[];
  kb: KbInstructions | null;
  log: StoredLogEvent[];
  now: Date;
  only?: string[]; // page paths relative to pages/ (input only; set by the finish hook)
}

export interface LintCheck {
  id: string;
  severity: "error" | "warning" | "info";
  scope: LintScope;
  run(ctx: LintContext): Promise<LintFinding[]>;
}

const LABEL: Record<LintFinding["severity"], string> = { error: "[error]", warning: "[warn]", info: "[info]" };

/** "[error] broken-link .wiki/pages/team.md:14: …" */
export function findingLine(f: LintFinding): string {
  const where = f.path === undefined ? "" : ` ${f.path}${f.line === undefined ? "" : `:${f.line}`}`;
  return `${LABEL[f.severity]} ${f.id}${where}: ${f.message}`;
}

export function countFindings(findings: readonly LintFinding[]): { error: number; warning: number; info: number } {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

function compareFindings(a: LintFinding, b: LintFinding): number {
  if (a.path !== b.path) {
    if (a.path === undefined) return -1;
    if (b.path === undefined) return 1;
    const c = compareCodeUnits(a.path, b.path);
    if (c !== 0) return c;
  }
  if (a.line !== b.line) {
    if (a.line === undefined) return -1;
    if (b.line === undefined) return 1;
    return a.line - b.line;
  }
  return compareCodeUnits(a.id, b.id) || compareCodeUnits(a.message, b.message);
}

export async function runLint(ctx: LintContext, opts: { scope: LintScope; checks?: string[] }): Promise<LintFinding[]> {
  const reg = opts.scope === "pages" ? PAGE_CHECKS : RULE_CHECKS;
  if (opts.checks !== undefined) {
    for (const id of opts.checks) {
      if (reg.some((c) => c.id === id)) continue;
      const ids = reg.map((c) => c.id).join(", ");
      const tail = opts.scope === "pages" ? `page checks: ${ids}` : `rule checks: ${ids === "" ? "none yet" : ids}`;
      throw new WikeeperError(ExitCode.USAGE, "usage", `unknown check "${id}"; ${tail}`);
    }
  }
  const selected = reg.filter((c) => opts.checks === undefined || opts.checks.includes(c.id));
  let findings: LintFinding[] = [];
  for (const check of selected) findings.push(...(await check.run(ctx)));
  if (ctx.only !== undefined) {
    const keep = new Set(ctx.only.map((p) => pagePath(ctx.paths, p)));
    findings = findings.filter((f) => f.path !== undefined && keep.has(f.path));
  }
  return findings.sort(compareFindings);
}

const ENTRY_RE = /^- \[.*\]\(pages\/([^)]+)\)/;

function entryPaths(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of text.split("\n")) {
    const m = ENTRY_RE.exec(l);
    if (m) {
      let p = m[1]!;
      try {
        p = decodeURIComponent(p);
      } catch {
        /* keep raw */
      }
      out.set(l, p);
    }
  }
  return out;
}

export const indexDriftCheck: LintCheck = {
  id: "index-drift",
  severity: "warning",
  scope: "pages",
  async run(ctx: LintContext): Promise<LintFinding[]> {
    const file = toPosixRelative(ctx.paths.root, ctx.paths.indexFile);
    const make = (message: string): LintFinding[] => [{ id: "index-drift", severity: "warning", message, path: file }];
    let text: string;
    try {
      text = await readFile(ctx.paths.indexFile, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return make("index.md is missing: run wikeeper index rebuild");
      throw err;
    }
    const cur = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    const want = buildIndex(ctx.pages);
    if (cur === want) return [];
    const a = entryPaths(cur);
    const b = entryPaths(want);
    const changed = new Set<string>();
    for (const [l, p] of a) if (!b.has(l)) changed.add(p);
    for (const [l, p] of b) if (!a.has(l)) changed.add(p);
    const list = [...changed].sort(compareCodeUnits);
    if (list.length === 0) return make("index.md is out of date: run wikeeper index rebuild");
    const shown = list.slice(0, 5).map((p) => pagePath(ctx.paths, p)).join(", ");
    const more = list.length > 5 ? `, and ${list.length - 5} more` : "";
    return make(`index.md is out of date for ${plural(list.length, "page")} (${shown}${more}): run wikeeper index rebuild`);
  },
};

export const PAGE_CHECKS: LintCheck[] = [
  brokenLinkCheck,
  uncitedClaimCheck,
  orphanPageCheck,
  indexDriftCheck,
  // INSERTION POINT STORY-005-03: unloggedChangeCheck,
  // (keep this line: it separates the STORY-005-03 and STORY-005-08 entries)
  // INSERTION POINT STORY-005-08: staleFactCheck,
];

export const RULE_CHECKS: LintCheck[] = [
  // INSERTION POINT STORY-005-04: ...RULES_LINT_CHECKS,
];
