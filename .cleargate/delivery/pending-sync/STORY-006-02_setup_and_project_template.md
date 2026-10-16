---
story_id: STORY-006-02
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-006 (approved 2026-10-16; CR-002 scope addition) · human decision 2026-10-16 (no fixed pages; me.md, project.md, ONBOARDING.md — decomposition contract 13) · CR-002 B6 and §0.5 decision 3 (approved 2026-10-16) · architecture.md §5.1, §6.6, §7.2, D-30, D-31 · SPRINT-02 decomposition contracts 12, 13 · verified src/commands/init.ts, src/agents/enforce/{claude,codex,antigravity}.ts, src/core/config.ts, src/core/paths.ts, src/commands/remove.ts, test/paths.red.node.test.ts
actor: AI coding agent setting up a freshly initialised wiki with its user
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T22:30:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 3
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T20:47:49Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 5d294ea2a7ece44cf72a2d7d9653df31079b0e61bba37d4d0dcc6962a22421b8
stamp_error: no ledger rows for work_item_id STORY-006-02
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:50:16Z
  sessions: []
---

# STORY-006-02: SETUP.md, `project.md` template and the `wiki-setup` skill
**Complexity:** L2 — two template files, the skill text, one path field with its `remove` report line, and one test file. The permission preview is checked against the real enforce writers, so it cannot drift from what `--enforce` installs.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent in a freshly initialised repository, I want step-by-step setup instructions that onboard my user, write down what the project is, agree what the wiki must answer and capture, agree the permission mode (showing exactly what each mode installs), verify the wiring and finish with `wikeeper setup --done`, so that the wiki is usable after one conversation and shapes itself to this project rather than to a fixed set of pages.

