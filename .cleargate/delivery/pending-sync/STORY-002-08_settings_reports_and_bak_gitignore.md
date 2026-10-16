---
story_id: STORY-002-08
parent_epic_ref: EPIC-002
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: CR-002 A6, A7 and its Open Question 2 answer (approved 2026-10-16; SPRINT-01 walkthrough steps 1.4d, 1.4g, 2.1a, 2.1c) · EPIC-002 · BUG-002 (fixed in SPRINT-01) · verified src/agents/enforce/index.ts, src/commands/init.ts, src/commands/update.ts, src/core/gitignore.ts, src/core/integrations.ts
actor: Developer reviewing what `init` and `update` changed before committing
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-001-08
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:40:00Z
updated_at: 2026-10-16T18:40:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 1
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
last_synced_body_sha: eaa99df2697c059b8bb03052380ecc3c1cd99ca722361df223a978a2b05652c8
stamp_error: no ledger rows for work_item_id STORY-002-08
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:52:25Z
  sessions: []
---

# STORY-002-08: Settings files and backups in `init`/`update` reports; `.bak` files gitignored
**Complexity:** L3 — a `backed_up` bucket through the integration reports, two new `init` report fields, and the managed `.gitignore` block extended with backup paths in `init` and `update`. Extends STORY-001-04, STORY-001-05, STORY-002-06 and builds on BUG-002's fix.

## 1. The Spec (The Contract)

### 1.1 User Story
As a developer, I want `init` and `update` to name every agent settings file they touch and every backup they write, and to keep those backups out of git, so that I can see exactly what changed and `git add -A` never commits a wikeeper backup.

