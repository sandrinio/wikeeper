import { existsSync } from "node:fs";
import type { Command } from "commander";
import { isAgentName } from "../agents/agent-names.js";
import {
  failOpen,
  GUARD_REASON,
  HOOK_ADAPTERS,
  isInside,
  MAX_PAYLOAD_BYTES,
  resolveTarget,
} from "../agents/hook-protocols.js";
import type { HookResponse } from "../agents/hook-protocols.js";
import { loadConfig } from "../core/config.js";
import { getOutputContext } from "../core/output.js";
import { findRepoRoot, resolvePaths } from "../core/paths.js";
import type { CommandModule } from "../program.js";

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
      payload = JSON.parse(text.replace(/^﻿/, ""));
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
    const hit = t.paths.some((p) => isInside(paths.pagesDir, resolveTarget(t.cwd, p)));
    if (!hit || existsSync(paths.lockFile)) return adapter.allow();
    return adapter.deny(GUARD_REASON);
  } catch (err) {
    return failOpen(isAgentName(input.agent ?? "") ? (input.agent as "claude") : undefined, err instanceof Error ? err.message : String(err));
  }
}

export const hookCommand: CommandModule = {
  register(program: Command): void {
    const hook = program.command("hook").description("agent hook entry points (used by agent settings)");
    hook
      .command("guard")
      .description("PreToolUse guard: block wiki page writes outside an ingest")
      .option("--agent [name]", "claude | codex | antigravity")
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
  },
};
