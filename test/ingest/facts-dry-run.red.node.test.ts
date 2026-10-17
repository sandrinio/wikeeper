import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeLogEvent } from "../../src/ingest/log.js";
import { registerSource } from "../../src/ingest/registry.js";
import type { SourceMeta } from "../../src/ingest/registry.js";
import { runCli } from "../../src/program.js";

const T = 30_000;
const KB_STATUS = "# KB\n\n## Source kinds\n\n- status-report (v2) → project.status, project.target_date, risk\n";
const KB_MEETING = "# KB\n\n## Source kinds\n\n- meeting-notes (v2) → decision, risk, project.status, person.owns\n";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[], opts: { stdin?: string; tty?: boolean } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const input = Object.assign(Readable.from(opts.stdin === undefined ? [] : [Buffer.from(opts.stdin)]), { isTTY: opts.tty === true });
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
async function repo(kb = KB_STATUS, permission = "ai", whitelist = ""): Promise<Repo> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-dry-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  const init = await run(root, ["init", "--yes", "--agents", "claude", "--json"]);
  expect(init.code).toBe(0);
  await writeFile(path.join(root, ".wiki", "config.yml"), `agents: [claude]\ningest:\n  permission: ${permission}\n${whitelist}`);
  await writeFile(path.join(root, ".wiki", "kb_instructions.md"), kb);
  return { root, paths: resolvePaths(root, DEFAULT_CONFIG) };
}

async function register(r: Repo, label: string, kind: string | null, day: string, kindPending = false): Promise<SourceMeta> {
  const rel = `docs/${label}.md`;
  await mkdir(path.join(r.root, "docs"), { recursive: true });
  await writeFile(path.join(r.root, rel), `content of ${label}\n`);
  return registerSource(r.paths, {
    originType: "file",
    origin: rel,
    label,
    originalPath: path.join(r.root, rel),
    text: null,
    kind,
    providedBy: "user",
    ruleVersion: null,
    reingestOf: null,
    permission: { mode: "ai", approved: false, matched: null, kind_pending: kindPending },
    now: new Date(`${day}T09:00:00Z`),
  });
}

function fact(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entity: "project:atlas",
    field: "status",
    value: "green",
    status: "decided",
    as_of: "2026-10-15",
    anchor: "§1",
    page: "projects/atlas.md",
    exists: true,
    ...over,
  };
}
function doc(id: string, facts: Record<string, unknown>[], over: Record<string, unknown> = {}): Record<string, unknown> {
  return { source_id: id, kind: "status-report", rule_version: 2, facts, uncovered: [], ...over };
}
const factsPath = (r: Repo, id: string) => path.join(r.root, ".wiki", "raw", `${id}.facts.json`);
async function store(r: Repo, d: Record<string, unknown>): Promise<string> {
  await mkdir(r.paths.rawDir, { recursive: true });
  const text = JSON.stringify({ ...d, new_entities: [] }, null, 2) + "\n";
  await writeFile(factsPath(r, d.source_id as string), text);
  return text;
}
async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}
async function hashTree(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(dir: string): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile()) out[path.relative(root, abs).split(path.sep).join("/")] = createHash("sha256").update(await readFile(abs)).digest("hex");
    }
  }
  await walk(root);
  return out;
}
function noTmp(tree: Record<string, string>): void {
  expect(Object.keys(tree).filter((n) => n.includes(".tmp-"))).toEqual([]);
}
async function dry(r: Repo, id: string, d: unknown, extra: string[] = []) {
  await writeFile(path.join(r.root, "next.json"), JSON.stringify(d));
  const before = await hashTree(r.root);
  const res = await run(r.root, ["ingest", "facts", id, "--file", "next.json", "--dry-run", ...extra]);
  return { res, before };
}

