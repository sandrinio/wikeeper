---
story_id: STORY-002-10
parent_epic_ref: EPIC-002
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
ambiguity: 🟢 Low
context_source: CR-003 F3 and F4 (approved 2026-10-17; walkthrough rows 1.6, 6.2) · split out of STORY-002-09 (SPRINT-03 gate1-decisions.md 2026-10-17, split 1) · SPRINT-03 consistency-audit.md 2026-10-17 (shared-files table, finding 13) · EPIC-002 · verified src/agents/index.ts, src/agents/doctor-checks.ts, src/agents/detect.ts, src/core/setup-files.ts, src/core/git.ts, src/core/gitignore.ts, src/commands/doctor.ts, src/ingest/lock.ts, test/setup-files.red.node.test.ts, test/setup-files.test.ts, test/agents/doctor-checks.test.ts, test/agents/integration.test.ts at 40018c5
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T10:07:54Z
updated_at: 2026-10-17T10:07:54Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:09:20Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-002-10
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T10:09:37Z
  sessions: []
---

# STORY-002-10: `doctor` names the files that hold the WIKI block and the setup-file checks it ran
**Complexity:** L2. Two message changes in existing doctor checks, plus two small exported helpers in `src/agents/doctor-checks.ts`, across three source files. It extends STORY-002-04 (`agent-wiring`), STORY-002-07 (`plural`, doctor JSON shape) and STORY-006-08 (`setup-files`). It was split out of STORY-002-09 (Gate 1 split 1).

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent following SETUP.md steps 5 and 6, I want `wikeeper doctor` to say which agent files hold the WIKI block and which setup-file checks passed, so that I can tell the user the install state without opening the files myself.

### 1.2 Detailed Requirements
- **R1 — `agent-wiring` names the files (CR-003 F3).** The `ok` summary (`src/agents/index.ts:359`) lists the files that hold the WIKI block and counts them with the right plural. Examples: `agents claude: WIKI block in AGENTS.md (1 file), 3 skills, 2 sub-agents` and `agents claude, codex: WIKI block in CLAUDE.md, AGENTS.md (2 files), …`.
  - **Which files.** They are the files `checkAgentBlocks` reads: the manifest `block` entries plus the existing agent files the configured agents read (`src/agents/doctor-checks.ts:44-46`). They appear in that check's order: CLAUDE.md, AGENTS.md, GEMINI.md, then any other path (`:47-52`).
  - **No file.** With no such file the text is `no WIKI block (0 files)`.
  - **Counts.** Skills and sub-agents use the same plural rule (`1 skill`, `1 sub-agent`) and still count the manifest's `skill` and `subagent` entries (`:355`).
  - **When it appears.** The line still appears only when no agent check is a warning or an error (`:354`, STORY-002-07). When it appears, every listed file holds exactly one WIKI block, because any other state is an `agent-block-*` error or warning.
- **R2 — `setup-files` lists its sub-checks (CR-003 F4).** The single `ok` entry (`src/core/setup-files.ts:141`) names what was checked, instead of "me.md and project.md are in place". The message is `<me> present, ignored by <source>:<line>, not committed; <project> present, not ignored`.
  - `<me>` and `<project>` are the repository-relative paths the check already uses (`:34-35`; `.wiki/me.md` and `.wiki/project.md` by default).
  - `<source>:<line>` is the rule git reported for `me.md` (`git check-ignore -v`, `:88`). For a default install this is the line of `.wiki/me.md` in the managed block of `.gitignore` (`src/core/gitignore.ts:80`; the entry has no leading slash).
- **R3 — Nothing else changes.** Check ids, severities, every finding's text and `fix`, the `info` entry when git is missing, and the `doctor --json` shape stay as they are (STORY-002-07 R6). The `setup-files` `ok` entry still has no `file` field (`test/setup-files.red.node.test.ts:108`). Human output prints each check as `[ok] <id>: <message>` (`src/commands/doctor.ts:301`), so both new messages appear there unchanged.

