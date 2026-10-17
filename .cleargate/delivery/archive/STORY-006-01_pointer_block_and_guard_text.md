---
story_id: STORY-006-01
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
ambiguity: 🟢 Low
context_source: "EPIC-006 (approved 2026-10-16; CR-002 scope addition) · CR-002 B1–B4 and §0.5 answers (approved 2026-10-16: 14-line cap; me.md read via the block) · SPRINT-02 decomposition contract 13 (me.md, project.md, ONBOARDING.md; human, 2026-10-16) · architecture.md §6.4, §6.5 · verified templates/agent-block.md, src/agents/hook-protocols.ts, src/agents/doctor-checks.ts, src/agents/inject.ts"
actor: AI coding agent starting a session in a repository with a wiki
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T18:45:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 3
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:17:21Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 824eddfe1ccea3537e47a3a420afe5be175ff80221a212aeb8ce80268d209fad
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: null
  last_stamp: 2026-10-16T17:48:15Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: ""
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-16T17:41:21Z
---

# STORY-006-01: Pointer block and guard deny message
**Complexity:** L2 — rewrite of one template (`templates/agent-block.md`) and one message constant, plus a test file. No upstream story.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent, I want the always-loaded wiki block to tell me — in text I can actually see — that it is managed by wikeeper, which files I may edit, how ingest works and what to do when `wikeeper` is unavailable, so that I never write pages outside an ingest and never edit package-owned files.

