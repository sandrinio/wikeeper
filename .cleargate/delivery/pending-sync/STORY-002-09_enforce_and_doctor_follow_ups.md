---
story_id: STORY-002-09
parent_epic_ref: EPIC-002
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
ambiguity: 🟡 Medium
context_source: CR-003 C1, F3, F4 and Open Question 3 (approved 2026-10-17; walkthrough rows 0.9c, 4.2d, 1.6, 6.2) · SPRINT-03 decomposition contract K9 · EPIC-002 · CR-001 · verified src/agents/enforce/claude.ts, src/agents/enforce/codex.ts, src/agents/enforce/index.ts, src/agents/index.ts, src/agents/doctor-checks.ts, src/core/setup-files.ts, src/ingest/lock.ts, templates/system/SETUP.md, test/templates/setup.red.node.test.ts · Claude Code permissions docs and Codex rules docs, fetched 2026-10-17
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T08:58:45Z
updated_at: 2026-10-17T08:58:45Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:00:34Z
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
  model: null
  last_stamp: 2026-10-17T09:00:34Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: ""
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-17T08:46:56Z
---

# STORY-002-09: `ai` mode prompts for `--drop` and `--force-unlock`; `doctor` names what it checked
**Complexity:** L2 — new permission rules in two existing rule writers plus the matching SETUP.md preview row, and two message changes in existing doctor checks. Extends STORY-002-06 (and CR-001), STORY-002-04 and STORY-006-08.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent working in `ai` mode, I want my harness to ask the user before I delete a stored source (`ingest abort … --drop`) or take over another ingest's lock (`ingest apply … --force-unlock`), while the routine ingest steps still run without a prompt, and I want `wikeeper doctor` to say which agent files hold the WIKI block and which setup-file checks it ran, so that a prompt-injected source cannot destroy data silently and I can report the install state without checking files by hand.

### 1.2 Detailed Requirements
- **R1 — Claude Code rules (`.claude/settings.json`).** The `ai` mode keeps its four allow rules and gains four ask rules, appended after the existing items so the order of the earlier items is unchanged. `ask` and `whitelist` are unchanged.

  | Mode | `permissions.allow` | `permissions.ask` |
  |---|---|---|
  | `ai` | `Bash(npx wikeeper ingest *)`, `Bash(wikeeper ingest *)`, `Bash(npx wikeeper search *)`, `Bash(wikeeper search *)` | **new:** `Bash(npx wikeeper ingest *--drop*)`, `Bash(wikeeper ingest *--drop*)`, `Bash(npx wikeeper ingest *--force-unlock*)`, `Bash(wikeeper ingest *--force-unlock*)` |
  | `ask` | `Bash(npx wikeeper search *)`, `Bash(wikeeper search *)` | `Bash(npx wikeeper ingest start *)`, `Bash(wikeeper ingest start *)` |
  | `whitelist` | `Bash(npx wikeeper search *)`, `Bash(wikeeper search *)` | — |

  Each new rule's identity is `permissions.ask[<rule>]`, as for the existing ask rules. This works because Claude Code evaluates deny, then ask, then allow, and a matching ask rule prompts even when an allow rule also matches; a `*` may stand anywhere in a Bash rule and matches any text (Claude Code docs, fetched 2026-10-17). The `*` sits between `ingest` and the flag, not after `abort`, because commander accepts the global `--json` between the two command words: `wikeeper ingest --json abort <id> --drop` runs `abort` with `--drop` (checked 2026-10-17 against the built CLI), and `Bash(wikeeper ingest *)` allows it.
