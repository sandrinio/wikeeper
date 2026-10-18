import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeSearch } from "../../src/commands/search.js";
import { resolvePaths } from "../../src/core/paths.js";
import { estimateTokens } from "../../src/core/tokens.js";
import { writeIndex } from "../../src/ingest/index-builder.js";
import { archiveCounterpart } from "../../src/search/aliases.js";
import { EMPTY_FILTERS, hitFile, loadSearchCorpus } from "../../src/search/engine.js";
import type { SearchRequest } from "../../src/search/engine.js";
import { compareFactViews } from "../../src/search/since.js";
import { pageEntities, parsePage } from "../../src/wiki/parse-page.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function put(root: string, rel: string, body: string): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}
const LIVE = "---\ntype: project\ntitle: Atlas\n---\n# Atlas\n\n## Facts\n\n- 2026-10-10 · decided · Atlas ships 2026-11-20\n";
const ARCH = "---\ntype: project\ntitle: Atlas\n---\n# Atlas\n\n## Facts\n\n- 2026-10-10 · tentative · Atlas launch window mid-October\n- 2026-09-01 · tentative · Atlas pilot window\n\n## Notes\n\nlong archived notes about orbit\n";

async function pair(): Promise<{ root: string; paths: ReturnType<typeof resolvePaths> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-sa-"));
  dirs.push(root);
  await put(root, ".wiki/config.yml", "agents: [claude]\n");
  await put(root, ".wiki/pages/projects/atlas.md", LIVE);
  await put(root, ".wiki/archive/projects/atlas.md", ARCH);
  return { root, paths: resolvePaths(root, { content_dir: ".wiki" }) };
}
const req = (over: Partial<SearchRequest>): SearchRequest => ({
  query: null,
  limit: 20,
  filters: { ...EMPTY_FILTERS, where: [] },
  entity: null,
  misses: false,
  noMiss: true,
  ...over,
});

describe("writeIndex counts the archive", () => {
  it("counts .md files, skips dot segments, and 0 without archive/", async () => {
    const { root, paths } = await pair();
    await put(root, ".wiki/archive/.hidden/x.md", "x");
    await put(root, ".wiki/archive/notes.txt", "x");
    expect((await writeIndex(paths)).archived).toBe(1);
    await rm(paths.archiveDir, { recursive: true });
    expect((await writeIndex(paths)).archived).toBe(0);
  });
});

describe("tree-qualified hits for a name in both trees", () => {
  it("query mode: default is live only, --archive returns both trees' hits", async () => {
    const { root } = await pair();
    const live = await executeSearch(root, req({ query: "atlas" }));
    expect(live.results.every((h) => !h.archived && h.file.startsWith(".wiki/pages/"))).toBe(true);
    const both = await executeSearch(root, req({ query: "atlas" }), {}).then(() =>
      executeSearch(root, req({ query: "atlas", archive: true })),
    );
    expect(both.results.some((h) => h.archived && h.file === ".wiki/archive/projects/atlas.md")).toBe(true);
    expect(both.results.some((h) => !h.archived && h.file === ".wiki/pages/projects/atlas.md")).toBe(true);
  });

  it("filter mode: --type project --archive yields one live and one archived hit", async () => {
    const { root } = await pair();
    const r = await executeSearch(root, req({ filters: { ...EMPTY_FILTERS, where: [], type: "project" }, archive: true }));
    expect(r.results.map((h) => [h.path, h.archived]).sort()).toEqual([
      ["projects/atlas.md", false],
      ["projects/atlas.md", true],
    ]);
  });

  it("--mark mode: tentative facts come only from the archive and only with --archive", async () => {
    const { root } = await pair();
    const f = { ...EMPTY_FILTERS, where: [], mark: "tentative" as const };
    expect((await executeSearch(root, req({ filters: f }))).results).toEqual([]);
    const r = await executeSearch(root, req({ filters: f, archive: true }));
    expect(r.results).toHaveLength(2);
    expect(r.results.every((h) => h.archived)).toBe(true);
  });

  it("page_tokens of an archived hit is the archive page's, not its namesake's", async () => {
    const { root, paths } = await pair();
    const r = await executeSearch(root, req({ filters: { ...EMPTY_FILTERS, where: [], type: "project" }, archive: true }));
    const arch = r.results.find((h) => h.archived)!;
    const live = r.results.find((h) => !h.archived)!;
    expect(arch.page_tokens).toBe(estimateTokens(ARCH));
    expect(live.page_tokens).toBe(estimateTokens(LIVE));
    expect(arch.page_tokens).not.toBe(live.page_tokens);
    expect(hitFile(paths, "projects/atlas.md", true)).toBe(".wiki/archive/projects/atlas.md");
  });
});

describe("archive counterpart and history ordering", () => {
  it("picks the same path and kind, and the same section name", () => {
    const live = pageEntities(parsePage("# A\n\n## Facts\n\n- 2026-10-10 · decided · x\n", "a.md"));
    const arch = pageEntities(parsePage("# A\n\n## Facts\n\n- 2026-09-01 · decided · y\n", "a.md"));
    const other = pageEntities(parsePage("# B\n", "b.md"));
    const page = live.find((e) => e.kind === "page")!;
    expect(archiveCounterpart(page, [...other, ...arch])?.kind).toBe("page");
    expect(archiveCounterpart(page, other)).toBeNull();
    for (const e of live.filter((x) => x.kind !== "page")) {
      expect(archiveCounterpart(e, arch)?.kind).toBe(e.kind);
    }
  });

  it("sorts live before archived on the same date", () => {
    const base = { path: "a.md", entity: "A", section: "", line: 1, date: "2026-10-10", status: "decided" as const, text: "", sources: [], contradiction: false };
    const list = [{ ...base, archived: true }, { ...base, archived: false }].sort(compareFactViews);
    expect(list.map((f) => f.archived)).toEqual([false, true]);
  });

  it("--entity merges live and archived facts, live first on a tie", async () => {
    const { root } = await pair();
    const r = await executeSearch(root, req({ entity: "atlas" }));
    expect(r.entity?.archived).toBe(false);
    expect(r.entity?.facts.map((f) => [f.date, f.archived])).toEqual([
      ["2026-10-10", false],
      ["2026-10-10", true],
      ["2026-09-01", true],
    ]);
  });
});

describe("usage", () => {
  it("--misses with --archive is a usage error through the corpus request", async () => {
    const { root } = await pair();
    const corpus = await loadSearchCorpus(resolvePaths(root, { content_dir: ".wiki" }), { archive: true });
    expect(corpus.archivePages).toHaveLength(1);
    await expect(executeSearch(root, req({ archive: true }))).rejects.toThrow("give a query or a filter");
  });
});
