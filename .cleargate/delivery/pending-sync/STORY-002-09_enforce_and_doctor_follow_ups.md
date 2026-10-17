---
story_id: STORY-002-09
parent_epic_ref: EPIC-002
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: CR-003 C1 and Open Question 3 (approved 2026-10-17; walkthrough rows 0.9c, 4.2d) · SPRINT-03 decomposition contract K9 · SPRINT-03 gate1-decisions.md 2026-10-17 (split 1; decisions 16, 18, 21; decision 17 as revised 2026-10-17, which moves the read-only allow rules to STORY-005-09 (split 4); technical call on rule order) · SPRINT-03 consistency-audit.md 2026-10-17 (findings 1, 3, 7, 8, 12, 13) · SPIKE-002 (Claude Code ask rules, concluded 2026-10-17) · EPIC-002 · CR-001 · verified src/agents/enforce/claude.ts, src/agents/enforce/codex.ts, src/agents/enforce/index.ts, src/agents/enforce/json-merge.ts, src/agents/index.ts, src/commands/doctor.ts, src/commands/ingest-apply.ts, src/commands/ingest-abort.ts, src/ingest/lock.ts, templates/system/SETUP.md, test/templates/structure.ts, test/templates.test.ts, test/templates.red.node.test.ts, test/templates/setup.red.node.test.ts, test/agents/enforce.test.ts, test/agents/enforce-ai-rules.red.node.test.ts, test/agents/enforce.red.node.test.ts at 40018c5 · Claude Code permissions docs (code.claude.com/docs/en/permissions, re-fetched 2026-10-17) and Codex rules docs, fetched 2026-10-17
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T08:58:45Z
updated_at: 2026-10-17T10:16:56Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:19:25Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: claude-opus-5-5
  last_stamp: 2026-10-17T10:19:25Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-17T08:46:56Z
---

# STORY-002-09: `ai`-mode prompts for `--drop` and `--force-unlock`, and `update` with `enforce: false` removes the rules
**Complexity:** L2. The story changes the `ai`-mode rule lists in the two existing rule writers, one branch in the enforce `update` hook, the `ai` row of the SETUP.md preview table, and how the template checker reads a `*` in a rule. Most of the work is test re-scoping. It extends STORY-002-06 (and CR-001). The doctor-message half of the first draft (CR-003 F3, F4) is now STORY-002-10 (Gate 1 split 1). The allow rules for the read-only commands, which the previous revision carried, are now STORY-005-09's (Gate 1 decision 17, revised 2026-10-17; §1.4 Q3).

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent working in a wiki with `enforce` on, I want my harness to ask the user before I delete a stored source (`ingest abort … --drop`) or take over another ingest's lock (`ingest apply … --force-unlock`). The routine ingest steps and `search` should still run without a prompt, and `enforce: false` plus `wikeeper update` should take wikeeper's hook and rules out again. Then a prompt-injected source cannot destroy data silently, and turning enforcement off needs no hand edit of agent settings.

### 1.2 Detailed Requirements
- **R1 — Claude Code rules (`.claude/settings.json`).** Each mode writes exactly these rules. Each rule's identity is `permissions.<list>[<rule>]`, as for the existing rules. Only the `ai` row changes; `ask` and `whitelist` keep SPRINT-02's rules.

  | Mode | `permissions.allow` | `permissions.ask` |
  |---|---|---|
  | `ai` | `Bash(npx wikeeper ingest *)`, `Bash(wikeeper ingest *)`, `Bash(npx wikeeper search *)`, `Bash(wikeeper search *)` | **new:** `Bash(npx wikeeper ingest *--drop*)`, `Bash(wikeeper ingest *--drop*)`, `Bash(npx wikeeper ingest *--force-unlock*)`, `Bash(wikeeper ingest *--force-unlock*)` |
  | `ask` (unchanged) | `Bash(npx wikeeper search *)`, `Bash(wikeeper search *)` | `Bash(npx wikeeper ingest start *)`, `Bash(wikeeper ingest start *)` |
  | `whitelist` (unchanged) | `Bash(npx wikeeper search *)`, `Bash(wikeeper search *)` | — |

  The ask rules work for these reasons. Claude Code evaluates deny, then ask, then allow, and the first match decides, so a matching ask rule prompts even though `Bash(wikeeper ingest *)` also matches. A `*` may stand anywhere in a Bash rule and matches any text (Claude Code docs, re-fetched 2026-10-17). SPIKE-002 ran these exact rules in headless Claude Code with `--settings`: `abort <id> --drop`, `apply <id> --force-unlock`, `ingest --json abort <id> --drop` and the `npx` form reached the prompt, while `abort <id>` and `finish <id>` did not. The `*` sits between `ingest` and the flag, not after `abort`, because commander accepts the global `--json` between the two command words.
