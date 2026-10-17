// Citation, frontmatter and outside-write validation (STORY-003-09 R3, R10). Pure: reads only.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import { toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { parsePage } from "../wiki/parse-page.js";
import type { Page, PageError } from "../wiki/parse-page.js";
import type { PageDiff } from "./diff.js";

export interface IngestValidation {
  ok: boolean;
  uncited: string[];
  outside: string[];
  invalid: Array<{ path: string; message: string }>;
  warnings: string[];
}

const FRONTMATTER_CODES: ReadonlySet<PageError["code"]> = new Set(["frontmatter_yaml", "frontmatter_field"]);

/** `line <n>: <first message line>`; yaml's own " at line L, column C:" suffix and code frame are dropped. */
function frontmatterMessage(e: PageError): string {
  const first = e.message.split("\n")[0]!.replace(/ at line \d+, column \d+:?$/, "");
  return e.line === null ? first : `line ${e.line}: ${first}`;
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
  const invalid: Array<{ path: string; message: string }> = [];
  for (const rel of [...diff.created, ...diff.updated]) {
    if (!rel.endsWith(".md")) continue;
    const text = await readFile(path.join(paths.pagesDir, ...rel.split("/")), "utf8");
    const page = parsePage(text, rel);
    const bad = page.errors.filter((e) => FRONTMATTER_CODES.has(e.code));
    if (bad.length > 0) {
      for (const e of bad) invalid.push({ path: rel, message: frontmatterMessage(e) });
    } else if (!citesSource(page, sourceId)) {
      uncited.push(rel);
    }
  }
  uncited.sort(compareCodeUnits);
  invalid.sort((a, b) => compareCodeUnits(a.path, b.path)); // stable: one page's errors keep parser order
  const out = [...outside.modified, ...outside.deleted].sort(compareCodeUnits);
  const warnings: string[] = [];
  const sourcePage = path.join(paths.pagesDir, "sources", `${sourceId}.md`);
  try {
    await readFile(sourcePage);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    warnings.push(`${toPosixRelative(paths.root, sourcePage)} is missing: write the source page for this ingest`);
  }
  return { ok: uncited.length === 0 && out.length === 0 && invalid.length === 0, uncited, outside: out, invalid, warnings };
}
