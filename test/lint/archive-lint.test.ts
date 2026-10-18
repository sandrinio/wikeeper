import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { finishLintHook } from "../../src/commands/ingest-finish.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { archivePath, runLint } from "../../src/lint/checks.js";
import { brokenLinkCheck, linkResolver, orphanPageCheck } from "../../src/lint/links.js";
import { pageHash, unloggedChangeCheck } from "../../src/lint/unlogged.js";
import { parsePage } from "../../src/wiki/parse-page.js";
import type { LintContext } from "../../src/lint/checks.js";
import type { StoredLogEvent } from "../../src/ingest/log.js";

const paths = resolvePaths("/repo", DEFAULT_CONFIG);
const base = { paths, config: DEFAULT_CONFIG, kb: null, log: [] as StoredLogEvent[], now: new Date(0) };

const LIVE = parsePage("---\ntype: project\ntitle: Atlas\n---\n# Atlas\n", "projects/atlas.md");
const OLD = parsePage("---\ntype: project\ntitle: Atlas\n---\n# Atlas\n", "projects/atlas.md");
const BETA = parsePage("---\ntype: project\ntitle: Beta\n---\n# Beta\n", "projects/beta.md");

describe("linkResolver with archive pages", () => {
  it("gives archive pages the page keys and the archive/ key", () => {
    const r = linkResolver([], [BETA]);
    expect(r("beta")).toEqual(["projects/beta.md"]);
    expect(r("projects/beta")).toEqual(["projects/beta.md"]);
    expect(r("archive/projects/beta")).toEqual(["projects/beta.md"]);
  });
  it("a pages/ match wins over a namesake in archive/", () => {
    const r = linkResolver([LIVE], [OLD]);
    expect(r("atlas")).toEqual(["projects/atlas.md"]);
    expect(r("archive/projects/atlas")).toEqual(["projects/atlas.md"]);
    expect(linkResolver([], [])("archive/projects/atlas")).toEqual([]);
  });
  it("behaves as before with no archive pages", () => {
    expect(linkResolver([LIVE])("archive/projects/atlas")).toEqual([]);
    expect(linkResolver([LIVE])("atlas")).toEqual(["projects/atlas.md"]);
  });
});

describe("archivePath", () => {
  it("follows content_dir", () => {
    expect(archivePath(paths, "projects/atlas.md")).toBe(".wiki/archive/projects/atlas.md");
    const moved = resolvePaths("/repo", { ...DEFAULT_CONFIG, content_dir: "docs/kb" });
    expect(archivePath(moved, "a.md")).toBe("docs/kb/archive/a.md");
  });
});

describe("broken-link and orphan-page over both trees", () => {
  it("reads archive pages for broken-link", async () => {
    const arch = parsePage("# Gone\n\nSee [[ghost]] and [[atlas]].\n", "gone.md");
    const f = await brokenLinkCheck.run({ ...base, pages: [LIVE], archivePages: [arch] });
    expect(f.map((x) => x.path)).toEqual([".wiki/archive/gone.md"]);
  });
  it("an archive-only link does not keep a live page from being an orphan, and archive pages are never orphans", async () => {
    const arch = parsePage("# Old\n\nSee [[atlas]].\n", "old.md");
    const f = await orphanPageCheck.run({ ...base, pages: [LIVE], archivePages: [arch] });
    expect(f.map((x) => x.path)).toEqual([".wiki/pages/projects/atlas.md"]);
  });
});

