---
story_id: STORY-004-02
parent_epic_ref: EPIC-004
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-004 (approved 2026-10-16) · architecture.md §7.4, §8, D-15, D-29 · CR-001 (search allow rule) · SPRINT-02 decomposition brief (contract 10) · verified src/program.ts, src/core/output.ts, src/agents/enforce/claude.ts, src/agents/enforce/codex.ts · minisearch 7.2.0 checked on npm 2026-10-16
actor: AI coding agent
complexity_label: L3
parallel_eligible: y
dep_predecessors:
  - STORY-004-01
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
  last_gate_check: 2026-10-16T19:24:02Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 551887af0dab3a4591081490b2f80d744b591d96a6da44ac1b06fa6dff8dbc66
stamp_error: no ledger rows for work_item_id STORY-004-02
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:48:54Z
  sessions: []
---

# STORY-004-02: `wikeeper search` — ranked full-text, JSON schema, performance budget
**Complexity:** L3 — a new command, a new runtime dependency, a JSON schema that three later stories extend, a performance budget with a generated 500-page fixture, and the CR-001 allow rule in two enforce writers. Depends on STORY-004-01.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent triaging a source or answering a question, I want to query the wiki with one command that returns ranked hits — with page, section, snippet and the sources behind them — so that I can find what the wiki already knows without reading whole pages.

### 1.2 Detailed Requirements
- **R1 — Command.** `wikeeper search [query...] [--limit <n>] [--json]`, registered in `src/program.ts` as `searchCommand`. The query words are joined with single spaces. `--limit` is an integer from 1 to 100 and defaults to 10.
- **R2 — Corpus.** `loadSearchCorpus(paths)` loads pages with `loadPages(paths.pagesDir)`, collects entities with `pageEntities`, and indexes one document per section that has a heading or non-empty text. Each document records its page path, section index, heading, heading line, page title, owning entity key (`owningEntityKey`), section text, and the owning entity's aliases.
- **R3 — Ranking.** MiniSearch is configured with fields `title`, `heading`, `aliases` and `text`, boosts `heading: 2`, `aliases: 2`, `title: 1.5`, `text: 1`, `combineWith: "AND"`, prefix matching for terms of 3 or more characters, and fuzzy matching (0.2) for terms of 5 or more. Hits are sorted by score (descending), then page path (code-unit order), then heading line. `total` counts every hit; `results` holds the first `--limit`.
- **R4 — Hit shape.** Each hit has: `path` (relative to `pages/`), `file` (relative to the repo root, POSIX), `title`, `entity` and `type` (of the owning entity), `section` (heading, `""` before the first heading), `line`, `snippet`, `score` (rounded to 3 decimals) and `sources`.
  - `snippet` is the first line of the section that contains a matched term: up to 160 characters around the match, cut at whitespace, collapsed, with `…` where text was cut. If no line contains a matched term (the match was in the title or heading), the snippet is the first 160 characters of the section text.
  - `sources` lists the citation ids inside the section, in order; if there are none, it falls back to the page's frontmatter `sources`.
- **R5 — JSON schema.** `--json` emits the standard envelope (`emitResult`) with `command: "search"` and `data: SearchData` (§3.3). This story fills `mode: "query"`, `query`, `total` and `results`. `filters` keeps its empty defaults, and `entity_query`, `entity`, `changes` and `misses` are `null`. STORY-004-03, 004-04 and 004-05 fill those later without changing the shape.
- **R6 — Human output.** Without `--json`, the command prints a header line `N results for "<query>"`, then one block per hit: `<n>. <path> › <section>`, the snippet indented below, and `sources: …` when there are any. With no hits it prints `no results for "<query>"`.
- **R7 — Errors.**
  - No query (and, until STORY-004-03, no filter) → exit 2 with code `usage`, message "give a query or a filter".
  - An invalid `--limit` → exit 2 with code `usage`.
  - Running outside an initialised wiki (no `.wiki/config.yml`) → exit 1 with code `not_initialised`.
  - A missing `pages/` directory is not an error: it gives 0 results.
