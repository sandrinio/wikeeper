// Citation, frontmatter and outside-write validation (STORY-003-09 R3, R10). Pure: reads only.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { parsePage } from "../wiki/parse-page.js";
import type { Fact, Page, PageError } from "../wiki/parse-page.js";
import type { PageDiff } from "./diff.js";
import { snapshotDir } from "./snapshot.js";

export interface IngestValidation {
  ok: boolean;
  uncited: string[];
  outside: string[];
  invalid: Array<{ path: string; message: string }>;
  dropped: Array<{ path: string; line: string }>;
  warnings: string[];
}

const FRONTMATTER_CODES: ReadonlySet<PageError["code"]> = new Set(["frontmatter_yaml", "frontmatter_field"]);

/** `line <n>: <first message line>`; yaml's own " at line L, column C:" suffix and code frame are dropped. */
function frontmatterMessage(e: PageError): string {
  const first = e.message.split("\n")[0]!.replace(/ at line \d+, column \d+:?$/, "");
  return e.line === null ? first : `line ${e.line}: ${first}`;
}

/** Fact identity (STORY-003-12 R1): layout is ignored; date, status, text, citation and contradicts are not. */
function factKey(f: Fact): string {
  return JSON.stringify([f.date, f.status, f.text.normalize("NFC").replace(/\s+/g, " ").trim(), f.contradicts, f.contradiction]);
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
  const dropped: Array<{ path: string; line: string }> = [];
  for (const rel of [...diff.created, ...diff.updated]) {
    if (!rel.endsWith(".md")) continue;
    const text = await readFile(path.join(paths.pagesDir, ...rel.split("/")), "utf8");
    const page = parsePage(text, rel);
    if (diff.updated.includes(rel)) {
      const file = path.join(snapshotDir(paths, sourceId), "pages", ...rel.split("/"));
      let oldText: string;
      try {
        oldText = await readFile(file, "utf8");
      } catch {
        throw new WikeeperError(
          ExitCode.ERROR,
          "snapshot_missing",
          `the snapshot copy of ${rel} is missing or unreadable (${toPosixRelative(paths.root, file)}): run wikeeper ingest abort ${sourceId}`,
        );
      }
      const kept = new Set(page.facts.map(factKey));
      const lines = oldText.replace(/^\uFEFF/, "").split(/\r?\n/);
      const seen = new Set<string>();
      for (const f of parsePage(oldText, rel).facts) {
        const key = factKey(f);
        if (kept.has(key) || seen.has(key)) continue;
        seen.add(key);
        dropped.push({ path: rel, line: (lines[f.line - 1] ?? "").trim() });
      }
    }
    const bad = page.errors.filter((e) => FRONTMATTER_CODES.has(e.code));
    if (bad.length > 0) {
      for (const e of bad) invalid.push({ path: rel, message: frontmatterMessage(e) });
    } else if (!citesSource(page, sourceId)) {
      uncited.push(rel);
    }
  }
  uncited.sort(compareCodeUnits);
  dropped.sort((a, b) => compareCodeUnits(a.path, b.path));
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
  return {
    ok: uncited.length === 0 && out.length === 0 && invalid.length === 0 && dropped.length === 0,
    uncited,
    outside: out,
    invalid,
    dropped,
    warnings,
  };
}
