---
story_id: STORY-007-05
parent_epic_ref: EPIC-007
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-007 (approved 2026-10-18) §2 (status tokens section, finish report line, search page_tokens, oversized-page lint), §4 · SPIKE-003 (Completed 2026-10-18) §5 (estimate, measured sizes) · SPRINT-04 decomposition brief (2026-10-18) contracts K1, K2, K7, K12 and the shared-file merge orders · verified at 6b75807: src/commands/status.ts, src/ingest/report.ts, src/commands/ingest-finish.ts, src/ingest/snapshot.ts, src/search/engine.ts, src/search/filters.ts, src/commands/search.ts, src/lint/checks.ts, src/lint/staleness.ts, src/wiki/parse-page.ts · red tests read: test/lint/stale-fact.red.node.test.ts:241, test/search/cache.red.node.test.ts:113, test/search/cache-perf.red.node.test.ts:36 · Developer tests read: test/ingest/report.test.ts:50, test/ingest/finish-lint.test.ts:10"
actor: AI coding agent
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-007-01
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T07:50:20Z
updated_at: 2026-10-18T07:50:20Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T07:54:36Z
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
  model: claude-opus-5-5
  last_stamp: 2026-10-18T11:48:13Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-18T07:42:23Z
---

# STORY-007-05: Wiki and page sizes in `status`, the finish report, search hits and lint
**Complexity:** L3 — four existing surfaces each gain one size figure from the same K1 call (`measureWiki` / `estimateTokens`, STORY-007-01): the `tokens` section of `wikeeper status`, one line in the `ingest finish` report, `page_tokens` on search hits, and a new lint check `oversized-page`. Each change is small (10–60 lines), but they cross four modules (status, ingest, search, lint) and three shared files later stories also edit. Builds against the frozen K1/K2 signatures until STORY-007-01 merges.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent working in a wiki, I want the wiki's total size, the size of each page I find and a warning on pages at the red limit, in the commands I already run, so that I can tell the user how big the wiki is and when a page has grown too large, without measuring files myself.

### 1.2 Detailed Requirements
- **R1 — Status `tokens` section (K7).** `collectStatus` (`src/commands/status.ts:67`) adds `StatusData.tokens = { wiki, page_count, index, limits, largest }` from one `measureWiki(paths)` call (K1):
  - `wiki` is `WikiSize.total`, the sum over the pages; `index` is `WikiSize.index` (`index.md`), reported next to it and not added to it (EPIC-007 §2: "the total of all pages, with `index.md` shown next to it").
  - `page_count` is `WikiSize.page_count`.
  - `limits` is `config.tokens` as loaded (K2): `{ page: { yellow, red }, source: { yellow, red, confirm_at } }`.
  - `largest` is the first five entries of `WikiSize.pages` (already sorted tokens descending, then path), each `{ path, tokens, level }` with `level = levelOf(tokens, config.tokens.page)`. `path` is relative to `pages/`, as in K1.
  - `status` stays read-only (STORY-005-05 R2): `measureWiki` only reads.
- **R2 — Status human lines.** After the `misses:` line, in this order:
  - `tokens: wiki ≈66k · 43 pages · index.md ≈5.1k` (`formatTokens` for both figures; `1 page` in the singular): the figure first, then the count, as in the status line.
  - `  limits: page 4k/10k · source 20k/60k, approval at yellow`. Limits print with K1's `formatLimit` (STORY-007-01 R2; plan confirmation, 2026-10-18): exact numbers without `≈`, a value of at least 1000 that divides by 100 as thousands with `k` (`4000` → `4k`, `1500` → `1.5k`), any other value as the integer. `confirm_at: never` prints `no size approval` in place of `approval at <level>`.
  - `  largest pages:` and then one line per `largest` entry: `    projects/atlas.md ≈6.3k 🟡` (path, `formatTokens`, `levelMark`), the shape the finish report uses for its largest page. With no pages this block is left out.
- **R3 — Finish report figures (K7).** `IngestReport.tokens = { wiki, change, largest }`, built in `src/commands/ingest-finish.ts` after validation passes and before `removeSnapshot` (`src/commands/ingest-finish.ts:239`):
  - `wiki` is `measureWiki(paths).total` once the write phase is over.
  - `change` is `wiki` minus the total of the apply-time snapshot copy of `pages/` (`<wikiDir>/.snapshots/<id>/pages`, `snapshotDir` at `src/ingest/snapshot.ts:20`), measured the same way.
  - `largest` is the first entry of `measureWiki(paths).pages` with its level against `tokens.page`, or `null` when the wiki has no pages. It is the wiki's largest page, as in `status` and the status line (§1.4 Q4).
