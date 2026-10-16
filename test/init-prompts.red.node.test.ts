import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentsIntegration } from "../src/agents/index.js";
import { registerIntegration, resetIntegrations } from "../src/core/integrations.js";
import { runCli } from "../src/program.js";

const cleanup: string[] = [];
beforeEach(() => {
  resetIntegrations();
  registerIntegration({ name: "agents", ...agentsIntegration } as never);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  resetIntegrations();
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function tmp(prefix: string): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanup.push(d);
  return d;
}
async function pathWith(wikeeper: boolean): Promise<void> {
  const bin = await tmp("wikeeper-bin-");
  if (wikeeper) {
    if (process.platform === "win32") {
      await writeFile(path.join(bin, "wikeeper.cmd"), "@echo off\r\n");
      vi.stubEnv("PATHEXT", ".CMD");
    } else {
      const file = path.join(bin, "wikeeper");
      await writeFile(file, "#!/bin/sh\nexit 0\n");
      await chmod(file, 0o755);
    }
  }
  vi.stubEnv("PATH", bin);
}
async function repo(files: Record<string, string> = {}): Promise<string> {
  const root = await tmp("wikeeper-init-prompts-");
  await mkdir(path.join(root, ".git"), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(root, ...rel.split("/"));
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, content);
  }
  return root;
}
async function treeHash(root: string): Promise<string> {
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
const read = (root: string, rel: string) => readFile(path.join(root, ...rel.split("/")), "utf8");

/** A terminal-like session: open TTY stdin, stderr watcher that resolves when text appears. */
function session(root: string, args: string[]) {
  const stdin = Object.assign(new PassThrough(), { isTTY: true });
  let err = "";
  let out = "";
  const waiters: Array<{ text: string; resolve: () => void }> = [];
  const stderr = new Writable({
    write(c, _e, cb) {
      err += String(c);
      for (const w of [...waiters]) if (err.includes(w.text)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(); }
      cb();
    },
  });
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const done = runCli(args, { io: { cwd: root, stdout, stderr, stdin } as never });
  const waitFor = (text: string): Promise<void> =>
    err.includes(text)
      ? Promise.resolve()
      : new Promise<void>((resolve, reject) => {
          waiters.push({ text, resolve });
          // If the run ends first the prompt never came.
          void done.then(() => { if (!err.includes(text)) reject(new Error(`prompt "${text}" never shown; stderr: ${err}`)); });
        });
  return { stdin, done, waitFor, err: () => err, out: () => out };
}

describe("STORY-001-08: nothing is on disk while a question is waiting", () => {
  const rows: Array<{ args: string[]; answers: string; prompt: string; exit: number }> = [
    { args: ["init"], answers: "", prompt: "Which agents do you use?", exit: 5 },
    { args: ["init"], answers: "1\n", prompt: "Enable --enforce", exit: 0 },
    { args: ["init", "--agents", "claude"], answers: "", prompt: "Enable --enforce", exit: 0 },
  ];
  for (const row of rows) {
    it(`wikeeper ${row.args.join(" ")} [answers ${JSON.stringify(row.answers)}] -> tree untouched at "${row.prompt}"`, async () => {
      await pathWith(false);
      const root = await repo();
      const before = await treeHash(root);
      const s = session(root, row.args);
      if (row.answers) {
        await s.waitFor("Which agents do you use?");
        s.stdin.write(row.answers);
      }
      await s.waitFor(row.prompt);
      const during = await treeHash(root);
      s.stdin.end();
      const code = await s.done;
      expect(during).toBe(before);
      expect(code).toBe(row.exit);
    }, 20_000);
  }
});

describe("STORY-001-08: answered questions are applied after the last question", () => {
  it("answers 1 then y: exit 0, config lists claude + enforce, guard hook installed", async () => {
    await pathWith(true);
    const root = await repo();
    const s = session(root, ["init"]);
    await s.waitFor("Which agents do you use?");
    s.stdin.write("1\n");
    await s.waitFor("Enable --enforce");
    s.stdin.write("y\n");
    const code = await s.done;
    expect(code, s.err()).toBe(0);
    const cfg = await read(root, ".wiki/config.yml");
    expect(cfg).toMatch(/agents:[\s\S]*claude/);
    expect(cfg).toMatch(/enforce:\s*true/);
    const settings = JSON.parse(await read(root, ".claude/settings.json"));
    const pre = settings.hooks.PreToolUse as Array<{ hooks?: Array<{ command?: string }> }>;
    const cmds = pre.flatMap((e) => (e.hooks ?? []).map((h) => h.command ?? ""));
    expect(cmds.some((c) => c.endsWith(" hook guard --agent claude"))).toBe(true);
  }, 20_000);
});

describe("STORY-001-08: non-interactive init asks nothing and is unchanged", () => {
  it("init --json --agents claude,codex --yes", async () => {
    await pathWith(false);
    const root = await repo();
    let out = "";
    let err = "";
    const code = await runCli(["init", "--json", "--agents", "claude,codex", "--yes"], {
      io: {
        cwd: root,
        stdout: new Writable({ write(c, _e, cb) { out += String(c); cb(); } }),
        stderr: new Writable({ write(c, _e, cb) { err += String(c); cb(); } }),
        stdin: Readable.from([]),
      } as never,
    });
    expect(code).toBe(0);
    expect(err).not.toContain("Which agents do you use?");
    expect(err).not.toContain("Enable --enforce");
    const json = JSON.parse(out.trim().split("\n").filter(Boolean).pop()!);
    const created: string[] = json.data.created;
    expect(created).toEqual(expect.arrayContaining([".wiki/system/SETUP.md", ".wiki/system/WIKI.md", ".wiki/system/manifest.json"]));
    const outside = created.filter((p) => !p.startsWith(".wiki/system/"));
    expect(outside).toEqual(expect.arrayContaining([".wiki/config.yml", ".claude/agents/wiki-ingest.md"].filter((p) => outside.includes(p))));
    expect(outside.length).toBeGreaterThan(0);
    for (const p of outside) expect(p.startsWith(".wiki/system/")).toBe(false);
  }, 20_000);
});

describe("STORY-001-08: Error - malformed settings file found during the questions", () => {
  it("exit 1 naming .claude/settings.json, tree identical", async () => {
    await pathWith(true);
    const root = await repo({ ".claude/settings.json": "{ not json" });
    const before = await treeHash(root);
    const s = session(root, ["init", "--agents", "claude"]);
    await s.waitFor("Enable --enforce");
    s.stdin.write("y\n");
    const code = await s.done;
    expect(code).toBe(1);
    expect(s.err() + s.out()).toContain(".claude/settings.json");
    expect(await treeHash(root)).toBe(before);
  }, 20_000);
});
