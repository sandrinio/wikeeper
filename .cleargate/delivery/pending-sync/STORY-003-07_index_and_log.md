---
story_id: STORY-003-07
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-003 (approved 2026-10-16) · architecture.md §4, §7.3, §8, D-28 · SPRINT-02 decomposition brief contracts 1 and 7 · verified src/core/paths.ts, src/core/gitignore.ts, src/program.ts
actor: AI coding agent
complexity_label: L2
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
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:24:01Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-003-07
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:47:36Z
  sessions: []
---

# STORY-003-07: `index.md` builder, `log/` events, `wikeeper index rebuild`
**Complexity:** L2 — two library modules (event log, index builder) and one small command. Consumes the page parser from STORY-004-01.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent, I want every wiki event recorded as its own file and the index rebuilt deterministically from page frontmatter, so that two people ingesting on separate branches can merge without log or index conflicts, and anyone can regenerate both after a merge.

### 1.2 Detailed Requirements
- **R1 — One file per event.** `writeLogEvent(paths, event)` creates `log/<stamp>-<slug>.md` in `paths.logDir` (created if missing). `<stamp>` is the event's `at` in UTC as `YYYYMMDDTHHmmssSSSZ` (no `:`, valid on Windows); `<slug>` is the event's `source_id` when it has one, otherwise its `type`. When the name exists, `-2`, `-3`, … is appended before `.md`. The file is created exclusively (never overwritten), with YAML frontmatter holding every event field and a one-line human summary as the body. It returns the path relative to `paths.root`, POSIX-separated.
- **R2 — Event types (frozen).** `ingest`, `abort`, `miss` and `rule-proposal`, with the fields in §3.3. `at` is always supplied by the caller (ISO-8601 UTC), so tests and callers control time.
- **R3 — Reading events.** `readLogEvents(paths, filter?)` parses every `log/*.md` file, keeps those with valid frontmatter and a known `type`, and returns them sorted by `at`, then by file name. Files without frontmatter, with unparseable YAML or with an unknown `type` are not returned as events; they are listed in `skipped` with a reason. Extra frontmatter fields added by hand are kept. The filter narrows by `type`, `sourceId` and `since` (`since` is a date `YYYY-MM-DD`, meaning 00:00 UTC that day, or a full ISO timestamp; events with `at >= since` are kept). A missing `log/` directory yields no events.
- **R4 — Generated log view.** `regenerateLogView(paths)` writes `<contentDir>/log.md` (already gitignored by `src/core/gitignore.ts:79`): a generated-file note, then one line per event, newest first, e.g. `- 2026-10-16 17:45 UTC · ingest · src-2026-10-16-q4-status · created 1 · updated 3 · deleted 0`. The content depends only on the events, so it is identical across runs and platforms.
- **R5 — Deterministic index.** `buildIndex(pages)` returns `index.md` text built only from page frontmatter: a `# Wiki index` heading and a generated-file note; then one `## <type>` section per frontmatter `type`, in the order `person`, `team`, `project`, `risk`, `decision`, `glossary`, `source`, then other types alphabetically, then `untyped`; within a section, pages sorted by path (code-point order); one line per page, `- [<title>](pages/<path>) — <summary>` (title falls back to the file name without `.md`; ` — <summary>` is omitted when there is no summary; whitespace in the summary is collapsed; `[` and `]` in the title are escaped; path segments are URI-encoded). No timestamps, LF line endings, trailing newline. With no pages the text is `# Wiki index\n\n_No pages yet._\n`.
- **R6 — Writing the index.** `writeIndex(paths)` loads pages with `loadPages(paths.pagesDir)` (STORY-004-01), builds the index and writes `paths.indexFile` only when the bytes differ. Pages with parse errors are still listed; their errors are returned so callers can warn.
- **R7 — `wikeeper index rebuild [--json]`.** Regenerates `index.md` and `log.md` — the recovery step after a git merge (D-28). Output data: `{ index: { file, pages, changed }, log: { file, events }, skipped: [{ file, reason }] }`; skipped log files and page parse errors are reported as warnings. It refuses with exit 1 and code `not_initialised` when `.wiki/config.yml` does not exist, and with exit 1 and code `ingest_in_progress` while `paths.lockFile` exists (an open write phase is validated against the index by `ingest finish`; changing it mid-phase would fail that check).

