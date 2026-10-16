import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runGuard } from "../../src/commands/hook.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeFacts } from "../../src/ingest/facts.js";
import { readLogEvents, writeLogEvent } from "../../src/ingest/log.js";
import { registerSource } from "../../src/ingest/registry.js";
import { runCli } from "../../src/program.js";

const NOW = new Date("2026-10-16T10:00:00Z");
const T = 30_000;
const Q4 = "src-2026-10-16-q4-status";
const A = "src-2026-10-16-a";
const B = "src-2026-10-16-b";
const NOTES = "src-2026-10-16-notes";

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
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-apply-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  const init = await run(root, ["init", "--yes", "--agents", "claude", "--json"]);
  expect(init.code).toBe(0);
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
async function registerWithFacts(r: Repo, label: string): Promise<string> {
  const id = await register(r, label);
  await writeFacts(r.paths, {
    source_id: id,
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
  return id;
}
async function putPage(r: Repo, rel: string, body: string): Promise<void> {
  const file = path.join(r.paths.pagesDir, ...rel.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}
const lockFile = (r: Repo) => path.join(r.root, ".wiki", ".lock");
async function writeLock(r: Repo, id: string, ageMs: number): Promise<void> {
  await writeFile(
    lockFile(r),
    JSON.stringify({ source_id: id, pid: 4242, hostname: "other", acquired_at: new Date(Date.now() - ageMs).toISOString() }),
  );
}
async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
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
async function guardWrite(r: Repo, file: string) {
  const payload = JSON.parse(await readFile(path.resolve("test/fixtures/hooks/claude-write.json"), "utf8"));
  payload.cwd = r.root;
  payload.tool_input = { file_path: file, content: "x" };
  return runGuard({ agent: "claude", stdin: Readable.from([JSON.stringify(payload)]), isTTY: false, cwd: r.root } as never);
}
function allowed(res: { exitCode: number; stdout: string }): boolean {
  return res.exitCode === 0 && res.stdout.trim() === "";
}
function denied(res: { stdout: string }): boolean {
  try {
    return JSON.parse(res.stdout).hookSpecificOutput.permissionDecision === "deny";
  } catch {
    return false;
  }
}
const snapJson = (r: Repo, id: string) => path.join(r.root, ".wiki", ".snapshots", id, "snapshot.json");

describe("STORY-003-08 ingest apply / abort (red)", () => {
  it("S1: apply opens the write phase and the guard follows the lock", async () => {
    const r = await repo();
    const id = await registerWithFacts(r, "q4-status");
    expect(id).toBe(Q4);
    await putPage(r, "projects/atlas.md", "# Atlas\n");
    await putPage(r, "team.md", "# Team\n");
    const res = await run(r.root, ["ingest", "apply", id, "--json"]);
    expect(res.code).toBe(0);
    expect(JSON.parse(await readFile(lockFile(r), "utf8")).source_id).toBe(id);
    const snap = JSON.parse(await readFile(snapJson(r, id), "utf8"));
    expect(Object.keys(snap.pages)).toEqual(expect.arrayContaining(["projects/atlas.md", "team.md"]));
    const factsBytes = await readFile(path.join(r.root, ".wiki", "raw", `${id}.facts.json`));
    expect(snap.facts_sha256).toBe(createHash("sha256").update(factsBytes).digest("hex"));
    expect(res.json.data.source_id).toBe(id);
    expect(res.json.data.already_applied).toBe(false);
    expect(res.json.data.facts).toBeTruthy();
    expect(res.json.data.facts_file).toBe(`.wiki/raw/${id}.facts.json`);
    expect(res.json.data.snapshot.dir).toBe(`.wiki/.snapshots/${id}`);
    expect(res.json.data.brief.startsWith(`ingest:    ${id}`)).toBe(true);
    expect(res.json.data.brief).toContain(`facts: raw/${id}.facts.json`);
    expect(allowed(await guardWrite(r, path.join(r.root, ".wiki", "pages", "team.md")))).toBe(true);

    const before = await readFile(snapJson(r, id), "utf8");
    const again = await run(r.root, ["ingest", "apply", id, "--json"]);
    expect(again.code).toBe(0);
    expect(again.json.data.already_applied).toBe(true);
    expect(await readFile(snapJson(r, id), "utf8")).toBe(before);
  }, T);

  it.each([
    { lock: "5 min", age: 5 * 60_000, flag: [] as string[], exit: 1, holder: A, code: "locked" },
    { lock: "5 min", age: 5 * 60_000, flag: ["--force-unlock"], exit: 1, holder: A, code: "lock_not_stale" },
    { lock: "3 h", age: 3 * 3_600_000, flag: ["--force-unlock"], exit: 0, holder: B, code: null },
    { lock: "bad json", age: -1, flag: ["--force-unlock"], exit: 0, holder: B, code: null },
  ])("S2: held lock ($lock, $flag)", async ({ age, flag, exit, holder, code }) => {
    const r = await repo();
    await register(r, "a");
    const b = await registerWithFacts(r, "b");
    expect(b).toBe(B);
    if (age < 0) await writeFile(lockFile(r), "not json");
    else await writeLock(r, A, age);
    const res = await run(r.root, ["ingest", "apply", B, ...flag, "--json"]);
    expect(res.code).toBe(exit);
    if (code) {
      expect(res.json.error.code).toBe(code);
      if (code === "locked") {
        expect(res.json.error.message).toContain(A);
        expect(res.json.error.message).toContain("5 minutes");
      }
    } else if (age > 0) {
      expect((res.json.warnings as string[]).join("\n")).toContain(".wiki/.snapshots/src-2026-10-16-a");
    }
    expect(JSON.parse(await readFile(lockFile(r), "utf8")).source_id).toBe(holder);
  }, T);

  it.each([
    { state: "ghost", cmd: ["apply", "src-2026-10-16-ghost"], code: "unknown_source" },
    { state: "nofacts", cmd: ["apply", A], code: "no_facts" },
    { state: "finished", cmd: ["apply", A], code: "ingest_finished" },
    { state: "finished", cmd: ["abort", A, "--drop"], code: "ingest_finished" },
    { state: "other-holds", cmd: ["abort", B, "--drop"], code: "locked" },
    { state: "ghost", cmd: ["abort", "src-2026-10-16-ghost"], code: "unknown_source" },
  ])("S3: refusal $state $cmd", async ({ state, cmd, code }) => {
    const r = await repo();
    if (state === "nofacts") await register(r, "a");
    if (state === "finished") {
      await register(r, "a");
      await writeLogEvent(r.paths, {
        type: "ingest",
        at: "2026-10-16T11:00:00.000Z",
        source_id: A,
        kind: "status-report",
        rule_version: 2,
        permission: { mode: "ai", approved: false, matched: null, kind_pending: false },
        origin: "docs/a.md",
        created: [],
        updated: [],
        deleted: [],
        contradictions: 0,
        rule_suggestions: 0,
      } as never);
    }
    if (state === "other-holds") {
      await register(r, "a");
      await register(r, "b");
      await writeLock(r, A, 60_000);
    }
    await putPage(r, "team.md", "# Team\n");
    const lockBefore = await readOrNull(lockFile(r));
    const pagesBefore = await treeHash(r.paths.pagesDir);
    const rawBefore = await treeHash(r.paths.rawDir);
    const res = await run(r.root, ["ingest", ...cmd, "--json"]);
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe(code);
    expect(await readOrNull(lockFile(r))).toBe(lockBefore);
    expect(await treeHash(r.paths.pagesDir)).toBe(pagesBefore);
    expect(await treeHash(r.paths.rawDir)).toBe(rawBefore);
  }, T);

  it.each(["present", "missing"])("S4: abort rolls the write phase back (snapshot %s)", async (snapshot) => {
    const r = await repo();
    const id = await registerWithFacts(r, "q4-status");
    await putPage(r, "team.md", "# Team\n");
    await putPage(r, "risks.md", "# Risks\n");
    const before = await treeHash(r.paths.pagesDir);
    expect((await run(r.root, ["ingest", "apply", id, "--json"])).code).toBe(0);
    await putPage(r, "team.md", "# Team edited\n");
    await rm(path.join(r.paths.pagesDir, "risks.md"));
    await putPage(r, "projects/new/atlas.md", "# Atlas\n");
    if (snapshot === "missing") await rm(path.join(r.root, ".wiki", ".snapshots", id), { recursive: true, force: true });
    const res = await run(r.root, ["ingest", "abort", id, "--json"]);
    expect(res.code).toBe(0);
    if (snapshot === "present") {
      expect(await treeHash(r.paths.pagesDir)).toBe(before);
      expect(await exists(path.join(r.paths.pagesDir, "projects"))).toBe(false);
      expect(res.json.data.restored).toEqual(expect.arrayContaining(["risks.md", "team.md"]));
      expect(res.json.data.removed).toContain("projects/new/atlas.md");
    } else {
      expect(await readFile(path.join(r.paths.pagesDir, "team.md"), "utf8")).toBe("# Team edited\n");
      expect(await exists(path.join(r.paths.pagesDir, "projects", "new", "atlas.md"))).toBe(true);
      expect(res.json.warnings).toContain("snapshot missing; pages were not restored");
    }
    expect(await exists(lockFile(r))).toBe(false);
    expect(denied(await guardWrite(r, path.join(r.root, ".wiki", "pages", "team.md")))).toBe(true);
    const events = (await readLogEvents(r.paths, { type: "abort", sourceId: id })).events;
    expect(events).toHaveLength(1);
    expect((events[0]!.event as any).dropped).toBe(false);
    if (snapshot === "present") {
      expect((events[0]!.event as any).restored).toEqual(["projects/new/atlas.md", "risks.md", "team.md"]);
    }
  }, T);

  it("S5: abort --drop removes the registered source", async () => {
    const r = await repo();
    const id = await registerWithFacts(r, "notes");
    expect(id).toBe(NOTES);
    const res = await run(r.root, ["ingest", "abort", id, "--drop", "--json"]);
    expect(res.code).toBe(0);
    expect((await readdir(r.paths.rawDir)).filter((n) => n.startsWith(`${id}.`))).toEqual([]);
    expect(res.json.data.dropped).toBe(true);
    expect(res.json.data.dropped_files).toEqual(
      expect.arrayContaining([`${id}.meta.json`, `${id}.facts.json`]),
    );
    const events = (await readLogEvents(r.paths, { type: "abort", sourceId: id })).events;
    expect(events).toHaveLength(1);
    expect((events[0]!.event as any).dropped).toBe(true);
  }, T);
});
