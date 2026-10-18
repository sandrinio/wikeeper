import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FINISH_CHECKS, finishLintHook } from "../../src/commands/ingest-finish.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("finish lint and sizes (STORY-007-05 R8)", () => {
  it("the finish lint hook flags a changed page at the red limit and ignores an unchanged one", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wk-finish-tokens-"));
    tmpDirs.push(root);
    const paths = resolvePaths(root, DEFAULT_CONFIG);
    await mkdir(paths.pagesDir, { recursive: true });
    await writeFile(paths.configFile, "agents: [claude]\ntokens:\n  page:\n    yellow: 10\n    red: 20\n");
    const big = "# Big\n\n" + "word ".repeat(200);
    await writeFile(path.join(paths.pagesDir, "big.md"), big);
    await writeFile(path.join(paths.pagesDir, "other.md"), big);
    expect(FINISH_CHECKS).toContain("oversized-page");
    const found = await finishLintHook({ paths, sourceId: "src-2026-10-18-x", changed: ["big.md"] });
    expect(found.filter((f) => f.id === "oversized-page").map((f) => f.path)).toEqual([".wiki/pages/big.md"]);
  });
});
