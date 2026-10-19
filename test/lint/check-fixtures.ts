// R8 (STORY-006-11): one trigger fixture and one pass fixture for every registered lint check id.
// Built from copies of the existing fixtures: the lint-rules.red mutations and cleanFile, the checks.test.ts and
// staleness.test.ts contexts, and the unlogged.test.ts / index-drift temp roots. A helper module: test files import it,
// it imports no test file. Page fixtures use a temp root; call cleanupLintFixtures() after the run.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import type { WikeeperConfig } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { buildIndex } from "../../src/ingest/index-builder.js";
import type { IngestLogEvent, StoredLogEvent } from "../../src/ingest/log.js";
import { parseInstructions } from "../../src/kb/parse-instructions.js";
import type { LintContext, LintScope } from "../../src/lint/checks.js";
import { pageHash } from "../../src/lint/unlogged.js";
import { loadPages } from "../../src/wiki/parse-page.js";

export interface LintFixture {
  scope: LintScope;
  trigger(): Promise<LintContext>;
  pass(): Promise<LintContext>;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const KB_FIXTURE = path.join(REPO, "test", "fixtures", "kb", "real-management.md");
const KB_SEED = path.join(REPO, "templates", "kb_instructions.management.md");

const roots: string[] = [];
export async function cleanupLintFixtures(): Promise<void> {
  while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true, maxRetries: 3 });
}

// ---------- pages scope ----------

const SRC = "src-2026-10-16-q4";
const NOW = new Date("2026-11-20T12:00:00Z");

/** Two pages that link to each other: Atlas cites the source page, the source page names Atlas. */
function cleanPages(): Record<string, string> {
  return {
    "atlas.md": `# Atlas\n\nstatus:: Done\n\n## Facts\n\n- 2026-11-01 · decided · Launch moved. [[${SRC}]]\n`,
    [`sources/${SRC}.md`]: `# ${SRC}\n\nowner:: [[Atlas]]\n`,
  };
}

interface PagesOptions {
  pages: Record<string, string>;
  index?: "built" | "stale" | "missing";
  log?: "hashes" | "none";
  config?: WikeeperConfig;
}

/** Writes the pages (and index.md, ingest log event) to a temp root and loads them like the CLI does. */
async function pagesContext(opts: PagesOptions): Promise<LintContext> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-lint-fx-"));
  roots.push(root);
  const config: WikeeperConfig = opts.config ?? DEFAULT_CONFIG;
  const paths = resolvePaths(root, config);
  await mkdir(paths.pagesDir, { recursive: true });
  for (const [rel, text] of Object.entries(opts.pages)) {
    const file = path.join(paths.pagesDir, ...rel.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  const pages = await loadPages(paths.pagesDir);
  const index = opts.index ?? "built";
  if (index !== "missing") {
    await mkdir(path.dirname(paths.indexFile), { recursive: true });
    await writeFile(paths.indexFile, index === "built" ? buildIndex(pages) : `${buildIndex(pages)}\n- [Ghost](pages/ghost.md)\n`);
  }
  const log: StoredLogEvent[] = [];
  if ((opts.log ?? "hashes") === "hashes") {
    const hashes: Record<string, string> = {};
    for (const [rel, text] of Object.entries(opts.pages)) hashes[rel] = pageHash(text);
    const event = {
      type: "ingest", at: "2026-10-10T00:00:00.000Z", source_id: "src-1", kind: "k", rule_version: null,
      permission: "ai", origin: "o", created: Object.keys(opts.pages), updated: [], deleted: [], contradictions: 0,
      rule_suggestions: 0, page_hashes: hashes,
    } as unknown as IngestLogEvent;
    log.push({ file: ".wiki/log/e1.md", event });
  }
  return { paths, config, pages, kb: null, log, now: NOW };
}

function pageFixture(trigger: PagesOptions): LintFixture {
  return {
    scope: "pages",
    trigger: () => pagesContext(trigger),
    pass: () => pagesContext({ pages: cleanPages() }),
  };
}

// ---------- rules scope ----------

function edit(text: string, changes: Record<number, string>): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (const [n, v] of Object.entries(changes)) lines[Number(n) - 1] = v;
  return lines.join("\n");
}

