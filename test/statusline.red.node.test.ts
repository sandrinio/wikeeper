import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { execFileRunner } from "../src/core/git.js";
import type { GitRunner } from "../src/core/git.js";
import { estimateTokens, formatTokens, levelMark, levelOf } from "../src/core/tokens.js";
import { runCli } from "../src/program.js";

// STORY-007-06 (red): wikeeper statusline and --install. Written against the story's Gherkin; red until the command exists.
// The wording the story does not pin (settings_tracked text, replace verb, exclude detail line) is asserted by code and key phrase.

const T = 60_000;

async function load(_spec: string): Promise<any> {
  return import("../src/commands/statusline.js");
}

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true, maxRetries: 3 });
});

async function tmp(prefix = "wikeeper-sl-"): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

const WORD = "word ";
const pageText = (n: number): string => `# page\n\n${WORD.repeat(n)}\n`;

async function makeWiki(root: string, pages: Record<string, string> | null): Promise<void> {
  await mkdir(path.join(root, ".wiki", "pages"), { recursive: true });
  await writeFile(path.join(root, ".wiki", "config.yml"), "agents: [claude]\n");
  for (const [rel, text] of Object.entries(pages ?? {})) {
    await mkdir(path.dirname(path.join(root, ".wiki", "pages", rel)), { recursive: true });
    await writeFile(path.join(root, ".wiki", "pages", rel), text);
  }
}

interface Out {
  code: number;
  stdout: string;
  stderr: string;
  json: any;
}

async function run(cwd: string, argv: string[], deps: Record<string, unknown>, stdinText: string | "tty" | null): Promise<Out> {
  const { createStatuslineCommand } = await load("statusline");
  const out: string[] = [];
  const err: string[] = [];
  const stdin =
    stdinText === "tty"
      ? Object.assign(Readable.from([]), { isTTY: true })
      : Object.assign(Readable.from(stdinText === null ? [] : [Buffer.from(stdinText)]), { isTTY: false });
  const code = await runCli(argv, {
    commands: [createStatuslineCommand(deps)],
    io: {
      cwd,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin,
    },
  } as never);
  const stdout = out.join("");
  let json: any = null;
  try {
    json = JSON.parse(stdout.trim().split("\n")[0]!);
  } catch {
    /* human output */
  }
  return { code: code as number, stdout, stderr: err.join(""), json };
}

/* ---------- scenario: the status line shows the wiki's size ---------- */

describe("Scenario: The status line shows the wiki's size", () => {
  async function repo(): Promise<{ root: string; expected: string }> {
    const root = await tmp();
    const pages = { "a.md": pageText(2800), "b.md": pageText(600), "c.md": pageText(500) };
    await makeWiki(root, pages);
    await mkdir(path.join(root, "notes"), { recursive: true });
    const sizes = Object.values(pages).map((t) => estimateTokens(t));
    const total = sizes.reduce((a, b) => a + b, 0);
    const a = sizes[0]!;
    expect(levelOf(a, { yellow: 4000, red: 10000 })).toBe("yellow");
    const expected = `wiki ${formatTokens(total)} tokens · 3 pages · largest page ${formatTokens(a)} ${levelMark("yellow")}\n`;
    return { root, expected };
  }

  it("row 1: workspace.current_dir (inside the repository) wins; cwd is unrelated", async () => {
    const { root, expected } = await repo();
    const elsewhere = await tmp("wikeeper-sl-else-");
    const stdin = JSON.stringify({ workspace: { current_dir: path.join(root, "notes") }, cwd: path.join(root, "notes") });
    const r = await run(elsewhere, ["statusline"], {}, stdin);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe(expected);
  }, T);

  it("row 2: only cwd in the stdin JSON", async () => {
    const { root, expected } = await repo();
    const elsewhere = await tmp("wikeeper-sl-else-");
    const r = await run(elsewhere, ["statusline"], {}, JSON.stringify({ cwd: root }));
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe(expected);
  }, T);

  it("row 3: a terminal reads nothing and uses the working directory", async () => {
    const { root, expected } = await repo();
    const r = await run(root, ["statusline"], {}, "tty");
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe(expected);
  }, T);

  it("row 4: stdin that is not JSON falls back to the working directory", async () => {
    const { root, expected } = await repo();
    const r = await run(root, ["statusline"], {}, "not json");
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe(expected);
  }, T);

  it("row 5: a directory with no wiki prints nothing and exits 0", async () => {
    const { root } = await repo();
    const bare = await tmp("wikeeper-sl-bare-");
    const r = await run(root, ["statusline"], {}, JSON.stringify({ workspace: { current_dir: bare } }));
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe("");
  }, T);

  it("row 6: a wiki with no pages", async () => {
    const root = await tmp();
    await makeWiki(root, null);
    const r = await run(root, ["statusline"], {}, "tty");
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe("wiki ≈0 tokens · 0 pages\n");
  }, T);

  it("row 7: a config.yml with a YAML syntax error prints one line and exits 0", async () => {
    const root = await tmp();
    await makeWiki(root, { "a.md": pageText(10) });
    await writeFile(path.join(root, ".wiki", "config.yml"), "agents: [claude\nprofile: {\n");
    const r = await run(root, ["statusline"], {}, "tty");
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe("wiki size unavailable (E_CONFIG_SYNTAX): run wikeeper doctor\n");
  }, T);

  it("the line path writes no file", async () => {
    const { root } = await repo();
    const before = await snapshot(root);
    await run(root, ["statusline"], {}, "tty");
    expect(await snapshot(root)).toEqual(before);
  }, T);
});