- **R2 — Codex rules (`.codex/rules/wikeeper.rules`).** Codex `prefix_rule` matches only a leading run of command tokens, so no rule can see `--drop` or `--force-unlock` after `<id>` (Codex docs, fetched 2026-10-17). When rules overlap, Codex applies the strictest decision (`forbidden` > `prompt` > `allow`). Gate 1 decision 16 sets the Codex fallback: every `abort` prompts and `apply` stays allowed (§1.4 Q1). Each mode writes exactly these lines; only the `ai` row changes.

  | Mode | Lines |
  |---|---|
  | `ai` | `prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")`, `prefix_rule(pattern=["wikeeper","ingest"], decision="allow")`, **new:** `prefix_rule(pattern=["npx","wikeeper","ingest","abort"], decision="prompt")`, `prefix_rule(pattern=["wikeeper","ingest","abort"], decision="prompt")`, then `prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")`, `prefix_rule(pattern=["wikeeper","search"], decision="allow")` |
  | `ask` (unchanged) | `prefix_rule(pattern=["npx","wikeeper","ingest","start"], decision="prompt")`, `prefix_rule(pattern=["wikeeper","ingest","start"], decision="prompt")`, the two search allow lines |
  | `whitelist` (unchanged) | the two search allow lines |

- **R3 — Rule order (orchestrator technical call, gate1-decisions.md).** The writers emit each mode's rules in this order: the ingest allow rules, the ingest ask/prompt rules (this story), then the search allow rules. Later stories add theirs at fixed places: STORY-003-10 inserts its `read` allow rules after the ingest ask/prompt rules and before the search rules, and STORY-005-09 appends the read-only command allow rules after the search rules. The full order is therefore ingest allow, ingest ask/prompt, `read` allow, `search` allow, read-only command allow. In Claude's JSON, `allow` and `ask` are separate arrays, so only the order inside each array shows. In the Codex file the order is the line order of a fresh `init`. `update` appends the lines a file lacks at its end (`src/agents/enforce/index.ts:232`), so an updated file can hold the same lines in a different order; Codex's decision does not depend on line order.
- **R4 — `update` brings existing installs up to date.** With `enforce: true`, `wikeeper update` writes the R1 and R2 rules into an install made with SPRINT-02's rules. It adds the missing rules, records each one as a wikeeper-owned `rule` entry in the manifest, and keeps every user key and every existing value in its place; a second run changes nothing. Changing `ingest.permission` and running `update` removes the old mode's rules as stale entries (STORY-002-06 identity and stale-removal rules, `src/agents/enforce/index.ts:193`). A settings file that does not parse stops `update` with exit 1 (`settings_invalid`, naming the file), and the file stays byte-identical (STORY-002-06 R6).
- **R5 — `update` with `enforce: false` removes wikeeper's hook and rules (Gate 1 decision 18).** When `enforce` is not `true` in `.wiki/config.yml`, `wikeeper update` removes every `hook` and `rule` entry the manifest records, for every agent, the way `wikeeper remove` does (`removeEnforce`, `src/agents/enforce/index.ts:274`):
  - A settings file that wikeeper only added entries to gets its original bytes back from `<file>.bak`, and the `.bak` is deleted.
  - A settings file wikeeper created and that is empty afterwards is deleted.
  - A file changed since `init` keeps the user's keys and its `.bak`, with `remove`'s warning (`<file> changed since init; backup kept at <file>.bak`).

  Afterwards the manifest records no `hook` or `rule` entry, `wikeeper doctor` prints `enforce: off`, and `doctor --json` has `state.enforce.agents` `[]`. A second `update` writes no settings file. An install that never turned enforce on records no such entries, so its `update` does not change. A settings file that does not parse stops `update` with exit 1 (`settings_invalid`), and the file and the manifest stay unchanged.
- **R6 — SETUP.md preview row.** The `ai` row of the step-4 table (`templates/system/SETUP.md:51`) lists exactly the R1 and R2 `ai` rules, in R3 order. The `ask` and `whitelist` rows (`:52`, `:53`) do not change. The cell format stays the same: `` `permissions.allow`: …; `permissions.ask`: … `` for Claude Code, one code span per Codex line, and Antigravity's "no project rule file" cell. STORY-006-02's red test S2 (`test/templates/setup.red.node.test.ts:243`) compares the rows with the writers, so the `ai` row changes in this story's commit. No other SETUP.md text changes here; the step-4 prose about these prompts (`:41`) is STORY-006-10's. STORY-003-10 (the `read` pair, `ai` row) and STORY-005-09 (the read-only rules, all three rows) edit the table after this story.
- **R7 — The template checker accepts a `*` where the subcommand would be (consistency audit finding 1).** `test/templates/structure.ts` stops reading a command at the `*` in `Bash(wikeeper ingest *--drop*)`. It then checks `--drop` against `ingest`'s own options only and reports `"--drop" is not an option of "ingest"`, for the writer items (`enforceSources`, `:185`) and for SETUP.md. That fails `test/templates.red.node.test.ts:53` (S1) and `test/templates.test.ts:113`. With this story, a reference whose next token after the command word starts with `*` is marked as a wildcard reference, and its flags are checked against the root options, the command's options and the options of every subcommand. `wikeeper ingest *--drop*` then passes and `wikeeper ingest *--nope*` still fails, naming `--nope`. A wildcard reference keeps `words` = `["ingest"]`, so S1's ingest-verb loop (`test/templates.red.node.test.ts:55-66`) sees no `*` verb, and S1 stays green without an edit.