- **R2 — Codex rules (`.codex/rules/wikeeper.rules`).** Codex `prefix_rule` matches only a leading run of command tokens, so no rule can match `--drop` after `<id>` (Codex docs, fetched 2026-10-17). Codex therefore gets the fallback CR-003 approved: every `abort` prompts. The `ai` mode keeps its four allow lines and gains two prompt lines, appended last; when rules overlap, Codex applies the strictest decision (`forbidden` > `prompt` > `allow`). `ask` and `whitelist` are unchanged.

  | Mode | Lines |
  |---|---|
  | `ai` | `prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")`, `prefix_rule(pattern=["wikeeper","ingest"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")`, `prefix_rule(pattern=["wikeeper","search"], decision="allow")`, **new:** `prefix_rule(pattern=["npx","wikeeper","ingest","abort"], decision="prompt")`, `prefix_rule(pattern=["wikeeper","ingest","abort"], decision="prompt")` |
  | `ask` | `prefix_rule(pattern=["npx","wikeeper","ingest","start"], decision="prompt")`, `prefix_rule(pattern=["wikeeper","ingest","start"], decision="prompt")`, the two search allow lines |
  | `whitelist` | the two search allow lines |

  `apply --force-unlock` is not prompted in Codex (Open Question 1).
- **R3 — `update` brings existing installs up to date.** With enforce on, `wikeeper update` writes the R1 and R2 rules into an install made with SPRINT-02's rules: it adds the new rules, records each as a wikeeper-owned `rule` entry in the manifest, keeps every user key, and a second run changes nothing. Changing `ingest.permission` and running `update` removes the rules of the old mode as stale entries (STORY-002-06 identity and stale-removal rules, `src/agents/enforce/index.ts:193`). A settings file that does not parse stops `update` with exit 1 (`settings_invalid`, naming the file) and stays byte-identical (STORY-002-06 R6).
- **R4 — SETUP.md preview row.** The `ai` row of the step 4 table (`templates/system/SETUP.md:51`) lists exactly the R1 and R2 `ai` rules, in the existing cell format (`` `permissions.allow`: …; `permissions.ask`: … ``). STORY-006-02's red test S2 (`test/templates/setup.red.node.test.ts:243`) compares that row with the writers, so it changes in this story's commit. No other SETUP.md text changes here.
- **R5 — `agent-wiring` names the files.** The `ok` summary (`src/agents/index.ts:359`) lists the files that hold the WIKI block and counts them with the right plural, for example `agents claude: WIKI block in AGENTS.md (1 file), 3 skills, 2 sub-agents` and `agents claude, codex: WIKI block in CLAUDE.md, AGENTS.md (2 files), …`. The files are the ones `checkAgentBlocks` reads (manifest `block` entries plus existing target files, `src/agents/doctor-checks.ts:44`), in its order (CLAUDE.md, AGENTS.md, GEMINI.md, then others). Skills and sub-agents use the same plural (`1 skill`). With no such file the text is `no WIKI block (0 files)`. The line still appears only when no agent check is a warning or an error.
- **R6 — `setup-files` lists its sub-checks.** The single `ok` entry (`src/core/setup-files.ts:141`) names what was checked instead of "me.md and project.md are in place": `.wiki/me.md present, ignored by <source>:<line>, not committed; .wiki/project.md present, not ignored`, where `<source>:<line>` is the rule git reported for `me.md` (for a default install, the line of `/.wiki/me.md` in `.gitignore`). Findings, the without-git `info` and the JSON shape stay as they are.

### 1.3 Out of Scope
- Prompting for these flags in `ask` or `whitelist` mode: no wikeeper rule allows `abort` or `apply` there, so the harness's own permission mode decides.
- Antigravity: no project rule file (STORY-002-06 R4); unchanged.
- Other spellings of the same command: Codex prefixes do not see `wikeeper ingest --json abort <id> --drop`, and neither harness sees a different invocation such as `sh -c '…'`. Claude Code's docs say a deny or ask rule "isn't a security boundary around the program". A Bash guard hook is not part of this story.
- Claude Code's PowerShell tool on Windows: the existing Bash rules do not apply to it, before or after this story.
- The WIKI.md and SETUP.md prose about these prompts (STORY-006-10) and the `read` allow rule (STORY-003-10, which edits the same rule arrays and the SETUP.md preview after this story).
- Extra JSON fields for the wiring file list or the setup-file sub-checks; how skills are counted.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question:** Codex cannot match `--force-unlock` after `<id>`. Should Codex prompt for every `apply` (literal CR-003 C1), or leave `apply` allowed so `apply --force-unlock` runs without a prompt in Codex?
- **Recommended:** Leave `apply` allowed in Codex. Every ingest runs `apply`, so prompting it would add a prompt to every `ai`-mode ingest in Codex, which is what `ai` mode exists to avoid. `--force-unlock` only takes over a lock the CLI judges stale and refuses a live one (`lock_not_stale`, `src/ingest/lock.ts:113`), while `--drop` deletes the stored source. SETUP.md's `ai` row shows the difference between the agents. Claude Code prompts for both flags.
- **Human decision:** {populated during Brief review}

