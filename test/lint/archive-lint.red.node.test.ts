// STORY-008-04 QA-Red: lint covers the archive (links, skipped checks, unlogged-change, index-drift, finish hook). Immutable after QA-Red.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLintCommand } from "../../src/commands/lint.js";
import { finishLintHook } from "../../src/commands/ingest-finish.js";
import { DEFAULT_CONFIG, setConfigValue } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeFacts } from "../../src/ingest/facts.js";
import { buildIndex } from "../../src/ingest/index-builder.js";
import { setLintHook } from "../../src/ingest/lint-hook.js";
import { readLogEvents, writeLogEvent } from "../../src/ingest/log.js";
import { registerSource } from "../../src/ingest/registry.js";
import { linkResolver } from "../../src/lint/links.js";
import * as lintPaths from "../../src/lint/paths.js";
import { pageHash } from "../../src/lint/unlogged.js";
import { runCli } from "../../src/program.js";
import { loadPages } from "../../src/wiki/parse-page.js";

const T = 60_000;
const NOW = () => new Date("2026-10-18T12:00:00Z");
const SRC = "src-2026-10-10-a";
const CLEANUP = "src-2026-10-18-cleanup";
const NEXT = "src-2026-10-18-next";

const tmpDirs: string[] = [];
beforeEach(() => {
  setLintHook(finishLintHook);
});
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[], withLint = false) {
  const out: string[] = [];
  const err: string[] = [];
  const opts: any = {
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Object.assign(Readable.from([]), { isTTY: false }),
    },
  };
  if (withLint) opts.commands = [createLintCommand({ now: NOW })];
  const code = await runCli(args, opts);
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
}
async function repo(contentDir?: string): Promise<Repo> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-archlint-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  if (contentDir !== undefined) {
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    await writeFile(path.join(root, ".wiki", "config.yml"), `content_dir: ${contentDir}\n`);
  }
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  await setConfigValue(root, "ingest.permission", "ai");
  return { root, paths: resolvePaths(root, DEFAULT_CONFIG) };
}
async function put(file: string, body: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}
const live = (r: Repo, rel: string) => path.join(r.paths.pagesDir, ...rel.split("/"));
const arch = (r: Repo, rel: string) => path.join(r.root, ".wiki", "archive", ...rel.split("/"));
const fm = (type: string, title: string, extra = "") => `---\ntype: ${type}\ntitle: ${title}\nsummary: ${title} page\n${extra}---\n`;
const srcPage = (id: string) => fm("source", id, `sources: [${id}]\n`) + `# ${id}\n`;
const teamPage = (line: string) => fm("team", "Team") + `# Team\n\n${line}\n`;
const projectPage = (title: string, body = "") => fm("project", title) + `# ${title}\n${body}`;

async function lint(r: Repo, checks: string[]) {
  const res = await run(r.root, ["lint", "--check", ...checks, "--json"], true);
  expect(res.json?.ok, `lint --check ${checks.join(" ")}: ${res.text} ${res.err}`).toBe(true);
  return { ...res, findings: res.json.data.findings as any[] };
}
const byId = (fs: any[], id: string) => fs.filter((f) => f.id === id);

// ---------------------------------------------------------------- units: R2, R3
describe("STORY-008-04 R2 archivePath", () => {
  it("builds repository-relative POSIX paths under archive/, following content_dir", () => {
    const fn = (lintPaths as any).archivePath;
    expect(typeof fn).toBe("function");
    expect(fn(resolvePaths("/proj", DEFAULT_CONFIG), "projects/atlas.md")).toBe(".wiki/archive/projects/atlas.md");
    expect(fn(resolvePaths("/proj", { ...DEFAULT_CONFIG, content_dir: "wiki" }), "a.md")).toBe("wiki/archive/a.md");
  });
});

describe("STORY-008-04 R3 linkResolver", () => {
  async function trees() {
    const r = await repo();
    await put(live(r, "projects/atlas.md"), projectPage("Atlas"));
    await put(arch(r, "projects/atlas.md"), projectPage("Atlas"));
    await put(arch(r, "projects/beta.md"), projectPage("Beta"));
    return { pages: await loadPages(r.paths.pagesDir), archive: await loadPages(r.paths.archiveDir) };
  }
  it("live page first, archive names and the archive/ key, otherwise empty", async () => {
    const { pages, archive } = await trees();
    const resolve = (linkResolver as any)(pages, archive) as (t: string) => string[];
    expect(resolve("atlas")).toEqual(["projects/atlas.md"]);
    expect(resolve("beta")).toEqual(["projects/beta.md"]);
    expect(resolve("projects/beta")).toEqual(["projects/beta.md"]);
    expect(resolve("archive/projects/beta")).toEqual(["projects/beta.md"]);
    expect(resolve("archive/projects/atlas")).toEqual(["projects/atlas.md"]);
    expect(resolve("ghost")).toEqual([]);
  });
  it("without archive pages it behaves as before: archive names do not resolve", async () => {
    const { pages } = await trees();
    const resolve = linkResolver(pages);
    expect(resolve("atlas")).toEqual(["projects/atlas.md"]);
    expect(resolve("beta")).toEqual([]);
    expect(resolve("archive/projects/beta")).toEqual([]);
  });
});

