---
story_id: STORY-004-07
parent_epic_ref: EPIC-004
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: CR-003 (approved 2026-10-17) §A1–A5 and Open Questions 1 and 4 · SPRINT-03 decomposition brief contract K8, K4 (log.ts order) and shared files · walkthrough rows 7.8, 8.6, 8.10, 8.13, 10.4, 11.6 (formapass_management, 2026-10-17) · STORY-004-02…05 · SPRINT-03 gate1-decisions.md items 4, 14, 21 (approved at Gate 1, 2026-10-17) and consistency-audit findings 13, 17 · verified src/commands/search.ts, src/search/misses.ts, src/search/filters.ts, src/search/since.ts, src/search/engine.ts, src/ingest/log.ts, commander 15.0.0 `--no-` option behaviour, and the SPRINT-02 red tests under test/search
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T09:03:22Z
updated_at: 2026-10-17T09:58:22Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:58:46Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-004-07
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T10:00:19Z
  sessions: []
---

# STORY-004-07: Search follow-ups: `--no-miss`, `--mark`, misses count, filter-only miss text, limit note
**Complexity:** L2 — two options and four output changes on the existing `search` command, plus the miss text in the log writer. No in-sprint upstream. It lands before STORY-005-03 and STORY-005-06, which edit `src/ingest/log.ts` after it and list it as a predecessor (K4, consistency-audit finding 13), and it freezes the flag names and combinations STORY-006-10 writes into the search instructions (K8).

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent that searches the wiki at triage and to answer questions, I want my routing searches to leave no miss, to list tentative facts directly, and to see when a list was cut or what a miss was about, so that `log/` records only real unanswered questions and I never mistake a capped list for the whole answer.

### 1.2 Detailed Requirements
- **R1 — `--no-miss`** (CR-003 A1 and Open Question 1; walkthrough rows 7.8, 8.6). `search` gains the boolean option `--no-miss`, help text `do not record this search as a miss when it finds nothing (for triage and routing searches)`. `search --help` lists `--no-miss`, and a search without it records misses as before. With `--no-miss`, a search that finds nothing writes no `miss` event; results, `total`, warnings and the exit code are unchanged. With `--misses` the flag has no effect, because that mode is never recorded.
- **R2 — Misses count** (CR-003 A2; row 8.13). The first line of `search --misses` reads `<N> misses, <M> distinct queries`, singular `1 miss` and `1 distinct query`. N is the number of miss events read (after `--since`, before `--limit`), which is the sum of every group's `count`. M is the number of groups (`data.total`). In JSON, the `misses` mode gains `data.events: N`; other modes do not carry the key. Grouping, `MissSummary` and `total` are unchanged.
- **R3 — A miss names what was asked** (CR-003 A3; row 11.6b). The body line of a `miss` log file (`summaryLine`, `src/ingest/log.ts:122`) and the miss line of the generated `log.md` (`renderLogView`, `src/ingest/log.ts:253`) both use one label:
  - the query as `"<query>"` when it is not empty;
  - then one ` --<key> <value>` per recorded filter, in the order `type`, `where` (one per item), `status`, `since`, `mark`, `entity`, then any other key in code-unit order.

  The body line is `No results for <label>.`. The view line is `- <when> · miss · <label>`, and its query part keeps `JSON.stringify(query)`, so lines of query-only misses do not change. Examples: `No results for --status tentative.`, `No results for "vendor" --type risk.`, `No results for --entity Nobody.`. Existing log files are not rewritten; `log.md` shows the new label for them the next time it is generated.
- **R4 — Limit note** (CR-003 A4; rows 8.10, 10.4). When `--limit` cut a list, the human output ends with one line `showing <parts>; use --limit to see more`. Each cut list adds one part `<shown> of <total> <noun>`:
  - `results`: `data.results` against `data.total`, whenever `total` counts results (not for a `--since` search without a query or a `--type`/`--where`/`--status` filter, whose `total` counts changes, and not in entity mode);
  - `facts` and `page changes`: `changes.facts` and `changes.pages` against their totals (below);
  - `distinct queries`: `data.misses` against `data.total`, in misses mode.

  Parts are joined with `, `, and the last one with ` and `. A list that was not cut adds no part, and with nothing cut there is no line. To count the change lists, `SinceChanges` gains `facts_total` and `pages_total`: the counts before `--limit`, set wherever `changes` is set. The `changes since <date>:` header then counts those totals, as the results header already counts `data.total`. No other JSON changes.
