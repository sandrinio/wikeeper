import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig, setConfigValue } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeFacts } from "../../src/ingest/facts.js";
import { registerSource } from "../../src/ingest/registry.js";
import { hashTree } from "../../src/ingest/snapshot.js";
import { runLint } from "../../src/lint/checks.js";
import type { LintContext } from "../../src/lint/checks.js";
import { runCli } from "../../src/program.js";
import { loadPages } from "../../src/wiki/parse-page.js";

const T = 30_000;
const Q4 = "src-2026-10-16-q4";
const OWN = new Set(["broken-link", "uncited-claim", "orphan-page", "index-drift"]);
const own = (fs: any[]): any[] => fs.filter((f) => OWN.has(f.id));
const byId = (fs: any[], id: string): any[] => fs.filter((f) => f.id === id);

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const input = Object.assign(Readable.from([]), { isTTY: false });
  const code = await runCli(args, {
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: input,
    },
  } as never);
  const text = out.join("");
  let json: any = null;
  try {
    json = JSON.parse(text.trim().split("\n")[0]!);
  } catch {
    /* human output */
  }
  return { code, json, text, err: err.join("") };
}

interface Repo {
  root: string;
  paths: ResolvedPaths;
  contentDir: string;
}

async function gitRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-lint-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  return root;
}

async function put(root: string, rel: string, body: string): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

/** An initialised wiki, then the given pages (keys relative to pages/), then an index rebuilt from them. */
async function lintWiki(
  pages: Record<string, string>,
  opts: { contentDir?: string; index?: "rebuild" | "keep" } = {},
): Promise<Repo> {
  const root = await gitRoot();
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  const contentDir = opts.contentDir ?? ".wiki";
  if (opts.contentDir) {
    expect(await setConfigValue(root, "content_dir", opts.contentDir)).toBeDefined();
    await mkdir(path.join(root, ...contentDir.split("/"), "pages"), { recursive: true });
  }
  for (const [rel, body] of Object.entries(pages)) await put(root, `${contentDir}/pages/${rel}`, body);
  if (opts.index !== "keep") expect((await run(root, ["index", "rebuild", "--json"])).code).toBe(0);
  const config = (await loadConfig(root)).config;
  return { root, paths: resolvePaths(root, config), contentDir };
}

const fm = (type: string, title: string, extra = "") => `---\ntype: ${type}\ntitle: ${title}\nsummary: ${title} page\n${extra}---\n`;
const SRC_PAGE = fm("source", "Q4 notes", `sources: [${Q4}]\n`) + "# Q4 notes\n";

/** The scenario-1 wiki: fact at line 12 without a citation, broken link at line 14. */
const TEAM =
  fm("team", "Team") +
  "# Team\n\n" +
  `Platform team notes. [[${Q4}]]\n\n` +
  "## Facts\n\n" +
  "- 2026-10-15 · decided · The product lead runs QA.\n\n" +
  `See [[Nobody Here]] [[${Q4}]].\n`;
const S1_PAGES = { "team.md": TEAM, [`sources/${Q4}.md`]: SRC_PAGE };

async function lintJson(r: Repo, args: string[] = [], expectOk = true) {
  const res = await run(r.root, ["lint", ...args, "--json"]);
  if (expectOk) expect(res.json?.ok, `lint ${args.join(" ")}: ${res.text} ${res.err}`).toBe(true);
  return { ...res, findings: (res.json?.data?.findings ?? []) as any[] };
}

