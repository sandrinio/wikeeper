---
story_id: STORY-003-03
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-003 §2 (user hooks with {source_id} substitution and a timeout) · architecture.md §7.3 (pre-hook step 5, post-hook step 4), §11 hooks · SPRINT-02 decomposition brief contract 5 · verified src/core/config.ts
actor: Developer configuring wikeeper
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T18:45:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:24:00Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-003-03
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:48:31Z
  sessions: []
---

# STORY-003-03: User `pre_ingest` / `post_ingest` hooks
**Complexity:** L2 — one library module that runs configured shell commands with substitution, a timeout and captured output. Cross-platform process handling is the main risk.

## 1. The Spec (The Contract)

### 1.1 User Story
As a developer using wikeeper in a team repository, I want to run my own commands before and after each ingest (for example `git add .wiki && git commit -m 'wiki: {source_id}'`), so that the wiki fits my workflow without wikeeper knowing about it.

### 1.2 Detailed Requirements
- **R1 — Run in order.** `runUserHooks(phase, commands, options)` runs `commands` (from `config.hooks.pre_ingest` or `hooks.post_ingest`) one at a time, in config order, through the platform shell (`/bin/sh` on POSIX, `%ComSpec%` on Windows), with `cwd = options.cwd` (the repo root) and no stdin. It returns one result per configured command, in the same order. An empty list returns `[]` without spawning anything.
- **R2 — Substitution.** Every `{source_id}` in a command is replaced by `options.sourceId` before it runs, and the environment gains `WIKEEPER_SOURCE_ID` and `WIKEEPER_HOOK_PHASE`. If `sourceId` does not match the source-id pattern (`src-YYYY-MM-DD-<slug>`), `runUserHooks` throws before running anything. Because ids contain only `[a-z0-9-]`, the substituted text needs no quoting in either shell.
- **R3 — Stop at the first failure.** A command fails when it exits non-zero, cannot be spawned, or times out. After a failure, the remaining commands do not run and are reported with status `skipped`.
- **R4 — Timeout.** Each command gets `options.timeoutMs`, default `USER_HOOK_TIMEOUT_MS` = 60 000 ms. On timeout the whole process tree is killed (POSIX: the process group of a detached child; Windows: `taskkill /pid <pid> /T /F`) and the result has status `timed_out` and `exitCode: null`.
- **R5 — Captured output.** stdout and stderr are captured as UTF-8, each truncated to 64 KiB with a trailing `… [truncated]` marker; `durationMs` is recorded. Nothing is written to the CLI's own stdout or stderr — callers decide what to show.
- **R6 — Caller semantics are documented here, decided by the callers.** STORY-003-04: a failing `pre_ingest` hook fails `ingest start` and rolls the registration back. STORY-003-09: a failing `post_ingest` hook does not undo a validated ingest; it is reported as a warning. This module only reports.

### 1.3 Out of Scope
- Wiring hooks into `ingest start` (STORY-003-04) and `ingest finish` (STORY-003-09).
- A config key for the timeout, per-hook timeouts, or running hooks in parallel.
- Hooks other than `pre_ingest` and `post_ingest`.

### 1.4 Open Questions

- None. Decisions recorded with their rationale:
  - **Fixed 60 s default, no config key** — EPIC-003 asks for "a timeout", not a configurable one; adding a key would change EPIC-001's config schema and doctor checks for no current need. The option exists on the function so tests and a later config key can pass a value.
  - **Stop at the first failure** — a later hook usually depends on an earlier one (`git add` before `git commit`), and `pre_ingest` failure aborts the ingest anyway.
  - **Id validation instead of shell quoting** — `sh` and `cmd.exe` quote differently; restricting the substituted value to `[a-z0-9-]` makes plain substitution safe in both.

### 1.5 Risks

- **Risk:** Killing only the shell leaves its child running after a timeout, on POSIX and Windows.
- **Mitigation:** R4 kills the process tree; the timeout test checks that the child's marker file stops changing after the kill.
- **Risk:** Spawning `cmd.exe` without `shell: true` throws `EINVAL` on Node ≥ 20 (`#windows #test-harness` flashcard).
- **Mitigation:** Use `spawn(command, { shell: true, … })`, which picks `%ComSpec%` itself; tests use `node -e` commands so they run on every CI OS.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One successful path: commands run in order. |
| Interfaces | F | Library only; the CLI surfaces are STORY-003-04 and 003-09. |
| Data | T | Output larger than the cap is truncated; an empty command list spawns nothing. |
| Rules | T | Substitution, stop-at-first-failure, timeout and id validation. |

