---
story_id: STORY-005-03
parent_epic_ref: EPIC-005
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
ambiguity: 🟡 Medium
context_source: EPIC-005 (approved 2026-10-16) §2, §4 (lint.stale_after_days), §5 · CR-002 D1 · CR-003 E2 · architecture.md §7.3 (finish step 5), §8, D-27, D-28 · SPRINT-03 decomposition brief (design call — hash-based unlogged-change with a baseline for pre-SPRINT-03 events; K2, K3) · STORY-003-09 R4, R5, R8 · verified src/ingest/log.ts, src/commands/ingest-finish.ts, src/ingest/snapshot.ts, src/ingest/lock.ts, src/ingest/lint-hook.ts, src/core/config.ts, src/core/gitignore.ts, src/search/since.ts, src/search/filters.ts, src/wiki/parse-page.ts · probed read-only against ~/walkthrough-wiki/.wiki (9 ingest events, 20 pages) on 2026-10-17
actor: AI coding agent
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-005-02
  - STORY-003-12
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T09:08:14Z
updated_at: 2026-10-17T09:08:14Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:10:13Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-005-03
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T09:10:27Z
  sessions: []
---

# STORY-005-03: `unlogged-change`, `stale-fact`, page hashes in the ingest log, lint hook in `finish`
**Complexity:** L3 — `finish` records a hash for each page it changed (contract K3, owned here). Two new page checks follow: one reads the log, the write lock and the snapshot; the other reads the entity model. The real lint hook then runs inside `finish`. It lands after STORY-005-02 (registry, K2) and STORY-003-12 (the earlier edit of `src/commands/ingest-finish.ts`).

## 1. The Spec (The Contract)

### 1.1 User Story
As a user whose agent writes the wiki, I want lint to tell me when a page changed without an ingest recording it and which statuses and planned dates have gone stale, and I want `finish` to show the lint problems in the pages it just wrote. Then shell writes that the guard cannot see are still caught ([[CR-002]] D1), and I know which facts to check again.

### 1.2 Detailed Requirements
- **R1 — Page hashes (K3).**
  - `IngestLogEvent` (`src/ingest/log.ts:13`) gains the optional field `page_hashes?: Record<string, string>`. It has one entry per created or updated `.md` page, keyed by the path relative to `pages/` (POSIX, sorted).
  - Each value is `pageHash(text)`: the sha256 hex of the page's UTF-8 text, after removing a leading BOM and changing CRLF to LF. (Decided here: a checkout with `core.autocrlf` rewrites line endings, and raw-byte hashes (`sha256File`, `src/core/manifest.ts:48`) would then make every page look changed.)
  - `finish` computes the hashes in the loop that already reads the changed pages (`src/commands/ingest-finish.ts:163`) and passes them to `writeLogEvent` (`src/commands/ingest-finish.ts:169`). An ingest with no changed `.md` page records `page_hashes: {}`.
  - In `src/ingest/log.ts`:
    - `"page_hashes"` is appended to `KEY_ORDER.ingest` (`src/ingest/log.ts:62`). `orderedFields` keeps only the listed keys (`src/ingest/log.ts:129`).
    - `validate` (`src/ingest/log.ts:79`) adds `need(page_hashes === undefined || isPageHashes(page_hashes), "page_hashes")`. The new export `isPageHashes(v)` is true for a plain object whose keys are non-empty strings and whose values are 64 lower-case hex characters.
  - An event without the field is written byte for byte as before. The re-run path (STORY-003-09 R6) writes no event and is unchanged.
- **R2 — `unlogged-change` (error): inputs.**
  - The ingest events are the `type: "ingest"` events of `ctx.log`, in log order. Their `created`, `updated` and `deleted` lists are read as `pagesChangedSince` reads them (`src/search/since.ts:65`): a value that is not an array counts as empty, and entries that are not strings are skipped.
  - The newest event touching page P is the last event that lists P in any of the three lists.
  - `hashed(E)` means event E has a `page_hashes` field for which `isPageHashes` is true.
  - Only `.md` pages are judged. Pages listed in config `private` are never judged: a page is private when it equals an entry, or lies inside an entry that names a directory, read as `managedIgnoreEntries` reads them (`src/core/gitignore.ts:89`). Each clone holds its own private pages, or none (D-27).
