import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { fetchSource } from "../read/url.js";
import { loadConfig } from "./config.js";
import type { ConfigIssue, WikeeperConfig } from "./config.js";
import { WikeeperError } from "./exit-codes.js";
import { getOutputContext } from "./output.js";
import { findRepoRoot, resolvePaths } from "./paths.js";
import type { ResolvedPaths } from "./paths.js";
import { readPackageVersion } from "./templates.js";
import { compareVersions, npmVersion } from "./version.js";

// Contract C3 (K14, frozen). STORY-009-01 owns the bodies; names and types stay.
// This module never imports src/commands/doctor.ts (import cycle); compareVersions lives in ./version.js.
export const UPDATE_CHECK_TTL_MS = 86_400_000;
export const UPDATE_CHECK_TIMEOUT_MS = 1_500;
export const REGISTRY_VERSION_RE: RegExp = /^\d+\.\d+\.\d+$/;

export interface SavedCheck {
  checked_at: string;
  installed: string;
  latest: string | null;
}
export interface UpdateCheckDeps {
  fetch?: typeof fetch;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  installed?: string;
  timeoutMs?: number;
  configIssues?: readonly ConfigIssue[];
}
export type VersionMismatch =
  | { kind: "files-older"; files: string; installed: string; message: string }
  | { kind: "files-newer"; files: string; installed: string; message: string };

function installedVersion(): string {
  try {
    return npmVersion(readPackageVersion());
  } catch {
    return "";
  }
}

export function updateCheckOffReason(
  config: WikeeperConfig,
  env: NodeJS.ProcessEnv,
  issues?: readonly ConfigIssue[],
): string | null {
  if (config.update_check === false) return "update_check: false";
  const bad = issues?.find((i) => i.key === "update_check");
  if (bad !== undefined) return `update_check: ${JSON.stringify(bad.value) ?? "null"}`;
  const no = env.WIKEEPER_NO_UPDATE_CHECK;
  if (no !== undefined && no !== "" && !["0", "false"].includes(no.toLowerCase())) return "WIKEEPER_NO_UPDATE_CHECK";
  if (env.NO_UPDATE_NOTIFIER !== undefined) return "NO_UPDATE_NOTIFIER";
  const ci = env.CI;
  if (ci !== undefined && !["false", "0"].includes(ci.toLowerCase())) return "CI";
  return null;
}

export function updateCheckEnabled(
  config: WikeeperConfig,
  env: NodeJS.ProcessEnv,
  issues?: readonly ConfigIssue[],
): boolean {
  return updateCheckOffReason(config, env, issues) === null;
}

export function updateCheckFile(paths: ResolvedPaths): string {
  return path.join(paths.wikiDir, ".cache", "update-check.json");
}

export async function readSavedCheck(paths: ResolvedPaths): Promise<SavedCheck | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(updateCheckFile(paths), "utf8"));
    if (parsed === null || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.checked_at !== "string") return null;
    if (typeof o.installed !== "string" || !REGISTRY_VERSION_RE.test(o.installed)) return null;
    if (o.latest !== null && (typeof o.latest !== "string" || !REGISTRY_VERSION_RE.test(o.latest))) return null;
    return { checked_at: o.checked_at, installed: o.installed, latest: o.latest };
  } catch {
    return null;
  }
}

export async function writeSavedCheck(paths: ResolvedPaths, saved: SavedCheck): Promise<boolean> {
  const file = updateCheckFile(paths);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    const obj = { checked_at: saved.checked_at, installed: saved.installed, latest: saved.latest };
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(tmp, JSON.stringify(obj, null, 2) + "\n");
    await rename(tmp, file);
    return true;
  } catch {
    await rm(tmp, { force: true }).catch(() => undefined);
    return false;
  }
}

type Fetched = { latest: string | null; error: string | null };

