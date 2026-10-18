import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAgentsIntegration } from "../src/agents/index.js";
import { createUpdateCommand } from "../src/commands/update.js";
import { resetIntegrations } from "../src/core/integrations.js";
import { runCli } from "../src/program.js";

// Red tests for STORY-009-02 (wikeeper upgrade). src/commands/upgrade.ts does not exist yet: it is loaded through a
// literal dynamic import(), so each test fails alone. Nothing here runs npm, npx, a shell or the network: the fetch,
// the runner, the platform, the version and the package folder are injected.
async function load(): Promise<any> {
  return await import("../src/commands/upgrade.js");
}

const cleanup: string[] = [];
beforeEach(() => {
  resetIntegrations();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  resetIntegrations();
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function tmp(prefix = "wikeeper-up-"): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanup.push(d);
  return d;
}
async function put(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}
async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

interface Driven { code: number; out: string; err: string; json: any }
async function drive(cwd: string, args: string[], commands?: unknown[]): Promise<Driven> {
  let out = "";
  let err = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(c, _e, cb) { err += String(c); cb(); } });
  const code = await runCli(args, {
    ...(commands ? { commands: commands as never } : {}),
    io: { cwd, stdout, stderr, stdin: Readable.from([]) } as never,
  });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, out, err, json };
}

// A wiki project (git repository, init through the default program), manifest pinned by an injected-version update.
async function repoOnly(): Promise<string> {
  const root = await tmp();
  await mkdir(path.join(root, ".git"), { recursive: true });
  return root;
}
async function pin(root: string, version: string): Promise<void> {
  ensureAgentsIntegration();
  const r = await drive(root, ["update", "--json"], [createUpdateCommand({ packageVersion: version })]);
  expect(r.code).toBe(0);
}
async function project(files = "0.4.0+abc1234", initArgs: string[] = ["--agents", "claude"]): Promise<string> {
  const root = await repoOnly();
  const r = await drive(root, ["init", "--json", "--yes", ...initArgs]);
  expect(r.code).toBe(0);
  await pin(root, files);
  return root;
}
async function manifestVersion(root: string): Promise<string> {
  return JSON.parse(await readFile(path.join(root, ".wiki", "system", "manifest.json"), "utf8")).package_version;
}

// sha256 of every regular file under the root, skipping .git and .wiki/.cache
async function hashTree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const skip = [path.join(root, ".git"), path.join(root, ".wiki", ".cache")];
  async function walk(d: string): Promise<void> {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (skip.includes(full)) continue;
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) result[path.relative(root, full).split(path.sep).join("/")] = createHash("sha256").update(await readFile(full)).digest("hex");
    }
  }
  await walk(root);
  return result;
}

// ---- layouts -------------------------------------------------------------------------------------------------------
const PKG_JSON = JSON.stringify({ name: "wikeeper", version: "0.4.0", bin: { wikeeper: "dist/cli.js" } }, null, 2) + "\n";
async function pkgFolder(dir: string): Promise<string> {
  await put(path.join(dir, "package.json"), PKG_JSON);
  await put(path.join(dir, "dist", "cli.js"), "// stub\n");
  return dir;
}
async function globalLayout(): Promise<{ globalRoot: string; packageDir: string }> {
  const prefix = await tmp("wikeeper-prefix-");
  const globalRoot = path.join(prefix, "lib", "node_modules");
  return { globalRoot, packageDir: await pkgFolder(path.join(globalRoot, "wikeeper")) };
}
async function localLayout(root: string, rootPkg: object | null, lock?: string): Promise<string> {
  if (rootPkg) await put(path.join(root, "package.json"), JSON.stringify(rootPkg, null, 2) + "\n");
  if (lock) await put(path.join(root, lock), "");
  return await pkgFolder(path.join(root, "node_modules", "wikeeper"));
}