- **R3 — `unlogged-change`: decisions.** E is the newest ingest event touching P.

  | State of P | Finding (path P, no line) |
  |---|---|
  | exists, and no ingest event touches it | `in no ingest log event` |
  | not `hashed(E)` (every ingest before 0.3.0) | none: the baseline (K3) |
  | `hashed(E)`, E deleted P, and P exists | `deleted by ingest <src> (<log file>) and created again without a log entry` |
  | `hashed(E)`, E created or updated P, and P is missing | `deleted without a log entry (last recorded by ingest <src>, <log file>)` |
  | `hashed(E)`, E created or updated P, and `E.page_hashes` has no entry for P | none: counted with the baseline |
  | `hashed(E)`, and `pageHash(current text)` differs from `E.page_hashes[P]` | `changed since ingest <src> recorded it (<log file>)` |
  | the hash matches | none |

  When the baseline holds any page, the check adds one `info` finding with no path: `<n> page(s) were last recorded by an ingest without page hashes (before wikeeper 0.3.0); unlogged-change checks them after their next ingest`. With `only` set, `runLint` drops it (STORY-005-02 R2). `<log file>` is `StoredLogEvent.file`.
- **R4 — During an open write phase, the check judges the wiki as it was at apply.** This applies when the write lock names source S (`readLock`, `src/ingest/lock.ts:42`) and `readSnapshot(paths, S)` returns a snapshot (`src/ingest/snapshot.ts:109`). Then:
  - the page set is the snapshot's `.md` keys, without paths that have a dot segment, as `diffPages` excludes them (`src/ingest/diff.ts:13`);
  - each page's text is its copy under `snapshotDir(paths, S)/pages/` (`src/ingest/snapshot.ts:20`);
  - ingest events with `source_id` S, or with `at` at or after `snapshot.taken_at`, are ignored.

  So pages created since apply are not judged, and the open ingest's own edits are never reported (`finish` attributes them). Messages get the suffix `, before ingest <S> was applied`. When the lock or the snapshot cannot be read, the check runs as if there were no lock.
- **R5 — The `finish` lint hook (K3, STORY-003-09 R8).**
  - `src/commands/ingest-finish.ts` exports `FINISH_CHECKS = ["broken-link", "uncited-claim", "unlogged-change"]` and `finishLintHook`. It calls `setLintHook(finishLintHook)` when the module loads, so every program that includes `finish` has the hook, and a test's own `setLintHook` afterwards wins.
  - `finishLintHook({ paths, changed })` loads the config, `loadPages(paths.pagesDir)` and `readLogEvents(paths).events`. It returns `runLint({ paths, config, pages, kb: null, log, now: new Date(), only: changed }, { scope: "pages", checks: [...FINISH_CHECKS] })`.
  - The hook runs at `src/commands/ingest-finish.ts:203`, after the ingest event is written and while the lock and snapshot still exist (they are removed at `src/commands/ingest-finish.ts:215`). So R4 applies: the changed pages are judged as they were at apply. A page that was shell-edited before this ingest touched it is reported once. From then on, this ingest's log entry covers it.
  - `orphan-page`, `stale-fact` and `index-drift` do not run in the hook. They are about the whole wiki or about older content, and `index.md` was just rebuilt.
  - Findings never change `finish`'s exit code and never undo the ingest (STORY-003-09 R5). They appear in `data.lint` and as warnings. A hook that throws stays the existing `lint hook failed:` warning.
  - The warning line `lintLine` (`src/commands/ingest-finish.ts:35`) becomes `lint ${findingLine(f, "pages", paths)}` (STORY-005-02 §3.3), for example `lint [error] uncited-claim .wiki/pages/team.md:9: claim has no [[src-…]] citation`.