- **R4 — Finish rerun.** The path for a finish that already logged the ingest (`src/commands/ingest-finish.ts:101`) builds the same figures before its `removeSnapshot` call. When the snapshot is still readable, `change` is measured against it; when it is gone, `change` is `null` (§1.4 Q1).
- **R5 — Report line.** `formatReport` (`src/ingest/report.ts:38`) adds a fifth line: `   wiki ≈66k tokens (+1.2k) · largest page projects/atlas.md ≈6.3k 🟡`. It follows the `   created …` counts line; STORY-008-02's `   archived N fact lines · M pages` line, shown only when something moved to the archive, goes between the two (K7/K10 order, consistency audit 2026-10-18).
  - The change is `+` or `-` followed by `formatTokens(|change|)` without its `≈`, and `±0` when it is zero. When `change` is `null`, the parenthesis is left out.
  - With no pages the line ends `· no pages` in place of the largest page.
- **R6 — Search `page_tokens` (K7).** Every `SearchHit` in `data.results` carries `page_tokens: number`: the ranked hits (`toHit`, `src/commands/search.ts:169`), the filter-only entity hits (`entityHit`, `src/search/filters.ts:115`) and the `--mark` hits (`markHits`, `src/search/filters.ts:147`).
  - The value is `estimateTokens` of the page file's text, equal to the `tokens` `measureWiki` reports for that path.
  - It is computed when the search runs, only for the pages in the returned results, from the bytes `loadSearchCorpus` already reads (`src/search/engine.ts:246`). It is not stored in `.wiki/.cache/search.json`, and `SEARCH_CACHE_VERSION` stays `1` (§1.4 Q3). A warm cache and a cold one give the same value.
  - The human search output does not change.