// ---- fakes ---------------------------------------------------------------------------------------------------------
interface Call { cmd: string; args: string[]; cwd: string }
const show = (c: { cmd: string; args: string[] }) => [c.cmd, ...c.args].join(" ");
function fakeFetch(version: string): typeof fetch {
  return (async () => new Response(JSON.stringify({ version }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}
function rejectingFetch(): typeof fetch {
  return (async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }); }) as unknown as typeof fetch;
}
interface RunnerOpts {
  globalRoot?: string;
  install?: { code: number; stdout: string; stderr: string };
  update?: { code: number; stdout: string; stderr: string };
  rejectAll?: boolean;
}
function fakeRunner(o: RunnerOpts = {}) {
  const calls: Call[] = [];
  const run = async (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => {
    calls.push({ cmd, args: [...args], cwd: opts.cwd });
    if (o.rejectAll) throw Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: "ENOENT" });
    if (cmd === "npm" && args[0] === "root" && args[1] === "-g") return { code: 0, stdout: `${o.globalRoot ?? ""}\n`, stderr: "" };
    if (args.includes("update")) {
      if (o.update) return o.update;
      ensureAgentsIntegration();
      const r = await drive(opts.cwd, ["update", "--json"], [createUpdateCommand({ packageVersion: "0.4.1+abc1234" })]);
      return { code: r.code, stdout: r.out, stderr: "" };
    }
    return o.install ?? { code: 0, stdout: "", stderr: "" };
  };
  return { calls, run };
}
function depsFor(packageDir: string, latest: string | typeof fetch, runner: { run: unknown }) {
  return {
    installed: "0.4.0",
    platform: "linux" as const,
    execPath: process.execPath,
    env: {} as NodeJS.ProcessEnv,
    now: () => new Date("2026-10-18T12:00:00Z"),
    fetch: typeof latest === "string" ? fakeFetch(latest) : latest,
    run: runner.run,
    packageDir,
    update: { packageVersion: "0.4.0+abc1234" },
  };
}
async function upgradeCmd(deps: unknown): Promise<unknown[]> {
  const { createUpgradeCommand } = await load();
  return [createUpgradeCommand(deps)];
}
const noSudo = (calls: Call[]) => {
  for (const c of calls) expect([c.cmd, ...c.args].some((a) => a.includes("sudo"))).toBe(false);
};
const savedCheck = async (root: string) => JSON.parse(await readFile(path.join(root, ".wiki", ".cache", "update-check.json"), "utf8"));

// ---- scenario 1 ----------------------------------------------------------------------------------------------------
describe("STORY-009-02 @paths @data: upgrade an npm install, then update the project as the new version (red)", () => {
  it("global install in a wiki project", async () => {
    const root = await project();
    const g = await globalLayout();
    const runner = fakeRunner({ globalRoot: g.globalRoot });
    const r = await drive(root, ["upgrade", "--json"], await upgradeCmd(depsFor(g.packageDir, "0.4.1", runner)));
    expect(r.json?.ok, JSON.stringify(r.json)).toBe(true);
    expect(r.code).toBe(0);
    expect(runner.calls.map(show)).toEqual([
      "npm root -g",
      "npm install -g wikeeper@0.4.1",
      `${process.execPath} ${path.join(g.globalRoot, "wikeeper", "dist", "cli.js")} update --json`,
    ]);
    for (const c of runner.calls) expect(c.cwd).toBe(root);
    noSudo(runner.calls);
    expect(r.json.data).toEqual({
      installed: "0.4.0", latest: "0.4.1", upgraded: true, install: "global",
      commands_run: ["npm install -g wikeeper@0.4.1", "wikeeper update"], updated: true,
    });
    expect(await manifestVersion(root)).toBe("0.4.1+abc1234");
    const saved = await savedCheck(root);
    expect(saved.installed).toBe("0.4.1");
    expect(saved.latest).toBe("0.4.1");
  });

  it("global install: the human output names wikeeper update for other projects", async () => {
    const root = await project();
    const g = await globalLayout();
    const runner = fakeRunner({ globalRoot: g.globalRoot });
    const r = await drive(root, ["upgrade"], await upgradeCmd(depsFor(g.packageDir, "0.4.1", runner)));
    expect(r.code).toBe(0);
    expect(r.out).toContain("upgraded wikeeper 0.4.0 → 0.4.1 with npm install -g and updated this project's files");
    expect(r.out).toContain("other projects that use this wikeeper: run wikeeper update in each");
  });

  for (const [section, flag, spec] of [
    ["devDependencies", "--save-dev", "^0.4.0"],
    ["dependencies", "--save-prod", "0.4.0"],
  ] as const) {
    it(`local install listed in ${section}`, async () => {
      const root = await project();
      const packageDir = await localLayout(root, { name: "app", [section]: { wikeeper: spec } });
      const runner = fakeRunner();
      const r = await drive(root, ["upgrade", "--json"], await upgradeCmd(depsFor(packageDir, "0.4.1", runner)));
      expect(r.json?.ok, JSON.stringify(r.json)).toBe(true);
      expect(r.code).toBe(0);
      expect(runner.calls.map(show)).toEqual([
        `npm install ${flag} wikeeper@0.4.1`,
        `${process.execPath} ${path.join(root, "node_modules", "wikeeper", "dist", "cli.js")} update --json`,
      ]);
      for (const c of runner.calls) expect(c.cwd).toBe(root);
      noSudo(runner.calls);
      expect(r.json.data).toEqual({
        installed: "0.4.0", latest: "0.4.1", upgraded: true, install: "local",
        commands_run: [`npm install ${flag} wikeeper@0.4.1`, "node_modules/.bin/wikeeper update"], updated: true,
      });
      expect(await manifestVersion(root)).toBe("0.4.1+abc1234");
    });
  }

  it("global install in a git repository with no wiki: npm only, nothing created", async () => {
    const repo = await repoOnly();
    const g = await globalLayout();
    const runner = fakeRunner({ globalRoot: g.globalRoot });
    const r = await drive(repo, ["upgrade", "--json"], await upgradeCmd(depsFor(g.packageDir, "0.4.1", runner)));
    expect(r.json?.ok, JSON.stringify(r.json)).toBe(true);
    expect(r.code).toBe(0);
    expect(runner.calls.map(show)).toEqual(["npm root -g", "npm install -g wikeeper@0.4.1"]);
    for (const c of runner.calls) expect(c.cwd).toBe(repo);
    expect(r.json.data).toEqual({
      installed: "0.4.0", latest: "0.4.1", upgraded: true, install: "global",
      commands_run: ["npm install -g wikeeper@0.4.1"], updated: false,
    });
    expect(await exists(path.join(repo, ".wiki"))).toBe(false);
  });
});

