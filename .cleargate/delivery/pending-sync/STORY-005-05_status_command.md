---
story_id: STORY-005-05
parent_epic_ref: EPIC-005
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-005 (approved 2026-10-16) §2 (`status`), §5 (re-ingest scenario) · CR-003 D5 (row 8.12) · architecture.md §8 (rule versions → re-ingest candidates), §9, D-28 · SPRINT-03 decomposition brief contracts K1, K4, K5, K9 · verified src/ingest/lock.ts, src/ingest/registry.ts, src/ingest/log.ts, src/ingest/facts.ts, src/commands/ingest-abort.ts, src/commands/ingest-finish.ts, src/commands/ingest-start.ts, src/core/config.ts, src/core/paths.ts · real data checked read-only in ~/walkthrough-wiki/.wiki (9 finished ingests, 42 uncovered items, 52 miss events) · SPRINT-03 gate1-decisions.md item 11 (approved at Gate 1, 2026-10-17), split 4 (2026-10-17, the read-only allow rules this story carried as R13 moved to STORY-005-09) and the `src/program.ts` merge-order call (revised 2026-10-17) · consistency audit findings 15, 16 (`origin` on re-ingest candidates) · verified src/program.ts at 40018c5
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-005-01
  - STORY-005-06
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T08:52:04Z
updated_at: 2026-10-17T10:20:18Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:22:54Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: null
  last_stamp: 2026-10-17T08:57:29Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: ""
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-17T08:46:04Z
---

# STORY-005-05: `wikeeper status`, with re-ingest candidates and pending rule suggestions
**Complexity:** L2 — one new command module (`src/commands/status.ts`) that reads six existing sources of state (lock, registry, log, facts files, kb_instructions.md, config) and one registration line in `src/program.ts`. Consumes K1 `loadInstructions` (STORY-005-01) and K4 `listDecisions` (STORY-005-06); until they merge, build against their frozen signatures. The allow rules for `lint`, `status` and `rules list`, which an earlier revision carried here as R13, are STORY-005-09 (Gate 1 split 4, 2026-10-17).

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent starting a session in a wiki, I want one read-only command that shows open ingests, unfinished and outdated sources, rule suggestions still waiting for a decision, setup state and the number of misses, so that I can tell the user what needs attention without opening `raw/` and `log/` myself.

### 1.2 Detailed Requirements
- **R1 — Command (K5).** `wikeeper status [--json]`. On an initialised wiki it exits 0 whatever it finds: it reports, it does not judge. No wiki → exit 1, code `not_initialised`. JSON data (`StatusData`, frozen by K5):
  `{ open_ingest: LockInfo | null, stale_lock: boolean, unfinished_sources: string[], reingest_candidates: Array<{ source_id, origin, kind, rule_version, current_version }>, pending_rule_suggestions: Array<{ source_id, items: string[] }>, setup: { completed_at: string | null, me: boolean, project: boolean }, misses: number }`. Every list is sorted by source id.