- **R7 — Lint `oversized-page` (K7).** A new page check in `src/lint/size.ts`: id `oversized-page`, severity `warning`, scope `pages`.
  - For each page in `ctx.pages` (only those in `ctx.only` when it is set), it reads the page file and estimates its tokens. A page at or above `ctx.config.tokens.page.red` gives one finding with `path = pagePath(ctx.paths, page.path)`, no `line`, and the message `page is ≈12k tokens (tokens.page.red is 10k)` (the count via `formatTokens`, the limit via K1's `formatLimit`, as in R2).
  - It reads `ctx.pages` only, so archive pages are never flagged (K12).
  - It is registered in `PAGE_CHECKS` after `unloggedChangeCheck` and before `staleFactCheck`: `test/lint/stale-fact.red.node.test.ts:241` requires `stale-fact` to stay the last entry, and `test/lint/checks.test.ts:26` requires `unlogged-change` at index 4. Findings are sorted by path (`compareFindings`), so the position changes no output.
  - It gets a trigger and a pass fixture in `LINT_FIXTURES` (`test/lint/check-fixtures.ts`), which `test/templates/structure-sprint-03.red.node.test.ts:205` and `test/lint/check-fixtures.test.ts:11` require for every registered check id.
- **R8 — At finish.** `FINISH_CHECKS` (`src/commands/ingest-finish.ts:41`) gains `oversized-page`. A page the ingest created or updated that is at or above the red limit then appears in the finish warnings as `lint [warn] oversized-page <path>: …`. This is the signal the agent uses to tell the user once (§1.4 Q2).
- **R9 — Metadata only (D-08).** Every figure is a size, a path or a level. No output added by this story contains page text.
- **R10 — The two WIKI.md lines that name the new key and check (STORY-007-07 R5 (c), (d) and §1.4 Q4; recommended answer, approved at Gate 1 on 2026-10-18).** On 007-05's own tree two existing checks fail until WIKI.md section "Lint and status" names `tokens` and `oversized-page`: the status bullets must equal the keys of `status --json` (`test/templates/sprint-03-commands.red.node.test.ts:307`), and the finding table needs a row for every page check (`findingTableFindings`, `test/templates/structure.ts:504`, run by `test/templates.test.ts:113`). So this story writes, in `templates/system/WIKI.md`, exactly:
  - (a) a status-field bullet after the `misses` bullet: "- `tokens`: the wiki's size: `wiki` (all pages), `page_count`, `index` (`.wiki/index.md`), the `limits`, and the five `largest` pages, each with its `level`. A 🔴 page is handled as said above."
  - (b) a finding-table row after the `stale-fact` row: "| `oversized-page` | A page is at or above `tokens.page.red`. Tell the user once in the session, as said above; an ordinary ingest never shrinks a page. |"
  - Nothing else in WIKI.md changes here. "As said above" points at STORY-007-07's red-page paragraph, which lands later in the same sprint; STORY-007-07 checks the two lines and STORY-008-06 edits the row. WIKI.md's merge order is 007-05 → 008-05 → 007-07 → 008-06.

### 1.3 Out of Scope
- The estimator, `measureWiki`, the `tokens` config schema and the `init` defaults (STORY-007-01).
- `wikeeper config` (STORY-007-02) and `wikeeper statusline` (STORY-007-06).
- Instruction text that tells the agent to report sizes or to tell the user once when a page turns red (STORY-007-07). This story writes only the two WIKI.md lines of R10.
- Archive size and archive candidates in `status` (STORY-008-05); archive pages in search and lint (STORY-008-03, STORY-008-04).
- Token figures in the human search output, per-section sizes, and sizes recorded in the ingest log event.
- An `info` finding for pages at the yellow limit.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1, contract K7 vs code):** K7 types `IngestReport.tokens.change` as `number`. In the rerun path, an earlier finish wrote the log event and may already have removed the snapshot: it removes it at `src/commands/ingest-finish.ts:239` before releasing the lock at :240, and the rerun removes it again at :104. Then no apply-time figure exists. What is `change` there?
- **Recommended:** Type it `number | null`. It is `null` only in the rerun path when the snapshot is gone, and the human line then leaves out the parenthesis. Reporting `0` would claim the ingest changed nothing.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2):** Should `oversized-page` run at `ingest finish`? `FINISH_CHECKS` holds only `broken-link`, `uncited-claim` and `unlogged-change` today.
- **Recommended:** Yes, and only on the pages the ingest changed, which the finish lint hook already does through `only`. Without it, a page that turns red during an ingest shows in the report line only if it is the wiki's largest page. `test/ingest/finish-lint.test.ts:10` pins the old list, and this story updates it.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q3):** Should `page_tokens` be computed when the search runs, or stored in the search cache?
- **Recommended:** Compute it when the search runs, for the returned hits only (at most `--limit`, default 10). That costs a few milliseconds.
  - Storing it would mean estimating every page whenever the cache rebuilds. `test/search/search-perf.red.node.test.ts` measures exactly that path (cache off, p95 < 500 ms), and it already runs at 532–630 ms under load (FLASHCARD 2026-10-17 `#test-harness #perf`).
  - Storing it would also need a new cache field, and old caches must not be trusted. Bumping `SEARCH_CACHE_VERSION` is ruled out because four tests pin version 1: `test/search/cache.red.node.test.ts:113`, `:198`, `:215` and `test/search/cache-perf.red.node.test.ts:36`.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q4):** Is the finish report's "largest page" the wiki's largest page, or the largest page this ingest changed?
- **Recommended:** The wiki's largest page, as K7 and the status line show it. Changed pages that reach red are named by the finish lint (Q2).
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q5, granularity; consistency audit 2026-10-18):** The rubric's "files span unrelated subsystems" signal trips: status, the ingest report, search and lint. Split it?
- **Recommended:** Keep one story. Each surface gains one figure from the same `measureWiki` / `estimateTokens` call (10–60 lines each), the Gherkin stays at five scenarios, and L3 with `med` exposure does not trip the L3 + high rule. If the human wants a split, the cleanest cut is search `page_tokens` (R6) as its own story, since it is the only part that touches the search files STORY-008-03 edits next; that adds a story and renumbers STORY-007-06 and 007-07.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **DRAFTS review (designer, 2026-10-18):** wording aligned with docs/ux.md — the `tokens:` line puts the figure first, then the count (`tokens: wiki ≈66k · 43 pages · index.md ≈5.1k`; R2, §2.1 scenarios 1 and 5), and each largest-page line uses the finish report's shape, path then figure then mark (`projects/atlas.md ≈6.3k 🟡`; R2, §2.1 scenario 1). No decision changed.

- **Plan confirmation (human, 2026-10-18):**
  - P6: `formatLimit` is K1's (`src/core/tokens.ts`, STORY-007-01), imported by `status.ts` and `src/lint/size.ts`; `src/lint/size.ts` no longer exports it (R2, R7, §3.2, §3.3). The printed limits (`4k/10k`, `tokens.page.red is 10k`) do not change.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** The finish step reads every page twice, the live tree and the snapshot copy. On a 500-page wiki that adds roughly 50–400 ms, depending on how fast STORY-007-01's estimator is.
