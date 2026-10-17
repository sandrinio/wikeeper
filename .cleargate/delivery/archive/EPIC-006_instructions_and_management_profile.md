---
epic_id: EPIC-006
parent_ref: INITIATIVE-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Completed
approved: true
ambiguity: 🟢 Low
context_source: architecture.md v0.4 §5, §6.3, §6.5, §7.4, §7.6, §8, §9 (D-02, D-03, D-13, D-14, D-16–D-19, D-31) · INITIATIVE-001
owner: Sandro Suladze
target_date: null
created_at: 2026-10-16T13:15:00Z
updated_at: 2026-10-16T13:15:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 4
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
last_synced_body_sha: 820963b4689c9b3fd04025f5262d38e79ef833ba2dae5dfd454416cb24cc1a17
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
  <objective>Author all package-owned instruction content: SETUP.md, ONBOARDING.md, WIKI.md, the Management profile (suggestions), the kb_instructions.md seed, the me.md and project.md templates, the source page template, the pointer block, skill texts and sub-agent prompts for Claude Code, Codex and Antigravity; plus structural tests that keep the content consistent with the CLI.</objective>
  <architecture_rules>
    <rule>Process lives in package-owned files (SETUP.md, WIKI.md, skills); content rules live in the user-owned kb_instructions.md seed (architecture.md §5).</rule>
    <rule>Questions are the root of kb_instructions.md; the agent drafts them from project.md, me.md and the profile's suggestions, and the user approves changes (D-31).</rule>
    <rule>No fixed pages: the package names no knowledge page except sources/&lt;id&gt;.md; questions, entity types and page names come from the setup conversation and the first sources (human, SPRINT-02 planning, 2026-10-16).</rule>
    <rule>A source is read once; agents hand off facts, not sources; WIKI.md defines the brief template and the facts format (D-16–D-19).</rule>
    <rule>Codex delegates only when told: the wiki-ingest skill states explicitly when to use wiki-extractor and wiki-writer.</rule>
    <rule>Skills use only `name` and `description` frontmatter (Agent Skills standard); sub-agent files follow each agent's documented format (architecture.md §6.2).</rule>
    <rule>Knowledge-base quality evaluation is out of scope (INITIATIVE-001 §5); this epic delivers complete, consistent content.</rule>
  </architecture_rules>
  <target_files>
    <file path="templates/system/SETUP.md" action="create" />
    <file path="templates/system/ONBOARDING.md" action="create" />
    <file path="templates/system/WIKI.md" action="create" />
    <file path="templates/system/profiles/management.md" action="create" />
    <file path="templates/system/templates/" action="create" />
    <file path="templates/kb_instructions.management.md" action="create" />
    <file path="templates/system/templates/me.md" action="create" />
    <file path="templates/system/templates/project.md" action="create" />
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
- The pointer block is ≤ 14 lines, the `me.md` template ≤ 15 lines and the `project.md` template ≤ 20 lines.

## 2. Scope Boundaries

**✅ IN-SCOPE (Build This)**
- [ ] `SETUP.md`: the bootstrap (architecture.md §5.1), run once per repo: onboarding first (→ `me.md`), then the project (→ `project.md`), capture rules, permission mode, wiring, first source, `setup --done`.
- [ ] `ONBOARDING.md`: run once per person — name, form of address, role, what they use the wiki for, answer style → `me.md`; proposes question changes instead of editing `kb_instructions.md`.
- [ ] `WIKI.md`: triggers (shared file, directory, link, ambient), triage → extract → write steps, facts format, brief template, delegation rules per case (§7.6), contradiction handling, ambient-offer etiquette (batched, decided vs tentative), search usage, rule-proposal loop, query answering with citations.
- [ ] Management profile as suggestions (example questions, entity types with suggested page names, source kinds, never-capture defaults) and the `kb_instructions.md` seed (empty questions, entities and source kinds drafted at setup; general capture signals, write policy, never-capture list; changelog).
- [ ] `me.md` template (§5.4) and `project.md` template.
- [ ] Source page template (`source.md`); the page format for every other page — summary layer plus dated, cited facts layer, aliases, typed links (§8) — is documented in WIKI.md.
- [ ] Pointer block text (§6.5).
- [ ] Skills `wiki-setup`, `wiki-ingest`, `wiki-search`: descriptions that make agents load them at the right moment; bodies that point to `.wiki/system/` files.
- [ ] Sub-agent prompts `wiki-extractor` and `wiki-writer` in Claude (`.md`), Antigravity (`.md`) and Codex (`.toml`) formats.
- [ ] `test/templates.test.ts`: structural consistency checks.
- [ ] Scope change at SPRINT-02 planning (human, 2026-10-16; decomposition contract 13): no fixed pages — the profile becomes suggestions and the only page template is `source.md`; `ONBOARDING.md` onboards each person into a gitignored `me.md` (no `person:` link, no team page); `project.md` is a committed per-repo brief written during setup; the pointer block reads both files and onboards a user whose `me.md` is missing; `wikeeper doctor` gains a `setup-files` check that names the cause and fix when `me.md` is committed or not ignored, or `project.md` is missing after setup or ignored (STORY-006-08).
- [ ] CR-002 scope addition (SPRINT-02): B1–B7 — visible "Managed by wikeeper" line, editable vs package-owned files, ingest fallback, one ingest vocabulary, `me.md` schema, permission-mode preview in SETUP.md, `log/` vs `log.md` in WIKI.md; pointer block cap raised to 14 lines ([[CR-002]]).

