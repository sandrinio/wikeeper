---
story_id: STORY-001-07
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
parallel_eligible: n
dep_predecessors: ["STORY-001-02", "STORY-001-03", "STORY-001-04"]
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
  last_gate_check: 2026-10-16T13:30:05Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-001-07
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:30:04Z
  sessions: []
---

# STORY-001-07: `wikeeper doctor` and setup state
**Complexity:** L2 — two small commands over config, manifest and the integration hook point. Depends on STORY-001-02, 001-03 and 001-04.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent, I want one command that tells me whether the wiki install is healthy and whether setup has been completed, so that I know whether to run the setup instructions or fix something first.

### 1.2 Detailed Requirements
- **R1 — Checks.** `wikeeper doctor [--json]` runs, in order: `node-version` (≥ 22.12), `wiki-initialised`, `config-valid` (config errors → error, unknown keys → warning), `manifest-drift` (missing → error, modified → warning), then every check returned by registered integrations' `doctor` handlers. Each check is `{ id, severity: "ok" | "warning" | "error", message, fix? }`.
- **R2 — Result.** Exit 1 if any check has severity `error`, otherwise 0. `--json` returns `{ checks: [...], errors: n, warnings: n }`.
- **R3 — Setup state.** `wikeeper setup [--json]` reports `{ setup_completed_at, profile }`.
- **R4 — Mark setup done.** `wikeeper setup --done` stamps `setup_completed_at` with the current UTC ISO time using the comment-preserving writer; if it is already set, nothing changes and the existing value is reported.

### 1.3 Out of Scope
- Agent-wiring checks (contributed by EPIC-002 through the hook point).
- Automatic fixes.

### 1.4 Open Questions

- None — decisions recorded in architecture.md and EPIC-001.

### 1.5 Risks

- **Risk:** Tests can't change the running Node version.
- **Mitigation:** The node-version check takes the version string as a parameter (defaulting to `process.versions.node`).

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Built-in checks and integration-contributed checks are distinct successful paths. |
| Interfaces | F | CLI only. |
| Data | T | Drift severity depends on whether a file was edited or deleted. |
| Rules | T | Any error severity → exit 1; setup is stamped once. |

```gherkin
Feature: wikeeper doctor and setup state

  @paths
  Scenario: A healthy install passes every check
    Given an initialised repository, Node 22.12 or newer and a registered integration contributing check "test-check" with severity ok
    When I run "wikeeper doctor --json"
    Then checks include node-version, wiki-initialised, config-valid, manifest-drift and test-check, all "ok"
    And the exit code is 0

  @data @rules
  Scenario Outline: Manifest drift is graded by kind
    Given an initialised repository where .wiki/system/WIKI.md is <change>
    When I run "wikeeper doctor --json"
    Then check "manifest-drift" has severity "<severity>"
    And the exit code is <exit>

    Examples:
      | change  | severity | exit |
      | edited  | warning  | 0    |
      | deleted | error    | 1    |

  @rules
  Scenario: setup --done stamps once and preserves comments
    Given config.yml with a comment and "setup_completed_at: null"
    When I run "wikeeper setup --done --json" twice
    Then setup_completed_at holds the time from the first run
    And the comment is still present
    And "wikeeper setup --json" reports that time and profile "management"

  @rules
  Scenario: Error — old Node version is an error
    Given the node-version check receives "20.11.0"
    When doctor runs
    Then check "node-version" has severity "error" and a fix mentioning "22.12"
    And the exit code is 1

  Scenario: Error — invalid config is reported
    Given config.yml with "ingest.permission: sometimes"
    When I run "wikeeper doctor --json"
    Then check "config-valid" has severity "error" naming "ingest.permission" and "ai, ask, whitelist"
    And the exit code is 1
```

### 2.2 Verification Steps (Manual)
- [ ] Run `wikeeper doctor` in a scratch repo before and after `init` and read the human output.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/commands/doctor.ts` |
| Related Files | `src/commands/setup.ts`, `src/program.ts`, `test/doctor.test.ts`, `test/setup.test.ts` |
| New Files Needed | Yes — `src/commands/doctor.ts`, `src/commands/setup.ts`, `test/doctor.test.ts`, `test/setup.test.ts` |

### 3.2 Technical Logic
- Checks are functions `(ctx) => Check | Check[]`; doctor runs them sequentially and never stops early, so the agent sees every problem at once.
- If the wiki is not initialised, later checks that need config/manifest are reported as `error` with fix "run wikeeper init" rather than crashing.
- Version comparison with a small semver compare on `major.minor.patch`.
- `setup --done` uses `setConfigValue` from STORY-001-02.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper doctor` | CLI | None | `--json` | `{ checks: Check[], errors: number, warnings: number }` |
| `wikeeper setup` | CLI | None | `--done`, `--json` | `{ setup_completed_at: string \| null, profile: string }` |

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 3 | version compare; check ordering; not-initialised fallback |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts` — command registry where `doctor` and `setup` are registered.
- **Coverage of this requirement:** partial — registration only; both commands are net-new.

## Prior work

- [[EPIC-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/program.ts`.
- **Why isn't extension / parameterization / config sufficient?** The agent's setup instructions branch on "is setup done?" and "is the install healthy?"; without a command that answers both in JSON, every agent would re-implement the checks by reading files. Integration-contributed checks let EPIC-002 add wiring checks without touching this command.

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