describe("STORY-005-02 wikeeper lint (red)", () => {
  it("S1: an uncited claim and a broken link, at repository-relative paths", async () => {
    const r = await lintWiki(S1_PAGES);
    const res = await lintJson(r);
    expect(res.json.ok).toBe(true);
    expect(res.json.command).toBe("lint");
    expect(res.json.data.scope).toBe("pages");
    const mine = own(res.findings).filter((f) => f.severity === "error");
    expect(mine).toHaveLength(2);
    expect(mine).toContainEqual(expect.objectContaining({ id: "uncited-claim", severity: "error", path: ".wiki/pages/team.md", line: 12 }));
    expect(mine).toContainEqual(expect.objectContaining({ id: "broken-link", severity: "error", path: ".wiki/pages/team.md", line: 14 }));
    expect(res.json.data.counts.error).toBeGreaterThanOrEqual(2);
    expect(res.code).toBe(1);
    // counts match the findings
    for (const sev of ["error", "warning", "info"] as const) {
      expect(res.json.data.counts[sev]).toBe(res.findings.filter((f) => f.severity === sev).length);
    }
  }, T);

  it("S1: with content_dir docs/wiki the paths follow it", async () => {
    const r = await lintWiki(S1_PAGES, { contentDir: "docs/wiki" });
    const res = await lintJson(r);
    const mine = own(res.findings).filter((f) => f.severity === "error");
    expect(mine).toContainEqual(expect.objectContaining({ id: "uncited-claim", path: "docs/wiki/pages/team.md", line: 12 }));
    expect(mine).toContainEqual(expect.objectContaining({ id: "broken-link", path: "docs/wiki/pages/team.md", line: 14 }));
    expect(res.code).toBe(1);
  }, T);

  const PROJ = (body: string, title = "Atlas") => fm("project", title) + body;
  const PRODUCT = fm("person", "Product Lead", "aliases: [Product]\n") + `# Product Lead\n\nThe product lead runs Atlas. [[${Q4}]]\n`;
  const RISKS =
    fm("risk-register", "Risks") +
    "# Risks\n\n## Vendor delay\ntype:: risk\naliases:: vendor slip\nowner:: [[Product Lead]]\n" +
    `- 2026-10-15 · decided · The vendor delivers late. [[${Q4}]]\n`;

  it("S2 row 1: link forms that resolve are not broken", async () => {
    const r = await lintWiki({
      "projects/atlas.md": PROJ(
        `# Atlas\nowner:: [[Product]]\nlinks:: [[projects/atlas]]\nrisks:: [[Vendor delay]]\n\nAtlas relaunches. [[${Q4}]]\n`,
      ),
      "people/product-lead.md": PRODUCT,
      "risks.md": RISKS,
      [`sources/${Q4}.md`]: SRC_PAGE,
    });
    expect(byId((await lintJson(r)).findings, "broken-link")).toEqual([]);
  }, T);

  it("S2 row 2: a citation without a source page names the page", async () => {
    const r = await lintWiki({
      "projects/atlas.md": PROJ("# Atlas\n\nAtlas relaunches. [[src-2026-10-16-gone]]\n"),
    });
    const f = byId((await lintJson(r)).findings, "broken-link");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "error", path: ".wiki/pages/projects/atlas.md", line: 8 });
    expect(f[0].message).toContain(".wiki/pages/sources/src-2026-10-16-gone.md");
  }, T);

  it("S2 row 3: a fact whose only source link follows contradicts:: is uncited", async () => {
    const r = await lintWiki({
      "team.md": fm("team", "Team") + `# Team\n\n## Facts\n\n- 2026-10-15 · decided · The product lead runs QA. · contradicts:: [[${Q4}]]\n`,
      [`sources/${Q4}.md`]: SRC_PAGE,
    });
    const f = byId((await lintJson(r)).findings, "uncited-claim");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ path: ".wiki/pages/team.md", line: 10, severity: "error" });
  }, T);

  it("S2 row 4: wrapped paragraph, typed-link lines and fenced code are not uncited", async () => {
    const r = await lintWiki({
      "projects/atlas.md": PROJ(
        "# Atlas\nowner:: [[Product Lead]]\naliases::\n\nAtlas relaunches the portal and\n" +
          `the launch is planned. [[${Q4}]]\n\n` +
          "```js\nconst uncited = 1;\n```\n",
      ),
      "people/product-lead.md": PRODUCT,
      [`sources/${Q4}.md`]: SRC_PAGE,
    });
    expect(byId((await lintJson(r)).findings, "uncited-claim")).toEqual([]);
  }, T);

  it("S2 row 5: a list item without a citation is reported at its line", async () => {
    const r = await lintWiki({ "projects/atlas.md": PROJ("# Atlas\n\n- Created the Atlas page.\n") });
    const f = byId((await lintJson(r)).findings, "uncited-claim");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ path: ".wiki/pages/projects/atlas.md", line: 8 });
  }, T);

  it("S2 row 6: a page whose frontmatter is never closed is not judged", async () => {
    const r = await lintWiki({ "broken.md": "---\ntype: project\ntitle: Broken\nThis is body text without a citation.\n" });
    expect(byId((await lintJson(r)).findings, "uncited-claim")).toEqual([]);
  }, T);

  it("S2 row 7: orphan pages, self-links do not count", async () => {
    const r = await lintWiki({
      "people/tester.md": fm("person", "Tester") + "# Tester\n",
      "risks.md": fm("risk-register", "Risks") + "# Risks\n\nSee [[risks]].\n",
    });
    const f = byId((await lintJson(r)).findings, "orphan-page");
    expect(f).toHaveLength(2);
    expect(f.map((x) => x.path)).toEqual([".wiki/pages/people/tester.md", ".wiki/pages/risks.md"]);
    for (const x of f) {
      expect(x.severity).toBe("warning");
      expect(x.line).toBeUndefined();
    }
  }, T);

  const TWO = { "risks.md": RISKS, "people/product-lead.md": PRODUCT, [`sources/${Q4}.md`]: SRC_PAGE };

  it("S2 row 8: a hand-edited index entry is drift until index rebuild", async () => {
    const r = await lintWiki(TWO);
    expect(byId((await lintJson(r)).findings, "index-drift")).toEqual([]);
    const idx = await readFile(r.paths.indexFile, "utf8");
    expect(idx).toContain("- [Risks](pages/risks.md)");
    await writeFile(r.paths.indexFile, idx.replace("- [Risks](pages/risks.md)", "- [Risks, edited](pages/risks.md)"));
    const f = byId((await lintJson(r)).findings, "index-drift");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "warning", path: ".wiki/index.md" });
    expect(f[0].line).toBeUndefined();
    expect(f[0].message).toContain(".wiki/pages/risks.md");
    expect((await run(r.root, ["index", "rebuild", "--json"])).code).toBe(0);
    expect(byId((await lintJson(r)).findings, "index-drift")).toEqual([]);
  }, T);

  it("S2 row 9: a deleted index.md is missing", async () => {
    const r = await lintWiki(TWO);
    await rm(r.paths.indexFile);
    const f = byId((await lintJson(r)).findings, "index-drift");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "warning", path: ".wiki/index.md", message: "index.md is missing: run wikeeper index rebuild" });
  }, T);

  it("S2 row 10: CRLF line endings (and a BOM) in index.md are not drift", async () => {
    const r = await lintWiki(TWO);
    const idx = await readFile(r.paths.indexFile, "utf8");
    await writeFile(r.paths.indexFile, "﻿" + idx.replace(/\n/g, "\r\n"));
    expect(byId((await lintJson(r)).findings, "index-drift")).toEqual([]);
  }, T);

  async function s3(): Promise<Repo> {
    return lintWiki({ ...S1_PAGES, "people/tester.md": fm("person", "Tester") + "# Tester\n" });
  }

  it("S3: --check broken-link human output", async () => {
    const r = await s3();
    const res = await run(r.root, ["lint", "--check", "broken-link"]);
    expect(res.code).toBe(1);
    const lines = res.text.split("\n").filter((l) => l !== "");
    expect(lines).toContain("[error] broken-link .wiki/pages/team.md:14: [[Nobody Here]] does not resolve to a page");
    expect(res.text).not.toContain("uncited-claim");
    expect(res.text).not.toContain("orphan-page");
    expect(lines[lines.length - 1]).toBe("1 error, 0 warnings, 0 info");
  }, T);

  it("S3: plain lint prints the orphan line", async () => {
    const r = await s3();
    const res = await run(r.root, ["lint"]);
    expect(res.text).toContain("[warn] orphan-page .wiki/pages/people/tester.md: no other page links to it");
  }, T);

  it("S3: --check is repeatable and findings sort by path", async () => {
    const r = await s3();
    const res = await lintJson(r, ["--check", "orphan-page", "--check", "broken-link"]);
    const orphan = res.findings.findIndex((f) => f.id === "orphan-page" && f.path === ".wiki/pages/people/tester.md");
    const broken = res.findings.findIndex((f) => f.id === "broken-link" && f.path === ".wiki/pages/team.md");
    expect(orphan).toBeGreaterThanOrEqual(0);
    expect(broken).toBeGreaterThan(orphan);
    expect(res.findings.every((f) => f.id === "orphan-page" || f.id === "broken-link")).toBe(true);
  }, T);

  it("S3: runLint honours ctx.only", async () => {
    const r = await s3();
    const config = (await loadConfig(r.root)).config;
    const ctx: LintContext = {
      paths: r.paths,
      config,
      pages: await loadPages(r.paths.pagesDir),
      kb: null,
      log: [],
      now: new Date("2026-10-17T00:00:00Z"),
    };
    const some = await runLint({ ...ctx, only: ["people/tester.md"] }, { scope: "pages", checks: ["orphan-page"] });
    expect(some).toHaveLength(1);
    expect(some[0]).toMatchObject({ id: "orphan-page", path: ".wiki/pages/people/tester.md" });
    expect(await runLint({ ...ctx, only: [] }, { scope: "pages", checks: ["orphan-page"] })).toEqual([]);
    await expect(runLint(ctx, { scope: "pages", checks: ["no-such-check"] })).rejects.toMatchObject({ code: "usage" });
  }, T);

  it("S3: lint --rules --json is the rules scope with no page check", async () => {
    const r = await s3();
    const res = await lintJson(r, ["--rules"]);
    expect(res.json.ok).toBe(true);
    expect(res.json.data.scope).toBe("rules");
    expect(res.findings.filter((f) => OWN.has(f.id))).toEqual([]);
  }, T);

  async function tree(root: string): Promise<string[]> {
    const names = await readdir(root, { recursive: true });
    return names.map((n) => n.split(path.sep).join("/")).sort();
  }

  async function everyFinding(withLock: boolean): Promise<Repo> {
    const r = await lintWiki({ ...S1_PAGES, "people/tester.md": fm("person", "Tester") + "# Tester\n" });
    // hand-edited index entry: drift
    const idx = await readFile(r.paths.indexFile, "utf8");
    await writeFile(r.paths.indexFile, idx.replace("- [Tester](", "- [Tester, edited]("));
    // an ingest event in log/ and, for the second copy, the write lock held by an applied ingest
    const label = "notes";
    await put(r.root, `docs/${label}.md`, "content\n");
    const meta = await registerSource(r.paths, {
      originType: "file",
      origin: `docs/${label}.md`,
      label,
      originalPath: path.join(r.root, "docs", `${label}.md`),
      text: null,
      kind: "status-report",
      providedBy: "user",
      ruleVersion: null,
      reingestOf: null,
      permission: { mode: "ai", approved: false, matched: null, kind_pending: false },
      now: new Date("2026-10-16T10:00:00Z"),
    } as never);
    await writeFacts(r.paths, {
      source_id: meta.id,
      kind: "status-report",
      rule_version: 2,
      facts: [
        {
          entity: "project:atlas",
          field: "status",
          value: "green",
          status: "decided",
          as_of: "2026-10-16",
          anchor: "Status",
          page: "projects/atlas.md",
          exists: true,
        },
      ],
      uncovered: [],
    } as never);
    await setConfigValue(r.root, "ingest.permission", "ai");
    if (withLock) expect((await run(r.root, ["ingest", "apply", meta.id, "--json"])).code).toBe(0);
    return r;
  }

  it.each([false, true])("S4: lint writes nothing (lock held: %s)", async (withLock) => {
    const r = await everyFinding(withLock);
    const before = await hashTree(r.root);
    const dirsBefore = await tree(r.root);
    const human = await run(r.root, ["lint"]);
    const json = await run(r.root, ["lint", "--json"]);
    expect(human.code).toBe(1);
    expect(json.code).toBe(1);
    const ids = new Set(json.json.data.findings.map((f: any) => f.id));
    for (const id of OWN) expect(ids.has(id)).toBe(true);
    expect(await hashTree(r.root)).toEqual(before);
    expect(await tree(r.root)).toEqual(dirsBefore);
  }, T);

  const BROKEN_ONE = {
    "a.md": fm("project", "Alpha") + `# Alpha\n\nSee [[b]] [[${Q4}]] [[Missing Thing]].\n`,
    "b.md": fm("project", "Beta") + `# Beta\n\nSee [[a]] [[${Q4}]].\n`,
    [`sources/${Q4}.md`]: SRC_PAGE,
  };

  it("S5: one broken link exits 1", async () => {
    const r = await lintWiki(BROKEN_ONE);
    const res = await lintJson(r);
    expect(res.code).toBe(1);
    expect(res.json.ok).toBe(true);
    const mine = own(res.findings);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: "broken-link", severity: "error" });
    const c = (sev: string) => mine.filter((f) => f.severity === sev).length;
    expect({ error: c("error"), warning: c("warning"), info: c("info") }).toEqual({ error: 1, warning: 0, info: 0 });
  }, T);

  it("S5: an orphan page alone is a warning and exits 0", async () => {
    const r = await lintWiki({ "solo.md": fm("project", "Solo") + "# Solo\n" });
    const res = await lintJson(r, ["--check", "orphan-page"]);
    expect(res.code).toBe(0);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]).toMatchObject({ id: "orphan-page", severity: "warning" });
    expect(res.json.data.counts.warning).toBe(1);
  }, T);

  it("S5: a wiki with no pages has no findings", async () => {
    const r = await lintWiki({});
    const res = await lintJson(r);
    expect(res.code).toBe(0);
    expect(res.json.ok).toBe(true);
    expect(res.json.data.findings).toEqual([]);
  }, T);

  it("S5: an unknown check id is a usage error", async () => {
    const r = await lintWiki({});
    const res = await lintJson(r, ["--check", "no-such-check"], false);
    expect(res.code).toBe(2);
    expect(res.json.error.code).toBe("usage");
    expect(res.json.error.message).toContain("no-such-check");
    expect(res.json.error.message).toContain("broken-link");
  }, T);

  it("S5: --rules with a page check id is a usage error", async () => {
    const r = await lintWiki({});
    const res = await lintJson(r, ["--rules", "--check", "broken-link"], false);
    expect(res.code).toBe(2);
    expect(res.json.error.code).toBe("usage");
  }, T);

  it("S5: an uninitialised repository is not_initialised", async () => {
    const root = await gitRoot();
    const res = await run(root, ["lint", "--json"]);
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe("not_initialised");
  }, T);
});