- **Question:** This story joins two goals: `ai`-mode prompts (R1–R4, scenarios 1–3) and doctor wording (R5–R6, scenarios 4–5). They share no file and no test, and their shared-file successors differ (STORY-003-10 edits the enforce files after this story, STORY-005-04 the doctor files). Split it?
- **Recommended:** Split into STORY-002-09 (`ai`-mode prompts) and STORY-002-10 (doctor names what it checked), both L1/L2. Then STORY-005-04 does not wait on the enforce half's red-test re-scopes. Kept together, the story stays L2 with five scenarios.
- **Human decision:** {populated during Brief review}

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** SPRINT-01 and SPRINT-02 red tests pin the exact `ai` rule lists and fail on the new rules: in `test/agents/enforce-ai-rules.red.node.test.ts`, "codex: wikeeper.rules holds exactly the two ingest rules, none prefix remove" (line 139), "hand-built legacy state, then update leaves only the narrow pair and every user key" (line 184) and "ai: the writers emit exactly the narrow ingest values" (lines 234–235); in `test/agents/enforce.red.node.test.ts`, "ai: allow rules" (lines 259–260), "CLAUDE_ENFORCE items per permission mode" (line 520) and "CODEX_ENFORCE and ANTIGRAVITY_ENFORCE items" (line 544).
- **Mitigation:** QA-Red re-scopes those assertions in this story's red commit, by test name (lines are a guide only), and only by adding the new rules: they are appended last, so every existing value keeps its position. The Developer updates the plain test `test/agents/enforce.test.ts` (the two "CR-001 ai mode allows only ingest and search commands" tests). STORY-006-02 S5 (`test/templates/setup.red.node.test.ts:353`) stays green because the allow order is unchanged.
- **Risk:** `templates/system/SETUP.md` is also edited by STORY-006-10 and STORY-006-09, and the preview row by STORY-003-10.
- **Mitigation:** this story changes only line 51 (the `ai` row); the Sprint Design Review orders it before STORY-006-10 and STORY-003-10, which rebase on it.
- **Risk:** Claude Code or Codex change how rules match, so the prompts stop appearing.
- **Mitigation:** the rules use only shapes the docs show (a `*` inside an ask rule; a plain token prefix); the unit tests check the rules against a small model of the documented matching; §2.2 checks both agents by hand once.
- **Risk:** the Claude pattern also prompts for an ingest command whose text contains `--drop` or `--force-unlock` elsewhere, such as a file named `notes--drop.md`.
- **Mitigation:** accepted. An extra prompt is the safe direction, and no current verb other than `abort` and `apply` takes these flags.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A fresh `init --enforce` and an `update` over an existing install both end with the new rules; a mode change removes them. |
| Interfaces | T | Two harness surfaces (Claude `settings.json` rules, Codex `.rules` prefix rules); doctor's text and `--json` output. |
| Data | T | The wiring line differs with the number of files that hold the block (1 file vs 2 files). |
| Rules | T | Destructive flags prompt while routine verbs are allowed; a malformed settings file is never rewritten; setup-files reports the checks it ran. |

