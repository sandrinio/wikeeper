---
story_id: STORY-006-07
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-006 (approved 2026-10-16; CR-002 scope addition) · human decision 2026-10-16 (no fixed pages; ONBOARDING.md once per person; me.md without a page link — decomposition contract 13) · CR-002 B5 (me.md schema, amended by that decision) and §0.5 decision 3 (approved 2026-10-16) · architecture.md §5.1, §5.4, D-31 · verified src/core/gitignore.ts, src/core/paths.ts, src/core/templates.ts, src/commands/init.ts, test/template-loader.red.node.test.ts
actor: AI coding agent meeting a person who has no `.wiki/me.md` yet
complexity_label: L2
parallel_eligible: y
dep_predecessors:
  - STORY-006-02
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T22:30:00Z
updated_at: 2026-10-16T22:30:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 1
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T20:47:50Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 8903e7efc67975a54a463bc2c9d6d8718cdfcd4cd779a087124c3ebf5b30f216
stamp_error: no ledger rows for work_item_id STORY-006-07
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T19:21:54Z
  sessions: []
---

# STORY-006-07: ONBOARDING.md and the `me.md` template
**Complexity:** L2 — two template files and one test file. Onboarding runs once per person, so a teammate who clones a repository whose wiki is already set up is onboarded too.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent working with someone who has no `.wiki/me.md` yet, I want a short procedure that asks who they are, what they will use the wiki for and how they like answers, writes `me.md` with their approval and checks it will load, so that every person in a shared repository gets their own profile — not only the person who first set the wiki up.