// ---- scenario 2 ----------------------------------------------------------------------------------------------------
describe("STORY-009-02 @paths: upgrade through npx re-pins the hooks (red)", () => {
  it("runs only npx -y wikeeper@0.4.1 update --json and rewrites the guard hook", async () => {
    vi.stubEnv("PATH", await tmp("wikeeper-empty-"));
    const root = await project("0.4.0+abc1234", ["--agents", "claude", "--enforce"]);
    const settingsFile = path.join(root, ".claude", "settings.json");
    expect(await readFile(settingsFile, "utf8")).toContain("npx -y wikeeper@0.4.0 hook guard --agent claude");
    const packageDir = await pkgFolder(path.join(await tmp("wikeeper-home-"), ".npm", "_npx", "0a1b2c3d", "node_modules", "wikeeper"));
    const runner = fakeRunner();
    const r = await drive(root, ["upgrade", "--json"], await upgradeCmd(depsFor(packageDir, "0.4.1", runner)));
    expect(r.json?.ok, JSON.stringify(r.json)).toBe(true);
    expect(r.code).toBe(0);
    expect(runner.calls.map(show)).toEqual(["npx -y wikeeper@0.4.1 update --json"]);
    expect(runner.calls[0]?.cwd).toBe(root);
    noSudo(runner.calls);
    expect(r.json.data).toEqual({
      installed: "0.4.0", latest: "0.4.1", upgraded: false, install: "npx",
      commands_run: ["npx -y wikeeper@0.4.1 update"], updated: true,
    });
    expect(await readFile(settingsFile, "utf8")).toContain("npx -y wikeeper@0.4.1 hook guard --agent claude");
  });
});