### 1.2 Detailed Requirements
- **R1 — Markers and shape (unchanged contract).** `templates/agent-block.md` keeps the first line `<!-- WIKI:START v1 — managed by wikeeper -->` (`WIKI_START_V1`, `src/agents/inject.ts:4`) and the last line `<!-- WIKI:END -->`; the first heading after the START line stays `## Project Wiki` (doctor's block signature, `src/agents/doctor-checks.ts:36`); the text still names `.wiki/system/WIKI.md` (the signature reference). The marker version stays `v1` (see §1.5).
- **R2 — Visible managed line (CR-002 B1).** The line directly after the heading reads `Managed by wikeeper — edit outside this block only.` It is plain text, not an HTML comment, so it survives the comment stripping Claude Code applies to `CLAUDE.md` / `AGENTS.md`.
- **R3 — Ownership (CR-002 B2).** One line names the files the agent may edit, with the user's approval: `.wiki/config.yml`, `.wiki/kb_instructions.md`, `.wiki/me.md`, `.wiki/project.md` (decomposition contract 13). One line names what is package-owned and must not be edited: `.wiki/system/`, the wiki skills, the wiki sub-agents and wikeeper's entries in agent settings files.
- **R4 — Setup and protocol pointers.** If `.wiki/config.yml` has no `setup_completed_at`, follow `.wiki/system/SETUP.md` first; otherwise read `.wiki/system/WIKI.md` before ingesting, searching or editing anything in the wiki.
- **R5 — Session start (CR-002 §0.5 decision 3; contract 13, human decision 2026-10-16).** One line: at the start of every session, read `.wiki/me.md` and `.wiki/project.md`; if `.wiki/me.md` is missing, first onboard the user with `.wiki/system/ONBOARDING.md` (STORY-006-07). This covers a teammate who clones an already set-up repo: setup is done, but their own gitignored `me.md` does not exist yet.
- **R6 — One ingest vocabulary (CR-002 B4).** The block says wiki pages change only during an ingest's write phase, between `wikeeper ingest apply <id>` and `wikeeper ingest finish <id>`, and names no other ingest verb than `start`, `plan`, `facts`, `apply`, `finish`, `abort` (the EPIC-003 set).
- **R7 — Fallback (CR-002 B3).** One line: if `wikeeper ingest` is unavailable, do not write pages; tell the user.
- **R8 — Size (EPIC-006 §3, CR-002 decision 1).** The whole file, markers included, is at most 14 lines; no line is longer than 200 characters; LF line endings and a final newline.
- **R9 — Guard deny message (CR-002 B4).** `GUARD_REASON` (`src/agents/hook-protocols.ts:5`) reads: ``Wiki pages can only change during an ingest's write phase. Run `wikeeper ingest apply <id>` first — see .wiki/system/WIKI.md, section "Write phase".`` It keeps the substring `wikeeper ingest apply <id>` that `test/agents/hook-guard.red.node.test.ts:268` asserts, and uses the section-reference form `<file>, section "<Heading>"` that STORY-006-06 resolves (the `## Write phase` heading is created by STORY-006-04, decomposition contract 11).

### 1.3 Out of Scope
- Changing how or when blocks are injected (`src/agents/inject.ts`, `src/agents/index.ts`), or making `update` rewrite existing blocks — D-11 and the §4.1 ownership matrix keep "leave as is".
- A doctor check for outdated block text (architecture §6.5 edge case "block version older than the package") — not built this sprint, see §1.5.
- Settings permission rules: `ask` mode's `ingest start` rule already uses an EPIC-003 verb (`src/agents/enforce/claude.ts:35`, `codex.ts:8`); CR-001 narrows `ai` mode in SPRINT-01. STORY-006-06 checks every verb in them.
- WIKI.md content (STORY-006-04).

### 1.4 Open Questions

- None — the cap, the me.md approach and the B-items were decided on 2026-10-16 (CR-002 §0.5); the `project.md` and onboarding line was decided at SPRINT-02 planning (decomposition contract 13).

### 1.5 Risks

- **Risk:** Repositories initialised with 0.1.0 keep the old block: `init` injects only when no START marker exists and `update` never touches blocks (`src/agents/index.ts:248`, `src/agents/index.ts:268`). Their block names `ingest start` / `ingest finish` for the write phase and has no visible managed line.
- **Mitigation:** Keep the `v1` marker (bumping it would break the SPRINT-01 red tests that pin `WIKI_START_V1`, e.g. `test/agents/inject.red.node.test.ts:61`, for no gain, since nothing reads the version yet). The 0.2.0 release notes tell users to delete the block between the markers and re-run `wikeeper init`, which re-injects it. A doctor report for outdated blocks (§6.5) is a follow-up candidate, not SPRINT-02 scope.
- **Risk:** Fitting R2–R7 into 14 lines makes the lines long.
- **Mitigation:** R8 also caps line length at 200 characters; the protocol detail stays in WIKI.md.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One template and one message; no alternative successful flows. |
| Interfaces | T | The same rules reach the agent through two surfaces: the injected block and the guard's deny message. |
| Data | F | Static text; behaviour does not vary by input shape. |
| Rules | T | Line cap, visibility without HTML comments, one ingest vocabulary. |

```gherkin
Feature: Pointer block and guard deny message

  @rules
  Scenario: The block stays within the cap and keeps its markers
    Given templates/agent-block.md
    Then it has at most 14 lines, LF line endings and a final newline
    And no line is longer than 200 characters
    And its first line is "<!-- WIKI:START v1 — managed by wikeeper -->" and its last line is "<!-- WIKI:END -->"
    And the first heading after the START line is "## Project Wiki"

  @rules @interfaces
  Scenario: The block is visibly managed without HTML comments
    Given AGENTS.md after "wikeeper init --yes" in an empty repository
    When every HTML comment is removed from it, as Claude Code does
    Then the remaining block text contains "Managed by wikeeper — edit outside this block only."
    And it names ".wiki/config.yml", ".wiki/kb_instructions.md", ".wiki/me.md" and ".wiki/project.md" as editable
    And it names ".wiki/system/" as package-owned
    And it names ".wiki/system/SETUP.md", ".wiki/system/WIKI.md" and ".wiki/system/ONBOARDING.md"
    And one line says to read ".wiki/me.md" and ".wiki/project.md" at session start and to onboard the user with ".wiki/system/ONBOARDING.md" when ".wiki/me.md" is missing
    And it says not to write pages when "wikeeper ingest" is unavailable

  @rules
  Scenario: The block and the guard use one ingest vocabulary
    Given templates/agent-block.md and GUARD_REASON
    When every "wikeeper ingest <verb>" reference is extracted
    Then every verb is one of start, plan, facts, apply, finish, abort
    And the block names "wikeeper ingest apply" and "wikeeper ingest finish" as the bounds of the write phase

  @interfaces
  Scenario: The guard's deny message points to the write-phase section
    Given an initialised repository with no ingest lock
    When "wikeeper hook guard --agent claude" receives an Edit payload for .wiki/pages/team.md
    Then the deny reason contains "wikeeper ingest apply <id>"
    And it contains ".wiki/system/WIKI.md, section \"Write phase\""

  Scenario: Error — an edited block over the cap fails the test
    Given a copy of the block with a 15th line
    When the block test checks it
    Then it fails naming the line count 15 and the cap 14
```

### 2.2 Verification Steps (Manual)
- [ ] Run `wikeeper init` in a scratch repo, open `AGENTS.md` in Claude Code and ask the agent what the block tells it; it should mention the managed line, the editable files and the write-phase rule.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `templates/agent-block.md` |
| Related Files | `src/agents/hook-protocols.ts` |
| Test Files | `test/agents/pointer-block.test.ts` |
| New Files Needed | Yes — `test/agents/pointer-block.test.ts` |

### 3.2 Technical Logic
- Rewrite `templates/agent-block.md` to R1–R8. Suggested order inside the markers: heading; managed line; one-line description (wiki in `.wiki/`, content folder set by `content_dir`); setup pointer; WIKI.md pointer (mention the `wiki-ingest` / `wiki-search` skills); session-start line (me.md, project.md, onboarding); write-phase rule; fallback; editable files; package-owned files.
- Change `GUARD_REASON` only (R9). `src/commands/hook.ts:60` passes it unchanged to every adapter's `deny`.
- The test reads the template from `templatesDir()` (`src/core/templates.ts:44`); the HTML-comment scenario strips `<!--[\s\S]*?-->` from the file `init` wrote; the guard scenario drives `wikeeper hook guard --agent claude` with `test/fixtures/hooks/claude-write.json` the way `test/agents/hook-guard.test.ts` does.
- The cap check is a small exported-from-test helper `checkLineCap(text, cap)` returning a message, so the error scenario runs it on an in-memory copy.

### 3.3 API Contract (if applicable)

Not applicable — template text and one string constant.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 2 | Line cap helper; verb extraction over block + GUARD_REASON |
| Integration tests | 2 | `init` in a temp repo then comment stripping; guard deny via `runCli` |
| E2E / acceptance tests | 5 | 1 per Gherkin scenario in §2.1 |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Existing suites still pass unchanged: `test/agents/hook-guard.red.node.test.ts`, `test/agents/integration.red.node.test.ts` (its S2 edits `## Project Wiki`), `test/agents/doctor-checks.test.ts`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/agent-block.md:1` — the current 8-line block (names `ingest start` / `ingest finish` for the write phase; no visible managed line).
- **Surface:** `src/agents/hook-protocols.ts:5` — `GUARD_REASON`, pointing to WIKI.md without a section.
- **Surface:** `src/agents/doctor-checks.ts:36` — `readBlockSignature` takes the first heading after the START line; the heading must stay `## Project Wiki`.
- **Surface:** `src/agents/inject.ts:4` — `WIKI_START_V1`; `src/agents/inject.ts:29` rejects a block that does not start with the marker and end with `WIKI_END`.
- **Surface:** `src/agents/index.ts:107` — `loadBlock` reads the template verbatim (no substitution), so the text cannot depend on `content_dir`.
- **Coverage of this requirement:** partial — the block and message exist; this story replaces their text.

## Prior work

- [[EPIC-006]] (parent), [[CR-002]] (B1–B4, 14-line cap, me.md decision), [[EPIC-002]] (block injection and guard, STORY-002-01 and STORY-002-05). The wiki-query duplicate check found no other work on this text.

## Why not simpler?

- **Smallest existing surface that could carry this:** `templates/agent-block.md:1` and `src/agents/hook-protocols.ts:5` — this story edits exactly those.
- **Why isn't extension / parameterization / config sufficient?** The defects are in the text itself (wrong write-phase verbs, an ownership note hidden in an HTML comment, no fallback, a deny message pointing at no section). Templating the block per repository would break D-11 "never modify an existing block" and the doctor signature; a test is the only thing that keeps the 14-line cap and the vocabulary from drifting.

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
