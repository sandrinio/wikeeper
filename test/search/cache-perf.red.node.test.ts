import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeSearch } from "../../src/commands/search.js";
import { EMPTY_FILTERS } from "../../src/search/engine.js";
import type { SearchDeps } from "../../src/search/engine.js";
import { generateWiki } from "../fixtures/search/generate-wiki.js";

// STORY-004-06 S3 (red): the warm cache stays within the budget. Own file = own worker.
let root = "";
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-cacheperf-"));
  await generateWiki(root, { seed: 1, pages: 500 });
}, 120_000);
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true, maxRetries: 3 });
});

const req = () => ({
  query: "vendor delay",
  limit: 10,
  filters: { ...EMPTY_FILTERS, where: [] },
  entity: null,
  misses: false,
});

describe("Scenario: The warm cache stays within the performance budget (red)", () => {
  it("cold run rebuilds once; 30 warm runs (after one warm-up) have p95 under 500 ms and never rebuild", async () => {
    let n = 0;
    const deps: SearchDeps & { onRebuild: () => void } = { onRebuild: () => { n++; } };
    const cold = await executeSearch(root, req(), deps);
    expect(cold.total).toBeGreaterThan(0);
    expect(n).toBe(1);
    const cacheText = await readFile(path.join(root, ".wiki", ".cache", "search.json"), "utf8");
    expect(JSON.parse(cacheText).version).toBe(1);
    await executeSearch(root, req(), deps); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      await executeSearch(root, req(), deps);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(0.95 * times.length) - 1]!;
    expect(p95).toBeLessThan(500);
    expect(n).toBe(1);
  }, 120_000);
});
