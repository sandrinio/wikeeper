import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as gitignore from "../src/core/gitignore.js";
import { registerIntegration, resetIntegrations } from "../src/core/integrations.js";
import { runCli } from "../src/program.js";

// Red tests for STORY-002-08: settings files and backups in init/update reports; .bak files gitignored.
async function loadAgents(): Promise<any> {
  return await import("../src/agents/index.js");
}

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USER_SETTINGS = path.join(PKG_ROOT, "test", "fixtures", "settings", "claude-settings-user.json");
const IS_WIN = process.platform === "win32";
const BAK = ".claude/settings.json.bak";
const START = "# >>> wikeeper >>>";
const END = "# <<< wikeeper <<<";
const cleanup: string[] = [];

beforeEach(async () => {
  resetIntegrations();
  const mod = await loadAgents();
  registerIntegration({ name: "agents", ...mod.agentsIntegration } as never);
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
async function pathWithWikeeper(): Promise<void> {
  const bin = await tmp("wikeeper-bin-");
  const file = path.join(bin, IS_WIN ? "wikeeper.cmd" : "wikeeper");
  await writeFile(file, IS_WIN ? "@echo off\r\n" : "#!/bin/sh\nexit 0\n");
  if (!IS_WIN) await chmod(file, 0o755);
  if (IS_WIN) vi.stubEnv("PATHEXT", ".CMD");
  vi.stubEnv("PATH", bin);
}
const abs = (root: string, rel: string) => path.join(root, ...rel.split("/"));
async function put(root: string, rel: string, content: string | Buffer): Promise<void> {
  await mkdir(path.dirname(abs(root, rel)), { recursive: true });
  await writeFile(abs(root, rel), content);
}
const read = (root: string, rel: string) => readFile(abs(root, rel), "utf8");
async function exists(root: string, rel: string): Promise<boolean> {
  try { await lstat(abs(root, rel)); return true; } catch { return false; }
}
async function repo(files: Record<string, string | Buffer> = {}): Promise<string> {
  const root = await tmp("wikeeper-settrep-");
  await mkdir(path.join(root, ".git"), { recursive: true });
  for (const [rel, content] of Object.entries(files)) await put(root, rel, content);
  return root;
}
async function drive(root: string, args: string[]) {
  let out = "";
  let err = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(c, _e, cb) { err += String(c); cb(); } });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, out, err, json };
}
const userSettings = () => readFile(USER_SETTINGS, "utf8");
function blockLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const s = lines.indexOf(START);
  const e = lines.indexOf(END);
  return s >= 0 && e > s ? lines.slice(s + 1, e) : [];
}
const NO = (x: unknown): string[] => (Array.isArray(x) ? (x as string[]) : []);

describe("STORY-002-08 unit: managedIgnoreEntries backups parameter and backupPaths (red)", () => {
  const paths = {
    root: path.resolve("/r"),
    wikiDir: path.resolve("/r/.wiki"),
    contentDir: path.resolve("/r/.wiki"),
    pagesDir: path.resolve("/r/.wiki/pages"),
    archiveDir: path.resolve("/r/.wiki/archive"),
    rawDir: path.resolve("/r/.wiki/raw"),
    lockFile: path.resolve("/r/.wiki/.lock"),
    meFile: path.resolve("/r/.wiki/me.md"),
    projectFile: path.resolve("/r/.wiki/project.md"),
  } as never;

  it("appends sorted, deduplicated backups after the fixed entries and before private entries", () => {
    const base = gitignore.managedIgnoreEntries(paths, { private: [] }).entries;
    const withBak = gitignore.managedIgnoreEntries(
      paths,
      { private: ["secret.md"] },
      [".codex/hooks.json.bak", ".claude/settings.json.bak", ".codex/hooks.json.bak"],
    ).entries;
    expect(withBak.slice(0, base.length)).toEqual(base);
    expect(withBak.slice(base.length)).toEqual([
      ".claude/settings.json.bak",
      ".codex/hooks.json.bak",
      ".wiki/archive/secret.md",
      ".wiki/pages/secret.md",
    ]);
  });

  it("defaults to no backups", () => {
    const a = gitignore.managedIgnoreEntries(paths, { private: [] }, []);
    const b = gitignore.managedIgnoreEntries(paths, { private: [] });
    expect(a).toEqual(b);
    expect(b.entries.some((e) => e.endsWith(".bak"))).toBe(false);
  });

  it("backupPaths returns the manifest's kind hook identity backup paths", () => {
    const fn = (gitignore as any).backupPaths as (m: unknown) => string[];
    expect(typeof fn).toBe("function");
    const manifest = {
      package_version: "1.0.0",
      files: [
        { path: ".claude/settings.json.bak", kind: "hook", identity: "backup", sha256: "a" },
        { path: ".claude/settings.json", kind: "hook", identity: "hooks", sha256: "b" },
        { path: ".wiki/system/x.md", kind: "system", sha256: "c" },
      ],
    };
    expect(fn(manifest)).toEqual([".claude/settings.json.bak"]);
  });
});

