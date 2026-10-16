import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBacklinks, listPageFiles, loadPages } from "../../src/wiki/parse-page.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wk-pages-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function put(rel: string, body: string): Promise<void> {
  const f = path.join(dir, ...rel.split("/"));
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, body);
}

describe("Scenario: Pages load in a stable order with sorted backlinks", () => {
  it("loads in code-unit order, skips dot entries, and sorts backlinks", async () => {
    await put("risks.md", "# R\nSee [[Ana Kim]]\n");
    await put("projects/atlas.md", "# A\nSee [[Ana Kim]]\n");
    await put("Team.md", "# T\n");
    await put(".draft.md", "[[Ana Kim]]\n");
    const a = await loadPages(dir);
    const b = await loadPages(dir);
    expect(a.map((p) => p.path)).toEqual(["Team.md", "projects/atlas.md", "risks.md"]);
    expect(b).toEqual(a);
    expect(buildBacklinks(a).get("ana kim")!.map((x) => x.path)).toEqual(["projects/atlas.md", "risks.md"]);
  });
  it("a missing pages directory gives []", async () => {
    expect(await loadPages(path.join(dir, "none"))).toEqual([]);
    expect(await listPageFiles(path.join(dir, "none"))).toEqual([]);
  });
});
