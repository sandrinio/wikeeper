import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { resolvePaths } from "../../src/core/paths.js";
import { writeLogEvent } from "../../src/ingest/log.js";
import { runCli } from "../../src/program.js";
import { agentsIntegration } from "../../src/agents/index.js";
import { parseSince } from "../../src/search/since.js";

// STORY-004-04 (red): search --entity (alias resolution, backlinks) and --since.
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
async function emptyRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-entity-"));
  cleanup.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  await put(root, ".wiki/config.yml", "agents: [claude]\n");
  return root;
}

const TEAM = [
  "# Team",
  "",
  "## Product Lead",
  "type:: person",
  "aliases:: PL, Product L.",
  "Lead engineer. See [[PL]]. The launch needs her.",
  "",
].join("\n");

async function aliasFixture(): Promise<string> {
  const root = await emptyRoot();
  await put(root, ".wiki/pages/team.md", TEAM);
  await put(root, ".wiki/pages/projects/atlas.md", ["---", "title: Atlas", "---", "owner:: [[Product Lead]]", ""].join("\n"));
  await put(root, ".wiki/pages/risks.md", ["# Risks", "", "## Vendor delay", "type:: risk", "owner:: [[PL]]", ""].join("\n"));
  return root;
}

async function logIngest(root: string, id: string, at: string, updated: string[]): Promise<void> {
  await writeLogEvent(resolvePaths(root, DEFAULT_CONFIG), {
    type: "ingest",
    at,
    source_id: id,
    kind: "status-report",
    rule_version: null,
    permission: "ai",
    origin: "x.md",
    created: [],
    updated,
    deleted: [],
    contradictions: 0,
    rule_suggestions: 0,
  } as never);
}

async function sinceFixture(): Promise<string> {
  const root = await emptyRoot();
  await put(root, ".wiki/pages/projects/atlas.md", [
    "---",
    "title: Atlas",
    "---",
    "# Atlas",
    "",
    "## Timeline",
    "- 2026-10-10 · decided · Kickoff held [[src-2026-10-09-team]]",
    "- 2026-10-15 · tentative · The launch moved to Nov 17 [[src-2026-10-12-sync]]",
    "",
  ].join("\n"));
  await put(root, ".wiki/pages/team.md", TEAM);
  await logIngest(root, "src-2026-10-09-team", "2026-10-09T09:00:00Z", ["team.md"]);
  await logIngest(root, "src-2026-10-12-sync", "2026-10-12T09:00:00Z", ["projects/atlas.md"]);
  return root;
}