### 1.2 Detailed Requirements
- **R1 — Structure (decomposition contract 13).** `templates/system/ONBOARDING.md` is new; `init` and `update` install it as `.wiki/system/ONBOARDING.md` (package-owned, replaced by `update`). Its steps are `## <n>. <title>` headings, exactly: `## 1. Who the user is`, `## 2. What they use the wiki for`, `## 3. How they like answers`, `## 4. Write me.md`, `## 5. Check that me.md loads`, `## 6. Continue`, in that order. The opening paragraph states the two ways in: from `.wiki/system/SETUP.md` step 1 (STORY-006-02), and on its own whenever `.wiki/me.md` is missing (the pointer block's session-start line, STORY-006-01). The text references only SPRINT-02 commands (decomposition brief, "Commands that exist") and names no knowledge page.
- **R2 — Step 1, who the user is.** Ask their name, how they want to be addressed and their role. Write only what the user says about themselves, never anything inferred; a value the agent can see (for example the git user name) may be suggested, and is written only once the user confirms it.
- **R3 — Step 2, what they use the wiki for.** Ask what they will ask the wiki and what they are working on (the `uses the wiki for` and `working on` lines). When the answers name questions `.wiki/kb_instructions.md` does not cover: if `.wiki/config.yml` has a `setup_completed_at`, propose them as described in `.wiki/system/WIKI.md, section "Proposing rule changes"` (STORY-006-04) and never edit `.wiki/kb_instructions.md` directly, because it is shared; if setup is not finished, keep them for SETUP.md step 3, which drafts the questions.
- **R4 — Step 3, how they like answers.** Ask the language, the answer style (for example short, or detailed with sources) and the timezone.
- **R5 — Step 4, write me.md.** Write `.wiki/me.md` from `.wiki/system/templates/me.md`, leaving out every line the user has not given a value for, and show it for approval. Later changes to `me.md` are made only with the user's approval.
- **R6 — Step 5, check that me.md loads (CR-002 §0.5 decision 3, moved here from SETUP.md).** Run `wikeeper doctor`. If its `setup-files` check (STORY-006-08) reports `.wiki/me.md` as committed or not ignored, quote the finding, tell the user not to commit `me.md`, and offer to follow the finding's `fix:` line, which names the cause (a committed file, a missing wikeeper `.gitignore` block, or a rule that re-includes it); never run `git rm` or edit `.gitignore` without the user's approval. Check that doctor reports the WIKI block in every agent file. Tell the user that from the next session on the agent reads `me.md` at the start and addresses them by their chosen name, and that if it does not, they should run `wikeeper doctor`. SETUP.md step 6 re-checks this together with `project.md`.
- **R7 — Step 6, continue.** If `.wiki/config.yml` has no `setup_completed_at`, continue with `.wiki/system/SETUP.md, section "2. The project"`. Otherwise onboarding is finished: tell the user in one or two sentences what the wiki covers, from `.wiki/project.md`, and how to ask it a question.
- **R8 — me.md template (CR-002 B5, as amended by the human on 2026-10-16).** `templates/system/templates/me.md`: frontmatter keys exactly `type` with value `me`; then `key: value` lines, in this order, each with a `<…>` placeholder: `name`, `address as`, `role`, `uses the wiki for`, `working on`, `timezone`, `language`, `answer style`; one comment line with the single rule for unknown values — leave the line out, never write a placeholder word. It links to no page: CR-002 B5's `person:` key is dropped, because the package ships no team page. At most 15 lines. It is not a page template and is not parsed with `parsePage`.

### 1.3 Out of Scope
- SETUP.md, the `project.md` template, `ResolvedPaths.projectFile` and the `wiki-setup` skill (STORY-006-02).
- The pointer block line that sends the agent here when `me.md` is missing (STORY-006-01).
- How rule proposals are made and recorded (WIKI.md, STORY-006-04).
- Writing `me.md` from the CLI, and checking its content: the agent writes it. Where it is (present, ignored, not committed) is checked by doctor's `setup-files` check (STORY-006-08), which step 5 reads.
- Repository-wide format checks (STORY-006-06).

### 1.4 Open Questions

- None — the onboarding design, the `me.md` fields and dropping the `person:` link were decided by the human on 2026-10-16 and are recorded as decomposition contract 13.

### 1.5 Risks

- **Risk:** In repositories installed with 0.1.0 the pointer block is never refreshed (D-11), so a teammate's agent is not sent to ONBOARDING.md when `me.md` is missing.
- **Mitigation:** Decided at planning: the 0.2.0 release notes tell 0.1.0 users to re-run `init` after `remove`; fresh installs get the new block (STORY-006-01).
- **Risk:** Onboarding a teammate edits the shared `kb_instructions.md` behind the other users' backs.
- **Mitigation:** R3 sends new questions through the proposal flow once setup is finished; the test checks that step 2 forbids direct edits.
- **Risk:** `test/template-loader.red.node.test.ts:161` pins `listTemplateFiles("system")` to the two placeholders, and the two new files break it.
- **Mitigation:** STORY-006-02's QA-Red re-scopes it once for the sprint (Sprint Design Review); STORY-006-02 is this story's predecessor, so QA-Verify here runs after that re-scope.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Two successful endings: the first user continues into SETUP.md, a later user finishes onboarding on its own (Scenario Outline). |
| Interfaces | T | Onboarding is reached from SETUP.md step 1 and from the pointer block when `me.md` is missing. |
| Data | F | One person and one `me.md` shape; optional answers only drop lines. |
| Rules | T | Step order, only what the user says, no direct edit of the shared rules file, the me.md schema and cap. |

```gherkin
Feature: ONBOARDING.md and the me.md template

  @rules
  Scenario: Onboarding asks about the user, writes me.md and checks that it loads
    Given templates/system/ONBOARDING.md
    Then it has the step headings "1. Who the user is", "2. What they use the wiki for", "3. How they like answers", "4. Write me.md", "5. Check that me.md loads" and "6. Continue", in that order
    And step 1 asks the user's name, form of address and role, says to write only what the user says and to write a suggested value only after the user confirms it
    And step 4 names ".wiki/me.md" and ".wiki/system/templates/me.md" and says to show me.md for approval
    And step 5 names "wikeeper doctor" and the check "setup-files", says to follow its fix line only with the user's approval, and does not name "git check-ignore"
    And no step names "team.md", and every "wikeeper <command>" it names is doctor
    And "wikeeper init --yes" in a temp repository installs .wiki/system/ONBOARDING.md and .wiki/system/templates/me.md

  @rules
  Scenario: Questions a user brings are proposed, never written into the shared rules
    Given templates/system/ONBOARDING.md
    Then step 2 names the reference .wiki/system/WIKI.md, section "Proposing rule changes" and the key "setup_completed_at"
    And it says not to edit ".wiki/kb_instructions.md" directly
    And it says that before setup is finished the questions are kept for SETUP.md step 3

  @paths @interfaces
  Scenario Outline: Onboarding is entered from setup or on its own, and ends accordingly
    Given templates/system/ONBOARDING.md
    Then its opening paragraph names <entry>
    And step 6 says that when <state> the agent <next>

    Examples:
      | entry                                         | state                                          | next                                                                 |
      | ".wiki/system/SETUP.md" step 1                | ".wiki/config.yml" has no "setup_completed_at" | continues with .wiki/system/SETUP.md, section "2. The project"       |
      | a missing ".wiki/me.md" at session start      | "setup_completed_at" is set                    | finishes and tells the user what ".wiki/project.md" says it covers   |

  @rules
  Scenario: me.md has a fixed schema and a cap
    Given templates/system/templates/me.md
    Then it has at most 15 lines
    And its frontmatter keys are exactly "type" with value "me"
    And its body keys are "name", "address as", "role", "uses the wiki for", "working on", "timezone", "language" and "answer style", in that order
    And it states that a line the user has not given a value for is left out
    And it contains no wikilink

  Scenario: Error — a me.md template that links to a page or adds a key fails the check
    Given a copy of the me.md template with the added frontmatter line person: "[[Head of Product]]"
    When the me.md schema check runs on it
    Then it fails naming the unexpected frontmatter key "person" and the wikilink "[[Head of Product]]"
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repository with a finished setup (`setup_completed_at` set and `.wiki/project.md` present), delete `.wiki/me.md`, start a Claude Code session and check that the agent onboards you, writes `me.md` after your approval, does not edit `.wiki/kb_instructions.md`, and then tells you what the wiki covers.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `templates/system/ONBOARDING.md` |
| Related Files | `templates/system/templates/me.md` |
| Test Files | `test/templates/onboarding.test.ts` |
| New Files Needed | Yes — `templates/system/ONBOARDING.md`, `templates/system/templates/me.md`, `test/templates/onboarding.test.ts` |

### 3.2 Technical Logic
- Write ONBOARDING.md to R1–R7. Keep it procedural and short: each step says what to ask, what to write and what "done" looks like. Address the agent ("ask the user …").
- The cross-references use the exact strings other stories own: `.wiki/system/SETUP.md, section "2. The project"` (STORY-006-02 R1) and `.wiki/system/WIKI.md, section "Proposing rule changes"` (STORY-006-04 R1). STORY-006-06 resolves both against the merged tree; this story's test checks only that the strings are present.
- me.md template (R8): `---`, `type: me`, `---`, the comment line, then the eight `key: <…>` lines — 12 lines. The test reads the frontmatter with the `yaml` package and the body keys as the text before the first `: ` on each non-comment line.
- The schema check is a small function in the test file (frontmatter keys, body keys and order, no `[[`), applied to the shipped template and, for the error scenario, to an edited copy in memory.
- `listTemplateFiles("system")` (`src/core/templates.ts:58`) picks up both new files automatically; `init` (`src/commands/init.ts:95`) and `update` install them with the other system files.

### 3.3 API Contract (if applicable)

Not applicable — template content. Paths it names: `.wiki/me.md` (`ResolvedPaths.meFile`, `src/core/paths.ts:45`), `.wiki/project.md` (`ResolvedPaths.projectFile`, STORY-006-02), `.wiki/kb_instructions.md`, `.wiki/config.yml`.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 3 | Step-heading parser; me.md schema check (keys, order, no wikilink); command-reference extraction |
| Integration tests | 1 | `init --yes` in a temp repository installs `.wiki/system/ONBOARDING.md` and `.wiki/system/templates/me.md` |
| E2E / acceptance tests | 6 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/template-loader.red.node.test.ts` passes unchanged after STORY-006-02's re-scope (this story does not edit it).
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/gitignore.ts:75` — the user's me.md file is the first entry of the managed `.gitignore` block, which step 5 relies on.
- **Surface:** `src/core/paths.ts:45` — `meFile` resolves the user's me.md file inside the wiki directory.
- **Surface:** `src/commands/init.ts:95` — installs `templates/system/**` into `.wiki/system/**`; `src/commands/init.ts:126` — re-applies the managed `.gitignore` block on every run, which the `setup-files` fix for a missing block names (STORY-006-08).
- **Surface:** `src/core/templates.ts:58` — `listTemplateFiles("system")`, which picks up the new files.
- **Surface:** `test/template-loader.red.node.test.ts:161` — the exact system-template list STORY-006-02 re-scopes.
- **Coverage of this requirement:** partial — installation, path resolution and the ignore rule exist; ONBOARDING.md and the template are net-new content.

## Prior work

- [[EPIC-006]] (parent), [[CR-002]] (B5 me.md schema, me.md load decision), [[STORY-006-02]] (SETUP.md, which hands off to this procedure; this story was split out of it on 2026-10-16), [[INITIATIVE-001]] (the original first-session flow, where setup interviewed the user). Duplicate check (cleargate-wiki-query, 2026-10-16): no shipped or planned item covers an onboarding procedure or a per-repo `project.md`; the only overlap is the split from [[STORY-006-02]], which is intended.

## Why not simpler?

- **Smallest existing surface that could carry this:** `templates/system/SETUP.md` step 1 (STORY-006-02), which held onboarding before the split.
- **Why isn't extension / parameterization / config sufficient?** SETUP.md runs once per repository, but `me.md` is personal and gitignored, so every person needs onboarding. Keeping it inside SETUP.md would make a teammate's agent run a setup procedure and skip seven of its eight steps; a separate file that the pointer block names directly is the simplest trigger the agent follows reliably. The `me.md` template reuses the shipped-template pattern under `templates/system/templates/`, so no new install mechanism is needed.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (EPIC-006 §4, amended for contract 13 on 2026-10-16, lists `templates/system/ONBOARDING.md` and `templates/system/templates/me.md`.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
