import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import type { Git } from "../src/core/git.js";
import { resolvePaths } from "../src/core/paths.js";
import { checkSetupFiles } from "../src/core/setup-files.js";

describe("checkSetupFiles with a fake Git", () => {
  it("a tracked and not ignored me.md gives both findings", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wk-sf-"));
    try {
      await mkdir(path.join(root, ".wiki"), { recursive: true });
      await writeFile(path.join(root, ".wiki", "me.md"), "me\n");
      await writeFile(path.join(root, ".wiki", "project.md"), "p\n");
      const git: Git = {
        inWorkTree: async () => true,
        isTracked: async () => true,
        ignoreRule: async () => null,
      };
      const checks = await checkSetupFiles(root, resolvePaths(root, DEFAULT_CONFIG), { setup_completed_at: null }, git);
      const sev = checks.filter((c) => c.file === ".wiki/me.md").map((c) => c.severity).sort();
      expect(sev).toEqual(["error", "warning"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  for (const source of [".gitignore", ".git/info/exclude"]) {
    it(`the ok message names the rule source ${source}`, async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "wk-sf-"));
      try {
        await mkdir(path.join(root, ".wiki"), { recursive: true });
        await writeFile(path.join(root, ".wiki", "me.md"), "me\n");
        await writeFile(path.join(root, ".wiki", "project.md"), "p\n");
        const git: Git = {
          inWorkTree: async () => true,
          isTracked: async () => false,
          ignoreRule: async (f) =>
            f === ".wiki/me.md" ? { source, line: 7, pattern: ".wiki/me.md", negated: false } : null,
        };
        const checks = await checkSetupFiles(root, resolvePaths(root, DEFAULT_CONFIG), { setup_completed_at: null }, git);
        expect(checks).toEqual([
          {
            id: "setup-files",
            severity: "ok",
            message: `.wiki/me.md present, ignored by ${source}:7, not committed; .wiki/project.md present, not ignored`,
          },
        ]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});
