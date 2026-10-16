---
epic_id: EPIC-002
parent_ref: INITIATIVE-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: architecture.md v0.4 §6 (agent matrix verified 2026-10-16) and §7.6 · INITIATIVE-001 · verified scaffold src/program.ts
owner: Sandro Suladze
target_date: null
created_at: 2026-10-16T13:15:00Z
updated_at: 2026-10-16T13:15:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:22:46Z
  transition: ready-for-decomposition
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id EPIC-002
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:10:31Z
  sessions: []
---

# EPIC-002: Agent integration

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Wire wikeeper into Claude Code, Codex and Antigravity: inject the marked pointer block into agent instruction files, install skills and sub-agent definitions, and optionally (--enforce) write write-guard hooks and permission rules; undo all of it on remove.</objective>
  <architecture_rules>
    <rule>An agent file whose WIKI markers already exist is never modified (D-11).</rule>
    <rule>The block goes at the top of the file, after frontmatter if present; line endings and BOM are preserved.</rule>
    <rule>If no agent file exists, create AGENTS.md and ask which others to add (D-12); non-interactive runs return exit code 5 (needs_input).</rule>
    <rule>Every file or entry written is recorded in the EPIC-001 manifest so update/remove can find it.</rule>
    <rule>Merges into user settings files (JSON/TOML) keep every user key and write a .bak first; --enforce is opt-in, init asks, default no (D-30).</rule>
    <rule>Skill and sub-agent text comes from EPIC-006 templates; this epic only installs it.</rule>
  </architecture_rules>
  <target_files>
    <file path="src/agents/detect.ts" action="create" />
    <file path="src/agents/inject.ts" action="create" />
    <file path="src/agents/skills.ts" action="create" />
    <file path="src/agents/subagents.ts" action="create" />
    <file path="src/agents/enforce/claude.ts" action="create" />
    <file path="src/agents/enforce/codex.ts" action="create" />
    <file path="src/agents/enforce/antigravity.ts" action="create" />
    <file path="src/agents/doctor-checks.ts" action="create" />
    <file path="src/commands/hook.ts" action="create" />
    <file path="src/commands/init.ts" action="modify" />
    <file path="src/commands/remove.ts" action="modify" />
    <file path="src/commands/doctor.ts" action="modify" />
    <file path="templates/agent-block.md" action="create" />
  </target_files>
