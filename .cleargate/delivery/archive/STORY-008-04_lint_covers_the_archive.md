---
story_id: STORY-008-04
parent_epic_ref: EPIC-008
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-008 (approved 2026-10-18) §2 (Lint: links to archived names, live page first, orphan/uncited-claim/stale-fact skip archive/, unlogged-change covers archive/), §5 (link scenario) · SPRINT-04 decomposition brief, contract K12 (owned), K9 (consumed: paths.archiveDir, SnapshotInfo.archive, PageDiff.archive, archive_hashes), K11 (consumed: buildIndex archived option), K7 (oversized-page, STORY-007-05, lands first in src/lint/checks.ts) · verified src/lint/checks.ts, src/lint/links.ts, src/lint/unlogged.ts, src/lint/paths.ts, src/lint/staleness.ts, src/lint/citations.ts, src/commands/lint.ts, src/ingest/lint-hook.ts, src/commands/ingest-finish.ts (finishLintHook, runLintHook call), src/ingest/log.ts, src/ingest/snapshot.ts, tsconfig.json (includes test/) and test/lint/lint.red.node.test.ts:278 (a LintContext literal) read 2026-10-18"
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-008-01
  - STORY-008-03
  - STORY-007-05
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T07:58:00Z
updated_at: 2026-10-18T07:58:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T07:59:42Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-008-04
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-18T07:59:41Z
  sessions: []
---

# STORY-008-04: Lint covers the archive: links, skipped checks, `unlogged-change`, `index-drift`
**Complexity:** L2 — small, pattern-following edits across the lint registry and its check modules (`src/lint/checks.ts`, `src/lint/links.ts`, `src/lint/paths.ts`), one archive pass in `src/lint/unlogged.ts` that mirrors its `pages/` pass, archive loading in `src/commands/lint.ts`, and the finish lint hook (`src/ingest/lint-hook.ts`, `finishLintHook` in `src/commands/ingest-finish.ts`). Consumes K9 (STORY-008-01), K11 (STORY-008-03) and STORY-007-05's `oversized-page` check.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent keeping the wiki, I want lint to treat `archive/` as part of the wiki where it matters (links to archived names resolve, hand edits to archived lines are caught, the index count is checked) and to leave it out where it does not (orphans, citations, staleness, page size), so that a clean-up leaves lint clean and the archive stays as trustworthy as `pages/`.

### 1.2 Detailed Requirements
- **R1 — Lint context (K12).** `LintContext` gains `archivePages?: Page[]`: the parsed archive pages, `Page.path` relative to `archive/`; missing means `[]`. It is optional, not required as K12 writes it (§1.4 Q3). It also gains `onlyArchive?: string[]`, input only, set by the finish hook: archive paths relative to `archive/`. When `only` or `onlyArchive` is set, `runLint` keeps the findings whose path is `pagePath` of an `only` entry or `archivePath` of an `onlyArchive` entry; a missing list counts as `[]`.
- **R2 — Archive finding paths.** `src/lint/paths.ts` exports `archivePath(paths, rel)`, e.g. `"projects/atlas.md"` → `".wiki/archive/projects/atlas.md"`, repository-relative POSIX, following `content_dir`, built like `pagePath`. `src/lint/checks.ts` re-exports it next to `pagePath`. Every archive finding uses it.
- **R3 — Link resolution, live page first (K12).** `linkResolver(pages, archivePages = [])`:
  - Archive pages get the same keys as `pages/` pages (path without `.md`, file name, title, entity names, aliases), plus `archive/<path without .md>` (§1.4 Q2). Only a live page stored under `pages/archive/` could hold that key too, and then it wins, as live pages always do.
  - A target that matches a `pages/` key resolves to those `pages/` paths only. Otherwise it resolves to the matching archive paths. Otherwise it is `[]`, which means broken.
  - With no archive pages it behaves exactly as today (`test/lint/links.test.ts`).
