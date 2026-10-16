---
story_id: STORY-002-03
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
dep_predecessors: ["STORY-001-02", "STORY-001-03"]
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
  last_gate_check: 2026-10-16T13:31:23Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-002-03
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:29:12Z
  sessions: []
---

# STORY-002-03: Install skills and sub-agent definitions
**Complexity:** L2 — two small installers sharing one model-tier map, plus placeholder templates.

## 1. The Spec (The Contract)

### 1.1 User Story
As a developer installing wikeeper, I want the wiki skills and the extractor/writer sub-agents placed where each of my agents looks for them, so that every agent can load the right procedure and delegate ingest work to a cheaper model.

### 1.2 Detailed Requirements
- **R1 — Skills:** copy `templates/skills/wiki-{setup,ingest,search}/` to `.agents/skills/wiki-{setup,ingest,search}/` (read by Codex and Antigravity).
- **R2 — Claude skills:** when `claude` is configured, create relative symlinks `.claude/skills/wiki-*` → `../../.agents/skills/wiki-*`; when symlinking fails (EPERM/EACCES, or `win32`), copy the folder instead. The manifest records `mode: symlink | copy`.
- **R3 — Sub-agents:** for each configured agent write `wiki-extractor` and `wiki-writer`: claude → `.claude/agents/*.md`, antigravity → `.agents/agents/*.md`, codex → `.codex/agents/*.toml`. Agents not configured get nothing.
- **R4 — Model tiers:** config `ingest.extractor_model` / `ingest.writer_model` take `small`, `medium` or an explicit model id. Tiers map to claude `haiku`/`sonnet` and antigravity `flash`/`pro`; Codex gets no `model` line for a tier. An explicit id is written as-is for claude and codex; antigravity accepts tiers only, so an explicit id writes `inherit` and the result carries a warning.
- **R5 — Templating:** templates contain a `{{model}}` line; it is replaced with the mapped value, or the whole line is removed when there is no value.
- **R6 — Ownership:** every written file (or symlink) is recorded in the EPIC-001 manifest with `kind: skill | subagent`, the owning agent and sha256 of the written content. A file already at a target path that is not in the manifest is never overwritten: the install fails with exit code 1 listing the conflicts, and nothing is written.
- **R7 — Idempotent:** re-running with the same config changes no bytes.
- **R8 — Placeholders:** create the placeholder templates listed in §3.1 (valid frontmatter / TOML with `{{model}}`); EPIC-006 writes the real text.

### 1.3 Out of Scope
Calling the installers from `init` / `update` / `remove` (STORY-002-04), skill and prompt wording (EPIC-006), Gemini CLI skill paths beyond `.agents/skills/`.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- None — decisions recorded in architecture.md and EPIC-002.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** Symlinks committed to git break on Windows checkouts without developer mode.
- **Mitigation:** `doctor` (STORY-002-04) detects broken links; this story's copy fallback covers installs made on Windows.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Symlink path vs copy fallback; first install vs re-run. |
| Interfaces | F | Internal installers; no CLI surface in this story. |
| Data | T | Tier vs explicit model id map differently per agent. |
| Rules | T | Only configured agents; never overwrite unowned files. |

```gherkin
Feature: Install skills and sub-agent definitions

  @paths
  Scenario: Install for all three agents
    Given config agents "claude, codex, antigravity" and default tiers small/medium
    When the installers run
    Then .agents/skills/ contains wiki-setup, wiki-ingest and wiki-search
    And .claude/skills/wiki-* are relative symlinks to .agents/skills/wiki-*
    And wiki-extractor and wiki-writer exist in .claude/agents/, .agents/agents/ and .codex/agents/
    And each written file is in the manifest with its kind and agent
    And running the installers again changes no bytes

  @data
  Scenario Outline: Model values map per agent
    Given ingest.extractor_model is <value>
    When the sub-agents are written
    Then the claude extractor has model "<claude>"
    And the antigravity extractor has model "<antigravity>"
    And the codex extractor has <codex>

    Examples:
      | value        | claude       | antigravity | codex                       |
      | small        | haiku        | flash       | no model line               |
      | medium       | sonnet       | pro         | no model line               |
      | gpt-6-luna   | gpt-6-luna   | inherit     | model = "gpt-6-luna"        |

  @paths
  Scenario: Symlink failure falls back to copying
    Given creating a symlink fails with EPERM
    When the skills are installed for claude
    Then .claude/skills/wiki-ingest is a copied folder
    And the manifest records mode "copy"

  @rules
  Scenario: Unconfigured agents get nothing
    Given config agents "codex"
    When the installers run
    Then .claude/ and .agents/agents/ are not created
    And .codex/agents/ contains the two sub-agents

  @rules
  Scenario: Error — an unowned file blocks the install
    Given .claude/agents/wiki-writer.md exists and is not in the manifest
    When the installers run
    Then the result is exit code 1 naming .claude/agents/wiki-writer.md
    And no file is written or changed
```

### 2.2 Verification Steps (Manual)
- [ ] Install into a scratch repo and open it in Claude Code: `/agents` lists wiki-extractor and wiki-writer.
- [ ] On Windows CI, confirm the copy fallback is used and the manifest says `copy`.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/agents/subagents.ts` |
| Related Files | `src/agents/skills.ts`, `src/agents/model-tiers.ts` |
| Templates | `templates/skills/wiki-setup/SKILL.md`, `templates/skills/wiki-ingest/SKILL.md`, `templates/skills/wiki-search/SKILL.md` |
| Templates (sub-agents) | `templates/agents/claude/wiki-extractor.md`, `templates/agents/claude/wiki-writer.md`, `templates/agents/antigravity/wiki-extractor.md`, `templates/agents/antigravity/wiki-writer.md`, `templates/agents/codex/wiki-extractor.toml`, `templates/agents/codex/wiki-writer.toml` |
| Test Files | `test/agents/skills.test.ts`, `test/agents/subagents.test.ts` |
| New Files Needed | Yes — all files above |

### 3.2 Technical Logic
- `model-tiers.ts`: `mapModel(agent, value) → { model?: string, warning?: string }` implementing R4.
- `skills.ts`: `installSkills({ root, agents, manifest })` copies template folders via the EPIC-001 template loader, then links for claude with `fs.symlink(target, path, 'dir')`, catching EPERM/EACCES and checking `process.platform === 'win32'` to copy instead.
- `subagents.ts`: `installSubagents({ root, agents, config, manifest })` reads each template, substitutes or removes the `{{model}}` line, writes the file.
- Both run a conflict pre-check over all target paths first (R6) so a conflict writes nothing; then write, then add manifest entries.
- Content-equal files are left untouched (R7).

### 3.3 API Contract (if applicable)

Not applicable — internal modules; consumed by STORY-002-04.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | `mapModel` rows and template substitution |
| Integration tests | 4 | Temp-directory installs: all agents, symlink fallback, unconfigured agent, conflict |
| E2E / acceptance tests | 5 | 1 per Gherkin scenario in §2.1 |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Placeholder templates parse (YAML frontmatter / TOML).
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `./architecture.md` — §6.3 install set and §7.6 tier mapping.
- **Surface:** `./package.json` — `files` must ship `templates/` (EPIC-001).
- **Coverage of this requirement:** none — net-new installers.

## Prior work

- [[EPIC-002]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** One shared skills folder covers Codex and Antigravity, but Claude only documents `.claude/skills/`, and each agent uses a different sub-agent location, file format and model vocabulary. Two small installers with one mapping table are the least code that serves all three without duplicating skill content.

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
