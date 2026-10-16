import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeSearch, createSearchCommand } from "../../src/commands/search.js";
import { agentsIntegration } from "../../src/agents/index.js";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { runCli } from "../../src/program.js";
import { EMPTY_FILTERS } from "../../src/search/engine.js";
import type { SearchDeps } from "../../src/search/engine.js";
import { generateWiki } from "../fixtures/search/generate-wiki.js";

// STORY-004-06 (red): S1 warm cache reused, S2 page changes rebuild, S4 bad/unwritable cache, S5 remove deletes the cache.
// The cache path is spelled as a literal: searchCacheFile / SEARCH_CACHE_VERSION do not exist at red time.
const CACHE = ".wiki/.cache/search.json";
const cleanup: string[] = [];

beforeEach(() => {
  resetIntegrations();
  registerIntegration({ name: "agents", ...agentsIntegration } as never);
});
afterEach(async () => {
  resetIntegrations();
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function tmp(prefix: string): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanup.push(d);
  return d;
}
async function put(root: string, rel: string, content: string): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
const req = (query: string) => ({
  query,
  limit: 10,
  filters: { ...EMPTY_FILTERS, where: [] },
  entity: null,
  misses: false,
});
const ATLAS = ["---", "type: project", "title: Atlas", "---", "# Atlas", "", "## Timeline", "The atlas programme slipped by a week.", ""].join("\n");

async function atlasWiki(pages = 19): Promise<string> {
  const root = await tmp("wikeeper-cache-");
  await generateWiki(root, { seed: 2, pages });
  await put(root, ".wiki/pages/projects/atlas.md", ATLAS);
  return root;
}
async function drive(root: string, args: string[], deps?: SearchDeps) {
  let out = "";
  let err = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(c, _e, cb) { err += String(c); cb(); } });
  const io = { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never;
  const code = deps
    ? await runCli(args, { commands: [createSearchCommand(deps)], io })
    : await runCli(args, { io });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, out, err, json };
}
async function treeHash(dir: string): Promise<string> {
  const h = createHash("sha256");
  async function walk(d: string): Promise<void> {
    const names = (await readdir(d, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of names) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else { h.update(path.relative(dir, p).split(path.sep).join("/")); h.update(await readFile(p)); }
    }
  }
  await walk(dir);
  return h.digest("hex");
}
async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

describe("Scenario: A warm cache is reused (red)", () => {
  it("two runs rebuild once, write the cache, and return identical data equal to useCache false", async () => {
    const root = await atlasWiki();
    let n = 0;
    const deps: SearchDeps & { onRebuild: () => void } = { onRebuild: () => { n++; } };
    const first = await executeSearch(root, req("atlas"), deps);
    const second = await executeSearch(root, req("atlas"), deps);
    expect(n).toBe(1);
    expect(await exists(path.join(root, ...CACHE.split("/")))).toBe(true);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.total).toBeGreaterThan(0);
    const cold = await executeSearch(root, req("atlas"), { useCache: false });
    expect(JSON.stringify(cold)).toBe(JSON.stringify(first));
  });

  it("useCache false neither writes the cache nor calls onRebuild", async () => {
    const root = await atlasWiki(3);
    let n = 0;
    const deps: SearchDeps & { onRebuild: () => void } = { useCache: false, onRebuild: () => { n++; } };
    await executeSearch(root, req("atlas"), deps);
    expect(n).toBe(0);
    expect(await exists(path.join(root, ".wiki", ".cache"))).toBe(false);
  });

  it("the cache file holds version 1, package_version, files, pages, docs and index", async () => {
    const root = await atlasWiki(3);
    await executeSearch(root, req("atlas"), {});
    const cache = JSON.parse(await readFile(path.join(root, ...CACHE.split("/")), "utf8"));
    expect(cache.version).toBe(1);
    expect(typeof cache.package_version).toBe("string");
    expect(Array.isArray(cache.files)).toBe(true);
    expect(cache.files.length).toBe(4);
    for (const f of cache.files) {
      expect(f.path).not.toContain("\\");
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(Array.isArray(cache.pages)).toBe(true);
    expect(Array.isArray(cache.docs)).toBe(true);
    expect(cache.index).toBeTypeOf("object");
  });

  it("leaves no temp file in .wiki/.cache after a write", async () => {
    const root = await atlasWiki(3);
    await executeSearch(root, req("atlas"), {});
    const names = await readdir(path.join(root, ".wiki", ".cache"));
    expect(names).toEqual(["search.json"]);
  });
});

