---
story_id: STORY-005-09
parent_epic_ref: EPIC-005
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: SPRINT-03 gate1-decisions.md 2026-10-17 (split 4, which moves R13 out of STORY-005-05; decision 17 as revised 2026-10-17; decision 21; technical call on rule order and the SETUP.md order 002-09 → 003-10 → 005-09) · split from STORY-005-05 R13, §1.4 Q2 and Q3 (2026-10-17) · EPIC-005 (approved 2026-10-16) §2 · CR-001 (no mode allows a broad rule) · STORY-004-02 R9 (the `search` allow rule in every mode, the pattern this story follows) · STORY-002-09 (the `ai`-mode ask and prompt rules, `removeEnforce` on `update`, `test/agents/rule-match.ts`) · STORY-003-10 R10 (the `read` rules) · verified src/agents/enforce/claude.ts, src/agents/enforce/codex.ts, src/agents/enforce/index.ts, src/program.ts, templates/system/SETUP.md, test/templates/structure.ts, test/templates.test.ts, test/templates.red.node.test.ts, test/templates/setup.red.node.test.ts, test/agents/enforce.test.ts, test/agents/enforce-ai-rules.red.node.test.ts, test/agents/enforce.red.node.test.ts, test/search/search.red.node.test.ts, test/doctor-reporting.red.node.test.ts at 40018c5 · Claude Code permissions docs and Codex rules docs as cited in STORY-002-09 (fetched 2026-10-17)
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-005-02
  - STORY-005-05
  - STORY-005-06
  - STORY-002-09
  - STORY-003-10
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T10:30:51Z
updated_at: 2026-10-17T10:30:51Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:33:12Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-005-09
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T10:33:12Z
  sessions: []
---

# STORY-005-09: Allow rules for the read-only `lint`, `status` and `rules list` in every permission mode
**Complexity:** L2. Six rule strings per enforce writer, built from one exported list and placed after the `search` rules in every mode; the three SETUP.md step-4 rows; the plain enforce tests. Most of the work is re-scoping the SPRINT-01/02 red tests that pin the rule lists of all three modes. It follows the `search` allow rule (STORY-004-02) and lands on the enforce files after STORY-002-09 and STORY-003-10. Split from STORY-005-05 (Gate 1 split 4, 2026-10-17): carrying these rules made that story L3 with a second goal in another subsystem.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent working in a wiki with `enforce` on, I want my harness to run `wikeeper lint`, `wikeeper status` and `wikeeper rules list` without a permission prompt in every mode, as it runs `wikeeper search`, so that checking the wiki's health and open work never interrupts the user. `wikeeper rules record`, which writes a log event, should still follow the harness's own mode.

