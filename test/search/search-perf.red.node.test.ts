import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeSearch } from "../../src/commands/search.js";
import { EMPTY_FILTERS } from "../../src/search/engine.js";
import { generateWiki } from "../fixtures/search/generate-wiki.js";

// STORY-004-02 S3 (red): the search stays within the performance budget. Own file = own worker.
let root = "";
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-searchperf-"));
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

describe("Scenario: Search stays within the performance budget", () => {
  it("p95 of 30 in-process runs (cache off, after one warm-up) on 500 pages is under 500 ms", async () => {
    const warm = await executeSearch(root, req(), { useCache: false });
    expect(warm.total).toBeGreaterThan(0);
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      await executeSearch(root, req(), { useCache: false });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(0.95 * times.length) - 1]!;
    expect(p95).toBeLessThan(500);
  }, 120_000);
});
