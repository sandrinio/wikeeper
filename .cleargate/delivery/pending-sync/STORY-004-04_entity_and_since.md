---
story_id: STORY-004-04
parent_epic_ref: EPIC-004
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-004 (approved 2026-10-16) · architecture.md §5.2 (Q1, Q4), §5.4, §8 (aliases, dated facts), D-28 (log/) · SPRINT-02 decomposition brief (contracts 1, 7, 10) · verified src/core/exit-codes.ts, src/core/paths.ts
actor: AI coding agent
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-004-01
  - STORY-004-02
  - STORY-004-03
  - STORY-003-07
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T18:45:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 2
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:24:03Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 48ff7dd928ef40b831b160f0118e269bad7801eec650adc88d9b76ceb954df2d
stamp_error: no ledger rows for work_item_id STORY-004-04
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:51:23Z
  sessions: []
---

# STORY-004-04: `--entity` alias resolution with backlinks; `--since`
**Complexity:** L3 — two modules (aliases, since) and a branch in the `search` command, reading pages and `log/` events. Depends on STORY-004-01…03 and on STORY-003-07's log reader; edits `src/commands/search.ts` after STORY-004-03.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent, I want to look up a person, project or term by any of its names and see everything that links to it, and to ask what changed since a date, so that "AK", "Ana K." and "Ana Kim" are one person and "what changed since Monday?" has a direct answer.

### 1.2 Detailed Requirements
- **R1 — Resolution.** `--entity <name>` resolves against every entity from `pageEntities` (page and section entities, STORY-004-01 R8). An entity's name keys are `normalizeName(name)` and, for a page entity, its file name without `.md`; its alias keys are `normalizeName` of each alias.
  - A name-key match beats an alias-key match. Among equal matches, a page entity beats a section entity, then path wins (code-unit order), then line.
  - The best match is returned. Every other distinct match is listed in `also_matches` in the same order.
- **R2 — Entity result.** The result has `mode: "entity"`, `entity_query` set to the input, `results: []`, and `total` 1 when found or 0 when not. `data.entity` is an `EntityMatch` (STORY-004-02 §3.3):
  - `key`, `name`, `type`, `path`, `file`, `section` (heading, `""` for a page entity), `line`, `aliases`;
  - `matched` and `matched_alias`;
  - `summary`;
  - `typed_links`: the entity's own typed links, in document order;
  - `facts`: the entity's facts as `FactView`, sorted by date (newest first), then line;
  - `backlinks` (R3) and `also_matches`.