### 1.2 Detailed Requirements
- **R1 — Claude Code rules (`.claude/settings.json`).** In every permission mode (`ai`, `ask`, `whitelist`), `permissions.allow` gets these six rules, with identities `permissions.allow[<rule>]` as for the existing rules: `Bash(npx wikeeper lint *)`, `Bash(wikeeper lint *)`, `Bash(npx wikeeper status *)`, `Bash(wikeeper status *)`, `Bash(npx wikeeper rules list *)`, `Bash(wikeeper rules list *)`. A trailing ` *` that is the rule's only wildcard also matches the bare command, so `Bash(wikeeper status *)` covers `wikeeper status` (Claude Code docs, as cited in STORY-002-09 §3.2).
- **R2 — Codex rules (`.codex/rules/wikeeper.rules`).** In every mode, these six lines, each its own identity: `prefix_rule(pattern=["npx","wikeeper","lint"], decision="allow")`, `prefix_rule(pattern=["wikeeper","lint"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","status"], decision="allow")`, `prefix_rule(pattern=["wikeeper","status"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","rules","list"], decision="allow")`, `prefix_rule(pattern=["wikeeper","rules","list"], decision="allow")`.
- **R3 — One list, and only read-only commands.** The six rules of R1 and R2 come from one exported list, `READ_ONLY_COMMANDS = ["lint", "status", "rules list"]` in `src/agents/enforce/claude.ts`, which `codex.ts` imports. The `npx` form comes first in each pair. Each of the three commands writes no file (STORY-005-02 R10, STORY-005-05 R2, STORY-005-06 R6), and `lint` covers `--rules` and `--check`. `rules record` writes a `rule-proposal` log event and gets no rule, so the harness's own mode decides it (STORY-005-06 R5).
- **R4 — Rule order (orchestrator technical call, gate1-decisions.md).** Each mode's rules come in this order: the ingest allow rules (existing, `ai`), the ingest ask/prompt rules (STORY-002-09; `ask`'s `ingest start` rules are SPRINT-02's), the `read` allow rules (STORY-003-10, `ai` only), the `search` allow rules (existing), then these six, last in every mode. No earlier rule moves. In Claude's JSON only the order inside `permissions.allow` shows. In the Codex file the order is the line order of a fresh `init`; `update` appends the lines a file lacks at its end (`src/agents/enforce/index.ts:232`), and Codex's decision does not depend on line order.
- **R5 — Lifecycle.** With `enforce: true`, `wikeeper update` adds the six to an install written before this story, by identity, records each one as a wikeeper-owned `rule` entry in the manifest, and keeps every other rule, user key and value in place; a second run changes nothing. A change of `ingest.permission` keeps them, because every mode wants them. `wikeeper remove`, and `update` with `enforce: false` (STORY-002-09 R5, which routes `update` to `removeEnforce`), take them out like every other manifest-owned entry. This story only adds its rules to what those paths remove and changes no code in `src/agents/enforce/index.ts`. Antigravity has no project rule file (STORY-002-06 R4) and gets nothing.
- **R6 — SETUP.md preview rows.** The `ai`, `ask` and `whitelist` rows of the step-4 table (`templates/system/SETUP.md:51`, `:52`, `:53`) add the six Claude rules at the end of the Claude Code cell's `permissions.allow` part and the six Codex lines at the end of the Codex cell, on top of STORY-002-09's and STORY-003-10's versions of the rows. The cell format stays the same: `` `permissions.allow`: …; `permissions.ask`: … `` with the `; ` separator, one code span per rule, and Antigravity's "no project rule file" cell. STORY-006-02's S2 (`test/templates/setup.red.node.test.ts:243`) compares the rows with the writers at run time, so they change in this story's commit. No other SETUP.md text changes here.
- **R7 — The commands are registered first.** The template checker reports a rule that names an unregistered command as `unknown command "wikeeper <cmd>"` (`test/templates/structure.ts:157-160`), and an unknown `rules` subcommand as `unknown subcommand` (`:165-166`). It checks the writer items (`enforceSources`, `:135`, run at `:185`) and the SETUP.md rows, so a rule for a missing command fails `test/templates.red.node.test.ts:53` (S1) and `test/templates.test.ts:113`. This story therefore lands after `lint` (STORY-005-02), `rules` with `list` (STORY-005-06) and `status` (STORY-005-05) are registered in `src/program.ts`, and it changes neither the checker nor the commands.

