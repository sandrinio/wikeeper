import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentsIntegration } from "../../src/agents/index.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { resolvePaths } from "../../src/core/paths.js";
import { writeLogEvent } from "../../src/ingest/log.js";
import { runCli } from "../../src/program.js";

// STORY-004-07 (red): --no-miss, misses count, miss label, limit note, --mark.
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
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-followups-"));
  cleanup.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  await put(root, ".wiki/config.yml", "agents: [claude]\n");
  return root;
}
async function logFiles(root: string): Promise<string[]> {
  try {
    return (await readdir(path.join(root, ".wiki", "log"))).sort();
  } catch {
    return [];
  }
}
async function logBodies(root: string, files: string[]): Promise<string[]> {
  return Promise.all(files.map((f) => readFile(path.join(root, ".wiki", "log", f), "utf8")));
}
async function logIngest(root: string, id: string, at: string, updated: string[]): Promise<void> {
  await writeLogEvent(resolvePaths(root, DEFAULT_CONFIG), {
    type: "ingest", at, source_id: id, kind: "status-report", rule_version: null, permission: "ai",
    origin: "x.md", created: [], updated, deleted: [], contradictions: 0, rule_suggestions: 0,
  } as never);
}
async function missEvent(root: string, query: string, at: string, filters: Record<string, string | string[]> = {}): Promise<void> {
  await writeLogEvent(resolvePaths(root, DEFAULT_CONFIG), { type: "miss", at, query, filters } as never);
}

// ---- Scenario Outline: miss label / --no-miss ----
async function labelRoot(): Promise<string> {
  const root = await emptyRoot();
  await put(root, ".wiki/pages/projects/atlas.md", [
    "---", "title: Atlas", "type: project", "---", "# Atlas", "", "status:: active",
    "- 2026-10-15 · tentative · Launch targets 2026-11-17. [[src-2026-10-16-q4]]", "",
  ].join("\n"));
  return root;
}
const HINT = (v: string) => `fact marks are filtered with --mark: wikeeper search --mark ${v}`;
const LABEL_ROWS: Array<{ args: string[]; body: string | null; view: string | null; warn: string | null }> = [
  { args: ["budget burn"], body: 'No results for "budget burn".', view: '· miss · "budget burn"', warn: null },
  { args: ["budget burn", "--type", "project"], body: 'No results for "budget burn" --type project.', view: '· miss · "budget burn" --type project', warn: null },
  { args: ["--status", "tentative"], body: "No results for --status tentative.", view: "· miss · --status tentative", warn: HINT("tentative") },
  { args: ["--status", "closed"], body: "No results for --status closed.", view: "· miss · --status closed", warn: null },
  { args: ["--type", "project", "--mark", "decided"], body: "No results for --type project --mark decided.", view: "· miss · --type project --mark decided", warn: null },
  { args: ["--entity", "Nobody"], body: "No results for --entity Nobody.", view: "· miss · --entity Nobody", warn: null },
  { args: ["budget burn", "--no-miss"], body: null, view: null, warn: null },
];

describe("Scenario Outline: A search that finds nothing records a miss that names what was asked (red)", () => {
  for (const row of LABEL_ROWS) {
    it(`search ${row.args.join(" ")}`, async () => {
      const root = await labelRoot();
      const before = await logFiles(root);
      const r = await drive(root, ["search", ...row.args, "--json"]);
      expect(r.code).toBe(0);
      expect(r.json.data.total).toBe(0);
      const added = (await logFiles(root)).filter((f) => !before.includes(f));
      if (row.body === null) {
        expect(added).toEqual([]);
      } else {
        expect(added).toHaveLength(1);
        const body = (await logBodies(root, added))[0]!;
        expect(body.split("\n")).toContain(row.body);
      }
      expect(r.json.warnings ?? []).toEqual(row.warn === null ? [] : [row.warn]);
      expect((await drive(root, ["index", "rebuild"])).code).toBe(0);
      const view = await readFile(path.join(root, ".wiki", "log.md"), "utf8");
      if (row.view === null) expect(view).not.toContain("· miss ·");
      else expect(view.split("\n").some((l) => l.endsWith(row.view!))).toBe(true);
    });
    it(`human stderr for search ${row.args.join(" ")}`, async () => {
      const root = await labelRoot();
      const r = await drive(root, ["search", ...row.args]);
      expect(r.code).toBe(0);
      if (row.warn === null) expect(r.err).toBe("");
      else expect(r.err).toContain(`warning: ${row.warn}`);
    });
  }
  it("search --help lists --no-miss and --mark", async () => {
    const root = await labelRoot();
    const h = await drive(root, ["search", "--help"]);
    expect(h.out).toContain("--no-miss");
    expect(h.out).toContain("--mark");
  });
});

