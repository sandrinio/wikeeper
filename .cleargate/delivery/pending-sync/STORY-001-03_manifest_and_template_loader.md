---
story_id: STORY-001-03
parent_epic_ref: EPIC-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-001 (approved 2026-10-16) · architecture.md v0.4 · verified src/program.ts
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T13:30:00Z
updated_at: 2026-10-16T13:30:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:30:08Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-001-03
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:28:14Z
  sessions: []
---

# STORY-001-03: Ownership manifest and template loader
**Complexity:** L2 — two modules, packaging change, placeholder templates.

## 1. The Spec (The Contract)

### 1.1 User Story
As a developer installing wikeeper, I want the package to know exactly which files it installed and to find its own templates wherever it runs from, so that later updates and removals never confuse my files with wikeeper's.

### 1.2 Detailed Requirements
- **R1 — Template loader.** `src/core/templates.ts`: `findPackageRoot(fromUrl)` walks up from a module URL to the first directory whose `package.json` has `"name": "wikeeper"`; works from `src/` (vitest), `dist/` (built) and `node_modules/wikeeper/` (installed). `templatesDir()`, `listTemplateFiles(subdir)` (sorted, posix-relative) and `copyTemplate(rel, dest)` (creates parent directories, copies bytes).
- **R2 — Shipping.** `package.json` `files` adds `"templates"`; placeholder `templates/system/SETUP.md` and `templates/system/WIKI.md` exist (real text arrives in EPIC-006).
- **R3 — Manifest format.** `src/core/manifest.ts`: `{ package_version, files: [{ path, sha256, kind }] }` where `path` is posix and relative to the repository root and `kind` is `"system"` (EPIC-002 adds more kinds). `writeManifest` sorts by path and writes stable JSON (2-space indent, trailing newline, no timestamps); `readManifest` returns `null` when the file is absent.
- **R4 — Drift.** `diffManifest(manifest, root)` returns each entry with status `ok | modified | missing`.
- **R5 — Errors.** A malformed manifest throws an error with `code: "E_MANIFEST_INVALID"`; a start path outside any wikeeper package throws `code: "E_PACKAGE_ROOT_NOT_FOUND"`.

### 1.3 Out of Scope
- Deciding which files to install or replace (STORY-001-04, STORY-001-05).
- Real template content (EPIC-006).

### 1.4 Open Questions

- None — decisions recorded in architecture.md and EPIC-001.

### 1.5 Risks

- **Risk:** Hash mismatches on Windows because of CRLF conversion of template files.
- **Mitigation:** Hash the bytes as copied (never re-encode); `.gitattributes` from STORY-001-01 keeps templates LF.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One successful path per function. |
| Interfaces | T | The loader must work from the source layout, the built layout and the published tarball. |
| Data | T | Drift classification differs for unchanged, edited and deleted files. |
| Rules | T | Malformed inputs are rejected with stable error codes. |

```gherkin
Feature: Ownership manifest and template loader

  @interfaces
  Scenario Outline: Templates resolve from every layout
    Given a module located under "<layout>" inside a directory whose package.json names "wikeeper"
    When findPackageRoot runs from that module's URL
    Then templatesDir points to "<package-root>/templates"

    Examples:
      | layout                         |
      | src/core                       |
      | dist/core                      |
      | node_modules/wikeeper/dist/core |

  @interfaces
  Scenario: The published package ships the templates
    When "npm pack --dry-run --json" runs in the repository
    Then the file list contains templates/system/SETUP.md and templates/system/WIKI.md

  Scenario: The manifest round-trips deterministically
    Given three files with known contents
    When writeManifest records them in a shuffled order and readManifest reads the file back
    Then entries are sorted by posix path with the expected sha256 and kind "system"
    And writing the same manifest twice produces identical bytes

  @data
  Scenario: Drift is classified per file
    Given a manifest of three files where one was edited and one deleted afterwards
    When diffManifest runs
    Then the statuses are ok, modified and missing respectively

  @rules
  Scenario Outline: Error — unreadable inputs are reported with a code
    Given <input>
    When the corresponding function runs
    Then it throws an error with code "<code>"

    Examples:
      | input                                             | code                     |
      | a manifest.json containing "{oops"                | E_MANIFEST_INVALID       |
      | a start path with no wikeeper package.json above  | E_PACKAGE_ROOT_NOT_FOUND |
```

### 2.2 Verification Steps (Manual)
- [ ] `npm pack --dry-run` lists the two template files.
- [ ] Open a generated manifest and confirm it has no timestamps and sorted paths.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/core/manifest.ts` |
| Related Files | `src/core/templates.ts`, `templates/system/SETUP.md`, `templates/system/WIKI.md`, `./package.json`, `test/manifest.test.ts`, `test/template-loader.test.ts` |
| New Files Needed | Yes — all of the above except `./package.json` |

### 3.2 Technical Logic
- `findPackageRoot(fromUrl = import.meta.url)`: `fileURLToPath` → loop `dirname` until `package.json` exists and parses with `name === "wikeeper"`; stop at filesystem root and throw `E_PACKAGE_ROOT_NOT_FOUND`. Tests create temp trees for the three layouts.
- `sha256File(path)` streams with `node:crypto`.
- Errors are `Error` objects with a `code` property, so this story does not depend on STORY-001-01; the command layer maps them to exit code 1.
- `test/template-loader.test.ts` (not `test/templates.test.ts`, which EPIC-006 reserves for structural content tests).

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `diffManifest(manifest, root)` | function | None | manifest + root | `[{ path, sha256, kind, status: "ok" \| "modified" \| "missing" }]` |

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 7 | three layouts, round-trip, determinism, drift, two error codes |
| Integration tests | 1 | `npm pack --dry-run --json` file list |
| E2E / acceptance tests | 5 | One per Gherkin scenario. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `./package.json` — `files` currently ships only `dist`; gains `templates`.
- **Coverage of this requirement:** partial — packaging only; loader and manifest are net-new.

## Prior work

- [[EPIC-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `./package.json`.
- **Why isn't extension / parameterization / config sufficient?** `update` and `remove` must decide per file whether wikeeper owns it and whether the user changed it; that needs recorded hashes. Resolving templates relative to the working directory would break as soon as the CLI runs from `node_modules` or `npx`.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (Existing paths verified; planned paths for new files accepted by the human at Gate 1, 2026-10-16.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