- **Mitigation:** `finish` has no time budget. If it shows, `change` can be computed from the diff alone: the after-sizes of created and updated pages, minus the before-sizes of updated and deleted pages from the snapshot copy. Both give the same number; §3.2 starts with the simpler full measure.
- **Risk:** This story assumes `WikiSize.total` leaves `index.md` out. If STORY-007-01 adds it in, status, the report and the status line count it twice.
- **Mitigation:** K1 keeps `index` as its own field, and EPIC-007 §2 defines the wiki total as the pages only. The SDR confirms it against STORY-007-01's tests.
- **Risk:** Shared files. `src/commands/status.ts` is edited by STORY-008-05 next; `src/ingest/report.ts` and `src/commands/ingest-finish.ts` by STORY-008-01 (before) and STORY-008-02 (after); `src/search/engine.ts`, `src/commands/search.ts` and `src/search/filters.ts` by STORY-008-03; `src/lint/checks.ts` by STORY-008-04.
- **Mitigation:** The merge orders in the decomposition brief. Each change here is additive: a new field, a new line, a new check. `src/search/filters.ts` (007-05 → 008-03) and `templates/system/WIKI.md` (007-05 → 008-05 → 007-07 → 008-06) are now in the brief's shared-file table. STORY-008-03 extends `SearchCorpus.pageTokens` with the page's tree, because an archive page has its live namesake's path (§3.2).
- **Risk:** Immutable red files constrain the change. `stale-fact` must stay last in `PAGE_CHECKS`, and the search cache version must stay 1.
- **Mitigation:** Both are written into R6 and R7. The Developer tests this story changes (`test/ingest/report.test.ts`, `test/ingest/finish-lint.test.ts`) are listed in §3.1.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | `ingest finish` has two successful paths: the first run, and the rerun after an earlier finish logged the ingest. |
| Interfaces | T | Four commands expose sizes: `status` (JSON and human), `ingest finish` (JSON and the report line), `search --json` (query, filter and mark hits) and `lint`. |
| Data | T | Page sizes below, at and above the red limit; a custom limit; an empty wiki; a page under a dot-segment folder. |
| Rules | T | The red limit for `oversized-page`; the change measured against the apply-time snapshot; the same `page_tokens` with a warm and a cold cache; `status` writes nothing. |

Expected figures are computed in the tests with K1's `estimateTokens`, `formatTokens` and `levelOf` on the fixture files, so the scenarios do not depend on the estimator's weights.

