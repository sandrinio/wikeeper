// src/lint/links.ts
// Contract C2 — contract/S-03-lint (owner STORY-005-02). Frozen exports; each check object keeps its id, severity
// and scope. Imports ./checks.js with `import type` only.
import { entityKeys } from "../search/aliases.js";
import { CITATION_RE, normalizeName, pageEntities } from "../wiki/parse-page.js";
import type { LintFinding } from "../ingest/lint-hook.js";
import type { Page } from "../wiki/parse-page.js";
import type { LintCheck, LintContext } from "./checks.js";
import { pagePath } from "./paths.js";

const resolvers = new WeakMap<readonly Page[], (target: string) => string[]>();

/** Resolves a wikilink target to the Page.path values it names; [] = broken. */
export function linkResolver(pages: readonly Page[]): (target: string) => string[] {
  const map = new Map<string, string[]>();
  const add = (key: string, p: string): void => {
    if (key === "") return;
    const list = map.get(key);
    if (list === undefined) map.set(key, [p]);
    else if (!list.includes(p)) list.push(p);
  };
  for (const page of pages) {
    add(normalizeName(page.path.replace(/\.md$/, "")), page.path);
    for (const e of pageEntities(page)) {
      const keys = entityKeys(e);
      for (const k of keys.names) add(k, page.path);
      for (const k of keys.aliases) add(k, page.path);
    }
  }
  return (target) => map.get(normalizeName(target)) ?? [];
}

function sharedResolver(pages: readonly Page[]): (target: string) => string[] {
  let r = resolvers.get(pages);
  if (r === undefined) {
    r = linkResolver(pages);
    resolvers.set(pages, r);
  }
  return r;
}

export const brokenLinkCheck: LintCheck = {
  id: "broken-link",
  severity: "error",
  scope: "pages",
  async run(ctx: LintContext): Promise<LintFinding[]> {
    const resolve = sharedResolver(ctx.pages);
    const findings: LintFinding[] = [];
    for (const page of ctx.pages) {
      const seen = new Set<string>();
      for (const link of page.links) {
        const key = `${link.line}\u0000${normalizeName(link.target)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (resolve(link.target).length > 0) continue;
        const message = CITATION_RE.test(link.target)
          ? `[[${link.target}]] cites a source with no page ${pagePath(ctx.paths, `sources/${link.target}.md`)}`
          : `[[${link.target}]] does not resolve to a page`;
        findings.push({ id: "broken-link", severity: "error", message, path: pagePath(ctx.paths, page.path), line: link.line });
      }
    }
    return findings;
  },
};

export const orphanPageCheck: LintCheck = {
  id: "orphan-page",
  severity: "warning",
  scope: "pages",
  async run(ctx: LintContext): Promise<LintFinding[]> {
    const resolve = sharedResolver(ctx.pages);
    const linkedFrom = new Map<string, Set<string>>();
    for (const page of ctx.pages) {
      for (const link of page.links) {
        for (const target of resolve(link.target)) {
          if (target === page.path) continue;
          const set = linkedFrom.get(target) ?? new Set<string>();
          set.add(page.path);
          linkedFrom.set(target, set);
        }
      }
    }
    return ctx.pages
      .filter((p) => (linkedFrom.get(p.path)?.size ?? 0) === 0)
      .map((p) => ({
        id: "orphan-page",
        severity: "warning" as const,
        message: "no other page links to it",
        path: pagePath(ctx.paths, p.path),
      }));
  },
};
