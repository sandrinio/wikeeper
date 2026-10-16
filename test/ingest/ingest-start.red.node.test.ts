import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

const NOW = new Date(Date.UTC(2026, 9, 16, 9, 30, 0));
const KB = "# KB\n\n## Source kinds\n\n- status-report (v2) → project.status, risk\n";
const WL = "ingest:\n  permission: whitelist\n  whitelist:\n    origins:\n      - docs/meetings/**\n    kinds: []\n";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function repo(config: string | null, kb: string | null = KB): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-istart-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  if (config !== null) {
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    await writeFile(path.join(root, ".wiki", "config.yml"), config);
    if (kb !== null) await writeFile(path.join(root, ".wiki", "kb_instructions.md"), kb);
  }
  return root;
}
const mode = (m: string, extra = "") => `ingest:\n  permission: ${m}\n${extra}`;
async function put(root: string, rel: string, content: string | Buffer): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), content);
}
async function raw(root: string): Promise<string[]> {
  try {
    return (await readdir(path.join(root, ".wiki", "raw"))).sort();
  } catch {
    return [];
  }
}

async function run(root: string, args: string[], stdin?: string | Buffer | null) {
  const { createIngestCommand } = await import("../../src/commands/ingest.js");
  const { createIngestStartCommand } = await import("../../src/commands/ingest-start.js");
  const { runCli } = await import("../../src/program.js");
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    commands: [createIngestCommand([createIngestStartCommand({ now: () => NOW })])],
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Readable.from(stdin === undefined || stdin === null ? [] : [Buffer.from(stdin)]),
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

describe("STORY-003-04 ingest start (red)", () => {
  it("S1a: file with a ruled kind registers under ai", async () => {
    const root = await repo(mode("ai"));
    await put(root, "docs/q4.pdf", Buffer.from([1, 2, 3, 4]));
    const r = await run(root, ["ingest", "start", "docs/q4.pdf", "--kind", "status-report", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.status).toBe("registered");
    const id = r.json.data.id as string;
    expect(id).toBe("src-2026-10-16-q4");
    expect(await raw(root)).toEqual([`${id}.meta.json`, `${id}.pdf`]);
    expect(r.json.data.source.origin_type).toBe("file");
    expect(r.json.data.source.rule_version).toBe(2);
    expect(r.json.data.rule.version).toBe(2);
    expect(r.json.data.available_kinds).toEqual([{ id: "status-report", version: 2 }]);
    expect(r.json.warnings ?? []).toEqual([]);
    expect(r.json.data.next).toBe(`wikeeper ingest facts ${id} < facts.json`);
    expect(r.json.data.permission.decision).toBe("allowed");
    expect(r.json.data.id).toBe(r.json.data.source.id);
  });

  it("S1b: URL with --text-file registers the text as raw/<id>.md", async () => {
    const root = await repo(mode("ai"));
    await put(root, "page.md", "page text");
    const r = await run(root, ["ingest", "start", "https://acme.example.com/q4", "--text-file", "page.md", "--json"]);
    expect(r.code).toBe(0);
    const id = r.json.data.id as string;
    expect(id).toBe("src-2026-10-16-q4");
    expect(await raw(root)).toEqual([`${id}.md`, `${id}.meta.json`]);
    expect(r.json.data.source.origin_type).toBe("url");
    expect(r.json.data.source.rule_version).toBeNull();
    expect(r.json.warnings ?? []).toEqual([]);
    expect(r.json.data.next).toBe(`wikeeper ingest facts ${id} < facts.json`);
  });

  it("S1c: stdin excerpt with an unruled kind warns", async () => {
    const root = await repo(mode("ai"));
    const r = await run(root, ["ingest", "start", "-", "--kind", "chat-excerpt", "--title", "vendor-decision", "--json"], "We decided to drop vendor X");
    expect(r.code).toBe(0);
    const id = r.json.data.id as string;
    expect(id).toBe("src-2026-10-16-vendor-decision");
    expect(await raw(root)).toEqual([`${id}.md`, `${id}.meta.json`]);
    expect(await readFile(path.join(root, ".wiki", "raw", `${id}.md`), "utf8")).toBe("We decided to drop vendor X");
    expect(r.json.data.source.origin_type).toBe("stdin");
    expect(r.json.data.source.rule_version).toBeNull();
    expect(r.json.warnings).toHaveLength(1);
    expect(r.json.warnings[0]).toContain("chat-excerpt");
    expect(r.json.data.next).toBe(`wikeeper ingest facts ${id} < facts.json`);
  });

  it("S1d: ingest --help lists start", async () => {
    const root = await repo(mode("ai"));
    const r = await run(root, ["ingest", "--help"]);
    expect(r.code).toBe(0);
    expect(r.text + r.err).toMatch(/\bstart\b/);
  });

  it("S2: ask mode needs approval, then --approved registers", async () => {
    const root = await repo(mode("ask"));
    await put(root, "notes.md", "hello\n");
    const a = await run(root, ["ingest", "start", "notes.md", "--json"]);
    expect(a.code).toBe(3);
    expect(a.json.error.code).toBe("needs_approval");
    expect(a.json.error.command).toBe("ingest start");
    expect(a.json.error.details.source.origin).toBe("notes.md");
    expect(a.json.error.details.source.size).toBe(6);
    expect(a.json.error.details.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await raw(root)).toEqual([]);
    const h = await run(root, ["ingest", "start", "notes.md"]);
    expect(h.code).toBe(3);
    expect(h.err).toContain("notes.md");
    expect(h.err).toContain("6");
    expect(h.err).toContain("--approved");
    expect(await raw(root)).toEqual([]);
    const b = await run(root, ["ingest", "start", "notes.md", "--approved", "--json"]);
    expect(b.code).toBe(0);
    expect(b.json.data.source.permission.mode).toBe("ask");
    expect(b.json.data.source.permission.approved).toBe(true);
  });

  it("S3: duplicate is reported; --reingest registers anew without touching the prior", async () => {
    const root = await repo(mode("ai"));
    await put(root, "notes.md", "same bytes");
    const first = await run(root, ["ingest", "start", "notes.md", "--json"]);
    expect(first.json.data.id).toBe("src-2026-10-16-notes");
    const before = await raw(root);
    const bytes = new Map<string, Buffer>();
    for (const f of before) bytes.set(f, await readFile(path.join(root, ".wiki", "raw", f)));
    const d = await run(root, ["ingest", "start", "notes.md", "--json"]);
    expect(d.code).toBe(0);
    expect(d.json.data.status).toBe("duplicate");
    expect(d.json.data.id).toBeNull();
    expect(d.json.data.prior.id).toBe("src-2026-10-16-notes");
    expect(d.json.data.prior.match).toBe("sha256");
    expect(d.json.data.prior.origin).toBe("notes.md");
    expect(typeof d.json.data.prior.captured_at).toBe("string");
    expect(await raw(root)).toEqual(before);
    const lockBody = JSON.stringify({ ingest_id: "other", pid: 1, started_at: "x" });
    await put(root, ".wiki/.lock", lockBody);
    const re = await run(root, ["ingest", "start", "notes.md", "--reingest", "--json"]);
    expect(re.code).toBe(0);
    expect(re.json.data.status).toBe("registered");
    expect(re.json.data.id).not.toBe("src-2026-10-16-notes");
    expect(re.json.data.source.reingest_of).toBe("src-2026-10-16-notes");
    for (const [f, b] of bytes) expect(await readFile(path.join(root, ".wiki", "raw", f))).toEqual(b);
    expect(await readFile(path.join(root, ".wiki", ".lock"), "utf8")).toBe(lockBody);
  });

  it("S4: failing pre_ingest hook rolls the registration back", async () => {
    const root = await repo(mode("ai", "hooks:\n  pre_ingest:\n    - 'node -e \"process.exit(1)\"'\n"));
    await put(root, "notes.md", "text");
    const r = await run(root, ["ingest", "start", "notes.md", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("pre_ingest_failed");
    expect(r.json.error.details.hooks[0].status).toBe("failed");
    expect(await raw(root)).toEqual([]);
  });

  const rows: Array<[string, string[], string | Buffer | null, number, string]> = [
    ["denied", ["docs/notes.md"], null, 4, "denied"],
    ["url without text", ["https://acme.example.com/q4"], null, 2, "usage"],
    ["ftp scheme", ["ftp://acme.example.com/q4", "--text-file", "page.md"], null, 2, "usage"],
    ["directory", ["docs"], null, 2, "usage"],
    ["inside wiki", [".wiki/index.md"], null, 2, "usage"],
    ["empty stdin", ["-"], "", 2, "usage"],
    ["- with --text-file -", ["-", "--text-file", "-"], "text", 2, "usage"],
    ["11 MB stdin", ["-"], Buffer.alloc(11 * 1024 * 1024, 97), 2, "usage"],
    ["md with --text-file", ["docs/meetings/a.md", "--text-file", "a.txt"], null, 2, "usage"],
    ["invalid kind", ["docs/notes.md", "--kind", "status report"], null, 2, "usage"],
  ];
  for (const [name, args, stdin, exit, code] of rows) {
    it(`S5: ${name} -> exit ${exit} ${code}, nothing stored`, async () => {
      const root = await repo(WL);
      await put(root, "docs/notes.md", "n");
      await put(root, "docs/meetings/a.md", "a");
      await put(root, "a.txt", "t");
      await put(root, "page.md", "p");
      await put(root, ".wiki/index.md", "# index");
      const r = await run(root, ["ingest", "start", ...args, "--json"], stdin);
      expect(r.code).toBe(exit);
      expect(r.json.ok).toBe(false);
      expect(r.json.error.code).toBe(code);
      expect(r.json.error.command).toBe("ingest start");
      expect(await raw(root)).toEqual([]);
    });
  }

  it("S5: repository without .wiki exits 1 not_initialised", async () => {
    const root = await repo(null);
    await put(root, "notes.md", "n");
    const r = await run(root, ["ingest", "start", "notes.md", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("not_initialised");
    expect(r.json.error.command).toBe("ingest start");
    expect(await raw(root)).toEqual([]);
  });

  it("unit: label derivation (title, file, URL segment, URL host, stdin)", async () => {
    const root = await repo(mode("ai"));
    await put(root, "Weekly.md", "w");
    await put(root, "page.md", "p");
    const title = await run(root, ["ingest", "start", "Weekly.md", "--title", "board-notes", "--json"]);
    expect(title.json.data.id).toBe("src-2026-10-16-board-notes");
    const file = await run(root, ["ingest", "start", "Weekly.md", "--reingest", "--json"]);
    expect(file.json.data.id).toMatch(/^src-2026-10-16-weekly/);
    const seg = await run(root, ["ingest", "start", "https://acme.example.com/reports/budget", "--text-file", "page.md", "--json"]);
    expect(seg.json.data.id).toBe("src-2026-10-16-budget");
    const host = await run(root, ["ingest", "start", "https://acme.example.com", "--text-file", "-", "--json"], "host text");
    expect(host.json.data.id).toMatch(/^src-2026-10-16-acme/);
    const chat = await run(root, ["ingest", "start", "-", "--json"], "some chat");
    expect(chat.json.data.id).toBe("src-2026-10-16-chat-excerpt");
  });

  it("unit: --provided-by defaults to user and accepts agent", async () => {
    const root = await repo(mode("ai"));
    const a = await run(root, ["ingest", "start", "-", "--json"], "one");
    expect(a.json.data.source.provided_by).toBe("user");
    const b = await run(root, ["ingest", "start", "-", "--provided-by", "agent", "--title", "two", "--json"], "two");
    expect(b.json.data.source.provided_by).toBe("agent");
  });

  it("unit: missing kb_instructions.md gives rule null and no available kinds", async () => {
    const root = await repo(mode("ai"), null);
    const r = await run(root, ["ingest", "start", "-", "--kind", "chat-excerpt", "--json"], "x");
    expect(r.code).toBe(0);
    expect(r.json.data.rule).toBeNull();
    expect(r.json.data.available_kinds).toEqual([]);
    expect(r.json.warnings.length).toBeGreaterThan(0);
  });

  it("unit: stdin BOM is stripped from the stored excerpt", async () => {
    const root = await repo(mode("ai"));
    const r = await run(root, ["ingest", "start", "-", "--json"], "﻿hello");
    const id = r.json.data.id as string;
    expect(await readFile(path.join(root, ".wiki", "raw", `${id}.md`), "utf8")).toBe("hello");
  });

  it("unit: bare `ingest` prints help and registers nothing", async () => {
    const root = await repo(mode("ai"));
    const r = await run(root, ["ingest"]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/start/);
  });
});