describe("STORY-005-07 ingest facts --dry-run (red)", () => {
  it("S1: previews a rule change on a finished source, stores nothing, real run still refused", async () => {
    const r = await repo(KB_MEETING);
    const meta = await register(r, "standup", "meeting-notes", "2026-10-10");
    expect(meta.id).toBe("src-2026-10-10-standup");
    const F1 = fact({ value: "on track", anchor: "§2" });
    const F2 = fact({ entity: "risk:vendor-delay", field: "owner", value: "AK", anchor: "§3" });
    const F3 = fact({ entity: "person:ana-kim", field: "owns", value: "Atlas", anchor: "§1" });
    await store(r, doc(meta.id, [F1, F2], { kind: "meeting-notes", rule_version: 1 }));
    await writeLogEvent(r.paths, {
      type: "ingest",
      at: "2026-10-10T12:00:00.000Z",
      source_id: meta.id,
      kind: "meeting-notes",
      rule_version: 1,
      permission: "ai",
      origin: meta.origin,
      created: [],
      updated: [],
      deleted: [],
      contradictions: 0,
      rule_suggestions: 0,
    });
    const next = doc(meta.id, [{ ...F1, status: "tentative" }, F3], { kind: "meeting-notes", rule_version: 2 });
    await writeFile(path.join(r.root, "next.json"), JSON.stringify(next));
    const before = await hashTree(r.root);
    const res = await run(r.root, ["ingest", "facts", meta.id, "--file", "next.json", "--dry-run", "--json"]);
    expect(res.code).toBe(0);
    expect(res.json.warnings ?? []).toEqual([]);
    const d = res.json.data;
    expect(d.dry_run).toBe(true);
    expect(d.source_id).toBe(meta.id);
    expect(d.finished).toBe(true);
    expect(d.stored.rule_version).toBe(1);
    expect(d.next.rule_version).toBe(2);
    expect(d.added).toEqual([F3]);
    expect(d.removed).toEqual([F2]);
    expect(d.changed).toEqual([{ before: F1, after: { ...F1, status: "tentative" } }]);
    expect(d.unchanged).toBe(0);
    const after = await hashTree(r.root);
    expect(after).toEqual(before);
    noTmp(after);
    const real = await run(r.root, ["ingest", "facts", meta.id, "--file", "next.json", "--json"]);
    expect(real.code).toBe(1);
    expect(real.json.error.code).toBe("ingest_finished");
  }, T);

  it.each([
    ["no facts are stored", false, "stored: none", "added 2 · removed 0 · changed 0 · unchanged 0"],
    ["the same 2 facts are stored", true, "stored: 2 facts (status-report v2), 1 uncovered", "added 0 · removed 0 · changed 0 · unchanged 2"],
  ])("S2: works before and after facts are stored (%s)", async (_n, stored, storedLine, countsLine) => {
    const r = await repo();
    const meta = await register(r, "q4-status", "status-report", "2026-10-17");
    expect(meta.id).toBe("src-2026-10-17-q4-status");
    const d = doc(meta.id, [fact(), fact({ field: "target_date", value: "2026-12-01" })], { uncovered: ["org chart"] });
    const storedText = stored ? await store(r, d) : null;
    const { res, before } = await dry(r, meta.id, d);
    expect(res.code).toBe(0);
    expect(res.text.startsWith("dry run for src-2026-10-17-q4-status: nothing stored")).toBe(true);
    expect(res.text).toContain(storedLine);
    expect(res.text).toContain(countsLine);
    expect(await readOrNull(factsPath(r, meta.id))).toBe(storedText);
    const after = await hashTree(r.root);
    expect(after).toEqual(before);
    noTmp(after);
  }, T);

  const base = fact({ field: "target_date", value: "2026-11-01", anchor: "p.3" });
  it.each([
    ["value changed", { ...base, value: "2026-11-17" }, 0, 0, 1, 0, '~ project:atlas target_date: value "2026-11-01" → "2026-11-17"'],
    ["anchor changed", { ...base, anchor: "p.4" }, 1, 1, 0, 0, "- project:atlas target_date = \"2026-11-01\" (decided, 2026-10-15) → projects/atlas.md"],
    ["page changed", { ...base, page: "atlas.md" }, 0, 0, 1, 0, '~ project:atlas target_date: page "projects/atlas.md" → "atlas.md"'],
  ])("S3: pairing by entity, field, anchor (%s)", async (_n, nextFact, a, rm_, c, u, line) => {
    const r = await repo();
    const meta = await register(r, "q4-status", "status-report", "2026-10-17");
    await store(r, doc(meta.id, [base]));
    const next = doc(meta.id, [nextFact]);
    const { res, before } = await dry(r, meta.id, next, ["--json"]);
    expect(res.code).toBe(0);
    expect(res.json.data.added).toHaveLength(a);
    expect(res.json.data.removed).toHaveLength(rm_);
    expect(res.json.data.changed).toHaveLength(c);
    expect(res.json.data.unchanged).toBe(u);
    const human = await run(r.root, ["ingest", "facts", meta.id, "--file", "next.json", "--dry-run"]);
    expect(human.code).toBe(0);
    expect(human.text.split("\n")).toContain(line);
    expect(await hashTree(r.root)).toEqual(before);
  }, T);

  it("S3: two identical stored facts, one submitted: one removed, one unchanged", async () => {
    const r = await repo();
    const meta = await register(r, "q4-status", "status-report", "2026-10-17");
    await store(r, doc(meta.id, [base, { ...base }]));
    const { res, before } = await dry(r, meta.id, doc(meta.id, [base]), ["--json"]);
    expect(res.code).toBe(0);
    expect(res.json.data.removed).toHaveLength(1);
    expect(res.json.data.added).toHaveLength(0);
    expect(res.json.data.changed).toHaveLength(0);
    expect(res.json.data.unchanged).toBe(1);
    const human = await run(r.root, ["ingest", "facts", meta.id, "--file", "next.json", "--dry-run"]);
    expect(human.text.split("\n")).toContain("added 0 · removed 1 · changed 0 · unchanged 1");
    expect(await hashTree(r.root)).toEqual(before);
  }, T);

  it("S4: a kind denied at a dry run removes nothing", async () => {
    const r = await repo(KB_STATUS, "whitelist", "  whitelist:\n    origins:\n      - docs/**\n    kinds:\n      - meeting-notes\n");
    await mkdir(path.join(r.root, "notes"), { recursive: true });
    await writeFile(path.join(r.root, "notes", "contract.md"), "the contract\n");
    const start = await run(r.root, ["ingest", "start", "notes/contract.md", "--json"]);
    expect(start.code).toBe(0);
    const id = start.json.data.id as string;
    expect(start.json.data.source.permission.kind_pending).toBe(true);
    const rawBefore = (await readdir(r.paths.rawDir)).sort();
    const { res, before } = await dry(r, id, doc(id, [fact()], { kind: "contract", rule_version: null }), ["--json"]);
    expect(res.code).toBe(4);
    expect(res.json.error.code).toBe("denied");
    expect(res.json.error.details.removed).toEqual([]);
    expect(res.json.error.details.dry_run).toBe(true);
    expect(res.json.error.message.endsWith("dry run: nothing was removed")).toBe(true);
    const rawAfter = (await readdir(r.paths.rawDir)).sort();
    expect(rawAfter).toEqual(rawBefore);
    expect(rawAfter).toContain(`${id}.md`);
    expect(rawAfter).toContain(`${id}.meta.json`);
    expect(await readOrNull(factsPath(r, id))).toBeNull();
    const after = await hashTree(r.root);
    expect(after).toEqual(before);
    noTmp(after);
  }, T);

  describe("S5: validation errors keep their exit codes and store nothing", () => {
    const A = "src-2026-10-17-a";
    const cases: Array<[string, string, number, string]> = [
      ["invalid_facts", "bad", 1, "invalid_facts"],
      ["source_id_mismatch", "mismatch", 1, "source_id_mismatch"],
      ["unknown_source", "ghost", 1, "unknown_source"],
      ["kind_mismatch", "kindmm", 1, "kind_mismatch"],
      ["corrupt stored file", "corrupt", 1, "invalid_facts"],
      ["usage on a TTY", "tty", 2, "usage"],
    ];
    it.each(cases)("%s", async (_n, variant, exit, code) => {
      const r = await repo();
      let id = A;
      let input: unknown = doc(A, [fact()]);
      if (variant !== "ghost") await register(r, "a", variant === "kindmm" ? "meeting-notes" : null, "2026-10-17");
      if (variant === "ghost") {
        id = "src-2026-10-17-ghost";
        input = doc(id, [fact()]);
      }
      if (variant === "bad") input = doc(A, [fact({ status: "maybe" })]);
      if (variant === "mismatch") input = doc("src-2026-10-17-b", [fact()]);
      if (variant === "corrupt") {
        await mkdir(r.paths.rawDir, { recursive: true });
        await writeFile(factsPath(r, A), "{not json");
      }
      await writeFile(path.join(r.root, "next.json"), JSON.stringify(input));
      const before = await hashTree(r.root);
      const args = variant === "tty" ? ["ingest", "facts", id, "--dry-run", "--json"] : ["ingest", "facts", id, "--file", "next.json", "--dry-run", "--json"];
      const res = await run(r.root, args, variant === "tty" ? { tty: true } : {});
      expect(res.code).toBe(exit);
      expect(res.json.command).toBe("ingest facts");
      expect(res.json.error.code).toBe(code);
      const after = await hashTree(r.root);
      expect(after).toEqual(before);
      noTmp(after);
    }, T);
  });
});
