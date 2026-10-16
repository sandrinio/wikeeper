---
story_id: STORY-001-01
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
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: med
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
  last_gate_check: 2026-10-16T13:30:07Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-001-01
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:27:15Z
  sessions: []
---

# STORY-001-01: CLI core — command registry, `--json` output and exit codes
**Complexity:** L2 — 4 source files plus CI, known commander patterns.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent, I want every wikeeper command to give me one parseable JSON result and a meaningful exit code, so that I can act on the outcome without scraping human text.

### 1.2 Detailed Requirements
- **R1 — Command registry.** `src/program.ts` builds the program from a list of command modules; each module exports `register(program: Command): void`. Later stories add modules to the list; this story ships the mechanism.
- **R2 — Global `--json`.** A program-level `--json` flag is visible to every subcommand (read via `optsWithGlobals()`).
- **R3 — Output.** `src/core/output.ts` exposes `emitResult(ctx, { command, data, message, warnings })` and `emitError(ctx, error)`. Human mode: message lines to stdout, errors to stderr. JSON mode: exactly one JSON object on stdout — success `{ "ok": true, "command", "data", "warnings": [] }`, failure `{ "ok": false, "command", "error": { "code", "message", "details" } }`.
- **R4 — Exit codes.** `src/core/exit-codes.ts` defines `ExitCode` = `OK 0 · ERROR 1 · USAGE 2 · NEEDS_APPROVAL 3 · DENIED 4 · NEEDS_INPUT 5` and `WikeeperError(exitCode, code, message, details?)`. `src/cli.ts` catches errors: `WikeeperError` → its exit code; commander usage errors (unknown option/command, missing or invalid argument, excess arguments) → 2; any other error → 1. Help and version still exit 0.
- **R5 — Portable CI.** `.github/workflows/ci.yml` runs on `ubuntu-latest`, `macos-latest`, `windows-latest` × Node 22 and 24. A new `./.gitattributes` (`* text=auto eol=lf`) keeps fixtures byte-stable on Windows checkouts.

### 1.3 Out of Scope
- Any real subcommand (init, update, … come in STORY-001-04 to 001-07).
- Colour, spinners or other human-output styling.

### 1.4 Open Questions

- None — decisions recorded in architecture.md and EPIC-001.

### 1.5 Risks

- **Risk:** Windows runners fail on path separators or CRLF line endings in later tests.
- **Mitigation:** `.gitattributes` forces LF; tests build paths with `node:path` and compare posix-normalised relative paths.
- **Risk:** commander writes usage errors to stderr itself, producing non-JSON output in `--json` mode.
- **Mitigation:** `exitOverride()` plus `configureOutput({ writeErr })` routed through `emitError` when `--json` is set.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One success path per command; nothing branches on a successful run. |
| Interfaces | T | The same result is exposed through human output and JSON output. |
| Data | F | Result payloads are opaque to this story. |
| Rules | T | The exit-code mapping is a rule; each error class must map to its code. |

```gherkin
Feature: CLI core — command registry, --json output and exit codes

  @interfaces
  Scenario: A registered command returns JSON
    Given a test command registered through the command registry that returns data {"x": 1}
    When I run it with "--json"
    Then stdout contains exactly one JSON object with "ok": true, "command" and "data": {"x": 1}
    And the exit code is 0

  @interfaces
  Scenario: The same command prints human output
    Given the same registered test command
    When I run it without "--json"
    Then stdout contains its human message and no JSON
    And the exit code is 0

  @rules
  Scenario Outline: Error — typed errors map to exit codes
    Given a registered test command that throws WikeeperError with exit code <exit> and code "<code>"
    When I run it with "--json"
    Then stdout contains one JSON object with "ok": false and "error.code": "<code>"
    And the exit code is <exit>

    Examples:
      | exit | code           |
      | 1    | error          |
      | 3    | needs_approval |
      | 4    | denied         |
      | 5    | needs_input    |

  @rules
  Scenario: Error — usage errors exit with code 2
    When I run "wikeeper --json --no-such-flag"
    Then stdout contains one JSON object with "ok": false and "error.code": "usage"
    And the exit code is 2

  Scenario: CI covers three operating systems
    Given .github/workflows/ci.yml
    When the workflow runs on a push to main
    Then jobs run on ubuntu-latest, macos-latest and windows-latest for Node 22 and 24
```

### 2.2 Verification Steps (Manual)
- [ ] `node dist/cli.js --json --no-such-flag; echo $?` prints one JSON object and `2`.
- [ ] `node dist/cli.js --version` still prints the version and exits 0.
- [ ] The GitHub Actions run for the commit shows 6 green jobs.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/core/output.ts` |
| Related Files | `src/core/exit-codes.ts`, `src/program.ts`, `src/cli.ts`, `test/program.test.ts`, `test/output.test.ts`, `test/exit-codes.test.ts`, `.github/workflows/ci.yml`, `./.gitattributes` |
| New Files Needed | Yes — `src/core/output.ts`, `src/core/exit-codes.ts`, `test/output.test.ts`, `test/exit-codes.test.ts`, `./.gitattributes` |

### 3.2 Technical Logic
- `createProgram(commands = defaultCommands)` takes the module list so tests can register a fake command; `defaultCommands` is an empty array in this story.
- Each action handler receives a context `{ json: boolean, stdout, stderr }` built from `optsWithGlobals()`; output helpers write through it so tests can capture streams.
- `src/cli.ts` wraps `parseAsync` in try/catch: commander errors (`err.code` starting with `commander.`) → `helpDisplayed` / `version` exit 0, everything else exit 2 with `error.code = "usage"`; `WikeeperError` → `err.exitCode`; unknown → 1 with `error.code = "error"`. Set `process.exitCode`, never call `process.exit()` mid-stream.
- JSON is serialised with `JSON.stringify(obj)` + `\n`, one object per invocation.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper <command> --json` | CLI | None | global flag `--json` | `{ ok, command, data, warnings }` or `{ ok: false, command, error: { code, message, details } }` |

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | output helpers (human/JSON × result/error), exit-code mapping, usage-error mapping |
| Integration tests | 0 | No external services. |
| E2E / acceptance tests | 4 | One per executable Gherkin scenario (the CI scenario is verified by the workflow run). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.
- [ ] CI green on all six matrix jobs.

## Existing Surfaces

- **Surface:** `src/program.ts` — commander program with `--version` / `--help`; becomes the command registry.
- **Surface:** `src/cli.ts` — bin entry; gains top-level error handling.
- **Surface:** `.github/workflows/ci.yml` — single-OS matrix; extended to three OSes.
- **Coverage of this requirement:** partial — entry point exists; registry, output and exit codes are net-new.

## Prior work

- [[EPIC-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/program.ts`.
- **Why isn't extension / parameterization / config sufficient?** Commander alone prints free text and exits with 1 on every failure. The agent needs to distinguish "needs approval" from "denied" from "broken", and to parse results; that requires one shared output contract and an exit-code table that every later command uses.

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
