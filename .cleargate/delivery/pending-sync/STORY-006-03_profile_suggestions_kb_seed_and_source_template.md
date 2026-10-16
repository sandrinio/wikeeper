---
story_id: STORY-006-03
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-006 (approved 2026-10-16) · SPRINT-02 decomposition contract 13 (human decision 2026-10-16 — no fixed pages; the profile only suggests) and contracts 1, 2, 12 · architecture.md §5.2, §8, D-03, D-27, D-31 · verified src/commands/init.ts, src/core/gitignore.ts, templates/kb_instructions.management.md
actor: AI coding agent drafting a wiki's capture rules with its user and writing source pages
complexity_label: L2
parallel_eligible: y
dep_predecessors:
  - STORY-004-01
  - STORY-003-02
  - STORY-006-02
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T20:46:34Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 3
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T20:47:57Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: d7af579d1889ab374d72ffa42371b3c993a2040997f474d0df267c7b22467a91
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: claude-opus-5-5
  last_stamp: 2026-10-16T19:20:07Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-16T18:00:29Z
---

# STORY-006-03: Profile suggestions, `kb_instructions.md` seed and the source page template
**Complexity:** L2 — template content only (a profile of suggestions, a seed with general defaults, one page template) plus one test file. Its tests use STORY-004-01's `parsePage` and STORY-003-02's `parseSourceKinds`, so the content cannot drift from the formats the CLI reads.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent setting up a wiki with its user, I want a profile of suggested questions, entity types and source kinds, a capture-rules seed that holds only general defaults, and one source page template, so that I draft rules that fit this user's project rather than a fixed page set, and every source page I write is cited and parses.

### 1.2 Detailed Requirements
- **R1 — Profile of suggestions (`templates/system/profiles/management.md`, D-13 as revised on 2026-10-16, D-31, contract 13).** Opens by saying it holds suggestions, not a structure: during SETUP.md step 3 the agent offers only what fits `.wiki/project.md` and the user's answers, the user approves what goes into `.wiki/kb_instructions.md`, and no page exists until an ingest writes it. Its `##` headings, in order: `Questions`, `Entity types`, `Source kinds`, `Never capture`, `Private pages`. It names no fixed page set and no `team.md`.
- **R2 — Suggested questions and entity types.** `Questions` holds lines `Q<n> <question>`, at least five (who owns or decides X; what was decided about X and why; what is the status of X; which risks are open and who owns them; what does term X mean). `Entity types` holds lines `<entity> <fields, comma-separated> → <suggested page> <question refs>` for `person`, `project`, `feature`, `decision`, `risk` and `term`. A suggested page with a `<…>` placeholder (`projects/<name>.md`) holds one entity per page; a fixed name (`risks.md`) holds one `##` entry per entity, and the profile says so. Every question is referenced by at least one entity line and every entity line references a question.
- **R3 — Suggested source kinds (contract 2, CR-002 C1).** Under `## Source kinds`, one line per kind in the form `<kind-id> (v1) → <targets>` for `meeting-notes`, `status-report`, `prd`, `contract`, `email-thread` and `chat-excerpt`; targets name R2 entity types or their fields (e.g. `project.status`, `decision`). Every line outside an HTML comment parses with `parseSourceKinds` (`src/ingest/kind-rules.ts`, STORY-003-02), so the agent can copy the lines that fit into the seed unchanged.
- **R4 — Privacy suggestions (EPIC-006 §3 Privacy, D-27).** `Never capture` lists compensation, health, personal life and performance judgements of individuals and tells the agent to ask the user what else to add. `Private pages` explains that `private: [...]` in `.wiki/config.yml` keeps the listed pages out of git (off by default), with a generic example (`private: [people.md]`), suggested for pages about people.
- **R5 — Seed (`templates/kb_instructions.management.md`, §5.2).** Replaces the placeholder; keeps the `purpose: management` line (no code reads it; it records the profile that seeded the file); has these headings in order: `## Questions this wiki must answer`, `## Entities`, `## Capture signals`, `## Source kinds`, `## Write policy`, `## Never capture`, `## Rule changelog`. `Questions this wiki must answer`, `Entities` and `Source kinds` each hold only a one-line HTML comment saying SETUP.md step 3 drafts them from `.wiki/project.md`, `.wiki/me.md` and the profile's suggestions; `parseSourceKinds` returns no kinds for the seed. General defaults: Capture signals — decisions, changes of owner or status, dates and deadlines, risks and open problems, new names and terms. Write policy — status and dates keep their history; the newest decided fact wins the summary; tentative facts never change the summary; every fact is cited; contradictions are flagged with both sources, never overwritten. Never capture — the four R4 items. The changelog has exactly one line, recording that the file was seeded from the management profile and that each kind starts at v1 when it is drafted.
- **R6 — Source page template (`templates/system/templates/source.md`, §8, contract 1).** The only page template the package ships; every other page follows WIKI.md, section "Page format" (STORY-006-04). Frontmatter `type: source`, `title`, `summary`, `aliases: []`, `sources: ["<source-id>"]`, `updated`; the typed link `source:: [[<source-id>]]` under the title; sections `## Summary` and `## What this source changed`. A source page written from it cites its source in both forms STORY-003-09 R3 accepts (human request, 2026-10-16). `templates/system/templates/project.md` (STORY-006-02) and `templates/system/templates/me.md` (STORY-006-07) live in the same folder but are not page templates.
- **R7 — No fake knowledge.** The profile and the template hold suggestions and `<…>` placeholders only; no file in this story contains a fact line; the seed holds no question, entity or kind line.

