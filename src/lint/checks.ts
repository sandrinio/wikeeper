// src/lint/checks.ts
// Contract C2 — contract/S-03-lint (owner STORY-005-02). Frozen exports: the owner replaces the bodies and never
// renames or retypes an export. Consumers (STORY-005-03, 005-04, 005-08) add their line directly below their own
// INSERTION POINT comment. The owner keeps every INSERTION POINT line and every "keep this line" line exactly as
// written, adds its own imports above the first import line, and adds nothing below RULE_CHECKS.
// Check modules (links.ts, citations.ts, unlogged.ts, staleness.ts, rules-lint.ts) import this file with
// `import type` only, and take pagePath from ./paths.js: a value import of this file makes a load cycle in which
// PAGE_CHECKS reads an uninitialised check (ReferenceError) whenever a check module is imported first.
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

/** "[error] broken-link .wiki/pages/team.md:14: …" */
export function findingLine(f: LintFinding): string {
  throw new Error("contract stub C2");
}

export function countFindings(findings: readonly LintFinding[]): { error: number; warning: number; info: number } {
  throw new Error("contract stub C2");
}

export async function runLint(ctx: LintContext, opts: { scope: LintScope; checks?: string[] }): Promise<LintFinding[]> {
  throw new Error("contract stub C2");
}

export const indexDriftCheck: LintCheck = {
  id: "index-drift",
  severity: "warning",
  scope: "pages",
  async run(ctx: LintContext): Promise<LintFinding[]> {
    throw new Error("contract stub C2");
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
