---
story_id: STORY-005-03
parent_epic_ref: EPIC-005
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-005 (approved 2026-10-16) §2, §5 · CR-002 D1 · CR-003 E2 · architecture.md §7.3 (finish step 5), §8, D-27, D-28 · SPRINT-03 decomposition brief (design call — hash-based unlogged-change with a baseline for pre-SPRINT-03 events; K2, K3) · SPRINT-03 gate1-decisions.md items 2 (split, `stale-fact` → STORY-005-08) and 10, technical calls (finding paths, page hashes) — approved at Gate 1, 2026-10-17 · SPRINT-03 consistency-audit.md findings 2, 9, 11, 13 · STORY-003-09 R4, R5, R8 · verified src/ingest/log.ts, src/commands/ingest-finish.ts, src/ingest/snapshot.ts, src/ingest/lock.ts, src/ingest/diff.ts, src/ingest/lint-hook.ts, src/core/gitignore.ts, src/core/paths.ts, src/search/since.ts, test/ingest/finish.test.ts, test/ingest/finish.red.node.test.ts · probed read-only against ~/Documents/Dev/formapass_management/.wiki (9 ingest events, 20 pages, every page in an event) on 2026-10-17
actor: AI coding agent
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-005-02
  - STORY-003-12
  - STORY-004-07
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T09:08:14Z
updated_at: 2026-10-17T10:04:09Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:09:06Z
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
  last_stamp: 2026-10-17T10:09:06Z
  sessions: []
---

# STORY-005-03: Page hashes in the ingest log, `unlogged-change`, lint hook in `finish`
**Complexity:** L3 — `finish` records a hash for each page it changed (contract K3, owned here). One new page check reads the log, the write lock and the snapshot. The real lint hook then runs inside `finish`, and STORY-005-02's lint tests are brought in line with the new check. It lands after STORY-005-02 (registry, K2), STORY-003-12 (the earlier edit of `src/commands/ingest-finish.ts`) and STORY-004-07 (the earlier edit of `src/ingest/log.ts`). It does not edit `src/ingest/validate.ts`. `stale-fact` was split out to STORY-005-08.

## 1. The Spec (The Contract)

### 1.1 User Story
As a user whose agent writes the wiki, I want lint to tell me when a page changed without an ingest recording it, and I want `finish` to show the lint problems in the pages it just wrote. Then shell writes that the guard cannot see are still caught ([[CR-002]] D1).

### 1.2 Detailed Requirements
- **R1 — Page hashes (K3).**
  - `IngestLogEvent` (`src/ingest/log.ts:13`) gains the optional field `page_hashes?: Record<string, string>`. It has one entry per created or updated `.md` page, keyed by the path relative to `pages/` (POSIX, sorted), the form of the event's own `created` and `updated` lists (`src/ingest/log.ts:21`). Only lint findings use repository-relative paths (STORY-005-02 R3).
  - Each value is `pageHash(text)`: the sha256 hex of the page's UTF-8 text, after removing a leading BOM and changing CRLF to LF. A checkout with `core.autocrlf` rewrites line endings, and raw-byte hashes (`sha256File`, `src/core/manifest.ts:48`) would then make every page look changed.
  - `finish` computes the hashes in the loop that already reads the changed pages (`src/commands/ingest-finish.ts:163`) and passes them to `writeLogEvent` (`src/commands/ingest-finish.ts:169`). An ingest with no changed `.md` page records `page_hashes: {}`.
  - In `src/ingest/log.ts`:
    - `"page_hashes"` is appended to `KEY_ORDER.ingest` (`src/ingest/log.ts:62`). `orderedFields` keeps only the listed keys (`src/ingest/log.ts:129`).
    - `validate` (`src/ingest/log.ts:79`) adds `need(page_hashes === undefined || isPageHashes(page_hashes), "page_hashes")`. The new export `isPageHashes(v)` is true for a plain object whose keys are non-empty strings and whose values are 64 lower-case hex characters.
  - An event without the field is written byte for byte as before: `orderedFields` sets the key to `undefined`, and `YAML.stringify` leaves undefined values out. The re-run path (STORY-003-09 R6) writes no event and is unchanged.
