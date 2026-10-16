---
story_id: STORY-003-05
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: "EPIC-003 §2 (ingest plan <dir>: new / duplicate / denied per file, JSON plan), §5 (directory-plan scenario) · architecture.md §7.1 (directory trigger), §7.3, §7.6 (directory row) · SPRINT-02 decomposition brief contracts 3, 4 and 6"
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors:
  - STORY-003-01
  - STORY-003-02
  - STORY-003-04
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T22:41:37Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 4
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T22:41:58Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: f1c4da140caa38bdb872b9b8578efe8bc7616387cf9c001c7750ca67815afd23
stamp_error: no ledger rows for work_item_id STORY-003-05
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:51:20Z
  sessions: []
---

# STORY-003-05: `wikeeper ingest plan <dir>`
**Complexity:** L2 — a read-only planning command over a directory, reusing the registry's hashing and duplicate lookup and the permission evaluation. Depends on STORY-003-01, 003-02 and the `ingest` group from 003-04.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent that has been pointed at a folder, I want a plan of which files are new, already ingested or not allowed — without reading them myself — so that I can get the user's approval once and then hand each new file to an extractor.

### 1.2 Detailed Requirements
- **R1 — Usage.** `wikeeper ingest plan <dir> [--kind <kind>] [--json]` adds `src/commands/ingest-plan.ts` and one line to `ingestSubcommands` in `src/commands/ingest.ts`. The repository must be initialised (exit 1, `not_initialised`). `<dir>` must be an existing directory; a file → exit 2 pointing to `wikeeper ingest start`, a missing path → exit 2. `--kind` follows `isValidKindId` (else exit 2) and applies to every file.
- **R2 — Walk.** Files are listed recursively and sorted by POSIX path. Skipped, and listed under `skipped` with a reason: entries whose name starts with `.` (`hidden`), anything inside `.wiki/` or the content directory (`wiki`), and symbolic links (`symlink`, never followed).
- **R3 — Per-file entry.** Each file gets `path` (the origin `ingest start` would record: `fileOrigin(root, abs)`), `size`, `sha256` and:
  - `status: "duplicate"` when `findDuplicate` matches a registered source (`prior: { id, captured_at, match: "sha256" }`), or when an earlier `new` file in the same plan has the same hash (`prior: { path, match: "in_plan" }`); a copy of an earlier denied file is evaluated on its own (clarified 2026-10-16: §1.4's rationale assumes the earlier file registers);
  - otherwise `evaluatePermission(config.ingest, { origin, originType: "file", kind, approved: false })` decides: `denied` → `status: "denied"`; `allowed` or `needs_approval` → `status: "new"`, with `needs_approval: true` for the latter and `kind_pending` as returned. Every entry carries the decision's `reason`.
- **R4 — Totals and output.** The result holds `dir`, `mode`, `kind`, `entries`, `skipped` and `totals { new, duplicate, denied, needs_approval }`. The human output is one line per file (`new`, `new (needs approval)`, `duplicate of <id>`, `denied: <reason>`) plus a totals line and the next step: "get approval if needed, then run `wikeeper ingest start <path>` per new file (add `--approved` after the user agrees)".
- **R5 — Read-only.** The plan stores nothing: `raw/`, `log/`, `pages/` and `index.md` are unchanged, and no hook runs. It always exits 0 when it could build a plan, whatever the entries' statuses.

### 1.3 Out of Scope
- Registering the files (the agent runs `ingest start` per file, STORY-003-04).
- Filtering by extension or flagging formats the agent cannot read (`wikeeper read` and its limits, SPRINT-03).
- Dispatching extractor sub-agents — that is instruction text (STORY-006-04 / 006-05).

### 1.4 Open Questions

- None. Decisions recorded with their rationale:
  - **`needs_approval` is a flag on `new`, not a fourth status** — EPIC-003 defines the statuses as new / duplicate / denied; in `ask` mode every new file needs approval, and the plan is what the user approves as a batch (architecture §7.6, directory row).
  - **Hidden files and symlinks are skipped, not planned** — `.git/`, editor folders and link loops would otherwise flood the plan; skips stay visible under `skipped`.
  - **In-plan copies are duplicates of the first path** — two identical files would otherwise register twice, and the second `ingest start` would report a duplicate anyway.

### 1.5 Risks

- **Risk:** A very large directory makes the plan slow (every file is hashed).
- **Mitigation:** Hashing streams files (`sha256File`); registered sources are loaded once per plan, not per file; no size cap is added until there is a need.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One successful path: the plan. |
| Interfaces | F | CLI only. |
| Data | T | Hidden files, the wiki's own folders, symlinks and identical copies are handled differently from ordinary files. |
| Rules | T | Duplicate, whitelist and ask-mode rules decide each entry; the plan never stores anything. |

```gherkin
Feature: wikeeper ingest plan

  @rules
  Scenario: Directory plan marks duplicates and denied files
    Given ingest.permission "whitelist" with origins ["docs/meetings/**"]
    And docs/ containing meetings/a.md, meetings/b.md (already ingested as "src-2026-10-16-b") and notes.md
    When I run "wikeeper ingest plan docs --json"
    Then the entries in order are:
      | path                  | status    | detail                        |
      | docs/meetings/a.md    | new       | needs_approval false          |
      | docs/meetings/b.md    | duplicate | prior.id "src-2026-10-16-b"   |
      | docs/notes.md         | denied    | reason names docs/notes.md    |
    And totals are { new: 1, duplicate: 1, denied: 1, needs_approval: 0 }
    And raw/, log/ and pages/ are unchanged
    When I run "wikeeper ingest plan docs" without --json
    Then stdout has one line per file, a totals line, and a next step naming "wikeeper ingest start" and "--approved"

  @rules
  Scenario: In ask mode every new file needs approval
    Given ingest.permission "ask" and docs/ containing a.md and b.md
    When I run "wikeeper ingest plan docs --json"
    Then both entries have status "new" and needs_approval true
    And totals.needs_approval is 2
    And the exit code is 0

  @rules
  Scenario Outline: A kinds-only whitelist defers the check without --kind
    Given ingest.permission "whitelist" with kinds ["meeting-notes"] and no origins
    And docs/ containing a.md
    When I run "wikeeper ingest plan docs <args> --json"
    Then the entry for docs/a.md has status "<status>" and kind_pending <pending>

    Examples:
      | args                      | status | pending |
      |                           | new    | true    |
      | --kind "meeting-notes"    | new    | false   |
      | --kind "status-report"    | denied | false   |

  @data
  Scenario: Hidden files, the wiki itself, symlinks and identical copies are not planned twice
    Given ingest.permission "ai" and docs/ containing a.md, copy-of-a.md (same bytes), .draft.md and a symlink link.md
    And the content directory configured as docs/wiki holding index.md
    When I run "wikeeper ingest plan docs --json"
    Then entries are docs/a.md (new) and docs/copy-of-a.md (duplicate, prior.path "docs/a.md", match "in_plan")
    And skipped lists docs/.draft.md "hidden", docs/link.md "symlink" and docs/wiki "wiki"

  Scenario Outline: Error — a plan needs an initialised wiki and an existing directory
    Given <repo> with notes.md and docs/
    When I run "wikeeper ingest plan <args> --json"
    Then the exit code is <exit> and error.code is "<code>"
    And the message <hint>

    Examples:
      | repo                        | args                         | exit | code            | hint                                   |
      | an initialised repository   | notes.md                     | 2    | usage           | names "wikeeper ingest start"          |
      | an initialised repository   | missing                      | 2    | usage           | says the directory does not exist      |
      | an initialised repository   | docs --kind "status report"  | 2    | usage           | names the invalid kind                 |
      | a repository without .wiki/ | docs                         | 1    | not_initialised | says to run "wikeeper init"            |
```

### 2.2 Verification Steps (Manual)
- [ ] Run `wikeeper ingest plan` (human output) on a real meeting-notes folder and read the per-file lines and the next-step line.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/ingest/plan.ts` |
| Related Files | `src/commands/ingest-plan.ts` |
| Modified Files | `src/commands/ingest.ts` |
| Test Files | `test/ingest/ingest-plan.test.ts` |
| New Files Needed | Yes — all files above except `src/commands/ingest.ts` (one `ingestSubcommands` entry) |

### 3.2 Technical Logic
- Walk with `readdir(dir, { withFileTypes: true })`, recursing manually so symlinks are detected (`dirent.isSymbolicLink()`) and never followed; collect, then sort by POSIX path (`toPosixRelative` / `fileOrigin`).
- "Inside the wiki": `isInside(paths.wikiDir, abs) || isInside(paths.contentDir, abs)`; when the walked directory contains the content directory, report it once under `skipped` (the directory, not each file).
- Load `listSources(paths)` once; keep a `Map<sha256, path>` for in-plan duplicates.
- Tests must not rely on case-differing names (`#test-harness #windows #macos` flashcard); the symlink scenario creates the link with `symlink` and skips itself where the OS refuses (Windows without developer mode), asserting the skip reason instead.
- `planDirectory` is pure apart from reading the file system, so the command file only parses options and formats output.

### 3.3 API Contract (if applicable)

Frozen exports (consumer: STORY-006-04 documents the JSON; no code consumer this sprint):

```ts
// src/ingest/plan.ts
import type { WikeeperConfig } from "../core/config.js";
import type { ResolvedPaths } from "../core/paths.js";
export type PlanStatus = "new" | "duplicate" | "denied";
export type PlanPrior =
  | { id: string; captured_at: string; match: "sha256" }
  | { path: string; match: "in_plan" };
export interface PlanEntry {
  path: string;              // origin as `ingest start` would record it
  size: number;
  sha256: string;
  status: PlanStatus;
  needs_approval: boolean;
  kind_pending: boolean;
  reason: string;
  prior: PlanPrior | null;
}
export interface PlanSkip { path: string; reason: "hidden" | "wiki" | "symlink" }
export interface IngestPlan {
  dir: string;               // repo-relative POSIX, or absolute when outside the repo
  mode: WikeeperConfig["ingest"]["permission"];
  kind: string | null;
  entries: PlanEntry[];
  skipped: PlanSkip[];
  totals: { new: number; duplicate: number; denied: number; needs_approval: number };
}
export function planDirectory(
  paths: ResolvedPaths,
  config: WikeeperConfig,
  dirAbs: string,
  options: { kind: string | null },
): Promise<IngestPlan>;

// src/commands/ingest-plan.ts
import type { IngestSubcommand } from "./ingest.js";
export const ingestPlanCommand: IngestSubcommand;
```

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper ingest plan <dir>` | CLI | None | `--kind`, `--json` | `IngestPlan`; errors: exit 2 `usage`, exit 1 `not_initialised` |

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 2 | sort order across nested folders; a plan of an empty directory (no entries, totals all 0). |
| Integration tests | 0 | Temp git repositories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/manifest.ts:50` — `sha256File`, used through STORY-003-01's `hashSource`.
- **Surface:** `src/agents/hook-protocols.ts:43` — `isInside`, for skipping the wiki's own folders.
- **Surface:** `src/core/paths.ts:14` — `contentDir` (moved by `content_dir`), which the walk must skip.
- **Coverage of this requirement:** partial — hashing and path helpers exist; the plan is net-new.

## Prior work

- [[EPIC-003]] (parent). The SPRINT-02 wiki duplicate check found no prior work on directory planning.

## Why not simpler?

- **Smallest existing surface that could carry this:** running `wikeeper ingest start` on every file.
- **Why isn't extension / parameterization / config sufficient?** `start` registers as it goes, so it cannot show the user a batch to approve first, and in `ask` mode it would stop at the first file. The directory flow in architecture §7.6 needs a read-only preview the main agent can show without reading the files; `plan` is that preview, built from the same registry and permission functions so its verdicts match what `start` will do.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/ingest/plan.ts` is an EPIC-003 §4 planned path; `src/commands/ingest-plan.ts` follows the decomposition brief's contract 6.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