/** Ignores the off switches: callers decide whether to ask. Never throws. */
export async function fetchLatestVersion(
  deps: Pick<UpdateCheckDeps, "fetch" | "env" | "timeoutMs"> = {},
): Promise<Fetched> {
  try {
    const env = deps.env ?? process.env;
    const reg = env.npm_config_registry;
    let raw = typeof reg === "string" && reg !== "" ? reg : "https://registry.npmjs.org/";
    if (!raw.endsWith("/")) raw += "/";
    let url: URL;
    try {
      const base = new URL(raw);
      if (base.protocol !== "http:" && base.protocol !== "https:") return { latest: null, error: "invalid_registry" };
      url = new URL("wikeeper/latest", base);
    } catch {
      return { latest: null, error: "invalid_registry" };
    }
    const timeoutMs = deps.timeoutMs ?? UPDATE_CHECK_TIMEOUT_MS;
    const parse = ({ bytes }: { bytes: Uint8Array }): Fetched => {
      try {
        const v = (JSON.parse(new TextDecoder().decode(bytes)) as { version?: unknown } | null)?.version;
        if (typeof v === "string" && REGISTRY_VERSION_RE.test(v)) return { latest: v, error: null };
      } catch {
        /* falls through */
      }
      return { latest: null, error: "invalid_answer" };
    };
    const mapError = (err: unknown): Fetched => {
      let error = "fetch_failed";
      if (err instanceof WikeeperError) {
        const d = (err.details ?? {}) as { cause?: unknown; status?: unknown };
        if (err.code === "fetch_failed") error = String(d.cause);
        else if (err.code === "http_error") error = `http ${String(d.status)}`;
        else if (err.code === "timeout") error = "timeout";
        else if (err.code === "too_large") error = "too_large";
      }
      return { latest: null, error };
    };
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<Fetched>((resolve) => {
      timer = setTimeout(() => resolve({ latest: null, error: "timeout" }), timeoutMs);
      timer.unref();
    });
    try {
      const request = fetchSource(url, { timeoutMs, maxBytes: 65_536, fetch: deps.fetch ?? globalThis.fetch }).then(
        parse,
        mapError,
      );
      return await Promise.race([request, timeout]);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { latest: null, error: "fetch_failed" };
  }
}

/** force: skip the saved result and the off switches (an explicit request); the answer is still saved. */
export async function checkForUpdate(
  paths: ResolvedPaths,
  config: WikeeperConfig,
  deps: UpdateCheckDeps & { force?: boolean } = {},
): Promise<SavedCheck | null> {
  try {
    const env = deps.env ?? process.env;
    if (deps.force !== true && !updateCheckEnabled(config, env, deps.configIssues)) return null;
    const installed = deps.installed ?? installedVersion();
    if (!REGISTRY_VERSION_RE.test(installed)) return null;
    const now = (deps.now ?? (() => new Date()))();
    if (deps.force !== true) {
      const saved = await readSavedCheck(paths);
      if (saved !== null && saved.installed === installed) {
        const t = Date.parse(saved.checked_at);
        const age = now.getTime() - t;
        if (!Number.isNaN(t) && age >= 0 && age < UPDATE_CHECK_TTL_MS) return saved;
      }
    }
    const { latest } = await fetchLatestVersion({ fetch: deps.fetch, env, timeoutMs: deps.timeoutMs });
    const result: SavedCheck = { checked_at: now.toISOString(), installed, latest };
    await writeSavedCheck(paths, result);
    return result;
  } catch {
    return null;
  }
}

export function newerVersion(saved: SavedCheck | null, installed: string): string | null {
  if (saved === null || saved.latest === null) return null;
  return (compareVersions(saved.latest, installed) ?? 0) > 0 ? saved.latest : null;
}

export function availableMessage(latest: string, installed: string): string {
  return `wikeeper ${latest} is available (installed ${installed}): run wikeeper upgrade`;
}

export function versionMismatch(installed: string, files: string | null): VersionMismatch | null {
  if (files === null) return null;
  const a = npmVersion(installed);
  const b = npmVersion(files);
  const c = compareVersions(a, b);
  if (c === null || c === 0) return null;
  if (c > 0) {
    return {
      kind: "files-older",
      files: b,
      installed: a,
      message: `this project's wikeeper files are from ${b} (installed ${a}): run wikeeper update`,
    };
  }
  return {
    kind: "files-newer",
    files: b,
    installed: a,
    message: `this project was updated by wikeeper ${b} (installed ${a}): run wikeeper upgrade`,
  };
}

const notices = new WeakMap<Command, string | null>();
function rootOf(command: Command): Command {
  let c = command;
  while (c.parent) c = c.parent;
  return c;
}

export function rememberUpdateNotice(command: Command, notice: string | null): void {
  notices.set(rootOf(command), notice);
}

export function updateNotice(command: Command): string | null {
  try {
    return notices.get(rootOf(command)) ?? null;
  } catch {
    return null;
  }
}

export async function runIngestUpdateCheck(command: Command, deps: UpdateCheckDeps = {}): Promise<void> {
  try {
    const ctx = getOutputContext(command);
    const root = findRepoRoot(ctx.cwd);
    await stat(path.join(root, ".wiki", "config.yml"));
    const { config, errors } = await loadConfig(root);
    const paths = resolvePaths(root, config);
    const saved = await checkForUpdate(paths, config, { ...deps, configIssues: errors });
    const installed = deps.installed ?? installedVersion();
    const latest = newerVersion(saved, installed);
    rememberUpdateNotice(command, latest === null ? null : availableMessage(latest, installed));
  } catch {
    /* the check never changes a command */
  }
}
