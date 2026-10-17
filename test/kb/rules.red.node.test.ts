import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createRulesCommand } from "../../src/commands/rules.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeLogEvent } from "../../src/ingest/log.js";
import { registerSource } from "../../src/ingest/registry.js";
import { runCli } from "../../src/program.js";

const T = 30_000;
const Q4 = "src-2026-10-17-q4-status";
const OTHER = "src-2026-10-17-other";
const BASE = Date.parse("2026-10-17T10:00:00.000Z");

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

// A clock that hands out a new minute on every call, so no two recorded events share a time
// (FLASHCARD #log #test-harness: an equal-at event gets a "-2" file name that sorts first).
function clock(): () => Date {
  let n = 0;
  return () => new Date(BASE + 60_000 * n++);
}

async function run(root: string, args: string[], now: () => Date = clock()) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    commands: [createRulesCommand({ now })],
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Object.assign(Readable.from([]), { isTTY: false }),
    },
  } as never);
  const text = out.join("");
  const errText = err.join("");
  let json: any = null;
  for (const src of [text, errText]) {
    try {
      json = JSON.parse(src.trim().split("\n")[0]!);
      break;
    } catch {
      /* human output */
    }
  }
  return { code, json, text, err: errText };
}

async function initRun(root: string, args: string[]) {
  const out: string[] = [];
  const code = await runCli(args, {
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: () => true },
      stdin: Object.assign(Readable.from([]), { isTTY: false }),
    },
  } as never);
  return { code, text: out.join("") };
}

interface Repo {
  root: string;
  paths: ResolvedPaths;
}
async function repo(): Promise<Repo> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-rules-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  const init = await initRun(root, ["init", "--yes", "--agents", "claude", "--json"]);
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
    now: new Date("2026-10-17T08:00:00Z"),
  } as never);
  return meta.id;
}

async function hashTree(root: string, skip: (rel: string) => boolean = () => false): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  async function walk(dir: string): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile() && !skip(rel)) h[rel] = createHash("sha256").update(await readFile(abs)).digest("hex");
    }
  }
  await walk(root);
  return h;
}
const inLog = (rel: string) => rel.startsWith(".wiki/log/");
async function logFiles(r: Repo): Promise<string[]> {
  try {
    return (await readdir(r.paths.logDir)).sort();
  } catch {
    return [];
  }
}
function frontmatter(text: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)![1]!;
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return out;
}