async function readNormalized(file: string): Promise<string> {
  return (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
}

/** The real management fixture with its Q4 marked "(dated facts)": no rule finding at all. */
async function cleanFile(): Promise<string> {
  const base = await readNormalized(KB_FIXTURE);
  const lines = base.split("\n");
  if (!/^Q4 /.test(lines[9] ?? "")) throw new Error("test/fixtures/kb/real-management.md line 10 is no longer Q4");
  return edit(base, { 10: lines[9] + " (dated facts)" });
}

function rulesContext(text: string | null, kinds: string[] = []): LintContext {
  const config: WikeeperConfig = {
    ...DEFAULT_CONFIG,
    ingest: { ...DEFAULT_CONFIG.ingest, whitelist: { ...DEFAULT_CONFIG.ingest.whitelist, kinds } },
  };
  return { paths: resolvePaths("/repo", config), config, pages: [], kb: text === null ? null : parseInstructions(text), log: [], now: NOW };
}

function ruleFixture(trigger: () => Promise<LintContext>): LintFixture {
  return {
    scope: "rules",
    trigger,
    pass: async () => rulesContext(await cleanFile(), ["meeting-notes"]),
  };
}

const mutated = (changes: Record<number, string>) => async (): Promise<LintContext> => rulesContext(edit(await cleanFile(), changes));

export const LINT_FIXTURES: Record<string, LintFixture> = {
  // page checks
  "broken-link": pageFixture({ pages: { ...cleanPages(), "atlas.md": `# Atlas\n\nSee [[Nowhere]]. [[${SRC}]]\n` } }),
  "uncited-claim": pageFixture({ pages: { ...cleanPages(), "atlas.md": "# Atlas\n\nA claim with no citation.\n" } }),
  "orphan-page": pageFixture({ pages: { ...cleanPages(), [`sources/${SRC}.md`]: `# ${SRC}\n\nnote:: none\n` } }),
  "index-drift": pageFixture({ pages: cleanPages(), index: "stale" }),
  "unlogged-change": pageFixture({ pages: cleanPages(), log: "none" }),
  "oversized-page": pageFixture({
    pages: cleanPages(),
    config: { ...DEFAULT_CONFIG, tokens: { ...DEFAULT_CONFIG.tokens, page: { yellow: 10, red: 20 } } },
  }),
  "stale-fact": pageFixture({
    pages: { ...cleanPages(), "atlas.md": `# Atlas\n\nstatus:: Open\n\n## Facts\n\n- 2026-10-01 · decided · Plan agreed. [[${SRC}]]\n` },
  }),

  // rule checks
  "missing-file": ruleFixture(async () => rulesContext(null)),
  "missing-section": ruleFixture(async () => {
    const seed = await readNormalized(KB_SEED);
    const n = seed.split("\n").findIndex((l) => l === "## Entities") + 1;
    if (n === 0) throw new Error("the kb seed has no ## Entities heading");
    return rulesContext(edit(seed, { [n]: "## Entity list" }));
  }),
  "malformed-question": ruleFixture(mutated({ 14: "Q8" })),
  "malformed-entity": ruleFixture(mutated({ 25: "vendor name →" })),
  "unknown-question-ref": ruleFixture(mutated({ 23: "risk owner, impact → risks.md Q6 Q9" })),
  "ambiguous-line": ruleFixture(mutated({ 44: "Use roadmap → milestone for sprints" })),
  "duplicate-rule": ruleFixture(mutated({ 44: "roadmap (v3) → milestone" })),
  "unknown-entity": ruleFixture(mutated({ 44: "status-report (v1) → project.status, vendor" })),
  "unknown-field": ruleFixture(mutated({ 44: "status-report (v1) → milestone.owner" })),
  "question-without-rule": ruleFixture(async () => rulesContext(await readNormalized(KB_FIXTURE))),
  "rule-without-question": ruleFixture(mutated({ 25: "vendor name, contact → vendors.md", 44: "contract (v1) → vendor" })),
  "changelog-version-mismatch": ruleFixture(mutated({ 41: "initiative-doc (v2) → initiative, initiative.purpose, decision, risk, term" })),
  "unknown-whitelist-kind": ruleFixture(async () => rulesContext(await cleanFile(), ["meeting-notes", "standup"])),
};
