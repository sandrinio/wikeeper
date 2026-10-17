---
story_id: STORY-005-01
parent_epic_ref: EPIC-005
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
ambiguity: 🟡 Medium
context_source: EPIC-005 (approved 2026-10-16) · CR-003 D1–D3 (approved 2026-10-17) · architecture.md §5.2, §9, D-14, D-31 · SPRINT-03 decomposition brief contract K1 and the orchestrator design call on `note:` and `(dated facts)` · verified src/ingest/kind-rules.ts, src/core/paths.ts, src/commands/ingest-start.ts, templates/kb_instructions.management.md, templates/system/profiles/management.md and ~/Documents/Dev/formapass_management/.wiki/kb_instructions.md (2026-10-17)
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T08:57:10Z
updated_at: 2026-10-17T08:57:10Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T08:58:59Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: null
  last_stamp: 2026-10-17T08:58:59Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: ""
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-17T08:46:24Z
---

# STORY-005-01: `kb_instructions.md` parser and line format
**Complexity:** L2 — one pure parser module plus a small file loader, over the line format that real files already use. No command, no writes. Reuses the frozen source-kind parser (C2) for kinds.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent that keeps `kb_instructions.md` for its user, I want one parser that reads the file's questions, entities, source kinds, notes and changelog in a defined line format and reports the lines it cannot read, so that `lint --rules`, `status` and `doctor` all see the same rules and I know which line to fix.

