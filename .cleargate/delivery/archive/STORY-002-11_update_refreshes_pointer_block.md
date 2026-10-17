---
story_id: STORY-002-11
parent_epic_ref: EPIC-002
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
ambiguity: 🟢 Low
context_source: SPRINT-03 gate1-decisions.md 2026-10-17 (split 6; decision 23, approved by the human 2026-10-17 with the real-user review additions; decision 22, the block text STORY-006-12 writes) · architecture.md D-11 (`:517`) and §6.5 (`:249`, `:264`), which decision 23 amends · STORY-006-01 §1.3 and §1.5 (the gap this story closes, and why the marker stays `v1`) · SPRINT-02 plan (D-11 kept, 2026-10-16) · git history of templates/agent-block.md (`dc3ca13`, `f7951a0`; sprint closes `3876726`, `a0f0550`) · cleargate-wiki-query 2026-10-17 · verified src/agents/inject.ts, src/agents/index.ts, src/agents/doctor-checks.ts, src/commands/update.ts, src/commands/init.ts, src/commands/doctor.ts, templates/agent-block.md, test/agents/integration.red.node.test.ts, test/settings-reports.red.node.test.ts, test/update.red.node.test.ts, test/agents/inject.red.node.test.ts, test/agents/pointer-block.red.node.test.ts, test/templates/structure.ts at 31d363a (no code change since 40018c5)
actor: Maintainer of a repository that installed wikeeper in an earlier sprint
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-002-10
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T11:50:30Z
updated_at: 2026-10-17T11:50:30Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T11:54:00Z
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
  last_stamp: 2026-10-17T11:53:35Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: ""
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-17T11:47:09Z
---

# STORY-002-11: `wikeeper update` refreshes an unedited pointer block
**Complexity:** L2. One pure function and a file wrapper in `src/agents/inject.ts`, one loop in the agents `update()` in `src/agents/index.ts`, and a new data file listing the blocks earlier releases shipped, with a test that keeps that list complete. It amends D-11 (Gate 1 decision 23): `update` may now rewrite a block, but only one that is exactly a block wikeeper shipped.

## 1. The Spec (The Contract)

### 1.1 User Story
As a maintainer whose repository got wikeeper's pointer block in an earlier sprint, I want `wikeeper update` to replace that block with the current one when I never edited it, to leave it alone and tell me how to refresh it when I did, and never to put back a block I deleted, so that my agents read the current instructions without my hand-editing CLAUDE.md, AGENTS.md or GEMINI.md.

