---
story_id: STORY-006-11
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
ambiguity: 🟡 Medium
context_source: "EPIC-006 §1 success metric (every command the content mentions exists in wikeeper --help) and §5 · STORY-006-06 (structural checks R1–R9, test/templates/structure.ts) · SPRINT-03 decomposition brief (commands and flags at the end of SPRINT-03; contracts K1, K2, K4–K9; shared files: 006-11 last; the SPRINT-02 red test re-scope needs the human's authorisation) · CR-002 (14-line cap) · flashcard 2026-10-17 #enforce #qa (the story that breaks a red test re-scopes it in its QA-Red) · verified test/templates/structure.ts, test/templates.test.ts, test/templates.red.node.test.ts, test/templates/{wiki-protocol,setup,onboarding,profile}.red.node.test.ts, src/program.ts, src/agents/enforce/{claude,codex}.ts"
actor: Maintainer changing wikeeper's templates or commands
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-001-10
  - STORY-002-09
  - STORY-003-10
  - STORY-003-11
  - STORY-003-12
  - STORY-004-07
  - STORY-005-01
  - STORY-005-02
  - STORY-005-03
  - STORY-005-04
  - STORY-005-05
  - STORY-005-06
  - STORY-005-07
  - STORY-006-09
  - STORY-006-10
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T09:05:51Z
updated_at: 2026-10-17T09:05:51Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:15:32Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-006-11
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T09:15:31Z
  sessions: []
---

# STORY-006-11: Structural template tests for the SPRINT-03 commands
**Complexity:** L2 — three new checks in `test/templates/structure.ts`, their unit tests in `test/templates.test.ts`, and five authorised edits to SPRINT-02 red tests that SPRINT-03 makes obsolete. It integrates last, after every command and text story.

## 1. The Spec (The Contract)

### 1.1 User Story
As a maintainer, I want the structural template tests to know the SPRINT-03 commands and flags, to fail when the instructions leave one of them undocumented or name a lint check that does not exist, and to stop enforcing the SPRINT-02 vocabulary that SPRINT-03 replaces, so that the templates and the CLI keep agreeing as `read`, `lint`, `status` and `rules` land.

### 1.2 Detailed Requirements

