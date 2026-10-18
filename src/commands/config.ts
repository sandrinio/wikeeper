// src/commands/config.ts — wikeeper config get / set / unset (STORY-007-02). A thin layer over the config SCHEMA.
import type { Command } from "commander";
import {
  checkConfigKey,
  configKeyIsSet,
  configLeafKeys,
  formatConfigIssue,
  getConfigLeaf,
  loadConfig,
  parseConfigValue,
  setConfigValue,
  tokenLimitIssues,
  unsetConfigValue,
} from "../core/config.js";
import type { WikeeperConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { assertInitialised, findRepoRoot, resolvePaths } from "../core/paths.js";
import type { CommandModule } from "../program.js";

export interface ConfigEntry {
  key: string;
  type: string;
  value: unknown;
  default: unknown;
  from_default: boolean;
  settable: boolean;
  allowed?: readonly string[];
}
export interface ConfigGetData {
  key: string | null;
  entries: ConfigEntry[];
}
export interface ConfigSetData {
  key: string;
  value: unknown;
  previous: unknown;
  changed: boolean;
}

function lookup(config: unknown, key: string): unknown {
  let cur: unknown = config;
  for (const seg of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function render(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

function isSettable(key: string): boolean {
  try {
    checkConfigKey(key, "set");
    return true;
  } catch {
    return false;
  }
}

function pairCheck(config: WikeeperConfig, key: string, value: unknown): void {
  const m = /^tokens\.([^.]+)\./.exec(key);
  if (m === null) return;
  const copy = structuredClone(config) as unknown as Record<string, unknown>;
  const segs = key.split(".");
  let cur = copy;
  for (const seg of segs.slice(0, -1)) cur = cur[seg] as Record<string, unknown>;
  cur[segs[segs.length - 1]!] = value;
  const issue = tokenLimitIssues((copy as unknown as WikeeperConfig).tokens).find((i) =>
    i.key.startsWith(`tokens.${m[1]}.`),
  );
  if (issue) {
    throw new WikeeperError(ExitCode.USAGE, "invalid_config_value", formatConfigIssue(issue), {
      key: issue.key,
      value: issue.value,
      message: issue.message,
    });
  }
}

async function load(command: Command) {
  const ctx = getOutputContext(command);
  const root = findRepoRoot(ctx.cwd);
  const loaded = await loadConfig(root);
  const paths = resolvePaths(root, loaded.config);
  await assertInitialised(paths);
  return { ctx, root, ...loaded };
}

export const configCommand: CommandModule = {
  register(program: Command): void {
    const config = program.command("config").description("show and change settings in .wiki/config.yml");

    config
      .command("get [key]")
      .description("print one setting, a group or every setting; (default) marks built-in defaults")
      .action(async (key: string | undefined, _opts: unknown, command: Command) => {
        const { ctx, root, config: cfg, warnings, errors } = await load(command);
        if (key !== undefined) checkConfigKey(key, "get");
        const keys = key === undefined ? configLeafKeys() : getConfigLeaf(key) ? [key] : configLeafKeys(key);
        const limitKeys = new Set(tokenLimitIssues(cfg.tokens).map((i) => i.key));
        const refused = new Set(errors.map((e) => e.key).filter((k) => !limitKeys.has(k)));
        const entries: ConfigEntry[] = [];
        for (const k of keys) {
          const leaf = getConfigLeaf(k)!;
          entries.push({
            key: k,
            type: leaf.type,
            value: lookup(cfg, k),
            default: leaf.default,
            from_default: !(await configKeyIsSet(root, k)) || refused.has(k),
            settable: isSettable(k),
            ...(leaf.allowed !== undefined ? { allowed: leaf.allowed } : {}),
          });
        }
        const lines =
          key !== undefined && getConfigLeaf(key)
            ? [`${render(entries[0]!.value)}${entries[0]!.from_default ? " (default)" : ""}`]
            : entries.map((e) => `${e.key}: ${render(e.value)}${e.from_default ? " (default)" : ""}`);
        const data: ConfigGetData = { key: key ?? null, entries };
        emitResult(ctx, {
          command: "config get",
          data,
          message: lines.join("\n"),
          warnings: [...errors, ...warnings].map(formatConfigIssue),
        });
      });

    config
      .command("set <key> <value>")
      .description("change one setting (list settings are edited in .wiki/config.yml)")
      .action(async (key: string, raw: string, _opts: unknown, command: Command) => {
        const { ctx, root, config: cfg } = await load(command);
        const value = parseConfigValue(key, raw);
        pairCheck(cfg, key, value);
        const previous = lookup(cfg, key);
        const changed = await setConfigValue(root, key, value);
        const data: ConfigSetData = { key, value, previous, changed };
        emitResult(ctx, {
          command: "config set",
          data,
          message: changed
            ? `set ${key} to ${render(value)} (was ${render(previous)})`
            : `${key} is already ${render(value)}`,
          warnings: changed && key === "enforce" ? [ENFORCE_WARNING] : [],
        });
      });

    config
      .command("unset <key>")
      .description("remove a setting from .wiki/config.yml so its default applies")
      .action(async (key: string, _opts: unknown, command: Command) => {
        const { ctx, root, config: cfg } = await load(command);
        checkConfigKey(key, "set");
        const def = getConfigLeaf(key)!.default;
        pairCheck(cfg, key, def);
        const previous = lookup(cfg, key);
        const changed = await unsetConfigValue(root, key);
        const data: ConfigSetData = { key, value: def, previous, changed };
        emitResult(ctx, {
          command: "config unset",
          data,
          message: changed
            ? `reset ${key} to the default ${render(def)} (was ${render(previous)})`
            : `${key} is not set; the default ${render(def)} applies`,
          warnings: changed && key === "enforce" ? [ENFORCE_WARNING] : [],
        });
      });
  },
};

const ENFORCE_WARNING = "enforce takes effect once its entries are rewritten: run wikeeper update";