### 1.3 Out of Scope
- Calling these functions from `ingest finish`, `ingest abort` or `search` (STORY-003-08, 003-09, 004-04, 004-05).
- The page format and parser (STORY-004-01).
- `rule-proposal` event semantics and `rules record` (EPIC-005, SPRINT-03); this story only reserves the type.
- Replacing the placeholder `templates/index.md` that `init` copies (`src/commands/init.ts:193`); the first `finish` or `index rebuild` overwrites it.

### 1.4 Open Questions

- None — the design is fixed by architecture.md §4 and D-28, and the event fields by the SPRINT-02 decomposition brief (contract 7).

### 1.5 Risks

- **Risk:** Two events in the same millisecond, or a merge bringing a same-named file from another branch, collide on the file name.
- **Mitigation:** Exclusive create with a numeric suffix; a merge of two different files with the same name is a git add/add conflict that the user resolves, and `readLogEvents` tolerates either result.
- **Risk:** The page parser contract (STORY-004-01) changes shape.
- **Mitigation:** This story reads only `Page.path`, `Page.frontmatter.type/title/summary` and `Page.errors`, all named in contract 1.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Rebuilding after a merge is a second successful way to produce the index and log view, besides building from a clean tree. |
| Interfaces | F | Only the CLI `index rebuild` is user-facing; the library functions are internal and covered by unit tests. |
| Data | T | File names and frontmatter differ per event type. |
| Rules | T | Index determinism; tolerant reading; rebuild refused while a write phase is open. |

```gherkin
Feature: index.md builder, log/ events and index rebuild

  @rules
  Scenario: The index is deterministic and built from frontmatter only
    Given pages "projects/atlas.md" (type project, title "Atlas", summary "Launch platform"), "team.md" (type team) and "notes/loose.md" (no type), written in a random order
    When buildIndex runs twice on loadPages results
    Then both outputs are byte-identical
    And the sections appear in the order "team", "project", "untyped"
    And the project line is "- [Atlas](pages/projects/atlas.md) — Launch platform"
    And the output contains no date or time

  @data
  Scenario Outline: Each event type is written to its own file
    Given an initialised wiki
    When writeLogEvent writes a "<type>" event at "2026-10-16T17:45:01.123Z"<extra>
    Then a file "log/20261016T174501123Z-<slug>.md" exists whose frontmatter has type "<type>" and at "2026-10-16T17:45:01.123Z"
    And writing the same event again creates "log/20261016T174501123Z-<slug>-2.md"
    And no file name under log/ contains ":"

    Examples:
      | type   | extra                                         | slug                    |
      | ingest | for source "src-2026-10-16-q4-status"         | src-2026-10-16-q4-status |
      | abort  | for source "src-2026-10-16-notes"             | src-2026-10-16-notes     |
      | miss   | with query "budget burn"                      | miss                     |

  @rules
  Scenario: Hand-edited and foreign files in log/ are skipped, not fatal
    Given log/ holds ingest events at "2026-10-15T09:00:00Z" and "2026-10-16T08:00:00Z", a "README.md" without frontmatter and a file with type "party"
    When readLogEvents runs with filter type "ingest"
    Then it returns the two ingest events sorted by "at"
    And skipped lists "README.md" and the "party" file with a reason each
    And with filter since "2026-10-16" it returns only the "2026-10-16T08:00:00Z" event

  @paths
  Scenario: index rebuild recovers after a merge
    Given index.md contains git conflict markers
    And log/ holds one ingest event from each of two branches
    And pages/broken.md has unparseable frontmatter
    When I run "wikeeper index rebuild --json"
    Then the exit code is 0
    And index.md equals buildIndex of the current pages, including "broken.md" under "untyped"
    And the warnings name pages/broken.md
    And log.md lists both events, newest first

  @rules
  Scenario Outline: Error — rebuild is refused when it cannot run safely
    Given <state>
    When I run "wikeeper index rebuild --json"
    Then the exit code is 1 with error code "<code>"
    And index.md and log.md are unchanged

    Examples:
      | state                                    | code               |
      | a repository without .wiki/config.yml    | not_initialised    |
      | an initialised wiki with .wiki/.lock     | ingest_in_progress |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo, hand-write two pages, run `wikeeper index rebuild`, open `index.md` and `log.md` in an editor and in Obsidian (with `content_dir` set to a visible folder).
- [ ] Rebuild on Windows: the `log/` file names are accepted and `index.md` is byte-identical to the macOS/Linux output.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/ingest/log.ts` |
| Related Files | `src/ingest/index-builder.ts`, `src/commands/index.ts`, `src/program.ts`, `test/ingest/log.test.ts`, `test/ingest/index-builder.test.ts`, `test/index-rebuild.test.ts` |
| New Files Needed | Yes — `src/ingest/log.ts`, `src/ingest/index-builder.ts`, `src/commands/index.ts`, `test/ingest/log.test.ts`, `test/ingest/index-builder.test.ts`, `test/index-rebuild.test.ts` |

