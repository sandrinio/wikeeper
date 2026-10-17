---
cr_id: CR-003
parent_ref: EPIC-001 | EPIC-002 | EPIC-003 | EPIC-004 | EPIC-005 | EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
complexity_label: L2
context_source: "SPRINT-02 walkthrough (Goal check 4), parts 1 and 2: ~/Documents/Dev/formapass_management/wikeeper-test-notes-sprint-02.md (2026-10-17) · SPRINT-02_REPORT.md §4.3 · human sign-off 2026-10-17 to defer every ⚠️ item to SPRINT-03 · verified against src/ and the raw epic files"
created_at: 2026-10-17T08:27:39Z
updated_at: 2026-10-17T08:40:53Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T08:41:13Z
  transition: ready-to-apply
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id CR-003
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T08:29:09Z
  sessions: []
---

# CR-003: SPRINT-02 walkthrough feedback — ingest, search and instruction follow-ups for SPRINT-03

All items below are `UR:review-feedback` from the SPRINT-02 walkthrough in `formapass_management`. None is broken against spec: the one spec break (row 8.11) and three fixes (rows 8.2, 8.3, 8.4) shipped in SPRINT-02 M6, and `architecture.md` §7.3 was corrected at the SPRINT-02 Gate-4 doc refresh. The human deferred every remaining ⚠️ item to SPRINT-03 on 2026-10-17. This CR is the input for SPRINT-03 decomposition: each item is routed to the epic that owns it. Row numbers refer to the walkthrough notes.

## 0.5 Open Questions

- **Question:** How should triage searches on a sparse wiki stop filling `log/` with misses (rows 7.8, 8.6: 45 miss files after the first directory ingest)?
- **Recommended:** Add `search --no-miss`. WIKI.md and the extractor and writer prompts use it for triage and routing searches, so a miss records only a question someone asked the wiki. The alternatives are worse: a page-count threshold hides real misses on a small wiki, and merging misses into one file breaks the one-file-per-event log (D-28).
- **Human decision:** Approved as recommended (human, 2026-10-17, SPRINT-03 planning).

- **Question:** What should `ingest finish` do when a page lost a fact line that its snapshot had (row 11.26a)?
- **Recommended:** Refuse, like the frontmatter check from SPRINT-02 M6: exit `validation_failed`, name the page and the missing lines, keep the lock so the writer can restore them and run `finish` again. WIKI.md "Page format" already says a replaced fact stays in the list, so a dropped line is always a writer error. A warning would let a full-page rewrite lose facts silently.
- **Human decision:** Approved as recommended (human, 2026-10-17, SPRINT-03 planning).

- **Question:** In `ai` mode, should `ingest abort --drop` (deletes the stored source) and `ingest apply --force-unlock` still run without a prompt (rows 0.9c, 4.2d)?
- **Recommended:** No. Allow the routine verbs (`start`, `plan`, `facts`, `apply`, `finish`, `abort` without `--drop`) and make those two forms prompt: a Claude `ask` rule and a Codex `prompt` prefix rule. If a Claude rule cannot match a flag inside the command, the story drops `abort` from the allow list instead, so every `abort` prompts.
- **Human decision:** Approved as recommended (human, 2026-10-17, SPRINT-03 planning).

- **Question:** Since `--status` now filters `status::` values, nothing lists tentative facts (row 11.6c). Add a filter?
- **Recommended:** Add `search --mark decided|tentative`, which returns fact lines with that mark (combinable with `--type`, `--entity` and `--since`). `--status` with no results adds the hint "fact marks are filtered with --mark".
- **Human decision:** Approved as recommended (human, 2026-10-17, SPRINT-03 planning).

- **Question:** How should `--version` tell builds apart (row 11.1: every build reports `0.0.1`)?
- **Recommended:** Stamp the commit at build time: `wikeeper --version` prints `0.3.0+a0f0550` (`+dev` when the build has no git). `package.json` moves to `0.3.0` this sprint, and the install manifest records the full version string.
- **Human decision:** Approved as recommended (human, 2026-10-17, SPRINT-03 planning).

## 1. The Context Override (Old vs. New)

