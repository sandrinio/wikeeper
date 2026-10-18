import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { resolveGuardForm } from "../agents/enforce/guard-command.js";
import type { GuardForm } from "../agents/enforce/guard-command.js";
import { loadJsonDoc, saveJsonDoc } from "../agents/enforce/json-merge.js";
import type { JsonDoc } from "../agents/enforce/json-merge.js";
import { DEFAULT_CONFIG, loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { createGit, execFileRunner } from "../core/git.js";
import type { GitRunner } from "../core/git.js";
import { emitResult, getOutputContext } from "../core/output.js";
import type { OutputContext } from "../core/output.js";
import { assertInitialised, findRepoRoot, resolvePaths } from "../core/paths.js";
import { readPackageVersion } from "../core/templates.js";
import { formatTokens, levelMark, levelOf, measureWiki } from "../core/tokens.js";
import type { TokenLevel } from "../core/tokens.js";
import { npmVersion } from "../core/version.js";
import type { CommandModule } from "../program.js";
import { plural } from "./doctor.js";
import { readPayload } from "./hook.js";

export interface StatuslineData {
  root: string | null; // null outside a wiki
  line: string | null; // what was printed; null outside a wiki
  wiki: number | null;
  page_count: number | null;
  largest: { path: string; tokens: number; level: TokenLevel } | null;
  error: string | null; // R5 code, else null
}
export interface InstallData {
  installed: boolean;
  replaced: boolean;
  file: ".claude/settings.local.json";
  command: string;
  form: GuardForm;
  excluded: boolean;
}
export interface StatuslineDeps {
  userSettingsFile?: () => string;
  guardForm?: (root: string) => GuardForm;
  runGit?: GitRunner;
  stdinTimeoutMs?: number;
}

const LOCAL_REL = ".claude/settings.local.json";
const PROJECT_REL = ".claude/settings.json";
const MAX_STDIN = 1 << 20;
export const OWN_LINE_RE = /(^|[\s"'/])wikeeper(@[^\s"']+)?["']?\s+statusline\s*$/;

const NPX_WARNING =
  "the status line runs npx on every redraw, which is slow: install wikeeper with npm i -g wikeeper or as a dev dependency, then rerun wikeeper statusline --install";
const NO_GIT_WARNING = `could not check ${LOCAL_REL} against git: keep it out of any commit, it is personal`;

const toPosix = (p: string): string => p.replace(/\\/g, "/");

/** Reads the stream for at most `ms`; null when it is too large, fails or does not end in time. */
export async function readBounded(stream: NodeJS.ReadableStream, max: number, ms: number): Promise<string | null> {
  // The catch is attached before racing: destroying the stream on timeout rejects the pending read.
  const read = readPayload(stream, max).catch(() => null);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });
  const won = await Promise.race([read, timeout]);
  if (won === "timeout") {
    (stream as { destroy?: () => void }).destroy?.();
    return null;
  }
  clearTimeout(timer);
  return won;
}

export function pickDir(text: string | null, cwd: string): string {
  if (text === null) return cwd;
  try {
    const v = JSON.parse(text.replace(/^﻿/, "")) as { workspace?: { current_dir?: unknown }; cwd?: unknown } | null;
    const cand = [v?.workspace?.current_dir, v?.cwd].find((x): x is string => typeof x === "string" && x !== "");
    return cand === undefined ? cwd : path.resolve(cwd, cand);
  } catch {
    return cwd;
  }
}

export async function collectStatusline(dir: string): Promise<StatuslineData> {
  const empty: StatuslineData = { root: null, line: null, wiki: null, page_count: null, largest: null, error: null };
  let root: string;
  try {
    root = findRepoRoot(dir);
  } catch {
    return empty;
  }
  try {
    const { config } = await loadConfig(root);
    const paths = resolvePaths(root, config);
    try {
      await stat(paths.configFile);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return empty;
      throw err;
    }
    const size = await measureWiki(paths);
    let line = `wiki ${formatTokens(size.total)} tokens · ${plural(size.page_count, "page")}`;
    const top = size.pages[0];
    let largest: StatuslineData["largest"] = null;
    if (top !== undefined) {
      const level = levelOf(top.tokens, config.tokens.page);
      line += ` · largest page ${formatTokens(top.tokens)} ${levelMark(level)}`;
      largest = { path: top.path, tokens: top.tokens, level };
    }
    return { root, line, wiki: size.total, page_count: size.page_count, largest, error: null };
  } catch (err) {
    const code = typeof (err as { code?: unknown } | null)?.code === "string" ? (err as { code: string }).code : "error";
    return { ...empty, root, line: `wiki size unavailable (${code}): run wikeeper doctor`, error: code };
  }
}

export function installCommand(form: GuardForm, root: string, version: string): string {
  switch (form) {
    case "path":
      return "wikeeper statusline";
    case "local":
      return `"${toPosix(path.join(root, "node_modules", ".bin", "wikeeper"))}" statusline`;
    case "npx":
      return `npx -y wikeeper@${npmVersion(version)} statusline`;
  }
}

export function shownUserFile(abs: string, home: string = os.homedir()): string {
  const rel = home !== "" && (abs === home || abs.startsWith(home + path.sep) || abs.startsWith(home + "/")) ? "~" + abs.slice(home.length) : abs;
  return toPosix(rel);
}