- **R5 — `--mark <decided|tentative>`** (CR-003 A5 and Open Question 4; row 11.6c). It filters fact lines by their mark. The value is matched case-insensitively and echoed lower-case in `data.filters.mark`. The key is present only when `--mark` is given, so `data.filters` of every other search stays byte-identical to SPRINT-02.
  - **Alone, or with `--type`, `--where`, `--status`:** `data.results` holds one hit per fact line with that mark, over every entity that passes the other filters. Each hit has `path`, `file`, `title`, `entity` (the entity that owns the fact), `type`, `section` (the fact's heading), `line` (the fact line), `snippet` (`<date> · <mark> · <text>`, at most 160 characters), `score: 0` and `sources` (the fact's own citations). Hits are ordered by date (newest first), then path, then line, and `total` counts them.
  - **With `--entity`:** `data.entity.facts` keeps only facts with that mark.
  - **With `--since`, with or without `--entity`:** `changes.facts` keeps only facts with that mark, and `changes.pages` is empty, because a page change has no mark. `results` follow the existing `--since` rules (STORY-004-04 R8).
  - The human label of the search is `--mark <m>` (through `describeFilters`). A zero-result `--mark` search records `mark` in the miss's `filters` (`encodeMissFilters`, before `entity`).
- **R6 — `--status` points to `--mark`** (CR-003 A5; row 11.6a). A search with `--status decided` or `--status tentative` (compared after `normalizeName`) that finds nothing adds the warning `fact marks are filtered with --mark: wikeeper search --mark <value>` to the envelope: in `warnings` in JSON, and as `warning: …` on stderr in human mode. The search is still recorded as a miss unless `--no-miss` is given.
- **R7 — Errors.** These exit 2, and their envelopes carry `command: "search"` because the values are checked in the action, not by commander:
  - `--mark` with any other value, or empty: code `invalid_filter`, message `--mark must be decided or tentative`, `details: { expected: "decided or tentative", got }`;
  - `--mark` with a text query: code `usage`, message `--mark cannot be combined with a query; use --type, --where, --status, --entity or --since`;
  - `--mark` with `--misses`: code `usage`; the existing `--misses` exclusivity message also names `--mark`.