- **R4 — `broken-link` reads both trees (§1.4 Q1).** It checks the links on `pages/` pages and on archive pages, resolving each over both trees (R3). Archive findings carry `archivePath` and today's messages.
- **R5 — `orphan-page` stays on `pages/`.** Its candidates are `ctx.pages`. Only links on `ctx.pages`, resolved over `pages/` alone (`linkResolver(ctx.pages)`), count. So a link from an archive page never makes a live page linked, and an archive page is never an orphan.
- **R6 — Other page checks skip the archive (K12).** `uncited-claim`, `stale-fact` and `oversized-page` (K7, STORY-007-05) read `ctx.pages` only. Their code does not change; tests pin that no finding from them names an archive path.
- **R7 — `index-drift` counts the archive (K12).** It compares `index.md` with `buildIndex(ctx.pages, { archived: (ctx.archivePages ?? []).length })` (K11). Messages are unchanged. When only the count differs, no entry line differs, so the finding is `index.md is out of date: run wikeeper index rebuild` (`src/lint/checks.ts:146`).
- **R8 — `unlogged-change` covers `archive/` (K12, K9).** One archive pass, next to the `pages/` pass and with the same mode, skips and messages:
  - **Archive set.** Normal mode uses `ctx.archivePages` paths, read from `paths.archiveDir`. Snapshot mode, during an open write phase, uses the `.md` keys without dot segments of the snapshot's `archive` map, read from `<snapshot>/archive`; an older snapshot without the map gives `{}`.
  - **Touches.** For each `ingest` event, using the same snapshot-mode skips as `pages/`, each key of a valid `archive_hashes` map (`isPageHashes`) records that event as the archive page's last touch. Events without `archive_hashes` touch no archive page.
  - **Judged.** The archive set and the touched keys, `.md` only, minus private entries. The private test is the one `pages/` uses, on the same relative path: a `private:` entry also covers its archive file.
  - **Findings** (errors, `archivePath`, with the snapshot suffix `, before ingest <id> was applied` when in snapshot mode):
    - a file that no event touched → `in no ingest log event`;
    - a file that is touched but missing → `deleted without a log entry (last recorded by ingest <src>, <file>)`;
    - a file whose hash differs from the recorded hash (`pageHash`) → `changed since ingest <src> recorded it (<file>)`.
  - No baseline `info` line for the archive: no event written before 0.4.0 can touch `archive/`.
- **R9 — `wikeeper lint` loads the archive.** It loads `loadPages(paths.archiveDir)` into `archivePages`. When there is at least one archive page, the first human line is `checked <plural(n, "page")> and <plural(m, "archived page")> with <plural(k, "check")>`, as `src/commands/lint.ts:48` already writes its counts, e.g. `checked 12 pages and 3 archived pages with 7 checks`, or `checked 1 page and 1 archived page with 7 checks`; otherwise it is unchanged (`test/lint/lint-command.test.ts:125`). `LintData` is unchanged.
- **R10 — Finish lint hook covers archive changes.**
  - `LintHookContext` gains `archiveChanged?: string[]`: the archive pages created or updated by the ingest, relative to `archive/`. `ingest finish` passes the created and updated lists of `diff.archive` (K9), sorted, to `runLintHook`.
  - `finishLintHook` returns `[]` when `changed` and `archiveChanged` are both empty (`test/ingest/finish-lint.test.ts:16`). Otherwise it also loads the archive pages and runs `FINISH_CHECKS` (unchanged) with `only: changed` and `onlyArchive: archiveChanged`.
  - So a page that links to its archive or to a page moved whole to `archive/` gets no `broken-link` warning, and a broken link on a changed archive page is reported as `lint [error] broken-link .wiki/archive/<path>:<line>: …`, as a warning, like today.