- **R2 — Read-only.** `status` creates, changes and deletes no file: not `log.md`, not `index.md`, not the search cache, not `.wiki/.lock`.
- **R3 — Open ingest and stale lock.** From `readLock(paths, now)`: `open_ingest` is `LockState.lock` and `stale_lock` is `LockState.stale`. A lock older than `STALE_LOCK_MS` (2 hours) is stale; an unreadable `.wiki/.lock` gives `open_ingest: null` and `stale_lock: true`, as `readLock` already reports it.
- **R4 — Unfinished sources.** The ids from `listSources` that no `ingest` log event names. An applied ingest that holds the lock is also unfinished. Abort events are ignored (§1.4 Q1): a source aborted without `--drop` keeps its `raw/` files and can be applied again, and a dropped source has no `raw/<id>.meta.json`, so it is not listed anyway.
- **R5 — Re-ingest families.** Sources linked by `reingest_of` (`SourceMeta.reingest_of`, set by `ingest start --reingest`) form one family; links are followed in both directions, so all re-ingests of one original are one family even when each names the original. In each family only the finished ingest with the newest log event `at` counts for R6 and R7; the older ones are superseded. A finished ingest whose `raw/<id>.meta.json` is gone is a family of its own.
- **R6 — Re-ingest candidates (K5).** For each counted ingest event, `current` is the first rule in `kb.kinds` (K1, `loadInstructions`) whose id equals `normalizeKindId(event.kind)`, as `findKindRule` picks it. The source is a candidate when `current` exists and the event's `rule_version` is `null` or lower than `current.version`. Entry: `{ source_id, origin, kind, rule_version /* number | null */, current_version /* number */ }`. `origin` (additive to K5, owned here) is the counted ingest event's `origin`, which `finish` copies from the source's meta (`src/commands/ingest-finish.ts:176`), so it is there even when the meta is gone: a repository-relative or absolute POSIX path, a normalised URL, or `stdin` (`src/ingest/registry.ts:25`). It is what the agent passes to `wikeeper ingest start <origin> --reingest` from the repository root (STORY-006-09); a `stdin` source has nothing to point at, and its text must be supplied again. A kind with no rule today gives no candidate. When `kb_instructions.md` is missing (`loadInstructions` returns `null`), the list is empty and a warning says `kb_instructions.md is missing: re-ingest candidates were not computed`.
- **R7 — Pending rule suggestions (K5, CR-003 D5).** For each counted ingest event: when `readFacts(paths, id)` returns a non-empty `uncovered` and no `RuleDecision` from `listDecisions` (K4) has `source_id === id`, the entry is `{ source_id, items: uncovered }`, items in file order. One recorded decision with `--from <id>` covers all of that source's items (K5). Facts of unfinished sources are not read. A missing facts file, or one that `readFacts` rejects, skips the source with a warning naming `raw/<id>.facts.json`; status still exits 0.
- **R8 — Setup.** `completed_at` is `config.setup_completed_at`; `me` and `project` are whether `paths.meFile` and `paths.projectFile` exist. Ignore and commit checks stay in `doctor` (`src/core/setup-files.ts`).
- **R9 — Misses.** `misses` is the number of `miss` events in `log/` (every event, not distinct queries; `search --misses` groups them).
- **R10 — Warnings.** Besides R6 and R7: each file `readLogEvents` skipped gives `<file>: <reason>`, as `index rebuild` reports them (`src/commands/index.ts:42`).
- **R11 — Human output.** One block per area, in R1 order, each starting with a fixed label and a count:
  - `open ingest: none`, or `open ingest: <id> holds the write lock (acquired <age> ago)` using `formatLockAge`, with `; the lock is stale (older than 2 hours)` when stale; an unreadable lock prints `open ingest: .wiki/.lock is unreadable and counts as stale`.
  - `unfinished sources: none` or `unfinished sources: N`, then one indented id per line.
  - `re-ingest candidates: none` or `re-ingest candidates: N`, then `  <id> (<kind> v<rule_version>, rule now v<current_version>) from <origin>`, with `no rule` in place of `v<rule_version>` when it is `null`.
  - `pending rule suggestions: none` or `pending rule suggestions: <n> source(s), <m> item(s)`, then each id and its items as `    - <item>`, and one hint line: `decide with wikeeper rules record --accepted|--rejected --kind <k> --summary <text> --from <id>`.
  - `setup: completed <completed_at>` or `setup: not completed`, then `· me.md present|missing · project.md present|missing`.
  - `misses: none` or `misses: N recorded (wikeeper search --misses lists them)`.
- **R12 — Registration.** `src/commands/status.ts` exports `collectStatus`, `createStatusCommand({ now })` and `statusCommand`. `src/program.ts` appends `statusCommand` at the end of `defaultCommands` as it stands when this story merges, with one import and one array entry (gate1-decisions technical call, revised 2026-10-17: each command story appends its command in merge order). Its predecessor STORY-005-06 (`rulesCommand`) has added its entry by then; STORY-005-02's `lintCommand` and STORY-003-10's `readCommand` may land before or after it.

### 1.3 Out of Scope
- Lint findings (`wikeeper lint`, STORY-005-02/03) and kb_instructions.md problems (`lint --rules`, STORY-005-04). `status` does not report `KbIssue`s.
- Fixing anything it reports: releasing locks, finishing or dropping sources, re-ingesting, recording decisions.
- Per-item coverage of rule suggestions: a decision covers a whole source (K5).
- Instruction text that tells the agent when to run `status` and how to use a candidate's `origin` (STORY-006-09).
- Allow rules for `status`, `lint` and `rules list` in the agents' settings, and the SETUP.md step-4 rows that show them: STORY-005-09 (Gate 1 decision 17 and split 4), which depends on this story because the template checker rejects a rule for a command that is not registered.

