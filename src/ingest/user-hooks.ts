// Contract C4 — contract/S-02-user-hooks (owner STORY-003-03). Frozen exports. Consumers: STORY-003-04 (pre_ingest),
// STORY-003-09 (post_ingest).

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C4)`);
}

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

export function substituteSourceId(command: string, sourceId: string): string {
  return stub("substituteSourceId");
}
export function hookFailed(result: UserHookResult): boolean {
  return stub("hookFailed");
}
export async function runUserHooks(
  phase: UserHookPhase,
  commands: readonly string[],
  options: UserHookOptions,
): Promise<UserHookResult[]> {
  return stub("runUserHooks");
}