</agent_context>
```

## 1. Problem & Value

**Why are we doing this?**
The wiki only works if the user's agent knows it exists and how to use it. Each agent reads different files from different paths (architecture.md §6.2), and instruction text alone can't stop an agent from writing pages outside a gated ingest.

**Success Metrics (North Star):**
- On fixture repos for all three agents, `init` produces the file set in architecture.md §6.3, and `remove` restores every agent file byte-for-byte outside the markers.
- With `--enforce`, the guard hook denies a page write without an open ingest in Claude Code and Codex fixture payload tests.

## 2. Scope Boundaries

**✅ IN-SCOPE (Build This)**
- [ ] Detect `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`; when none exist, create `AGENTS.md` and ask which others (or take `--agents`).
- [ ] Inject the pointer block (`<!-- WIKI:START v1 … -->` … `<!-- WIKI:END -->`) at the top of each target file; skip files that already have markers; strip blocks on `remove`.
- [ ] Install skills `wiki-setup`, `wiki-ingest`, `wiki-search` to `.agents/skills/` and link them into `.claude/skills/` (copy when symlinks are unavailable, e.g. Windows).
- [ ] Install sub-agent definitions `wiki-extractor` and `wiki-writer`: Claude `.claude/agents/*.md` (haiku / sonnet), Antigravity `.agents/agents/*.md` (flash / pro), Codex `.codex/agents/*.toml` (model from config, otherwise omitted).
- [ ] `--enforce`: write-guard pre-tool hooks for Claude (`.claude/settings.json`), Antigravity (`.agents/hooks.json`) and Codex (`.codex/hooks.json`) that deny edits to pages unless an ingest lock exists; permission rules per mode (Claude `permissions.allow` / `ask`, Codex `.codex/rules/wikeeper.rules`).
- [ ] `wikeeper hook guard`: reads the agent's tool-call JSON on stdin and answers allow/deny in that agent's hook protocol.
- [ ] Integration doctor checks: block present / duplicated / markers missing, Claude with only `AGENTS.md` (needs v2.1.277+), skill links intact, Codex trust reminder when enforce is on.
- [ ] Plug into `init`, `remove` and `doctor` through the EPIC-001 hook point.
- [ ] CR-002 scope addition (SPRINT-02): A2 `claude-agents-md-only` is `info` and the summary pluralises; A5 `doctor` reports setup state, permission mode, enforce, hooks and rules, `.bak` files; A6 settings files and backups named in `init`/`update` reports; A7 `.bak` files gitignored ([[CR-002]]).

**❌ OUT-OF-SCOPE (Do NOT Build This)**
- Skill, sub-agent and pointer-block wording (EPIC-006).
- MCP configuration (D-29).
- Antigravity command allow-lists (no project-level file exists).
- Gemini CLI settings beyond reading `GEMINI.md`; Cursor, Copilot and other agents.

## 3. The Reality Check (Context)

| Constraint Type | Limit / Rule |
|---|---|
| Safety | Never touch text outside the markers; never overwrite a settings file that fails to parse — report it instead. |
| Reversibility | `remove` restores agent files and settings to their pre-`init` state outside wikeeper's own entries, verified by fixture tests. |
| Size | Pointer block ≤ 12 lines (Codex 32 KiB combined and Antigravity 24,000-byte limits). |
| Platform | Codex applies project hooks/rules only in trusted projects; Antigravity IDE hook reliability is unconfirmed — both surfaced by `doctor`, not worked around. |
| Sequencing | After EPIC-001 (manifest, hook point); installs EPIC-006 content. |

## Existing Surfaces

- **Surface:** `src/program.ts` — command registry the new `hook` subcommand registers into.
- **Surface:** `architecture.md` — §6.2 verified per-agent file matrix this epic implements.
- **Coverage of this epic's scope:** none — net-new integration code.

## Prior work

- [[INITIATIVE-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this epic:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** A single `AGENTS.md` would reach Codex and Antigravity, but Claude Code ignores it whenever `CLAUDE.md` exists, skills and sub-agents live in different directories per agent, and enforcement uses three different hook formats. A per-agent adapter is the smallest design that keeps those differences out of the rest of the CLI.

## 4. Technical Grounding (The "Shadow Spec")

**Affected Files:**
- `src/agents/detect.ts` — find agent files; decide targets.
- `src/agents/inject.ts` — insert/strip the marked block; frontmatter, BOM and line-ending aware.
- `src/agents/skills.ts` — install skills; symlink with copy fallback.
- `src/agents/subagents.ts` — write per-agent sub-agent definitions with model tier mapping.
- `src/agents/enforce/{claude,codex,antigravity}.ts` — merge hooks and permission rules; backup; reverse.
- `src/agents/doctor-checks.ts` — integration checks for `doctor`.
- `src/commands/hook.ts` — `hook guard` for all three hook protocols.
- `src/commands/{init,remove,doctor}.ts` — call the integration hook point.
- `templates/agent-block.md` — block template (text from EPIC-006).

**Data Changes:**
- Manifest entries gain `kind: block | skill | subagent | hook | rule` and the owning agent.

## 5. Acceptance Criteria

```gherkin
Feature: Agent integration

  Scenario: Block injected into existing agent files
    Given a repository with CLAUDE.md and AGENTS.md and no WIKI markers
    When I run "wikeeper init --yes"
    Then both files start with the WIKI block
    And their original content follows unchanged

  Scenario: No agent file creates AGENTS.md
    Given a repository without CLAUDE.md, AGENTS.md or GEMINI.md
    When I run "wikeeper init --agents codex --yes"
    Then AGENTS.md exists and contains only the WIKI block

  Scenario: Existing block is left untouched
    Given AGENTS.md whose WIKI block the user has edited
    When I run "wikeeper init --yes"
    Then AGENTS.md is byte-identical

  Scenario: Enforce guard blocks a page write outside an ingest
    Given init ran with --enforce and no ingest lock exists
    When Claude Code sends a PreToolUse payload for Write to .wiki/pages/team.md
    Then "wikeeper hook guard" answers deny with a reason naming "wikeeper ingest apply"

  Scenario: Remove strips wiring
    Given an initialised repository with --enforce
    When I run "wikeeper remove"
    Then the WIKI blocks, skills, sub-agent files, hooks and rules are gone
    And user keys in .claude/settings.json are unchanged

  Scenario: Error — malformed settings file is not overwritten
    Given .claude/settings.json that is not valid JSON
    When I run "wikeeper init --enforce --yes --json"
    Then the command exits with code 1
    And .claude/settings.json is byte-identical
    And the JSON output names the file and the parse error
```

## 6. AI Interrogation Loop (Human Input Required)

- None. All decisions are recorded in architecture.md (D-10–D-12, D-19, D-30) and were accepted on 2026-10-16.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Coding Agent):
- [x] `approved: true` is set in the YAML frontmatter.
- [x] The `<agent_context>` block is complete and validated.
- [x] §4 Technical Grounding contains 100% real, verified file paths. (Existing paths verified; planned paths for new files accepted by the human at Gate 1, 2026-10-16.)
- [x] §6 AI Interrogation Loop is empty (all human answers integrated into the spec).
- [x] 0 "TBDs" exist in the document.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered.