```gherkin
Feature: Wiki and page sizes

  @interfaces @rules
  Scenario: Status shows the wiki's size and writes nothing
    Given an initialised wiki with default limits, an index.md and six pages: "a.md" of about 12k estimated tokens, "b.md" of about 5k, and "c.md", "d.md", "e.md", "f.md" each under 4k
    When I run "wikeeper status --json"
    Then data.tokens.wiki is the sum of estimateTokens over the six page files, data.tokens.page_count is 6 and data.tokens.index is estimateTokens of index.md
    And data.tokens.limits is { page: { yellow: 4000, red: 10000 }, source: { yellow: 20000, red: 60000, confirm_at: "yellow" } }
    And data.tokens.largest has 5 entries in descending tokens, the first { path: "a.md", level: "red" } and the second { path: "b.md", level: "yellow" }
    And "wikeeper status" prints a line starting with "tokens: wiki ≈" and ending with "· 6 pages · index.md ≈" followed by the index figure, the trimmed line "limits: page 4k/10k · source 20k/60k, approval at yellow", and a trimmed line starting with "a.md ≈" and ending with " 🔴"
    And no file in the repository was created, changed or deleted
    And templates/system/WIKI.md section "Lint and status" has the R10 bullet starting "- `tokens`: " and the R10 finding row starting "| `oversized-page` |"

  @paths @rules @data
  Scenario Outline: The finish report shows the wiki total, its change and the largest page
    Given an initialised wiki whose pages total T0 estimated tokens, with default limits
    And the ingest "src-2026-10-18-notes" is applied, and the writer <writer>
    When I run "wikeeper ingest finish src-2026-10-18-notes --json" <how>
    Then data.tokens.wiki is the pages total after the write phase and data.tokens.change is <change>
    And data.tokens.largest is <largest>
    And the fifth line of the human report, trimmed, is <line>
    And <lint>

    Examples:
      | writer | how | change | largest | line | lint |
      | creates "atlas.md" of about 12k tokens that cites [[src-2026-10-18-notes]] | once | the total minus T0, a positive number | { path: "atlas.md", level: "red", tokens: its estimate } | "wiki " + formatTokens(total) + " tokens (+" + formatTokens(change) without "≈" + ") · largest page atlas.md " + formatTokens(its estimate) + " 🔴" | json.warnings has "lint [warn] oversized-page .wiki/pages/atlas.md: page is " + formatTokens(its estimate) + " tokens (tokens.page.red is 10k)" |
      | deletes "old.md", a page with no fact lines | once | minus the estimate of old.md | the largest remaining page with its level | "wiki " + formatTokens(total) + " tokens (-" + formatTokens(old.md's estimate) without "≈" + ") · largest page " + that page's path, figure and mark | json.warnings has no oversized-page entry |
      | creates "atlas.md" of about 12k tokens that cites [[src-2026-10-18-notes]] | after its ingest event was written and its snapshot removed, with the lock still held | null | { path: "atlas.md", level: "red", tokens: its estimate } | "wiki " + formatTokens(total) + " tokens · largest page atlas.md " + formatTokens(its estimate) + " 🔴" | json.warnings has the "already recorded" warning |

  @interfaces @rules
  Scenario: Search hits carry the size of their page, with or without the cache
    Given an initialised wiki with "atlas.md" (type project, a section "Risks" that mentions vendor delay, and a tentative fact) and "beta.md" (type person)
    When I run "wikeeper search vendor delay --json", "wikeeper search --type project --json" and "wikeeper search --mark tentative --json", first with no .wiki/.cache and then again with the cache warm
    Then every hit in each data.results has page_tokens equal to estimateTokens of its page file, which is the tokens measureWiki reports for that path
    And each warm data.results equals the cold one
    And .wiki/.cache/search.json has version 1 and contains no "page_tokens" key
    And the human output of "wikeeper search vendor delay" contains no "≈"

  @rules @data
  Scenario Outline: oversized-page warns at and above the red limit
    Given an initialised wiki with <config> and a page "big.md" whose estimateTokens is <size>
    When I run "wikeeper lint --check oversized-page --json"
    Then json.ok is true, the exit code is 0 and data.findings is <findings>

    Examples:
      | config | size | findings |
      | default limits | about 12k | [{ id: "oversized-page", severity: "warning", path: ".wiki/pages/big.md", message: "page is " + formatTokens(size) + " tokens (tokens.page.red is 10k)" }] |
      | default limits | exactly 10000 | one oversized-page finding for .wiki/pages/big.md |
      | default limits | 9999 | [] |
      | tokens.page.yellow 1000 and tokens.page.red 2000 | about 2.5k | one oversized-page finding whose message ends "(tokens.page.red is 2k)" |

  @data
  Scenario Outline: Edge — an empty wiki and a page under a dot-segment folder
    Given an initialised wiki with <pages>
    When I run "<command>"
    Then <outcome>

    Examples:
      | pages | command | outcome |
      | no pages and no index.md | wikeeper status --json | data.tokens is { wiki: 0, page_count: 0, index: 0, limits: the defaults, largest: [] }, and "wikeeper status" prints "tokens: wiki ≈0 · 0 pages · index.md ≈0" and no "largest pages:" line |
      | only pages/.drafts/huge.md of about 12k tokens | wikeeper status --json | data.tokens.page_count is 0 and data.tokens.largest is [] |
      | only pages/.drafts/huge.md of about 12k tokens | wikeeper lint --check oversized-page --json | json.ok is true and data.findings is [] |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch copy of the testbed (`testbed.md`, Making a scratch copy), run `wikeeper status` and check that the `tokens` block shows 56 pages and a `wiki` figure within ±15% of Claude's 73,369. That count is of the 56 pages only, as `wiki` is; `index.md` is shown next to it, not added (testbed.md "Sizes"; the estimate there is 70,318). Run `git status` in the copy and check that nothing changed.
- [ ] In the same copy, run `wikeeper search <a word from a page> --json` and check that each hit's `page_tokens` matches the figure `status` lists for that page when the page is among the five largest.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/commands/status.ts` |
| Related Files | `src/ingest/report.ts`, `src/commands/ingest-finish.ts`, `src/search/engine.ts`, `src/search/filters.ts`, `src/commands/search.ts`, `src/lint/checks.ts` |
| Related Files (new) | `src/lint/size.ts` |
| Related Files (template, R10) | `templates/system/WIKI.md` |
| Test Files (new) | `test/status-tokens.test.ts`, `test/ingest/finish-tokens.test.ts`, `test/search/page-tokens.test.ts`, `test/lint/size.test.ts` |
| QA-Red Tests (new) | `test/wiki-sizes.red.node.test.ts` |
| Test Files (changed) | `test/ingest/report.test.ts`, `test/ingest/finish-lint.test.ts`, `test/lint/check-fixtures.ts` |
| New Files Needed | `src/lint/size.ts`, the four new test files and `test/wiki-sizes.red.node.test.ts` |

