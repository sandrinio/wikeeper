import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { runCli } from "../../src/program.js";
import { agentsIntegration } from "../../src/agents/index.js";

// STORY-004-02 (red): S1 ranked snippets, S2 tie order, S4 enforce allow rule, S5 invalid invocations.
const IS_WIN = process.platform === "win32";
const SRC = "src-2026-10-16-q4-status";
const cleanup: string[] = [];

beforeEach(() => {
  resetIntegrations();
  registerIntegration({ name: "agents", ...agentsIntegration } as never);
});
afterEach(async () => {
  vi.unstubAllEnvs();
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
async function pathWithWikeeper(): Promise<void> {
  const bin = await tmp("wikeeper-bin-");
  const file = path.join(bin, IS_WIN ? "wikeeper.cmd" : "wikeeper");
  await writeFile(file, IS_WIN ? "@echo off\r\n" : "#!/bin/sh\nexit 0\n");
  if (!IS_WIN) await chmod(file, 0o755);
  if (IS_WIN) vi.stubEnv("PATHEXT", ".CMD");
  vi.stubEnv("PATH", bin);
}
async function drive(root: string, args: string[]) {
  let out = "";
  let err = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(c, _e, cb) { err += String(c); cb(); } });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, out, err, json };
}
/** A fresh repository initialised through the real CLI (fixtures pass --agents claude: plain --yes exits 5). */
async function initialised(): Promise<string> {
  const root = await tmp("wikeeper-search-");
  await mkdir(path.join(root, ".git"), { recursive: true });
  const r = await drive(root, ["init", "--yes", "--agents", "claude", "--json"]);
  expect(r.code).toBe(0);
  return root;
}
const pages = (rel: string) => `.wiki/pages/${rel}`;