describe("Scenario: Alias resolves to the entity (red)", () => {
  it("resolves PL to Product Lead with backlinks from atlas and risks only", async () => {
    const root = await aliasFixture();
    const r = await drive(root, ["search", "--entity", "PL", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.mode).toBe("entity");
    expect(r.json.data.entity_query).toBe("PL");
    expect(r.json.data.results).toEqual([]);
    expect(r.json.data.total).toBe(1);
    const e = r.json.data.entity;
    expect(e.name).toBe("Product Lead");
    expect(e.matched).toBe("alias");
    expect(e.matched_alias).toBe("PL");
    expect(e.aliases).toEqual(["PL", "Product L."]);
    const links = e.backlinks as any[];
    expect(links.map((b) => b.path)).toEqual(["projects/atlas.md", "risks.md"]);
    for (const b of links) {
      expect(typeof b.section).toBe("string");
      expect(b.line).toBeGreaterThan(0);
      expect(b.context.length).toBeGreaterThan(0);
    }
    expect(links.some((b) => b.path === "team.md")).toBe(false);
  });
});

describe("Scenario Outline: Resolution prefers names over aliases and pages over sections (red)", () => {
  async function fx(): Promise<string> {
    const root = await emptyRoot();
    await put(root, ".wiki/pages/projects/atlas.md", ["---", "title: Atlas", "---", "# Atlas", "", "Body.", ""].join("\n"));
    await put(root, ".wiki/pages/glossary.md", ["# Glossary", "", "## ATL", "type:: term", "aliases:: Atlas", "Short for Atlas.", ""].join("\n"));
    return root;
  }
  const rows: Array<[string, string | null, string[], number]> = [
    ["atlas", "Atlas", ["ATL"], 1],
    ["ATL", "ATL", [], 1],
    ["Nobody", null, [], 0],
  ];
  for (const [input, name, also, total] of rows) {
    it(`input ${input}`, async () => {
      const root = await fx();
      const r = await drive(root, ["search", "--entity", input, "--json"]);
      expect(r.code).toBe(0);
      expect(r.json.data.total).toBe(total);
      if (name === null) expect(r.json.data.entity).toBeNull();
      else {
        expect(r.json.data.entity.name).toBe(name);
        expect((r.json.data.entity.also_matches as any[]).map((m) => m.name)).toEqual(also);
      }
      const h = await drive(root, ["search", "--entity", input]);
      expect(h.code).toBe(0);
      const first = h.out.split("\n")[0]!;
      if (name === null) expect(first).toBe(`no entity named "${input}"`);
      else expect(first).toContain(name);
    });
  }
});

describe("Scenario: Since lists dated facts and changed pages (red)", () => {
  it("lists the 2026-10-15 fact and the atlas page change", async () => {
    const root = await sinceFixture();
    const r = await drive(root, ["search", "--since", "2026-10-11", "--json"]);
    expect(r.code).toBe(0);
    const d = r.json.data;
    expect(d.mode).toBe("query");
    expect(d.query).toBeNull();
    expect(d.results).toEqual([]);
    expect(d.filters.since).toBe("2026-10-11");
    expect((d.changes.facts as any[]).map((f) => f.date)).toEqual(["2026-10-15"]);
    expect(d.changes.pages).toEqual([
      { path: "projects/atlas.md", change: "updated", source_id: "src-2026-10-12-sync", at: "2026-10-12T09:00:00Z" },
    ]);
    expect(d.total).toBe(2);
  });
  it("--limit caps each changes list but not total", async () => {
    const root = await sinceFixture();
    const r = await drive(root, ["search", "--since", "2026-10-01", "--limit", "1", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.changes.facts).toHaveLength(1);
    expect(r.json.data.changes.pages).toHaveLength(1);
    expect(r.json.data.total).toBe(4);
  });
  it("prints a changes block without --json", async () => {
    const root = await sinceFixture();
    const r = await drive(root, ["search", "--since", "2026-10-11"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("changes since 2026-10-11");
  });
});

describe("Scenario Outline: Since narrows an entity or a query (red)", () => {
  it("--entity Atlas --since keeps only the newer fact", async () => {
    const root = await sinceFixture();
    const r = await drive(root, ["search", "--entity", "Atlas", "--since", "2026-10-11", "--json"]);
    expect(r.code).toBe(0);
    expect((r.json.data.entity.facts as any[]).map((f) => f.date)).toEqual(["2026-10-15"]);
  });
  it("unknown --entity with --since gives empty changes", async () => {
    const root = await sinceFixture();
    const r = await drive(root, ["search", "--entity", "Nobody", "--since", "2026-10-11", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.entity).toBeNull();
    expect(r.json.data.changes.facts).toEqual([]);
    expect(r.json.data.changes.pages).toEqual([]);
  });
  it("launch --since narrows the hits to atlas", async () => {
    const root = await sinceFixture();
    const all = await drive(root, ["search", "launch", "--json"]);
    expect(new Set((all.json.data.results as any[]).map((h) => h.path))).toEqual(new Set(["projects/atlas.md", "team.md"]));
    const r = await drive(root, ["search", "launch", "--since", "2026-10-11", "--json"]);
    expect(r.code).toBe(0);
    expect([...new Set((r.json.data.results as any[]).map((h) => h.path))]).toEqual(["projects/atlas.md"]);
  });
});

describe("Scenario Outline: Error - invalid dates and combinations are rejected (red)", () => {
  const rows: Array<[string[], string, string | null]> = [
    [["--since", "2026-13-01"], "invalid_since", "2026-13-01"],
    [["--since", "yesterday"], "invalid_since", "yesterday"],
    [["atlas", "--entity", "PL"], "usage", null],
    [["--entity", "PL", "--type", "person"], "usage", null],
    [["--entity", ""], "usage", null],
  ];
  for (const [args, code, got] of rows) {
    it(args.join(" "), async () => {
      const root = await aliasFixture();
      const r = await drive(root, ["search", ...args, "--json"]);
      expect(r.code).toBe(2);
      expect(r.json.error.code).toBe(code);
      expect(r.json.command).toBe("search");
      if (got !== null) expect(r.json.error.details).toEqual({ expected: "YYYY-MM-DD", got });
    });
  }
  it("checks the dates before the wiki is read (uninitialised dir still exits 2)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-entity-bare-"));
    cleanup.push(root);
    await mkdir(path.join(root, ".git"), { recursive: true });
    const r = await drive(root, ["search", "--since", "yesterday", "--json"]);
    expect(r.code).toBe(2);
    expect(r.json.error.code).toBe("invalid_since");
  });
});

describe("parseSince (red)", () => {
  it("accepts a bare date", () => {
    expect(parseSince("2026-10-11")).toEqual({ date: "2026-10-11", instant: "2026-10-11T00:00:00.000Z" });
  });
  it("uses the date as written for an offset date-time", () => {
    expect(parseSince("2026-10-11T22:00:00-05:00")).toEqual({ date: "2026-10-11", instant: "2026-10-12T03:00:00.000Z" });
  });
  it("accepts Z and minute-only date-times", () => {
    expect(parseSince("2026-10-11T08:30Z")).toEqual({ date: "2026-10-11", instant: "2026-10-11T08:30:00.000Z" });
  });
  for (const bad of ["2026-02-29", "2026-02-30", "2026-10-11T24:00:00Z", "2026-10-11T10:00:00", "2026-10-11T10:60:00Z", "", "yesterday"]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      let err: any = null;
      try { parseSince(bad); } catch (e) { err = e; }
      expect(err).not.toBeNull();
      expect(err.code).toBe("invalid_since");
      expect(err.details).toEqual({ expected: "YYYY-MM-DD", got: bad });
    });
  }
});
