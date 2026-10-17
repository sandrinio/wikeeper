---
story_id: STORY-005-08
parent_epic_ref: EPIC-005
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
ambiguity: 🟢 Low
context_source: EPIC-005 (approved 2026-10-16) §2 (volatile facts older than a configurable age), §4 (lint.stale_after_days) · SPRINT-03 gate1-decisions.md item 2 (split of STORY-005-03; approved at Gate 1, 2026-10-17) and technical call (finding paths) · first drafted as STORY-005-03 R6 (commit 40018c5) · STORY-001-02 R1, R2 (lint.stale_after_days, positive integer, default 30) · verified src/wiki/parse-page.ts, src/search/filters.ts, src/core/config.ts, src/core/dates.ts, src/core/paths.ts · probed read-only against ~/Documents/Dev/formapass_management/.wiki (20 pages, 24 non-final statuses) on 2026-10-17
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-005-02
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T10:07:07Z
updated_at: 2026-10-17T10:07:07Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:08:38Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-005-08
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T10:08:58Z
  sessions: []
---

# STORY-005-08: `stale-fact`: statuses and planned dates older than `lint.stale_after_days`
**Complexity:** L2 — one pure check module over the parsed pages (the entity model), registered in STORY-005-02's `PAGE_CHECKS` with one import and one entry. It depends on STORY-005-02 (K2) only. It was split out of STORY-005-03 (gate1-decisions item 2), which keeps page hashes, `unlogged-change` and the `finish` hook.

## 1. The Spec (The Contract)

### 1.1 User Story
As a user whose agent keeps the wiki, I want `wikeeper lint` to warn me when an entity's open status, or a tentative fact that names a date, has had nothing newer recorded for longer than `lint.stale_after_days`, so that I know which facts to check again.

### 1.2 Detailed Requirements
- **R1 — Check and registration (K2).** `src/lint/staleness.ts` exports `staleFactCheck` (id `stale-fact`, severity `warning`, scope `pages`) and `FINAL_STATUSES`. `src/lint/checks.ts` appends `staleFactCheck` at the end of `PAGE_CHECKS` with one import and one entry, and touches no other entry. STORY-005-03 places `unlogged-change` directly after `index-drift`, so the order is the same whichever lands first (STORY-005-02 R1). Being a warning, a finding never sets `wikeeper lint`'s exit code (STORY-005-02 R9).
- **R2 — Age.** Today is the UTC date of `ctx.now`. A date's age is the number of whole days from that date to today. A volatile fact is stale when its age is greater than `ctx.config.lint.stale_after_days` (`src/core/config.ts:77`; a positive integer, default 30). An age of exactly `stale_after_days`, or a date after today, is not stale.
- **R3 — Status.** Statuses are judged per entity of `pageEntities(page)` (`src/wiki/parse-page.ts:381`).
  - The status is the entity's last typed link whose key is `status`, compared case-insensitively. A page entity without one uses a string `status` key of its frontmatter (key case-insensitive). These are the places `search --status` reads (`candidates`, `src/search/filters.ts:65`).
  - Its date is the newest date among the entity's own fact lines (`Entity.facts`). An entity without fact lines is not judged.
  - A final status is not volatile: the first run of letters (`\p{L}+`) in the value, lower-cased, is one of `FINAL_STATUSES`: `done`, `complete`, `completed`, `closed`, `cancelled`, `canceled`, `superseded`, `rejected`, `resolved`, `shipped`, `released`, `archived`. Any other value, including `approved`, `draft` and `triaged`, is judged.
  - The finding is at the typed link's line; a frontmatter status has no line. Message: `<entity name>: status "<value>" was last dated <date>, <n> days ago (lint.stale_after_days is <N>)`.