describe("Scenario: Full-text search returns ranked snippets (red)", () => {
  async function fixture(): Promise<string> {
    const root = await initialised();
    await put(root, pages("risks.md"), [
      "# Risks",
      "",
      "## Vendor delay",
      `The vendor delay pushes the launch by two weeks. [[${SRC}]]`,
      "",
      "## Budget",
      "Nothing relevant here.",
      "",
    ].join("\n"));
    await put(root, pages("projects/atlas.md"), [
      "---",
      "type: project",
      "title: Atlas",
      "---",
      "# Atlas",
      "",
      "## Timeline",
      "Milestone two slipped because of a vendor delay on the hardware.",
      "",
    ].join("\n"));
    return root;
  }

  it("--json: envelope, sorted hits with the R4 keys, risks hit carries section and sources", async () => {
    const root = await fixture();
    const r = await drive(root, ["search", "vendor delay", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.ok).toBe(true);
    expect(r.json.command).toBe("search");
    expect(r.json.data.mode).toBe("query");
    expect(r.json.data.query).toBe("vendor delay");
    expect(r.json.data.entity_query).toBeNull();
    expect(r.json.data.entity).toBeNull();
    expect(r.json.data.changes).toBeNull();
    expect(r.json.data.misses).toBeNull();
    expect(r.json.data.filters).toEqual({ type: null, where: [], status: null, since: null });
    const results = r.json.data.results as any[];
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(r.json.data.total).toBe(results.length);
    for (const h of results) {
      for (const k of ["path", "file", "title", "entity", "type", "section", "line", "snippet", "score", "sources"]) {
        expect(h, k).toHaveProperty(k);
      }
      expect(typeof h.score).toBe("number");
      expect(Math.round(h.score * 1000) / 1000).toBe(h.score);
      expect(h.file).toBe(`.wiki/pages/${h.path}`);
    }
    for (let i = 1; i < results.length; i++) expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    const risks = results.find((h) => h.path === "risks.md" && h.section === "Vendor delay");
    expect(risks).toBeDefined();
    expect(risks.sources).toEqual([SRC]);
    expect(risks.line).toBe(3);
    expect(results.some((h) => h.path === "projects/atlas.md" && h.section === "Timeline")).toBe(true);
  });

  it("human output: header line, numbered hits with a section, snippet below", async () => {
    const root = await fixture();
    const r = await drive(root, ["search", "vendor", "delay"]);
    expect(r.code).toBe(0);
    const lines = r.out.split("\n");
    expect(lines[0]).toMatch(/^\d+ results? for "vendor delay"$/);
    const i = lines.findIndex((l) => /^\d+\. risks\.md › Vendor delay$/.test(l));
    expect(i).toBeGreaterThan(0);
    expect(lines[i + 1]!.toLowerCase()).toContain("vendor delay");
    expect(lines[i + 1]).toMatch(/^\s+\S/);
    expect(lines.some((l) => /^\s+sources: src-2026-10-16-q4-status$/.test(l))).toBe(true);
  });

  it("a query with no hits prints no results and exits 0", async () => {
    const root = await fixture();
    const r = await drive(root, ["search", "zebra-crossing"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe('no results for "zebra-crossing"');
    const j = await drive(root, ["search", "zebra-crossing", "--json"]);
    expect(j.code).toBe(0);
    expect(j.json.data.total).toBe(0);
    expect(j.json.data.results).toEqual([]);
  });

  it("--limit caps results but total counts every hit; a missing pages/ gives 0 results", async () => {
    const root = await fixture();
    const r = await drive(root, ["search", "vendor delay", "--limit", "1", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.results).toHaveLength(1);
    expect(r.json.data.total).toBeGreaterThanOrEqual(2);
    await rm(path.join(root, ".wiki", "pages"), { recursive: true, force: true });
    const e = await drive(root, ["search", "vendor", "--json"]);
    expect(e.code).toBe(0);
    expect(e.json.data.total).toBe(0);
  });
});

describe("Scenario: Ties are broken by path (red)", () => {
  it("identical sections in b.md and a/z.md: a/z.md first, equal scores, byte-identical output", async () => {
    const root = await initialised();
    const body = "# Review\n\n## Cadence\nThe quarterly review happens every quarter.\n";
    await put(root, pages("b.md"), body);
    await put(root, pages("a/z.md"), body);
    const one = await drive(root, ["search", "quarterly review", "--json"]);
    const two = await drive(root, ["search", "quarterly review", "--json"]);
    expect(one.code).toBe(0);
    const results = one.json.data.results as any[];
    expect(results.map((h) => h.path)).toEqual(["a/z.md", "b.md"]);
    expect(results[0].score).toBe(results[1].score);
    expect(one.out).toBe(two.out);
  });
});

describe("Scenario Outline: Enforce installs the search allow rule (red)", () => {
  const CLAUDE_RULES = ["Bash(npx wikeeper search *)", "Bash(wikeeper search *)"];
  const CODEX_RULES = [
    'prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")',
    'prefix_rule(pattern=["wikeeper","search"], decision="allow")',
  ];
  async function text(root: string, rel: string): Promise<string> {
    try { return await readFile(path.join(root, ...rel.split("/")), "utf8"); } catch { return ""; }
  }
  async function exists(file: string): Promise<boolean> {
    try { await stat(file); return true; } catch { return false; }
  }

  for (const mode of ["ai", "ask", "whitelist"]) {
    it(`${mode}: init --enforce adds the search rules, remove takes them out`, async () => {
      await pathWithWikeeper();
      const root = await tmp("wikeeper-searchrules-");
      await mkdir(path.join(root, ".git"), { recursive: true });
      await put(root, ".wiki/config.yml", `ingest:\n  permission: ${mode}\n`);
      const r = await drive(root, ["init", "--agents", "claude,codex", "--enforce", "--json"]);
      expect(r.code).toBe(0);
      const settings = JSON.parse(await text(root, ".claude/settings.json"));
      for (const rule of CLAUDE_RULES) expect(settings.permissions.allow).toContain(rule);
      const rules = await text(root, ".codex/rules/wikeeper.rules");
      for (const line of CODEX_RULES) expect(rules).toContain(line);

      const rm1 = await drive(root, ["remove", "--json"]);
      expect(rm1.code).toBe(0);
      expect(await text(root, ".claude/settings.json")).not.toContain("wikeeper search");
      expect(await text(root, ".codex/rules/wikeeper.rules")).not.toContain('"search"');
      expect(await exists(path.join(root, ".codex", "rules", "wikeeper.rules")) ? await text(root, ".codex/rules/wikeeper.rules") : "").not.toContain("search");
    });
  }
});

describe("Scenario Outline: Error - invalid invocations are rejected (red)", () => {
  it("search with no query and no filter: exit 2 usage", async () => {
    const root = await initialised();
    const r = await drive(root, ["search", "--json"]);
    expect(r.code).toBe(2);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.code).toBe("usage");
    expect(r.json.error.message).toContain("give a query or a filter");
  });

  it("search atlas --limit 0: exit 2 usage", async () => {
    const root = await initialised();
    for (const bad of ["0", "101", "x", "1.5"]) {
      const r = await drive(root, ["search", "atlas", "--limit", bad, "--json"]);
      expect(r.code, bad).toBe(2);
      expect(r.json.error.code, bad).toBe("usage");
    }
  });

  it("a repository without .wiki: exit 1 not_initialised", async () => {
    const root = await tmp("wikeeper-nowiki-");
    await mkdir(path.join(root, ".git"), { recursive: true });
    const r = await drive(root, ["search", "atlas", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("not_initialised");
  });
});
