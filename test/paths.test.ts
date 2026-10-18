import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { findRepoRoot, resolvePaths } from "../src/core/paths.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wk-paths-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("paths", () => {
  it("findRepoRoot walks up to a .wiki directory", async () => {
    await mkdir(path.join(root, ".wiki"));
    const nested = path.join(root, "a", "b");
    await mkdir(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(root);
  });

  it("findRepoRoot accepts a .git file", async () => {
    await writeFile(path.join(root, ".git"), "gitdir: x\n");
    expect(findRepoRoot(root)).toBe(root);
  });

  it("resolvePaths moves content paths with content_dir", () => {
    const p = resolvePaths(root, { content_dir: "wiki" });
    expect(p.pagesDir).toBe(path.join(root, "wiki", "pages"));
    expect(p.configFile).toBe(path.join(root, ".wiki", "config.yml"));
  });

  it("archiveDir follows content_dir like pages/", () => {
    expect(resolvePaths(root, DEFAULT_CONFIG).archiveDir).toBe(path.join(root, ".wiki", "archive"));
    expect(resolvePaths(root, { content_dir: "wiki" }).archiveDir).toBe(path.join(root, "wiki", "archive"));
    expect(resolvePaths(root, { content_dir: "." }).archiveDir).toBe(path.join(root, "archive"));
  });

  it("resolvePaths defaults keep content under .wiki", () => {
    expect(resolvePaths(root, DEFAULT_CONFIG).indexFile).toBe(path.join(root, ".wiki", "index.md"));
  });
});
