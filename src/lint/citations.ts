// src/lint/citations.ts
// Contract C2 — contract/S-03-lint (owner STORY-005-02). Frozen exports; the check object keeps its id, severity
// and scope. Imports ./checks.js with `import type` only.
import { CITATION_RE } from "../wiki/parse-page.js";
import type { LintFinding } from "../ingest/lint-hook.js";
import type { Page } from "../wiki/parse-page.js";
import type { LintCheck, LintContext } from "./checks.js";
import { pagePath } from "./paths.js";

export interface ClaimBlock {
  line: number;
  kind: "fact" | "prose";
  cited: boolean;
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const TYPED_RE = /^\s*(?:[-*+]\s+)?[A-Za-z][A-Za-z0-9_-]*::/;
const BREAK_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;

export function claimBlocks(page: Page): ClaimBlock[] {
  if (page.errors.some((e) => e.code === "frontmatter_yaml")) return [];
  const factLines = new Map(page.facts.map((f) => [f.line, f]));
  const citedLines = new Set(page.links.filter((l) => CITATION_RE.test(l.target)).map((l) => l.line));
  const blocks: ClaimBlock[] = [];
  let open: { line: number; cited: boolean } | null = null;
  const close = (): void => {
    if (open !== null) blocks.push({ line: open.line, kind: "prose", cited: open.cited });
    open = null;
  };
  let fence: string | null = null;
  let comment = false;
  for (const sec of page.sections) {
    close();
    const first = sec.index === 0 ? sec.line : sec.line + 1;
    const lines = sec.text.split("\n");
    for (let n = 0; n < lines.length; n++) {
      const orig = lines[n]!;
      const lineNo = first + n;
      const fm = FENCE_RE.exec(orig);
      if (fence !== null) {
        if (fm && fm[1]![0] === fence[0] && fm[1]!.length >= fence.length && /^\s*$/.test(orig.slice(fm[0].length))) fence = null;
        close();
        continue;
      }
      if (fm) {
        fence = fm[1]!;
        close();
        continue;
      }
      // HTML comments
      let text = orig;
      if (comment) {
        const end = text.indexOf("-->");
        if (end < 0) {
          close();
          continue;
        }
        comment = false;
        text = text.slice(end + 3);
      }
      text = text.replace(/<!--.*?-->/g, "");
      const start = text.indexOf("<!--");
      if (start >= 0) {
        comment = true;
        text = text.slice(0, start);
      }
      if (text.trim() === "") {
        close();
        continue;
      }
      const fact = factLines.get(lineNo);
      if (fact !== undefined) {
        close();
        blocks.push({ line: lineNo, kind: "fact", cited: fact.sources.length > 0 });
        continue;
      }
      if (BREAK_RE.test(orig) || TYPED_RE.test(orig)) {
        close();
        continue;
      }
      const cited = citedLines.has(lineNo);
      if (ITEM_RE.test(orig)) {
        close();
        open = { line: lineNo, cited };
      } else if (open === null) {
        open = { line: lineNo, cited };
      } else if (cited) {
        open.cited = true;
      }
      if (open !== null && cited) open.cited = true;
    }
    close();
  }
  return blocks;
}

export const uncitedClaimCheck: LintCheck = {
  id: "uncited-claim",
  severity: "error",
  scope: "pages",
  async run(ctx: LintContext): Promise<LintFinding[]> {
    const findings: LintFinding[] = [];
    for (const page of ctx.pages) {
      for (const b of claimBlocks(page)) {
        if (b.cited) continue;
        findings.push({
          id: "uncited-claim",
          severity: "error",
          message: b.kind === "fact" ? "fact line has no [[src-…]] citation" : "claim has no [[src-…]] citation",
          path: pagePath(ctx.paths, page.path),
          line: b.line,
        });
      }
    }
    return findings;
  },
};
