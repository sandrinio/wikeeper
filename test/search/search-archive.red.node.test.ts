import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentsIntegration } from "../../src/agents/index.js";
import { executeSearch } from "../../src/commands/search.js";
import { DEFAULT_CONFIG, setConfigValue } from "../../src/core/config.js";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { resolvePaths } from "../../src/core/paths.js";
import { writeFacts } from "../../src/ingest/facts.js";
import { registerSource } from "../../src/ingest/registry.js";
import { runCli } from "../../src/program.js";
import { EMPTY_FILTERS } from "../../src/search/engine.js";
import type { SearchDeps } from "../../src/search/engine.js";

// STORY-008-03 (red): index.md counts the archive, default search skips it, --archive / --entity / --since reach it,
// the search cache covers both trees, --archive usage errors.
const CACHE = ".wiki/.cache/search.json";
const ONE = "_1 archived page — search it with `wikeeper search --archive`._";
const THREE = "_3 archived pages — search them with `wikeeper search --archive`._";
const cleanup: string[] = [];

beforeEach(() => {
  resetIntegrations();
  registerIntegration({ name: "agents", ...agentsIntegration } as never);
});
afterEach(async () => {
  resetIntegrations();
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function put(root: string, rel: string, content: string): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
async function emptyRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-arch-"));
  cleanup.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  await put(root, ".wiki/config.yml", "agents: [claude]\n");
  return root;
}
async function drive(root: string, args: string[], deps?: SearchDeps) {
  let out = "";
  let err = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(c, _e, cb) { err += String(c); cb(); } });
  const io = { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never;
  const code = await runCli(args, { io });
  void deps;
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, out, err, json };
}
const readText = (root: string, rel: string) => readFile(path.join(root, ...rel.split("/")), "utf8");

const LIVE_ATLAS = [
  "---", "type: project", "title: Atlas", "---", "# Atlas", "", "## Facts", "",
  "- 2026-10-10 · decided · Atlas ships 2026-11-20 [[src-2026-10-10-a]]", "",
].join("\n");
const ARCH_ATLAS = [
  "---", "type: project", "title: Atlas", "---", "# Atlas", "", "## Facts", "",
  "- 2026-09-01 · tentative · Atlas launch window mid-October [[src-2026-09-01-a]]", "",
].join("\n");
const srcPage = (id: string) => ["---", "type: source", `title: ${id}`, "---", `# ${id}`, ""].join("\n");

async function atlasPair(): Promise<string> {
  const root = await emptyRoot();
  await put(root, ".wiki/pages/projects/atlas.md", LIVE_ATLAS);
  await put(root, ".wiki/archive/projects/atlas.md", ARCH_ATLAS);
  await put(root, ".wiki/pages/sources/src-2026-10-10-a.md", srcPage("src-2026-10-10-a"));
  await put(root, ".wiki/pages/sources/src-2026-09-01-a.md", srcPage("src-2026-09-01-a"));
  return root;
}
async function historyWiki(): Promise<string> {
  const root = await atlasPair();
  await put(root, ".wiki/archive/projects/beta.md", [
    "---", "type: project", "title: Beta", "---", "# Beta", "", "status:: shipped", "", "## Facts", "",
    "- 2026-08-20 · decided · Beta pilot started [[src-2026-08-20-a]]",
    "- 2026-09-02 · decided · Beta shipped to customers [[src-2026-09-02-a]]", "",
  ].join("\n"));
  await put(root, ".wiki/pages/team.md", [
    "---", "type: team", "title: Team", "---", "# Team", "", "Owns [[beta]] work.", "", "## Facts", "",
    "- 2026-10-12 · decided · The product lead runs QA [[src-2026-10-10-a]]", "",
  ].join("\n"));
  return root;
}

