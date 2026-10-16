import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Red tests for STORY-006-08: the `setup-files` doctor check and src/core/git.ts.
// New modules are loaded with literal dynamic imports (expected-missing on the clean baseline).
const load = <T = any>(spec: string): Promise<T> => {
  switch (spec) {
    case "git":
      return import("../src/core/git.js") as Promise<T>;
    case "setup-files":
      return import("../src/core/setup-files.js") as Promise<T>;
    default:
      throw new Error(`unknown module ${spec}`);
  }
};

type Check = { id: string; severity: string; message: string; fix?: string; file?: string };

let root: string;
let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), "wikeeper-sf-"));
  root = path.join(scratch, "repo");
  await mkdir(root, { recursive: true });
  const emptyCfg = path.join(scratch, "empty-gitconfig");
  await writeFile(emptyCfg, "");
  vi.stubEnv("GIT_CONFIG_GLOBAL", emptyCfg);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(scratch, { recursive: true, force: true, maxRetries: 3 });
});

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}
function commit(): void {
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-qm", "x");
}

async function cli(args: string[]) {
  const { runCli } = await import("../src/program.js");
  const out: string[] = [];
  const err: string[] = [];
  const code: number = await (runCli as any)(args, {
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Readable.from([]),
    },
  });
  const text = out.join("");
  let json: any;
  try {
    json = JSON.parse(text.trim().split("\n").pop() ?? "");
  } catch {
    json = undefined;
  }
  return { code, json, text };
}

async function installed(opts: { realGit?: boolean } = {}): Promise<void> {
  if (opts.realGit !== false) git("init", "-q");
  const r = await cli(["init", "--yes", "--agents", "claude", "--json"]);
  expect(r.code).toBe(0);
}
const ME = () => path.join(root, ".wiki", "me.md");
const PROJECT = () => path.join(root, ".wiki", "project.md");
const GITIGNORE = () => path.join(root, ".gitignore");

async function doctor(): Promise<{ code: number; checks: Check[]; json: any }> {
  const r = await cli(["doctor", "--json"]);
  const checks = (r.json.data.checks as Check[]) ?? [];
  return { code: r.code, checks, json: r.json };
}
const sf = (checks: Check[]) => checks.filter((c) => c.id === "setup-files");
const sfFor = (checks: Check[], file: string) => sf(checks).find((c) => c.file === file);

describe("STORY-006-08 S1: fresh install reports info, not problems", () => {
  it("ids in order, info entries, then one ok once both files exist", async () => {
    await installed();
    const { code, checks, json } = await doctor();
    const ids = checks.map((c) => c.id).filter((id, i, a) => i === 0 || a[i - 1] !== id);
    expect(ids.slice(0, 5)).toEqual(["node-version", "wiki-initialised", "config-valid", "manifest-drift", "setup-files"]);
    expect(ids.length).toBeGreaterThan(5);
    expect(ids[5]).not.toBe("setup-files");
    const me = sfFor(checks, ".wiki/me.md")!;
    expect(me.severity).toBe("info");
    expect(me.message).toContain(".wiki/system/ONBOARDING.md");
    expect(sfFor(checks, ".wiki/project.md")!.severity).toBe("info");
    expect(json.data.errors).toBe(0);
    expect(json.data.warnings).toBe(0);
    expect(code).toBe(0);

    await writeFile(ME(), "me\n");
    await writeFile(PROJECT(), "project\n");
    const again = await doctor();
    const entries = sf(again.checks);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.severity).toBe("ok");
    expect(entries[0]!.file).toBeUndefined();
  });
});

describe("STORY-006-08 S2: me.md that is not ignored", () => {
  it.each([
    ["no wikeeper block", "wikeeper init"],
    ["re-include rule", "remove that rule"],
    ["block line deleted", "wikeeper update"],
  ])("%s -> warning with fix containing %s", async (row, fix) => {
    await installed();
    await writeFile(ME(), "me\n");
    const original = await readFile(GITIGNORE(), "utf8");
    if (row === "no wikeeper block") await writeFile(GITIGNORE(), "node_modules/\n");
    else if (row === "re-include rule") await writeFile(GITIGNORE(), original + "!/.wiki/me.md\n");
    else await writeFile(GITIGNORE(), original.split("\n").filter((l) => l !== ".wiki/me.md").join("\n"));
    const { checks } = await doctor();
    const me = sfFor(checks, ".wiki/me.md")!;
    expect(me.severity).toBe("warning");
    expect(me.fix).toContain(fix);
    if (row === "re-include rule") {
      expect(me.message).toContain(".gitignore:");
      expect(me.message).toContain("!/.wiki/me.md");
    }
  });
});