### 3.2 Technical Logic
- **Frontmatter.** Use the `yaml` package already in `dependencies` (STORY-001-02) to stringify and parse frontmatter; key order in written files follows the interface order in §3.3 so files are stable. Arrays are written in flow-free block style; empty arrays as `[]` (flashcard `#config #yaml`: never emit a bare `key:`).
- **Summary body line.** `ingest`: `Ingested <id>: created n, updated n, deleted n.`; `abort`: `Aborted <id>` plus `, source dropped` when `dropped`; `miss`: `No results for "<query>".`; `rule-proposal`: `Rule proposal` plus `: <summary>` when a string `summary` field is present.
- **Stamp.** `at` → `new Date(at)`; reject (throw `WikeeperError(ERROR, "invalid_event")`) when `at` is not a valid ISO timestamp or a required field of the type is missing — callers are internal, so this is a programming-error guard, not user input.
- **Slug safety.** `source_id` values are already `src-YYYY-MM-DD-<slug>` (STORY-003-01); `writeLogEvent` still lower-cases and replaces anything outside `[a-z0-9-]` with `-` before building the name.
- **Sorting.** Events: `at` (as epoch ms), then file name, code-point compare. Index: `path` code-point compare (`a < b`), never `localeCompare`, so the order is the same on every OS and locale (EPIC-004 determinism rule).
- **`since`.** `YYYY-MM-DD` → `Date.UTC(y, m-1, d)`; anything else → `Date.parse`; invalid → throw `WikeeperError(USAGE, "invalid_since")` (STORY-004-04 surfaces it as exit 2).
- **Lock check in `index rebuild`.** `existsSync(paths.lockFile)` only — the lock's format belongs to STORY-003-08 and is not parsed here.
- **Registration.** `src/commands/index.ts` exports `indexCommand: CommandModule` with an `index` group and a `rebuild` subcommand; add it to `defaultCommands` in `src/program.ts:30` (one line plus one import).

### 3.3 API Contract (if applicable)

Frozen exports (consumers: STORY-003-08 `abort` event, 003-09 `ingest` event and `writeIndex`, 004-04 `--since`, 004-05 `miss` events, EPIC-005 `rule-proposal` and `status`):

