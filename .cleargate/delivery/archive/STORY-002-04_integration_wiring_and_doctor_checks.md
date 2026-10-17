---
story_id: STORY-002-04
parent_epic_ref: EPIC-002
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Completed
approved: true
ambiguity: 🟢 Low
context_source: EPIC-002 (approved 2026-10-16) · architecture.md v0.4 §6 (agent matrix verified 2026-10-16) · verified src/program.ts
actor: Developer installing wikeeper in a repository
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-001-01
  - STORY-001-04
  - STORY-001-05
  - STORY-001-06
  - STORY-001-07
  - STORY-002-01
  - STORY-002-02
  - STORY-002-03
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T13:30:00Z
updated_at: 2026-10-16T13:30:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 5
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:31:23Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 01ed3a04c808f3f6194016b29e5f0a5448dbe5fa37073c5b016047a40420209e
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: claude-opus-5-5
  last_stamp: 2026-10-16T13:52:30Z
  sessions:
    - session: 0c4a6f7d-67f2-4c9b-b197-e5402f57ab69
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-16T13:42:19Z
---

# STORY-002-04: Integration wiring and doctor checks
**Complexity:** L2 — composes STORY-002-01..03 behind the EPIC-001 hook point and adds read-only doctor checks.

## 1. The Spec (The Contract)

### 1.1 User Story
As a developer, I want `init`, `update`, `remove` and `doctor` to set up, refresh, undo and check my agent wiring automatically, so that I never have to edit agent files by hand and can see at a glance when something is off.

### 1.2 Detailed Requirements
- **R1 — Registration:** `src/agents/index.ts` registers an `agents` integration with `src/core/integrations.ts` for the phases `init`, `update`, `remove`, `doctor`; `src/program.ts` imports it so registration happens at start-up.
- **R2 — init:** resolve agents and targets (STORY-002-02) and save the chosen agents to config; inject the block from `templates/agent-block.md` (STORY-002-01) into each target; install skills and sub-agents (STORY-002-03). Manifest entries: `kind: block` with the file path and `created: true|false`.
- **R3 — update:** refresh skills and sub-agents from the new templates (package-owned files listed in the manifest); never touch blocks (D-11).
- **R4 — remove:** strip the block from every `kind: block` file; delete skills, symlinks and sub-agents listed in the manifest; delete a `created: true` agent file only when it is empty after stripping; delete directories wikeeper created only when they are empty. Text outside the markers stays byte-identical.
- **R5 — doctor checks** (each with id, severity, file, message): `agent-block-missing` (error: a target file lacks the block), `agent-block-duplicated` (error: more than one START marker), `agent-block-markers-deleted` (warning: block text present without markers), `claude-agents-md-only` (warning: claude configured, only `AGENTS.md` — needs Claude Code v2.1.277+), `skill-link-broken` (error), `codex-trust` (info: codex configured and enforce on — project hooks apply only in trusted projects).
- **R6 — Output:** all phases report through the EPIC-001 output module (`--json` supported); doctor exits 1 when any error-severity check fails, 0 otherwise.

### 1.3 Out of Scope
Enforcement hooks and permission rules (STORY-002-06; this story only exposes the `codex-trust` check), block wording (EPIC-006), non-agent doctor checks (EPIC-001).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- None — decisions recorded in architecture.md and EPIC-002.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** The EPIC-001 hook-point signature differs from what this story assumes.
- **Mitigation:** depend on the `integrations.ts` contract from the EPIC-001 CLI-core story; the Architect pins the signature in the milestone plan before either story starts.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | init, update and remove are separate flows through the integration. |
| Interfaces | T | Human output vs `--json` for doctor. |
| Data | T | Different doctor findings per repository state. |
| Rules | T | D-11: blocks are never modified by update; remove keeps user text. |

