---
story_id: STORY-004-05
parent_epic_ref: EPIC-004
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-004 (approved 2026-10-16) · architecture.md §9 (misses drive rule proposals), D-28 (one file per event in log/) · SPRINT-02 decomposition brief (contracts 7, 8, 10) · verified src/core/paths.ts (logDir)
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-004-02
  - STORY-004-04
  - STORY-003-07
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T18:45:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
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
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-004-05
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:52:30Z
  sessions: []
---

# STORY-004-05: Miss logging and `search --misses`
**Complexity:** L2 — one module that writes and summarises `miss` events, plus one option on `search`. Depends on STORY-004-02, STORY-004-04 (`parseSince`, and the order of edits to `src/commands/search.ts`) and STORY-003-07 (`writeLogEvent` / `readLogEvents`).

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent proposing capture-rule changes, I want every question the wiki couldn't answer to be recorded and listable, so that I can see which information keeps being asked for but is never captured.

### 1.2 Detailed Requirements
- **R1 — Record.** When a search ends with `total === 0`, `executeSearch` writes one `miss` event through STORY-003-07's `writeLogEvent(paths, event)`, using its frozen `MissLogEvent` shape `{ type: "miss", at, query, filters }`. This covers `mode: "query"` with a query, filters or `--since`, and `mode: "entity"`.
  - `at` is `deps.now()` as ISO UTC.
  - `query` is `data.query`, or `""` when there is no text query.
  - `filters` encodes only the parts that are set: `type`, `status` and `since` as strings, `where` as `["key=value", …]`, and `entity` as `data.entity_query`. This is `encodeMissFilters`, and `decodeMissFilters` reverses it.

  A search with results writes nothing.
- **R2 — Always recorded, never fatal.**
  - `mode: "misses"` itself is never recorded.
  - Misses are recorded while an ingest holds the write lock too. STORY-003-08/09 count only modified or deleted files under `raw/`, `log/` and `index.md` as writes outside `pages/`, and new files are allowed (STORY-003-08 R3 names search misses). The writer agent's misses during the write phase are the ones most worth keeping.
  - If the event can't be written, the miss is skipped with the warning `miss not logged: <reason>`. The search result is unchanged and the exit code stays 0.
- **R3 — List.** `wikeeper search --misses` returns `mode: "misses"` and `data.misses`, a list of `MissSummary`:
  - Every `miss` event from `readLogEvents(paths, { type: "miss" })` is decoded (`""` query → `null`, `filters` → `SearchFilters` plus `entity`) and grouped by normalised query (`normalizeName`, or `null`), filters, and normalised entity.
  - Each group reports the query as first recorded, the filters, the entity, `count`, `first_at` and `last_at`.
  - Groups are sorted by `count` (highest first), then `last_at` (newest first), then query (`null` last).
  - `total` is the number of groups and `--limit` caps the list.
  - Events whose `query` is not a string, or whose `filters` values are not strings or string lists, are skipped. Files `readLogEvents` already skipped are ignored.
- **R4 — Since.** `--misses --since <date>` validates the date with `parseSince` (STORY-004-04) and passes `since: bound.instant` to `readLogEvents`, which keeps events with `at >= since`.
- **R5 — Exclusive.** `--misses` cannot be combined with a text query, `--type`, `--where`, `--status` or `--entity`. Combining them exits 2 with code `usage`.
- **R6 — Human output.** `1 recorded miss` / `N recorded misses` (pluralised), then one line per group: `<count>× "<query>"`, with the filters or `entity <name>` when set, and `(last <YYYY-MM-DD>)`. With no misses it prints `no recorded misses`.

### 1.3 Out of Scope
- Turning misses into `kb_instructions.md` proposals, or recording proposal decisions (`rules record`, EPIC-005, SPRINT-03).
- Deleting or compacting old miss events; `log/` is append-only (D-28).

### 1.4 Open Questions

- None. `writeLogEvent` only ever creates new files (STORY-003-07 R1), which `ingest finish` allows during a write phase (STORY-003-08 R3, STORY-003-09 R3), so no lock check is needed.

### 1.5 Risks

- **Risk:** A later change to `ingest finish` starts treating new `log/` files as writes outside `pages/`, so a miss during a write phase fails that ingest.
- **Mitigation:** The Gherkin below records a miss while the lock is held, and STORY-003-09's own tests cover "new files are allowed"; a change on either side breaks a test.
- **Risk:** One file per miss makes `log/` grow quickly.
- **Mitigation:** Events are small, one file each so they merge cleanly (D-28), and `log.md` stays a generated view. Compaction is out of scope.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Listing all misses vs listing since a date. |
| Interfaces | F | CLI only; the JSON shape is STORY-004-02's. |
| Data | T | Misses from text queries and from entity lookups are grouped separately; exclusive-flag combinations (Outline). |
| Rules | T | Only zero-result searches are recorded, including during an open write phase; a failed write is a warning, never an error. |

