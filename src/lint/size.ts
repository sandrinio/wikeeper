// src/lint/size.ts
// STORY-007-05: oversized-page — a page at or above tokens.page.red. Imports ./checks.js with `import type` only.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { estimateTokens, formatLimit, formatTokens } from "../core/tokens.js";
import type { LintFinding } from "../ingest/lint-hook.js";
import type { LintCheck, LintContext } from "./checks.js";
import { pagePath } from "./paths.js";

export const oversizedPageCheck: LintCheck = {
  id: "oversized-page",
  severity: "warning",
  scope: "pages",
  async run(ctx: LintContext): Promise<LintFinding[]> {
    const red = ctx.config.tokens.page.red;
    const only = ctx.only === undefined ? null : new Set(ctx.only);
    const findings: LintFinding[] = [];
    for (const page of ctx.pages) {
      if (only !== null && !only.has(page.path)) continue;
      let text: string;
      try {
        // UTF-8 with the BOM kept, as measureWiki reads it
        text = await readFile(path.join(ctx.paths.pagesDir, ...page.path.split("/")), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      const n = estimateTokens(text);
      if (n >= red) {
        findings.push({
          id: "oversized-page",
          severity: "warning",
          path: pagePath(ctx.paths, page.path),
          message: `page is ${formatTokens(n)} tokens (tokens.page.red is ${formatLimit(red)})`,
        });
      }
    }
    return findings;
  },
};