- **R4 — Planned date.**
  - This is a `tentative` fact line of an entity whose text, with its wikilinks removed, contains a calendar date: the first `YYYY-MM-DD` that passes `isCalendarDate` (`src/core/dates.ts:6`). It is judged only when no fact line of the same entity has a later date.
  - The wikilinks are removed first because a citation id carries a date (`[[src-2026-10-15-plan]]`), and that date is not a plan.
  - Its date is the fact's own date. The finding is at the fact line. Message: `<entity name>: tentative fact from <date> names <first date in its text>, and nothing newer is recorded (<n> days ago; lint.stale_after_days is <N>)`.
- **R5 — Not judged.** Older fact lines are history and are never judged (WIKI.md: a replaced fact stays in the list). `decided` fact lines are not planned dates. A status without any fact line of its entity has no date to judge.
- **R6 — Location and read-only.** Each finding's path is `pagePath(ctx.paths, page.path)` (STORY-005-02 R3: repository-relative, POSIX, following `content_dir`). The check is pure: it reads only `ctx.pages`, `ctx.config` and `ctx.now`, and does no file I/O, so it is read-only (EPIC-005 safety rule).

### 1.3 Out of Scope
- Running `stale-fact` in `finish`'s lint hook. STORY-005-03's `FINISH_CHECKS` leaves it out: it is about how old facts are, not about what that ingest wrote, and `wikeeper lint` reports it.
- Fixing a stale fact. Lint reports only; the agent asks the user and ingests a newer source (STORY-006-09 carries that text).
- A per-type or per-status age, and a list of final statuses in config. One age (`lint.stale_after_days`) and one built-in list for SPRINT-03.
- Dates in prose claims, typed links other than `status::`, or frontmatter fields other than `status`.
- Page hashes, `unlogged-change` and the `finish` hook (STORY-005-03). Editing `src/search/filters.ts` (STORY-004-07 edits it this sprint).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question:** Is `stale-fact` its own story, or does it stay in STORY-005-03 with page hashes, `unlogged-change` and the `finish` hook?
- **Recommended:** Its own story. It reads only the entity model, shares no file with the hash work except the one registry line, and splitting keeps both stories within the granularity rubric.
- **Decision:** Split: STORY-005-03 keeps page hashes, `unlogged-change` and the lint hook in `finish`; STORY-005-08 is `stale-fact` (gate1-decisions item 2). — _approved (human, 2026-10-17, Gate 1)_

- **Question:** What base does the finding's `path` use?
- **Recommended:** The base STORY-005-02 R3 sets for every finding.
- **Decision:** Every lint finding's `path` is relative to the repository root, POSIX, and follows `content_dir` (`.wiki/pages/projects/atlas.md`); human output prints `<path>[:<line>]` (R6). — _approved (human, 2026-10-17, Gate 1)_

Decided while drafting (not open): `stale-fact` stays out of `finish`'s hook (§1.3). The final statuses are the list in R3; `approved` is not final, because an approved item still has work ahead. Wikilinks are removed before the date search (R4).

### 1.5 Risks

- **Risk:** Real wikis carry many open statuses, so `lint` fills with warnings once a month passes without ingests.
- **Mitigation:** It is a warning (exit 0), and that is the reminder the check is for. A read-only probe of the formapass wiki with these rules (2026-10-17) found 24 judged statuses (14 `Draft`, 7 `Triaged`, 2 `Approved`, 1 `Partial`) and no finding today; with no new ingest, all 24 become stale by 2026-12-01. It found no tentative fact that names a date. `--check` and `lint.stale_after_days` narrow the output.
- **Risk:** A final status this list does not know (`Merged`, `Won't do`) is reported as stale.
- **Mitigation:** The finding names the value, so the user sees why. A config list is out of scope; adding a word to `FINAL_STATUSES` is a one-line follow-up.
- **Risk:** Another story's lint fixtures gain `stale-fact` warnings and their exact counts break.
- **Mitigation:** The check is a warning and never changes an exit code. STORY-005-02's and STORY-005-03's fixtures carry no `status::` line and no tentative fact that names a date; QA runs their tests (`test/lint/`, `test/ingest/finish-lint.test.ts`) with this check registered.
- **Risk:** Tests depend on today's date.
- **Mitigation:** Every test injects `now` (`createLintCommand({ now })`, STORY-005-02 §3.3) or builds a `LintContext` with a fixed `now`.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Two ways to be stale: an open status and a tentative fact that names a date. |
| Interfaces | T | Human output and `--json` show the same finding. `finish` does not run the check (STORY-005-03). |
| Data | T | Outlines over ages, fact shapes and a configured age. |
| Rules | T | Final statuses; the last `status::` line counts; a typed link wins over frontmatter; wikilinks are removed before the date search; nothing newer recorded. |