### 1.3 Out of Scope
- The `lint`, `status` and `rules` commands themselves (STORY-005-02, STORY-005-05, STORY-005-06).
- A rule for `rules record`, a rule for Antigravity, and other spellings such as `wikeeper --json status`: a global option before the command word matches no wikeeper rule, so the harness's own mode decides, as STORY-002-09 §1.3 states for ingest.
- Routing `update` with `enforce: false` to `removeEnforce` (STORY-002-09 R5).
- SETUP.md text other than the three step-4 rows (STORY-006-10, STORY-006-12, STORY-006-09), and the WIKI.md sentence that these commands run without a prompt (STORY-006-09 R2).
- Any change to `test/templates/structure.ts` (STORY-002-09 R7 adds the wildcard reading; STORY-006-11 adds the SPRINT-03 checks).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1):** STORY-005-05 carried these rules as R13. That gave it a second goal in another subsystem (the enforce writers, SETUP.md and their red tests) and complexity L3. Split them out?
- **Recommended:** Split. STORY-005-05 keeps the `status` command; this story takes the rules with the same predecessors, plus STORY-005-05 for the `status` command the rules name.
- **Decision:** Split: STORY-005-05 keeps `status`; STORY-005-09 takes the read-only allow rules for `lint`, `status` and `rules list` (Gate 1 split 4, added 2026-10-17) — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q2):** Gate 1 decision 17 gives the read-only `lint`, `status` and `rules list` allow rules in every permission mode, like `search`. The template checker rejects a rule for an unregistered command (`test/templates/structure.ts:157-160`), so the rules cannot land before all three commands exist. Which story adds them, and which rules?
- **Recommended:** This story, after STORY-005-02, STORY-005-05 and STORY-005-06: the six Claude `permissions.allow` rules of R1 and the six Codex `allow` lines of R2 in every mode, built from `READ_ONLY_COMMANDS`, and nothing for `rules record`, which writes a log event. Putting them in STORY-002-09 would make STORY-002-09 and then STORY-003-10 wait for EPIC-005; weakening the checker would let a rule for a missing command pass.
- **Decision:** This story adds the allow rules for `lint`, `status` and `rules list` in every permission mode (Claude `permissions.allow`, Codex `prefix_rule … allow`) from one exported `READ_ONLY_COMMANDS` list, last in each mode's rule order, with none for `rules record`; STORY-002-09 depends on no EPIC-005 story (Gate 1 decision 17, revised 2026-10-17) — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q3):** The six rules fail SPRINT-01/02 red tests that pin the exact rule lists in all three modes (§3.1, "Re-scoped red tests"). A red test changes only with the human's authorisation. May this story's QA-Red step re-scope them?
- **Recommended:** Yes. Edit by test name, on the tree merged with STORY-002-09 and STORY-003-10, only to add the six rules at their R4 positions, and change no other assertion. Leaving them failing blocks the sprint; dropping them loses CR-001's guard that no mode allows a broad rule. The list includes `test/templates/setup.red.node.test.ts:353` (S5), whose `missing [...]` text for the `ai` row's `permissions.allow` gains the six rules after STORY-003-10's version, and the `ask` and `whitelist` assertions that no other story touches.
- **Decision:** Re-scoping is authorised as recommended: this story's QA-Red edits exactly the assertions listed in §3.1, only by adding the six read-only rules at their R4 positions, and STORY-006-11 R6 (h) lists them (Gate 1 decision 21) — _approved (human, 2026-10-17, Gate 1)_

Already decided; cited, not reopened: the rule order of R4 and the order of edits to the enforce files and the SETUP.md step-4 table, 002-09 → 003-10 → 005-09, then the SETUP.md text stories 006-10 and 006-12 (orchestrator technical calls, gate1-decisions.md).

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** SPRINT-01/02 red tests pin the exact rule lists in all three modes; STORY-002-09 and STORY-003-10 have already re-scoped several of the same lines.
- **Mitigation:** QA-Red re-scopes exactly the §3.1 assertions on the merged tree, by test name (the lines are a guide), only by adding the six rules (§1.4 Q3; FLASHCARD 2026-10-17 `#enforce #qa`). The Developer updates the plain test in `test/agents/enforce.test.ts`. S2 stays green because the three rows change in the same commit.
- **Risk:** Shared files. `claude.ts`, `codex.ts`, the SETUP.md step-4 rows, `test/agents/enforce.test.ts` and the red-test lines are edited by STORY-002-09, then STORY-003-10, then this story; SETUP.md prose is edited later by STORY-006-10, STORY-006-12 and STORY-006-09.
- **Mitigation:** STORY-002-09 and STORY-003-10 are in `dep_predecessors`, and STORY-006-10 and STORY-006-12 depend on this story, so each branch starts after the one before merges. Rules are added by identity at the end of each mode's list, and only the three table rows of SETUP.md change.
- **Risk:** `Bash(wikeeper lint *)` and the Codex prefix allow any option of these commands, so a later option that writes (a `lint --fix`, say) would run without a prompt.
- **Mitigation:** R3 states that the rules exist because the commands write nothing. A story that adds a writing option to `lint`, `status` or `rules list` must narrow or drop the rule, as CR-001 requires of any allow rule.
- **Risk:** Claude Code or Codex change how rules match.
- **Mitigation:** The rules use only shapes the docs show and the `search` rules already use: a trailing ` *` and a plain token prefix. The unit tests check them against the model of documented matching in `test/agents/rule-match.ts` (STORY-002-09), and §2.2 checks both agents by hand once.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | The rules reach the settings through a fresh `init --enforce` and through `update` on an older install; `remove` and `update` with `enforce: false` take them out. |
| Interfaces | T | Two harness surfaces (Claude `settings.json` rules, Codex `.rules` prefix rules) and the SETUP.md preview rows that mirror them. |
| Data | T | The rule set differs by permission mode (`ai`, `ask`, `whitelist`); the six are appended to each. |
| Rules | T | The read-only commands are allowed in every mode, `rules record` is not, and a rule must name a registered command. |