- **Read, not edited:** `src/core/tokens.ts` and `src/core/config.ts` (K1, K2, STORY-007-01), `src/ingest/snapshot.ts` (`snapshotDir`, `readSnapshot`), `src/wiki/parse-page.ts` (`listPageFiles`), `src/lint/paths.ts` (`pagePath`), `src/commands/doctor.ts` (`plural`), `test/fixtures/search/generate-wiki.ts`.
- **Red tests that must stay green unchanged:** `test/lint/stale-fact.red.node.test.ts` (stale-fact last in `PAGE_CHECKS`), `test/search/cache.red.node.test.ts` and `test/search/cache-perf.red.node.test.ts` (cache version 1; warm results equal cold results), `test/search/search-perf.red.node.test.ts` (p95 < 500 ms), `test/status.red.node.test.ts` (status writes nothing), `test/ingest/finish.red.node.test.ts` (the first report line), `test/templates/sprint-03-commands.red.node.test.ts` S3 (status bullets equal the status keys; finding rows name an action, R10), `test/templates/structure-sprint-03.red.node.test.ts` R8 (a fixture for every check id).
- **QA-Red** writes `test/wiki-sizes.red.node.test.ts` from the five §2.1 scenarios; the Developer writes the §4.1 unit tests in the four new test files.

### 3.2 Technical Logic
- **Status.** In `collectStatus`, after the existing reads: `const size = await measureWiki(paths)`, then build `tokens` (R1). `renderStatus` (`src/commands/status.ts:160`) appends the R2 lines after `misses:`. The limit formatter `formatLimit(n)` (R2) comes from `src/core/tokens.ts` (K1, STORY-007-01): `status.ts` and the lint message in `src/lint/size.ts` both import it from there, and `src/lint/size.ts` does not export it (plan confirmation, 2026-10-18).
- **Finish.** Add a helper in `src/commands/ingest-finish.ts`: `reportTokens(paths, id, config): Promise<IngestReport["tokens"]>`.
  - It calls `measureWiki(paths)` for the live tree.
  - It calls `readSnapshot(paths, id)`. When that is non-null, it calls `measureWiki({ ...paths, pagesDir: path.join(snapshotDir(paths, id), "pages") })` and uses that `.total` as the before figure (the copy holds `pages/` only; the `index` read there is ignored). When it is null, `change` is `null`.
  - The main path calls it after `validateIngest` passes and before `removeSnapshot` (`src/commands/ingest-finish.ts:239`). The rerun path calls it before its own `removeSnapshot` (`:104`).
  - `formatReport` adds the R5 line, and `formatChange(n: number | null)` is a small helper in `src/ingest/report.ts`.
- **Search.**
  - `SearchCorpus` (`src/search/engine.ts:130`) gains `pageTokens(path: string): number`. `loadSearchCorpus` builds it on both the cache-hit and the rebuild path as a memoised closure over the `files`/`bufs` it already holds: `estimateTokens(buf.toString("utf8"))`, and `0` for a path it did not read. Nothing new goes into `SearchCacheFile`. STORY-008-03 later widens it to `pageTokens(path, archived?: boolean)` for archive hits; this story's callers pass the path only.
  - Add `export type SearchHitBase = Omit<SearchHit, "page_tokens">` in `engine.ts`. `entityHit`, `markHits` and `toHit` return it, so `src/search/filters.ts` changes only its return types.
  - `executeSearch` sets `page_tokens` in one pass over the final `data.results`, just before `warningsOf.set(data, warnings)` (`src/commands/search.ts:291`). Every mode and every `--since` branch is covered there; misses and entity modes have empty `results`.
  - The decoding must match `measureWiki`'s, including how a BOM is handled, so that `page_tokens` equals the status figure. `test/search/page-tokens.test.ts` asserts the two are equal.
