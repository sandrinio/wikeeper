---
story_id: STORY-004-01
parent_epic_ref: EPIC-004
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
ambiguity: 🟢 Low
context_source: EPIC-004 (approved 2026-10-16) · architecture.md §5.3, §8 · SPRINT-02 decomposition brief (contract 1) · verified src/core/paths.ts, package.json (yaml)
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
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
last_synced_body_sha: 7832fb1a1d3586b93826b1c64de8f399f3a5bc469d951f0f25695d1fe1af54d6
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: null
  last_stamp: 2026-10-16T17:47:41Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: ""
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-16T17:41:11Z
---

# STORY-004-01: Page parser
**Complexity:** L2 — one pure module plus a directory loader, built on the existing `yaml` dependency. No predecessors; it pins the page format that the index builder, ingest finish, search, the page templates and the structural tests all read.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent working with the wiki, I want the CLI to read every page the same way — frontmatter, typed links, dated facts, wikilinks and the entities a page holds — so that search, `index.md` and ingest validation agree on what a page says.

### 1.2 Detailed Requirements
- **R1 — Frontmatter.** A page may start (after an optional U+FEFF) with a `---` line and end its frontmatter at the next line that is exactly `---` or `...`. The YAML is parsed with the `yaml` package and never throws. Recognised fields: `type`, `title`, `summary` (strings or null), `aliases`, `sources` (string lists; a single string becomes a one-item list; every `sources` entry goes through `linkTarget()`, so `"[[src-…]]"` and `"[[src-…|label]]"` give the bare `"src-…"` id, and an unquoted `[[src-…]]`, which YAML reads as a string nested in one-item lists, is unwrapped to that string first; human request, 2026-10-16), `updated` (string or null; a YAML date is written back as `YYYY-MM-DD`). Every key, including unknown ones, is kept in `frontmatter.data`. Invalid YAML, a missing closing line, or a field of the wrong shape adds a `PageError` (`frontmatter_yaml` or `frontmatter_field`) and leaves that field at its default (`null` or `[]`).
- **R2 — Title.** `page.title` is `frontmatter.title`, otherwise the first level-1 heading, otherwise the file name without `.md`.
- **R3 — Sections.** ATX headings (`#` to `######`, up to three leading spaces) split the page into sections. Section 0 holds the text before the first heading (`heading: ""`, `level: 0`). Each section records its heading, level, 1-based heading line, last line, parent (the nearest earlier section with a lower level) and its own text. Setext headings are not supported.
- **R4 — Code is not content.** Lines inside fenced code blocks (``` or ~~~ fences) and text inside inline backtick spans are ignored for headings, typed links, facts and wikilinks.
- **R5 — Typed links.** A line `key:: value`, optionally as a list item (`- key:: value`), is a typed link. The key starts with a letter, may contain letters, digits, `_` and `-`, and is stored lower-cased. The value is trimmed; `targets` holds the wikilink targets inside it, in order. A typed link belongs to the section it appears in. A fact line (R6) is never a typed link.
- **R6 — Facts.** A list item of the form `- YYYY-MM-DD · <status> · <text>` is a fact, using ` · ` (U+00B7 with surrounding spaces) as the separator. `<status>` is `decided` or `tentative`. An optional last segment `· contradicts:: [[src-…]], …` marks a contradiction: `contradicts` lists those citation ids and `contradiction` is true. `sources` lists the citation ids in the text part. An unknown status adds a `fact_status` error and an impossible date (e.g. `2026-02-30`) adds a `fact_date` error; neither line becomes a fact.
- **R7 — Wikilinks and citations.** `[[target]]`, `[[target|label]]`, `[[target#heading]]` and `![[target]]` are links. `linkTarget()` keeps the part before `|` or `#`, drops a trailing `.md` and trims. `page.links` keeps every link with its line and section. `page.wikilinks` lists the distinct `linkTarget()` values in order of first appearance, so `[[src-2026-10-16-x|the Q4 report]]` gives `src-2026-10-16-x`; STORY-003-09 checks citations with it. `page.citations` lists the distinct targets matching `CITATION_RE` (`src-YYYY-MM-DD-<slug>`), in order of first appearance.
- **R8 — Entities.** `pageEntities(page)` returns the page entity first, then section entities in document order. The page entity is keyed `<path>`, takes its name from `page.title`, its type from `frontmatter.type` and its aliases from `frontmatter.aliases`. A section entity is a section of level 2 or deeper that directly contains a `type::` or `aliases::` typed link; it is keyed `<path>#L<line>`, takes its name from the heading, its type from the first `type::` value (lower-cased) and its aliases from `aliases::` values, split on commas, with `[[…]]` unwrapped. A typed link or fact belongs to the nearest entity section that encloses it, otherwise to the page entity (`owningEntityKey`).
- **R9 — Loading.** `listPageFiles(pagesDir)` returns the POSIX paths of every `.md` file under `pages/`, relative to it, skipping entries whose name starts with `.`, sorted by code-unit order (not locale). `loadPages(pagesDir)` parses them in that order and returns `[]` when `pages/` does not exist. Pages are plain JSON-serialisable data, so a later story can cache them.
- **R10 — Backlinks.** `buildBacklinks(pages)` maps `normalizeName(target)` to every link with that target: `{ path, section, heading, line, context }`, where `context` is the trimmed source line cut to 160 characters, sorted by path, then line. `normalizeName` applies NFC, trims, collapses whitespace and lower-cases.

### 1.3 Out of Scope
- Resolving a link to the page or section it names, including by alias (STORY-004-04).
- Judging pages: orphans, uncited claims and broken links are lint checks (EPIC-005). The parser only reports what it could not read.
- Writing or rewriting pages.

### 1.4 Open Questions

- None. The format follows architecture.md §8 and the SPRINT-02 decomposition brief (contract 1). STORY-006-03's templates are written against this story.

### 1.5 Risks

- **Risk:** The agent writes fact lines with a plain `-` or `|` instead of ` · `, so facts go missing without anyone noticing.
- **Mitigation:** Only ` · ` is accepted, so the format stays unambiguous. A list item that starts with a date but has no valid status segment is reported as a `fact_status` error, which lint (EPIC-005) can surface. STORY-006-03's templates and WIKI.md show the exact form.
- **Risk:** Five consumers depend on these names, and a late rename would ripple through them.
- **Mitigation:** The exports in §3.3 are frozen as a contract from the start of the sprint.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A page can be one entity, or a page plus section entities (`team.md`, `risks.md`). |
| Interfaces | F | Library module with no CLI surface; commands come in STORY-004-02 onward. |
| Data | T | Fact lines differ by status and contradiction marker; an invalid line is an error rather than a fact. |
| Rules | T | Code blocks are not content; load order and backlink order are deterministic; bad input never throws. |

```gherkin
Feature: Page parser

  Scenario: A project page parses into frontmatter, typed links, facts and citations
    Given pages/projects/atlas.md with frontmatter type "project", title "Atlas", aliases ["Atlas launch"] and sources ["src-2026-10-16-q4-status"]
    And the lines "owner:: [[Ana Kim]]" and "- 2026-10-15 · decided · Launch targets 2026-11-17. [[src-2026-10-16-q4-status]]" under "## Timeline"
    And a fenced code block containing "## Not a heading" and "[[Not a link]]"
    When parsePage reads it as "projects/atlas.md"
    Then the frontmatter has type "project", title "Atlas", aliases ["Atlas launch"] and sources ["src-2026-10-16-q4-status"]
    And the same page with sources written as ["[[src-2026-10-16-q4-status]]"] or as an unquoted [[src-2026-10-16-q4-status]] gives the same sources
    And there is a typed link with key "owner" and targets ["Ana Kim"] in the root section
    And there is one fact dated "2026-10-15" with status "decided", sources ["src-2026-10-16-q4-status"] and contradiction false, in section "Timeline"
    And citations equal ["src-2026-10-16-q4-status"], and wikilinks include "Ana Kim" and "src-2026-10-16-q4-status" once each
    And a link written "[[src-2026-10-16-q4-status|the Q4 report]]" adds no new wikilinks entry
    And no section is named "Not a heading" and no link targets "Not a link"

  @paths
  Scenario: Entities can be whole pages or sections inside a page
    Given pages/team.md with type "team" and sections "## Ana Kim" holding "type:: person" and "aliases:: AK, Ana K." and "## Luka B." holding "type:: person"
    When pageEntities runs on the parsed page
    Then the entities are the page "team.md" followed by "Ana Kim" keyed "team.md#L<line>" and "Luka B."
    And "Ana Kim" has type "person" and aliases ["AK", "Ana K."]
    And the typed links under "## Ana Kim" belong to "Ana Kim", not to the page

  @data
  Scenario Outline: Fact lines are read by status and contradiction marker
    Given a page section containing the line "<line>"
    When parsePage reads it
    Then the page has <facts> fact(s), status "<status>", contradiction <contradiction>, and errors <errors>

    Examples:
      | line                                                                                              | facts | status    | contradiction | errors      |
      | - 2026-10-15 · decided · Owner is Ana. [[src-2026-10-16-a]]                                       | 1     | decided   | false         | none        |
      | - 2026-10-15 · tentative · Launch may slip. [[src-2026-10-16-a]]                                  | 1     | tentative | false         | none        |
      | - 2026-10-15 · decided · Launch 2026-11-17. [[src-2026-10-16-b]] · contradicts:: [[src-2026-10-01-a]] | 1  | decided   | true          | none        |
      | - 2026-10-15 · maybe · Launch may slip.                                                           | 0     | -         | -             | fact_status |
      | - 2026-02-30 · decided · Impossible date.                                                         | 0     | -         | -             | fact_date   |

  @rules
  Scenario: Pages load in a stable order with sorted backlinks
    Given pages "risks.md", "projects/atlas.md", "Team.md" and ".draft.md", where risks.md and projects/atlas.md both link to [[Ana Kim]]
    When loadPages and buildBacklinks run twice
    Then the pages are "Team.md", "projects/atlas.md", "risks.md" in code-unit order both times, without ".draft.md"
    And backlinks for "ana kim" list projects/atlas.md before risks.md, each with its line and a context of at most 160 characters

  @rules
  Scenario: Error — broken frontmatter is reported, never thrown
    Given a page whose frontmatter has "aliases: [unclosed" and no closing "---" line
    When parsePage reads it
    Then it returns a page with title taken from its first level-1 heading or file name
    And errors include "frontmatter_yaml" with a line number
    And aliases is an empty list and the body sections are still parsed
```

### 2.2 Verification Steps (Manual)
- [ ] Run `parsePage` over the page templates from STORY-006-03 once they exist and confirm `errors` is empty for each.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/wiki/parse-page.ts` |
| Related Files | `src/core/paths.ts` (`pagesDir`), `./package.json` (`yaml` dependency, already present) |
| Test Files | `test/wiki/parse-page.test.ts`, `test/wiki/load-pages.test.ts` |
| Fixtures | `test/fixtures/wiki/pages/projects/atlas.md`, `test/fixtures/wiki/pages/team.md`, `test/fixtures/wiki/pages/risks.md`, `test/fixtures/wiki/pages/broken-frontmatter.md` |
| New Files Needed | Yes — every file above except `src/core/paths.ts` and `./package.json` |

### 3.2 Technical Logic
- One pass over the lines (`text.split(/\r?\n/)`), with 1-based line numbers counted over the whole file, frontmatter included. A fence flag toggles on lines matching `^ {0,3}(```|~~~)`; inline code spans are blanked (`/`[^`]*`/g` → spaces of the same length) before links and typed links are matched, so columns stay put.
- Order of matching per line: heading → fact (`^\s*[-*+]\s+(\d{4}-\d{2}-\d{2})\s+·\s+(\S+)\s+·\s+(.+)$`) → typed link (`^\s*(?:[-*+]\s+)?([A-Za-z][A-Za-z0-9_-]*)::\s*(.*\S)\s*$`) → wikilinks (`/!?\[\[([^\[\]\n]+?)\]\]/g`, run on every non-code line, fact and typed-link lines included).
- Date check: `new Date(Date.UTC(y, m - 1, d))` must give back the same y, m and d.
- `yaml.parseDocument(src, { prettyErrors: false })`: `doc.errors[0]` gives the `frontmatter_yaml` error, with its line offset by the opening `---`. Values are coerced as in R1; nothing is thrown.
- Entity sections: a section is marked as an entity when it holds its own `type::` or `aliases::` link and its level is at least 2. `owningEntityKey(page, sectionIndex)` walks `parent` links up to the first entity section, otherwise it returns the page key.
- `listPageFiles` uses `readdir(..., { withFileTypes: true })` recursively, converts to POSIX paths and sorts with `(a, b) => (a < b ? -1 : a > b ? 1 : 0)`. A missing directory (`ENOENT`) gives `[]`; any other error is rethrown.

### 3.3 API Contract (if applicable)

Frozen exports of `src/wiki/parse-page.ts` (contract 1, SPRINT-02 decomposition brief):

```ts
export const CITATION_RE: RegExp; // /^src-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/
export interface PageFrontmatter { type: string | null; title: string | null; summary: string | null; aliases: string[]; sources: string[]; updated: string | null; data: Record<string, unknown>; }
export interface PageSection { index: number; heading: string; level: number; line: number; endLine: number; parent: number | null; entity: boolean; text: string; }
export interface TypedLink { key: string; value: string; targets: string[]; line: number; section: number; }
export type FactStatus = "decided" | "tentative";
export interface Fact { date: string; status: FactStatus; text: string; sources: string[]; contradicts: string[]; contradiction: boolean; line: number; section: number; }
export interface WikiLink { target: string; line: number; section: number; }
export interface PageError { line: number | null; code: "frontmatter_yaml" | "frontmatter_field" | "fact_status" | "fact_date"; message: string; }
export interface Page { path: string; title: string; frontmatter: PageFrontmatter; sections: PageSection[]; typedLinks: TypedLink[]; facts: Fact[]; links: WikiLink[]; wikilinks: string[]; citations: string[]; errors: PageError[]; }
export interface Entity { key: string; kind: "page" | "section"; name: string; type: string | null; aliases: string[]; path: string; section: number; line: number; summary: string | null; typedLinks: TypedLink[]; facts: Fact[]; }
export interface Backlink { path: string; section: number; heading: string; line: number; context: string; }

export function parsePage(text: string, relPath: string): Page;
export function pageEntities(page: Page): Entity[];
export function owningEntityKey(page: Page, section: number): string;
export function linkTarget(raw: string): string;
export function normalizeName(name: string): string;
export function listPageFiles(pagesDir: string): Promise<string[]>;
export function loadPages(pagesDir: string): Promise<Page[]>;
export function buildBacklinks(pages: readonly Page[]): Map<string, Backlink[]>;
```

Consumers in this sprint: STORY-003-07 (`buildIndex` reads the typed frontmatter fields `type`, `title`, `summary`, `aliases`, `sources`, `updated`), STORY-003-09 (`wikilinks` for the citation check; `facts[].contradiction` and `facts[].sources` for the contradiction count), STORY-004-02…06, STORY-006-03, STORY-006-06.

`Entity.summary` is `frontmatter.summary` for a page entity and the first `summary::` value for a section entity (otherwise `null`). Section 0 always exists, so `sections.length ≥ 1`.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 9 | `linkTarget` forms; `sources` entries in wikilink form (quoted, unquoted flow list, block list); `normalizeName`; date validity; inline-code blanking; typed link vs fact precedence; section parent chain; YAML date coercion of `updated`; `owningEntityKey` with nested headings |
| Integration tests | 0 | Temp directories only; no external services. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Exports match §3.3 exactly (names and types).
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/paths.ts:48` — `pagesDir` resolution (`<content_dir>/pages`), which `loadPages` takes as input.
- **Surface:** `./package.json` — `yaml` is already a runtime dependency (used by `src/core/config.ts`), so no new dependency is needed.
- **Coverage of this requirement:** none — net-new parser.

## Prior work

- [[EPIC-004]] (parent). Consumers in the same sprint: [[EPIC-003]] (index builder and `ingest finish`), [[EPIC-006]] (page templates, structural tests). No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** none — net-new abstraction required. `src/core/config.ts` parses YAML but not markdown.
- **Why isn't extension / parameterization / config sufficient?** Search filters, alias resolution, `--since`, `index.md` and finish's citation check all need the same reading of a page. Per-consumer regexes would drift apart on edge cases (code blocks, inline code, section ownership). One pure parser with a frozen output shape is the smallest thing that keeps them consistent.

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