- **R8 — Performance (EPIC-004 §3).** On a generated 500-page wiki, `executeSearch` runs in-process from page loading to results with the cache off (`useCache: false`). p95 must be under 500 ms over 30 timed runs after one warm-up run, asserted in `test/search/search.perf.test.ts`. `test/bench/search.bench.ts` reports the same measurement under `vitest bench`.
- **R9 — Allow rule (CR-001).** With enforce on, the enforce writers add the `search` allow rule, so a triage search does not prompt the user:
  - **Claude** `permissions.allow`: `Bash(npx wikeeper search *)` and `Bash(wikeeper search *)`.
  - **Codex** `.codex/rules/wikeeper.rules`: `prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")` and `prefix_rule(pattern=["wikeeper","search"], decision="allow")`.

  The rule is added in all three permission modes (`ai`, `ask`, `whitelist`; human decision 2026-10-16, §1.4). `update` adds it to existing enforced installs, and `remove` takes it out like every other tagged entry. Antigravity is unchanged, because it has no project rule file.
  - **SETUP.md preview.** This story also adds the search rules to the step-4 permission preview table in `templates/system/SETUP.md` (STORY-006-02 R5), whose test compares the table with `CLAUDE_ENFORCE.items` and `CODEX_ENFORCE` at run time. STORY-006-02 merges in wave 1, before this story; this story builds from C10, which does not hold 006-02's SETUP.md, so the table edit is made after merging `sprint/S-02` into the story branch and before QA-Verify. (Human request, 2026-10-16.)
- **R10 — Dependency.** Add `minisearch` `^7.2.0` (MIT, no dependencies, 0.83 MB unpacked, checked on npm 2026-10-16) to `dependencies`. Import it with a dynamic `import()` inside the engine, so other commands don't load it at start-up.

### 1.3 Out of Scope
- `--type`, `--where`, `--status` (STORY-004-03); `--entity`, `--since` (STORY-004-04); miss logging and `--misses` (STORY-004-05); the on-disk cache (STORY-004-06).
- Vector or semantic search, an MCP tool (D-29), searching several wikis.

### 1.4 Open Questions

