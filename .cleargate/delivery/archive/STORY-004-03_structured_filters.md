---
story_id: STORY-004-03
parent_epic_ref: EPIC-004
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Completed
approved: true
ambiguity: 🟢 Low
context_source: EPIC-004 (approved 2026-10-16) · architecture.md §5.2 (entities), §5.3 (risks.md register), §8 (typed links) · SPRINT-02 decomposition brief (contracts 1, 10) · verified src/core/exit-codes.ts
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-004-01
  - STORY-004-02
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T18:45:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 3
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:24:02Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: f99972e2260c0f2c88c0bbfaa9f1c84256bd89cd56758ceb88feef5dbfb0987d
stamp_error: no ledger rows for work_item_id STORY-004-03
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:49:52Z
  sessions: []
---

# STORY-004-03: Structured filters `--type`, `--where`, `--status`
**Complexity:** L2 — one filter module plus three options on the `search` command. Depends on STORY-004-01 (entities) and STORY-004-02 (the command and `SearchData`), and edits `src/commands/search.ts` after it.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent answering "what's at risk, and who's on it?", I want to filter the wiki by entity type, typed-link values and status, with or without a text query, so that I get exactly the open risks Product owns instead of every page that mentions her.

### 1.2 Detailed Requirements
- **R1 — Type.** `--type <type>` keeps entities whose `type` equals the value under `normalizeName`. Page entities take their type from frontmatter `type`; section entities take it from their `type::` link (STORY-004-01 R8). So `--type risk` finds both a `decisions/x.md` page and a risk section inside `risks.md`.
- **R2 — Where.** `--where <key=value>` can be given several times; all conditions must hold (AND). The key is matched case-insensitively against the entity's typed links and, for page entities, its frontmatter keys. A value matches when every whitespace-separated token of `normalizeName(value)` equals a whole token of the candidate:
  - the candidate is each wikilink target of a typed link, or the link's plain value when it has no targets;
  - for a list-valued frontmatter key, each element is a candidate.

  For example, `owner=Product` and `owner=lead` match `owner:: [[Product Lead]]`, but `owner=An` does not.
- **R3 — Status.** `--status <s>` is an exact match (after `normalizeName`) on the entity's `status::` typed link, or on its frontmatter `status` key.
- **R4 — With a query.** Full-text hits (STORY-004-02) are kept only when their owning entity (`SearchDoc.entityKey`) passes every filter. Ranking and `total` are then computed on the kept hits.
- **R5 — Without a query.** Each entity that passes the filters becomes one `SearchHit`, ordered by path and then line:
  - `score: 0`;
  - `section` is the entity's heading (`""` for a page entity), and `line` is the entity's line;
  - `snippet` is the entity's `summary`, otherwise the first non-empty line of its section text, cut to 160 characters;
  - `sources` come from `hitSources`.

  STORY-004-02's "give a query or a filter" usage error now applies only when neither a query nor a filter is given.
- **R6 — Echo.** The applied filters are returned in `data.filters` (`type`, `where` in the order given, `status`). Filters left unset keep their `EMPTY_FILTERS` defaults.
- **R7 — Errors.** These exit 2 with code `invalid_filter`:
  - a `--where` with no `=`, with an empty key, or with an empty value;
  - an empty `--type` or `--status`.

  For `--where`, the message names the expected `key=value` form and `details` is `{ expected: "key=value", got: "<raw>" }`; for `--type` and `--status`, `details` is `{ expected: "a non-empty value", got: "" }`. Unknown types or keys are not errors: they give 0 results.

### 1.3 Out of Scope
- Matching `--where` values through aliases (`owner=PL` finding `[[Product Lead]]`). STORY-004-04 resolves aliases for `--entity` only.
- `--since` (STORY-004-04) and logging filter searches with no results as misses (STORY-004-05).
- Range or comparison operators (`likelihood>=high`), OR conditions, regular expressions.

### 1.4 Open Questions

- None. Token matching covers the epic's `owner=Product` → `[[Product Lead]]` example without a fuzzy match. Exact status keeps `open` from matching `reopened`.

### 1.5 Risks

- **Risk:** Token matching over-matches common first names (`owner=Product` also matches `[[Product Owner]]`).
- **Mitigation:** This is intended: it gives the agent candidates. A narrower value (`owner=Product Lead`) or `--entity` resolves it.
- **Risk:** STORY-004-04 and STORY-004-05 edit the same option block in `src/commands/search.ts`.
- **Mitigation:** Contract 10 fixes the order (004-03 → 004-04 → 004-05). This story adds its three options and one branch, and no other command code.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Filters with a text query vs filters alone. |
| Interfaces | F | CLI only; the JSON shape is STORY-004-02's. |
| Data | T | `--type` matches page entities and section entities (Outline). |
| Rules | T | AND across filters, token matching, exact status; bad syntax is rejected. |