- **Lint.** `src/lint/size.ts` imports `./checks.js` with `import type` only and takes `pagePath` from `./paths.js` (`src/lint/checks.ts:6-8`; FLASHCARD 2026-10-17 `#esm #contract #lint`).
  - In `src/lint/checks.ts`, add the import with its own `// INSERTION POINT STORY-007-05:` line after the STORY-005-08 import. Add the `PAGE_CHECKS` entry with its own `// INSERTION POINT STORY-007-05: oversizedPageCheck,` line directly after the "(keep this line …)" line and before `// INSERTION POINT STORY-005-08:` (`src/lint/checks.ts:159`–`:161`), so the order becomes …, `index-drift`, `unlogged-change`, `oversized-page`, `stale-fact` (R7).
  - `LINT_FIXTURES` in `test/lint/check-fixtures.ts` gains `oversized-page`: the trigger is a context whose `config.tokens.page.red` is below one page's estimate, the pass the same pages with the default limits.
  - Keep every existing INSERTION POINT and "keep this line" line as written (`src/lint/checks.ts:2-5`).
  - A page file that is missing when the check reads it is skipped with no finding.
- **Finish lint.** `FINISH_CHECKS = ["broken-link", "uncited-claim", "unlogged-change", "oversized-page"]`, and `test/ingest/finish-lint.test.ts:10` is updated to match.
- **Fixtures.** Size pages with `estimateTokens` in the test (pad with plain words until the target is reached) rather than hard-coding counts. Every page a finish fixture creates or updates cites the ingest's id, and its source page exists (FLASHCARDs 2026-10-17 `#test-harness #finish` and `#lint #fixtures`). Set the lint hook in `beforeEach` (FLASHCARD `#lint #test-harness`). Before asserting that a list has no finding, assert `json.ok` (FLASHCARDs `#red-test #lint`, `#qa #red-test`).

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper status` | CLI | None | `--json` | `StatusData` with `tokens` (R1) |
| `wikeeper ingest finish <id>` | CLI | None | `--json` | `IngestReport` with `tokens` (R3, R4) |
| `wikeeper search …` | CLI | None | `--json` | `SearchData`; each `results[]` hit has `page_tokens` (R6) |
| `wikeeper lint` | CLI | None | `--check oversized-page`, `--json` | findings with id `oversized-page` (R7) |

```ts
// src/commands/status.ts (additive to K5 of SPRINT-03)
import type { TokenLevel, TokenLimits } from "../core/tokens.js";
export interface StatusData {
  // …existing fields…
  tokens: {
    wiki: number;
    page_count: number;
    index: number;
    limits: { page: TokenLimits; source: TokenLimits & { confirm_at: "yellow" | "red" | "never" } };
    largest: Array<{ path: string; tokens: number; level: TokenLevel }>; // at most 5
  };
}

// src/ingest/report.ts
export interface IngestReport {
  // …existing fields…
  tokens: { wiki: number; change: number | null; largest: { path: string; tokens: number; level: TokenLevel } | null };
}
export function formatChange(n: number | null): string; // 1234 → "+1.2k", -870 → "-870", 0 → "±0", null → ""

// src/search/engine.ts
export interface SearchHit { /* …existing fields… */ page_tokens: number }
export type SearchHitBase = Omit<SearchHit, "page_tokens">;
export interface SearchCorpus { /* …existing fields… */ pageTokens(path: string): number }

