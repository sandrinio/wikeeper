---
story_id: STORY-002-06
parent_epic_ref: EPIC-002
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Completed
approved: true
ambiguity: 🟢 Low
context_source: EPIC-002 (approved 2026-10-16) · architecture.md v0.4 §6 (agent matrix verified 2026-10-16) · verified src/program.ts
actor: Developer who wants wiki writes enforced, not just instructed
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-001-02
  - STORY-001-03
  - STORY-002-04
  - STORY-002-05
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T13:30:00Z
updated_at: 2026-10-16T13:30:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 4
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:31:22Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 3d4bac68757c2676be15e8b5cadd413053d3f546eda53ff3fbe92a74a4955308
stamp_error: no ledger rows for work_item_id STORY-002-06
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T15:31:48Z
  sessions: []
---

# STORY-002-06: `--enforce` — hooks and permission rules in agent settings
**Complexity:** L3 — merges into three user-owned settings formats safely and reversibly; cross-cutting with init, remove and doctor.

## 1. The Spec (The Contract)

### 1.1 User Story
As a developer who wants the wiki's rules enforced, I want `init` to add a write guard and permission rules to my agents' own settings — without disturbing anything I configured — so that agents can't edit pages outside an ingest and, in `ask` mode, my agent's harness asks me before an ingest starts.

### 1.2 Detailed Requirements
- **R1 — Turning it on (D-30):** enforcement is enabled by `init --enforce`, by config `enforce: true`, or by answering "y" to an interactive prompt that defaults to no. Non-interactive runs without the flag or config do not enable it and do not prompt. When enabled, `enforce: true` is saved to config.
- **R2 — Claude (`.claude/settings.json`):** add a `hooks.PreToolUse` entry with matcher `Edit|Write|MultiEdit` running the guard command for claude; add permission rules by `ingest.permission`: `ai` → `permissions.allow` gets `Bash(npx wikeeper ingest *)` and `Bash(wikeeper ingest *)` (changed by CR-001); `ask` → `permissions.ask` gets `Bash(npx wikeeper ingest start *)` and `Bash(wikeeper ingest start *)`; `whitelist` → no rule (the CLI enforces the whitelist).
- **R3 — Codex:** `.codex/hooks.json` gets a PreToolUse entry for `apply_patch` (matched as Edit/Write) running the guard for codex; `.codex/rules/wikeeper.rules` gets `prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")` for `ai` (changed by CR-001) or `prefix_rule(pattern=["npx","wikeeper","ingest","start"], decision="prompt")` for `ask`; nothing for `whitelist`.
- **R4 — Antigravity:** `.agents/hooks.json` gets a PreToolUse entry for `write_to_file|replace_file_content` running the guard for antigravity. No permission rules (no project-level file exists).
- **R5 — Guard command:** use `wikeeper` when it resolves on PATH or in `node_modules/.bin`, otherwise `npx -y wikeeper@<installed version>`; the chosen form is written into every hook entry.
- **R6 — Safe merge:** parse the existing file strictly; on a parse error stop with exit code 1, leave the file byte-identical and name the file and the error. Before the first change to an existing file, write `<file>.bak` (user-owned files only — BUG-002). Keep every user key and the order of existing keys. Re-running adds no duplicate entries.
- **R7 — Ownership and undo:** each added entry is recorded in the manifest (`kind: hook | rule`, file, entry identity). `remove` deletes exactly those entries; a settings file that wikeeper created and that is empty afterwards is deleted.
- **R8 — Doctor notes:** with enforce on, `doctor` reports `codex-trust` (codex configured: project hooks and rules only apply in trusted projects, approve them with `/hooks`) and `antigravity-ask-fallback` (antigravity configured with `ask`: no project rule file, approval happens in chat).
- **Spec clarifications (2026-10-16, CR:spec-clarification from `.cleargate/sprint-runs/SPRINT-01/plans/hook-protocols-research.md`; supersede R2–R5/R8 where they differ):**
  - Claude matcher is `Edit|Write|MultiEdit|NotebookEdit`. Codex matcher stays `apply_patch`. Antigravity matcher is `write_to_file|replace_file_content|multi_replace_file_content`.
  - `.agents/hooks.json` is keyed by hook name: `{ "wikeeper-guard": { "PreToolUse": [ … ] } }` — the name key is the entry identity for merge and remove (R6/R7). Exact entry shapes for all three files follow the research file.
  - Permission rules additionally cover other invocation forms, without removing the ones in R2/R3: Codex adds `prefix_rule(pattern=["wikeeper","ingest"], …)` for `ai` (changed by CR-001) and `["wikeeper","ingest","start"]` for `ask`.
  - R5 command form: bare `wikeeper` only when it resolves on `PATH`; when it is only in `node_modules/.bin`, write a form that works from the hook's working directory without `PATH` (Architect picks it from the research file); otherwise `npx -y wikeeper@<installed version>`.
  - R4: Antigravity project-scope permission rules exist but live outside the repo (`~/.gemini/config/projects/`), so wikeeper still writes none.
  - R8: `codex-trust` also says hooks must be re-approved in `/hooks` after `wikeeper update` changes the command. Add note `antigravity-trust` (antigravity configured with enforce on: workspace hooks load only after the folder is trusted).
