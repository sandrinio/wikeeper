import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePaths } from "../../src/core/paths.js";
import { registerSource } from "../../src/ingest/registry.js";
import { estimateTokens } from "../../src/core/tokens.js";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

function cfg(permission: string, opts: { origins?: string[]; kinds?: string[]; contentDir?: string } = {}): string {
  const list = (xs: string[]) => (xs.length === 0 ? " []" : "\n" + xs.map((x) => `      - ${JSON.stringify(x)}`).join("\n"));
  let s = "agents: [claude]\n";
  if (opts.contentDir) s += `content_dir: ${opts.contentDir}\n`;
  s += `ingest:\n  permission: ${permission}\n  whitelist:\n    origins:${list(opts.origins ?? [])}\n    kinds:${list(opts.kinds ?? [])}\n`;
  return s;
}

async function repo(config: string | null): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-iplan-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  if (config !== null) {
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    await writeFile(path.join(root, ".wiki", "config.yml"), config);
  }
  return root;
}
async function put(root: string, rel: string, content: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), content);
}

async function treeHash(dir: string): Promise<string> {
  const h = createHash("sha256");
  async function walk(d: string): Promise<void> {
    let names: string[];
    try {
      names = (await readdir(d)).sort();
    } catch {
      return;
    }
    for (const n of names) {
      const p = path.join(d, n);
      const entries = await readdir(p).then(
        () => true,
        () => false,
      );
      h.update(path.relative(dir, p).split(path.sep).join("/") + "\0");
      if (entries) await walk(p);
      else h.update(await readFile(p));
    }
  }
  await walk(dir);
  return h.digest("hex");
}
async function wikiState(root: string): Promise<string[]> {
  const base = path.join(root, ".wiki");
  return [await treeHash(path.join(base, "raw")), await treeHash(path.join(base, "log")), await treeHash(path.join(base, "pages"))];
}

