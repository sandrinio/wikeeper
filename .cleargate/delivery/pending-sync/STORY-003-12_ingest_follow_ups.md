---
story_id: STORY-003-12
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: CR-003 (approved 2026-10-17) §B1–B3 and Open Question 2 · SPRINT-03 decomposition brief contract K11 and shared files · walkthrough rows 7.2, 7.9, 7.20, 11.26a (formapass_management, 2026-10-17) · STORY-003-09 R3/R10, STORY-003-04 R6 · SPRINT-03 gate1-decisions.md item 9 (approved at Gate 1, 2026-10-17) and consistency-audit findings 9, 13 · verified src/ingest/validate.ts, src/ingest/snapshot.ts, src/wiki/parse-page.ts, src/commands/ingest-finish.ts, src/commands/ingest-start.ts, src/core/output.ts, src/commands/ingest-facts.ts, src/commands/ingest-abort.ts and the SPRINT-02 red tests under test/ingest
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T09:01:38Z
updated_at: 2026-10-17T09:57:40Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:58:11Z
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
  last_stamp: 2026-10-17T09:58:09Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: ""
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-17T08:46:38Z
---

# STORY-003-12: Ingest follow-ups: dropped fact lines refused, `needs_approval` output, help text
**Complexity:** L2 — one new check in `finish`'s validation (pure, reads the snapshot copy `apply` already made), one output rule for exit 3, and help text on two subcommands. No in-sprint upstream. STORY-005-03 edits `src/commands/ingest-finish.ts` after this story (it does not edit `validate.ts`), and STORY-005-07 edits `src/commands/ingest-facts.ts` after it; both list this story as a predecessor. STORY-006-12 writes the writer text for the refusal.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent that writes wiki pages during an ingest, I want `finish` to refuse a page that lost a fact line, `start` to show an approval request as a question that names the kind and its rule, and the help to say how `facts` and `abort` undo work, so that a full-page rewrite cannot silently lose captured facts and I can tell the user exactly what is about to be ingested.

### 1.2 Detailed Requirements
- **R1 — Fact line identity** (contract K11; CR-003 B1 and Open Question 2; walkthrough row 11.26a). For every page in `diff.updated` that ends in `.md`, `validateIngest` parses the page's copy in the snapshot (`.wiki/.snapshots/<id>/pages/<path>`, written by `apply`) and the page as it is now, both with `parsePage`. A fact of the snapshot copy (an entry of `Page.facts`) is kept when the page now has a fact with the same identity. The identity is:
  - its date and its status;
  - its text (`Fact.text`: everything after the status and before ` · contradicts::`, citation included), NFC-normalised, with every run of whitespace collapsed to one space;
  - its `contradicts` targets, in order.

  So a line moved to another section or position of the same page, a different list marker (`*` for `-`), other indentation or extra spaces still counts as kept. A changed date, status, wording or citation, an added or removed ` · contradicts::` part, a line that no longer parses as a fact, and a removed line count as dropped. Facts compare as a set: when the snapshot copy holds the same fact twice and the page keeps one, nothing is dropped.
- **R2 — Which pages are checked.** Only updated `.md` pages, each against its own snapshot copy (K11):
  - created pages have no snapshot copy;
  - deleted pages stay allowed and reported (STORY-003-09 R3); the report counts every deletion, so the loss is visible;
  - a fact line moved to another page counts as dropped from the page it left.

  The check also runs on a page that fails R10's frontmatter check or the citation check, so one `finish` reports every problem of the write phase.
- **R3 — Refusal.** `IngestValidation` gains `dropped: Array<{ path: string; line: string }>` (K11). `path` is relative to `pages/`, POSIX. `line` is the snapshot copy's line as written there, trimmed. Entries are sorted by path, then by the line's position in the snapshot copy. Any entry makes `ok` false, and `finish` fails like any other validation failure (STORY-003-09 R3): exit 1, code `validation_failed`, `details.dropped` beside `uncited`, `outside` and `invalid`, no index write, nothing logged, lock and snapshot kept. The human message adds this part after the `frontmatter errors:` part:
  `fact lines dropped (a replaced fact stays in the list): <path> ("<line>", "<line>"), <path> ("<line>")`
  When the writer restores the lines and runs `finish` again, the ingest completes.
