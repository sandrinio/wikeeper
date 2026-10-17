---
story_id: STORY-003-09
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-003 (approved 2026-10-16) §1 metrics, §5 · architecture.md §7.3 (post-hook), §7.5 (report), §8 (citations), D-05, D-08 · SPRINT-02 decomposition brief contracts 1, 3, 5, 7, 8, 9 · verified src/core/config.ts, src/commands/hook.ts, test/e2e/goal.test.ts
actor: AI coding agent (writer)
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-003-03
  - STORY-003-04
  - STORY-003-05
  - STORY-003-06
  - STORY-003-07
  - STORY-003-08
  - STORY-004-01
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-17T07:30:08Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 1
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T07:30:40Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 6e6f21164478c36e4ed33b287909c440d513d9240ca57738a39cd274e14d0853
stamp_error: no ledger rows for work_item_id STORY-003-09
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:52:16Z
  sessions: []
---

# STORY-003-09: `wikeeper ingest finish`, report, lint hook point, end-to-end ingest test
**Complexity:** L3 — the post-hook that closes every ingest (diff, validate, index, log, hooks, lint, report, release), plus the end-to-end test that drives the whole pipeline from the packed package.

## 1. The Spec (The Contract)

### 1.1 User Story
As a user whose agent just wrote wiki pages from a source, I want the CLI to check what actually changed, refuse uncited or out-of-bounds edits, record the ingest and show me only its metadata, so that every change in my wiki is attributable to a source and I can trust the report without reading the content.

### 1.2 Detailed Requirements
- **R1 — Preconditions.** `wikeeper ingest finish <id> [--json]` requires the lock to name `<id>` (no lock → exit 1 `not_applied`; another holder → exit 1 `locked`, naming it), a readable snapshot (else exit 1 `snapshot_missing`, lock kept, pointing to `wikeeper ingest abort <id>`), and the facts file unchanged since `apply` (its sha256 equals `snapshot.facts_sha256`, else exit 1 `facts_changed` with "run wikeeper ingest abort <id>, then apply again"; lock kept).
- **R2 — Diff.** Compares `pages/` now with `snapshot.pages`: `created`, `updated`, `deleted`, each a sorted list of paths relative to `pages/`, POSIX.
- **R3 — Validation.** Every created or updated `.md` page must cite the source. `citesSource(page, id)` is true when any of these holds: its parsed wikilinks (STORY-004-01) include `<id>`, as `[[<id>]]` or `[[<id>|…]]`; its `frontmatter.sources` includes `<id>` (bare or `[[<id>]]`, both normalized by STORY-004-01 R1); or the page is the source page itself, `page.path === "sources/<id>.md"` (an agent may cite there only in frontmatter). (Human request, 2026-10-16.) Against `snapshot.outside`, any entry now modified or deleted is a write outside `pages/` (new files are allowed). On any violation: exit 1, code `validation_failed`, `details: { uncited: [...], outside: [...], invalid: [...] }` (`invalid` per R10), the human message names each file, and nothing else happens — lock and snapshot are kept for a fix or `abort` (EPIC-003 integrity rule). Deleted pages are allowed and reported. A missing `pages/sources/<id>.md` is a warning, not an error. An empty diff is valid.
- **R4 — Post steps, in order** (architecture.md §7.3): `writeIndex`; `writeLogEvent` with an `ingest` event; `regenerateLogView`; `runUserHooks("post_ingest", config.hooks.post_ingest, { cwd: root, sourceId: id })` (default `USER_HOOK_TIMEOUT_MS`, 60 s); `runLintHook`; remove the snapshot; release the lock; print the report.
- **R5 — Post steps never undo a validated ingest.** A `post_ingest` command that exits non-zero or times out, a lint hook that throws, and any lint finding become warnings in the report; `finish` still exits 0 and releases the lock.
- **R6 — Re-running an interrupted finish.** When an `ingest` log event for `<id>` already exists and the lock still names `<id>` (a previous `finish` stopped after logging), `finish` writes no second event and runs no hooks again; it regenerates the index and log view, removes the snapshot, releases the lock, exits 0, and warns that the ingest was already recorded in that log file.
- **R7 — Report** (architecture.md §7.5; metadata only, D-08). Data: `{ source_id, kind, rule_version, permission, origin, size, sha256, created, updated, deleted, contradictions, rule_suggestions, log_file, index_changed, hooks, lint }`. `kind` and `rule_version` come from the facts file; `origin`, `size`, `sha256` and `permission` (the mode recorded at `start`, `SourceMeta.permission.mode`) from the source meta; `contradictions` counts fact lines flagged as contradictions (parser flag) that cite `<id>` in the created and updated pages; `rule_suggestions` is the length of the facts file's `uncovered`. Human output:
  ```
  ✅ Ingested <id>
     kind <kind> · origin <origin> · <size> · sha <first 4 hex>…
     rule <kind> v<rule_version> · permission <permission>
     created <n> · updated <n> · deleted <n> · contradictions <n> · rule suggestions <n>
  ```
  (`rule <kind> v…` reads `no rule for <kind>` when `rule_version` is null; `<size>` in B, KB or MB with one decimal.)