```gherkin
Feature: Search misses

  @rules
  Scenario: A miss is logged
    Given an initialised wiki where no page mentions "budget burn"
    When I run "wikeeper search 'budget burn'"
    Then a miss event is written to log/ with query "budget burn"
    And "wikeeper search --misses --json" lists it with count 1
    And "wikeeper search --misses" prints "1 recorded miss" and a line starting with '1× "budget burn"'
    And a search that has results writes no new file to log/

  @data @rules
  Scenario: Repeated misses are grouped and counted
    Given misses recorded for "budget burn" at 2026-10-10, "Budget  Burn" at 2026-10-12 and entity "Nobody" at 2026-10-13
    When I run "wikeeper search --misses --json"
    Then data.misses holds two groups: "budget burn" with count 2 and last_at 2026-10-12, then entity "Nobody" with count 1
    And data.total is 2

  @rules
  Scenario Outline: Misses are logged during a write phase, and a failed write is only a warning
    Given <condition>
    When I run "wikeeper search 'budget burn' --json"
    Then <log_result>
    And the envelope warnings <warnings>
    And data.total is 0 and the exit code is 0

    Examples:
      | condition                                          | log_result                                         | warnings                                       |
      | .wiki/.lock exists for an applied ingest           | one new miss event is written to log/              | are empty                                      |
      | the content directory's log path is a regular file | no miss event is written                           | include a line starting with "miss not logged:" |

  @paths
  Scenario: Misses can be listed since a date
    Given misses recorded for "budget burn" at 2026-10-09 and "hiring plan" at 2026-10-12
    When I run "wikeeper search --misses --since 2026-10-11 --json"
    Then data.misses holds only "hiring plan"

  @data
  Scenario Outline: Error — --misses cannot be combined with a search
    When I run "wikeeper search <args> --json"
    Then the command exits with code 2 and error code "usage"

    Examples:
      | args                   |
      | budget --misses        |
      | --misses --type risk   |
      | --misses --entity PL   |
```

### 2.2 Verification Steps (Manual)
- [ ] Run a few searches that find nothing in a scratch wiki, then `wikeeper search --misses` and `wikeeper index rebuild`, and check `log.md` shows the miss events.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/search/misses.ts` |
| Related Files | `src/ingest/log.ts` (`writeLogEvent`, `readLogEvents`, `MissLogEvent`, `StoredLogEvent` — consumed, STORY-003-07), `src/search/since.ts` (`parseSince` — consumed, STORY-004-04) |
| Modified Files | `src/commands/search.ts` |
| Test Files | `test/search/misses.test.ts`, `test/search/search-misses.test.ts` |
| New Files Needed | Yes — `src/search/misses.ts` and both test files |

### 3.2 Technical Logic
- `executeSearch` computes `SearchData` as before. If `shouldRecordMiss(data)` is true, it calls `recordMiss(paths, data, now)` and appends any warning to the envelope's `warnings` (the command passes it to `emitResult`).
- `recordMiss` calls `writeLogEvent` inside try/catch, with no lock check. A thrown error becomes the warning; it is never rethrown.
- `summarizeMisses` groups with a `Map` keyed by `JSON.stringify([normQuery, filters, normEntity])`. Decoded filters are canonicalised as `{ type, where, status, since }` in that key order, so equal filters give the same key.
- Tests pass `deps.now` to `executeSearch` for fixed `at` values. Grouping tests create the events through STORY-003-07's `writeLogEvent`.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper search --misses` | CLI | None | `--since <date>`, `--limit <n>`, `--json` | `SearchData` with `mode: "misses"`, `misses: MissSummary[]` |

Frozen exports of `src/search/misses.ts`:

```ts
export function shouldRecordMiss(data: SearchData): boolean;
export function encodeMissFilters(filters: SearchFilters, entity: string | null): Record<string, string | string[]>;
export function decodeMissFilters(raw: Record<string, string | string[]>): { filters: SearchFilters; entity: string | null };
export function recordMiss(paths: ResolvedPaths, data: SearchData, now: Date): Promise<{ logged: boolean; warning: string | null }>;
export function summarizeMisses(events: readonly StoredLogEvent[]): MissSummary[];
```

Consumed from STORY-003-07 (frozen): `writeLogEvent`, `readLogEvents(paths, { type, since })` → `{ events: StoredLogEvent[], skipped }`, and `MissLogEvent { type: "miss"; at: string; query: string; filters: Record<string, string | string[]> }`. The encoded `filters` (including `entity`) are what EPIC-005 (`status`, rule proposals, SPRINT-03) will read.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 5 | `shouldRecordMiss` per mode; grouping key normalisation; sort order with a `null` query; malformed events skipped; write failure becomes a warning |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] STORY-004-02…04 tests still pass.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/paths.ts:50` — `logDir`, where miss events are written.
- **Surface:** `src/commands/search.ts` — created by STORY-004-02 and extended by STORY-004-03/04 in this sprint; this story adds `--misses` and the recording step.
- **Coverage of this requirement:** partial — paths and the log writer exist by then; miss recording and summaries are net-new.

## Prior work

- [[EPIC-004]] (parent); [[EPIC-003]] — `miss` events go through STORY-003-07's log writer (contract 7), and logging during a write phase relies on STORY-003-08/09 allowing new files (contract 8). No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** STORY-003-07's `writeLogEvent` plus `src/commands/search.ts`.
- **Why isn't extension / parameterization / config sufficient?** This story is that extension: one call after a search that finds nothing, and one summary over events that already exist. Without recorded misses, the "questions `wiki_search` couldn't answer" signal in architecture.md §9 has no data. Grouping makes the list readable, rather than showing one line per attempt.

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
