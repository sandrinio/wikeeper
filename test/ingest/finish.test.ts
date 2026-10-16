import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { diffOutside, diffPages } from "../../src/ingest/diff.js";
import { runLintHook, setLintHook } from "../../src/ingest/lint-hook.js";
import { hashOutside, hashTree } from "../../src/ingest/snapshot.js";
import type { SnapshotInfo } from "../../src/ingest/snapshot.js";
import { citesSource, validateIngest } from "../../src/ingest/validate.js";
import { parsePage } from "../../src/wiki/parse-page.js";

const ID = "src-2026-10-16-notes";
const dirs: string[] = [];
afterEach(async () => {
  setLintHook(null);
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-diff-"));
  dirs.push(root);
  const paths = resolvePaths(root, DEFAULT_CONFIG);
  await mkdir(paths.pagesDir, { recursive: true });
  await mkdir(paths.rawDir, { recursive: true });
  const put = async (file: string, text: string) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  const snap = async (): Promise<SnapshotInfo> => ({
    source_id: ID,
    taken_at: "2026-10-16T10:00:00.000Z",
    facts_sha256: "x",
    pages: await hashTree(paths.pagesDir),
    outside: await hashOutside(paths),
  });
  return { root, paths, put, snap };
}

describe("diff", () => {
  it("lists created, updated and deleted pages, ignoring dot files", async () => {
    const { paths, put, snap } = await setup();
    await put(path.join(paths.pagesDir, "a.md"), "a");
    await put(path.join(paths.pagesDir, "b.md"), "b");
    await put(path.join(paths.pagesDir, ".gitkeep"), "");
    const s = await snap();
    await put(path.join(paths.pagesDir, "a.md"), "a2");
    await put(path.join(paths.pagesDir, "c/d.md"), "d");
    await put(path.join(paths.pagesDir, ".DS_Store"), "junk");
    await rm(path.join(paths.pagesDir, "b.md"));
    expect(await diffPages(paths, s)).toEqual({ created: ["c/d.md"], updated: ["a.md"], deleted: ["b.md"] });
  });

  it("flags modified and deleted outside files but allows new ones", async () => {
    const { paths, put, snap } = await setup();
    await put(path.join(paths.rawDir, "one.meta.json"), "{}");
    await put(path.join(paths.rawDir, "two.meta.json"), "{}");
    const s = await snap();
    await put(path.join(paths.rawDir, "one.meta.json"), "{ }");
    await rm(path.join(paths.rawDir, "two.meta.json"));
    await put(path.join(paths.rawDir, "three.meta.json"), "{}");
    expect(await diffOutside(paths, s)).toEqual({
      modified: ["raw/one.meta.json"],
      deleted: ["raw/two.meta.json"],
    });
  });
});

describe("validate", () => {
  const page = (text: string, p = "x.md") => parsePage(text, p);
  it("cites by wikilink, alias, frontmatter sources, or being the source page", () => {
    expect(citesSource(page(`# X\nsee [[${ID}]]\n`), ID)).toBe(true);
    expect(citesSource(page(`# X\nsee [[${ID}|notes]]\n`), ID)).toBe(true);
    expect(citesSource(page(`---\ntype: project\nsources: [${ID}]\n---\n# X\n`), ID)).toBe(true);
    expect(citesSource(page(`---\ntype: project\nsources: ["[[${ID}]]"]\n---\n# X\n`), ID)).toBe(true);
    expect(citesSource(page("# Source\n", `sources/${ID}.md`), ID)).toBe(true);
    expect(citesSource(page("# X\nnothing\n"), ID)).toBe(false);
    expect(citesSource(page("# X\n[[src-2026-10-01-other]]\n"), ID)).toBe(false);
  });

  it("reports uncited pages, outside writes and a missing source page", async () => {
    const { paths, put } = await setup();
    await put(path.join(paths.pagesDir, "a.md"), `# A\n[[${ID}]]\n`);
    await put(path.join(paths.pagesDir, "b.md"), "# B\n");
    const v = await validateIngest(
      paths,
      ID,
      { created: ["a.md", "b.md"], updated: [], deleted: [] },
      { modified: ["index.md"], deleted: ["raw/z.json"] },
    );
    expect(v.ok).toBe(false);
    expect(v.uncited).toEqual(["b.md"]);
    expect(v.outside).toEqual(["index.md", "raw/z.json"]);
    expect(v.warnings).toHaveLength(1);
    expect(v.warnings[0]).toContain(`sources/${ID}.md is missing`);
    const ok = await validateIngest(paths, ID, { created: [], updated: [], deleted: [] }, { modified: [], deleted: [] });
    expect(ok.ok).toBe(true);
  });
});

describe("lint hook", () => {
  it("returns no findings by default and the registered hook's findings otherwise", async () => {
    const { paths } = await setup();
    const ctx = { paths, sourceId: ID, changed: ["a.md"] };
    expect(await runLintHook(ctx)).toEqual([]);
    setLintHook(async (c) => [{ id: "x", severity: "info", message: c.changed.join(",") }]);
    expect(await runLintHook(ctx)).toEqual([{ id: "x", severity: "info", message: "a.md" }]);
    setLintHook(null);
    expect(await runLintHook(ctx)).toEqual([]);
  });
});
