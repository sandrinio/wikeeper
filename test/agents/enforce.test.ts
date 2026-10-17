import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENTS_EXTENSIONS, agentsIntegration } from "../../src/agents/index.js";
import { CLAUDE_ENFORCE } from "../../src/agents/enforce/claude.js";
import { CODEX_ENFORCE } from "../../src/agents/enforce/codex.js";
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

describe("BUG-002: no backup for files wikeeper created; recorded backups die with their file", () => {
  const FILES = [".claude/settings.json", ".codex/hooks.json", ".agents/hooks.json"];
  const manifestPath = (root: string) => path.join(root, ".wiki", "system", "manifest.json");
  async function addBackupEntry(root: string, rel: string, agent: string): Promise<void> {
    const m = JSON.parse(await readFile(manifestPath(root), "utf8"));
    m.files.push({ path: rel, sha256: null, kind: "hook", agent, identity: "backup" });
    await writeFile(manifestPath(root), JSON.stringify(m, null, 2) + "\n");
  }

  it("update after a re-pin writes no .bak for wikeeper-created files and records no backup entry", async () => {
    await pathWith(false);
    const root = await repo({});
    await runInit(root, run(root, { agents: "claude,codex,antigravity", enforce: true }), { packageVersion: "1.0.0" });
    await runUpdate(root, run(root, {}), { packageVersion: "2.0.0" });
    for (const f of FILES) expect(await exists(root, f + ".bak")).toBe(false);
    const m = JSON.parse(await readFile(manifestPath(root), "utf8"));
    expect(m.files.filter((e: any) => e.identity === "backup")).toEqual([]);
  });

  it("remove deletes a recorded backup together with the deleted settings file", async () => {
    await pathWith(false);
    const root = await repo({ ".wiki/config.yml": "agents: [claude]\n" });
    await runInit(root, run(root, { agents: "claude", enforce: true }), { packageVersion: "1.0.0" });
    await writeFile(path.join(root, ".claude", "settings.json.bak"), '{"stale":1}\n');
    await addBackupEntry(root, ".claude/settings.json.bak", "claude");
    const r = await drive(root, ["remove", "--json"]);
    expect(r.code).toBe(0);
    expect(await exists(root, ".claude/settings.json")).toBe(false);
    expect(await exists(root, ".claude/settings.json.bak")).toBe(false);
    expect(r.json.data.removed).toContain(".claude/settings.json.bak");
  });

  it("update deletes a recorded backup when it deletes the created file of a dropped agent", async () => {
    await pathWith(false);
    const root = await repo({});
    await runInit(root, run(root, { agents: "claude,codex", enforce: true }), { packageVersion: "1.0.0" });
    await writeFile(path.join(root, ".codex", "hooks.json.bak"), "{}\n");
    await addBackupEntry(root, ".codex/hooks.json.bak", "codex");
    const { setConfigValue } = await import("../../src/core/config.js");
    await setConfigValue(root, "agents", ["claude"]);
    await runUpdate(root, run(root, {}), { packageVersion: "1.0.0" });
    expect(await exists(root, ".codex/hooks.json")).toBe(false);
    expect(await exists(root, ".codex/hooks.json.bak")).toBe(false);
  });

  it("remove leaves a .bak that has no manifest entry untouched", async () => {
    await pathWith(false);
    const root = await repo({ ".wiki/config.yml": "agents: [claude]\n" });
    await runInit(root, run(root, { agents: "claude", enforce: true }), { packageVersion: "1.0.0" });
    await writeFile(path.join(root, ".claude", "settings.json.bak"), "mine\n");
    expect((await drive(root, ["remove", "--json"])).code).toBe(0);
    expect(await read(root, ".claude/settings.json.bak")).toBe("mine\n");
  });
});