### 1.2 Detailed Requirements
- **R1 — Structure.** `templates/system/SETUP.md` replaces the placeholder. Its steps are `## <n>. <title>` headings, exactly: `## 1. Onboard the user`, `## 2. The project`, `## 3. What the wiki answers`, `## 4. Permission mode`, `## 5. Wiring`, `## 6. Session start`, `## 7. First source`, `## 8. Finish`, in that order (decomposition contract 13). SETUP.md runs once per repository. Its text references only SPRINT-02 commands (decomposition brief, "Commands that exist") and names no knowledge page: pages, entity types and questions come from the conversation (human decision, 2026-10-16).
- **R2 — Step 1, onboard the user.** Follow `.wiki/system/ONBOARDING.md` (STORY-006-07), which writes `.wiki/me.md` and returns here at step 2. If `.wiki/me.md` already exists, show it and ask whether it is still right instead of onboarding again.
- **R3 — Step 2, the project.** Write `.wiki/project.md` from `.wiki/system/templates/project.md`. Ask what the project is, or draft it from a document the user names (a README, a product summary), then show it for approval. Only stable facts go in (R10); status, dates, decisions, people and roadmap go into pages through ingests. If `.wiki/project.md` already exists, show it and ask what has changed. The file is committed and shared with everyone in the repository.
- **R4 — Step 3, what the wiki answers (D-31).** Adapt the seeded `.wiki/kb_instructions.md`: the agent drafts the wiki's questions itself from `.wiki/project.md`, the `uses the wiki for` line of `.wiki/me.md` and the suggestions in `.wiki/system/profiles/management.md` (STORY-006-03), then the entities that answer them (with the page each one lives on), the source kinds in the `<kind-id> (v1) → <targets>` form, and the Never-capture list. Offer only the suggestions that fit this project; the user approves the result. No page is created in this step.
- **R5 — Step 4, permission mode (§7.2, CR-002 B6).** Explain `ai`, `ask` and `whitelist`. State the defaults: an unset `ingest.permission` means `ask`, and `enforce` is off unless chosen at `init` (D-30). Before applying, show a table of what each mode installs in each configured agent's settings when `enforce` is on — Claude Code `.claude/settings.json` permission rules, Codex `.codex/rules/wikeeper.rules` lines, Antigravity none (no project rule file; approval happens in chat) — and say that with `enforce` off only the CLI enforces the mode. For `whitelist`, agree `ingest.whitelist.kinds` and `origins`. Apply by writing the keys to `.wiki/config.yml`, then run `wikeeper update` so the agents' settings match.
- **R6 — Step 5, wiring.** Run `wikeeper doctor`; fix every error before continuing.
- **R7 — Step 6, session start (CR-002 §0.5 decision 3).** Run `wikeeper doctor` and check that the `setup-files` check (STORY-006-08) reports no error or warning — `.wiki/me.md` present, ignored and not committed; `.wiki/project.md` present and not ignored, because it is shared with the team — and that doctor reports the WIKI block in every agent file. For each `setup-files` finding, quote it to the user and follow its `fix:` line; never run `git rm` or edit `.gitignore` without the user's approval. Tell the user that from the next session on the agent reads both files at the start and addresses them by their chosen name, and that if it does not, they should run `wikeeper doctor`. ONBOARDING.md checks me.md first (STORY-006-07); this step re-checks it together with project.md.
- **R8 — Step 7, first source.** Offer to ingest a first source the user names — for example the document step 2 was drafted from — with `wikeeper ingest start`; point to `.wiki/system/WIKI.md`, section "Ingest". Nothing from the setup conversation itself is ingested.
- **R9 — Step 8, finish.** Run `wikeeper setup --done`.
- **R10 — project.md template (contract 13).** `templates/system/templates/project.md`: frontmatter keys exactly `type` (value `project`), `name` and `aliases` (a list); then the sections `## What it is` (what it does, for whom, what problem it solves), `## Scope` (what this wiki covers and what it does not), `## Where things live` (repos, docs and trackers the user ingests from) and `## Core terms` (a handful the agent needs to read sources), in that order, with `<…>` placeholders; one comment line stating that only stable facts belong here and that status, dates, decisions, people and roadmap go into pages through ingests. At most 20 lines. It is not a page template: it lives outside `pages/`, is not indexed or searched, and is not parsed with `parsePage`.
- **R11 — wiki-setup skill.** `templates/skills/wiki-setup/SKILL.md` keeps frontmatter `name: wiki-setup` and `description`; the description says to use it when `.wiki/config.yml` has no `setup_completed_at` or the user asks to (re)run setup; the body says to follow `.wiki/system/SETUP.md` step by step.
- **R12 — `projectFile` (contract 13).** `ResolvedPaths` gains `projectFile` = `<wikiDir>/project.md` (`src/core/paths.ts`, next to `meFile`). `wikeeper remove` lists it under `kept` when it exists, right after `me.md`, exactly like the other user-owned files (`src/commands/remove.ts`, `keptCandidates`); remove never deletes it, and `remove --purge` already deletes it with `.wiki/`.

### 1.3 Out of Scope
- ONBOARDING.md and the `me.md` template (STORY-006-07; CR-002 B5 moves there).
- Writing `me.md`, `project.md` or `config.yml` from the CLI (the agent writes them; `setup --done` already exists, STORY-001-07).
- Turning `enforce` on during setup — D-30 asks at `init`; SETUP only explains the effect.
- The profile suggestions and the kb seed (STORY-006-03), WIKI.md (STORY-006-04), the pointer block that reads `project.md` at session start (STORY-006-01).
- The `setup-files` doctor check that step 6 reads (STORY-006-08).
- Repository-wide format checks (STORY-006-06).

### 1.4 Open Questions

- None — the setup design (no fixed pages; `me.md` per person, `project.md` per repository, ONBOARDING.md per person) was decided by the human on 2026-10-16 and is recorded as decomposition contract 13.

### 1.5 Risks