```gherkin
Feature: User ingest hooks

  @rules
  Scenario: Hooks run in order with the source id substituted
    Given an initialised repository
    And pre_ingest hooks that append "{source_id}" and then $WIKEEPER_HOOK_PHASE to hooks.log with node -e
    When runUserHooks runs phase "pre_ingest" for "src-2026-10-16-q4-status"
    Then hooks.log in the repo root reads "src-2026-10-16-q4-status" then "pre_ingest"
    And both results have status "ok" and exitCode 0

  @rules
  Scenario: The first failure skips the rest
    Given post_ingest hooks [an ok command, a command exiting 3, an ok command]
    When runUserHooks runs phase "post_ingest"
    Then the statuses are "ok", "failed" with exitCode 3, and "skipped"
    And the third command left no trace

  @rules
  Scenario: A hook that runs too long is killed
    Given a pre_ingest hook that writes a marker every 50 ms for 10 s
    When runUserHooks runs with timeoutMs 300
    Then it returns within 2 s with status "timed_out" and exitCode null
    And the marker file stops changing after the kill

  @data
  Scenario Outline: Output and empty lists
    Given <hooks>
    When runUserHooks runs phase "pre_ingest"
    Then <outcome>

    Examples:
      | hooks                                          | outcome                                                                |
      | no hooks                                       | it returns [] and spawns no process                                    |
      | a hook printing 100 KiB to stdout              | its stdout is 64 KiB followed by "… [truncated]" and the CLI printed nothing |

  @rules
  Scenario: Error — an id that is not a source id is refused
    Given a pre_ingest hook that writes a marker file
    When runUserHooks runs with sourceId "x; rm -rf ."
    Then it throws an error naming the invalid source id
    And no marker file exists
```

### 2.2 Verification Steps (Manual)
- [ ] On Windows (CI runner), confirm the timeout scenario's child process is gone after the kill (Task Manager / `tasklist`).

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/ingest/user-hooks.ts` |
| Test Files | `test/ingest/user-hooks.test.ts` |
| New Files Needed | Yes — both files above |

### 3.2 Technical Logic
- `spawn(substituted, { shell: true, cwd, env: { ...process.env, ...options.env, WIKEEPER_SOURCE_ID, WIKEEPER_HOOK_PHASE }, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32", windowsHide: true })`.
- Timeout: `setTimeout` → on POSIX `process.kill(-child.pid, "SIGKILL")`; on Windows `spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"])`. Resolve on the child's `close` event, or 1 s after the kill if `close` never comes.
- Spawn errors (`error` event) → status `failed`, `exitCode: null`, the error message in `stderr`.
- The source-id check uses the same regex as STORY-003-01's `SOURCE_ID_PATTERN`, declared locally (`/^src-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/`) so this story has no upstream; a later consolidation may import it.
- Truncation counts bytes, not characters, and cuts on a UTF-8 boundary.

### 3.3 API Contract (if applicable)

Frozen exports (consumers: STORY-003-04, 003-09):

```ts
// src/ingest/user-hooks.ts
export type UserHookPhase = "pre_ingest" | "post_ingest";
export type UserHookStatus = "ok" | "failed" | "timed_out" | "skipped";
export interface UserHookOptions {
  cwd: string;                 // repo root
  sourceId: string;            // must be a source id
  timeoutMs?: number;          // default USER_HOOK_TIMEOUT_MS
  env?: NodeJS.ProcessEnv;     // merged over process.env
}
export interface UserHookResult {
  phase: UserHookPhase;
  command: string;             // as configured, before substitution
  status: UserHookStatus;
  exitCode: number | null;     // null when skipped, timed out or not spawned
  stdout: string;              // ≤ 64 KiB + marker
  stderr: string;
  durationMs: number;          // 0 when skipped
}
export const USER_HOOK_TIMEOUT_MS = 60_000;
export const USER_HOOK_OUTPUT_LIMIT = 65_536;
export function substituteSourceId(command: string, sourceId: string): string;
export function hookFailed(result: UserHookResult): boolean; // status "failed" | "timed_out"
export function runUserHooks(
  phase: UserHookPhase,
  commands: readonly string[],
  options: UserHookOptions,
): Promise<UserHookResult[]>;
```

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 3 | `substituteSourceId` (several occurrences); `hookFailed`; truncation on a multi-byte boundary. |
| Integration tests | 0 | Real child processes in temp directories, covered by the acceptance tests. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once); must pass on Linux, macOS and Windows CI. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/config.ts:24` — `hooks: { pre_ingest: string[]; post_ingest: string[] }` with defaults at `src/core/config.ts:70`; the commands this module runs.
- **Surface:** `src/agents/enforce/guard-command.ts` — existing child-process/PATH handling from SPRINT-01, a reference for cross-platform spawning (not reused: it resolves a binary, it does not run shell commands).
- **Coverage of this requirement:** partial — the config keys exist; running them is net-new.

## Prior work

- [[EPIC-003]] (parent). The SPRINT-02 wiki duplicate check found no prior work on user hooks.

## Why not simpler?

- **Smallest existing surface that could carry this:** `child_process.execSync` inline in the two commands.
- **Why isn't extension / parameterization / config sufficient?** `execSync` blocks without a reliable tree kill on timeout, and duplicating substitution, timeout and output capture in `start` and `finish` would let the two drift. One module with one tested contract is the minimum; it stays small because it does not decide failure semantics.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/ingest/user-hooks.ts` is an EPIC-003 §4 planned path.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