### 1.2 Detailed Requirements
- **R1 — The shipped blocks.** A new `src/agents/shipped-blocks.ts` exports `SHIPPED_BLOCKS: readonly string[]`. It holds the normalised text (R2) of every pointer block a wikeeper release shipped, oldest first. The last entry is the current `templates/agent-block.md`. Each entry is written as an array of its lines joined with `"\n"`, so the backticks in the text need no escaping. When this story merges, the list holds two entries:
  - [0] the SPRINT-01 block (STORY-002-01, `dc3ca13`, shipped in the SPRINT-01 close `3876726`; 8 lines);
  - [1] the SPRINT-02 block (STORY-006-01, `f7951a0`, shipped in the SPRINT-02 close `a0f0550`; 12 lines; today's template).

  An entry is never edited, removed or reordered. A change to the template text appends one entry (R6). STORY-006-12 appends the third (decision 22).
- **R2 — Normalising.** `normaliseBlock(text)` in `src/agents/inject.ts` drops a leading BOM, turns every CRLF into LF and drops trailing line breaks. Nothing else is normalised: trailing spaces, blank lines and case count. A file's block runs from its WIKI:START line (`^<!-- WIKI:START\b.*-->$`, the pattern of `stripBody`, `src/agents/inject.ts:77`, and of doctor, `src/agents/doctor-checks.ts:32`) through the first `<!-- WIKI:END -->` line after it. It is normalised the same way before any comparison, and so is the template.
- **R3 — `update` refreshes an unedited block.** For each manifest `block` entry left after `pruneDeconfigured` (`src/agents/index.ts:295`), `update` reads the file and compares its block with the normalised template:
  - **Current.** The block equals the template. Nothing is written or reported.
  - **Shipped.** The block equals another `SHIPPED_BLOCKS` entry. It is replaced by the template:
    - The lines from the START line through the END line become the template's lines, joined with the file's line ending (`detectEol`, `src/agents/inject.ts:21`).
    - The BOM and every byte outside the block stay as they were.
    - The file is written atomically (`atomicWrite`, `:109`), through a symlink to its real path, as `injectIntoFile` does.
    - `data.replaced` lists `<path>#wiki-block`, the form `remove` uses for a block (`src/agents/index.ts:127`). The human summary counts it among the replaced files (`src/commands/update.ts:252`).
    - The manifest entry is unchanged (`sha256: null`, `created` kept).
    - A second `update` finds the block current and reports nothing.
  - **Anything else** is an edited block (R4).

  `update` reads `agent-block.md` only when the manifest has at least one `block` entry. An install with no configured agent returns before this step (`:293`), as today. The step runs after `installAssets` (`:296`) and before the extensions (`:298`), the order `init` uses (`:272-281`).
- **R4 — An edited block is left alone with a warning.** The file is not written. `data.warnings` gets exactly `<path>: WIKI block was edited, so update left it unchanged; to get the current block, delete it from its WIKI:START line to its WIKI:END line and run wikeeper init`, and `update` still exits 0. Every `update` repeats the warning while the block stays edited. The fix works because `injectBlock` skips only a file that already has a START marker (`src/agents/inject.ts:53`), so `init` injects the current block into the file again (`src/agents/index.ts:272-279`). `wikeeper init` is already doctor's fix for a missing block (`src/agents/doctor-checks.ts:59`, `:95`).
- **R5 — A block `update` cannot match is never recreated or repaired.** `update` writes nothing and adds no warning when the file has no START line (the block was deleted, or only its markers were), when it has a START line with no END line after it, when it has two or more START lines, or when the file is missing. Doctor keeps reporting these as `agent-block-missing`, `agent-block-markers-deleted` and `agent-block-duplicated` (`src/agents/doctor-checks.ts:42-99`). A file that is not valid UTF-8 is left unchanged with the warning `<path> is not valid UTF-8; WIKI block left unchanged`, so `update` does not fail on it. `init` still fails there with `E_NOT_UTF8` (`src/agents/inject.ts:105`).
- **R6 — The list stays complete when the text changes.** A new `test/agents/shipped-blocks.test.ts` defines `SHIPPED_BLOCK_SHA256`. It pins, in order, the sha256 (hex, of the UTF-8 text) of every `SHIPPED_BLOCKS` entry:
  - SPRINT-01: `4f32351f65f803b265a2bbca697724e6f06738c71680622e8267efc23078fb1b`;
  - SPRINT-02: `9bc080837857cacb59c42db9907fad82a148e1c000973d5f08792a7d62295d66`.

  A test-local `checkShippedBlocks(template, shipped, pins): string[]` returns one message per broken rule:
  - (a) If the normalised template is not the last entry: `templates/agent-block.md changed: append its text to SHIPPED_BLOCKS in src/agents/shipped-blocks.ts and its sha256 <hash> to SHIPPED_BLOCK_SHA256; keep every earlier entry`.
  - (b) If an entry has no pin at its position: `SHIPPED_BLOCKS entry <n> (sha256 <hash>) is not pinned in SHIPPED_BLOCK_SHA256`.
  - (c) If a pin matches no entry at its position: `pinned shipped block <n> (sha256 <hash>) is missing or changed: a shipped block is never edited or removed`.
  - (d) If an entry is not a well-formed block (first line a START line, last line `<!-- WIKI:END -->`) or repeats an earlier entry, a message naming that entry.

  The test runs the check on the real values and expects no message. A template change therefore cannot merge unless its previous text stays in the list. Dropping a shipped text means deleting its pin as well, which a reviewer sees.
- **R7 — The marker and doctor do not change.**
  - **Marker.** It stays `v1` (`WIKI_START_V1`, `src/agents/inject.ts:4`). The list tells texts apart, not the marker. Inject, strip and doctor accept any text after `WIKI:START` (`:53`, `:77`, `src/agents/doctor-checks.ts:32`). SPRINT-01 and SPRINT-02 red tests pin the `v1` line (`test/agents/inject.red.node.test.ts:61`, `test/agents/pointer-block.red.node.test.ts:55`). A user's edit keeps the marker, so a marker version could never tell an edited block from an unedited one anyway.
  - **Doctor.** An old unedited block passes doctor's block checks, and `agent-wiring` stays `ok`, both before and after `update`. In the same way, an older package's `.wiki/system/` files pass `manifest-drift` until `update` runs: doctor compares the install with its own manifest, never with the package (`src/commands/doctor.ts:194`).
- **R8 — Existing tests stay green unchanged.**
  - `test/agents/integration.red.node.test.ts` S2 "update refreshes skills but leaves an edited block alone" (`:111`): CLAUDE.md is edited, so it stays byte-identical. S2 does not read the R4 warning. AGENTS.md holds the current block, so nothing is written to it.
  - `test/settings-reports.red.node.test.ts` S5 "update never recreates a deleted block" (`:195`): its block is the `.gitignore` managed block (`src/commands/update.ts:195-217`), which this story does not touch. R4's warning follows that check's wording, "run wikeeper init to restore the block".
  - `test/update.red.node.test.ts` "is a no-op when nothing changed" (`:174`): no agent is configured.
  - `test/e2e/goal.test.ts` (3): the block is current right after `init`.

### 1.3 Out of Scope
- The new block text (STORY-006-12, decision 22). This story only freezes the two texts already shipped.
- A doctor report for an outdated block (architecture.md §6.5, "block version older than the package (report, don't rewrite)"). A general "install older than the package" check would cover the block and `.wiki/system/` together and is a follow-up candidate.
- `init` refreshing an old block. `init` still skips any file that has a START marker, so under D-11 as amended only `update` rewrites a block.
- Injecting into agent files that have no manifest `block` entry, such as a GEMINI.md created after `init`. That stays `init`'s job.
- Merging a user's edits into the new block.
- Recording the amendment in `architecture.md` (D-11 at `:517`, §6.5 at `:249` and `:264`). It is a planning document, and the orchestrator records Gate 1 decision 23 there.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1):** The manifest records `sha256: null` for `block` entries (`src/agents/index.ts:278`). How does `update` tell an unedited block from an edited one?
- **Recommended:** Compare the file's normalised block with the texts earlier releases shipped (R1–R3). The alternatives were weighed and rejected:
  - (a) A block hash in the manifest. SPRINT-01 and SPRINT-02 installs have `null` there, so the list is needed anyway. Doctor's `manifest-drift` would also read a non-null hash as the hash of the whole agent file and report every agent file as modified (`src/commands/doctor.ts:194`).
  - (b) A marker version per text. An edited block keeps its marker, so the version cannot say whether the text was edited, and the red tests pin `v1` (R7).
  - (c) Storing only hashes in `src`. A text change would then be an unreadable diff.

  Both shipped texts go in the list, SPRINT-01 included: the SPRINT-01 walkthrough install in `formapass_management` may still hold it.
