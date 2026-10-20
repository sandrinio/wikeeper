import path from "node:path";
import type { AgentName } from "./agent-names.js";

export { isInside } from "../core/paths.js";

export const MAX_PAYLOAD_BYTES = 1_048_576;
export const GUARD_REASON =
  "Wiki pages can only change during an ingest's write phase. Run `wikeeper ingest apply <id>` first — see .wiki/system/WIKI.md, section \"Write phase\".";

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
  /** The shell command a payload is asking to run, for harnesses whose permission rules are a hook
   *  rather than a settings file. Undefined on harnesses that keep their rules in a file. */
  shellCommand?(payload: unknown): string | null;
  /** Answers a permission request. `null` leaves the decision to the harness. */
  permit?(decision: "allow" | "ask" | null, reason: string): HookResponse;
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

/** Copilot (VS Code and Copilot CLI) via the PascalCase `PreToolUse` event, which both surfaces accept.
 *  Its payload is Claude-shaped (snake_case, Claude tool names), but a file write arrives as an
 *  apply_patch string in `tool_input` rather than an object, so paths come from the patch body. */
const copilot: HookAdapter = {
  agent: "copilot",
  tools: ["Edit", "Write", "NotebookEdit"],
  targets(payload, fallbackCwd) {
    if (!isObj(payload) || typeof payload.tool_name !== "string") return null;
    const cwd = typeof payload.cwd === "string" ? payload.cwd : fallbackCwd;
    if (!this.tools.includes(payload.tool_name)) return { cwd, paths: [] };
    const input = payload.tool_input;
    if (typeof input === "string") return { cwd, paths: parsePatchPaths(input) };
    if (!isObj(input)) return null;
    // Object form: the editor tools of a surface that passes arguments rather than a patch.
    for (const key of ["file_path", "path", "notebook_path"]) {
      const p = input[key];
      if (typeof p === "string" && p.length > 0) return { cwd, paths: [p] };
    }
    for (const key of ["patch", "input", "command"]) {
      const p = input[key];
      if (typeof p === "string" && p.length > 0) return { cwd, paths: parsePatchPaths(p) };
    }
    return null;
  },
  allow: () => ({ exitCode: 0 }),
  shellCommand(payload) {
    if (!isObj(payload)) return null;
    const name = typeof payload.tool_name === "string" ? payload.tool_name : payload.toolName;
    if (typeof name !== "string" || name.toLowerCase() !== "bash") return null;
    const input = isObj(payload.tool_input) ? payload.tool_input : isObj(payload.toolArgs) ? payload.toolArgs : null;
    const cmd = input?.command;
    return typeof cmd === "string" && cmd.length > 0 ? cmd : null;
  },
  permit(decision, reason) {
    if (decision === null) return { exitCode: 0 };
    return {
      stdout:
        JSON.stringify({
          permissionDecision: decision,
          permissionDecisionReason: reason,
          hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason },
        }) + "\n",
      exitCode: 0,
    };
  },
  // VS Code reads hookSpecificOutput; Copilot CLI reads the top-level pair. One object serves both.
  // The exit code stays 0: a non-zero exit from a Copilot PreToolUse hook denies the call outright.
  deny: (reason) => ({
    stdout:
      JSON.stringify({
        permissionDecision: "deny",
        permissionDecisionReason: reason,
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
      }) + "\n",
    exitCode: 0,
  }),
};

export const HOOK_ADAPTERS: Readonly<Record<AgentName, HookAdapter>> = { claude, codex, antigravity, copilot };

export function failOpen(agent: AgentName | undefined, detail: string): HookResponse {
  const res: HookResponse = {
    stderr: `warning: wikeeper hook guard allowed the write: ${detail.replace(/\s*[\r\n]+\s*/g, " ")}\n`,
    exitCode: 0,
  };
  if (agent === "antigravity") res.stdout = '{"decision":"allow"}\n';
  return res;
}
