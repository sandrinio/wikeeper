---
story_id: STORY-002-07
parent_epic_ref: EPIC-002
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: CR-002 A2, A5 (approved 2026-10-16; SPRINT-01 walkthrough steps 0.1c, 1.4e, 1.5b, 2.4) · EPIC-002 · verified src/commands/doctor.ts, src/agents/doctor-checks.ts, src/agents/enforce/index.ts, src/core/config.ts, src/core/integrations.ts
actor: AI coding agent checking the install with `wikeeper doctor --json`
complexity_label: L3
parallel_eligible: y
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:40:00Z
updated_at: 2026-10-16T18:40:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:23:58Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-002-07
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:51:09Z
  sessions: []
---

# STORY-002-07: `doctor` reporting — severities, plurals, effective state, enforce entries and `.bak` files
**Complexity:** L3 — touches the core `doctor` command and the agents checks: one severity change, a pluralised summary, a new additive `state` object, and three new agent checks. Extends STORY-001-07, STORY-002-04 and STORY-002-06.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent, I want `wikeeper doctor` to report the effective setup, permission mode and enforcement wiring, and to flag only real problems as warnings, so that I can tell the user what is configured and what needs fixing without reading the config and settings files myself.

### 1.2 Detailed Requirements
- **R1 — `claude-agents-md-only` is information.** The check keeps its id and trigger (claude configured, `AGENTS.md` present, no `CLAUDE.md`) but has severity `info` and the message "Claude Code older than v2.1.277 ignores AGENTS.md when no CLAUDE.md exists"; its fix reads "if your Claude Code is older than v2.1.277, update it, or create CLAUDE.md and run wikeeper init". It no longer counts as a warning. (`info` already exists in `DoctorSeverity`, `src/core/integrations.ts:7`, since STORY-002-06; no type change.)
- **R2 — Pluralised summary.** The human summary line reads `<n> error` / `<n> errors` and `<n> warning` / `<n> warnings` with the singular for exactly 1 (`0 errors, 1 warning`; `1 error, 2 warnings`).
- **R3 — Effective state.** `doctor --json` returns a new `state` object next to `checks`, `errors` and `warnings`:
  - `setup_completed_at`: the config value, or `null`.
  - `permission`: `{ mode, default }`, where `mode` is the effective `ingest.permission` and `default` is `true` when `.wiki/config.yml` does not set `ingest.permission`.
  - `enforce`: `{ enabled, agents }`, where `enabled` is the effective `enforce` value and `agents` lists, per configured agent, each settings file with the hook and rule identities the manifest records as wikeeper's (backup entries excluded); `agents` is `[]` when nothing is recorded.
  The human output prints the same three facts above the checks, for example `setup: not completed — ask your agent to follow .wiki/system/SETUP.md`, `ingest permission: ask (default)`, `enforce: on — claude: .claude/settings.json (1 hook, 2 rules)`.
- **R4 — Missing or unreadable enforce entries.** With enforce on, for each settings file holding manifest-owned hook or rule entries:
  - `enforce-entry-missing` (warning, fix "run wikeeper update") when one or more owned entries are no longer in the file; the message names the file and the missing identities.
  - `enforce-settings-invalid` (error, fix "fix the JSON in <file>, then run wikeeper update") when the file cannot be parsed. Doctor reports it and continues; it never throws.
- **R5 — Stale or orphaned backups.** For the JSON settings files enforce writes (`.claude/settings.json`, `.codex/hooks.json`, `.agents/hooks.json`):
  - `backup-orphaned` (warning) when `<file>.bak` exists on disk and the manifest does not record it as wikeeper's backup; fix "delete <file>.bak if it holds nothing you need".
  - `backup-stale` (warning) when the manifest records `<file>.bak` but `<file>` no longer holds any wikeeper-owned entry, so no later `remove` will restore or delete it; fix "delete <file>.bak: wikeeper no longer edits <file>".
- **R6 — JSON stays backward compatible.** `checks`, `errors` and `warnings` keep their shape and meaning; `info` checks count as neither; every existing check id keeps its trigger; `state` is the only new top-level key. A repo without configured agents gets no new checks.

### 1.3 Out of Scope
- Fixing anything: doctor reports, `update` and `remove` act. Cleaning up a stale backup automatically is not part of this story.
- The `.bak-<stamp>` copies `update` makes of edited `.wiki/system/` files; they hold the user's own edits and are already reported by `update`.
- Detecting the installed Claude Code version.
- The `init`/`update` report changes and `.bak` gitignoring (STORY-002-08).

### 1.4 Open Questions

- None. CR-002 A2 gives the new wording; A5 lists the facts to report. Putting the state in a separate `state` object rather than as extra `checks` rows keeps the STORY-001-07 check list (and its red test, which asserts the exact ids of a healthy install) unchanged.

### 1.5 Risks

