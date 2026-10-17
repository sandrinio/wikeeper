// STORY-005-03 QA-Red: page hashes, unlogged-change, the lint hook in finish. Immutable after QA-Red.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, setConfigValue } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeFacts } from "../../src/ingest/facts.js";
import { setLintHook } from "../../src/ingest/lint-hook.js";
import { readLogEvents, writeLogEvent } from "../../src/ingest/log.js";
import { registerSource } from "../../src/ingest/registry.js";
import { hashTree } from "../../src/ingest/snapshot.js";
import { runCli } from "../../src/program.js";

const T = 30_000;
const NOW = new Date("2026-10-16T10:00:00Z");
const NOTES = "src-2026-10-16-notes";
const PLAN = "src-2026-10-15-plan";
const UNL = "unlogged-change";

const tmpDirs: string[] = [];
beforeEach(async () => {
  // Restore the real hook if the story's module exports it (a stray reset must not leave later tests without it).
  const mod = (await import("../../src/commands/ingest-finish.js")) as any;
  if (typeof mod.finishLintHook === "function") setLintHook(mod.finishLintHook);
});
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

const sha = (text: string): string =>
  createHash("sha256").update(text.replace(/^﻿/, "").replace(/\r\n/g, "\n"), "utf8").digest("hex");

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
}
async function repo(): Promise<Repo> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-unlogged-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  await setConfigValue(root, "ingest.permission", "ai");
  return { root, paths: resolvePaths(root, DEFAULT_CONFIG) };
}
async function putPage(r: Repo, rel: string, body: string): Promise<void> {
  const file = path.join(r.paths.pagesDir, ...rel.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}
const readPage = (r: Repo, rel: string) => readFile(path.join(r.paths.pagesDir, ...rel.split("/")), "utf8");
async function appendPage(r: Repo, rel: string, extra: string): Promise<void> {
  await putPage(r, rel, (await readPage(r, rel)) + extra);
}

async function record(
  r: Repo,
  o: { id: string; at: string; created?: string[]; updated?: string[]; deleted?: string[]; hashes?: Record<string, string> | null },
): Promise<string> {
  const event: any = {
    type: "ingest",
    at: o.at,
    source_id: o.id,
    kind: "status-report",
    rule_version: null,
    permission: "ai",
    origin: "docs/fixture.md",
    created: o.created ?? [],
    updated: o.updated ?? [],
    deleted: o.deleted ?? [],
    contradictions: 0,
    rule_suggestions: 0,
  };
  if (o.hashes !== null && o.hashes !== undefined) event.page_hashes = o.hashes;
  return writeLogEvent(r.paths, event);
}
async function hashesOf(r: Repo, rels: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const rel of rels) out[rel] = sha(await readPage(r, rel));
  return out;
}

const fm = (type: string, title: string, extra = "") => `---\ntype: ${type}\ntitle: ${title}\nsummary: ${title} page\n${extra}---\n`;
const srcPage = (id: string) => fm("source", "Notes", `sources: [${id}]\n`) + "# Notes\n";

async function unl(r: Repo, extra: string[] = []) {
  const res = await run(r.root, ["lint", "--check", UNL, ...extra, "--json"]);
  expect(res.json?.ok, `lint --check ${UNL}: ${res.text} ${res.err}`).toBe(true);
  const findings = (res.json.data.findings as any[]).filter((f) => f.id === UNL);
  return { ...res, findings };
}

/** Scenario 1 wiki: ingest NOTES created team.md, risks.md and the source page, with hashes. */
async function s1Wiki(): Promise<Repo> {
  const r = await repo();
  await putPage(r, "team.md", `# Team\n\nSee [[${NOTES}]].\n`);
  await putPage(r, "risks.md", `# Risks\n\nSee [[${NOTES}]].\n`);
  await putPage(r, `sources/${NOTES}.md`, srcPage(NOTES));
  const rels = ["risks.md", `sources/${NOTES}.md`, "team.md"];
  await record(r, { id: NOTES, at: "2026-10-16T09:00:00.000Z", created: rels, hashes: await hashesOf(r, rels) });
  expect((await run(r.root, ["index", "rebuild", "--json"])).code).toBe(0);
  return r;
}

