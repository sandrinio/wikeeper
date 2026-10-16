---
epic_id: EPIC-006
parent_ref: INITIATIVE-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: architecture.md v0.4 §5, §6.3, §6.5, §7.4, §7.6, §8, §9 (D-02, D-03, D-13, D-14, D-16–D-19, D-31) · INITIATIVE-001
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
  last_gate_check: 2026-10-16T13:22:47Z
  transition: ready-for-decomposition
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id EPIC-006
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:12:25Z
  sessions: []
---

# EPIC-006: Instructions and Management profile

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Author all package-owned instruction content: SETUP.md, WIKI.md, the Management profile, the kb_instructions.md seed, the me.md template, page templates, the pointer block, skill texts and sub-agent prompts for Claude Code, Codex and Antigravity; plus structural tests that keep the content consistent with the CLI.</objective>
  <architecture_rules>
    <rule>Process lives in package-owned files (SETUP.md, WIKI.md, skills); content rules live in the user-owned kb_instructions.md seed (architecture.md §5).</rule>
    <rule>Questions are the root of kb_instructions.md; the agent drafts them from the profile and me.md and the user approves changes (D-31).</rule>
    <rule>A source is read once; agents hand off facts, not sources; WIKI.md defines the brief template and the facts format (D-16–D-19).</rule>
    <rule>Codex delegates only when told: the wiki-ingest skill states explicitly when to use wiki-extractor and wiki-writer.</rule>
    <rule>Skills use only `name` and `description` frontmatter (Agent Skills standard); sub-agent files follow each agent's documented format (architecture.md §6.2).</rule>
    <rule>Knowledge-base quality evaluation is out of scope (INITIATIVE-001 §5); this epic delivers complete, consistent content.</rule>
  </architecture_rules>
  <target_files>
    <file path="templates/system/SETUP.md" action="create" />
    <file path="templates/system/WIKI.md" action="create" />
    <file path="templates/system/profiles/management.md" action="create" />
    <file path="templates/system/templates/" action="create" />
    <file path="templates/kb_instructions.management.md" action="create" />
    <file path="templates/me.md" action="create" />
    <file path="templates/agent-block.md" action="modify" />
    <file path="templates/skills/" action="create" />
    <file path="templates/agents/" action="create" />
    <file path="test/templates.test.ts" action="create" />
  </target_files>
</agent_context>
```

## 1. Problem & Value

**Why are we doing this?**
The CLI only moves files and enforces gates; everything the agent actually does — setup interview, triage, extraction, writing, contradiction handling, offering rule changes, delegating to sub-agents — is driven by this text. Without it, wikeeper installs an empty shell.

**Success Metrics (North Star):**
- Structural tests pass: every command the content mentions exists in `wikeeper --help`, every file it references is shipped, and every skill and sub-agent file validates against its agent's format.
- The pointer block is ≤ 12 lines and the `me.md` template ≤ 15 lines.

## 2. Scope Boundaries

**✅ IN-SCOPE (Build This)**
- [ ] `SETUP.md`: the 7-step bootstrap (architecture.md §5.1), starting with the user's name, form of address and role → `me.md`.
- [ ] `WIKI.md`: triggers (shared file, directory, link, ambient), triage → extract → write steps, facts format, brief template, delegation rules per case (§7.6), contradiction handling, ambient-offer etiquette (batched, decided vs tentative), search usage, rule-proposal loop, query answering with citations.
- [ ] Management profile and `kb_instructions.md` seed: questions, entities (person, project, risk, decision, glossary term), capture signals, source kinds (meeting notes, status report, PRD, contract, email thread, chat excerpt), write policy, never-capture list, changelog.
- [ ] `me.md` template (§5.4).
- [ ] Page templates: person / team, project, risk, decision, source, glossary — summary layer plus dated, cited facts layer, aliases, typed links (§8).
- [ ] Pointer block text (§6.5).
- [ ] Skills `wiki-setup`, `wiki-ingest`, `wiki-search`: descriptions that make agents load them at the right moment; bodies that point to `.wiki/system/` files.
- [ ] Sub-agent prompts `wiki-extractor` and `wiki-writer` in Claude (`.md`), Antigravity (`.md`) and Codex (`.toml`) formats.
- [ ] `test/templates.test.ts`: structural consistency checks.

**❌ OUT-OF-SCOPE (Do NOT Build This)**
- Knowledge-base quality evaluation and tuning (later phase).
- Profiles other than Management; translations.
- Installing the files into agent directories (EPIC-002).

## 3. The Reality Check (Context)

| Constraint Type | Limit / Rule |
|---|---|
| Context budget | Always-loaded text is minimal: pointer block ≤ 12 lines, `me.md` ≤ 15 lines; everything else loads on demand through skills. |
| Privacy | The never-capture defaults cover compensation, health, personal life and performance judgements of individuals. |
| Formats | Skills: `name` + `description`; Antigravity sub-agents: `name`, `description`, `model`; Codex sub-agents: `name`, `description`, `developer_instructions`. |
| Sequencing | Can run in parallel with EPIC-002 and EPIC-003; structural tests need the command names from those epics. |

## Existing Surfaces

- **Surface:** `architecture.md` — design source for every file in this epic.
- **Coverage of this epic's scope:** none — net-new content.

## Prior work

- [[INITIATIVE-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this epic:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** A single long instruction file would load into every session and blow the agents' size limits, and it couldn't be updated without overwriting the user's own rules. Splitting process (package-owned, loaded on demand through skills) from content rules (user-owned) is what makes `update` safe and keeps the always-loaded text small.

## 4. Technical Grounding (The "Shadow Spec")

**Affected Files:**
- `templates/system/SETUP.md`, `templates/system/WIKI.md` — agent process.
- `templates/system/profiles/management.md` — profile definition.
- `templates/system/templates/*.md` — page templates.
- `templates/kb_instructions.management.md`, `templates/me.md` — user-owned seeds.
- `templates/agent-block.md` — pointer block text.
- `templates/skills/wiki-{setup,ingest,search}/SKILL.md` — skills.
- `templates/agents/{claude,antigravity}/wiki-{extractor,writer}.md`, `templates/agents/codex/wiki-{extractor,writer}.toml` — sub-agents.
- `test/templates.test.ts` — structural tests.

**Data Changes:**
- None beyond the shipped template files.

## 5. Acceptance Criteria

```gherkin
Feature: Instructions and Management profile

  Scenario: Setup starts with the user profile
    Given a freshly initialised wiki
    When the agent follows .wiki/system/SETUP.md
    Then its first step asks the user's name, form of address and role and writes me.md

  Scenario: Every referenced command exists
    Given all template files
    When test/templates.test.ts extracts every "wikeeper <command>" reference
    Then each command appears in "wikeeper --help"

  Scenario: Skills and sub-agents validate per agent
    Given the skill and sub-agent templates
    When the structural test parses their frontmatter or TOML
    Then each has exactly the fields its agent requires

  Scenario: Always-loaded text stays small
    Given templates/agent-block.md and templates/me.md
    Then the block is at most 12 lines and me.md at most 15 lines

  Scenario: Error — a dangling reference fails the build
    Given a template that references ".wiki/system/MISSING.md"
    When the structural test runs
    Then it fails naming the template and the missing path
```

## 6. AI Interrogation Loop (Human Input Required)

- None. All decisions are recorded in architecture.md (D-02, D-03, D-13, D-14, D-16–D-19, D-31) and were accepted on 2026-10-16.

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