### 1.3 Out of Scope
- Instruction text that tells agents to use `--no-miss` and `--mark` (STORY-006-10, which consumes K8's flag names).
- Turning misses into rule proposals, and `status`'s miss count (STORY-005-05, STORY-005-06).
- Rewriting or compacting existing `log/` files (D-28: append-only).
- Changing `--status` itself; it still filters `status::` values (STORY-004-03 R3).
- `--mark` with a text query, which R7 refuses (Open Question 2).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question:** The SPRINT-02 red test `test/search/search-misses.red.node.test.ts:86` (QA-Red, immutable) asserts that the first line of `search --misses` is exactly `1 recorded miss`. K8's header makes it `1 miss, 1 distinct query`. May this story re-scope that one assertion?
- **Recommended:** Yes. Re-scope only that `expect(lines[0])` assertion to the K8 header, anchored by its content rather than its line number (flashcard `#qa #red-test`), with your authorisation recorded here, as STORY-006-11 does for `wiki-protocol.red.node.test.ts`. CR-003 A2 already approved the new header. The alternative keeps `N recorded misses` as line 1 and prints `M distinct queries` as a second line, which avoids touching the red test but is not K8's wording. The Developer tests in `test/search/misses.test.ts` (lines 105 and 107) are not immutable and are updated in this story.
- **Decision:** Yes. Re-scoping the SPRINT-01/02 red tests that SPRINT-03 makes obsolete is authorised as recommended (gate1-decisions item 21): this story's QA-Red step re-scopes only the `expect(lines[0])` assertion at `test/search/search-misses.red.node.test.ts:86` to the K8 header `1 miss, 1 distinct query`, anchored by content; STORY-006-11 R6 lists it in the full table. — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Should `--mark` combine with a text query (`wikeeper search vendor --mark tentative`)?
- **Recommended:** No, for now (R7 refuses it). CR-003 names `--type`, `--entity` and `--since` only, and a query ranks sections, not fact lines, so there is no clear rule for which fact lines a ranked hit should yield. `--mark tentative --type risk` or `--entity <name> --mark tentative` answer the walkthrough's question. A later story can allow it once a rule is chosen.
- **Decision:** No. `--mark` refuses a text query (exit 2, `usage`; R7) and combines with `--type`, `--entity` and `--since` (R5). — _approved (human, 2026-10-17, Gate 1)_

- **Question:** CR-003 A5 says "`--status` with no results hints at `--mark`". Should the hint fire for every `--status` value, or only for `decided` and `tentative`?
- **Recommended:** Only for `decided` and `tentative` (R6). Those are the values a user confuses with fact marks (row 11.6a); a hint on `--status open` with no results would be noise. This narrows the CR's literal wording, so it needs your confirmation.
- **Decision:** Only for `decided` and `tentative` (R6). This narrows CR-003 A5 ("`--status` with no results hints at `--mark`"), and the human was told (flagged for Gate 1). — _approved (human, 2026-10-17, Gate 1)_

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** `src/search/engine.ts` holds STORY-004-02's frozen C10 types, and SPRINT-02 red tests pin their JSON. `test/search/search.red.node.test.ts:103` and `test/search/filters.red.node.test.ts:101` compare `data.filters` with `toEqual`; four test files build `SearchRequest` literals without new fields (`test/search/search-perf.red.node.test.ts:19`, among others).
- **Mitigation:** Only additive optional fields (§3.3). `mark` is absent, not `null`, when unset, so the `toEqual` checks pass; `noMiss` is optional, so the literals still typecheck. `hasFilters` keeps its meaning (type, where, status), so `--entity` stays combinable with `--mark` and `--since`.
- **Risk:** `src/ingest/log.ts` is shared with STORY-005-03 (`page_hashes`) and STORY-005-06 (the rule-proposal summary).
- **Mitigation:** This story lands first (K4); STORY-005-03 and STORY-005-06 list it as a predecessor. It changes only the `miss` cases of `summaryLine` and `renderLogView`, through one private label helper, and leaves the other event types alone.
- **Risk:** `plural()` (`src/commands/doctor.ts:35`) only appends `s`, which gives "misss" and "distinct querys".
- **Mitigation:** The misses header spells both forms out (§3.2), and the unit tests cover N = 1 and M = 1.
- **Risk:** The search performance test is already flaky under load (flashcards `#test-harness #perf`, 532–630 ms in full runs).
- **Mitigation:** This story adds no work to the measured path (corpus load and query). The `--mark` scan runs over the already-loaded corpus only when `--mark` is given, so there is no new perf test (§4.1), and `test/search/search-perf.red.node.test.ts` must keep passing.
- **Risk:** Five small items in one story make it easy to miss one.
- **Mitigation:** One requirement per item (R1–R6, plus R7 for errors), each mapped to a Gherkin scenario and a Task Breakdown row. The story stays whole (gate1-decisions item 4).

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A triage search with `--no-miss` vs a question that misses; query results vs `--since` lists cut by `--limit`; `--mark` alone, with `--type`, with `--entity` and with `--since`. |
| Interfaces | T | The misses count in the human header vs `data.events` in JSON; the `--status` hint in JSON `warnings` vs stderr. |
| Data | T | The miss label varies by query, filter, mark and entity (Outline); the limit note varies by which lists were cut (Outline). |
| Rules | T | Only searches without `--no-miss` record a miss; `--mark` accepts only `decided` or `tentative` and refuses a query and `--misses`. |

```gherkin
Feature: Search follow-ups

  @rules @data @paths
  Scenario Outline: A search that finds nothing records a miss that names what was asked, unless --no-miss is given
    Given an initialised wiki whose only page, projects/atlas.md (type: project, status:: active), holds one tentative fact line
    When I run "wikeeper search <args> --json"
    Then the exit code is 0 and data.total is 0
    And log/ <log>
    And the envelope warnings <warnings>
    And after "wikeeper index rebuild", log.md <view>
    And without --json, "wikeeper search <args>" prints to stderr <stderr>

    Examples:
      | args                            | log                                                                                       | warnings                                                                       | view                                                       | stderr                                                                                   |
      | 'budget burn'                   | has one new miss file whose body line is 'No results for "budget burn".'                  | are empty                                                                      | has a line ending '· miss · "budget burn"'                 | nothing                                                                                  |
      | 'budget burn' --type project    | has one new miss file whose body line is 'No results for "budget burn" --type project.'   | are empty                                                                      | has a line ending '· miss · "budget burn" --type project'  | nothing                                                                                  |
      | --status tentative              | has one new miss file whose body line is "No results for --status tentative."             | include "fact marks are filtered with --mark: wikeeper search --mark tentative" | has a line ending "· miss · --status tentative"            | "warning: fact marks are filtered with --mark: wikeeper search --mark tentative"         |
      | --status closed                 | has one new miss file whose body line is "No results for --status closed."                | are empty                                                                      | has a line ending "· miss · --status closed"               | nothing                                                                                  |
      | --type project --mark decided   | has one new miss file whose body line is "No results for --type project --mark decided."  | are empty                                                                      | has a line ending "· miss · --type project --mark decided" | nothing                                                                                  |
      | --entity Nobody                 | has one new miss file whose body line is "No results for --entity Nobody."                | are empty                                                                      | has a line ending "· miss · --entity Nobody"               | nothing                                                                                  |
      | 'budget burn' --no-miss         | has no new file                                                                           | are empty                                                                      | has no miss line                                           | nothing                                                                                  |

  @interfaces
  Scenario: --misses counts every miss and every distinct query
    Given miss events for "budget burn" at 2026-10-10, "Budget  Burn" at 2026-10-12, and the entity "Nobody" at 2026-10-13
    When I run "wikeeper search --misses"
    Then the first line is "3 misses, 2 distinct queries"
    When I run "wikeeper search --misses --json"
    Then data.events is 3, data.total is 2 and data.misses holds 2 groups
    When I run "wikeeper search --misses --limit 1"
    Then the last line is "showing 1 of 2 distinct queries; use --limit to see more"
    And "wikeeper search --misses --limit 1 --json" still has data.events 3
    And "wikeeper search --help" lists "--no-miss"

  @paths @data
  Scenario Outline: A list cut by --limit says so
    Given projects/atlas.md and risks.md both mention "vendor", and projects/atlas.md holds facts dated 2026-10-08 and 2026-10-15
    And log/ ingest events at 2026-10-09T09:00:00Z (updated "team.md") and 2026-10-12T09:00:00Z (updated "projects/atlas.md")
    When I run "wikeeper search <args>"
    Then the last line of the output <note>
    And with --json, <json>

    Examples:
      | args                         | note                                                                         | json                                                                   |
      | vendor --limit 1             | is "showing 1 of 2 results; use --limit to see more"                          | data.results has 1 entry and data.total is 2                            |
      | vendor                       | does not start with "showing"                                                 | data.results has 2 entries and data.total is 2                          |
      | --since 2026-10-01 --limit 1 | is "showing 1 of 2 facts and 1 of 2 page changes; use --limit to see more"    | data.changes.facts_total is 2 and data.changes.pages_total is 2         |
      | --since 2026-10-09 --limit 1 | is "showing 1 of 2 page changes; use --limit to see more"                     | data.changes.facts_total is 1 and data.changes.pages_total is 2         |
      | --since 2026-10-11 --limit 1 | does not start with "showing"                                                 | data.changes.facts_total is 1 and data.changes.pages_total is 1         |

  @paths @data
  Scenario Outline: --mark lists fact lines with that mark
    Given projects/atlas.md (type: project) holding "- 2026-10-15 · tentative · Launch targets 2026-11-17. [[src-2026-10-16-q4]]" and "- 2026-09-30 · decided · Scope is the portal only. [[src-2026-09-30-kickoff]]"
    And risks.md with "## Hiring gap" (type:: risk) holding "- 2026-10-12 · tentative · The QA role may stay open. [[src-2026-10-16-q4]]"
    And a log/ ingest event at 2026-10-12T09:00:00Z that updated "projects/atlas.md"
    When I run "wikeeper search <args> --json"
    Then <field> equals <expected>
    And data.filters.mark is "<mark>"
    And without --json the first line of the output is "<human>"

    Examples:
      | args                                              | field                                                                 | expected                                                                                                   | mark      | human                                              |
      | --mark tentative                                  | data.results[*].path, in order                                        | ["projects/atlas.md", "risks.md"], each with score 0, its entity, section and line, and a snippet starting with its date | tentative | 2 results for --mark tentative                     |
      | --mark Tentative --type risk                      | data.results[*].entity                                                | ["Hiring gap"]                                                                                             | tentative | 1 result for --type risk --mark tentative          |
      | --entity Atlas --since 2026-09-01 --mark decided  | data.entity.facts[*].date, data.changes.facts[*].date and data.changes.pages | ["2026-09-30"], ["2026-09-30"] and [], with data.changes.facts_total 1                              | decided   | Atlas (project) · projects/atlas.md                |
      | --since 2026-10-11 --mark tentative               | data.changes.facts[*].date and data.changes.pages                     | ["2026-10-15", "2026-10-12"] and []                                                                        | tentative | changes since 2026-10-11: 2 facts, 0 page changes  |

  @rules
  Scenario Outline: Error — bad --mark values and combinations are refused
    When I run "wikeeper search <args> --json"
    Then the exit code is 2, error.code is "<code>" and the envelope's command is "search"
    And error.message contains "<hint>"

    Examples:
      | args                     | code           | hint                                   |
      | --mark maybe             | invalid_filter | decided or tentative                   |
      | --mark ""                | invalid_filter | decided or tentative                   |
      | vendor --mark tentative  | usage          | --mark cannot be combined with a query |
      | --misses --mark decided  | usage          | --mark                                 |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch wiki, run `wikeeper search roadmap --no-miss` and a plain `wikeeper search roadmap`; check that only the second adds a file to `log/`, then read `wikeeper search --misses` and `log.md` after `wikeeper index rebuild`.
- [ ] Run `wikeeper search --help` and read the `--no-miss` and `--mark` lines.
- [ ] Run `wikeeper search --since <date>` on a wiki with more than 10 page changes and read the last line.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/commands/search.ts` |
| Related Files | `src/search/misses.ts`, `src/search/filters.ts`, `src/search/engine.ts` (additive optional type fields only), `src/ingest/log.ts` |
| Consumed (not modified) | `src/search/since.ts` (`factsSince`, `toFactView`), `src/wiki/parse-page.ts` (`Fact`, `normalizeName`), `src/commands/doctor.ts` (`plural`) |
| Test Files | `test/search/misses.test.ts`, `test/search/filters.test.ts`, `test/ingest/log.test.ts`, `test/search/search-follow-ups.test.ts`, `test/search/search-follow-ups.red.node.test.ts` (QA-Red), `test/search/search-misses.red.node.test.ts` (QA-Red re-scopes the one assertion at `:86`, authorised by gate1-decisions item 21, §1.4) |
| New Files Needed | Yes — `test/search/search-follow-ups.test.ts` and QA-Red's `test/search/search-follow-ups.red.node.test.ts` |

### 3.2 Technical Logic
- **`--no-miss`** (R1): `.option("--no-miss", …)` after `--misses`. Commander 15.0.0, checked on 2026-10-17 with a scratch program against `node_modules/commander`: `opts.miss` is `true` by default and `false` with `--no-miss`; `search --help` prints `--no-miss` with no default; `--miss` is an unknown option (exit 2, `usage`). `SearchOptions` gains `miss: boolean`, and the action sets `req.noMiss = opts.miss === false`. In `executeSearch`, the recording step becomes `if (!req.noMiss && shouldRecordMiss(data))`, so no write is attempted and no `miss not logged` warning can appear; `shouldRecordMiss` keeps its frozen signature.
- **Misses count** (R2): in misses mode, set `data.events` to the sum of `count` over every group `listMisses` returned, before the `--limit` slice. `renderMisses` prints `${n} ${n === 1 ? "miss" : "misses"}, ${m} distinct ${m === 1 ? "query" : "queries"}`, spelled out because `plural` only appends `s`. When `data.events` is absent, as in unit tests that build `SearchData` by hand, it falls back to the sum of the listed counts. With no misses it still prints `no recorded misses` (STORY-004-05 R6).
- **Miss label** (R3): one private helper in `src/ingest/log.ts`, `missLabel(event, quote)`, builds the label from `event.query` and `event.filters`. `quote` is `(q) => \`"${q}"\`` for the body line and `JSON.stringify` for the view line. `log.ts` does not import from `src/search/`: it formats the raw `filters` record itself, so no import cycle is created. Hand-edited events can hold odd values: a filter value that is neither a string nor a list of strings is left out, and an event with no query and no usable filter keeps today's text (`No results for "".` and `· miss · ""`).
- **Limit note** (R4): `renderSearch` appends the note. Its parts come from `data.results.length` vs `data.total` when `total` counts results (R4: mode `query`, except a `--since` search with no query and no `--type`/`--where`/`--status`), from `changes.facts.length` vs `changes.facts_total` and `changes.pages.length` vs `changes.pages_total`, and from `data.misses.length` vs `data.total` (mode `misses`). `changes` is built in two places: the entity branch (`src/commands/search.ts:174`) and the `--since` branch (`src/commands/search.ts:212`). In both, set `facts_total` and `pages_total` from the lengths before `.slice(0, req.limit)`. `renderChanges` uses the totals in its header. Every value the note needs is in `SearchData` (lengths and totals), so it needs no extra input.
- **`--mark`** (R5, R7): `parseMark(raw: string | undefined): "decided" | "tentative" | undefined` in `src/search/filters.ts`. It is called in the action, like `parseFilterValue`, so errors carry `command: "search"` (flashcard `#cli #commander`: commander usage errors fire before `preAction`). Set `req.filters.mark` only when defined.
  - `hasFilters` is unchanged. `describeFilters` appends `--mark <m>` after `--since`. `encodeMissFilters` writes `mark` before `entity`; `decodeMissFilters` reads it back only when it is a string; `summarizeMisses` adds `mark` to its grouping key, so misses that differ only by mark are separate groups.
  - The "give a query or a filter" check (`src/commands/search.ts:94`) also accepts `mark`. `missesUsage` also refuses `mark`. A new check refuses `mark` with a query.
  - In `executeSearch`, after the filter step: when `mark` is set and there is no `--entity` and no `--since`, `results` and `total` come from `markHits(entities, pages, mark, filters, root, paths)` in `src/search/filters.ts`. It takes the entities passing `matchesFilters` (all of them when `hasFilters` is false), their facts with that status, and the `factsSince` order; `snippet` is `` `${f.date} · ${f.status} · ${f.text}` `` cut to 160 characters, and `sources` is `f.sources`.
  - In the entity branch, filter `entity.facts` by status, and with `--since` filter `changes.facts` by status and set `changes.pages` to `[]`. In the `--since` branch, filter `facts` by status and set `pages` to `[]`. Both happen before the totals and the slice.
- **`--status` hint** (R6): after `data` is final, if `data.total === 0` and `normalizeName(req.filters.status ?? "")` is `decided` or `tentative`, push the hint into `warnings`.

### 3.3 API Contract (if applicable)

Additive changes to STORY-004-02's frozen C10 types (`src/search/engine.ts`), owned here (K8):

```ts
export interface SearchFilters { type: string | null; where: WhereFilter[]; status: string | null; since: string | null;
  mark?: "decided" | "tentative" }            // present only with --mark
export interface SearchRequest { query: string | null; limit: number; filters: SearchFilters; entity: string | null; misses: boolean;
  noMiss?: boolean }                           // --no-miss
export interface SinceChanges { since: string; facts: FactView[]; pages: Array<…>;
  facts_total?: number; pages_total?: number } // counts before --limit; always set by search
export interface SearchData { /* unchanged fields */ events?: number }   // misses mode only
```

New exports of `src/search/filters.ts`:

```ts
export function parseMark(raw: string | undefined): "decided" | "tentative" | undefined;   // invalid_filter on any other value
export function markHits(entities: readonly Entity[], pages: readonly Page[], mark: "decided" | "tentative",
  filters: SearchFilters, root: string, paths: ResolvedPaths): SearchHit[];
```

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper search [query...]` | CLI | None | adds `--no-miss`, `--mark <decided\|tentative>` | `SearchData` with the additive fields above; human output adds the limit note and the `--status` hint |
| `wikeeper search --misses` | CLI | None | unchanged | adds `data.events`; header `N misses, M distinct queries` |

Frozen for consumers: the flag names `--no-miss` and `--mark`, the values `decided` and `tentative`, and the combinations: `--mark` refuses a text query and combines with `--type`, `--where`, `--status`, `--entity` and `--since`, including `--entity` with `--since` (STORY-006-10 writes them into WIKI.md and the sub-agent prompts).

## Task Breakdown

- [ ] `engine.ts`: the additive optional fields -> R1, R2, R4, R5
- [ ] `search.ts`: `--no-miss` option and the recording guard -> R1
- [ ] `misses.ts`: `data.events`, the header, and `mark` in encode, decode and grouping -> R2, R5
- [ ] `log.ts`: `missLabel` for the miss body line and the `log.md` miss line -> R3
- [ ] `search.ts`: `facts_total` and `pages_total`, the totals header, and the limit note -> R4
- [ ] `filters.ts`: `parseMark`, `markHits`, `describeFilters`; `search.ts`: the `--mark` branches and errors -> R5, R7
- [ ] `search.ts`: the `--status` hint -> R6
- [ ] QA-Red re-scopes the header assertion at `test/search/search-misses.red.node.test.ts:86` (§1.4 Decision 1, gate1-decisions item 21); the Developer updates `test/search/misses.test.ts:105,107` -> R2
- [ ] Developer unit tests per §4.1 -> §2.1

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 7 | `missLabel` (query only, filters only, query plus filters, a list-valued `where`, a malformed value left out, empty); the misses header for N = 1 and M = 1 and for plurals, and the fallback without `events`; `parseMark` (case, invalid, empty); `markHits` order, fields and snippet cut; the limit note's part joining, and no results part for a `--since`-only search or entity mode; `facts_total`/`pages_total` in the entity branch; `encodeMissFilters`/`decodeMissFilters` round trip with `mark`; `--miss` is an unknown option and `--no-miss` defaults to recording |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`, in QA-Red's `test/search/search-follow-ups.red.node.test.ts`. Error rows assert `error.code`, the message hint and `command: "search"`; at baseline `--mark` is an unknown option that also exits 2 (flashcards `#qa #red-test`). |
| Performance test | 0 | EPIC-004's budget (p95 < 500 ms on 500 pages) measures corpus load and query, and this story adds no work to that path. `test/search/search-perf.red.node.test.ts` must keep passing (DoD). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] STORY-004-02…06 tests pass; the only red-test change is the one authorised in §1.4.
- [ ] `test/search/search-perf.red.node.test.ts` passes when run on its own.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/search/misses.ts:16` — `shouldRecordMiss`: every zero-result search is a miss (R1).
- **Surface:** `src/search/misses.ts:135` — the misses header counts groups, not events (R2); `encodeMissFilters` at `src/search/misses.ts:21`.
- **Surface:** `src/ingest/log.ts:122` — the miss body line `No results for "<query>".`; the `log.md` miss line at `src/ingest/log.ts:253` (R3).
- **Surface:** `src/commands/search.ts:155` — results sliced to `--limit` with no note; the change lists are sliced at `src/commands/search.ts:176` and `:212`, and misses at `:229` (R4).
- **Surface:** `src/search/filters.ts:41` — `hasFilters`; `describeFilters` at `src/search/filters.ts:46`; `parseFilterValue` at `src/search/filters.ts:29` (R5, R7).
- **Surface:** `src/search/since.ts:52` — `factsSince`, whose order `--mark` hits reuse (R5).
- **Surface:** `src/search/engine.ts:20` — `SearchFilters`; `SinceChanges` at `src/search/engine.ts:66`, `SearchData` at `:79`, `SearchRequest` at `:90`.
- **Coverage of this requirement:** partial (≥80% of the machinery) — recording, grouping, filters, since lists and the log writer exist; this story adds two options, one count, one label and one note.

## Prior work

- [[CR-003]] (A1–A5 and Open Questions 1 and 4, approved 2026-10-17), [[EPIC-004]] (parent), [[STORY-004-05]] (miss logging and `--misses`, extended here), [[STORY-004-03]] (filters, which `--mark` joins), [[STORY-004-04]] (`--since` and `--entity`, which `--mark` narrows), [[STORY-004-02]] (the frozen `SearchData` types), [[STORY-003-07]] (the log writer). The wiki and archive grep found no other prior work on these flags.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/commands/search.ts` with `src/search/misses.ts`, `src/search/filters.ts` and the miss case of `src/ingest/log.ts`.
- **Why isn't extension / parameterization / config sufficient?** This story is that extension: two options and four output changes on the existing command, with no new module. A page-count threshold instead of `--no-miss` would hide real misses on a small wiki, and merging misses into one file would break one-file-per-event (D-28; CR-003 Open Question 1). Reusing `--status` for fact marks would break STORY-004-03's frozen meaning, so `--mark` is a separate filter (CR-003 Open Question 4). The five items share one command and its tests, so splitting them would put five stories on the same option block.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding.
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