async function run(root: string, args: string[]) {
  const { ingestCommand } = await import("../../src/commands/ingest.js");
  const { runCli } = await import("../../src/program.js");
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    commands: [ingestCommand],
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Readable.from([]),
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

describe("STORY-003-05 ingest plan (red)", () => {
  it("S1: directory plan marks duplicates and denied files; stores nothing", async () => {
    const root = await repo(cfg("whitelist", { origins: ["docs/meetings/**"] }));
    await put(root, "docs/meetings/a.md", "alpha\n");
    await put(root, "docs/meetings/b.md", "bravo\n");
    await put(root, "docs/notes.md", "notes\n");
    const paths = resolvePaths(root, { content_dir: ".wiki" });
    const meta = await registerSource(paths, {
      originType: "file",
      origin: "docs/meetings/b.md",
      label: "b",
      originalPath: path.join(root, "docs/meetings/b.md"),
      text: null,
      kind: null,
      providedBy: "user",
      ruleVersion: null,
      reingestOf: null,
      permission: { mode: "whitelist", approved: false, matched: null, kind_pending: false },
      now: new Date("2026-10-16T12:00:00Z"),
    });
    expect(meta.id).toBe("src-2026-10-16-b");
    const before = await wikiState(root);

    const r = await run(root, ["ingest", "plan", "docs", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.command).toBe("ingest plan");
    const d = r.json.data;
    expect(d.dir).toBe("docs");
    expect(d.mode).toBe("whitelist");
    expect(d.kind).toBeNull();
    expect(d.entries.map((e: any) => e.path)).toEqual(["docs/meetings/a.md", "docs/meetings/b.md", "docs/notes.md"]);
    expect(d.entries.map((e: any) => e.status)).toEqual(["new", "duplicate", "denied"]);
    expect(d.entries[0].needs_approval).toBe(false);
    expect(d.entries[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(d.entries[0].size).toBe(6);
    expect(d.entries[1].prior.id).toBe("src-2026-10-16-b");
    expect(d.entries[1].prior.match).toBe("sha256");
    expect(d.entries[2].reason).toContain("docs/notes.md");
    expect(d.totals).toEqual({ new: 1, duplicate: 1, denied: 1, needs_approval: 0, tokens: estimateTokens("alpha"), tokens_rough: false, not_estimated: 0 });
    expect(await wikiState(root)).toEqual(before);

    const h = await run(root, ["ingest", "plan", "docs"]);
    expect(h.code).toBe(0);
    const iA = h.text.indexOf("docs/meetings/a.md");
    const iB = h.text.indexOf("docs/meetings/b.md");
    const iN = h.text.indexOf("docs/notes.md");
    expect(iA).toBeGreaterThanOrEqual(0);
    expect(iB).toBeGreaterThan(iA);
    expect(iN).toBeGreaterThan(iB);
    expect(h.text).toContain("duplicate of src-2026-10-16-b");
    expect(h.text).toContain("totals:");
    expect(h.text).toContain("wikeeper ingest start");
    expect(h.text).toContain("--approved");
    expect(await wikiState(root)).toEqual(before);
  });

  it("S2: in ask mode every new file needs approval", async () => {
    const root = await repo(cfg("ask"));
    await put(root, "docs/a.md", "one\n");
    await put(root, "docs/b.md", "two\n");
    const r = await run(root, ["ingest", "plan", "docs", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.entries.map((e: any) => [e.status, e.needs_approval])).toEqual([
      ["new", true],
      ["new", true],
    ]);
    expect(r.json.data.totals.needs_approval).toBe(2);
    const h = await run(root, ["ingest", "plan", "docs"]);
    expect(h.text).toContain("new (needs approval)");
  });

  it.each([
    { args: [] as string[], status: "new", pending: true },
    { args: ["--kind", "meeting-notes"], status: "new", pending: false },
    { args: ["--kind", "status-report"], status: "denied", pending: false },
  ])("S3: kinds-only whitelist, args %j", async ({ args, status, pending }) => {
    const root = await repo(cfg("whitelist", { kinds: ["meeting-notes"] }));
    await put(root, "docs/a.md", "x\n");
    const r = await run(root, ["ingest", "plan", "docs", ...args, "--json"]);
    expect(r.code).toBe(0);
    const e = r.json.data.entries.find((x: any) => x.path === "docs/a.md");
    expect(e.status).toBe(status);
    expect(e.kind_pending).toBe(pending);
  });

  it("S4: hidden, wiki, symlink and identical copies", async () => {
    const root = await repo(cfg("ai", { contentDir: "docs/wiki" }));
    await put(root, "docs/a.md", "same bytes\n");
    await put(root, "docs/copy-of-a.md", "same bytes\n");
    await put(root, "docs/.draft.md", "draft\n");
    await put(root, "docs/wiki/index.md", "# index\n");
    let linked = true;
    try {
      await symlink("a.md", path.join(root, "docs", "link.md"), "file");
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EACCES") throw e;
      linked = false;
      console.log("symlink refused (" + code + "): skipping the symlink expectation");
    }
    const r = await run(root, ["ingest", "plan", "docs", "--json"]);
    expect(r.code).toBe(0);
    const d = r.json.data;
    expect(d.entries.map((e: any) => [e.path, e.status])).toEqual([
      ["docs/a.md", "new"],
      ["docs/copy-of-a.md", "duplicate"],
    ]);
    expect(d.entries[1].prior).toEqual({ path: "docs/a.md", match: "in_plan" });
    const expected = [
      { path: "docs/.draft.md", reason: "hidden" },
      ...(linked ? [{ path: "docs/link.md", reason: "symlink" }] : []),
      { path: "docs/wiki", reason: "wiki" },
    ];
    expect(d.skipped).toEqual(expected);
  });

  it.each([
    { name: "a file", args: ["notes.md"], hint: /wikeeper ingest start/ },
    { name: "a missing path", args: ["missing"], hint: /does not exist/ },
    { name: "an invalid kind", args: ["docs", "--kind", "status report"], hint: /status report/ },
  ])("S5: usage error — $name", async ({ args, hint }) => {
    const root = await repo(cfg("ai"));
    await put(root, "notes.md", "n\n");
    await put(root, "docs/a.md", "a\n");
    const r = await run(root, ["ingest", "plan", ...args, "--json"]);
    expect(r.code).toBe(2);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.code).toBe("usage");
    expect(r.json.error.message).toMatch(hint);
  });

  it("S5: not initialised", async () => {
    const root = await repo(null);
    await put(root, "notes.md", "n\n");
    await put(root, "docs/a.md", "a\n");
    const r = await run(root, ["ingest", "plan", "docs", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("not_initialised");
    expect(r.json.error.message).toContain("wikeeper init");
  });
});
