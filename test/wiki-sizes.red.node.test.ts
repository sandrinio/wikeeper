import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { setConfigValue } from "../src/core/config.js";
import { estimateTokens, formatTokens, levelMark, levelOf } from "../src/core/tokens.js";
import { writeFacts } from "../src/ingest/facts.js";
import { setLintHook } from "../src/ingest/lint-hook.js";
import { writeLogEvent } from "../src/ingest/log.js";
import { registerSource } from "../src/ingest/registry.js";
import { hashTree } from "../src/ingest/snapshot.js";
import { resolvePaths } from "../src/core/paths.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { runCli } from "../src/program.js";

// STORY-007-05 (red): wiki and page sizes in status, the finish report, search hits and lint.
const T = 60_000;
const ID = "src-2026-10-18-notes";
const NOW = new Date("2026-10-18T10:00:00Z");
const DEFAULT_LIMITS = {
  page: { yellow: 4000, red: 10000 },
  source: { yellow: 20000, red: 60000, confirm_at: "yellow" },
};
const WIKI_MD = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates", "system", "WIKI.md");

const tmpDirs: string[] = [];
afterEach(async () => {
  setLintHook(null);
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function tmpRoot(prefix = "wk-sizes-"): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  return root;
}
async function run(root: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const input = Object.assign(Readable.from([]), { isTTY: false });
  const code = await runCli(args, {
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: input,
    },
  } as never);
  const text = out.join("");
  let json: any = null;
  try {
    json = JSON.parse(text.trim().split("\n")[0]!);
  } catch {
    /* human output */
  }
  return { code, json, text, err: err.join("") };
}
async function initialised(): Promise<string> {
  const root = await tmpRoot();
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  return root;
}
async function put(root: string, rel: string, content: string): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
/** A config-only wiki (no init), like the filters fixtures. */
async function bareWiki(configYml = "agents: [claude]\n"): Promise<string> {
  const root = await tmpRoot();
  await put(root, ".wiki/config.yml", configYml);
  await mkdir(path.join(root, ".wiki", "pages"), { recursive: true });
  return root;
}

/** Text that starts with `head` and has exactly `target` estimated tokens (plain words, then single letters). */
function sized(head: string, target: number): string {
  let lo = 0;
  let hi = Math.ceil(target / 1.5) + 10;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(head + "word ".repeat(mid)) <= target) lo = mid;
    else hi = mid - 1;
  }
  let text = head + "word ".repeat(lo);
  for (let i = 0; i < 80 && estimateTokens(text) < target; i++) text += "a";
  expect(estimateTokens(text)).toBe(target);
  return text;
}
function approx(head: string, target: number): string {
  let text = head;
  const unit = "word ";
  const n = Math.max(0, Math.floor((target - estimateTokens(head)) / 2.2));
  text += unit.repeat(n);
  return text;
}
async function listPages(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(path.join(dir, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listPages(dir, r)));
    else if (e.name.endsWith(".md")) out.push(r);
  }
  return out.sort();
}
async function measure(pagesDir: string): Promise<{ total: number; pages: Record<string, number> }> {
  const pages: Record<string, number> = {};
  let total = 0;
  for (const rel of await listPages(pagesDir)) {
    const n = estimateTokens(await readFile(path.join(pagesDir, ...rel.split("/")), "utf8"));
    pages[rel] = n;
    total += n;
  }
  return { total, pages };
}

