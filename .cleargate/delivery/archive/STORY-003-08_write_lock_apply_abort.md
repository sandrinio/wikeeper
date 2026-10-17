---
story_id: STORY-003-08
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
ambiguity: 🟢 Low
context_source: EPIC-003 (approved 2026-10-16) · architecture.md §7.3 (write phase, lock covers write only), §7.4 (brief template), D-17 · SPRINT-02 decomposition brief contracts 3, 6, 7, 8 · verified src/core/paths.ts, src/commands/hook.ts, src/core/gitignore.ts
actor: AI coding agent (writer)
complexity_label: L3
parallel_eligible: y
dep_predecessors:
  - STORY-003-01
  - STORY-003-04
  - STORY-003-06
  - STORY-003-07
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-17T07:30:08Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 2
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T07:30:41Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 894e484ef6920c892ccfab46396cb7ae4e18e00bad1de4a19bfc466c5743a240
stamp_error: no ledger rows for work_item_id STORY-003-08
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:50:35Z
  sessions: []
---

# STORY-003-08: Write lock, snapshot, `ingest apply`, `ingest abort`
**Complexity:** L3 — the write-phase safety core: an exclusive lock that the existing guard keys on, a snapshot that both `abort` and `finish` depend on, and two subcommands.

## 1. The Spec (The Contract)

### 1.1 User Story
As the agent that writes pages for an ingest, I want to open a write phase that only one ingest can hold at a time and that I can roll back completely, so that page changes can be attributed to exactly one source and a failed or abandoned write never leaves the wiki half-edited.