describe("STORY-005-03 unlogged-change (red)", () => {
  it("S1 row 1: a shell edit is an error naming the ingest", async () => {
    const r = await s1Wiki();
    await appendPage(r, "team.md", "\nEdited by the shell.\n");
    const res = await run(r.root, ["lint", "--json"]);
    expect(res.json.ok).toBe(true);
    const mine = (res.json.data.findings as any[]).filter((f) => f.id === UNL);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ severity: "error", path: ".wiki/pages/team.md" });
    expect(mine[0].line).toBeUndefined();
    expect(mine[0].message).toContain(`changed since ingest ${NOTES} recorded it`);
    expect(res.code).toBe(1);
    const human = await run(r.root, ["lint"]);
    expect(
      human.text.split("\n").some((l) => l.startsWith(`[error] ${UNL} .wiki/pages/team.md: changed since ingest ${NOTES} recorded it`)),
    ).toBe(true);
  }, T);

  it("S1 row 2: a deleted page is an error", async () => {
    const r = await s1Wiki();
    await rm(path.join(r.paths.pagesDir, "team.md"));
    const res = await run(r.root, ["lint", "--json"]);
    const mine = (res.json.data.findings as any[]).filter((f) => f.id === UNL);
    expect(mine).toContainEqual(expect.objectContaining({ severity: "error", path: ".wiki/pages/team.md" }));
    expect(mine.find((f) => f.path === ".wiki/pages/team.md").message).toContain("deleted without a log entry");
    expect(res.code).toBe(1);
  }, T);

  it("S1 row 3: a page created with the shell is in no log event", async () => {
    const r = await s1Wiki();
    await putPage(r, "notes.md", "# Notes\n");
    const res = await run(r.root, ["lint", "--json"]);
    const mine = (res.json.data.findings as any[]).filter((f) => f.id === UNL);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ severity: "error", path: ".wiki/pages/notes.md" });
    expect(mine[0].message).toContain("in no ingest log event");
  }, T);

  it("S1 row 4: deleted by an ingest then written again with the shell", async () => {
    const r = await s1Wiki();
    await record(r, { id: "src-2026-10-17-cleanup", at: "2026-10-17T09:00:00.000Z", deleted: ["risks.md"], hashes: {} });
    // risks.md still exists on disk (written again with the shell)
    await putPage(r, "risks.md", "# Risks again\n");
    const res = await run(r.root, ["lint", "--json"]);
    const mine = (res.json.data.findings as any[]).filter((f) => f.id === UNL);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ severity: "error", path: ".wiki/pages/risks.md" });
    expect(mine[0].message).toContain("created again without a log entry");
    expect(mine[0].message).toContain("src-2026-10-17-cleanup");
  }, T);

  it("S1 row 5: CRLF and a BOM alone are not a change", async () => {
    const r = await s1Wiki();
    const text = await readPage(r, "team.md");
    await putPage(r, "team.md", "﻿" + text.replace(/\n/g, "\r\n"));
    const first = await unl(r);
    expect(first.findings).toEqual([]);
    const res = await run(r.root, ["lint", "--json"]);
    expect(res.json.ok).toBe(true);
    expect((res.json.data.findings as any[]).filter((f) => f.id === UNL)).toEqual([]);
    expect(res.code).toBe(0);
  }, T);

  it("S1 row 6: a private page is never judged", async () => {
    const r = await s1Wiki();
    await setConfigValue(r.root, "private", ["team.md"]);
    await appendPage(r, "team.md", "\nEdited by the shell.\n");
    const res = await unl(r);
    expect(res.findings).toEqual([]);
  }, T);

  it("S1: a private directory entry covers the pages inside it", async () => {
    const r = await s1Wiki();
    await putPage(r, "hr/pay.md", "# Pay\n");
    await setConfigValue(r.root, "private", ["hr"]);
    const res = await unl(r);
    expect(res.findings).toEqual([]);
  }, T);
});

// --- real apply + finish helpers (the applied() flow of test/ingest/finish.red.node.test.ts) ---
async function registerWithFacts(r: Repo, label: string): Promise<string> {
  const rel = `docs/${label}.md`;
  await mkdir(path.join(r.root, "docs"), { recursive: true });
  await writeFile(path.join(r.root, rel), `content of ${label}\n`);
  const meta = await registerSource(r.paths, {
    originType: "file",
    origin: rel,
    label,
    originalPath: path.join(r.root, rel),
    text: null,
    kind: "status-report",
    providedBy: "user",
    ruleVersion: null,
    reingestOf: null,
    permission: { mode: "ai", approved: false, matched: null, kind_pending: false },
    now: NOW,
  });
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
        page: "team.md",
        exists: false,
      },
    ],
    uncovered: [],
  } as never);
  return meta.id;
}
async function applied(r: Repo): Promise<string> {
  const id = await registerWithFacts(r, "notes");
  expect(id).toBe(NOTES);
  const res = await run(r.root, ["ingest", "apply", id, "--json"]);
  expect(res.code).toBe(0);
  return id;
}