- **R2 — `unlogged-change` (error): inputs.**
  - The ingest events are the `type: "ingest"` events of `ctx.log`, in log order. Their `created`, `updated` and `deleted` lists are read as `pagesChangedSince` reads them (`src/search/since.ts:65`): a value that is not an array counts as empty, and entries that are not strings are skipped.
  - The newest event touching page P is the last event that lists P in any of the three lists.
  - `hashed(E)` means event E has a `page_hashes` field for which `isPageHashes` is true.
  - Only `.md` pages are judged. Pages listed in config `private` are never judged: a page is private when it equals an entry, or lies inside an entry that names a directory, with entries resolved against `pages/` as `managedIgnoreEntries` resolves them (`src/core/gitignore.ts:89`). Each clone holds its own private pages, or none (D-27).
- **R3 — `unlogged-change`: decisions.** E is the newest ingest event touching P. Each finding has the path `pagePath(ctx.paths, P)` (STORY-005-02 R3: `.wiki/pages/team.md` for `team.md`) and no line.

  | State of P | Finding message |
  |---|---|
  | exists, and no ingest event touches it | `in no ingest log event` |
  | not `hashed(E)` (every ingest before 0.3.0) | none: the baseline (K3) |
  | `hashed(E)`, E deleted P, and P exists | `deleted by ingest <src> (<log file>) and created again without a log entry` |
  | `hashed(E)`, E created or updated P, and P is missing | `deleted without a log entry (last recorded by ingest <src>, <log file>)` |
  | `hashed(E)`, E created or updated P, and `E.page_hashes` has no entry for P | none: counted with the baseline |
  | `hashed(E)`, and `pageHash(current text)` differs from `E.page_hashes[P]` | `changed since ingest <src> recorded it (<log file>)` |
  | the hash matches | none |

  When the baseline holds any page, the check adds one `info` finding with no path: `<n> page(s) were last recorded by an ingest without page hashes (before wikeeper 0.3.0); unlogged-change checks them after their next ingest`. With `only` set, `runLint` drops it (STORY-005-02 R2). `<log file>` is `StoredLogEvent.file`, already relative to the repository root (`src/ingest/log.ts:49`).
- **R4 — During an open write phase, the check judges the wiki as it was at apply.** This applies when the write lock names source S (`readLock`, `src/ingest/lock.ts:42`) and `readSnapshot(paths, S)` returns a snapshot (`src/ingest/snapshot.ts:109`). Then:
  - the page set is the snapshot's `.md` keys, without paths that have a dot segment, as `diffPages` excludes them (`src/ingest/diff.ts:13`);
  - each page's text is its copy under `snapshotDir(paths, S)/pages/` (`src/ingest/snapshot.ts:20`); the finding still names the live page's path (R3);
  - ingest events with `source_id` S, or with `at` at or after `snapshot.taken_at`, are ignored.

  So pages created since apply are not judged, and the open ingest's own edits are never reported (`finish` attributes them). Messages get the suffix `, before ingest <S> was applied`. When the lock or the snapshot cannot be read, the check runs as if there were no lock.
- **R5 — The `finish` lint hook (K3, STORY-003-09 R8).**
  - `src/commands/ingest-finish.ts` exports `FINISH_CHECKS = ["broken-link", "uncited-claim", "unlogged-change"]` and `finishLintHook`. It calls `setLintHook(finishLintHook)` when the module loads, so every program that includes `finish` has the hook, and a test's own `setLintHook` afterwards wins.
  - `finishLintHook({ paths, changed })` returns `[]` at once when `changed` is empty. Otherwise it loads the config, `loadPages(paths.pagesDir)` and `readLogEvents(paths).events`, and returns `runLint({ paths, config, pages, kb: null, log, now: new Date(), only: changed }, { scope: "pages", checks: [...FINISH_CHECKS] })`.
  - The hook runs at `src/commands/ingest-finish.ts:203`, after the ingest event is written and while the lock and snapshot still exist (they are removed at `src/commands/ingest-finish.ts:215`). So R4 applies: the changed pages are judged as they were at apply. A page that was shell-edited before this ingest touched it is reported once. From then on, this ingest's log entry covers it.
  - `orphan-page`, `index-drift` and `stale-fact` (STORY-005-08) do not run in the hook. The first two are about the whole wiki, and `index.md` was just rebuilt. `stale-fact` is about how old facts are, not about what this ingest wrote; `wikeeper lint` reports it. `FINISH_CHECKS` names only checks that exist when this story lands, because `runLint` throws on an unknown id (STORY-005-02 R2).
  - Findings never change `finish`'s exit code and never undo the ingest (STORY-003-09 R5). They appear in `data.lint` and as warnings. A hook that throws stays the existing `lint hook failed:` warning.
  - The warning line `lintLine` (`src/commands/ingest-finish.ts:35`) becomes `lint ${findingLine(f)}` (STORY-005-02 §3.3), for example `lint [error] uncited-claim .wiki/pages/team.md:9: claim has no [[src-…]] citation`.