// ---------------------------------------------------------------- S1: links
describe("STORY-008-04 S1 links resolve over pages/ and archive/, the live page first", () => {
  const LINE = (t: string) => `${t} [[${SRC}]]`;
  async function base(line: string): Promise<Repo> {
    const r = await repo();
    await put(live(r, "sources/" + SRC + ".md"), srcPage(SRC));
    await put(live(r, "team.md"), teamPage(line));
    return r;
  }
  const TEAM = ".wiki/pages/team.md";

  it("row 1: a name that exists only in archive/ resolves", async () => {
    const r = await base(LINE("See [[beta]]."));
    await put(arch(r, "projects/beta.md"), projectPage("Beta"));
    const { findings } = await lint(r, ["broken-link", "orphan-page"]);
    expect(byId(findings, "broken-link").filter((f) => f.path === TEAM)).toEqual([]);
  }, T);

  it("row 2: [[archive/<path>]] resolves to the archive page", async () => {
    const r = await base(LINE("See [[archive/projects/atlas]]."));
    await put(live(r, "projects/atlas.md"), projectPage("Atlas"));
    await put(arch(r, "projects/atlas.md"), projectPage("Atlas"));
    const { findings } = await lint(r, ["broken-link", "orphan-page"]);
    expect(byId(findings, "broken-link").filter((f) => f.path === TEAM)).toEqual([]);
  }, T);

  it("row 3: a name in both trees resolves to the live page, which is then linked", async () => {
    const r = await base(LINE("See [[atlas]]."));
    await put(live(r, "projects/atlas.md"), projectPage("Atlas"));
    await put(arch(r, "projects/atlas.md"), projectPage("Atlas"));
    const { findings } = await lint(r, ["broken-link", "orphan-page"]);
    expect(byId(findings, "orphan-page").filter((f) => f.path === ".wiki/pages/projects/atlas.md")).toEqual([]);
    expect(byId(findings, "broken-link").filter((f) => f.path === TEAM)).toEqual([]);
  }, T);

  it("row 4: a name in neither tree is a broken-link error", async () => {
    const r = await base(LINE("See [[ghost]]."));
    await put(arch(r, "projects/beta.md"), projectPage("Beta"));
    const { findings } = await lint(r, ["broken-link", "orphan-page"]);
    const mine = byId(findings, "broken-link").filter((f) => f.path === TEAM);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ severity: "error" });
    expect(mine[0].message).toContain("[[ghost]] does not resolve to a page");
  }, T);

  it("row 5: a link from an archive page does not make a live page linked; archive pages are never orphans", async () => {
    const r = await base(LINE("Team notes."));
    await put(live(r, "projects/atlas.md"), projectPage("Atlas"));
    await put(arch(r, "projects/old.md"), projectPage("Old", `\nSee [[atlas]]. [[${SRC}]]\n`));
    const { findings } = await lint(r, ["broken-link", "orphan-page"]);
    const orphans = byId(findings, "orphan-page");
    const atlas = orphans.filter((f) => f.path === ".wiki/pages/projects/atlas.md");
    expect(atlas).toHaveLength(1);
    expect(atlas[0]).toMatchObject({ severity: "warning" });
    expect(findings.filter((f) => f.path === ".wiki/archive/projects/old.md" && f.id === "orphan-page")).toEqual([]);
    // the archive page was scanned: its link resolved, so it carries no broken-link
    expect(byId(findings, "broken-link").filter((f) => f.path === ".wiki/archive/projects/old.md")).toEqual([]);
  }, T);
});