- **Review clarifications (2026-10-16, CR:spec-clarification from an external review the human directed into this sprint):**
  - R6/R7: `remove` restores the original bytes even when the original already held an empty container on wikeeper's path (`"hooks": {}`, `"permissions": { "allow": [] }`).
  - Malformed settings: `init` with enforce enabled (flag, config or prompt) and any unparseable target settings file exits 1 and leaves the whole repository byte-identical. All settings files are parsed in a preflight before `init` writes anything, and agent-side writes are rolled back if a later step fails.
  - Hook, rule and backup manifest entries carry `sha256: null`, so `doctor` never reports `manifest-drift` for user edits to settings files; `update` re-renders a pinned `npx -y wikeeper@<version>` guard command with the running version.

### 1.3 Out of Scope
The guard command itself (STORY-002-05), the lock file (EPIC-003), Antigravity user-level permission settings, Gemini CLI policies.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- None — decisions recorded in architecture.md (D-30, §6.6) and EPIC-002.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** Running the guard through `npx` on every write tool call adds noticeable latency.
- **Mitigation:** prefer a resolved `wikeeper` binary (R5); `doctor` suggests installing wikeeper as a dev dependency when only `npx` is available.
- **Risk:** Exact hook and rules formats for Codex and Antigravity drift from the 2026-10-16 documentation.
- **Mitigation:** the Architect re-verifies the formats before development; each agent writer is a separate module with its own fixtures.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Enabled by flag, config or prompt; install vs remove. |
| Interfaces | T | Three agents, three settings formats. |
| Data | F | Settings content varies, but behaviour is covered by the merge rule scenario rather than by data shape. |
| Rules | T | Permission mode decides the rules; user keys must survive. |

```gherkin
Feature: --enforce hooks and permission rules

  @paths
  Scenario Outline: How enforcement gets turned on
    Given config agents "claude" and <source>
    When "wikeeper init" runs <terminal>
    Then .claude/settings.json <outcome>

    Examples:
      | source                        | terminal              | outcome                                   |
      | the --enforce flag            | non-interactively     | has the guard hook and config enforce true |
      | config enforce: true          | non-interactively     | has the guard hook                         |
      | no flag or config             | answering "y"         | has the guard hook and config enforce true |
      | no flag or config             | pressing Enter        | is not created or changed                  |
      | no flag or config             | non-interactively     | is not created or changed                  |

  @interfaces
  Scenario Outline: Each agent gets its hook and doctor note
    Given config agents "<agent>", ingest.permission "ask" and wikeeper resolvable on PATH
    When I run "wikeeper init --enforce --yes"
    Then <files> contain a guard entry running "wikeeper hook guard --agent <agent>"
    And "wikeeper doctor" reports <note>

    Examples:
      | agent       | files                                               | note                       |
      | claude      | .claude/settings.json                               | no enforcement note        |
      | codex       | .codex/hooks.json and .codex/rules/wikeeper.rules   | codex-trust                |
      | antigravity | .agents/hooks.json                                  | antigravity-ask-fallback   |

  @rules
  Scenario Outline: Permission mode decides the rules
    Given config agents "claude, codex" and ingest.permission "<mode>"
    When I run "wikeeper init --enforce --yes"
    Then .claude/settings.json has <claude_rule>
    And .codex/rules/wikeeper.rules has <codex_rule>

    Examples:
      | mode      | claude_rule                                         | codex_rule                                           |
      | ai        | allow "Bash(npx wikeeper ingest *)" and "Bash(wikeeper ingest *)" (changed by CR-001) | prefix_rule ["npx","wikeeper","ingest"] decision "allow" (changed by CR-001)     |
      | ask       | ask "Bash(npx wikeeper ingest start *)" and "Bash(wikeeper ingest start *)" | prefix_rule ["npx","wikeeper","ingest","start"] decision "prompt" |
      | whitelist | no permission rule                                  | no rule                                              |

  @paths @rules
  Scenario: User settings survive install, re-run and remove
    Given .claude/settings.json with user keys "model" and "permissions.deny"
    And wikeeper is not resolvable, so the guard runs through "npx -y wikeeper@<version>"
    When I run "wikeeper init --enforce --yes" twice and then "wikeeper remove"
    Then after the first init .claude/settings.json.bak holds the original content
    And after the second init there is exactly one guard entry using the npx form
    And the user keys are unchanged throughout
    And after remove .claude/settings.json is byte-identical to the original

  Scenario: Error — a malformed settings file is never overwritten
    Given .claude/settings.json containing "{ not json"
    When I run "wikeeper init --enforce --yes --json"
    Then the command exits with code 1
    And .claude/settings.json is byte-identical
    And the JSON output names .claude/settings.json and the parse error
```