- **R6 — Registration.** `src/lint/checks.ts` inserts `unloggedChangeCheck` (`unlogged-change`, error) into `PAGE_CHECKS` directly after `indexDriftCheck`, with one import and one entry. `stale-fact` (STORY-005-08) is appended at the end, so the order is STORY-005-02's four checks, `unlogged-change`, `stale-fact`, whichever lands first (STORY-005-02 R1). EPIC-005's exit rule then covers the check: an `unlogged-change` finding makes `wikeeper lint` exit 1.
- **R7 — Read-only.** The check only reads pages, `log/`, the lock and the snapshot. STORY-005-02's read-only test (`test/lint/lint-command.test.ts`) gets an unlogged change in its fixture: a page edited after its recorded ingest in the plain copy, and a page edited before apply in the copy whose lock is held. So the test covers both modes of R4.
- **R8 — STORY-005-02's lint tests stay green** (consistency audit finding 2). Once `unlogged-change` is registered, every page that a STORY-005-02 test writes straight to disk is `in no ingest log event`. This story updates `test/lint/lint-command.test.ts` and `test/lint/checks.test.ts`:
  - STORY-005-02's fixture helper, after writing the pages, records one ingest event with `writeLogEvent`: a fixed source id, every fixture `.md` page in `created` (sorted), empty `updated` and `deleted`, and `page_hashes` from `pageHash` of each written text. The fixtures then have no `unlogged-change` finding and no baseline `info` finding, and every STORY-005-02 assertion keeps its expected value, including counts, exit codes and "findings is empty".
  - An assertion that runs every page check on an in-memory `LintContext` without such an event (`log: []`) selects the checks it tests (`runLint(ctx, { scope: "pages", checks: [...] })`, the API form of `--check <id>`).
  - No STORY-005-02 expected value changes. If a test needs one changed, that is a defect in this story, not in STORY-005-02.

### 1.3 Out of Scope
- Accepting a merged page (§1.4, Decision 1). It is a follow-up.
- Changes made during an open write phase. By design they belong to that ingest, and `finish` attributes them.
- Backfilling hashes for pages last ingested before 0.3.0. They are the baseline until their next ingest.
- File times as evidence. A fresh clone resets them, which is why the design uses hashes.
- `stale-fact` and `src/lint/staleness.ts` (STORY-005-08).
- Editing `src/ingest/validate.ts`. STORY-003-12 is its only editor this sprint; this story only reads `validateIngest`'s result where `finish` already does.
- WIKI.md text about shell writes and `unlogged-change` ([[CR-003]] E2; STORY-006-12 R2, split from STORY-006-10).
- Instruction text handed to STORY-006-09 (WIKI.md section "Lint and status"), which that story carries:
  - after a git merge, pages edited on both branches are reported as `unlogged-change` until the next ingest updates them (Decision 1);
  - `post_ingest` hooks must not edit pages: hashes are taken before the hooks run, so a page a hook rewrites is reported;
  - a recorded fix must update the page: to keep a shell edit, the chat-excerpt ingest that records it must change that page in its write phase (for example, add the cited fact line). An ingest that leaves the page as it was at apply records no hash for it, and the finding stays (consistency audit finding 11).
- Running `orphan-page`, `index-drift` or `stale-fact` in `finish` (R5).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question:** After a git merge that combines two ingests' edits to one page (team use, D-28), the merged page matches neither recorded hash. `unlogged-change` then reports it as an error until an ingest updates that page, and that ingest's `finish` reports it once more (R5). Accept this for SPRINT-03?
- **Recommended:** Yes. Keep `error`. The human works in one clone today, and the finding names the last ingest and its log file, so a merged page is easy to recognise. Accepting a merge is a follow-up, for example a `merge` log event written by `index rebuild` after a pull; doing it now would also accept real shell writes. Making the check a `warning` would keep merges from failing `lint`, but shell writes would then no longer set exit 1.
- **Decision:** Yes. After a git merge combines two ingests' edits to one page, `lint` reports `unlogged-change` (error) until the next ingest updates that page; WIKI.md explains it (STORY-006-09, §1.3). — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Is a page hash taken over the raw bytes, or over the text with line endings and a BOM normalised?
- **Recommended:** Normalised (R1). A Windows checkout with `core.autocrlf` rewrites line endings, so raw-byte hashes would report every page.
- **Decision:** Page hashes ignore line endings and a leading BOM: `pageHash` is the sha256 of the UTF-8 text after removing a leading BOM and changing CRLF to LF (R1). — _approved (human, 2026-10-17, Gate 1)_