- **R4 — `needs_approval` output** (CR-003 B2; walkthrough row 7.2). Exit 3 asks the user a question; it is not an error. In human mode the message goes to stderr without the `error: ` label (`src/core/output.ts:135`); every other exit code keeps the label, as today. `ingest start`'s exit-3 message becomes one line that names the origin, the size, the kind with its rule, and the reason:
  `<origin> needs approval (<size>, <kind part>): <reason>`
  - `<size>` uses `formatSize` (`6 B`, `3.5 KB`), as the `finish` report does.
  - `<kind part>` is `kind <kind>, rule <id> v<version>` when the kind has a rule; `kind <kind>, no rule for <kind>` when it has none (or there is no `kb_instructions.md`); `no kind yet` when `--kind` was not given.
  - `<reason>` is `PermissionResult.reason`, unchanged.

  The JSON envelope is unchanged: `ok: false`, `error.code` `needs_approval`, the same `details` (whose `source.kind` and `source.rule` already carry the kind and the rule version). Only `error.message` carries the new line.
- **R5 — Help text** (CR-003 B3; walkthrough rows 7.9, 7.20). The text describes what the code already does; behaviour does not change.
  - `ingest facts` description: `store the facts extracted from a source (JSON on stdin or --file); run it again before apply to replace them`. Text after the options: `Running it again before apply replaces the stored facts. After apply, changed facts make finish refuse (facts_changed): run wikeeper ingest abort <id>, then apply again. After finish, the facts cannot be replaced.`
  - `ingest abort` description: `stop an ingest that is not finished, before or after apply`. `--drop`: `also delete the registered source's files from raw/`. Text after the options: `After apply, abort restores pages/ from the snapshot and releases the lock. Before apply nothing is locked: abort records the abort in log/. --drop deletes raw/<id>.* (original, text, meta and facts), so the same source can be registered again. A finished ingest cannot be aborted.`

  `wikeeper ingest --help` lists both new descriptions.

### 1.3 Out of Scope
- An override that lets `finish` accept a dropped line. A wrong fact is corrected by a newer line (WIKI.md "Page format") or by a chat-excerpt ingest (CR-003 E5). A removal made outside an ingest is reported by `lint`'s `unlogged-change` (STORY-005-03).
- Checking fact lines across pages or on deleted pages (R2).
- The lint hook and `page_hashes` in `finish` (STORY-005-03), and `ingest facts --dry-run` (STORY-005-07).
- WIKI.md and writer-prompt text about this refusal (STORY-006-12, the writing text): `finish` refuses dropped fact lines; the writer restores them and reruns `finish`; a correction adds a new line instead of editing the old one.
- The `ai`-mode prompt for `abort --drop` (STORY-002-09, K9).
- The `denied` (exit 4) message.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question:** Does a fact line whose text was corrected in place (a typo or a date in the text fixed) count as dropped?
- **Recommended:** Yes. R1 ignores layout only (marker, indentation, spacing, position). Any change of date, status, wording or citation is a drop. WIKI.md "Page format" says a replaced fact stays in the list and the newer line carries the change, and CR-003 E5 routes corrections through a new ingest, so editing an old line in place is the writer error B1 exists to catch.
- **Decision:** Yes. `finish` treats a fact line corrected in place as dropped: the writer adds the new line and keeps the old one (R1, R3). — _approved (human, 2026-10-17, Gate 1)_

