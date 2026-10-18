import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  binOf,
  createUpgradeCommand,
  detectInstall,
  handCommand,
  isStartFailure,
  npmSpawn,
  outputTail,
} from "../src/commands/upgrade.js";
import { runCli } from "../src/program.js";

const cleanup: string[] = [];
afterEach(async () => {
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});
async function tmp(): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), "wikeeper-upu-"));
  cleanup.push(d);
  return d;
}
async function pkg(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "wikeeper", bin: { wikeeper: "dist/cli.js" } }));
  return dir;
}
const O = (root: string | null, extra: object = {}) => ({ root, env: {}, platform: "linux" as const, ...extra });

describe("STORY-009-02 detectInstall", () => {
  it("npx cache, source checkout and manager folders", async () => {
    const t = await tmp();
    expect(detectInstall(await pkg(path.join(t, ".npm", "_npx", "ab", "node_modules", "wikeeper")), O(null))).toBe("npx");
    expect(detectInstall(await pkg(path.join(t, "src", "wikeeper")), O(null))).toBe("unknown");
    expect(detectInstall(await pkg(path.join(t, ".pnpm", "x", "node_modules", "wikeeper")), O(null))).toBe("unknown");
    expect(detectInstall(await pkg(path.join(t, ".bun", "node_modules", "wikeeper")), O(null))).toBe("unknown");
  });
  it("project install, with a foreign lockfile beside package-lock.json staying local", async () => {
    const root = await tmp();
    const dir = await pkg(path.join(root, "node_modules", "wikeeper"));
    expect(detectInstall(dir, O(root))).toBe("local");
    await writeFile(path.join(root, "yarn.lock"), "");
    expect(detectInstall(dir, O(root))).toBe("unknown");
    await writeFile(path.join(root, "package-lock.json"), "{}");
    expect(detectInstall(dir, O(root))).toBe("local");
  });
  it("a junction-linked project install is unknown", async () => {
    const root = await tmp();
    const target = await pkg(path.join(await tmp(), "node_modules", "wikeeper"));
    await mkdir(path.join(root, "node_modules"), { recursive: true });
    await symlink(target, path.join(root, "node_modules", "wikeeper"), "junction");
    expect(detectInstall(path.join(root, "node_modules", "wikeeper"), O(root))).toBe("unknown");
  });
  it("global: confirmed by globalRoot, else by lib/node_modules", async () => {
    const prefix = await tmp();
    const globalRoot = path.join(prefix, "lib", "node_modules");
    const dir = await pkg(path.join(globalRoot, "wikeeper"));
    expect(detectInstall(dir, O(await tmp(), { globalRoot }))).toBe("global");
    expect(detectInstall(dir, O(await tmp()))).toBe("global");
    expect(detectInstall(dir, O(await tmp(), { globalRoot: path.join(prefix, "other") }))).toBe("unknown");
    const odd = await pkg(path.join(await tmp(), "opt", "node_modules", "wikeeper"));
    expect(detectInstall(odd, O(await tmp()))).toBe("unknown");
  });
  it("a linked global install is not global", async () => {
    const prefix = await tmp();
    const globalRoot = path.join(prefix, "lib", "node_modules");
    const target = await pkg(path.join(await tmp(), "checkout", "wikeeper"));
    await mkdir(globalRoot, { recursive: true });
    await symlink(target, path.join(globalRoot, "wikeeper"), "junction");
    expect(detectInstall(path.join(globalRoot, "wikeeper"), O(await tmp(), { globalRoot }))).toBe("unknown");
  });
  it.runIf(process.platform === "win32")("win32 folds case", async () => {
    const prefix = await tmp();
    const globalRoot = path.join(prefix, "npm", "node_modules");
    const dir = await pkg(path.join(globalRoot, "wikeeper"));
    expect(detectInstall(dir.toUpperCase(), { root: null, env: {}, platform: "win32", globalRoot })).toBe("global");
  });
});