- **Risk:** The permission preview goes stale when CR-001 (SPRINT-01) or STORY-004-02 (search allow rule) changes what the enforce writers install.
- **Mitigation:** The test builds the expected table from `CLAUDE_ENFORCE.items` and `CODEX_ENFORCE` at run time, so any change in the writers fails this test until SETUP.md is updated. Decided at planning (2026-10-16): this story writes the table for the writers as they are when it merges (wave 1); STORY-004-02 (wave 2) adds the search rows to the table when it adds the search allow rules.
- **Risk:** `project.md` turns into a status page and goes stale, since it is read every session but not maintained by ingests.
- **Mitigation:** The template's comment line, step 2 and the test all state the stable-facts-only rule; changing facts are routed to pages, where ingests keep them cited and current.
- **Risk:** `test/template-loader.red.node.test.ts:158` pins `listTemplateFiles("system")` to the two placeholders and checks the placeholder first line; this story breaks both.
- **Mitigation:** This story's QA-Red re-scopes it once for the whole sprint (Sprint Design Review); STORY-003-06, 006-03, 006-04 and 006-07 depend on this story for it.
- **Risk:** `test/paths.red.node.test.ts:42` compares `resolvePaths(root, DEFAULT_CONFIG)` with the exact set of fields, so `projectFile` breaks it.
- **Mitigation:** QA-Red adds `projectFile: path.join(w, "project.md")` to that expected object; no other test or source file builds a `ResolvedPaths` literal (checked: `src/commands/doctor.ts:83` only types a variable).

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One setup sequence; optional answers and re-runs change what the agent asks, not a flow the CLI can observe. |
| Interfaces | T | SETUP.md is reached through the pointer block and through the `wiki-setup` skill. |
| Data | T | The preview differs per permission mode (Scenario Outline). |
| Rules | T | Step order and handoffs, stated defaults equal the code defaults, the project.md schema and cap, remove keeps project.md. |

