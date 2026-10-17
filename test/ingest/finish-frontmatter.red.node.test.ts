import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, setConfigValue } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeFacts } from "../../src/ingest/facts.js";
import { readLogEvents } from "../../src/ingest/log.js";
import { registerSource } from "../../src/ingest/registry.js";
import { validateIngest } from "../../src/ingest/validate.js";
import { runCli } from "../../src/program.js";

const NOW = new Date("2026-10-16T10:00:00Z");
const T = 30_000;
const ID = "src-2026-10-16-notes";

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
}
async function repo(): Promise<Repo> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-fmatter-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  await setConfigValue(root, "ingest.permission", "ai");
  return { root, paths: resolvePaths(root, DEFAULT_CONFIG) };
}

async function register(r: Repo, label: string): Promise<string> {
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
  return meta.id;
}
function factsDoc(id: string, value = "green"): never {
  return {
    source_id: id,
    kind: "status-report",
    rule_version: 2,
    facts: [
      {
        entity: "project:atlas",
        field: "status",
        value,
        status: "decided",
        as_of: "2026-10-16",
        anchor: "Status",
        page: "projects/atlas.md",
        exists: true,
      },
    ],
    uncovered: ["budget"],
  } as never;
}
async function registerWithFacts(r: Repo, label: string): Promise<string> {
  const id = await register(r, label);
  await writeFacts(r.paths, factsDoc(id));
  return id;
}
async function putPage(r: Repo, rel: string, body: string): Promise<void> {
  const file = path.join(r.paths.pagesDir, ...rel.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}
const lockFile = (r: Repo) => path.join(r.root, ".wiki", ".lock");
async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
async function applied(r: Repo, label = "notes"): Promise<string> {
  const id = await registerWithFacts(r, label);
  const res = await run(r.root, ["ingest", "apply", id, "--json"]);
  expect(res.code).toBe(0);
  return id;
}
async function ingestEvents(r: Repo, id: string) {
  return (await readLogEvents(r.paths, { type: "ingest", sourceId: id })).events;
}


// Red tests for STORY-003-09 R10 (walkthrough row 8.3): finish refuses invalid frontmatter on touched pages.
const GLOSSARY_BAD = (id: string) =>
  `---\ntype: glossary\ntitle: Glossary\nsummary: Acmeworks terms: a glossary\n---\n# Glossary\n\n- 2026-10-16 · decided · Acmeworks is the product [[${id}]]\n`;
const GLOSSARY_OK = (id: string) =>
  `---\ntype: glossary\ntitle: Glossary\nsummary: "Acmeworks terms: a glossary"\n---\n# Glossary\n\n- 2026-10-16 · decided · Acmeworks is the product [[${id}]]\n`;

describe("finish — frontmatter validation (R10)", () => {
  it("A1: invalid YAML on a created page is refused, lock and snapshot kept", async () => {
    const r = await repo();
    const id = await applied(r);
    await putPage(r, "glossary.md", GLOSSARY_BAD(id));
    const res = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe("validation_failed");
    const d = res.json.error.details;
    expect(d.invalid).toHaveLength(1);
    expect(d.invalid[0].path).toBe("glossary.md");
    expect(d.invalid[0].message).toMatch(/^line 4: invalid frontmatter YAML: /);
    expect(d.invalid[0].message).not.toContain("\n");
    expect(d.invalid[0].message).not.toMatch(/ at line \d+, column/);
    expect(d.uncited).toEqual([]);
    expect(d.outside).toEqual([]);
    expect(res.json.error.message).toContain("frontmatter errors");
    expect(res.json.error.message).toContain("glossary.md");
    const lock = JSON.parse(await readFile(lockFile(r), "utf8"));
    expect(lock.source_id).toBe(id);
    expect(await exists(path.join(r.root, ".wiki", ".snapshots", id))).toBe(true);
    expect(await ingestEvents(r, id)).toHaveLength(0);
  }, T);

  it("A2: the writer fixes the page in the same write phase and finish succeeds", async () => {
    const r = await repo();
    const id = await applied(r);
    await putPage(r, "glossary.md", GLOSSARY_BAD(id));
    expect((await run(r.root, ["ingest", "finish", id, "--json"])).code).toBe(1);
    await putPage(r, "glossary.md", GLOSSARY_OK(id));
    const res = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(0);
    expect(res.json.data.created).toContain("glossary.md");
    expect(await exists(lockFile(r))).toBe(false);
    expect(await ingestEvents(r, id)).toHaveLength(1);
  }, T);

  it("A3: a field-type error on an updated page is reported", async () => {
    const r = await repo();
    await putPage(r, "projects/atlas.md", "# Atlas\n");
    const id = await applied(r);
    await putPage(r, "projects/atlas.md", `---\ntype: project\ntitle: 2026\n---\n# Atlas\n[[${id}]]\n`);
    const res = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(1);
    expect(res.json.error.details.invalid).toEqual([
      { path: "projects/atlas.md", message: 'frontmatter field "title" must be a string or null' },
    ]);
  }, T);

  it("A4: an invalid page is not judged for citations", async () => {
    const r = await repo();
    const id = await applied(r);
    await putPage(r, "x.md", `---\nsources: [${id}]\nsummary: a: b\n---\n# X\n`);
    const res = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(1);
    const d = res.json.error.details;
    expect((d.invalid ?? []).map((f: { path: string }) => f.path)).toContain("x.md");
    expect(d.uncited).not.toContain("x.md");
  }, T);

  it("A5: scope guard — an untouched page with broken YAML stays a warning", async () => {
    const r = await repo();
    await putPage(r, "old.md", "---\ntitle: Old: page\n---\n# Old\n");
    const id = await applied(r);
    await putPage(r, "notes.md", `# Notes\nSee [[${id}]]\n`);
    const res = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(0);
    expect((res.json.warnings ?? []).join("\n")).toContain(".wiki/pages/old.md");
  }, T);

  it("A6: scope guard — fact-line errors stay warnings", async () => {
    const r = await repo();
    const id = await applied(r);
    await putPage(r, "notes.md", `# Notes\n- 2026-10-16 · maybe · x [[${id}]]\n`);
    const res = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(0);
    const w = (res.json.warnings ?? []).join("\n");
    expect(w).toContain(".wiki/pages/notes.md");
    expect(w).toContain('fact status "maybe"');
  }, T);

  it("A7: validateIngest collects frontmatter errors sorted by path and skips citation for invalid pages", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wk-fmatter-unit-"));
    tmpDirs.push(root);
    const paths = resolvePaths(root, DEFAULT_CONFIG);
    await mkdir(paths.pagesDir, { recursive: true });
    await writeFile(path.join(paths.pagesDir, "b.md"), `---\nsummary: b: c\nsources: [${ID}]\n---\n# B\n`);
    await writeFile(path.join(paths.pagesDir, "a.md"), `---\ntitle: 1\nsummary: [x]\n---\n# A\n[[${ID}]]\n`);
    await writeFile(path.join(paths.pagesDir, "c.md"), `# C\n[[${ID}]]\n`);
    const none = { modified: [], deleted: [] };
    // `invalid` is additive (R10): read it through a cast so this file typechecks today.
    const v = (await validateIngest(
      paths,
      ID,
      { created: ["a.md", "b.md", "c.md"], updated: [], deleted: [] },
      none,
    )) as unknown as { ok: boolean; uncited: string[]; invalid: Array<{ path: string; message: string }> };
    expect(v.ok).toBe(false);
    expect((v.invalid ?? []).map((f) => f.path)).toEqual(["a.md", "a.md", "b.md"]);
    expect(v.uncited).toEqual([]);
    const only = (await validateIngest(
      paths,
      ID,
      { created: ["c.md"], updated: [], deleted: [] },
      none,
    )) as unknown as { ok: boolean; invalid: unknown[] };
    expect(only.invalid).toEqual([]);
    expect(only.ok).toBe(true);
  }, T);
});