// ---------------------------------------------------------------------------------------------
describe("Scenario: Status shows the wiki's size and writes nothing", () => {
  async function sixPages(): Promise<{ root: string; sizes: Record<string, number>; indexTokens: number }> {
    const root = await initialised();
    const pages: Record<string, string> = {
      "a.md": approx("# A\n\n", 12000),
      "b.md": approx("# B\n\n", 5000),
      "c.md": approx("# C\n\n", 3000),
      "d.md": approx("# D\n\n", 2500),
      "e.md": approx("# E\n\n", 2000),
      "f.md": approx("# F\n\n", 1000),
    };
    const sizes: Record<string, number> = {};
    for (const [rel, body] of Object.entries(pages)) {
      await put(root, `.wiki/pages/${rel}`, body);
      sizes[rel] = estimateTokens(body);
    }
    const index = "# Index\n\n" + Object.keys(pages).map((p) => `- pages/${p}\n`).join("");
    await put(root, ".wiki/index.md", index);
    return { root, sizes, indexTokens: estimateTokens(index) };
  }

  it("--json: tokens section from the six page files", async () => {
    const { root, sizes, indexTokens } = await sixPages();
    const r = await run(root, ["status", "--json"]);
    expect(r.code).toBe(0);
    const t = r.json.data.tokens;
    expect(t.wiki).toBe(Object.values(sizes).reduce((a, b) => a + b, 0));
    expect(t.page_count).toBe(6);
    expect(t.index).toBe(indexTokens);
    expect(t.limits).toEqual(DEFAULT_LIMITS);
    expect(t.largest).toHaveLength(5);
    const sorted = Object.entries(sizes).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 5);
    expect(t.largest.map((e: any) => e.path)).toEqual(sorted.map(([p]) => p));
    expect(t.largest.map((e: any) => e.tokens)).toEqual(sorted.map(([, n]) => n));
    expect(t.largest[0]).toEqual({ path: "a.md", tokens: sizes["a.md"], level: "red" });
    expect(t.largest[1]).toEqual({ path: "b.md", tokens: sizes["b.md"], level: "yellow" });
    expect(t.largest[0].level).toBe(levelOf(sizes["a.md"]!, DEFAULT_LIMITS.page));
  }, T);

  it("human output: tokens line, limits line and largest pages", async () => {
    const { root, sizes, indexTokens } = await sixPages();
    const r = await run(root, ["status"]);
    expect(r.code).toBe(0);
    const total = Object.values(sizes).reduce((a, b) => a + b, 0);
    const lines = r.text.split("\n");
    const tokensLine = lines.find((l) => l.startsWith("tokens: wiki ≈"));
    expect(tokensLine).toBe(`tokens: wiki ${formatTokens(total)} · 6 pages · index.md ${formatTokens(indexTokens)}`);
    expect(lines.map((l) => l.trim())).toContain("limits: page 4k/10k · source 20k/60k, approval at yellow");
    expect(lines).toContain("  largest pages:");
    const big = lines.find((l) => l.trim().startsWith("a.md ≈"));
    expect(big).toBeDefined();
    expect(big!.endsWith(" 🔴")).toBe(true);
    expect(big!.trim()).toBe(`a.md ${formatTokens(sizes["a.md"]!)} ${levelMark("red")}`);
  }, T);

  it("status writes nothing", async () => {
    const { root } = await sixPages();
    const before = await hashTree(root);
    expect((await run(root, ["status", "--json"])).code).toBe(0);
    expect((await run(root, ["status"])).code).toBe(0);
    expect(await hashTree(root)).toEqual(before);
  }, T);

  it("WIKI.md 'Lint and status' names the tokens key and the oversized-page check", async () => {
    const text = await readFile(WIKI_MD, "utf8");
    const start = text.indexOf("\n## Lint and status");
    expect(start).toBeGreaterThan(-1);
    const rest = text.slice(start + 1);
    const end = rest.indexOf("\n## ", 5);
    const section = end === -1 ? rest : rest.slice(0, end);
    const lines = section.split("\n");
    expect(lines.some((l) => l.startsWith("- `tokens`: "))).toBe(true);
    expect(lines.some((l) => l.startsWith("| `oversized-page` |"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe("Scenario Outline: The finish report shows the wiki total, its change and the largest page", () => {
  const SOURCE_PAGE = `---\ntype: source\ntitle: Notes\nsources: [${ID}]\n---\n# Notes\n`;
  const small = (title: string) => `---\ntype: project\ntitle: ${title}\nsummary: ${title}\n---\n# ${title}\n`;
  const ATLAS_BIG = () =>
    approx(`---\ntype: project\ntitle: Atlas\nsummary: Atlas project\n---\n# Atlas\n\nCited. [[${ID}]]\n\n`, 12000);
  const OLD = "# Old\n\nSome plain prose without any fact lines.\n";
  const TEAM = () => approx("---\ntype: team\ntitle: Team\nsummary: Team\n---\n# Team\n\n", 5000);

  interface Setup {
    root: string;
    pagesDir: string;
    t0: number;
  }
  async function applied(): Promise<Setup> {
    const root = await initialised();
    await setConfigValue(root, "ingest.permission", "ai");
    const paths = resolvePaths(root, DEFAULT_CONFIG);
    await put(root, ".wiki/pages/atlas.md", small("Atlas"));
    await put(root, ".wiki/pages/team.md", TEAM());
    await put(root, ".wiki/pages/old.md", OLD);
    await put(root, `.wiki/pages/sources/${ID}.md`, SOURCE_PAGE);
    await put(root, "docs/notes.md", "content of notes\n");
    const meta = await registerSource(paths, {
      originType: "file",
      origin: "docs/notes.md",
      label: "notes",
      originalPath: path.join(root, "docs", "notes.md"),
      text: null,
      kind: "status-report",
      providedBy: "user",
      ruleVersion: null,
      reingestOf: null,
      permission: { mode: "ai", approved: false, matched: null, kind_pending: false },
      now: NOW,
    } as never);
    expect(meta.id).toBe(ID);
    await writeFacts(paths, {
      source_id: ID,
      kind: "status-report",
      rule_version: 2,
      facts: [
        {
          entity: "project:atlas",
          field: "status",
          value: "green",
          status: "decided",
          as_of: "2026-10-18",
          anchor: "Status",
          page: "atlas.md",
          exists: true,
        },
      ],
      uncovered: [],
    } as never);
    expect((await run(root, ["ingest", "apply", ID, "--json"])).code).toBe(0);
    const pagesDir = path.join(root, ".wiki", "pages");
    return { root, pagesDir, t0: (await measure(pagesDir)).total };
  }

  type Row = "creates" | "deletes" | "rerun";
  async function scenario(row: Row, json: boolean) {
    const s = await applied();
    let bigTokens = 0;
    let oldTokens = 0;
    if (row === "deletes") {
      oldTokens = estimateTokens(OLD);
      await rm(path.join(s.pagesDir, "old.md"));
    } else {
      const body = ATLAS_BIG();
      bigTokens = estimateTokens(body);
      await put(s.root, ".wiki/pages/atlas.md", body);
    }
    if (row === "rerun") {
      const paths = resolvePaths(s.root, DEFAULT_CONFIG);
      await writeLogEvent(paths, {
        type: "ingest",
        at: "2026-10-18T11:00:00.000Z",
        source_id: ID,
        kind: "status-report",
        rule_version: 2,
        permission: "ai",
        origin: "docs/notes.md",
        created: [],
        updated: ["atlas.md"],
        deleted: [],
        contradictions: 0,
        rule_suggestions: 0,
      } as never);
      await rm(path.join(s.root, ".wiki", ".snapshots", ID), { recursive: true, force: true });
    }
    const res = await run(s.root, ["ingest", "finish", ID, ...(json ? ["--json"] : [])]);
    const after = await measure(s.pagesDir);
    return { ...s, res, after, bigTokens, oldTokens };
  }
  const withoutApprox = (n: number) => formatTokens(Math.abs(n)).slice(1);

  it("row 1: a 12k page created, once", async () => {
    const j = await scenario("creates", true);
    expect(j.res.code).toBe(0);
    const t = j.res.json.data.tokens;
    expect(t.wiki).toBe(j.after.total);
    expect(t.change).toBe(j.after.total - j.t0);
    expect(t.change).toBeGreaterThan(0);
    expect(t.largest).toEqual({ path: "atlas.md", level: "red", tokens: j.bigTokens });
    expect(j.res.json.warnings as string[]).toContain(
      `lint [warn] oversized-page .wiki/pages/atlas.md: page is ${formatTokens(j.bigTokens)} tokens (tokens.page.red is 10k)`,
    );
    const h = await scenario("creates", false);
    expect(h.res.code).toBe(0);
    const wikiLines = h.res.text.split("\n").filter((l) => l.trim().startsWith("wiki ≈"));
    expect(wikiLines).toHaveLength(1);
    expect(wikiLines[0]!.trim()).toBe(
      `wiki ${formatTokens(h.after.total)} tokens (+${withoutApprox(h.after.total - h.t0)}) · largest page atlas.md ${formatTokens(h.bigTokens)} 🔴`,
    );
  }, T);

  it("row 2: a page with no fact lines deleted, once", async () => {
    const j = await scenario("deletes", true);
    expect(j.res.code).toBe(0);
    const t = j.res.json.data.tokens;
    expect(t.wiki).toBe(j.after.total);
    expect(t.change).toBe(-j.oldTokens);
    const [bigPath, bigN] = Object.entries(j.after.pages).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0]!;
    expect(t.largest).toEqual({ path: bigPath, tokens: bigN, level: levelOf(bigN, DEFAULT_LIMITS.page) });
    const warns = (j.res.json.warnings ?? []) as string[];
    expect(warns.filter((w) => w.startsWith("lint [warn] oversized-page"))).toEqual([]);
    const h = await scenario("deletes", false);
    expect(h.res.code).toBe(0);
    const wikiLines = h.res.text.split("\n").filter((l) => l.trim().startsWith("wiki ≈"));
    expect(wikiLines).toHaveLength(1);
    expect(wikiLines[0]!.trim()).toBe(
      `wiki ${formatTokens(h.after.total)} tokens (-${withoutApprox(h.oldTokens)}) · largest page ${bigPath} ${formatTokens(bigN)} ${levelMark(levelOf(bigN, DEFAULT_LIMITS.page))}`,
    );
  }, T);

  it("row 3: rerun after the event was written and the snapshot removed", async () => {
    const j = await scenario("rerun", true);
    expect(j.res.code).toBe(0);
    const t = j.res.json.data.tokens;
    expect(t.wiki).toBe(j.after.total);
    expect(t.change).toBeNull();
    expect(t.largest).toEqual({ path: "atlas.md", level: "red", tokens: j.bigTokens });
    expect((j.res.json.warnings as string[]).join("\n")).toContain("already recorded");
    const h = await scenario("rerun", false);
    expect(h.res.code).toBe(0);
    const wikiLines = h.res.text.split("\n").filter((l) => l.trim().startsWith("wiki ≈"));
    expect(wikiLines).toHaveLength(1);
    expect(wikiLines[0]!.trim()).toBe(
      `wiki ${formatTokens(h.after.total)} tokens · largest page atlas.md ${formatTokens(h.bigTokens)} 🔴`,
    );
  }, T);
});

// ---------------------------------------------------------------------------------------------
describe("Scenario: Search hits carry the size of their page, with or without the cache", () => {
  const ATLAS = [
    "---",
    "type: project",
    "title: Atlas",
    "---",
    "# Atlas",
    "",
    "## Risks",
    "The vendor delay pushes the launch by two weeks.",
    "",
    "## Status",
    "- 2026-10-15 · tentative · Launch targets 2026-11-17. [[src-2026-10-16-q4]]",
    "",
  ].join("\n");
  const BETA = ["---", "type: person", "title: Beta", "---", "# Beta", "", "The product lead."].join("\n");
  const BOM_PAGE = "﻿" + ["---", "type: project", "title: Bom", "---", "# Bom", "", "vendor delay with a byte order mark."].join("\n");

  it("page_tokens equals the page's estimate, cold or warm, and the cache stores none", async () => {
    const root = await initialised();
    await put(root, ".wiki/pages/projects/atlas.md", ATLAS);
    await put(root, ".wiki/pages/people/beta.md", BETA);
    await put(root, ".wiki/pages/projects/bom.md", BOM_PAGE);
    const searches = [
      ["search", "vendor delay", "--json"],
      ["search", "--type", "project", "--json"],
      ["search", "--mark", "tentative", "--json"],
    ];
    await rm(path.join(root, ".wiki", ".cache"), { recursive: true, force: true });
    const cold: any[][] = [];
    for (const args of searches) {
      const r = await run(root, args);
      expect(r.code).toBe(0);
      expect(r.json.data.results.length).toBeGreaterThan(0);
      cold.push(r.json.data.results);
    }
    const warm: any[][] = [];
    for (const args of searches) {
      const r = await run(root, args);
      expect(r.code).toBe(0);
      warm.push(r.json.data.results);
    }
    const pagesDir = path.join(root, ".wiki", "pages");
    const measured = (await measure(pagesDir)).pages;
    for (const results of [...cold, ...warm]) {
      for (const hit of results) {
        const expected = estimateTokens(await readFile(path.join(pagesDir, ...hit.path.split("/")), "utf8"));
        expect(hit.page_tokens, hit.path).toBe(expected);
        expect(hit.page_tokens, hit.path).toBe(measured[hit.path]);
      }
    }
    expect(warm).toEqual(cold);
    const cacheText = await readFile(path.join(root, ".wiki", ".cache", "search.json"), "utf8");
    expect(JSON.parse(cacheText).version).toBe(1);
    expect(cacheText).not.toContain("page_tokens");
    const human = await run(root, ["search", "vendor", "delay"]);
    expect(human.code).toBe(0);
    expect(human.text).not.toContain("≈");
  }, T);
});

// ---------------------------------------------------------------------------------------------
describe("Scenario Outline: oversized-page warns at and above the red limit", () => {
  const CUSTOM = "agents: [claude]\ntokens:\n  page:\n    yellow: 1000\n    red: 2000\n";
  const rows = [
    { name: "about 12k", config: "agents: [claude]\n", size: 12000, finding: true, red: "10k" },
    { name: "exactly 10000", config: "agents: [claude]\n", size: 10000, finding: true, red: "10k" },
    { name: "9999", config: "agents: [claude]\n", size: 9999, finding: false, red: "10k" },
    { name: "custom limits, about 2.5k", config: CUSTOM, size: 2500, finding: true, red: "2k" },
  ];
  for (const row of rows) {
    it(`page of ${row.name}`, async () => {
      const root = await bareWiki(row.config);
      const body = sized("# Big\n\n", row.size);
      await put(root, ".wiki/pages/big.md", body);
      const r = await run(root, ["lint", "--check", "oversized-page", "--json"]);
      expect(r.json.ok).toBe(true);
      expect(r.code).toBe(0);
      const expected = row.finding
        ? [
            {
              id: "oversized-page",
              severity: "warning",
              path: ".wiki/pages/big.md",
              message: `page is ${formatTokens(row.size)} tokens (tokens.page.red is ${row.red})`,
            },
          ]
        : [];
      const findings = (r.json.data.findings as any[]).map(({ id, severity, path: p, message }) => ({ id, severity, path: p, message }));
      expect(findings).toEqual(expected);
    }, T);
  }
});

// ---------------------------------------------------------------------------------------------
describe("Scenario Outline: Edge - an empty wiki and a page under a dot-segment folder", () => {
  it("no pages and no index.md: status", async () => {
    const root = await initialised();
    await rm(path.join(root, ".wiki", "index.md"), { force: true });
    await rm(path.join(root, ".wiki", "pages"), { recursive: true, force: true });
    await mkdir(path.join(root, ".wiki", "pages"), { recursive: true });
    const j = await run(root, ["status", "--json"]);
    expect(j.code).toBe(0);
    expect(j.json.data.tokens).toEqual({ wiki: 0, page_count: 0, index: 0, limits: DEFAULT_LIMITS, largest: [] });
    const h = await run(root, ["status"]);
    expect(h.code).toBe(0);
    const lines = h.text.split("\n");
    expect(lines).toContain("tokens: wiki ≈0 · 0 pages · index.md ≈0");
    expect(h.text).not.toContain("largest pages:");
  }, T);

  it("only pages/.drafts/huge.md: status counts nothing", async () => {
    const root = await initialised();
    await rm(path.join(root, ".wiki", "pages"), { recursive: true, force: true });
    await put(root, ".wiki/pages/.drafts/huge.md", approx("# Huge\n\n", 12000));
    const j = await run(root, ["status", "--json"]);
    expect(j.code).toBe(0);
    expect(j.json.data.tokens.page_count).toBe(0);
    expect(j.json.data.tokens.largest).toEqual([]);
  }, T);

  it("only pages/.drafts/huge.md: lint finds nothing", async () => {
    const root = await bareWiki();
    await put(root, ".wiki/pages/.drafts/huge.md", approx("# Huge\n\n", 12000));
    const r = await run(root, ["lint", "--check", "oversized-page", "--json"]);
    expect(r.json.ok).toBe(true);
    expect(r.code).toBe(0);
    expect(r.json.data.findings).toEqual([]);
  }, T);
});
