import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { executeSearch } from "../../src/commands/search.js";
import { EMPTY_FILTERS } from "../../src/search/engine.js";
import { generateWiki } from "../fixtures/search/generate-wiki.js";

let root = "";
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-searchbench-"));
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

describe("search on 500 pages", () => {
  it("executeSearch 'vendor delay' (cache off)", async ({ bench }) => {
    await bench("executeSearch 'vendor delay'", async () => {
      await executeSearch(root, req(), { useCache: false });
    }).run();
  }, 120_000);

  it("executeSearch 'vendor delay' (warm cache)", async ({ bench }) => {
    await executeSearch(root, req(), {});
    await bench("executeSearch 'vendor delay' (warm cache)", async () => {
      await executeSearch(root, req(), {});
    }).run();
  }, 120_000);
});
