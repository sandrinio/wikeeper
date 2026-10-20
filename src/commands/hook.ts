import { existsSync } from "node:fs";
import type { Command } from "commander";
import { AGENT_NAMES, isAgentName } from "../agents/agent-names.js";
import { failOpen, GUARD_REASON, HOOK_ADAPTERS, MAX_PAYLOAD_BYTES, resolveTarget } from "../agents/hook-protocols.js";
import type { HookResponse } from "../agents/hook-protocols.js";
import { loadConfig } from "../core/config.js";
import type { IngestPermission } from "../core/config.js";
import { permitDecision } from "../agents/permit.js";
import { getOutputContext } from "../core/output.js";
import { findRepoRoot, isInside, resolvePaths } from "../core/paths.js";
import type { CommandModule } from "../program.js";

const AGENT_OPTION = AGENT_NAMES.join(" | ");
const PERMIT_REASONS = {
  allow: "Allowed by the wiki's permission mode `ingest.permission` in .wiki/config.yml.",
  ask: "The wiki's permission mode `ingest.permission` in .wiki/config.yml asks you before this command.",
} as const;

export interface GuardInput {
  agent: string | undefined;
  stdin: NodeJS.ReadableStream;
  isTTY: boolean;
  cwd: string;
}

/** Reads the stream as UTF-8 text; null when it exceeds `max` bytes. */
export async function readPayload(stream: NodeJS.ReadableStream, max: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buf: Buffer = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > max) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function runGuard(input: GuardInput): Promise<HookResponse> {
  try {
    const a = input.agent;
    if (a === undefined || !isAgentName(a)) return failOpen(undefined, `unknown --agent "${String(a)}"`);
    if (input.isTTY) return failOpen(a, "no payload on stdin");
    const text = await readPayload(input.stdin, MAX_PAYLOAD_BYTES);
    if (text === null) return failOpen(a, "payload larger than 1 MB");
    let payload: unknown;
    try {
      payload = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
      return failOpen(a, "payload is not valid JSON");
    }
    const adapter = HOOK_ADAPTERS[a];
    const t = adapter.targets(payload, input.cwd);
    if (t === null) return failOpen(a, "payload is missing expected fields");
    if (t.paths.length === 0) return adapter.allow();
    const root = findRepoRoot(t.cwd);
    const { config } = await loadConfig(root);
    const paths = resolvePaths(root, config);
    const hit = t.paths.some((p) => {
      const abs = resolveTarget(t.cwd, p);
      return isInside(paths.pagesDir, abs) || isInside(paths.archiveDir, abs);
    });
    if (!hit || existsSync(paths.lockFile)) return adapter.allow();
    return adapter.deny(GUARD_REASON);
  } catch (err) {
    return failOpen(isAgentName(input.agent ?? "") ? (input.agent as "claude") : undefined, err instanceof Error ? err.message : String(err));
  }
}

export interface PermitInput extends GuardInput {
  permission: string | undefined;
}

function isIngestPermission(v: string | undefined): v is IngestPermission {
  return v === "ai" || v === "ask" || v === "whitelist";
}

/** The permit hook's answer when it cannot decide: no decision on stdout for any agent, so the harness's own
 *  approval applies, and one warning line on stderr. */
function permitFallback(detail: string): HookResponse {
  return { stderr: `warning: wikeeper hook permit left the command to the agent's permission settings: ${detail.replace(/\s*[\r\n]+\s*/g, " ")}\n`, exitCode: 0 };
}

/** Applies wikeeper's permission rules to one shell command. Stays silent — leaving the harness's own
 *  prompt in place — for anything that is not a wikeeper command it has a rule for. */
export async function runPermit(input: PermitInput): Promise<HookResponse> {
  try {
    const a = input.agent;
    if (a === undefined) return permitFallback("no --agent given");
    if (!isAgentName(a)) return permitFallback(`unknown --agent "${a}"`);
    const adapter = HOOK_ADAPTERS[a];
    if (adapter.shellCommand === undefined || adapter.permit === undefined) {
      return permitFallback(`no permit hook for --agent "${a}"`);
    }
    if (input.isTTY) return permitFallback("no payload on stdin");
    const text = await readPayload(input.stdin, MAX_PAYLOAD_BYTES);
    if (text === null) return permitFallback("payload larger than 1 MB");
    let payload: unknown;
    try {
      payload = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
      return permitFallback("payload is not valid JSON");
    }
    const command = adapter.shellCommand(payload);
    if (command === null) return adapter.permit(null, "");
    const permission = isIngestPermission(input.permission)
      ? input.permission
      : (await loadConfig(findRepoRoot(input.cwd))).config.ingest.permission;
    const decision = permitDecision(command, permission);
    return adapter.permit(decision, decision === null ? "" : PERMIT_REASONS[decision]);
  } catch (err) {
    return permitFallback(err instanceof Error ? err.message : String(err));
  }
}

export const hookCommand: CommandModule = {
  register(program: Command): void {
    const hook = program.command("hook").description("agent hook entry points (used by agent settings)");
    hook
      .command("guard")
      .description("PreToolUse guard: block wiki page writes outside an ingest")
      .option("--agent [name]", AGENT_OPTION)
      .allowUnknownOption()
      .allowExcessArguments()
      .action(async (opts: { agent?: string | boolean }, cmd: Command) => {
        const ctx = getOutputContext(cmd);
        const res = await runGuard({
          agent: typeof opts.agent === "string" ? opts.agent : undefined,
          stdin: ctx.stdin,
          isTTY: ctx.isTTY,
          cwd: ctx.cwd,
        });
        if (res.stdout) ctx.stdout.write(res.stdout);
        if (res.stderr) ctx.stderr.write(res.stderr);
        if (res.exitCode !== 0) ctx.setExitCode(res.exitCode);
      });
    hook
      .command("permit")
      .description("PreToolUse permission rules: decide the wikeeper commands an agent runs")
      .option("--agent [name]", AGENT_OPTION)
      .option("--permission [mode]", "ai | ask | whitelist (defaults to the configured mode)")
      .allowUnknownOption()
      .allowExcessArguments()
      .action(async (opts: { agent?: string | boolean; permission?: string | boolean }, cmd: Command) => {
        const ctx = getOutputContext(cmd);
        const res = await runPermit({
          agent: typeof opts.agent === "string" ? opts.agent : undefined,
          permission: typeof opts.permission === "string" ? opts.permission : undefined,
          stdin: ctx.stdin,
          isTTY: ctx.isTTY,
          cwd: ctx.cwd,
        });
        if (res.stdout) ctx.stdout.write(res.stdout);
        if (res.stderr) ctx.stderr.write(res.stderr);
        if (res.exitCode !== 0) ctx.setExitCode(res.exitCode);
      });
  },
};