- **R6 — `stale-fact` (warning).**
  - **Age.** Today is the UTC date of `ctx.now`. A date's age is the number of whole days from that date to today. A volatile fact is stale when its age is greater than `config.lint.stale_after_days` (default 30, `src/core/config.ts:77`).
  - **Volatile facts.** They are judged per entity of `pageEntities(page)` (`src/wiki/parse-page.ts:381`). There are two kinds.
  - **Status.**
    - The status is the entity's last `status::` typed link. A page entity without one uses a string `status` in its frontmatter instead. These are the values `search --status` matches (`src/search/filters.ts:65`).
    - Its date is the newest date among the entity's own fact lines (`Entity.facts`). An entity without fact lines is not judged.
    - A terminal status is not volatile. The first run of letters in the value, lower-cased, is one of `TERMINAL_STATUSES`: done, complete, completed, closed, cancelled, canceled, superseded, rejected, resolved, shipped, released, archived.
    - The finding is at the typed link's line; a frontmatter status has no line. Message: `<entity name>: status "<value>" was last dated <date>, <n> days ago (lint.stale_after_days is <N>)`.
  - **Planned date.**
    - This is a `tentative` fact line whose text, with its wikilinks removed, contains a calendar date (`YYYY-MM-DD` and `isCalendarDate`, `src/core/dates.ts:6`), when no fact line of the same entity has a later date.
    - Its date is the fact's own date. The finding is at the fact line. Message: `<entity name>: tentative fact from <date> names <first date in its text>, and nothing newer is recorded (<n> days ago; lint.stale_after_days is <N>)`.
  - **Not judged.** Older fact lines are history and are never judged (WIKI.md: a replaced fact stays in the list).
- **R7 — Registration.** `src/lint/checks.ts` appends `unloggedChangeCheck` (`unlogged-change`, error) and `staleFactCheck` (`stale-fact`, warning) to `PAGE_CHECKS`, after STORY-005-02's four checks, with one import and one entry each. EPIC-005's exit rule then covers them: an `unlogged-change` finding makes `wikeeper lint` exit 1.
- **R8 — Read-only.** Both checks only read pages, `log/`, the lock and the snapshot. STORY-005-02's read-only test (`test/lint/lint-command.test.ts`) gets an unlogged change and a stale status in its fixture, so the test covers both modes of R4.

### 1.3 Out of Scope
- Accepting a merged page (Open Question 1).
- Changes made during an open write phase. By design they belong to that ingest, and `finish` attributes them.
- Backfilling hashes for pages last ingested before 0.3.0. They are the baseline until their next ingest.
- File times as evidence. A fresh clone resets them, which is why the design uses hashes.
- WIKI.md text about shell writes and `unlogged-change` ([[CR-003]] E2; STORY-006-10 and STORY-006-09).
- Running `stale-fact` or `orphan-page` in `finish` (R5).

### 1.4 Open Questions

- **Question:** After a git merge that combines two ingests' edits to one page (team use, D-28), the merged page matches neither recorded hash. `unlogged-change` then reports it as an error until an ingest touches that page again, and that ingest's `finish` reports it once more (R5). Accept this for SPRINT-03?
- **Recommended:** Yes. Keep `error`. The human works in one clone today, and the finding names the last ingest and its log file, so a merged page is easy to recognise. STORY-006-09's WIKI.md text says that after a merge, pages edited on both branches are reported until their next ingest. Accepting a merge is a follow-up, for example a `merge` log event written by `index rebuild` after a pull. Doing it now would also accept real shell writes. Making the check a `warning` would keep merges from failing `lint`, but shell writes would then no longer set exit 1.
- **Human decision:** pending (Brief review).

Decided while drafting (not open): hashes ignore line endings (R1). Private pages are never judged (R2). The check judges an open write phase as of apply, which is also what makes the `finish` hook useful (R4, R5). The terminal statuses are listed in R6. `FINISH_CHECKS` is a subset of the page checks (R5).

### 1.5 Risks

