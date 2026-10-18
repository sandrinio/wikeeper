import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { snapshotDir } from "../../src/ingest/snapshot.js";
import { validateIngest } from "../../src/ingest/validate.js";

const ID = "src-2026-10-17-roadmap";
const OLD = "- 2026-10-13 · tentative · Launch targets 2026-11-17. [[src-2026-10-16-roadmap]]";
const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

async function setup(before: string | null, now: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-fu-"));
  dirs.push(root);
  const paths = resolvePaths(root, DEFAULT_CONFIG);
  await mkdir(paths.pagesDir, { recursive: true });
  await writeFile(path.join(paths.pagesDir, "roadmap.md"), `# R\n[[${ID}]]\n${now}\n`);
  if (before !== null) {
    const dir = path.join(snapshotDir(paths, ID), "pages");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "roadmap.md"), `# R\n\n## Facts\n${before}\n`);
  }
  return paths;
}
const run = (paths: ReturnType<typeof resolvePaths>) =>
  validateIngest(paths, ID, { created: [], updated: ["roadmap.md"], deleted: [] }, { modified: [], deleted: [] });

describe("dropped fact lines", () => {
  it("ignores layout: marker, indentation, spacing", async () => {
    const v = await run(await setup(OLD, "*   2026-10-13 ·  tentative ·  Launch targets   2026-11-17. [[src-2026-10-16-roadmap]]"));
    expect(v.dropped).toEqual([]);
  });

  it.each([
    ["status", OLD.replace("tentative", "decided")],
    ["date", OLD.replace("2026-10-13", "2026-10-14")],
    ["text", OLD.replace("2026-11-17", "2026-11-18")],
    ["citation", OLD.replace("src-2026-10-16", "src-2026-10-15")],
    ["contradicts", `${OLD} · contradicts:: [[${ID}]]`],
    ["removal", "nothing"],
  ])("counts a changed %s as dropped", async (_n, now) => {
    const v = await run(await setup(OLD, now));
    expect(v.ok).toBe(false);
    expect(v.dropped).toEqual([{ path: "roadmap.md", line: OLD }]);
  });

  it("treats a fact held twice and kept once as kept", async () => {
    const v = await run(await setup(`${OLD}\n${OLD}`, OLD));
    expect(v.dropped).toEqual([]);
  });

  it("checks a page with invalid frontmatter too", async () => {
    const paths = await setup(OLD, "x");
    await writeFile(path.join(paths.pagesDir, "roadmap.md"), `---\nsummary: a: b\n---\n[[${ID}]]\n`);
    const v = await run(paths);
    expect(v.dropped).toHaveLength(1);
    expect(v.invalid.length).toBeGreaterThan(0);
  });

  it("does not check created pages or non-md files", async () => {
    const paths = await setup(null, OLD);
    const v = await validateIngest(paths, ID, { created: ["roadmap.md"], updated: [], deleted: [] }, { modified: [], deleted: [] });
    expect(v.dropped).toEqual([]);
  });

  it("throws snapshot_missing when the snapshot copy is unreadable", async () => {
    await expect(run(await setup(null, OLD))).rejects.toMatchObject({ code: "snapshot_missing" });
  });
});