- **Question:** K11 checks each page against its own snapshot copy. Should a line moved to another page, or lost with a deleted page, count as dropped?
- **Recommended:** Keep K11 as written: per page, updated pages only (R2). A line moved out of a page that still exists is refused; this is rare, and the writer keeps the line where it was. A deleted page stays allowed (STORY-003-09 R3) because the report counts deletions, so that loss is visible, unlike a line silently dropped from an updated page. A whole-tree check would also catch deletions but changes R3 and K11.
- **Decision:** Keep K11. The check is per updated page, against its own snapshot copy: a line moved out of a page that still exists counts as dropped from that page, and deleting a whole page stays allowed and reported (R2). — _approved (human, 2026-10-17, Gate 1)_

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** STORY-005-03 edits `src/commands/ingest-finish.ts` next (lint hook, `page_hashes`), and STORY-005-07 edits `src/commands/ingest-facts.ts` next. `src/ingest/validate.ts` is edited by this story only.
- **Mitigation:** This story lands first (brief, shared files); STORY-005-03 and STORY-005-07 list it as a predecessor. It adds one field, one message part and one `details` key, and renames nothing.
- **Risk:** The check refuses ingests that SPRINT-02 accepted, such as a page rewrite that also corrects or reformats old lines.
- **Mitigation:** Layout-only changes are kept (R1). The message names every dropped line and the rule, and the lock is kept, so the writer restores the lines and reruns `finish`. STORY-006-12 (writing text) puts the rule in WIKI.md and the writer instructions: `finish` refuses dropped fact lines; restore them and rerun; a correction adds a new line instead of editing the old one.
- **Risk:** Dropping the `error: ` label for exit 3 is a rule in `src/core/output.ts`, which every command uses.
- **Mitigation:** Only `ingest start` exits 3 today (`ExitCode.NEEDS_APPROVAL` appears only at `src/commands/ingest-start.ts:256`). The JSON envelope is unchanged, and the exit-1 and exit-4 label tests (`test/output.test.ts`, `test/cli-core.red.node.test.ts` S3b) keep passing.
- **Risk:** Frozen SPRINT-02 red tests pin parts of this output.
- **Mitigation:** No red test is changed. `test/ingest/ingest-start.red.node.test.ts` S2 asserts that stderr contains `notes.md`, `6` and `--approved`; the new line keeps all three on stderr. `test/ingest/finish-frontmatter.red.node.test.ts` and `test/ingest/finish.red.node.test.ts` read `details` by key, so the new `dropped` key is safe. Direct `validateIngest` calls in tests pass `updated: []`, so they never read a snapshot copy.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A refused page finishes once its line is restored; a page whose fact lines were only moved or reformatted finishes at once. |
| Interfaces | T | The approval request on the human stderr line and in the JSON envelope; the help text is a separate surface. |
| Data | T | Which edits to a fact line count as dropped (Outline); which kind and rule the approval line names (Outline). |
| Rules | T | A dropped fact line refuses `finish` with the lock kept and nothing logged; exit 3 is not labelled as an error. |