### 1.3 Out of Scope
- Prompting for these flags in `ask` or `whitelist` mode. No wikeeper rule allows `abort` or `apply` there, so the harness's own permission mode decides.
- Antigravity: it has no project rule file (STORY-002-06 R4), so nothing changes for it.
- Other spellings of the same command. Codex prefixes do not see `wikeeper ingest --json abort <id> --drop`, so Codex allows it under `["wikeeper","ingest"]`. A global option before the command word (`wikeeper --json ingest finish <id>`) matches no wikeeper rule, so the harness's own mode decides. Neither harness sees a different invocation such as `sh -c '…'`. Claude Code's docs say a deny or ask rule "isn't a security boundary around the program". A Bash guard hook is not part of this story.
- Claude Code's PowerShell tool on Windows. The existing Bash rules do not apply to it, before or after this story.
- `init` with enforce resolved off. It keeps existing entries as today (`src/agents/enforce/index.ts:199`); only `update` turns enforce off (Gate 1 decision 18). An `update` with no configured agent returns before the enforce phase (`src/agents/index.ts:293`), as today.
- An empty directory left by a deleted rule file, such as `.codex/rules/`. The next `update`'s empty-directory pass removes it (`src/agents/index.ts:196`, which runs before the enforce phase at `:298`), as it already does when an agent is dropped.
- Allow rules for the read-only `lint`, `status` and `rules list`: STORY-005-09 (Gate 1 decision 17, revised 2026-10-17; §1.4 Q3). The template checker reports a rule for a command the CLI does not register as `unknown command` (`test/templates/structure.ts:157-160`), so those rules land only once `lint`, `status` and `rules` exist.
- The WIKI.md and SETUP.md prose about these prompts and turning `enforce` off (STORY-006-10, STORY-006-12). The `read` allow rule (STORY-003-10, which edits the same rule arrays and the SETUP.md `ai` row after this story). The doctor messages (STORY-002-10).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1):** Codex cannot match `--force-unlock` after `<id>`. Should Codex prompt for every `apply` (literal CR-003 C1), or leave `apply` allowed so that `apply --force-unlock` runs without a prompt in Codex?
- **Recommended:** Leave `apply` allowed in Codex. Every ingest runs `apply`, so prompting for it would add a prompt to every `ai`-mode ingest in Codex, which is what `ai` mode exists to avoid. `--force-unlock` only takes over a lock the CLI judges stale and refuses a live one (`lock_not_stale`, `src/ingest/lock.ts:113`), while `--drop` deletes the stored source. SETUP.md's `ai` row shows the difference between the agents. **This changes the CR-003 decision for Codex only:** CR-003 Open Question 3 (approved 2026-10-17) said both forms prompt through "a Codex `prompt` prefix rule", and here Codex `apply --force-unlock` runs without a prompt. Flagged to the human at Gate 1.
- **Decision:** In Codex `ai` mode, `apply` stays allowed and every `abort` prompts; Claude Code prompts for both `--drop` and `--force-unlock` (SPIKE-002). This changes CR-003's decision for Codex only and is flagged to the human (Gate 1 decision 16) — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q2):** The first draft joined two goals: `ai`-mode prompts and doctor wording (CR-003 F3, F4). They share no file and no test. Split it?
- **Recommended:** Split. This story keeps the enforce work; the doctor messages move to STORY-002-10, which owns `src/agents/index.ts`, `src/agents/doctor-checks.ts` and `src/core/setup-files.ts`.
- **Decision:** Split: STORY-002-09 keeps the `ai`-mode prompts and the `enforce: false` cleanup; STORY-002-10 takes the agent-wiring line and the setup-files sub-checks (Gate 1 split 1) — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q3):** Gate 1 decision 17 gives `lint`, `status` and `rules list` allow rules in every mode. The previous revision of this story carried them, but the template checker reports a rule for an unregistered command as `unknown command "wikeeper lint"` (`test/templates/structure.ts:157-160`), for the writer items and for the SETUP.md rows, so this story would have had to wait for STORY-005-02, STORY-005-05 and STORY-005-06. Which story adds them?
- **Recommended:** STORY-005-09, which lands after the three command stories (it depends on STORY-005-02, STORY-005-05 and STORY-005-06). This story then depends on no EPIC-005 story and can run early, and STORY-003-10, which needs this story, no longer waits for EPIC-005 either. Weakening the checker instead would let a rule for a missing command pass.
- **Decision:** The read-only allow rules (`lint`, `status`, `rules list`, every permission mode, from one exported list; none for `rules record`) moved from this story to STORY-005-09, and STORY-002-09 depends on no EPIC-005 story (Gate 1 decision 17, revised 2026-10-17) — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q4):** STORY-006-12 R12 (CR-003 E10b; STORY-006-10 R10 in the first draft) documents turning `enforce` off, but `update` keeps wikeeper's hook and rules when `enforce` is false (`src/agents/enforce/index.ts:199`, consistency audit finding 3). How should `update` turn it off?
- **Recommended:** With `enforce` not `true`, the enforce `update` hook calls `removeEnforce`, the `remove` path, instead of `applyEnforce(…, false)` (R5). Dropping the `:199` condition alone would also remove the entries, but it would leave every user-owned file's `.bak` in place, so `doctor` would report `backup-stale` after every switch-off. `removeEnforce` restores the original bytes and deletes the `.bak`, and its byte-for-byte restore is already tested for `remove`.
- **Decision:** `update` with `enforce: false` removes wikeeper's hook and rules from each agent's settings through `removeEnforce` in `src/agents/enforce/index.ts`; `init` is unchanged (Gate 1 decision 18) — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q5):** The new rules fail SPRINT-01/02 red tests that pin the exact `ai`-mode rule lists (§3.1, "Re-scoped red tests"). A red test changes only with the human's authorisation. May this story's QA-Red step re-scope them?
- **Recommended:** Yes. Edit by test name, only so that each assertion expects this story's `ai`-mode rules at their R3 positions, and change no other assertion. Leaving them failing blocks the sprint; dropping them loses CR-001's guard that no mode allows a broad rule. The list is the consistency audit's red-test table for this story; `test/templates/setup.red.node.test.ts` is not in it, because this story leaves the `ai` row's `permissions.allow` list, which S5 (`:353`) pins, unchanged.
- **Decision:** Re-scoping is authorised as recommended: this story's QA-Red edits exactly the assertions listed in §3.1, only so that they expect this story's rules at their R3 positions, and STORY-006-11 R6 lists them (Gate 1 decision 21) — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q6):** In what order do the new rules go, given that STORY-003-10 adds `read` rules and STORY-005-09 adds the read-only command rules to the same arrays after this story (consistency audit finding 12)?
- **Recommended:** R3: ingest allow rules, then the ingest ask/prompt rules, then (STORY-003-10) the `read` rules, then search, then (STORY-005-09) the read-only command rules. In the Codex `ai` list the prompt lines therefore sit before the search lines, so exact-order assertions are rewritten to the R3 order rather than appended to.
- **Decision:** Rule order in each agent's settings: ingest allow rules, ingest ask/prompt rules (this story), the `read` allow rules (STORY-003-10), `search` allow, the read-only command allow rules (STORY-005-09) (orchestrator technical call, gate1-decisions.md) — _approved (human, 2026-10-17, Gate 1)_

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** SPRINT-01 and SPRINT-02 red tests pin the exact `ai`-mode rule lists and fail on the new rules (full list in §3.1). The Codex `ai` order also changes: the prompt lines go before the search lines.
- **Mitigation:** QA-Red re-scopes exactly the §3.1 assertions in this story's red commit, by test name (the lines are a guide), only so that they expect this story's rules at their R3 positions (§1.4 Q5). The Developer updates the plain tests in `test/agents/enforce.test.ts`, "CR-001 ai mode allows only ingest and search commands" (`:245-270`). STORY-006-02 S2 stays green because R6 updates the `ai` row in the same commit.
- **Risk:** Shared files. STORY-003-10 edits `claude.ts`, `codex.ts`, the SETUP.md `ai` row, `test/agents/enforce.test.ts` and the same red-test lines after this story, and STORY-005-09 then edits the writers, all three SETUP.md rows and the red tests again. `templates/system/SETUP.md` is then edited by STORY-006-10, STORY-006-12 and STORY-006-09 (consistency audit finding 13). STORY-006-11 extends `test/templates/structure.ts` and `test/templates.test.ts` last.
- **Mitigation:** This story changes only SETUP.md line 51, the `ai` row, and runs before STORY-003-10, STORY-005-09 and STORY-006-10, which rebase on it (STORY-006-12 also depends on R5 for the E10 text). Rules are added by identity, so the later insertions move no rule of this story.
- **Risk:** `update` with `enforce: false` removes rules a user wanted to keep.
- **Mitigation:** That is what the key means (Gate 1 decision 18). SETUP.md says so (STORY-006-12 R12), and `init --enforce` writes the rules again. A user's own keys and a hand-changed file's `.bak` are kept (R5).
- **Risk:** Claude Code or Codex change how rules match, so the prompts stop appearing.
- **Mitigation:** The rules use only shapes the docs show: a `*` inside an ask rule, a trailing ` *` and a plain token prefix. The unit tests check the rules against a small model of the documented matching (`test/agents/rule-match.ts`), and §2.2 checks both agents by hand once.
- **Risk:** The Claude pattern also prompts for an ingest command whose text contains `--drop` or `--force-unlock` elsewhere, such as a file named `notes--drop.md`.
- **Mitigation:** Accepted. An extra prompt is the safe direction, and no current verb other than `abort` and `apply` takes these flags.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A fresh `init --enforce`, an `update` over a SPRINT-02 install, and an `update` with `enforce: false` each end in the stated rules. |
| Interfaces | T | Two harness surfaces (Claude `settings.json` rules, Codex `.rules` prefix rules) and the SETUP.md preview that mirrors them. |
| Data | T | The rule set differs by permission mode (`ai`, `ask`, `whitelist`), and R5 by whether wikeeper created the settings file. |
| Rules | T | Destructive flags prompt while routine verbs and `search` are allowed; a malformed settings file is never rewritten. |