- **Risk:** Two SPRINT-01 red tests assert the old `warning` severity of `claude-agents-md-only` (`test/agents/integration.red.node.test.ts:175`, `test/agents/doctor-checks.red.node.test.ts:118`).
- **Mitigation:** QA-Red re-scopes those two assertions to `info` in this story's red commit (sprint-execution §C.0.2 step 6); the Developer never edits them.
- **Risk:** The enforce-entry inspection needs the identity matcher that is private to `src/agents/enforce/index.ts`, and importing it from `doctor-checks.ts` could create a runtime import cycle through `src/agents/index.ts`.
- **Mitigation:** Export one inspection function from `src/agents/enforce/index.ts`; its import of `../index.js` is type-only, so no runtime cycle. A unit test imports `doctor-checks.ts` on its own to prove it.
- **Risk:** CR-001 (SPRINT-01) changes the `ai` rules; rule counts in tests would go stale.
- **Mitigation:** Tests compare `state.enforce` with the identities recorded in the manifest, not with hard-coded counts.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Enforce wiring intact vs an owned entry deleted by hand. |
| Interfaces | F | One surface (`doctor`, human and `--json` render the same result). |
| Data | T | The reported state depends on what `config.yml` sets (permission unset, set, setup stamped). |
| Rules | T | Information is not a warning; backups no remove will handle are flagged; an unreadable settings file is an error. |

```gherkin
Feature: doctor reporting

  @rules
  Scenario: claude-agents-md-only is information, not a warning
    Given an initialised repository with agents "claude", only AGENTS.md and no CLAUDE.md
    When I run "wikeeper doctor --json"
    Then check "claude-agents-md-only" has severity "info" and a message containing "older than v2.1.277"
    And data.warnings is 0 and the exit code is 0
    And "wikeeper doctor" ends with "0 errors, 0 warnings"

  @data
  Scenario Outline: the effective state is reported
    Given an initialised repository where config.yml sets ingest.permission to "<permission>" and setup_completed_at to "<stamp>"
    When I run "wikeeper doctor --json"
    Then data.state.permission is mode "<mode>" with default <default>
    And data.state.setup_completed_at is <setup>
    And "wikeeper doctor" prints "ingest permission: <printed>"

    Examples:
      | permission | stamp                | mode      | default | setup                  | printed       |
      | (unset)    | (unset)              | ask       | true    | null                   | ask (default) |
      | ask        | (unset)              | ask       | false   | null                   | ask           |
      | whitelist  | 2026-10-16T12:00:00Z | whitelist | false   | "2026-10-16T12:00:00Z" | whitelist     |

  @paths
  Scenario Outline: enforce entries are listed per agent and missing ones are flagged
    Given a repository initialised with "wikeeper init --json --agents claude,codex --enforce --yes"
    And <change>
    When I run "wikeeper doctor --json"
    Then data.state.enforce.enabled is true
    And data.state.enforce.agents lists, per agent and settings file, the hook and rule identities recorded in the manifest
    And check "enforce-entry-missing" <outcome>

    Examples:
      | change                                                   | outcome                                                                                   |
      | nothing else is changed                                  | is absent                                                                                 |
      | the guard hook is deleted from .claude/settings.json      | is a warning naming ".claude/settings.json" and "hooks.PreToolUse[guard:claude]", with fix "run wikeeper update" |

  @rules
  Scenario Outline: backups that no remove will handle are flagged
    Given <setup>
    When I run "wikeeper doctor --json"
    Then check "<id>" is a warning naming ".claude/settings.json.bak"
    And the exit code is 0 and "wikeeper doctor" ends with "0 errors, 1 warning"

    Examples:
      | setup                                                                                                                        | id              |
      | a repository initialised with "--agents claude --enforce --yes" and a hand-written .claude/settings.json.bak                | backup-orphaned |
      | a user's .claude/settings.json backed up by "init --agents claude,codex --enforce --yes", then agents set to "[codex]" and "wikeeper update" | backup-stale    |

  Scenario: Error — an unreadable settings file is reported, not thrown
    Given a repository initialised with "--agents claude --enforce --yes"
    And .claude/settings.json is replaced with "{ not json"
    When I run "wikeeper doctor --json"
    Then check "enforce-settings-invalid" has severity "error" naming ".claude/settings.json"
    And the exit code is 1 and "wikeeper doctor" ends with "1 error, 0 warnings"
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo, run `init --enforce`, delete the guard hook from `.claude/settings.json`, and read the human `doctor` output.
- [ ] Re-run the walkthrough's doctor steps (0.1c, 1.5b, 2.4) and confirm the false-positive warning is gone.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/commands/doctor.ts` |
| Related Files | `src/agents/doctor-checks.ts`, `src/agents/enforce/index.ts`, `src/core/config.ts`, `test/doctor.test.ts`, `test/agents/doctor-checks.test.ts`, `test/agents/integration.red.node.test.ts`, `test/agents/doctor-checks.red.node.test.ts` |
| New Files Needed | Yes — `test/doctor-reporting.test.ts` |