describe("STORY-005-03 page hashes and the baseline (red)", () => {
  it("S2: pre-0.3.0 pages are the baseline; finish records hashes", async () => {
    const r = await repo();
    await putPage(r, "old.md", "# Old\n");
    await record(r, { id: "src-2026-10-01-old", at: "2026-10-01T09:00:00.000Z", created: ["old.md"] });
    await appendPage(r, "old.md", "\n## Members\n");

    const before = await unl(r);
    expect(before.findings.filter((f) => f.path !== undefined)).toEqual([]);
    const info = before.findings.filter((f) => f.path === undefined);
    expect(info).toHaveLength(1);
    expect(info[0].severity).toBe("info");
    expect(info[0].message).toContain("1 page(s) were last recorded by an ingest without page hashes");

    const id = await applied(r);
    await putPage(r, "team.md", `# Team\n\nSee [[${id}]].\n`);
    await appendPage(r, "old.md", `\nSee [[${id}]].\n`);
    const fin = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(fin.code, fin.text + fin.err).toBe(0);

    const ev = (await readLogEvents(r.paths, { type: "ingest", sourceId: id })).events;
    expect(ev).toHaveLength(1);
    const hashes = (ev[0]!.event as any).page_hashes;
    expect(Object.keys(hashes).sort()).toEqual(["old.md", "team.md"]);
    expect(hashes["old.md"]).toBe(sha(await readPage(r, "old.md")));
    expect(hashes["team.md"]).toBe(sha(await readPage(r, "team.md")));
    for (const v of Object.values(hashes)) expect(v).toMatch(/^[0-9a-f]{64}$/);

    const plain = await run(r.root, ["lint", "--json"]);
    expect(plain.json.ok).toBe(true);
    expect((plain.json.data.findings as any[]).filter((f) => f.id === UNL)).toEqual([]);
  }, T);

  it("S2: an ingest with no changed page records page_hashes: {}", async () => {
    const r = await repo();
    await putPage(r, "keep.md", "# Keep\n");
    const id = await applied(r);
    const fin = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(fin.code, fin.text + fin.err).toBe(0);
    const ev = (await readLogEvents(r.paths, { type: "ingest", sourceId: id })).events;
    expect((ev[0]!.event as any).page_hashes).toEqual({});
  }, T);
});

describe("STORY-005-03 the finish lint hook (red)", () => {
  it("S3: lint before finish judges the wiki as at apply; finish reports", async () => {
    const r = await repo();
    await putPage(r, "roadmap.md", `# Roadmap\n\nSee [[${PLAN}]].\n`);
    await putPage(r, "glossary.md", "# Glossary\n\nSee [[Nobody]].\n");
    await putPage(r, `sources/${PLAN}.md`, srcPage(PLAN));
    const rels = ["glossary.md", "roadmap.md", `sources/${PLAN}.md`];
    await record(r, { id: PLAN, at: "2026-10-15T09:00:00.000Z", created: rels, hashes: await hashesOf(r, rels) });
    await appendPage(r, "roadmap.md", "\n## Q4\n");

    const id = await applied(r);
    // the writer
    await appendPage(r, "roadmap.md", `\nSee [[${id}]].\n`);
    await putPage(
      r,
      "team.md",
      "# Team\n\n" + `Platform team notes. [[${id}]]\n\n## Facts\n\n- 2026-10-16 · decided · Ana leads QA.\n\n` + `See [[Nobody Here]] [[${id}]].\n`,
    );

    const treeBefore = await hashTree(r.root);
    const mid = await unl(r);
    expect(mid.findings.map((f) => f.path)).toEqual([".wiki/pages/roadmap.md"]);
    expect(mid.findings[0].message).toContain(`changed since ingest ${PLAN} recorded it`);
    expect(await hashTree(r.root)).toEqual(treeBefore);

    const fin = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(fin.code, fin.text + fin.err).toBe(0);
    const lockGone = await readdir(path.join(r.root, ".wiki"));
    expect(lockGone).not.toContain(".lock");

    const lint = fin.json.data.lint as any[];
    const has = (fid: string, p: string) => lint.some((f) => f.id === fid && f.path === p);
    expect(has(UNL, ".wiki/pages/roadmap.md")).toBe(true);
    expect(has("uncited-claim", ".wiki/pages/team.md")).toBe(true);
    expect(has("broken-link", ".wiki/pages/team.md")).toBe(true);
    expect(lint.filter((f) => f.path === ".wiki/pages/glossary.md")).toEqual([]);
    for (const f of lint) expect(["broken-link", "uncited-claim", UNL]).toContain(f.id);
    const warnings = fin.json.warnings as string[];
    expect(
      warnings.some((w) =>
        w.startsWith(`lint [error] ${UNL} .wiki/pages/roadmap.md: changed since ingest ${PLAN} recorded it`),
      ),
    ).toBe(true);

    const after = await unl(r);
    expect(after.findings).toEqual([]);
  }, T);
});

