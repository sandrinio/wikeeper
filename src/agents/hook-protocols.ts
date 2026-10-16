import path from "node:path";
import type { AgentName } from "./agent-names.js";

export { isInside } from "../core/paths.js";

export const MAX_PAYLOAD_BYTES = 1_048_576;
export const GUARD_REASON =
  "Wiki pages can only change during an ingest. Run `wikeeper ingest apply <id>` first — see .wiki/system/WIKI.md.";

export interface HookResponse {
  stdout?: string;
  stderr?: string;
  exitCode: 0 | 2;
}
export interface GuardTargets {
  cwd: string;
  paths: string[];
}
export interface HookAdapter {
  readonly agent: AgentName;
  readonly tools: readonly string[];
  targets(payload: unknown, fallbackCwd: string): GuardTargets | null;
  allow(): HookResponse;
  deny(reason: string): HookResponse;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function parsePatchPaths(patch: string): string[] {
  const out: string[] = [];
  for (const line of patch.split(/\r?\n/)) {
    const m = /^\s*\*\*\* (?:Add File|Update File|Delete File|Move to): (.*)$/.exec(line);
    if (!m) continue;
    const p = m[1]!.trim();
    if (p.length > 0 && !out.includes(p)) out.push(p);
  }
  return out;
}

export function resolveTarget(cwd: string, p: string): string {
  return path.resolve(cwd, p.replace(/\\/g, "/"));
}

const claude: HookAdapter = {
  agent: "claude",
  tools: ["Edit", "Write", "MultiEdit", "NotebookEdit"],
  targets(payload, fallbackCwd) {
    if (!isObj(payload) || typeof payload.tool_name !== "string" || !isObj(payload.tool_input)) return null;
    const cwd = typeof payload.cwd === "string" ? payload.cwd : fallbackCwd;
    if (!this.tools.includes(payload.tool_name)) return { cwd, paths: [] };
    const p = payload.tool_name === "NotebookEdit" ? payload.tool_input.notebook_path : payload.tool_input.file_path;
    if (typeof p !== "string" || p.length === 0) return null;
    return { cwd, paths: [p] };
  },
  allow: () => ({ exitCode: 0 }),
  deny: (reason) => ({
    stdout:
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
      }) + "\n",
    exitCode: 0,
  }),
};

const codex: HookAdapter = {
  agent: "codex",
  tools: ["apply_patch"],
  targets(payload, fallbackCwd) {
    if (!isObj(payload) || typeof payload.tool_name !== "string" || !isObj(payload.tool_input)) return null;
    const cwd = typeof payload.cwd === "string" ? payload.cwd : fallbackCwd;
    if (!this.tools.includes(payload.tool_name)) return { cwd, paths: [] };
    const command = payload.tool_input.command;
    if (typeof command !== "string") return null;
    return { cwd, paths: parsePatchPaths(command) };
  },
  allow: () => ({ exitCode: 0 }),
  deny: (reason) => ({ stderr: reason + "\n", exitCode: 2 }),
};

const antigravity: HookAdapter = {
  agent: "antigravity",
  tools: ["write_to_file", "replace_file_content", "multi_replace_file_content"],
  targets(payload, fallbackCwd) {
    if (!isObj(payload) || !isObj(payload.toolCall)) return null;
    const { name, args } = payload.toolCall;
    if (typeof name !== "string" || !isObj(args)) return null;
    const ws = Array.isArray(payload.workspacePaths) ? payload.workspacePaths[0] : undefined;
    const cwd = typeof ws === "string" ? ws : fallbackCwd;
    if (!this.tools.includes(name)) return { cwd, paths: [] };
    if (typeof args.TargetFile !== "string" || args.TargetFile.length === 0) return null;
    return { cwd, paths: [args.TargetFile] };
  },
  allow: () => ({ stdout: '{"decision":"allow"}\n', exitCode: 0 }),
  deny: (reason) => ({ stdout: JSON.stringify({ decision: "deny", reason }) + "\n", exitCode: 0 }),
};

export const HOOK_ADAPTERS: Readonly<Record<AgentName, HookAdapter>> = { claude, codex, antigravity };

export function failOpen(agent: AgentName | undefined, detail: string): HookResponse {
  const res: HookResponse = {
    stderr: `warning: wikeeper hook guard allowed the write: ${detail.replace(/\s*[\r\n]+\s*/g, " ")}\n`,
    exitCode: 0,
  };
  if (agent === "antigravity") res.stdout = '{"decision":"allow"}\n';
  return res;
}