describe("CR-001 ai mode allows only ingest and search commands, and asks for the destructive flags", () => {
  it("CLAUDE_ENFORCE ai rules are the ingest pair, the four ask rules, the read pair, then the search pair", () => {
    const rules = CLAUDE_ENFORCE.items("CMD", "ai").filter((i) => i.kind === "rule");
    expect(rules.map((i) => i.identity)).toEqual([
      "permissions.allow[Bash(npx wikeeper ingest *)]",
      "permissions.allow[Bash(wikeeper ingest *)]",
      "permissions.ask[Bash(npx wikeeper ingest *--drop*)]",
      "permissions.ask[Bash(wikeeper ingest *--drop*)]",
      "permissions.ask[Bash(npx wikeeper ingest *--force-unlock*)]",
      "permissions.ask[Bash(wikeeper ingest *--force-unlock*)]",
      "permissions.allow[Bash(npx wikeeper read *)]",
      "permissions.allow[Bash(wikeeper read *)]",
      "permissions.allow[Bash(npx wikeeper search *)]",
      "permissions.allow[Bash(wikeeper search *)]",
    ]);
    expect(rules.map((i) => i.value)).toEqual(rules.map((i) => /\[(.*)\]$/.exec(i.identity)![1]));
  });

  it("Codex ai rules are the ingest pair, the abort prompts, the read pair, then the search pair, npx first", () => {
    expect(CODEX_ENFORCE[1].items("CMD", "ai").map((i) => i.value)).toEqual([
      'prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")',
      'prefix_rule(pattern=["wikeeper","ingest"], decision="allow")',
      'prefix_rule(pattern=["npx","wikeeper","ingest","abort"], decision="prompt")',
      'prefix_rule(pattern=["wikeeper","ingest","abort"], decision="prompt")',
      'prefix_rule(pattern=["npx","wikeeper","read"], decision="allow")',
      'prefix_rule(pattern=["wikeeper","read"], decision="allow")',
      'prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")',
      'prefix_rule(pattern=["wikeeper","search"], decision="allow")',
    ]);
  });
});

describe("STORY-002-09: update with enforce off removes the rules; malformed settings stop update", () => {
  it("enforce false then update restores the user's original settings and drops the files wikeeper made", async () => {
    await pathWith(true);
    const original = '{\n  "model": "x",\n  "permissions": {\n    "deny": [\n      "Read(.env)"\n    ]\n  }\n}\n';
    const root = await repo({ ".wiki/config.yml": "agents: [claude, codex]\ningest:\n  permission: ai\n", ".claude/settings.json": original });
    expect((await drive(root, ["init", "--json", "--agents", "claude,codex", "--enforce", "--yes"])).code).toBe(0);
    expect(await read(root, ".claude/settings.json")).toContain("permissions");
    const cfg = (await read(root, ".wiki/config.yml")).replace(/enforce: true/, "enforce: false");
    await writeFile(path.join(root, ".wiki", "config.yml"), cfg);
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    expect(await read(root, ".claude/settings.json")).toBe(original);
    expect(await exists(root, ".claude/settings.json.bak")).toBe(false);
    expect(await exists(root, ".codex/rules/wikeeper.rules")).toBe(false);
    expect(await exists(root, ".codex/hooks.json")).toBe(false);
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    expect(await read(root, ".claude/settings.json")).toBe(original);
    expect(await exists(root, ".codex/rules/wikeeper.rules")).toBe(false);
  });

  it("a malformed settings file stops update with settings_invalid and stays byte-identical", async () => {
    await pathWith(true);
    const root = await repo({ ".wiki/config.yml": "agents: [claude]\ningest:\n  permission: ai\n" });
    expect((await drive(root, ["init", "--json", "--agents", "claude", "--enforce", "--yes"])).code).toBe(0);
    await writeFile(path.join(root, ".claude", "settings.json"), "{ not json");
    const r = await drive(root, ["update", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.stringify(r.json)).toContain("settings_invalid");
    expect(await read(root, ".claude/settings.json")).toBe("{ not json");
  });
});