**Obsolete Logic (What to Remove / Forget):**
- Every zero-result search is logged as a miss, including the extractor's and writer's own triage searches.
- `--help` ends with "Status: pre-alpha. Commands land in upcoming releases" (`src/program.ts:57`).
- `ai` mode allows `Bash(wikeeper ingest *)`, which covers `abort --drop` and `apply --force-unlock` (`src/agents/enforce/claude.ts:31`, `src/agents/enforce/codex.ts:4`).
- `ingest finish` checks that a changed page cites the source and has valid frontmatter, and nothing about the lines it had before.
- The number of rule suggestions is reported and logged, but the suggestions themselves can only be read by opening `raw/<id>.facts.json`.
- `kb_instructions.md` has a defined format only for source-kind lines; questions, entities and notes are free text, and nothing validates the file.

**New Logic (The New Truth), by owner:**

**A. Search (EPIC-004 code)**
1. `search --no-miss` skips miss recording (Open Question 1). Triage and routing searches in WIKI.md and the sub-agent prompts use it.
2. `search --misses` reports both numbers: "45 misses, 38 distinct queries" (row 8.13).
3. A miss with filters but no query names its filters in the log summary line: `No results for --status tentative.`, not `No results for "".` (row 11.6b; `src/ingest/log.ts:123`).
4. When `--limit` cuts results, human output says so: "showing 10 of 28 page changes; use --limit to see more". JSON already has `total` (rows 8.10, 10.4).
5. `search --mark decided|tentative` (Open Question 4). `--status` with no results hints at `--mark` (row 11.6a).

**B. Ingest (EPIC-003 code)**
1. `ingest finish` refuses a page that lost a fact line its snapshot had (Open Question 2).
2. `ingest start` reports `needs_approval` (exit 3) without the `Error:` label, and names the kind and its rule version, so the agent can show the user what will be ingested (row 7.2).
3. Help text: `ingest facts` says re-running it before `apply` replaces the stored facts; `ingest abort` says it also works before `apply`, and `--drop` deletes the registered source (rows 7.9, 7.20).

**C. Permissions and enforce (EPIC-002 and EPIC-003 code)**
1. `ai` mode no longer auto-allows `abort --drop` or `apply --force-unlock` (Open Question 3).
2. The `whitelist.origins` format is documented in WIKI.md and SETUP.md exactly as `matchesOrigin` implements it (`src/ingest/permissions.ts:61`): an entry with `/`, a leading `.` or `~` is a path glob (`*`, `**`, `~/` expanded) matched against file sources; anything else is a URL host, with `*.` for subdomains (row 4.2a).
3. WIKI.md says one chat approval of the exact source (same path and size) covers the `--approved` rerun after exit 3; the Claude Code prompt is the harness's own and is not a second approval to ask for (row 7.3).

**D. Rules (EPIC-005 code and EPIC-006 text)**
1. `kb_instructions.md` gets a defined line format for questions (`Q<n>. <text>`), entities (`<entity> <fields> → <page> <Q-refs>`) and source kinds, frozen by the EPIC-005 parser and shown in SETUP.md step 3 (row 3.2a).
2. A note line under `## Source kinds` (`note: …`) holds routing notes and exclusions such as "epics are not initiatives"; the parser never reads it as a rule (row 11.10).
3. WIKI.md defines what a bare target (`decision`) covers versus `entity.field` (`project.status`) (row 3.2c), and how a question answered by dated facts ("what changed since …") is written so `lint --rules` does not report it as unserved (row 3.2b).
4. `lint --rules` validates the file; `doctor` reports a parse failure as one warning that points to `lint --rules` (row 3.4).
5. `wikeeper status` lists pending rule suggestions: the `uncovered` items from finished ingests' facts files, with source ids, until a `rules record` decision covers them (row 8.12).