describe("runLint only and onlyArchive", () => {
  const ghostLive = parsePage("# T\n\nSee [[ghost]].\n", "t.md");
  const ghostArch = parsePage("# T\n\nSee [[ghost]].\n", "t.md");
  const ctx: LintContext = { ...base, pages: [ghostLive], archivePages: [ghostArch] };
  const run = async (extra: Partial<LintContext>): Promise<(string | undefined)[]> =>
    (await runLint({ ...ctx, ...extra }, { scope: "pages", checks: ["broken-link"] })).map((f) => f.path);
  it("filters by tree", async () => {
    expect(await run({ only: ["t.md"] })).toEqual([".wiki/pages/t.md"]);
    expect(await run({ onlyArchive: ["t.md"] })).toEqual([".wiki/archive/t.md"]);
    expect(await run({ only: ["t.md"], onlyArchive: ["t.md"] })).toEqual([".wiki/archive/t.md", ".wiki/pages/t.md"]);
    expect(await run({ only: [] })).toEqual([]);
    expect(await run({})).toHaveLength(2);
  });
});

describe("unlogged-change archive pass", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });
  const TEXT = "# Atlas\n\nline\n";
  async function setup(events: Record<string, unknown>[]): Promise<LintContext> {
    const root = await mkdtemp(path.join(os.tmpdir(), "wk-arch-"));
    dirs.push(root);
    const p = resolvePaths(root, DEFAULT_CONFIG);
    await mkdir(path.join(p.archiveDir, "projects"), { recursive: true });
    await writeFile(path.join(p.archiveDir, "projects", "atlas.md"), TEXT);
    const log = events.map((event, i) => ({ file: `.wiki/log/e${i}.json`, event }) as unknown as StoredLogEvent);
    return { ...base, paths: p, pages: [], archivePages: [parsePage(TEXT, "projects/atlas.md")], log };
  }
  const ev = (id: string, extra: Record<string, unknown>): Record<string, unknown> => ({
    type: "ingest", source_id: id, at: "2026-10-18T10:00:00Z", ...extra,
  });
  const msgs = async (ctx: LintContext): Promise<string[]> =>
    (await unloggedChangeCheck.run(ctx)).filter((f) => f.path?.includes("/archive/")).map((f) => f.message);

  it("is clean when the recorded hash matches", async () => {
    const ctx = await setup([ev("src-2026-10-18-a", { archive_hashes: { "projects/atlas.md": pageHash(TEXT) } })]);
    expect(await msgs(ctx)).toEqual([]);
  });
  it("an event without archive_hashes or with an invalid map touches nothing", async () => {
    expect(await msgs(await setup([ev("src-2026-10-18-a", {})]))).toEqual(["in no ingest log event"]);
    expect(await msgs(await setup([ev("src-2026-10-18-a", { archive_hashes: { "projects/atlas.md": "nope" } })]))).toEqual([
      "in no ingest log event",
    ]);
  });
  it("the newer of two events touching one archive page wins", async () => {
    const ctx = await setup([
      ev("src-2026-10-18-a", { archive_hashes: { "projects/atlas.md": "0".repeat(64) } }),
      ev("src-2026-10-18-b", { archive_hashes: { "projects/atlas.md": pageHash(TEXT) } }),
    ]);
    expect(await msgs(ctx)).toEqual([]);
  });
  it("reports a changed file and a deleted file", async () => {
    const ctx = await setup([ev("src-2026-10-18-a", { archive_hashes: { "projects/atlas.md": "0".repeat(64) } })]);
    expect(await msgs(ctx)).toEqual(["changed since ingest src-2026-10-18-a recorded it (.wiki/log/e0.json)"]);
    expect(await msgs({ ...ctx, archivePages: [] })).toEqual([
      "deleted without a log entry (last recorded by ingest src-2026-10-18-a, .wiki/log/e0.json)",
    ]);
  });
  it("a private entry covers its archive file", async () => {
    const ctx = await setup([]);
    expect(await msgs({ ...ctx, config: { ...DEFAULT_CONFIG, private: ["projects"] } })).toEqual([]);
  });
});

describe("finishLintHook with archive changes", () => {
  it("returns [] when nothing changed in either tree", async () => {
    const p = resolvePaths("/nonexistent-wikeeper-root", DEFAULT_CONFIG);
    expect(await finishLintHook({ paths: p, sourceId: "src-2026-10-18-x", changed: [], archiveChanged: [] })).toEqual([]);
  });
});