```gherkin
Feature: SETUP.md, project.md template and wiki-setup skill

  @rules @interfaces
  Scenario: Setup onboards the user, writes the project, agrees the rules and ends with setup --done
    Given templates/system/SETUP.md and templates/skills/wiki-setup/SKILL.md
    Then SETUP.md has the step headings "1. Onboard the user", "2. The project", "3. What the wiki answers", "4. Permission mode", "5. Wiring", "6. Session start", "7. First source" and "8. Finish", in that order
    And step 1 names ".wiki/system/ONBOARDING.md", and step 2 names ".wiki/project.md" and ".wiki/system/templates/project.md" and says to show it for approval
    And step 3 names ".wiki/kb_instructions.md" and ".wiki/system/profiles/management.md" and says the agent drafts the questions and the user approves them
    And step 5 runs "wikeeper doctor", step 7 offers "wikeeper ingest start" and names WIKI.md section "Ingest", and step 8 runs "wikeeper setup --done"
    And no step names "team.md", and every "wikeeper <command>" SETUP.md names outside the step-4 preview table is one of doctor, update, setup, ingest (the table is checked against the enforce items, so STORY-004-02 can add search rows)
    And it states that an unset "ingest.permission" means the value of DEFAULT_CONFIG.ingest.permission and that enforce is off by default
    And step 4 says to write the mode to ".wiki/config.yml" and run "wikeeper update"
    And the skill's frontmatter keys are exactly "name" and "description", name is "wiki-setup", the description mentions "setup_completed_at" and the body names ".wiki/system/SETUP.md"

  @data
  Scenario Outline: The permission preview matches what --enforce installs
    Given the preview table in step 4 of SETUP.md
    When the "<mode>" row is compared with CLAUDE_ENFORCE.items and CODEX_ENFORCE for "<mode>"
    Then the Claude Code cell lists exactly the permission rules, and their lists, that Claude receives
    And the Codex cell lists exactly the rules lines Codex receives
    And the Antigravity cell says there is no project rule file

    Examples:
      | mode      |
      | ai        |
      | ask       |
      | whitelist |

  @rules
  Scenario: project.md has a fixed schema, a cap and a session-start check
    Given templates/system/templates/project.md
    Then it has at most 20 lines
    And its frontmatter keys are exactly "type" with value "project", "name" and "aliases"
    And its sections are "What it is", "Scope", "Where things live" and "Core terms", in that order
    And it states that status, dates, decisions, people and roadmap are not written in it
    And SETUP.md step 6 names ".wiki/me.md", ".wiki/project.md", "wikeeper doctor" and the check "setup-files", says to follow its fix lines, and does not name "git check-ignore"

  @rules
  Scenario: remove keeps project.md and reports it as kept
    Given an initialised repository with .wiki/me.md and .wiki/project.md written during setup
    When I run "wikeeper remove --json"
    Then .wiki/project.md is byte-identical and data.kept lists ".wiki/project.md" right after ".wiki/me.md"
    And resolvePaths(root, DEFAULT_CONFIG).projectFile is the path of .wiki/project.md

  Scenario: Error — a preview row that differs from the writers fails
    Given a copy of SETUP.md whose ai row lists "Bash(wikeeper *)" for Claude Code
    When the preview check runs on it
    Then it fails naming mode "ai", agent "claude" and the missing and unexpected rules
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo, run `wikeeper init`, start a Claude Code session, say "set up the wiki" and follow it to `setup --done`; check that `.wiki/me.md` and `.wiki/project.md` exist, that only `me.md` is gitignored, that no page was created, and that the next session greets you by name and knows what the project is.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `templates/system/SETUP.md` |
| Related Files | `templates/system/templates/project.md`, `templates/skills/wiki-setup/SKILL.md`, `src/core/paths.ts`, `src/commands/remove.ts` |
| Test Files | `test/templates/setup.test.ts`, `test/remove.test.ts` |
| Re-scoped red tests (QA-Red; sole re-scoper of the template-loader test, Sprint Design Review) | `test/template-loader.red.node.test.ts`, `test/paths.red.node.test.ts` |
| New Files Needed | Yes — `templates/system/templates/project.md`, `test/templates/setup.test.ts` |

`src/commands/remove.ts` is also changed in this sprint by STORY-001-09 (the `--purge` help strings, lines 155–157) and STORY-004-06 (the search cache cleanup); this story adds one entry to `keptCandidates` (line 233) and nothing else, so the three edits touch different lines. `test/remove.test.ts` also gains STORY-004-06's cases; each story only adds its own.

### 3.2 Technical Logic
- Write SETUP.md to R1–R9. Keep it procedural: each step says what to ask, what to write, what to run and what "done" looks like.
- Preview table (R5): one row per mode, one column per agent. Cells hold the exact rule strings in backticks, prefixed by the Claude list (`permissions.allow` / `permissions.ask`); `—` for none. The test builds the expected cells from `CLAUDE_ENFORCE.items(cmd, mode)` (`src/agents/enforce/claude.ts:18`) and `CODEX_ENFORCE.flatMap((s) => s.items(cmd, mode))` (`src/agents/enforce/codex.ts:36`), keeping `kind: "rule"` items only and reading the Claude list from each item's `identity` (`permissions.allow[...]` / `permissions.ask[...]`); `ANTIGRAVITY_ENFORCE` (`src/agents/enforce/antigravity.ts:5`) yields no rules.
- Defaults (R5): the test reads `DEFAULT_CONFIG.ingest.permission` and `DEFAULT_CONFIG.enforce` (`src/core/config.ts:88`) and finds them in the sentence SETUP.md uses for defaults, so a changed default fails the test.
- project.md template (R10): frontmatter `type: project`, `name: <project name>`, `aliases: [<other names>]`; the four sections, each with one `<…>` placeholder line; the comment line carrying the stable-facts-only rule. The test reads the frontmatter with the `yaml` package and the `##` headings line by line.
- `projectFile` (R12): one field in `ResolvedPaths` (`src/core/paths.ts:12`) and one line in `resolvePaths` (`src/core/paths.ts:45`, after `meFile`); one entry in `keptCandidates` after `paths.meFile` (`src/commands/remove.ts:236`). The gitignore block is unchanged: `project.md` is meant to be committed.
- The skill (R11) keeps the two frontmatter keys STORY-002-03 installs (`src/agents/skills.ts:126` copies the folder as is).
- `listTemplateFiles("system")` (`src/core/templates.ts:58`) picks up `templates/system/templates/project.md` automatically; `init` and `update` install it with the other system files.

