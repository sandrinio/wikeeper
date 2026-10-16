import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENTS_EXTENSIONS, agentsIntegration } from "../../src/agents/index.js";
import { runInit } from "../../src/commands/init.js";
import { runUpdate } from "../../src/commands/update.js";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { runCli } from "../../src/program.js";

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
  if (wikeeper && process.platform !== "win32") {
    const file = path.join(bin, "wikeeper");
    await writeFile(file, "#!/bin/sh\nexit 0\n");
    await chmod(file, 0o755);
  }
  vi.stubEnv("PATH", bin);
}
async function repo(files: Record<string, string>): Promise<string> {
  const root = await tmp("wikeeper-enforce-unit-");
  await mkdir(path.join(root, ".git"), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(root, ...rel.split("/"));
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, content);
  }
  return root;
}
async function drive(root: string, args: string[], stdin?: Readable) {
  let out = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: stdin ?? Readable.from([]) } as never });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, json };
}
const read = (root: string, rel: string) => readFile(path.join(root, ...rel.split("/")), "utf8");
async function exists(root: string, rel: string): Promise<boolean> {
  try { await lstat(path.join(root, ...rel.split("/"))); return true; } catch { return false; }
}
/** Hash of every path (files, dirs, empty dirs) and every file's bytes. */
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
const run = (cwd: string, flags: Record<string, unknown>) => ({
  flags,
  json: true,
  interactive: false,
  io: { cwd, stdout: new Writable({ write: (_c, _e, cb) => cb() }), stderr: new Writable({ write: (_c, _e, cb) => cb() }), stdin: Readable.from([]) as never },
});
const tty = (chunks: string[]): Readable => Object.assign(Readable.from(chunks), { isTTY: true }) as Readable;

describe("STORY-002-06 rework: remove restores originals holding empty containers", () => {
  const originals: Record<string, string> = {
    "empty hooks object": '{\n  "hooks": {}\n}\n',
    "empty PreToolUse array": '{\n  "hooks": {\n    "PreToolUse": []\n  }\n}\n',
    "empty allow array beside deny": '{\n  "permissions": {\n    "allow": [],\n    "deny": [\n      "x"\n    ]\n  }\n}\n',
  };
  for (const [name, original] of Object.entries(originals)) {
    it(`${name}: init --enforce then remove is byte-identical and the .bak is gone`, async () => {
      await pathWith(false);
      const root = await repo({ ".wiki/config.yml": "agents: [claude]\n", ".claude/settings.json": original });
      expect((await drive(root, ["init", "--enforce", "--yes"])).code).toBe(0);
      expect((await drive(root, ["remove", "--json"])).code).toBe(0);
      expect(await read(root, ".claude/settings.json")).toBe(original);
      expect(await exists(root, ".claude/settings.json.bak")).toBe(false);
    });
  }
});

describe("STORY-002-06 rework: init preflights before any write", () => {
  const files = { ".wiki/config.yml": "agents: [claude, codex]\n", "CLAUDE.md": "# Team rules\n", ".claude/settings.json": "{ not json" };

  it("malformed settings with --enforce --yes: exit 1, tree identical", async () => {
    await pathWith(true);
    const root = await repo(files);
    const before = await treeHash(root);
    const r = await drive(root, ["init", "--enforce", "--yes", "--json", "--agents", "claude,codex"]);
    expect(r.code).toBe(1);
    expect(await treeHash(root)).toBe(before);
  });

  it("malformed settings through the y prompt: exit 1, tree identical", async () => {
    await pathWith(true);
    const root = await repo(files);
    const before = await treeHash(root);
    const r = await drive(root, ["init", "--agents", "claude,codex"], tty(["y\n"]));
    expect(r.code).toBe(1);
    expect(await treeHash(root)).toBe(before);
  });

  it("an extension that throws after the core writes leaves the tree restored", async () => {
    await pathWith(true);
    const root = await repo({ ".wiki/config.yml": "agents: [claude, codex]\n", "CLAUDE.md": "# Team rules\n", "AGENTS.md": "mine\n" });
    const before = await treeHash(root);
    const boom = { name: "boom", async init() { throw new Error("boom"); } };
    (AGENTS_EXTENSIONS as unknown as unknown[]).push(boom);
    try {
      const r = await drive(root, ["init", "--yes", "--json", "--agents", "claude,codex"]);
      expect(r.code).toBe(1);
    } finally {
      (AGENTS_EXTENSIONS as unknown as unknown[]).splice((AGENTS_EXTENSIONS as unknown as unknown[]).indexOf(boom), 1);
    }
    expect(await treeHash(root)).toBe(before);
  });
});

describe("STORY-002-06 rework: in-memory config, drift and update", () => {
  it("hand-editing settings.json after init --enforce raises no manifest-drift", async () => {
    await pathWith(true);
    const root = await repo({ ".wiki/config.yml": "agents: [claude, codex]\n" });
    expect((await drive(root, ["init", "--enforce", "--yes"])).code).toBe(0);
    const f = path.join(root, ".claude", "settings.json");
    const s = JSON.parse(await readFile(f, "utf8"));
    s.userKey = "mine";
    await writeFile(f, JSON.stringify(s, null, 2) + "\n");
    const r = await drive(root, ["doctor", "--json"]);
    const checks = (r.json?.data?.checks ?? []) as Array<{ id: string; severity: string; file?: string }>;
    expect(checks.filter((c) => c.id === "manifest-drift" && String(c.file ?? "").includes("settings.json"))).toEqual([]);
    expect(checks.filter((c) => c.id === "manifest-drift").every((c) => c.severity === "ok")).toBe(true);
  });

  const guardCmds = (s: any): string[] =>
    (s.hooks?.PreToolUse ?? s["wikeeper-guard"]?.PreToolUse ?? []).flatMap((g: any) => (g.hooks ?? []).map((h: any) => h.command as string));

  it("update re-pins the npx version in every agent's guard command", async () => {
    await pathWith(false);
    const root = await repo({});
    const flags = { agents: "claude,codex,antigravity", enforce: true };
    await runInit(root, run(root, flags), { packageVersion: "1.0.0" });
    const userClaude = JSON.parse(await read(root, ".claude/settings.json"));
    userClaude.userKey = "mine";
    await writeFile(path.join(root, ".claude", "settings.json"), JSON.stringify(userClaude, null, 2) + "\n");
    await runUpdate(root, run(root, {}), { packageVersion: "2.0.0" });
    for (const [file, agent] of [[".claude/settings.json", "claude"], [".codex/hooks.json", "codex"], [".agents/hooks.json", "antigravity"]] as const) {
      expect(guardCmds(JSON.parse(await read(root, file)))).toEqual([`npx -y wikeeper@2.0.0 hook guard --agent ${agent}`]);
    }
    expect(JSON.parse(await read(root, ".claude/settings.json")).userKey).toBe("mine");
  });

  it("update changes 0 bytes of the settings files with the PATH form", async () => {
    await pathWith(true);
    const root = await repo({});
    await runInit(root, run(root, { agents: "claude,codex,antigravity", enforce: true }), { packageVersion: "1.0.0" });
    const rels = [".claude/settings.json", ".codex/hooks.json", ".agents/hooks.json"];
    const before = await Promise.all(rels.map((r) => read(root, r)));
    await runUpdate(root, run(root, {}), { packageVersion: "2.0.0" });
    expect(await Promise.all(rels.map((r) => read(root, r)))).toEqual(before);
  });
});