```gherkin
Feature: ai mode prompts for --drop and --force-unlock; doctor names what it checked

  @interfaces @rules
  Scenario Outline: ai mode prompts for the destructive flags and allows the routine verbs
    Given a repository with config agents "claude, codex" and ingest.permission "ai"
    When I run "wikeeper init --json --enforce --yes"
    Then .claude/settings.json and .codex/rules/wikeeper.rules hold exactly the "ai" rules of the R1 and R2 tables
    And under Claude Code's documented rule matching "<command>" is decided "<claude>"
    And under Codex's documented rule matching "<command>" is decided "<codex>"

    # The codex value for --force-unlock follows Open Question 1.
    Examples:
      | command                                                   | claude | codex  |
      | wikeeper ingest start ./notes.md --kind meeting            | allow  | allow  |
      | npx wikeeper ingest apply 2026-10-17-notes                 | allow  | allow  |
      | wikeeper ingest finish 2026-10-17-notes --json             | allow  | allow  |
      | wikeeper ingest abort 2026-10-17-notes                     | allow  | prompt |
      | wikeeper ingest abort 2026-10-17-notes --drop              | prompt | prompt |
      | npx wikeeper ingest abort --drop 2026-10-17-notes          | prompt | prompt |
      | npx wikeeper ingest apply 2026-10-17-notes --force-unlock  | prompt | allow  |
      | wikeeper search roadmap --json                             | allow  | allow  |

  @paths
  Scenario: update brings an existing ai-mode install up to date, and a mode change removes the new rules
    Given a hand-built SPRINT-02 install with agents "claude, codex", ingest.permission "ai" and enforce on, whose manifest records only SPRINT-02's rules
    And .claude/settings.json also holds the user keys "model" and "permissions.deny"
    When I run "wikeeper update --json"
    Then .claude/settings.json permissions.ask holds the four new R1 rules and permissions.allow is unchanged
    And .codex/rules/wikeeper.rules ends with the two new R2 prompt lines
    And the manifest records each new rule as a wikeeper-owned "rule" entry
    And the user keys are unchanged, and a second "wikeeper update --json" changes no file
    And after setting ingest.permission to "ask", then "whitelist", and running "wikeeper update --json" after each, both files hold exactly that mode's rules of the R1 and R2 tables

  Scenario: Error — update never rewrites a malformed settings file
    Given an ai-mode install with enforce on for agent "claude" and SPRINT-02's rules
    And .claude/settings.json is replaced with "{ not json"
    When I run "wikeeper update --json"
    Then the command exits with code 1 and error code "settings_invalid" naming ".claude/settings.json"
    And .claude/settings.json is byte-identical
    And the manifest records none of the new R1 rules

  @data
  Scenario Outline: doctor's agent-wiring line names the files that hold the WIKI block
    Given a repository whose only agent files are <files>
    When I run "wikeeper init --json --agents <agents> --yes" and then "wikeeper doctor --json"
    Then the "agent-wiring" check is "ok" with a message containing "<text>"
    And the message contains no "1 files"

    Examples:
      | files                   | agents       | text                                                  |
      | AGENTS.md               | claude       | agents claude: WIKI block in AGENTS.md (1 file)        |
      | CLAUDE.md and AGENTS.md | claude,codex | WIKI block in CLAUDE.md, AGENTS.md (2 files)           |

  @rules
  Scenario: doctor's setup-files result lists the sub-checks it ran
    Given a git repository with an initialised wiki, an untracked .wiki/me.md and an untracked .wiki/project.md
    When I run "wikeeper doctor --json"
    Then setup-files is exactly one "ok" entry with the message ".wiki/me.md present, ignored by .gitignore:<n>, not committed; .wiki/project.md present, not ignored"
    And <n> is the line number of "/.wiki/me.md" in .gitignore
    And "wikeeper doctor" prints "[ok] setup-files: " followed by the same message
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo with `ingest.permission: ai` and `init --agents claude --enforce`, open Claude Code: `/permissions` lists the four ask rules with no startup warning; ask the agent to run `wikeeper ingest abort <id> --drop` and confirm the harness prompts; `wikeeper ingest abort <id>` runs without a prompt.
- [ ] With Codex installed, run `codex execpolicy check --pretty --rules .codex/rules/wikeeper.rules -- wikeeper ingest abort x --drop` (expect `prompt`) and `… -- wikeeper ingest apply x` (expect `allow`).
- [ ] Run `wikeeper doctor` in the walkthrough repo and read the `agent-wiring` and `setup-files` lines.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/agents/enforce/claude.ts` |
| Related Files | `src/agents/enforce/codex.ts`, `templates/system/SETUP.md`, `src/agents/index.ts`, `src/agents/doctor-checks.ts`, `src/core/setup-files.ts` |
| Test Files | `test/agents/enforce.test.ts`, `test/agents/rule-match.ts`, `test/agents/doctor-checks.test.ts`, `test/setup-files.test.ts` |
| Re-scoped red tests (QA-Red) | `test/agents/enforce-ai-rules.red.node.test.ts`, `test/agents/enforce.red.node.test.ts` |
| New Files Needed | Yes — `test/agents/rule-match.ts` |