### 1.3 Out of Scope
- `buildIndex`'s archived line and `writeIndex`'s count (STORY-008-03, K11).
- Refusing dropped or changed archived lines at `ingest finish` (STORY-008-02, K10).
- New lint checks, new finding ids, and `lint --rules`.
- Instruction text for fixing an archive finding, and the link form a writer leaves on a page (STORY-008-06; R3 resolves the form recommended in §1.4 Q2).
- `oversized-page` itself (STORY-007-05).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1, broken links inside the archive):** K12 lists orphan, uncited-claim, stale-fact and oversized-page as the checks that skip `archive/`, and does not list broken-link. But an archived fact line can never change in an ingest (K10 refuses a dropped archived line), so a broken link inside one cannot be fixed by editing it.
- **Recommended:** `broken-link` reads archive pages too, at error severity (R4). The fix is to add the old name as an alias of the live page that now carries the entity. That also keeps `search --entity <old name>` working. WIKI.md (STORY-008-06) says so. The alternative is to leave archive pages out of broken-link.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2, link to a page's archive; the same question as STORY-008-06 §1.4 Q1):** EPIC-008 §2 tells the writer to "leave a link on the page to its archive". In what form? `[[projects/atlas]]` resolves to the live page itself.
- **Recommended (agreed with STORY-008-06 by the consistency audit, 2026-10-18):** the typed line `archive:: [[archive/projects/atlas]]`, the page's path without `.md` under `archive/`. Checked against the code: `linkResolver` keys pages by path without `.md`, names and aliases (`src/lint/links.ts:14`), so R3's extra `archive/<path>` key makes the link resolve to the archive page, and `broken-link` catches a wrong path. A bare prose line such as `Older facts: [[archive/projects/atlas]]` would be an `uncited-claim` error unless it also cited a source (`claimBlocks`, `src/lint/citations.ts:82`), while a `key::` line is never a claim (`TYPED_RE`, `src/lint/citations.ts:17`) and still puts its link in `page.links` (`src/wiki/parse-page.ts:326`). Search is unaffected: backlinks are keyed by the link text (`buildBacklinks`, `src/wiki/parse-page.ts:460`), and `search --entity` shows the line among the entity's `typed_links`. The page cites the clean-up through its frontmatter `sources` (`citesSource`, `src/ingest/validate.ts:36`). STORY-008-06 writes the instruction with this form.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q3, contract K12 vs code):** K12 makes `LintContext.archivePages: Page[]` required. `tsconfig.json` includes `test/`, and the immutable red file `test/lint/lint.red.node.test.ts:278` builds a `LintContext` literal without it. A required field fails `npm run typecheck`.
- **Recommended:** `archivePages?: Page[]`, with missing meaning `[]` (R1). `wikeeper lint` and the finish hook always set it.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q4, file surface):** `finishLintHook` and the `runLintHook` call are in `src/commands/ingest-finish.ts` (`:42`, `:229`), not in `src/ingest/lint-hook.ts`. The decomposition brief's shared-file table lists that file for 008-01, 007-05 and 008-02 only.
- **Recommended:** This story edits `ingest-finish.ts` in those two places only and merges after the three. The consistency audit (2026-10-18) has added 008-04 to that row of the decomposition brief (merge order 008-01 → 007-05 → 008-02 → 008-04); confirm at Gate 1.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **DRAFTS review (designer, 2026-10-18):** wording aligned with docs/ux.md — the first `lint` line writes each count with the plural helper instead of `page(s)` and `check(s)` (R9). No decision changed.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** An archive page shares its `Page.path` with its live namesake, so a set of plain paths cannot tell the trees apart: the resolver's results, `only` filtering, and the private test.
- **Mitigation:** Findings use `pagePath` or `archivePath`, so the path strings differ by tree. `onlyArchive` is separate from `only`. Orphan uses a `pages/`-only resolver (R5), so it never reads an archive result as a live path. Unit tests use a name present in both trees.
- **Risk:** With Q1 as recommended, every merge or rename that drops an old name turns archived links to it into lint errors.
- **Mitigation:** The alias fix is one frontmatter edit in an ingest. The finish hook only reports archive pages the ingest changed, so old archive errors show in `wikeeper lint`, not in every finish report.
- **Risk:** `src/lint/checks.ts` is edited by STORY-007-05 (`oversized-page`), and `src/commands/ingest-finish.ts` by 008-01, 007-05 and 008-02.
- **Mitigation:** Both are predecessors or ordered before this story (§1.4 Q4). This story keeps the INSERTION POINT and "keep this line" lines of `checks.ts` and adds no new check.
- **Risk:** A red row asserting "no finding" passes before the check sees the archive (FLASHCARD 2026-10-17 `#red-test #lint`, `#qa #red-test`).
- **Mitigation:** Each such row runs `--check <id>` and asserts `json.ok` first, and the same fixture has a row that does produce a finding on an archive path.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | Lint has one way through: every run reads both trees; the variations are data and the two surfaces below. |
| Interfaces | T | `wikeeper lint` and the `ingest finish` lint hook. |
| Data | T | A name in one tree, in both, in neither; hand edits to archive files; a private entry; an open write phase. |
| Rules | T | Live page first; checks that skip the archive; `unlogged-change` over `archive_hashes`; the index count. |