```gherkin
Feature: stale-fact — statuses and planned dates older than lint.stale_after_days

  @data @paths
  Scenario Outline: stale-fact reports statuses and planned dates older than lint.stale_after_days
    Given today is 2026-11-20, lint.stale_after_days is <days>, and pages/projects/atlas.md has an entity with <content>
    When I run "wikeeper lint --check stale-fact --json"
    Then <result>, and the exit code is 0

    Examples:
      | days | content | result |
      | 30 | "status:: In progress" and its newest fact line dated 2026-10-20 | one warning at the status:: line, path ".wiki/pages/projects/atlas.md", naming "In progress", 2026-10-20 and "31 days ago" |
      | 30 | "status:: In progress" and its newest fact line dated 2026-10-21 | no finding |
      | 60 | "status:: In progress" and its newest fact line dated 2026-10-20 | no finding |
      | 30 | "status:: In progress" and its newest fact line dated 2026-12-01 | no finding |
      | 30 | "status:: Draft" and no fact lines | no finding |
      | 30 | the newest fact "- 2026-10-15 · tentative · Launch targets 2026-11-17. [[src-2026-10-15-plan]]" | one warning at that fact line naming 2026-10-15 and 2026-11-17 |
      | 30 | that tentative fact and a later fact line dated 2026-11-01 | no finding |
      | 30 | the newest fact "- 2026-10-01 · tentative · Hiring may slip. [[src-2026-10-01-hr]]" | no finding |
      | 30 | the newest fact "- 2026-10-01 · tentative · Review on 2026-02-30. [[src-2026-10-01-hr]]" | no finding |
      | 30 | the newest fact "- 2026-10-01 · decided · Launch on 2026-11-17. [[src-2026-10-01-hr]]" | no finding |

  @rules
  Scenario Outline: Which status counts, and which statuses are final
    Given today is 2026-11-20, lint.stale_after_days is 30, and pages/projects/atlas.md has a page entity whose newest fact line is dated 2026-10-01, with <status>
    When I run "wikeeper lint --check stale-fact --json"
    Then <result>

    Examples:
      | status | result |
      | "status:: Draft" and, below it, "status:: Completed" | no finding |
      | "status:: Completed" and, below it, "status:: Draft" | one warning at the second status:: line naming "Draft" |
      | "status:: Done — shipped early" | no finding |
      | "status:: [[Cancelled]]" | no finding |
      | "status:: Approved" | one warning naming "Approved" |
      | frontmatter "status: Draft" and no status:: line | one warning without a line naming "Draft" |
      | frontmatter "status: Completed" and "status:: Open" | one warning at the status:: line naming "Open" |

  @interfaces
  Scenario: Human output names the file and line, and the check is a read-only warning
    Given today is 2026-11-20, lint.stale_after_days is not set, and pages/projects/atlas.md has the entity "Atlas" with "status:: In progress" at line 6 and its newest fact line dated 2026-10-20
    When I run "wikeeper lint --check stale-fact"
    Then stdout has the line "[warn] stale-fact .wiki/pages/projects/atlas.md:6: Atlas: status "In progress" was last dated 2026-10-20, 31 days ago (lint.stale_after_days is 30)"
    And its last line is "0 errors, 1 warning, 0 info" and the exit code is 0
    And "wikeeper lint --json" holds that finding with severity "warning", path ".wiki/pages/projects/atlas.md" and line 6
    And PAGE_CHECKS holds "stale-fact" once, after "index-drift", as its last entry
    And no file in the repository changed

  @rules @data
  Scenario Outline: Error — bad input gives no false finding and no failure
    Given today is 2026-11-20 and the entity "Atlas" of the previous scenario, with <input>
    When I run "wikeeper lint --check stale-fact --json"
    Then <result>, and the exit code is 0

    Examples:
      | input | result |
      | .wiki/config.yml setting lint.stale_after_days to 0 | one warning whose message ends "(lint.stale_after_days is 30)": the invalid value falls back to the default |
      | its status:: line replaced by "status::" with no value | no finding |
      | its only fact line removed | no finding |
```