### 3.2 Technical Logic
- `claude.ts` (R1): in the `ai` branch, after the search allow items, push four `{ kind: "rule", agent: "claude", identity: "permissions.ask[<rule>]", value: <rule> }` items. Nothing else in the identity, merge or remove code changes: `IDENTITY_RE` (`src/agents/enforce/index.ts:87`) splits `permissions.ask[<rule>]` at the first `[`, and the rules contain no brackets.
- `codex.ts` (R2): add `AI_PROMPT_LINES` with the two prompt lines and build `[...mode, ...SEARCH_LINES, ...(permission === "ai" ? AI_PROMPT_LINES : [])]` (today `src/agents/enforce/codex.ts:37`).
- `update` (R3) needs no code: `applyEnforce` adds desired items that are missing, and removes manifest-owned rules that are no longer desired (`src/agents/enforce/index.ts:193`). The tests hand-build the SPRINT-02 settings and manifest (FLASHCARD #enforce #test-harness: a test that relies on `init` does not exercise stale removal).
- `SETUP.md` (R4): replace only the Claude and Codex cells of the `ai` row; keep the `; ` separator between the `permissions.allow` and `permissions.ask` parts, which `parseClaudeCell` in the S2 test splits on.
- `doctor-checks.ts` (R5): move the target list of `checkAgentBlocks` (lines 44–52) into an exported `blockTargets(input: AgentCheckInput): string[]`, used by `checkAgentBlocks` unchanged in behaviour.
- `index.ts` (R5): in `doctor()` (line 334), build the summary from `blockTargets(input)`: `WIKI block in ${files.join(", ")} (${plural(files.length, "file")})`, or `no WIKI block (0 files)`, then `plural(n("skill"), "skill")` and `plural(n("subagent"), "sub-agent")`. Reuse `plural` from `src/commands/doctor.ts:35`, as `src/ingest/lock.ts:8` already does; the import has no cycle (`doctor.ts` imports `program.ts` as a type only).
- `setup-files.ts` (R6): keep the ignore `rule` found for `me.md` and build the `ok` message from it: `${me} present, ignored by ${rule.source}:${rule.line}, not committed; ${project} present, not ignored`. The `ok` branch is reached only when both files exist, git ran, `me.md` is ignored and untracked, and `project.md` is not ignored, so every part of the message is a check that passed.
- `test/agents/rule-match.ts` (test helper): `claudeDecision(perms, command)` returns the first of `deny`, `ask`, `allow` with a matching `Bash(<pattern>)` rule, else `default`; a pattern matches the whole command with `*` as any text, including none, and a trailing ` *` that is the pattern's only `*` also matches the bare command. `codexDecision(lines, argv)` returns the strictest of `forbidden`, `prompt`, `allow` over the lines whose `pattern` is a prefix of `argv`, else `default`. A header comment cites the two docs pages and the fetch date. The helper does not model compound commands or wrappers; the scenario's commands have neither. A unit test also checks that Claude decides `wikeeper ingest --json abort x --drop` as `ask`.

### 3.3 API Contract (if applicable)

No new command or option. The written rules are the R1 and R2 tables; the two doctor messages are R5 and R6. `doctor --json` keeps its shape (STORY-002-07 R6).

## Task Breakdown

- [ ] Append the four `ai` ask rules to `CLAUDE_ENFORCE` -> R1
- [ ] Append the two `ai` abort prompt lines to the Codex rules writer -> R2
- [ ] Update the `ai` row of the SETUP.md step 4 table -> R4
- [ ] Add `test/agents/rule-match.ts` and the scenario 1 command table as unit tests -> R1, R2
- [ ] Update `test/agents/enforce.test.ts`; add the update and malformed-settings tests with hand-built SPRINT-02 state -> R3
- [ ] Export `blockTargets` and build the pluralised `agent-wiring` summary from it -> R5
- [ ] Build the `setup-files` `ok` message from the checks that ran -> R6

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 5 | Claude and Codex `ai` items; `claudeDecision` and `codexDecision` on the scenario 1 table plus the `ingest --json abort … --drop` row; `blockTargets` order; summary text for 0, 1 and 2 files and 1 skill; setup-files `ok` message with a fake `Git`. |
| Integration tests | 0 | Temp repositories and real git only, as in STORY-006-08. |
| E2E / acceptance tests | 13 | One per Gherkin scenario, Outline rows counted separately (8 + 1 + 1 + 2 + 1, the first Outline's rows sharing one `init`). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The red tests named in §1.5 re-scoped by QA-Red (not the Developer), by addition only; STORY-006-02 S2 and S5 green.
- [ ] Rule shapes re-checked against the Claude Code and Codex docs at development time and cited in `test/agents/rule-match.ts`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/agents/enforce/claude.ts:30` — the `ai` branch; its allow rules at line 31 stay.
- **Surface:** `src/agents/enforce/codex.ts:3` — `AI_LINES`; `src/agents/enforce/codex.ts:37` joins mode and search lines.
- **Surface:** `src/agents/enforce/index.ts:193` — stale-entry removal that turns old mode rules into removals on `update`; `src/agents/enforce/index.ts:87` — `IDENTITY_RE`.
- **Surface:** `src/agents/index.ts:359` — the `agent-wiring` message "WIKI block in ${n} files".
- **Surface:** `src/agents/doctor-checks.ts:44` — the target list `checkAgentBlocks` reads.
- **Surface:** `src/core/setup-files.ts:141` — the `ok` message "me.md and project.md are in place".
- **Surface:** `templates/system/SETUP.md:51` — the `ai` preview row; `test/templates/setup.red.node.test.ts:243` — S2 compares it with the writers.
- **Surface:** `src/ingest/lock.ts:113` — `--force-unlock` refuses a lock that is not stale.
- **Coverage of this requirement:** partial — the writers, merge, stale removal and both checks exist; the new rules and the two message texts are new.

## Prior work

- [[EPIC-002]] (parent), [[CR-003]] items C1, F3, F4 and its Open Question 3. Extends [[STORY-002-06]] (rule writers, identities, `update` stale removal) as narrowed by [[CR-001]] (the `ai` allow rules this story keeps), [[STORY-002-04]] (`agent-wiring` summary), [[STORY-002-07]] (`plural`, doctor JSON shape) and [[STORY-006-08]] (`setup-files`). [[STORY-006-02]] owns the SETUP.md preview table and its S2 test. The wiki duplicate check (index and archive grep, 2026-10-17) found no other item that prompts for ingest flags or changes these two messages.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/agents/enforce/claude.ts:30` and `src/agents/enforce/codex.ts:3`, the `ai` rule lists.
- **Why isn't extension / parameterization / config sufficient?** It is an extension: four rule strings, two rule lines, one table row and two message strings, with no new abstraction. Dropping `abort` and `apply` from the Claude allow list would be simpler still, but would prompt for every `abort` and every `apply`, and `apply` runs in every ingest; Claude Code's ask-before-allow order lets the story prompt only for the two flags. The one helper added, `test/agents/rule-match.ts`, is test code: without it no automated test can say which commands prompt.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`test/agents/rule-match.ts` is a planned new file.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Open Questions 1 (Codex `apply --force-unlock`) and 2 (split) are open, so the status stays 🟡.