Decided while drafting (not open): private pages are never judged (R2). The check judges an open write phase as of apply, which is also what makes the `finish` hook useful (R4, R5). `FINISH_CHECKS` is a subset of the page checks, without `stale-fact` (R5). STORY-005-02's tests stay green through an ingest event recorded by its fixture helper, not by rewriting its assertions (R8).

### 1.5 Risks

- **Risk:** The SPRINT-03 Goal-check walkthrough runs in `formapass_management`. All 9 of its ingest events predate 0.3.0, so every page there is baseline, and a shell edit of an existing page is not reported.
- **Mitigation:** The `info` finding says so. The walkthrough first ingests or re-ingests the page under test with 0.3.0, then edits it with the shell.
- **Risk:** A `post_ingest` hook that rewrites pages (a formatter, say) makes every page it touches look changed. Hashes are taken before the hooks run, in STORY-003-09 R4's order.
- **Mitigation:** The finding is correct: the hook changed pages after the ingest recorded them. STORY-006-09's WIKI.md text says `post_ingest` hooks must not edit pages (§1.3).
- **Risk:** STORY-003-12 also edits `src/commands/ingest-finish.ts`; STORY-004-07 and STORY-005-06 also edit `src/ingest/log.ts`.
- **Mitigation:** This story lands after STORY-003-12 and STORY-004-07 (`dep_predecessors`). The `ingest-finish.ts` line numbers cited here are those of commit 40018c5; STORY-003-12 shifts them. This story's `log.ts` edits (the interface, `KEY_ORDER`, `validate`) are separate hunks from theirs (`summaryLine`, `renderLogView`).
- **Risk:** With the hook registered at module load, the first `finish` test in a file runs with the real hook.
- **Mitigation:** The SPRINT-02 finish tests reset with `setLintHook(null)` in `afterEach` (`test/ingest/finish.red.node.test.ts:23`; `test/ingest/finish.test.ts:17` does not load `finish` at all) and assert warnings with `toContain`. The real hook only adds warnings. The red test "lint hook default returns no findings" (`test/ingest/finish.red.node.test.ts:288`) passes `changed: []`, for which the real hook also returns `[]` (R5).
- **Risk:** Tests inject a fixed `now` into `finish`, so the new event's `at` can fall before `snapshot.taken_at`.
- **Mitigation:** R4 also ignores events whose `source_id` is the lock's source, not only events by time.
- **Risk:** STORY-005-08 may land before or after this story, and both touch `PAGE_CHECKS`.
- **Mitigation:** R6's placement keeps one order either way, and `FINISH_CHECKS` never names `stale-fact`.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | An unlogged change is found after `finish`, during an open write phase, and by `finish`'s own hook. A page can be edited, deleted, recreated or never logged. |
| Interfaces | T | `wikeeper lint` and the `finish` report (the lint hook) both show the findings. |
| Data | T | Outlines over page states (CRLF and BOM only, private, baseline, malformed `page_hashes`). |
| Rules | T | Baseline skip; findings never change `finish`'s exit code; a malformed `page_hashes` is refused on write; STORY-005-02's results hold once the check is registered. |