Each fixture is an initialised wiki with `pages/sources/` pages for the cited sources (FLASHCARD 2026-10-17 `#lint #fixtures`).

```gherkin
Feature: Lint covers the archive

  @data @rules
  Scenario Outline: Links resolve over pages/ and archive/, the live page first
    Given pages/team.md (type team) with the line "<line>"
    And <trees>
    When I run "wikeeper lint --check broken-link orphan-page --json"
    Then json.ok is true
    And <outcome>

    Examples:
      | line                                                | trees                                                                                | outcome                                                                              |
      | See [[beta]]. [[src-2026-10-10-a]]                  | archive/projects/beta.md (title Beta) and no pages/projects/beta.md                  | no broken-link finding is on .wiki/pages/team.md                                     |
      | See [[archive/projects/atlas]]. [[src-2026-10-10-a]] | pages/projects/atlas.md and archive/projects/atlas.md                               | no broken-link finding is on .wiki/pages/team.md                                     |
      | See [[atlas]]. [[src-2026-10-10-a]]                 | pages/projects/atlas.md and archive/projects/atlas.md (both titled Atlas)            | no orphan-page finding names .wiki/pages/projects/atlas.md                           |
      | See [[ghost]]. [[src-2026-10-10-a]]                 | no page and no archive page named ghost                                              | a broken-link error on .wiki/pages/team.md says "[[ghost]] does not resolve to a page" |
      | Team notes. [[src-2026-10-10-a]]                    | pages/projects/atlas.md, linked only from archive/projects/old.md ("See [[atlas]].") | an orphan-page warning names .wiki/pages/projects/atlas.md, and no finding names .wiki/archive/projects/old.md as an orphan |

  @rules
  Scenario: Page checks skip archive pages; broken-link reads them
    Given config tokens.page yellow 50 and red 100, lint.stale_after_days 30, and today 2026-10-18
    And pages/team.md with one cited line
    And archive/projects/beta.md, linked from no page, with "status:: active", a fact dated 2026-06-01 without a citation, an uncited prose line, more than 100 tokens of text, and the line "See [[ghost]]."
    When I run "wikeeper lint --check orphan-page uncited-claim stale-fact oversized-page broken-link --json"
    Then json.ok is true
    And no orphan-page, uncited-claim, stale-fact or oversized-page finding has a path starting ".wiki/archive/"
    And one broken-link error is on .wiki/archive/projects/beta.md and says "[[ghost]] does not resolve to a page"
    And "wikeeper lint" prints a first line starting "checked 1 page and 1 archived page with"

  @rules @data
  Scenario Outline: unlogged-change covers archive/
    Given a wiki whose ingest event from "src-2026-10-18-cleanup" records archive_hashes for projects/atlas.md, matching archive/projects/atlas.md
    And <change>
    When I run "wikeeper lint --check unlogged-change --json"
    Then json.ok is true and <outcome>

    Examples:
      | change                                                                                        | outcome                                                                                                                         |
      | nothing changes                                                                               | no unlogged-change finding has a path starting ".wiki/archive/", and the exit code is 0                                         |
      | a line is appended to archive/projects/atlas.md by hand                                       | an error on .wiki/archive/projects/atlas.md says "changed since ingest src-2026-10-18-cleanup recorded it (<log file>)"          |
      | archive/projects/atlas.md is deleted by hand                                                  | an error on .wiki/archive/projects/atlas.md says "deleted without a log entry (last recorded by ingest src-2026-10-18-cleanup, <log file>)" |
      | archive/notes/old.md is created by hand                                                       | an error on .wiki/archive/notes/old.md says "in no ingest log event"                                                             |
      | archive/team.md is created by hand, and config private lists team.md                          | no unlogged-change finding names .wiki/archive/team.md                                                                           |
      | archive/projects/atlas.md is edited by hand, then ingest "src-2026-10-18-next" is applied     | an error on .wiki/archive/projects/atlas.md ends ", before ingest src-2026-10-18-next was applied"                                |

  @rules
  Scenario Outline: index-drift counts the archive
    Given pages/team.md and 2 pages under archive/
    And <index>
    When I run "wikeeper lint --check index-drift --json"
    Then json.ok is true and <outcome>

    Examples:
      | index                                                                         | outcome                                                                         |
      | index.md written by "wikeeper index rebuild"                                  | there is no index-drift finding                                                 |
      | index.md written by "wikeeper index rebuild", then a third archive page added | one index-drift warning says "index.md is out of date: run wikeeper index rebuild" |
      | index.md equal to buildIndex(pages) with no archived line                     | one index-drift warning says "index.md is out of date: run wikeeper index rebuild" |

  @interfaces @rules
  Scenario: ingest finish lints the archive pages it changed and resolves archived names
    Given pages/projects/atlas.md and a chat-excerpt ingest "src-2026-10-18-cleanup", applied
    And its write phase creates archive/projects/atlas.md (valid frontmatter, a copy of one atlas fact line, and the line "See [[ghost]].")
    And adds the line "archive:: [[archive/projects/atlas]]" to pages/projects/atlas.md, with "src-2026-10-18-cleanup" added to its frontmatter sources (§1.4 Q2)
    When I run "wikeeper ingest finish src-2026-10-18-cleanup --json"
    Then the exit code is 0
    And no warning starts "lint [error] broken-link .wiki/pages/projects/atlas.md" or "lint [error] uncited-claim .wiki/pages/projects/atlas.md"
    And one warning starts "lint [error] broken-link .wiki/archive/projects/atlas.md" and contains "[[ghost]] does not resolve to a page"
    And no warning starts "lint [error] unlogged-change .wiki/archive/"
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch copy of the testbed (`testbed.md`, Making a scratch copy), run a clean-up ingest that moves one page whole to `.wiki/archive/` and leaves `[[archive/<path>]]` on a page that linked it; then `wikeeper lint` reports no broken link for either, no orphan or stale finding on the archive page, and `checked … and 1 archived page …`. Edit the archive file by hand and check that `wikeeper lint` reports `unlogged-change` on it.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/lint/unlogged.ts` |
| Related Files | `src/lint/checks.ts`, `src/lint/links.ts`, `src/lint/paths.ts`, `src/commands/lint.ts` |
| Related Files (finish hook) | `src/ingest/lint-hook.ts`, `src/commands/ingest-finish.ts` |
| Related Files (tests) | `test/lint/links.test.ts`, `test/ingest/finish-lint.test.ts` |
| Related Files (new tests) | `test/lint/archive-lint.red.node.test.ts`, `test/lint/archive-lint.test.ts` |
| New Files Needed | `test/lint/archive-lint.red.node.test.ts` (QA-Red), `test/lint/archive-lint.test.ts` (Developer) |