- **Decision:** `update` refreshes a block whose normalised text equals an entry of `SHIPPED_BLOCKS` (`src/agents/shipped-blocks.ts`: the SPRINT-01 block and the SPRINT-02 block, which is today's template), comparing after normalising line endings and a BOM — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q2):** What does `update` do with an edited block, and what does it tell the user?
- **Recommended:** Leave the file alone and warn, naming the file and the fix: delete the block and run `wikeeper init` (R4). `init` is the command that injects, and doctor already names it for a missing block. `wikeeper remove` followed by `init` would also work, but it removes skills, sub-agents and enforce entries as well.
- **Decision:** An edited block is left unchanged with the warning `<path>: WIKI block was edited, so update left it unchanged; to get the current block, delete it from its WIKI:START line to its WIKI:END line and run wikeeper init`; a deleted, unterminated or duplicated block is never written (R5) — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q3):** Should the marker change from `v1` to `v2` when the text changes?
- **Recommended:** No (R7). STORY-006-01 kept `v1` for the same reason (its §1.5).
- **Decision:** The marker stays `<!-- WIKI:START v1 — managed by wikeeper -->`; `SHIPPED_BLOCKS` identifies the text — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q4):** What does `wikeeper doctor` report for an old unedited block before `update` runs?
- **Recommended:** Nothing new (R7). Adding a check for the block alone would flag one stale file while the stale `.wiki/system/` files stay silent. `update` fixes both. It is the step that brings an install up to a newer package: its help text is "bring wikeeper's own files up to the installed version" (`src/commands/update.ts:233`).
- **Decision:** Doctor is unchanged; an old unedited block passes its block checks before and after `update` — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q5):** How does this keep working when a later story changes the block text?
- **Recommended:** R6: a test pins the hash of every shipped entry and requires the template to be the last entry. The first story to change the text (STORY-006-12) must append its text and its pin, and it cannot drop the SPRINT-02 text without deleting a pin.
- **Decision:** `test/agents/shipped-blocks.test.ts` pins `SHIPPED_BLOCK_SHA256` and fails when the template is not the last entry, an entry is unpinned, or a pinned entry is missing or changed; STORY-006-12 appends the new block and its pin — _approved (human, 2026-10-17, Gate 1)_

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** A user who edited the block on purpose gets the R4 warning on every `update`.
- **Mitigation:** Accepted. It is one line, it names the file and the fix, and it never changes the exit code. Keeping a record of dismissed warnings is not worth a manifest field.
- **Risk:** A block edited back to exactly a shipped text is replaced.
- **Mitigation:** That text is wikeeper's own, so no user wording is lost.
- **Risk:** `update` has no rollback. If an extension fails after the refresh (for example `settings_invalid`), the refreshed block stays.
- **Mitigation:** The refreshed block is what `init` would write. `update` already replaces `.wiki/system/` files before it runs the integrations (`src/commands/update.ts:127-187`).
- **Risk:** Shared file. STORY-002-10 edits `doctor()` in `src/agents/index.ts` (`:359`) and `src/agents/doctor-checks.ts`.
- **Mitigation:** This story edits only `update()` in that file and does not edit `doctor-checks.ts`. It depends on STORY-002-10 and rebases on it.
- **Risk:** STORY-006-12 changes the template and forgets the list.
- **Mitigation:** R6 fails its commit, and STORY-006-12's §3.1 lists `src/agents/shipped-blocks.ts` and `test/agents/shipped-blocks.test.ts`.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | An unedited block reaches the current text through `update`. An edited block reaches it through the R4 fix (delete it, run `init`). A current block is left as it is. |
| Interfaces | F | One surface, `wikeeper update`. Its JSON and human output carry the same report, and doctor does not change (R7). |
| Data | T | The shipped text differs by release (SPRINT-01, SPRINT-02), the file by line ending and BOM, and R5 by file state. |
| Rules | T | Only an exact shipped text is replaced; a block `update` cannot match is never written; the shipped list only grows. |

