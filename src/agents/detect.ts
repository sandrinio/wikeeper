import type { AgentName } from "./agent-names.js";
import type { WikeeperConfig } from "../core/config.js";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { AGENT_NAMES, isAgentName } from "./agent-names.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";

export type AgentFile = "CLAUDE.md" | "AGENTS.md" | "GEMINI.md";
export const AGENT_FILES: readonly AgentFile[] = ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]; // canonical target order
export interface AgentFileReaders {
  readonly always: readonly AgentName[];
  readonly whenAbsent?: { readonly file: AgentFile; readonly agents: readonly AgentName[] }; // these agents read it only when `file` is absent
}
export const AGENT_FILE_READERS: Readonly<Record<AgentFile, AgentFileReaders>> = {
  "CLAUDE.md": { always: ["claude"] },
  "AGENTS.md": { always: ["codex", "antigravity"], whenAbsent: { file: "CLAUDE.md", agents: ["claude"] } },
  "GEMINI.md": { always: ["antigravity"] },
};
export const PRESELECT_BY_FILE: Readonly<Record<AgentFile, AgentName>> = {
  "CLAUDE.md": "claude",
  "AGENTS.md": "codex",
  "GEMINI.md": "antigravity",
};
export interface AgentTarget {
  path: AgentFile; // file name = posix path relative to root
  create: boolean;
}
export type AgentSource = "flag" | "config" | "prompt";
export interface AskAgentsRequest {
  choices: readonly AgentName[];
  preselected: readonly AgentName[];
  files: readonly AgentFile[];
}
export type AskAgents = (request: AskAgentsRequest) => Promise<AgentName[]>; // [] = no usable answer (EOF)
export interface ResolveAgentsOptions {
  flag?: string; // raw --agents value, e.g. "claude, codex"
  config: Pick<WikeeperConfig, "agents">;
  isTTY: boolean; // 002-04 passes options.interactive
  json: boolean;
  existing: readonly AgentFile[]; // from detectAgentFiles
  ask: AskAgents; // required; called only when interactive
}
export type ResolveAgentsResult =
  | { status: "resolved"; agents: AgentName[]; source: AgentSource }
  | { status: "needs_input"; choices: AgentName[]; files: AgentFile[]; message: string };

export async function detectAgentFiles(root: string): Promise<AgentFile[]> {
  // readdir (not existsSync): exact, case-sensitive names even on case-insensitive filesystems.
  const names = new Set(await readdir(root));
  const found: AgentFile[] = [];
  for (const file of AGENT_FILES) {
    if (!names.has(file)) continue;
    try {
      if ((await stat(path.join(root, file))).isFile()) found.push(file);
    } catch {
      // dangling symlink or race: not a usable file
    }
  }
  return found;
}

export function readersOf(file: AgentFile, existing: readonly AgentFile[]): AgentName[] {
  const entry = AGENT_FILE_READERS[file];
  const readers: AgentName[] = [...entry.always];
  if (entry.whenAbsent && !existing.includes(entry.whenAbsent.file)) readers.push(...entry.whenAbsent.agents);
  return readers;
}

export function resolveTargets(agents: readonly AgentName[], existing: readonly AgentFile[]): AgentTarget[] {
  const targets: AgentTarget[] = [];
  const covered = new Set<AgentName>();
  for (const file of AGENT_FILES) {
    if (!existing.includes(file)) continue;
    const readers = readersOf(file, existing).filter((a) => agents.includes(a));
    if (readers.length === 0) continue;
    readers.forEach((a) => covered.add(a));
    targets.push({ path: file, create: false });
  }
  if (agents.some((a) => !covered.has(a))) {
    targets.push({ path: "AGENTS.md", create: true });
    targets.sort((a, b) => AGENT_FILES.indexOf(a.path) - AGENT_FILES.indexOf(b.path));
  }
  return targets;
}

export function parseAgentList(raw: string | readonly string[], origin: "--agents" | "config agents"): AgentName[] {
  const items = (typeof raw === "string" ? raw.split(",") : [...raw]).map((s) => s.trim()).filter((s) => s !== "");
  const allowed = AGENT_NAMES.join(", ");
  if (items.length === 0) {
    throw new WikeeperError(ExitCode.USAGE, "usage", `no agents given in ${origin}; allowed: ${allowed}`, { allowed: [...AGENT_NAMES] });
  }
  const unknown = items.filter((s) => !isAgentName(s));
  if (unknown.length > 0) {
    const list = [...new Set(unknown)].map((u) => `"${u}"`).join(", ");
    throw new WikeeperError(ExitCode.USAGE, "usage", `unknown agent ${list} in ${origin}; allowed: ${allowed}`, {
      unknown: [...new Set(unknown)],
      allowed: [...AGENT_NAMES],
    });
  }
  return AGENT_NAMES.filter((n) => items.includes(n));
}

export async function resolveAgents(options: ResolveAgentsOptions): Promise<ResolveAgentsResult> {
  if (options.flag !== undefined) {
    return { status: "resolved", agents: parseAgentList(options.flag, "--agents"), source: "flag" };
  }
  if (options.config.agents.length > 0) {
    return { status: "resolved", agents: parseAgentList(options.config.agents, "config agents"), source: "config" };
  }
  if (options.isTTY && !options.json) {
    const pre = new Set(options.existing.map((f) => PRESELECT_BY_FILE[f]));
    const answer = await options.ask({
      choices: [...AGENT_NAMES],
      preselected: AGENT_NAMES.filter((n) => pre.has(n)),
      files: options.existing,
    });
    if (answer.length > 0) return { status: "resolved", agents: [...answer], source: "prompt" };
  }
  return {
    status: "needs_input",
    choices: [...AGENT_NAMES],
    files: [...options.existing],
    message: `no agents configured: re-run with --agents <list> (choices: ${AGENT_NAMES.join(", ")})`,
  };
}

export function needsInputError(result: Extract<ResolveAgentsResult, { status: "needs_input" }>): WikeeperError {
  return new WikeeperError(ExitCode.NEEDS_INPUT, "needs_input", result.message, {
    choices: result.choices,
    files: result.files,
  });
}