```gherkin
Feature: Allow rules for the read-only commands

  @interfaces @data
  Scenario Outline: init writes the read-only allow rules last in every mode
    Given a git repository with config agents "claude, codex" and ingest.permission "<mode>"
    When I run "wikeeper init --json --enforce --yes"
    Then .claude/settings.json permissions.allow ends with the six R1 rules, in R1 order, right after "Bash(npx wikeeper search *)" and "Bash(wikeeper search *)"
    And .codex/rules/wikeeper.rules ends with the six R2 lines, in R2 order, right after the two search lines
    And otherwise both files hold exactly that mode's earlier rules (STORY-002-09 R1, R2; STORY-003-10 R10)
    And the manifest records each of the twelve as a wikeeper-owned "rule" entry

    Examples:
      | mode      |
      | ai        |
      | ask       |
      | whitelist |

  @rules
  Scenario Outline: The read-only commands match an allow rule in every mode, and rules record does not
    Given the "ai", "ask" and "whitelist" output of CLAUDE_ENFORCE and CODEX_ENFORCE
    Then in each mode, under the documented rule matching of test/agents/rule-match.ts, "<command>" is decided "<claude>" by Claude Code and "<codex>" by Codex

    Examples:
      | command                                                       | claude  | codex   |
      | wikeeper status                                               | allow   | allow   |
      | npx wikeeper status --json                                    | allow   | allow   |
      | wikeeper lint --rules --json                                  | allow   | allow   |
      | npx wikeeper lint --check broken-link                         | allow   | allow   |
      | wikeeper rules list --json                                    | allow   | allow   |
      | wikeeper rules record --rejected --kind meeting --summary x   | default | default |
      | wikeeper --json status                                        | default | default |

  @paths
  Scenario: update adds the rules to an existing install, keeps them across a mode change, and enforce false removes them
    Given a hand-built "ai"-mode install with agents "claude, codex" and enforce true, whose .claude/settings.json, .codex/rules/wikeeper.rules and manifest hold only the rules STORY-002-09 and STORY-003-10 write
    And .claude/settings.json also holds the user key "model"
    When I run "wikeeper update --json"
    Then both files hold the six read-only rules, the Codex file keeps its earlier lines first and has the six at its end, the manifest records each new rule as a wikeeper-owned "rule" entry, and "model" is unchanged
    And a second "wikeeper update --json" changes no file
    When I set ingest.permission to "ask" and run "wikeeper update --json"
    Then both files still hold the six read-only rules
    When I set enforce to false in .wiki/config.yml and run "wikeeper update --json"
    Then no agent settings file that still exists holds a read-only rule, and the manifest records no "rule" entry

  @interfaces
  Scenario: The SETUP.md step-4 rows list the read-only rules
    Given templates/system/SETUP.md after this story
    Then the "ai", "ask" and "whitelist" rows of the step-4 table each end their Claude Code permissions.allow part with the six R1 rules and their Codex cell with the six R2 lines
    And test/templates/setup.red.node.test.ts S2 reports that each row equals the enforce writers
    And the template structure check reports no finding for the writer items or SETUP.md, because "lint", "status" and "rules list" are registered commands

  @rules
  Scenario: Error — a rule that names no registered command fails the checks
    Given a copy of the templates directory whose templates/system/SETUP.md "ask" row lists "Bash(wikeeper rules lists *)" in place of "Bash(wikeeper rules list *)"
    When the template structure checks run on the copy
    Then they report a finding naming "system/SETUP.md", the row's line and 'unknown subcommand "rules lists"'
    And the same copy with "Bash(wikeeper rules list *)" restored reports no finding
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo with `ingest.permission: ask`, run `init --agents claude,codex --enforce`. In Claude Code (a trusted folder, or `--settings .claude/settings.json`, as STORY-002-09 §2.2 describes), check that `wikeeper status`, `wikeeper lint --rules` and `wikeeper rules list` run without a prompt, and that `wikeeper rules record …` follows the harness's own mode.
- [ ] With Codex installed, run `codex execpolicy check --pretty --rules .codex/rules/wikeeper.rules -- wikeeper rules list` (expect `allow`) and `… -- wikeeper rules record --rejected --kind x --summary y` (expect no wikeeper decision).

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/agents/enforce/claude.ts` |
| Related Files | `src/agents/enforce/codex.ts`, `templates/system/SETUP.md` (the three step-4 rows only) |
| Test Files | `test/agents/enforce.test.ts`, `test/agents/rule-match.test.ts` |
| Re-scoped red tests (QA-Red) | `test/agents/enforce-ai-rules.red.node.test.ts`, `test/agents/enforce.red.node.test.ts`, `test/templates/setup.red.node.test.ts` |
| Consumed (unchanged) | `src/agents/enforce/index.ts` (identity diff, `IDENTITY_RE`, the line append at `:232`, `removeEnforce` as STORY-002-09 routes `update` to it), `test/agents/rule-match.ts` (STORY-002-09), `test/templates/structure.ts` (`checkCommands`, `enforceSources`), `src/program.ts` (`lintCommand`, `statusCommand`, `rulesCommand`, registered by STORY-005-02, STORY-005-05 and STORY-005-06) |
| New Files Needed | No |

