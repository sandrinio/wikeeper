import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentsIntegration } from "../../src/agents/index.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { resolvePaths } from "../../src/core/paths.js";
import { readLogEvents, writeLogEvent } from "../../src/ingest/log.js";
import { runCli } from "../../src/program.js";

// STORY-004-05 (red): miss logging on zero-result searches and `search --misses`.
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
async function wikiRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-misses-"));
  cleanup.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  await put(root, ".wiki/config.yml", "agents: [claude]\n");
  await put(root, ".wiki/pages/projects/atlas.md", ["---", "title: Atlas", "---", "# Atlas", "", "The launch is planned for March.", ""].join("\n"));
  return root;
}
async function logFiles(root: string): Promise<string[]> {
  try {
    return (await readdir(path.join(root, ".wiki", "log"))).sort();
  } catch {
    return [];
  }
}
async function missEvent(root: string, query: string, at: string, filters: Record<string, string | string[]> = {}): Promise<void> {
  await writeLogEvent(resolvePaths(root, DEFAULT_CONFIG), { type: "miss", at, query, filters } as never);
}
async function misses(root: string) {
  return (await readLogEvents(resolvePaths(root, DEFAULT_CONFIG), { type: "miss" })).events;
}

describe("Scenario: A miss is logged (red)", () => {
  it("writes a miss event, lists it with count 1 and prints it", async () => {
    const root = await wikiRoot();
    const before = await logFiles(root);
    const s = await drive(root, ["search", "budget burn", "--json"]);
    expect(s.code).toBe(0);
    expect(s.json.data.total).toBe(0);
    const events = await misses(root);
    expect(events).toHaveLength(1);
    expect((events[0] as any).event.query).toBe("budget burn");
    expect((await logFiles(root)).length).toBe(before.length + 1);

    const l = await drive(root, ["search", "--misses", "--json"]);
    expect(l.code).toBe(0);
    expect(l.json.command).toBe("search");
    expect(l.json.data.mode).toBe("misses");
    expect(l.json.data.misses).toHaveLength(1);
    expect(l.json.data.misses[0].query).toBe("budget burn");
    expect(l.json.data.misses[0].count).toBe(1);

    const h = await drive(root, ["search", "--misses"]);
    expect(h.code).toBe(0);
    const lines = h.out.split("\n");
    expect(lines[0]).toBe("1 recorded miss");
    expect(lines.some((x) => x.startsWith('1× "budget burn"'))).toBe(true);
  });

  it("writes no new file when the search has results, and does not record misses mode", async () => {
    const root = await wikiRoot();
    await drive(root, ["search", "budget burn", "--json"]);
    const before = await logFiles(root);
    const hit = await drive(root, ["search", "launch", "--json"]);
    expect(hit.json.data.total).toBeGreaterThan(0);
    const l = await drive(root, ["search", "--misses", "--json"]);
    expect(l.code).toBe(0);
    expect(l.json.data.misses).toHaveLength(1);
    expect(await logFiles(root)).toEqual(before);
  });
});

describe("Scenario: Repeated misses are grouped and counted (red)", () => {
  it("groups by normalised query and by entity", async () => {
    const root = await wikiRoot();
    await missEvent(root, "budget burn", "2026-10-10T00:00:00Z");
    await missEvent(root, "Budget  Burn", "2026-10-12T00:00:00Z");
    await missEvent(root, "", "2026-10-13T00:00:00Z", { entity: "Nobody" });
    const r = await drive(root, ["search", "--misses", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.total).toBe(2);
    const m = r.json.data.misses as any[];
    expect(m).toHaveLength(2);
    expect(m[0].query).toBe("budget burn");
    expect(m[0].count).toBe(2);
    expect(String(m[0].last_at).startsWith("2026-10-12")).toBe(true);
    expect(m[1].entity).toBe("Nobody");
    expect(m[1].query).toBeNull();
    expect(m[1].count).toBe(1);
  });
});

describe("Scenario Outline: Misses during a write phase; failed write is a warning (red)", () => {
  it("logs one miss while .wiki/.lock exists", async () => {
    const root = await wikiRoot();
    await put(root, ".wiki/.lock", JSON.stringify({
      source_id: "src-2026-10-16-notes",
      pid: process.pid,
      hostname: os.hostname(),
      acquired_at: "2026-10-16T10:00:00.000Z",
    }) + "\n");
    const before = await logFiles(root);
    const r = await drive(root, ["search", "budget burn", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.total).toBe(0);
    expect(r.json.warnings ?? []).toEqual([]);
    expect((await logFiles(root)).length).toBe(before.length + 1);
    expect(await misses(root)).toHaveLength(1);
  });

  it("warns 'miss not logged:' when the log path is a regular file", async () => {
    const root = await wikiRoot();
    await put(root, ".wiki/log", "not a directory\n");
    const r = await drive(root, ["search", "budget burn", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.total).toBe(0);
    const warnings = (r.json.warnings ?? []) as string[];
    expect(warnings.some((w) => w.startsWith("miss not logged:"))).toBe(true);
  });
});

describe("Scenario: Misses can be listed since a date (red)", () => {
  it("keeps only misses at or after --since", async () => {
    const root = await wikiRoot();
    await missEvent(root, "budget burn", "2026-10-09T00:00:00Z");
    await missEvent(root, "hiring plan", "2026-10-12T00:00:00Z");
    const r = await drive(root, ["search", "--misses", "--since", "2026-10-11", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.mode).toBe("misses");
    expect((r.json.data.misses as any[]).map((x) => x.query)).toEqual(["hiring plan"]);
  });
});

describe("Scenario Outline: --misses cannot be combined with a search (red)", () => {
  const rows: Array<[string, string[]]> = [
    ["budget --misses", ["budget", "--misses"]],
    ["--misses --type risk", ["--misses", "--type", "risk"]],
    ["--misses --entity PL", ["--misses", "--entity", "PL"]],
  ];
  for (const [label, args] of rows) {
    it(`exits 2 usage for ${label}`, async () => {
      const root = await wikiRoot();
      const r = await drive(root, ["search", ...args, "--json"]);
      expect(r.code).toBe(2);
      expect(r.json.command).toBe("search");
      expect(r.json.error.code).toBe("usage");
      expect(String(r.json.error.message)).toContain("--misses");
    });
  }
});