describe("STORY-009-02 npmSpawn", () => {
  const base = { execPath: "/n/node" };
  it("uses node and npm-cli.js when npm started us, npx-cli.js for npx", () => {
    const env = { npm_execpath: "/x/npm/bin/npm-cli.js" };
    expect(npmSpawn("npm", ["root", "-g"], { ...base, env, platform: "linux" })).toEqual({
      file: "/n/node", args: ["/x/npm/bin/npm-cli.js", "root", "-g"], shell: false,
    });
    expect(npmSpawn("npx", ["-y", "wikeeper@1.2.3"], { ...base, env, platform: "linux" }).args[0]).toBe("/x/npm/bin/npx-cli.js");
  });
  it("win32 falls back to npm.cmd with a shell", () => {
    expect(npmSpawn("npm", ["install", "-g", "wikeeper@0.4.1"], { ...base, env: {}, platform: "win32" })).toEqual({
      file: "npm.cmd", args: ["install", "-g", "wikeeper@0.4.1"], shell: true,
    });
  });
  it("POSIX uses the command from PATH and execPath runs as is", () => {
    expect(npmSpawn("npm", ["root"], { ...base, env: {}, platform: "linux" })).toEqual({ file: "npm", args: ["root"], shell: false });
    expect(npmSpawn("/n/node", ["a b", "update"], { ...base, env: {}, platform: "win32" })).toEqual({
      file: "/n/node", args: ["a b", "update"], shell: false,
    });
  });
  it("refuses a non-constant argument to a shell", () => {
    expect(() => npmSpawn("npm", ["install", "wikeeper@1.0.0 && calc"], { ...base, env: {}, platform: "win32" })).toThrow(
      /refusing to pass/,
    );
  });
});

describe("STORY-009-02 helpers", () => {
  it("isStartFailure", () => {
    expect(isStartFailure("linux", { code: null, stderr: "", errCode: "ENOENT" })).toBe(true);
    expect(isStartFailure("win32", { code: 9009, stderr: "" })).toBe(true);
    expect(isStartFailure("win32", { code: 1, stderr: "'npm' is not recognized" })).toBe(true);
    expect(isStartFailure("linux", { code: 9009, stderr: "is not recognized" })).toBe(false);
  });
  it("handCommand for each manager and scope", () => {
    const o = { dir: "", latest: "0.4.1" };
    const h = (manager: "npm" | "pnpm" | "yarn" | "bun", scope: "global" | "project") =>
      handCommand("unknown", { ...o, manager, scope });
    expect(h("npm", "global")).toBe("npm install -g wikeeper@0.4.1");
    expect(h("npm", "project")).toBe("npm install --save-dev wikeeper@0.4.1");
    expect(h("pnpm", "global")).toBe("pnpm add -g wikeeper@0.4.1");
    expect(h("pnpm", "project")).toBe("pnpm add -D wikeeper@0.4.1");
    expect(h("yarn", "global")).toBe("yarn global add wikeeper@0.4.1");
    expect(h("yarn", "project")).toBe("yarn add --dev wikeeper@0.4.1");
    expect(h("bun", "global")).toBe("bun add -g wikeeper@0.4.1");
    expect(h("bun", "project")).toBe("bun add -d wikeeper@0.4.1");
    expect(handCommand("npx", { ...o, manager: null, scope: "global" })).toBe("npx -y wikeeper@0.4.1 update");
  });
  it("outputTail keeps the last 10 non-empty lines, stderr first, CRLF aware", () => {
    const err = Array.from({ length: 14 }, (_, i) => `l${i}`).join("\r\n\r\n");
    expect(outputTail(err, "out")).toEqual(Array.from({ length: 10 }, (_, i) => `l${i + 4}`));
    expect(outputTail("", "a\n\nb\n")).toEqual(["a", "b"]);
  });
  it("binOf", () => {
    expect(binOf('{"bin":"x/cli.js"}')).toBe("x/cli.js");
    expect(binOf('{"bin":{"wikeeper":"y.js"}}')).toBe("y.js");
    expect(binOf("{}")).toBe("dist/cli.js");
    expect(binOf("not json")).toBe("dist/cli.js");
  });
});