- **Read, not edited:** `src/lint/staleness.ts`, `src/lint/citations.ts`, `src/lint/size.ts` (STORY-007-05), `src/ingest/index-builder.ts` (K11), `src/ingest/snapshot.ts` (`SnapshotInfo.archive`, K9), `src/ingest/log.ts` (`archive_hashes`, `isPageHashes`, K9), `src/ingest/diff.ts` (`PageDiff.archive`, K9), `src/core/paths.ts` (`archiveDir`, K9), `src/wiki/parse-page.ts`.
- **Red tests that must stay green, unmodified:** `test/lint/lint.red.node.test.ts` (its `LintContext` literal at `:278`, Q3), `test/lint/unlogged.red.node.test.ts`, `test/lint/stale-fact.red.node.test.ts`.

### 3.2 Technical Logic
- **Context (R1, R2).** Add `archivePages?` and `onlyArchive?` to `LintContext` (`src/lint/checks.ts:38`) and widen the `only` filter in `runLint` (`:97`). Add `archivePath` to `src/lint/paths.ts` and re-export it beside `pagePath` (`src/lint/checks.ts:34`). Check modules keep importing `checks.ts` with `import type` only (FLASHCARD 2026-10-17 `#esm #contract #lint`).
- **Links (R3–R5).** `linkResolver` (`src/lint/links.ts:14`) builds a second map for archive pages, with the extra `archive/<path>` key, and returns the `pages/` result when it is non-empty. `sharedResolver` caches by the `pages` array and needs the archive array in its key: cache on a pair, or build the resolver once per `run`. `brokenLinkCheck` (`:42`) loops over `ctx.pages`, then `ctx.archivePages ?? []`, using `pagePath` or `archivePath`. `orphanPageCheck` (`:66`) keeps `linkResolver(ctx.pages)` with no archive.
- **Index (R7).** `src/lint/checks.ts:138`: `buildIndex(ctx.pages, { archived: (ctx.archivePages ?? []).length })`.
- **Unlogged (R8).** In `unloggedChangeCheck` (`src/lint/unlogged.ts:50`), after the `pages/` loop, run the same loop over the archive set, with `lastArchiveTouch` built from `archive_hashes` in the event loop (`:72`), the base dir `paths.archiveDir` or `path.join(snapshotDir(…), "archive")`, and `archivePath` in `err`. Factor the shared steps (judge one path, read, hash) into a helper that takes the tree, rather than copying the loop.
- **Command (R9).** `src/commands/lint.ts:39`: also `loadPages(paths.archiveDir)`; the subject becomes `` `${plural(pages.length, "page")} and ${plural(archive.length, "archived page")}` `` when the archive is non-empty.
- **Finish hook (R10).** `src/ingest/lint-hook.ts:11`: `archiveChanged?: string[]` (comment: created ∪ updated, relative to archive/). `src/commands/ingest-finish.ts:42`: early return on both empty; load archive pages; pass `onlyArchive`. `:229`: add `archiveChanged` from `diff.archive` (K9).
- **Fixtures.** Write log events with `writeLogEvent`, `permission: "ai"` and `archive_hashes` from `pageHash` (FLASHCARD 2026-10-17 `#qa #red-test`). The open-write-phase row runs `ingest apply` so the real snapshot copies `archive/` (K9). The finish scenario sets `setLintHook(finishLintHook)` in `beforeEach` (FLASHCARD 2026-10-17 `#lint #test-harness`) and asserts warnings with `toContain`/`startsWith`.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper lint` | CLI | None | `--check <id...>`, `--json` | `LintData` (unchanged); findings may name `.wiki/archive/…` |
| `wikeeper ingest finish <id>` | CLI | None | unchanged | unchanged; `lint …` warnings may name `.wiki/archive/…` |

```ts
// src/lint/checks.ts
export interface LintContext {
  paths: ResolvedPaths; config: WikeeperConfig; pages: Page[]; kb: KbInstructions | null;
  log: StoredLogEvent[]; now: Date;
  only?: string[];          // page paths relative to pages/ (input only; set by the finish hook)
  archivePages?: Page[];    // K12, optional (Q3): parsed archive pages, paths relative to archive/
  onlyArchive?: string[];   // archive paths relative to archive/ (input only; set by the finish hook)
}
export { pagePath, archivePath } from "./paths.js";