describe("STORY-002-08 scenarios (red)", () => {
  it("S1: a backup written by init is reported, ignored, and taken out by remove", async () => {
    await pathWithWikeeper();
    const original = await userSettings();
    const root = await repo({ ".claude/settings.json": original, ".gitignore": "node_modules/\n" });
    const r = await drive(root, ["init", "--json", "--agents", "claude", "--enforce", "--yes"]);
    expect(r.code).toBe(0);
    expect(NO(r.json.data.updated)).toContain(".claude/settings.json");
    expect(r.json.data.backed_up).toEqual([BAK]);
    expect(NO(r.json.data.created)).not.toContain(BAK);
    expect(await exists(root, BAK)).toBe(true);
    const gi = await read(root, ".gitignore");
    expect(gi).toContain("node_modules/");
    expect(blockLines(gi)).toContain(BAK);

    const rm1 = await drive(root, ["remove", "--json"]);
    expect(rm1.code).toBe(0);
    const after = await read(root, ".gitignore");
    expect(after.split(/\r?\n/)).not.toContain(BAK);
    expect(await read(root, ".claude/settings.json")).toBe(original);
  });

  it("S2: a second init names the unchanged settings file", async () => {
    await pathWithWikeeper();
    const root = await repo();
    expect((await drive(root, ["init", "--json", "--agents", "claude", "--enforce", "--yes"])).code).toBe(0);
    const r = await drive(root, ["init", "--json"]);
    expect(r.code).toBe(0);
    expect(NO(r.json.data.skipped)).toContain(".claude/settings.json");
    expect(r.json.data.created).toEqual([]);
    expect(r.json.data.updated).toEqual([]);
    expect(r.json.data.removed).toEqual([]);
    expect(r.json.data.backed_up).toEqual([]);
  });

  it("S3: a backup written by update is reported and ignored", async () => {
    await pathWithWikeeper();
    const root = await repo({ ".claude/settings.json": await userSettings() });
    expect((await drive(root, ["init", "--json", "--agents", "claude", "--yes"])).code).toBe(0);
    expect(await exists(root, BAK)).toBe(false);
    const cfg = await read(root, ".wiki/config.yml");
    const next = /^enforce:.*$/m.test(cfg) ? cfg.replace(/^enforce:.*$/m, "enforce: true") : cfg.trimEnd() + "\nenforce: true\n";
    await writeFile(abs(root, ".wiki/config.yml"), next);
    const r = await drive(root, ["update", "--json"]);
    expect(r.code).toBe(0);
    expect(NO(r.json.data.replaced)).toContain(".claude/settings.json");
    expect(NO(r.json.data.replaced)).toContain(".gitignore");
    expect(NO(r.json.data.backed_up)).toContain(BAK);
    expect(NO(r.json.data.added)).not.toContain(BAK);
    expect(blockLines(await read(root, ".gitignore"))).toContain(BAK);
  });

  it("S4: re-init with fewer agents names the settings files it deletes", async () => {
    await pathWithWikeeper();
    const root = await repo();
    expect((await drive(root, ["init", "--json", "--agents", "claude,codex", "--enforce", "--yes"])).code).toBe(0);
    expect(await exists(root, ".codex/hooks.json")).toBe(true);
    const r = await drive(root, ["init", "--json", "--agents", "claude"]);
    expect(r.code).toBe(0);
    expect(NO(r.json.data.removed)).toContain(".codex/hooks.json");
    expect(NO(r.json.data.removed)).toContain(".codex/rules/wikeeper.rules");
  });

  it("S5 (error): update never recreates a deleted block", async () => {
    await pathWithWikeeper();
    const root = await repo({ ".claude/settings.json": await userSettings(), ".gitignore": "node_modules/\n" });
    expect((await drive(root, ["init", "--json", "--agents", "claude", "--enforce", "--yes"])).code).toBe(0);
    const gi = await read(root, ".gitignore");
    const lines = gi.split("\n");
    const s = lines.indexOf(START);
    const e = lines.indexOf(END);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(e).toBeGreaterThan(s);
    const stripped = [...lines.slice(0, s), ...lines.slice(e + 1)].join("\n");
    await writeFile(abs(root, ".gitignore"), stripped);
    const before = await readFile(abs(root, ".gitignore"));
    const r = await drive(root, ["update", "--json"]);
    expect(r.code).toBe(0);
    expect((await readFile(abs(root, ".gitignore"))).equals(before)).toBe(true);
    const warnings = NO(r.json.data.warnings).join("\n");
    expect(warnings).toContain(".gitignore");
    expect(warnings).toContain(BAK);
    expect(warnings).toContain("run wikeeper init to restore the block");
  });
});