```gherkin
Feature: Ingest follow-ups

  @rules @paths
  Scenario: Error — finish refuses a page that lost a fact line, and accepts it once the line is back
    Given "src-2026-10-17-roadmap" is applied and the snapshot copy of pages/roadmap.md has 3 fact lines
    And since apply the writer rewrote pages/roadmap.md citing "[[src-2026-10-17-roadmap]]", added one fact line and left out "- 2026-10-13 · decided · Template Studio ships in Q1. [[src-2026-10-16-roadmap]]"
    When I run "wikeeper ingest finish src-2026-10-17-roadmap --json"
    Then the exit code is 1 with error code "validation_failed"
    And error.details.dropped equals [{ path: "roadmap.md", line: "- 2026-10-13 · decided · Template Studio ships in Q1. [[src-2026-10-16-roadmap]]" }]
    And error.message contains "fact lines dropped" and "roadmap.md"
    And .wiki/.lock still names the source, its snapshot is kept, and no ingest log event exists for it
    When the writer puts the line back and I run "wikeeper ingest finish src-2026-10-17-roadmap --json"
    Then the exit code is 0 and the report lists updated ["roadmap.md"]

  @data @paths
  Scenario Outline: Which edits count as a dropped fact line
    Given "src-2026-10-17-roadmap" is applied and pages/roadmap.md has, under "## Facts", the line "- 2026-10-13 · tentative · Launch targets 2026-11-17. [[src-2026-10-16-roadmap]]"
    And, unless the row says otherwise, every page the writer creates or updates cites "[[src-2026-10-17-roadmap]]"
    When since apply the writer <edit>
    And I run "wikeeper ingest finish src-2026-10-17-roadmap --json"
    Then <result>

    Examples:
      | edit                                                                           | result                                                                        |
      | moved the line under a new "## History" heading of the same page               | the exit code is 0                                                            |
      | changed the line's marker to "*", its indentation and its spacing              | the exit code is 0                                                            |
      | deleted pages/roadmap.md                                                       | the exit code is 0 and the report lists deleted ["roadmap.md"]                |
      | changed "tentative" to "decided" in the line                                   | the exit code is 1 and error.details.dropped holds roadmap.md and the line    |
      | corrected "2026-11-17" to "2026-11-18" in the line's text                      | the exit code is 1 and error.details.dropped holds roadmap.md and the line    |
      | appended " · contradicts:: [[src-2026-10-17-roadmap]]" to the line             | the exit code is 1 and error.details.dropped holds roadmap.md and the line    |
      | moved the line to a new page pages/history.md                                  | the exit code is 1 and error.details.dropped holds roadmap.md and the line    |
      | removed the line and wrote "summary: a: b" into the page's frontmatter         | the exit code is 1, error.details.dropped holds the line and error.details.invalid names roadmap.md |
      | removed the line and the page's only citation of "[[src-2026-10-17-roadmap]]"  | the exit code is 1, error.details.dropped holds the line and error.details.uncited is ["roadmap.md"] |

  @interfaces @rules @data
  Scenario Outline: An approval request is a question that names the kind and its rule
    Given an initialised repository with ingest.permission "ask" and kb_instructions.md holding the source-kind line "roadmap (v2) → initiative.status, decision"
    And a 6-byte file notes.md
    When I run "wikeeper ingest start notes.md <kind>"
    Then the exit code is 3 and no file was created under raw/
    And stderr is exactly one line, not starting with "error:", reading: notes.md needs approval (6 B, <named>): ingest.permission is ask: show the user the source "notes.md" and rerun with --approved once they agree.
    When I rerun it with --json
    Then the exit code is 3, error.code is "needs_approval", the envelope's command is "ingest start" and error.details.source has kind <json_kind> and size 6

    Examples:
      | kind           | named                              | json_kind |
      | --kind roadmap | kind roadmap, rule roadmap v2      | "roadmap" |
      | --kind memo    | kind memo, no rule for memo        | "memo"    |
      |                | no kind yet                        | null      |

  @interfaces
  Scenario: Help says how facts and abort undo an ingest
    When I run "wikeeper ingest facts --help"
    Then the output contains "Running it again before apply replaces the stored facts" and "facts_changed"
    When I run "wikeeper ingest abort --help"
    Then the output contains "before or after apply", "also delete the registered source's files from raw/" and "A finished ingest cannot be aborted"
    And "wikeeper ingest --help" shows both new descriptions
    And for a source registered but not applied, "wikeeper ingest abort <id> --drop --json" exits 0, leaves no raw/<id>.* file and logs one abort event
    And "wikeeper ingest start" of the same file then registers it again with status "registered"
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch wiki, apply an ingest, delete one fact line from an existing page in an editor, run `wikeeper ingest finish <id>` and read the message; put the line back and run `finish` again.
- [ ] In `ask` mode, run `wikeeper ingest start <file> --kind <kind>` without `--json` and read the stderr line; then read `wikeeper ingest facts --help` and `wikeeper ingest abort --help`.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/ingest/validate.ts` |
| Related Files | `src/commands/ingest-finish.ts`, `src/commands/ingest-start.ts`, `src/core/output.ts`, `src/commands/ingest-facts.ts`, `src/commands/ingest-abort.ts` |
| Test Files | `test/ingest/finish.test.ts`, `test/output.test.ts` |
| Test Files (new) | `test/ingest/ingest-follow-ups.test.ts`, `test/ingest/ingest-follow-ups.red.node.test.ts` |
| New Files Needed | `test/ingest/ingest-follow-ups.test.ts`, `test/ingest/ingest-follow-ups.red.node.test.ts` |

