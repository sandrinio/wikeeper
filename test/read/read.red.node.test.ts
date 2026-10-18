import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { estimateTokens, levelOf } from "../../src/core/tokens.js";
import { formatSize } from "../../src/ingest/report.js";
import { describeTokens } from "../../src/ingest/source-size.js";
import { runCli } from "../../src/program.js";
import { startFixtureServer, type FixtureServer } from "./http-server.js";

// Red tests for STORY-003-10 (SPRINT-03): `wikeeper read` -- command, URL reading, limits, ai-mode allow rule.
// The implementation does not exist yet: every scenario fails until it does.
async function load<T = Record<string, any>>(spec: string): Promise<T> {
  try {
    return (await import(/* @vite-ignore */ spec)) as T;
  } catch (e) {
    throw new Error(`not yet implemented: ${spec} (${(e as Error).message})`);
  }
}
const loadCommand = () => load<any>("../../src/commands/read.js");
const loadRead = () => load<any>("../../src/read/index.js");

const T = 60_000;
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURES = path.join(PKG_ROOT, "test", "fixtures", "read");
const SETUP = path.join(PKG_ROOT, "templates", "system", "SETUP.md");
const IS_WIN = process.platform === "win32";
const cleanup: string[] = [];

let server: FixtureServer;
beforeAll(async () => {
  server = await startFixtureServer();
});
afterAll(async () => {
  await server.close();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetIntegrations();
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function tmp(prefix: string): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanup.push(d);
  return d;
}
async function put(root: string, rel: string, content: string | Buffer): Promise<void> {
  const f = path.join(root, ...rel.split("/"));
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, content);
}

const NOTES_TEXT = (): Promise<string> => readFile(path.join(FIXTURES, "notes.md"), "utf8");
const CSV_TEXT = (): Promise<string> => readFile(path.join(FIXTURES, "table.csv"), "utf8");
const noFinalNewline = (s: string): string => s.replace(/\n$/, "");
const CRLF_LINES = ["alpha line", "beta line", "", "gamma line"];
const UTF16_TEXT = "Привет, мир\nвторая строка\n";

/** A working directory holding the fixtures plus the in-memory encoded variants. No .git or .wiki above it. */
async function workdir(): Promise<string> {
  const dir = await tmp("wikeeper-read-");
  for (const name of ["article.html", "app-shell.html", "notes.md", "table.csv"]) {
    await copyFile(path.join(FIXTURES, name), path.join(dir, name));
  }
  const notes = await readFile(path.join(FIXTURES, "notes.md"));
  await writeFile(path.join(dir, "notes-bom.md"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), notes]));
  await writeFile(path.join(dir, "notes-crlf.txt"), CRLF_LINES.join("\r\n") + "\r\n");
  await writeFile(path.join(dir, "notes-utf16.txt"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(UTF16_TEXT, "utf16le")]));
  return dir;
}

async function drive(cwd: string, args: string[], commands?: unknown[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    ...(commands ? { commands } : {}),
    io: {
      cwd,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Object.assign(Readable.from([]), { isTTY: false }),
    },
  } as never);
  const stdout = out.join("");
  let json: any = null;
  try {
    json = JSON.parse(stdout.trim().split("\n")[0]!);
  } catch {
    json = null;
  }
  return { code, stdout, stderr: err.join(""), json };
}
/** Runs `read` through the command module under test. */
async function readCli(cwd: string, args: string[], deps?: Record<string, unknown>) {
  const mod = await loadCommand();
  return drive(cwd, ["read", ...args], [mod.createReadCommand(deps)]);
}

/** Hash of every path (files, dirs, empty dirs) and every file's bytes. */
async function hashTree(root: string): Promise<string> {
  const h = createHash("sha256");
  const walk = async (rel: string): Promise<void> => {
    const abs = path.join(root, rel);
    const st = await lstat(abs);
    if (st.isDirectory()) {
      h.update(`D ${rel}\n`);
      for (const n of (await readdir(abs)).sort()) await walk(path.join(rel, n));
    } else h.update(`F ${rel} ${createHash("sha256").update(await readFile(abs)).digest("hex")}\n`);
  };
  await walk("");
  return h.digest("hex");
}