// src/lint/size.ts
export const oversizedPageCheck: LintCheck; // id "oversized-page", severity "warning", scope "pages"; its message prints the limit with formatLimit (K1)
```

Consumed (frozen, K1/K2 from STORY-007-01): `estimateTokens`, `levelOf`, `formatTokens`, `formatLimit`, `levelMark`, `measureWiki(paths): Promise<WikiSize>`, `TokenLimits`, `TokenLevel`, `WikeeperConfig.tokens`. Deviation from K7: `change: number | null` (§1.4 Q1).

## Task Breakdown

- [ ] Add `tokens` to `StatusData`, fill it in `collectStatus` from `measureWiki`, and add the R2 human lines with K1's `formatLimit` -> R1, R2
- [ ] Add `IngestReport.tokens`, `formatChange` and the fifth report line in `src/ingest/report.ts`; update `test/ingest/report.test.ts` -> R5
- [ ] Build the report figures in both finish paths, before the snapshot is removed -> R3, R4
- [ ] Add `SearchCorpus.pageTokens`, `SearchHitBase`, and the single `page_tokens` pass in `executeSearch` -> R6
- [ ] Write `src/lint/size.ts`, register it in `PAGE_CHECKS` after `unloggedChangeCheck` and before `staleFactCheck`, add its `LINT_FIXTURES` entry, and add it to `FINISH_CHECKS`; update `test/ingest/finish-lint.test.ts` -> R7, R8
- [ ] Add the `tokens` status bullet and the `oversized-page` finding row to WIKI.md "Lint and status", with the R10 text -> R10
- [ ] QA-Red writes `test/wiki-sizes.red.node.test.ts` from the five scenarios, the first with the repository hash before and after; the Developer writes the §4.1 unit tests in the four new test files -> R9
- [ ] Run `npm run test:perf` with the file run alone, and check that both search perf files still pass -> R6

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | the R2 `limits:` line (limits through K1's `formatLimit`, `no size approval` for `never`); `formatChange` (positive, negative, zero, `null`); the R5 line with and without a largest page; `collectStatus.tokens` with fewer than five pages; `oversizedPageCheck` with `only` set and with a missing page file; `pageTokens` equal to `measureWiki`'s figure for a page with a BOM |
| Integration tests | 0 | Temp directories only; no external service. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`, in QA-Red's `test/wiki-sizes.red.node.test.ts`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The red tests listed in §3.1 pass unchanged.
- [ ] WIKI.md "Lint and status" holds the R10 `tokens` bullet and `oversized-page` row with exactly the R10 text, and `test/templates.test.ts` reports no finding on this story's tree.
- [ ] `LINT_FIXTURES` has an `oversized-page` entry; `test/lint/checks.test.ts` passes unchanged.
- [ ] `npm run test:perf` passes (the search budgets of EPIC-004).
- [ ] No new runtime dependency in `package.json`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/commands/status.ts:22` — `StatusData`; `src/commands/status.ts:67` — `collectStatus`; `src/commands/status.ts:160` — `renderStatus`, the human blocks this story extends.
- **Surface:** `src/ingest/report.ts:7` — `IngestReport`; `src/ingest/report.ts:38` — `formatReport`, the metadata-only report (D-08).
- **Surface:** `src/commands/ingest-finish.ts:41` — `FINISH_CHECKS`; `src/commands/ingest-finish.ts:101` — the rerun path; `src/commands/ingest-finish.ts:134` — `readSnapshot`; `src/commands/ingest-finish.ts:239` — `removeSnapshot`; `src/commands/ingest-finish.ts:242` — the report object.
- **Surface:** `src/ingest/snapshot.ts:20` — `snapshotDir`; `src/ingest/snapshot.ts:79` — the `pages` copy that the change is measured against.
- **Surface:** `src/search/engine.ts:27` — `SearchHit`; `src/search/engine.ts:130` — `SearchCorpus`; `src/search/engine.ts:240` — `loadSearchCorpus`, which reads every page's bytes on both the cache-hit and the rebuild path (`src/search/engine.ts:246`).
- **Surface:** `src/commands/search.ts:169` — `toHit`; `src/search/filters.ts:115` — `entityHit`; `src/search/filters.ts:147` — `markHits`.
- **Surface:** `src/lint/checks.ts:38` — `LintContext`; `src/lint/checks.ts:153` — `PAGE_CHECKS`; `src/lint/staleness.ts:63` — `staleFactCheck`, the pattern for a configurable page check.
- **Coverage of this requirement:** partial. Every surface exists and gains one field, one line or one registry entry. The sizes come from STORY-007-01. The only new module is `src/lint/size.ts`.

## Prior work

- [[EPIC-007]] (parent) and [[SPIKE-003]] (the estimate and the measured sizes); [[EPIC-008]] uses the page gauge and edits the same files next. The duplicate check (cleargate-wiki-query, 2026-10-18) found nothing else that overlaps.
- Builds on [[STORY-005-05]] (`status`, read-only), [[STORY-003-09]] (the ingest report and the finish lint hook), [[STORY-003-08]] (the apply-time snapshot), [[STORY-004-02]] (`SearchHit`, the 500-page perf fixture), [[STORY-004-03]] and [[STORY-004-07]] (filter and mark hits), [[STORY-004-06]] (the search cache), [[STORY-005-02]] (the lint registry) and [[STORY-005-08]] (`stale-fact`, the configurable page-check pattern).
- Consumes [[STORY-007-01]] (K1, K2).

## Why not simpler?

- **Smallest existing surface that could carry this:** `collectStatus` (`src/commands/status.ts:67`) alone, with the agent running `status` to learn sizes.
- **Why isn't extension / parameterization / config sufficient?** This story is extension only: four existing outputs each gain one figure from one shared K1 call, and the only new module is the lint check, which the registry pattern requires. Putting sizes in `status` alone would make the agent run a second command after every search and every finish, and it would never warn about a page that turned red during an ingest. Search does not store sizes in its cache, so the cache format and its pinned version stay as they are.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/lint/size.ts` is a planned path in EPIC-007 §4; `src/core/tokens.ts` is created by STORY-007-01 in this sprint, per the decomposition brief.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
- [x] §1.4 Q1–Q5 decided by the human (Gate 1).
