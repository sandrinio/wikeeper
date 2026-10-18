import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeFacts } from "../../src/ingest/facts.js";
import { readLogEvents, writeLogEvent } from "../../src/ingest/log.js";
import { registerSource } from "../../src/ingest/registry.js";
import { pageHash } from "../../src/lint/unlogged.js";
import { runCli } from "../../src/program.js";

// STORY-008-01 QA-Red: the archive in the write phase (guard, snapshot, abort, finish, older snapshots).
const NOW = new Date("2026-10-18T10:00:00Z");
const T = 60_000;
const CLEANUP = "src-2026-10-18-cleanup";
const STANDUP = "src-2026-10-18-standup";

const A0 = "- 2026-08-01 · tentative · Atlas ships 2026-09-30. [[src-2026-08-01-plan]]";
const A1 = "- 2026-09-01 · tentative · Atlas ships 2026-10-15. [[src-2026-09-01-plan]]";
const A2 = "- 2026-10-10 · decided · Atlas ships 2026-11-03. [[src-2026-10-10-review]]";
const FM = "---\ntype: project\ntitle: Atlas\nsummary: Atlas project\n---\n# Atlas\n\n## Facts\n\n";
const ATLAS_PAGE = `${FM}${A1}\n${A2}\n`;
const ATLAS_ARCHIVE = `${FM}${A0}\n`;

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[], stdin?: string) {
  const out: string[] = [];
  const err: string[] = [];
  const input = Object.assign(Readable.from(stdin === undefined ? [] : [Buffer.from(stdin)]), { isTTY: false });
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

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
async function treeHash(dir: string): Promise<string> {
  const h = createHash("sha256");
  async function walk(d: string, rel: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((x, y) => (x.name < y.name ? -1 : 1));
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        h.update(`d:${r}\n`);
        await walk(path.join(d, e.name), r);
      } else {
        h.update(`f:${r}\n`);
        h.update(await readFile(path.join(d, e.name)));
      }
    }
  }
  await walk(dir, "");
  return h.digest("hex");
}

interface Repo {
  root: string;
  paths: ResolvedPaths;
}
async function repo(): Promise<Repo> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-archive-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  return { root, paths: resolvePaths(root, DEFAULT_CONFIG) };
}
async function put(file: string, body: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}
const pagesFile = (r: Repo, rel: string) => path.join(r.paths.pagesDir, ...rel.split("/"));
const archiveFile = (r: Repo, rel: string) => path.join(r.root, ".wiki", "archive", ...rel.split("/"));
const archiveRoot = (r: Repo) => path.join(r.root, ".wiki", "archive");
const snapRoot = (r: Repo, id: string) => path.join(r.root, ".wiki", ".snapshots", id);

async function register(r: Repo, label: string): Promise<string> {
  const rel = `docs/${label}.md`;
  await put(path.join(r.root, rel), `content of ${label}\n`);
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
        value: "clean-up agreed",
        status: "decided",
        as_of: "2026-10-18",
        anchor: "Status",
        page: "projects/atlas.md",
        exists: true,
      },
    ],
    uncovered: [],
  } as never);
  return meta.id;
}
async function seed(r: Repo): Promise<string> {
  const id = await register(r, "cleanup");
  expect(id).toBe(CLEANUP);
  await put(pagesFile(r, "projects/atlas.md"), ATLAS_PAGE);
  await put(archiveFile(r, "projects/atlas.md"), ATLAS_ARCHIVE);
  return id;
}
const CLEAN_LINE = `- 2026-10-18 · decided · Atlas clean-up agreed. [[${CLEANUP}]]`;
const SRC_PAGE = (id: string) => `---\ntype: source\ntitle: ${id}\nsources: [${id}]\n---\n# ${id}\n`;
const BETA = `---\ntype: project\n---\n# Beta\n\n## Facts\n\n- 2026-10-18 · decided · Beta parked. [[${CLEANUP}]]\n`;

// ---------------------------------------------------------------- S1: the guard
const pkgHooks = (name: string): any =>
  JSON.parse(
    readFileSync(path.resolve("test/fixtures/hooks", name), "utf8"),
  );

