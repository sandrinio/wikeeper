---
story_id: STORY-002-01
parent_epic_ref: EPIC-002
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-002 (approved 2026-10-16) · architecture.md v0.4 §6 (agent matrix verified 2026-10-16) · verified src/program.ts
actor: Developer installing wikeeper in a repository
complexity_label: L2
parallel_eligible: y
expected_bounce_exposure: low
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
  last_gate_check: 2026-10-16T13:31:22Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-002-01
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:27:57Z
  sessions: []
---

# STORY-002-01: Block injection engine
**Complexity:** L2 — one pure module plus a placeholder template; tricky only in byte-exact round-tripping.

## 1. The Spec (The Contract)

### 1.1 User Story
As a developer installing wikeeper, I want the wiki instructions inserted at the top of my agent files in a clearly marked block — and removed cleanly later — so that my own instructions are never altered.

### 1.2 Detailed Requirements
- **R1 — Insert:** `injectBlock(text, block)` puts the block at the top of the file, followed by one blank line and the original content. When the file starts with YAML frontmatter (`---` … `---`), the block goes directly after the closing `---` line.
- **R2 — Markers:** the block starts with `<!-- WIKI:START v1 — managed by wikeeper -->` and ends with `<!-- WIKI:END -->`. A file that already contains `<!-- WIKI:START` (any version, any content inside) is returned unchanged with status `skipped` (D-11).
- **R3 — Bytes preserved:** a leading BOM stays first in the file; the block uses the file's existing line-ending style (CRLF or LF); content outside the block is byte-identical.
- **R4 — Strip:** `stripBlock(text)` removes the START line through the END line plus the single blank separator line added by R1; everything else is byte-identical, so inject → strip returns the original bytes. A START marker without an END marker returns the text unchanged with status `malformed`.
- **R5 — Empty or missing file:** injecting into an empty string yields the block plus a trailing newline; stripping that yields an empty string.
- **R6 — File helpers:** `injectIntoFile(path, block)` and `stripFromFile(path)` read, transform and write atomically (temp file + rename), creating the file when it does not exist, and return `{ status: injected | skipped | stripped | absent | malformed }`.
- **R7 — Placeholder template:** create `templates/agent-block.md` containing both markers and a placeholder body; EPIC-006 replaces the body.

### 1.3 Out of Scope
Choosing which files to target (STORY-002-02), loading the template and recording manifest entries (STORY-002-04), the final block wording (EPIC-006).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- None — decisions recorded in architecture.md and EPIC-002.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** Mixed line endings in one file make "the file's style" ambiguous.
- **Mitigation:** use the style of the first line break; fall back to LF for files without one; cover with a mixed-ending test.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Inject, skip and strip are separate successful flows. |
| Interfaces | F | Internal module only; exposed through init/remove in STORY-002-04. |
| Data | T | Plain, CRLF, BOM, frontmatter and empty files behave differently. |
| Rules | T | Existing markers are never modified (D-11). |

```gherkin
Feature: Block injection engine

  @paths
  Scenario: Inject into a plain file
    Given AGENTS.md containing "# My rules\n"
    When injectIntoFile is called with the placeholder block
    Then the file starts with "<!-- WIKI:START v1 — managed by wikeeper -->"
    And the block is followed by one blank line and "# My rules\n"
    And the result status is "injected"

  @data
  Scenario Outline: Inject then strip restores the original bytes
    Given a file whose content is <variant>
    When the block is injected and then stripped
    Then the block sits <position>
    And the stripped file is byte-identical to the original

    Examples:
      | variant                            | position                          |
      | LF text                            | at the top                        |
      | CRLF text                          | at the top, with CRLF line breaks |
      | BOM followed by LF text            | right after the BOM               |
      | YAML frontmatter then text         | right after the closing ---       |
      | an empty string                    | alone, with a trailing newline    |

  @rules
  Scenario: A file that already has markers is not modified
    Given CLAUDE.md containing a user-edited block between "<!-- WIKI:START v0" and "<!-- WIKI:END -->"
    When injectIntoFile is called
    Then CLAUDE.md is byte-identical
    And the result status is "skipped"

  @paths
  Scenario: A missing file is created with the block
    Given AGENTS.md does not exist
    When injectIntoFile is called
    Then AGENTS.md contains only the block and a trailing newline
    And stripFromFile on a different missing file returns status "absent" without creating it

  Scenario: Error — strip refuses a block without an END marker
    Given a file containing "<!-- WIKI:START v1" but no "<!-- WIKI:END -->"
    When stripFromFile is called
    Then the file is byte-identical
    And the result status is "malformed"
```

### 2.2 Verification Steps (Manual)
- [ ] Inject into a real CRLF file on Windows CI and confirm `git diff` shows only added lines.
- [ ] Open the injected file in an editor and confirm no BOM duplication.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/agents/inject.ts` |
| Related Files | `templates/agent-block.md` |
| Test Files | `test/agents/inject.test.ts` |
| New Files Needed | Yes — `src/agents/inject.ts`, `templates/agent-block.md`, `test/agents/inject.test.ts` |

### 3.2 Technical Logic
- Pure functions `injectBlock(text, block)` / `stripBlock(text)` returning `{ text, status }`; file helpers wrap them with `fs.promises` and an atomic write (write `<path>.wikeeper-tmp`, then `rename`).
- Detect BOM (`﻿`) and strip it before processing, re-prefix after.
- Detect EOL from the first `\r\n` vs `\n`; normalise the block to that EOL before inserting.
- Frontmatter: only when line 1 is exactly `---`; find the next line that is exactly `---`; insert after it.
- Strip: locate the START line by regex `^<!-- WIKI:START\b.*-->$` (multiline) and the first END line after it; also remove one immediately following empty line if present.
- The block text is a parameter; this module never reads templates itself.

### 3.3 API Contract (if applicable)

Not applicable — internal module with no HTTP or CLI surface; exported functions are listed in §3.2.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 8 | Each Examples row, skip, strip, malformed, mixed line endings |
| Integration tests | 1 | File helpers against a temp directory |
| E2E / acceptance tests | 5 | 1 per Gherkin scenario in §2.1 |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Inject → strip round-trip is byte-identical for every data variant.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `./architecture.md` — §6.4 injection rules and §6.5 pointer block this module implements.
- **Coverage of this requirement:** none — net-new module.

## Prior work

- [[EPIC-002]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** Plain string prepending would duplicate blocks on re-runs, break YAML frontmatter, flip line endings or BOMs, and leave no way to remove the block exactly. A small pure module with a byte-exact round-trip test is the least code that keeps the user's file safe.

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
