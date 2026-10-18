import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { readManifest } from "../core/manifest.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { findRepoRoot, resolvePaths } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { findPackageRoot, readPackageVersion } from "../core/templates.js";
import { fetchLatestVersion, versionMismatch, writeSavedCheck } from "../core/update-check.js";
import { compareVersions, npmVersion } from "../core/version.js";
import type { CommandModule } from "../program.js";
import { runUpdate } from "./update.js";
import type { UpdateDeps } from "./update.js";

// Contract K16 (frozen once STORY-009-02 merges). Every module is imported statically on purpose: after the npm
// step the files on disk belong to the new version, so nothing may be loaded lazily.

export type InstallKind = "global" | "local" | "npx" | "unknown";
export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
/** Rejects with an error whose code is "ENOENT" when the program cannot start (R5). */
export type CommandRunner = (
  cmd: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<RunResult>;
export interface UpgradeResult {
  installed: string;
  latest: string | null;
  upgraded: boolean;
  install: InstallKind;
  commands_run: string[];
  updated: boolean;
}
export interface UpgradeCheckResult {
  installed: string;
  latest: string | null;
  newer: boolean;
  install: InstallKind;
  command: string | null;
}
export interface UpgradeDeps {
  fetch?: typeof fetch;
  run?: CommandRunner;
  packageDir?: string;
  installed?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  execPath?: string;
  now?: () => Date;
  update?: UpdateDeps;
}

type Manager = "npm" | "pnpm" | "yarn" | "bun";
const MAX_OUTPUT = 1_000_000;

// ---- install detection (R3) -------------------------------------------------------------------------------------

function segmentsOf(p: string): string[] {
  return p.split(/[\\/]+/).filter(Boolean);
}
function norm(p: string, platform: NodeJS.Platform): string {
  const r = path.resolve(p);
  return platform === "win32" ? r.toLowerCase() : r;
}
function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}
function isRealDir(p: string): boolean {
  try {
    const s = lstatSync(p);
    return s.isDirectory() && !s.isSymbolicLink();
  } catch {
    return false;
  }
}
function isLink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
function endsInPackage(segs: string[], platform: NodeJS.Platform): boolean {
  const n = segs.length;
  if (n < 2) return false;
  const a = platform === "win32" ? segs.map((s) => s.toLowerCase()) : segs;
  return a[n - 1] === "wikeeper" && a[n - 2] === "node_modules";
}

/** Rules 1-3 of R3; null when they did not decide. */
function detectEarly(
  packageDir: string,
  o: { root: string | null; platform: NodeJS.Platform },
): InstallKind | null {
  const pkg = real(packageDir);
  const segs = segmentsOf(pkg);
  if (segs.includes("_npx")) return "npx";
  if (!endsInPackage(segs, o.platform) || segs.some((s) => s === ".pnpm" || s === ".bun" || s === ".yarn")) {
    return "unknown";
  }
  if (o.root) {
    const candidate = path.join(o.root, "node_modules", "wikeeper");
    const hit = real(candidate) === pkg || norm(real(candidate), o.platform) === norm(pkg, o.platform);
    if (hit && existsSync(candidate)) {
      if (isLink(candidate)) return "unknown";
      if (isRealDir(candidate)) {
        const locks = ["pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"].some((f) =>
          existsSync(path.join(o.root as string, f)),
        );
        if (locks && !existsSync(path.join(o.root, "package-lock.json"))) return "unknown";
        return "local";
      }
    }
  }
  return null;
}

export function detectInstall(
  packageDir: string,
  o: { root: string | null; env: NodeJS.ProcessEnv; platform: NodeJS.Platform; globalRoot?: string },
): InstallKind {
  const early = detectEarly(packageDir, o);
  if (early) return early;
  const pkg = real(packageDir);
  if (o.globalRoot) {
    const candidate = path.join(o.globalRoot, "wikeeper");
    if (isRealDir(candidate) && norm(real(candidate), o.platform) === norm(pkg, o.platform)) return "global";
    return "unknown";
  }
  const segs = segmentsOf(pkg).map((s) => (o.platform === "win32" ? s.toLowerCase() : s));
  const n = segs.length;
  if (o.platform === "win32") {
    if (segs[n - 3] === "npm" && segs[n - 2] === "node_modules") return "global";
  } else if (segs[n - 3] === "lib" && segs[n - 2] === "node_modules") {
    return "global";
  }
  return "unknown";
}

// ---- hand commands (R8) -----------------------------------------------------------------------------------------