### 1.3 Out of Scope
- WIKI.md's page format, page shapes and write steps (STORY-006-04).
- SETUP.md and the `project.md` template (STORY-006-02); ONBOARDING.md and the `me.md` template (STORY-006-07).
- Profiles other than Management, renaming the profile id, translations (EPIC-006 §2).
- Copying templates into `pages/` — pages are created by the writer during an ingest.
- `lint --rules` checks over the seed (EPIC-005, SPRINT-03).

### 1.4 Open Questions

- None — the content follows decomposition contract 13 (human decision, 2026-10-16: no fixed pages; the profile only suggests) and contracts 1 and 2.

### 1.5 Risks

- **Risk:** With no page templates, the agent may write a multi-entry page whose entries lack `type::`, so `search --type` misses them (STORY-004-01 R8 types a section entity only from its own `type::` link).
- **Mitigation:** WIKI.md, section "Page format", documents both page shapes with a tested example of each (STORY-006-04 R9); the profile's entity lines say which suggested pages hold many entries (R2).
- **Risk:** A user who skips setup ingests with an empty seed: no questions, entities or kind rules.
- **Mitigation:** STORY-003-04 R4 and STORY-003-06 R6 accept a kind with no rule, with a warning telling the agent to propose one; WIKI.md, section "Proposing rule changes", covers it.
- **Risk:** `test/template-loader.red.node.test.ts:158` pins `listTemplateFiles("system")` to the two placeholders; the new files under `templates/system/` break it.
- **Mitigation:** STORY-006-02's QA-Red re-scopes it once for the sprint (Sprint Design Review); STORY-006-02 is upstream of this story, so QA-Verify here runs after that re-scope.
- **Risk:** Built before STORY-004-01 / 003-02 merge, the tests fail against contract stubs.
- **Mitigation:** Build against the contract skeletons; QA-Verify runs on the integrated tree.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | Static content; no alternative flows. |
| Interfaces | F | Read by the agent only; the CLI parses it through two existing functions. |
| Data | T | Six suggested source kinds, each checked by row; the source page template. |
| Rules | T | Section order, empty drafted sections, privacy defaults, question/entity coverage, no fixed pages. |