```gherkin
Feature: Page hashes, unlogged-change and the finish lint hook

  @paths @rules
  Scenario Outline: Lint detects a change made outside an ingest
    Given an initialised wiki where ingest "src-2026-10-16-notes" created pages/team.md and pages/risks.md and finished with page hashes
    And then <change>
    When I run "wikeeper lint --json"
    Then <result>

    Examples:
      | change | result |
      | pages/team.md was edited with the shell | check "unlogged-change" has an error with path ".wiki/pages/team.md" and no line, "wikeeper lint" prints a line starting "[error] unlogged-change .wiki/pages/team.md: changed since ingest src-2026-10-16-notes recorded it", and the exit code is 1 |
      | pages/team.md was deleted with the shell | check "unlogged-change" has an error with path ".wiki/pages/team.md" saying "deleted without a log entry" |
      | pages/notes.md was created with the shell | check "unlogged-change" has an error with path ".wiki/pages/notes.md" saying "in no ingest log event" |
      | ingest "src-2026-10-17-cleanup" deleted pages/risks.md, and pages/risks.md was then written with the shell | check "unlogged-change" has an error with path ".wiki/pages/risks.md" saying "created again without a log entry" |
      | pages/team.md was rewritten with CRLF line endings and a leading BOM, and nothing else changed | no "unlogged-change" finding, and the exit code is 0 |
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
    Then check "unlogged-change" has a finding with path ".wiki/pages/roadmap.md" and none for any other page, and no file in the repository changed
    When I run "wikeeper ingest finish src-2026-10-16-notes --json"
    Then the exit code is 0 and .wiki/.lock is gone
    And data.lint holds unlogged-change for ".wiki/pages/roadmap.md", and uncited-claim and broken-link for ".wiki/pages/team.md", and nothing for ".wiki/pages/glossary.md"
    And every data.lint finding's id is "broken-link", "uncited-claim" or "unlogged-change"
    And the warnings include a line starting "lint [error] unlogged-change .wiki/pages/roadmap.md: changed since ingest src-2026-10-15-plan recorded it"
    And "wikeeper lint --json" afterwards has no "unlogged-change" finding

  @rules
  Scenario: STORY-005-02's results hold once unlogged-change is registered
    Given the wiki of STORY-005-02's scenario "Lint finds an uncited claim and a broken link, at repository-relative paths", built by its fixture helper, which now also records one ingest event listing every page under "created" with its page hash
    When I run "wikeeper lint --json"
    Then no finding has id "unlogged-change", data.counts.error is 2 and the exit code is 1, as STORY-005-02 expects
    And the same wiki without that ingest event has one "unlogged-change" error "in no ingest log event" per page
    And there "wikeeper lint --check uncited-claim --check broken-link --json" still gives STORY-005-02's two findings at ".wiki/pages/team.md"

  @rules @data
  Scenario Outline: Error — a malformed page_hashes is refused on write and treated as missing on read
    Given an initialised wiki
    When <action>
    Then <result>

    Examples:
      | action | result |
      | an ingest event with page_hashes { "team.md": "abc" } is written with writeLogEvent | it throws error code "invalid_event" naming "page_hashes", and no log file is written |
      | ingest "src-2026-10-16-notes" recorded pages/team.md, its log file is hand-edited to "page_hashes: oops", pages/team.md is edited with the shell, and I run "wikeeper lint --json" | no "unlogged-change" finding has path ".wiki/pages/team.md", the info finding counts 1 page, and the exit code is 0 |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch wiki on the 0.3.0 build, ingest a note. Then run `echo "- 2026-10-17 · decided · Shell line." >> .wiki/pages/<page>.md` and `wikeeper lint`. Expect `[error] unlogged-change .wiki/pages/<page>.md: …`, and exit 1.
- [ ] Ingest a second source that updates the same page, and read the `finish` report: it names the earlier shell edit once. Then run `wikeeper lint` again: no `unlogged-change`.
- [ ] Run `wikeeper lint` in a copy of `formapass_management`. Expect the `info` line counting 20 baseline pages (a read-only probe on 2026-10-17 found all 20 pages in its 9 ingest events, none hashed).

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File (new) | `src/lint/unlogged.ts` |
| Related Files | `src/lint/checks.ts`, `src/ingest/log.ts`, `src/commands/ingest-finish.ts`, `test/ingest/log.test.ts`, `test/lint/lint-command.test.ts`, `test/lint/checks.test.ts` |
| Related Files (new) | `test/lint/unlogged.test.ts`, `test/ingest/finish-lint.test.ts` |
| New Files Needed | `src/lint/unlogged.ts`, `test/lint/unlogged.test.ts`, `test/ingest/finish-lint.test.ts` |

### 3.2 Technical Logic
- **`src/lint/unlogged.ts`.**
  - `pageHash` uses `createHash("sha256")` over the normalised text (R1).
  - `run(ctx)` first decides the mode (R4): `readLock(paths)`, and if `held` and `lock !== null`, `readSnapshot(paths, lock.source_id)`.
  - It builds `lastTouch: Map<page, { stored: StoredLogEvent; change: "created" | "updated" | "deleted" }>` in one pass over the kept ingest events.
  - The page set is, in normal mode, `ctx.pages.map((p) => p.path)`, with each text read from `paths.pagesDir`. Page objects do not keep the raw text. In snapshot mode it is the snapshot's keys and copies.
  - It then walks the union of the page set and `lastTouch`'s keys that end in `.md`, without private pages, and applies the R3 table. Each finding's path is `pagePath(ctx.paths, P)`. Its findings are sorted later by `runLint`.
- **`src/ingest/log.ts`.** R1's three edits. The `need(...)` message reuses the existing form: `ingest log event is missing or has an invalid "page_hashes"`.
- **`src/commands/ingest-finish.ts`.**
  - In the `changedPages` loop, keep `pageHashes[rel] = pageHash(text)` for each `.md` page and pass `page_hashes` (keys sorted with `compareCodeUnits`) to `writeLogEvent`.
  - Add `FINISH_CHECKS`, `finishLintHook` and the module-level `setLintHook(finishLintHook)`, and change `lintLine` to use `findingLine` (R5).
  - Nothing else in the post steps moves. `validateIngest` (`src/ingest/validate.ts`) is called as before and is not edited.
- **`src/lint/checks.ts`.** R6's import and the entry directly after `indexDriftCheck`.
- **`test/lint/lint-command.test.ts`, `test/lint/checks.test.ts`** (R7, R8). Extend STORY-005-02's fixture helper with the recorded ingest event, built with `writeLogEvent` and `pageHash` from this story. Add the two unlogged pages to the read-only fixture. In `checks.test.ts`, give `checks` to any assertion that runs every page check on an in-memory context with `log: []`. Assert that `PAGE_CHECKS` holds `unlogged-change` directly after `index-drift`.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper lint` | CLI | None | unchanged (STORY-005-02) | `LintData`; adds `unlogged-change` findings |
| `wikeeper ingest finish <id>` | CLI | None | unchanged | `IngestReport`; `lint` now holds `FINISH_CHECKS` findings |