// ---- Scenario: misses count ----
describe("Scenario: --misses counts every miss and every distinct query (red)", () => {
  it("prints N misses, M distinct queries, data.events and the limit note", async () => {
    const root = await emptyRoot();
    await put(root, ".wiki/pages/projects/atlas.md", "---\ntitle: Atlas\n---\n# Atlas\n");
    await missEvent(root, "budget burn", "2026-10-10T00:00:00Z");
    await missEvent(root, "Budget  Burn", "2026-10-12T00:00:00Z");
    await missEvent(root, "", "2026-10-13T00:00:00Z", { entity: "Nobody" });
    const h = await drive(root, ["search", "--misses"]);
    expect(h.code).toBe(0);
    expect(h.out.split("\n")[0]).toBe("3 misses, 2 distinct queries");
    const j = await drive(root, ["search", "--misses", "--json"]);
    expect(j.json.data.events).toBe(3);
    expect(j.json.data.total).toBe(2);
    expect(j.json.data.misses).toHaveLength(2);
    const l = await drive(root, ["search", "--misses", "--limit", "1"]);
    const lines = l.out.trim().split("\n");
    expect(lines[lines.length - 1]).toBe("showing 1 of 2 distinct queries; use --limit to see more");
    const lj = await drive(root, ["search", "--misses", "--limit", "1", "--json"]);
    expect(lj.json.data.events).toBe(3);
  });
});

// ---- Scenario Outline: limit note ----
async function limitRoot(): Promise<string> {
  const root = await emptyRoot();
  await put(root, ".wiki/pages/projects/atlas.md", [
    "---", "title: Atlas", "---", "# Atlas", "", "The vendor ships late.",
    "- 2026-10-08 · decided · Vendor chosen. [[src-2026-10-09-team]]",
    "- 2026-10-15 · tentative · Vendor slips. [[src-2026-10-12-sync]]", "",
  ].join("\n"));
  await put(root, ".wiki/pages/risks.md", "# Risks\n\nThe vendor is a risk.\n");
  await put(root, ".wiki/pages/team.md", "# Team\n\nPeople.\n");
  await logIngest(root, "src-2026-10-09-team", "2026-10-09T09:00:00Z", ["team.md"]);
  await logIngest(root, "src-2026-10-12-sync", "2026-10-12T09:00:00Z", ["projects/atlas.md"]);
  return root;
}
const LIMIT_ROWS: Array<{ args: string[]; note: string | null; facts?: number; pages?: number }> = [
  { args: ["vendor", "--limit", "1"], note: "showing 1 of 2 results; use --limit to see more" },
  { args: ["vendor"], note: null },
  { args: ["--since", "2026-10-01", "--limit", "1"], note: "showing 1 of 2 facts and 1 of 2 page changes; use --limit to see more", facts: 2, pages: 2 },
  { args: ["--since", "2026-10-09", "--limit", "1"], note: "showing 1 of 2 page changes; use --limit to see more", facts: 1, pages: 2 },
  { args: ["--since", "2026-10-11", "--limit", "1"], note: null, facts: 1, pages: 1 },
];
describe("Scenario Outline: A list cut by --limit says so (red)", () => {
  for (const row of LIMIT_ROWS) {
    it(`search ${row.args.join(" ")}`, async () => {
      const root = await limitRoot();
      const h = await drive(root, ["search", ...row.args]);
      expect(h.code).toBe(0);
      const lines = h.out.trim().split("\n");
      const last = lines[lines.length - 1]!;
      if (row.note === null) expect(last.startsWith("showing")).toBe(false);
      else expect(last).toBe(row.note);
      const j = await drive(root, ["search", ...row.args, "--json"]);
      if (row.args[0] === "vendor") {
        expect(j.json.data.total).toBe(2);
        expect(j.json.data.results).toHaveLength(row.args.includes("--limit") ? 1 : 2);
      } else {
        expect(j.json.data.changes.facts_total).toBe(row.facts);
        expect(j.json.data.changes.pages_total).toBe(row.pages);
      }
    });
  }
});