- **Notes on the files above:**
  - Test files: `test/ingest/ingest-follow-ups.red.node.test.ts` (QA-Red).
  - New files needed: `test/ingest/ingest-follow-ups.test.ts` and QA-Red's `test/ingest/ingest-follow-ups.red.node.test.ts`.
- **Read, not edited (consumed, not modified):** `src/ingest/snapshot.ts` (`snapshotDir`), `src/wiki/parse-page.ts` (`parsePage`, `Fact`), `src/ingest/report.ts` (`formatSize`).

### 3.2 Technical Logic
- **Dropped check** (R1–R3), inside `validateIngest`, with no signature change; it still only reads.
  - The loop over created and updated pages already reads and parses each page; keep that one parse.
  - For each updated `.md` page, read the snapshot copy at `path.join(snapshotDir(paths, sourceId), "pages", ...rel.split("/"))`. A copy that cannot be read throws `WikeeperError(ExitCode.ERROR, "snapshot_missing", …)` with the `abort` hint, as `finish` does when the whole snapshot is missing (STORY-003-09 R1). It throws before any write, so the lock is kept.
  - `factKey(f) = JSON.stringify([f.date, f.status, f.text.normalize("NFC").replace(/\s+/g, " ").trim(), f.contradicts])`. Build the set of keys of the page now. Each snapshot fact whose key is missing adds one entry; a key is reported once.
  - `line` comes from the snapshot copy's lines, split as `parsePage` splits them (`text.replace(/^﻿/, "").split(/\r?\n/)`), at index `f.line - 1`, trimmed.
  - `parsePage` parses fact lines below the frontmatter even when the frontmatter is invalid (and treats the whole file as body when there is no closing `---`), so pages in `invalid` are checked too (R2).
  - `dropped` is stable-sorted by path; within a page, entries keep snapshot order. `ok` also requires `dropped.length === 0`.
- **`ingest finish`** (R3): in the `!v.ok` branch, add the `fact lines dropped (a replaced fact stays in the list): …` part after the `frontmatter errors:` part, quoting each line, and pass `dropped: v.dropped` in `details`. The rest of the message is unchanged.
- **Exit-3 label** (R4): in `emitError`, human mode writes `${message}\n` when `exitCode === ExitCode.NEEDS_APPROVAL` and `error: ${message}\n` otherwise. JSON mode is unchanged. The rule lives in `output.ts`, not in `ingest start`, so any later command that asks for approval behaves the same way.
- **`ingest start`** (R4): `kind` and `rule` are already in scope (`src/commands/ingest-start.ts:182`, `:196`). Build the kind part, then `${resolved.origin} needs approval (${formatSize(size)}, ${kindPart}): ${perm.reason}`. `details` is unchanged.
- **Help** (R5): `.description(…)` and `.addHelpText("after", "\n" + text)` on the `facts` and `abort` subcommands, and the new `--drop` text. Commander writes help to stdout through `io.stdout`.

### 3.3 API Contract (if applicable)