- **Risk:** The SPRINT-03 Goal-check walkthrough runs in `walkthrough-wiki`. All 9 of its ingest events predate 0.3.0, so every page there is baseline, and a shell edit of an existing page is not reported.
- **Mitigation:** The `info` finding says so. The walkthrough first ingests or re-ingests the page under test with 0.3.0, then edits it with the shell.
- **Risk:** A `post_ingest` hook that rewrites pages (a formatter, say) makes every page it touches look changed. Hashes are taken before the hooks run, in STORY-003-09 R4's order.
- **Mitigation:** The finding is correct: the hook changed pages after the ingest recorded them. STORY-006-09's WIKI.md text says `post_ingest` hooks must not edit pages.
- **Risk:** STORY-003-12 and this story both edit `src/commands/ingest-finish.ts`. STORY-004-07 and STORY-005-06 edit `src/ingest/log.ts` too.
- **Mitigation:** This story lands after STORY-003-12. Its `log.ts` edits (the interface, `KEY_ORDER`, `validate`) are separate hunks from theirs (`summaryLine`).
- **Risk:** With the hook registered at module load, the first `finish` test in a file runs with the real hook.
- **Mitigation:** The existing finish tests reset with `setLintHook(null)` in `afterEach` and assert warnings with `toContain`. The real hook only adds warnings.
- **Risk:** Tests inject a fixed `now` into `finish`, so the new event's `at` can fall before `snapshot.taken_at`.
- **Mitigation:** R4 also ignores events whose `source_id` is the lock's source, not only events by time.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | An unlogged change is found after `finish`, during an open write phase, and by `finish`'s own hook. A page can be edited, deleted, recreated or never logged. |
| Interfaces | T | `wikeeper lint` and the `finish` report (the lint hook) both show the findings. |
| Data | T | Outlines over page states (CRLF only, private, baseline) and over fact shapes and ages for `stale-fact`. |
| Rules | T | Baseline skip; terminal statuses; findings never change `finish`'s exit code; a malformed `page_hashes` is refused on write. |