Frozen exports (consumers: STORY-005-05 reads ingest events; STORY-006-09 names the check id):

```ts
// src/ingest/log.ts (K3, additive)
export interface IngestLogEvent { /* SPRINT-02 fields */ page_hashes?: Record<string, string> }   // keys relative to pages/
export function isPageHashes(v: unknown): v is Record<string, string>;

// src/lint/unlogged.ts
export function pageHash(text: string): string;    // sha256 hex of the text without a leading BOM, CRLF → LF
export const unloggedChangeCheck: LintCheck;       // "unlogged-change", error, scope "pages"

// src/commands/ingest-finish.ts
import type { LintHook } from "../ingest/lint-hook.js";
export const FINISH_CHECKS: readonly string[];     // ["broken-link", "uncited-claim", "unlogged-change"]
export const finishLintHook: LintHook;
```

Consumed (frozen): `runLint`, `PAGE_CHECKS`, `LintCheck`, `LintContext`, `pagePath`, `findingLine` (K2, STORY-005-02); `setLintHook`, `LintHook`, `LintFinding` (C9); `readLock`, `readSnapshot`, `snapshotDir`, `SnapshotInfo` (C8); `readLogEvents`, `writeLogEvent`, `StoredLogEvent` (C7); `loadPages` (C1); `loadConfig` (`src/core/config.ts`).

## Task Breakdown