describe("Scenario Outline: index.md lists pages/ only and counts the archive (red)", () => {
  const rows: Array<[number, string | null]> = [[0, null], [1, ONE], [3, THREE]];
  for (const [n, line] of rows) {
    it(`index rebuild with ${n} archived page(s)`, async () => {
      const root = await emptyRoot();
      await put(root, ".wiki/pages/projects/atlas.md", LIVE_ATLAS);
      for (let i = 0; i < n; i++) await put(root, `.wiki/archive/old/p${i}.md`, `---\ntype: note\ntitle: Old ${i}\n---\n`);
      const r = await drive(root, ["index", "rebuild", "--json"]);
      expect(r.code).toBe(0);
      expect(r.json.ok).toBe(true);
      expect(r.json.data.index.archived).toBe(n);
      const index = await readText(root, ".wiki/index.md");
      expect(index).toContain("pages/projects/atlas.md");
      expect(index).not.toContain("old/p");
      if (line === null) expect(index).not.toContain("archived");
      else {
        const lines = index.split("\n");
        const at = lines.indexOf(line);
        expect(at).toBeGreaterThan(1);
        expect(lines[at - 1]).toBe("");
        expect(lines[at - 2]).toMatch(/^_Generated by .*Do not edit\._$/);
        expect(lines[at + 1]).toBe("");
      }
    });
  }

  it("the human message adds ', 3 archived' after the page count", async () => {
    const root = await emptyRoot();
    await put(root, ".wiki/pages/projects/atlas.md", LIVE_ATLAS);
    for (let i = 0; i < 3; i++) await put(root, `.wiki/archive/old/p${i}.md`, `---\ntype: note\n---\n`);
    const r = await drive(root, ["index", "rebuild"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("(1 pages, 3 archived)");
  });

  it("buildIndex: archived 0 or absent is byte-identical; 3 adds the line after a blank; no pages puts it after _No pages yet._", async () => {
    const { buildIndex } = await import("../../src/ingest/index-builder.js");
    const base = buildIndex([]);
    expect(buildIndex([], { archived: 0 } as never)).toBe(base);
    expect(base).toContain("_No pages yet._");
    expect(buildIndex([], { archived: 3 } as never)).toBe(base.replace("_No pages yet._\n", `_No pages yet._\n\n${THREE}\n`));
    expect(buildIndex([], { archived: 1 } as never)).toContain(ONE);
  });

  it("ingest finish writes the archived line (3 archive pages)", async () => {
    const root = await emptyRoot();
    const run = async (args: string[]) => drive(root, args);
    expect((await run(["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
    await setConfigValue(root, "ingest.permission", "ai");
    const paths = resolvePaths(root, DEFAULT_CONFIG);
    const OLD = "src-2026-10-16-roadmap";
    const ID = "src-2026-10-18-roadmap";
    await put(root, ".wiki/pages/projects/atlas.md", LIVE_ATLAS.replace("src-2026-10-10-a", OLD));
    for (let i = 0; i < 3; i++) await put(root, `.wiki/archive/old/p${i}.md`, `---\ntype: note\ntitle: Old ${i}\n---\n`);
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "docs", "roadmap.md"), "roadmap content\n");
    const meta = await registerSource(paths, {
      originType: "file", origin: "docs/roadmap.md", label: "roadmap",
      originalPath: path.join(root, "docs", "roadmap.md"), text: null, kind: "status-report", providedBy: "user",
      ruleVersion: null, reingestOf: null,
      permission: { mode: "ai", approved: false, matched: null, kind_pending: false },
      now: new Date("2026-10-18T10:00:00Z"),
    } as never);
    await writeFacts(paths, {
      source_id: meta.id, kind: "status-report", rule_version: 2,
      facts: [{ entity: "project:atlas", field: "status", value: "green", status: "decided", as_of: "2026-10-18",
        anchor: "Facts", page: "projects/atlas.md", exists: true }],
      uncovered: [],
    } as never);
    expect((await run(["ingest", "apply", meta.id, "--json"])).code).toBe(0);
    await put(root, ".wiki/pages/projects/atlas.md",
      LIVE_ATLAS.replace("src-2026-10-10-a", OLD) + `- 2026-10-18 · decided · Roadmap reviewed [[${meta.id}]]\n`);
    const fin = await run(["ingest", "finish", meta.id, "--json"]);
    expect(fin.code).toBe(0);
    expect(ID).toBe(meta.id);
    const index = await readText(root, ".wiki/index.md");
    expect(index).toContain(THREE);
    expect(index).not.toContain("old/p0");
  });
});

describe("Scenario Outline: Default search skips the archive; --archive includes it (red)", () => {
  it("launch window: total 0 by default", async () => {
    const root = await atlasPair();
    const r = await drive(root, ["search", "launch", "window", "--json"]);
    expect(r.json.ok).toBe(true);
    expect(r.json.data.total).toBe(0);
  });

  it("launch window --archive: one archived hit under .wiki/archive/, human line marked", async () => {
    const root = await atlasPair();
    const r = await drive(root, ["search", "launch", "window", "--archive", "--json"]);
    expect(r.json.ok).toBe(true);
    const hits = (r.json.data.results as any[]).filter((h) => h.path === "projects/atlas.md");
    expect(hits).toHaveLength(1);
    expect(hits[0].file).toBe(".wiki/archive/projects/atlas.md");
    expect(hits[0].archived).toBe(true);
    expect(typeof hits[0].page_tokens).toBe("number");
    const h = await drive(root, ["search", "launch", "window", "--archive"]);
    expect(h.out).toContain("1. projects/atlas.md › Facts (archived)");
  });

  it("atlas: every hit is live under .wiki/pages/", async () => {
    const root = await atlasPair();
    const r = await drive(root, ["search", "atlas", "--json"]);
    expect(r.json.ok).toBe(true);
    expect(r.json.data.total).toBeGreaterThan(0);
    for (const h of r.json.data.results as any[]) {
      expect(h.archived).toBe(false);
      expect(h.file.startsWith(".wiki/pages/")).toBe(true);
    }
  });

  it("--type project --archive: the namesake pair appears once per tree", async () => {
    const root = await atlasPair();
    const r = await drive(root, ["search", "--type", "project", "--archive", "--json"]);
    expect(r.json.ok).toBe(true);
    const atlas = (r.json.data.results as any[]).filter((h) => h.path === "projects/atlas.md");
    expect(atlas.map((h) => h.archived).sort()).toEqual([false, true]);
  });

  it("--mark tentative --archive finds the archived fact; without --archive none is archived", async () => {
    const root = await atlasPair();
    const withArch = await drive(root, ["search", "--mark", "tentative", "--archive", "--json"]);
    expect(withArch.json.ok).toBe(true);
    const hit = (withArch.json.data.results as any[]).find((h) => String(h.snippet).startsWith("2026-09-01 · tentative · Atlas launch window"));
    expect(hit).toBeDefined();
    expect(hit.archived).toBe(true);
    expect(hit.file).toBe(".wiki/archive/projects/atlas.md");
    const without = await drive(root, ["search", "--mark", "tentative", "--json"]);
    expect(without.json.ok).toBe(true);
    for (const h of without.json.data.results as any[]) expect(h.archived).not.toBe(true);
    expect((without.json.data.results as any[]).some((h) => String(h.snippet).includes("launch window"))).toBe(false);
  });

  it("page_tokens of an archived hit is the archive page's, not its namesake's", async () => {
    const root = await atlasPair();
    await put(root, ".wiki/archive/projects/atlas.md", ARCH_ATLAS + "\n" + "Archived padding words about the programme. ".repeat(80) + "\n");
    const r = await drive(root, ["search", "--type", "project", "--archive", "--json"]);
    const atlas = (r.json.data.results as any[]).filter((h) => h.path === "projects/atlas.md");
    const live = atlas.find((h) => !h.archived);
    const arch = atlas.find((h) => h.archived);
    expect(arch.page_tokens).toBeGreaterThan(live.page_tokens);
  });
});

describe("Scenario Outline: History searches always include archived facts, marked (red)", () => {
  it("--entity atlas: live fact then archived fact", async () => {
    const root = await historyWiki();
    const r = await drive(root, ["search", "--entity", "atlas", "--json"]);
    expect(r.json.ok).toBe(true);
    const e = r.json.data.entity;
    expect(e.archived).toBe(false);
    expect(e.file).toBe(".wiki/pages/projects/atlas.md");
    expect((e.facts as any[]).map((f) => [f.date, f.archived])).toEqual([["2026-10-10", false], ["2026-09-01", true]]);
    const h = await drive(root, ["search", "--entity", "atlas"]);
    expect(h.out).toContain("(archived)");
  });

  it("--entity beta: archive-only match with backlinks from pages/", async () => {
    const root = await historyWiki();
    const r = await drive(root, ["search", "--entity", "beta", "--json"]);
    expect(r.json.ok).toBe(true);
    const e = r.json.data.entity;
    expect(e).not.toBeNull();
    expect(e.archived).toBe(true);
    expect(e.file).toBe(".wiki/archive/projects/beta.md");
    expect((e.facts as any[]).length).toBe(2);
    for (const f of e.facts as any[]) expect(f.archived).toBe(true);
    expect((e.backlinks as any[]).map((b) => b.path)).toContain("team.md");
    const h = await drive(root, ["search", "--entity", "beta"]);
    expect(h.out).toContain(" · archived");
  });

  it("--entity atlas --since 2026-09-01: both atlas facts, the old one archived", async () => {
    const root = await historyWiki();
    const r = await drive(root, ["search", "--entity", "atlas", "--since", "2026-09-01", "--json"]);
    expect(r.json.ok).toBe(true);
    const facts = r.json.data.changes.facts as any[];
    expect(facts.map((f) => [f.date, f.archived]).sort()).toEqual([["2026-09-01", true], ["2026-10-10", false]]);
  });

  for (const extra of [[], ["--archive"]]) {
    it(`--since 2026-09-01 ${extra.join(" ")}: four facts, archived marked, human line`.trim(), async () => {
      const root = await historyWiki();
      const r = await drive(root, ["search", "--since", "2026-09-01", ...extra, "--json"]);
      expect(r.json.ok).toBe(true);
      const facts = r.json.data.changes.facts as any[];
      expect(facts.map((f) => [f.date, f.archived])).toEqual([
        ["2026-10-12", false], ["2026-10-10", false], ["2026-09-02", true], ["2026-09-01", true],
      ]);
      const h = await drive(root, ["search", "--since", "2026-09-01", ...extra]);
      expect(h.out).toContain("- 2026-09-01 · tentative · Atlas launch window mid-October (projects/atlas.md › Facts, archived)");
    });
  }
});

describe("Scenario Outline: The search cache covers the archive (red)", () => {
  const req = (query: string, archive: boolean) => ({
    query, limit: 10, filters: { ...EMPTY_FILTERS, where: [] }, entity: null, misses: false, ...(archive ? { archive: true } : {}),
  }) as never;
  async function warm(): Promise<{ root: string; count: () => number; deps: SearchDeps & { onRebuild: () => void } }> {
    const root = await atlasPair();
    let n = 0;
    const deps: SearchDeps & { onRebuild: () => void } = { onRebuild: () => { n++; } };
    await executeSearch(root, req("atlas", false), deps);
    n = 0;
    return { root, count: () => n, deps };
  }

  it("nothing changes: no rebuild; only search.json with version 1 and archive_files", async () => {
    const { root, count, deps } = await warm();
    const res = await executeSearch(root, req("atlas", false), deps);
    expect(res.total).toBeGreaterThan(0);
    expect(count()).toBe(0);
    expect(await readdir(path.join(root, ".wiki", ".cache"))).toEqual(["search.json"]);
    const cache = JSON.parse(await readText(root, CACHE));
    expect(cache.version).toBe(1);
    expect((cache.archive_files as any[]).map((f) => f.path)).toEqual(["projects/atlas.md"]);
    expect((cache.files as any[]).every((f) => !String(f.path).startsWith("archive"))).toBe(true);
  });

  it("a line added to the archive page rebuilds once and is found with --archive", async () => {
    const { root, count, deps } = await warm();
    await put(root, ".wiki/archive/projects/atlas.md", ARCH_ATLAS + "\nOrbital insertion slipped.\n");
    const res: any = await executeSearch(root, req("orbital", true), deps);
    expect(count()).toBe(1);
    expect(res.results.some((h: any) => h.file === ".wiki/archive/projects/atlas.md" && h.archived === true)).toBe(true);
  });

  it("deleting the archive page rebuilds once; --archive launch window finds nothing", async () => {
    const { root, count, deps } = await warm();
    await rm(path.join(root, ".wiki", "archive", "projects", "atlas.md"));
    const res: any = await executeSearch(root, req("launch window", true), deps);
    expect(count()).toBe(1);
    expect(res.total).toBe(0);
  });

  it("a second archive page rebuilds once; results equal the cache-off run", async () => {
    const { root, count, deps } = await warm();
    await put(root, ".wiki/archive/notes/old.md", "---\ntype: note\ntitle: Old\n---\nAtlas notes.\n");
    const res = await executeSearch(root, req("atlas", false), deps);
    expect(count()).toBe(1);
    const cold = await executeSearch(root, req("atlas", false), { useCache: false });
    expect(JSON.stringify(res)).toBe(JSON.stringify(cold));
    const cache = JSON.parse(await readText(root, CACHE));
    expect((cache.archive_files as any[]).length).toBe(2);
  });
});

describe("Scenario: Error — --archive with --misses, or alone, is a usage error (red)", () => {
  it("--misses --archive exits 2 naming --archive", async () => {
    const root = await atlasPair();
    const r = await drive(root, ["search", "--misses", "--archive", "--json"]);
    expect(r.code).toBe(2);
    expect(r.json.command).toBe("search");
    expect(r.json.error.code).toBe("usage");
    expect(r.json.error.message).toContain("--archive");
  });

  it("--archive alone exits 2: give a query or a filter", async () => {
    const root = await atlasPair();
    const r = await drive(root, ["search", "--archive", "--json"]);
    expect(r.code).toBe(2);
    expect(r.json.command).toBe("search");
    expect(r.json.error.code).toBe("usage");
    expect(r.json.error.message).toContain("give a query or a filter");
  });

  it("search --help lists --archive", async () => {
    const root = await atlasPair();
    const r = await drive(root, ["search", "--help"]);
    expect(r.out + r.err).toContain("--archive");
  });
});