- **R1 — Commands and flags exist (STORY-006-06 R1, R2, extended).** `checkCommands` (`test/templates/structure.ts:179`) keeps resolving every `wikeeper …` reference in the templates, in `GUARD_REASON` and in the enforce writers' entries for `ai`, `ask` and `whitelist` against `createProgram()` (`src/program.ts:45`). It now also covers the `read` allow rule (K7) and the `ingest abort … --drop` and `ingest apply … --force-unlock` prompt rules (K9), through `enforceSources()` (`:135`) unchanged. Unit tests in `test/templates.test.ts` pin the SPRINT-03 surface in the command tree (`commandTree()`, `:45`): commands `read`, `lint`, `status` and `rules`, with `rules` subcommands `record` and `list`; `search` options `--no-miss` (commander keeps the long name of a negated option, K8) and `--mark`; `lint` options `--rules` and `--check`; `read` option `--out`; `ingest facts` option `--dry-run`; `rules record` options `--accepted`, `--rejected`, `--kind`, `--summary` and `--from`.
- **R2 — Documented forms (new `checkCoverage`).** `structure.ts` exports `DOCUMENTED_FORMS`, the command forms the templates must name at least once, and `checkCoverage(dir)`, which reports each form that no reference in any template matches (same words, and the flag among the reference's flags). SPRINT-03 forms: `read --out`, `lint`, `lint --rules`, `lint --check`, `status`, `rules list`, `rules record --accepted`, `rules record --rejected`, `rules record --kind`, `rules record --summary`, `rules record --from`, `ingest facts --dry-run`, `search --no-miss`, `search --mark`. Finding: `"wikeeper <form>" is named by no template`, with file `templates/` and line 0. Later sprints append to the list.
- **R3 — Lint check ids (new `checkLintIds`; contract K2).** (a) Every `lint --check <id>` (also after `--rules`) in a command unit names an id in `PAGE_CHECKS` or `RULE_CHECKS` (`src/lint/checks.ts`), and every `` `<id>` finding `` in any template line names such an id or a doctor check id from `doctorCheckIds()` (`:202`; SETUP.md already writes "each `setup-files` finding", `templates/system/SETUP.md:70`); otherwise a finding `check "<id>" is not registered in lint or doctor`. (b) The first table under WIKI.md `## Lint and status` (STORY-006-09 R3) has exactly one row per `PAGE_CHECKS` id, its first cell the id in a code span: a missing id gives `finding table: no row for "<id>"`, an extra one `finding table: "<id>" is not a page check`. The ids are read from the registry at run time; the test names none.
- **R4 — kb seeds parse (new `checkKbSeeds`; contract K1).** Every template named `kb_instructions.<profile>.md` (today `templates/kb_instructions.management.md`) parses with `parseInstructions` (`src/kb/parse-instructions.ts`) with an empty `issues` list; each issue becomes a finding with its line and code. A freshly seeded wiki therefore gives `wikeeper lint --rules` no format issue.
- **R5 — One entry point, unchanged signature.** `runAllChecks(dir, doctorIds)` (`:453`) runs the three new checks after the existing eight, passing `doctorIds` on to `checkLintIds`. Its signature stays, so `test/templates.red.node.test.ts` (STORY-006-06's red file) passes unchanged, and the real-tree test (`test/templates.test.ts:113`) still expects no finding. Each new check takes the templates directory, walks the whole tree, and reports `file:line — message` (STORY-006-06 R9).
- **R6 — Re-scope of the obsolete SPRINT-02 red tests (needs the human's authorisation, §1.4 Q1).** These assertions encode "SPRINT-03 commands do not exist yet" or SPRINT-02 text that CR-003 changes. Exactly these edits, nothing else in those files:
  - **(a)** `test/templates/wiki-protocol.red.node.test.ts:26`: `COMMANDS` gains `read`, `lint`, `status` and `rules`; the comment at `:74` and the describe title at `:141` say SPRINT-03 instead of SPRINT-02. Needed by STORY-006-10 (its text names `wikeeper lint`).
  - **(b)** `test/templates/wiki-protocol.red.node.test.ts:242–248`, S5: the appended line becomes "Run `wikeeper publish` after every ingest." and the expectation `[{ ref: "wikeeper publish", line: n }]`; the describe title says a command that does not exist fails the vocabulary check. The bad-ingest-verb test (`:250–252`) is unchanged. Needed with (a), since `wikeeper lint` becomes valid.
  - **(c)** `test/templates/wiki-protocol.red.node.test.ts:11–25`: `SECTIONS` gains "Lint and status" between "Proposing rule changes" and "Log and index"; the title at `:131` says fourteen. Needed by STORY-006-09 R2.
  - **(d)** `test/templates/setup.red.node.test.ts:203`: the allowed command list gains `read` and `lint`; the title at `:196` says SPRINT-03. Needed by STORY-006-09 R8.
  - **(e)** `test/templates/onboarding.red.node.test.ts:145`: the step-2 reference may carry a closing backtick after the file name, `` `.wiki/system/WIKI.md`, section "Proposing rule changes" ``. Needed by STORY-006-10 R18.
  
  The edits are applied by the QA-Red step of the story named in each item (§1.4 Q2). This story checks at the end that all five are in place and that the three files pass.
- **R7 — Nothing else in SPRINT-02 tests changes.** `test/templates/profile.red.node.test.ts`, `skills-subagents.red.node.test.ts`, `walkthrough-fixes.red.node.test.ts` and the rest of the three files above pass unchanged on the merged tree.

### 1.3 Out of Scope
- Content checks the text stories own: STORY-006-10's walkthrough-item and whitelist checks, STORY-006-09's section and decision checks.
- Checking flag semantics, or that a flag's documented value is valid (only existence, as STORY-006-06).
- Accepting `note:` lines under `## Source kinds` in `checkParsers` (`:404`): no template has one (STORY-006-10 R3 keeps the profile and seed to kind rules and single-line comments), so the check stays as it is.
- The SETUP.md step 4 preview table: `test/templates/setup.red.node.test.ts` S2 already compares it with the enforce writers at run time; STORY-002-09 and STORY-003-10 update the table.

### 1.4 Open Questions

- **Question:** Q1. Authorise the five edits to SPRINT-02 red tests in R6 (a)–(e)? They change assertions written to fail on SPRINT-03 commands (`wikeeper lint` in S5), to pin the SPRINT-02 section and command lists, and to pin ONBOARDING's old code span.
- **Recommended:** Authorise. Each edit replaces a SPRINT-02 assumption with its SPRINT-03 equivalent and keeps the test's purpose: S5 still proves an unknown command fails, with `wikeeper publish`; the section and command lists still pin the exact sets. No assertion is deleted.
- **Human decision:** {populated during Brief review}

- **Question:** Q2. The edits must be in place before the text that needs them merges, but this story runs last; STORY-006-10 would merge with `wiki-protocol.red.node.test.ts` S2 failing. Who applies them?
- **Recommended:** The QA-Red step of the story whose text first needs each edit: STORY-006-10 applies (a), (b) and (e); STORY-006-09 applies (c) and (d); each lists the files in its §3.1. This story owns the authorisation and verifies the result. Same pattern as STORY-006-02's QA-Red re-scoping `test/template-loader.red.node.test.ts` once for SPRINT-02, and flashcard 2026-10-17 `#enforce #qa`. If STORY-006-10 is split (its §1.4 Q1), the edits follow the half that carries the text.
- **Human decision:** {populated during Brief review}

### 1.5 Risks

- **Risk:** A late rename in any SPRINT-03 command story fails this story, not the story that renamed it.
- **Mitigation:** That is the purpose; findings name the template, the line and the token. The text stories build against contracts K1–K11.
- **Risk:** `checkCoverage` turns a template edit that drops the last mention of a form into a failure.
- **Mitigation:** Intended: a SPRINT-03 command with no instruction is a gap. The finding names the form, so the fix is one sentence in WIKI.md.
- **Risk:** The registry's ids change after STORY-006-09 writes the finding table.
- **Mitigation:** R3 (b) reads `PAGE_CHECKS` at run time and names the missing or extra id.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One check run over one tree; there is no alternative successful flow. |
| Interfaces | T | References come from three surfaces: template files, `GUARD_REASON` and the enforce writers' entries. |
| Data | T | One row per SPRINT-03 form; one finding row per page check; one seed per profile. |
| Rules | T | Commands, flags, coverage, lint ids, seed parsing and the re-scoped red tests each have a rule, broken in the error outline. |

```gherkin
Feature: Structural template tests for the SPRINT-03 commands

  @rules @interfaces
  Scenario: Every referenced command and flag exists, SPRINT-03 included
    Given every file under templates/, GUARD_REASON and the enforce writers' entries for ai, ask and whitelist
    When checkCommands runs on the merged tree
    Then it reports no finding
    And the command tree has "read", "lint", "status" and "rules", and "rules" has the subcommands "record" and "list"
    And "search" has "--no-miss" and "--mark", "lint" has "--rules" and "--check", "read" has "--out", "ingest facts" has "--dry-run"
    And "rules record" has "--accepted", "--rejected", "--kind", "--summary" and "--from"
    And the ai-mode Claude entries include a rule naming "wikeeper read" that resolves

  @data
  Scenario Outline: Each SPRINT-03 form is named by at least one template
    Given DOCUMENTED_FORMS in test/templates/structure.ts
    Then it contains "<form>"
    And checkCoverage on the merged tree reports nothing for "<form>"

    Examples:
      | form                    |
      | read --out              |
      | lint                    |
      | lint --rules            |
      | lint --check            |
      | status                  |
      | rules list              |
      | rules record --accepted |
      | rules record --rejected |
      | rules record --kind     |
      | rules record --summary  |
      | rules record --from     |
      | ingest facts --dry-run  |
      | search --no-miss        |
      | search --mark           |

  @rules
  Scenario: Lint ids are registered, the finding table matches the registry, and the seed parses
    Given the merged templates tree and the lint registry
    Then every "lint --check <id>" in the templates names an id of PAGE_CHECKS or RULE_CHECKS
    And every "`<id>` finding" names such an id or a doctor check id, so "`setup-files` finding" in SETUP.md passes
    And the finding table in WIKI.md section "Lint and status" has exactly one row per PAGE_CHECKS id
    And templates/kb_instructions.management.md parses with parseInstructions with no issues
    And runAllChecks reports no finding, and test/templates.red.node.test.ts passes unchanged

  @rules
  Scenario: The obsolete SPRINT-02 red tests are re-scoped, not deleted
    Given the edits R6 (a) to (e), authorised by the human
    Then wiki-protocol.red.node.test.ts accepts "read", "lint", "status" and "rules", and its S5 fails a copy of WIKI.md that names "wikeeper publish"
    And its section list includes "Lint and status" before "Log and index"
    And setup.red.node.test.ts accepts "read" and "lint" outside the preview table
    And onboarding.red.node.test.ts accepts the code span "`.wiki/system/WIKI.md`" before section "Proposing rule changes"
    And these three files, profile.red.node.test.ts, skills-subagents.red.node.test.ts and walkthrough-fixes.red.node.test.ts all pass on the merged tree

  Scenario Outline: Error — a broken SPRINT-03 reference fails naming the template
    Given a copy of the templates directory where templates/system/SETUP.md contains <reference>
    When the structural checks run on the copy
    Then they fail with a finding naming "system/SETUP.md", its line and <named>

    Examples:
      | reference                                 | named                       |
      | "`wikeeper lint --fix`"                   | "\"--fix\" is not an option of \"lint\"" |
      | "`wikeeper rules delete`"                 | "rules delete"              |
      | "`wikeeper lint --check no-such-check`"   | "no-such-check"             |
      | "`wikeeper status --all`"                 | "--all"                     |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch copy of the templates, delete the only `--dry-run` mention in WIKI.md, run `npx vitest run test/templates.test.ts`, and read the coverage finding.
- [ ] Rename a page check id in a scratch branch of `src/lint/checks.ts` and confirm the finding names the table row and the id.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `test/templates/structure.ts` |
| Related Files | `test/templates.test.ts` |
| Re-scoped SPRINT-02 red tests (R6; applied per §1.4 Q2, verified here) | `test/templates/wiki-protocol.red.node.test.ts`, `test/templates/setup.red.node.test.ts`, `test/templates/onboarding.red.node.test.ts` |
| New Files Needed | No |

### 3.2 Technical Logic
- `checkCoverage`: reuse `extractCommandRefs` (`test/templates/structure.ts:121`) over every template file; a form `"<w1> [w2] [--flag]"` is met when a reference has the same words and, if the form has a flag, that flag in `flags`. Templates only: `GUARD_REASON` and enforce entries are not documentation.
- `checkLintIds`: one regex over command units for `lint(?:\s+--rules)?\s+--check\s+([a-z][a-z0-9-]*)`, one over lines for `` `([a-z][a-z0-9-]*)` finding ``; the table reader splits WIKI.md on `## ` headings outside fences (as `headings()`, `:264`, does), takes the first table under "Lint and status" and reads each row's first cell. Import `PAGE_CHECKS` and `RULE_CHECKS` statically; doctor ids come from the `doctorIds` argument, so no extra temp install is needed.
- `checkKbSeeds`: `listTemplateFiles` (`src/core/templates.ts`) filtered to `^kb_instructions\.[a-z0-9-]+\.md$`; `parseInstructions(text).issues` mapped to findings.
- `runAllChecks` appends the three checks; `test/templates.test.ts` adds the unit tests of §4.1 and the error outline rows, built like its copy-mutation test (`test/templates.test.ts:100`).
- R6 edits follow §1.2 exactly; a diff of each file against `main` shows only those lines.

### 3.3 API Contract (if applicable)

Not applicable — test code only. New exports of `test/templates/structure.ts`: `DOCUMENTED_FORMS: readonly string[]`, `checkCoverage(dir: string): Promise<Finding[]>`, `checkLintIds(dir: string, doctorIds: readonly string[]): Promise<Finding[]>`, `checkKbSeeds(dir: string): Promise<Finding[]>`. Consumes `createProgram`, `PAGE_CHECKS`, `RULE_CHECKS` (K2) and `parseInstructions` (K1) read-only.

## Task Breakdown

- [ ] Confirm R6 (a)–(e) are in place, as applied by STORY-006-10 and STORY-006-09, and that the three files pass -> R6
- [ ] Add the SPRINT-03 command-tree unit tests -> R1
- [ ] Add `DOCUMENTED_FORMS` and `checkCoverage`, with a unit test on a template copy that lacks one form -> R2
- [ ] Add `checkLintIds` and its table reader, with unit tests for both id forms and the table -> R3
- [ ] Add `checkKbSeeds`, with a unit test on a seed copy carrying a malformed question -> R4
- [ ] Wire the three checks into `runAllChecks`; add the error outline rows -> R5
- [ ] Run `npm test` on the integrated sprint branch -> R5, R7

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 5 | SPRINT-03 command tree; `checkCoverage` on a copy missing a form; lint-id extraction (both forms); finding-table reader; `checkKbSeeds` on a broken seed copy |
| Integration tests | 0 | Everything runs in-process over the templates tree; no external service |
| E2E / acceptance tests | 21 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately (1 + 14 + 1 + 1 + 4) |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The human's authorisation of R6 is recorded in §1.4 Q1 before any of its edits lands.
- [ ] `npm test` passes on the integrated sprint branch with every SPRINT-03 story merged, on Linux, macOS and Windows.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `test/templates/structure.ts:45` — `commandTree()`; `:121` — `extractCommandRefs`; `:135` — `enforceSources()`; `:179` — `checkCommands`; `:189` — `checkDoctorIds`; `:453` — `runAllChecks`.
- **Surface:** `test/templates.test.ts:113` — the real-tree test that expects no finding; `:100` — the copy-mutation pattern the error outline reuses.
- **Surface:** `test/templates/wiki-protocol.red.node.test.ts:26` — `COMMANDS`; `:242` — S5, which asserts `wikeeper lint` fails; `:11` — `SECTIONS`.
- **Surface:** `test/templates/setup.red.node.test.ts:203` — the SPRINT-02 command list for SETUP.md.
- **Surface:** `test/templates/onboarding.red.node.test.ts:145` — the exact step-2 reference string.
- **Surface:** `src/program.ts:33` — `defaultCommands`, where `read`, `lint`, `status` and `rules` register.
- **Coverage of this requirement:** partial — the generic command and flag check already resolves any registered command; coverage, lint ids and seed parsing are new, and the re-scope edits replace SPRINT-02 assumptions.

## Prior work

- [[STORY-006-06]] (the structural checks this story extends), [[EPIC-006]] (parent, archived; success metric), [[STORY-006-04]] (the WIKI.md red tests, S5), [[STORY-006-02]] (SETUP.md red tests; precedent of a QA-Red re-scope), [[STORY-006-07]] (ONBOARDING.md red tests), [[CR-002]] (14-line cap, one vocabulary), [[CR-003]], [[EPIC-005]] (lint registry, K1 parser). Wiki index and `.cleargate/FLASHCARD.md` checked 2026-10-17: no other story extends these checks.

## Why not simpler?

- **Smallest existing surface that could carry this:** `test/templates/structure.ts` — the three checks join its existing eight behind `runAllChecks`.
- **Why isn't extension / parameterization / config sufficient?** The existing check proves that what the templates name exists, not that what exists is named, and it does not know lint check ids or the K1 parser. Leaving the SPRINT-02 red tests as they are would fail the sprint on correct text; deleting them would lose the vocabulary and section pins, so they are re-scoped.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding.
- [ ] No "TBDs" exist anywhere in the specification or technical logic. (No TBD markers, but R6 waits for the authorisation in §1.4 Q1 and its timing in Q2.)
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
