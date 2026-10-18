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
import { diffPages } from "../../src/ingest/diff.js";
import { snapshotDir, takeSnapshot } from "../../src/ingest/snapshot.js";
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

// ---- seeded property test: the three conservation rules against an independent oracle ----
describe("property: fact conservation matches an independent oracle", () => {
  type Tree = Record<string, number[]>; // path -> fact ids, in line order
  type Model = { pages: Tree; archive: Tree };
  type Pair = { path: string; line: string };

  const SRC = "src-2026-09-01-plan";
  const factLine = (n: number): string =>
    `- 2026-09-${String(1 + (n % 28)).padStart(2, "0")} · ${n % 2 === 0 ? "decided" : "tentative"} · Fact number ${n} about the topic. [[${SRC}]]`;
  const render = (facts: number[], live: boolean): string =>
    `---\ntype: project\n---\n# P\n\n## Facts\n\n${facts.map(factLine).join("\n")}\n${live ? `[[${ID}]]\n` : ""}`;
  const copy = (t: Tree): Tree => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, [...v]]));

  function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const before = (): Model => ({
    pages: { "a.md": [1, 2, 3], "b.md": [4, 5], "c.md": [6, 7, 8] },
    archive: { "a.md": [9, 10], "d.md": [11, 12, 13] },
  });

  function mutate(m: Model, r: () => number): void {
    const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
    let next = 100;
    const ops = 1 + Math.floor(r() * 4);
    for (let i = 0; i < ops; i++) {
      const tree = r() < 0.6 ? m.pages : m.archive;
      const paths = Object.keys(tree);
      if (paths.length === 0) continue;
      const p = pick(paths);
      const facts = tree[p]!;
      const other = (): Tree => (r() < 0.5 ? m.pages : m.archive);
      const put = (t: Tree, path: string, n: number): void => {
        const list = (t[path] ??= []);
        if (!list.includes(n)) list.push(n);
      };
      switch (Math.floor(r() * 9)) {
        case 0: // remove a fact
          if (facts.length) facts.splice(Math.floor(r() * facts.length), 1);
          break;
        case 1: // move a fact to the other tree, same path
        case 2: // move a fact to a random path of a random tree
          if (facts.length) {
            const n = facts.splice(Math.floor(r() * facts.length), 1)[0]!;
            const dest = other();
            put(dest, ((): string => (r() < 0.5 ? p : pick(["a.md", "b.md", "c.md", "d.md", "e.md"])))(), n);
          }
          break;
        case 3: // delete the page, optionally spreading its facts first
          for (const n of facts) {
            const roll = r();
            if (roll < 0.3) put(m.pages, pick(["a.md", "b.md", "c.md", "f.md"].filter((x) => x !== p || tree !== m.pages)), n);
            else if (roll < 0.6) put(m.archive, tree === m.archive ? pick(["e.md", "g.md"]) : p, n);
          }
          delete tree[p];
          break;
        case 4: // replace a fact by a changed one
          if (facts.length) facts[Math.floor(r() * facts.length)] = next++;
          break;
        case 5: // add a new fact
          facts.push(next++);
          break;
        case 6: // rename the page
          tree[pick(["e.md", "f.md"])] = facts;
          if (tree[p] === facts) break;
          delete tree[p];
          break;
        case 7: // empty the page of facts
          tree[p] = [];
          break;
        default: // copy a fact elsewhere, keeping it
          if (facts.length) put(other(), pick(["a.md", "b.md", "d.md"]), facts[0]!);
      }
    }
  }

  // The oracle: facts are identified by their id, the rules are applied to the abstract models.
  function oracle(b: Model, a: Model): { dropped: Pair[]; archived_dropped: Pair[]; archived: { facts: number; pages: number } } {
    const dropped: Pair[] = [];
    const archivedDropped: Pair[] = [];
    const archived = { facts: 0, pages: 0 };
    const liveAfter = new Set(Object.values(a.pages).flat());
    const archAfter = new Set(Object.values(a.archive).flat());
    const lines = (ids: number[]): number[] => [...new Set(ids)];
    for (const p of Object.keys(b.pages).sort(compareCU)) {
      const old = lines(b.pages[p]!);
      if (p in a.pages) {
        for (const n of old) {
          if (a.pages[p]!.includes(n)) continue;
          if ((a.archive[p] ?? []).includes(n)) archived.facts += 1;
          else dropped.push({ path: p, line: factLine(n) });
        }
      } else {
        for (const n of old) {
          if (liveAfter.has(n)) continue;
          if (archAfter.has(n)) archived.facts += 1;
          else dropped.push({ path: p, line: factLine(n) });
        }
        const was = b.archive[p];
        const now = a.archive[p];
        if (now && (!was || render(was, false) !== render(now, false))) archived.pages += 1;
      }
    }
    for (const p of Object.keys(b.archive).sort(compareCU)) {
      const old = lines(b.archive[p]!);
      if (p in a.archive) {
        for (const n of old) if (!a.archive[p]!.includes(n)) archivedDropped.push({ path: p, line: factLine(n) });
      } else if (old.length === 0) archivedDropped.push({ path: p, line: "" });
      else for (const n of old) archivedDropped.push({ path: p, line: factLine(n) });
    }
    return { dropped, archived_dropped: archivedDropped, archived };
  }
  const compareCU = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

  async function write(paths: ResolvedPaths, m: Model): Promise<void> {
    await rm(paths.pagesDir, { recursive: true, force: true });
    await rm(paths.archiveDir, { recursive: true, force: true });
    await mkdir(paths.pagesDir, { recursive: true });
    for (const [p, f] of Object.entries(m.pages)) await put(paths.pagesDir, p, render(f, true));
    for (const [p, f] of Object.entries(m.archive)) await put(paths.archiveDir, p, render(f, false));
  }

  it("agrees on dropped, archived_dropped and archived over 300 seeded write phases, and ok implies no fact is lost", async () => {
    const r = rng(20261018);
    const paths = await repo();
    let refused = 0;
    let accepted = 0;
    for (let i = 0; i < 300; i++) {
      const b = before();
      const a: Model = { pages: copy(b.pages), archive: copy(b.archive) };
      mutate(a, r);
      await write(paths, b);
      const snap = await takeSnapshot(paths, ID, "0".repeat(64));
      await write(paths, a);
      const diff = await diffPages(paths, snap);
      let got;
      try {
        got = await validateIngest(paths, ID, diff, { modified: [], deleted: [] });
      } catch (err) {
        throw new Error(`iteration ${i}: ${(err as Error).message}\n${JSON.stringify({ b, a })}`);
      }
      const want = oracle(b, a);
      const ctx = `iteration ${i}: ${JSON.stringify({ b, a })}`;
      const sorted = (xs: Pair[]): Pair[] => [...xs].sort((x, y) => compareCU(x.path, y.path));
      expect({ ...got, ctx }.dropped, ctx).toEqual(sorted(want.dropped));
      expect(got.archived_dropped, ctx).toEqual(sorted(want.archived_dropped));
      expect(got.archived, ctx).toEqual(want.archived);
      expect(got.ok, ctx).toBe(want.dropped.length === 0 && want.archived_dropped.length === 0);
      if (got.ok) {
        accepted += 1;
        const liveAfter = new Set(Object.values(a.pages).flat());
        const archAfter = new Set(Object.values(a.archive).flat());
        for (const n of [...Object.values(b.pages).flat(), ...Object.values(b.archive).flat()]) {
          expect(liveAfter.has(n) || archAfter.has(n), `${ctx} lost fact ${n}`).toBe(true);
        }
        for (const [p, ids] of Object.entries(b.archive)) for (const n of ids) expect(a.archive[p]?.includes(n), `${ctx} archive ${p} lost ${n}`).toBe(true);
      } else refused += 1;
    }
    expect(accepted).toBeGreaterThan(20);
    expect(refused).toBeGreaterThan(20);
  }, 60_000);
});
