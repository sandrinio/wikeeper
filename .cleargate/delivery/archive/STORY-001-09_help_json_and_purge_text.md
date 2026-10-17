---
story_id: STORY-001-09
parent_epic_ref: EPIC-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
ambiguity: 🟢 Low
context_source: CR-002 A3, A4 (approved 2026-10-16; SPRINT-01 walkthrough step 0.4e) · EPIC-001 · verified src/program.ts, src/commands/remove.ts, commander 15.0.0 help behaviour
actor: AI coding agent reading `wikeeper <command> --help`
complexity_label: L1
parallel_eligible: y
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:40:00Z
updated_at: 2026-10-16T18:40:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 3
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
last_synced_body_sha: e85611190c5fbb9662ba1daa87cad94059d36d53c6bc5ca0f7602d264d2736d6
stamp_error: no ledger rows for work_item_id STORY-001-09
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:49:04Z
  sessions: []
---

# STORY-001-09: `--json` in every subcommand's help; `--purge` help text
**Complexity:** L1 — one help setting on the root program, one option description, and a help test that walks every registered command. Extends STORY-001-01 and STORY-001-06.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent, I want every `wikeeper <command> --help` to show the `--json` option and to say exactly what a destructive flag deletes, so that I can call commands correctly from their help alone.

### 1.2 Detailed Requirements
- **R1 — `--json` in every help.** The help of every command and nested subcommand of the default program (`init`, `update`, `remove`, `doctor`, `setup`, `hook`, `hook guard`, and every command later stories add, such as `ingest start` or `search`) lists `--json` with its description "machine-readable output".
- **R2 — Later commands inherit it.** The mechanism lives in `createProgram` (`src/program.ts`), so a command registered through `program.command(…)` or `<group>.command(…)` shows `--json` without any code of its own. A help test walks the whole command tree of the default program, so a later story that registers a command another way fails that test.
- **R3 — `--purge` says what it deletes.** `remove --help` describes `--purge` as deleting `.wiki/` (including `config.yml`, `kb_instructions.md` and `me.md`) and the wiki content — `pages/`, `raw/`, `index.md`, `log/` — whether it lives in `.wiki/` or in `content_dir`; it no longer says "the content directory". The confirmation requirement stays in the text.
- **R4 — Parsing unchanged.** `--json` stays one global option: it works before or after the subcommand name, and unknown options still exit 2.

### 1.3 Out of Scope
- Per-command `--json` options or per-command JSON schemas.
- The interactive `--purge` confirmation prompt text (`src/commands/remove.ts:48`).
- The root help's "pre-alpha" notice.

### 1.4 Open Questions

- None. Commander 15's `showGlobalOptions` help setting is inherited by every subcommand created with `.command()` (checked 2026-10-16 with the installed commander 15.0.0).

### 1.5 Risks

- **Risk:** A command added with `program.addCommand(new Command(…))` does not inherit help settings, so it would not show `--json`.
- **Mitigation:** R2's test walks the real command tree of `createProgram()`, so it fails as soon as such a command is registered; the convention is stated in the test's description.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One way through: reading a command's help. |
| Interfaces | T | Top-level commands and nested subcommands (`hook guard`) expose the same option. |
| Data | F | Help text does not vary by data. |
| Rules | T | Every registered command shows `--json`; `--purge` help names what it deletes. |

```gherkin
Feature: --json in every help and an exact --purge description

  @interfaces @rules
  Scenario: every command and subcommand shows --json
    Given the default wikeeper program
    When the help of every command and nested subcommand is rendered
    Then each help lists "--json" with "machine-readable output"

  @rules
  Scenario: a command registered later inherits --json in its help
    Given a test command module that registers "probe" with a nested "probe run" through ".command()"
    When the program is built with the default commands plus that module
    Then the help of "probe" and of "probe run" lists "--json"

  @rules
  Scenario: remove --help names what --purge deletes
    When I run "wikeeper remove --help"
    Then the --purge description names ".wiki/", "pages/", "raw/", "index.md", "log/" and "content_dir"
    And it does not contain "the content directory"

  Scenario: Error — option parsing is unchanged
    When I run "wikeeper doctor --jsn"
    Then the command exits with code 2
    And "wikeeper doctor --json" still returns a JSON envelope
```

### 2.2 Verification Steps (Manual)
- [ ] Run `wikeeper init --help`, `wikeeper hook guard --help` and `wikeeper remove --help` and read the output.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/program.ts` |
| Related Files | `src/commands/remove.ts`, `test/program.test.ts` |
| New Files Needed | Yes — `test/help.test.ts` |

### 3.2 Technical Logic
- In `createProgram`, call `.configureHelp({ showGlobalOptions: true })` on the root `Command` before the registration loop (`src/program.ts:68`); `.command()` copies help configuration to each subcommand at creation time, which is why the existing comment requires registration after `exitOverride`/`configureOutput`. The root help also lists `-v, --version` under "Global Options"; that is expected.
- The help test builds `createProgram()` with an IO that captures output, walks `program.commands` recursively, and checks `cmd.helpInformation()` for each command. It uses the default command list so commands added by later stories are covered automatically.
- `remove.ts`: replace the `--purge` description at line 156, e.g. `also delete .wiki/ (config.yml, kb_instructions.md, me.md) and the wiki content: pages/, raw/, index.md, log/, in .wiki/ or content_dir (needs confirmation)`.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper <command> --help` | CLI | None | — | help text with a "Global Options" section listing `--json` |

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 1 | The recursive help walk over `createProgram()`. |
| Integration tests | 0 | No external services. |
| E2E / acceptance tests | 4 | One per Gherkin scenario. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts:47` — `--json` is a root-only option, so subcommand help does not list it.
- **Surface:** `src/program.ts:68` — the registration loop every command goes through.
- **Surface:** `src/commands/remove.ts:156` — the `--purge` description "also delete .wiki/ and the content directory".
- **Coverage of this requirement:** partial — `--json` already works on every command; only its help listing and the `--purge` wording are missing.

## Prior work

- [[EPIC-001]] (parent), [[CR-002]] items A3 and A4. Extends [[STORY-001-01]] (CLI core, global `--json`) and [[STORY-001-06]] (`remove --purge`). The wiki duplicate check found no other prior work.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/program.ts:47`, the root `--json` option.
- **Why isn't extension / parameterization / config sufficient?** It is a configuration change — one help setting and one description string. It is kept as a story because the help test is the guard every SPRINT-02 command story (`ingest`, `index`, `search`) relies on; without it a command registered differently would silently drop `--json` from its help.

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