Changed export (K11, owned here; additive to STORY-003-09's frozen `IngestValidation`; consumer: `src/commands/ingest-finish.ts`, in this story. STORY-005-03 edits `ingest-finish.ts` later but neither reads `dropped` nor edits `validate.ts`):

```ts
// src/ingest/validate.ts
export interface IngestValidation {
  ok: boolean;
  uncited: string[];
  outside: string[];
  invalid: Array<{ path: string; message: string }>;
  dropped: Array<{ path: string; line: string }>;   // K11, STORY-003-12
  warnings: string[];
}
export function validateIngest(                        // signature unchanged
  paths: ResolvedPaths, sourceId: string, diff: PageDiff, outside: { modified: string[]; deleted: string[] },
): Promise<IngestValidation>;
```

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper ingest finish <id>` | CLI | None | `--json` | unchanged on success; error `validation_failed` with `details: { uncited, outside, invalid, dropped }` |
| `wikeeper ingest start <source>` | CLI | None | unchanged | exit 3: one stderr line without `error: `; JSON envelope unchanged |
| `wikeeper ingest facts --help`, `wikeeper ingest abort --help` | CLI | None | — | help text (R5) |

## Task Breakdown

- [ ] `validate.ts`: fact identity, `dropped` from the snapshot copy of each updated page, `ok` -> R1, R2, R3
- [ ] `ingest-finish.ts`: the `fact lines dropped` message part and `details.dropped` -> R3
- [ ] `output.ts`: no `error: ` label for exit 3 in human mode -> R4
- [ ] `ingest-start.ts`: the approval line with size, kind and rule -> R4
- [ ] `ingest-facts.ts`, `ingest-abort.ts`: descriptions, `--drop` text, text after the options -> R5
- [ ] Developer unit tests in `test/ingest/finish.test.ts`, `test/output.test.ts` and `test/ingest/ingest-follow-ups.test.ts` -> §4.1

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | fact identity: layout ignored, while date, status, text, citation and `contradicts` each change it; a fact held twice in the snapshot copy and kept once is not dropped; created, deleted and non-`.md` pages are not checked; a page with invalid frontmatter is still checked; an unreadable snapshot copy gives `snapshot_missing`; `emitError` prints exit 3 without the label and exits 1 and 4 with it |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 4 | One per Gherkin scenario (Outline rows counted once), through `runCli`, in QA-Red's `test/ingest/ingest-follow-ups.red.node.test.ts`. Red-test hygiene: error rows assert `error.code` and the envelope's `command`, not only the exit code. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The STORY-003-04 and STORY-003-09 tests (red and Developer) pass unchanged.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/ingest/validate.ts:35` — `validateIngest`, where the dropped-fact check joins the citation and frontmatter checks.
- **Surface:** `src/ingest/snapshot.ts:71` — `takeSnapshot` copies `pages/` to `.snapshots/<id>/pages/` at `apply`, so the old page text is on disk; `snapshotDir` at `src/ingest/snapshot.ts:20`.
- **Surface:** `src/wiki/parse-page.ts:39` — `Fact` (date, status, text, contradicts, line), parsed by `FACT_RE` at `src/wiki/parse-page.ts:98`.
- **Surface:** `src/commands/ingest-finish.ts:142` — the `validation_failed` branch that builds the message and `details`.
- **Surface:** `src/core/output.ts:135` — the `error: ` label on every human error.
- **Surface:** `src/commands/ingest-start.ts:254` — the `needs_approval` throw; `formatSize` at `src/ingest/report.ts:32`.
- **Surface:** `src/commands/ingest-facts.ts:40` and `src/commands/ingest-abort.ts:20` — the help descriptions; `--drop` at `src/commands/ingest-abort.ts:22`.
- **Coverage of this requirement:** partial — the snapshot copy, the parser and the refusal path exist; the comparison, the exit-3 rule and the new text are new.

## Prior work

- [[CR-003]] (B1–B3 and Open Question 2, approved 2026-10-17), [[EPIC-003]] (parent, archived), [[STORY-003-09]] (`finish` validation and the R10 frontmatter refusal this check follows), [[STORY-003-04]] (`ingest start`, exit 3), [[STORY-003-06]] (`ingest facts`), [[STORY-003-08]] (`apply`, snapshot, `abort`). The wiki and archive grep found no other prior work on dropped fact lines or the exit-3 label.

## Why not simpler?

- **Smallest existing surface that could carry this:** `validateIngest` (`src/ingest/validate.ts:35`) plus the snapshot copy that `apply` already writes.
- **Why isn't extension / parameterization / config sufficient?** This story is that extension. Comparing hashes cannot tell a dropped line from an added one, and comparing whole lines refuses harmless reformatting, so the check compares parsed fact lines by their content. It reuses the snapshot copy and the parser and adds no new storage. The exit-3 rule and the help text are one-line changes on existing surfaces, bundled here because each alone is too small to be a story.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (EPIC-003 §4 names `validate.ts` and the per-verb command files; `src/core/output.ts` is verified codebase grounding outside the epic's list.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
