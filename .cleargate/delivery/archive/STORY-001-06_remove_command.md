---
story_id: STORY-001-06
parent_epic_ref: EPIC-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Completed
approved: true
ambiguity: 🟢 Low
context_source: EPIC-001 (approved 2026-10-16) · architecture.md v0.4 · verified src/program.ts
actor: Developer installing wikeeper in a repo
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-001-03
  - STORY-001-04
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T13:30:00Z
updated_at: 2026-10-16T13:30:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 7
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
last_synced_body_sha: a57f065b241930ca2c1e09b70ed8e83d275cf5424d66452ca686dc12d0fbc9ea
stamp_error: no ledger rows for work_item_id STORY-001-06
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:29:39Z
  sessions: []
---

# STORY-001-06: `wikeeper remove` and `--purge`
**Complexity:** L2 — one destructive command with a confirmation rule. Depends on STORY-001-03 and 001-04.

## 1. The Spec (The Contract)

### 1.1 User Story
As a developer installing wikeeper in a repo, I want to uninstall wikeeper's tooling without losing the knowledge it collected, and to delete everything only when I explicitly confirm it, so that uninstalling can never cost me my wiki by accident.

### 1.2 Detailed Requirements
- **R1 — Command.** `wikeeper remove [--purge] [--confirm <word>] [--json]` is registered. Without a manifest it fails with exit 1: "not initialised".
- **R2 — Default remove.** Deletes every manifest-listed file (edited or not), the manifest itself and the then-empty `.wiki/system/`; runs `runIntegrations("remove", ctx)`; strips the managed `.gitignore` block, leaving all other bytes unchanged. Keeps `config.yml`, `kb_instructions.md`, `me.md`, `index.md`, `raw/`, `pages/` and `log/`.
- **R3 — Purge.** `--purge` additionally deletes `.wiki/` and the content directory (when `content_dir` differs) — only after confirmation: in an interactive terminal the user types `wikeeper`; otherwise `--confirm wikeeper` is required.
- **R4 — Refusals.** Non-interactive `--purge` without `--confirm` → exit 5 (needs_input); a wrong confirmation word → exit 1. In both cases nothing is deleted, not even package files.
- **R5 — Output.** `--json` returns `{ removed: [...], kept: [...], purged: boolean }`.

### 1.3 Out of Scope
- Stripping agent wiring (EPIC-002 `remove` handler; this story only calls the hook point).
- Restoring files from `.bak-` backups.

### 1.4 Open Questions

- None — decisions recorded in architecture.md and EPIC-001.

### 1.5 Risks

- **Risk:** A path bug deletes outside the wiki.
- **Mitigation:** Every deletion target is checked to be inside `.wiki/` or the content directory before removal; a test asserts a sibling file survives `--purge`.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Default remove and confirmed purge are distinct successful paths. |
| Interfaces | F | CLI only. |
| Data | F | Behaviour does not depend on file contents. |
| Rules | T | Knowledge is kept by default; purge requires confirmation; text outside the managed block is preserved. |

```gherkin
Feature: wikeeper remove

  @paths @rules
  Scenario: remove keeps knowledge
    Given an initialised repository with pages, raw sources and a registered test integration
    When I run "wikeeper remove --json"
    Then .wiki/system/ no longer exists
    And config.yml, kb_instructions.md, index.md, pages/, raw/ and log/ remain unchanged
    And the test integration's remove handler ran once
    And "purged" is false

  @rules
  Scenario: The managed .gitignore block is stripped
    Given a .gitignore with user lines before and after the wikeeper managed block
    When I run "wikeeper remove"
    Then .gitignore equals the user lines with the block removed

  @paths
  Scenario: Confirmed purge deletes the wiki
    Given an initialised repository with "content_dir: wiki" and a sibling file notes.txt
    When I run "wikeeper remove --purge --confirm wikeeper"
    Then .wiki/ and wiki/ no longer exist
    And notes.txt still exists

  @rules
  Scenario Outline: Error — purge without valid confirmation is refused
    Given an initialised repository and a non-interactive terminal
    When I run "wikeeper remove --purge <flags> --json"
    Then the exit code is <exit>
    And no file was deleted

    Examples:
      | flags          | exit |
      |                | 5    |
      | --confirm yes  | 1    |

  Scenario: Error — remove before init
    Given a repository without .wiki/system/manifest.json
    When I run "wikeeper remove --json"
    Then the exit code is 1
    And the JSON error message contains "not initialised"
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo, run `wikeeper remove --purge` interactively, type a wrong word, and confirm nothing is deleted.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/commands/remove.ts` |
| Related Files | `src/core/gitignore.ts`, `src/program.ts`, `test/remove.test.ts` |
| New Files Needed | Yes — `src/commands/remove.ts`, `test/remove.test.ts` |

### 3.2 Technical Logic
- Validate confirmation first; only then start deleting (all-or-nothing from the user's point of view).
- Interactive detection: `process.stdin.isTTY && !json`; prompt via `node:readline/promises`.
- Add `stripManagedBlock(text)` to `src/core/gitignore.ts` (pure function); delete `.gitignore` only if it becomes empty and wikeeper created it — otherwise write the remainder.
- Use `rm({ recursive: true, force: true })` only on paths verified to be inside the wiki or content directory.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper remove` | CLI | None | `--purge`, `--confirm <word>`, `--json` | `{ removed: string[], kept: string[], purged: boolean }` |

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 2 | `stripManagedBlock` with and without surrounding text |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts` — command registry where `remove` is registered.
- **Coverage of this requirement:** partial — registration only; the command is net-new.

## Prior work

- [[EPIC-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/program.ts`.
- **Why isn't extension / parameterization / config sufficient?** Telling users to delete `.wiki/system/` by hand leaves the `.gitignore` block and agent wiring behind, and deleting `.wiki/` wholesale destroys knowledge. A manifest-driven remove plus an explicitly confirmed purge is the smallest safe design.

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