```gherkin
Feature: Structured search filters

  @rules
  Scenario: Structured filter by owner
    Given risks.md with sections "## Vendor delay" (type:: risk, owner:: [[Product Lead]], status:: open), "## Hiring freeze" (type:: risk, owner:: [[Product Lead]], status:: closed) and "## Data loss" (type:: risk, owner:: [[QA Engineer]], status:: open)
    When I run "wikeeper search --type risk --where owner=Product --status open --json"
    Then data.results holds exactly one hit, with entity "Vendor delay", path "risks.md" and score 0
    And data.filters equals { type: "risk", where: [{ key: "owner", value: "Product" }], status: "open", since: null }

  @paths
  Scenario: Filters narrow a full-text query
    Given the risks above and projects/atlas.md (type: project) mentioning "vendor" under "## Timeline"
    When I run "wikeeper search vendor --type risk --json"
    Then every hit has type "risk"
    And no hit has path "projects/atlas.md"

  @data
  Scenario Outline: Type matches page entities and section entities
    Given <page> holding an entity named "<name>" whose type is set by <source>
    When I run "wikeeper search --type <type> --json"
    Then data.results contains a hit with entity "<name>" and path "<path>"

    Examples:
      | page                         | name          | source              | type     | path                 |
      | projects/atlas.md            | Atlas         | frontmatter type    | project  | projects/atlas.md    |
      | team.md under "## Product Lead"   | Product Lead       | "type:: person"     | person   | team.md              |

  @rules
  Scenario Outline: Where conditions use whole-token matching and combine with AND
    Given the risks above
    When I run "wikeeper search --type risk <where> --json"
    Then data.total is <total>

    Examples:
      | where                                      | total |
      | --where owner=lead                          | 2     |
      | --where owner=An                           | 0     |
      | --where owner=Product --where status=closed    | 1     |

  @data
  Scenario Outline: Error — invalid filter syntax
    When I run "wikeeper search <args> --json"
    Then the command exits with code 2
    And the JSON error has code "invalid_filter" and details.got "<got>"

    Examples:
      | args            | got    |
      | --where owner   | owner  |
      | --where =Product    | =Product   |
      | --where owner=  | owner= |
      | --type ""       |        |
      | --status ""     |        |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch wiki seeded from the Management page templates, run `wikeeper search --type risk --status open` and read the human output.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/search/filters.ts` |
| Related Files | `src/search/engine.ts` (`SearchFilters`, `SearchHit`, `hitSources` — consumed), `src/wiki/parse-page.ts` (`Entity`, `normalizeName` — consumed) |
| Modified Files | `src/commands/search.ts` |
| Test Files | `test/search/filters.test.ts`, `test/search/search-filters.test.ts` |
| New Files Needed | Yes — `src/search/filters.ts` and both test files |

### 3.2 Technical Logic
- `parseWhere(raw)` splits on the first `=` and trims both sides; an empty side throws `WikeeperError(ExitCode.USAGE, "invalid_filter", …)`. Commander collects repeated `--where` values with a reducer (`(v, acc) => [...acc, v]`).
- `matchesFilters(entity, filters)` is pure. It tokenises `normalizeName(x).split(" ")` and keeps tokens as whole words; no stemming.
- Frontmatter candidates come from the page that owns the entity (`corpus.pages`, looked up by path). Only page entities read frontmatter keys.
- In `executeSearch`: when any filter is set, build `Map<entityKey, Entity>` from `corpus.entities`. With a query, drop hits whose `doc.entityKey` fails. Without a query, map the passing entities to hits with `entityHit(entity, page)`.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper search [query...]` | CLI | None | `--type <t>`, `--where <k=v>` (repeatable), `--status <s>`, `--limit`, `--json` | `SearchData` (STORY-004-02), `mode: "query"`, `filters` filled |

Frozen exports of `src/search/filters.ts`:

```ts
export function parseWhere(raw: string): WhereFilter;
export function matchesFilters(entity: Entity, filters: SearchFilters, page: Page): boolean;
export function hasFilters(filters: SearchFilters): boolean;
export function entityHit(entity: Entity, page: Page, root: string, paths: ResolvedPaths): SearchHit;
```

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | `parseWhere` (ok, no `=`, empty key, empty value); token matching (whole token, partial rejected, multi-token); frontmatter list key; exact status |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] STORY-004-02's tests still pass (`data` shape unchanged).
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/exit-codes.ts:4` — `ExitCode.USAGE` (2) for `invalid_filter`.
- **Surface:** `src/commands/search.ts` and `src/search/engine.ts` — created by STORY-004-02 in this sprint (contract 10); this story adds options and a branch.
- **Coverage of this requirement:** partial — the command and schema exist after STORY-004-02; the filters are net-new.

## Prior work

- [[EPIC-004]] (parent). Built on STORY-004-01 and STORY-004-02 in the same epic. No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/commands/search.ts` (STORY-004-02).
- **Why isn't extension / parameterization / config sufficient?** This story *is* the extension: three options and one pure module on the existing command. A full-text query for "Product open" can't tell an owner from a mention, or open from closed. Matching on typed links is what lets structured questions (Q2 "what's at risk, and who's on it?") be answered.

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