- **Question:** In which permission modes should `wikeeper search` be auto-allowed? (CR-001 says search's allow rule is added by the story that builds it, and CR-001 itself only speaks about `ai` mode.)
- **Recommended:** In all three modes (`ai`, `ask`, `whitelist`). Search only reads pages; its one write is a `miss` event in `log/` (STORY-004-05). The permission modes govern what gets *ingested*, not what may be read. Without the rule, every triage search in `ask` or `whitelist` mode prompts the user (architecture.md §7.4 step 1 runs several searches per source), which trains users to click "allow" without reading.
- **Human decision (2026-10-16):** Auto-allow `wikeeper search` in all three permission modes (`ai`, `ask`, `whitelist`).

### 1.5 Risks

- **Risk:** The 500 ms budget is flaky on the slower Windows CI runner.
- **Mitigation:** The measurement is in-process (no process spawn), takes p95 over 30 runs after a warm-up, and the fixture is fixed by a seed. A local estimate (about 1 MB of markdown, about 4,000 sections) is well under the budget. If CI shows otherwise, STORY-004-06's cache is the lever, not a looser budget.
- **Risk:** Later stories add options and branches to `src/commands/search.ts`, and a reshaped `SearchData` breaks them.
- **Mitigation:** The whole schema in §3.3, including fields this story leaves `null`, is frozen as contract 10. Later stories only fill fields.
- **Risk:** The CR-001 change to `claude.ts` and `codex.ts` lands in SPRINT-01, so the lines this story edits move.
- **Mitigation:** SPRINT-02 starts from `main` after SPRINT-01 closes; the rule is added next to the CR-001 rules, by identity.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One successful path (query → ranked hits). Filter, entity and miss paths belong to later stories. |
| Interfaces | T | `--json` envelope vs human text; agent settings files expose the allow rule. |
| Data | T | Allow rule per permission mode and agent (Outline); error inputs (Outline). |
| Rules | T | Deterministic tie order; performance budget. |

```gherkin
Feature: wikeeper search — ranked full-text

  @interfaces
  Scenario: Full-text search returns ranked snippets
    Given an initialised wiki whose pages mention "vendor delay" in risks.md under "## Vendor delay" citing [[src-2026-10-16-q4-status]] and in projects/atlas.md under "## Timeline"
    When I run "wikeeper search 'vendor delay' --json"
    Then the envelope has command "search" and data.mode "query"
    And data.results are sorted by score and each has path, file, section, line, snippet, score and sources
    And the risks.md hit has section "Vendor delay" and sources ["src-2026-10-16-q4-status"]
    And without --json the output starts with a 'N results for "vendor delay"' line, and the hits print as "1. risks.md › Vendor delay" lines with the snippet below
    And "wikeeper search zebra-crossing" prints 'no results for "zebra-crossing"' and exits 0

  @rules
  Scenario: Ties are broken by path
    Given pages "b.md" and "a/z.md" with identical sections containing "quarterly review"
    When I run "wikeeper search 'quarterly review' --json" twice
    Then both runs return "a/z.md" before "b.md" with equal scores
    And the two JSON outputs are byte-identical

  @rules
  Scenario: Search stays within the performance budget
    Given a generated wiki of 500 pages with seed 1
    When executeSearch runs 30 times for "vendor delay" with the cache off, after one warm-up run
    Then the p95 duration is under 500 ms

  @data @interfaces
  Scenario Outline: Enforce installs the search allow rule
    Given an empty git repository and ingest.permission "<mode>"
    When I run "wikeeper init --agents claude,codex --enforce --json"
    Then .claude/settings.json permissions.allow contains "Bash(npx wikeeper search *)" and "Bash(wikeeper search *)"
    And .codex/rules/wikeeper.rules contains 'prefix_rule(pattern=["wikeeper","search"], decision="allow")'
    And after "wikeeper remove" neither file contains a search rule

    Examples:
      | mode      |
      | ai        |
      | ask       |
      | whitelist |

  @data
  Scenario Outline: Error — invalid invocations are rejected
    Given <setup>
    When I run "wikeeper <args> --json"
    Then the command exits with code <exit> and error code "<code>"

    Examples:
      | setup                     | args                 | exit | code            |
      | an initialised wiki       | search               | 2    | usage           |
      | an initialised wiki       | search atlas --limit 0 | 2  | usage           |
      | a repository without .wiki | search atlas        | 1    | not_initialised |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch wiki with a few pages, run `wikeeper search <term>` and check the human output reads well at 80 columns.
- [ ] Run `npx vitest bench --run test/bench/search.bench.ts` and note the p95 in the dev report.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/commands/search.ts` |
| Related Files | `src/search/engine.ts`, `src/wiki/parse-page.ts` (consumed, STORY-004-01) |
| Modified Files | `src/program.ts`, `src/agents/enforce/claude.ts`, `src/agents/enforce/codex.ts`, `templates/system/SETUP.md` (preview table rows only, after STORY-006-02 merges), `./package.json`, `./package-lock.json` |
| Test Files | `test/search/engine.test.ts`, `test/search/search-command.test.ts`, `test/search/search.perf.test.ts`, `test/bench/search.bench.ts`, `test/agents/enforce.test.ts` |
| Fixtures | `test/fixtures/search/generate-wiki.ts` (seeded 500-page generator) |
| New Files Needed | Yes — `src/commands/search.ts`, `src/search/engine.ts`, the test files except `test/agents/enforce.test.ts`, and the fixture generator |

### 3.2 Technical Logic
- `executeSearch(root, req, deps)` does `loadConfig(root)` → `resolvePaths` → checks `paths.configFile` exists (else `not_initialised`) → `loadSearchCorpus(paths, { useCache: deps.useCache })` → `index.query(req.query)` → limit → `SearchData`. The command action only parses options, builds a `SearchRequest` and calls `emitResult`; that keeps the perf test and later stories in-process.
- `createSearchIndex(docs)` does `const { default: MiniSearch } = await import("minisearch")`, then `new MiniSearch(MINISEARCH_OPTIONS)` and `addAll(docs)`. `query()` calls `search(text, { combineWith: "AND", prefix, fuzzy, boost })` and maps each result to a `RankedHit` with the matched `terms`. Sorting is done here, so every consumer sees the same order.
- Score rounding is applied only to the output (`Math.round(score * 1000) / 1000`); sorting uses the raw score.
- `test/fixtures/search/generate-wiki.ts` uses mulberry32 seeded PRNG + a fixed vocabulary to write 500 pages in the STORY-004-01 format (frontmatter, 5–10 sections, typed links, facts with citations); the same seed yields byte-identical files.
- Perf test: `performance.now()` around each `executeSearch` call; p95 = sorted durations at index `Math.ceil(0.95 * n) - 1`.
- Enforce: add the search rules to `CLAUDE_ENFORCE.items` and the Codex `rules` spec as separate `EnforceItem`s with their own identities (`permissions.allow[Bash(wikeeper search *)]`, the rule line), so `update`'s identity diff adds them and `remove` strips them.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper search [query...]` | CLI | None | `--limit <n>`, `--json` | envelope `{ ok, command: "search", data: SearchData, warnings }` |

Frozen exports of `src/search/engine.ts` (contract 10):

```ts
export interface WhereFilter { key: string; value: string; }
export interface SearchFilters { type: string | null; where: WhereFilter[]; status: string | null; since: string | null; }
export interface SearchHit { path: string; file: string; title: string; entity: string; type: string | null; section: string; line: number; snippet: string; score: number; sources: string[]; }
export interface FactView { path: string; entity: string; section: string; line: number; date: string; status: "decided" | "tentative"; text: string; sources: string[]; contradiction: boolean; }
export interface EntityMatch { key: string; name: string; type: string | null; path: string; file: string; section: string; line: number; aliases: string[]; matched: "name" | "alias"; matched_alias: string | null; summary: string | null; typed_links: Array<{ key: string; value: string; targets: string[] }>; facts: FactView[]; backlinks: Array<{ path: string; section: string; line: number; context: string }>; also_matches: Array<{ name: string; path: string; section: string; line: number }>; }
export interface SinceChanges { since: string; facts: FactView[]; pages: Array<{ path: string; change: "created" | "updated" | "deleted"; source_id: string | null; at: string }>; }
export interface MissSummary { query: string | null; filters: SearchFilters; entity: string | null; count: number; first_at: string; last_at: string; }
export interface SearchData { mode: "query" | "entity" | "misses"; query: string | null; filters: SearchFilters; entity_query: string | null; total: number; results: SearchHit[]; entity: EntityMatch | null; changes: SinceChanges | null; misses: MissSummary[] | null; }
export interface SearchRequest { query: string | null; limit: number; filters: SearchFilters; entity: string | null; misses: boolean; }
export interface SearchDeps { now?: () => Date; useCache?: boolean; }
export const EMPTY_FILTERS: Readonly<SearchFilters>;
export interface SearchDoc { id: number; path: string; section: number; heading: string; line: number; title: string; entityKey: string; aliases: string; text: string; }
export interface RankedHit { doc: SearchDoc; score: number; terms: string[]; }
export interface SearchIndex { readonly docs: readonly SearchDoc[]; query(text: string): RankedHit[]; }
export interface SearchCorpus { pages: Page[]; entities: Entity[]; index: SearchIndex; warnings: string[]; }
export function buildDocs(pages: readonly Page[]): SearchDoc[];
export function createSearchIndex(docs: readonly SearchDoc[]): Promise<SearchIndex>;
export function loadSearchCorpus(paths: ResolvedPaths, opts?: { useCache?: boolean; onRebuild?: () => void }): Promise<SearchCorpus>;
export function makeSnippet(text: string, terms: readonly string[]): string;
export function hitSources(page: Page, section: number): string[];
```

Frozen exports of `src/commands/search.ts`:

```ts
export function executeSearch(root: string, req: SearchRequest, deps?: SearchDeps): Promise<SearchData>;
export function createSearchCommand(deps?: SearchDeps): CommandModule;
export const searchCommand: CommandModule;
```

`useCache` and `onRebuild` are accepted and ignored, and `SearchCorpus.warnings` stays `[]`, until STORY-004-06. `executeSearch` passes `warnings` to the envelope.

## Task Breakdown

- [ ] Add `minisearch` `^7.2.0` to `dependencies` and update the lockfile -> R10
- [ ] Implement `buildDocs` (one document per section with heading or text, owning entity key and aliases) -> R2
- [ ] Implement `createSearchIndex` with the pinned options, dynamic import and deterministic sort -> R3
- [ ] Implement `makeSnippet` and `hitSources` with unit tests -> R4
- [ ] Implement `loadSearchCorpus` and `executeSearch` (not-initialised check, limit, `SearchData` with frozen defaults) -> R2, R5, R7
- [ ] Implement the command (option parsing, usage errors, human output) and register it in `src/program.ts` -> R1, R6, R7
- [ ] Write the seeded fixture generator, the perf test (p95 assertion) and the bench file -> R8
- [ ] Add the search allow rules to the Claude and Codex enforce writers in all three modes; extend `test/agents/enforce.test.ts` -> R9
- [ ] After merging `sprint/S-02` (with STORY-006-02), add the search rules to the SETUP.md preview table; `test/templates/setup.test.ts` passes on the merged tree -> R9
- [ ] Write one test per Gherkin scenario in §2.1

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | `makeSnippet` (match mid-line, at start, no line match); `hitSources` fallback; doc building skips empty sections; sort tie-break |
| Integration tests | 0 | Temp directories only; no external services. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |
| Performance test | 1 | `test/search/search.perf.test.ts`: p95 of 30 in-process `executeSearch` runs (cache off, after one warm-up) on the seed-1 500-page fixture < 500 ms; baseline reported by `test/bench/search.bench.ts`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Exports match §3.3 exactly (names and types).
- [ ] `wikeeper --help` lists `search`, and `npm pack --dry-run` shows no extra files.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts:30` — `defaultCommands` registry where `searchCommand` is added.
- **Surface:** `src/core/output.ts:90` — `emitResult` envelope used for `--json`.
- **Surface:** `src/agents/enforce/claude.ts:30` — permission rules per mode, where the search allow rule is added.
- **Surface:** `src/agents/enforce/codex.ts:3` — Codex rule lines per mode.
- **Surface:** `src/core/paths.ts:48` — `pagesDir`.
- **Coverage of this requirement:** partial — registration, output and enforce plumbing exist; the search engine and command are net-new.

## Prior work

- [[EPIC-004]] (parent), [[CR-001]] (narrowed `ai` allow rules; search's rule added here). The page format comes from STORY-004-01 in the same epic. No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** `grep` finds strings, but it can't rank them, can't say which section a hit sits under, and can't return the sources behind it. It also gives later stories nothing to attach filters, aliases or misses to. MiniSearch is the smallest full-text engine with field boosts and prefix/fuzzy matching, it has no dependencies, and it serialises its index for STORY-004-06's cache.

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

Open question §1.4 (allow-rule modes) decided by the human on 2026-10-16: all three modes, as the Outline's Examples assume.