```gherkin
Feature: Integration wiring and doctor checks

  @paths
  Scenario: init wires a repository with an existing CLAUDE.md
    Given a repository with CLAUDE.md containing "# Team rules\n" and config agents "claude, codex"
    When I run "wikeeper init --yes"
    Then CLAUDE.md starts with the WIKI block followed by "# Team rules\n"
    And AGENTS.md is created with the block
    And skills and sub-agents for claude and codex are installed
    And the manifest lists both block files, AGENTS.md with created true

  @rules
  Scenario: update refreshes skills but leaves an edited block alone
    Given an initialised repository whose CLAUDE.md block the user edited
    When a newer package version runs "wikeeper update"
    Then CLAUDE.md is byte-identical
    And .agents/skills/wiki-ingest/SKILL.md matches the new template

  @paths @rules
  Scenario: remove restores agent files
    Given the repository from the first scenario
    When I run "wikeeper remove"
    Then CLAUDE.md is byte-identical to its content before init
    And AGENTS.md, the skills and the sub-agents are deleted

  @data @interfaces
  Scenario Outline: doctor reports agent wiring problems
    Given an initialised repository where <problem>
    When I run "wikeeper doctor --json"
    Then the output contains check "<check>" with severity "<severity>"
    And the exit code is <code>

    Examples:
      | problem                                              | check                         | severity | code |
      | CLAUDE.md has two WIKI:START markers                 | agent-block-duplicated        | error    | 1    |
      | AGENTS.md has the block text but no markers          | agent-block-markers-deleted   | warning  | 0    |
      | claude is configured and only AGENTS.md exists       | claude-agents-md-only         | warning  | 0    |
      | .claude/skills/wiki-ingest points to a missing folder | skill-link-broken            | error    | 1    |
      | codex is configured and enforce is true              | codex-trust                   | info     | 0    |

  Scenario: Error — doctor fails when a target lost its block
    Given an initialised repository where the user deleted the block and markers from AGENTS.md
    When I run "wikeeper doctor --json"
    Then the exit code is 1
    And the output contains check "agent-block-missing" naming AGENTS.md
```

### 2.2 Verification Steps (Manual)
- [ ] Run `init` then `remove` on a copy of a real repository and confirm `git status` shows no changes to pre-existing files.
- [ ] Read `doctor` human output and confirm each message says what to do next.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/agents/index.ts` |
| Related Files | `src/agents/doctor-checks.ts`, `src/program.ts` |
| Test Files | `test/agents/integration.test.ts`, `test/agents/doctor-checks.test.ts` |
| New Files Needed | Yes — `src/agents/index.ts`, `src/agents/doctor-checks.ts`, `test/agents/integration.test.ts`, `test/agents/doctor-checks.test.ts` |

### 3.2 Technical Logic
- `index.ts` exports `agentsIntegration = { init, update, remove, doctor }` and calls `registerIntegration({ name: 'agents', ...agentsIntegration })` (the single-object form frozen by STORY-001-04); `src/program.ts` adds `import './agents/index.js'`.
- `init`: `resolveAgents` → save to config via `src/core/config.ts` → `resolveTargets` → for each target `injectIntoFile(path, block)` where `block` comes from the template loader → `installSkills` / `installSubagents` → manifest entries.
- `remove`: iterate manifest entries by kind in reverse install order; `stripFromFile`; unlink files and links; `rmdir` only on empty directories recorded as created.
- `doctor-checks.ts`: pure functions over the file system and manifest; the markers-deleted check looks for the block's signature lines (heading plus the `.wiki/system/WIKI.md` reference) outside markers.

### 3.3 API Contract (if applicable)

Not applicable — no new command; behaviour is exposed through `init`, `update`, `remove` and `doctor` from EPIC-001.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | One per doctor check |
| Integration tests | 3 | init / update / remove against temp repositories |
| E2E / acceptance tests | 5 | 1 per Gherkin scenario in §2.1 (outline rows count once each) |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] init → remove leaves pre-existing agent files byte-identical.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts` — program entry that gains the side-effect import registering the integration.
- **Surface:** `src/cli.ts` — bin entry; unchanged, runs the program.
- **Coverage of this requirement:** partial — entry point only; the integration is net-new.

## Prior work

- [[EPIC-002]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/program.ts`.
- **Why isn't extension / parameterization / config sufficient?** Calling the agent installers directly from each lifecycle command would spread agent knowledge across EPIC-001's commands and make `remove` guess what was installed. Registering one integration that reads and writes the manifest keeps agent logic in `src/agents/` and makes undo exact.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (Planned paths for new files accepted by the human at Gate 1, 2026-10-16.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
