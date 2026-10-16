---
story_id: STORY-003-01
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-003 §2 (ids, raw registry, duplicates) · architecture.md §4, §7.3 steps 1–4, §8 · SPRINT-02 decomposition brief contract 3 · verified src/core/manifest.ts, src/core/paths.ts
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T18:45:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 6
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:23:59Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 49cae518e3adad7fc956bf3a28941ee661794ddc5b74c4b6588556e7716fefe8
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: claude-opus-5-5
  last_stamp: 2026-10-16T17:46:19Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-16T17:41:41Z
---

# STORY-003-01: Source ids and raw registry, duplicate detection
**Complexity:** L2 — two new library modules over the filesystem (no command). Consumed by every later EPIC-003 story.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent ingesting a source, I want every source stored once, under a stable id, with its metadata and hash, so that facts, pages and log entries can cite it and the same document is not ingested twice by accident.

### 1.2 Detailed Requirements
- **R1 — Ids.** `makeSourceId(date, label, taken)` returns `src-YYYY-MM-DD-<slug>`. The date is the UTC calendar date of `date`. `slugify(label)`: NFKD, drop combining marks, lowercase, every run of characters outside `[a-z0-9]` becomes one `-`, trim `-`, cut to at most 40 characters at a `-` boundary when possible, empty result → `source`. When `taken(id)` is true, append `-2`, `-3`, … until a free id is found. `isSourceId` / `SOURCE_ID_PATTERN` accept exactly this shape.
- **R2 — File sources.** `registerSource` with `originalPath` copies the file byte-for-byte to `raw/<id><ext>` (extension lowercased from the original name; no extension → none) and writes `raw/<id>.meta.json`. `origin` is the value from `fileOrigin(root, absPath)`: repo-relative POSIX when the file is inside the repo, otherwise the absolute path with `/` separators.
- **R3 — Text-only sources.** With no `originalPath` and a `text` (a chat excerpt from stdin, or the text the agent fetched for a URL), the text is written as UTF-8 to `raw/<id>.md`; `original` is `null` and `text` names that file. `sha256` and `size` are those of the UTF-8 text bytes.
- **R4 — Agent text for a file source.** With both `originalPath` and `text`, the text is also written to `raw/<id>.md` and named in `text`; `sha256`/`size` stay those of the original. If the original's extension is `.md`, passing `text` throws `WikeeperError(USAGE, "usage", …)` ("the original is already markdown; drop --text-file") before anything is written.
- **R5 — Metadata.** `raw/<id>.meta.json` holds the `SourceMeta` fields in the order of §3.3, 2-space indented JSON with a trailing newline. It is written **last**, so a meta file's presence means the source is registered.
- **R6 — Immutability and races.** Every raw file is created with the exclusive `wx` flag; no function in this module ever overwrites or modifies a raw file. If a create fails with `EEXIST` (two registrations raced for the same id), the files this call already wrote are removed and registration retries with the next free id, at most 5 times, then throws.
- **R7 — Duplicates.** `hashSource` hashes a prospective source the same way R2/R3 store it (reusing `sha256File` for files). `findDuplicate(sources, probe)` is pure: it returns the first registered source (in id order) with the same `sha256` (`match: "sha256"`); for `originType: "url"` it also returns a source whose `origin` equals the probe's normalized URL (`match: "origin"`). `normalizeUrl` lowercases scheme and host, drops the fragment and a default port, and keeps path and query.
- **R8 — Reading and removal.** `readMeta(paths, id)` returns the parsed meta or `null`. `listSources(paths)` returns every valid meta in `raw/` sorted by id; files that are not valid JSON or lack `id`/`sha256` are skipped. `removeSource(paths, id)` deletes exactly the files named `<id>.<anything>` in `raw/` (never `<id>-2.*`) and returns their POSIX names; it is the rollback used by `ingest start` (STORY-003-04) and by `ingest abort --drop` (STORY-003-08).
- **R9 — No ingest state file.** The registry writes no status field and no other file: an ingest's phase is derived from the files present, the lock and the log (decomposition brief contract 3).

### 1.3 Out of Scope
- The `ingest start` command, permission evaluation and hooks (STORY-003-02, 003-03, 003-04).
- The facts file `raw/<id>.facts.json` (STORY-003-06) — `removeSource` deletes it, but this story never writes it.
- Fetching URLs or converting formats (`wikeeper read`, SPRINT-03).

### 1.4 Open Questions

- None. Decisions recorded with their rationale:
  - **UTC date in ids** — deterministic across machines and in tests; `captured_at` keeps the full timestamp.
  - **URL duplicates match on the normalized URL as well as the text hash** — a page fetched twice rarely yields byte-identical text, so a hash-only check would miss most repeats; `--reingest` (STORY-003-04) registers an updated page deliberately.
  - **A `.md` original takes no agent text** — `raw/<id>.md` would collide with the original, and a markdown original is already readable.