/* ---------- --install helpers ---------- */

const EMPTY_ENV = async (): Promise<Record<string, string>> => {
  const d = await tmp("wikeeper-sl-gitcfg-");
  await writeFile(path.join(d, "gitconfig"), "");
  return { GIT_CONFIG_GLOBAL: path.join(d, "gitconfig"), XDG_CONFIG_HOME: d, GIT_CONFIG_NOSYSTEM: "1" };
};

function wrapGit(env: Record<string, string>): GitRunner {
  return async (args, cwd, input) => {
    const saved: Record<string, string | undefined> = {};
    for (const k of Object.keys(env)) {
      saved[k] = process.env[k];
      process.env[k] = env[k];
    }
    try {
      return await execFileRunner(args, cwd, input);
    } finally {
      for (const k of Object.keys(env)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };
}

function git(cwd: string, env: Record<string, string>, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: { ...process.env, ...env }, encoding: "utf8" });
}

async function snapshot(root: string, skipGit = true): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (skipGit && e.name === ".git") continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else out[path.relative(root, abs).split(path.sep).join("/")] = (await readFile(abs)).toString("base64");
    }
  };
  await walk(root);
  return out;
}

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

interface InstallRepo {
  root: string;
  env: Record<string, string>;
  userFile: string;
  deps: Record<string, unknown>;
  local: string;
  exclude: string;
}

async function installRepo(opts: { git?: boolean; ignored?: boolean } = {}): Promise<InstallRepo> {
  const root = await tmp();
  const env = await EMPTY_ENV();
  await makeWiki(root, { "a.md": pageText(20) });
  if (opts.git !== false) git(root, env, "init", "-q");
  if (opts.ignored) await writeFile(path.join(root, ".gitignore"), ".claude/settings.local.json\n");
  const userDir = await tmp("wikeeper-sl-user-");
  const userFile = path.join(userDir, "settings.json");
  const deps = { guardForm: () => "path", runGit: wrapGit(env), userSettingsFile: () => userFile };
  return {
    root,
    env,
    userFile,
    deps,
    local: path.join(root, ".claude", "settings.local.json"),
    exclude: path.join(root, ".git", "info", "exclude"),
  };
}

const readOr = async (p: string): Promise<string | null> => readFile(p, "utf8").catch(() => null);
const STATUS_LINE = { type: "command", command: "wikeeper statusline" };

/* ---------- scenario: --install adds the status line ---------- */

