---
story_id: STORY-001-05
parent_epic_ref: EPIC-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-001 (approved 2026-10-16) · architecture.md v0.4 · verified src/program.ts
actor: Developer installing wikeeper in a repo
complexity_label: L2
parallel_eligible: n
dep_predecessors: ["STORY-001-03", "STORY-001-04"]
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
  last_gate_check: 2026-10-16T13:30:09Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-001-05
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:29:15Z
  sessions: []
---

# STORY-001-05: `wikeeper update`
**Complexity:** L2 — one command over the manifest and template loader. Depends on STORY-001-03 and 001-04.

## 1. The Spec (The Contract)

### 1.1 User Story
As a developer installing wikeeper in a repo, I want `wikeeper update` to bring wikeeper's own files up to the installed version, so that I get improved instructions without risking my knowledge or my edits.

### 1.2 Detailed Requirements
- **R1 — Command.** `wikeeper update [--json]` is registered. Without a manifest it fails with exit 1: "not initialised — run wikeeper init".
- **R2 — Replace and add.** Every file under `templates/system/` is written to `.wiki/system/`: unchanged local files (hash equals manifest) are replaced; files new in the package are added.
- **R3 — Locally edited package files.** When a package-owned file's hash differs from the manifest, it is copied to `<file>.bak-<YYYYMMDDHHmmss>` before being replaced, and a warning names it.
- **R4 — Dropped files.** Manifest entries no longer present in the package are deleted (backed up first if locally edited).
- **R5 — User-owned files.** `config.yml`, `kb_instructions.md`, `me.md`, `index.md`, `raw/`, `pages/` and `log/` are never read for writing, modified or deleted.
- **R6 — Manifest and integrations.** The manifest is rewritten with the installed `package_version` and new hashes; `runIntegrations("update", ctx)` runs once.
- **R7 — Output.** `--json` returns `{ replaced, added, removed, backed_up, warnings }`; when nothing changed, all lists are empty and the exit code is 0.

### 1.3 Out of Scope
- Migrating `config.yml` (new options get defaults in code, per architecture.md §4.1).
- Updating agent wiring (EPIC-002 `update` handler).

### 1.4 Open Questions

- None — decisions recorded in architecture.md and EPIC-001.

### 1.5 Risks

- **Risk:** Tests can't easily simulate "a newer package version".
- **Mitigation:** The command's internal `runUpdate({ root, templatesDir, packageVersion })` accepts an injected templates directory; tests point it at fixture trees.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Replace, add and remove are distinct successful outcomes. |
| Interfaces | F | CLI only. |
| Data | T | Behaviour differs for unchanged, edited and dropped files. |
| Rules | T | User-owned files must never change; edited package files must be backed up. |

```gherkin
Feature: wikeeper update

  @paths
  Scenario: Unchanged package files are replaced and new ones added
    Given an initialised repository and a newer template set that changes WIKI.md and adds profiles/management.md
    And a registered test integration
    When I run "wikeeper update --json"
    Then .wiki/system/WIKI.md has the new content and .wiki/system/profiles/management.md exists
    And the manifest records the new package_version and hashes
    And the test integration's update handler ran once

  @rules @data
  Scenario: A locally edited package file is backed up before replacement
    Given .wiki/system/WIKI.md edited by the user after init
    When I run "wikeeper update --json"
    Then a file matching ".wiki/system/WIKI.md.bak-*" holds the user's edit
    And .wiki/system/WIKI.md has the new content
    And "warnings" names WIKI.md

  @data
  Scenario: A file dropped from the package is removed
    Given a newer template set without SETUP.md
    When I run "wikeeper update"
    Then .wiki/system/SETUP.md no longer exists
    And the manifest no longer lists it

  @rules
  Scenario: User-owned files are untouched
    Given edited config.yml, kb_instructions.md, me.md, index.md and a page under pages/
    When I run "wikeeper update"
    Then each of those files is byte-identical

  Scenario: Error — update before init
    Given a repository without .wiki/system/manifest.json
    When I run "wikeeper update --json"
    Then the exit code is 1
    And the JSON error message contains "run wikeeper init"
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo, edit `.wiki/system/WIKI.md`, run `update`, and confirm the `.bak-` file and warning.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/commands/update.ts` |
| Related Files | `src/program.ts`, `test/update.test.ts` |
| New Files Needed | Yes — `src/commands/update.ts`, `test/update.test.ts` |

### 3.2 Technical Logic
- Read the manifest → `diffManifest` for local state; list package templates → compute `added`, `replaced`, `removed`.
- Backup name uses UTC `YYYYMMDDHHmmss`; never overwrite an existing backup (append `-1`, `-2`).
- Write files only when bytes differ, so a no-op update leaves mtimes untouched.
- Only paths inside `.wiki/system/` are ever written or deleted; assert this in code and in tests.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper update` | CLI | None | `--json` | `{ replaced, added, removed, backed_up, warnings }` |

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 2 | change-set computation; backup naming collision |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts` — command registry where `update` is registered.
- **Coverage of this requirement:** partial — registration only; the command is net-new.

## Prior work

- [[EPIC-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/program.ts`.
- **Why isn't extension / parameterization / config sufficient?** Re-running `init` can't replace package files (it deliberately never overwrites), and blindly overwriting `.wiki/system/` would destroy local edits without warning. The manifest-driven replace-with-backup logic is the minimum that is both safe and complete.

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