// ---- scenario 3 ----------------------------------------------------------------------------------------------------
describe("STORY-009-02 @interfaces @rules: nothing to install (red)", () => {
  async function setup(latest: string, files: string) {
    const root = await project(files);
    const g = await globalLayout();
    const runner = fakeRunner({ globalRoot: g.globalRoot });
    return { root, runner, cmds: await upgradeCmd(depsFor(g.packageDir, latest, runner)) };
  }

  it("latest equals installed: prints the latest-version line, changes no file, runs nothing", async () => {
    const { root, runner, cmds } = await setup("0.4.0", "0.4.0+abc1234");
    const before = await hashTree(root);
    const r = await drive(root, ["upgrade"], cmds);
    expect(r.code).toBe(0);
    expect(r.out).toContain("wikeeper 0.4.0 is the latest version");
    expect(await hashTree(root)).toEqual(before);
    expect(runner.calls).toEqual([]);
  });

  it("latest equals installed, files from 0.3.0: updates in-process, no runner call", async () => {
    const { root, runner, cmds } = await setup("0.4.0", "0.3.0+abc1234");
    const r = await drive(root, ["upgrade", "--json"], cmds);
    expect(r.json?.ok, JSON.stringify(r.json)).toBe(true);
    expect(r.code).toBe(0);
    expect(r.json.data).toEqual({
      installed: "0.4.0", latest: "0.4.0", upgraded: false, install: "global",
      commands_run: ["wikeeper update"], updated: true,
    });
    expect(await manifestVersion(root)).toBe("0.4.0+abc1234");
    expect(runner.calls).toEqual([]);
  });

  it("installed is newer than latest: says so, changes no file, runs nothing", async () => {
    const { root, runner, cmds } = await setup("0.3.0", "0.4.0+abc1234");
    const before = await hashTree(root);
    const r = await drive(root, ["upgrade"], cmds);
    expect(r.code).toBe(0);
    expect(r.out).toContain("no newer version on npm (latest 0.3.0, installed 0.4.0)");
    expect(await hashTree(root)).toEqual(before);
    expect(runner.calls).toEqual([]);
  });

  it("--check --json: reports the npm step, changes only update-check.json, runs only npm root -g", async () => {
    const { root, runner, cmds } = await setup("0.4.1", "0.4.0+abc1234");
    const before = await hashTree(root);
    const r = await drive(root, ["upgrade", "--check", "--json"], cmds);
    expect(r.json?.ok, JSON.stringify(r.json)).toBe(true);
    expect(r.code).toBe(0);
    expect(r.json.data).toEqual({ installed: "0.4.0", latest: "0.4.1", newer: true, install: "global", command: "npm install -g wikeeper@0.4.1" });
    expect(await hashTree(root)).toEqual(before);
    expect(await exists(path.join(root, ".wiki", ".cache", "update-check.json"))).toBe(true);
    expect(runner.calls.map(show)).toEqual(["npm root -g"]);
  });

  it("--check: the human line", async () => {
    const { root, runner, cmds } = await setup("0.4.1", "0.4.0+abc1234");
    const r = await drive(root, ["upgrade", "--check"], cmds);
    expect(r.code).toBe(0);
    expect(r.out).toContain("wikeeper 0.4.1 is available (installed 0.4.0); wikeeper upgrade would run: npm install -g wikeeper@0.4.1, then wikeeper update");
    expect(runner.calls.map(show)).toEqual(["npm root -g"]);
  });
});

// ---- scenario 4 ----------------------------------------------------------------------------------------------------
describe("STORY-009-02 @rules @data: npm or the registry fails, the project is unchanged (red)", () => {
  async function failing(runnerOpts: RunnerOpts, fetchOrLatest: string | typeof fetch = "0.4.1") {
    const root = await project();
    const g = await globalLayout();
    const runner = fakeRunner({ globalRoot: g.globalRoot, ...runnerOpts });
    const before = await hashTree(root);
    const r = await drive(root, ["upgrade", "--json"], await upgradeCmd(depsFor(g.packageDir, fetchOrLatest, runner)));
    expect(await hashTree(root), "project files changed").toEqual(before);
    noSudo(runner.calls);
    return { r, runner };
  }

  it("npm_failed (EACCES): names the sudo hand command, never runs an update", async () => {
    const { r, runner } = await failing({
      install: { code: 243, stdout: "", stderr: "npm error code EACCES\nnpm error syscall mkdir\nnpm error path /usr/lib/node_modules/wikeeper" },
    });
    expect(r.code).toBe(1);
    expect(r.json?.ok).toBe(false);
    expect(r.json.error.code).toBe("npm_failed");
    expect(r.json.error.message).toContain("npm error code EACCES");
    expect(r.json.error.message).toContain("sudo npm install -g wikeeper@0.4.1");
    expect(r.json.error.details.command).toBe("sudo npm install -g wikeeper@0.4.1");
    expect(runner.calls.map(show)).toEqual(["npm root -g", "npm install -g wikeeper@0.4.1"]);
  });

  it("npm_missing: the runner rejects with ENOENT", async () => {
    const { r, runner } = await failing({ rejectAll: true });
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("npm_missing");
    expect(r.json.error.message).toContain("npm was not found");
    expect(r.json.error.details.command).toBe("npm install -g wikeeper@0.4.1");
    expect(runner.calls.map(show)).toEqual(["npm root -g", "npm install -g wikeeper@0.4.1"]);
  });

  it("registry_unreachable: ENOTFOUND, no hand command, nothing runs", async () => {
    const { r, runner } = await failing({}, rejectingFetch());
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("registry_unreachable");
    expect(r.json.error.message).toContain("could not reach the npm registry (ENOTFOUND)");
    expect(r.json.error.details.command).toBeNull();
    expect(runner.calls).toEqual([]);
  });

  it("update_failed: npm succeeded, the update child exits 1", async () => {
    const { r, runner } = await failing({ update: { code: 1, stdout: "", stderr: "error: not initialised" } });
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("update_failed");
    expect(r.json.error.message).toContain("wikeeper 0.4.1 is installed, but its update failed");
    expect(r.json.error.details.command).toBe("wikeeper update");
    expect(r.json.error.details.then).toBeNull();
    expect(runner.calls.map(show)).toEqual([
      "npm root -g",
      "npm install -g wikeeper@0.4.1",
      expect.stringContaining(" update --json"),
    ]);
  });
});