```gherkin
Feature: ai-mode prompts and enforce off through update

  @interfaces @rules
  Scenario Outline: ai mode prompts for the destructive flags and allows the routine commands
    Given a git repository with config agents "claude, codex" and ingest.permission "ai"
    When I run "wikeeper init --json --enforce --yes"
    Then .claude/settings.json and .codex/rules/wikeeper.rules hold exactly the "ai" rules of R1 and R2, the Codex file in R3 order
    And the "ai" row of the step-4 table in templates/system/SETUP.md lists exactly those rules
    And the template structure check reports no finding for the writer items or SETUP.md
    And under Claude Code's documented rule matching "<command>" is decided "<claude>"
    And under Codex's documented rule matching "<command>" is decided "<codex>"

    # "prompt" is a Claude ask or a Codex prompt.
    Examples:
      | command                                                           | claude  | codex   |
      | wikeeper ingest start ./notes.md --kind meeting                    | allow   | allow   |
      | npx wikeeper ingest apply src-2026-10-17-notes                     | allow   | allow   |
      | wikeeper ingest finish src-2026-10-17-notes --json                 | allow   | allow   |
      | wikeeper ingest abort src-2026-10-17-notes                         | allow   | prompt  |
      | wikeeper ingest abort src-2026-10-17-notes --drop                  | prompt  | prompt  |
      | npx wikeeper ingest abort --drop src-2026-10-17-notes              | prompt  | prompt  |
      | npx wikeeper ingest apply src-2026-10-17-notes --force-unlock      | prompt  | allow   |
      | wikeeper search roadmap --json                                     | allow   | allow   |

  @paths
  Scenario: update brings an existing ai-mode install up to date, and a mode change swaps the rules
    Given a hand-built SPRINT-02 install with agents "claude, codex", ingest.permission "ai" and enforce true, whose manifest records only SPRINT-02's rules
    And .claude/settings.json also holds the user keys "model" and "permissions.deny"
    When I run "wikeeper update --json"
    Then .claude/settings.json permissions.allow still holds exactly its four SPRINT-02 rules, and permissions.ask holds the four R1 ask rules
    And .codex/rules/wikeeper.rules keeps its four SPRINT-02 lines first and then holds the two R2 abort prompt lines
    And the manifest records each new rule as a wikeeper-owned "rule" entry
    And the user keys are unchanged, and a second "wikeeper update --json" changes no file
    And after setting ingest.permission to "ask", then "whitelist", and running "wikeeper update --json" after each, both files hold exactly that mode's rules of R1 and R2, and the step-4 row for that mode in templates/system/SETUP.md lists exactly them

  Scenario: Error — update never rewrites a malformed settings file
    Given an ai-mode install with enforce true for agent "claude" and SPRINT-02's rules
    And .claude/settings.json is replaced with "{ not json"
    When I run "wikeeper update --json"
    Then the command exits with code 1 and error code "settings_invalid" naming ".claude/settings.json"
    And .claude/settings.json is byte-identical
    And the manifest records none of the new R1 rules

  @paths @data @rules
  Scenario: update with enforce false removes wikeeper's hook and rules
    Given a git repository whose .claude/settings.json holds the user keys "model" and "permissions.deny"
    And "wikeeper init --json --agents claude,codex,antigravity --enforce --yes" ran with ingest.permission "ai"
    When I set enforce to false in .wiki/config.yml and run "wikeeper update --json"
    Then the command exits with code 0
    And .claude/settings.json is byte-identical to the user's original and .claude/settings.json.bak does not exist
    And .codex/hooks.json, .codex/rules/wikeeper.rules and .agents/hooks.json do not exist
    And the manifest records no "hook" or "rule" entry
    And "wikeeper doctor --json" reports state.enforce enabled false with no agents, and no "backup-stale" or "enforce-entry-missing" check
    And a second "wikeeper update --json" writes no settings file
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo with `ingest.permission: ai`, run `init --agents claude --enforce`. Open Claude Code in a trusted folder (accept the trust dialog once), or start it with `--settings .claude/settings.json`: SPIKE-002 found that a fresh, untrusted folder ignores the project settings file. Check that `/permissions` lists the four ask rules and the four allow rules with no startup warning. Ask the agent to run `wikeeper ingest abort <id> --drop` and confirm the harness prompts. Then check that `wikeeper ingest abort <id>` and `wikeeper search roadmap` run without a prompt.
- [ ] With Codex installed, run `codex execpolicy check --pretty --rules .codex/rules/wikeeper.rules -- wikeeper ingest abort x --drop` (expect `prompt`), `… -- wikeeper ingest apply x` (expect `allow`) and `… -- wikeeper search roadmap` (expect `allow`).
- [ ] Set `enforce: false`, run `wikeeper update`, and check with `git status` that the agent settings files are back to their state before `init --enforce`.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/agents/enforce/claude.ts` |
| Related Files | `src/agents/enforce/codex.ts`, `src/agents/enforce/index.ts`, `templates/system/SETUP.md` |
| Test Files | `test/agents/enforce.test.ts`, `test/templates/structure.ts`, `test/templates.test.ts` |
| Test Files (new) | `test/agents/rule-match.ts`, `test/agents/rule-match.test.ts` |
| Re-scoped red tests (QA-Red) | `test/agents/enforce-ai-rules.red.node.test.ts`, `test/agents/enforce.red.node.test.ts` |
| New Files Needed | `test/agents/rule-match.ts`, `test/agents/rule-match.test.ts` |