### 1.2 Detailed Requirements
- **R1 — Backups are reported as backups.** A `.bak` that enforce writes (a copy of a user's own settings file, made before wikeeper first changes it) appears under `backed_up` in the `init` and `update` reports, and never under `created` or `added`. `InitResult` gains `backed_up: string[]`; `UpdateResult` already has `backed_up` and keeps its exact shape.
- **R2 — Every settings file is named.** `init` lists each agent settings file it plans for enforce in exactly one bucket: `created`, `updated`, `skipped` (unchanged), or the new `removed` (deleted because it no longer holds anything). `InitResult` gains `removed: string[]`. `update` keeps its contract of listing changes only: a changed settings file is under `replaced`, `added` or `removed`.
- **R3 — Backups are gitignored.** The managed `.gitignore` block that `init` writes includes the path of every backup the manifest records as wikeeper's (`kind: "hook"`, `identity: "backup"`), after the fixed entries, sorted and without duplicates. `init` writes the block once, after the integrations have run, so the block matches the final manifest.
- **R4 — `update` keeps the block current.** When `.gitignore` holds a well-formed wikeeper block, `update` recomputes the entries (fixed entries, `private` pages, backups) and replaces the block in place if they differ, reporting `.gitignore` under `replaced`. When the file or the block is missing or malformed, `update` leaves `.gitignore` byte-identical and, if at least one backup exists, adds a warning naming `.gitignore` and the backups that are not ignored, with the fix "run wikeeper init to restore the block".
- **R5 — `remove` takes the entries out.** `remove` strips the whole managed block as it does today, so no backup line remains; a backup that `remove` keeps (the "changed since init" case) stays listed under `kept` with its existing warning.

### 1.3 Out of Scope
- Whether a backup is written at all: [[BUG-002]] (SPRINT-01) stops backups of settings files wikeeper created; this story reports and ignores the backups that remain.
- The `.bak-<stamp>` copies `update` makes of edited `.wiki/system/` files. They hold the user's own edits to package files, are already listed in `backed_up`, and stay visible to git so the user reviews them.
- Doctor's checks for stale or orphaned backups (STORY-002-07).

### 1.4 Open Questions

- None. CR-002 Open Question 2 was answered on 2026-10-16: `init` and `update` add each `.bak` path they write to the managed `.gitignore` block, and `remove` takes it out.

### 1.5 Risks

- **Risk:** Moving the `.gitignore` write after the integrations changes `init.ts`, which STORY-001-08 restructures first.
- **Mitigation:** This story is ordered after STORY-001-08 (`dep_predecessors`); the move happens inside the write section that story leaves in place, and the existing rollback already restores `.gitignore` from `giBytes`.
- **Risk:** `update` now writes `.gitignore`, which it never did; a repo whose block was deleted on purpose must not get it back silently.
- **Mitigation:** R4 only replaces an existing well-formed block; otherwise it leaves the file alone and warns.
- **Risk:** `test/update.red.node.test.ts:181` asserts the exact `UpdateResult` shape for an unchanged repo.
- **Mitigation:** No field is added to `UpdateResult`, and an unchanged repo produces an identical block, so nothing is written or reported.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A backup can be written by `init` or by `update` (enforce turned on later); a settings file can be unchanged or deleted on re-init. |
| Interfaces | F | CLI reports only; human and `--json` output carry the same lists. |
| Data | F | Behaviour does not vary by data shape; all three agents share the same backup path. |
| Rules | T | Backups go under `backed_up` and into the block; `remove` takes them out; a missing block is never recreated by `update`. |

```gherkin
Feature: settings files and backups in reports, backups gitignored

  @rules
  Scenario: a backup written by init is reported, ignored, and taken out by remove
    Given a repository with the user's own .claude/settings.json and a .gitignore containing "node_modules/"
    When I run "wikeeper init --json --agents claude --enforce --yes"
    Then data.updated contains ".claude/settings.json"
    And data.backed_up is [".claude/settings.json.bak"] and data.created does not contain it
    And the wikeeper block in .gitignore contains ".claude/settings.json.bak"
    When I run "wikeeper remove --json"
    Then .gitignore contains no line ".claude/settings.json.bak"
    And .claude/settings.json is byte-identical to the user's original

  @paths
  Scenario: a second init names the unchanged settings file
    Given a repository initialised with "wikeeper init --json --agents claude --enforce --yes"
    When I run "wikeeper init --json"
    Then data.skipped contains ".claude/settings.json"
    And data.created, data.updated, data.removed and data.backed_up are empty

  @paths
  Scenario: a backup written by update is reported and ignored
    Given a repository with the user's own .claude/settings.json, initialised with "--agents claude --yes" and no enforce
    And config.yml is changed to "enforce: true"
    When I run "wikeeper update --json"
    Then data.replaced contains ".claude/settings.json" and ".gitignore"
    And data.backed_up contains ".claude/settings.json.bak" and data.added does not
    And the wikeeper block in .gitignore contains ".claude/settings.json.bak"

  @rules
  Scenario: re-init with fewer agents names the settings files it deletes
    Given a repository initialised with "wikeeper init --json --agents claude,codex --enforce --yes"
    When I run "wikeeper init --json --agents claude"
    Then data.removed contains ".codex/hooks.json" and ".codex/rules/wikeeper.rules"

  Scenario: Error — update never recreates a deleted block
    Given the repository from the first scenario after init, with the wikeeper block deleted from .gitignore by hand
    When I run "wikeeper update --json"
    Then .gitignore is byte-identical
    And the warnings name ".gitignore" and ".claude/settings.json.bak" with "run wikeeper init to restore the block"
    And the exit code is 0
```

### 2.2 Verification Steps (Manual)
- [ ] Repeat walkthrough steps 1.4b–1.4d on a repo with a user-owned `.claude/settings.json`: the `.bak` shows under `backed_up`, and `git status --porcelain` does not list it.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/agents/enforce/index.ts` |
| Related Files | `src/core/integrations.ts`, `src/agents/index.ts`, `src/commands/init.ts`, `src/commands/update.ts`, `src/core/gitignore.ts`, `test/agents/enforce.test.ts`, `test/init.test.ts`, `test/update.test.ts`, `test/gitignore.test.ts` |
| New Files Needed | Yes — `test/settings-reports.test.ts` |

### 3.2 Technical Logic
- `integrations.ts`: `PhaseReport` gains `backed_up?: string[]` and `IntegrationRunResult` gains `backed_up: string[]`; `runIntegrations` merges it like the other lists.
- `agents/index.ts`: the `Acc` accumulator and `merge()` (lines 62–83) carry `backed_up`.
- `enforce/index.ts` (`applyEnforce`): push the written backup to `report.backed_up` instead of `report.created` (line 243); push each planned file that exists and is left unchanged to `report.skipped`. Removed files already go to `report.removed`.
- `init.ts`: `InitResult` gains `removed` and `backed_up` (sorted, deduplicated, excluded from `skipped`), filled from `r.removed` and `r.backed_up`. Compute the `.gitignore` text after `runIntegrations("init")` from `managedIgnoreEntries(paths, config, backupPaths(working))` and write it once there (the write at lines 200–203 moves; `giEntry` stays as is).
- `gitignore.ts`: `managedIgnoreEntries(paths, config, backups: readonly string[] = [])` appends each backup through `formatEntry`, sorted and deduplicated, after the fixed entries and before `private` entries. The default keeps every existing caller and test unchanged.
- `update.ts`: after `runIntegrations("update")`, merge `report.backed_up` into `backedUp`; then read `.gitignore`: if `stripManagedBlock(text).status === "stripped"`, compute `applyManagedBlock(text, entries)` and write it when it differs, pushing `.gitignore` to `replaced`; otherwise leave it and warn per R4 when the manifest records a backup.
- `backupPaths(manifest)`: `manifest.files.filter((e) => e.kind === "hook" && e.identity === "backup").map((e) => e.path)`, a small helper in `gitignore.ts` so `init` and `update` share it.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper init` | CLI | None | unchanged flags | `{ created, updated, skipped, removed, backed_up, manifest }` |
| `wikeeper update` | CLI | None | unchanged | `{ replaced, added, removed, backed_up, warnings }` (unchanged shape) |

## Task Breakdown

- [x] Add `backed_up` to `PhaseReport`, `IntegrationRunResult`, `runIntegrations` and the agents `Acc`/`merge` -> R1
- [x] Report backups under `backed_up` and unchanged files under `skipped` in `applyEnforce` -> R1, R2
- [x] Add `removed` and `backed_up` to `InitResult` -> R1, R2
- [x] Extend `managedIgnoreEntries` with backups; add `backupPaths`; move the `init` `.gitignore` write after the integrations -> R3
- [x] Refresh the block in `update` when present, warn when missing; merge `backed_up` -> R1, R4
- [x] Write the five scenario tests and a `managedIgnoreEntries` unit test for the backups parameter -> R1–R5

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 2 | `managedIgnoreEntries` with backups (order, dedupe, default); `backupPaths`. |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/update.red.node.test.ts`, the BUG-002 tests and `test/e2e/goal.test.ts` stay green.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/agents/enforce/index.ts:243` — a written backup is pushed to `report.created`, so `update` lists it under `added`.
- **Surface:** `src/commands/update.ts:197` — `update` merges the integrations' `created` into `added` and has no `backed_up` input from them.
- **Surface:** `src/commands/init.ts:200` — `.gitignore` is written before the integrations, so backups written later cannot be in the block.
- **Surface:** `src/commands/init.ts:236` — `init` merges `created`, `replaced` and `skipped` from the integrations and drops `removed`.
- **Surface:** `src/core/gitignore.ts:69` — `managedIgnoreEntries` returns a fixed list plus `private` pages.
- **Coverage of this requirement:** partial — reports and the managed block exist; backups are mis-bucketed, unchanged and deleted settings files are not named, and backups are not ignored.

## Prior work

- [[EPIC-002]] (parent), [[CR-002]] items A6 and A7. Extends [[STORY-001-04]] (`init`, managed `.gitignore` block), [[STORY-001-05]] (`update`) and [[STORY-002-06]] (enforce backups); builds on [[BUG-002]]'s fix. The wiki duplicate check found no other prior work.

## Why not simpler?

- **Smallest existing surface that could carry this:** `report.created.push(backup)` in `src/agents/enforce/index.ts:243` and `managedIgnoreEntries` in `src/core/gitignore.ts:69`.
- **Why isn't extension / parameterization / config sufficient?** Re-bucketing the backup is a one-line change, but integrations have no `backed_up` channel to `init` and `update`, `init` has no `removed` list, and the block cannot contain backups while `init` writes `.gitignore` before the integrations run. A static ignore pattern such as `*.bak` would also hide users' own unrelated `.bak` files, so the block lists exactly the paths wikeeper wrote.

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