describe("STORY-005-03 earlier lint results hold (red)", () => {
  const Q4 = "src-2026-10-16-q4";
  const TEAM =
    fm("team", "Team") +
    "# Team\n\n" +
    `Platform team notes. [[${Q4}]]\n\n` +
    "## Facts\n\n" +
    "- 2026-10-15 · decided · Ana leads QA.\n\n" +
    `See [[Nobody Here]] [[${Q4}]].\n`;
  const SRC = fm("source", "Q4 notes", `sources: [${Q4}]\n`) + "# Q4 notes\n";

  async function wiki(withEvent: boolean): Promise<Repo> {
    const r = await repo();
    await putPage(r, "team.md", TEAM);
    await putPage(r, `sources/${Q4}.md`, SRC);
    if (withEvent) {
      const rels = [`sources/${Q4}.md`, "team.md"];
      await record(r, { id: "src-2026-10-16-fixture", at: "2026-10-16T09:00:00.000Z", created: rels, hashes: await hashesOf(r, rels) });
    }
    expect((await run(r.root, ["index", "rebuild", "--json"])).code).toBe(0);
    return r;
  }

  it("S4: with a recorded event there is no unlogged-change finding and the counts hold", async () => {
    const r = await wiki(true);
    const res = await run(r.root, ["lint", "--json"]);
    expect(res.json.ok).toBe(true);
    expect((res.json.data.findings as any[]).filter((f) => f.id === UNL)).toEqual([]);
    expect(res.json.data.counts.error).toBe(2);
    expect(res.code).toBe(1);
  }, T);

  it("S4: without it every page is in no ingest log event; --check still isolates the two", async () => {
    const r = await wiki(false);
    const res = await run(r.root, ["lint", "--json"]);
    const mine = (res.json.data.findings as any[]).filter((f) => f.id === UNL);
    expect(mine.map((f) => f.path).sort()).toEqual([`.wiki/pages/sources/${Q4}.md`, ".wiki/pages/team.md"].sort());
    for (const f of mine) {
      expect(f.severity).toBe("error");
      expect(f.message).toContain("in no ingest log event");
    }
    const sub = await run(r.root, ["lint", "--check", "uncited-claim", "--check", "broken-link", "--json"]);
    expect(sub.json.ok).toBe(true);
    const f = sub.json.data.findings as any[];
    expect(f).toHaveLength(2);
    for (const x of f) expect(x.path).toBe(".wiki/pages/team.md");
  }, T);
});

describe("STORY-005-03 malformed page_hashes (red)", () => {
  it("S5 row 1: writeLogEvent refuses a short hash and writes nothing", async () => {
    const r = await repo();
    await expect(
      record(r, { id: NOTES, at: "2026-10-16T09:00:00.000Z", created: ["team.md"], hashes: { "team.md": "abc" } }),
    ).rejects.toMatchObject({ code: "invalid_event", message: expect.stringContaining("page_hashes") });
    const names = (await readdir(path.join(r.root, ".wiki", "log"))).filter((n) => !n.startsWith("."));
    expect(names).toEqual([]);
  }, T);

  it("S5 row 2: a hand-edited page_hashes counts as missing on read", async () => {
    const r = await repo();
    await putPage(r, "team.md", "# Team\n");
    await record(r, {
      id: NOTES,
      at: "2026-10-16T09:00:00.000Z",
      created: ["team.md"],
      hashes: { "team.md": sha("# Team\n") },
    });
    const events = (await readLogEvents(r.paths, { type: "ingest" })).events;
    const file = path.join(r.root, ...events[0]!.file.split("/"));
    const text = await readFile(file, "utf8");
    const re = /^page_hashes:.*(?:\n[ \t]+.*)*/m;
    const edited = re.test(text) ? text.replace(re, "page_hashes: oops") : text.replace(/\n---\n/, "\npage_hashes: oops\n---\n");
    expect(edited).not.toBe(text);
    await writeFile(file, edited);
    await appendPage(r, "team.md", "\n## Members\n");
    expect((await run(r.root, ["index", "rebuild", "--json"])).code).toBe(0);

    const res = await unl(r);
    expect(res.findings.filter((f) => f.path === ".wiki/pages/team.md")).toEqual([]);
    const info = res.findings.filter((f) => f.path === undefined);
    expect(info).toHaveLength(1);
    expect(info[0].message).toContain("1 page(s) were last recorded by an ingest without page hashes");
    const plain = await run(r.root, ["lint", "--json"]);
    expect(plain.code).toBe(0);
  }, T);
});