### 1.2 Detailed Requirements
- **R1 — Lock.** The lock is `paths.lockFile` (`.wiki/.lock`), created exclusively (`wx`), holding JSON `{ source_id, pid, hostname, acquired_at }`. The existing guard (`src/commands/hook.ts:59`) allows page writes exactly while this file exists, so its path and existence semantics do not change. `readLock` reports `{ held, lock, stale, age_ms }`; a lock file that is not valid JSON counts as held, unreadable and stale.
- **R2 — Stale rule.** A lock is stale when it is older than `STALE_LOCK_MS` (2 hours) or unreadable. `pid` and `hostname` are recorded for diagnostics only: the process that wrote them is the short-lived `wikeeper ingest apply`, which exits as soon as it prints, so its liveness says nothing about whether a writer agent is still working.
- **R3 — Snapshot.** Taken at `apply`, under `.wiki/.snapshots/<id>/` (already gitignored, `src/core/gitignore.ts:77`): a copy of `pages/` in `pages/`, and `snapshot.json` = `{ source_id, taken_at, facts_sha256, pages, outside }`. `pages` maps every file under `pages/` (path relative to `pages/`, POSIX) to its sha256. `outside` maps to sha256 the files of the content directory that a writer must not touch: `index.md`, every file under `log/`, and every file under `raw/` except `*.facts.json`. STORY-003-09 compares against it: modified or deleted entries are violations, new files are allowed (other sources' `start`, `facts` and search misses may add files during this write phase).
- **R4 — `wikeeper ingest apply <id> [--force-unlock] [--json]`.** Preconditions: the source is registered (else exit 1 `unknown_source`), facts are stored (else exit 1 `no_facts`, naming `wikeeper ingest facts <id>`), and the ingest is not finished (no `ingest` log event names it, else exit 1 `ingest_finished`). Then it takes the lock, then the snapshot (recording the facts file hash); if the snapshot fails the lock is released and the error returned. It prints the brief's `ingest` line — `ingest:    <id>   facts: raw/<id>.facts.json`, the part of architecture.md §7.4's brief the CLI knows — and the facts. `user said`, `resolved` and `focus` are not printed: the main agent writes the whole brief into the writer's task (STORY-006-04 R8; walkthrough row 8.2, CR review-feedback 2026-10-17). Output data: `{ source_id, already_applied, lock, snapshot: { dir, pages }, facts_file, facts, brief }`.
- **R5 — Re-apply is idempotent.** `apply <id>` while the lock already names `<id>` takes no new snapshot and changes nothing; it re-prints the `ingest` line and the facts with `already_applied: true`.
- **R6 — Held lock.** `apply <id>` while the lock names another ingest exits 1, code `locked`, naming the holder, its age, whether it is stale, and the two ways out: `wikeeper ingest abort <holder>` (restores its pages) or, only when stale, `--force-unlock`. With `--force-unlock` and a stale lock, `apply` removes the lock, keeps the old ingest's snapshot directory, warns that the old ingest's page changes were not restored and where its snapshot is, and proceeds. With `--force-unlock` and a fresh lock it exits 1, code `lock_not_stale`, and changes nothing.
- **R7 — `wikeeper ingest abort <id> [--drop] [--json]`.** When the lock names `<id>`: restore `pages/` from the snapshot (changed files rewritten, deleted files recreated, files created since apply removed, directories left empty by that removal removed), remove the snapshot, release the lock. When `<id>` is registered but not applied there is nothing to restore. `--drop` also deletes the registered source with `removeSource(paths, id)` (STORY-003-01: original, meta, facts and text files). Either way an `abort` log event `{ source_id, dropped, restored }` is written (`restored` = page paths reverted). Output data: `{ source_id, restored, removed, dropped, dropped_files, log_file }` (`dropped_files` = what `removeSource` returned, `[]` without `--drop`).
- **R8 — Abort refusals.** Unknown id (no meta and no lock naming it) → exit 1 `unknown_source`. A finished ingest → exit 1 `ingest_finished` (its pages and raw files are provenance). `--drop` while another ingest holds the lock → exit 1 `locked` (dropping raw files mid-write would look like a write outside `pages/` to that ingest's `finish`). If the lock names `<id>` but the snapshot is missing or unreadable, abort releases the lock, restores nothing, and warns "snapshot missing; pages were not restored".

### 1.3 Out of Scope
- `ingest finish`, the page diff and validation (STORY-003-09).
- Any per-ingest state file — the phase stays derived (contract 3).
- Lock reporting in `doctor`/`status` (EPIC-005 `status`).
- Locking the extraction phase (architecture.md §7.3: extraction runs in parallel).

### 1.4 Open Questions

- None. Human-accepted at SPRINT-02 planning (2026-10-16), with rationale in R2/R6: staleness is age-based (2 h) because the recorded pid belongs to a process that has already exited; `--force-unlock` belongs to `apply` and only breaks stale locks, while `abort` is the restoring way out.

### 1.5 Risks

- **Risk:** EPIC-003 §2 says "stale-lock detection (owner pid and age)"; this story records the pid but does not use its liveness (R2).
- **Mitigation:** The rationale is stated in R2 and surfaced in the Brief for the human to accept; using liveness would mark every lock stale the moment `apply` returns and invite agents to force-unlock live write phases.
- **Risk:** Snapshot copies are slow on a large wiki.
- **Mitigation:** Only `pages/` is copied; everything else is hashed. Management wikis hold hundreds of small markdown pages.
- **Risk:** Restoring on Windows fails on files held open by an editor.
- **Mitigation:** Restore reports the files it could not write as an error and keeps the lock and snapshot so `abort` can be retried.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Opening a write phase and rolling one back are the two successful paths. |
| Interfaces | T | The lock is observed through two surfaces: the `ingest` CLI and the `hook guard` PreToolUse hook. |
| Data | T | Lock age and snapshot presence change the outcome. |
| Rules | T | One write phase at a time; force only when stale; refusals of R4/R8. |

```gherkin
Feature: Write lock, snapshot, ingest apply and ingest abort

  @paths @interfaces
  Scenario: apply opens the write phase and the guard follows the lock
    Given a registered source "src-2026-10-16-q4-status" with stored facts and pages "projects/atlas.md" and "team.md"
    When I run "wikeeper ingest apply src-2026-10-16-q4-status --json"
    Then the exit code is 0 and .wiki/.lock names "src-2026-10-16-q4-status"
    And .wiki/.snapshots/src-2026-10-16-q4-status/snapshot.json lists both pages and the facts file hash
    And the data holds the facts and a brief that is the one line "ingest:    src-2026-10-16-q4-status   facts: raw/src-2026-10-16-q4-status.facts.json"
    And "wikeeper hook guard --agent claude" allows a Write to .wiki/pages/team.md
    And running the same apply again reports already_applied true and leaves the snapshot unchanged

  @rules @data
  Scenario Outline: A held lock blocks apply unless it is stale and forced
    Given .wiki/.lock is <lock>
    And "src-2026-10-16-b" is registered with stored facts
    When I run "wikeeper ingest apply src-2026-10-16-b <flag> --json"
    Then the exit code is <exit> and the result is "<result>"
    And .wiki/.lock names "<holder>"

    Examples:
      | lock                                      | flag           | exit | result                                                       | holder           |
      | held by "src-2026-10-16-a" for 5 minutes  |                | 1    | error locked, naming src-2026-10-16-a and its age            | src-2026-10-16-a |
      | held by "src-2026-10-16-a" for 5 minutes  | --force-unlock | 1    | error lock_not_stale                                         | src-2026-10-16-a |
      | held by "src-2026-10-16-a" for 3 hours    | --force-unlock | 0    | applied, warning names .wiki/.snapshots/src-2026-10-16-a     | src-2026-10-16-b |
      | not valid JSON                            | --force-unlock | 0    | applied                                                      | src-2026-10-16-b |

  @rules
  Scenario Outline: Error — apply and abort refuse unsafe requests
    Given <state>
    When I run "<command> --json"
    Then the exit code is 1 with error code "<code>"
    And .wiki/.lock, pages/ and raw/ are unchanged

    Examples:
      | state                                                          | command                                         | code            |
      | nothing names "src-2026-10-16-ghost"                           | wikeeper ingest apply src-2026-10-16-ghost      | unknown_source  |
      | "src-2026-10-16-a" is registered without facts                 | wikeeper ingest apply src-2026-10-16-a          | no_facts        |
      | an ingest log event names "src-2026-10-16-a"                   | wikeeper ingest apply src-2026-10-16-a          | ingest_finished |
      | an ingest log event names "src-2026-10-16-a"                   | wikeeper ingest abort src-2026-10-16-a --drop   | ingest_finished |
      | "src-2026-10-16-a" holds the lock and "src-2026-10-16-b" is registered | wikeeper ingest abort src-2026-10-16-b --drop | locked     |
      | nothing names "src-2026-10-16-ghost"                           | wikeeper ingest abort src-2026-10-16-ghost      | unknown_source  |

  @paths @data
  Scenario Outline: abort rolls the write phase back
    Given "src-2026-10-16-q4-status" is applied with pages "team.md" and "risks.md"
    And since apply team.md was edited, risks.md deleted and "projects/new/atlas.md" created
    And the snapshot is <snapshot>
    When I run "wikeeper ingest abort src-2026-10-16-q4-status --json"
    Then the exit code is 0
    And pages/ <pages_after>
    And .wiki/.lock is gone and "wikeeper hook guard --agent claude" denies a Write to .wiki/pages/team.md
    And an abort log event names the source with dropped false

    Examples:
      | snapshot | pages_after                                                                                   |
      | present  | is byte-identical to before apply, and pages/projects/new/ no longer exists                   |
      | missing  | is unchanged and a warning says "snapshot missing; pages were not restored"                   |

  @rules
  Scenario: abort --drop removes the registered source
    Given "src-2026-10-16-notes" is registered with an original, meta and facts file and is not applied
    When I run "wikeeper ingest abort src-2026-10-16-notes --drop --json"
    Then the exit code is 0
    And no file matching raw/src-2026-10-16-notes.* exists
    And an abort log event names the source with dropped true
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo with `--enforce`, apply an ingest, let Claude Code edit a page (allowed), abort, and ask it to edit again (denied by the guard).
- [ ] On Windows, apply, open a page in an editor, abort, and read the error for a file that could not be restored.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/ingest/lock.ts` |
| Related Files | `src/ingest/snapshot.ts`, `src/commands/ingest-apply.ts`, `src/commands/ingest-abort.ts`, `src/commands/ingest.ts`, `test/ingest/lock.test.ts`, `test/ingest/snapshot.test.ts`, `test/ingest/ingest-apply-abort.test.ts`, `test/ingest/apply-brief.red.node.test.ts` (QA-Red, R4; 2026-10-17) |
| New Files Needed | Yes — `src/ingest/lock.ts`, `src/ingest/snapshot.ts`, `src/commands/ingest-apply.ts`, `src/commands/ingest-abort.ts`, `test/ingest/lock.test.ts`, `test/ingest/snapshot.test.ts`, `test/ingest/ingest-apply-abort.test.ts` |

### 3.2 Technical Logic
- **Exclusive create.** `open(lockFile, "wx")`; on `EEXIST` read the holder and decide per R5/R6. `--force-unlock` on a stale lock: `unlink` then retry the exclusive create once (a concurrent apply that wins the race makes this one fail with `locked`).
- **Time.** All functions take an optional `now: Date` so tests can age a lock without sleeping; the CLI passes `new Date()`.
- **Hashing.** `hashTree(dir, exclude?)` walks with `readdir({ withFileTypes: true })`, skips symlinks, returns `Record<posixRel, sha256>` with keys sorted; `sha256File` from `src/core/manifest.ts:50`. `hashOutside(paths)` = `index.md` + `log/**` + `raw/**` minus `*.facts.json`, keys relative to `paths.contentDir`.
- **Copy and restore.** `fs.cp(pagesDir, <snap>/pages, { recursive: true })`; restore compares current hashes with `snapshot.pages`, rewrites changed files and recreates deleted ones from the copy, removes files absent from the snapshot, then removes directories that became empty (deepest first, never `pages/` itself).
- **Brief.** One line, columns aligned as in architecture.md §7.4: `ingest:    <id>   facts: raw/<id>.facts.json` (`buildBrief(id)`, `data.brief`). Human output prints it, a blank line, then one line per fact: `- <entity> <field> = <value> (<status>, <as_of>) → <page>`. (The three `<…>` lines were dropped, CR review-feedback 2026-10-17.)
- **Phase derivation** (contract 3): registered = `readMeta` non-null; extracted = `readFacts` non-null; applied = lock names id; finished = `readLogEvents(paths, { type: "ingest", sourceId })` non-empty.
- **Registration.** `src/commands/ingest-apply.ts` and `src/commands/ingest-abort.ts` export `ingestApplyCommand` and `ingestAbortCommand` (`IngestSubcommand`); append both to `ingestSubcommands` in `src/commands/ingest.ts` (STORY-003-04 §3.3).
- **`content_dir`.** The lock and snapshots stay under `.wiki/` (`paths.wikiDir`) even when `content_dir` moves `pages/`; build the snapshot path as `path.join(paths.wikiDir, ".snapshots", id)`, matching `src/core/gitignore.ts:77`.

### 3.3 API Contract (if applicable)

Frozen exports (consumers: STORY-003-09 `finish`, EPIC-005 `status`):

```ts
// src/ingest/lock.ts
import type { ResolvedPaths } from "../core/paths.js";
export const STALE_LOCK_MS: number;                 // 7_200_000
export interface LockInfo { source_id: string; pid: number; hostname: string; acquired_at: string }
export interface LockState { held: boolean; lock: LockInfo | null; stale: boolean; age_ms: number | null }
export function readLock(paths: ResolvedPaths, now?: Date): Promise<LockState>;
export function acquireLock(
  paths: ResolvedPaths, sourceId: string, opts?: { now?: Date; forceStale?: boolean },
): Promise<{ lock: LockInfo; already_held: boolean; replaced: LockInfo | null }>;   // throws WikeeperError "locked" | "lock_not_stale"
export function releaseLock(paths: ResolvedPaths, sourceId: string): Promise<boolean>; // false when the lock names another id

// src/ingest/snapshot.ts
export interface SnapshotInfo {
  source_id: string; taken_at: string; facts_sha256: string;
  pages: Record<string, string>;      // relative to pages/
  outside: Record<string, string>;    // relative to the content directory
}
export function snapshotDir(paths: ResolvedPaths, sourceId: string): string;
export function hashTree(dir: string, exclude?: (rel: string) => boolean): Promise<Record<string, string>>;
export function hashOutside(paths: ResolvedPaths): Promise<Record<string, string>>;
export function takeSnapshot(paths: ResolvedPaths, sourceId: string, factsSha256: string, now?: Date): Promise<SnapshotInfo>;
export function readSnapshot(paths: ResolvedPaths, sourceId: string): Promise<SnapshotInfo | null>;
export function restoreSnapshot(paths: ResolvedPaths, sourceId: string): Promise<{ restored: string[]; removed: string[] }>;
export function removeSnapshot(paths: ResolvedPaths, sourceId: string): Promise<void>;
```

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper ingest apply <id>` | CLI | None | `--force-unlock`, `--json` | `{ source_id, already_applied, lock, snapshot: { dir, pages }, facts_file, facts, brief }` |
| `wikeeper ingest abort <id>` | CLI | None | `--drop`, `--json` | `{ source_id, restored, removed, dropped, dropped_files, log_file }` |

```ts
// src/commands/ingest-apply.ts, src/commands/ingest-abort.ts
import type { IngestSubcommand } from "./ingest.js";
export const ingestApplyCommand: IngestSubcommand;
export const ingestAbortCommand: IngestSubcommand;
```

Consumed (frozen in their stories' §3.3): `readMeta`, `removeSource` (STORY-003-01); `IngestSubcommand`, `ingestSubcommands` (STORY-003-04); `readFacts`, `factsFilePath` and the sha256 returned by `writeFacts` (STORY-003-06); `writeLogEvent`, `readLogEvents`, `AbortLogEvent` (STORY-003-07).

## Task Breakdown

- [x] Implement `lock.ts`: exclusive create, read (including unreadable), age-based stale rule, release-by-owner -> R1, R2
- [x] Implement `snapshot.ts`: `hashTree`, `hashOutside`, take/read/remove, restore with empty-directory cleanup -> R3, R7
- [x] Implement `ingest apply`: preconditions, lock-then-snapshot with rollback, brief and fact lines, idempotent re-apply -> R4, R5
- [x] Implement held-lock handling and `--force-unlock` on stale locks -> R6
- [x] Implement `ingest abort`: restore, release, `--drop` via `removeSource`, abort log event, refusals and missing-snapshot warning -> R7, R8
- [x] Register both subcommands in `src/commands/ingest.ts` -> R4, R7
- [x] Tests: unit tests for lock and snapshot; CLI tests per Gherkin scenario, including the guard checks through `runGuard` -> §2.1
- [ ] `buildBrief` returns only the `ingest` line; `apply`'s description and header comment follow -> R4

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 7 | exclusive create race; stale by age; unreadable lock; `hashOutside` membership (facts files excluded); restore of edited/deleted/created files; empty-directory cleanup; release by non-owner returns false |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`; guard checks through `runGuard`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.
- [ ] `test/agents/hook-guard.test.ts` still passes unchanged (lock path and existence semantics preserved).

## Existing Surfaces

- **Surface:** `src/core/paths.ts:46` — `lockFile` resolves to the lock file under the wiki directory.
- **Surface:** `src/commands/hook.ts:59` — the guard allows page writes while `paths.lockFile` exists; this story is what creates and removes that file.
- **Surface:** `src/core/gitignore.ts:76` — the lock file and `src/core/gitignore.ts:77` — the snapshots directory are already in the managed ignore block.
- **Surface:** `src/core/manifest.ts:50` — `sha256File`, reused for snapshot hashes.
- **Coverage of this requirement:** partial — paths, ignore rules and the guard exist; lock, snapshot and both subcommands are net-new.

## Prior work

- [[EPIC-003]] (parent), [[EPIC-005]] (`status` reports open ingests and locks from `readLock`). No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/commands/hook.ts` (reads the lock, never writes it).
- **Why isn't extension / parameterization / config sufficient?** The guard can only tell "write phase open or not"; attributing changes to one source needs an exclusive lock, and rolling back needs a snapshot. Relying on git instead would require a clean, committed working tree for every ingest, which the user's repository does not guarantee.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (EPIC-003 §4 amended to the decomposition-brief paths after the human accepted them, 2026-10-16.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