### 1.3 Out of Scope
- Extra JSON fields for the wiring file list or the setup-file sub-checks. The JSON keeps the message string only (R3).
- How skills and sub-agents are counted. The count of manifest entries stays as it is, including the shared `.agents/skills` copies.
- The `agents ` prefix when no agent is configured but the manifest still records a block. The line then reads `agents : …`, as today; the doctor half of CR-003 does not ask for a change.
- `src/commands/doctor.ts`. This story only imports `plural` from it; STORY-005-04 owns its edits (consistency audit finding 13).
- The enforce rules and `update` with `enforce: false` (STORY-002-09). The SETUP.md and ONBOARDING.md text that tells the agent to check these lines (STORY-006-02 R7 and STORY-006-07 R6, both shipped; STORY-006-12).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1):** The first STORY-002-09 draft joined this doctor wording with the `ai`-mode prompts. They share no file and no test. Should it be a separate story?
- **Recommended:** Yes. This story owns `src/agents/index.ts`, `src/agents/doctor-checks.ts` and `src/core/setup-files.ts`, no other SPRINT-03 story edits them (consistency audit, shared-files table), and it has no in-sprint predecessor.
- **Decision:** Split: STORY-002-10 takes the agent-wiring line and the setup-files sub-checks (CR-003 F3, F4); STORY-002-09 keeps the enforce work (Gate 1 split 1) — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q2):** Where does the `ok` message get the file list, so that it cannot drift from the files the check actually reads?
- **Recommended:** Move the target list of `checkAgentBlocks` (`src/agents/doctor-checks.ts:44-52`) into an exported `blockTargets(input)` that both the check and the summary call. Then a file in the summary is always a file the check found healthy.
- **Decision:** `blockTargets(input: AgentCheckInput): string[]` is exported from `src/agents/doctor-checks.ts` and used by `checkAgentBlocks` (behaviour unchanged) and by the `agent-wiring` summary — _approved (human, 2026-10-17, Gate 1)_

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** A script or a test matches the old texts ("WIKI block in N files", "me.md and project.md are in place").
- **Mitigation:** No test in the repository matches either text (checked 2026-10-17). The JSON shape and ids are unchanged (R3), and the old wording was the walkthrough's complaint (CR-003 rows 1.6, 6.2).
- **Risk:** Importing `plural` from `src/commands/doctor.ts` into `src/agents/doctor-checks.ts` creates an import cycle.
- **Mitigation:** `src/commands/doctor.ts` imports `../agents/agent-names.js`, core modules and `../program.js` (type only), and nothing that imports `doctor-checks.ts`. `src/ingest/lock.ts:8` already imports `plural` the same way. The unit tests load `doctor-checks.ts` on its own, so a cycle would show as an undefined `plural`.
- **Risk:** The ignore rule comes from a global excludes file or `.git/info/exclude`, so `<source>` is not `.gitignore`.
- **Mitigation:** Accepted. The message names whatever git reports, which is where the user would look; a unit row covers `.git/info/exclude`.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | There is one way through: `wikeeper doctor` runs both checks. JSON and human output are interfaces, not paths. |
| Interfaces | T | `doctor --json` (the check's message) and the human `doctor` line carry the same text. |
| Data | T | The wiring line differs with the number of files that hold the block (1 file vs 2 files). |
| Rules | T | The wiring line appears only without an agent warning or error; the `setup-files` `ok` entry appears only when every sub-check passed. |

```gherkin
Feature: doctor names the files that hold the WIKI block and the setup-file checks it ran

  @data
  Scenario Outline: the agent-wiring line names the files that hold the WIKI block
    Given a git repository whose only agent files are <files>
    When I run "wikeeper init --json --agents <agents> --yes" and then "wikeeper doctor --json"
    Then the "agent-wiring" check is "ok" with a message starting "<text>"
    And the message contains no "1 files", no "1 skills" and no "1 sub-agents"

    Examples:
      | files                   | agents       | text                                                         |
      | AGENTS.md               | claude       | agents claude: WIKI block in AGENTS.md (1 file),              |
      | CLAUDE.md and AGENTS.md | claude,codex | agents claude, codex: WIKI block in CLAUDE.md, AGENTS.md (2 files), |

  @rules
  Scenario: the agent-wiring line is left out while an agent check warns
    Given a git repository whose only agent file is CLAUDE.md, initialised with "wikeeper init --json --agents claude --yes"
    And the two WIKI marker lines are deleted from CLAUDE.md, leaving the wiki text
    When I run "wikeeper doctor --json"
    Then the checks include "agent-block-markers-deleted" with severity "warning"
    And no check has id "agent-wiring" and severity "ok"

  @interfaces @rules
  Scenario: the setup-files result lists the sub-checks it ran
    Given a git repository initialised with "wikeeper init --json --agents claude --yes", with an untracked .wiki/me.md and an untracked .wiki/project.md
    When I run "wikeeper doctor --json"
    Then setup-files is exactly one "ok" entry, with no file, whose message is ".wiki/me.md present, ignored by .gitignore:<n>, not committed; .wiki/project.md present, not ignored"
    And <n> is the line number of ".wiki/me.md" in .gitignore
    And "wikeeper doctor" prints "[ok] setup-files: " followed by the same message

  Scenario: Error — a failed sub-check replaces the ok entry
    Given the repository of the previous scenario with .wiki/me.md committed to git
    When I run "wikeeper doctor --json"
    Then setup-files holds an "error" entry with the message ".wiki/me.md is committed to git"
    And setup-files has no "ok" entry, and doctor exits with code 1
```

### 2.2 Verification Steps (Manual)
- [ ] Run `wikeeper doctor` in the walkthrough repository (`~/Documents/Dev/formapass_management`) and read the `agent-wiring` and `setup-files` lines: the files and the `.gitignore` line named must match what is on disk.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/agents/doctor-checks.ts` |
| Related Files | `src/agents/index.ts`, `src/core/setup-files.ts` |
| Test Files | `test/agents/doctor-checks.test.ts`, `test/agents/integration.test.ts`, `test/setup-files.test.ts` |
| New Files Needed | No |

### 3.2 Technical Logic
- **`doctor-checks.ts` (R1).**
  - Move the target list of `checkAgentBlocks` (`:44-52`) into an exported `blockTargets(input: AgentCheckInput): string[]`. `checkAgentBlocks` calls it, with unchanged behaviour.
  - Add an exported `wiringSummary(agents: readonly string[], files: readonly string[], skills: number, subagents: number): string`. It returns `` `agents ${agents.join(", ")}: ${where}, ${plural(skills, "skill")}, ${plural(subagents, "sub-agent")}` ``, where `where` is `` `WIKI block in ${files.join(", ")} (${plural(files.length, "file")})` `` or, with no file, `no WIKI block (0 files)`.
  - Import `plural` from `../commands/doctor.js` (`src/commands/doctor.ts:35`), as `src/ingest/lock.ts:8` does.
- **`index.ts` (R1).** In `doctor()` (`:334`), the `ok` entry's message (`:359`) becomes `wiringSummary(agents, blockTargets(input), n("skill"), n("subagent"))`, with `input` the `AgentCheckInput` built at `:345`. The condition at `:354` and the `unshift` stay.
- **`setup-files.ts` (R2).**
  - Declare `let meRule: IgnoreRule | null = null` before the `if (hasMe)` block (`:77`), and assign the `rule` found at `:88` to it.
  - The `ok` branch (`:140-141`) returns `` `${me} present, ignored by ${meRule!.source}:${meRule!.line}, not committed; ${project} present, not ignored` ``.
  - The branch is reached only when both files exist, git ran, `me.md` is untracked and ignored by a non-negated rule (so `meRule` is set), and `project.md` is not ignored. Every part of the message is therefore a check that passed.
- **Tests.**
  - The wiring scenarios go in `test/agents/integration.test.ts`. They use temp repositories with `init` and `doctor` through `runCli`, as its existing tests do.
  - The `setup-files` scenarios go in `test/setup-files.test.ts` with real git, as STORY-006-08's red tests do (FLASHCARD 2026-10-17 `#git #doctor`: `check-ignore -z` needs `--stdin`, which `createGit` already passes).

### 3.3 API Contract (if applicable)

No new command, option or JSON field. The two messages are R1 and R2; `doctor --json` keeps its shape (STORY-002-07 R6).

## Task Breakdown

- [x] Export `blockTargets` from `src/agents/doctor-checks.ts` and use it in `checkAgentBlocks` -> R1
- [x] Add `wiringSummary` and build the `agent-wiring` `ok` message from it in `src/agents/index.ts` -> R1
- [x] Keep the `me.md` ignore rule and build the `setup-files` `ok` message from the checks that passed -> R2
- [x] Add the unit tests and the four scenario tests -> R1, R2, R3

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 4 | `blockTargets` order (CLAUDE.md, AGENTS.md, GEMINI.md, then another path) and de-duplication of a manifest entry that is also an existing file. `wiringSummary` for 0, 1 and 2 files and for 1 skill and 1 sub-agent. The `setup-files` `ok` message with a fake `Git` whose rule source is `.gitignore`, and one whose source is `.git/info/exclude`. |
| Integration tests | 0 | Temp repositories and real git only, as in STORY-006-08. |
| E2E / acceptance tests | 5 | One per Gherkin scenario, with Outline rows counted separately (2 + 1 + 1 + 1). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Existing doctor tests green without an edit, including `test/setup-files.red.node.test.ts` and `test/doctor-reporting.red.node.test.ts`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/agents/index.ts:354` — the `agent-wiring` `ok` entry is added only when no agent check is a warning or an error; `src/agents/index.ts:359` — its message, "WIKI block in ${n} files"; `src/agents/index.ts:355` — the manifest counts.
- **Surface:** `src/agents/doctor-checks.ts:42` — `checkAgentBlocks`; `src/agents/doctor-checks.ts:44` — the target list it reads, sorted at `:47-52`.
- **Surface:** `src/agents/detect.ts:69` — `resolveTargets`, the existing agent files the configured agents read.
- **Surface:** `src/core/setup-files.ts:88` — the ignore rule git reports for `me.md`; `src/core/setup-files.ts:141` — the `ok` message "me.md and project.md are in place"; `src/core/setup-files.ts:25` — `ruleText`, the `source:line pattern` form the findings use.
- **Surface:** `src/core/gitignore.ts:80` — the managed `.gitignore` entry for `me.md`.
- **Surface:** `src/commands/doctor.ts:35` — `plural`; `src/commands/doctor.ts:301` — the human `[<severity>] <id>: <message>` line; `src/ingest/lock.ts:8` — an existing import of `plural` outside `doctor.ts`.
- **Coverage of this requirement:** partial. Both checks and their conditions exist; only the two `ok` messages and the shared target helper are new.

## Prior work

- [[CR-003]] items F3 and F4. Split out of [[STORY-002-09]], which keeps the enforce half of the first draft. Extends [[STORY-002-04]] (the `agent-wiring` summary), [[STORY-002-07]] (`plural`, the `ok`-row rule and the doctor JSON shape) and [[STORY-006-08]] (`setup-files`), under [[EPIC-002]]. [[STORY-006-02]] R7 and [[STORY-006-07]] R6 already tell the agent to check that doctor reports the WIKI block in every agent file, which this story makes possible. The wiki duplicate check (index and archive grep, 2026-10-17) found no other item that changes these two messages.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/agents/index.ts:359` and `src/core/setup-files.ts:141`, the two message strings.
- **Why isn't extension / parameterization / config sufficient?** It is an extension: two message strings, built from data each check already has. The one new helper, `blockTargets`, is the existing target list of `checkAgentBlocks` moved into a function, so the summary names exactly the files the check read. Writing the list a second time in `index.ts` would be shorter, but it could drift from the check. `wiringSummary` is split out only so the plural cases are unit-testable without a repository.

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

Gate 1 approved by the human on 2026-10-17: every §1.4 Decision line is approved as recommended.