Re-scoped red-test assertions (lines at `40018c5`, a guide only; QA-Red edits by test name on the tree merged with STORY-002-09 and STORY-003-10, only by adding the six rules at their R4 positions, §1.4 Q3):
- `test/agents/enforce-ai-rules.red.node.test.ts`:
  - "claude: permissions.allow is exactly the two ingest rules, none match remove" (`:127`).
  - "codex: wikeeper.rules holds exactly the two ingest rules, none prefix remove" (`:139`).
  - "hand-built legacy state, then update leaves only the narrow pair and every user key" (`:181`, `:184`).
  - "ask writes the ask rules; whitelist then removes them" (`:198`, `:199`, `:205`, `:206`).
  - "ai: the writers emit exactly the narrow ingest values" (`:234`, `:235`).
- `test/agents/enforce.red.node.test.ts`:
  - "ai: allow rules" (`:260`).
  - "ask: ask rules" (`:269`, `:270`).
  - "whitelist: no permission rule and no .rules file" (`:277`, `:279`).
  - "switching ai to ask on re-run leaves only the ask rules" (`:288`, `:292`).
  - "CLAUDE_ENFORCE items per permission mode" (`:520-526`, `:528-534`, and `:535`, whose `whitelist` item count goes from 3 to 9).
  - "CODEX_ENFORCE and ANTIGRAVITY_ENFORCE items" (`:543`, `:544-548`).
- `test/templates/setup.red.node.test.ts`: S5 "ai row listing Bash(wikeeper *) for Claude Code fails naming mode, agent and rules" (`:353`): the `missing [...]` list for the `ai` row's `permissions.allow` gains the six rules after the search pair.
- Not edited: `test/templates.red.node.test.ts` S1 (`:53`) and `test/templates/setup.red.node.test.ts` S2 (`:243`), which stay green because the commands are registered and the rows change in the same commit; `test/search/search.red.node.test.ts`, which checks the search rules with `toContain`; `test/doctor-reporting.red.node.test.ts`, which builds its expectation from the manifest; `enforce.red.node.test.ts:276`, whose `whitelist` permissions stay `{ allow: [...] }`.

Of these, `:139`, `:184`, `:234`, `:235` (enforce-ai-rules) and `:260`, `:520-526`, `:544-548` (enforce) are edited first by STORY-002-09 and then STORY-003-10, and `:127`, `:181` and `:353` first by STORY-003-10; this story adds the six rules on top. The `ask` and `whitelist` lines are this story's alone. None of these assertions is about the `status` command, so STORY-005-05 keeps no red-test edit. STORY-006-11 R6 (h) lists the same set.

### 3.2 Technical Logic
- **`claude.ts` (R1, R3, R4).** On the tree merged with STORY-002-09 and STORY-003-10:
  - Export `READ_ONLY_COMMANDS = ["lint", "status", "rules list"] as const`.
  - After the search loop (`src/agents/enforce/claude.ts:39` at `40018c5`), push, in every mode, `permissions.allow[Bash(npx wikeeper <c> *)]` then `permissions.allow[Bash(wikeeper <c> *)]` for each `<c>` of `READ_ONLY_COMMANDS`, with the item shape of `:40`.
