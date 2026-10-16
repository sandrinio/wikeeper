---
story_id: STORY-002-02
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
parallel_eligible: y
dep_predecessors:
  - STORY-001-01
  - STORY-001-02
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
last_synced_body_sha: 94c40a68326bfb70cdedc448e4f2679cdb2f891bed1a0b273a6e904076fb764f
stamp_error: no ledger rows for work_item_id STORY-002-02
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:28:35Z
  sessions: []
---

# STORY-002-02: Agent detection and target files
**Complexity:** L2 — one decision module plus an interactive prompt; the rules are small but must match the verified agent matrix exactly.

## 1. The Spec (The Contract)

### 1.1 User Story
As a developer installing wikeeper, I want `init` to work out which agent instruction files to put the wiki block in, based on the agents I use and the files I already have, so that every agent I use finds the wiki without duplicate or useless edits.

### 1.2 Detailed Requirements
- **R1 — Detect:** `detectAgentFiles(root)` reports which of `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` exist at the repository root (exact, case-sensitive names; root only).
- **R2 — Readers:** each file is read by: `CLAUDE.md` → claude; `AGENTS.md` → codex, antigravity, and claude when no `CLAUDE.md` exists; `GEMINI.md` → antigravity (architecture.md §6.2).
- **R3 — Targets:** `resolveTargets(agents, existing)` returns (a) every existing file that at least one configured agent reads, plus (b) `AGENTS.md` (to be created) for any configured agent that would otherwise read no file — claude without `CLAUDE.md`/`AGENTS.md`, codex without `AGENTS.md`, antigravity without `AGENTS.md`/`GEMINI.md`. Order: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`; no duplicates.
- **R4 — Agent selection precedence:** `--agents a,b` flag > config `agents` > interactive prompt. The prompt is a multi-select of claude / codex / antigravity, pre-selected from the files found (`CLAUDE.md` → claude, `GEMINI.md` → antigravity, `AGENTS.md` → codex); the answer is returned so init can save it to config.
- **R5 — No agent files at all (D-12):** `AGENTS.md` is always a target, and the prompt asks which agents are used.
- **R6 — Non-interactive:** without a TTY (or with `--json`), no `--agents` and no config `agents`, return exit code 5 (needs_input) with the allowed choices and the files found; nothing is created.
- **R7 — Validation:** an unknown agent name in `--agents` or config is a usage error (exit 2) naming the allowed values.

### 1.3 Out of Scope
Writing the block (STORY-002-01), calling this from `init` and saving the answer to config (STORY-002-04), nested `AGENTS.md` files in subdirectories, `.claude/CLAUDE.md` and `AGENTS.override.md`.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question:** When Claude is selected and no `CLAUDE.md` exists, should `init` also create `CLAUDE.md`?
- **Recommended:** No. Claude Code (v2.1.277+) reads `AGENTS.md` natively when no `CLAUDE.md` exists; creating `CLAUDE.md` would make Claude stop reading the user's `AGENTS.md`. `doctor` warns about older Claude versions instead (STORY-002-04).
- **Human decision:** No (2026-10-16). AGENTS.md works with Claude Code too; `init` never creates `CLAUDE.md`.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** Agents change which files they read (the matrix was verified on 2026-10-16).
- **Mitigation:** keep the reader table (R2) as one exported constant so a future change is a one-line edit plus test update.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Agents come from the flag, config or the prompt. |
| Interfaces | T | Interactive prompt vs non-interactive / `--json` behave differently. |
| Data | T | Combinations of configured agents and existing files give different targets. |
| Rules | T | Reader table and D-12 (create AGENTS.md when nothing exists). |

```gherkin
Feature: Agent detection and target files

  @data @rules
  Scenario Outline: Targets follow the reader table
    Given the repository root contains <files>
    And the configured agents are <agents>
    When targets are resolved
    Then the targets are <targets>

    Examples:
      | files                 | agents             | targets                          |
      | CLAUDE.md, AGENTS.md  | claude, codex      | CLAUDE.md, AGENTS.md             |
      | CLAUDE.md             | codex              | AGENTS.md (create)               |
      | CLAUDE.md             | claude             | CLAUDE.md                        |
      | GEMINI.md             | antigravity        | GEMINI.md                        |
      | AGENTS.md, GEMINI.md  | antigravity        | AGENTS.md, GEMINI.md             |
      | (none)                | claude, antigravity| AGENTS.md (create)               |

  @paths
  Scenario: The --agents flag wins over config and skips the prompt
    Given config agents "claude"
    When "wikeeper init --agents codex" resolves agents
    Then the agents are "codex"
    And no prompt is shown

  @interfaces @rules
  Scenario: No agent files prompts for agents and targets AGENTS.md
    Given an interactive terminal and no CLAUDE.md, AGENTS.md or GEMINI.md
    When init resolves agents and the user selects "claude" and "codex"
    Then the selection "claude, codex" is returned for saving to config
    And the only target is "AGENTS.md (create)"

  @interfaces
  Scenario: Error — non-interactive run without agents asks for input
    Given no TTY, no --agents flag, no config agents and no agent files
    When "wikeeper init --json" resolves agents
    Then the command exits with code 5
    And the JSON output lists the choices "claude", "codex", "antigravity" and the files found
    And no file is created

  Scenario: Error — unknown agent name is rejected
    When "wikeeper init --agents claude,cursor" resolves agents
    Then the command exits with code 2
    And the message names "cursor" and the allowed values
```

### 2.2 Verification Steps (Manual)
- [ ] Run the prompt in a real terminal and confirm the pre-selection matches the files present.
- [ ] Pipe `init` through `cat` (no TTY) and confirm exit code 5 with a readable message.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/agents/detect.ts` |
| Related Files | `src/agents/ask-agents.ts` |
| Test Files | `test/agents/detect.test.ts` |
| New Files Needed | Yes — `src/agents/detect.ts`, `src/agents/ask-agents.ts`, `test/agents/detect.test.ts` |

### 3.2 Technical Logic
- `AGENT_FILE_READERS` constant implements R2; `resolveTargets` is pure and returns `{ path, create: boolean }[]`.
- `resolveAgents({ flag, config, isTTY, json, existing, ask })` implements R4–R7 and returns either `{ agents, source }` or a needs-input result carrying the choices; the prompt function is injected so tests don't need a TTY.
- `ask-agents.ts` implements the multi-select with `node:readline` (no new dependency): numbered list, comma-separated answer, Enter accepts the pre-selection.
- Exit codes and JSON shape come from the EPIC-001 output and exit-code modules.

### 3.3 API Contract (if applicable)

Not applicable — internal module; consumed by `init` through STORY-002-04.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 10 | Each Examples row, flag/config/prompt precedence, unknown agent |
| Integration tests | 1 | `detectAgentFiles` against a temp directory |
| E2E / acceptance tests | 5 | 1 per Gherkin scenario in §2.1 |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Reader table matches architecture.md §6.2.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts` — commander program whose `init` options (added in EPIC-001) supply `--agents`.
- **Surface:** `./architecture.md` — §6.2 reader matrix and D-12.
- **Coverage of this requirement:** none — net-new decision logic.

## Prior work

- [[EPIC-002]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** Always writing to all three files would put the block in files no configured agent reads and, worse, creating `CLAUDE.md` would hide the user's `AGENTS.md` from Claude. Always writing only `AGENTS.md` would miss Claude whenever `CLAUDE.md` exists. A small reader table is the least logic that gets every agent covered once.

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

