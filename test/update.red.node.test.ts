import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerIntegration, resetIntegrations } from "../src/core/integrations.js";
import { runCli } from "../src/program.js";

// Red tests for STORY-001-05 (`wikeeper update`). The module is imported
// dynamically so the file fails at runtime, not at compile time, while missing.
interface UpdateModule {
  createUpdateCommand(deps?: {
    templatesDir?: string;
    packageVersion?: string;
    now?: () => Date;
  }): { register(program: unknown): void };
  formatBackupStamp(d: Date): string;
}
async function load(): Promise<UpdateModule> {
  return (await import("../src/commands/update.js")) as unknown as UpdateModule;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const NOW = () => new Date(Date.UTC(2026, 9, 16, 12));
const STAMP = "20261016120000";

const cleanup: string[] = [];
async function tmp(prefix: string): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanup.push(d);
  return d;
}
async function put(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

interface Fixture { root: string; sys: string; manifest: string }
async function repo(): Promise<Fixture> {
  const root = await tmp("wikeeper-upd-");
  const wiki = path.join(root, ".wiki");
  const sys = path.join(wiki, "system");
  await mkdir(path.join(root, ".git"), { recursive: true });
  await put(path.join(sys, "SETUP.md"), "v1\n");
  await put(path.join(sys, "WIKI.md"), "v1\n");
  await put(path.join(wiki, "config.yml"), "# user config\n");
  await put(path.join(wiki, "kb_instructions.md"), "my kb rules\n");
  await put(path.join(wiki, "me.md"), "about me\n");
  await put(path.join(wiki, "index.md"), "# index\n");
  await put(path.join(wiki, "pages", "WIKI.md"), "user page named like a system file\n");
  await put(path.join(wiki, "raw", "x.txt"), "raw\n");
  await put(path.join(wiki, "log", "1.md"), "log\n");
  const manifest = {
    package_version: "9.9.9",
    files: [
      { path: ".wiki/system/SETUP.md", sha256: sha("v1\n"), kind: "system" },
      { path: ".wiki/system/WIKI.md", sha256: sha("v1\n"), kind: "system" },
    ],
  };
  const manifestFile = path.join(sys, "manifest.json");
  await put(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  return { root, sys, manifest: manifestFile };
}

async function templates(files: Record<string, string>): Promise<string> {
  const dir = await tmp("wikeeper-tpl-");
  for (const [rel, content] of Object.entries(files)) {
    await put(path.join(dir, "system", ...rel.split("/")), content);
  }
  return dir;
}

async function drive(root: string, templatesDir: string, args: string[] = ["update", "--json"]) {
  const { createUpdateCommand } = await load();
  let out = "";
  let err = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(c, _e, cb) { err += String(c); cb(); } });
  const code = await runCli(args, {
    commands: [createUpdateCommand({ templatesDir, packageVersion: "9.9.9", now: NOW }) as never],
    io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never,
  });
  const line = out.trim().split("\n").filter(Boolean).pop();
  return { code, out, err, json: line ? (JSON.parse(line) as any) : null };
}

async function snapshot(dir: string, skip: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(d: string): Promise<void> {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (full === skip || e.name === ".git") continue;
      if (e.isDirectory()) await walk(full);
      else result[path.relative(dir, full).split(path.sep).join("/")] = sha(await readFile(full, "utf8"));
    }
  }
  await walk(dir);
  return result;
}

beforeEach(() => resetIntegrations());
afterEach(async () => {
  resetIntegrations();
  while (cleanup.length) await rm(cleanup.pop()!, { recursive: true, force: true });
});

