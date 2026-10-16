// User pre_ingest / post_ingest hooks (STORY-003-03, contract C4). This module only reports; callers decide what a
// failure means (003-04 rolls back on pre_ingest, 003-09 warns on post_ingest).
import { spawn, spawnSync } from "node:child_process";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";

export type UserHookPhase = "pre_ingest" | "post_ingest";
export type UserHookStatus = "ok" | "failed" | "timed_out" | "skipped";
export interface UserHookOptions {
  cwd: string; // repo root
  sourceId: string; // must be a source id
  timeoutMs?: number; // default USER_HOOK_TIMEOUT_MS
  env?: NodeJS.ProcessEnv; // merged over process.env
}
export interface UserHookResult {
  phase: UserHookPhase;
  command: string; // as configured, before substitution
  status: UserHookStatus;
  exitCode: number | null; // null when skipped, timed out or not spawned
  stdout: string; // ≤ 64 KiB + marker
  stderr: string;
  durationMs: number; // 0 when skipped
}
export const USER_HOOK_TIMEOUT_MS = 60_000;
export const USER_HOOK_OUTPUT_LIMIT = 65_536;

const SOURCE_ID_PATTERN = /^src-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TRUNCATED_MARKER = "… [truncated]";
const KILL_GRACE_MS = 1000;

export function substituteSourceId(command: string, sourceId: string): string {
  return command.replaceAll("{source_id}", sourceId);
}

export function hookFailed(result: UserHookResult): boolean {
  return result.status === "failed" || result.status === "timed_out";
}

/** Bounded byte collector for one pipe: keeps reading past the cap so the child never blocks. */
class Capture {
  private chunks: Buffer[] = [];
  private size = 0;
  private dropped = false;

  push(chunk: Buffer): void {
    const room = USER_HOOK_OUTPUT_LIMIT - this.size;
    if (room <= 0) {
      if (chunk.length > 0) this.dropped = true;
      return;
    }
    if (chunk.length > room) {
      this.chunks.push(chunk.subarray(0, room));
      this.size += room;
      this.dropped = true;
    } else {
      this.chunks.push(chunk);
      this.size += chunk.length;
    }
  }

  text(): string {
    let buf = Buffer.concat(this.chunks);
    if (this.dropped) buf = buf.subarray(0, utf8Boundary(buf));
    const s = buf.toString("utf8");
    return this.dropped ? s + TRUNCATED_MARKER : s;
  }
}

/** Length of the longest prefix of `buf` that does not end inside a multi-byte sequence. */
function utf8Boundary(buf: Buffer): number {
  let i = buf.length;
  let back = 0;
  while (i > 0 && back < 3 && (buf[i - 1]! & 0xc0) === 0x80) {
    i--;
    back++;
  }
  if (i === 0) return buf.length;
  const lead = buf[i - 1]!;
  const need = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
  return back + 1 >= need ? buf.length : i - 1;
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // the group may already be gone
  }
}

function runOne(
  phase: UserHookPhase,
  command: string,
  options: UserHookOptions,
  timeoutMs: number,
): Promise<UserHookResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const out = new Capture();
    const err = new Capture();
    let errorMessage: string | null = null;
    let timedOut = false;
    let done = false;
    let timer: NodeJS.Timeout | undefined;
    let graceTimer: NodeJS.Timeout | undefined;

    const finish = (exitCode: number | null): void => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (graceTimer) clearTimeout(graceTimer);
      let stderr = err.text();
      if (errorMessage !== null) stderr = stderr ? `${stderr}\n${errorMessage}` : errorMessage;
      const status: UserHookStatus = timedOut
        ? "timed_out"
        : errorMessage === null && exitCode === 0
          ? "ok"
          : "failed";
      resolve({
        phase,
        command,
        status,
        exitCode: timedOut || errorMessage !== null ? null : exitCode,
        stdout: out.text(),
        stderr,
        durationMs: Date.now() - started,
      });
    };

    const child = spawn(substituteSourceId(command, options.sourceId), {
      shell: true,
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
        WIKEEPER_SOURCE_ID: options.sourceId,
        WIKEEPER_HOOK_PHASE: phase,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });

    child.stdout?.on("data", (c: Buffer) => out.push(c));
    child.stderr?.on("data", (c: Buffer) => err.push(c));
    child.on("error", (e) => {
      errorMessage = e.message;
      finish(null);
    });
    child.on("close", (code) => finish(code));

    timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
      graceTimer = setTimeout(() => finish(null), KILL_GRACE_MS);
    }, timeoutMs);
  });
}

export async function runUserHooks(
  phase: UserHookPhase,
  commands: readonly string[],
  options: UserHookOptions,
): Promise<UserHookResult[]> {
  if (!SOURCE_ID_PATTERN.test(options.sourceId)) {
    throw new WikeeperError(ExitCode.ERROR, "invalid_source_id", `invalid source id "${options.sourceId}"`);
  }
  const timeoutMs = options.timeoutMs ?? USER_HOOK_TIMEOUT_MS;
  const results: UserHookResult[] = [];
  let failed = false;
  for (const command of commands) {
    if (failed) {
      results.push({ phase, command, status: "skipped", exitCode: null, stdout: "", stderr: "", durationMs: 0 });
      continue;
    }
    const r = await runOne(phase, command, options, timeoutMs);
    results.push(r);
    if (hookFailed(r)) failed = true;
  }
  return results;
}