export function defaultUserSettingsFile(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.CLAUDE_CONFIG_DIR !== undefined && env.CLAUDE_CONFIG_DIR !== "" ? env.CLAUDE_CONFIG_DIR : path.join(os.homedir(), ".claude");
  return path.join(dir, "settings.json");
}

export async function appendExclude(file: string, entry: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const lead = existing !== "" && !existing.endsWith("\n") ? "\n" : "";
  await appendFile(file, `${lead}${entry}\n`);
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]!}`;
}

const sets = (doc: JsonDoc): boolean => doc.value.statusLine !== undefined && doc.value.statusLine !== null;

async function install(ctx: OutputContext, deps: StatuslineDeps): Promise<void> {
  const root = findRepoRoot(ctx.cwd);
  await assertInitialised(resolvePaths(root, DEFAULT_CONFIG));
  const form = deps.guardForm?.(root) ?? resolveGuardForm({ root });
  const cmd = installCommand(form, root, readPackageVersion());
  const warnings: string[] = form === "npx" ? [NPX_WARNING] : [];

  const userAbs = (deps.userSettingsFile ?? defaultUserSettingsFile)();
  const userShown = shownUserFile(userAbs);
  const local = await loadJsonDoc(path.join(root, ".claude", "settings.local.json"), LOCAL_REL);
  const project = await loadJsonDoc(path.join(root, ".claude", "settings.json"), PROJECT_REL);
  const user = await loadJsonDoc(userAbs, userShown);

  const value = local.value.statusLine as { type?: unknown; command?: unknown } | undefined;
  const own =
    sets(local) &&
    !sets(project) &&
    !sets(user) &&
    value !== null &&
    typeof value === "object" &&
    value.type === "command" &&
    typeof value.command === "string" &&
    OWN_LINE_RE.test(value.command);

  const data: InstallData = { installed: true, replaced: false, file: LOCAL_REL, command: cmd, form, excluded: false };
  if (own && value!.command === cmd) {
    data.installed = false;
    emitResult(ctx, { command: "statusline", data, message: `the wiki status line is already installed in ${LOCAL_REL}`, warnings });
    return;
  }
  if (!own) {
    const files: string[] = [];
    if (sets(local)) files.push(LOCAL_REL);
    if (sets(project)) files.push(PROJECT_REL);
    if (sets(user)) files.push(userShown);
    if (files.length > 0) {
      const message = [
        `a status line is already set in ${joinNames(files)}, so nothing was changed: make that command also print what wikeeper statusline prints for the same input (each printed line is its own row), for example in a shell script:`,
        "  input=$(cat)",
        '  … your current status line, reading "$input" …',
        `  printf '%s' "$input" | ${cmd}`,
      ].join("\n");
      throw new WikeeperError(ExitCode.ERROR, "statusline_exists", message, { files });
    }
  } else {
    data.replaced = true;
  }

  const run = deps.runGit ?? execFileRunner;
  const git = createGit(root, run);
  const inTree = await git.inWorkTree();
  if (inTree !== true) {
    warnings.push(NO_GIT_WARNING);
  } else {
    if (await git.isTracked(LOCAL_REL)) {
      throw new WikeeperError(
        ExitCode.ERROR,
        "settings_tracked",
        `${LOCAL_REL} is tracked by git, so nothing was changed: run git rm --cached ${LOCAL_REL}, then rerun wikeeper statusline --install`,
        { file: LOCAL_REL },
      );
    }
    const rule = await git.ignoreRule(LOCAL_REL);
    data.excluded = rule === null || rule.negated;
  }

  await mkdir(path.join(root, ".claude"), { recursive: true });
  await saveJsonDoc(local, { ...local.value, statusLine: { type: "command", command: cmd } }, { backup: false });

  if (data.excluded) {
    const r = await run(["rev-parse", "--git-path", "info/exclude"], root);
    if (r !== "missing" && r.code === 0 && r.stdout.trim() !== "") {
      await appendExclude(path.resolve(root, r.stdout.trim()), `/${LOCAL_REL}`);
    } else {
      data.excluded = false;
    }
  }

  const message = [
    `${data.replaced ? "updated" : "added"} the wiki status line ${data.replaced ? "in" : "to"} ${LOCAL_REL}: ${cmd}`,
    ...(data.excluded ? [`  added /${LOCAL_REL} to .git/info/exclude, so git ignores it`] : []),
    `  it shows from Claude Code's next status line update; to remove it, delete "statusLine" from ${LOCAL_REL}`,
  ];
  emitResult(ctx, { command: "statusline", data, message, warnings });
}

export function createStatuslineCommand(deps: StatuslineDeps = {}): CommandModule {
  return {
    register(program: Command): void {
      program
        .command("statusline")
        .description("print the wiki's size for Claude Code's status line; --install adds it to your personal settings")
        .option("--install", "add the status line to .claude/settings.local.json (never replaces an existing one)")
        .action(async (opts: { install?: boolean }, cmd: Command) => {
          const ctx = getOutputContext(cmd);
          if (opts.install === true) return install(ctx, deps);
          let dir = ctx.cwd;
          if (!ctx.isTTY) dir = pickDir(await readBounded(ctx.stdin, MAX_STDIN, deps.stdinTimeoutMs ?? 200), ctx.cwd);
          const data = await collectStatusline(dir);
          emitResult(ctx, { command: "statusline", data, message: data.line ?? undefined });
        });
    },
  };
}

export const statuslineCommand: CommandModule = createStatuslineCommand();