```gherkin
Feature: wikeeper update refreshes an unedited pointer block

  @paths @data
  Scenario Outline: update replaces a block an earlier release shipped and keeps the rest of the file
    Given a git repository whose CLAUDE.md holds team text, initialised with "wikeeper init --json --agents claude --yes"
    And the block in CLAUDE.md is replaced with the <release> entry of SHIPPED_BLOCKS, and the file is rewritten with <shape>
    And a templates copy whose agent-block.md has one more line before its WIKI:END line
    When I run "wikeeper doctor --json"
    Then no check has an id starting "agent-block-" and "agent-wiring" is "ok"
    When I run "wikeeper update --json" with that templates copy
    Then it exits 0 and data.replaced contains "CLAUDE.md#wiki-block"
    And the block in CLAUDE.md is the copy's agent-block.md line for line, with <shape> kept
    And every byte of CLAUDE.md outside the block is unchanged, and the manifest's CLAUDE.md block entry is unchanged
    And a second "wikeeper update --json" with the same copy has no "CLAUDE.md#wiki-block" in data.replaced and leaves CLAUDE.md byte-identical

    Examples:
      | release   | shape                        |
      | SPRINT-01 | LF line endings              |
      | SPRINT-02 | CRLF line endings and a BOM  |

  @paths @rules
  Scenario: an edited block is left alone with a warning that says how to refresh it
    Given a git repository with CLAUDE.md and AGENTS.md, initialised with "wikeeper init --json --agents claude,codex --yes"
    And the block in AGENTS.md is the SPRINT-01 entry of SHIPPED_BLOCKS
    And in the block in CLAUDE.md "## Project Wiki" is replaced with "## Edited by the team"
    And a templates copy whose agent-block.md has one more line before its WIKI:END line
    When I run "wikeeper update --json" with that templates copy
    Then it exits 0, CLAUDE.md is byte-identical, and data.replaced contains "AGENTS.md#wiki-block" and not "CLAUDE.md#wiki-block"
    And data.warnings contains "CLAUDE.md: WIKI block was edited, so update left it unchanged; to get the current block, delete it from its WIKI:START line to its WIKI:END line and run wikeeper init"
    When I delete the CLAUDE.md block from its WIKI:START line to its WIKI:END line and run "wikeeper init --json --yes" with that templates copy
    Then the block in CLAUDE.md is the copy's agent-block.md and the team text is unchanged
    And test/agents/integration.red.node.test.ts S2 and test/settings-reports.red.node.test.ts S5 pass unchanged

  Scenario Outline: Error — update never recreates, repairs or rewrites a block it cannot match
    Given a git repository whose CLAUDE.md holds team text, initialised with "wikeeper init --json --agents claude --yes"
    And CLAUDE.md is changed so that <state>
    And a templates copy whose agent-block.md has one more line before its WIKI:END line
    When I run "wikeeper update --json" with that templates copy
    Then it exits 0, data.replaced has no "CLAUDE.md#wiki-block", and CLAUDE.md is <after>
    And data.warnings <warning>
    And "wikeeper doctor --json" reports the same "agent-block-" checks for CLAUDE.md as before the update

    Examples:
      | state                                                    | after          | warning                                                                     |
      | the block is deleted                                     | byte-identical | has no entry starting "CLAUDE.md:"                                          |
      | the two marker lines are deleted and the text kept       | byte-identical | has no entry starting "CLAUDE.md:"                                          |
      | the WIKI:END line is deleted                             | byte-identical | has no entry starting "CLAUDE.md:"                                          |
      | a second copy of the SPRINT-01 block follows the first   | byte-identical | has no entry starting "CLAUDE.md:"                                          |
      | the file is deleted                                      | still missing  | has no entry starting "CLAUDE.md:"                                          |
      | the SPRINT-01 block is followed by the byte 0xFF         | byte-identical | contains "CLAUDE.md is not valid UTF-8; WIKI block left unchanged"          |

  @rules
  Scenario: Every block a release shipped stays in the list
    Given SHIPPED_BLOCKS in src/agents/shipped-blocks.ts and SHIPPED_BLOCK_SHA256 in test/agents/shipped-blocks.test.ts
    Then SHIPPED_BLOCKS holds the SPRINT-01 block and then the SPRINT-02 block, whose sha256 are the two R6 pins in that order
    And checkShippedBlocks on templates/agent-block.md and the real list and pins returns no message
    And with an agent-block.md that has one more line and the list unchanged, it returns a message naming "templates/agent-block.md" and "append its text to SHIPPED_BLOCKS"
    And with that text appended as a third entry but no third pin, it names entry 2 and its sha256 as not pinned
    And with the SPRINT-02 entry replaced by that text, it names pinned shipped block 1 as missing or changed
```

