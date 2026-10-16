import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeSearch, searchWarnings } from "../../src/commands/search.js";
import { EMPTY_FILTERS } from "../../src/search/engine.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});
const req = (query: string | null, limit = 10) => ({
  query,
  limit,
  filters: { ...EMPTY_FILTERS, where: [] },
  entity: null,
  misses: false,
});

async function wiki(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-search-"));
  dirs.push(root);
  await mkdir(path.join(root, ".wiki"), { recursive: true });
  await writeFile(path.join(root, ".wiki", "config.yml"), "agents: [claude]\n");
  return root;
}

describe("executeSearch", () => {
  it("returns 0 results when pages/ is missing", async () => {
    const data = await executeSearch(await wiki(), req("atlas"));
    expect(data.total).toBe(0);
    expect(data.results).toEqual([]);
    expect(searchWarnings(data)).toEqual([]);
  });
  it("applies the limit but counts every hit", async () => {
    const root = await wiki();
    const pages = path.join(root, ".wiki", "pages");
    await mkdir(pages, { recursive: true });
    for (const n of ["a", "b", "c"]) await writeFile(path.join(pages, `${n}.md`), "# T\n\n## S\nvendor delay\n");
    const data = await executeSearch(root, req("vendor", 2));
    expect(data.total).toBe(3);
    expect(data.results).toHaveLength(2);
    expect(data.results[0]!.file).toBe(".wiki/pages/a.md");
  });
  it("rejects bad invocations", async () => {
    const root = await wiki();
    await expect(executeSearch(root, req(null))).rejects.toMatchObject({ code: "usage" });
    await expect(executeSearch(root, req("x", 0))).rejects.toMatchObject({ code: "usage" });
    await expect(executeSearch(os.tmpdir() + "/nope-wikeeper", req("x"))).rejects.toMatchObject({ code: "not_initialised" });
  });
});