- **`codex.ts` (R2, R3, R4).**
  - `READ_ONLY_LINES`, built from `READ_ONLY_COMMANDS` (imported from `./claude.js`, which `codex.ts:1` already imports types from): each command split on spaces into tokens, `npx` first, `decision="allow"`.
  - The line list (today `src/agents/enforce/codex.ts:37`) becomes the mode lines as STORY-002-09 leaves them, STORY-003-10's `read` lines in `ai`, `SEARCH_LINES`, then `READ_ONLY_LINES`.
- **Identities.** They follow the existing pattern (`src/agents/enforce/claude.ts:32`, `src/agents/enforce/codex.ts:38`). `IDENTITY_RE` (`src/agents/enforce/index.ts:87`) splits at the first `[`, which no rule contains, so `update`'s identity diff and stale removal (`:193-201`), the Codex append (`:232`) and `removeEnforce` (`:274`) work unchanged.
- **`SETUP.md` (R6).** Append the six rules to the `permissions.allow` part of the Claude Code cell and the six lines to the Codex cell of rows `:51-53`. Keep the `; ` separator that `parseClaudeCell` (`test/templates/setup.red.node.test.ts:79`) splits on, and one code span per rule.
- **Tests.**
  - `test/agents/enforce.test.ts`: "CR-001 ai mode allows only ingest and search commands" (`:245-270`, as STORY-002-09 and STORY-003-10 leave it) expects the full `ai` lists in R4 order; add the `ask` and `whitelist` lists. The first and third scenarios run here through `runCli`; the update step hand-builds the older settings and manifest (FLASHCARD 2026-10-17 `#qa #test-harness`: a test that relies on `init` does not exercise the identity diff).
  - `test/agents/rule-match.test.ts` (STORY-002-09) gains the second scenario's rows for every mode.
  - The fourth scenario is S2 plus the real-tree check (`test/templates.test.ts:113`); the error scenario runs `runAllChecks` on a templates copy built as the copy-mutation test at `test/templates.test.ts:100` builds one. It does not import the S2 red file (importing a test file registers its tests twice).

### 3.3 API Contract (if applicable)

No new command or option. The written rules are R1 and R2 in R4 order. One additive export:

```ts
// src/agents/enforce/claude.ts
export const READ_ONLY_COMMANDS: readonly ["lint", "status", "rules list"];
```

Consumed (frozen): `CLAUDE_ENFORCE`, `CODEX_ENFORCE` and their item identities (K9, STORY-002-06, as STORY-002-09 and STORY-003-10 leave them); `claudeDecision` and `codexDecision` (`test/agents/rule-match.ts`, STORY-002-09).

## Task Breakdown