// ---------------------------------------------------------------- S2: page checks skip the archive
describe("STORY-008-04 S2 page checks skip archive pages; broken-link reads them", () => {
  const BODY =
    "\nstatus:: active\n\n## Facts\n\n- 2026-06-01 · tentative · Beta ships soon.\n\nThe team is happy with the results so far.\n\n" +
    "lorem ipsum dolor sit amet ".repeat(80) +
    "\n\nSee [[ghost]].\n";
  const CHECKS = ["orphan-page", "uncited-claim", "stale-fact", "oversized-page", "broken-link"];
  async function wiki(): Promise<Repo> {
    const r = await repo();
    await setConfigValue(r.root, "tokens.page.yellow", 50);
    await setConfigValue(r.root, "tokens.page.red", 100);
    await setConfigValue(r.root, "lint.stale_after_days", 30);
    await put(live(r, "team.md"), teamPage(`Team notes. [[${SRC}]]`));
    return r;
  }

  it("no orphan/uncited/stale/oversized finding names archive/, and one broken-link error does", async () => {
    const r = await wiki();
    await put(arch(r, "projects/beta.md"), projectPage("Beta", BODY));
    const { findings } = await lint(r, CHECKS);
    const onArchive = findings.filter((f) => typeof f.path === "string" && f.path.startsWith(".wiki/archive/"));
    expect(onArchive.filter((f) => f.id !== "broken-link")).toEqual([]);
    const broken = onArchive.filter((f) => f.id === "broken-link");
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ severity: "error", path: ".wiki/archive/projects/beta.md" });
    expect(broken[0].message).toContain("[[ghost]] does not resolve to a page");
  }, T);

  it("canary: the same page as a live page does produce orphan, uncited-claim and oversized-page findings", async () => {
    const r = await wiki();
    await put(live(r, "projects/beta.md"), projectPage("Beta", BODY));
    const { findings } = await lint(r, CHECKS);
    const mine = findings.filter((f) => f.path === ".wiki/pages/projects/beta.md").map((f) => f.id);
    expect(mine).toContain("orphan-page");
    expect(mine).toContain("uncited-claim");
    expect(mine).toContain("oversized-page");
  }, T);

  it("the first human line counts the archived pages", async () => {
    const r = await wiki();
    await put(arch(r, "projects/beta.md"), projectPage("Beta", BODY));
    const res = await run(r.root, ["lint"], true);
    expect(res.text.split("\n")[0]!.startsWith("checked 1 page and 1 archived page with")).toBe(true);
  }, T);

  it("three archived pages are counted in the plural; no archive keeps the old line", async () => {
    const r = await wiki();
    for (const n of ["a", "b", "c"]) await put(arch(r, `projects/${n}.md`), projectPage(n.toUpperCase()));
    const res = await run(r.root, ["lint"], true);
    expect(res.text.split("\n")[0]!.startsWith("checked 1 page and 3 archived pages with")).toBe(true);
    const plain = await wiki();
    const res2 = await run(plain.root, ["lint"], true);
    expect(res2.text.split("\n")[0]!.startsWith("checked 1 page with")).toBe(true);
  }, T);
});