### 1.2 Detailed Requirements
- **R1 — Entry points (contract K1).** `parseInstructions(text)` is pure, never throws and returns `KbInstructions` (§3.3). `loadInstructions(paths)` reads `paths.kbInstructions` as UTF-8 and returns `{ text, kb }`, or `null` when the file does not exist (`ENOENT`, `ENOTDIR`). Other read errors (e.g. `EISDIR`) are thrown unchanged. The file is always `.wiki/kb_instructions.md`, whatever `content_dir` is (`src/core/paths.ts:47`).
- **R2 — Lines and regions.** A leading BOM is ignored; lines split on `\r?\n`; line numbers are 1-based, as in C2. Lines inside fenced code blocks (```` ``` ```` or `~~~`, closed by the same character, as C2 does) are ignored. HTML comments are ignored too: a `<!-- … -->` span is removed from its line, and every line from an unclosed `<!--` up to the line holding `-->` is skipped (text after `-->` is read). A line that is blank after this is skipped.
- **R3 — Sections.** Each `## ` heading (outside fences) starts a section and adds a `KbSection { heading, key, line }`. `key` comes from the start of the heading text, case-insensitive: `Questions` → `questions`, `Entities` → `entities`, `Capture signals` → `capture-signals`, `Source kinds` → `source-kinds`, `Write policy` → `write-policy`, `Never capture` → `never-capture`, `Rule changelog` → `rule-changelog`; any other heading → `null`. Text after those words is ignored (`## Questions this wiki must answer` is `questions`). `### ` (and deeper) heading lines stay in the current section and are skipped: they are neither rules nor notes.
- **R4 — Purpose.** The first `purpose: <value>` line before the first `## ` heading sets `purpose`; otherwise `purpose` is `null`.
- **R5 — Questions.** Under a `questions` section, a line `Q<n>` followed by `.`, `:` or a space and then text (an optional `- ` or `* ` bullet first) is a `KbQuestion`. `id` is `Q` plus the number without leading zeros (`Q04` → `Q4`). A trailing ` (dated facts)`, case-insensitive, sets `datedFacts: true` and is stripped from `text` (orchestrator design call, 2026-10-17). A line that starts `Q<n>` but has no text after the marker is the issue `malformed-question`.
- **R6 — Entities.** Under an `entities` section, a line `<entity> <comma-separated fields> → <page> <Q refs>` is a `KbEntity`; `->` is accepted for `→`, and an optional bullet is allowed. `name` is the first word, lower-cased. `fields` is the text between the name and the arrow, split on commas, trimmed, empty parts dropped; fields may hold spaces (`target date`) and may be empty. `page` is the first word after the arrow. Every word after the page must be a question ref (`Q<n>`, case-insensitive, separated by spaces or commas); refs are normalised like question ids. A line under `entities` with an arrow (outside inline code) that does not fit this shape is the issue `malformed-entity`.
- **R7 — Source kinds.** `kinds` is exactly `parseSourceKinds(text)` from `src/ingest/kind-rules.ts` (contract C2, frozen in SPRINT-02, unchanged), so `kinds` is what `ingest start` and `ingest facts` use. Under a `source-kinds` section, a line C2 reads as a rule is a kind line; any other line with an arrow outside inline code is the issue `ambiguous-line`.
- **R8 — Notes.** A line starting `note:` (case-insensitive, optional bullet) in any section is a `KbNote` with the text after `note:`, trimmed; it is never a question, entity or kind (CR-003 D2). Under `questions`, `entities` and `source-kinds`, any other line that is not a question, entity or kind line and raised no issue is also a `KbNote` (existing files carry such prose, e.g. the routing note under `## Source kinds`). Under `questions`, a prose line with an arrow outside inline code is the issue `ambiguous-line` instead. `section` is the section's `key`, or `""` for a line before the first heading or in a section whose key is `null`.
- **R9 — Inline code.** Arrows inside backtick code spans do not count: the prose line `` Each line reads `<entity> <fields> → <page> <question refs>`. `` (`templates/system/profiles/management.md:15` and the real file's line 17) is a note, not an entity and not an issue.
- **R10 — Never capture and changelog.** Under `never-capture`, each bullet line (`- ` or `* `) is one `neverCapture` item, bullet removed and trimmed; other lines are ignored. Under `rule-changelog`, a line `- YYYY-MM-DD: text` is a `KbChangelogEntry`; the bullet and the colon are optional, so the architecture §5.2 form `2026-10-16  meeting-notes v2: …` also parses. Other lines (the seed's "Seeded from the management profile…") are ignored. Capture signals and Write policy are not parsed beyond `note:` lines.
- **R11 — Issues the parser can see.** After the scan:
  - each entity ref that names no question in the file adds `unknown-question-ref` at the entity's line (the entity is still returned, with that ref);
  - each of the `questions`, `entities` and `source-kinds` sections that is absent adds `missing-section` with `line: 0` (whole file), naming the heading to add.

  Together with R5–R8 these are the five issue codes: `unknown-question-ref`, `malformed-question`, `malformed-entity`, `ambiguous-line`, `missing-section`. A line that raises `malformed-question`, `malformed-entity` or `ambiguous-line` yields nothing else. Each message is one sentence: `malformed-question` names the question id, `unknown-question-ref` the ref, `missing-section` the heading to add (`## Entities`), `malformed-entity` quotes the expected form `<entity> <fields> → <page> <Q refs>`, and `ambiguous-line` suggests `note:` (STORY-005-04 asserts these). The parser reports; it never edits the file (D-14).
- **R12 — Kind lines inside a multi-line HTML comment (see §1.4).** C2 still reads them, so they stay in `kinds` (R7); the parser adds `ambiguous-line` at that line, saying that ingest still reads the commented-out rule.

### 1.3 Out of Scope
- Lint findings, check ids and severities, and the `doctor` warning (STORY-005-04). Re-ingest candidates from rule versions (STORY-005-05).
- Changing C2, or moving `ingest start` / `ingest facts` off `findKindRule` (`src/commands/ingest-start.ts:202`, `src/commands/ingest-facts.ts:147`).
- Writing or editing `kb_instructions.md`; the agent edits it after user approval (D-14). The format text in SETUP.md step 3, WIKI.md and the seed is STORY-006-10's.
- Parsing Capture signals or Write policy content, and judging whether rules are good (duplicates, coverage: STORY-005-04).

### 1.4 Open Questions

- **Question:** K1 says lines inside HTML comments are ignored "as C2 already does", but C2 skips only fenced code blocks (`src/ingest/kind-rules.ts:29`–`36`; FLASHCARD 2026-10-17 `#kind-rules`). A kind line inside a multi-line `<!-- … -->` is therefore still a rule for `ingest start` and `ingest facts`. What should the parser do with it?
- **Recommended:** Keep `kinds` exactly `parseSourceKinds(text)` (K1; C2 is frozen), so lint and status see the rules ingest uses, and add an `ambiguous-line` issue at each such line ("inside an HTML comment, but ingest still reads it as a source-kind rule; delete it or put it in a code fence"). Questions, entities and notes inside comments are ignored (R2). Drafted this way (R12); the K1 wording is corrected here rather than C2 changed.
- **Human decision:** {populated during Brief review}

Decisions recorded with their rationale (not open):
- **`(dated facts)` and `note:`** are the orchestrator's design call (decomposition brief, 2026-10-17); the rest of the format is what real files already use (`Q1 What…`, `initiative purpose, status, plan → initiatives/<name>.md Q1 Q2 Q5`).
- **`KbSection` is defined here** (`{ heading, key, line }`): K1 names the type without fields. The `key` union and `KB_ISSUE_CODES` are additive exports.
- **`missing-section` covers only `questions`, `entities` and `source-kinds`**: these are the sections the rules checks read. The seed has all seven headings, so a fresh wiki raises nothing.
- **A line with an issue is not also a note.** K1 lists "any other non-empty prose line" as a note; a malformed or ambiguous line is reported once, as an issue, so lint does not count it twice.
- **Lenient changelog form** (bullet and colon optional): the architecture §5.2 example omits both; accepting it costs nothing and loses no entry.

### 1.5 Risks

- **Risk:** Real files carry prose the parser misreads, so `doctor` (STORY-005-04) warns on every existing wiki.
- **Mitigation:** The acceptance fixture is a copy of the formapass file (prose with an arrow in inline code, a `Q4 …` sentence under `## Entities`, a routing note under `## Source kinds`, a prose changelog line) and must give 0 issues. The empty seed must too.
- **Risk:** Five stories build on this contract (005-02 against a stub, 005-04, 005-05, 006-10, 006-11). A renamed field breaks them at merge.
- **Mitigation:** §3.3 is exactly K1 plus the additive items named in §1.4; a test pins the export names and the issue-code list.
- **Risk:** `kinds` (C2) and the rest of the parser treat HTML comments differently.
- **Mitigation:** R12 surfaces every kind line where they differ as an issue, so it is visible in `lint --rules` and `doctor`.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | `loadInstructions` returns the parsed file (default and moved `content_dir`) or `null` when the file is missing; both are successful outcomes. |
| Interfaces | F | Library only; the CLI surfaces are STORY-005-04 (`lint --rules`, `doctor`) and STORY-005-05 (`status`). |
| Data | T | The empty seed vs a filled real file (Outline). |
| Rules | T | The line format and its two markers; each issue code (Outline); code blocks, comments and inline code are not rules. |

```gherkin
Feature: kb_instructions.md parser

  @data
  Scenario Outline: The seed and a real file parse with no issues
    Given the file <file>
    When parseInstructions runs on its text
    Then purpose is "management" and sections lists the seven headings with keys questions, entities, capture-signals, source-kinds, write-policy, never-capture and rule-changelog
    And it returns <questions> questions, <entities> entities, <kinds> kinds, <notes> notes, <changelog> changelog entries and <never> never-capture items
    And issues is empty
    And kinds deep-equals parseSourceKinds of the same text

    Examples:
      | file                                                          | questions | entities | kinds | notes | changelog | never |
      | templates/kb_instructions.management.md                       | 0         | 0        | 0     | 0     | 0         | 4     |
      | test/fixtures/kb/real-management.md                           | 7         | 6        | 5     | 3     | 2         | 6     |
      | test/fixtures/kb/real-management.md with CRLF endings and a BOM | 7       | 6        | 5     | 3     | 2         | 6     |

  @rules
  Scenario: Questions, entities, notes and changelog entries follow the line format
    Given a kb_instructions.md with the seed's headings and the line "note: drafted with the user" before the first heading
    And under "## Questions this wiki must answer" the lines "Q1 What is initiative X for?", "Q04. What changed since <date>? (Dated facts)" and "- Q5: What is planned next?"
    And under "## Entities" the lines "### Planning", "milestone what, initiative, target date, status -> roadmap.md Q4, q5" and "- term → glossary.md Q1"
    And under "## Source kinds" the lines "roadmap (v2) → milestone" and "note: a SPRINT-NN is a milestone → never an initiative"
    And under "## Rule changelog" the lines "- 2026-10-17: roadmap v2: sprints are milestones" and "2026-10-16  meeting-notes v2: + attendees"
    When parseInstructions runs
    Then the questions are Q1, Q4 and Q5; Q4 has datedFacts true and text "What changed since <date>?"; Q5 has text "What is planned next?"
    And entity "milestone" has fields "what", "initiative", "target date", "status", page "roadmap.md" and questionRefs Q4 and Q5
    And entity "term" has no fields, page "glossary.md" and questionRefs Q1
    And kinds holds only roadmap version 2
    And notes are "drafted with the user" in section "" and "a SPRINT-NN is a milestone → never an initiative" in section "source-kinds"
    And changelog holds 2026-10-17 "roadmap v2: sprints are milestones" and 2026-10-16 "meeting-notes v2: + attendees"
    And issues is empty

  @rules
  Scenario Outline: Error — lines the parser cannot read are reported as issues
    Given <base> with <change>
    When parseInstructions runs
    Then issues holds exactly one issue: code "<code>" at line <line>, with a message naming "<names>"
    And the changed line yields <yields>

    Examples:
      | base                                    | change                                                        | code                 | line | names       | yields                         |
      | test/fixtures/kb/real-management.md     | line 14 replaced by "Q8"                                      | malformed-question   | 14   | Q8          | no question, entity or note    |
      | test/fixtures/kb/real-management.md     | line 6 replaced by "See the roadmap → for dates"              | ambiguous-line       | 6    | note:       | no question, entity or note    |
      | test/fixtures/kb/real-management.md     | line 23 replaced by "risk owner, impact → risks.md Q6 and Q7" | malformed-entity     | 23   | <page>      | no question, entity or note    |
      | test/fixtures/kb/real-management.md     | line 23 replaced by "risk owner, impact → risks.md Q6 Q9"     | unknown-question-ref | 23   | Q9          | entity "risk" with refs Q6, Q9 |
      | test/fixtures/kb/real-management.md     | line 44 replaced by "Use roadmap → milestone for sprints"     | ambiguous-line       | 44   | note:       | no question, entity or note    |
      | templates/kb_instructions.management.md | line 9 "## Entities" replaced by "## Entity list"             | missing-section      | 0    | ## Entities | no question, entity or note    |

  @rules
  Scenario: Code blocks, HTML comments and inline code are not read as rules
    Given a kb_instructions.md with the seed's headings
    And under "## Entities" a fenced code block holding "person role → people.md Q1", the one-line comment "<!-- team role → team.md Q1 -->" and the line "Each line reads `<entity> <fields> → <page> <question refs>`."
    And under "## Source kinds" a three-line HTML comment: "<!--", "meeting-notes (v1) → decision", "--> note: kept after the comment"
    When parseInstructions runs
    Then entities is empty
    And notes are the "Each line reads" line in section "entities" and "kept after the comment" in section "source-kinds"
    And kinds holds meeting-notes version 1 at the comment's middle line, as parseSourceKinds returns it
    And issues holds exactly one issue: code "ambiguous-line" at that line, whose message says ingest still reads it

  @paths
  Scenario Outline: loadInstructions reads .wiki/kb_instructions.md, returns null when it is missing, and fails on other read errors
    Given an initialised wiki with content_dir "<content_dir>" and <file>
    When loadInstructions runs with the wiki's resolved paths
    Then it <result>

    Examples:
      | content_dir | file                                                            | result                                                         |
      | .wiki       | the seed at .wiki/kb_instructions.md                            | returns the file's text and a parse with 0 questions, 0 issues |
      | wiki        | test/fixtures/kb/real-management.md at .wiki/kb_instructions.md | returns the file's text and a parse with 7 questions, 0 issues |
      | .wiki       | no .wiki/kb_instructions.md                                     | returns null                                                   |
      | .wiki       | a directory at .wiki/kb_instructions.md                         | rejects with the EISDIR error                                  |
```

### 2.2 Verification Steps (Manual)
- [ ] Run `parseInstructions` on `~/Documents/Dev/formapass_management/.wiki/kb_instructions.md` (read-only) and on `templates/system/profiles/management.md`'s entity and question lines, and check that no line is misread.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/kb/parse-instructions.ts` |
| Related Files | `src/ingest/kind-rules.ts` (`parseSourceKinds`, `SourceKindRule` — consumed unchanged, C2), `src/core/paths.ts` (`ResolvedPaths.kbInstructions` — consumed) |
| Test Files | `test/kb/parse-instructions.test.ts`, `test/kb/load-instructions.test.ts` |
| Fixtures | `test/fixtures/kb/real-management.md` |
| New Files Needed | Yes — all four files above |

### 3.2 Technical Logic
- One pass over the lines with three pieces of state: the open fence character (C2's `^\s*(```+|~~~+)` rule), whether an HTML comment is open, and the current section. `kinds` comes from one `parseSourceKinds(text)` call on the original text; its `line` values form the set of kind lines used in R7 and R12.
- Comment handling per line: if a comment is open, look for `-->`; none → the line is commented (remember its number for R12) and skipped; found → keep the text after it. Then remove every `<!--…-->` span; an unclosed `<!--` keeps the text before it and opens a comment.
- Arrow test (R6–R9): remove inline code spans (`` `[^`]*` ``) from the line, then test `→` or `->`.
- Regexes (applied to the comment-stripped line):
  - question: `^\s*(?:[-*]\s+)?Q(\d+)(?:[.:]\s*|\s+)(\S.*?)\s*$`, then strip `/\s*\(dated facts\)$/i`; empty text after stripping → `malformed-question`. Malformed: `^\s*(?:[-*]\s+)?Q\d+\b` that failed the question regex.
  - entity: `^\s*(?:[-*]\s+)?([A-Za-z][A-Za-z0-9_-]*)(?:\s+(.*?))?\s*(?:→|->)\s*(\S+)?\s*(.*)$`; valid when the page group is present and every word of the last group (split on `[\s,]+`) matches `^Q\d+$` (case-insensitive).
  - note: `^\s*(?:[-*]\s+)?note:\s*(.*)$` (case-insensitive).
  - changelog: `^\s*(?:[-*]\s+)?(\d{4}-\d{2}-\d{2})\s*:?\s+(\S.*?)\s*$`.
  - never-capture: `^\s*[-*]\s+(\S.*?)\s*$`. Purpose: `^purpose:\s*(\S.*?)\s*$`.
- Order of tests per line in a rule section: `note:` first, then the section's own form (question / entity / kind line), then the malformed and arrow checks, then note-as-prose.
- `issues` is returned sorted by line (then code), so `issues[0]` is the first problem in the file; STORY-005-04's `doctor` message names it. A `line: 0` issue (`missing-section`) sorts first.
- Issue messages, e.g. `not an entity line: expected "<entity> <fields> → <page> <Q refs>"`, `entity "risk" refers to Q9, which is not a question in this file`, `no "## Entities" section; add it`, `Q8 has no question text`, `prose line with an arrow; write it as a rule or start it with "note:"`. Codes and the tokens R11 names are frozen; the rest of the wording is not.
- Fixture: `test/fixtures/kb/real-management.md` is a copy of `formapass_management/.wiki/kb_instructions.md` as of 2026-10-17 (68 lines), with "Formapass" replaced by "Acme" on line 13 so line numbers stay the same. In it, Q4 (line 10) is listed by no entity and not marked `(dated facts)`; STORY-005-04 relies on that.
- Unit tests call `parseInstructions` directly; `loadInstructions` tests use a temp directory and `resolvePaths`.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `parseInstructions(text)` | Library | None | `string` | `KbInstructions` |
| `loadInstructions(paths)` | Library | None | `ResolvedPaths` | `Promise<{ text: string; kb: KbInstructions } \| null>` |

Frozen exports (contract K1; consumers: STORY-005-02 builds against a stub of these types until this merges, 005-04, 005-05; 006-10 documents this format; 006-11 may parse the seed):

```ts
// src/kb/parse-instructions.ts — contract K1 (owner STORY-005-01). Frozen exports.
import type { ResolvedPaths } from "../core/paths.js";
import type { SourceKindRule } from "../ingest/kind-rules.js";

export type KbSectionKey =                          // additive (K1 names KbSection without fields)
  | "questions" | "entities" | "capture-signals" | "source-kinds"
  | "write-policy" | "never-capture" | "rule-changelog";
export interface KbSection { heading: string; key: KbSectionKey | null; line: number }   // additive
export interface KbQuestion { id: string /* "Q4" */; text: string; datedFacts: boolean; line: number }
export interface KbEntity { name: string; fields: string[]; page: string; questionRefs: string[]; line: number }
export interface KbNote { section: string; text: string; line: number }
export interface KbChangelogEntry { date: string /* YYYY-MM-DD */; text: string; line: number }
export interface KbIssue { line: number /* 0 = whole file */; code: string; message: string }
export const KB_ISSUE_CODES: readonly [                // additive
  "unknown-question-ref", "malformed-question", "malformed-entity", "ambiguous-line", "missing-section",
];
export interface KbInstructions {
  purpose: string | null;
  sections: KbSection[];
  questions: KbQuestion[];
  entities: KbEntity[];
  kinds: SourceKindRule[];          // exactly parseSourceKinds(text) (C2)
  notes: KbNote[];
  neverCapture: string[];
  changelog: KbChangelogEntry[];
  issues: KbIssue[];                // sorted by line
}
export function parseInstructions(text: string): KbInstructions;
export function loadInstructions(paths: ResolvedPaths): Promise<{ text: string; kb: KbInstructions } | null>;
```

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 8 | Section key mapping (incl. `###` and unknown headings); question id normalisation (`Q04`, bullet, `:`); `(dated facts)` case and stripping; entity fields with spaces and empty fields; refs with commas; CRLF and BOM; one-line and multi-line comments with text after `-->`; `KbNote.section` before the first heading and in an unknown section; export names and `KB_ISSUE_CODES` pinned. |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `src/ingest/kind-rules.ts` unchanged; STORY-003-02 and STORY-006-03 tests still pass.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/ingest/kind-rules.ts:22` — `parseSourceKinds` (C2), reused for `kinds`; it skips fenced code (lines 29–36) but not HTML comments.
- **Surface:** `src/core/paths.ts:47` — `kbInstructions` is always under `.wiki/`, not `content_dir`.
- **Surface:** `src/commands/ingest-start.ts:192` — reads the raw file and calls `parseSourceKinds` / `findKindRule` (lines 201–202); unchanged by this story.
- **Surface:** `./templates/kb_instructions.management.md` — the seed: seven `##` headings, the three drafted sections holding one-line HTML comments (lines 7, 11, 23).
- **Surface:** `./templates/system/profiles/management.md:15` — a prose line with an arrow inside inline code; lines 17–22 are entity lines in the K1 shape.
- **Coverage of this requirement:** partial — source-kind lines are parsed by C2; questions, entities, notes, the changelog and issues are net-new.

## Prior work

- [[EPIC-005]] (parent); [[CR-003]] (D1–D3: the line format, `note:` lines, dated-fact questions); [[STORY-003-02]] (C2 `parseSourceKinds`, reused unchanged); [[STORY-006-03]] (the seed and the profile's entity-line shape this parser must accept). No duplicate parser exists in `src/`.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/ingest/kind-rules.ts:22` (`parseSourceKinds`).
- **Why isn't extension / parameterization / config sufficient?** C2 is frozen and returns only kind lines; ingest depends on exactly that behaviour. `lint --rules`, `status` and `doctor` also need questions, entities, notes, the changelog and line-level issues, read the same way by all three. A second module that calls C2 for kinds and parses the rest in one pass gives them that without touching ingest.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/kb/parse-instructions.ts` is an EPIC-005 §0 target file; the related files exist; test and fixture files are new.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Status stays 🟡 until the human answers the §1.4 question (kind lines inside HTML comments).