### 1.4 Open Questions

- **Question (Q1, contract K5 vs code):** K5 defines `unfinished_sources` as "registered, no ingest or abort event". The code disagrees in two ways. (a) `ingest abort` without `--drop` keeps the source in `raw/` (`src/commands/ingest-abort.ts:82` removes files only with `--drop`), and `finish` tells the user to "run wikeeper ingest abort <id>, then apply again" (`src/commands/ingest-finish.ts:128`), so an aborted source is resumable, not done. (b) A dropped id is reused: `walkthrough-wiki/.wiki/log/` has an `abort` event with `dropped: true` for `src-2026-10-17-acmeworks-roadmap` at 00:23 and an `ingest` event for a new registration with the same id at 07:45 (`captured_at` 07:43). Under K5, a re-registered, unfinished source with a reused id would be hidden by the old abort event.
- **Decision:** A source is unfinished until an `ingest` event for it exists: registered (meta exists) and no `ingest` event names the id, and `abort` events do not finish a source (R4; the `src-2026-10-17-b` row of the fourth scenario); the JSON shape stays `string[]`, so no consumer changes (gate1-decisions item 11) — _approved (human, 2026-10-17, Gate 1)_

### 1.5 Risks

- **Risk:** One `rules record … --from <id>` clears every pending item of that source, including items the agent never acted on (K5's coarse rule).
- **Mitigation:** Stated in R7 and in the hint line; WIKI.md (STORY-006-09) tells the agent to decide every item of a source before recording with `--from`. Per-item coverage is out of scope.
- **Risk:** On a real wiki the pending list is long: the acmeworks wiki has 42 uncovered items across 9 ingests, several of them notes rather than rule ideas ("Stored copy is truncated…").
- **Mitigation:** Human output groups items under their source and prints the counts first; the agent reads `--json`. Recording a rejected decision with `--from` dismisses a source's notes.
- **Risk:** The R5 family rule misses a re-ingest of a changed file, because `ingest start` sets `reingest_of` only for a duplicate (same sha256, or same URL; `src/commands/ingest-start.ts:275`).
- **Mitigation:** A changed file is a new source, not a re-ingest; its old source stays a candidate until the agent re-ingests the old content or the user decides it is not worth it. Stated here so the behaviour is not a surprise.
- **Risk:** `src/program.ts` is edited by STORY-001-10, STORY-003-10, STORY-005-02 and STORY-005-06 as well.
- **Mitigation:** Each command story appends one import and one `defaultCommands` entry in merge order, and STORY-001-10 changes only `VERSION` and the help footer, so a rebase meets at most a one-line conflict at the end of the array. STORY-005-06 is a predecessor. STORY-005-02 is not: `status` uses nothing from `lint` (it does not report findings, §1.3), so the two may build in parallel and the Sprint Design Review orders their merges.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | `status` has one way through: every run reads every area, and the variations are data. |
| Interfaces | T | CLI human and `--json` output from the same command. |
| Data | T | Lock states; ingested rule versions against the current rule; unreadable facts files and a missing kb_instructions.md. |
| Rules | T | Re-ingest rule with superseded sources; pending suggestions until a decision with `--from`; status writes nothing. |

```gherkin
Feature: wikeeper status

  @rules @data
  Scenario Outline: Status lists re-ingest candidates
    Given kb_instructions.md whose only source kind is "meeting-notes (v2) → decision, risk"
    And a finished ingest of "src-2026-10-10-standup" from origin "notes/standup.md" with kind "<kind>" and rule_version <version>
    And <reingest>
    When I run "wikeeper status --json"
    Then data.reingest_candidates is <candidates>
    And "wikeeper status" prints a line that, trimmed, is "<line>"

    Examples:
      | kind          | version | reingest                                                                                                      | candidates                                                                                                                           | line                                                                              |
      | meeting-notes | 1       | no other source names it in reingest_of                                                                       | [{ source_id: "src-2026-10-10-standup", origin: "notes/standup.md", kind: "meeting-notes", rule_version: 1, current_version: 2 }]    | src-2026-10-10-standup (meeting-notes v1, rule now v2) from notes/standup.md      |
      | meeting-notes | null    | no other source names it in reingest_of                                                                       | [{ source_id: "src-2026-10-10-standup", origin: "notes/standup.md", kind: "meeting-notes", rule_version: null, current_version: 2 }] | src-2026-10-10-standup (meeting-notes no rule, rule now v2) from notes/standup.md |
      | meeting-notes | 2       | no other source names it in reingest_of                                                                       | []                                                                                                                                   | re-ingest candidates: none                                                        |
      | chat-excerpt  | null    | no other source names it in reingest_of                                                                       | []                                                                                                                                   | re-ingest candidates: none                                                        |
      | meeting-notes | 1       | "src-2026-10-12-standup", registered with reingest_of "src-2026-10-10-standup", finished under rule_version 2 | []                                                                                                                                   | re-ingest candidates: none                                                        |

  @rules
  Scenario: Pending rule suggestions are listed until a decision covers them
    Given a finished ingest of "src-2026-10-16-q4-status" whose facts file has uncovered ["budget burn per project — no rule captures it"]
    And a finished ingest of "src-2026-10-16-standup" whose facts file has uncovered []
    And a registered source "src-2026-10-16-draft" with facts stored, uncovered ["x"], and no ingest event
    When I run "wikeeper status --json"
    Then data.pending_rule_suggestions is [{ source_id: "src-2026-10-16-q4-status", items: ["budget burn per project — no rule captures it"] }]
    And "wikeeper status" prints "pending rule suggestions: 1 source, 1 item" and "    - budget burn per project — no rule captures it"
    When I run "wikeeper rules record --rejected --kind status-report --summary 'Budget burn per project' --from src-2026-10-16-q4-status"
    And I run "wikeeper status --json"
    Then data.pending_rule_suggestions is []

  @data
  Scenario Outline: Open ingest and stale lock
    Given an initialised wiki with registered sources "src-2026-10-17-a" and "src-2026-10-17-b"
    And <lock>
    When I run "wikeeper status --json" at 2026-10-17T12:00:00Z
    Then data.open_ingest is <open_ingest> and data.stale_lock is <stale>
    And "wikeeper status" prints a line starting with "<line>"

    Examples:
      | lock                                                              | open_ingest                        | stale | line                                                    |
      | no .wiki/.lock                                                    | null                               | false | open ingest: none                                       |
      | .wiki/.lock for "src-2026-10-17-a" acquired at 2026-10-17T11:30:00Z | an object with source_id "src-2026-10-17-a" | false | open ingest: src-2026-10-17-a holds the write lock (acquired 30 minutes ago) |
      | .wiki/.lock for "src-2026-10-17-a" acquired at 2026-10-17T09:00:00Z | an object with source_id "src-2026-10-17-a" | true  | open ingest: src-2026-10-17-a holds the write lock (acquired 3 hours ago); the lock is stale |
      | .wiki/.lock containing "not json"                                 | null                               | true  | open ingest: .wiki/.lock is unreadable                  |

  @rules @interfaces
  Scenario: Status reports unfinished sources, setup and misses, and writes nothing
    Given an initialised wiki with setup_completed_at null, no .wiki/me.md and a .wiki/project.md
    And registered sources "src-2026-10-17-a" (facts stored), "src-2026-10-17-b" (applied, then aborted without --drop) and "src-2026-10-17-c" (finished)
    And 3 miss events in log/
    When I run "wikeeper status --json"
    Then the exit code is 0
    And data.unfinished_sources is ["src-2026-10-17-a", "src-2026-10-17-b"]
    And data.setup is { completed_at: null, me: false, project: true }
    And data.misses is 3
    And no file in the repository was created, changed or deleted
    And "wikeeper status" prints "unfinished sources: 2", "setup: not completed · me.md missing · project.md present" and "misses: 3 recorded"

  @data
  Scenario Outline: Error — status outside a wiki fails; broken data only warns
    Given <setup>
    When I run "wikeeper status --json"
    Then the exit code is <exit>
    And <outcome>

    Examples:
      | setup                                                                              | exit | outcome                                                                                              |
      | a directory with no wiki                                                           | 1    | the error code is "not_initialised"                                                                  |
      | a finished ingest of "src-2026-10-16-q4-status" whose facts file is not valid JSON | 0    | a warning names raw/src-2026-10-16-q4-status.facts.json and data.pending_rule_suggestions is []       |
      | a finished ingest under meeting-notes v1 and no .wiki/kb_instructions.md           | 0    | a warning contains "kb_instructions.md is missing" and data.reingest_candidates is []                |
      | a file in log/ without frontmatter                                                 | 0    | a warning names that file and contains "no frontmatter"                                              |
```

### 2.2 Verification Steps (Manual)
- [ ] Run `wikeeper status` and `wikeeper status --json` in a copy of `~/walkthrough-wiki` and check: no open ingest, no unfinished sources, no re-ingest candidates (all ingests match today's rule versions), 9 sources with pending rule suggestions (42 items), setup completed, 52 misses; and `git status` in the copy shows no change.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File (new) | `src/commands/status.ts` |
| Related Files | `src/program.ts` |
| Related Files (new) | `test/status.test.ts` |
| New Files Needed | `src/commands/status.ts`, `test/status.test.ts` |

- **Read, not edited (consumed, unchanged):** `src/ingest/lock.ts` (`readLock`, `formatLockAge`, `LockInfo`), `src/ingest/registry.ts` (`listSources`, `SourceMeta`), `src/ingest/log.ts` (`readLogEvents`, `IngestLogEvent`), `src/ingest/facts.ts` (`readFacts`, `factsFilePath`), `src/ingest/kind-rules.ts` (`normalizeKindId`), `src/kb/parse-instructions.ts` (`loadInstructions`, K1, STORY-005-01), `src/kb/rule-decisions.ts` (`listDecisions`, K4, STORY-005-06), `src/core/config.ts`, `src/core/paths.ts`.

No red test changes in this story: the rule-list red tests that SPRINT-03's allow rules break are STORY-005-09's (§3.1 there; STORY-006-11 R6 (h)), and none of them concerns the `status` command.

### 3.2 Technical Logic
- **Order.** `findRepoRoot(ctx.cwd)` → `loadConfig` → `resolvePaths` → `assertInitialised`, then `collectStatus(paths, config, now)`:
  1. `readLock(paths, now)`.
  2. `listSources(paths)`; `readLogEvents(paths)` once, then split by type (`ingest`, `miss`) in memory; keep `skipped` for R10.
  3. Families (R5): union-find over source ids, joining each meta's id with its `reingest_of`. For each family, the counted ingest is the `ingest` event with the newest `at` among the family's ids (ties: the later file name, the order `readLogEvents` returns).
  4. `loadInstructions(paths)` (K1) for `kb.kinds`; `listDecisions(paths)` (K4) into a `Set` of `source_id`s.
  5. For each counted ingest, R6 and R7 (`readFacts` inside try/catch: a `WikeeperError` with code `invalid_facts` and a `null` result both become R7 warnings).
  6. `setup` with `stat` on `paths.meFile` and `paths.projectFile` (`ENOENT` → `false`). `checkSetupFiles`' own `exists` is not exported and runs git checks status does not need.
- **No writes.** Nothing in the path calls `writeLogEvent`, `writeIndex`, `regenerateLogView` or the search cache loader. The read-only test hashes every file under the temp repo before and after the command.
- **Time.** `createStatusCommand({ now })` injects the clock for the stale-lock rows, as `createSetupCommand` does (`src/commands/setup.ts:14`).
- **Fixtures.** Build sources with `registerSource`, ingest events with `writeLogEvent` (`permission` is a string, FLASHCARD 2026-10-17 `#qa #red-test`), facts with `writeFacts`, and the lock file as JSON in `.wiki/.lock`; the decision row runs the real `rules record` command (STORY-005-06).
- **Registration (R12).** Append the import and `statusCommand` at the end of `defaultCommands` (`src/program.ts:33`) on the tree merged with the predecessors.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper status` | CLI | None | `--json` | `StatusData` (R1, K5) |

```ts
// src/commands/status.ts
import type { WikeeperConfig } from "../core/config.js";
import type { ResolvedPaths } from "../core/paths.js";
import type { LockInfo } from "../ingest/lock.js";
import type { CommandModule } from "../program.js";

export interface StatusData {
  open_ingest: LockInfo | null;
  stale_lock: boolean;
  unfinished_sources: string[];
  reingest_candidates: Array<{
    source_id: string;
    origin: string; // additive to K5 (this story): the counted ingest event's origin
    kind: string; rule_version: number | null; current_version: number;
  }>;
  pending_rule_suggestions: Array<{ source_id: string; items: string[] }>;
  setup: { completed_at: string | null; me: boolean; project: boolean };
  misses: number;
}
export function collectStatus(
  paths: ResolvedPaths,
  config: WikeeperConfig,
  now: Date,
): Promise<{ data: StatusData; warnings: string[] }>;
export function createStatusCommand(deps?: { now?: () => Date }): CommandModule;
export const statusCommand: CommandModule;
```

Consumed (frozen): `loadInstructions(paths): Promise<{ text; kb: KbInstructions } | null>` with `kb.kinds: SourceKindRule[]` (K1); `listDecisions(paths): Promise<RuleDecision[]>` with `source_id: string | null` (K4); `readLock(paths, now): Promise<LockState>`, `STALE_LOCK_MS`, `formatLockAge` (C8); `listSources`, `SourceMeta.reingest_of` (C3); `readLogEvents` (STORY-003-07); `readFacts` (C7).

## Task Breakdown

- [ ] Implement `collectStatus`: lock, sources, log events, families, candidates with `origin`, pending suggestions, setup, misses and warnings -> R1, R3, R4, R5, R6, R7, R8, R9, R10
- [ ] Implement the human output, `createStatusCommand({ now })` and `statusCommand` -> R1, R11
- [ ] Append `statusCommand` to `defaultCommands` in `src/program.ts` on the merged tree -> R12
- [ ] Write `test/status.test.ts`: the §4.1 unit tests and the five scenarios, the fourth with the repository hash before and after -> R2

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 5 | family grouping with links in both directions and a missing meta; candidate rule per version row, with `origin` taken from the ingest event when the meta is gone; pending rule with a decision from another source; human output labels and pluralisation ("1 source, 1 item", "2 sources, 3 items"); warning text per broken input |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/help.red.node.test.ts` passes: `status --help` lists `--json`.
- [ ] No new runtime dependency in `package.json`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/ingest/lock.ts:42` — `readLock`, which already returns `held`, `lock`, `stale` and `age_ms` (unreadable lock = held and stale); `src/ingest/lock.ts:57` — `formatLockAge` for the human line.
- **Surface:** `src/ingest/registry.ts:198` — `listSources`, every registered source sorted by id; `src/ingest/registry.ts:35` — `reingest_of`, the family link.
- **Surface:** `src/ingest/log.ts:186` — `readLogEvents`; `src/ingest/log.ts:18` — `rule_version` recorded on each `ingest` event (architecture.md §8); `src/ingest/log.ts:20` — its `origin`, copied from the meta by `finish` (`src/commands/ingest-finish.ts:176`).
- **Surface:** `src/ingest/facts.ts:190` — `readFacts`; `src/ingest/facts.ts:35` — `uncovered`, the source of pending suggestions (CR-003 D5).
- **Surface:** `src/core/config.ts:11` — `setup_completed_at`; `src/core/paths.ts:14` — `meFile` and `projectFile`.
- **Surface:** `src/commands/index.ts:42` — the warning format for skipped log files that R10 reuses.
- **Surface:** `src/program.ts:33` — `defaultCommands`, where `statusCommand` is appended.
- **Coverage of this requirement:** partial — every `status` input already exists and has a reader; the aggregation and the command are net-new.

## Prior work

- [[EPIC-005]] (parent; the re-ingest scenario comes from its §5). [[CR-003]] D5 (row 8.12) adds pending rule suggestions. Consumes [[STORY-005-01]] (K1 parser, `kinds`) and [[STORY-005-06]] (K4 decisions, `--from`). Reads state written by [[STORY-003-06]] (facts files, `uncovered`), [[STORY-003-07]] (log events), [[STORY-003-08]] (lock) and [[STORY-003-01]] (registry, `reingest_of`). Shares `src/program.ts` with [[STORY-005-02]] (`lint`), with no order between them. The read-only allow rules an earlier revision carried as R13 are [[STORY-005-09]] (split 2026-10-17), which depends on this story. No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `wikeeper doctor` (`src/commands/doctor.ts`), which already reports setup files.
- **Why isn't extension / parameterization / config sufficient?** `doctor` checks the installation (agent wiring, config, setup files) and exits non-zero on errors; `status` reports the wiki's work in progress and always exits 0 on a healthy install. Folding ingest state into `doctor` would make a routine open ingest look like a broken install. The new code is aggregation over existing readers; no reader is duplicated.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/kb/parse-instructions.ts` and `src/kb/rule-decisions.ts` are created by STORY-005-01 and STORY-005-06 in this sprint, per the decomposition brief.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1 approved by the human on 2026-10-17: every §1.4 Decision line is approved as recommended.