// ---------- S1 ----------
describe("STORY-003-10 S1: each supported input becomes markdown (red)", () => {
  type Row = {
    name: string;
    input: (u: (p: string) => string) => string;
    format: string;
    title: string | null;
    warnings: string[];
    check: (md: string, ref: Record<string, string>) => void | Promise<void>;
  };
  const rows: Row[] = [
    { name: "URL /article", input: (u) => u("/article"), format: "html", title: "Q4 status", warnings: [], check: (md) => expect(md.startsWith("# Q4 status")).toBe(true) },
    { name: "file article.html", input: () => "article.html", format: "html", title: "Q4 status", warnings: [], check: (md, ref) => expect(md).toBe(ref.article) },
    { name: "URL /moved (302)", input: (u) => u("/moved"), format: "html", title: "Q4 status", warnings: [], check: (md, ref) => expect(md).toBe(ref.article) },
    { name: "URL /cafe (windows-1252)", input: (u) => u("/cafe"), format: "html", title: "Café", warnings: [], check: (md) => expect(md).toContain("Crème brûlée") },
    {
      name: "URL /app (needs a browser)",
      input: (u) => u("/app"),
      format: "html",
      title: "Acme App",
      warnings: ["needs_browser"],
      check: (md) => expect((md.match(/[\p{L}\p{N}]+/gu) ?? []).length).toBeLessThan(20),
    },
    { name: "URL /notes.txt", input: (u) => u("/notes.txt"), format: "text", title: null, warnings: [], check: async (md) => expect(md).toBe(noFinalNewline(await NOTES_TEXT())) },
    { name: "file notes-bom.md", input: () => "notes-bom.md", format: "markdown", title: null, warnings: [], check: async (md) => expect(md).toBe(noFinalNewline(await NOTES_TEXT())) },
    { name: "file notes-crlf.txt", input: () => "notes-crlf.txt", format: "text", title: null, warnings: [], check: (md) => { expect(md).not.toContain("\r"); expect(md.split("\n")).toEqual(CRLF_LINES); } },
    { name: "file notes-utf16.txt", input: () => "notes-utf16.txt", format: "text", title: null, warnings: [], check: (md) => expect(md).toBe(noFinalNewline(UTF16_TEXT)) },
    { name: "file table.csv", input: () => "table.csv", format: "text", title: null, warnings: [], check: async (md) => expect(md).toBe(noFinalNewline(await CSV_TEXT())) },
    { name: "URL /export (text/csv)", input: (u) => u("/export"), format: "text", title: null, warnings: [], check: async (md) => expect(md).toBe(noFinalNewline(await CSV_TEXT())) },
  ];

  const articleMarkdown = async (cwd: string): Promise<string> => {
    const r = await readCli(cwd, [server.url("/article"), "--json"]);
    expect(r.code).toBe(0);
    return r.json.data.markdown as string;
  };

  it.each(rows.map((r) => [r.name, r] as const))("%s", async (_n, row) => {
    const cwd = await workdir();
    const ref = { article: await articleMarkdown(cwd) };
    const r = await readCli(cwd, [row.input(server.url), "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.ok).toBe(true);
    expect(r.json.command).toBe("read");
    expect(r.json.data.format).toBe(row.format);
    expect(r.json.data.title).toBe(row.title);
    expect(r.json.data.warnings.map((w: any) => w.code)).toEqual(row.warnings);
    await row.check(r.json.data.markdown, ref);
  }, T);
});

// ---------- S2 ----------
describe("STORY-003-10 S2: the article keeps its structure on stdout, in --out and in --json (red)", () => {
  it("stdout, --out, --json, the /app warning and ingest start --text-file", async () => {
    const cwd = await workdir();
    const url = server.url("/article");

    const first = await readCli(cwd, [url]);
    expect(first.code).toBe(0);
    const lines = first.stdout.split("\n");
    expect(lines.slice(0, 4)).toEqual(["# Q4 status", "", "Author: Product Lead · Date: 2026-10-01", ""]);
    expect(first.stdout).toContain("## Risks");
    expect(lines).toContain("- Vendor delay");
    expect(lines).toContain("- Hiring");
    const at = lines.indexOf("| Item | Owner | Due |");
    expect(at).toBeGreaterThan(-1);
    expect(lines[at + 1]).toMatch(/^\|\s*:?-+:?\s*\|\s*:?-+:?\s*\|\s*:?-+:?\s*\|$/);
    expect(first.stdout).not.toContain("Pricing");
    expect(first.stdout).not.toContain("Privacy");
    expect(first.stderr).toBe("");

    const outRun = await readCli(cwd, [url, "--out", "page.md"]);
    expect(outRun.code).toBe(0);
    const bytes = await readFile(path.join(cwd, "page.md"));
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(bytes.includes(0x0d)).toBe(false);
    expect(bytes.toString("utf8")).toBe(first.stdout);
    const pageTokens = estimateTokens(first.stdout.replace(/\n$/, ""));
    expect(outRun.stdout).toBe(
      `wrote page.md (${describeTokens(pageTokens, levelOf(pageTokens, DEFAULT_CONFIG.tokens.source), false)} · ${formatSize(bytes.length)} · html)\n`,
    );

    const outside = await tmp("wikeeper-read-out-");
    const target = path.join(outside, "page2.md");
    const j = await readCli(cwd, [url, "--out", target, "--json"]);
    expect(j.code).toBe(0);
    expect(j.json.data).toMatchObject({ title: "Q4 status", author: "Product Lead", date: "2026-10-01", format: "html", warnings: [], out: target });
    expect(j.json.data.markdown).toBe(noFinalNewline(bytes.toString("utf8")));

    const app = await readCli(cwd, [server.url("/app")]);
    expect(app.code).toBe(0);
    expect(app.stderr.split("\n").some((l) => l.startsWith("warning: the page has almost no main content"))).toBe(true);

    // the written file feeds `ingest start --text-file` in an initialised ai-mode wiki
    const wikiRoot = await tmp("wikeeper-read-wiki-");
    await mkdir(path.join(wikiRoot, ".git"), { recursive: true });
    expect((await drive(wikiRoot, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
    await writeFile(path.join(wikiRoot, ".wiki", "config.yml"), "ingest:\n  permission: ai\n");
    await writeFile(path.join(wikiRoot, "page.md"), bytes);
    const s = await drive(wikiRoot, ["ingest", "start", url, "--text-file", "page.md", "--json"]);
    expect(s.code).toBe(0);
    expect(s.json.data.status).toBe("registered");
  }, T);
});

// ---------- S3 (in-process part) ----------
describe("STORY-003-10 S3: one request per read, through opts.fetch only (red)", () => {
  it("readSource uses opts.fetch, never globalThis.fetch, and sends one GET", async () => {
    const { readSource } = await loadRead();
    const realFetch = globalThis.fetch;
    server.requests.splice(0);
    const cwd = await workdir();
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("globalThis.fetch must not be used when opts.fetch is given");
    }) as typeof fetch;
    try {
      const r = await readSource(server.url("/article"), { cwd, fetch: realFetch });
      expect(r.format).toBe("html");
    } finally {
      globalThis.fetch = original;
    }
    expect(server.requests).toEqual(["GET /article"]);
  }, T);
});

// ---------- S4 ----------
describe("STORY-003-10 S4: limits, bad sources and unsafe --out targets fail cleanly (red)", () => {
  async function closedPort(): Promise<number> {
    const s = net.createServer();
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    const port = (s.address() as net.AddressInfo).port;
    await new Promise<void>((r) => s.close(() => r()));
    return port;
  }
  type Row = {
    name: string;
    setup?: (cwd: string) => Promise<void>;
    args: (cwd: string) => Promise<string[]> | string[];
    deps?: Record<string, unknown>;
    exit: number;
    code: string;
  };
  const rows: Row[] = [
    { name: "timeout", args: () => [server.url("/slow")], deps: { timeoutMs: 300 }, exit: 1, code: "timeout" },
    { name: "too_large by Content-Length", args: () => [server.url("/big")], deps: { maxBytes: 1024 }, exit: 1, code: "too_large" },
    { name: "too_large by streaming", args: () => [server.url("/stream")], deps: { maxBytes: 1024 }, exit: 1, code: "too_large" },
    { name: "http_error 404", args: () => [server.url("/gone")], exit: 1, code: "http_error" },
    { name: "fetch_failed (closed port)", args: async () => [`http://127.0.0.1:${await closedPort()}/x`], exit: 1, code: "fetch_failed" },
    { name: "unsupported content type", args: () => [server.url("/logo")], exit: 2, code: "unsupported" },
    { name: "ftp scheme", args: () => ["ftp://example.com/notes.txt"], exit: 2, code: "usage" },
    { name: "no source", args: () => [], exit: 2, code: "usage" },
    { name: "stdin dash", args: () => ["-"], exit: 2, code: "usage" },
    { name: "missing file", args: () => ["missing.pdf"], exit: 2, code: "not_found" },
    { name: "directory", setup: async (cwd) => { await mkdir(path.join(cwd, "docs")); }, args: () => ["docs"], exit: 2, code: "usage" },
    { name: "unknown extension", setup: async (cwd) => { await put(cwd, "data.xyz", "x"); }, args: () => ["data.xyz"], exit: 2, code: "unsupported" },
    { name: "--out existing file", setup: async (cwd) => { await put(cwd, "notes.md", "n\n"); await put(cwd, "page.md", "keep\n"); }, args: () => ["notes.md", "--out", "page.md"], exit: 2, code: "usage" },
    { name: "--out missing parent", setup: async (cwd) => { await put(cwd, "notes.md", "n\n"); }, args: () => ["notes.md", "--out", "drafts/page.md"], exit: 2, code: "usage" },
    { name: "--out bad extension", setup: async (cwd) => { await put(cwd, "notes.md", "n\n"); }, args: () => ["notes.md", "--out", "page.json"], exit: 2, code: "usage" },
    { name: "--out CLAUDE.md", setup: async (cwd) => { await put(cwd, "notes.md", "n\n"); }, args: () => ["notes.md", "--out", "CLAUDE.md"], exit: 2, code: "usage" },
    {
      name: "--out into a hidden folder",
      setup: async (cwd) => { await put(cwd, "notes.md", "n\n"); await mkdir(path.join(cwd, ".claude", "skills", "x"), { recursive: true }); },
      args: () => ["notes.md", "--out", ".claude/skills/x/SKILL.md"],
      exit: 2,
      code: "usage",
    },
    {
      name: "--out inside the wiki content dir",
      setup: async (cwd) => {
        await mkdir(path.join(cwd, ".git"), { recursive: true });
        await put(cwd, ".wiki/config.yml", "content_dir: kb\ningest:\n  permission: ai\n");
        await mkdir(path.join(cwd, "kb", "pages"), { recursive: true });
        await put(cwd, "notes.md", "n\n");
      },
      args: () => ["notes.md", "--out", "kb/pages/notes.md"],
      exit: 2,
      code: "usage",
    },
  ];

  it("has the 18 rows of the scenario outline", () => {
    expect(rows).toHaveLength(18);
  });

  it.each(rows.map((r) => [r.name, r] as const))("%s", async (_n, row) => {
    const cwd = await tmp("wikeeper-read-err-");
    await row.setup?.(cwd);
    const before = await hashTree(cwd);
    const args = [...(await row.args(cwd)), "--json"];
    const r = await readCli(cwd, args, row.deps);
    expect(r.code).toBe(row.exit);
    expect(r.json.ok).toBe(false);
    expect(r.json.command).toBe("read");
    expect(r.json.error.code).toBe(row.code);
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
    expect(await hashTree(cwd)).toBe(before);
  }, T);

  it("too_large carries details.limit_bytes and http_error carries status and url", async () => {
    const cwd = await tmp("wikeeper-read-err-");
    const big = await readCli(cwd, [server.url("/big"), "--json"], { maxBytes: 1024 });
    expect(big.json.error.details).toMatchObject({ limit_bytes: 1024 });
    const gone = await readCli(cwd, [server.url("/gone"), "--json"]);
    expect(gone.json.error.details).toMatchObject({ status: 404 });
  }, T);
});

// ---------- S5 ----------
describe("STORY-003-10 S5: ai mode allows read without a prompt; ask and whitelist do not (red)", () => {
  const READ_CLAUDE = ["Bash(npx wikeeper read *)", "Bash(wikeeper read *)"];
  const READ_CODEX = [
    'prefix_rule(pattern=["npx","wikeeper","read"], decision="allow")',
    'prefix_rule(pattern=["wikeeper","read"], decision="allow")',
  ];
  const INGEST_CLAUDE = ["Bash(npx wikeeper ingest *)", "Bash(wikeeper ingest *)"];
  const SEARCH_CLAUDE = ["Bash(npx wikeeper search *)", "Bash(wikeeper search *)"];
  const INGEST_CODEX = [
    'prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")',
    'prefix_rule(pattern=["wikeeper","ingest"], decision="allow")',
    'prefix_rule(pattern=["npx","wikeeper","ingest","abort"], decision="prompt")',
    'prefix_rule(pattern=["wikeeper","ingest","abort"], decision="prompt")',
  ];
  const SEARCH_CODEX = [
    'prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")',
    'prefix_rule(pattern=["wikeeper","search"], decision="allow")',
  ];

  async function pathWithWikeeper(): Promise<void> {
    const bin = await tmp("wikeeper-bin-");
    const file = path.join(bin, IS_WIN ? "wikeeper.cmd" : "wikeeper");
    await writeFile(file, IS_WIN ? "@echo off\r\n" : "#!/bin/sh\nexit 0\n");
    if (!IS_WIN) await chmod(file, 0o755);
    if (IS_WIN) vi.stubEnv("PATHEXT", ".CMD");
    vi.stubEnv("PATH", bin);
  }
  async function readOr(file: string): Promise<string> {
    try {
      return await readFile(file, "utf8");
    } catch {
      return "";
    }
  }
  async function snapshot(root: string) {
    const settings = await readOr(path.join(root, ".claude", "settings.json"));
    const allow: string[] = settings ? (JSON.parse(settings).permissions?.allow ?? []) : [];
    const codex = (await readOr(path.join(root, ".codex", "rules", "wikeeper.rules"))).split(/\r?\n/).filter(Boolean);
    return { allow, codex };
  }
  const hasRead = (s: { allow: string[]; codex: string[] }) => READ_CLAUDE.some((r) => s.allow.includes(r)) || READ_CODEX.some((l) => s.codex.includes(l));
  const idx = (xs: string[], x: string) => xs.indexOf(x);

  const examples: [mode: string, installed: boolean, next: string, afterUpdate: boolean][] = [
    ["ai", true, "ask", false],
    ["ask", false, "ai", true],
    ["whitelist", false, "ai", true],
  ];

  it.each(examples)("mode %s", async (mode, installed, next, afterUpdate) => {
    const { CLAUDE_ENFORCE } = await import("../../src/agents/enforce/claude.js") as any;
    const { CODEX_ENFORCE } = await import("../../src/agents/enforce/codex.js") as any;
    const agents = await import("../../src/agents/index.js") as any;
    resetIntegrations();
    registerIntegration({ name: "agents", ...agents.agentsIntegration } as never);
    await pathWithWikeeper();
    const root = await tmp("wikeeper-read-rules-");
    await mkdir(path.join(root, ".git"), { recursive: true });
    await put(root, ".wiki/config.yml", `agents: [claude, codex]\ningest:\n  permission: ${mode}\n`);

    const init = await drive(root, ["init", "--agents", "claude,codex", "--enforce", "--yes", "--json"]);
    expect(init.code).toBe(0);
    const snap = await snapshot(root);
    for (const r of READ_CLAUDE) expect(snap.allow.includes(r)).toBe(installed);
    for (const l of READ_CODEX) expect(snap.codex.includes(l)).toBe(installed);

    if (installed) {
      for (const r of READ_CLAUDE) {
        for (const i of INGEST_CLAUDE) expect(idx(snap.allow, r)).toBeGreaterThan(idx(snap.allow, i));
        for (const s of SEARCH_CLAUDE) expect(idx(snap.allow, r)).toBeLessThan(idx(snap.allow, s));
      }
      for (const l of READ_CODEX) {
        for (const i of INGEST_CODEX) expect(idx(snap.codex, l)).toBeGreaterThan(idx(snap.codex, i));
        for (const s of SEARCH_CODEX) expect(idx(snap.codex, l)).toBeLessThan(idx(snap.codex, s));
      }
    }

    // the step-4 preview row lists the read rules exactly where the writers emit them
    const setup = await readFile(SETUP, "utf8");
    const row = setup.split(/\r?\n/).find((l) => l.startsWith(`| \`${mode}\` |`));
    expect(row, `${mode} row in SETUP.md`).toBeDefined();
    const writerValues: string[] = [
      ...CLAUDE_ENFORCE.items("CMD", mode).filter((i: any) => i.kind === "rule").map((i: any) => i.value as string),
      ...(CODEX_ENFORCE as any[]).flatMap((s) => s.items("CMD", mode)).filter((i: any) => i.kind === "rule").map((i: any) => i.value as string),
    ];
    for (const v of writerValues) expect(row!, `${mode} row lists ${v}`).toContain(v);
    for (const v of [...READ_CLAUDE, ...READ_CODEX]) expect(row!.includes(v)).toBe(installed);
    for (const v of [...READ_CLAUDE, ...READ_CODEX]) expect(writerValues.includes(v)).toBe(installed);

    await writeFile(path.join(root, ".wiki", "config.yml"), `agents: [claude, codex]\nenforce: true\ningest:\n  permission: ${next}\n`);
    const upd = await drive(root, ["update", "--json"]);
    expect(upd.code).toBe(0);
    const after = await snapshot(root);
    for (const r of READ_CLAUDE) expect(after.allow.includes(r)).toBe(afterUpdate);
    for (const l of READ_CODEX) expect(after.codex.includes(l)).toBe(afterUpdate);

    const rm1 = await drive(root, ["remove", "--json"]);
    expect(rm1.code).toBe(0);
    expect(hasRead(await snapshot(root))).toBe(false);
  }, T);
});
