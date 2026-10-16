import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildBacklinks, listPageFiles, loadPages, parsePage } from "../../src/wiki/parse-page.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wk-load-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function put(rel: string, body: string): Promise<void> {
  const f = path.join(dir, ...rel.split("/"));
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, body);
}

async function seed(): Promise<void> {
  await put("risks.md", "# Risks\nOwner is [[Product Lead]].\n");
  await put("projects/atlas.md", "# Atlas\nLead: [[Product Lead]] " + "x".repeat(300) + "\n");
  await put("Team.md", "# Team\n");
  await put(".draft.md", "# Draft\n[[Product Lead]]\n");
  await put(".hidden/inner.md", "# Hidden\n");
  await put("notes.txt", "not markdown");
}

describe("Scenario: pages load in stable order with sorted backlinks", () => {
  it("listPageFiles: POSIX relative, code-unit sorted, dot entries and non-md skipped", async () => {
    await seed();
    const want = ["Team.md", "projects/atlas.md", "risks.md"];
    expect(await listPageFiles(dir)).toEqual(want);
    expect(await listPageFiles(dir)).toEqual(want);
  });

  it("loadPages returns parsed pages in that order, twice", async () => {
    await seed();
    const a = await loadPages(dir);
    const b = await loadPages(dir);
    expect(a.map((p) => p.path)).toEqual(["Team.md", "projects/atlas.md", "risks.md"]);
    expect(b).toEqual(a);
    expect(a[1]).toEqual(parsePage("# Atlas\nLead: [[Product Lead]] " + "x".repeat(300) + "\n", "projects/atlas.md"));
  });

  it("buildBacklinks: normalized key, sorted by path then line, context <= 160 chars", async () => {
    await seed();
    const pages = await loadPages(dir);
    const first = buildBacklinks(pages);
    const second = buildBacklinks(await loadPages(dir));
    const bl = first.get("product lead")!;
    expect(bl.map((b) => b.path)).toEqual(["projects/atlas.md", "risks.md"]);
    expect(bl[0].line).toBe(2);
    expect(bl[0].heading).toBe("Atlas");
    expect(typeof bl[0].section).toBe("number");
    expect(bl[0].context.length).toBeLessThanOrEqual(160);
    expect(bl[0].context.startsWith("Lead: [[Product Lead]]")).toBe(true);
    expect(bl[1].context).toBe("Owner is [[Product Lead]].");
    expect(second).toEqual(first);
  });

  it("buildBacklinks orders same-path entries by line", () => {
    const p = parsePage("# A\n[[X]]\nmid\n[[x]]\n", "a.md");
    const bl = buildBacklinks([p]).get("x")!;
    expect(bl.map((b) => b.line)).toEqual([2, 4]);
  });

  it("loadPages returns [] when pages/ does not exist; listPageFiles gives []", async () => {
    const missing = path.join(dir, "nope");
    expect(await loadPages(missing)).toEqual([]);
    expect(await listPageFiles(missing)).toEqual([]);
  });

  it("sorting is code-unit, not locale (uppercase before lowercase)", async () => {
    await put("c.md", "c");
    await put("B.md", "B");
    await put("a.md", "a");
    expect(await listPageFiles(dir)).toEqual(["B.md", "a.md", "c.md"]);
  });
});
