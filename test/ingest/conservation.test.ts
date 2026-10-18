import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import type { TreeDiff } from "../../src/ingest/diff.js";
import { formatReport } from "../../src/ingest/report.js";
import type { IngestReport } from "../../src/ingest/report.js";
import { snapshotDir } from "../../src/ingest/snapshot.js";
import { validateIngest } from "../../src/ingest/validate.js";

const ID = "src-2026-10-18-cleanup";
const A1 = "- 2026-09-01 · tentative · Atlas ships 2026-10-15. [[src-2026-09-01-plan]]";
const A2 = "- 2026-10-10 · decided · Atlas ships 2026-11-03. [[src-2026-10-10-review]]";
const B1 = "- 2026-09-15 · decided · The design lead runs the design reviews. [[src-2026-09-15-org]]";
const B2 = "- 2026-09-20 · decided · The design lead works remotely. [[src-2026-09-20-org]]";
const page = (...lines: string[]): string => `---\ntype: project\n---\n# P\n\n## Facts\n\n${lines.join("\n")}\n[[${ID}]]\n`;
const empty = (): TreeDiff => ({ created: [], updated: [], deleted: [] });

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

async function put(dir: string, rel: string, text: string | null): Promise<void> {
  if (text === null) return;
  const file = path.join(dir, ...rel.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}
async function repo(): Promise<ResolvedPaths> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-cons-"));
  dirs.push(root);
  const paths = resolvePaths(root, DEFAULT_CONFIG);
  await mkdir(paths.pagesDir, { recursive: true });
  return paths;
}
const val = (paths: ResolvedPaths, diff: Partial<TreeDiff> & { archive?: Partial<TreeDiff> }) =>
  validateIngest(paths, ID, { ...empty(), ...diff, archive: { ...empty(), ...diff.archive } }, { modified: [], deleted: [] });

describe("rule 1: a dropped line must be in the page's archive file", () => {
  it("accepts a line kept in archive/<same path>, ignoring layout, BOM and CRLF", async () => {
    const paths = await repo();
    await put(path.join(snapshotDir(paths, ID), "pages"), "a.md", page(A1, A2));
    await put(paths.pagesDir, "a.md", page(A2));
    await put(paths.archiveDir, "a.md", `﻿---\r\ntype: project\r\n---\r\n*  2026-09-01 ·  tentative · Atlas ships   2026-10-15. [[src-2026-09-01-plan]]\r\n`);
    const v = await val(paths, { updated: ["a.md"], archive: { created: ["a.md"] } });
    expect(v.ok).toBe(true);
    expect(v.archived).toEqual({ facts: 1, pages: 0 });
  });

  it("refuses a line kept only in another archive path", async () => {
    const paths = await repo();
    await put(path.join(snapshotDir(paths, ID), "pages"), "a.md", page(A1, A2));
    await put(paths.pagesDir, "a.md", page(A2));
    await put(paths.archiveDir, "old-a.md", page(A1));
    const v = await val(paths, { updated: ["a.md"], archive: { created: ["old-a.md"] } });
    expect(v.dropped).toEqual([{ path: "a.md", line: A1 }]);
    expect(v.archived_dropped).toEqual([]);
    expect(v.ok).toBe(false);
  });

  it("treats a diff without archive as empty", async () => {
    const paths = await repo();
    await put(path.join(snapshotDir(paths, ID), "pages"), "a.md", page(A1));
    await put(paths.pagesDir, "a.md", page());
    const v = await validateIngest(paths, ID, { created: [], updated: ["a.md"], deleted: [] }, { modified: [], deleted: [] });
    expect(v.dropped).toEqual([{ path: "a.md", line: A1 }]);
    expect(v.archived).toEqual({ facts: 0, pages: 0 });
  });
});