// ---- Scenario Outline: --mark ----
async function markRoot(): Promise<string> {
  const root = await emptyRoot();
  await put(root, ".wiki/pages/projects/atlas.md", [
    "---", "title: Atlas", "type: project", "---", "# Atlas", "",
    "- 2026-10-15 · tentative · Launch targets 2026-11-17. [[src-2026-10-16-q4]]",
    "- 2026-09-30 · decided · Scope is the portal only. [[src-2026-09-30-kickoff]]", "",
  ].join("\n"));
  await put(root, ".wiki/pages/risks.md", [
    "# Risks", "", "## Hiring gap", "type:: risk",
    "- 2026-10-12 · tentative · The QA role may stay open. [[src-2026-10-16-q4]]", "",
  ].join("\n"));
  await logIngest(root, "src-2026-10-12-sync", "2026-10-12T09:00:00Z", ["projects/atlas.md"]);
  return root;
}
describe("Scenario Outline: --mark lists fact lines with that mark (red)", () => {
  it("--mark tentative", async () => {
    const root = await markRoot();
    const j = await drive(root, ["search", "--mark", "tentative", "--json"]);
    expect(j.code).toBe(0);
    const res = j.json.data.results as any[];
    expect(res.map((x) => x.path)).toEqual(["projects/atlas.md", "risks.md"]);
    for (const x of res) {
      expect(x.score).toBe(0);
      expect(typeof x.entity).toBe("string");
      expect(typeof x.section).toBe("string");
      expect(x.line).toBeGreaterThan(0);
    }
    expect(res[0].snippet.startsWith("2026-10-15 · tentative · ")).toBe(true);
    expect(res[1].snippet.startsWith("2026-10-12 · tentative · ")).toBe(true);
    expect(j.json.data.filters.mark).toBe("tentative");
    const h = await drive(root, ["search", "--mark", "tentative"]);
    expect(h.out.split("\n")[0]).toBe("2 results for --mark tentative");
  });
  it("--mark Tentative --type risk", async () => {
    const root = await markRoot();
    const j = await drive(root, ["search", "--mark", "Tentative", "--type", "risk", "--json"]);
    expect(j.code).toBe(0);
    expect((j.json.data.results as any[]).map((x) => x.entity)).toEqual(["Hiring gap"]);
    expect(j.json.data.filters.mark).toBe("tentative");
    const h = await drive(root, ["search", "--mark", "Tentative", "--type", "risk"]);
    expect(h.out.split("\n")[0]).toBe("1 result for --type risk --mark tentative");
  });
  it("--entity Atlas --since 2026-09-01 --mark decided", async () => {
    const root = await markRoot();
    const j = await drive(root, ["search", "--entity", "Atlas", "--since", "2026-09-01", "--mark", "decided", "--json"]);
    expect(j.code).toBe(0);
    expect((j.json.data.entity.facts as any[]).map((f) => f.date)).toEqual(["2026-09-30"]);
    expect((j.json.data.changes.facts as any[]).map((f) => f.date)).toEqual(["2026-09-30"]);
    expect(j.json.data.changes.pages).toEqual([]);
    expect(j.json.data.changes.facts_total).toBe(1);
    expect(j.json.data.filters.mark).toBe("decided");
    const h = await drive(root, ["search", "--entity", "Atlas", "--since", "2026-09-01", "--mark", "decided"]);
    expect(h.out.split("\n")[0]).toBe("Atlas (project) · projects/atlas.md");
  });
  it("--since 2026-10-11 --mark tentative", async () => {
    const root = await markRoot();
    const j = await drive(root, ["search", "--since", "2026-10-11", "--mark", "tentative", "--json"]);
    expect(j.code).toBe(0);
    expect((j.json.data.changes.facts as any[]).map((f) => f.date)).toEqual(["2026-10-15", "2026-10-12"]);
    expect(j.json.data.changes.pages).toEqual([]);
    expect(j.json.data.filters.mark).toBe("tentative");
    const h = await drive(root, ["search", "--since", "2026-10-11", "--mark", "tentative"]);
    expect(h.out.split("\n")[0]).toBe("changes since 2026-10-11: 2 facts, 0 page changes");
  });
});

// ---- Scenario Outline: errors ----
describe("Scenario Outline: Error — bad --mark values and combinations are refused (red)", () => {
  const rows: Array<{ args: string[]; code: string; hint: string }> = [
    { args: ["--mark", "maybe"], code: "invalid_filter", hint: "decided or tentative" },
    { args: ["--mark", ""], code: "invalid_filter", hint: "decided or tentative" },
    { args: ["vendor", "--mark", "tentative"], code: "usage", hint: "--mark cannot be combined with a query" },
    { args: ["--misses", "--mark", "decided"], code: "usage", hint: "--mark" },
  ];
  for (const row of rows) {
    it(`search ${JSON.stringify(row.args)}`, async () => {
      const root = await markRoot();
      const r = await drive(root, ["search", ...row.args, "--json"]);
      expect(r.code).toBe(2);
      expect(r.json.command).toBe("search");
      expect(r.json.error.code).toBe(row.code);
      expect(r.json.error.message).toContain(row.hint);
    });
  }
});
