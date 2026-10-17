// src/lint/links.ts
// Contract C2 — contract/S-03-lint (owner STORY-005-02). Frozen exports; each check object keeps its id, severity
// and scope. Imports ./checks.js with `import type` only.
import type { LintFinding } from "../ingest/lint-hook.js";
import type { Page } from "../wiki/parse-page.js";
import type { LintCheck, LintContext } from "./checks.js";

/** Resolves a wikilink target to the Page.path values it names; [] = broken. */
export function linkResolver(pages: readonly Page[]): (target: string) => string[] {
  throw new Error("contract stub C2");
}

export const brokenLinkCheck: LintCheck = {
  id: "broken-link",
  severity: "error",
  scope: "pages",
  async run(ctx: LintContext): Promise<LintFinding[]> {
    throw new Error("contract stub C2");
  },
};

export const orphanPageCheck: LintCheck = {
  id: "orphan-page",
  severity: "warning",
  scope: "pages",
  async run(ctx: LintContext): Promise<LintFinding[]> {
    throw new Error("contract stub C2");
  },
};