async function guardRepo(config: string | null, lock: boolean): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-archive-guard-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"));
  await mkdir(path.join(root, ".wiki"), { recursive: true });
  if (config !== null) await writeFile(path.join(root, ".wiki", "config.yml"), config);
  if (lock) await writeFile(path.join(root, ".wiki", ".lock"), JSON.stringify({ source_id: CLEANUP, pid: 1 }));
  return root;
}
function payload(agent: string, root: string, target: string): unknown {
  if (agent === "claude") {
    const p = pkgHooks("claude-write.json");
    p.cwd = root;
    p.tool_input = { file_path: path.join(root, ...target.split("/")), content: "x" };
    return p;
  }
  if (agent === "codex") {
    const p = pkgHooks("codex-apply-patch.json");
    p.cwd = root;
    p.tool_input.command = `*** Begin Patch\n*** Update File: ${target}\n@@\n-a\n+b\n*** End Patch\n`;
    return p;
  }
  const p = pkgHooks("antigravity-write.json");
  p.workspacePaths = [root];
  p.toolCall.args.TargetFile = path.join(root, ...target.split("/"));
  return p;
}

describe("STORY-008-01 S1: the guard treats archive/ like pages/", () => {
  const DENY_FRAGMENT = "wikeeper ingest apply";
  const rows = [
    { config: null, lock: false, agent: "claude", target: ".wiki/archive/projects/atlas.md", decision: "deny" },
    { config: null, lock: false, agent: "codex", target: ".wiki/archive/projects/atlas.md", decision: "deny" },
    { config: null, lock: false, agent: "antigravity", target: ".wiki/archive/projects/atlas.md", decision: "deny" },
    { config: null, lock: true, agent: "claude", target: ".wiki/archive/projects/atlas.md", decision: "allow" },
    { config: null, lock: false, agent: "claude", target: ".wiki/archive-old/atlas.md", decision: "allow" },
    { config: "content_dir: wiki\n", lock: false, agent: "claude", target: "wiki/archive/a.md", decision: "deny" },
    { config: "content_dir: wiki\n", lock: false, agent: "claude", target: ".wiki/archive/a.md", decision: "allow" },
    { config: "content_dir: .\n", lock: false, agent: "claude", target: "archive/a.md", decision: "deny" },
  ];
  it.each(rows)("$agent writes $target (config $config, lock $lock): $decision", async (row) => {
    const root = await guardRepo(row.config, row.lock);
    const res = await run(root, ["hook", "guard", "--agent", row.agent], JSON.stringify(payload(row.agent, root, row.target)));
    if (row.decision === "allow") {
      expect(res.code).toBe(0);
      expect(res.text).toBe("");
      expect(res.err).toBe("");
      return;
    }
    if (row.agent === "claude") {
      expect(res.code).toBe(0);
      const out = JSON.parse(res.text);
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(out.hookSpecificOutput.permissionDecisionReason).toContain(DENY_FRAGMENT);
    } else if (row.agent === "codex") {
      expect(res.code).toBe(2);
      expect(res.err).toContain(DENY_FRAGMENT);
      expect(res.text).toBe("");
    } else {
      expect(res.code).toBe(0);
      const out = JSON.parse(res.text);
      expect(out.decision).toBe("deny");
      expect(out.reason).toContain(DENY_FRAGMENT);
    }
  }, T);
});

// ---------------------------------------------------------------- S2: apply copies, abort restores
async function writePhase(r: Repo, id: string) {
  const pagesBefore = await treeHash(r.paths.pagesDir);
  const archiveBefore = await treeHash(archiveRoot(r));
  const applied = await run(r.root, ["ingest", "apply", id, "--json"]);
  expect(applied.code).toBe(0);
  // the writer cuts A1 from the page, appends it to the archive, adds a new archive file
  await writeFile(pagesFile(r, "projects/atlas.md"), `${FM}${A2}\n`);
  await writeFile(archiveFile(r, "projects/atlas.md"), `${ATLAS_ARCHIVE}${A1}\n`);
  await put(archiveFile(r, "people/designer/old.md"), "---\ntype: person\n---\n# Old\n");
  return { applied, pagesBefore, archiveBefore };
}