describe("Scenario: --install adds the status line to the personal settings file", () => {
  it("row 1: no local file, ignored by .gitignore -> 2-space JSON with final newline, exclude unchanged", async () => {
    const r0 = await installRepo({ ignored: true });
    const excludeBefore = await readOr(r0.exclude);
    const r = await run(r0.root, ["statusline", "--install", "--json"], r0.deps, null);
    expect(r.code).toBe(0);
    expect(r.json.ok).toBe(true);
    expect(await readFile(r0.local, "utf8")).toBe(JSON.stringify({ statusLine: STATUS_LINE }, null, 2) + "\n");
    expect(r.json.data.installed).toBe(true);
    expect(r.json.data.replaced).toBe(false);
    expect(r.json.data.excluded).toBe(false);
    expect(r.json.data.file).toBe(".claude/settings.local.json");
    expect(r.json.data.command).toBe("wikeeper statusline");
    expect(r.json.data.form).toBe("path");
    expect(await readOr(r0.exclude)).toBe(excludeBefore);
  }, T);

  it("row 2: keeps 4-space indent, CRLF and no final newline; statusLine is the last key; no .bak", async () => {
    const r0 = await installRepo({ ignored: true });
    await mkdir(path.dirname(r0.local), { recursive: true });
    const old = { permissions: { allow: ["Bash(ls)"] } };
    await writeFile(r0.local, JSON.stringify(old, null, 4).replace(/\n/g, "\r\n"));
    const r = await run(r0.root, ["statusline", "--install", "--json"], r0.deps, null);
    expect(r.code).toBe(0);
    const text = await readFile(r0.local, "utf8");
    const parsed = JSON.parse(text);
    expect(parsed).toEqual({ ...old, statusLine: STATUS_LINE });
    expect(Object.keys(parsed)).toEqual(["permissions", "statusLine"]);
    expect(text).toContain('\r\n    "statusLine": {');
    expect(/(?<!\r)\n/.test(text)).toBe(false);
    expect(text.endsWith("\n")).toBe(false);
    expect(await exists(r0.local + ".bak")).toBe(false);
    expect((await readdir(path.dirname(r0.local))).sort()).toEqual(["settings.local.json"]);
  }, T);

  it("row 3: not ignored -> file written, .git/info/exclude gets the entry, data.excluded is true", async () => {
    const r0 = await installRepo({ ignored: false });
    const r = await run(r0.root, ["statusline", "--install", "--json"], r0.deps, null);
    expect(r.code).toBe(0);
    expect(JSON.parse(await readFile(r0.local, "utf8")).statusLine).toEqual(STATUS_LINE);
    expect(r.json.data.excluded).toBe(true);
    const lines = (await readFile(r0.exclude, "utf8")).split("\n");
    expect(lines).toContain("/.claude/settings.local.json");
    expect((await readFile(r0.exclude, "utf8")).endsWith("/.claude/settings.local.json\n")).toBe(true);
    expect(git(r0.root, r0.env, "check-ignore", ".claude/settings.local.json").trim()).toBe(".claude/settings.local.json");
  }, T);

  it("row 4: wikeeper's own identical line -> byte-identical, installed false, says already installed", async () => {
    const r0 = await installRepo({ ignored: true });
    await mkdir(path.dirname(r0.local), { recursive: true });
    const text = JSON.stringify({ statusLine: STATUS_LINE }, null, 2) + "\n";
    await writeFile(r0.local, text);
    const j = await run(r0.root, ["statusline", "--install", "--json"], r0.deps, null);
    expect(j.code).toBe(0);
    expect(j.json.data.installed).toBe(false);
    expect(j.json.data.replaced).toBe(false);
    const h = await run(r0.root, ["statusline", "--install"], r0.deps, null);
    expect(h.code).toBe(0);
    expect(h.stdout).toContain("already installed");
    expect(h.stdout).toContain(".claude/settings.local.json");
    expect(await readFile(r0.local, "utf8")).toBe(text);
  }, T);

  it("row 5: wikeeper's own older npx line is replaced; other keys unchanged", async () => {
    const r0 = await installRepo({ ignored: true });
    await mkdir(path.dirname(r0.local), { recursive: true });
    const old = {
      statusLine: { type: "command", command: "npx -y wikeeper@0.3.0 statusline" },
      permissions: { allow: ["Bash(ls)"] },
    };
    await writeFile(r0.local, JSON.stringify(old, null, 2) + "\n");
    const r = await run(r0.root, ["statusline", "--install", "--json"], r0.deps, null);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(await readFile(r0.local, "utf8"));
    expect(parsed.statusLine.command).toBe("wikeeper statusline");
    expect(parsed.permissions).toEqual(old.permissions);
    expect(r.json.data.replaced).toBe(true);
    expect(r.json.data.installed).toBe(true);
  }, T);

  it("human output: the result line names the file and the command; the detail line says how to remove it", async () => {
    const r0 = await installRepo({ ignored: true });
    const r = await run(r0.root, ["statusline", "--install"], r0.deps, null);
    expect(r.code).toBe(0);
    const lines = r.stdout.split("\n");
    expect(lines[0]).toBe("added the wiki status line to .claude/settings.local.json: wikeeper statusline");
    expect(r.stdout).toContain('delete "statusLine" from .claude/settings.local.json');
  }, T);

  it("no git: the file is written and a warning says to keep it out of any commit", async () => {
    const root = await tmp();
    await makeWiki(root, { "a.md": pageText(5) });
    const userDir = await tmp("wikeeper-sl-user-");
    const runGit: GitRunner = async () => "missing";
    const r = await run(root, ["statusline", "--install"], {
      guardForm: () => "path",
      runGit,
      userSettingsFile: () => path.join(userDir, "settings.json"),
    }, null);
    expect(r.code).toBe(0);
    expect(JSON.parse(await readFile(path.join(root, ".claude", "settings.local.json"), "utf8")).statusLine).toEqual(STATUS_LINE);
    expect(r.stderr).toContain("could not check .claude/settings.local.json against git");
  }, T);
});

