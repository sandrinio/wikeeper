import { copyFile, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentsIntegration } from "../../src/agents/index.js";
import { runInit } from "../../src/commands/init.js";
import { runUpdate } from "../../src/commands/update.js";
import { setConfigValue } from "../../src/core/config.js";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { runCli } from "../../src/program.js";

// Red tests for BUG-002: remove leaves no wikeeper backup behind.
// Triggers use the npx version re-pin (portable to win32); `ai` is only a trigger, its allow strings are never asserted.

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE = path.join(PKG_ROOT, "test", "fixtures", "settings", "claude-settings-user.json");
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
async function pathWithoutWikeeper(): Promise<void> {
  vi.stubEnv("PATH", await tmp("wikeeper-empty-"));
}
async function repo(config: string): Promise<string> {
  const root = await tmp("wikeeper-bak-");
  await mkdir(path.join(root, ".git"), { recursive: true });
  await mkdir(path.join(root, ".wiki"), { recursive: true });
  await writeFile(path.join(root, ".wiki", "config.yml"), config);
  return root;
}
const abs = (root: string, rel: string) => path.join(root, ...rel.split("/"));
async function exists(root: string, rel: string): Promise<boolean> {
  try { await lstat(abs(root, rel)); return true; } catch { return false; }
}
async function drive(root: string, args: string[]) {
  let out = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, json };
}
const run = (cwd: string, flags: Record<string, unknown>) => ({
  flags,
  json: true,
  interactive: false,
  io: { cwd, stdout: new Writable({ write: (_c, _e, cb) => cb() }), stderr: new Writable({ write: (_c, _e, cb) => cb() }), stdin: Readable.from([]) as never },
});
/** Every path outside .wiki/ and .git/ (posix separators, sorted). */
async function listOutside(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (rel: string): Promise<void> => {
    for (const n of (await readdir(path.join(root, rel))).sort()) {
      const r = rel ? `${rel}/${n}` : n;
      if (r === ".git" || r === ".wiki") continue;
      out.push(r);
      if ((await lstat(path.join(root, r))).isDirectory()) await walk(r);
    }
  };
  await walk("");
  return out;
}
async function manifestEntries(root: string): Promise<any[]> {
  return JSON.parse(await readFile(abs(root, ".wiki/system/manifest.json"), "utf8")).files;
}

describe("BUG-002 outline: a settings file wikeeper created is never backed up and leaves nothing behind (red)", () => {
  const rows = [
    { agent: "claude", file: ".claude/settings.json" },
    { agent: "codex", file: ".codex/hooks.json" },
    { agent: "antigravity", file: ".agents/hooks.json" },
  ];
  for (const { agent, file } of rows) {
    it(`${agent}: no ${file}.bak after init -> permission change + re-pin -> update; remove leaves nothing`, async () => {
      await pathWithoutWikeeper();
      const root = await repo(`agents: [${agent}]\n`);
      const before = await listOutside(root);
      await runInit(root, run(root, { agents: agent, enforce: true }), { packageVersion: "1.0.0" });
      expect(await exists(root, file)).toBe(true);
      await setConfigValue(root, "ingest.permission", "ai");
      const u: any = await runUpdate(root, run(root, {}), { packageVersion: "2.0.0" });
      expect(await exists(root, file + ".bak")).toBe(false);
      expect([...(u?.added ?? []), ...(u?.backed_up ?? [])].filter((p: string) => String(p).endsWith(".bak"))).toEqual([]);
      expect((await manifestEntries(root)).filter((e) => e.identity === "backup")).toEqual([]);

      const r = await drive(root, ["remove", "--json"]);
      expect(r.code).toBe(0);
      expect(await exists(root, file)).toBe(false);
      expect(await exists(root, file + ".bak")).toBe(false);
      expect(await listOutside(root)).toEqual(before);
    });
  }
});