### 2.2 Verification Steps (Manual)
- [ ] In Claude Code, run `/hooks` after `init --enforce` and confirm the guard is listed.
- [ ] In Codex, mark the project trusted, approve the hook via `/hooks`, and confirm a page edit outside an ingest is denied.
- [ ] In `ask` mode, ask Claude Code to start an ingest and confirm the harness prompts before running it.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/agents/enforce/index.ts` |
| Related Files | `src/agents/enforce/claude.ts`, `src/agents/enforce/codex.ts`, `src/agents/enforce/antigravity.ts`, `src/agents/enforce/json-merge.ts`, `src/agents/enforce/guard-command.ts` |
| Modified Files | `src/agents/index.ts`, `src/agents/doctor-checks.ts` |
| Test Files | `test/agents/enforce.test.ts`, `test/agents/json-merge.test.ts`, `test/e2e/goal.test.ts` (Windows CI timeout only; owned by STORY-002-04) |
| Fixtures | `test/fixtures/settings/claude-settings-user.json`, `test/fixtures/settings/claude-settings-malformed.json` |
| New Files Needed | Yes — all files above except the two modified files |

### 3.2 Technical Logic
- `index.ts`: `resolveEnforce({ flag, config, isTTY, ask })` (R1); `applyEnforce(ctx)` and `removeEnforce(ctx)` call the per-agent writers for configured agents; called from the `agents` integration's `init` and `remove` (STORY-002-04).
- `json-merge.ts`: `mergeJsonFile(path, mutate)` — strict `JSON.parse`; on error throw a typed error carrying path and message; write `.bak` once (only if it doesn't exist and the file existed); apply `mutate` on the parsed object; serialise with the file's detected indentation and trailing newline; skip the write when nothing changed. Entries are compared by identity (matcher + command, or rule string) to stay idempotent.
- `codex.ts` writes the `.rules` file as wikeeper-owned whole lines; removal deletes those lines only.
- `guard-command.ts`: check `node_modules/.bin/wikeeper`, then `which wikeeper` (via `PATH` scan), else `npx -y wikeeper@${VERSION}`.
- Manifest entries: `{ kind: 'hook' | 'rule', file, identity, created }`.

### 3.3 API Contract (if applicable)

Not applicable — no new command; behaviour is exposed through `init --enforce`, `remove` and `doctor`.

## Task Breakdown

- [x] Implement `json-merge.ts` (strict parse, typed error, one-time `.bak`, indentation-preserving write, idempotent identity compare) with unit tests -> R6
- [x] Implement `guard-command.ts` resolution order with tests -> R5
- [x] Implement `resolveEnforce` (flag / config / prompt default no / non-interactive no) and save `enforce: true` -> R1
- [x] Implement the Claude writer: PreToolUse hook entry and permission rules per mode -> R2
- [x] Implement the Codex writer: `.codex/hooks.json` entry and `.codex/rules/wikeeper.rules` lines -> R3
- [x] Implement the Antigravity writer: `.agents/hooks.json` entry -> R4
- [x] Record manifest entries and implement `removeEnforce` (exact entry removal, delete created-and-empty files) -> R7
- [x] Add `codex-trust` and `antigravity-ask-fallback` doctor checks -> R8
- [x] Wire `applyEnforce` / `removeEnforce` into `src/agents/index.ts` (insertion points 1-5 only)
- [x] Write one test per Gherkin scenario in §2.1 using the settings fixtures (covered by QA-Red test/agents/enforce.red.node.test.ts; no separate enforce.test.ts or json-merge.test.ts)

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 8 | json-merge behaviours, guard-command resolution, rule generation per mode |
| Integration tests | 3 | One per agent writer against a temp repository |
| E2E / acceptance tests | 5 | 1 per Gherkin scenario in §2.1 |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] init --enforce → remove leaves every pre-existing settings file byte-identical.
- [ ] Hook and rules formats re-verified against the agents' documentation and cited in the test fixtures.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `./architecture.md` — §6.6 harness enforcement and §6.2 per-agent hook and rule locations.
- **Surface:** `src/program.ts` — `init` options gain `--enforce` through EPIC-001's command definition.
- **Coverage of this requirement:** none — net-new settings writers.

## Prior work

- [[EPIC-002]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** Shipping ready-made settings files would overwrite the user's own Claude, Codex and Antigravity settings, and printing instructions for the user to paste would leave enforcement half-applied and impossible to undo cleanly. A strict merge with ownership tracking is the least that can add and later remove exactly wikeeper's entries.

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