```gherkin
Feature: Profile suggestions, kb_instructions seed and source page template

  @rules
  Scenario: The seed holds general defaults and leaves the drafted sections empty
    Given templates/kb_instructions.management.md
    Then it keeps the line "purpose: management"
    And its headings are, in order, "Questions this wiki must answer", "Entities", "Capture signals", "Source kinds", "Write policy", "Never capture", "Rule changelog"
    And "Questions this wiki must answer", "Entities" and "Source kinds" each hold only an HTML comment naming "SETUP.md" step 3
    And parseSourceKinds returns no kinds for it
    And "Capture signals" names decisions, changes of owner or status, deadlines, risks and new terms
    And "Write policy" says tentative facts never change the summary and contradictions are flagged with both sources
    And "Never capture" names compensation, health, personal life and performance judgements of individuals
    And "Rule changelog" has exactly one line

  @rules
  Scenario: The profile offers suggestions that fit the project
    Given templates/system/profiles/management.md
    Then its headings are, in order, "Questions", "Entity types", "Source kinds", "Never capture", "Private pages"
    And it says to offer only what fits ".wiki/project.md" and the user's answers during SETUP.md step 3, and that no page exists until an ingest writes it
    And "Questions" has at least five "Q<n>" lines
    And "Entity types" has lines for person, project, feature, decision, risk and term, each naming a suggested page
    And every question is referenced by at least one entity line and every entity line references a question
    And "Never capture" names the four privacy defaults and "Private pages" shows "private:" with an example page
    And it does not contain "team.md"

  @data
  Scenario Outline: Every suggested source kind parses at version 1
    When parseSourceKinds reads the profile
    Then it returns kind "<kind>" with version 1 and at least one target

    Examples:
      | kind          |
      | meeting-notes |
      | status-report |
      | prd           |
      | contract      |
      | email-thread  |
      | chat-excerpt  |

  @data
  Scenario: The source page template parses and cites its source
    Given templates/system/templates/source.md
    When parsePage reads it as "sources/<source-id>.md"
    Then errors is empty and the frontmatter has type "source", title, summary, aliases, sources ["<source-id>"] and updated
    And it has the sections "Summary" and "What this source changed" and no fact lines
    And it has a "source" typed link with targets ["<source-id>"]

  Scenario: Error — a suggested source-kind line that does not parse fails
    Given a copy of the profile whose "Source kinds" section also holds the line "Meeting Notes: decisions"
    When the source-kind check runs on it
    Then it fails naming the line "Meeting Notes: decisions" and its line number
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo with a short `.wiki/project.md` for a product, follow SETUP.md step 3 and check that the drafted `kb_instructions.md` takes only the profile suggestions that fit, and that a meeting note's decision and risk each have an obvious page.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `templates/system/profiles/management.md` |
| Related Files | `templates/kb_instructions.management.md`, `templates/system/templates/source.md` |
| Test Files | `test/templates/profile.test.ts` |
| New Files Needed | Yes — the profile, `templates/system/templates/source.md` and the test file |

### 3.2 Technical Logic
- Profile (R1–R4): entity lines keep the §5.2 `→ page  Q-refs` shape so the agent can copy them into the seed and EPIC-005's `lint --rules` (SPRINT-03) can parse them later; the test splits each entity line on `→`, reads the field list before it and the page and `Q<n>` refs after it; a page containing `<…>` is one entity per page, any other name a multi-entry page.
- Source kinds (R3): exactly the contract-2 form. The test calls `parseSourceKinds(profileText)` and checks that every non-blank line of the `## Source kinds` section outside an HTML comment produced a rule (matched by the rule's `line`); the error scenario runs the same check on an in-memory copy.
- Seed (R5): each drafted section holds one single-line HTML comment (no kind-shaped text inside it); the test asserts `parseSourceKinds(seedText)` is `[]` and that those sections have no other non-blank line.
- Source template (R6): `<…>` placeholders in frontmatter values and the typed link; the test calls `parsePage(text, "sources/<source-id>.md")` and checks `errors`, `frontmatter`, `sections`, `facts` (must be empty) and the `source` typed link.
- `init` copies the seed to `.wiki/kb_instructions.md` only when missing (`src/commands/init.ts:190`); the profile and the source template install with the other system files (`src/commands/init.ts:95`), so no code changes.

### 3.3 API Contract (if applicable)

Not applicable — content. Consumes `parsePage` (contract 1) and `parseSourceKinds` (contract 2) read-only.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 3 | Entity-line parser; question/entity coverage; comment-aware source-kind section check |
| Integration tests | 1 | `init --yes` in a temp repo installs the profile and the source template and seeds `.wiki/kb_instructions.md` |
| E2E / acceptance tests | 10 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/template-loader.red.node.test.ts` passes unchanged after STORY-006-02's re-scope (this story does not edit it).
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/kb_instructions.management.md:1` — placeholder seed with the section skeleton.
- **Surface:** `src/commands/init.ts:190` — copies the profile's seed into the user's kb_instructions.md when it is missing.
- **Surface:** `src/commands/init.ts:95` — installs `templates/system/**` (profile and source template) into `.wiki/system/**`.
- **Surface:** `src/core/gitignore.ts:83` — `private` entries become ignore lines, which R4 explains.
- **Surface:** `./architecture.md` — §5.2 seed example, §8 knowledge model.
- **Coverage of this requirement:** partial — the seed file and the install path exist; the content is placeholder and the profile and template are new.

## Prior work

- [[EPIC-006]] (parent), [[EPIC-004]] (page parser, STORY-004-01), [[EPIC-003]] (source-kind rules, STORY-003-02), [[CR-002]] (C1 whitelist kinds ignore the version). Decomposition contract 13 (human, 2026-10-16) replaces the five seed pages and their templates. No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `templates/kb_instructions.management.md:1` for the seed; the profile and the source template have no existing surface.
- **Why isn't extension / parameterization / config sufficient?** Suggestions have to be text the agent reads during setup. Putting them in the seed would give every wiki the same questions and pages, which the human ruled out (contract 13); a package-owned profile improves with `update` while the user's seed stays theirs. Parsing both with the CLI's own parsers in a test is the cheapest way to keep three stories' formats aligned.

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
