---
story_id: STORY-006-05
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-006 (approved 2026-10-16) · architecture.md §6.2, §6.3, §7.4, §7.6, D-16, D-19 · SPRINT-02 decomposition brief (commands at end of SPRINT-02; WIKI.md section names from STORY-006-04 R1) · verified templates/skills/*, templates/agents/*, src/agents/skills.ts, src/agents/subagents.ts, src/agents/model-tiers.ts, test/agents/subagents.red.node.test.ts
actor: AI coding agent deciding when to load a wiki skill or hand work to a wiki sub-agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-17T07:30:08Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 3
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T07:30:41Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: f06187388ccc33ae1e829599d003b900196d5a59775ebf19932454a6b0e30c2d
stamp_error: no ledger rows for work_item_id STORY-006-05
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:54:52Z
  sessions: []
---

# STORY-006-05: `wiki-ingest` / `wiki-search` skills and the extractor and writer sub-agent prompts
**Complexity:** L2 — eight existing placeholder templates get real text, plus one test file. Formats stay exactly what STORY-002-03's installers read.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent, I want skills whose descriptions make me load the right wiki procedure at the right moment, and extractor and writer sub-agents with clear, bounded jobs, so that ingests and questions follow WIKI.md and work is delegated the same way on Claude Code, Codex and Antigravity.

### 1.2 Detailed Requirements
- **R1 — wiki-ingest skill.** `templates/skills/wiki-ingest/SKILL.md`; frontmatter exactly `name: wiki-ingest` and `description`. The description (≤ 1024 characters) says to use it when the user shares, attaches or pastes a file, document, link, directory or text to keep, asks to add or ingest something into the wiki, or when the agent notices a decision, owner change, deadline or risk worth offering. The body summarises register → triage & extract → write and sends the agent to `.wiki/system/WIKI.md` sections "Ingest", "Register", "Triage and extract", "Write phase", "Delegation" and "Ambient offers".
- **R2 — Explicit delegation (§6.2, §7.6).** Because Codex delegates only when told, the wiki-ingest body states: a directory → one `wiki-extractor` per source, in parallel, after `wikeeper ingest plan` is approved; every write phase → one `wiki-writer` per source, one at a time, given the brief, which the main agent writes into its task, and the facts file path; a file or text the main agent already read → the main agent extracts and `wiki-writer` writes; with `ingest.delegate: never`, or without sub-agent support, the main agent does both.
- **R3 — wiki-search skill.** `templates/skills/wiki-search/SKILL.md`; frontmatter exactly `name: wiki-search` and `description`. The description (≤ 1024 characters) says to use it when the user asks who owns or decides something, what is at risk, why something was decided, what changed since a date, or about a person, project or term the wiki may know — before answering from memory. The body says to run `wikeeper search … --json`, answer with citations, and follow `.wiki/system/WIKI.md` sections "Search" and "Answering questions".
- **R4 — wiki-extractor prompt.** Input: the ingest id, where to read the source, its kind. It reads the kind's rule in `.wiki/kb_instructions.md`, `.wiki/index.md` and `wikeeper search` results; extracts facts per WIKI.md "Triage and extract" and "Facts file"; submits them with `wikeeper ingest facts <id>`; never edits pages and never runs `wikeeper ingest apply` or `finish`; returns the id, the number of facts, new entities, uncovered information and the CLI's exit code.
- **R5 — wiki-writer prompt.** Input: the brief, written by the main agent into the writer's task, and the facts file path — never the original source (D-16). It runs `wikeeper ingest apply <id>` (which takes the lock and prints the facts), reconciles and writes pages per WIKI.md "Write phase" and "Page format", writes and edits pages only with its file-edit tools — the one shared text (R6) names Write or Edit (Claude Code), apply_patch (Codex), and write_to_file or replace_file_content (Antigravity) — never from the shell (redirection, heredoc, sed), ends each claim with `[[<id>]]`, writes `sources/<id>.md`, flags contradictions with both sources, runs `wikeeper ingest finish <id>`, fixes and reruns on failure or runs `wikeeper ingest abort <id>`, changes nothing under .wiki/pages once `finish` exits 0 (anything left to fix goes in its report), and returns the CLI's report unchanged (walkthrough rows 8.2, 8.4; CR review-feedback 2026-10-17).
- **R6 — One text per sub-agent.** For each sub-agent the instruction text is identical in the Claude body, the Antigravity body and the Codex `developer_instructions` (compared after trimming and normalising line endings); the descriptions say when to delegate to it, since Claude and Antigravity delegate by description.
- **R7 — Formats unchanged (EPIC-006 §3, STORY-002-03).** Claude `.md` frontmatter keys exactly `name`, `description`, `model`; Antigravity `.md` exactly `name`, `description`, `model`, `mainAgent: false`; Codex `.toml` exactly `name`, `description`, `model`, `developer_instructions`. Each keeps its `{{model}}` line on a line of its own (`renderModelLine` drops that line when no model is mapped, `src/agents/subagents.ts:39`). Codex lines outside `developer_instructions` stay `key = "value"` with no `"` in the value, and the instruction block contains no `"""` (`test/agents/subagents.red.node.test.ts:131`). Names equal the file names.
- **R8 — No placeholders; SPRINT-02 vocabulary.** The `placeholder` markers are removed from all eight files; every command named is from the SPRINT-02 set and every ingest verb is `start`, `plan`, `facts`, `apply`, `finish` or `abort`.

### 1.3 Out of Scope
- The `wiki-setup` skill (STORY-006-02) and WIKI.md itself (STORY-006-04).
- Installing, linking or rendering these files (STORY-002-03, done).
- Agent-specific `tools:` restrictions or extra frontmatter fields — EPIC-006 §3 fixes the field sets.
- Repository-wide format and reference checks (STORY-006-06).

### 1.4 Open Questions

- None — field sets come from EPIC-006 §3 and the SPRINT-01 installers; section names come from STORY-006-04 R1.

### 1.5 Risks

- **Risk:** A skill points to a WIKI.md section that STORY-006-04 names differently.
- **Mitigation:** Both stories use the section list pinned in STORY-006-04 R1; STORY-006-06 resolves every section reference at the end of the sprint.
- **Risk:** Whether Codex sub-agents start with a fresh context is unverified (architecture §7.6).
- **Mitigation:** The prompts are self-contained (they never assume the parent's context) and the writer is handed facts, not the source, so a forked context costs tokens but changes nothing.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | Delegation paths are specified in WIKI.md (STORY-006-04 tests them); here they are one block of text. |
| Interfaces | T | The same sub-agent is delivered in three agent formats. |
| Data | T | Two skills and six sub-agent files, checked by row. |
| Rules | T | Field sets, identical instruction text, role boundaries. |

```gherkin
Feature: wiki skills and sub-agent prompts

  @data
  Scenario Outline: Skills load at the right moment and lead to WIKI.md
    Given templates/skills/<skill>/SKILL.md
    Then its frontmatter keys are exactly "name" and "description" and name is "<skill>"
    And the description is at most 1024 characters and contains <triggers>
    And the body names ".wiki/system/WIKI.md" sections <sections>
    And it contains no "placeholder" marker

    Examples:
      | skill       | triggers                                         | sections                                                                                          |
      | wiki-ingest | "file", "link", "directory", "decision", "risk"  | "Ingest", "Register", "Triage and extract", "Write phase", "Delegation", "Ambient offers"          |
      | wiki-search | "owns", "risk", "decided", "changed since"       | "Search", "Answering questions"                                                                   |

  @rules
  Scenario: wiki-ingest tells every agent when to delegate
    Given the wiki-ingest skill body
    Then it names "wiki-extractor" for a directory, one per source, after "wikeeper ingest plan"
    And it names "wiki-writer" for every write phase, one source at a time, with the brief written into its task and the facts file path
    And it says the main agent does both when "ingest.delegate" is "never" or sub-agents are unavailable

  @interfaces @data
  Scenario Outline: Each sub-agent has its agent's exact fields and one shared text
    Given the <agent> templates for wiki-extractor and wiki-writer
    Then the field keys are exactly <fields> and each name equals its file name
    And the "{{model}}" line stands on its own line
    And the instruction text equals the Claude body for the same sub-agent

    Examples:
      | agent       | fields                                                  |
      | claude      | "name", "description", "model"                          |
      | antigravity | "name", "description", "model", "mainAgent"             |
      | codex       | "name", "description", "model", "developer_instructions" |

  @rules
  Scenario: Extractor and writer keep to their roles
    Given the wiki-extractor and wiki-writer instruction texts
    Then the extractor names "wikeeper ingest facts" and says never to edit pages or run "wikeeper ingest apply" or "wikeeper ingest finish"
    And the writer names "wikeeper ingest apply", "wikeeper ingest finish", "wikeeper ingest abort" and "[[<id>]]"
    And the writer says not to open the original source
    And the writer names the file-edit tools of all three agents, forbids redirection, heredocs and sed, and changes nothing under .wiki/pages after finish exits 0
    And every ingest verb in all eight files is one of start, plan, facts, apply, finish, abort

  Scenario: Error — drifted instruction text fails the comparison
    Given a copy of templates/agents/codex/wiki-writer.toml whose developer_instructions omit the abort step
    When the shared-text check runs on it
    Then it fails naming "wiki-writer" and agent "codex"
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo with Claude Code, say "add this meeting note to the wiki" with a file attached; check that `wiki-ingest` loads and the writer sub-agent is used for the write phase.
- [ ] In Codex, give it a directory; check that it hands sources to `wiki-extractor`.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `templates/skills/wiki-ingest/SKILL.md` |
| Related Files | `templates/skills/wiki-search/SKILL.md`, `templates/agents/claude/wiki-extractor.md`, `templates/agents/claude/wiki-writer.md`, `templates/agents/antigravity/wiki-extractor.md`, `templates/agents/antigravity/wiki-writer.md`, `templates/agents/codex/wiki-extractor.toml`, `templates/agents/codex/wiki-writer.toml` |
| Test Files | `test/templates/skills-subagents.test.ts`, `test/templates/walkthrough-fixes.red.node.test.ts` (QA-Red, R2/R5; 2026-10-17) |
| New Files Needed | Yes — `test/templates/skills-subagents.test.ts` |

### 3.2 Technical Logic
- Write each sub-agent's instruction text once (in the Claude file), then copy it verbatim into the Antigravity body and the Codex `developer_instructions` block. Avoid `"""` and keep TOML scalar values free of `"`.
- The test reads templates from `templatesDir()` (`src/core/templates.ts:44`): YAML frontmatter via the `yaml` package already in `dependencies`; Codex TOML via a small line reader in the test (top-level `key = "value"` lines plus one `developer_instructions = """…"""` block, as `test/agents/subagents.red.node.test.ts:116` does) — no new dependency.
- The shared-text check is a helper `compareSubagentTexts(templatesDir)` returning mismatches by sub-agent and agent, so the error scenario runs it on a temp copy of the templates.
- No source change: `installSkills` (`src/agents/skills.ts:126`) copies skill folders as they are and `installSubagents` (`src/agents/subagents.ts:85`) renders the `{{model}}` line; their existing tests stay green.

### 3.3 API Contract (if applicable)

Not applicable — template content.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 2 | TOML line reader; shared-text comparison |
| Integration tests | 0 | Install behaviour is covered by the existing STORY-002-03 suites |
| E2E / acceptance tests | 8 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/agents/skills.red.node.test.ts` and `test/agents/subagents.red.node.test.ts` pass unchanged.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/skills/wiki-ingest/SKILL.md:1` and `templates/skills/wiki-search/SKILL.md:1` — placeholder skills; the search one points to a "Query" section that WIKI.md will not have.
- **Surface:** `templates/agents/claude/wiki-extractor.md:1` (and the five sibling files) — placeholder sub-agents with the right field sets.
- **Surface:** `src/agents/subagents.ts:39` — `renderModelLine` substitutes or drops the `{{model}}` line.
- **Surface:** `src/agents/model-tiers.ts:9` — tier → model table (`haiku`/`sonnet`, `flash`/`pro`, Codex inherits).
- **Coverage of this requirement:** partial — files and installers exist; the text is placeholder.

## Prior work

- [[EPIC-006]] (parent), [[EPIC-002]] (STORY-002-03 installs skills and sub-agents and fixed their formats). No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** the eight placeholder templates under `templates/skills/` and `templates/agents/` — this story fills them in.
- **Why isn't extension / parameterization / config sufficient?** The installers already handle formats and models; what is missing is the text. Generating the three sub-agent formats from one source at install time would change STORY-002-03's installers for a gain a test gives for free: identical text, checked on every run.

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