// Action tests: need STORY-009-01's fetchLatestVersion, so they stay red on contract stub C3 until it merges.
describe("STORY-009-02 npm flags and wording", () => {
  async function run(layoutPkg: object, platform: "linux" | "win32", stderr?: string) {
    const root = await tmp();
    await mkdir(path.join(root, ".git"), { recursive: true });
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "app", ...layoutPkg }));
    const dir = await pkg(path.join(root, "node_modules", "wikeeper"));
    const calls: string[][] = [];
    let out = "";
    const io = {
      cwd: root, stdin: Readable.from([]),
      stdout: new Writable({ write(c, _e, cb) { out += String(c); cb(); } }),
      stderr: new Writable({ write(_c, _e, cb) { cb(); } }),
    };
    const cmd = createUpgradeCommand({
      installed: "0.4.0", platform, packageDir: dir, env: {}, execPath: process.execPath,
      fetch: (async () => new Response(JSON.stringify({ version: "0.4.1" }))) as unknown as typeof fetch,
      run: async (c, a) => {
        calls.push([c, ...a]);
        return { code: stderr ? 1 : 0, stdout: "", stderr: stderr ?? "" };
      },
    });
    const code = await runCli(["upgrade", "--json"], { commands: [cmd], io: io as never });
    return { code, calls, json: JSON.parse(out.trim().split("\n").pop() as string) };
  }
  for (const [section, flag] of [["devDependencies", "--save-dev"], ["dependencies", "--save-prod"], ["optionalDependencies", "--save-optional"]] as const) {
    it(`local install in ${section} passes exactly ${flag}, never --save or -g`, async () => {
      const r = await run({ [section]: { wikeeper: "^0.4.0" } }, "linux");
      expect(r.calls).toEqual([["npm", "install", flag, "wikeeper@0.4.1"]]);
      expect(r.calls[0]).not.toContain("--save");
      expect(r.calls[0]).not.toContain("-g");
    });
  }
  it("EACCES on a local install gets no sudo", async () => {
    const r = await run({ devDependencies: { wikeeper: "^0.4.0" } }, "linux", "npm error code EACCES");
    expect(r.json.error.details.command).toBe("npm install --save-dev wikeeper@0.4.1");
  });
  for (const [platform, command, hand] of [
    ["linux", "sudo npm install -g wikeeper@0.4.1", "run sudo npm install -g wikeeper@0.4.1, then"],
    ["win32", "npm install -g wikeeper@0.4.1", "run npm install -g wikeeper@0.4.1 in a terminal run as administrator"],
  ] as const) {
    it(`EACCES on a global install on ${platform}`, async () => {
      const root = await tmp();
      await mkdir(path.join(root, ".git"), { recursive: true });
      const dir = await pkg(path.join(await tmp(), platform === "win32" ? "npm" : "lib", "node_modules", "wikeeper"));
      let out = "";
      const io = {
        cwd: root, stdin: Readable.from([]),
        stdout: new Writable({ write(c, _e, cb) { out += String(c); cb(); } }),
        stderr: new Writable({ write(_c, _e, cb) { cb(); } }),
      };
      const cmd = createUpgradeCommand({
        installed: "0.4.0", platform, packageDir: dir, env: {}, execPath: process.execPath,
        fetch: (async () => new Response(JSON.stringify({ version: "0.4.1" }))) as unknown as typeof fetch,
        run: async (_c, a) =>
          a[0] === "root" ? { code: 1, stdout: "", stderr: "" } : { code: 243, stdout: "", stderr: "npm error code EACCES" },
      });
      await runCli(["upgrade", "--json"], { commands: [cmd], io: io as never });
      const j = JSON.parse(out.trim().split("\n").pop() as string);
      expect(j.error.code).toBe("npm_failed");
      expect(j.error.details.command).toBe(command);
      expect(j.error.message).toContain(hand.split(", then")[0]);
    });
  }
});