### 2.2 Verification Steps (Manual)
- [ ] Copy `~/Documents/Dev/formapass_management` to a scratch directory and run `wikeeper lint --check stale-fact`: expect no finding on 2026-10-17. Set `lint.stale_after_days: 1` in the copy's `.wiki/config.yml` and run it again: expect one `[warn] stale-fact .wiki/pages/<file>:<line>` line per `Draft`, `Triaged`, `Approved` or `Partial` status, and none for `Completed` or `Superseded`.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File (new) | `src/lint/staleness.ts` |
| Related Files | `src/lint/checks.ts` |
| Related Files (new) | `test/lint/staleness.test.ts` |
| New Files Needed | `src/lint/staleness.ts`, `test/lint/staleness.test.ts` |

### 3.2 Technical Logic
- **`src/lint/staleness.ts`.**
  - For each page and each entity from `pageEntities`, take the last entry of `entity.typedLinks` with `key.toLowerCase() === "status"`; its `value` is the status. For an entity with `kind === "page"` and no such link, read `page.frontmatter.data` for a key that lower-cases to `status` with a string value.
  - The newest fact date is the maximum of `entity.facts[].date`. These are ISO dates that the parser has already checked (`isCalendarDate`, `src/wiki/parse-page.ts:280`), so the maximum is a string compare.
  - Final test: `/\p{L}+/u` on the value, lower-cased, in `FINAL_STATUSES`. A value with no letters is judged (R3, R4).
  - Planned dates: for each `entity.facts` entry with `status === "tentative"` and the entity's newest date, remove `/!?\[\[[^\]]*\]\]/g` from `text`, then take the first `\d{4}-\d{2}-\d{2}` match that passes `isCalendarDate`.
  - Age is `(Date.UTC(today) - Date.UTC(date)) / 86_400_000`, with today taken from `ctx.now`'s UTC year, month and day.
  - The age limit is `ctx.config.lint.stale_after_days`. The `lint` command loads config as `search` does (`src/commands/search.ts:106`), and `loadConfig` replaces an invalid value with the default (`src/core/config.ts:152`–`155`), so the check needs no validation of its own (scenario 4).
  - Findings get `path: pagePath(ctx.paths, page.path)` and, when there is one, `line`. `runLint` sorts them.
  - `src/search/filters.ts`'s `candidates` (`:65`) is not exported, so this module reads the same two places itself. It imports no `node:fs` module.
