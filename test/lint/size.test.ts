import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { estimateTokens, formatTokens } from "../../src/core/tokens.js";
import type { LintContext } from "../../src/lint/checks.js";
import { oversizedPageCheck } from "../../src/lint/size.js";
import { loadPages } from "../../src/wiki/parse-page.js";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function ctx(files: Record<string, string>, only?: string[]): Promise<LintContext> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-size-"));
  tmpDirs.push(root);
  const config = { ...DEFAULT_CONFIG, tokens: { ...DEFAULT_CONFIG.tokens, page: { yellow: 10, red: 20 } } };
  const paths = resolvePaths(root, config);
  await mkdir(paths.pagesDir, { recursive: true });
  for (const [rel, text] of Object.entries(files)) await writeFile(path.join(paths.pagesDir, rel), text);
  const pages = await loadPages(paths.pagesDir);
  return { paths, config, pages, kb: null, log: [], now: new Date(), ...(only === undefined ? {} : { only }) };
}

describe("oversizedPageCheck (STORY-007-05 R7)", () => {
  const big = "# Big\n\n" + "word ".repeat(200);

  it("flags a page at or above the red limit, with the message shape", async () => {
    const c = await ctx({ "big.md": big, "small.md": "# S\n" });
    const found = await oversizedPageCheck.run(c);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: "oversized-page",
      severity: "warning",
      path: ".wiki/pages/big.md",
      message: `page is ${formatTokens(estimateTokens(big))} tokens (tokens.page.red is 20)`,
    });
  });

  it("looks only at the pages in `only`", async () => {
    const c = await ctx({ "big.md": big, "other.md": big }, ["other.md"]);
    expect((await oversizedPageCheck.run(c)).map((f) => f.path)).toEqual([".wiki/pages/other.md"]);
  });

  it("skips a page whose file is missing", async () => {
    const c = await ctx({ "big.md": big });
    await rm(path.join(c.paths.pagesDir, "big.md"));
    expect(await oversizedPageCheck.run(c)).toEqual([]);
  });
});