describe("wikeeper update (red)", () => {
  it("replaces unchanged files, adds new ones, rewrites manifest, runs integration once", async () => {
    const { root, sys, manifest } = await repo();
    const tpl = await templates({ "SETUP.md": "v1\n", "WIKI.md": "v2\n", "profiles/management.md": "mgmt\n" });
    const handler = vi.fn();
    registerIntegration({ name: "test", update: handler });
    const r = await drive(root, tpl);
    expect(r.code).toBe(0);
    expect(await readFile(path.join(sys, "WIKI.md"), "utf8")).toBe("v2\n");
    expect(await readFile(path.join(sys, "profiles", "management.md"), "utf8")).toBe("mgmt\n");
    expect(r.json.data.replaced).toContain(".wiki/system/WIKI.md");
    expect(r.json.data.added).toContain(".wiki/system/profiles/management.md");
    const m = JSON.parse(await readFile(manifest, "utf8"));
    expect(m.package_version).toBe("9.9.9");
    const byPath = Object.fromEntries(m.files.map((f: any) => [f.path, f.sha256]));
    expect(byPath[".wiki/system/WIKI.md"]).toBe(sha("v2\n"));
    expect(byPath[".wiki/system/profiles/management.md"]).toBe(sha("mgmt\n"));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].paths.systemDir).toBe(path.join(root, ".wiki", "system"));
  });

  it("backs up a locally edited package file before replacing it", async () => {
    const { root, sys } = await repo();
    await writeFile(path.join(sys, "WIKI.md"), "my edit\n");
    const tpl = await templates({ "SETUP.md": "v1\n", "WIKI.md": "v2\n" });
    const r = await drive(root, tpl);
    expect(r.code).toBe(0);
    const bakName = `WIKI.md.bak-${STAMP}`;
    expect(await readFile(path.join(sys, bakName), "utf8")).toBe("my edit\n");
    expect(await readFile(path.join(sys, "WIKI.md"), "utf8")).toBe("v2\n");
    expect(r.json.data.backed_up).toContain(`.wiki/system/${bakName}`);
    expect(r.json.warnings.join("\n")).toContain("WIKI.md");
    expect(r.json.data.warnings.join("\n")).toContain("WIKI.md");
  });

  it("removes a file dropped from the package and its manifest entry", async () => {
    const { root, sys, manifest } = await repo();
    const tpl = await templates({ "WIKI.md": "v1\n" });
    const r = await drive(root, tpl, ["update"]);
    expect(r.code).toBe(0);
    expect(existsSync(path.join(sys, "SETUP.md"))).toBe(false);
    const m = JSON.parse(await readFile(manifest, "utf8"));
    expect(m.files.map((f: any) => f.path)).not.toContain(".wiki/system/SETUP.md");
  });

  it("leaves every file outside .wiki/system untouched", async () => {
    const { root, sys } = await repo();
    const tpl = await templates({ "SETUP.md": "v2\n", "WIKI.md": "v2\n", "profiles/management.md": "m\n" });
    const before = await snapshot(root, sys);
    const r = await drive(root, tpl);
    expect(r.code).toBe(0);
    expect(await snapshot(root, sys)).toEqual(before);
    expect(Object.keys(before)).toContain(".wiki/pages/WIKI.md");
  });

  it("fails with exit 1 when the repository is not initialised", async () => {
    const root = await tmp("wikeeper-upd-empty-");
    await mkdir(path.join(root, ".git"), { recursive: true });
    const tpl = await templates({ "WIKI.md": "v2\n" });
    const r = await drive(root, tpl);
    expect(r.code).toBe(1);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.message).toContain("run wikeeper init");
  });

  it("is a no-op when nothing changed: empty lists, manifest bytes and mtime unchanged", async () => {
    const { root, manifest } = await repo();
    const tpl = await templates({ "SETUP.md": "v1\n", "WIKI.md": "v1\n" });
    const bytes = await readFile(manifest, "utf8");
    const mtime = (await stat(manifest)).mtimeMs;
    const r = await drive(root, tpl);
    expect(r.code).toBe(0);
    expect(r.json.data).toEqual({ replaced: [], added: [], removed: [], backed_up: [], warnings: [] });
    expect(await readFile(manifest, "utf8")).toBe(bytes);
    expect((await stat(manifest)).mtimeMs).toBe(mtime);
  });

  it("never overwrites an existing backup: appends -1", async () => {
    const { root, sys } = await repo();
    await writeFile(path.join(sys, "WIKI.md"), "my edit\n");
    await writeFile(path.join(sys, `WIKI.md.bak-${STAMP}`), "older backup\n");
    const tpl = await templates({ "SETUP.md": "v1\n", "WIKI.md": "v2\n" });
    const r = await drive(root, tpl);
    expect(r.code).toBe(0);
    expect(await readFile(path.join(sys, `WIKI.md.bak-${STAMP}`), "utf8")).toBe("older backup\n");
    expect(await readFile(path.join(sys, `WIKI.md.bak-${STAMP}-1`), "utf8")).toBe("my edit\n");
  });

  it("formatBackupStamp renders UTC YYYYMMDDHHmmss, digits only", async () => {
    const { formatBackupStamp } = await load();
    expect(formatBackupStamp(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe("20260102030405");
    expect(formatBackupStamp(new Date(Date.UTC(2026, 9, 16, 12)))).toBe(STAMP);
    expect(formatBackupStamp(new Date())).toMatch(/^\d{14}$/);
  });
});
