import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCommit, versionString } from "../src/core/version.js";

const SCRIPT = path.resolve(import.meta.dirname, "..", "scripts", "build-info.mjs");
const hasGit = spawnSync("git", ["--version"]).status === 0;
const pkgVersion = "0.3.0";

let dir: string;
let empty: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wk-bi-"));
  empty = await mkdtemp(path.join(os.tmpdir(), "wk-bi-empty-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(empty, { recursive: true, force: true });
});

function baseEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env["GIT_CEILING_DIRECTORIES"] = path.dirname(dir);
  env["GIT_CONFIG_NOSYSTEM"] = "1";
  env["GIT_CONFIG_GLOBAL"] = path.join(empty, "gitconfig");
  return env;
}
function git(args: string[]) {
  const r = spawnSync("git", args, { cwd: dir, env: baseEnv(), encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
}
function run(env: NodeJS.ProcessEnv) {
  const r = spawnSync(process.execPath, [SCRIPT, "out"], { cwd: dir, env, encoding: "utf8" });
  return r;
}
async function stamp(): Promise<{ commit: string | null }> {
  return JSON.parse(await readFile(path.join(dir, "out", "build-info.json"), "utf8")) as { commit: string | null };
}
async function stampText(): Promise<string> {
  return await readFile(path.join(dir, "out", "build-info.json"), "utf8");
}

// CR-006: these tests spawn git and Node several times; a Windows runner once needed 6.5 s.
describe("scripts/build-info.mjs", { timeout: 30_000 }, () => {
  it.skipIf(!hasGit)("stamps the commit when git has a repository with one commit", async () => {
    git(["init", "-q"]);
    await writeFile(path.join(dir, "f"), "x");
    git(["add", "f"]);
    git(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "c"]);
    const want = git(["rev-parse", "--short=7", "HEAD"]);
    const r = run(baseEnv());
    expect(r.status, r.stderr).toBe(0);
    expect(await stampText()).toBe(`{"commit":"${want}"}\n`);
    expect(versionString(pkgVersion, buildCommit(pathToFileURL(path.join(dir, "out", "build-info.json"))))).toBe(
      `${pkgVersion}+${want}`,
    );
  });

  it.skipIf(!hasGit)("stamps null when the repository has no commit yet", async () => {
    git(["init", "-q"]);
    const r = run(baseEnv());
    expect(r.status, r.stderr).toBe(0);
    expect(await stampText()).toBe('{"commit":null}\n');
  });

  it.skipIf(!hasGit)("stamps null when git finds no repository", async () => {
    const r = run(baseEnv());
    expect(r.status, r.stderr).toBe(0);
    expect((await stamp()).commit).toBeNull();
  });

  it("stamps null when git is not on PATH", async () => {
    const env = baseEnv();
    for (const k of Object.keys(env)) if (k.toUpperCase() === "PATH") delete env[k];
    env["PATH"] = empty;
    const r = run(env);
    expect(r.status, r.stderr).toBe(0);
    expect(await stampText()).toBe('{"commit":null}\n');
    expect(buildCommit(pathToFileURL(path.join(dir, "out", "build-info.json")))).toBeNull();
  });

  it("exits 1 with a usage line when the directory argument is missing", async () => {
    await mkdir(dir, { recursive: true });
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, env: baseEnv(), encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("usage:");
  });
});
