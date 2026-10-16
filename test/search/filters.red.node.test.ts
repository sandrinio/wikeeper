import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { runCli } from "../../src/program.js";
import { agentsIntegration } from "../../src/agents/index.js";

// STORY-004-03 (red): structured filters --type, --where, --status.
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

/** A minimal wiki: config plus the pages of the Gherkin background. */
async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-filters-"));
  cleanup.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  await put(root, ".wiki/config.yml", "agents: [claude]\n");
  await put(root, ".wiki/pages/risks.md", [
    "# Risks",
    "",
    "## Vendor delay",
    "type:: risk",
    "owner:: [[Ana Kim]]",
    "status:: open",
    "The vendor delay pushes the launch.",
    "",
    "## Hiring freeze",
    "type:: risk",
    "owner:: [[Ana Kim]]",
    "status:: closed",
    "Hiring is frozen.",
    "",
    "## Data loss",
    "type:: risk",
    "owner:: [[Luka B.]]",
    "status:: open",
    "Backups might fail.",
    "",
  ].join("\n"));
  await put(root, ".wiki/pages/projects/atlas.md", [
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
  await put(root, ".wiki/pages/team.md", [
    "# Team",
    "",
    "## Ana Kim",
    "type:: person",
    "Lead engineer.",
    "",
  ].join("\n"));
  return root;
}

describe("Scenario: Structured filter by owner (red)", () => {
  it("returns exactly the open risk Ana Kim owns, score 0, with filters echoed", async () => {
    const root = await fixture();
    const r = await drive(root, ["search", "--type", "risk", "--where", "owner=Ana", "--status", "open", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.ok).toBe(true);
    const results = r.json.data.results as any[];
    expect(results).toHaveLength(1);
    expect(results[0].entity).toBe("Vendor delay");
    expect(results[0].path).toBe("risks.md");
    expect(results[0].score).toBe(0);
    expect(r.json.data.total).toBe(1);
    expect(r.json.data.filters).toEqual({
      type: "risk",
      where: [{ key: "owner", value: "Ana" }],
      status: "open",
      since: null,
    });
  });

  it("a filter-only search needs no query: hits carry the section heading and a snippet", async () => {
    const root = await fixture();
    const r = await drive(root, ["search", "--type", "risk", "--json"]);
    expect(r.code).toBe(0);
    const results = r.json.data.results as any[];
    expect(results.map((h) => h.entity)).toEqual(["Vendor delay", "Hiring freeze", "Data loss"]);
    expect(results[0].section).toBe("Vendor delay");
    expect(typeof results[0].snippet).toBe("string");
    expect(results[0].snippet.length).toBeLessThanOrEqual(160);
    expect(Array.isArray(results[0].sources)).toBe(true);
  });

  it("human output of a filter-only search never prints an empty query", async () => {
    const root = await fixture();
    const r = await drive(root, ["search", "--type", "risk", "--status", "open"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain('for ""');
    expect(r.out).toMatch(/2 results/);
    expect(r.out).toContain("Vendor delay");
  });

  it("human output with no filter match names the filters, not an empty query", async () => {
    const root = await fixture();
    const r = await drive(root, ["search", "--type", "nothing-like-this"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/no results for/);
    expect(r.out).not.toContain('for ""');
  });
});

describe("Scenario: Filters narrow a full-text query (red)", () => {
  it("keeps only risk hits and drops projects/atlas.md", async () => {
    const root = await fixture();
    const r = await drive(root, ["search", "vendor", "--type", "risk", "--json"]);
    expect(r.code).toBe(0);
    const results = r.json.data.results as any[];
    expect(results.length).toBeGreaterThan(0);
    for (const h of results) expect(h.type).toBe("risk");
    expect(results.some((h) => h.path === "projects/atlas.md")).toBe(false);
    expect(r.json.data.total).toBe(results.length);
    expect(r.json.data.filters.type).toBe("risk");
  });
});

describe("Scenario Outline: Type matches page entities and section entities (red)", () => {
  const rows = [
    { name: "Atlas", type: "project", path: "projects/atlas.md" },
    { name: "Ana Kim", type: "person", path: "team.md" },
  ];
  for (const row of rows) {
    it(`--type ${row.type} finds "${row.name}" in ${row.path}`, async () => {
      const root = await fixture();
      const r = await drive(root, ["search", "--type", row.type, "--json"]);
      expect(r.code).toBe(0);
      const results = r.json.data.results as any[];
      expect(results.some((h) => h.entity === row.name && h.path === row.path)).toBe(true);
    });
  }
});

describe("Scenario Outline: Where uses whole-token matching and combines with AND (red)", () => {
  const rows: Array<{ where: string[]; total: number }> = [
    { where: ["--where", "owner=kim"], total: 2 },
    { where: ["--where", "owner=An"], total: 0 },
    { where: ["--where", "owner=Ana", "--where", "status=closed"], total: 1 },
  ];
  for (const row of rows) {
    it(`${row.where.join(" ")} gives total ${row.total}`, async () => {
      const root = await fixture();
      const r = await drive(root, ["search", "--type", "risk", ...row.where, "--json"]);
      expect(r.code).toBe(0);
      expect(r.json.data.total).toBe(row.total);
      expect(r.json.data.results).toHaveLength(row.total);
    });
  }

  it("--where echoes repeated conditions in the order given", async () => {
    const root = await fixture();
    const r = await drive(root, ["search", "--where", "status=closed", "--where", "Owner=Ana", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.filters.where).toEqual([
      { key: "status", value: "closed" },
      { key: "Owner", value: "Ana" },
    ]);
    expect(r.json.data.total).toBe(1);
  });

  it("matches frontmatter keys of page entities, list values by element", async () => {
    const root = await fixture();
    await put(root, ".wiki/pages/people/kim.md", [
      "---",
      "type: person",
      "title: Kim",
      "tags: [infra, finance]",
      "---",
      "# Kim",
      "",
    ].join("\n"));
    const r = await drive(root, ["search", "--where", "tags=finance", "--json"]);
    expect(r.code).toBe(0);
    const results = r.json.data.results as any[];
    expect(results.map((h) => h.path)).toContain("people/kim.md");
  });

  it("status is an exact match: open does not match reopened", async () => {
    const root = await fixture();
    await put(root, ".wiki/pages/more.md", [
      "# More",
      "",
      "## Reopened thing",
      "type:: risk",
      "status:: reopened",
      "",
    ].join("\n"));
    const r = await drive(root, ["search", "--type", "risk", "--status", "open", "--json"]);
    expect(r.code).toBe(0);
    const names = (r.json.data.results as any[]).map((h) => h.entity);
    expect(names).not.toContain("Reopened thing");
    expect(r.json.data.total).toBe(2);
  });

  it("unknown types and keys are not errors: zero results", async () => {
    const root = await fixture();
    const a = await drive(root, ["search", "--type", "unicorn", "--json"]);
    expect(a.code).toBe(0);
    expect(a.json.data.total).toBe(0);
    const b = await drive(root, ["search", "--where", "nokey=x", "--json"]);
    expect(b.code).toBe(0);
    expect(b.json.data.total).toBe(0);
  });
});

describe("Scenario Outline: Error - invalid filter syntax (red)", () => {
  const rows: Array<{ args: string[]; got: string }> = [
    { args: ["--where", "owner"], got: "owner" },
    { args: ["--where", "=Ana"], got: "=Ana" },
    { args: ["--where", "owner="], got: "owner=" },
    { args: ["--type", ""], got: "" },
    { args: ["--status", ""], got: "" },
  ];
  for (const row of rows) {
    it(`${JSON.stringify(row.args)} exits 2 with invalid_filter`, async () => {
      const root = await fixture();
      const r = await drive(root, ["search", ...row.args, "--json"]);
      expect(r.code).toBe(2);
      expect(r.json.ok).toBe(false);
      expect(r.json.command).toBe("search");
      expect(r.json.error.code).toBe("invalid_filter");
      expect(r.json.error.details.got).toBe(row.got);
      expect(r.json.error.details.expected).toBe(row.args[0] === "--where" ? "key=value" : "a non-empty value");
    });
  }
});