### 2.2 Verification Steps (Manual)
- [ ] In `~/Documents/Dev/formapass_management` (installed in SPRINT-02), run `git stash` or work in a scratch clone. Build the merged sprint branch, run `wikeeper update`, and check with `git diff` that only the lines between the WIKI markers of each agent file changed. Once STORY-006-12 has merged, they must now show its block.
- [ ] In a scratch clone, add a word inside the block of CLAUDE.md, run `wikeeper update`, read the warning, follow it, and check that CLAUDE.md now holds the current block and the team text is unchanged.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/agents/inject.ts` |
| Related Files | `src/agents/index.ts` |
| New Files Needed | `src/agents/shipped-blocks.ts`, `test/agents/block-refresh.test.ts`, `test/agents/shipped-blocks.test.ts` |

- **Notes on the files above:**
  - Related files: `src/agents/index.ts`, `update()` only (`:290-300`). STORY-002-10 edits `doctor()` in the same file first, so this story depends on it.
  - New files: the R1 list, the R3–R5 tests (unit tests of the pure function, plus the §2.1 scenarios in temp repositories through `runCli`), and the R6 invariant test.
- **Read, not edited (consumed, unchanged):**
  - `src/agents/doctor-checks.ts` (block checks, R7).
  - `src/commands/update.ts` (passes `replaced` and `warnings` through, `:190`, `:193`; `createUpdateCommand({ templatesDir })` for the tests, `:228`).
  - `src/commands/init.ts` (`createInitCommand({ templatesDir })`, `:294`).
  - `src/commands/doctor.ts` (`:194`).
  - `templates/agent-block.md` (read at run time; STORY-006-12 changes its text).
  - The tests named in R8, which stay green without an edit.

### 3.2 Technical Logic
- **`shipped-blocks.ts` (R1).**
  - `export const SHIPPED_BLOCKS: readonly string[] = [[…lines].join("\n"), …]`. Copy each entry from `git show 3876726:templates/agent-block.md` and `git show a0f0550:templates/agent-block.md`, without the final newline.
  - A header comment says the list is append-only and that R6's test pins it.
  - The module imports nothing.
- **`inject.ts` (R2–R5).**
  - Add `normaliseBlock(text: string): string`.
  - Add `refreshBlock(text: string, block: string, shipped: readonly string[]): { text: string; status: "current" | "refreshed" | "edited" | "absent" | "malformed" }`. It is pure:
    - Run `validateBlock` on the template, as `injectBlock` does.
    - `splitBom` the file and scan its body for START lines.
    - None gives `absent`. Two or more, or no END line after the one START, give `malformed`.
    - Otherwise compare `normaliseBlock` of the span with `normaliseBlock(block)` (`current`) and with each `shipped` entry.
    - On a match, rebuild the text as `bom + before + template lines joined with detectEol(body) + after`, where `before` and `after` are the exact bytes around the span.
    - No match gives `edited`.
  - Add `refreshInFile(path, block, shipped)`:
    - It returns `{ status }`, plus `"missing"` when `readUtf8` (`:93`) returns null and `"not-utf8"` when it throws `E_NOT_UTF8`.
    - It writes through `atomicWrite(existing.real, …)` only on `refreshed`.
- **`index.ts` (R3–R5).** In `update()`, after `installAssets`:
  - Collect the manifest `block` entries. If there are any, call `loadBlock(ctx)` once. Then for each entry call `refreshInFile(fromPosixRelative(ctx.root, e.path), block, SHIPPED_BLOCKS)`.
  - `refreshed` pushes `` `${e.path}#wiki-block` `` to `a.replaced`.
  - `edited` and `not-utf8` push the R4 and R5 warnings to `a.warnings`.
  - The other statuses push nothing.
  - The manifest is not touched.
