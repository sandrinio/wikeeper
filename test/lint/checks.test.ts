import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { LintFinding } from "../../src/ingest/lint-hook.js";
import { PAGE_CHECKS, RULE_CHECKS, countFindings, indexDriftCheck, findingLine, pagePath, runLint } from "../../src/lint/checks.js";
import type { LintCheck, LintContext } from "../../src/lint/checks.js";
import { parsePage } from "../../src/wiki/parse-page.js";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildIndex } from "../../src/ingest/index-builder.js";

const paths = resolvePaths("/repo", DEFAULT_CONFIG);

function ctx(extra: Partial<LintContext> = {}, p = paths): LintContext {
  return { paths: p, config: DEFAULT_CONFIG, pages: [], kb: null, log: [], now: new Date(0), ...extra };
}

function fakeCheck(id: string, findings: LintFinding[]): LintCheck {
  return { id, severity: "warning", scope: "pages", run: async () => findings };
}

describe("lint registry", () => {
  it("PAGE_CHECKS starts with the four story ids in order; RULE_CHECKS has no page check", () => {
    expect(PAGE_CHECKS.slice(0, 4).map((c) => c.id)).toEqual(["broken-link", "uncited-claim", "orphan-page", "index-drift"]);
    expect(RULE_CHECKS.some((c) => PAGE_CHECKS.some((p) => p.id === c.id))).toBe(false);
  });

  it("selects checks in registry order and rejects unknown ids per scope", async () => {
    await expect(runLint(ctx(), { scope: "pages", checks: ["nope"] })).rejects.toMatchObject({
      code: "usage",
      message: expect.stringContaining('unknown check "nope"; page checks: broken-link'),
    });
    await expect(runLint(ctx(), { scope: "rules", checks: ["broken-link"] })).rejects.toMatchObject({ code: "usage" });
    const e = await runLint(ctx(), { scope: "pages", checks: ["orphan-page", "broken-link"] });
    expect(e).toEqual([]);
  });

  it("only keeps findings on the named pages; drops path-less and index.md findings; [] keeps none", async () => {
    const page = parsePage("# A\n\nSee [[Nowhere]].\n", "a.md");
    const r = ctx({ pages: [page], only: ["a.md"] });
    const kept = await runLint(r, { scope: "pages", checks: ["broken-link", "orphan-page", "index-drift"] });
    expect(kept.map((f) => f.id)).toEqual(["orphan-page", "broken-link"]);
    expect(kept.every((f) => f.path === ".wiki/pages/a.md")).toBe(true);
    expect(await runLint({ ...r, only: [] }, { scope: "pages", checks: ["broken-link", "orphan-page"] })).toEqual([]);
  });

  it("sorts by path, line, id, message with missing path and line first", async () => {
    const saved = PAGE_CHECKS.splice(0, PAGE_CHECKS.length);
    try {
      PAGE_CHECKS.push(
        fakeCheck("x", [
          { id: "b", severity: "info", message: "m", path: "z.md", line: 2 },
          { id: "b", severity: "info", message: "m", path: "z.md" },
          { id: "a", severity: "info", message: "m", path: "z.md", line: 2 },
          { id: "c", severity: "info", message: "m" },
          { id: "b", severity: "info", message: "m", path: "a.md", line: 10 },
          { id: "b", severity: "info", message: "m", path: "a.md", line: 9 },
        ]),
      );
      const out = await runLint(ctx(), { scope: "pages" });
      expect(out.map((f) => `${f.path ?? "-"}:${f.line ?? "-"}:${f.id}`)).toEqual([
        "-:-:c",
        "a.md:9:b",
        "a.md:10:b",
        "z.md:-:b",
        "z.md:2:a",
        "z.md:2:b",
      ]);
    } finally {
      PAGE_CHECKS.splice(0, PAGE_CHECKS.length, ...saved);
    }
  });
});

describe("pagePath, countFindings, findingLine", () => {
  it("pagePath follows content_dir", () => {
    expect(pagePath(paths, "team.md")).toBe(".wiki/pages/team.md");
    const nested = resolvePaths("/repo", { ...DEFAULT_CONFIG, content_dir: "docs/wiki" });
    expect(pagePath(nested, "people/product.md")).toBe("docs/wiki/pages/people/product.md");
  });

  it("countFindings tallies by severity", () => {
    const f = (severity: LintFinding["severity"]): LintFinding => ({ id: "x", severity, message: "m" });
    expect(countFindings([f("error"), f("warning"), f("warning"), f("info")])).toEqual({ error: 1, warning: 2, info: 1 });
  });

  it("findingLine with path and line, path only, and no path", () => {
    expect(findingLine({ id: "broken-link", severity: "error", message: "m", path: "p.md", line: 3 })).toBe("[error] broken-link p.md:3: m");
    expect(findingLine({ id: "orphan-page", severity: "warning", message: "m", path: "p.md" })).toBe("[warn] orphan-page p.md: m");
    expect(findingLine({ id: "x", severity: "info", message: "m" })).toBe("[info] x: m");
  });
});

describe("index-drift", () => {
  async function repo(index: string | null, pageCount: number): Promise<LintContext> {
    const root = await mkdtemp(path.join(os.tmpdir(), "wk-drift-"));
    cleanup.push(root);
    const p = resolvePaths(root, DEFAULT_CONFIG);
    await mkdir(p.contentDir, { recursive: true });
    const pages = Array.from({ length: pageCount }, (_, i) =>
      parsePage(`---\ntype: project\ntitle: P${i}\n---\n# P${i}\n`, `p${i}.md`),
    );
    if (index !== null) await writeFile(p.indexFile, index);
    return ctx({ pages }, p);
  }
  const cleanup: string[] = [];
  afterEach(async () => {
    while (cleanup.length) await rm(cleanup.pop()!, { recursive: true, force: true });
  });
  it("reports missing, entry diffs with a five-path cap, CRLF as clean, and non-entry diffs", async () => {
    const missing = await repo(null, 1);
    expect((await indexDriftCheck.run(missing))[0]).toMatchObject({ path: ".wiki/index.md", message: "index.md is missing: run wikeeper index rebuild" });
    expect((await indexDriftCheck.run(missing))[0]!.line).toBeUndefined();

    const seven = await repo("# Wiki index\n\n_No pages yet._\n", 7);
    const f = (await indexDriftCheck.run(seven))[0]!;
    expect(f.message).toContain("out of date for 7 pages");
    expect(f.message).toContain(".wiki/pages/p0.md, .wiki/pages/p1.md, .wiki/pages/p2.md, .wiki/pages/p3.md, .wiki/pages/p4.md, and 2 more");

    const crlf = await repo(null, 1);
    await writeFile(crlf.paths.indexFile, "﻿" + buildIndex(crlf.pages).replace(/\n/g, "\r\n"));
    expect(await indexDriftCheck.run(crlf)).toEqual([]);

    const edited = await repo(null, 1);
    await writeFile(edited.paths.indexFile, buildIndex(edited.pages).replace("Do not edit", "Please edit"));
    expect((await indexDriftCheck.run(edited))[0]!.message).toBe("index.md is out of date: run wikeeper index rebuild");

    const encoded = await repo(null, 0);
    const spaced = [parsePage("---\ntype: project\ntitle: S\n---\n# S\n", "my page.md")];
    await writeFile(encoded.paths.indexFile, "# Wiki index\n");
    expect((await indexDriftCheck.run({ ...encoded, pages: spaced }))[0]!.message).toContain("(.wiki/pages/my page.md)");
  });
});
