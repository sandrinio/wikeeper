// Citation and outside-write validation (STORY-003-09 R3). Pure: reads only.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import { toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { parsePage } from "../wiki/parse-page.js";
import type { Page } from "../wiki/parse-page.js";
import type { PageDiff } from "./diff.js";

export interface IngestValidation {
  ok: boolean;
  uncited: string[];
  outside: string[];
  warnings: string[];
}

export function citesSource(page: Page, sourceId: string): boolean {
  return (
    page.wikilinks.includes(sourceId) ||
    page.frontmatter.sources.includes(sourceId) ||
    page.path === `sources/${sourceId}.md`
  );
}

export async function validateIngest(
  paths: ResolvedPaths,
  sourceId: string,
  diff: PageDiff,
  outside: { modified: string[]; deleted: string[] },
): Promise<IngestValidation> {
  const uncited: string[] = [];
  for (const rel of [...diff.created, ...diff.updated]) {
    if (!rel.endsWith(".md")) continue;
    const text = await readFile(path.join(paths.pagesDir, ...rel.split("/")), "utf8");
    if (!citesSource(parsePage(text, rel), sourceId)) uncited.push(rel);
  }
  uncited.sort(compareCodeUnits);
  const out = [...outside.modified, ...outside.deleted].sort(compareCodeUnits);
  const warnings: string[] = [];
  const sourcePage = path.join(paths.pagesDir, "sources", `${sourceId}.md`);
  try {
    await readFile(sourcePage);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    warnings.push(`${toPosixRelative(paths.root, sourcePage)} is missing: write the source page for this ingest`);
  }
  return { ok: uncited.length === 0 && out.length === 0, uncited, outside: out, warnings };
}