// ---------------------------------------------------------------- S3: unlogged-change
describe("STORY-008-04 S3 unlogged-change covers archive/", () => {
  const ATLAS_LIVE = projectPage("Atlas", `\n- 2026-10-18 · decided · Atlas clean-up agreed. [[${CLEANUP}]]\n`);
  const ATLAS_ARCH = projectPage("Atlas", `\n- 2026-08-01 · tentative · Atlas ships 2026-09-30. [[${CLEANUP}]]\n`);
  const UNL = "unlogged-change";

  async function wiki(): Promise<{ r: Repo; file: string }> {
    const r = await repo();
    await put(live(r, "projects/atlas.md"), ATLAS_LIVE);
    await put(arch(r, "projects/atlas.md"), ATLAS_ARCH);
    await writeLogEvent(r.paths, {
      type: "ingest",
      at: "2026-10-18T09:00:00.000Z",
      source_id: CLEANUP,
      kind: "status-report",
      rule_version: null,
      permission: "ai",
      origin: "docs/cleanup.md",
      created: ["projects/atlas.md"],
      updated: [],
      deleted: [],
      contradictions: 0,
      rule_suggestions: 0,
      page_hashes: { "projects/atlas.md": pageHash(ATLAS_LIVE) },
      archive_hashes: { "projects/atlas.md": pageHash(ATLAS_ARCH) },
    } as never);
    const file = (await readLogEvents(r.paths, { type: "ingest", sourceId: CLEANUP })).events[0]!.file as string;
    return { r, file };
  }
  const onArchive = (fs: any[]) => byId(fs, UNL).filter((f) => String(f.path).startsWith(".wiki/archive/"));

  it("row 1: nothing changes, no archive finding, exit 0", async () => {
    const { r } = await wiki();
    const res = await run(r.root, ["lint", "--check", UNL, "--json"], true);
    expect(res.json.ok).toBe(true);
    expect(onArchive(res.json.data.findings)).toEqual([]);
    expect(res.code).toBe(0);
  }, T);

  it("row 2: a hand-appended line is an error naming the ingest and the log file", async () => {
    const { r, file } = await wiki();
    await writeFile(arch(r, "projects/atlas.md"), ATLAS_ARCH + "Edited by hand.\n");
    const { findings } = await lint(r, [UNL]);
    const mine = onArchive(findings);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ severity: "error", path: ".wiki/archive/projects/atlas.md" });
    expect(mine[0].message).toContain(`changed since ingest ${CLEANUP} recorded it (${file})`);
  }, T);

  it("row 3: a hand-deleted archive file is an error", async () => {
    const { r, file } = await wiki();
    await rm(arch(r, "projects/atlas.md"));
    const { findings } = await lint(r, [UNL]);
    const mine = onArchive(findings);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ severity: "error", path: ".wiki/archive/projects/atlas.md" });
    expect(mine[0].message).toContain(`deleted without a log entry (last recorded by ingest ${CLEANUP}, ${file})`);
  }, T);

  it("row 4: a hand-created archive file is in no ingest log event", async () => {
    const { r } = await wiki();
    await put(arch(r, "notes/old.md"), projectPage("Old"));
    const { findings } = await lint(r, [UNL]);
    const mine = onArchive(findings);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ severity: "error", path: ".wiki/archive/notes/old.md" });
    expect(mine[0].message).toContain("in no ingest log event");
  }, T);

  it("row 5: a private entry also covers its archive file", async () => {
    const { r } = await wiki();
    await setConfigValue(r.root, "private", ["team.md"]);
    await put(arch(r, "team.md"), teamPage("Hand made."));
    const { findings } = await lint(r, [UNL]);
    expect(onArchive(findings).filter((f) => f.path === ".wiki/archive/team.md")).toEqual([]);
    // canary: the same fixture without the private entry does flag it
    await setConfigValue(r.root, "private", []);
    const again = await lint(r, [UNL]);
    expect(onArchive(again.findings).filter((f) => f.path === ".wiki/archive/team.md")).toHaveLength(1);
  }, T);

  it("row 6: during an open write phase the message ends with the applied ingest", async () => {
    const { r } = await wiki();
    await writeFile(arch(r, "projects/atlas.md"), ATLAS_ARCH + "Edited by hand.\n");
    await put(path.join(r.root, "docs", "next.md"), "content of next\n");
    const meta = await registerSource(r.paths, {
      originType: "file",
      origin: "docs/next.md",
      label: "next",
      originalPath: path.join(r.root, "docs", "next.md"),
      text: null,
      kind: "status-report",
      providedBy: "user",
      ruleVersion: null,
      reingestOf: null,
      permission: { mode: "ai", approved: false, matched: null, kind_pending: false },
      now: new Date("2026-10-18T10:00:00Z"),
    } as never);
    expect(meta.id).toBe(NEXT);
    await writeFacts(r.paths, {
      source_id: meta.id,
      kind: "status-report",
      rule_version: 2,
      facts: [
        { entity: "project:atlas", field: "status", value: "ok", status: "decided", as_of: "2026-10-18", anchor: "Status", page: "projects/atlas.md", exists: true },
      ],
      uncovered: [],
    } as never);
    expect((await run(r.root, ["ingest", "apply", NEXT, "--json"])).code).toBe(0);
    const { findings } = await lint(r, [UNL]);
    const mine = onArchive(findings);
    expect(mine).toHaveLength(1);
    expect(mine[0].path).toBe(".wiki/archive/projects/atlas.md");
    expect(mine[0].message.endsWith(`, before ingest ${NEXT} was applied`)).toBe(true);
  }, T);
});

