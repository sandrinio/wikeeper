import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { estimateTokens, measureWiki } from "../../src/core/tokens.js";
import { loadSearchCorpus } from "../../src/search/engine.js";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("SearchCorpus.pageTokens (STORY-007-05 R6)", () => {
  it("equals measureWiki's figure for a page with a BOM, cold and warm", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wk-page-tokens-"));
    tmpDirs.push(root);
    const paths = resolvePaths(root, DEFAULT_CONFIG);
    await mkdir(paths.pagesDir, { recursive: true });
    const text = "﻿# Atlas\n\ntype:: project\n\n## Risks\n\nvendor delay " + "word ".repeat(500);
    await writeFile(path.join(paths.pagesDir, "atlas.md"), text, "utf8");
    const size = await measureWiki(paths);
    const want = size.pages.find((p) => p.path === "atlas.md")!.tokens;
    expect(want).toBe(estimateTokens(text));
    const cold = await loadSearchCorpus(paths);
    const warm = await loadSearchCorpus(paths);
    expect(cold.pageTokens("atlas.md")).toBe(want);
    expect(warm.pageTokens("atlas.md")).toBe(want);
    expect(warm.pageTokens("missing.md")).toBe(0);
  });
});