export function handCommand(
  kind: InstallKind,
  o: {
    manager: Manager | null;
    scope: "global" | "project";
    dir: string;
    latest: string;
    flag?: string;
  },
): string {
  const spec = `wikeeper@${o.latest}`;
  if (kind === "npx") return `npx -y ${spec} update`;
  const project = o.scope === "project";
  const prod = o.flag === "--save-prod";
  switch (o.manager) {
    case "pnpm":
      return project ? `pnpm add${prod ? "" : " -D"} ${spec}` : `pnpm add -g ${spec}`;
    case "yarn":
      return project ? `yarn add${prod ? "" : " --dev"} ${spec}` : `yarn global add ${spec}`;
    case "bun":
      return project ? `bun add${prod ? "" : " -d"} ${spec}` : `bun add -g ${spec}`;
    default:
      return project ? `npm install ${o.flag ?? "--save-dev"} ${spec}` : `npm install -g ${spec}`;
  }
}

// ---- running npm (R5) -------------------------------------------------------------------------------------------

const SHELL_ARG = /^(install|-g|--save-dev|--save-prod|--save-optional|root|-y|update|--json|wikeeper@\d+\.\d+\.\d+)$/;

export function npmSpawn(
  cmd: string,
  args: readonly string[],
  o: { env: NodeJS.ProcessEnv; platform: NodeJS.Platform; execPath: string },
): { file: string; args: string[]; shell: boolean } {
  if (cmd !== "npm" && cmd !== "npx") return { file: cmd, args: [...args], shell: false };
  const execpath = o.env.npm_execpath;
  const p = o.platform === "win32" ? path.win32 : path.posix;
  if (execpath && /npm-cli\.js$/.test(execpath)) {
    const script = cmd === "npm" ? execpath : p.join(p.dirname(execpath), "npx-cli.js");
    return { file: o.execPath, args: [script, ...args], shell: false };
  }
  if (o.platform === "win32") {
    for (const a of args) {
      if (!SHELL_ARG.test(a)) throw new Error(`refusing to pass ${a} to a shell`);
    }
    return { file: `${cmd}.cmd`, args: [...args], shell: true };
  }
  return { file: cmd, args: [...args], shell: false };
}

export function isStartFailure(
  platform: NodeJS.Platform,
  r: { code: number | null; stderr: string; errCode?: string },
): boolean {
  if (r.errCode === "ENOENT") return true;
  return platform === "win32" && (r.code === 9009 || /is not recognized/.test(r.stderr));
}