Re-scoped red-test assertions (lines at `40018c5`, a guide only; QA-Red edits by test name, §1.4 Q5):
- `test/agents/enforce-ai-rules.red.node.test.ts`:
  - "codex: wikeeper.rules holds exactly the two ingest rules, none prefix remove" (`:139`).
  - "hand-built legacy state, then update leaves only the narrow pair and every user key" (`:184`, the Codex lines).
  - "ai: the writers emit exactly the narrow ingest values" (`:234`, `:235`; `:234` lists every `ai` rule item, so it gains the four ask rules).
- `test/agents/enforce.red.node.test.ts`:
  - "ai: allow rules" (`:259`, where `permissions.ask` becomes the four R1 ask rules instead of `undefined`; `:260`).
  - "CLAUDE_ENFORCE items per permission mode" (`:520-526`, the `ai` identities).
  - "CODEX_ENFORCE and ANTIGRAVITY_ENFORCE items" (`:544-548`, the `ai` lines).
- Not edited: `test/templates.red.node.test.ts` S1 (`:53`), which R7 keeps green, and `test/templates/setup.red.node.test.ts`: S2 (`:243`) compares the rows with the writers at run time and R6 updates the `ai` row in the same commit, and S5's `missing [...]` text (`:353`) lists the `ai` row's `permissions.allow`, which this story does not change.