- **R3 — Backlinks.** Backlinks are every wikilink whose `normalizeName(target)` equals one of the entity's name or alias keys (`buildBacklinks`). Links that sit inside the entity itself are left out: links whose `owningEntityKey` equals the entity's key. Each entry has `path`, `section` (the heading of the link's section), `line` and `context`, is deduplicated by path and line, and the list is sorted by path, then line.
- **R4 — Not found.** An unknown name gives `entity: null` and `total: 0`, exits 0, and prints `no entity named "<name>"`.
- **R5 — Exclusive.** `--entity` cannot be combined with a text query, `--type`, `--where` or `--status`. Combining them exits 2 with code `usage`. `--since` may be combined with it (R8).
- **R6 — Since bound.** `--since <date>` accepts `YYYY-MM-DD` or an ISO 8601 date-time with `Z` or an offset. It is echoed in `data.filters.since` as given. Facts are compared by their `YYYY-MM-DD` date, and log events by the instant (a bare date means `T00:00:00Z`). Anything else, including impossible dates, exits 2 with code `invalid_since` (the same code STORY-003-07's log reader uses) and `details: { expected: "YYYY-MM-DD", got }`.
- **R7 — Changes.** `data.changes` is a `SinceChanges`:
  - `facts`: every fact dated on or after the bound, across all entities, as `FactView`, sorted by date (newest first), then path, then line.
  - `pages`: from `readLogEvents(paths, { type: "ingest", since: bound.instant })` (STORY-003-07), every `ingest` event at or after the bound. Each path in the event's `created`, `updated` or `deleted` list becomes one `{ path, change, source_id, at }` entry, sorted by `at` (newest first), then path. Events without those lists, or with entries that are not strings, contribute nothing.
- **R8 — Combinations.**
  - `--since` alone: `mode: "query"`, `query: null`, `results: []`. `total` is the number of fact entries plus page entries, and `--limit` caps each of the two lists.
  - With `--entity`: `entity.facts` and `changes.facts` hold only that entity's facts on or after the bound, and `changes.pages` only entries for the entity's page.
  - With a query or filters: `results` keeps only hits whose owning entity has a fact on or after the bound, or whose page is in `changes.pages`. `changes` is computed over the same entities, and `total` counts the kept hits.

### 1.3 Out of Scope
- Using aliases in `--where` (STORY-004-03 matches on tokens only).
- Logging `--entity` searches that find nothing as misses (STORY-004-05).
- Resolving "next Friday"-style relative dates; the agent turns them into dates using `me.md` (architecture.md §5.4).

### 1.4 Open Questions

- None. The resolution order and the exclusivity rule follow from the epic's single-entity Gherkin. `--since` reads the `log/` format frozen by STORY-003-07 (contract 7).

### 1.5 Risks

- **Risk:** A hand-edited `ingest` event in `log/` holds a non-list `updated` field, or paths that are not under `pages/`.
- **Mitigation:** STORY-003-07 freezes `IngestLogEvent.created` / `updated` / `deleted` as POSIX paths relative to `pages/`. `pagesChangedSince` re-checks the shape and skips entries that don't fit, rather than failing.
- **Risk:** A common name ("Atlas") matches both a project and a glossary term, and the agent takes the wrong one.
- **Mitigation:** `also_matches` lists every other match, and the order is deterministic, so the agent can re-query with the more specific name.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Entity lookup and "changed since" are distinct successful paths. |
| Interfaces | F | CLI only; the JSON shape is STORY-004-02's. |
| Data | T | Resolution by name vs alias vs no match (Outline); combinations of `--since` (Outline). |
| Rules | T | Resolution order; exclusivity of `--entity`; date validation. |

```gherkin
Feature: Entity lookup and changes since a date

  @paths
  Scenario: Alias resolves to the entity
    Given team.md with "## Ana Kim" holding "type:: person" and "aliases:: AK, Ana K."
    And projects/atlas.md with "owner:: [[Ana Kim]]" and risks.md with "owner:: [[AK]]"
    When I run "wikeeper search --entity AK --json"
    Then data.mode is "entity" and data.entity.name is "Ana Kim" with matched "alias" and matched_alias "AK"
    And data.entity.backlinks lists projects/atlas.md, then risks.md, each with section, line and context
    And no backlink comes from inside the "## Ana Kim" section

  @data @rules
  Scenario Outline: Resolution prefers names over aliases and pages over sections
    Given projects/atlas.md titled "Atlas" and glossary.md with "## ATL" holding "type:: term" and "aliases:: Atlas"
    When I run "wikeeper search --entity '<input>' --json"
    Then data.entity is <entity> with also_matches <also>
    And data.total is <total> and the exit code is 0
    And without --json the first output line <message>

    Examples:
      | input  | entity             | also        | total | message                         |
      | atlas  | "Atlas" (page)     | ["ATL"]     | 1     | names "Atlas"                   |
      | ATL    | "ATL" (section)    | []          | 1     | names "ATL"                     |
      | Nobody | null               | none        | 0     | is 'no entity named "Nobody"'   |

  @paths
  Scenario: Since lists dated facts and changed pages
    Given facts dated 2026-10-10 and 2026-10-15 on projects/atlas.md
    And log/ ingest events at 2026-10-09T09:00:00Z (updated "team.md") and 2026-10-12T09:00:00Z (updated "projects/atlas.md", source "src-2026-10-12-sync")
    When I run "wikeeper search --since 2026-10-11 --json"
    Then data.changes.facts holds only the 2026-10-15 fact
    And data.changes.pages equals [{ path: "projects/atlas.md", change: "updated", source_id: "src-2026-10-12-sync", at: "2026-10-12T09:00:00Z" }]
    And data.total is 2

  @data
  Scenario Outline: Since narrows an entity or a query
    Given the facts and log events above, projects/atlas.md titled "Atlas", and "launch" mentioned in projects/atlas.md and team.md
    When I run "wikeeper search <args> --json"
    Then <field> equals <expected>

    Examples:
      | args                              | field                         | expected                |
      | --entity Atlas --since 2026-10-11 | data.entity.facts[*].date     | ["2026-10-15"]          |
      | launch --since 2026-10-11         | distinct data.results[*].path | ["projects/atlas.md"]   |

  @rules
  Scenario Outline: Error — invalid dates and combinations are rejected
    When I run "wikeeper search <args> --json"
    Then the command exits with code 2 and error code "<code>"

    Examples:
      | args                      | code         |
      | --since 2026-13-01        | invalid_since |
      | --since yesterday         | invalid_since |
      | atlas --entity AK         | usage        |
      | --entity AK --type person | usage        |
```

### 2.2 Verification Steps (Manual)
- [ ] After a real ingest (once EPIC-003 lands), run `wikeeper search --since <today>` and check the changed pages match the ingest report.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/search/aliases.ts` |
| Related Files | `src/search/since.ts`, `src/ingest/log.ts` (`readLogEvents`, `StoredLogEvent`, `IngestLogEvent` — consumed, STORY-003-07), `src/wiki/parse-page.ts` (`Entity`, `Page`, `Fact`, `Backlink` — consumed, STORY-004-01), `src/search/engine.ts` (consumed, STORY-004-02) |
| Modified Files | `src/commands/search.ts` |
| Test Files | `test/search/aliases.test.ts`, `test/search/since.test.ts`, `test/search/search-entity.test.ts` |
| New Files Needed | Yes — `src/search/aliases.ts`, `src/search/since.ts` and the three test files |

### 3.2 Technical Logic
- `resolveEntity` builds the candidate list in one pass and sorts with a comparator tuple `(matchRank, kindRank, path, line)`, where `matchRank` is name = 0, alias = 1 and `kindRank` is page = 0, section = 1. Same-key duplicates of one entity collapse to its best match.
- `entityBacklinks` looks up each key in `buildBacklinks(pages)`. It drops links where `owningEntityKey(page, link.section) === entity.key`, dedupes by `path:line` and sorts.
- `parseSince`:
  - A bare date matches `^\d{4}-\d{2}-\d{2}$` and passes the same calendar check as the page parser (STORY-004-01).
  - A date-time must parse with `Date.parse` and match `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$`.
  - It returns `{ date: "YYYY-MM-DD", instant: ISO UTC }`.
- `pagesChangedSince` takes the `StoredLogEvent[]` that `readLogEvents` returned for `{ type: "ingest", since: bound.instant }`, and re-checks `event.type === "ingest"` and the array fields, because hand-edited files keep their extra or odd fields.
- Tests create `log/` events through STORY-003-07's `writeLogEvent`, so they do not hard-code the file format.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper search` | CLI | None | `--entity <name>`, `--since <date>` (plus 004-02/03 options) | `SearchData`: `mode: "entity"` with `entity`, or `changes` filled |

Frozen exports:

```ts
// src/search/aliases.ts
export interface EntityResolution { entity: Entity; matched: "name" | "alias"; matchedAlias: string | null; others: Entity[]; }
export function entityKeys(entity: Entity): { names: string[]; aliases: string[] };
export function resolveEntity(entities: readonly Entity[], name: string): EntityResolution | null;
export function entityBacklinks(entity: Entity, pages: readonly Page[], backlinks: Map<string, Backlink[]>): EntityMatch["backlinks"];
export function toEntityMatch(res: EntityResolution, pages: readonly Page[], root: string, paths: ResolvedPaths, backlinks: Map<string, Backlink[]>): EntityMatch;

// src/search/since.ts
export interface SinceBound { date: string; instant: string; }
export function parseSince(raw: string): SinceBound;
export function toFactView(fact: Fact, entity: Entity, page: Page): FactView;
export function factsSince(entities: readonly Entity[], pages: readonly Page[], bound: SinceBound): FactView[];
export function pagesChangedSince(events: readonly StoredLogEvent[]): SinceChanges["pages"];
```

## Task Breakdown

- [x] Implement `entityKeys` and `resolveEntity` with the ordering tuple -> R1
- [x] Implement `entityBacklinks` (key lookup, self-exclusion by owning entity, dedupe, sort) -> R3
- [x] Implement `toEntityMatch` and `toFactView` (fact ordering) -> R2
- [x] Implement `parseSince` with calendar and ISO checks -> R6
- [x] Implement `factsSince` and `pagesChangedSince` over `readLogEvents` -> R7
- [x] Wire `--entity` and `--since` into `src/commands/search.ts`: exclusivity errors, not-found message, combinations, `total` rules -> R4, R5, R8
- [x] Write one test per Gherkin scenario in §2.1

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 8 | resolution order (4 cases); self-link exclusion; `parseSince` (date, date-time with offset, impossible date); `pagesChangedSince` skips malformed events |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] STORY-004-02 and STORY-004-03 tests still pass.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/paths.ts:50` — `logDir`, the directory `readLogEvents` reads.
- **Surface:** `src/core/exit-codes.ts:4` — `ExitCode.USAGE` for `invalid_since` and the exclusivity error.
- **Surface:** `src/commands/search.ts` — created by STORY-004-02 and extended by STORY-004-03 in this sprint; this story adds `--entity` and `--since`.
- **Coverage of this requirement:** partial — the command, parser and log reader come from earlier stories; resolution and since logic are net-new.

## Prior work

- [[EPIC-004]] (parent); [[EPIC-003]] — `log/` events read through STORY-003-07's `readLogEvents` (contract 7). No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/commands/search.ts` with `src/wiki/parse-page.ts`'s `buildBacklinks`.
- **Why isn't extension / parameterization / config sufficient?** This story extends exactly those surfaces. Full-text search for "AK" only finds pages that literally say "AK": it misses every page that says "Ana Kim" and can't return backlinks. "Changed since" needs dated facts and the ingest log together, which no text query gives. Two small pure modules are the least that answers architecture.md's Q1 and Q4.

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