describe("STORY-008-01 S2: apply copies archive/, abort restores pages/ and archive/", () => {
  it("apply snapshots the archive; abort restores both trees and reports the archive", async () => {
    const r = await repo();
    const id = await seed(r);
    const { applied, pagesBefore, archiveBefore } = await writePhase(r, id);
    expect(applied.json.data.snapshot.archive).toBe(1);
    const snap = JSON.parse(await readFile(path.join(snapRoot(r, id), "snapshot.json"), "utf8"));
    expect(Object.keys(snap.archive)).toEqual(["projects/atlas.md"]);
    expect(await readFile(path.join(snapRoot(r, id), "archive", "projects", "atlas.md"), "utf8")).toBe(ATLAS_ARCHIVE);

    const res = await run(r.root, ["ingest", "abort", id, "--json"]);
    expect(res.code).toBe(0);
    expect(await treeHash(r.paths.pagesDir)).toBe(pagesBefore);
    expect(await treeHash(archiveRoot(r))).toBe(archiveBefore);
    expect(await exists(path.join(archiveRoot(r), "people"))).toBe(false);
    expect(await exists(archiveRoot(r))).toBe(true);
    expect(res.json.data.restored).toEqual(["projects/atlas.md"]);
    expect(res.json.data.archive).toEqual({ restored: ["projects/atlas.md"], removed: ["people/designer/old.md"] });
    const events = (await readLogEvents(r.paths, { type: "abort", sourceId: id })).events;
    expect(events).toHaveLength(1);
    const ev = events[0]!.event as any;
    expect(ev.restored).toEqual(["projects/atlas.md"]);
    expect(ev.archive_restored).toEqual(["people/designer/old.md", "projects/atlas.md"]);
  }, T);

  it("the human line names the archive counts, and the help texts name archive/", async () => {
    const r = await repo();
    const id = await seed(r);
    await writePhase(r, id);
    const res = await run(r.root, ["ingest", "abort", id]);
    expect(res.code).toBe(0);
    expect(res.text).toContain("aborted src-2026-10-18-cleanup: 1 page restored, 0 removed, archive/: 1 restored, 1 removed");
    const applyHelp = await run(r.root, ["ingest", "apply", "--help"]);
    expect(applyHelp.text + applyHelp.err).toContain("snapshot pages/ and archive/");
    const abortHelp = await run(r.root, ["ingest", "abort", "--help"]);
    expect(abortHelp.text + abortHelp.err).toContain("restores pages/ and archive/ from the snapshot");
  }, T);
});

