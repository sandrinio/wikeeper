---
story_id: STORY-005-06
parent_epic_ref: EPIC-005
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
ambiguity: 🟡 Medium
context_source: EPIC-005 (approved 2026-10-16) §2, §4 (rule-proposal events), §5 (rejected-proposal scenario) · architecture.md §9 (rejected → logged so it isn't offered again), D-14, D-28 · SPRINT-03 decomposition brief contract K4 (and K5, the consumer) · verified src/ingest/log.ts, src/ingest/kind-rules.ts, src/ingest/registry.ts, src/ingest/source-id.ts, src/ingest/diff.ts, src/program.ts, test/ingest/log.test.ts · SPRINT-03 gate1-decisions.md item 12 (recommended 2026-10-17, pending Gate 1), item 17 (owner STORY-005-09) and the `src/program.ts` merge-order call (revised 2026-10-17)
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors:
  - STORY-004-07
  - STORY-005-01
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T08:52:04Z
updated_at: 2026-10-17T10:00:33Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:01:04Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-005-06
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T10:01:48Z
  sessions: []
---

# STORY-005-06: `wikeeper rules record` and `rules list`
**Complexity:** L2 — one library module (`src/kb/rule-decisions.ts`), one command group (`src/commands/rules.ts`), one registration line in `src/program.ts` and the `rule-proposal` summary line in `src/ingest/log.ts`. Depends on STORY-004-07 (lands its `src/ingest/log.ts` miss-summary edit first) and STORY-005-01 (`KB_SECTION_KEYS`, `KB_PROPOSAL_SECTION_KEYS` for `--kind`). `src/ingest/log.ts` is also edited by STORY-005-03 (`page_hashes`).

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent that proposes `kb_instructions.md` changes, I want each accepted or rejected proposal recorded with a stable fingerprint and listable later, so that I never offer the user a proposal they already rejected and `wikeeper status` can tell which rule suggestions still wait for a decision.

### 1.2 Detailed Requirements
- **R1 — Fingerprint (K4).** `fingerprint(kind, summary)` is the first 12 hex characters of the sha256 of `normalizeKindId(kind) + "\n" + s`, where `s` is the summary trimmed, with every run of whitespace replaced by one space, and lower-cased. Two proposals that differ only in kind case, a `(vN)` suffix on the kind, spacing or summary case have the same fingerprint. Test vector: `fingerprint("Meeting-Notes", "  Track   attendees ")` is `86420d5cacb9`; `fingerprint("status-report", "Track attendees")` is `fba15d33735a`.
- **R2 — Record (K4).** `recordDecision(paths, { kind, summary, decision, sourceId?, at })`:
  - Rejects input with a `WikeeperError(ExitCode.USAGE, "usage")`: a kind that fails `isValidKindId`, or that normalises to `source-kinds` or `rule-changelog` (the `KB_SECTION_KEYS` outside `KB_PROPOSAL_SECTION_KEYS`, STORY-005-01: a source-kind proposal names the kind itself, and the changelog takes no proposals); a summary that is empty after trimming; a `sourceId` that fails `isSourceId`.
  - Reads the existing `rule-proposal` events (R3). `previouslyRejected` is true when any of them has the same fingerprint and decision `rejected`.
  - Writes one `rule-proposal` event through `writeLogEvent`: `{ type: "rule-proposal", at, source_id?, kind, summary, fingerprint, decision }`. `kind` is stored as `normalizeKindId(kind)`; `summary` is stored trimmed with whitespace runs collapsed, case kept; `source_id` is present only when `sourceId` is given.
  - Returns `{ file, fingerprint, previouslyRejected }`, `file` relative to the repo root (POSIX), as `writeLogEvent` returns it.
- **R3 — List (K4).** `listDecisions(paths)` returns one `RuleDecision` per well-formed `rule-proposal` event, in log order (`at`, then file name, as `readLogEvents` sorts):
  - `RuleDecision { kind; summary; fingerprint; decision; at; source_id: string | null; previously_rejected: boolean; file: string }`. `file` is an additive field owned here.
  - `fingerprint` is recomputed from the event's `kind` and `summary` with R1, so an event written by hand, or one whose stored fingerprint is wrong, still compares correctly.
  - `previously_rejected` is true when an earlier decision in that order has the same fingerprint and decision `rejected`.
  - An event is skipped when `kind` is not a valid kind id, `summary` is not a non-empty string, or `decision` is not `accepted` or `rejected` (for example SPRINT-02's reserved shape, `test/ingest/log.test.ts:22`). `readDecisions(paths)` (additive export) returns `{ decisions, skipped: Array<{ file, reason }> }`; `listDecisions` returns its `decisions`.
- **R4 — Log summary line.** `summaryLine` in `src/ingest/log.ts` writes `Rule proposal <decision> for <kind>: <summary>` when the event's `decision` and `kind` are strings, and keeps today's `Rule proposal: <summary>` / `Rule proposal` otherwise, so `test/ingest/log.test.ts:21` passes unchanged. `validate` stays as it is: the reserved type stays loosely typed in `writeLogEvent`, and `recordDecision` checks its own input (R2).
- **R5 — `wikeeper rules record`.** `wikeeper rules record (--accepted | --rejected) --kind <k> --summary <text> [--from <source-id>] [--json]`:
  - Exactly one of `--accepted` and `--rejected`, plus `--kind` and `--summary`, are required; otherwise exit 2, code `usage`. The check runs in the action, not through commander options, so the error envelope names `rules record` (FLASHCARD 2026-10-17 `#cli #commander`).
  - `--kind` is a source-kind id, for a proposal about a source-kind rule, or one of the section keys STORY-005-01 freezes for other proposals (`KB_PROPOSAL_SECTION_KEYS`): `questions`, `entities`, `capture-signals`, `write-policy`, `never-capture` (§1.4). A source-kind id is not checked against `kb_instructions.md`: a proposal for a new kind has no rule yet. The option's help is built from `KB_PROPOSAL_SECTION_KEYS`: `source kind id, or one of questions, entities, capture-signals, write-policy, never-capture`. A kind R2 refuses exits 2, code `usage`, with a message naming the same five keys.
  - `--from` must name a registered source (`readMeta` is not null); an unregistered id exits 1 with code `unknown_source`, and an id that is not a source id exits 2 with code `usage`. `--from` is how a decision covers a source's pending rule suggestions in `wikeeper status` (K5, STORY-005-05).
  - No wiki → exit 1, code `not_initialised`.
  - It runs while an ingest holds the write lock: `ingest finish` compares only the files outside `pages/` that existed at apply time (`src/ingest/diff.ts:46`), so a new file under `log/` does not make it refuse (STORY-004-05 R2).
  - It writes exactly one new file, under `log/`, and nothing else: no edit of `kb_instructions.md` (the agent edits it after approval, D-14) and no regeneration of `log.md` (`index rebuild` and the next `finish` do that).
  - JSON data: `{ file, fingerprint, previously_rejected, kind, summary, decision, at, source_id }` (`source_id` is `null` without `--from`). Human output: `recorded <decision> proposal <fingerprint> for <kind>: <summary> (<file>)`. When `previously_rejected` is true, a warning names the file of the most recent earlier rejection: `this proposal was rejected before (<file>)`.
- **R6 — `wikeeper rules list`.** `wikeeper rules list [--json]` is read-only and exits 0:
  - JSON data: `{ decisions: RuleDecision[], counts: { accepted: number, rejected: number } }`.
  - Human output: `1 rule decision` / `N rule decisions`, then one line per decision: `<YYYY-MM-DD> <decision> <kind>: <summary> [<fingerprint>]`, plus ` from <source_id>` when set and ` (previously rejected)` when `previously_rejected`. With none: `no rule decisions recorded`.
  - Each skipped event (R3) is a warning `<file>: <reason>`.
- **R7 — Registration.** `src/commands/rules.ts` exports `rulesCommand: CommandModule`, a `rules` group with `record` and `list`; `src/program.ts` appends it at the end of `defaultCommands` as it stands when this story merges (one import, one array entry): each command story appends its command in merge order (gate1-decisions technical call, revised 2026-10-17). STORY-005-05 depends on this story, so `statusCommand` comes after `rulesCommand`; `readCommand` (STORY-003-10) and `lintCommand` (STORY-005-02) may come before or after it.

### 1.3 Out of Scope
- Editing `kb_instructions.md`, bumping rule versions or adding changelog lines (the agent does this after the user approves, D-14). Checking that an accepted proposal led to a version bump is `lint --rules` (STORY-005-04).
- Pending rule suggestions in `wikeeper status` (STORY-005-05 consumes `listDecisions`).
- Matching similar but not identical proposals; only the R1 fingerprint is compared.
- The `log.md` view line for `rule-proposal` events (`renderLogView`, `src/ingest/log.ts:238`) stays as it is.
- WIKI.md text on when to record (STORY-006-09) and what `--kind` to pass (STORY-006-10 R7).
- Permission rules for `rules` in each agent's settings (STORY-005-09, gate1-decisions item 17): `rules list` gets an allow rule in every permission mode; `rules record` writes a log event and gets none.

### 1.4 Open Questions

- **Question:** What does `--kind` name for a proposal that is not about a source kind, such as a new *Never capture* line, a new question or a new entity? K4 normalises `kind` with `normalizeKindId`, which suggests a source kind, but architecture.md §9 also lists *Never capture* proposals (the "salary" example). The fingerprint includes the kind, so agents must use the same word every time.
- **Decision:** A source-kind id for a source-kind rule (not checked against `kb_instructions.md`), otherwise one of the section keys STORY-005-01 freezes for non-kind proposals, `questions`, `entities`, `capture-signals`, `write-policy`, `never-capture` (`KB_PROPOSAL_SECTION_KEYS`; revised from the singular list, since the kind is part of the fingerprint); `source-kinds` and `rule-changelog` are refused (R2, R5), and WIKI.md documents the keys (STORY-006-10 R7) (gate1-decisions item 12) — _recommended 2026-10-17, pending Gate 1_

### 1.5 Risks

- **Risk:** The agent words the same proposal differently the second time, so the fingerprint differs and "previously rejected" never shows.
- **Mitigation:** The fingerprint absorbs case and spacing. `rules list` shows every rejected summary, and WIKI.md (STORY-006-09) tells the agent to read it before offering a proposal. Fuzzy matching is out of scope.
- **Risk:** STORY-004-07 and STORY-005-03 edit `src/ingest/log.ts` in the same sprint.
- **Mitigation:** This story changes only the `default:` branch of `summaryLine` (`src/ingest/log.ts:124`). STORY-004-07 is a predecessor, so its miss branch is already in place; the edit is a few lines away from it and from the `IngestLogEvent` fields STORY-005-03 adds.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A decision recorded with and without `--from`, while another ingest holds the write lock, and for a section key instead of a source kind. |
| Interfaces | F | CLI only; the library API is consumed by STORY-005-05 and covered by unit tests. |
| Data | T | `rules list` over well-formed decisions, the reserved SPRINT-02 event shape and other event types. |
| Rules | T | A rejected proposal is remembered by fingerprint; `record` writes one log event and nothing else; `list` writes nothing; invalid input is refused. |

```gherkin
Feature: Rule decisions

  @rules
  Scenario: A rejected proposal is remembered
    Given an initialised wiki
    And "wikeeper rules record --rejected --kind meeting-notes --summary 'Track attendees'" was run
    When I run "wikeeper rules record --accepted --kind 'Meeting-Notes' --summary '  track   ATTENDEES ' --json"
    Then the exit code is 0
    And data.fingerprint is "86420d5cacb9" and data.previously_rejected is true
    And a warning reads "this proposal was rejected before (" followed by the first decision's log file
    And "wikeeper rules list --json" lists two decisions with fingerprint "86420d5cacb9", the first with previously_rejected false and the second with previously_rejected true
    And "wikeeper rules list" prints "2 rule decisions" and a line ending with "(previously rejected)"

  @paths @rules
  Scenario Outline: A decision is recorded as one log event and nothing else
    Given an initialised wiki with a registered source "src-2026-10-17-q4-status"
    And <lock>
    When I run "wikeeper rules record --rejected --kind <kind> --summary '<summary>' <from> --json"
    Then the exit code is 0
    And exactly one new file exists under log/ and no other file in the repository changed
    And its frontmatter has type "rule-proposal", kind "<kind>", summary "<summary>", fingerprint, decision "rejected" and <source_field>
    And its body line is "Rule proposal rejected for <kind>: <summary>"
    And data.source_id is <source_json>

    Examples:
      | lock                                                                | kind          | summary                 | from                            | source_field                         | source_json                |
      | no ingest holds the write lock                                      | status-report | Budget burn per project |                                 | no source_id                         | null                       |
      | .wiki/.lock is held by the applied ingest of "src-2026-10-17-other" | status-report | Budget burn per project | --from src-2026-10-17-q4-status | source_id "src-2026-10-17-q4-status" | "src-2026-10-17-q4-status" |
      | no ingest holds the write lock                                      | never-capture | Salary figures          |                                 | no source_id                         | null                       |

  @data @rules
  Scenario: rules list reads only well-formed decisions and writes nothing
    Given log/ holds one recorded decision, a "rule-proposal" event with only a summary "tighten" (the SPRINT-02 reserved shape), and a miss event
    When I run "wikeeper rules list --json"
    Then the exit code is 0
    And data.decisions holds only the recorded decision, with data.counts accepted 0 and rejected 1
    And a warning names the file of the "tighten" event
    And no file in the repository was created or changed

  @rules
  Scenario Outline: Error — an invalid decision is refused and nothing is written
    Given <setup>
    When I run "wikeeper rules record <args> --json"
    Then the exit code is <exit> with error code "<code>"
    And the error envelope's command is "rules record"
    And no file is written to log/

    Examples:
      | setup                                          | args                                                                   | exit | code            |
      | an initialised wiki                            | --accepted --rejected --kind meeting-notes --summary x                 | 2    | usage           |
      | an initialised wiki                            | --kind meeting-notes --summary x                                       | 2    | usage           |
      | an initialised wiki                            | --rejected --kind meeting-notes                                        | 2    | usage           |
      | an initialised wiki                            | --rejected --kind 'meeting notes!' --summary x                         | 2    | usage           |
      | an initialised wiki                            | --rejected --kind source-kinds --summary x                             | 2    | usage           |
      | an initialised wiki                            | --rejected --kind rule-changelog --summary x                           | 2    | usage           |
      | an initialised wiki                            | --rejected --kind meeting-notes --summary x --from notes.md            | 2    | usage           |
      | an initialised wiki                            | --rejected --kind meeting-notes --summary x --from src-2026-10-17-ghost | 1    | unknown_source  |
      | a directory with no wiki                       | --rejected --kind meeting-notes --summary x                            | 1    | not_initialised |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch wiki, reject a proposal, record the same proposal again with different spacing, and check `wikeeper rules list` marks the second one "previously rejected"; then run `wikeeper index rebuild` and check `log.md` lists both events.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/kb/rule-decisions.ts` |
| Related Files | `src/commands/rules.ts`, `src/program.ts`, `src/ingest/log.ts` (`summaryLine` default branch only), `test/kb/rule-decisions.test.ts`, `test/kb/rules-command.test.ts` |
| Consumed (unchanged) | `src/ingest/log.ts` (`writeLogEvent`, `readLogEvents`, `RuleProposalLogEvent`), `src/ingest/kind-rules.ts` (`normalizeKindId`, `isValidKindId`), `src/ingest/registry.ts` (`readMeta`), `src/ingest/source-id.ts` (`isSourceId`), `src/kb/parse-instructions.ts` (`KB_SECTION_KEYS`, `KB_PROPOSAL_SECTION_KEYS`; K1, STORY-005-01) |
| New Files Needed | Yes — `src/kb/rule-decisions.ts`, `src/commands/rules.ts`, `test/kb/rule-decisions.test.ts`, `test/kb/rules-command.test.ts` |

### 3.2 Technical Logic
- **Fingerprint.** `createHash("sha256").update(normalizeKindId(kind) + "\n" + collapse(summary).toLowerCase()).digest("hex").slice(0, 12)`, with `collapse = (s) => s.trim().replace(/\s+/g, " ")`. Export `collapse` as `normalizeSummary` so the stored summary and the fingerprint use the same function.
- **Reading.** `readDecisions` calls `readLogEvents(paths, { type: "rule-proposal" })` and walks the events in the order returned, keeping a `Set` of rejected fingerprints seen so far for `previously_rejected`. Files `readLogEvents` itself skipped belong to other event types or are unreadable; they are not repeated as warnings here.
- **Kind check.** With `k = normalizeKindId(kind)`: valid when `isValidKindId(kind)` and `k` is not one of `KB_SECTION_KEYS` outside `KB_PROPOSAL_SECTION_KEYS`. Both lists are imported from `src/kb/parse-instructions.ts`, never copied, and the same list builds the `--kind` help and the usage message.
- **Recording.** `recordDecision` validates, calls `readDecisions`, writes with `writeLogEvent`, then returns. `writeLogEvent` names the file `<stamp>-<source_id>.md`, or `<stamp>-rule-proposal.md` without a source (`src/ingest/log.ts:151`), and adds `-2` on a collision.
- **Command.** `src/commands/rules.ts` follows `src/commands/index.ts` (a group with a subcommand): `findRepoRoot(ctx.cwd)` → `loadConfig` → `resolvePaths` → `assertInitialised`, then argument checks, then `--from` against `readMeta`. Tests inject time through a `createRulesCommand({ now })` factory, as `createSetupCommand` does (`src/commands/setup.ts:14`).
- **Read-only and one-write tests.** Hash every file under the temp repo before and after the command (as STORY-005-05 does for `status`); `rules list` must leave the map unchanged, and `rules record` must add exactly one `log/` entry.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper rules record` | CLI | None | `--accepted` or `--rejected`, `--kind <k>`, `--summary <text>`, `--from <source-id>`, `--json` | `{ file, fingerprint, previously_rejected, kind, summary, decision, at, source_id }` |
| `wikeeper rules list` | CLI | None | `--json` | `{ decisions: RuleDecision[], counts: { accepted, rejected } }` |

Frozen exports of `src/kb/rule-decisions.ts` (K4; consumer STORY-005-05):

```ts
import type { ResolvedPaths } from "../core/paths.js";

export type RuleDecisionKind = "accepted" | "rejected";
export interface RuleDecision {
  kind: string; summary: string; fingerprint: string; decision: RuleDecisionKind; at: string;
  source_id: string | null; previously_rejected: boolean;
  file: string; // additive (this story): the event's log file, relative to the repo root
}
export function normalizeSummary(summary: string): string;
export function fingerprint(kind: string, summary: string): string;
export function recordDecision(
  paths: ResolvedPaths,
  input: { kind: string; summary: string; decision: RuleDecisionKind; sourceId?: string; at: string },
): Promise<{ file: string; fingerprint: string; previouslyRejected: boolean }>;
export function readDecisions(paths: ResolvedPaths): Promise<{ decisions: RuleDecision[]; skipped: Array<{ file: string; reason: string }> }>;
export function listDecisions(paths: ResolvedPaths): Promise<RuleDecision[]>;
```

```ts
// src/commands/rules.ts
import type { CommandModule } from "../program.js";
export function createRulesCommand(deps?: { now?: () => Date }): CommandModule;
export const rulesCommand: CommandModule;
```

Event written to `log/` (frontmatter, key order from `orderedFields`, `src/ingest/log.ts:129`): `type`, `at`, `source_id` (when given), `kind`, `summary`, `fingerprint`, `decision`.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | R1 test vectors and normalisation; `previouslyRejected` from earlier events only; skipped shapes in `readDecisions`; stored kind and summary normalised; `summaryLine` new form and SPRINT-02 fallback; input validation errors, with the five `KB_PROPOSAL_SECTION_KEYS` accepted and `source-kinds` / `rule-changelog` refused |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 4 | One per Gherkin scenario (Outline rows counted once), through `runCli`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/ingest/log.test.ts` and `test/ingest/log.red.node.test.ts` pass unchanged.
- [ ] `test/help.red.node.test.ts` passes: `rules`, `rules record` and `rules list` help list `--json`.
- [ ] No new runtime dependency in `package.json`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/ingest/log.ts:40` — `RuleProposalLogEvent`, the reserved, loosely typed event this story fills; `src/ingest/log.ts:107` accepts it with only an optional `source_id`.
- **Surface:** `src/ingest/log.ts:115` — `summaryLine`; its `default:` branch (`:124`) prints `Rule proposal: <summary>` today.
- **Surface:** `src/ingest/log.ts:148` and `:186` — `writeLogEvent` (one new file per event, `wx` flag, D-28) and `readLogEvents` (type filter, sorted by `at` then file).
- **Surface:** `src/ingest/kind-rules.ts:14` and `:18` — `normalizeKindId` and `isValidKindId` for `--kind`.
- **Surface:** `src/ingest/registry.ts:186` — `readMeta`, the `--from` registration check; `src/ingest/source-id.ts:7` — `isSourceId`.
- **Surface:** `src/program.ts:33` — `defaultCommands`, where `rulesCommand` is registered.
- **Coverage of this requirement:** partial — the event type, log writer and reader exist; fingerprints, decisions and the command are net-new.

## Prior work

- [[EPIC-005]] (parent; the rejected-proposal scenario comes from its §5). [[STORY-003-07]] reserved the `rule-proposal` event type and its summary line. [[STORY-004-05]] records `miss` events the same way and established that new `log/` files are allowed during a write phase. [[CR-003]] D5: `--from` is what clears a source's pending rule suggestions in `status` ([[STORY-005-05]]). [[STORY-005-01]] freezes the section keys `--kind` accepts; [[STORY-004-07]] edits `src/ingest/log.ts` first. No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `writeLogEvent` with the reserved `rule-proposal` type (`src/ingest/log.ts:148`).
- **Why isn't extension / parameterization / config sufficient?** This story is that extension: it gives the reserved event its fields and adds the only writer and reader for it. Without a fingerprint, "the same proposal" has no mechanical meaning, and without a command the agent would have to write log files by hand, which the write guard and D-28's one-file-per-event format make error-prone.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (New files `src/kb/rule-decisions.ts` and `src/commands/rules.ts` are the decomposition brief's K4 paths; EPIC-005 §4 names `src/commands/rules.ts`.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Status stays 🟡 although every box is checked: the §1.4 Decision line (what `--kind` names, gate1-decisions item 12) is a recommended answer pending the human's Gate 1 approval.
