// src/lint/citations.ts
// Contract C2 — contract/S-03-lint (owner STORY-005-02). Frozen exports; the check object keeps its id, severity
// and scope. Imports ./checks.js with `import type` only.
import type { LintFinding } from "../ingest/lint-hook.js";
import type { Page } from "../wiki/parse-page.js";
import type { LintCheck, LintContext } from "./checks.js";

export interface ClaimBlock {
  line: number;
  kind: "fact" | "prose";
  cited: boolean;
}

export function claimBlocks(page: Page): ClaimBlock[] {
  throw new Error("contract stub C2");
}

export const uncitedClaimCheck: LintCheck = {
  id: "uncited-claim",
  severity: "error",
  scope: "pages",
  async run(ctx: LintContext): Promise<LintFinding[]> {
    throw new Error("contract stub C2");
  },
};
