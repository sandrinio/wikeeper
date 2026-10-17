import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeSearch, searchWarnings } from "../../src/commands/search.js";
import { EMPTY_FILTERS } from "../../src/search/engine.js";
import type { SearchRequest } from "../../src/search/engine.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});
const req = (over: Partial<SearchRequest> = {}): SearchRequest => ({
  query: null,
  limit: 10,
  filters: { ...EMPTY_FILTERS, where: [] },
  entity: null,
  misses: false,
  ...over,
});

async function wiki(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-follow-"));
  dirs.push(root);
  await mkdir(path.join(root, ".wiki", "pages"), { recursive: true });
  await writeFile(path.join(root, ".wiki", "config.yml"), "agents: [claude]\n");
  await writeFile(
    path.join(root, ".wiki", "pages", "plan.md"),
    [
      "# Plan",
      "",
      "## Launch",
      "type:: project",
      "- 2026-10-15 · tentative · Launch targets November. [[src-2026-10-12-a]]",
      "- 2026-10-12 · decided · Budget approved. [[src-2026-10-12-b]]",
      "- 2026-10-14 · tentative · Hiring may slip. [[src-2026-10-12-c]]",
      "",
    ].join("\n"),
  );
  return root;
}
const missFiles = async (root: string): Promise<string[]> =>
  (await readdir(path.join(root, ".wiki", "log")).catch(() => [] as string[])).filter((n) => n.endsWith("-miss.md") || n.includes("miss"));

describe("--no-miss", () => {
  it("records a miss by default and none with noMiss", async () => {
    const root = await wiki();
    await executeSearch(root, req({ query: "zzzqqq" }));
    expect(await missFiles(root)).toHaveLength(1);
    const other = await wiki();
    const data = await executeSearch(other, req({ query: "zzzqqq", noMiss: true }));
    expect(data.total).toBe(0);
    expect(await missFiles(other)).toHaveLength(0);
  });
});

describe("--mark", () => {
  it("lists fact lines with the mark, newest first", async () => {
    const root = await wiki();
    const data = await executeSearch(root, req({ filters: { ...EMPTY_FILTERS, where: [], mark: "tentative" } }));
    expect(data.total).toBe(2);
    expect(data.results.map((h) => h.snippet.slice(0, 10))).toEqual(["2026-10-15", "2026-10-14"]);
    expect(data.results[0]).toMatchObject({ score: 0, section: "Launch", sources: ["src-2026-10-12-a"] });
  });
  it("refuses a query and records the mark in a miss", async () => {
    const root = await wiki();
    await expect(
      executeSearch(root, req({ query: "launch", filters: { ...EMPTY_FILTERS, where: [], mark: "decided" } })),
    ).rejects.toMatchObject({ code: "usage" });
    const data = await executeSearch(root, req({ filters: { ...EMPTY_FILTERS, where: [], type: "risk", mark: "decided" } }));
    expect(data.total).toBe(0);
    expect(await missFiles(root)).toHaveLength(1);
  });
  it("--since keeps only marked facts and no page changes", async () => {
    const root = await wiki();
    const data = await executeSearch(root, req({ filters: { ...EMPTY_FILTERS, where: [], since: "2026-10-01", mark: "decided" } }));
    expect(data.changes?.facts).toHaveLength(1);
    expect(data.changes?.pages).toEqual([]);
    expect(data.changes?.facts_total).toBe(1);
  });
});

describe("--status hint and misses count", () => {
  it("--status decided with no results points at --mark", async () => {
    const root = await wiki();
    const data = await executeSearch(root, req({ filters: { ...EMPTY_FILTERS, where: [], status: "Decided" } }));
    expect(searchWarnings(data)).toContain("fact marks are filtered with --mark: wikeeper search --mark decided");
  });
  it("misses mode carries events", async () => {
    const root = await wiki();
    await executeSearch(root, req({ query: "zzzqqq" }));
    await executeSearch(root, req({ query: "zzzqqq" }));
    const data = await executeSearch(root, req({ misses: true }));
    expect(data.events).toBe(2);
    expect(data.total).toBe(1);
  });
  it("limit cuts change lists but totals count everything", async () => {
    const root = await wiki();
    const data = await executeSearch(root, req({ limit: 1, filters: { ...EMPTY_FILTERS, where: [], since: "2026-10-01" } }));
    expect(data.changes?.facts).toHaveLength(1);
    expect(data.changes?.facts_total).toBe(3);
  });
});
