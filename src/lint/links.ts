// src/lint/links.ts
// Contract C2 — contract/S-03-lint (owner STORY-005-02). Frozen exports; each check object keeps its id, severity
// and scope. Imports ./checks.js with `import type` only.
import { entityKeys } from "../search/aliases.js";
import { CITATION_RE, normalizeName, pageEntities } from "../wiki/parse-page.js";
import type { LintFinding } from "../ingest/lint-hook.js";
import type { Page } from "../wiki/parse-page.js";
import type { LintCheck, LintContext } from "./checks.js";
import { archivePath, pagePath } from "./paths.js";

type Resolver = (target: string) => string[];
const NO_ARCHIVE: readonly Page[] = [];
const resolvers = new WeakMap<readonly Page[], WeakMap<readonly Page[], Resolver>>();

function keyMap(pages: readonly Page[], archived: boolean): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (key: string, p: string): void => {
    if (key === "") return;
    const list = map.get(key);
    if (list === undefined) map.set(key, [p]);
    else if (!list.includes(p)) list.push(p);
  };
  for (const page of pages) {
    const bare = page.path.replace(/\.md$/, "");
    add(normalizeName(bare), page.path);
    if (archived) add(normalizeName("archive/" + bare), page.path);
    for (const e of pageEntities(page)) {
      const keys = entityKeys(e);
      for (const k of keys.names) add(k, page.path);
      for (const k of keys.aliases) add(k, page.path);
    }
  }
  return map;
}

/** Resolves a wikilink target to the Page.path values it names; [] = broken. A pages/ match wins over archive/. */
export function linkResolver(pages: readonly Page[], archivePages: readonly Page[] = NO_ARCHIVE): Resolver {
  const live = keyMap(pages, false);
  if (archivePages.length === 0) return (target) => live.get(normalizeName(target)) ?? [];
  const archive = keyMap(archivePages, true);
  return (target) => {
    const key = normalizeName(target);
    return live.get(key) ?? archive.get(key) ?? [];
  };
}

function sharedResolver(pages: readonly Page[], archivePages: readonly Page[] = NO_ARCHIVE): Resolver {
  let byArchive = resolvers.get(pages);
  if (byArchive === undefined) {
    byArchive = new WeakMap();
    resolvers.set(pages, byArchive);
  }
  let r = byArchive.get(archivePages);
  if (r === undefined) {
    r = linkResolver(pages, archivePages);
    byArchive.set(archivePages, r);
  }
  return r;
}

function linkFindings(paths: LintContext["paths"], page: Page, resolve: Resolver, where: (rel: string) => string): LintFinding[] {
  const findings: LintFinding[] = [];
  const seen = new Set<string>();
  for (const link of page.links) {
    const key = `${link.line}\u0000${normalizeName(link.target)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (resolve(link.target).length > 0) continue;
    const message = CITATION_RE.test(link.target)
      ? `[[${link.target}]] cites a source with no page ${pagePath(paths, `sources/${link.target}.md`)}`
      : `[[${link.target}]] does not resolve to a page`;
    findings.push({ id: "broken-link", severity: "error", message, path: where(page.path), line: link.line });
  }
  return findings;
}

export const brokenLinkCheck: LintCheck = {
  id: "broken-link",
  severity: "error",
  scope: "pages",
  async run(ctx: LintContext): Promise<LintFinding[]> {
    const archive = ctx.archivePages ?? NO_ARCHIVE;
    const resolve = sharedResolver(ctx.pages, archive);
    const findings: LintFinding[] = [];
    for (const page of ctx.pages) findings.push(...linkFindings(ctx.paths, page, resolve, (r) => pagePath(ctx.paths, r)));
    for (const page of archive) findings.push(...linkFindings(ctx.paths, page, resolve, (r) => archivePath(ctx.paths, r)));
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