- **Tests.**
  - `block-refresh.test.ts` builds each case on a real `init` in a temp git repository. It overwrites the block with a `SHIPPED_BLOCKS` entry, then drives `update` and `init` through `runCli` with `createUpdateCommand` and `createInitCommand` and a templates copy (the pattern of `test/agents/integration.red.node.test.ts:111-126`). BOMs are written as `﻿` escapes (FLASHCARD `#encoding #bom`).
  - `shipped-blocks.test.ts` defines `SHIPPED_BLOCK_SHA256` and `checkShippedBlocks`, runs the check on the real template and list, and runs it on the three mutations of §2.1.

### 3.3 API Contract (if applicable)

No new command, option or JSON field. `update --json` keeps its shape (`replaced`, `added`, `removed`, `backed_up`, `warnings`), with `<path>#wiki-block` in `replaced` (R3) and the R4 and R5 warning texts. New exports: `SHIPPED_BLOCKS` (`src/agents/shipped-blocks.ts`); `normaliseBlock`, `refreshBlock` and `refreshInFile` (`src/agents/inject.ts`). STORY-006-12 consumes `SHIPPED_BLOCKS` and `SHIPPED_BLOCK_SHA256` (it appends one entry to each).

## Task Breakdown

- [ ] Add `src/agents/shipped-blocks.ts` with the SPRINT-01 and SPRINT-02 blocks -> R1
- [ ] Add `normaliseBlock`, `refreshBlock` and `refreshInFile` to `src/agents/inject.ts`, with unit tests for each status -> R2, R3, R5
- [ ] Call the refresh from the agents `update()` and report `<path>#wiki-block` and the warnings -> R3, R4, R5
- [ ] Write `test/agents/block-refresh.test.ts` from the first three §2.1 scenarios -> R3, R4, R5, R7, R8
- [ ] Write `test/agents/shipped-blocks.test.ts` with the pins and `checkShippedBlocks` -> R6
- [ ] Run `npm test` in full; confirm the R8 tests pass without an edit -> R8

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 4 | `normaliseBlock` (BOM, CRLF, trailing line breaks; trailing spaces kept). `refreshBlock` for `current`, `refreshed` (LF; CRLF with a BOM; after YAML frontmatter), `edited`, `absent` and `malformed` (no END; two STARTs). `checkShippedBlocks` on the real values. `checkShippedBlocks` on the three mutations. |
| Integration tests | 0 | Temp git repositories and in-process `runCli` only, as in STORY-002-10. |
| E2E / acceptance tests | 10 | One per Gherkin scenario, with Outline rows counted separately (2 + 1 + 6 + 1). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The tests named in R8 pass without an edit, and no red test is changed.
- [ ] `SHIPPED_BLOCKS` entries match `git show 3876726:templates/agent-block.md` and `git show a0f0550:templates/agent-block.md` exactly (R6 pins).
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/agents/inject.ts:4` — `WIKI_START_V1`; `src/agents/inject.ts:17` — `splitBom`; `src/agents/inject.ts:21` — `detectEol`; `src/agents/inject.ts:51` — `injectBlock`, which skips a file that already has the marker at `:53`; `src/agents/inject.ts:77` — the START pattern in `stripBody`; `src/agents/inject.ts:93` — `readUtf8`; `src/agents/inject.ts:109` — `atomicWrite`.
- **Surface:** `src/agents/index.ts:108` — `loadBlock`; `src/agents/index.ts:127` — the `<path>#wiki-block` report form; `src/agents/index.ts:274` — `init` injects; `src/agents/index.ts:278` — the manifest `kind: "block"` entry with `sha256: null`; `src/agents/index.ts:290` — `update`, which never touches the block today.
- **Surface:** `src/agents/doctor-checks.ts:31` — `REFERENCE`, the fixed path of the installed WIKI.md; `src/agents/doctor-checks.ts:34` — `readBlockSignature` (the heading of the current template); `src/agents/doctor-checks.ts:42` — `checkAgentBlocks`, whose markers-deleted test (`:86`) uses that signature.
- **Surface:** `src/commands/update.ts:182` — the integrations' report merged into `replaced` and `warnings`; `src/commands/update.ts:215` — the `.gitignore` block's "run wikeeper init to restore the block".
- **Surface:** `test/agents/integration.red.node.test.ts:111` — S2, an edited block left alone; `test/settings-reports.red.node.test.ts:195` — S5, the `.gitignore` block never recreated.
- **Coverage of this requirement:** partial. Locating, stripping and injecting a block, the atomic write and the report lists exist. Comparing with shipped texts and replacing in place are new.