// src/lint/paths.ts
export function archivePath(paths: ResolvedPaths, rel: string): string; // "a.md" -> ".wiki/archive/a.md"

// src/lint/links.ts
export function linkResolver(pages: readonly Page[], archivePages?: readonly Page[]): (target: string) => string[];

// src/ingest/lint-hook.ts
export interface LintHookContext {
  paths: ResolvedPaths; sourceId: string;
  changed: string[];          // created ∪ updated, relative to pages/
  archiveChanged?: string[];  // created ∪ updated, relative to archive/
}
```

Consumed (frozen): `ResolvedPaths.archiveDir`, `SnapshotInfo.archive`, `PageDiff.archive`, `IngestLogEvent.archive_hashes` (K9, STORY-008-01); `buildIndex(pages, { archived })` (K11, STORY-008-03); `oversized-page` (K7, STORY-007-05).

## Task Breakdown

- [ ] Add `archivePages?`, `onlyArchive?`, the widened `only` filter and `archivePath` -> R1, R2
- [ ] Extend `linkResolver` with archive keys, scan archive pages in `broken-link`, keep `orphan-page` on a `pages/`-only resolver -> R3, R4, R5
- [ ] Pass the archived count to `buildIndex` in `index-drift` -> R7
- [ ] Add the archive pass to `unlogged-change` through a shared per-tree helper -> R8
- [ ] Load archive pages in `wikeeper lint` and add the archived count to its summary line -> R9
- [ ] Add `archiveChanged` to the hook context, pass it from `ingest finish`, and load the archive in `finishLintHook` -> R10
- [ ] Write `test/lint/archive-lint.test.ts` with the §4.1 unit tests, and confirm R6 with `--check` rows for the three skipping checks -> R6

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 7 | `linkResolver`: archive keys, the `archive/` key, live first, no archive same as today; `runLint` with `only`, `onlyArchive` and both; `archivePath` with a moved `content_dir`; unlogged archive pass: an event without `archive_hashes`, an invalid map, two events touching one archive page (the newer wins); orphan with an archive-only link; lint summary wording (`1 archived page`, `3 archived pages`); `finishLintHook` early return and `onlyArchive` filtering |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `npm run typecheck` passes with the red tests in §3.1 unmodified.
- [ ] The INSERTION POINT and "keep this line" lines in `src/lint/checks.ts` are unchanged.
- [ ] No new runtime dependency in `package.json`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/lint/checks.ts:38` — `LintContext`; `src/lint/checks.ts:84` — `runLint` and its `only` filter (`:97`); `src/lint/checks.ts:123` — `indexDriftCheck`, which calls `buildIndex(ctx.pages)` at `:138`; `src/lint/checks.ts:153` — `PAGE_CHECKS`.
- **Surface:** `src/lint/links.ts:14` — `linkResolver`; `src/lint/links.ts:42` — `brokenLinkCheck`; `src/lint/links.ts:66` — `orphanPageCheck`.
- **Surface:** `src/lint/unlogged.ts:50` — `unloggedChangeCheck`, with snapshot mode (`:56`), last touch from `page_hashes` (`:72`) and the private test (`:31`).
- **Surface:** `src/lint/paths.ts:10` — `pagePath`; `src/lint/staleness.ts:63` — `staleFactCheck`; `src/lint/citations.ts:98` — `uncitedClaimCheck` (both read `ctx.pages` only already).
- **Surface:** `src/commands/lint.ts:39` — page loading and the summary line (`:48`); `src/ingest/lint-hook.ts:11` — `LintHookContext`; `src/commands/ingest-finish.ts:42` — `finishLintHook`; `src/commands/ingest-finish.ts:229` — the `runLintHook` call.
- **Coverage of this requirement:** ≥80% extension — every check, the hook and the command exist; the new parts are the archive inputs and one archive pass in `unlogged-change`.