### 1.5 Risks

- **Risk:** Two parallel `ingest start` runs pick the same id.
- **Mitigation:** R6 — exclusive creates plus a bounded retry; a test simulates the race by pre-creating the meta file between id choice and write.
- **Risk:** Case-insensitive file systems (macOS, Windows) treat `Notes.PDF` and `notes.pdf` as one name.
- **Mitigation:** Extensions are lowercased and slugs are lowercase, so raw names never differ only by case.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | File sources and text-only sources are distinct successful registrations. |
| Interfaces | F | Library only; the CLI surface is STORY-003-04. |
| Data | T | Stored files differ by source shape (file, file + text, stdin text, URL text); duplicate matching differs by origin type. |
| Rules | T | Collision suffixes, never-overwrite, markdown originals refuse agent text. |

```gherkin
Feature: Source ids and raw registry

  @paths
  Scenario: A file source is copied and described
    Given an initialised repository containing "docs/Q4 Status.PDF"
    When registerSource is called for that file with label "Q4 Status" on 2026-10-16
    Then raw/ holds "src-2026-10-16-q4-status.pdf", byte-identical to the original
    And raw/src-2026-10-16-q4-status.meta.json has origin "docs/Q4 Status.PDF", origin_type "file", original "src-2026-10-16-q4-status.pdf", text null, and the file's size and sha256
    And readMeta returns the same fields, in the §3.3 key order
    And raw/ holds no other file

  @data
  Scenario Outline: Text is stored as raw/<id>.md
    Given an initialised repository
    When registerSource is called with <input>
    Then raw/ holds <files>
    And the meta has origin "<origin>", original <original> and sha256 of <hashed>

    Examples:
      | input                                                          | files                     | origin                       | original    | hashed        |
      | text "We decided to drop vendor X", origin "stdin"             | <id>.md, <id>.meta.json   | stdin                        | null        | the text      |
      | text "# Q4 page", origin "HTTPS://Acme.Example.com:443/q4#top" | <id>.md, <id>.meta.json   | https://acme.example.com/q4  | null        | the text      |
      | file "docs/q4.pdf" and text "Q4 extracted text"                | <id>.pdf, <id>.md, <id>.meta.json | docs/q4.pdf          | "<id>.pdf"  | the PDF bytes |

  @rules
  Scenario: Colliding ids get a suffix and nothing is overwritten
    Given raw/ already holds src-2026-10-16-notes.md and its meta file
    When two more sources labelled "notes" are registered on 2026-10-16
    Then their ids are "src-2026-10-16-notes-2" and "src-2026-10-16-notes-3"
    And the bytes of the existing src-2026-10-16-notes files are unchanged
    And a registration that finds "src-2026-10-16-notes-4.meta.json" created after it chose that id retries as "src-2026-10-16-notes-5", leaving no partial "-4" files of its own
    And removeSource("src-2026-10-16-notes") deletes only the src-2026-10-16-notes.* files

  @rules @data
  Scenario Outline: Duplicates are found by hash, and URLs also by address
    Given registered sources listed by listSources, including a malformed meta file that is skipped
    When findDuplicate is asked about <probe>
    Then the result is <result>

    Examples:
      | probe                                                         | result                                   |
      | a file with the same bytes as a registered file               | that source, match "sha256"              |
      | a URL "https://acme.example.com/q4#v2" with different text    | the source with that origin, match "origin" |
      | a file with new bytes                                         | null                                     |

  Scenario: Error — a markdown original refuses agent text
    Given an initialised repository containing "notes.md"
    When registerSource is called for "notes.md" with text "extra"
    Then it throws a usage error saying the original is already markdown
    And raw/ is unchanged
```

### 2.2 Verification Steps (Manual)
- [ ] Register a PDF and a pasted excerpt in a scratch repo through a small script and read the two meta files.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/ingest/registry.ts` |
| Related Files | `src/ingest/source-id.ts` |
| Test Files | `test/ingest/source-id.test.ts`, `test/ingest/registry.test.ts` |
| New Files Needed | Yes — all four files above |

### 3.2 Technical Logic
- `taken(id)` used by `registerSource`: true when any entry of `raw/` is named `<id>.<something>` (one `readdir` per registration, not per candidate).
- Write order: original (`copyFile` with `COPYFILE_EXCL`), then `<id>.md` (`writeFile` with `flag: "wx"`), then `<id>.meta.json` (`wx`). `raw/` is created with `mkdir -p` first. On any error, the files this call created are removed before rethrowing (or retrying on `EEXIST`, R6).
- `captured_at` = `(input.now ?? new Date()).toISOString()`; the same `now` feeds the id date.
- `hashText` uses `node:crypto` over `Buffer.from(text, "utf8")`; `hashSource` uses `sha256File` (`src/core/manifest.ts:50`) for files.
- `fileOrigin` uses `toPosixRelative` (`src/core/paths.ts:55`) when `isInside(root, abs)`, else `abs.split(path.sep).join("/")`.
- `permission` is stored as given; the registry does not evaluate it (STORY-003-02 does, STORY-003-04 passes the result).
- Reading tolerates a UTF-8 BOM in meta files (`#encoding #bom` flashcard).