describe("STORY-006-08 S3: project.md", () => {
  it.each([
    ["missing after setup", "warning", ["SETUP.md", "2. The project"]],
    ["missing before setup", "info", ["SETUP.md"]],
    ["present and ignored", "warning", [".gitignore:", "!/.wiki/project.md"]],
  ])("%s -> %s", async (state, severity, named) => {
    await installed();
    await writeFile(ME(), "me\n");
    if (state === "missing after setup") expect((await cli(["setup", "--done", "--json"])).code).toBe(0);
    if (state === "present and ignored") {
      await writeFile(PROJECT(), "project\n");
      await writeFile(GITIGNORE(), (await readFile(GITIGNORE(), "utf8")) + "/.wiki/project.md\n");
    }
    const { checks } = await doctor();
    const entry = sfFor(checks, ".wiki/project.md")!;
    expect(entry.severity).toBe(severity);
    const text = `${entry.message}\n${entry.fix ?? ""}`;
    for (const s of named) expect(text).toContain(s);
  });
});

describe("STORY-006-08 S4: without git", () => {
  it.each([
    ["git runner reports ENOENT", "git not found; ignore checks skipped"],
    ["root not inside a work tree", "not a git repository; ignore checks skipped"],
  ])("%s", async (row, message) => {
    if (row === "root not inside a work tree") {
      await mkdir(path.join(root, ".git"), { recursive: true });
      await installed({ realGit: false });
      vi.stubEnv("GIT_CEILING_DIRECTORIES", path.dirname(root));
    } else {
      await installed();
      const emptyBin = path.join(scratch, "emptybin");
      await mkdir(emptyBin, { recursive: true });
      vi.stubEnv("PATH", emptyBin);
    }
    const { checks } = await doctor();
    const entries = sf(checks);
    expect(entries.some((c) => c.severity === "info" && c.message.includes(message))).toBe(true);
    expect(sfFor(checks, ".wiki/me.md")!.severity).toBe("info");
    expect(entries.some((c) => c.severity === "error" || c.severity === "warning")).toBe(false);
  });
});

describe("STORY-006-08 S5: committed me.md", () => {
  it("error line, fix line, exit 1, json entry", async () => {
    await installed();
    await writeFile(ME(), "me\n");
    git("add", "-f", ".wiki/me.md");
    commit();
    const human = await cli(["doctor"]);
    expect(human.code).toBe(1);
    const lines = human.text.split("\n");
    const i = lines.indexOf("[error] setup-files: .wiki/me.md is committed to git");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(lines[i + 1]).toBe("  fix: run git rm --cached .wiki/me.md and commit the removal");
    const { checks, json } = await doctor();
    const e = sf(checks).find((c) => c.severity === "error" && c.file === ".wiki/me.md");
    expect(e).toBeDefined();
    expect(json.data.errors).toBeGreaterThanOrEqual(1);
  });
});

describe("STORY-006-08 git helper (src/core/git.ts)", () => {
  it("createGit answers with a fake runner: negated rule, no rule, missing, exit 128", async () => {
    const { createGit } = await load("git");
    const calls: Array<{ args: string[]; input?: string }> = [];
    const neg = createGit(root, async (args: string[], _cwd: string, input?: string) => {
      calls.push({ args, input });
      return { code: 0, stdout: ".gitignore\0" + "4\0" + "!/.wiki/me.md\0" + ".wiki/me.md\0" };
    });
    expect(await neg.ignoreRule(".wiki/me.md")).toEqual({ source: ".gitignore", line: 4, pattern: "!/.wiki/me.md", negated: true });
    expect(calls[0]!.args).toEqual(expect.arrayContaining(["check-ignore", "-z", "--stdin"]));
    expect(calls[0]!.input).toBe(".wiki/me.md\0");
    const none = createGit(root, async () => ({ code: 1, stdout: "\0\0\0.wiki/me.md\0" }));
    expect(await none.ignoreRule(".wiki/me.md")).toBeNull();
    const missing = createGit(root, async () => "missing" as const);
    expect(await missing.inWorkTree()).toBe("missing");
    const bad = createGit(root, async () => ({ code: 128, stdout: "" }));
    expect(await bad.inWorkTree()).toBe(false);
  });
});
