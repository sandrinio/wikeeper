import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { planDirectory } from "../../src/ingest/plan.js";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function repo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-plan-unit-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".wiki"), { recursive: true });
  return root;
}
async function put(root: string, rel: string, content: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), content);
}
const config = { ...DEFAULT_CONFIG, ingest: { ...DEFAULT_CONFIG.ingest, permission: "ai" as const } };

describe("planDirectory", () => {
  it("sorts entries by POSIX path across nested folders", async () => {
    const root = await repo();
    await put(root, "docs/b/z.md", "1");
    await put(root, "docs/a.md", "2");
    await put(root, "docs/b/a.md", "3");
    await put(root, "docs/B.md", "4");
    const plan = await planDirectory(resolvePaths(root, config), config, path.join(root, "docs"), { kind: null });
    expect(plan.entries.map((e) => e.path)).toEqual(["docs/B.md", "docs/a.md", "docs/b/a.md", "docs/b/z.md"]);
  });

  it("plans an empty directory as no entries and zero totals", async () => {
    const root = await repo();
    await mkdir(path.join(root, "empty"));
    const plan = await planDirectory(resolvePaths(root, config), config, path.join(root, "empty"), { kind: null });
    expect(plan.entries).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.totals).toEqual({ new: 0, duplicate: 0, denied: 0, needs_approval: 0, tokens: 0, tokens_rough: false, not_estimated: 0 });
  });

  it("does not apply the hidden rule to segments of the planned directory itself", async () => {
    const root = await repo();
    await put(root, ".hidden-parent/sub/a.md", "x");
    const plan = await planDirectory(resolvePaths(root, config), config, path.join(root, ".hidden-parent"), { kind: null });
    expect(plan.entries.map((e) => e.path)).toEqual([".hidden-parent/sub/a.md"]);
  });

  it("returns an empty plan with one wiki skip for a directory inside the wiki", async () => {
    const root = await repo();
    const plan = await planDirectory(resolvePaths(root, config), config, path.join(root, ".wiki"), { kind: null });
    expect(plan.entries).toEqual([]);
    expect(plan.skipped).toEqual([{ path: ".wiki", reason: "wiki" }]);
  });
});