### 3.3 API Contract (if applicable)

Frozen exports (consumers: STORY-003-04, 003-05, 003-06, 003-08, 003-09):

```ts
// src/ingest/source-id.ts
export const SOURCE_ID_PATTERN: RegExp; // /^src-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/
export function isSourceId(value: string): boolean;
export function slugify(label: string): string;
export function formatIdDate(date: Date): string; // UTC "YYYY-MM-DD"
export function makeSourceId(date: Date, label: string, taken: (id: string) => boolean): string;

// src/ingest/registry.ts
import type { ResolvedPaths } from "../core/paths.js";
export type OriginType = "file" | "url" | "stdin";
export interface SourcePermission {
  mode: "ai" | "ask" | "whitelist";
  approved: boolean;                                   // --approved was passed
  matched: { by: "kind" | "origin"; entry: string } | null;
  kind_pending: boolean;                               // whitelist kind still to be checked at `ingest facts`
}
export interface SourceMeta {                          // field order = JSON key order
  id: string;
  origin: string;                                      // repo-relative POSIX path | absolute POSIX path | normalized URL | "stdin"
  origin_type: OriginType;
  kind: string | null;                                 // normalized kind id from --kind, else null
  provided_by: "user" | "agent";
  captured_at: string;                                 // ISO-8601 UTC
  size: number;                                        // bytes of the original, or of the text when original is null
  sha256: string;                                      // hash of the same bytes
  rule_version: number | null;
  original: string | null;                             // raw file name, e.g. "src-2026-10-16-q4.pdf"
  text: string | null;                                 // "src-2026-10-16-q4.md" when agent/excerpt text is stored
  reingest_of: string | null;
  permission: SourcePermission;
}
export interface RegisterInput {
  originType: OriginType;
  origin: string;
  label: string;
  originalPath: string | null;
  text: string | null;
  kind: string | null;
  providedBy: "user" | "agent";
  ruleVersion: number | null;
  reingestOf: string | null;
  permission: SourcePermission;
  now?: Date;
}
export interface DuplicateMatch { meta: SourceMeta; match: "sha256" | "origin" }
export function fileOrigin(root: string, absPath: string): string;
export function normalizeUrl(url: string): string;
export function hashText(text: string): { sha256: string; size: number };
export function hashSource(input: Pick<RegisterInput, "originalPath" | "text">): Promise<{ sha256: string; size: number }>;
export function findDuplicate(
  sources: readonly SourceMeta[],
  probe: { sha256: string; originType: OriginType; origin: string },
): DuplicateMatch | null;
export function registerSource(paths: ResolvedPaths, input: RegisterInput): Promise<SourceMeta>;
export function readMeta(paths: ResolvedPaths, id: string): Promise<SourceMeta | null>;
export function listSources(paths: ResolvedPaths): Promise<SourceMeta[]>;
export function removeSource(paths: ResolvedPaths, id: string): Promise<string[]>;
```

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | `slugify` (diacritics, punctuation, length cut, empty); `formatIdDate` at a UTC day boundary; `normalizeUrl`; `isSourceId`; `fileOrigin` inside/outside the repo; the `EEXIST` retry path. |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/manifest.ts:50` — `sha256File`, reused for file hashing.
- **Surface:** `src/core/paths.ts:49` — `rawDir` in `ResolvedPaths`, the registry's root; `src/core/paths.ts:55` — `toPosixRelative`.
- **Surface:** `src/agents/hook-protocols.ts:43` — `isInside`, reused for "inside the repo" (the shared helper, per the SPRINT-01 reuse decision).
- **Surface:** `src/core/exit-codes.ts:4` — `ExitCode.USAGE` and `WikeeperError` for R4.
- **Coverage of this requirement:** partial — paths and hashing exist; ids, raw storage and duplicate lookup are net-new.

## Prior work

- [[EPIC-003]] (parent). The SPRINT-02 wiki duplicate check found no prior story or CR covering the raw registry.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/core/manifest.ts` (hashing and JSON file writing).
- **Why isn't extension / parameterization / config sufficient?** The manifest tracks package-owned files that `update` replaces; raw sources are user-owned, immutable and keyed by a generated id with duplicate lookup. Folding them into the manifest would let `update`/`remove` logic touch knowledge, which EPIC-001's ownership matrix forbids. A separate registry module of two files is the smallest shape that keeps ids, immutability and duplicates testable on their own.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (Existing paths verified; `src/ingest/source-id.ts` and `registry.ts` are EPIC-003 §4 planned paths.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