**❌ OUT-OF-SCOPE (Do NOT Build This)**
- Knowledge-base quality evaluation and tuning (later phase).
- Profiles other than Management; translations.
- Installing the files into agent directories (EPIC-002).

## 3. The Reality Check (Context)

| Constraint Type | Limit / Rule |
|---|---|
| Context budget | Always-loaded text is minimal: pointer block ≤ 14 lines (raised from 12 by [[CR-002]]), `me.md` ≤ 15 lines; everything else loads on demand through skills. |
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
- `templates/system/SETUP.md`, `templates/system/ONBOARDING.md`, `templates/system/WIKI.md` — agent process (setup once per repo, onboarding once per person).
- `templates/system/profiles/management.md` — profile suggestions (questions, entity types, source kinds, never-capture defaults).
- `templates/system/templates/source.md` — the only page template.
- `templates/system/templates/project.md` — the `project.md` template; the agent writes the committed `.wiki/project.md` from it during setup.
- `src/core/paths.ts`, `src/commands/remove.ts` — `projectFile`, reported as kept by `remove`.
- `src/core/setup-files.ts`, `src/core/git.ts`, `src/commands/doctor.ts` — the `setup-files` doctor check (me.md present, ignored and not committed; project.md present and not ignored) and the git helper it uses (STORY-006-08, human decision 2026-10-16).
- `templates/kb_instructions.management.md` — user-owned seed.
- `templates/system/templates/me.md` — the `me.md` template, installed to `.wiki/system/templates/`; the agent writes `.wiki/me.md` from it during onboarding, `.wiki/system/ONBOARDING.md` (path set by the human at SPRINT-02 planning, 2026-10-16, replacing `templates/me.md`, which `init` would not install).
- `templates/agent-block.md` — pointer block text.
- `templates/skills/wiki-{setup,ingest,search}/SKILL.md` — skills.
- `templates/agents/{claude,antigravity}/wiki-{extractor,writer}.md`, `templates/agents/codex/wiki-{extractor,writer}.toml` — sub-agents.
- `test/templates.test.ts` — structural tests.

**Data Changes:**
- None beyond the shipped template files.

## 5. Acceptance Criteria

```gherkin
Feature: Instructions and Management profile

  Scenario: Setup starts by onboarding the user
    Given a freshly initialised wiki
    When the agent follows .wiki/system/SETUP.md
    Then its first step follows .wiki/system/ONBOARDING.md, which asks the user's name, form of address and role and writes me.md
    And its second step writes .wiki/project.md

  Scenario: Every referenced command exists
    Given all template files
    When test/templates.test.ts extracts every "wikeeper <command>" reference
    Then each command appears in "wikeeper --help"

  Scenario: Skills and sub-agents validate per agent
    Given the skill and sub-agent templates
    When the structural test parses their frontmatter or TOML
    Then each has exactly the fields its agent requires

  Scenario: Always-loaded text stays small
    Given templates/agent-block.md and the me.md and project.md templates
    Then the block is at most 14 lines, me.md at most 15 lines and project.md at most 20 lines

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