describe("rule 2: a deleted page's lines must survive", () => {
  async function deleted(live: string | null, arch: string | null, archPath = "gone.md"): Promise<ResolvedPaths> {
    const paths = await repo();
    await put(path.join(snapshotDir(paths, ID), "pages"), "gone.md", page(B1, B2));
    await put(paths.pagesDir, "other.md", live);
    await put(paths.archiveDir, archPath, arch);
    return paths;
  }

  it("accepts a merge into another live page", async () => {
    const v = await val(await deleted(page(B1, B2), null), { deleted: ["gone.md"] });
    expect(v.ok).toBe(true);
    expect(v.archived).toEqual({ facts: 0, pages: 0 });
  });

  it("accepts a rename within pages/ (the same lines at a new path)", async () => {
    const v = await val(await deleted(page(B1, B2), null), { created: ["other.md"], deleted: ["gone.md"] });
    expect(v.dropped).toEqual([]);
  });

  it("accepts a page moved whole to archive/<same path> and counts it", async () => {
    const v = await val(await deleted(null, page(B1, B2)), { deleted: ["gone.md"], archive: { created: ["gone.md"] } });
    expect(v.ok).toBe(true);
    expect(v.archived).toEqual({ facts: 2, pages: 1 });
  });

  it("counts lines found in archive/<other path> as archived facts but not the page", async () => {
    const v = await val(await deleted(null, page(B1, B2), "elsewhere.md"), { deleted: ["gone.md"], archive: { created: ["elsewhere.md"] } });
    expect(v.ok).toBe(true);
    expect(v.archived).toEqual({ facts: 2, pages: 0 });
  });

  it("reports only the lines that survive nowhere", async () => {
    const v = await val(await deleted(page(B1), null), { deleted: ["gone.md"] });
    expect(v.dropped).toEqual([{ path: "gone.md", line: B2 }]);
    expect(v.ok).toBe(false);
  });

  it("counts a fact-less page moved whole", async () => {
    const paths = await repo();
    await put(path.join(snapshotDir(paths, ID), "pages"), "gone.md", "---\ntype: meeting\n---\n# Kickoff\n");
    await put(paths.archiveDir, "gone.md", "---\ntype: meeting\n---\n# Kickoff\n");
    const v = await val(paths, { deleted: ["gone.md"], archive: { created: ["gone.md"] } });
    expect(v.ok).toBe(true);
    expect(v.archived).toEqual({ facts: 0, pages: 1 });
  });

  it("throws snapshot_missing for a deleted page without a snapshot copy", async () => {
    const paths = await repo();
    await expect(val(paths, { deleted: ["gone.md"] })).rejects.toMatchObject({ code: "snapshot_missing" });
  });
});

describe("rule 3: no fact line leaves archive/", () => {
  async function arch(before: string, now: string | null): Promise<ResolvedPaths> {
    const paths = await repo();
    await put(path.join(snapshotDir(paths, ID), "archive"), "a.md", before);
    await put(paths.archiveDir, "a.md", now);
    return paths;
  }

  it("refuses a removed line", async () => {
    const v = await val(await arch(page(A1, A2), page(A2)), { archive: { updated: ["a.md"] } });
    expect(v.archived_dropped).toEqual([{ path: "a.md", line: A1 }]);
    expect(v.dropped).toEqual([]);
  });

  it("refuses a deleted archive page, one entry per line", async () => {
    const v = await val(await arch(page(A1, A2), null), { archive: { deleted: ["a.md"] } });
    expect(v.archived_dropped).toEqual([
      { path: "a.md", line: A1 },
      { path: "a.md", line: A2 },
    ]);
  });

  it("refuses a deleted fact-less archive page with an empty line", async () => {
    const v = await val(await arch("---\ntype: meeting\n---\n# K\n", null), { archive: { deleted: ["a.md"] } });
    expect(v.archived_dropped).toEqual([{ path: "a.md", line: "" }]);
    expect(v.ok).toBe(false);
  });

  it("throws snapshot_missing naming archive/<path>", async () => {
    const paths = await repo();
    await put(paths.archiveDir, "a.md", page(A2));
    await expect(val(paths, { archive: { updated: ["a.md"] } })).rejects.toThrow(/archive\/a\.md/);
  });

  it("accepts appended lines", async () => {
    const v = await val(await arch(page(A1), page(A1, A2)), { archive: { updated: ["a.md"] } });
    expect(v.ok).toBe(true);
  });
});

describe("archive pages: frontmatter yes, citation no", () => {
  it("prefixes frontmatter errors with archive/ and skips the citation check", async () => {
    const paths = await repo();
    await put(paths.archiveDir, "a.md", "---\ntitle: 1\n---\n# A\n");
    await put(paths.archiveDir, "b.md", "# B without a citation\n");
    const v = await val(paths, { archive: { created: ["a.md", "b.md"] } });
    expect(v.invalid).toEqual([{ path: "archive/a.md", message: 'frontmatter field "title" must be a string or null' }]);
    expect(v.uncited).toEqual([]);
  });
});

describe("the archived line of the report", () => {
  const base: IngestReport = {
    source_id: ID,
    kind: "chat",
    rule_version: null,
    permission: "ai",
    origin: "x",
    size: 10,
    sha256: "abcd1234",
    created: [],
    updated: [],
    deleted: [],
    archived: { facts: 0, pages: 0 },
    contradictions: 0,
    rule_suggestions: 0,
    log_file: "l",
    index_changed: false,
    hooks: [],
    lint: [],
  };
  it.each([
    [1, 0, "   archived 1 fact line · 0 pages"],
    [0, 1, "   archived 0 fact lines · 1 page"],
    [3, 1, "   archived 3 fact lines · 1 page"],
  ])("prints it for (%i, %i)", (facts, pages, line) => {
    const lines = formatReport({ ...base, archived: { facts, pages } });
    const i = lines.findIndex((l) => l.startsWith("   created "));
    expect(lines[i + 1]).toBe(line);
  });
  it("does not print it for (0, 0)", () => {
    expect(formatReport(base).some((l) => l.startsWith("   archived"))).toBe(false);
  });
});