This matches the consistency audit's red-test table for this story. The read-only allow rules, and the `permissions.allow`, `ask`-mode and `whitelist`-mode assertions they change, are STORY-005-09's (Gate 1 decision 17, revised 2026-10-17); STORY-003-10 re-scopes the `read` pair on top of this story's edits.

### 3.2 Technical Logic
- **`claude.ts` (R1, R3).**
  - In the `ai` branch, after the two ingest allow items (`:31`), push four `{ kind: "rule", agent: "claude", identity: "permissions.ask[<rule>]", value: <rule> }` items: `--drop` npx and bare, then `--force-unlock` npx and bare.
  - The search loop (`:39`) stays last; STORY-005-09 later appends the read-only allow rules after it.
  - `IDENTITY_RE` (`src/agents/enforce/index.ts:87`) splits an identity at the first `[`, and no rule contains a bracket, so the identity, merge and remove code does not change.
- **`codex.ts` (R2, R3).**
  - Add `AI_PROMPT_LINES` (the two `abort` prompt lines).
  - Build `[...mode, ...SEARCH_LINES]` (today `:36-37`), where `mode` for `ai` is `[...AI_LINES, ...AI_PROMPT_LINES]`.
  - STORY-003-10 later adds its `read` lines between `mode` and `SEARCH_LINES`, and STORY-005-09 appends its read-only lines after `SEARCH_LINES`.