describe("Scenario Outline: A page change rebuilds the cache (red)", () => {
  const rows: Array<{
    name: string;
    query: string;
    change: (root: string) => Promise<void>;
    include: boolean;
    path: string;
  }> = [
    {
      name: 'add "orbital" to projects/atlas.md',
      query: "orbital",
      change: (root) => put(root, ".wiki/pages/projects/atlas.md", ATLAS + "\nOrbital insertion is next.\n"),
      include: true,
      path: "projects/atlas.md",
    },
    {
      name: "add pages/projects/zephyr.md about zephyr",
      query: "zephyr",
      change: (root) => put(root, ".wiki/pages/projects/zephyr.md", "# Zephyr\n\n## Notes\nZephyr is a new initiative.\n"),
      include: true,
      path: "projects/zephyr.md",
    },
    {
      name: "delete projects/atlas.md",
      query: "atlas",
      change: (root) => unlink(path.join(root, ".wiki", "pages", "projects", "atlas.md")),
      include: false,
      path: "projects/atlas.md",
    },
  ];
  for (const row of rows) {
    it(row.name, async () => {
      const root = await atlasWiki();
      await executeSearch(root, req("atlas"), {});
      expect(await exists(path.join(root, ...CACHE.split("/")))).toBe(true);
      await row.change(root);
      let n = 0;
      const deps: SearchDeps & { onRebuild: () => void } = { onRebuild: () => { n++; } };
      const r = await drive(root, ["search", row.query, "--json"], deps);
      expect(r.code).toBe(0);
      expect(n).toBe(1);
      const paths = (r.json.data.results as any[]).map((h) => h.path);
      if (row.include) expect(paths).toContain(row.path);
      else expect(paths).not.toContain(row.path);
      const cold = await executeSearch(root, req(row.query), { useCache: false });
      expect(r.json.data.results).toEqual(JSON.parse(JSON.stringify(cold.results)));
    });
  }
});

describe("Scenario Outline: a bad or unwritable cache never fails search (red)", () => {
  async function coldResults(root: string): Promise<unknown> {
    const cold = await executeSearch(root, req("atlas"), { useCache: false });
    return JSON.parse(JSON.stringify(cold.results));
  }

  it('cache containing "{oops" is rebuilt silently', async () => {
    const root = await atlasWiki(5);
    await put(root, CACHE, "{oops");
    const r = await drive(root, ["search", "atlas", "--json"], {});
    expect(r.code).toBe(0);
    expect(r.json.warnings).toEqual([]);
    expect(r.json.data.results).toEqual(await coldResults(root));
    const cache = JSON.parse(await readFile(path.join(root, ...CACHE.split("/")), "utf8"));
    expect(cache.version).toBe(1);
  });

  it("cache with version 99 is rebuilt silently", async () => {
    const root = await atlasWiki(5);
    await executeSearch(root, req("atlas"), {});
    const file = path.join(root, ...CACHE.split("/"));
    const cache = JSON.parse(await readFile(file, "utf8"));
    cache.version = 99;
    await writeFile(file, JSON.stringify(cache));
    let n = 0;
    const deps: SearchDeps & { onRebuild: () => void } = { onRebuild: () => { n++; } };
    const r = await drive(root, ["search", "atlas", "--json"], deps);
    expect(r.code).toBe(0);
    expect(n).toBe(1);
    expect(r.json.warnings).toEqual([]);
    expect(r.json.data.results).toEqual(await coldResults(root));
    expect(JSON.parse(await readFile(file, "utf8")).version).toBe(1);
  });

  it(".wiki/.cache existing as a regular file gives a warning and still returns results", async () => {
    const root = await atlasWiki(5);
    await put(root, ".wiki/.cache", "not a directory");
    const r = await drive(root, ["search", "atlas", "--json"], {});
    expect(r.code).toBe(0);
    expect(r.json.data.results).toEqual(await coldResults(root));
    expect(r.json.data.total).toBeGreaterThan(0);
    const warnings = r.json.warnings as string[];
    expect(warnings.some((w) => w.startsWith("search cache not written:"))).toBe(true);
    expect((await stat(path.join(root, ".wiki", ".cache"))).isFile()).toBe(true);
  });
});

describe("Scenario: remove deletes the derived cache (red)", () => {
  it("removes .wiki/.cache/, lists the cache file, leaves pages/ and raw/ unchanged", async () => {
    const root = await tmp("wikeeper-cache-rm-");
    await mkdir(path.join(root, ".git"), { recursive: true });
    const init = await drive(root, ["init", "--yes", "--agents", "claude", "--json"]);
    expect(init.code).toBe(0);
    await put(root, ".wiki/pages/projects/atlas.md", ATLAS);
    const s = await drive(root, ["search", "atlas", "--json"]);
    expect(s.code).toBe(0);
    expect(await exists(path.join(root, ...CACHE.split("/")))).toBe(true);
    await mkdir(path.join(root, ".wiki", "raw"), { recursive: true });
    await put(root, ".wiki/raw/keep.txt", "raw bytes\n");
    const pagesBefore = await treeHash(path.join(root, ".wiki", "pages"));
    const rawBefore = await treeHash(path.join(root, ".wiki", "raw"));
    const r = await drive(root, ["remove", "--json"]);
    expect(r.code).toBe(0);
    expect(await exists(path.join(root, ".wiki", ".cache"))).toBe(false);
    expect(r.json.data.removed).toContain(CACHE);
    expect(await treeHash(path.join(root, ".wiki", "pages"))).toBe(pagesBefore);
    expect(await treeHash(path.join(root, ".wiki", "raw"))).toBe(rawBefore);
  });
});
