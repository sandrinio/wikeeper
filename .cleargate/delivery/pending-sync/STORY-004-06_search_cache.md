---
story_id: STORY-004-06
parent_epic_ref: EPIC-004
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-004 (approved 2026-10-16; §2 optional on-disk cache, §3 performance budget) · architecture.md §4.1 (ownership) · SPRINT-02 decomposition brief (contract 10) · verified src/core/gitignore.ts (.wiki/.cache/ ignored), src/commands/remove.ts, src/core/manifest.ts (sha256)
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors:
  - STORY-004-02
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T18:45:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 1
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
last_synced_body_sha: b0433d7977cde32a45d34bf4a3aea213438af5307f5a40812125631f95dd54c8
stamp_error: no ledger rows for work_item_id STORY-004-06
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:53:44Z
  sessions: []
---

# STORY-004-06: On-disk search cache
**Complexity:** L2 — caching inside `loadSearchCorpus` (`src/search/engine.ts`) plus one cleanup line in `remove`. Depends on STORY-004-02; it does not touch `src/commands/search.ts`, so it can build alongside STORY-004-03…05.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent that runs several searches per source during triage, I want repeated searches to reuse the parsed pages and index until a page changes, so that search stays fast as the wiki grows.

### 1.2 Detailed Requirements
- **R1 — Cache file.** `loadSearchCorpus(paths, { useCache })` (default `useCache: true`) keeps `.wiki/.cache/search.json`. It holds:
  - `version: 1`;
  - the `package_version` that wrote it;
  - `files`: the POSIX path and sha256 of every page file in `listPageFiles` order;
  - the parsed `pages`;
  - the `SearchDoc` list;
  - the MiniSearch index (`toJSON()`).
- **R2 — Reuse.** On each call every page file is read and hashed. The cache is reused only when `version` and `package_version` match and the `files` list matches exactly (same paths, same order, same hashes). Reuse means `parsePage` and index building are skipped (`MiniSearch.loadJSON` with the same options) and `onRebuild` is not called.
- **R3 — Rebuild.** Any mismatch rebuilds the corpus — a changed, added or deleted page; an unreadable cache, invalid JSON, or wrong shape; another version — then calls `onRebuild` once and writes the cache again. Writing goes to a temp file in `.wiki/.cache/` and is renamed into place, so a crash never leaves a half-written cache. Results after a rebuild are identical to `useCache: false`.
- **R4 — Failures don't fail search.** If the cache can't be read, it is rebuilt silently. If it can't be written (e.g. permissions, or `.cache` exists as a file), the search still returns its results, and the envelope carries the warning `search cache not written: <reason>`. `loadSearchCorpus` returns the warning in `SearchCorpus.warnings`, and `executeSearch` passes it to `emitResult`.
- **R5 — `useCache: false`.** Neither reads nor writes the cache. STORY-004-02's perf test uses it for the cold measurement.
- **R6 — Remove.** `wikeeper remove` deletes `.wiki/.cache/`, which is derived data, and reports it under `removed`. `remove --purge` already deletes `.wiki/`. The cache stays gitignored (`src/core/gitignore.ts:78`).
- **R7 — Performance (EPIC-004 §3).** On the seed-1 500-page wiki from STORY-004-02, with a warm cache, p95 of 30 in-process `executeSearch` runs (after one warm-up run) is under 500 ms. The warm runs never call `onRebuild`.

### 1.3 Out of Scope
- Incremental updates (re-indexing only the changed pages); any change rebuilds the whole corpus.
- A `--no-cache` CLI flag (the `SearchDeps.useCache` switch is enough for tests); caching for `ingest` or `index rebuild`.

### 1.4 Open Questions

- None. The cache key is the file hashes, as EPIC-004 §2 specifies. Deleting the cache on `remove` follows the ownership matrix (architecture.md §4.1): it is not user knowledge.

### 1.5 Risks

- **Risk:** Reading and hashing every page on every search costs about as much as parsing, so the cache saves little.
- **Mitigation:** The expensive parts are parsing and building the index, not reading about 1 MB. R7 asserts the warm budget, and the bench in STORY-004-02 reports cold vs warm. If hashing dominates, a size+mtime pre-check can be added without changing the cache format.
- **Risk:** STORY-004-01 adds a field to `Page` and old caches load the wrong shape.
- **Mitigation:** `package_version` is part of the key, and a shape check (`version`, array fields) falls back to a rebuild.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Cache hit vs rebuild. |
| Interfaces | F | No new CLI surface; behaviour shows through `search` results, `remove` and the `onRebuild` hook. |
| Data | T | Edited, added and deleted pages each invalidate (Outline); corrupt and unwritable caches (Outline). |
| Rules | T | Warm cache stays within the budget; `remove` deletes derived data. |