```gherkin
Feature: unlogged-change, stale-fact and the finish lint hook

  @paths @rules
  Scenario Outline: Lint detects a change made outside an ingest
    Given an initialised wiki where ingest "src-2026-10-16-notes" created pages/team.md and pages/risks.md and finished with page hashes
    And then <change>
    When I run "wikeeper lint --json"
    Then <result>

    Examples:
      | change | result |
      | pages/team.md was edited with the shell | check "unlogged-change" names "team.md" with severity "error", "wikeeper lint" prints a line naming ".wiki/pages/team.md", and the exit code is 1 |
      | pages/team.md was deleted with the shell | check "unlogged-change" names "team.md" as deleted without a log entry |
      | pages/notes.md was created with the shell | check "unlogged-change" names "notes.md" as in no ingest log event |
      | ingest "src-2026-10-17-cleanup" deleted pages/risks.md, and pages/risks.md was then written with the shell | check "unlogged-change" names "risks.md" as created again without a log entry |
      | pages/team.md was rewritten with CRLF line endings and nothing else changed | no "unlogged-change" finding, and the exit code is 0 |
      | config private is ["team.md"] and pages/team.md was edited with the shell | no "unlogged-change" finding |

  @rules @data
  Scenario: finish records page hashes, and pages last ingested before 0.3.0 are the baseline
    Given the log holds an ingest event for "src-2026-10-01-old", written without page_hashes, that created pages/old.md
    And pages/old.md was then edited with the shell
    When I run "wikeeper lint --json"
    Then no "unlogged-change" finding has a path, and one "unlogged-change" finding with severity "info" and no path counts 1 page
    When "src-2026-10-16-notes" is applied, its writer creates pages/team.md and updates pages/old.md, both citing it, and I run "wikeeper ingest finish src-2026-10-16-notes --json"
    Then its ingest log event has page_hashes with exactly the keys "old.md" and "team.md", each the sha256 of that page's text with LF line endings
    And "wikeeper lint --json" has no "unlogged-change" finding

  @interfaces @rules
  Scenario: finish reports lint findings for the pages it changed, judged as they were at apply
    Given an initialised wiki whose pages were all recorded with hashes by ingest "src-2026-10-15-plan"
    And pages/roadmap.md was then edited with the shell, and pages/glossary.md links "[[Nobody]]"
    And "src-2026-10-16-notes" is applied, and its writer updated pages/roadmap.md and created pages/team.md, both citing it, with one uncited paragraph and the link "[[Nobody Here]]" in pages/team.md
    When I run "wikeeper lint --json" before finish
    Then check "unlogged-change" names "roadmap.md" and no other page, and no file in the repository changed
    When I run "wikeeper ingest finish src-2026-10-16-notes --json"
    Then the exit code is 0 and .wiki/.lock is gone
    And data.lint holds unlogged-change for "roadmap.md", and uncited-claim and broken-link for "team.md", and nothing for "glossary.md"
    And data.lint has no orphan-page, stale-fact or index-drift finding
    And the warnings include a line starting "lint [error] unlogged-change .wiki/pages/roadmap.md: changed since ingest src-2026-10-15-plan recorded it"
    And "wikeeper lint --json" afterwards has no "unlogged-change" finding

  @data @rules
  Scenario Outline: stale-fact reports statuses and planned dates older than lint.stale_after_days
    Given today is 2026-11-20, lint.stale_after_days is <days>, and pages/projects/atlas.md has an entity with <content>
    When I run "wikeeper lint --check stale-fact --json"
    Then <result>, and the exit code is 0

    Examples:
      | days | content | result |
      | 30 | "status:: In progress" and its newest fact line dated 2026-10-20 | one warning at the status:: line naming "In progress" and 2026-10-20 |
      | 30 | "status:: In progress" and its newest fact line dated 2026-10-21 | no finding |
      | 30 | "status:: Completed" and its newest fact line dated 2026-07-01 | no finding |
      | 30 | "status:: Draft" and no fact lines | no finding |
      | 30 | the newest fact "- 2026-10-15 · tentative · Launch targets 2026-11-17. [[src-2026-10-15-plan]]" | one warning at that fact line naming 2026-11-17 |
      | 30 | that tentative fact and a later fact line dated 2026-11-01 | no finding |
      | 30 | the newest fact "- 2026-10-01 · tentative · Hiring may slip. [[src-2026-10-01-hr]]" | no finding |
      | 60 | "status:: In progress" and its newest fact line dated 2026-10-20 | no finding |

  @rules
  Scenario Outline: Error — a malformed page_hashes is refused on write and treated as missing on read
    Given an initialised wiki
    When <action>
    Then <result>

    Examples:
      | action | result |
      | an ingest event with page_hashes { "team.md": "abc" } is written with writeLogEvent | it throws error code "invalid_event" naming "page_hashes", and no log file is written |
      | ingest "src-2026-10-16-notes" recorded pages/team.md, its log file is hand-edited to "page_hashes: oops", pages/team.md is edited with the shell, and I run "wikeeper lint --json" | no "unlogged-change" finding names "team.md", the info finding counts 1 page, and the exit code is 0 |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch wiki on the 0.3.0 build, ingest a note. Then run `echo "- 2026-10-17 · decided · Shell line." >> .wiki/pages/<page>.md` and `wikeeper lint`. Expect `[error] unlogged-change` naming the page, and exit 1.
- [ ] Ingest a second source that updates the same page, and read the `finish` report: it names the earlier shell edit once. Then run `wikeeper lint` again: no `unlogged-change`.
- [ ] Run `wikeeper lint` in a copy of `walkthrough-wiki`. Expect the `info` line counting 20 baseline pages.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/lint/unlogged.ts` |
| Related Files | `src/lint/staleness.ts`, `src/lint/checks.ts`, `src/ingest/log.ts`, `src/commands/ingest-finish.ts`, `test/lint/unlogged.test.ts`, `test/lint/staleness.test.ts`, `test/ingest/finish-lint.test.ts`, `test/ingest/log.test.ts`, `test/lint/lint-command.test.ts` |
| New Files Needed | Yes — `src/lint/unlogged.ts`, `src/lint/staleness.ts`, `test/lint/unlogged.test.ts`, `test/lint/staleness.test.ts`, `test/ingest/finish-lint.test.ts` |

### 3.2 Technical Logic
- **`src/lint/unlogged.ts`.**
  - `pageHash` uses `createHash("sha256")` over the normalised text (R1).
  - `run(ctx)` first decides the mode (R4): `readLock(paths)`, and if `held` and `lock !== null`, `readSnapshot(paths, lock.source_id)`.
  - It builds `lastTouch: Map<page, { stored: StoredLogEvent; change: "created" | "updated" | "deleted" }>` in one pass over the kept ingest events.
  - The page set is, in normal mode, `ctx.pages.map((p) => p.path)`, with each text read from `paths.pagesDir`. Page objects do not keep the raw text. In snapshot mode it is the snapshot's keys and copies.
  - It then walks the union of the page set and `lastTouch`'s keys that end in `.md`, without private pages, and applies the R3 table. Its findings are sorted later by `runLint`.