describe("BUG-002 literal repro (claude, CLI only) (red)", () => {
  it("init --enforce, permission ai, update lists no .bak, remove leaves no .claude", async () => {
    await pathWithoutWikeeper();
    const root = await repo("agents: [claude]\n");
    expect((await drive(root, ["init", "--json", "--agents", "claude", "--enforce", "--yes"])).code).toBe(0);
    await setConfigValue(root, "ingest.permission", "ai");
    const u = await drive(root, ["update", "--json"]);
    expect(u.code).toBe(0);
    const added: string[] = u.json?.data?.added ?? [];
    expect(added.filter((p) => p.endsWith(".bak"))).toEqual([]);
    expect(await exists(root, ".claude/settings.json.bak")).toBe(false);
    expect((await drive(root, ["remove", "--json"])).code).toBe(0);
    expect(await exists(root, ".claude")).toBe(false);
  });
});

describe("BUG-002 @paths: an agent-list change followed by update (red)", () => {
  it("claude,codex -> claude, re-pin, update, remove: no settings file, backup or directory remains", async () => {
    await pathWithoutWikeeper();
    const root = await repo("agents: [claude, codex]\n");
    await runInit(root, run(root, { agents: "claude,codex", enforce: true }), { packageVersion: "1.0.0" });
    await setConfigValue(root, "agents", ["claude"]);
    await runUpdate(root, run(root, {}), { packageVersion: "2.0.0" });
    expect((await drive(root, ["remove", "--json"])).code).toBe(0);
    for (const rel of [".claude/settings.json", ".claude/settings.json.bak", ".codex/hooks.json", ".codex/hooks.json.bak", ".claude", ".codex"]) {
      expect(await exists(root, rel), rel).toBe(false);
    }
  });
});

describe("BUG-002 @rules: a user's own settings file still gets its backup and exact restore (guard)", () => {
  it("backup at init, kept through update, byte-restored by remove with no .bak left", async () => {
    await pathWithoutWikeeper();
    const root = await repo("agents: [claude]\n");
    await mkdir(abs(root, ".claude"), { recursive: true });
    await copyFile(FIXTURE, abs(root, ".claude/settings.json"));
    const original = await readFile(FIXTURE);
    expect((await drive(root, ["init", "--json", "--agents", "claude", "--enforce", "--yes"])).code).toBe(0);
    expect(Buffer.compare(await readFile(abs(root, ".claude/settings.json.bak")), original)).toBe(0);
    await setConfigValue(root, "ingest.permission", "ai");
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    expect(Buffer.compare(await readFile(abs(root, ".claude/settings.json.bak")), original)).toBe(0);
    expect((await drive(root, ["remove", "--json"])).code).toBe(0);
    expect(Buffer.compare(await readFile(abs(root, ".claude/settings.json")), original)).toBe(0);
    expect(await exists(root, ".claude/settings.json.bak")).toBe(false);
  });
});

describe("BUG-002 error: a user-changed settings file keeps its backup with a warning (guard)", () => {
  it("remove keeps the .bak, lists it under kept and warns", async () => {
    await pathWithoutWikeeper();
    const root = await repo("agents: [claude]\n");
    await mkdir(abs(root, ".claude"), { recursive: true });
    await copyFile(FIXTURE, abs(root, ".claude/settings.json"));
    expect((await drive(root, ["init", "--json", "--agents", "claude", "--enforce", "--yes"])).code).toBe(0);
    const s = JSON.parse(await readFile(abs(root, ".claude/settings.json"), "utf8"));
    s.userKey = "mine";
    await writeFile(abs(root, ".claude/settings.json"), JSON.stringify(s, null, 2) + "\n");
    const r = await drive(root, ["remove", "--json"]);
    expect(r.code).toBe(0);
    expect(await exists(root, ".claude/settings.json.bak")).toBe(true);
    expect(r.json?.data?.kept).toContain(".claude/settings.json.bak");
    const warns = [...(r.json?.warnings ?? []), ...(r.json?.data?.warnings ?? [])].map(String);
    expect(warns.some((w) => w.includes("changed since init; backup kept"))).toBe(true);
  });
});