```gherkin
Feature: Search cache

  @paths
  Scenario: A warm cache is reused
    Given an initialised wiki with 20 pages
    When executeSearch runs twice for "atlas" with an onRebuild counter
    Then the counter is 1
    And .wiki/.cache/search.json exists
    And both runs return byte-identical SearchData, equal to a run with useCache false

  @data
  Scenario Outline: A page change rebuilds the cache
    Given a warm cache for a wiki containing projects/atlas.md
    When I <change> and run "wikeeper search <query> --json"
    Then onRebuild is called once
    And the results <expectation>

    Examples:
      | change                                   | query   | expectation                                 |
      | add "orbital" to projects/atlas.md        | orbital | include projects/atlas.md                   |
      | add pages/projects/zephyr.md about zephyr | zephyr  | include projects/zephyr.md                  |
      | delete projects/atlas.md                  | atlas   | do not include projects/atlas.md            |

  @rules
  Scenario: The warm cache stays within the performance budget
    Given the seed-1 generated wiki of 500 pages and a warm cache
    When executeSearch runs 30 times for "vendor delay" after one warm-up run
    Then the p95 duration is under 500 ms
    And onRebuild is never called during the 30 runs

  @data
  Scenario Outline: Error — a bad or unwritable cache never fails search
    Given an initialised wiki with pages and <cache_state>
    When I run "wikeeper search atlas --json"
    Then the command exits 0 with the same results as useCache false
    And the envelope warnings <warnings>

    Examples:
      | cache_state                                | warnings                                                     |
      | .wiki/.cache/search.json containing "{oops" | are empty                                                    |
      | .wiki/.cache/search.json with version 99    | are empty                                                    |
      | .wiki/.cache existing as a regular file     | include a line starting with "search cache not written:"     |

  @rules
  Scenario: remove deletes the derived cache
    Given an initialised wiki with a warm search cache
    When I run "wikeeper remove --json"
    Then .wiki/.cache/ no longer exists
    And data.removed includes ".wiki/.cache/search.json"
    And pages/ and raw/ are unchanged
```

### 2.2 Verification Steps (Manual)
- [ ] Run `npx vitest bench --run test/bench/search.bench.ts` and note cold vs warm p95 in the dev report.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/search/engine.ts` |
| Related Files | `src/core/manifest.ts` (`sha256File`), `src/wiki/parse-page.ts` (`listPageFiles`, `parsePage` — consumed), `src/core/paths.ts` (`wikiDir`) |
| Modified Files | `src/commands/remove.ts`, `test/bench/search.bench.ts` (adds the warm case) |
| Test Files | `test/search/cache.test.ts`, `test/search/cache.perf.test.ts`, `test/remove.test.ts` |
| New Files Needed | Yes — `test/search/cache.test.ts`, `test/search/cache.perf.test.ts` |

### 3.2 Technical Logic
- `loadSearchCorpus`:
  1. `listPageFiles` → read each file as a Buffer → sha256 → `files[]`.
  2. If `useCache`, try `readFile(cacheFile)` → `JSON.parse` → a shape check → compare `files` element by element. On a match, use `MiniSearch.loadJSON(JSON.stringify(cache.index), MINISEARCH_OPTIONS)` and return the cached `pages`, `entities` (recomputed with `pageEntities`, which is cheap) and docs.
  3. Otherwise parse from the Buffers already read (no second read), build, call `onRebuild?.()`, and write `{ version: 1, package_version, files, pages, docs, index: miniSearch.toJSON() }` to `search.json.<pid>.tmp`, then `rename` it.
- `SearchCorpus.warnings` is declared by STORY-004-02 (contract 10) and left `[]` there; this story fills it.
- The package version is read the same way `src/program.ts` reads `VERSION` (the shared reader queued for SPRINT-01 D.5, if it lands first).
- `remove.ts`: after the tooling files are removed, `rm(path.join(paths.wikiDir, ".cache"), { recursive: true, force: true })`, and the removed cache files are listed as POSIX paths before deletion.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper search` | CLI | None | unchanged | unchanged, plus a possible `search cache not written:` warning |
| `wikeeper remove` | CLI | None | unchanged | `data.removed` also lists `.wiki/.cache/**` files |

New exports of `src/search/engine.ts` (additive to STORY-004-02's contract 10; `SearchCorpus` and `loadSearchCorpus` keep their frozen signatures):

```ts
export const SEARCH_CACHE_VERSION: 1;
export function searchCacheFile(paths: ResolvedPaths): string; // <wikiDir>/.cache/search.json
```

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 4 | cache shape check; `files` comparison (order, hash); temp-then-rename write; version mismatch |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |
| Performance test | 1 | `test/search/cache.perf.test.ts`: warm-cache p95 of 30 in-process `executeSearch` runs (after one warm-up) on the seed-1 500-page fixture < 500 ms, with zero `onRebuild` calls; cold vs warm baseline in `test/bench/search.bench.ts`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] STORY-004-02's cold perf test still passes with `useCache: false`.
- [ ] `test/e2e/goal.test.ts` (SPRINT-01) still passes: `remove` leaves pre-existing files byte-identical.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/gitignore.ts:78` — the wiki's cache directory is already in the managed ignore block.
- **Surface:** `src/core/manifest.ts:50` — `sha256File` / hashing helper reused for page hashes.
- **Surface:** `src/commands/remove.ts:216` — the `--purge` branch deletes `.wiki/`; the non-purge path gets the cache cleanup.
- **Surface:** `src/search/engine.ts` — `loadSearchCorpus` from STORY-004-02 (contract 10).
- **Coverage of this requirement:** partial — the ignore entry and hashing exist; the cache is net-new.

## Prior work

- [[EPIC-004]] (parent). Built on STORY-004-02 in the same epic. No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `loadSearchCorpus` in `src/search/engine.ts`.
- **Why isn't extension / parameterization / config sufficient?** This story is that extension: the cache lives inside the existing loader, and no command or schema changes. A cache keyed on modification times alone would miss same-second edits and branch checkouts, which keep or reset mtimes unpredictably. Hashes are the cheapest key that is always right.

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