- **`src/lint/staleness.ts`.**
  - For each page and each entity from `pageEntities`, it takes the last typed link with `key === "status"`; for a page entity without one, it falls back to `page.frontmatter.data` with the `status` key matched case-insensitively and a string value.
  - The newest fact date is the maximum of `entity.facts[].date`, which are ISO dates, so the maximum is a string compare.
  - Planned dates: for each `entity.facts` entry with `status === "tentative"` and the newest date of its entity, remove `/!?\[\[[^\]]*\]\]/g` from `text`, then take the first `\d{4}-\d{2}-\d{2}` that passes `isCalendarDate`.
  - Age is `(Date.UTC(today) - Date.UTC(date)) / 86_400_000`.
  - The status lookup in `src/search/filters.ts` (`candidates`, `src/search/filters.ts:65`) is not exported, so this module reads the same two places itself. `filters.ts` is not edited (STORY-004-07 owns it this sprint).
- **`src/ingest/log.ts`.** R1's three edits. The `need(...)` message reuses the existing form: `ingest log event is missing or has an invalid "page_hashes"`.
- **`src/commands/ingest-finish.ts`.**
  - In the `changedPages` loop, keep `pageHashes[rel] = pageHash(text)` for each `.md` page and pass `page_hashes` (keys sorted with `compareCodeUnits`) to `writeLogEvent`.
  - Add `FINISH_CHECKS`, `finishLintHook` and the module-level `setLintHook(finishLintHook)`, and change `lintLine` (R5).
  - Nothing else in the post steps moves.
- **`src/lint/checks.ts`.** R7's two imports and two array entries.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper lint` | CLI | None | unchanged (STORY-005-02) | `LintData`; adds `unlogged-change` and `stale-fact` findings |
| `wikeeper ingest finish <id>` | CLI | None | unchanged | `IngestReport`; `lint` now holds `FINISH_CHECKS` findings |

Frozen exports (consumers: STORY-005-05 reads ingest events; STORY-006-09 names the check ids):

```ts
// src/ingest/log.ts (K3, additive)
export interface IngestLogEvent { /* SPRINT-02 fields */ page_hashes?: Record<string, string> }
export function isPageHashes(v: unknown): v is Record<string, string>;

// src/lint/unlogged.ts
export function pageHash(text: string): string;    // sha256 hex of the text without a leading BOM, CRLF → LF
export const unloggedChangeCheck: LintCheck;       // "unlogged-change", error, scope "pages"

// src/lint/staleness.ts
export const TERMINAL_STATUSES: readonly string[];
export const staleFactCheck: LintCheck;            // "stale-fact", warning, scope "pages"

// src/commands/ingest-finish.ts
import type { LintHook } from "../ingest/lint-hook.js";
export const FINISH_CHECKS: readonly string[];     // ["broken-link", "uncited-claim", "unlogged-change"]
export const finishLintHook: LintHook;
```

Consumed (frozen): `runLint`, `PAGE_CHECKS`, `LintCheck`, `LintContext`, `findingLine` (K2, STORY-005-02); `setLintHook`, `LintHook`, `LintFinding` (C9); `readLock`, `readSnapshot`, `snapshotDir`, `SnapshotInfo` (C8); `readLogEvents`, `writeLogEvent`, `StoredLogEvent` (C7); `loadPages`, `pageEntities`, `Entity` (C1); `loadConfig` (`src/core/config.ts`); `isCalendarDate` (`src/core/dates.ts`).

## Task Breakdown

