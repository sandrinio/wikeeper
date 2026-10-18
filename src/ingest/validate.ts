// Citation, frontmatter and outside-write validation (STORY-003-09 R3, R10). Pure: reads only.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { stripBom } from "../core/text.js";
import { loadPages, parsePage } from "../wiki/parse-page.js";
import type { Fact, Page, PageError } from "../wiki/parse-page.js";
import type { PageDiff } from "./diff.js";
import { snapshotDir } from "./snapshot.js";

export interface IngestValidation {
  ok: boolean;
  uncited: string[];
  outside: string[];
  invalid: Array<{ path: string; message: string }>;
  dropped: Array<{ path: string; line: string }>; // also deleted pages' lines; relative to pages/
  archived_dropped: Array<{ path: string; line: string }>; // relative to archive/; line "" = fact-less archive page deleted
  archived: { facts: number; pages: number };
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

type Entry = { path: string; line: string };

/** The distinct fact keys of a page, as a set. */
function keysOf(page: Page): Set<string> {
  return new Set(page.facts.map(factKey));
}

/** Read and parse one snapshot copy; any read error is `snapshot_missing`. */
async function snapshotFacts(
  paths: ResolvedPaths,
  sourceId: string,
  tree: "pages" | "archive",
  rel: string,
): Promise<{ facts: Fact[]; lines: string[] }> {
  const file = path.join(snapshotDir(paths, sourceId), tree, ...rel.split("/"));
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    const label = tree === "archive" ? `archive/${rel}` : rel;
    throw new WikeeperError(
      ExitCode.ERROR,
      "snapshot_missing",
      `the snapshot copy of ${label} is missing or unreadable (${toPosixRelative(paths.root, file)}): run wikeeper ingest abort ${sourceId}`,
    );
  }
  return { facts: parsePage(text, rel).facts, lines: stripBom(text).split(/\r?\n/) };
}

/** Snapshot facts whose key `has` rejects, each key once, in snapshot order, as `{ path, line }` entries. */
function missing(rel: string, snap: { facts: Fact[]; lines: string[] }, has: (key: string) => boolean): Entry[] {
  const out: Entry[] = [];
  const seen = new Set<string>();
  for (const f of snap.facts) {
    const key = factKey(f);
    if (has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ path: rel, line: (snap.lines[f.line - 1] ?? "").trim() });
  }
  return out;
}

async function archiveKeys(paths: ResolvedPaths, rel: string): Promise<Set<string>> {
  try {
    return keysOf(parsePage(await readFile(path.join(paths.archiveDir, ...rel.split("/")), "utf8"), rel));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return new Set();
  }
}

export async function validateIngest(
  paths: ResolvedPaths,
  sourceId: string,
  diff: PageDiff,
  outside: { modified: string[]; deleted: string[] },
): Promise<IngestValidation> {
  const arch = diff.archive ?? { created: [], updated: [], deleted: [] };
  const uncited: string[] = [];
  const invalid: Array<{ path: string; message: string }> = [];
  const dropped: Entry[] = [];
  const archivedDropped: Entry[] = [];
  const archived = { facts: 0, pages: 0 };

  // Rule 1: a line dropped from an updated page must be in that page's archive file.
  for (const rel of [...diff.created, ...diff.updated]) {
    if (!rel.endsWith(".md")) continue;
    const text = await readFile(path.join(paths.pagesDir, ...rel.split("/")), "utf8");
    const page = parsePage(text, rel);
    if (diff.updated.includes(rel)) {
      const kept = keysOf(page);
      const snap = await snapshotFacts(paths, sourceId, "pages", rel);
      const lostKeys = new Map<string, Entry>();
      for (const f of snap.facts) {
        const key = factKey(f);
        if (!kept.has(key) && !lostKeys.has(key)) lostKeys.set(key, { path: rel, line: (snap.lines[f.line - 1] ?? "").trim() });
      }
      if (lostKeys.size > 0) {
        const held = await archiveKeys(paths, rel);
        for (const [key, entry] of lostKeys) {
          if (held.has(key)) archived.facts += 1;
          else dropped.push(entry);
        }
      }
    }
    const bad = page.errors.filter((e) => FRONTMATTER_CODES.has(e.code));
    if (bad.length > 0) {
      for (const e of bad) invalid.push({ path: rel, message: frontmatterMessage(e) });
    } else if (!citesSource(page, sourceId)) {
      uncited.push(rel);
    }
  }

  // Rule 2: a deleted page's lines must survive in pages/ or archive/, at any path.
  const deletedMd = diff.deleted.filter((rel) => rel.endsWith(".md"));
  if (deletedMd.length > 0) {
    const live = new Set<string>();
    for (const p of await loadPages(paths.pagesDir)) for (const k of keysOf(p)) live.add(k);
    const kept = new Set<string>();
    for (const p of await loadPages(paths.archiveDir)) for (const k of keysOf(p)) kept.add(k);
    for (const rel of deletedMd) {
      const snap = await snapshotFacts(paths, sourceId, "pages", rel);
      const seen = new Set<string>();
      for (const f of snap.facts) {
        const key = factKey(f);
        if (seen.has(key)) continue;
        seen.add(key);
        if (live.has(key)) continue;
        if (kept.has(key)) archived.facts += 1;
        else dropped.push({ path: rel, line: (snap.lines[f.line - 1] ?? "").trim() });
      }
      if (arch.created.includes(rel) || arch.updated.includes(rel)) archived.pages += 1;
    }
  }

  // Archive pages: frontmatter yes, this ingest's citation no.
  for (const rel of [...arch.created, ...arch.updated]) {
    if (!rel.endsWith(".md")) continue;
    const page = parsePage(await readFile(path.join(paths.archiveDir, ...rel.split("/")), "utf8"), rel);
    for (const e of page.errors.filter((x) => FRONTMATTER_CODES.has(x.code))) {
      invalid.push({ path: `archive/${rel}`, message: frontmatterMessage(e) });
    }
  }

  // Rule 3: no fact line leaves archive/.
  for (const rel of arch.updated) {
    if (!rel.endsWith(".md")) continue;
    const snap = await snapshotFacts(paths, sourceId, "archive", rel);
    const kept = keysOf(parsePage(await readFile(path.join(paths.archiveDir, ...rel.split("/")), "utf8"), rel));
    archivedDropped.push(...missing(rel, snap, (k) => kept.has(k)));
  }
  for (const rel of arch.deleted) {
    if (!rel.endsWith(".md")) continue;
    const snap = await snapshotFacts(paths, sourceId, "archive", rel);
    const lost = missing(rel, snap, () => false);
    archivedDropped.push(...(lost.length > 0 ? lost : [{ path: rel, line: "" }]));
  }

  uncited.sort(compareCodeUnits);
  dropped.sort((a, b) => compareCodeUnits(a.path, b.path)); // stable: snapshot order within a page
  archivedDropped.sort((a, b) => compareCodeUnits(a.path, b.path));
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
    ok:
      uncited.length === 0 &&
      out.length === 0 &&
      invalid.length === 0 &&
      dropped.length === 0 &&
      archivedDropped.length === 0,
    uncited,
    outside: out,
    invalid,
    dropped,
    archived_dropped: archivedDropped,
    archived,
    warnings,
  };
}