describe("STORY-005-06 rules record / list", () => {
  it("S1: a rejected proposal is remembered by fingerprint", async () => {
    const r = await repo();
    const now = clock();
    const first = await run(r.root, ["rules", "record", "--rejected", "--kind", "meeting-notes", "--summary", "Track attendees", "--json"], now);
    expect(first.code).toBe(0);
    expect(first.json.data.previously_rejected).toBe(false);
    const firstFile: string = first.json.data.file;

    const second = await run(
      r.root,
      ["rules", "record", "--accepted", "--kind", "Meeting-Notes", "--summary", "  track   ATTENDEES ", "--json"],
      now,
    );
    expect(second.code).toBe(0);
    expect(second.json.data.fingerprint).toBe("86420d5cacb9");
    expect(second.json.data.previously_rejected).toBe(true);
    expect(second.json.warnings).toContain(`this proposal was rejected before (${firstFile})`);

    const list = await run(r.root, ["rules", "list", "--json"], now);
    expect(list.code).toBe(0);
    const d = list.json.data.decisions;
    expect(d).toHaveLength(2);
    expect(d.map((x: any) => x.fingerprint)).toEqual(["86420d5cacb9", "86420d5cacb9"]);
    expect(d.map((x: any) => x.previously_rejected)).toEqual([false, true]);
    expect(list.json.data.counts).toEqual({ accepted: 1, rejected: 1 });

    const human = await run(r.root, ["rules", "list"], now);
    expect(human.code).toBe(0);
    expect(human.text).toContain("2 rule decisions");
    expect(human.text.split("\n").some((l) => l.endsWith("(previously rejected)"))).toBe(true);
  }, T);

  const rows = [
    { name: "no lock, no source", lock: false, kind: "status-report", summary: "Budget burn per project", from: false },
    { name: "lock held, with --from", lock: true, kind: "status-report", summary: "Budget burn per project", from: true },
    { name: "section key never-capture", lock: false, kind: "never-capture", summary: "Salary figures", from: false },
  ];
  for (const row of rows) {
    it(`S2: a decision is one log event and nothing else (${row.name})`, async () => {
      const r = await repo();
      const id = await register(r, "q4-status");
      expect(id).toBe(Q4);
      if (row.lock) {
        await writeFile(
          path.join(r.root, ".wiki", ".lock"),
          JSON.stringify({ source_id: OTHER, pid: 4242, hostname: "other", acquired_at: new Date().toISOString() }),
        );
      }
      const beforeLog = await logFiles(r);
      const beforeOutside = await hashTree(r.root, inLog);
      const args = ["rules", "record", "--rejected", "--kind", row.kind, "--summary", row.summary];
      if (row.from) args.push("--from", Q4);
      const res = await run(r.root, [...args, "--json"]);
      expect(res.code).toBe(0);

      const afterLog = await logFiles(r);
      const added = afterLog.filter((f) => !beforeLog.includes(f));
      expect(added).toHaveLength(1);
      expect(afterLog).toHaveLength(beforeLog.length + 1);
      expect(await hashTree(r.root, inLog)).toEqual(beforeOutside);

      const text = await readFile(path.join(r.paths.logDir, added[0]!), "utf8");
      const fm = frontmatter(text);
      expect(fm["type"]).toBe("rule-proposal");
      expect(fm["kind"]).toBe(row.kind);
      expect(fm["summary"]).toBe(row.summary);
      expect(fm["fingerprint"]).toMatch(/^[0-9a-f]{12}$/);
      expect(fm["decision"]).toBe("rejected");
      if (row.from) expect(fm["source_id"]).toBe(Q4);
      else expect(fm["source_id"]).toBeUndefined();
      expect(text).toContain(`\nRule proposal rejected for ${row.kind}: ${row.summary}\n`);
      expect(res.json.data.source_id).toBe(row.from ? Q4 : null);
    }, T);
  }

  it("S3: rules list reads only well-formed decisions and writes nothing", async () => {
    const r = await repo();
    const rec = await run(r.root, ["rules", "record", "--rejected", "--kind", "meeting-notes", "--summary", "Track attendees", "--json"]);
    expect(rec.code).toBe(0);
    const tighten = await writeLogEvent(r.paths, { type: "rule-proposal", at: "2026-10-17T11:00:00.000Z", summary: "tighten" });
    await writeLogEvent(r.paths, { type: "miss", at: "2026-10-17T12:00:00.000Z", query: "atlas", filters: {} } as never);
    const before = await hashTree(r.root);

    const list = await run(r.root, ["rules", "list", "--json"]);
    expect(list.code).toBe(0);
    expect(list.json.data.decisions).toHaveLength(1);
    expect(list.json.data.decisions[0]).toMatchObject({ kind: "meeting-notes", decision: "rejected", source_id: null });
    expect(list.json.data.counts).toEqual({ accepted: 0, rejected: 1 });
    expect(list.json.warnings.some((w: string) => w.includes(path.posix.basename(tighten)))).toBe(true);
    expect(await hashTree(r.root)).toEqual(before);
  }, T);

  const bad = [
    { args: ["--accepted", "--rejected", "--kind", "meeting-notes", "--summary", "x"], exit: 2, code: "usage" },
    { args: ["--kind", "meeting-notes", "--summary", "x"], exit: 2, code: "usage" },
    { args: ["--rejected", "--kind", "meeting-notes"], exit: 2, code: "usage" },
    { args: ["--rejected", "--kind", "meeting notes!", "--summary", "x"], exit: 2, code: "usage" },
    { args: ["--rejected", "--kind", "source-kinds", "--summary", "x"], exit: 2, code: "usage" },
    { args: ["--rejected", "--kind", "rule-changelog", "--summary", "x"], exit: 2, code: "usage" },
    { args: ["--rejected", "--kind", "meeting-notes", "--summary", "x", "--from", "notes.md"], exit: 2, code: "usage" },
    { args: ["--rejected", "--kind", "meeting-notes", "--summary", "x", "--from", "src-2026-10-17-ghost"], exit: 1, code: "unknown_source" },
    { args: ["--rejected", "--kind", "meeting-notes", "--summary", "x"], exit: 1, code: "not_initialised", noWiki: true },
  ];
  bad.forEach((row, i) => {
    it(`S4 row ${i + 1}: refused with ${row.code} and nothing written (${row.args.join(" ")})`, async () => {
      let root: string;
      let logDir: string;
      if ((row as any).noWiki) {
        root = await mkdtemp(path.join(os.tmpdir(), "wk-rules-empty-"));
        tmpDirs.push(root);
        await mkdir(path.join(root, ".git"), { recursive: true });
        logDir = path.join(root, ".wiki", "log");
      } else {
        const r = await repo();
        root = r.root;
        logDir = r.paths.logDir;
      }
      const res = await run(root, ["rules", "record", ...row.args, "--json"]);
      expect(res.code).toBe(row.exit);
      expect(res.json).not.toBeNull();
      expect(res.json.ok).toBe(false);
      expect(res.json.command).toBe("rules record");
      expect(res.json.error.code).toBe(row.code);
      let files: string[] = [];
      try {
        files = await readdir(logDir);
      } catch {
        /* no log dir */
      }
      expect(files.filter((f) => !f.startsWith("."))).toEqual([]);
    }, T);
  });
});