- [ ] `src/ingest/log.ts`: `page_hashes` on `IngestLogEvent`, `KEY_ORDER`, `isPageHashes`, the `validate` rule -> R1
- [ ] `src/lint/unlogged.ts`: `pageHash`, event reading, the R3 decisions, private pages, the baseline `info` finding -> R2, R3
- [ ] `src/lint/unlogged.ts`: snapshot mode while the lock is held -> R4
- [ ] `src/commands/ingest-finish.ts`: `page_hashes` in the ingest event -> R1
- [ ] `src/commands/ingest-finish.ts`: `FINISH_CHECKS`, `finishLintHook`, registration at module load, `lintLine` via `findingLine` -> R5
- [ ] `src/lint/staleness.ts`: status and planned-date rules, `TERMINAL_STATUSES` -> R6
- [ ] `src/lint/checks.ts`: append both checks -> R7
- [ ] Extend the read-only test fixture in `test/lint/lint-command.test.ts` -> R8
- [ ] Unit tests per module, and CLI tests per Gherkin scenario -> §2.1

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 9 | `pageHash` (BOM, CRLF, unchanged LF text); `isPageHashes` (array, null, short hash, upper-case hex, empty key); `writeLogEvent` without `page_hashes` writes the SPRINT-02 bytes; every R3 row, including a `deleted` list that is not an array; private entries (a file and a directory); snapshot mode (pages created since apply skipped, the lock's source ignored by id and by time, unreadable snapshot falls back to normal mode); the baseline `info` finding absent with `only`; `stale-fact` status sources (typed link, frontmatter, last of two `status::` lines), terminal values and an age of exactly `stale_after_days`; planned-date wikilink stripping and a later fact on the same entity |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli` with a temp repository; scenarios 2 and 3 drive `ingest apply` and `ingest finish` for real. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The SPRINT-02 ingest tests still pass with the real hook registered (`test/ingest/finish.test.ts`, `test/ingest/finish.red.node.test.ts`, `test/e2e/ingest.test.ts`).
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/ingest/log.ts:62` — `KEY_ORDER.ingest`; `orderedFields` (`src/ingest/log.ts:129`) drops keys not listed there, so `page_hashes` must be added; `src/ingest/log.ts:82` — the `need(...)` validation the new field joins.
- **Surface:** `src/commands/ingest-finish.ts:163` — the loop that already reads every changed page after validation; `src/commands/ingest-finish.ts:203` — the lint hook call, before `removeSnapshot` and `releaseLock` (`src/commands/ingest-finish.ts:215`).
- **Surface:** `src/ingest/lint-hook.ts:19` — `setLintHook`, the C9 hook point this story fills.
- **Surface:** `src/ingest/snapshot.ts:109` — `readSnapshot`; `src/ingest/lock.ts:42` — `readLock`.
- **Surface:** `src/core/config.ts:77` — `lint.stale_after_days`, default 30.
- **Surface:** `src/search/since.ts:65` — tolerant reading of ingest events' page lists.
- **Coverage of this requirement:** partial — the log, lock, snapshot, hook point and config key exist; the hashes, both checks and the hook body are net-new.

## Prior work

- [[EPIC-005]] (parent). [[CR-002]] D1 makes this check the backstop for shell writes, and [[CR-003]] E2 has WIKI.md name it. It builds on [[STORY-003-09]] (R5: post steps never fail a validated ingest; R8: the hook point), [[STORY-003-07]] (log events), [[STORY-003-08]] (lock and snapshot), [[STORY-004-01]] (entities and facts), [[STORY-004-04]] (reading page lists from ingest events) and [[STORY-005-02]] (registry, `findingLine`). A grep of the wiki index (2026-10-17) lists no other lint item; no duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** the ingest event (`src/ingest/log.ts:13`) and the C9 hook point (`src/ingest/lint-hook.ts:19`).
- **Why isn't extension / parameterization / config sufficient?** The ingest event already lists which pages an ingest touched, but not what they contained. Without a hash, a later edit cannot be told apart. File times reset on every clone (the design call), and wikeeper does not require git history. So one additive field is the smallest record that works, and the baseline rule keeps old events valid. `stale-fact` needs the entity model (which facts belong to which `status::`), which only the page parser has.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2. (R1: scenarios 2 and 5; R2–R3: scenarios 1, 2 and 5; R4–R5: scenario 3; R6: scenario 4; R7: scenarios 1 and 4; R8: scenario 3 and STORY-005-02's read-only scenario.)
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (New source files are EPIC-005 §0's `src/lint/unlogged.ts` and `src/lint/staleness.ts`; the rest exist and were verified 2026-10-17.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Open Question 1 (§1.4) keeps this story at 🟡 until the human decides.