- [ ] `src/ingest/log.ts`: `page_hashes` on `IngestLogEvent`, `KEY_ORDER`, `isPageHashes`, the `validate` rule -> R1
- [ ] `src/lint/unlogged.ts`: `pageHash`, event reading, the R3 decisions with repository-relative paths, private pages, the baseline `info` finding -> R2, R3
- [ ] `src/lint/unlogged.ts`: snapshot mode while the lock is held -> R4
- [ ] `src/commands/ingest-finish.ts`: `page_hashes` in the ingest event -> R1
- [ ] `src/commands/ingest-finish.ts`: `FINISH_CHECKS`, `finishLintHook` (empty `changed` returns `[]`), registration at module load, `lintLine` via `findingLine` -> R5
- [ ] `src/lint/checks.ts`: insert `unloggedChangeCheck` after `indexDriftCheck` -> R6
- [ ] `test/lint/lint-command.test.ts`, `test/lint/checks.test.ts`: the recorded ingest event in STORY-005-02's fixture helper, the unlogged pages in the read-only fixture, `checks` on in-memory full runs -> R7, R8
- [ ] Unit tests per module, and CLI tests per Gherkin scenario -> §2.1

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 7 | `pageHash` (BOM, CRLF, unchanged LF text); `isPageHashes` (array, null, short hash, upper-case hex, empty key); `writeLogEvent` without `page_hashes` writes the SPRINT-02 bytes; every R3 row, including a `deleted` list that is not an array, with the finding path from `pagePath`; private entries (a file and a directory); snapshot mode (pages created since apply skipped, the lock's source ignored by id and by time, unreadable snapshot falls back to normal mode); the baseline `info` finding absent with `only`; `finishLintHook` with empty `changed` |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli` with a temp repository; scenarios 2 and 3 drive `ingest apply` and `ingest finish` for real. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Every test in `test/lint/lint-command.test.ts` and `test/lint/checks.test.ts` passes with `unlogged-change` registered, and no STORY-005-02 expected value was changed (R8).
- [ ] The SPRINT-02 ingest tests still pass with the real hook registered (`test/ingest/finish.test.ts`, `test/ingest/finish.red.node.test.ts`, `test/e2e/ingest.test.ts`).
- [ ] `src/ingest/validate.ts` is not in this story's diff.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/ingest/log.ts:62` — `KEY_ORDER.ingest`; `orderedFields` (`src/ingest/log.ts:129`) drops keys not listed there, so `page_hashes` must be added; `src/ingest/log.ts:82` — the `need(...)` validation the new field joins.
- **Surface:** `src/commands/ingest-finish.ts:163` — the loop that already reads every changed page after validation; `src/commands/ingest-finish.ts:203` — the lint hook call, before `removeSnapshot` and `releaseLock` (`src/commands/ingest-finish.ts:215`); `src/commands/ingest-finish.ts:35` — `lintLine`.
- **Surface:** `src/ingest/lint-hook.ts:19` — `setLintHook`, the C9 hook point this story fills.
- **Surface:** `src/ingest/snapshot.ts:109` — `readSnapshot`; `src/ingest/lock.ts:42` — `readLock`; `src/ingest/diff.ts:13` — the dot-segment rule.
- **Surface:** `src/search/since.ts:65` — tolerant reading of ingest events' page lists.
- **Surface:** `src/core/gitignore.ts:89` — how `private` entries resolve against `pages/`.
- **Coverage of this requirement:** partial — the log, lock, snapshot, hook point and path helpers exist; the hashes, the check and the hook body are net-new.

## Prior work

- [[EPIC-005]] (parent). [[CR-002]] D1 makes this check the backstop for shell writes, and [[CR-003]] E2 has WIKI.md name it. It builds on [[STORY-003-09]] (R5: post steps never fail a validated ingest; R8: the hook point), [[STORY-003-07]] (log events), [[STORY-003-08]] (lock and snapshot), [[STORY-004-04]] (reading page lists from ingest events) and [[STORY-005-02]] (registry, `pagePath`, `findingLine`). `stale-fact`, first drafted here, is now [[STORY-005-08]]. A grep of the wiki index (2026-10-17) lists no other lint item; no duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** the ingest event (`src/ingest/log.ts:13`) and the C9 hook point (`src/ingest/lint-hook.ts:19`).
- **Why isn't extension / parameterization / config sufficient?** The ingest event already lists which pages an ingest touched, but not what they contained. Without a hash, a later edit cannot be told apart. File times reset on every clone (the design call), and wikeeper does not require git history. So one additive field is the smallest record that works, and the baseline rule keeps old events valid.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2. (R1: scenarios 2 and 5; R2–R3: scenarios 1, 2 and 5; R4–R5: scenario 3; R6: scenarios 1 and 4; R7: scenario 3 and STORY-005-02's read-only scenario; R8: scenario 4.)
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (The new source file is EPIC-005 §0's `src/lint/unlogged.ts`; the rest exist or are STORY-005-02's, and were verified 2026-10-17.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1 approved by the human on 2026-10-17: every §1.4 Decision line is approved as recommended.
