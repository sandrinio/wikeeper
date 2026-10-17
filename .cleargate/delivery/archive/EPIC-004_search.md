---
epic_id: EPIC-004
parent_ref: INITIATIVE-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Completed
approved: true
ambiguity: 🟢 Low
context_source: architecture.md v0.4 §8 knowledge model, §10 (D-15, D-29) · INITIATIVE-001
owner: Sandro Suladze
target_date: null
created_at: 2026-10-16T13:15:00Z
updated_at: 2026-10-16T13:15:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 3
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:22:47Z
  transition: ready-for-decomposition
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 61dcf461849a4872ee7ad1a2106fbfe1d742b4d48c6b68c72dfc7005b2aa6cf9
stamp_error: no ledger rows for work_item_id EPIC-004
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:11:30Z
  sessions: []
---

# EPIC-004: Search (`wiki_search`)

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Implement `wikeeper search` (wiki_search): ranked full-text search over pages, structured filters over frontmatter and typed links, alias resolution, changes since a date, JSON output, and logging of queries that found nothing.</objective>
  <architecture_rules>
    <rule>CLI only; no MCP tool (D-29).</rule>
    <rule>Deterministic: the same wiki and query always return the same results in the same order.</rule>
    <rule>No embeddings or network; full-text plus structure plus aliases (architecture.md §8).</rule>
    <rule>The page parser is shared with lint (EPIC-005) and index building (EPIC-003).</rule>
  </architecture_rules>
  <target_files>
    <file path="src/wiki/parse-page.ts" action="create" />
    <file path="src/search/engine.ts" action="create" />
    <file path="src/search/filters.ts" action="create" />
    <file path="src/search/aliases.ts" action="create" />
    <file path="src/search/since.ts" action="create" />
    <file path="src/search/misses.ts" action="create" />
    <file path="src/commands/search.ts" action="create" />
    <file path="package.json" action="modify" />
  </target_files>
</agent_context>
```

## 1. Problem & Value

**Why are we doing this?**
The agent uses search twice: at triage, to route facts to the right pages before extracting, and to answer the user's questions. Without it the agent has to read whole pages, which costs context and misses aliases. Misses are also the signal that drives rule improvements.

**Success Metrics (North Star):**
- On a 500-page generated fixture wiki, search p95 < 500 ms, measured by a vitest bench in `test/`.
- Alias queries ("PL", "Product L.") return the same entity page as the canonical name in fixture tests.

## 2. Scope Boundaries

**✅ IN-SCOPE (Build This)**
- [ ] Page parser: frontmatter (`type`, `title`, `summary`, `aliases`, `sources`, `updated`), typed links (`key:: [[target]]`), dated fact lines, wikilinks and backlinks.
- [ ] Ranked full-text search with snippets and the section heading each hit is under.
- [ ] Structured filters: `--type`, `--where key=value` (frontmatter and typed links), `--status`.
- [ ] `--entity <name|alias>`: resolve the alias and return the page plus its backlinks.
- [ ] `--since <date>`: facts and pages changed since a date, from fact dates and log entries.
- [ ] Miss logging: zero-result queries are written as `miss` events to `log/`; `search --misses` lists them.
- [ ] Optional on-disk cache keyed by file hashes, rebuilt automatically when stale.
- [ ] `--json` output schema.

**❌ OUT-OF-SCOPE (Do NOT Build This)**
- Vector or semantic search; an MCP server (D-29); search across multiple wikis.
- Turning misses into rule proposals (EPIC-005).

## 3. The Reality Check (Context)

| Constraint Type | Limit / Rule |
|---|---|
| Performance | p95 < 500 ms on 500 pages, measured by `vitest bench` against a generated fixture. |
| Determinism | Ties broken by path, so output order is stable across runs and platforms. |
| Sequencing | After EPIC-001; reads the log format defined in EPIC-003. |

## Existing Surfaces

- **Surface:** `src/program.ts` — command registry for `search`.
- **Coverage of this epic's scope:** none — net-new search code.

## Prior work

- [[INITIATIVE-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this epic:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** A plain grep finds strings but not entities: it can't resolve aliases, filter by owner or status, rank results, or answer "what changed since Monday". A small full-text library (e.g. minisearch) plus a page parser covers all of that without embeddings.

## 4. Technical Grounding (The "Shadow Spec")

**Affected Files:**
- `src/wiki/parse-page.ts` — shared page parser.
- `src/search/{engine,filters,aliases,since,misses}.ts` — search features.
- `src/commands/search.ts` — command surface and JSON output.
- `package.json` — full-text search dependency.

**Data Changes:**
- `miss` events in `log/` (`{ query, filters, at }`).
- Optional `.wiki/.cache/search.json` (gitignored).

## 5. Acceptance Criteria

```gherkin
Feature: Search

  Scenario: Full-text search returns ranked snippets
    Given pages mentioning "vendor delay"
    When I run "wikeeper search 'vendor delay' --json"
    Then results are ranked and each has page, section, snippet and sources

  Scenario: Structured filter by owner
    Given risks with "owner:: [[Product Lead]]" and other owners
    When I run "wikeeper search --type risk --where owner=Product --status open --json"
    Then only open risks owned by Product Lead are returned

  Scenario: Alias resolves to the entity
    Given team.md listing aliases "PL" and "Product L." for Product Lead
    When I run "wikeeper search --entity PL --json"
    Then the Product Lead entry and its backlinks are returned

  Scenario: A miss is logged
    Given no page mentions "budget burn"
    When I run "wikeeper search 'budget burn'"
    Then a miss event is written to log/
    And "wikeeper search --misses" lists it

  Scenario: Error — invalid filter syntax
    When I run "wikeeper search --where owner --json"
    Then the command exits with code 2
    And the JSON output shows the expected "key=value" form
```

## 6. AI Interrogation Loop (Human Input Required)

- None. All decisions are recorded in architecture.md (D-15, D-29) and were accepted on 2026-10-16.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Coding Agent):
- [x] `approved: true` is set in the YAML frontmatter.
- [x] The `<agent_context>` block is complete and validated.
- [x] §4 Technical Grounding contains 100% real, verified file paths. (Existing paths verified; planned paths for new files accepted by the human at Gate 1, 2026-10-16.)
- [x] §6 AI Interrogation Loop is empty (all human answers integrated into the spec).
- [x] 0 "TBDs" exist in the document.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered.