- **`index.ts` (R5).** Change the enforce extension's `update` (`:449-451`) to `ctx.config.enforce === true ? applyEnforce(ctx, state, true) : removeEnforce(ctx)`. `init` and its `:199` condition stay as they are.
  - `removeEnforce` with no owned entries does nothing, so an install that never turned enforce on is unchanged.
  - It parses every JSON file before writing, so a malformed file throws `settings_invalid` with the manifest intact (`:285-288`).
  - Unlike `applyEnforce` (`:195`), it refuses an entry outside the repository with `unsafe_path`. That is accepted: the manifest is wikeeper's own file, and `remove` behaves the same.
  - The R4 path needs no code: `applyEnforce` adds the desired items that are missing and removes manifest-owned rules that are no longer desired (`:193-201`). Lines missing from the Codex file are appended (`:232`), which is why R3 states the order of a fresh `init`.
  - The tests hand-build the SPRINT-02 settings and manifest (FLASHCARD 2026-10-17 `#qa #test-harness`: a test that relies on `init` does not exercise stale removal).
- **`SETUP.md` (R6).** Rewrite the Claude and Codex cells of row `:51`, the `ai` row. Keep the `; ` separator between the `permissions.allow` and `permissions.ask` parts (`parseClaudeCell` in the S2 test splits on it) and one code span per rule.
- **`test/templates/structure.ts` (R7).**
  - `CommandRef` gains an optional `wildcard?: true`.
  - In `refsInUnit` (`:72-83`), set it when the second word is absent and the text right after the match starts with whitespace then `*`.
  - In `checkRefs` (`:153-177`), when `ref.wildcard` is set and the command has subcommands, `allowed` is the root options plus the command's options plus the union of all its subcommands' options, and an unknown flag is reported as `"<flag>" is not an option of "<cmd>" or any of its subcommands`.
  - References without a `*` are checked exactly as today, and `extractCommandRefs` leaves `wildcard` out when it is not set, so the existing `toEqual` unit tests (`test/templates.test.ts:23-43`) still pass.
- **`test/agents/rule-match.ts` (test helper).**
  - `claudeDecision(perms, command)` returns the first of `deny`, `ask`, `allow` that has a matching `Bash(<pattern>)` rule, else `default`. A pattern matches the whole command, with `*` standing for any text, including none. A trailing ` *` that is the pattern's only `*` also matches the bare command.
  - `codexDecision(lines, argv)` returns the strictest of `forbidden`, `prompt`, `allow` over the lines whose `pattern` is a prefix of `argv`, else `default`.
  - A header comment cites both docs pages and the fetch date. The helper does not model compound commands or wrappers; the scenarios' commands have neither. STORY-005-09 reuses it for the read-only rules.
  - `test/agents/rule-match.test.ts` runs the §2.1 command table against the writers' `ai`-mode output. It also checks `wikeeper ingest --json abort x --drop` (Claude `ask`, Codex `allow`, the gap in §1.3) and, in `ask` and `whitelist` mode, `wikeeper ingest abort x --drop` (`default` in both, §1.3).

### 3.3 API Contract (if applicable)

No new command or option. The written rules are the R1 and R2 tables in the R3 order. `update` follows R4 and, with `enforce: false`, R5. `doctor --json` keeps its shape (STORY-002-07 R6). The structural checker's new finding text is in R7.

## Task Breakdown