// ---------------------------------------------------------------- S3: finish lists and hashes
describe("STORY-008-01 S3: finish does not count archive writes as outside writes, and logs their hashes", () => {
  it("archive_hashes holds the created and updated archive .md files only", async () => {
    const r = await repo();
    const id = await seed(r);
    expect((await run(r.root, ["ingest", "apply", id, "--json"])).code).toBe(0);
    await writeFile(pagesFile(r, "projects/atlas.md"), `${ATLAS_PAGE}${CLEAN_LINE}\n`);
    await put(pagesFile(r, `sources/${id}.md`), SRC_PAGE(id));
    await writeFile(archiveFile(r, "projects/atlas.md"), `${ATLAS_ARCHIVE}${A1}\n`);
    await put(archiveFile(r, "projects/beta.md"), BETA);
    await put(archiveFile(r, ".DS_Store"), "junk");

    const fin = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(fin.code).toBe(0);
    expect(JSON.stringify(fin.json)).not.toContain("changed outside pages/");
    expect(fin.json.data.updated).toEqual(["projects/atlas.md"]);
    expect(fin.json.data.created).toEqual([`sources/${id}.md`]);
    const ev = (await readLogEvents(r.paths, { type: "ingest", sourceId: id })).events[0]!.event as any;
    expect(ev.archive_hashes).toEqual({
      "projects/atlas.md": pageHash(await readFile(archiveFile(r, "projects/atlas.md"), "utf8")),
      "projects/beta.md": pageHash(await readFile(archiveFile(r, "projects/beta.md"), "utf8")),
    });
    expect(Object.keys(ev.page_hashes).sort()).toEqual(["projects/atlas.md", `sources/${id}.md`]);

    // a second ingest that changes only pages/ logs the same bytes as before the archive existed
    const id2 = await register(r, "standup");
    expect(id2).toBe(STANDUP);
    expect((await run(r.root, ["ingest", "apply", id2, "--json"])).code).toBe(0);
    await writeFile(
      pagesFile(r, "projects/atlas.md"),
      `${ATLAS_PAGE}${CLEAN_LINE}\n- 2026-10-18 · decided · Atlas stand-up held. [[${id2}]]\n`,
    );
    await put(pagesFile(r, `sources/${id2}.md`), SRC_PAGE(id2));
    const fin2 = await run(r.root, ["ingest", "finish", id2, "--json"]);
    expect(fin2.code).toBe(0);
    const logFiles = (await readdir(r.paths.logDir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile());
    let found = 0;
    for (const f of logFiles) {
      const text = await readFile(path.join(f.parentPath, f.name), "utf8");
      if (text.includes(`source_id: ${id2}`) && text.includes("type: ingest")) {
        found++;
        expect(text).not.toContain("archive_hashes");
      }
    }
    expect(found).toBe(1);
  }, T);

  it("writeLogEvent refuses malformed archive_hashes and archive_restored and writes no file", async () => {
    const r = await repo();
    const before = await treeHash(r.paths.logDir);
    const ingest = {
      type: "ingest",
      at: "2026-10-18T11:00:00.000Z",
      source_id: CLEANUP,
      kind: "status-report",
      rule_version: 2,
      permission: "ai",
      origin: "docs/cleanup.md",
      created: [],
      updated: [],
      deleted: [],
      contradictions: 0,
      rule_suggestions: 0,
      archive_hashes: { "a.md": "abc" },
    };
    await expect(writeLogEvent(r.paths, ingest as never)).rejects.toMatchObject({ code: "invalid_event" });
    const abort = {
      type: "abort",
      at: "2026-10-18T11:00:00.000Z",
      source_id: CLEANUP,
      dropped: false,
      restored: [],
      archive_restored: "a.md",
    };
    await expect(writeLogEvent(r.paths, abort as never)).rejects.toMatchObject({ code: "invalid_event" });
    expect(await treeHash(r.paths.logDir)).toBe(before);
  }, T);
});

// ---------------------------------------------------------------- S4: an older snapshot
describe("STORY-008-01 S4: an ingest applied by an older wikeeper still finishes and aborts", () => {
  async function older(mode: "no-key" | "array"): Promise<{ r: Repo; id: string }> {
    const r = await repo();
    const id = await seed(r);
    expect((await run(r.root, ["ingest", "apply", id, "--json"])).code).toBe(0);
    const file = path.join(snapRoot(r, id), "snapshot.json");
    const snap = JSON.parse(await readFile(file, "utf8"));
    if (mode === "no-key") {
      delete snap.archive;
      await rm(path.join(snapRoot(r, id), "archive"), { recursive: true, force: true });
    } else {
      snap.archive = ["projects/atlas.md"];
    }
    await writeFile(file, JSON.stringify(snap, null, 2));
    await writeFile(pagesFile(r, "projects/atlas.md"), `${ATLAS_PAGE}${CLEAN_LINE}\n`);
    await put(archiveFile(r, "projects/beta.md"), BETA);
    return { r, id };
  }

  it("without the archive key: finish hashes every archive .md file", async () => {
    const { r, id } = await older("no-key");
    await put(pagesFile(r, `sources/${id}.md`), SRC_PAGE(id));
    const fin = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(fin.code).toBe(0);
    const ev = (await readLogEvents(r.paths, { type: "ingest", sourceId: id })).events[0]!.event as any;
    expect(Object.keys(ev.archive_hashes).sort()).toEqual(["projects/atlas.md", "projects/beta.md"]);
  }, T);

  it("without the archive key: abort restores pages, keeps archive files, warns", async () => {
    const { r, id } = await older("no-key");
    const res = await run(r.root, ["ingest", "abort", id, "--json"]);
    expect(res.code).toBe(0);
    expect(await readFile(pagesFile(r, "projects/atlas.md"), "utf8")).toBe(ATLAS_PAGE);
    expect(await exists(archiveFile(r, "projects/atlas.md"))).toBe(true);
    expect(await exists(archiveFile(r, "projects/beta.md"))).toBe(true);
    expect(res.json.data.archive).toEqual({ restored: [], removed: [] });
    expect((res.json.warnings as string[]).join("\n")).toContain("archive/ was not restored");
  }, T);

  it("with a malformed archive key: finish fails with snapshot_missing", async () => {
    const { r, id } = await older("array");
    const fin = await run(r.root, ["ingest", "finish", id, "--json"]);
    expect(fin.code).toBe(1);
    expect(fin.json.error.code).toBe("snapshot_missing");
  }, T);
});
