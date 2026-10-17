import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, setConfigValue } from "../src/core/config.js";
import { resolvePaths } from "../src/core/paths.js";
import type { ResolvedPaths } from "../src/core/paths.js";
import { writeFacts } from "../src/ingest/facts.js";
import { writeLogEvent } from "../src/ingest/log.js";
import { registerSource } from "../src/ingest/registry.js";
import { hashTree } from "../src/ingest/snapshot.js";
import { runCli } from "../src/program.js";

const T = 30_000;
const NOW = new Date("2026-10-17T12:00:00Z");

async function load(_spec: string): Promise<any> {
  return import("../src/commands/status.js");
}

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[], commands?: unknown[]) {
  const out: string[] = [];
  const err: string[] = [];
  const input = Object.assign(Readable.from([]), { isTTY: false });
  const code = await runCli(args, {
    ...(commands ? { commands } : {}),
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

async function bareRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-status-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  return root;
}
async function repo(): Promise<Repo> {
  const root = await bareRoot();
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  await setConfigValue(root, "ingest.permission", "ai");
  const config = (await loadConfig(root)).config;
  return { root, paths: resolvePaths(root, config) };
}

const KB = (lines: string[]) => ["# KB instructions", "", "## Source kinds", "", ...lines, ""].join("\n");
async function setKb(r: Repo, lines: string[]): Promise<void> {
  await writeFile(r.paths.kbInstructions, KB(lines));
}

interface RegOpts {
  date?: string;
  origin?: string;
  kind?: string;
  reingestOf?: string | null;
}
/** Register a file source; the id comes out as src-<date>-<label>. */
async function reg(r: Repo, label: string, o: RegOpts = {}): Promise<string> {
  const rel = o.origin ?? `docs/${label}.md`;
  await mkdir(path.dirname(path.join(r.root, rel)), { recursive: true });
  await writeFile(path.join(r.root, rel), `content of ${label} ${o.date ?? ""}\n`);
  const meta = await registerSource(r.paths, {
    originType: "file",
    origin: rel,
    label,
    originalPath: path.join(r.root, rel),
    text: null,
    kind: o.kind ?? "meeting-notes",
    providedBy: "user",
    ruleVersion: null,
    reingestOf: o.reingestOf ?? null,
    permission: { mode: "ai", approved: false, matched: null, kind_pending: false },
    now: new Date(`${o.date ?? "2026-10-17"}T09:00:00Z`),
  });
  return meta.id;
}
async function finished(
  r: Repo,
  id: string,
  o: { kind?: string; version?: number | null; at?: string; origin?: string } = {},
): Promise<void> {
  await writeLogEvent(r.paths, {
    type: "ingest",
    at: o.at ?? "2026-10-17T10:00:00.000Z",
    source_id: id,
    kind: o.kind ?? "meeting-notes",
    rule_version: o.version === undefined ? 2 : o.version,
    permission: "ai",
    origin: o.origin ?? `docs/${id}.md`,
    created: [],
    updated: [],
    deleted: [],
    contradictions: 0,
    rule_suggestions: 0,
  } as never);
}
async function facts(r: Repo, id: string, uncovered: string[]): Promise<void> {
  await writeFacts(r.paths, { source_id: id, kind: "meeting-notes", rule_version: 2, facts: [], uncovered } as never);
}
async function miss(r: Repo, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await writeLogEvent(r.paths, { type: "miss", at: `2026-10-17T11:0${i}:00.000Z`, query: `q${i}`, filters: {} } as never);
  }
}

const statusCmd = async (now: Date) => (await load("status")).createStatusCommand({ now: () => now });
async function status(r: Repo, human = false) {
  const res = await run(r.root, human ? ["status"] : ["status", "--json"]);
  if (!human) expect(res.json?.command, `${res.text} ${res.err}`).toBe("status");
  return res;
}
const lines = (text: string) => text.split("\n").map((l) => l.trim());

describe("STORY-005-05 wikeeper status (red)", () => {
  it("module exports collectStatus, createStatusCommand and statusCommand", async () => {
    const mod = await load("status");
    expect(typeof mod.collectStatus).toBe("function");
    expect(typeof mod.createStatusCommand).toBe("function");
    expect(mod.statusCommand).toBeDefined();
  }, T);

  describe("S1: re-ingest candidates", () => {
    const cand = (v: number | null) => [
      { source_id: "src-2026-10-10-standup", origin: "notes/standup.md", kind: "meeting-notes", rule_version: v, current_version: 2 },
    ];
    const rows: Array<{ kind: string; version: number | null; reingest: boolean; candidates: unknown[]; line: string }> = [
      { kind: "meeting-notes", version: 1, reingest: false, candidates: cand(1), line: "src-2026-10-10-standup (meeting-notes v1, rule now v2) from notes/standup.md" },
      { kind: "meeting-notes", version: null, reingest: false, candidates: cand(null), line: "src-2026-10-10-standup (meeting-notes no rule, rule now v2) from notes/standup.md" },
      { kind: "meeting-notes", version: 2, reingest: false, candidates: [], line: "re-ingest candidates: none" },
      { kind: "chat-excerpt", version: null, reingest: false, candidates: [], line: "re-ingest candidates: none" },
      { kind: "meeting-notes", version: 1, reingest: true, candidates: [], line: "re-ingest candidates: none" },
    ];
    it.each(rows)("kind $kind v$version reingest=$reingest", async (row) => {
      const r = await repo();
      await setKb(r, ["meeting-notes (v2) → decision, risk"]);
      const id = await reg(r, "standup", { date: "2026-10-10", origin: "notes/standup.md", kind: row.kind });
      expect(id).toBe("src-2026-10-10-standup");
      await finished(r, id, { kind: row.kind, version: row.version, at: "2026-10-10T10:00:00.000Z", origin: "notes/standup.md" });
      if (row.reingest) {
        const id2 = await reg(r, "standup", { date: "2026-10-12", origin: "notes/standup2.md", reingestOf: id });
        expect(id2).toBe("src-2026-10-12-standup");
        await finished(r, id2, { version: 2, at: "2026-10-12T10:00:00.000Z", origin: "notes/standup.md" });
      }
      const res = await status(r);
      expect(res.code).toBe(0);
      expect(res.json.data.reingest_candidates).toEqual(row.candidates);
      const human = await status(r, true);
      expect(lines(human.text)).toContain(row.line);
    }, T);
  });

  describe("unit rows", () => {
    it("families follow reingest_of in both directions; only the newest finished ingest counts", async () => {
      const r = await repo();
      await setKb(r, ["meeting-notes (v2) → decision"]);
      const orig = await reg(r, "weekly", { date: "2026-10-01" });
      const b = await reg(r, "weekly", { date: "2026-10-05", origin: "docs/w2.md", reingestOf: orig });
      const c = await reg(r, "weekly", { date: "2026-10-08", origin: "docs/w3.md", reingestOf: orig }); // both name the original
      await finished(r, orig, { version: 1, at: "2026-10-01T10:00:00.000Z" });
      await finished(r, b, { version: 1, at: "2026-10-05T10:00:00.000Z" });
      await finished(r, c, { version: 1, at: "2026-10-08T10:00:00.000Z", origin: "docs/w3.md" });
      const res = await status(r);
      expect(res.json.data.reingest_candidates).toEqual([
        { source_id: c, origin: "docs/w3.md", kind: "meeting-notes", rule_version: 1, current_version: 2 },
      ]);
    }, T);

    it("a finished ingest whose meta is gone is its own family, with origin from the event", async () => {
      const r = await repo();
      await setKb(r, ["meeting-notes (v2) → decision"]);
      const id = await reg(r, "gone", { date: "2026-10-03" });
      await finished(r, id, { version: 1, at: "2026-10-03T10:00:00.000Z", origin: "https://example.com/page" });
      await unlink(path.join(r.paths.rawDir, `${id}.meta.json`));
      const res = await status(r);
      expect(res.json.data.reingest_candidates).toEqual([
        { source_id: id, origin: "https://example.com/page", kind: "meeting-notes", rule_version: 1, current_version: 2 },
      ]);
    }, T);

    it("a decision from another source does not cover a pending suggestion", async () => {
      const r = await repo();
      await setKb(r, ["meeting-notes (v2) → decision"]);
      const a = await reg(r, "alpha", { date: "2026-10-14" });
      const b = await reg(r, "beta", { date: "2026-10-15" });
      for (const id of [a, b]) await finished(r, id, { at: `${id.slice(4, 14)}T10:00:00.000Z` });
      await facts(r, a, ["one"]);
      await facts(r, b, ["two", "three"]);
      const rec = await run(r.root, ["rules", "record", "--rejected", "--kind", "meeting-notes", "--summary", "Track one", "--from", a, "--json"]);
      expect(rec.code, rec.text + rec.err).toBe(0);
      const res = await status(r);
      expect(res.json.data.pending_rule_suggestions).toEqual([{ source_id: b, items: ["two", "three"] }]);
    }, T);

    it("human output pluralises: '2 sources, 3 items' and the hint line", async () => {
      const r = await repo();
      await setKb(r, ["meeting-notes (v2) → decision"]);
      const a = await reg(r, "alpha", { date: "2026-10-14" });
      const b = await reg(r, "beta", { date: "2026-10-15" });
      await finished(r, a, { at: "2026-10-14T10:00:00.000Z" });
      await finished(r, b, { at: "2026-10-15T10:00:00.000Z" });
      await facts(r, a, ["one"]);
      await facts(r, b, ["two", "three"]);
      const t = lines((await status(r, true)).text);
      expect(t).toContain("pending rule suggestions: 2 sources, 3 items");
      expect(t).toContain("- two");
      expect(t.some((l) => l.startsWith("decide with wikeeper rules record --accepted|--rejected --kind <k> --summary <text> --from <id>"))).toBe(true);
    }, T);

    it("human output labels with nothing to report", async () => {
      const r = await repo();
      const t = lines((await status(r, true)).text);
      for (const l of ["open ingest: none", "unfinished sources: none", "re-ingest candidates: none", "pending rule suggestions: none", "misses: none"]) {
        expect(t, l).toContain(l);
      }
    }, T);
  });

  describe("S2: pending rule suggestions", () => {
    it("are listed until a decision with --from covers them", async () => {
      const r = await repo();
      await setKb(r, ["status-report (v1) → decision"]);
      const q4 = await reg(r, "q4-status", { date: "2026-10-16", kind: "status-report" });
      const sd = await reg(r, "standup", { date: "2026-10-16", kind: "status-report" });
      const draft = await reg(r, "draft", { date: "2026-10-16", kind: "status-report" });
      await finished(r, q4, { kind: "status-report", version: 1, at: "2026-10-16T10:00:00.000Z" });
      await finished(r, sd, { kind: "status-report", version: 1, at: "2026-10-16T10:05:00.000Z" });
      const item = "budget burn per project — no rule captures it";
      await facts(r, q4, [item]);
      await facts(r, sd, []);
      await facts(r, draft, ["x"]);
      const res = await status(r);
      expect(res.json.data.pending_rule_suggestions).toEqual([{ source_id: q4, items: [item] }]);
      const t = (await status(r, true)).text;
      expect(t).toContain("pending rule suggestions: 1 source, 1 item");
      expect(t).toContain(`    - ${item}`);
      const rec = await run(r.root, ["rules", "record", "--rejected", "--kind", "status-report", "--summary", "Budget burn per project", "--from", q4]);
      expect(rec.code, rec.text + rec.err).toBe(0);
      expect((await status(r)).json.data.pending_rule_suggestions).toEqual([]);
    }, T);
  });

  describe("S3: open ingest and stale lock", () => {
    const A = "src-2026-10-17-a";
    const rows: Array<{ name: string; lock: string | null; open: "null" | "obj"; stale: boolean; line: string }> = [
      { name: "no lock", lock: null, open: "null", stale: false, line: "open ingest: none" },
      {
        name: "fresh lock",
        lock: JSON.stringify({ source_id: A, pid: 1, hostname: "h", acquired_at: "2026-10-17T11:30:00Z" }),
        open: "obj",
        stale: false,
        line: `open ingest: ${A} holds the write lock (acquired 30 minutes ago)`,
      },
      {
        name: "stale lock",
        lock: JSON.stringify({ source_id: A, pid: 1, hostname: "h", acquired_at: "2026-10-17T09:00:00Z" }),
        open: "obj",
        stale: true,
        line: `open ingest: ${A} holds the write lock (acquired 3 hours ago); the lock is stale`,
      },
      { name: "unreadable lock", lock: "not json", open: "null", stale: true, line: "open ingest: .wiki/.lock is unreadable" },
    ];
    it.each(rows)("$name", async (row) => {
      const r = await repo();
      await reg(r, "a");
      await reg(r, "b");
      if (row.lock !== null) await writeFile(r.paths.lockFile, row.lock);
      const cmds = [await statusCmd(NOW)];
      const res = await run(r.root, ["status", "--json"], cmds);
      expect(res.json?.command, `${res.text} ${res.err}`).toBe("status");
      expect(res.code).toBe(0);
      if (row.open === "null") expect(res.json.data.open_ingest).toBeNull();
      else expect(res.json.data.open_ingest).toMatchObject({ source_id: A });
      expect(res.json.data.stale_lock).toBe(row.stale);
      const human = await run(r.root, ["status"], cmds);
      expect(lines(human.text).some((l) => l.startsWith(row.line))).toBe(true);
    }, T);
  });

  describe("S4: unfinished sources, setup, misses, read-only", () => {
    it("reports them and writes nothing", async () => {
      const r = await repo();
      await setKb(r, ["status-report (v1) → decision"]);
      const a = await reg(r, "a", { kind: "status-report" });
      const b = await reg(r, "b", { kind: "status-report" });
      const c = await reg(r, "c", { kind: "status-report" });
      await facts(r, a, ["x"]);
      await facts(r, b, []);
      await facts(r, c, []);
      const ap = await run(r.root, ["ingest", "apply", b, "--json"]);
      expect(ap.code, ap.text + ap.err).toBe(0);
      const ab = await run(r.root, ["ingest", "abort", b, "--json"]);
      expect(ab.code, ab.text + ab.err).toBe(0);
      await finished(r, c, { kind: "status-report", version: 1, at: "2026-10-17T10:00:00.000Z" });
      await miss(r, 3);
      await writeFile(r.paths.projectFile, "# Project\n");
      await unlink(r.paths.meFile).catch(() => undefined);

      const before = await hashTree(r.root);
      const res = await status(r);
      const human = await status(r, true);
      const after = await hashTree(r.root);
      expect(after).toEqual(before);

      expect(res.code).toBe(0);
      expect(res.json.data.unfinished_sources).toEqual([a, b]);
      expect(res.json.data.setup).toEqual({ completed_at: null, me: false, project: true });
      expect(res.json.data.misses).toBe(3);
      const t = lines(human.text);
      expect(t).toContain("unfinished sources: 2");
      expect(t).toContain("setup: not completed · me.md missing · project.md present");
      expect(t.some((l) => l.startsWith("misses: 3 recorded"))).toBe(true);
    }, T);
  });

  describe("S5: errors and warnings", () => {
    it("outside a wiki: exit 1, not_initialised", async () => {
      const root = await bareRoot();
      const res = await run(root, ["status", "--json"]);
      expect(res.json?.command).toBe("status");
      expect(res.code).toBe(1);
      expect(res.json.error.code).toBe("not_initialised");
    }, T);

    it("a facts file that is not valid JSON warns and gives no suggestions", async () => {
      const r = await repo();
      await setKb(r, ["meeting-notes (v2) → decision"]);
      const id = await reg(r, "q4-status", { date: "2026-10-16" });
      await finished(r, id, { at: "2026-10-16T10:00:00.000Z" });
      await writeFile(path.join(r.paths.rawDir, `${id}.facts.json`), "{ not json");
      const res = await status(r);
      expect(res.code).toBe(0);
      expect(res.json.warnings.some((w: string) => w.includes(`raw/${id}.facts.json`))).toBe(true);
      expect(res.json.data.pending_rule_suggestions).toEqual([]);
    }, T);

    it("a missing kb_instructions.md warns and gives no candidates", async () => {
      const r = await repo();
      await setKb(r, ["meeting-notes (v2) → decision"]);
      const id = await reg(r, "standup", { date: "2026-10-10" });
      await finished(r, id, { version: 1, at: "2026-10-10T10:00:00.000Z" });
      await unlink(r.paths.kbInstructions);
      const res = await status(r);
      expect(res.code).toBe(0);
      expect(res.json.warnings.some((w: string) => w.includes("kb_instructions.md is missing"))).toBe(true);
      expect(res.json.data.reingest_candidates).toEqual([]);
    }, T);

    it("a log file without frontmatter warns with its name", async () => {
      const r = await repo();
      await writeFile(path.join(r.paths.logDir, "2026-10-17-broken.md"), "just text, no header\n");
      const res = await status(r);
      expect(res.code).toBe(0);
      expect(res.json.warnings.some((w: string) => w.includes("2026-10-17-broken.md") && w.includes("no frontmatter"))).toBe(true);
    }, T);
  });
});