### 3.2 Technical Logic
- `config.ts`: add `configKeyIsSet(root: string, keyPath: string): Promise<boolean>` — reads `.wiki/config.yml` with the existing `readIfExists`, parses it with `YAML.parseDocument` and returns `doc.hasIn(keyPath.split("."))`; `false` when the file is missing or does not parse.
- `doctor.ts` (`runDoctor`): after the checks, build `state` from the effective `config` doctor already loaded (`DEFAULT_CONFIG` when there is none), `configKeyIsSet(root, "ingest.permission")`, and the manifest's `hook`/`rule` entries with an `identity` other than `backup`, grouped by `agent` then `path`. `DoctorResult` gains `state: DoctorState`. `render()` prints the three state lines first and uses a `plural(n, word)` helper for the summary (line 233).
- `enforce/index.ts`: export `inspectOwnedEntries(root: string, manifest: Manifest): Promise<Array<{ file: string; agent: string; missing: string[]; invalid: boolean }>>`, reusing `IDENTITY_RE`, `selectorMatch`, `loadJsonDoc` and the lines-file reading; and `ENFORCE_JSON_FILES: readonly string[]`, derived from `SPECS` (`format === "json"`).
- `doctor-checks.ts`: change `checkClaudeAgentsMdOnly` (line 104) per R1; add `checkEnforceEntries` (R4, only when `config.enforce`) and `checkBackups` (R5) to `AGENT_CHECKS` and their ids to `AGENT_CHECK_IDS`. They run inside the agents integration's doctor handler, so a repo with no configured agents gets none of them (`src/agents/index.ts:315`).
- `agent-wiring` keeps its rule: its `ok` summary row appears when no agent check is a warning or error; with R1, a repo whose only finding was `claude-agents-md-only` now also gets that `ok` row.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper doctor` | CLI | None | `--json` | `{ checks: DoctorCheck[], errors: number, warnings: number, state: { setup_completed_at: string \| null, permission: { mode: "ai" \| "ask" \| "whitelist", default: boolean }, enforce: { enabled: boolean, agents: Array<{ agent: string, files: Array<{ file: string, hooks: string[], rules: string[] }> }> } } }` |

## Task Breakdown

- [ ] Add `configKeyIsSet` to `src/core/config.ts` with a unit test -> R3
- [ ] Build `state`, render the state lines and pluralise the summary in `src/commands/doctor.ts` -> R2, R3, R6
- [ ] Change `checkClaudeAgentsMdOnly` severity and wording -> R1
- [ ] Export `inspectOwnedEntries` and `ENFORCE_JSON_FILES` from `src/agents/enforce/index.ts` -> R4, R5
- [ ] Add `checkEnforceEntries` and `checkBackups` to `AGENT_CHECKS` -> R4, R5
- [ ] Write the scenario tests in `test/doctor-reporting.test.ts`; QA-Red re-scopes the two `warning` assertions to `info` -> R1–R6

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 4 | `configKeyIsSet`; `plural`; `inspectOwnedEntries` on a JSON and a lines file; `doctor-checks.ts` imports alone (no cycle). |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 9 | One per Gherkin scenario, Outline rows counted separately (1 + 3 + 2 + 2 + 1). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The STORY-001-07 healthy-install check list (`test/doctor.red.node.test.ts:83`) is unchanged and green.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/agents/doctor-checks.ts:104` — `checkClaudeAgentsMdOnly`, severity `warning` today.
- **Surface:** `src/commands/doctor.ts:233` — the summary line `${errors} errors, ${warnings} warnings`.
- **Surface:** `src/commands/doctor.ts:220` — error and warning counts; `info` already counts as neither.
- **Surface:** `src/core/integrations.ts:7` — `DoctorSeverity` already includes `info`.
- **Surface:** `src/agents/enforce/index.ts:79` — `IDENTITY_RE` and `selectorMatch` (line 91), the identity matching R4 reuses.
- **Surface:** `src/core/config.ts:176` — `loadConfig` fills defaults and cannot tell an unset key from a default value.
- **Coverage of this requirement:** partial — doctor and the agents checks exist; the state report, the three new checks and the wording change are new.

## Prior work

- [[EPIC-002]] (parent), [[CR-002]] items A2 and A5. Extends [[STORY-001-07]] (`doctor`), [[STORY-002-04]] (agent checks) and [[STORY-002-06]] (enforce entries and backups). [[BUG-002]] (SPRINT-01) stops backups of wikeeper-created settings files; R5 reports the backups that remain. The wiki duplicate check found no other prior work.

## Why not simpler?

- **Smallest existing surface that could carry this:** the agents doctor handler and `AGENT_CHECKS` in `src/agents/doctor-checks.ts:183`.
- **Why isn't extension / parameterization / config sufficient?** The severity change and plural are parameter edits, but the walkthrough's missing facts (permission default, enforce entries, stale backups) need data doctor does not compute today: whether a key is set in `config.yml`, which owned entries are still in each settings file, and which `.bak` files nothing will clean up. Reporting the state as a separate object keeps the check list, and every consumer of it, unchanged.

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