- **R8 — Lint hook point** (`src/ingest/lint-hook.ts`, contract 9). `setLintHook(hook | null)` registers one hook; `runLintHook(ctx)` returns its findings, or `[]` when none is registered (the default in SPRINT-02). EPIC-005 fills it in SPRINT-03 without touching `finish`.
- **R9 — End-to-end test** `test/e2e/ingest.test.ts`, run against the packed package like `test/e2e/goal.test.ts`. It plays the agent for each source type under the permission mode in §2.1's last scenario: `start` (or `plan` then `start`), `facts`, `apply`, page edits citing the source plus `pages/sources/<id>.md`, `finish`. It asserts the report, the log event, the index line, no `.wiki/.lock`, and that every page changed in the test appears in exactly one `ingest` log event (EPIC-003 metric: zero page changes without a log entry).
- **R10 — Valid frontmatter** (walkthrough row 8.3; CR review-feedback, human 2026-10-17). A created or updated `.md` page whose `parsePage` errors include `frontmatter_yaml` or `frontmatter_field` (STORY-004-01) is an R3 violation: `details.invalid` holds one `{ path, message }` per such error, sorted by `path` (relative to `pages/`, POSIX; a page's own errors keep parser order); `message` is `line <n>: <the parser message's first line without yaml's " at line L, column C:" suffix>`, or that text alone when the error has no line; the human message adds `frontmatter errors: <path> (<message>), …`. "details.invalid names <file>" means one entry's `path` is that file. Such a page is not judged for citations (its frontmatter `sources` could not be read); the rerun after the fix judges it. Lock and snapshot are kept (R3), so the writer fixes the page in the same write phase. Fact-line errors (`fact_status`, `fact_date`) and pages not created or updated by this ingest are not checked here; they stay `writeIndex` warnings (STORY-003-07 R6).

### 1.3 Out of Scope
- The lint checks themselves (EPIC-005, SPRINT-03); a lint finding never changes the exit code here.
- `wikeeper read` and real URL fetching (SPRINT-03): the URL case uses agent-supplied text.
- Migrating `test/e2e/goal.test.ts` onto the shared pack helper (a D.5 consolidation item).

### 1.4 Open Questions

- None. Decided here: post steps never fail a validated ingest (R5), so a broken `git commit` hook cannot leave the wiki locked; contradictions are counted from the parser's flag and rule suggestions from `uncovered` (R7).

### 1.5 Risks

- **Risk:** The end-to-end test consumes every EPIC-003 command surface (`start` flags, `plan` JSON, `facts`, `apply`, `abort`) drafted in parallel, so it is the most likely place for an integration mismatch.
- **Mitigation:** It integrates last (all EPIC-003 stories upstream) and runs on the merged tree; mismatches are fixed in the consuming test, never by renaming a frozen export.
- **Risk:** Packing the package in `beforeAll` is slow on the Windows runner.
- **Mitigation:** One pack per test file, shared through `test/e2e/pack.ts`; the same 180 s budget as `goal.test.ts`.
- **Risk:** A writer edits `index.md` by hand during the write phase.
- **Mitigation:** R3 reports it as a write outside `pages/`; `index rebuild` refuses while the lock exists (STORY-003-07), so the CLI itself never trips this check.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A first finish and a re-run of an interrupted finish both complete; the end-to-end scenario covers four source paths. |
| Interfaces | F | CLI only (the agent's hook surfaces are covered by STORY-003-08). |
| Data | T | Validation outcome depends on which file changed and how; the end-to-end outline varies source type and permission mode. |
| Rules | T | Citation rule, no writes outside `pages/`, post steps never undo a validated ingest, preconditions. |

```gherkin
Feature: wikeeper ingest finish

  @paths
  Scenario: A cited write is recorded and reported
    Given permission mode "ai", source "src-2026-10-16-notes" applied with facts holding one uncovered item
    And since apply pages/projects/atlas.md was updated with a fact citing "[[src-2026-10-16-notes]]" and a contradiction-flagged fact citing it
    And pages/sources/src-2026-10-16-notes.md was created citing it only in its frontmatter sources
    And pages/old.md, unchanged since before apply, has the frontmatter line "title: Old: page"
    When I run "wikeeper ingest finish src-2026-10-16-notes --json"
    Then the exit code is 0
    And the report lists updated ["projects/atlas.md"], created ["sources/src-2026-10-16-notes.md"], contradictions 1 and rule_suggestions 1
    And an ingest log event names the source with the same created and updated lists
    And index.md lists projects/atlas.md and log.md shows the event
    And .wiki/.lock and .wiki/.snapshots/src-2026-10-16-notes are gone
    And the human output's first line is "✅ Ingested src-2026-10-16-notes"
    And the warnings name .wiki/pages/old.md

  @rules @data
  Scenario Outline: Error — finish rejects uncited changes, invalid frontmatter and writes outside pages/
    Given "src-2026-10-16-notes" is applied
    And since apply <change>
    When I run "wikeeper ingest finish src-2026-10-16-notes --json"
    Then the exit code is 1 with error code "validation_failed"
    And details.<list> names "<file>"
    And .wiki/.lock still names the source and no ingest log event exists for it

    Examples:
      | change                                                       | list     | file                                 |
      | pages/team.md changed without "[[src-2026-10-16-notes]]"     | uncited  | team.md                              |
      | raw/src-2026-10-16-older.meta.json was edited                | outside  | raw/src-2026-10-16-older.meta.json   |
      | index.md was edited                                          | outside  | index.md                             |
      | pages/glossary.md was created citing "[[src-2026-10-16-notes]]" with the frontmatter line "summary: Acmeworks terms: a glossary" | invalid  | glossary.md                          |

  @rules
  Scenario: Post steps report problems but never undo a validated ingest
    Given hooks.post_ingest is ["node -e \"process.exit(1)\"", "node -e \"require('fs').writeFileSync('hook.txt', '{source_id}')\""]
    And a lint hook is registered that returns one warning finding
    And "src-2026-10-16-notes" is applied with a cited page change
    When I run "wikeeper ingest finish src-2026-10-16-notes --json"
    Then the exit code is 0 and .wiki/.lock is gone
    And the warnings include the failing hook command and the lint finding
    And hook.txt contains "src-2026-10-16-notes"

  @rules @paths
  Scenario Outline: finish checks its preconditions
    Given <state>
    When I run "wikeeper ingest finish src-2026-10-16-notes --json"
    Then the exit code is <exit> and the result is "<result>"

    Examples:
      | state                                                                                   | exit | result                                                      |
      | "src-2026-10-16-notes" is registered with facts but not applied                         | 1    | error not_applied                                           |
      | "src-2026-10-16-notes" is applied and its facts file was resubmitted after apply        | 1    | error facts_changed, lock kept                              |
      | an ingest log event names "src-2026-10-16-notes" and the lock still names it            | 0    | lock released, still exactly one ingest event for the source |

  @paths @data
  Scenario Outline: End to end from the packed package under every permission mode
    Given an initialised repository using the packed wikeeper with ingest.permission "<mode>"<whitelist>
    When the test agent registers <source> by <register>
    And submits facts, applies, edits a page citing the source, writes pages/sources/<id>.md and runs finish
    Then every command exits as expected and finish exits 0
    And the report counts the page changes, the log event lists them, and index.md lists the edited page
    And no .wiki/.lock remains

    Examples:
      | mode      | whitelist                                  | source                                      | register                                                        |
      | ai        |                                            | the file notes.md                           | "ingest start notes.md"                                         |
      | ask       |                                            | a chat excerpt on stdin                     | "ingest start -" (exit 3), then "ingest start - --approved"     |
      | whitelist | with origins ["docs/meetings/**"]          | the directory docs/meetings with two files  | "ingest plan docs/meetings", then "ingest start" per new file    |
      | whitelist | with origins ["*.example.com"]             | https://intranet.example.com/q4 with text   | "ingest start https://intranet.example.com/q4 --text-file q4.md" |
```

### 2.2 Verification Steps (Manual)
- [ ] Ingest a real meeting note in a scratch repo with an agent, then read the `finish` report and the `log/` file it names.
- [ ] Make the agent forget a citation and read the `validation_failed` message; fix the page and finish again.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/commands/ingest-finish.ts` |
| Related Files | `src/ingest/diff.ts`, `src/ingest/validate.ts`, `src/ingest/report.ts`, `src/ingest/lint-hook.ts`, `src/commands/ingest.ts`, `test/ingest/finish.test.ts`, `test/ingest/report.test.ts`, `test/e2e/ingest.test.ts`, `test/e2e/pack.ts`, `test/ingest/finish-frontmatter.red.node.test.ts` (QA-Red, R10; 2026-10-17) |
| New Files Needed | Yes — `src/commands/ingest-finish.ts`, `src/ingest/diff.ts`, `src/ingest/validate.ts`, `src/ingest/report.ts`, `src/ingest/lint-hook.ts`, `test/ingest/finish.test.ts`, `test/ingest/report.test.ts`, `test/e2e/ingest.test.ts`, `test/e2e/pack.ts` |

### 3.2 Technical Logic
- **Diff.** `hashTree(pagesDir)` (STORY-003-08) against `snapshot.pages`; `diffOutside` = `hashOutside(paths)` against `snapshot.outside`, keeping only modified and deleted keys.
- **Citation check.** Parse each created/updated `.md` page with `parsePage(text, rel)`; a page cites `<id>` when `page.wikilinks` contains `<id>` (the parser strips `|alias`). Non-`.md` files under `pages/` are diffed and reported but not citation-checked.
- **Contradictions.** For created/updated pages, count `page.facts` entries with `contradiction === true` whose `sources` include `<id>`.
- **Frontmatter check** (R10). In the citation loop, parse each page once; collect its errors with code `frontmatter_yaml` or `frontmatter_field` into `invalid` (a private helper keeps the first message line and drops yaml's position suffix); a page with such errors skips `citesSource`; `invalid` is stable-sorted by path. `ingest finish` adds the `frontmatter errors:` message part and `invalid` to `details`.
- **Order and failure.** Validation is pure (reads only). The first write is `writeIndex`; from there on errors in index/log writing are real errors (exit 1, lock kept, so `finish` can be re-run per R6), while hook and lint problems follow R5.
- **Re-run detection** (R6): `readLogEvents(paths, { type: "ingest", sourceId: id })` before validation; when non-empty and the lock names `id`, skip validation, event and hooks.
- **Hook results.** `runUserHooks` returns one `UserHookResult` per command; each result for which `hookFailed(result)` is true becomes the warning `post_ingest hook failed: <command> (exit <n> | timed out)`.
- **Pack helper.** `test/e2e/pack.ts` exports `packCli(): Promise<{ cli: string; cleanup(): Promise<void> }>` with the same build, `npm pack` (via `npm_execpath`, flashcard `#windows #test-harness`) and extract steps as `test/e2e/goal.test.ts`; `goal.test.ts` is not changed.
- **Registration.** `src/commands/ingest-finish.ts` exports `ingestFinishCommand: IngestSubcommand`; append it to `ingestSubcommands` in `src/commands/ingest.ts` (STORY-003-04 §3.3).
- **End-to-end flows.** URL case: no fetch — `ingest start <url> --text-file <file>` stores the agent's text as `raw/<id>.md` (STORY-003-01/04). Ask case: the first `ingest start -` exits 3 `needs_approval` with nothing stored; the rerun adds `--approved`. Directory case: `ingest plan <dir> --json`, then `ingest start <entry.path>` for every entry with `status: "new"`. The source id is read from `IngestStartResult.id`.

### 3.3 API Contract (if applicable)

Frozen exports (consumers: EPIC-005 lint and `status`):

```ts
// src/ingest/lint-hook.ts
import type { ResolvedPaths } from "../core/paths.js";
export interface LintFinding { id: string; severity: "info" | "warning" | "error"; message: string; path?: string }
export interface LintHookContext { paths: ResolvedPaths; sourceId: string; changed: string[] }   // changed: created ∪ updated, relative to pages/
export type LintHook = (ctx: LintHookContext) => Promise<LintFinding[]>;
export function setLintHook(hook: LintHook | null): void;
export function runLintHook(ctx: LintHookContext): Promise<LintFinding[]>;

// src/ingest/diff.ts
import type { SnapshotInfo } from "./snapshot.js";
export interface PageDiff { created: string[]; updated: string[]; deleted: string[] }
export function diffPages(paths: ResolvedPaths, snapshot: SnapshotInfo): Promise<PageDiff>;
export function diffOutside(paths: ResolvedPaths, snapshot: SnapshotInfo): Promise<{ modified: string[]; deleted: string[] }>;

// src/ingest/validate.ts
import type { Page } from "../wiki/parse-page.js";
export interface IngestValidation { ok: boolean; uncited: string[]; outside: string[]; invalid: Array<{ path: string; message: string }>; warnings: string[] }   // invalid: additive (R10, 2026-10-17)
export function citesSource(page: Page, sourceId: string): boolean;
export function validateIngest(
  paths: ResolvedPaths, sourceId: string, diff: PageDiff, outside: { modified: string[]; deleted: string[] },
): Promise<IngestValidation>;

// src/ingest/report.ts
import type { IngestPermission } from "../core/config.js";
import type { UserHookResult } from "./user-hooks.js";
export interface IngestReport {
  source_id: string; kind: string; rule_version: number | null; permission: IngestPermission;
  origin: string; size: number; sha256: string;
  created: string[]; updated: string[]; deleted: string[];
  contradictions: number; rule_suggestions: number;
  log_file: string; index_changed: boolean;
  hooks: UserHookResult[];                 // from src/ingest/user-hooks.ts (STORY-003-03)
  lint: LintFinding[];
}
export function countContradictions(pages: readonly Page[], sourceId: string): number;
export function formatReport(report: IngestReport): string[];
export function formatSize(bytes: number): string;
```

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper ingest finish <id>` | CLI | None | `--json` | `IngestReport` (above) |

```ts
// src/commands/ingest-finish.ts
import type { IngestSubcommand } from "./ingest.js";
export const ingestFinishCommand: IngestSubcommand;
```

Consumed (frozen in their stories' §3.3, except the parser, drafted in parallel): `parsePage`, `Page.wikilinks`, `Page.facts[].contradiction` and `Page.facts[].sources` (STORY-004-01); `readMeta` → `SourceMeta.origin`, `size`, `sha256`, `permission.mode` (STORY-003-01); `runUserHooks`, `hookFailed`, `UserHookResult` (STORY-003-03); `IngestSubcommand`, `ingestSubcommands`, `IngestStartResult.id` (STORY-003-04); `IngestPlan.entries[].path` / `status` (STORY-003-05); `readFacts`, `factsFilePath` (STORY-003-06); `writeIndex`, `writeLogEvent`, `readLogEvents`, `regenerateLogView`, `IngestLogEvent` (STORY-003-07); `readLock`, `releaseLock`, `readSnapshot`, `removeSnapshot`, `hashTree`, `hashOutside` (STORY-003-08); the `ingest start` flags `--approved` and `--text-file` in the end-to-end test.

## Task Breakdown

- [x] Implement `lint-hook.ts` with the no-op default -> R8
- [x] Implement `diff.ts` (pages and outside) on top of the snapshot hashes -> R2, R3
- [x] Implement `validate.ts`: citation check via the parser, outside-write check, source-page warning -> R3
- [x] Implement `report.ts`: report assembly, contradiction count, size formatting, human lines -> R7
- [x] Implement `ingest finish`: preconditions, validation, ordered post steps, warnings policy, re-run path; register in `src/commands/ingest.ts` -> R1, R4, R5, R6
- [x] Add `test/e2e/pack.ts` and `test/e2e/ingest.test.ts` covering the four source paths and three modes -> R9
- [x] CLI tests per Gherkin scenario in `test/ingest/finish.test.ts`; report formatting tests in `test/ingest/report.test.ts` -> §2.1
- [ ] `validate.ts`: frontmatter errors of created/updated pages into `invalid`, sorted; invalid pages skip the citation check -> R10
- [ ] `ingest finish`: `details.invalid` and the `frontmatter errors:` message part -> R3, R10
- [ ] Unit tests for R10 in `test/ingest/finish.test.ts` -> R10

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 7 | diff created/updated/deleted; outside modified vs new; citation with and without alias, through `frontmatter.sources` only, and the source page `sources/<id>.md` with no citation at all; contradiction count; size formatting; lint hook default and registered; frontmatter YAML and field errors on created/updated pages, sorted, and an invalid page not judged for citations (R10) |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once); the last is covered in-process by QA-Red's `test/ingest/ingest-flow.red.node.test.ts` and run against the packed package by the Developer's `test/e2e/ingest.test.ts`, with all four rows (CR:spec-clarification 2026-10-16: red-first stays intact and the Goal check's file name is kept; one pack per file). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.
- [ ] `test/e2e/ingest.test.ts` passes on Linux, macOS and Windows in CI.

## Existing Surfaces

- **Surface:** `src/core/config.ts:24` — `hooks.post_ingest` is already part of the config schema.
- **Surface:** `src/commands/hook.ts:59` — the guard stops allowing page writes once `finish` releases the lock.
- **Surface:** `test/e2e/goal.test.ts:15` — the pack-and-extract set-up the end-to-end test follows.
- **Surface:** `src/core/output.ts:90` — `emitResult` carries the report and its warnings in one envelope.
- **Coverage of this requirement:** partial — config, guard, output envelope and the e2e pattern exist; finish, diff, validation, report and the lint hook point are net-new.

## Prior work

- [[EPIC-003]] (parent), [[EPIC-004]] (page parser from STORY-004-01 for citations and contradictions), [[EPIC-005]] (fills the lint hook point). No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** The report must reflect what changed on disk, not what the agent claims (architecture.md §7.5), and citations must be checked per page; only a diff against the snapshot plus a parser-based check gives that. Folding it into `apply` or the guard is impossible because the pages do not exist yet at those points.

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