## Prior work

- [[EPIC-008]] (parent: §2 "Lint"). Sprint siblings: [[EPIC-007]] (`oversized-page`) and [[SPIKE-003]]. Consumes [[STORY-008-01]] (K9) and [[STORY-008-03]] (K11). Builds on [[STORY-005-02]] (lint command, page checks, `linkResolver`, `index-drift`), [[STORY-005-03]] (`unlogged-change`, `page_hashes` and the finish lint hook) and [[STORY-005-08]] (`stale-fact`). Duplicate check (cleargate-wiki-query, 2026-10-18): nothing overlaps beyond EPIC-007, EPIC-008 and SPIKE-003.

## Why not simpler?

- **Smallest existing surface that could carry this:** `LintContext` (`src/lint/checks.ts:38`) with one more page list, read by the checks that need it.
- **Why isn't extension / parameterization / config sufficient?** It is extension. Appending archive pages to `ctx.pages` would be smaller but wrong: every page check would then flag the archive (orphans, uncited lines, stale statuses, sizes), and paths shared with live namesakes would merge in the resolver and in `only` filtering. A separate list, read only by `broken-link`, `index-drift` and `unlogged-change`, keeps the archive out of the checks that must skip it, with no new check or module.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`archiveDir`, `SnapshotInfo.archive`, `PageDiff.archive` and `archive_hashes` come from STORY-008-01, `buildIndex`'s option from STORY-008-03 and `src/lint/size.ts` from STORY-007-05, all in this sprint per the decomposition brief.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Not yet approved: §1.4 Q1–Q4 wait for the human's decision at Gate 1, and `approved` is false.