- [ ] Start the story branch from the sprint branch after STORY-002-09, STORY-003-10, STORY-005-02, STORY-005-05 and STORY-005-06 have merged
- [ ] QA-Red: re-scope the §3.1 red-test assertions on the merged tree, only by adding the six rules (§1.4 Q3) -> R1, R2, R4
- [ ] Export `READ_ONLY_COMMANDS` and append the six rules to `CLAUDE_ENFORCE` in every mode -> R1, R3, R4
- [ ] Build `READ_ONLY_LINES` in `codex.ts` and append them after `SEARCH_LINES` in every mode -> R2, R3, R4
- [ ] Add the six rules to the three SETUP.md step-4 rows -> R6, R7
- [ ] Update `test/agents/enforce.test.ts` and `test/agents/rule-match.test.ts`; write the init, update and error scenarios -> R1, R2, R5, R7

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 4 | `CLAUDE_ENFORCE` rule lists for each of the three modes ending with the six rules in R4 order; Codex lines for each mode ending with the six lines; `READ_ONLY_COMMANDS` is exactly `["lint", "status", "rules list"]` and both writers build their rules from it; `claudeDecision` and `codexDecision` on the second scenario's commands in each mode, including bare `wikeeper status` and `rules record` (`default`). |
| Integration tests | 0 | Temp repositories only, as in STORY-002-06. |
| E2E / acceptance tests | 13 | One per Gherkin scenario, with Outline rows counted separately (3 + 7 + 1 + 1 + 1). The second Outline's rows share one writer run. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The red-test assertions listed in §3.1 re-scoped by QA-Red (not the Developer), only by adding the six rules; `test/templates.red.node.test.ts` S1 and `test/templates/setup.red.node.test.ts` S2 green without an edit.
- [ ] `test/templates.test.ts` "every check is clean on the package's templates" (`:113`) green on the merged tree.
- [ ] Rule shapes re-checked against the Claude Code and Codex docs at development time.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/agents/enforce/claude.ts:39` — the search loop, after which the six rules go; `src/agents/enforce/claude.ts:32` — the rule-item identity pattern.
- **Surface:** `src/agents/enforce/codex.ts:12` — `SEARCH_LINES`; `src/agents/enforce/codex.ts:37` — where the mode and search lines are joined; `src/agents/enforce/codex.ts:1` — the existing type import from the Claude writer, which `READ_ONLY_COMMANDS` joins.
- **Surface:** `src/agents/enforce/index.ts:87` — `IDENTITY_RE`; `src/agents/enforce/index.ts:193` — stale-entry planning on `update`; `src/agents/enforce/index.ts:232` — lines a file lacks are appended; `src/agents/enforce/index.ts:274` — `removeEnforce`; `src/agents/enforce/index.ts:449` — the extension's `update` hook that STORY-002-09 routes to it.
- **Surface:** `templates/system/SETUP.md:51` — the `ai` step-4 preview row (`:52` `ask`, `:53` `whitelist`); `test/templates/setup.red.node.test.ts:243` — S2 compares the rows with the writers; `test/templates/setup.red.node.test.ts:353` — S5's exact `missing [...]` text.
- **Surface:** `test/templates/structure.ts:157` — the `unknown command` finding (`:157-160`) and `:165` the `unknown subcommand` finding for a rule that names an unregistered command, the reason this story lands after the three command stories; `test/templates/structure.ts:135` — `enforceSources`.
- **Surface:** `test/agents/enforce.test.ts:245` — the plain "CR-001 ai mode allows only ingest and search commands" tests (`:245-270`).
- **Coverage of this requirement:** partial — the writers, identities, `update` merge, `remove`, the preview check and the `search` rules this story copies exist; the six rules and their list are net-new.

## Prior work

- Split from [[STORY-005-05]] (its R13, §1.4 Q2 and Q3, 2026-10-17). Follows [[STORY-004-02]], which added the `search` allow rule in every mode with its SETUP.md rows and red-test re-scope (the pattern here; SPRINT-02 wiki and FLASHCARD 2026-10-17 `#enforce #qa`). Extends [[STORY-002-06]] (rule writers, identities, `update` and `remove`) as narrowed by [[CR-001]]. Lands after [[STORY-002-09]] (the `ai`-mode ask and prompt rules, `removeEnforce` on `update`, `test/agents/rule-match.ts`; it carried these rules in an earlier revision) and [[STORY-003-10]] (the `read` rules) on the same files; [[SPIKE-002]] checked the Claude rule shapes. Names the commands of [[STORY-005-02]] (`lint`), [[STORY-005-05]] (`status`) and [[STORY-005-06]] (`rules list`). Updates the preview table of [[STORY-006-02]] and passes the checks of [[STORY-006-06]]; [[STORY-006-11]] R6 (h) lists the red-test edits; [[CR-003]] is the sprint's walkthrough CR whose C1 rules precede these. The `cleargate-wiki-query` duplicate check (2026-10-17) and a grep of `.cleargate/wiki/`, `.cleargate/delivery/archive/` and `.cleargate/FLASHCARD.md` for "allow rule", "READ_ONLY" and "prefix_rule" found no other item that adds these rules.

## Why not simpler?

- **Smallest existing surface that could carry this:** the `search` allow rules at `src/agents/enforce/claude.ts:39` and `src/agents/enforce/codex.ts:12`, and the three SETUP.md step-4 rows.
- **Why isn't extension / parameterization / config sufficient?** It is an extension: six rule strings per writer from one list, placed after the `search` rules, and three table rows, with no new abstraction and no change to the merge code. A broader rule such as `Bash(wikeeper *)` would be shorter, but it would allow `rules record` and every ingest verb in every mode, which CR-001 rules out. Putting the rules in STORY-005-05 kept one story but joined two goals in two subsystems (§1.4 Q1).

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`test/agents/rule-match.ts` and `test/agents/rule-match.test.ts` are created by STORY-002-09 in this sprint.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1 approved by the human on 2026-10-17: every §1.4 Decision line is approved as recommended.