- **`src/lint/checks.ts`.** One import and `staleFactCheck` as the last entry of `PAGE_CHECKS` (R1).
- **`test/lint/staleness.test.ts`.** Unit tests on in-memory pages (`parsePage`) with a fixed `now`, and CLI tests through `runCli` with `commands: [createLintCommand({ now })]` on a temp repository; the read-only step hashes the repository with `hashTree(root)` (`src/ingest/snapshot.ts:52`) before and after.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper lint` | CLI | None | unchanged (STORY-005-02); `--check stale-fact` selects this check | `LintData`; adds `stale-fact` warnings |

Frozen exports (consumers: STORY-006-09 and STORY-006-11 name the check id):

```ts
// src/lint/staleness.ts
import type { LintCheck } from "./checks.js";
export const FINAL_STATUSES: readonly string[];   // done, complete, completed, closed, cancelled, canceled, superseded, rejected, resolved, shipped, released, archived
export const staleFactCheck: LintCheck;            // "stale-fact", warning, scope "pages"
```

Consumed (frozen): `LintCheck`, `LintContext`, `PAGE_CHECKS`, `pagePath`, `createLintCommand` (K2, STORY-005-02); `pageEntities`, `Entity`, `Page`, `Fact`, `TypedLink` (C1, `src/wiki/parse-page.ts`); `isCalendarDate` (`src/core/dates.ts`); `WikeeperConfig` (`src/core/config.ts`).

## Task Breakdown

- [x] `src/lint/staleness.ts`: status lookup (last `status::` link, frontmatter fallback), newest fact date, `FINAL_STATUSES`, age -> R2, R3, R5
- [x] `src/lint/staleness.ts`: planned dates (tentative, newest, wikilinks removed, first calendar date) -> R4
- [x] `src/lint/staleness.ts`: finding paths, lines and messages -> R3, R4, R6
- [x] `src/lint/checks.ts`: append `staleFactCheck` to `PAGE_CHECKS` -> R1
- [x] `test/lint/staleness.test.ts`: unit tests, and CLI tests per Gherkin scenario with an injected `now` -> §2.1

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | Status sources (typed link, frontmatter fallback, last of two `status::` lines, case-insensitive key); `FINAL_STATUSES` matching (first word, wikilinked value, value without letters); age at `stale_after_days`, one day over, and a future date; planned-date wikilink removal, an impossible date, a later fact on the same entity, a `decided` fact; entity without fact lines; finding path with a nested `content_dir` |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 4 | One per Gherkin scenario (Outline rows counted once), through `runCli` with a temp repository. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `npm run typecheck` and `npm test` pass, including STORY-005-02's tests in `test/lint/` and, when it has landed, STORY-005-03's, with `stale-fact` registered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/wiki/parse-page.ts:381` — `pageEntities`: entities with their own typed links and fact lines, the model this check walks.
- **Surface:** `src/search/filters.ts:65` — `candidates`, where `search --status` reads `status::` links and frontmatter `status`; this check reads the same two places.
- **Surface:** `src/core/config.ts:77` — `lint.stale_after_days`, a positive integer with default 30 (`validateLeaf`, `src/core/config.ts:106`).
- **Surface:** `src/core/dates.ts:6` — `isCalendarDate`.
- **Coverage of this requirement:** partial — the entity model, the status places, the config key and the date check exist; the staleness rule is net-new.

## Prior work

- [[EPIC-005]] (parent; §2 lists "volatile facts (status, dates) older than a configurable age"). The check was first drafted as R6 of [[STORY-005-03]] and split out (gate1-decisions item 2). It registers in [[STORY-005-02]]'s `PAGE_CHECKS` and uses its `pagePath`. [[STORY-001-02]] defined `lint.stale_after_days`. A grep of the wiki, `.cleargate/delivery/archive/` and FLASHCARD.md (2026-10-17) finds no other staleness work; no duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `search --status` (`src/search/filters.ts:65`) already reads statuses, and `search --since` (`src/search/since.ts`) reads fact dates.
- **Why isn't extension / parameterization / config sufficient?** Neither search mode ties a status to the dates of the facts of the same entity, and neither knows which statuses are final or which tentative facts name a plan. Answering "which facts went stale" with search would take one query per entity and a rule the agent applies by hand. The check is one pure module over the entity model the parser already builds, registered with one line.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2. (R1: scenario 3; R2: scenarios 1 and 4; R3: scenarios 1–4; R4: scenario 1; R5: scenarios 1, 2 and 4; R6: scenarios 1 and 3.)
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (The new source file is EPIC-005 §0's `src/lint/staleness.ts`; `src/lint/checks.ts` is STORY-005-02's; the cited existing lines were verified 2026-10-17.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1 approved by the human on 2026-10-17: every §1.4 Decision line is approved as recommended.