```ts
// src/ingest/log.ts
import type { IngestPermission } from "../core/config.js";
import type { ResolvedPaths } from "../core/paths.js";

export type LogEventType = "ingest" | "abort" | "miss" | "rule-proposal";
export const LOG_EVENT_TYPES: readonly LogEventType[];

export interface IngestLogEvent {
  type: "ingest"; at: string; source_id: string;
  kind: string; rule_version: number | null; permission: IngestPermission; origin: string;
  created: string[]; updated: string[]; deleted: string[];   // paths relative to pages/, POSIX
  contradictions: number; rule_suggestions: number;
}
export interface AbortLogEvent { type: "abort"; at: string; source_id: string; dropped: boolean; restored: string[] }
export interface MissLogEvent { type: "miss"; at: string; query: string; filters: Record<string, string | string[]> }
export interface RuleProposalLogEvent { type: "rule-proposal"; at: string; source_id?: string; [field: string]: unknown }
export type LogEvent = IngestLogEvent | AbortLogEvent | MissLogEvent | RuleProposalLogEvent;

export interface StoredLogEvent { file: string; event: LogEvent }            // file: relative to paths.root, POSIX
export interface LogFilter { type?: LogEventType; sourceId?: string; since?: string }
export interface LogReadResult { events: StoredLogEvent[]; skipped: Array<{ file: string; reason: string }> }

export function writeLogEvent(paths: ResolvedPaths, event: LogEvent): Promise<string>;
export function readLogEvents(paths: ResolvedPaths, filter?: LogFilter): Promise<LogReadResult>;
export function renderLogView(events: readonly StoredLogEvent[]): string;
export function regenerateLogView(paths: ResolvedPaths): Promise<{ file: string; events: number }>;

// src/ingest/index-builder.ts
import type { Page } from "../wiki/parse-page.js";
export const INDEX_TYPE_ORDER: readonly string[];   // ["person","team","project","risk","decision","glossary","source"]
export function buildIndex(pages: readonly Page[]): string;
export function writeIndex(paths: ResolvedPaths): Promise<{ file: string; pages: number; changed: boolean; errors: Array<{ path: string; message: string }> }>;

// src/commands/index.ts
export const indexCommand: CommandModule;
```

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper index rebuild` | CLI | None | `--json` | `{ index: { file, pages, changed }, log: { file, events }, skipped: [{ file, reason }] }` |

Consumed: `loadPages(pagesDir): Promise<Page[]>` and `Page { path, frontmatter: { type?, title?, summary? }, errors }` from `src/wiki/parse-page.ts` (STORY-004-01, contract 1).

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | file-name stamp and suffix; frontmatter round trip per type; `since` parsing (date and ISO); tolerant read; index section order and escaping; empty index text |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), CLI scenarios through `runCli`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.
- [ ] Exports in §3.3 match the frozen contract names and types exactly.

## Existing Surfaces

- **Surface:** `src/core/paths.ts:50` — `logDir`, and `src/core/paths.ts:51` — `indexFile`, both already resolved under `content_dir`.
- **Surface:** `src/core/gitignore.ts:79` — `log.md` is already in the managed ignore block, so the generated view never reaches git.
- **Surface:** `src/commands/init.ts:193` — `init` seeds `index.md` from `templates/index.md`; this story's output replaces it on first rebuild.
- **Surface:** `src/program.ts:30` — `defaultCommands`, where `indexCommand` is registered.
- **Coverage of this requirement:** partial — paths, ignore rules and registration exist; the event log, index builder and command are net-new.

## Prior work

- [[EPIC-003]] (parent), [[EPIC-004]] (page parser consumed from STORY-004-01; `--since` and misses consume this log), [[EPIC-005]] (`rule-proposal` events and `status`). No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/core/paths.ts` (paths only).
- **Why isn't extension / parameterization / config sufficient?** A single append-only `log.md` and a hand-maintained index conflict on every parallel branch (D-28). One file per event plus an index derived purely from frontmatter is the minimum that merges cleanly and can be regenerated; both need code, not configuration.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (Source files are the EPIC-003 §4 paths `src/ingest/index-builder.ts`, `src/ingest/log.ts`, `src/commands/index.ts`, plus the existing `src/program.ts`; test files are new.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
