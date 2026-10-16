import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, setConfigValue } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeFacts } from "../../src/ingest/facts.js";
import { readLogEvents, writeLogEvent } from "../../src/ingest/log.js";
import { registerSource } from "../../src/ingest/registry.js";
import { runCli } from "../../src/program.js";

const NOW = new Date("2026-10-16T10:00:00Z");
const T = 30_000;
const NOTES = "src-2026-10-16-notes";
const OLDER = "src-2026-10-16-older";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
  const lh = await load("../../src/ingest/lint-hook.js").catch(() => null);
  if (lh) lh.setLintHook(null);
});

async function load(_spec: string): Promise<any> {
  return import("../../src/ingest/lint-hook.js");
}

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
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-finish-"));
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

const ATLAS_NEW = (id: string) =>
  `---\ntype: project\ntitle: Atlas\nsummary: Atlas project\n---\n# Atlas\n\n## Facts\n\n` +
  `- 2026-10-16 · decided · launch in March [[${id}]]\n` +
  `- 2026-10-16 · decided · launch in April [[${id}]] · contradicts:: [[src-2026-10-01-old]]\n`;
const SOURCE_PAGE = (id: string) => `---\ntype: source\ntitle: Notes\nsources: [${id}]\n---\n# Notes\n`;

async function s1(): Promise<{ r: Repo; id: string }> {
  const r = await repo();
  const id = await registerWithFacts(r, "notes");
  expect(id).toBe(NOTES);
  await putPage(r, "projects/atlas.md", "# Atlas\n");
  expect((await run(r.root, ["ingest", "apply", id, "--json"])).code).toBe(0);
  await putPage(r, "projects/atlas.md", ATLAS_NEW(id));
  await putPage(r, "sources/" + id + ".md", SOURCE_PAGE(id));
  return { r, id };
}

describe("STORY-003-09 ingest finish (red)", () => {
  it("S1: a cited write is recorded and reported", async () => {
    const { r, id } = await s1();
    const res = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(0);
    const d = res.json.data;
    expect(d.source_id).toBe(id);
    expect(d.updated).toEqual(["projects/atlas.md"]);
    expect(d.created).toEqual([`sources/${id}.md`]);
    expect(d.deleted).toEqual([]);
    expect(d.contradictions).toBe(1);
    expect(d.rule_suggestions).toBe(1);
    expect(d.permission).toBe("ai");
    expect(d.origin).toBe("docs/notes.md");
    expect(d.kind).toBe("status-report");
    expect(d.rule_version).toBe(2);
    expect(typeof d.log_file).toBe("string");
    const events = await ingestEvents(r, id);
    expect(events).toHaveLength(1);
    const ev = events[0]!.event as any;
    expect(ev.created).toEqual([`sources/${id}.md`]);
    expect(ev.updated).toEqual(["projects/atlas.md"]);
    expect(await readFile(path.join(r.root, ".wiki", "index.md"), "utf8")).toContain("pages/projects/atlas.md");
    expect(await readFile(path.join(r.root, ".wiki", "log.md"), "utf8")).toContain(id);
    expect(await exists(lockFile(r))).toBe(false);
    expect(await exists(path.join(r.root, ".wiki", ".snapshots", id))).toBe(false);
  }, T);

  it("S1: human output starts with the Ingested line", async () => {
    const { r, id } = await s1();
    const res = await run(r.root, ["ingest", "finish", id]);
    expect(res.code).toBe(0);
    expect(res.text.split("\n")[0]).toBe(`✅ Ingested ${id}`);
  }, T);

  it.each([
    {
      change: "pages/team.md changed without the citation",
      list: "uncited",
      file: "team.md",
      pre: true,
      mutate: async (r: Repo) => putPage(r, "team.md", "# Team\nchanged\n"),
    },
    {
      change: "raw/older.meta.json was edited",
      list: "outside",
      file: `raw/${OLDER}.meta.json`,
      pre: false,
      mutate: async (r: Repo) => {
        const f = path.join(r.root, ".wiki", "raw", `${OLDER}.meta.json`);
        await writeFile(f, (await readFile(f, "utf8")) + "\n ");
      },
    },
    {
      change: "index.md was edited",
      list: "outside",
      file: "index.md",
      pre: false,
      mutate: async (r: Repo) => {
        const f = path.join(r.root, ".wiki", "index.md");
        await writeFile(f, (await readFile(f, "utf8")) + "\nhand edit\n");
      },
    },
  ])("S2: finish rejects $change", async ({ list, file, mutate }) => {
    const r = await repo();
    await register(r, "older");
    await putPage(r, "team.md", "# Team\n");
    const id = await applied(r);
    await mutate(r);
    const res = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe("validation_failed");
    expect(res.json.error.details[list]).toContain(file);
    expect(JSON.parse(await readFile(lockFile(r), "utf8")).source_id).toBe(id);
    expect(await ingestEvents(r, id)).toHaveLength(0);
  }, T);

  it("S3: post steps report problems but never undo a validated ingest", async () => {
    const r = await repo();
    await setConfigValue(r.root, "hooks.post_ingest", [
      'node -e "process.exit(1)"',
      "node -e \"require('fs').writeFileSync('hook.txt', '{source_id}')\"",
    ]);
    const lint = await load("../../src/ingest/lint-hook.js");
    lint.setLintHook(async () => [{ id: "probe", severity: "warning", message: "probe finding" }]);
    const id = await applied(r);
    await putPage(r, "notes.md", `# Notes\nSee [[${id}]]\n`);
    const res = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(0);
    expect(await exists(lockFile(r))).toBe(false);
    const warnings = (res.json.warnings as string[]).join("\n");
    expect(warnings).toContain("process.exit(1)");
    expect(warnings).toContain("probe finding");
    expect(await readFile(path.join(r.root, "hook.txt"), "utf8")).toBe(id);
  }, T);

  it("S4 row 1: registered with facts but not applied", async () => {
    const r = await repo();
    const id = await registerWithFacts(r, "notes");
    const res = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe("not_applied");
  }, T);

  it("S4 row 2: facts resubmitted after apply", async () => {
    const r = await repo();
    const id = await applied(r);
    await writeFacts(r.paths, factsDoc(id, "red"));
    const res = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe("facts_changed");
    expect(JSON.parse(await readFile(lockFile(r), "utf8")).source_id).toBe(id);
  }, T);

  it("S4 row 3: re-running an interrupted finish logs nothing twice", async () => {
    const r = await repo();
    const id = await applied(r);
    await writeLogEvent(r.paths, {
      type: "ingest",
      at: "2026-10-16T11:00:00.000Z",
      source_id: id,
      kind: "status-report",
      rule_version: 2,
      permission: "ai",
      origin: "docs/notes.md",
      created: [],
      updated: [],
      deleted: [],
      contradictions: 0,
      rule_suggestions: 1,
    } as never);
    const res = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(0);
    expect(await exists(lockFile(r))).toBe(false);
    expect(await ingestEvents(r, id)).toHaveLength(1);
    expect((res.json.warnings as string[]).join("\n")).toContain("already recorded");
  }, T);

  it("lint hook default returns no findings", async () => {
    const lint = await load("../../src/ingest/lint-hook.js");
    const r = await repo();
    expect(await lint.runLintHook({ paths: r.paths, sourceId: NOTES, changed: [] })).toEqual([]);
  }, T);
});