## Prior work

- [[STORY-002-01]] built `injectBlock` and its skip at the START marker, `stripBlock` and the `v1` marker. [[STORY-002-04]] made the agents `update` refresh skills and never touch blocks (its R3, D-11), and built doctor's block checks. [[STORY-006-01]] wrote the SPRINT-02 block, named this gap in its §1.5 and kept `v1`. [[SPRINT-02]] kept D-11 at planning, so the new block reached fresh installs only. [[STORY-001-05]] built `update` and its backups of edited system files. [[STORY-002-08]] never recreates the `.gitignore` block, the wording precedent for R4.
- Parents and rules: [[EPIC-002]] (parent; the D-11 rule), [[EPIC-006]] (owns the block text), [[CR-002]] (14-line cap), [[EPIC-001]] (never modify user-owned files: only the block, which wikeeper owns, changes).
- Successors and shared files: [[STORY-002-10]] (shares `src/agents/index.ts`), [[STORY-006-12]] (the first text change after this story, decision 22).
- The cleargate-wiki-query check (2026-10-17) and a grep of the wiki, `.cleargate/delivery/archive/` and `.cleargate/FLASHCARD.md` for "pointer block", "agent-block", "WIKI:START", "injectBlock" and "update" found no item that refreshes the block on `update`.

## Why not simpler?

- **Smallest existing surface that could carry this:** `update()` in `src/agents/index.ts:290`, with the block helpers of `src/agents/inject.ts`.
- **Why isn't extension / parameterization / config sufficient?** It is an extension: one pure function next to `injectBlock` and `stripBlock`, and one loop in `update()`. The list of shipped texts is the one new piece, because the manifest records no block hash and existing installs cannot gain one retroactively (§1.4 Q1). Calling `stripBlock` and then `injectBlock` would be shorter, but `injectBlock` puts the block at the top of the file (after any frontmatter), so a block the user moved lower would move back, and `stripBlock` eats up to two line breaks after the END line. Replacing the span in place keeps every other byte. The test pin (R6) is the cheapest way to stop a later text change from silently dropping the previous text.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/agents/shipped-blocks.ts`, `test/agents/block-refresh.test.ts` and `test/agents/shipped-blocks.test.ts` are planned new files.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1 approved by the human on 2026-10-17 (decision 23, with the real-user review additions): every §1.4 Decision line is approved as recommended.