### 3.3 API Contract (if applicable)

| Export | Shape | Consumers |
|---|---|---|
| `ResolvedPaths.projectFile` (`src/core/paths.ts`) | `string` — absolute path of `<wikiDir>/project.md` | `remove` (this story); later stories that read `project.md` |
| `RemoveResult.kept` (`src/commands/remove.ts`) | unchanged type; gains `.wiki/project.md` when the file exists | `wikeeper remove --json` callers |

Otherwise template content; consumes the enforce specs and `DEFAULT_CONFIG` read-only.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 4 | Step-heading parser; preview-table parser; project.md frontmatter and section check; defaults sentence check |
| Integration tests | 2 | `init --yes` in a temp repo installs `.wiki/system/templates/project.md` and the new SETUP.md; `remove --json` keeps `.wiki/project.md` and lists it after `.wiki/me.md` (`test/remove.test.ts`) |
| E2E / acceptance tests | 7 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/template-loader.red.node.test.ts` re-scoped by QA-Red (not the Developer), once for the whole sprint (Sprint Design Review): the exact list at line 161 becomes a containment check for `system/SETUP.md` and `system/WIKI.md`, and the placeholder-first-line check at line 164 is dropped while the LF and trailing-newline checks stay, so later files under `templates/system/` and the real WIKI.md (STORY-006-04) pass unchanged.
- [ ] `test/paths.red.node.test.ts` re-scoped by QA-Red (not the Developer): the expected object at line 42 gains `projectFile`.
- [ ] `test/e2e/goal.test.ts` (SPRINT-01) still passes: `remove` leaves pre-existing files byte-identical.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/system/SETUP.md:1` — placeholder line only.
- **Surface:** `templates/skills/wiki-setup/SKILL.md:1` — placeholder skill with the right frontmatter keys.
- **Surface:** `src/commands/init.ts:95` — installs `templates/system/**` into `.wiki/system/**`.
- **Surface:** `src/agents/enforce/claude.ts:30` — the per-mode permission rules the preview must match; `src/agents/enforce/codex.ts:4` for Codex.
- **Surface:** `src/core/config.ts:56` — `ingest.permission` default `ask`; `src/core/config.ts:52` — `enforce` default `false`.
- **Surface:** `src/core/paths.ts:12` — `meFile` in `ResolvedPaths`, the model for `projectFile`; `src/core/paths.ts:45` — its resolution.
- **Surface:** `src/commands/remove.ts:233` — `keptCandidates`, the list `remove` reports as kept.
- **Surface:** `test/paths.red.node.test.ts:42` — exact-shape assertion on `resolvePaths`.
- **Coverage of this requirement:** partial — the files, the install path and the kept report exist; the content is placeholder and `project.md` is net-new.

## Prior work

- [[EPIC-006]] (parent), [[CR-002]] (B6 permission preview, me.md load decision), [[EPIC-002]] (skill install and `--enforce` writers, STORY-002-03 and STORY-002-06), [[CR-001]] (narrows the `ai` rules the preview shows), [[STORY-006-07]] (ONBOARDING.md and the me.md template, split out of this story on 2026-10-16). No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `templates/system/SETUP.md:1` — this story fills it in; `src/commands/remove.ts:233` already reports user-owned files and takes one more entry.
- **Why isn't extension / parameterization / config sufficient?** The setup procedure is text the agent follows; there is no code path that could carry it. Generating the preview table from code at install time would require templating system files, which `update`'s hash-based replacement does not support; checking a static table against the writers in a test gives the same guarantee with no new mechanism. `projectFile` reuses the `meFile` pattern instead of hard-coding the path in `remove`. The code part stays in this story because it exists only to report the file this story introduces; on its own it would trip the rubric's too-small signal (one entry in an existing list).

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (EPIC-006 §4, amended for contract 13 on 2026-10-16, lists `templates/system/SETUP.md`, `templates/system/templates/project.md`, `templates/skills/`, `src/core/paths.ts` and `src/commands/remove.ts`.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
