import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG, loadConfig } from "../src/core/config.js";
import { findRepoRoot, resolvePaths, toPosixRelative } from "../src/core/paths.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wk-paths-red-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("paths (red)", () => {
  it("partial config + nested cwd: root found and content paths move to <root>/wiki", async () => {
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    await writeFile(path.join(root, ".wiki", "config.yml"), "content_dir: wiki\ningest:\n  permission: ai\n");
    const nested = path.join(root, "a", "b");
    await mkdir(nested, { recursive: true });

    const found = findRepoRoot(nested);
    expect(found).toBe(root);
    const { config } = await loadConfig(found);
    const p = resolvePaths(found, config);
    const wiki = path.join(root, "wiki");
    expect(p.root).toBe(root);
    expect(p.contentDir).toBe(wiki);
    expect(p.pagesDir).toBe(path.join(wiki, "pages"));
    expect(p.rawDir).toBe(path.join(wiki, "raw"));
    expect(p.logDir).toBe(path.join(wiki, "log"));
    expect(p.indexFile).toBe(path.join(wiki, "index.md"));
    expect(p.configFile).toBe(path.join(root, ".wiki", "config.yml"));
    expect(p.systemDir).toBe(path.join(root, ".wiki", "system"));
    expect(config.ingest.ambient_offers).toBe(true);
  });

  it("resolvePaths with default config returns the full documented set", () => {
    const p = resolvePaths(root, DEFAULT_CONFIG);
    const w = path.join(root, ".wiki");
    expect(p).toEqual({
      root,
      wikiDir: w,
      systemDir: path.join(w, "system"),
      configFile: path.join(w, "config.yml"),
      manifestFile: path.join(w, "system", "manifest.json"),
      kbInstructions: path.join(w, "kb_instructions.md"),
      meFile: path.join(w, "me.md"),
      projectFile: path.join(w, "project.md"),
      lockFile: path.join(w, ".lock"),
      contentDir: w,
      pagesDir: path.join(w, "pages"),
      rawDir: path.join(w, "raw"),
      logDir: path.join(w, "log"),
      indexFile: path.join(w, "index.md"),
    });
  });

  it("findRepoRoot detects a .git FILE (worktree/submodule)", async () => {
    await writeFile(path.join(root, ".git"), "gitdir: /elsewhere\n");
    const nested = path.join(root, "x");
    await mkdir(nested);
    expect(findRepoRoot(nested)).toBe(root);
  });

  it("findRepoRoot detects a .git directory and prefers the nearest marker", async () => {
    await mkdir(path.join(root, ".git"));
    const inner = path.join(root, "pkg");
    await mkdir(path.join(inner, ".wiki"), { recursive: true });
    const deep = path.join(inner, "src");
    await mkdir(deep);
    expect(findRepoRoot(deep)).toBe(inner);
    expect(findRepoRoot(root)).toBe(root);
  });

  it("findRepoRoot falls back to the resolved cwd when no marker exists", async () => {
    // tmp dir has no markers on its own path in the normal case; guard otherwise
    const found = findRepoRoot(root);
    expect(path.isAbsolute(found)).toBe(true);
    if (found !== root) {
      // an ancestor of os.tmpdir() holds a marker; still must be an ancestor of root
      expect(root.startsWith(found)).toBe(true);
    } else {
      expect(found).toBe(root);
    }
  });

  it("toPosixRelative returns forward-slash relatives, '' for same, '..' for outside", () => {
    expect(toPosixRelative(root, path.join(root, "a", "b.md"))).toBe("a/b.md");
    expect(toPosixRelative(root, root)).toBe("");
    expect(toPosixRelative(root, path.join(root, "..", "other"))).toBe("../other");
  });
});