// ---------------------------------------------------------------- S4: index-drift
describe("STORY-008-04 S4 index-drift counts the archive", () => {
  const DRIFT = "index.md is out of date: run wikeeper index rebuild";
  async function wiki(): Promise<Repo> {
    const r = await repo();
    await put(live(r, "team.md"), teamPage("Team notes."));
    await put(arch(r, "projects/a.md"), projectPage("A"));
    await put(arch(r, "projects/b.md"), projectPage("B"));
    return r;
  }
  const drift = (fs: any[]) => byId(fs, "index-drift");

  it("row 1: an index written by index rebuild has no drift", async () => {
    const r = await wiki();
    expect((await run(r.root, ["index", "rebuild", "--json"])).code).toBe(0);
    expect(drift((await lint(r, ["index-drift"])).findings)).toEqual([]);
  }, T);

  it("row 2: a third archive page added afterwards is drift", async () => {
    const r = await wiki();
    expect((await run(r.root, ["index", "rebuild", "--json"])).code).toBe(0);
    await put(arch(r, "projects/c.md"), projectPage("C"));
    const mine = drift((await lint(r, ["index-drift"])).findings);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ severity: "warning" });
    expect(mine[0].message).toContain(DRIFT);
  }, T);

  it("row 3: an index built without the archived line is drift", async () => {
    const r = await wiki();
    await writeFile(path.join(r.paths.contentDir, "index.md"), buildIndex(await loadPages(r.paths.pagesDir)));
    const mine = drift((await lint(r, ["index-drift"])).findings);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ severity: "warning" });
    expect(mine[0].message).toContain(DRIFT);
  }, T);
});

// ---------------------------------------------------------------- S5: ingest finish
describe("STORY-008-04 S5 ingest finish lints the archive pages it changed", () => {
  const REVIEW = "src-2026-10-10-review";
  const F1 = `- 2026-10-01 · tentative · Atlas ships 2026-10-15. [[${REVIEW}]]`;
  const F2 = `- 2026-10-10 · decided · Atlas ships 2026-11-03. [[${REVIEW}]]`;
  const ATLAS_BEFORE = fm("project", "Atlas", `sources: [${REVIEW}]\n`) + `# Atlas\n\n## Facts\n\n${F1}\n${F2}\n`;
  const ATLAS_AFTER =
    fm("project", "Atlas", `sources: [${REVIEW}, ${CLEANUP}]\n`) + `# Atlas\n\narchive:: [[archive/projects/atlas]]\n\n## Facts\n\n${F1}\n${F2}\n`;
  const ARCHIVE_ATLAS = fm("project", "Atlas") + `# Atlas\n\n## Facts\n\n${F1}\n\nSee [[ghost]].\n`;

  it("resolves the archive link and reports only the broken link on the archive page", async () => {
    const r = await repo();
    await put(live(r, "projects/atlas.md"), ATLAS_BEFORE);
    await put(live(r, `sources/${REVIEW}.md`), srcPage(REVIEW));
    await put(path.join(r.root, "docs", "cleanup.md"), "content of cleanup\n");
    const meta = await registerSource(r.paths, {
      originType: "file",
      origin: "docs/cleanup.md",
      label: "cleanup",
      originalPath: path.join(r.root, "docs", "cleanup.md"),
      text: null,
      kind: "status-report",
      providedBy: "user",
      ruleVersion: null,
      reingestOf: null,
      permission: { mode: "ai", approved: false, matched: null, kind_pending: false },
      now: new Date("2026-10-18T10:00:00Z"),
    } as never);
    expect(meta.id).toBe(CLEANUP);
    await writeFacts(r.paths, {
      source_id: meta.id,
      kind: "status-report",
      rule_version: 2,
      facts: [
        { entity: "project:atlas", field: "status", value: "clean-up agreed", status: "decided", as_of: "2026-10-18", anchor: "Status", page: "projects/atlas.md", exists: true },
      ],
      uncovered: [],
    } as never);
    expect((await run(r.root, ["ingest", "apply", CLEANUP, "--json"])).code).toBe(0);
    await put(arch(r, "projects/atlas.md"), ARCHIVE_ATLAS);
    await writeFile(live(r, "projects/atlas.md"), ATLAS_AFTER);
    await put(live(r, `sources/${CLEANUP}.md`), srcPage(CLEANUP));

    const fin = await run(r.root, ["ingest", "finish", CLEANUP, "--json"]);
    expect(fin.code, fin.text + fin.err).toBe(0);
    const warnings: string[] = fin.json.warnings ?? [];
    expect(await readFile(arch(r, "projects/atlas.md"), "utf8")).toBe(ARCHIVE_ATLAS);
    expect(warnings.filter((w) => w.startsWith("lint [error] broken-link .wiki/pages/projects/atlas.md"))).toEqual([]);
    expect(warnings.filter((w) => w.startsWith("lint [error] uncited-claim .wiki/pages/projects/atlas.md"))).toEqual([]);
    const ghost = warnings.filter((w) => w.startsWith("lint [error] broken-link .wiki/archive/projects/atlas.md"));
    expect(ghost).toHaveLength(1);
    expect(ghost[0]).toContain("[[ghost]] does not resolve to a page");
    expect(warnings.filter((w) => w.startsWith("lint [error] unlogged-change .wiki/archive/"))).toEqual([]);
  }, T);
});
