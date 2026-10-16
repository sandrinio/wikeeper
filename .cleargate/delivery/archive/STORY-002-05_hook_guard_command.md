---
story_id: STORY-002-05
parent_epic_ref: EPIC-002
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Completed
approved: true
ambiguity: 🟢 Low
context_source: EPIC-002 (approved 2026-10-16) · architecture.md v0.4 §6 (agent matrix verified 2026-10-16) · verified src/program.ts
actor: AI coding agent writing to the wiki
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
server_pushed_at_version: 4
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:30:26Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: cc1070fdfa490dcf97f96ce544129d5cbd80960ecbbbb776541d7f5bba946e8a
stamp_error: no ledger rows for work_item_id STORY-002-05
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:30:32Z
  sessions: []
---

# STORY-002-05: `wikeeper hook guard` command
**Complexity:** L2 — one command, three small payload/response adapters, fixture-driven tests.

## 1. The Spec (The Contract)

### 1.1 User Story
As a user who enabled enforcement, I want my agent's attempts to edit wiki pages outside an ingest to be blocked with a clear reason, so that every page change goes through the gated ingest and shows up in the log.

### 1.2 Detailed Requirements
- **R1 — Command:** `wikeeper hook guard --agent <claude|codex|antigravity>` reads one JSON payload from stdin (max 1 MB).
- **R2 — Targets:** extract the paths a write tool would change: Claude `Edit` / `Write` / `MultiEdit` → `tool_input.file_path`; Codex `apply_patch` → every `*** Add File:`, `*** Update File:`, `*** Delete File:` and `*** Move to:` path in the patch; Antigravity `write_to_file` / `replace_file_content` → the target-file field. Other tools → allow. Relative paths resolve against the payload's working directory.
- **R3 — Decision:** deny when any target lies inside the wiki pages directory (`<content_dir>/pages/`, from config) and `.wiki/.lock` does not exist; otherwise allow. The lock file (`{ ingest_id, pid, started_at }`, written by EPIC-003) is only checked for existence here.
- **R4 — Responses:** allow → exit 0, no output. Deny → Claude: JSON `hookSpecificOutput` with `permissionDecision: "deny"` and the reason on stdout, exit 0; Codex: reason on stderr, exit 2; Antigravity: `{"decision":"deny","reason":…}` on stdout, exit 0.
- **R5 — Reason text:** "Wiki pages can only change during an ingest. Run `wikeeper ingest apply <id>` first — see .wiki/system/WIKI.md."
- **R6 — Unreadable payload:** malformed JSON, missing fields or an unknown `--agent` value → allow (exit 0) with a one-line warning on stderr (per the recommended answer in §1.4).
- **R7 — Fixtures:** one recorded payload per agent in `test/fixtures/hooks/`, each with a comment file noting the documentation URL it was checked against.
- **Spec clarifications (2026-10-16, CR:spec-clarification from `.cleargate/sprint-runs/SPRINT-01/plans/hook-protocols-research.md`; supersede R2/R4/R7 where they differ):**
  - Claude: also guard `NotebookEdit` (path in `tool_input.notebook_path`); `MultiEdit` is legacy but stays in the list. `tool_input.file_path` is absolute; normalise `\` separators before the containment check.
  - Codex: the patch text is in `tool_input.command` (`tool_name` is always `apply_patch`). The patch also has `*** Begin Patch`, `*** End Patch`, `*** Environment ID:` and `*** End of File` lines; match markers with optional leading whitespace and trim captured paths. A patch sent through the shell (`tool_name: "Bash"`) is not guarded — accepted gap, caught later by `wikeeper lint` (EPIC-005).
  - Antigravity: the payload is `{ toolCall: { name, args: { TargetFile, … } }, workspacePaths: [...] , … }` with no `cwd`, `tool_name` or `tool_input`. Guard `write_to_file`, `replace_file_content` and `multi_replace_file_content`; resolve a relative `TargetFile` against `workspacePaths[0]`. Allow prints `{"decision":"allow"}` on stdout, exit 0 (the field is required); deny is unchanged.
  - Fixtures (R7) follow the field names in the research file; `SOURCES.md` cites its URLs.

### 1.3 Out of Scope
Writing the hook configuration into agent settings (STORY-002-06), creating the lock (EPIC-003), guarding raw sources or `kb_instructions.md`.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question:** When the payload can't be read, should the guard allow (fail open) or deny (fail closed)?
- **Recommended:** Fail open with a warning. The hook runs on every write tool call; a format change in an agent update must not block all the user's edits. `wikeeper lint`'s unlogged-change check (EPIC-005) catches anything that slips through.
- **Human decision:** As recommended (2026-10-16): fail open with a warning.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** The exact payload field names (especially Antigravity's target-file field and Codex's matcher behaviour for `apply_patch`) may differ from what is assumed here.
- **Mitigation:** the Architect verifies each payload shape against the agent's hook documentation before development and records it in the fixtures (R7); the adapters isolate the differences in one module.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Deny vs allow (lock present, path outside pages). |
| Interfaces | T | Three hook protocols with different payloads and responses. |
| Data | T | Codex patches can touch several files at once. |
| Rules | T | Pages may only change while an ingest lock exists. |

```gherkin
Feature: wikeeper hook guard

  @interfaces @rules
  Scenario Outline: A page write without an ingest is denied in each agent's protocol
    Given no .wiki/.lock exists
    And the fixture payload <fixture> writes to .wiki/pages/team.md
    When "wikeeper hook guard --agent <agent>" reads the payload
    Then the response is <response>
    And the reason mentions "wikeeper ingest apply"

    Examples:
      | agent       | fixture                    | response                                              |
      | claude      | claude-write.json          | stdout permissionDecision "deny", exit 0              |
      | codex       | codex-apply-patch.json     | stderr reason, exit 2                                 |
      | antigravity | antigravity-write.json     | stdout {"decision":"deny"}, exit 0                    |

  @paths @rules
  Scenario: A page write during an ingest is allowed
    Given .wiki/.lock exists
    When "wikeeper hook guard --agent claude" reads claude-write.json
    Then the command exits 0 with no output

  @paths
  Scenario: A write outside the pages directory is allowed
    Given no .wiki/.lock exists
    When the payload writes to src/index.ts
    Then the command exits 0 with no output

  @data
  Scenario: A Codex patch touching one page among other files is denied
    Given no .wiki/.lock exists
    And an apply_patch payload updating src/a.ts and .wiki/pages/risks.md
    When "wikeeper hook guard --agent codex" reads it
    Then the command exits 2

  Scenario: Error — an unreadable payload fails open
    When "wikeeper hook guard --agent claude" reads "not json"
    Then the command exits 0
    And stderr contains a one-line warning
    And the same holds for a payload without "tool_input" and for "--agent cursor"
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo with enforcement on, ask Claude Code to edit `.wiki/pages/team.md` and confirm the deny reason appears.
- [ ] Repeat with an ingest applied and confirm the edit goes through.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/commands/hook.ts` |
| Related Files | `src/agents/hook-protocols.ts`, `src/program.ts` |
| Test Files | `test/agents/hook-guard.test.ts` |
| Fixtures | `test/fixtures/hooks/claude-write.json`, `test/fixtures/hooks/codex-apply-patch.json`, `test/fixtures/hooks/antigravity-write.json`, `test/fixtures/hooks/SOURCES.md` |
| New Files Needed | Yes — all files above except `src/program.ts` (modified to register `hook`) |

### 3.2 Technical Logic
- `hook-protocols.ts` exports one adapter per agent: `{ targets(payload): string[] | null, deny(reason): { stdout?, stderr?, exitCode } }`; `null` means unreadable (R6).
- Codex patch parsing: scan lines with `^\*\*\* (Add|Update|Delete) File: (.+)$` and `^\*\*\* Move to: (.+)$`.
- `hook.ts`: read stdin with a 1 MB cap, `JSON.parse` in try/catch, resolve paths with `path.resolve(payload.cwd ?? process.cwd(), p)`, compare against the resolved pages directory with a trailing separator, check `fs.existsSync('.wiki/.lock')`.
- Keep imports minimal (no converters, no search) so the hook starts quickly; config is read with the EPIC-001 config loader.

### 3.3 API Contract (if applicable)

| Command | Input | Output |
|---|---|---|
| `wikeeper hook guard --agent <a>` | PreToolUse payload JSON on stdin | Allow: exit 0, no output · Deny: per-agent response (R4) |

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | Target extraction per agent, Codex multi-file patch, path containment |
| Integration tests | 3 | Spawn the built command with each fixture on stdin |
| E2E / acceptance tests | 5 | 1 per Gherkin scenario in §2.1 |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/fixtures/hooks/SOURCES.md` cites the doc URL each fixture was checked against.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts` — command registry the `hook` command is added to.
- **Coverage of this requirement:** partial — registration point only; the guard is net-new.

## Prior work

- [[EPIC-002]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/program.ts`.
- **Why isn't extension / parameterization / config sufficient?** Each agent's hook system can run a command but none can express "deny writes to this folder unless a lock file exists" in configuration alone, and the three agents send different payloads and expect different responses. One command with three thin adapters is the least that works for all of them.

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