- [x] Add the four `ai` ask rules to `CLAUDE_ENFORCE` -> R1, R3
- [x] Add the two `ai` abort prompt lines to the Codex rules writer -> R2, R3
- [x] Route the enforce `update` hook to `removeEnforce` when `enforce` is not true -> R5
- [x] Update the `ai` row of the SETUP.md step-4 table -> R6
- [x] Teach `test/templates/structure.ts` the wildcard reference; add its unit rows to `test/templates.test.ts` -> R7
- [x] Add `test/agents/rule-match.ts` and `test/agents/rule-match.test.ts` with the §2.1 command table -> R1, R2
- [x] Update `test/agents/enforce.test.ts`; add the update, malformed-settings and `enforce: false` tests with hand-built SPRINT-02 state -> R4, R5

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 7 | `CLAUDE_ENFORCE` items for each of the three modes, in R3 order; Codex lines for each of the three modes; `claudeDecision` and `codexDecision` on the §2.1 table plus the `ingest --json abort … --drop` row and the `ask`/`whitelist` `--drop` rows; `structure.ts`: `extractCommandRefs` marks `Bash(wikeeper ingest *--drop*)` as a wildcard reference with flag `--drop`, and on a scratch templates copy `checkCommands` passes `` `Bash(wikeeper ingest *--drop*)` `` and reports `` `Bash(wikeeper ingest *--nope*)` `` naming `--nope`. |
| Integration tests | 0 | Temp repositories only, as in STORY-002-06. |
| E2E / acceptance tests | 11 | One per Gherkin scenario, with Outline rows counted separately (8 + 1 + 1 + 1). The Outline rows share one `init`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The red-test assertions listed in §3.1 re-scoped by QA-Red (not the Developer), only so that they expect this story's rules; `test/templates.red.node.test.ts` S1 and `test/templates/setup.red.node.test.ts` S2 and S5 green without an edit.
- [ ] `test/templates.test.ts` "every check is clean on the package's templates" (`:113`) green.
- [ ] Rule shapes re-checked against the Claude Code and Codex docs at development time and cited in `test/agents/rule-match.ts`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/agents/enforce/claude.ts:30` — the `ai` branch; its ingest allow rules at `:31` stay, and the search loop at `:39` stays after the new ask rules.
- **Surface:** `src/agents/enforce/codex.ts:3` — `AI_LINES`; `src/agents/enforce/codex.ts:12` — `SEARCH_LINES`; `src/agents/enforce/codex.ts:36` joins mode and search lines.
- **Surface:** `src/agents/enforce/index.ts:193` — stale-entry planning that turns old mode rules into removals on `update`; `src/agents/enforce/index.ts:199` — the condition that keeps entries when enforce is off; `src/agents/enforce/index.ts:232` — lines a file lacks are appended; `src/agents/enforce/index.ts:274` — `removeEnforce`, with the `.bak` restore at `:300-324`; `src/agents/enforce/index.ts:449` — the extension's `update` hook; `src/agents/enforce/index.ts:87` — `IDENTITY_RE`.
- **Surface:** `src/agents/enforce/json-merge.ts:173` — removing the last item prunes the emptied containers.
- **Surface:** `src/agents/index.ts:290` — agents `update()`, which returns early with no agent (`:293`) and runs the empty-directory pass (`:295`, `:196`) before the extensions (`:298`).
- **Surface:** `src/commands/doctor.ts:269` — `state.enforce`, whose `agents` list comes from manifest hook and rule entries (`:241-258`).
- **Surface:** `src/commands/ingest-abort.ts:22` — `--drop`; `src/commands/ingest-apply.ts:38` — `--force-unlock`; `src/ingest/lock.ts:113` — `--force-unlock` refuses a lock that is not stale.
- **Surface:** `templates/system/SETUP.md:51` — the `ai` preview row (`:52` `ask`, `:53` `whitelist`, unchanged here); `test/templates/setup.red.node.test.ts:243` — S2 compares them with the writers; `test/templates/setup.red.node.test.ts:353` — S5's exact `missing [...]` text for the `ai` row's `permissions.allow`, which this story leaves unchanged.
- **Surface:** `test/templates/structure.ts:63` — `REF_RE`, which stops at a `*`; `test/templates/structure.ts:135` — `enforceSources`; `test/templates/structure.ts:153` — `checkRefs`, whose unknown-command finding (`:157-160`) is why the read-only rules wait for STORY-005-09.
- **Coverage of this requirement:** partial. The writers, merge, stale removal, `removeEnforce` and the checker exist. The new rules, the `update` branch and the wildcard handling are new.

## Prior work

- [[EPIC-002]] (parent) and [[CR-003]] item C1 with its Open Question 3 (Codex changed by decision 16, §1.4 Q1). This story extends [[STORY-002-06]] (rule writers, identities, `update` stale removal, `removeEnforce`) as narrowed by [[CR-001]] (the `ai` allow rules it keeps). [[SPIKE-002]] confirmed the Claude ask rules. [[STORY-006-02]] owns the SETUP.md preview table and its S2 and S5 tests; [[STORY-006-06]] owns `test/templates/structure.ts`. The read-only allow rules of the previous revision moved to [[STORY-005-09]] (§1.4 Q3). Successors on shared files: [[STORY-003-10]] (`read` rules), [[STORY-005-09]] (read-only rules, all three SETUP.md rows; split from [[STORY-005-05]] on 2026-10-17), [[STORY-006-10]] (SETUP.md text, including turning `enforce` off), [[STORY-006-12]] (E10 text) and [[STORY-006-11]] (structural tests). The doctor half is [[STORY-002-10]]. The wiki duplicate check (index and archive grep, 2026-10-17, repeated at this revision) found no other item that prompts for ingest flags or removes rules on `update`.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/agents/enforce/claude.ts:30` and `src/agents/enforce/codex.ts:3`, the rule lists, and the enforce `update` hook at `src/agents/enforce/index.ts:449`.
- **Why isn't extension / parameterization / config sufficient?** It is an extension: rule strings in two lists, one branch in `update` that reuses `removeEnforce`, one table row and an optional flag on the checker's references, with no new abstraction in `src/`. Dropping `abort` and `apply` from the Claude allow list would be simpler still, but it would prompt for every `abort` and every `apply`, and `apply` runs in every ingest. Claude Code's ask-before-allow order lets the story prompt only for the two flags. Dropping the `:199` condition is the smallest change for R5, but it leaves every user-owned file's `.bak` behind (§1.4 Q4). The one helper added, `test/agents/rule-match.ts`, is test code: without it, no automated test can say which commands prompt.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`test/agents/rule-match.ts` and `test/agents/rule-match.test.ts` are planned new files.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1 approved by the human on 2026-10-17: every §1.4 Decision line is approved as recommended.