// ---- scenario 5 ----------------------------------------------------------------------------------------------------
describe("STORY-009-02 @rules @data: an install wikeeper can't upgrade runs nothing (red)", () => {
  interface Row { name: string; kind: string; command: string | null; then: string; layout: (root: string) => Promise<string>; message?: string }
  const rows: Row[] = [
    {
      name: "pnpm global folder", kind: "unknown", command: "pnpm add -g wikeeper@0.4.1", then: "wikeeper update",
      layout: async () => pkgFolder(path.join(await tmp(), "pnpm", "global", "5", ".pnpm", "wikeeper@0.4.0", "node_modules", "wikeeper")),
    },
    {
      name: "bun global folder", kind: "unknown", command: "bun add -g wikeeper@0.4.1", then: "wikeeper update",
      layout: async () => pkgFolder(path.join(await tmp(), ".bun", "install", "global", "node_modules", "wikeeper")),
    },
    {
      name: "project folder with a yarn.lock and no package-lock.json", kind: "unknown",
      command: "yarn add --dev wikeeper@0.4.1", then: "node_modules/.bin/wikeeper update",
      layout: (root) => localLayout(root, { name: "app", devDependencies: { wikeeper: "^0.4.0" } }, "yarn.lock"),
    },
    {
      name: "source checkout", kind: "unknown", command: null, then: "wikeeper update", message: "update that folder yourself",
      layout: async () => pkgFolder(path.join(await tmp(), "src", "wikeeper")),
    },
    {
      name: "project folder that package.json does not list", kind: "local",
      command: "npm install --save-dev wikeeper@0.4.1", then: "node_modules/.bin/wikeeper update",
      layout: (root) => localLayout(root, { name: "app" }),
    },
  ];
  for (const row of rows) {
    it(`${row.name}: upgrade_unsupported, runner never called, --check exits 0`, async () => {
      const root = await project();
      const packageDir = await row.layout(root);
      const runner = fakeRunner();
      const cmds = await upgradeCmd(depsFor(packageDir, "0.4.1", runner));
      const before = await hashTree(root);
      const r = await drive(root, ["upgrade", "--json"], cmds);
      expect(r.code).toBe(1);
      expect(r.json?.ok).toBe(false);
      expect(r.json.error.code).toBe("upgrade_unsupported");
      expect(r.json.error.details.install).toBe(row.kind);
      expect(r.json.error.details.command).toBe(row.command);
      expect(r.json.error.details.then).toBe(row.then);
      if (row.message) expect(r.json.error.message).toContain(row.message);
      expect(runner.calls).toEqual([]);
      expect(await hashTree(root)).toEqual(before);

      const c = await drive(root, ["upgrade", "--check", "--json"], await upgradeCmd(depsFor(packageDir, "0.4.1", runner)));
      expect(c.json?.ok, JSON.stringify(c.json)).toBe(true);
      expect(c.code).toBe(0);
      expect(c.json.data.install).toBe(row.kind);
      expect(c.json.data.command).toBe(row.command);
      expect(runner.calls).toEqual([]);
      expect(await hashTree(root)).toEqual(before);
    });
  }
});