export const execRunner: CommandRunner = (cmd, args, opts) =>
  new Promise<RunResult>((resolve, reject) => {
    const platform = process.platform;
    const enoent = (msg: string): Error => Object.assign(new Error(msg), { code: "ENOENT" });
    let spec: { file: string; args: string[]; shell: boolean };
    try {
      spec = npmSpawn(cmd, args, { env: opts.env, platform, execPath: process.execPath });
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = "";
    let stderr = "";
    const child = spawn(spec.file, spec.args, { cwd: opts.cwd, env: opts.env, shell: spec.shell, windowsHide: true });
    child.stdout?.on("data", (c: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += c.toString("utf8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += c.toString("utf8");
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (isStartFailure(platform, { code: null, stderr: "", errCode: err.code })) reject(enoent(err.message));
      else reject(err);
    });
    child.on("close", (code) => {
      if (isStartFailure(platform, { code, stderr })) {
        reject(enoent(`${cmd} could not be started`));
        return;
      }
      resolve({ code: code ?? 1, stdout: stdout.slice(0, MAX_OUTPUT), stderr: stderr.slice(0, MAX_OUTPUT) });
    });
  });

// ---- small helpers ----------------------------------------------------------------------------------------------

/** The last 10 non-empty lines of stderr, else of stdout. */
export function outputTail(stderr: string, stdout: string): string[] {
  const lines = (s: string) => s.split(/\r?\n/).filter((l) => l.trim() !== "");
  const e = lines(stderr);
  return (e.length > 0 ? e : lines(stdout)).slice(-10);
}

/** bin.wikeeper, or bin when it is a string, or dist/cli.js. */
export function binOf(packageJsonText: string): string {
  try {
    const bin = (JSON.parse(packageJsonText) as { bin?: unknown }).bin;
    if (typeof bin === "string" && bin) return bin;
    if (bin && typeof bin === "object") {
      const w = (bin as Record<string, unknown>).wikeeper;
      if (typeof w === "string" && w) return w;
    }
  } catch {
    // fall through to the default
  }
  return "dist/cli.js";
}

function readFlag(root: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as Record<string, unknown>;
    const has = (k: string) => Boolean(pkg[k] && typeof pkg[k] === "object" && "wikeeper" in (pkg[k] as object));
    if (has("devDependencies")) return "--save-dev";
    if (has("dependencies")) return "--save-prod";
    if (has("optionalDependencies")) return "--save-optional";
  } catch {
    // no readable package.json
  }
  return null;
}

function managerOf(packageDir: string, root: string): Manager | null {
  const segs = segmentsOf(real(packageDir));
  if (segs.some((s) => s === ".pnpm" || s === "pnpm")) return "pnpm";
  if (segs.includes(".bun")) return "bun";
  if (segs.some((s) => s === ".yarn" || s === "yarn")) return "yarn";
  const under = isUnder(root, real(packageDir));
  if (under) {
    if (existsSync(path.join(root, "yarn.lock"))) return "yarn";
    if (existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(path.join(root, "bun.lock")) || existsSync(path.join(root, "bun.lockb"))) return "bun";
  }
  return null;
}
function isUnder(root: string, child: string): boolean {
  const rel = path.relative(real(root), child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function fail(code: string, first: string, tail: string[], details: unknown): WikeeperError {
  const message = [first, ...tail.map((l) => `  ${l}`)].join("\n");
  return new WikeeperError(ExitCode.ERROR, code, message, details);
}

function handNext(command: string | null, then: string | null, admin = false): string {
  const thenPart = then ? `, then run ${then} in this project` : "";
  if (command === null) return `update that folder yourself${thenPart}`;
  return `to upgrade by hand, run ${command}${admin ? " in a terminal run as administrator" : ""}${thenPart}`;
}

function lastJson(stdout: string): { ok?: boolean; data?: { warnings?: unknown }; warnings?: unknown } | null {
  const line = stdout.trim().split("\n").filter(Boolean).pop();
  if (!line) return null;
  try {
    const parsed: unknown = JSON.parse(line);
    return parsed && typeof parsed === "object" ? (parsed as never) : null;
  } catch {
    return null;
  }
}

// ---- the command ------------------------------------------------------------------------------------------------

interface Plan {
  kind: InstallKind;
  globalRoot?: string;
  flag: string | null;
  unsupported: { command: string | null; reason: string } | null;
  npmCommand: string | null; // shown form of the npm step
  updateShown: string | null;
  packageFolder: string; // the folder holding the new package.json after the npm step
}

export function createUpgradeCommand(deps: UpgradeDeps = {}): CommandModule {
  return {
    register(program: Command): void {
      program
        .command("upgrade")
        .description("install the newest wikeeper the way it was installed, then update this project's files")
        .option("--check", "show what upgrade would run; installs nothing")
        .action(async (opts: { check?: boolean }, command: Command) => {
          const ctx = getOutputContext(command);
          const env = deps.env ?? process.env;
          const platform = deps.platform ?? process.platform;
          const execPath = deps.execPath ?? process.execPath;
          const run: CommandRunner = deps.run ?? execRunner;
          const root = findRepoRoot(ctx.cwd);
          const inWiki = existsSync(path.join(root, ".wiki", "config.yml"));
          const cwd = inWiki ? root : ctx.cwd;
          const installed = npmVersion(deps.installed ?? readPackageVersion());

          const { latest, error } = await fetchLatestVersion({
            ...(deps.fetch ? { fetch: deps.fetch } : {}),
            ...(deps.env ? { env: deps.env } : {}),
          });
          if (latest === null) {
            throw fail(
              "registry_unreachable",
              `could not reach the npm registry (${error ?? "unknown error"}); nothing was changed: try again later`,
              [],
              { cause: error, command: null, then: null },
            );
          }

          let paths: ResolvedPaths | null = null;
          let files: string | null = null;
          if (inWiki) {
            let contentDir = ".";
            try {
              contentDir = (await loadConfig(root)).config.content_dir;
            } catch {
              // an unreadable config does not stop an upgrade
            }
            paths = resolvePaths(root, { content_dir: contentDir });
            await writeSavedCheck(paths, {
              checked_at: (deps.now ?? (() => new Date()))().toISOString(),
              installed,
              latest,
            });
            try {
              const manifest = await readManifest(paths.manifestFile);
              files = manifest ? npmVersion(manifest.package_version) : null;
            } catch {
              files = null;
            }
          }
          const mismatch = inWiki ? versionMismatch(installed, files) : null;
          const filesOlder = mismatch?.kind === "files-older";
          const warnings: string[] = mismatch?.kind === "files-newer" ? [mismatch.message] : [];
          const newer = (compareVersions(latest, installed) ?? 0) > 0;
          const packageDir = deps.packageDir ?? findPackageRoot();
          const thenPlain = inWiki ? "wikeeper update" : null;

          // ---- R7: nothing newer ----
          if (!newer) {
            const install = detectInstall(packageDir, { root, env, platform });
            let message: string;
            if (opts.check) {
              message = compareVersions(latest, installed) === 0
                ? `wikeeper ${installed} is the latest version`
                : `no newer version on npm (latest ${latest}, installed ${installed})`;
              const data: UpgradeCheckResult = {
                installed, latest, newer: false, install, command: filesOlder ? "wikeeper update" : null,
              };
              emitResult(ctx, { command: "upgrade", data, message, warnings });
              return;
            }
            const equal = compareVersions(latest, installed) === 0;
            const base = equal
              ? `wikeeper ${installed} is the latest version`
              : `no newer version on npm (latest ${latest}, installed ${installed})`;
            let updated = false;
            let commandsRun: string[] = [];
            message = base;
            if (filesOlder && paths) {
              const result = await runUpdate(
                root,
                {
                  flags: {},
                  json: true,
                  interactive: false,
                  io: { stdout: ctx.stdout, stderr: ctx.stderr, stdin: ctx.stdin, cwd: ctx.cwd },
                },
                deps.update ?? {},
              );
              warnings.push(...result.warnings);
              updated = true;
              commandsRun = ["wikeeper update"];
              message = `${base}; updated this project's files from ${files}`;
            }
            const data: UpgradeResult = { installed, latest, upgraded: false, install, commands_run: commandsRun, updated };
            emitResult(ctx, { command: "upgrade", data, message, warnings });
            return;
          }

          // ---- detect (R3), npm root -g only when rules 1-3 did not decide ----
          let kind: InstallKind;
          let globalRoot: string | undefined;
          const early = detectEarly(packageDir, { root, platform });
          if (early) {
            kind = early;
          } else {
            try {
              const r = await run("npm", ["root", "-g"], { cwd, env });
              const out = r.code === 0 ? r.stdout.trim() : "";
              if (out) globalRoot = out;
            } catch {
              globalRoot = undefined;
            }
            kind = detectInstall(packageDir, { root, env, platform, ...(globalRoot ? { globalRoot } : {}) });
          }

          // ---- plan ----
          const v = latest;
          const flag = kind === "local" || kind === "unknown" ? readFlag(root) : null;
          const plan: Plan = {
            kind, ...(globalRoot ? { globalRoot } : {}), flag, unsupported: null,
            npmCommand: null, updateShown: null, packageFolder: packageDir,
          };
          let thenForFail = thenPlain;
          if (kind === "global") {
            plan.npmCommand = `npm install -g wikeeper@${v}`;
            plan.updateShown = "wikeeper update";
            plan.packageFolder = globalRoot ? path.join(globalRoot, "wikeeper") : packageDir;
          } else if (kind === "local") {
            thenForFail = inWiki ? "node_modules/.bin/wikeeper update" : null;
            if (flag) {
              plan.npmCommand = `npm install ${flag} wikeeper@${v}`;
              plan.updateShown = "node_modules/.bin/wikeeper update";
              plan.packageFolder = path.join(root, "node_modules", "wikeeper");
            } else {
              plan.unsupported = {
                command: `npm install --save-dev wikeeper@${v}`,
                reason: "a project install that package.json does not list",
              };
            }
          } else if (kind === "npx") {
            plan.updateShown = `npx -y wikeeper@${v} update`;
          } else {
            const manager = managerOf(packageDir, root);
            const scope = isUnder(root, real(packageDir)) ? "project" : "global";
            if (manager && scope === "project") thenForFail = inWiki ? "node_modules/.bin/wikeeper update" : null;
            plan.unsupported = manager
              ? {
                  command: handCommand("unknown", { manager, scope, dir: packageDir, latest: v, ...(flag ? { flag } : {}) }),
                  reason: `a folder installed by ${manager}`,
                }
              : { command: null, reason: "a source checkout or a linked folder" };
          }

          // ---- --check (R9) ----
          if (opts.check) {
            const first = plan.unsupported ? plan.unsupported.command : (plan.npmCommand ?? (inWiki ? plan.updateShown : null));
            const data: UpgradeCheckResult = { installed, latest, newer: true, install: kind, command: first };
            const steps = plan.unsupported || !first ? first : [first, ...(plan.npmCommand && plan.updateShown && inWiki ? [plan.updateShown] : [])].join(", then ");
            const message = first
              ? `wikeeper ${v} is available (installed ${installed}); wikeeper upgrade would run: ${steps}`
              : `wikeeper ${v} is available (installed ${installed}); no command to run here`;
            emitResult(ctx, { command: "upgrade", data, message, warnings });
            return;
          }

          if (plan.unsupported) {
            const { command: hand, reason } = plan.unsupported;
            throw fail(
              "upgrade_unsupported",
              `wikeeper runs from ${packageDir}, ${reason}, which wikeeper upgrade does not handle; nothing was run: ${handNext(hand, thenForFail)}`,
              [],
              { command: hand, then: thenForFail, install: kind, reason },
            );
          }

          if (kind === "npx" && !inWiki) {
            const data: UpgradeResult = { installed, latest, upgraded: false, install: kind, commands_run: [], updated: false };
            emitResult(ctx, {
              command: "upgrade",
              data,
              message: `nothing to upgrade here: npx runs the version you name, so run npx -y wikeeper@${v}; there is no wiki project here to update`,
              warnings,
            });
            return;
          }

          const commandsRun: string[] = [];
          let upgraded = false;

          // ---- R6 npm step ----
          if (plan.npmCommand) {
            const global = kind === "global";
            const npmArgs = global
              ? ["install", "-g", `wikeeper@${v}`]
              : ["install", flag as string, `wikeeper@${v}`];
            let r: RunResult;
            try {
              r = await run("npm", npmArgs, { cwd, env });
            } catch (err) {
              if ((err as { code?: unknown }).code === "ENOENT") {
                throw fail(
                  "npm_missing",
                  `npm was not found; nothing was changed: ${handNext(plan.npmCommand, thenForFail)}`,
                  [],
                  { command: plan.npmCommand, then: thenForFail, install: kind },
                );
              }
              throw err;
            }
            if (r.code !== 0) {
              const tail = outputTail(r.stderr, r.stdout);
              const denied = global && /\bE(ACCES|PERM)\b/.test(`${r.stderr}\n${r.stdout}`);
              const win = platform === "win32";
              const hand = denied && !win ? `sudo ${plan.npmCommand}` : plan.npmCommand;
              throw fail(
                "npm_failed",
                `npm install failed (exit ${r.code}); nothing was changed: ${handNext(hand, thenForFail, denied && win)}`,
                tail,
                { command: hand, then: thenForFail, install: kind, exit_code: r.code, output: tail },
              );
            }
            commandsRun.push(plan.npmCommand);
            upgraded = true;
          }

          let updated = false;
          if (inWiki && plan.updateShown) {
            let r: RunResult;
            if (kind === "npx") {
              r = await run("npx", ["-y", `wikeeper@${v}`, "update", "--json"], { cwd, env });
            } else {
              let bin = "dist/cli.js";
              try {
                bin = binOf(readFileSync(path.join(plan.packageFolder, "package.json"), "utf8"));
              } catch {
                // the default bin
              }
              r = await run(execPath, [path.join(plan.packageFolder, bin), "update", "--json"], { cwd, env });
            }
            commandsRun.push(plan.updateShown);
            const env2 = lastJson(r.stdout);
            if (r.code !== 0 || env2?.ok !== true) {
              const tail = outputTail(r.stderr, r.stdout);
              throw fail(
                "update_failed",
                `wikeeper ${v} is installed, but its update failed: run ${plan.updateShown} in this project`,
                tail,
                { upgraded, install: kind, commands_run: commandsRun, command: plan.updateShown, then: null },
              );
            }
            updated = true;
            const w = env2.data?.warnings ?? env2.warnings;
            if (Array.isArray(w)) warnings.push(...w.filter((x): x is string => typeof x === "string"));
            if (paths) {
              await writeSavedCheck(paths, {
                checked_at: (deps.now ?? (() => new Date()))().toISOString(),
                installed: v,
                latest: v,
              });
            }
          }

          const data: UpgradeResult = { installed, latest, upgraded, install: kind, commands_run: commandsRun, updated };
          const tailFiles = updated ? " and updated this project's files" : "";
          const lines: string[] = [];
          if (kind === "global") {
            lines.push(`upgraded wikeeper ${installed} → ${v} with npm install -g${tailFiles}`);
            if (updated) lines.push("other projects that use this wikeeper: run wikeeper update in each (wikeeper status there says so)");
          } else if (kind === "local") {
            const section = flag === "--save-prod" ? "dependencies" : flag === "--save-optional" ? "optionalDependencies" : "devDependencies";
            lines.push(`upgraded wikeeper ${installed} → ${v} in this project's ${section}${tailFiles}`);
          } else {
            lines.push(`updated this project's files with wikeeper ${v} through npx`);
          }
          emitResult(ctx, { command: "upgrade", data, message: lines, warnings });
        });
    },
  };
}

export const upgradeCommand: CommandModule = createUpgradeCommand();