/* ---------- scenario: --install never replaces ---------- */

describe("Scenario: --install never replaces a status line the user already has", () => {
  const THEIRS = { statusLine: { type: "command", command: "~/.claude/statusline.sh" } };
  const rows = ["user", "project", "local"] as const;

  for (const which of rows) {
    it(`row ${which}: exits 1 with statusline_exists, changes nothing, prints the hint`, async () => {
      const r0 = await installRepo({ ignored: true });
      await mkdir(path.join(r0.root, ".claude"), { recursive: true });
      const target = which === "user" ? r0.userFile : which === "project" ? path.join(r0.root, ".claude", "settings.json") : r0.local;
      const text = JSON.stringify({ model: "x", ...THEIRS }, null, 2) + "\n";
      await writeFile(target, text);
      const home = os.homedir();
      const shown =
        which === "user"
          ? (target.startsWith(home) ? "~" + target.slice(home.length) : target).split(path.sep).join("/")
          : which === "project"
            ? ".claude/settings.json"
            : ".claude/settings.local.json";
      const before = await snapshot(r0.root);
      const userBefore = await snapshot(path.dirname(r0.userFile));

      const j = await run(r0.root, ["statusline", "--install", "--json"], r0.deps, null);
      expect(j.code).toBe(1);
      expect(j.json.ok).toBe(false);
      expect(j.json.error.code).toBe("statusline_exists");
      expect(j.json.error.details.files).toEqual([shown]);

      const h = await run(r0.root, ["statusline", "--install"], r0.deps, null);
      expect(h.code).toBe(1);
      expect(h.stderr).toContain(shown);
      expect(h.stderr).toContain("so nothing was changed");
      expect(h.stderr.split("\n")).toContain("  printf '%s' \"$input\" | wikeeper statusline");
      expect(h.stderr + h.stdout).not.toContain("statusline.sh");

      expect(await snapshot(r0.root)).toEqual(before);
      expect(await snapshot(path.dirname(r0.userFile))).toEqual(userBefore);
      if (which !== "local") expect(await exists(r0.local)).toBe(false);
    }, T);
  }
});

/* ---------- scenario: --install refuses what it cannot change safely ---------- */

describe("Scenario: Error — --install refuses what it cannot change safely", () => {
  it("a // comment in .claude/settings.local.json -> settings_invalid", async () => {
    const r0 = await installRepo({ ignored: true });
    await mkdir(path.dirname(r0.local), { recursive: true });
    await writeFile(r0.local, '{\n  // mine\n  "permissions": {}\n}\n');
    const before = await snapshot(r0.root);
    const r = await run(r0.root, ["statusline", "--install", "--json"], r0.deps, null);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("settings_invalid");
    expect(await snapshot(r0.root)).toEqual(before);
  }, T);

  it("a user settings file that is not valid JSON -> settings_invalid", async () => {
    const r0 = await installRepo({ ignored: true });
    await writeFile(r0.userFile, "{ not json");
    const before = await snapshot(r0.root);
    const userBefore = await snapshot(path.dirname(r0.userFile));
    const r = await run(r0.root, ["statusline", "--install", "--json"], r0.deps, null);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("settings_invalid");
    expect(await snapshot(r0.root)).toEqual(before);
    expect(await snapshot(path.dirname(r0.userFile))).toEqual(userBefore);
    expect(await exists(r0.local)).toBe(false);
  }, T);

  it("a committed .claude/settings.local.json -> settings_tracked", async () => {
    const r0 = await installRepo({ ignored: false });
    await mkdir(path.dirname(r0.local), { recursive: true });
    await writeFile(r0.local, JSON.stringify({ permissions: {} }, null, 2) + "\n");
    git(r0.root, r0.env, "add", "-f", ".claude/settings.local.json");
    const before = await snapshot(r0.root, false);
    const r = await run(r0.root, ["statusline", "--install", "--json"], r0.deps, null);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("settings_tracked");
    expect(r.json.error.message).toContain("so nothing was changed");
    expect(r.json.error.message).toContain(".claude/settings.local.json");
    expect(await snapshot(r0.root, false)).toEqual(before);
  }, T);

  it("a directory with no wiki -> not_initialised", async () => {
    const bare = await tmp("wikeeper-sl-bare-");
    const userDir = await tmp("wikeeper-sl-user-");
    const before = await snapshot(bare);
    const r = await run(bare, ["statusline", "--install", "--json"], {
      guardForm: () => "path",
      userSettingsFile: () => path.join(userDir, "settings.json"),
    }, null);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("not_initialised");
    expect(await snapshot(bare)).toEqual(before);
  }, T);
});