**E. Instructions (EPIC-006 text)**
1. WIKI.md: `project.md` may be quoted when no page answers, labelled as uncited context from the project brief (row 10.3).
2. WIKI.md: the write guard sees file-edit tools only; shell writes are not blocked, and `wikeeper lint` reports them as `unlogged-change` (rows 11.4, 11.27c; CR-002 D1).
3. WIKI.md: cite only what the source says (rule text and the brief are not sources); add an alias only when a fact carries it (rows 11.20, 8.9).
4. WIKI.md: fact lines in a section are ordered by date, oldest first (row 11.26b).
5. WIKI.md: a correction after `finish` comes in as a chat-excerpt ingest (`ingest start -` with the user's correction), so every page change still has a source and a log entry (row 11.27a).
6. The `wiki-ingest` skill states the same delegation rules as WIKI.md's table, not stricter ones (rows 7.1, 11.27b).
7. WIKI.md: entity pages are named by id when the source gives ids (`initiatives/initiative-005.md`), otherwise by title slug (row 7.15).
8. WIKI.md triage: a source that only points to another file ("read … for the rest") is reported to the user, who decides whether to ingest the real file (row 7.17).
9. `me.md` template: extra preferences go under an `## Other` section (row 1.2). WIKI.md: `project.md` core terms are the brief; ingested glossary pages hold cited terms; on conflict the cited page wins and the agent offers a `project.md` update (row 2.4).
10. Doc nits (row 0.9): the ONBOARDING step 2 code span names only the file; SETUP step 4 says how to turn `enforce` off.

**F. CLI and doctor (EPIC-001 and EPIC-002 code)**
1. `--version` prints the package version plus the build's commit (Open Question 5) (row 11.1).
2. The `--help` footer names the version and the docs link, and drops "Commands land in upcoming releases" (row 0.6).
3. `doctor`'s agent-wiring line names the files it found the block in and pluralises correctly: "WIKI block in AGENTS.md (1 file)" (row 1.6).
4. `doctor`'s `setup-files` result lists the sub-checks it ran: `me.md` ignored, not committed; `project.md` present, not ignored (row 6.2).

## 2. Blast Radius & Invalidation

- [x] Update Epic: EPIC-002 (C1, F3, F4), EPIC-004 (A1–A5), EPIC-005 (D1–D5), EPIC-006 (E1–E10, D1–D3 text). These are scope additions applied at SPRINT-03 decomposition, and no Done story is reopened. EPIC-001 (F1, F2) and EPIC-003 (B1–B3, C1–C3) are archived (frozen, §11.4), so their items are carried by new SPRINT-03 stories that cite this CR.
- [x] Update Story: none. All SPRINT-02 stories stay Done; the work becomes new SPRINT-03 stories.
- [ ] Database schema impacts? No. Stored data is unchanged: pending rule suggestions are read from the existing facts files.

## Existing Surfaces

- **Surface:** `src/program.ts:57`: the `--help` footer text (F2); `src/program.ts:52`: `.version(VERSION, …)` from `package.json` (F1).
- **Surface:** `src/agents/enforce/claude.ts:31` and `src/agents/enforce/codex.ts:4`: the `ai`-mode ingest allow rules (C1).
- **Surface:** `src/ingest/permissions.ts:61`: `matchesOrigin`, the whitelist origin format to document (C2).
- **Surface:** `src/search/misses.ts:15`: every zero-result search is a miss (A1); `src/search/misses.ts:135`: the misses header counts groups (A2).
- **Surface:** `src/ingest/log.ts:123`: the miss summary line (A3).
- **Surface:** `src/commands/search.ts:155`: results sliced to `--limit` with no truncation note (A4).
- **Surface:** `src/ingest/validate.ts:35`: `validateIngest`, where the dropped-fact check joins the citation and frontmatter checks (B1).
- **Surface:** `src/commands/ingest-facts.ts:40`, `src/commands/ingest-abort.ts:20`: help descriptions (B3).
- **Surface:** `src/agents/index.ts:359`: the agent-wiring summary line (F3).
- **Surface:** `src/ingest/facts.ts:35`: `uncovered` in the facts file, the source of pending rule suggestions (D5).
- **Surface:** `./templates/system/WIKI.md`, `./templates/system/SETUP.md`, `./templates/system/ONBOARDING.md`, `./templates/system/templates/me.md`, `./templates/skills/wiki-ingest/SKILL.md`: instruction text (D, E).
- **Why this CR extends rather than rebuilds:** every item adjusts an existing command, check, rule or template. The new pieces (`--no-miss`, `--mark`, the dropped-fact check, the build stamp) are options or checks on existing surfaces, not new subsystems.

## Prior work

- Related: [[CR-002]] (the SPRINT-01 walkthrough CR; its C1 lint half, C2 and D1 also land in SPRINT-03), [[SPRINT-02]] (the walkthrough and its 17 deferred items), [[EPIC-005]] (lint, `lint --rules`, `status`, rule decisions), [[EPIC-003]] (ingest, archived), [[EPIC-004]] (search), [[EPIC-006]] (instructions), [[STORY-004-05]] (miss logging), [[CR-001]] (`ai`-mode allow rules). The wiki-query duplicate check found no existing CR for any item.

## 3. Execution Sandbox

**Modify (when the SPRINT-03 stories run):**
- `src/program.ts`, `src/core/templates.ts`, `package.json`, the build script
- `src/agents/enforce/claude.ts`, `src/agents/enforce/codex.ts`, `src/agents/index.ts`, `src/agents/doctor-checks.ts`, `src/commands/doctor.ts`
- `src/search/misses.ts`, `src/search/filters.ts`, `src/commands/search.ts`, `src/ingest/log.ts`
- `src/ingest/validate.ts`, `src/commands/ingest-finish.ts`, `src/commands/ingest-start.ts`, `src/commands/ingest-facts.ts`, `src/commands/ingest-abort.ts`
- `templates/system/WIKI.md`, `templates/system/SETUP.md`, `templates/system/ONBOARDING.md`, `templates/system/templates/me.md`, `templates/skills/wiki-ingest/SKILL.md`, `templates/agents/*/wiki-extractor.*`, `templates/agents/*/wiki-writer.*`
- The EPIC-005 files named in its own stories

**Now (on approval, done 2026-10-17):** add a one-line "CR-003 scope addition" bullet to EPIC-005 §2 (pending-sync), pointing at this CR. The archived epics are not edited.

## 4. Verification Protocol

**Command/Test:** `npm test` and `npm run test:perf` (each SPRINT-03 story carries its own Gherkin), plus a part-3 walkthrough in `formapass_management` at the end of SPRINT-03.

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A triage search with `--no-miss` vs a user question that misses. |
| Interfaces | T | Human `search` / `--version` output vs `--json`. |
| Data | F | No item varies by data shape; per-item stories add their own Data axes. |
| Rules | T | A dropped fact line blocks `finish`; `ai` mode prompts for `abort --drop`. |

```gherkin
Feature: SPRINT-02 walkthrough feedback

  @paths
  Scenario: a triage search leaves no miss
    Given an initialised wiki with no pages
    When I run "wikeeper search roadmap --no-miss"
    Then no miss event is written to log/

  @rules
  Scenario: finish refuses a page that lost a fact line
    Given an applied ingest whose snapshot of pages/roadmap.md has 29 fact lines
    And the writer rewrote the page with 28 of them
    When I run "wikeeper ingest finish <id>"
    Then the command exits with validation_failed and names pages/roadmap.md and the missing line
    And the write lock is still held

  @rules
  Scenario: ai mode prompts before dropping a source
    Given "wikeeper init --agents claude --enforce" with ingest.permission ai
    Then .claude/settings.json does not allow "wikeeper ingest abort <id> --drop" without a prompt

  @interfaces
  Scenario: --version tells builds apart
    When I run "wikeeper --version" on a build of commit a0f0550
    Then it prints "0.3.0+a0f0550"

  Scenario: Obsolete logic is gone — the help footer no longer says commands are coming
    When I run "wikeeper --help"
    Then the output does not contain "Commands land in upcoming releases"
```

**Test layers.**

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 0 | Set per story at SPRINT-03 decomposition |
| Integration tests | 0 | No external services |
| E2E / acceptance tests | 5 | One per Gherkin scenario above; story-level tests are added at decomposition |

---

## Context Source

**context_source:** SPRINT-02 walkthrough on 2026-10-17, parts 1 and 2. A headless Claude Code session set up and filled `~/Documents/Dev/formapass_management` with the `sprint/S-02` build; the orchestrator drove and observed it. Every finding was checked against `src/`, `architecture.md` and the raw epic files. The human deferred every ⚠️ item to SPRINT-03 on 2026-10-17.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] "Obsolete Logic" to be evicted is explicitly declared.
- [ ] All impacted downstream Epics/Stories are identified and reverted to 🔴 High Ambiguity. (Downstream epics are identified in §2, but they take scope additions instead of reverting to 🔴, and five of them are archived; left unchecked on the literal text, as for CR-002. Human informed 2026-10-17.)
- [x] Execution Sandbox contains exact file paths.
- [x] Verification command is provided.
- [x] `approved: true` is set in the YAML frontmatter.
- [x] Existing Surfaces cites at least one source-tree path the CR extends.
