---
story_id: STORY-006-12
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: CR-003 E1–E10 and Open Question 2 (approved 2026-10-17) · STORY-003-12 R1–R3 and §1.3 (dropped fact lines; the WIKI.md and writer text it hands to this story) · SPRINT-03 Gate 1 decisions 3, 9, 18, 19, 21 (plans/gate1-decisions.md; approved at Gate 1, 2026-10-17) and consistency-audit findings 3, 9, 18 · CR-002 D1 (lint is the shell-write backstop) · split from the first draft of STORY-006-10 (its Group B) · gate1-decisions technical call on the SETUP.md order (002-09 → 003-10 → 005-09 → 006-10 / 006-12) · SPRINT-02 walkthrough notes, formapass_management (rows 0.9a, 0.9b, 1.2, 2.4, 7.1, 7.15, 7.17, 8.9, 10.3, 11.4, 11.20, 11.26, 11.27a–c) · verified templates/system/{WIKI,SETUP,ONBOARDING}.md, templates/system/templates/me.md, templates/skills/wiki-ingest/SKILL.md, templates/agents/*/wiki-{extractor,writer}.*, src/agents/enforce/index.ts, src/wiki/parse-page.ts, src/ingest/validate.ts, test/templates/*.red.node.test.ts, test/templates/structure.ts
actor: AI coding agent (main agent or sub-agent) operating the wiki
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-002-09
  - STORY-003-12
  - STORY-005-02
  - STORY-005-03
  - STORY-005-09
  - STORY-006-10
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T10:07:15Z
updated_at: 2026-10-17T10:07:15Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:09:29Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-006-12
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T10:09:08Z
  sessions: []
---

# STORY-006-12: CR-003 writing, answering and onboarding text
**Complexity:** L2 — about a dozen text changes in WIKI.md (sections "Triage and extract", "Write phase", "Page format", "Answering questions"), SETUP.md step 4, ONBOARDING.md, the `me.md` template, the `wiki-ingest` skill and the six sub-agent files, plus one content test and one authorised red-test edit. No code. Split from the first draft of STORY-006-10 (Gate 1 decision 3); it lands after STORY-006-10 and before STORY-006-09.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent running a wikeeper wiki (for this human: Formapass product management — marketing, sales, presentations and drafting initiatives), I want the instructions to tell me how pages are named, ordered and cited, how a fact is corrected without losing the old line, what `wikeeper ingest finish` refuses and how I recover, when the project brief may answer a question, and the onboarding and setup details the walkthrough found, so that two agents given the same source write the same pages and no fact is lost or invented.

### 1.2 Detailed Requirements

- **R1 — E1 and E9b, `project.md` in answers (rows 10.3, 2.4).** WIKI.md section "Answering questions" (`templates/system/WIKI.md:202`) gains, after its numbered list: when no page answers, the agent may quote `.wiki/project.md`, labelled as uncited context from the project brief; the core terms in `.wiki/project.md` are the brief, and term pages written by ingests hold cited terms; when the two disagree, the cited page wins: answer from it and offer the user an update to `.wiki/project.md`. Item 4 ("When the wiki does not know, say so plainly. Do not guess.") stays. STORY-006-10 edits the miss sentence of the same section (`:209`) first.
- **R2 — E2, shell writes (rows 11.4, 11.27c; CR-002 D1).** WIKI.md section "Write phase" step 8 (`:47`) adds: with `enforce` on, the write guard sees only the file-edit tools, so a shell write is not blocked; `wikeeper lint` reports it later as an `unlogged-change` finding (STORY-005-03). The id is followed by "finding", never "check": `test/templates/structure.ts:194` reads "`<id>` check" as a doctor check id.
- **R3 — E3, citations and aliases (rows 11.20, 8.9).** "Write phase" step 5 (`:44`) adds: cite only what the source says; the rule text in `.wiki/kb_instructions.md` and the brief are not sources, so nothing that comes only from them goes on a page. Step 2 (`:41`) adds: add an alias to a page only when a fact carries it.
- **R4 — Fact lines are kept (CR-003 B1 and Open Question 2, handed off by STORY-003-12 §1.3; Gate 1 decision 9).** The text states what `finish` refuses (STORY-003-12 R1–R3):
  - "Write phase" step 6 (`:45`, "Flag a contradiction with both sources; never overwrite the earlier fact.") adds: keep every fact line an updated page had at apply. An update or a correction is a new dated line, and the old line stays as it was: never reword, redate or re-mark it, and never move it to another page. Moving a line within the page, or changing its list marker or spacing, is fine.
  - The closing paragraph (`:50`) adds: when `finish` refuses with `fact lines dropped`, put each named line back exactly as it was and run `wikeeper ingest finish <id>` again; the lock is still held. Deleting a whole page stays allowed, and the report counts it.
  - The writer prompts (`templates/agents/claude/wiki-writer.md:11–15` "Rules" and `:24` step 7; the same text in `templates/agents/antigravity/wiki-writer.md` and `templates/agents/codex/wiki-writer.toml`) gain the rule "Keep every fact line a page already has. To correct or update a fact, add a new dated line and leave the old line as it is; wikeeper ingest finish refuses a page that lost a fact line or had one changed." Step 7 becomes "If finish fails, fix the pages as its report says and run it again; put a dropped fact line back exactly as it was."
- **R5 — E5, corrections after `finish` (row 11.27a).** The "Write phase" closing paragraph: "a fix needs a new ingest" becomes "a correction after `finish` comes in as a chat-excerpt ingest: run `wikeeper ingest start -` with the user's correction on stdin, then triage and the write phase, so every page change has a source and a log entry; its write phase adds the corrected fact as a new line (step 6)". "change nothing under `pages/`" stays (`test/templates/walkthrough-fixes.red.node.test.ts:91`).
- **R6 — E4, fact order (row 11.26b).** WIKI.md section "Page format", Facts bullet (`:111`), says fact lines are ordered by date, oldest first, and a new line goes in at its date. The single-entity example's three fact lines (`:136–138`) are reordered to 2026-09-30, 2026-10-14, 2026-10-15; they keep their decided, tentative and contradiction lines (`test/templates/wiki-protocol.red.node.test.ts:175`).
- **R7 — E6, the skill matches the delegation table (rows 7.1, 11.27b).** The `wiki-ingest` skill's "Who does what" (`templates/skills/wiki-ingest/SKILL.md:12–17`) names, per case, exactly the actors of WIKI.md section "Delegation": a file shared in chat — `wiki-extractor` or the main agent extracts, `wiki-writer` or the main agent writes; something said in chat — the main agent extracts, `wiki-writer` or the main agent writes; a directory — one `wiki-extractor` per approved file, in parallel, after `wikeeper ingest plan` is approved, and `wiki-writer`, one source at a time; a link — the main agent gets the text, `wiki-extractor` or the main agent extracts, `wiki-writer` or the main agent writes. The rule-like lines "Every write phase: hand it to a `wiki-writer`" and "A file or text you have already read: extract the facts yourself" go. The body keeps "Write the brief (section "Brief") into its task", "facts file", "one at a time", `ingest.delegate` and "never" (`test/templates/skills-subagents.red.node.test.ts:92–94`, `walkthrough-fixes.red.node.test.ts:138–141`). STORY-006-09 edits the skill's lines 8–10 afterwards.
- **R8 — E7, page names (row 7.15).** WIKI.md section "Triage and extract" step 3 (`:33`) says: a page name with a `<…>` placeholder under `## Entities` is filled with the entity's id when the source gives one (`initiatives/initiative-005.md`), otherwise with its title as a lowercase, hyphenated slug.
- **R9 — E8, sources that point elsewhere (row 7.17).** WIKI.md section "Triage and extract" says: a source that only points to another file ("read … for the rest") or is cut short is reported to the user, who decides whether to ingest the real file instead; nothing is written for it until they decide. The extractor's "Return to the parent" line (`templates/agents/claude/wiki-extractor.md:22`, `templates/agents/antigravity/wiki-extractor.md:23`, `templates/agents/codex/wiki-extractor.toml:20`) adds "whether the source only points to another file".
- **R10 — E9a, extra preferences in `me.md` (row 1.2; Gate 1 decision 19).** The `me.md` template (`templates/system/templates/me.md:4`) states in a single-line HTML comment that extra preferences the user gives go under a final `## Other` heading, one `key: value` line each; ONBOARDING.md step 4 (`templates/system/ONBOARDING.md:32`) says the same. The template itself carries no `## Other` line and stays at most 15 lines, so `checkMeSchema` (`test/templates/onboarding.red.node.test.ts:47`) passes unchanged.
- **R11 — E10a, the ONBOARDING code span (row 0.9a).** ONBOARDING.md step 2 (`:19`) reads `` `.wiki/system/WIKI.md`, section "Proposing rule changes" ``: the code span names only the file, as SETUP.md step 7 does. `checkSections` (`test/templates/structure.ts:261`) already resolves this form. It needs STORY-006-11 R6 (e), the re-scope of `test/templates/onboarding.red.node.test.ts:145`, which this story's QA-Red applies.
- **R12 — E10b, turning `enforce` off (row 0.9b; Gate 1 decision 18; audit finding 3).** SETUP.md step 4 (`templates/system/SETUP.md:57`) keeps "Do not turn `enforce` on here" and adds: to turn it off, set `enforce: false` in `.wiki/config.yml` and run `wikeeper update`, which removes wikeeper's hook and rules from each agent's settings. Today `update` keeps them (`src/agents/enforce/index.ts:199`); STORY-002-09 makes `update` remove them, so this text lands after it.
- **R13 — Invariants.** (a) Every command, flag and section the text names exists when this story merges, so `test/templates.test.ts:113` stays clean; no `##` section is added to WIKI.md. (b) SETUP.md names, in code spans outside the step-4 table, only `wikeeper` commands of the SPRINT-02 list (`test/templates/setup.red.node.test.ts:196`). (c) Each sub-agent's instruction text stays identical across Claude, Antigravity and Codex (STORY-006-05 R6), with no `\`, `"""` or `{{model}}` in it, and the writer keeps "After wikeeper ingest finish exits 0, change nothing under .wiki/pages" (`walkthrough-fixes.red.node.test.ts` C3). (d) `templates/agent-block.md` is not touched; its 14-line cap (CR-002) holds. (e) WIKI.md stays at most 400 lines. (f) Every SPRINT-02 red test stays green, except STORY-006-11 R6 (e). (g) Plain, direct English: one rule per sentence, no new jargon.

### 1.3 Out of Scope
- The rules, permissions and search text (whitelist format, approvals, `ai`-mode prompts, kb line format, `--no-miss`, `--mark`, the proposal kind and changelog form): STORY-006-10, which lands first.
- Text for `read`, `lint` beyond R2's sentence, `status`, `rules record` / `rules list`, `ingest facts --dry-run`, and the WIKI.md section "Lint and status" with its `unlogged-change` row: STORY-006-09, which lands next.
- The CLI behaviour these texts describe: the dropped-fact refusal (STORY-003-12), `unlogged-change` (STORY-005-03), `update` with `enforce: false` (STORY-002-09).
- Walkthrough rows CR-003 does not carry: 3.2d, 7.7, the `as_of` fallback for undated sources (11.10, 11.11).
- The structural-test extensions: STORY-006-11.

### 1.4 Open Questions

CR-003's five decisions and the brief's design calls are settled and not reopened here.

- **Question:** Q1. CR-003 E10b asks SETUP.md to say how to turn `enforce` off, but today `wikeeper update` with `enforce: false` keeps wikeeper's hook and rules for every configured agent (`src/agents/enforce/index.ts:199`). What does SETUP.md say?
- **Recommended:** STORY-002-09 makes `update` remove them; SETUP.md then names the two steps (R12).
- **Decision:** `update` with `enforce: false` removes wikeeper's hook and rules from each agent's settings (owner STORY-002-09); SETUP.md says "set `enforce: false` in `.wiki/config.yml` and run `wikeeper update`" — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q2. CR-003 E9 says extra preferences go "under an `## Other` section" of `me.md`. A literal `## Other` line in the template fails the SPRINT-02 schema check (`test/templates/onboarding.red.node.test.ts:47`). Where does the rule live?
- **Recommended:** In the template's single-line guidance comment and ONBOARDING.md step 4 (R10).
- **Decision:** The rule lives in the template's guidance comment, not as a literal `## Other` heading — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q3. Does a fact line corrected in place (a date or a word fixed) count as dropped, so the writer text must say "add a new line, keep the old"?
- **Recommended:** Yes (R4), as STORY-003-12 R1 builds it.
- **Decision:** `finish` treats a fact line corrected in place as dropped: the writer adds the new line and keeps the old one; deleting a whole page stays allowed, and the check is per updated page — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q4. R11 changes the ONBOARDING step-2 string that `test/templates/onboarding.red.node.test.ts:145` pins. May this story's QA-Red apply STORY-006-11 R6 (e)?
- **Recommended:** Yes; this story is the one whose text needs it.
- **Decision:** Authorised as recommended: the QA-Red step of the story that first needs a re-scope makes it; this story applies R6 (e), and STORY-006-11 verifies it — _approved (human, 2026-10-17, Gate 1)_

### 1.5 Risks

- **Risk:** The text states CLI behaviour other stories ship: the dropped-fact refusal and its message (003-12), the `unlogged-change` id (005-03), `update` removing the enforce entries (002-09).
- **Mitigation:** All three are predecessors. §2.1 runs the refusal and the recovery the text prescribes, and the `enforce: false` update, against the CLI in a temp wiki, so a drift fails this story's test.
- **Risk:** SPRINT-02 red tests pin exact phrases in the files this story edits (wiki-protocol, walkthrough-fixes, skills-subagents, onboarding).
- **Mitigation:** §1.2 names every pinned phrase and test line it must keep; the only intended break is STORY-006-11 R6 (e), applied by this story's QA-Red; `npm test` runs in full before commit.
- **Risk:** Reordering the example facts (R6) or the new writer rule (R4) could be read as permission to move fact lines between pages.
- **Mitigation:** R4 says moving a line within the page is fine and moving it to another page is not, matching STORY-003-12 R2.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | Text only. The one CLI flow it exercises (refused, restored, finished) is STORY-003-12's, checked here as a rule. |
| Interfaces | T | The delegation and fact-line rules reach the agent through WIKI.md, the `wiki-ingest` skill and the sub-agent prompts of three agents; the `enforce` text through SETUP.md and `wikeeper update`. |
| Data | T | One row per item and file part. |
| Rules | T | Fact lines are kept and corrected by a new line, as `finish` enforces; the example facts are in date order; `me.md` keeps its schema. |

```gherkin
Feature: CR-003 writing, answering and onboarding text

  @data
  Scenario Outline: Each walkthrough item lands in its file and part
    Given the templates tree after this story
    Then <part> of <file> contains <phrases>

    Examples:
      | item       | file                             | part                          | phrases                                                                     |
      | E1 (R1)    | templates/system/WIKI.md         | section "Answering questions" | ".wiki/project.md", "uncited", "cited page wins"                            |
      | E2 (R2)    | templates/system/WIKI.md         | section "Write phase"         | "wikeeper lint", "`unlogged-change` finding", "shell write"                 |
      | E3 (R3)    | templates/system/WIKI.md         | section "Write phase"         | "not sources", "only when a fact carries it"                                |
      | B1 (R4)    | templates/system/WIKI.md         | section "Write phase"         | "fact lines dropped", "new dated line", "exactly as it was"                 |
      | E5 (R5)    | templates/system/WIKI.md         | section "Write phase"         | "wikeeper ingest start -", "correction", "change nothing under `pages/`"    |
      | E4 (R6)    | templates/system/WIKI.md         | section "Page format"         | "oldest first"                                                              |
      | E7 (R8)    | templates/system/WIKI.md         | section "Triage and extract"  | "initiatives/initiative-005.md", "slug"                                     |
      | E8 (R9)    | templates/system/WIKI.md         | section "Triage and extract"  | "read … for the rest", "decides"                                            |
      | E9a (R10)  | templates/system/templates/me.md | its guidance comment          | "## Other"                                                                  |
      | E9a (R10)  | templates/system/ONBOARDING.md   | step 4                        | "## Other"                                                                  |
      | E10a (R11) | templates/system/ONBOARDING.md   | step 2                        | "`.wiki/system/WIKI.md`, section \"Proposing rule changes\""                |
      | E10b (R12) | templates/system/SETUP.md        | step 4                        | "enforce: false", "wikeeper update"                                         |

  @rules
  Scenario: The fact-line rules are what finish enforces
    Given WIKI.md section "Write phase" and the wiki-writer prompts of claude, antigravity and codex
    Then each says to add a new dated line and keep the old one, and the section names "fact lines dropped"
    Given a temp wiki where a finished ingest wrote "projects/atlas.md" with three fact lines, and a second ingest is applied
    When the writer changes the date of one of those lines in place and runs "wikeeper ingest finish <id> --json"
    Then it exits 1 with code "validation_failed", details.dropped names that line, and the write lock is still held
    When the writer puts the line back exactly as it was, adds the corrected fact as a new dated line, moves the lines into date order, and runs finish again
    Then it exits 0

  @interfaces
  Scenario: The skill, the sub-agents and SETUP.md agree with WIKI.md and the CLI
    Given the wiki-ingest skill, WIKI.md section "Delegation", and the wiki-extractor and wiki-writer prompts of claude, antigravity and codex
    Then for each row of the "Delegation" table the skill names the same actors for that case, and it no longer says "Every write phase"
    And every extractor's return line names a source that only points to another file
    And the shared-text check of test/templates/skills-subagents.red.node.test.ts S3 passes
    Given a temp wiki made with "wikeeper init --yes --enforce --agents claude,codex" and then set to ingest.permission ai with "wikeeper update"
    When I set "enforce: false" in .wiki/config.yml and run "wikeeper update", as SETUP.md step 4 says
    Then the install manifest records no hook or rule entry, "wikeeper doctor" prints "enforce: off", and no agent settings file that still exists holds a wikeeper hook or rule

  @rules
  Scenario: Examples and templates keep their shape
    Given the templates tree after this story
    Then the facts of WIKI.md's single-entity example are in date order, oldest first, and the example still parses with decided, tentative and contradiction facts
    And templates/system/templates/me.md has at most 15 lines, passes checkMeSchema and has "## Other" only inside its comment
    And the structural checks of test/templates/structure.ts report no finding, so ONBOARDING.md step 2's section reference resolves
    And WIKI.md has at most 400 lines and no new "##" heading, and templates/agent-block.md is unchanged
    And every SPRINT-02 red test under test/templates/ passes, with only the edit of STORY-006-11 R6 (e)

  Scenario: Error — example facts out of date order are caught
    Given a copy of WIKI.md whose single-entity example lists its fact lines in the SPRINT-02 order (2026-10-15, 2026-09-30, 2026-10-14)
    When the date-order check runs on the copy
    Then it fails naming the line of "2026-09-30", the first fact older than the line above it
```

### 2.2 Verification Steps (Manual)
- [ ] Part-3 walkthrough in `~/Documents/Dev/formapass_management`: ingest a doc_processor initiatives folder that holds a pointer stub; check the agent reports the stub instead of extracting it (R9) and names initiative pages by id (R8).
- [ ] Ingest a Formapass sales or marketing update whose facts are older than lines already on a page; check the new lines sit in date order (R6) and carry no alias the facts lack (R3).
- [ ] After a finished ingest, tell the agent one Formapass fact was wrong; check it runs a chat-excerpt ingest, adds the corrected line, keeps the old one, and `finish` passes (R4, R5).
- [ ] Ask a positioning question that only `.wiki/project.md` answers; check the answer is labelled as uncited context from the project brief (R1).
- [ ] In a scratch clone with `enforce` on, follow SETUP.md step 4 to turn it off; check `wikeeper doctor` no longer reports enforce entries (R12).

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `templates/system/WIKI.md` |
| Related Files | `templates/system/SETUP.md`, `templates/system/ONBOARDING.md`, `templates/system/templates/me.md`, `templates/skills/wiki-ingest/SKILL.md`, `templates/agents/claude/wiki-extractor.md`, `templates/agents/claude/wiki-writer.md`, `templates/agents/antigravity/wiki-extractor.md`, `templates/agents/antigravity/wiki-writer.md`, `templates/agents/codex/wiki-extractor.toml`, `templates/agents/codex/wiki-writer.toml` |
| Test Files | `test/templates/writing-and-answering-text.red.node.test.ts` (QA-Red) |
| Re-scoped SPRINT-02 red test (STORY-006-11 R6 (e), applied by this story's QA-Red) | `test/templates/onboarding.red.node.test.ts` |
| New Files Needed | Yes — `test/templates/writing-and-answering-text.red.node.test.ts` |

### 3.2 Technical Logic
- Start from WIKI.md, SETUP.md and the sub-agent files as STORY-006-10 leaves them. Edit in WIKI.md order: "Triage and extract" steps 3 and the pointer rule (R8, R9), "Write phase" steps 2, 5, 6, 8 and the closing paragraph (R2–R5), "Page format" (R6), "Answering questions" (R1). Then SETUP.md step 4 (R12), ONBOARDING.md steps 2 and 4 and the `me.md` comment (R10, R11), the skill (R7), and the six sub-agent files (R4, R9).
- Keep the step numbers of "Write phase": R4's rule joins step 6 instead of adding a step, because STORY-006-09 R5 and other text cite steps 8 and 9.
- Sub-agents: change the Claude file first, then copy the instruction text verbatim into the Antigravity body and the Codex `developer_instructions` block (flashcard 2026-10-17 `#codex #toml #templates`: no `\`, no `"""`, no `{{model}}`; flashcard `#templates #subagents`: the writer text stays identical in all three).
- The QA-Red test splits sections as `test/templates/wiki-protocol.red.node.test.ts:43` and SETUP steps as `test/templates/setup.red.node.test.ts:40` do. The date-order check reads the first `md` fence of "Page format" with `parsePage` (`src/wiki/parse-page.ts:203`, arguments `(text, relPath)`, flashcard `#qa #templates`) and compares consecutive fact dates. The two live scenarios run in-process with `runCli` in a temp git repo (as `doctorCheckIds`, `test/templates/structure.ts:202`, does); the `finish` one writes pages with `writeFile`, as STORY-003-12's tests do.
- QA-Red applies STORY-006-11 R6 (e) exactly and lists it in its commit message.
- No code changes.

### 3.3 API Contract (if applicable)

Not applicable — template text. Consumes read-only: the `finish` refusal and `details.dropped` (K11, STORY-003-12), the `unlogged-change` id (K3, STORY-005-03), `update` with `enforce: false` (STORY-002-09), `parsePage` (frozen in SPRINT-02).

## Task Breakdown

- [ ] QA-Red: apply STORY-006-11 R6 (e) to `test/templates/onboarding.red.node.test.ts` -> R13
- [ ] QA-Red: write `test/templates/writing-and-answering-text.red.node.test.ts` from the five scenarios in §2.1 -> R1–R12
- [ ] Write "Triage and extract" step 3 and the pointer-source rule -> R8, R9
- [ ] Write the "Write phase" changes (steps 2, 5, 6, 8 and the closing paragraph) -> R2, R3, R4, R5
- [ ] Reorder the example facts and add the order rule in "Page format"; write the "Answering questions" paragraph -> R1, R6
- [ ] Update the three writers and three extractors with identical text -> R4, R9
- [ ] Rewrite the skill's "Who does what" -> R7
- [ ] Update ONBOARDING.md steps 2 and 4, the `me.md` comment and SETUP.md step 4 -> R10, R11, R12
- [ ] Run `npm test` in full; check `test/templates.test.ts` reports no finding -> R13

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 1 | The date-order check on a page's fact lines (passing and failing input) |
| Integration tests | 2 | The `finish` refusal and recovery, and `update` with `enforce: false`, each run in-process against a temp git repo |
| E2E / acceptance tests | 16 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately (12 + 1 + 1 + 1 + 1) |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `npm test` passes in full, with no SPRINT-02 red test changed beyond STORY-006-11 R6 (e).
- [ ] `test/templates.test.ts` reports no finding on the merged tree.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/system/WIKI.md:29` — "Triage and extract" (`:33` step 3); `:36` "Write phase" (`:41` step 2, `:44` step 5, `:45` step 6, `:47` step 8, `:50` the closing paragraph); `:106` "Page format" (`:111` Facts, `:136–138` the example facts); `:168` "Delegation"; `:202` "Answering questions".
- **Surface:** `templates/system/SETUP.md:57` — the `enforce` sentence of step 4.
- **Surface:** `templates/system/ONBOARDING.md:19` — the step-2 code span; `:32` — step 4; `templates/system/templates/me.md:4` — the guidance comment.
- **Surface:** `templates/skills/wiki-ingest/SKILL.md:12` — "Who does what", stricter than WIKI.md.
- **Surface:** `templates/agents/claude/wiki-writer.md:11` — the writer rules, `:24` step 7; `templates/agents/claude/wiki-extractor.md:22` — the return line (same text in the Antigravity and Codex files).
- **Surface:** `src/ingest/validate.ts:35` — `validateIngest`, where STORY-003-12 adds the dropped-fact check this text describes.
- **Surface:** `src/agents/enforce/index.ts:199` — `update` keeps enforce entries when `enforce` is false today (R12).
- **Surface:** `test/templates/onboarding.red.node.test.ts:145` — the exact step-2 string; `:47` — `checkMeSchema`.
- **Coverage of this requirement:** partial — every file exists and holds the SPRINT-02 text; the items add or correct sentences in place.

## Prior work

- [[CR-003]] (E1–E10, Open Question 2), [[CR-002]] (D1 shell-write backstop, 14-line cap), [[EPIC-006]] (parent, archived), [[STORY-006-10]] (the other half of the split; lands first), [[STORY-003-12]] (the dropped-fact refusal and its text hand-off), [[STORY-002-09]] (`update` with `enforce: false`), [[STORY-005-09]] (the last step-4 table edit before this story's SETUP.md text), [[STORY-005-03]] (`unlogged-change`), [[STORY-006-04]] (WIKI.md and its red tests), [[STORY-006-05]] (skills and sub-agents, shared writer text), [[STORY-006-07]] (ONBOARDING.md, `me.md` schema check), [[STORY-006-02]] (SETUP.md). Wiki index and `.cleargate/FLASHCARD.md` checked 2026-10-17: no existing story carries these items.

## Why not simpler?

- **Smallest existing surface that could carry this:** the existing sentences in the eleven templates listed in §3.1; every item edits or adds a sentence in place.
- **Why isn't extension / parameterization / config sufficient?** The gaps are in what the instructions say, not in what the CLI does, so only text closes them. The two claims that depend on new CLI behaviour (what `finish` refuses, what `update` removes with `enforce: false`) are run against the CLI in §2.1, so they cannot drift.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding.
- [x] No "TBDs" exist anywhere in the specification or technical logic. (None; the §1.4 decisions were approved at Gate 1 on 2026-10-17.)
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
