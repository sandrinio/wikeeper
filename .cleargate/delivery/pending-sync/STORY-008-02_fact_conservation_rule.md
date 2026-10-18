---
story_id: STORY-008-02
parent_epic_ref: EPIC-008
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-008 (approved 2026-10-18) §0 rules (archive, never delete), §2 (conservation rule at ingest finish, write phase covers archive/, the finish report), §3 (safety, compatibility), §5 (move, drop, archive-drop, merge, deleted-page scenarios), §6 · SPRINT-04 decomposition brief (2026-10-18): scope 008-02, contract K10 (owner), K9 (consumed, STORY-008-01), K7 (STORY-007-05, shared report) · human decision 2026-10-18: a deleted page's fact lines must survive in pages/ or archive/ · verified at 6b75807: src/ingest/validate.ts, src/ingest/diff.ts, src/ingest/snapshot.ts, src/ingest/report.ts, src/commands/ingest-finish.ts, src/wiki/parse-page.ts, src/core/text.ts · tests test/ingest/ingest-follow-ups.red.node.test.ts, test/ingest/ingest-follow-ups.test.ts, test/ingest/finish.test.ts, test/ingest/finish-frontmatter.red.node.test.ts, test/ingest/report.test.ts · STORY-003-12 (fact identity, Gate 1 decisions 2026-10-17) · FLASHCARD 2026-10-17 #test-harness #finish, #qa #red-test"
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-008-01
expected_bounce_exposure: high
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T07:58:00Z
updated_at: 2026-10-18T07:58:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T08:01:11Z
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
  model: claude-opus-5-5
  last_stamp: 2026-10-18T11:49:06Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-18T10:24:08Z
---

# STORY-008-02: The conservation rule at `ingest finish`, archive validation, the report's archived counts
**Complexity:** L2 — one check in `validateIngest` grows from "an updated page kept its fact lines" to three rules over two trees, plus one message part, one `details` key and one report line. It extends the STORY-003-12 check with the same fact identity. It needs STORY-008-01 (`archiveDir`, `SnapshotInfo.archive`, `PageDiff.archive`, K9). It shares `src/ingest/report.ts` and `src/commands/ingest-finish.ts` with STORY-008-01 and STORY-007-05, which land first.

## 1. The Spec (The Contract)

### 1.1 User Story
As a user who asked the agent for a clean-up, I want `ingest finish` to accept a fact line leaving a page only when it is kept, unchanged, in the archive or on another page, and never to accept a line leaving the archive, so that the wiki can shrink without losing a fact.

### 1.2 Detailed Requirements
- **R1 — Fact identity.** Every rule compares fact lines with the existing `factKey` (`src/ingest/validate.ts:32`, STORY-003-12 R1):
  - date, status, text (NFC, whitespace collapsed, citation included), `contradicts` and the contradiction flag count;
  - list marker, indentation, spacing, position, a BOM and CRLF line endings do not (`parsePage`, `src/wiki/parse-page.ts:204`).

  Facts compare as sets per page: a line held twice on a page counts once. An entry's `line` is the snapshot copy's line, trimmed, as today.
- **R2 — Rule 1: a line dropped from a page must be in that page's archive file (K10).** For each `.md` page `<p>` in `diff.updated`, a fact of the snapshot copy whose key the page no longer holds is allowed only when `archive/<p>` (the same path, after the write) holds the key. Otherwise it is a `dropped` entry, as today. The archive file is read only when the page dropped a line. A line moved to another live page, or to the archive file of another path, is still dropped (EPIC-008 §2; STORY-003-12 Gate 1 decision 2).
- **R3 — Rule 2: a deleted page's lines must survive (K10; human decision 2026-10-18).** For each `.md` page `<p>` in `diff.deleted`:
  - its snapshot copy is read and parsed. A copy that cannot be read throws `snapshot_missing` with the `abort` hint, as for updated pages (`src/ingest/validate.ts:63`);
  - each of its fact keys must be held by some `.md` page of `pages/` or of `archive/` after the write, at any path;
  - every key that is held by neither is a `dropped` entry `{ path: <p>, line }`.

  So merging a duplicate page into another page, renaming a page within `pages/` (delete + create with the same lines), deleting a page whose lines are also on another page, and moving a page whole to `archive/<p>` all pass. The two survivor key sets are built once, with `loadPages(paths.pagesDir)` and `loadPages(paths.archiveDir)` (`src/wiki/parse-page.ts:443`), and only when `diff.deleted` holds a `.md` page. Today's behaviour of not checking deleted pages (`src/ingest/validate.ts:53`) ends here.
- **R4 — Rule 3: no fact line leaves `archive/` (K10).** For `diff.archive` (STORY-008-01; a missing `archive` counts as empty):
  - each `.md` file in `updated`: a fact of its snapshot copy (`<snapshot>/archive/<path>`) that the file no longer holds is an `archived_dropped` entry;
  - each `.md` file in `deleted`: every fact line of its snapshot copy is an entry. A deleted archive page with no fact line gives one entry with `line: ""`, so deleting it is refused as well (EPIC-008 §2: "an archive page deleted, is refused");
  - an unreadable snapshot copy throws `snapshot_missing`, naming `archive/<path>`.

  Lines moved from one archive page to another count as dropped from the first, so an archive page cannot be renamed in an ingest. Copying a line back to a live page while keeping it in the archive is allowed.
- **R5 — Archive pages: frontmatter yes, citation no (K10).** Each `.md` file in `diff.archive.created` and `diff.archive.updated` is parsed; its frontmatter errors are `invalid` entries, with the same messages as for pages and the path `archive/<path>`. Archive pages are not checked for this ingest's citation: their lines keep their own citations. Live pages keep both checks unchanged: a page that lost a line to the archive must still cite this ingest. The `sources/<id>.md is missing` warning still looks in `pages/` only.
- **R6 — Validation result (K10, plus one additive field).** `IngestValidation` gains:
  - `archived_dropped: Array<{ path: string; line: string }>`: paths relative to `archive/`, POSIX, sorted by path, then by line position in the snapshot copy;
  - `archived: { facts: number; pages: number }` (additive to K10, owned here, so that `finish` does not compute the counts again).

  `dropped` now also holds deleted pages' lines, in the same sort. `ok` also requires `archived_dropped.length === 0`.
- **R7 — Counts.**
  - `archived.facts`: fact lines that left `pages/` and are kept only in `archive/`. That is, each key counted for R2 because `archive/<p>` holds it, plus each key of a deleted page that no `pages/` page holds and some `archive/` page holds. Each key counts once per page it left.
  - `archived.pages`: deleted `.md` pages of `pages/` whose `archive/<same path>` is in `diff.archive.created` or `diff.archive.updated`.
- **R8 — Refusal (`ingest finish`).** On `!v.ok` (`src/commands/ingest-finish.ts:156`), as today: exit 1, code `validation_failed`, no index write, nothing logged, lock and snapshot kept. Then:
  - the `dropped` part reads `fact lines dropped (a replaced fact stays in the list; a clean-up moves it unchanged to archive/<same path>): <path> ("<line>", …), …`; deleted pages' lines are grouped under their path like the others;
  - a new part follows it: `archived fact lines dropped (no line leaves archive/): archive/<path> ("<line>", …), …`, where an entry with an empty line shows as `archive/<path> (page deleted)`;
  - `details` gains `archived_dropped` beside `uncited`, `outside`, `invalid` and `dropped`.
- **R9 — Report (K10).** `IngestReport` gains `archived: { facts: number; pages: number }`. The `finish` report takes it from `v.archived`. The re-run path (`src/commands/ingest-finish.ts:107`, an ingest already logged) reports `{ facts: 0, pages: 0 }`, as it reports `hooks: []` and `lint: []`, because the log event does not record the counts. `formatReport` adds `   archived <plural(facts, "fact line")> · <plural(pages, "page")>` (`plural`, `src/commands/doctor.ts:36`) directly after the `   created …` line, when `facts > 0` or `pages > 0` (§1.4 Q2): `archived 1 fact line · 0 pages`, `archived 3 fact lines · 1 page`. STORY-007-05's `   wiki ≈…` line follows it.
- **R10 — Compatibility.** A write phase that touches no archive file and deletes no page with fact lines finishes exactly as today: same checks, same message, `archived: { facts: 0, pages: 0 }` and no `archived` line. A snapshot from an older wikeeper has an empty `archive` map (K9), so every archive file counts as created: R5 checks it, and R4 finds nothing to compare.

### 1.3 Out of Scope
- Moving lines or pages: the agent does it in the write phase; the CLI only checks (EPIC-008 §0).
- Snapshot, diff, guard, abort and `archive_hashes` (STORY-008-01, K9).
- `index.md`, search, lint, status and `remove` over the archive (STORY-008-03, 008-04, 008-05).
- WIKI.md and the writer instructions: how to move a line, merge or delete a page, run a clean-up, and read the two refusals. WIKI.md "Write phase" still says "Deleting a whole page stays allowed" (`templates/system/WIKI.md:80`); STORY-008-06 replaces that.
- Any special rule for `sources/<id>.md` pages. A deleted source page with fact lines falls under R3 like any page. EPIC-008 §2 keeps source pages out of clean-ups, and STORY-008-06 says so in WIKI.md.
- An override that accepts a dropped line, and deleting archived content inside an ingest (EPIC-008 §2 out of scope).
- Recording the archived counts in the ingest log event.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1):** R3 flips one row of the immutable red test `test/ingest/ingest-follow-ups.red.node.test.ts`: "deleted page: accepted and reported" (`:172`, STORY-003-12 S2). It deletes `roadmap.md`, whose one fact line is on no other page, and expects exit 0. A red test changes only with the human's authorisation. May this story's QA-Red re-scope it?
- **Recommended:** Yes, by test name and in that test only. Before `finish`, the test also writes `archive/roadmap.md` holding the line unchanged. Its two assertions stay (exit 0 and `data.deleted` `["roadmap.md"]`), and so does its name. This keeps what the row protected (a deleted page is accepted and reported) under the rule the human chose on 2026-10-18. No other row changes: "moved to another page: dropped from the page it left" (`:197`) is still refused under R2.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2, K10 says "when N > 0"):** When a write phase moves only fact-less pages whole to the archive (N = 0, M > 0), should the report still print the `archived` line?
- **Recommended:** Yes: print it when N > 0 or M > 0. Otherwise the report says only `deleted 1`, and the user may think the page is gone, though it is kept in the archive. The JSON is the same either way. This changes K10's display rule only, not a signature.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

Decided while drafting (not open):
- Rule 1 needs the same path (`archive/<p>`), and rule 2 accepts any page of either tree, as EPIC-008 §2 states. So dropping a line from a live page that another live page also holds is refused, while deleting that page is accepted (§1.5).
- A deleted archive page is refused even without fact lines (R4, EPIC-008 §2). An archive page cannot be renamed within an ingest.
- The re-run path reports zero counts (R9): the rule ran in full before that ingest was logged, and the counts are display-only metadata (D-08).
- `invalid` mixes both trees, so archive entries carry the `archive/` prefix there. `archived_dropped` holds archive pages only, so its paths are relative to `archive/`, as `dropped` paths are relative to `pages/`.

- **DRAFTS review (designer, 2026-10-18):** wording aligned with docs/ux.md — the report's `archived` line takes the plural helper for both counts (`archived 1 fact line · 0 pages`, `archived 3 fact lines · 1 page`), and "with no plural forms" is gone (R9, §2.1 scenario 5). When the line shows (Q2) is unchanged. No decision changed.

### 1.5 Risks
- **Risk:** The rule refuses page deletions that SPRINT-03 accepted. For example, a writer deletes an outdated page in an ordinary ingest.
- **Mitigation:** This is the human's decision of 2026-10-18. The refusal names the page and every line, and keeps the lock, so the writer moves the lines and reruns `finish`, or aborts. STORY-008-06 changes the WIKI.md sentence that still allows deletion.
- **Risk:** Rule 1 and rule 2 differ: a line held on two live pages can go with its whole page, but cannot be dropped from a page that stays.
- **Mitigation:** Stated here and in STORY-008-06's text. This keeps STORY-003-12's approved per-page rule for updated pages. Relaxing it would also accept moving a line between live pages, which that decision refused.
- **Risk:** `archived fact lines dropped` contains `fact lines dropped`, so a test that checks only the message for the plain refusal passes on the wrong one.
- **Mitigation:** Every refusal row asserts `error.details.dropped` and `error.details.archived_dropped` by value (§4.1).
- **Risk:** Rule 2 parses every page of both trees when a page is deleted, so `finish` slows on large wikis.
- **Mitigation:** Only when a `.md` page is deleted, once per `finish`. The parser already loads the whole wiki for the lint hook in the same command (`src/commands/ingest-finish.ts:45`).
- **Risk:** Shared files. STORY-008-01 and STORY-007-05 edit `src/commands/ingest-finish.ts` and `src/ingest/report.ts` (007-05 also `test/ingest/report.test.ts`) before this story.
- **Mitigation:** Merge order 008-01, 007-05, 008-02 (brief, shared files). This story's hunks are the refusal branch, the two report objects and one `formatReport` line. Cited lines are those at 6b75807.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Several successful ways for a line to leave a page: move to its archive file, merge into another page, rename, move the page whole. |
| Interfaces | T | The finish JSON (`details`, `data.archived`) and the human message and report line. |
| Data | T | BOM, CRLF and layout differences in the archive copy; archive frontmatter shapes; a fact-less archive page. |
| Rules | T | One scenario per conservation rule, each with its breach, plus the frontmatter and citation rule for archive pages. |

Fixtures: the ingest is `src-2026-10-18-cleanup`, applied (FLASHCARD #test-harness #ingest). Every live page a writer creates or updates cites `[[src-2026-10-18-cleanup]]` (FLASHCARD #test-harness #finish); archive pages do not, unless a row says so. Fact lines:
- A0 `- 2026-08-01 · tentative · Atlas ships 2026-09-30. [[src-2026-08-01-plan]]`
- A00 `- 2026-08-20 · decided · Atlas beta opens 2026-09-01. [[src-2026-08-20-plan]]`
- A1 `- 2026-09-01 · tentative · Atlas ships 2026-10-15. [[src-2026-09-01-plan]]`
- A2 `- 2026-10-10 · decided · Atlas ships 2026-11-03. [[src-2026-10-10-review]]`
- B1 `- 2026-09-15 · decided · The design lead runs the design reviews. [[src-2026-09-15-org]]`
- B2 `- 2026-09-20 · decided · The design lead works remotely. [[src-2026-09-20-org]]`
- C1 `- 2026-09-05 · decided · Beta shipped. [[src-2026-09-05-release]]`

"Refused" means: exit 1, `error.code` `validation_failed`, the lock and the snapshot kept, and no ingest log event for the source.

```gherkin
Feature: Fact conservation at ingest finish

  @rules @paths
  Scenario: Error — a line dropped without archiving is refused, and accepted once it is in its page's archive file
    Given pages/projects/atlas.md has frontmatter "type: project" and, under "## Facts", A1 and A2, and archive/ does not exist
    And since apply the writer removed A1 from pages/projects/atlas.md, which keeps A2 and cites the ingest, and wrote nothing under archive/
    When I run "wikeeper ingest finish src-2026-10-18-cleanup --json"
    Then it is refused, error.message contains "fact lines dropped", "a clean-up moves it unchanged to archive/<same path>" and "projects/atlas.md", error.details.dropped is [{ path: "projects/atlas.md", line: A1 }] and error.details.archived_dropped is []
    When the writer writes archive/projects/atlas.md with frontmatter "type: project" and A1 unchanged
    And I run "wikeeper ingest finish src-2026-10-18-cleanup --json"
    Then the exit code is 0, data.updated is ["projects/atlas.md"] and data.archived is { facts: 1, pages: 0 }
    And json.warnings contains ".wiki/pages/sources/src-2026-10-18-cleanup.md is missing"

  @rules @paths
  Scenario Outline: A deleted page's fact lines must survive in pages/ or archive/
    Given pages/people/design-lead.md has frontmatter "type: person" and the fact lines B1 and B2, and pages/people/designer.md has frontmatter "type: person" and <designer>
    And since apply the writer deleted pages/people/design-lead.md and <change>
    When I run "wikeeper ingest finish src-2026-10-18-cleanup --json"
    Then <result>

    Examples:
      | designer              | change                                                                                     | result                                                                                                             |
      | no fact line     | added B1 and B2 unchanged to pages/people/designer.md                                           | the exit code is 0, data.deleted is ["people/design-lead.md"] and data.archived is { facts: 0, pages: 0 }             |
      | no fact line     | wrote pages/people/design-l.md with the deleted page's text and a citation of the ingest      | the exit code is 0, data.created is ["people/design-l.md"] and data.deleted is ["people/design-lead.md"]                 |
      | no fact line     | wrote archive/people/design-lead.md with the deleted page's text unchanged                   | the exit code is 0 and data.archived is { facts: 2, pages: 1 }                                                      |
      | no fact line     | added B1 to pages/people/designer.md and wrote archive/people/design-lead.md with frontmatter "type: person" and B2 | the exit code is 0 and data.archived is { facts: 1, pages: 1 }                                    |
      | B1 and B2        | changed nothing else                                                                       | the exit code is 0 and data.archived is { facts: 0, pages: 0 }                                                      |
      | no fact line     | added B1 to pages/people/designer.md                                                            | it is refused and error.details.dropped is [{ path: "people/design-lead.md", line: B2 }]                              |
      | no fact line     | changed nothing else                                                                       | it is refused, error.message contains "fact lines dropped" and "people/design-lead.md", and error.details.dropped is [{ path: "people/design-lead.md", line: B1 }, { path: "people/design-lead.md", line: B2 }] |
      | no fact line     | added B1 and B2 to pages/people/designer.md, and .wiki/.snapshots/src-2026-10-18-cleanup/pages/people/design-lead.md was removed | the exit code is 1, error.code is "snapshot_missing", error.message contains "people/design-lead.md" and "wikeeper ingest abort", and the lock is kept |

  @rules
  Scenario Outline: No fact line leaves archive/
    Given pages/projects/atlas.md has A1 and A2, archive/projects/atlas.md has frontmatter "type: project" and A0 and A00, and archive/notes/kickoff.md has frontmatter "type: meeting" and no fact line, all before apply
    And since apply the writer <change>
    When I run "wikeeper ingest finish src-2026-10-18-cleanup --json"
    Then <result>

    Examples:
      | change                                                                                                              | result                                                                                                                                                         |
      | removed A0 from archive/projects/atlas.md                                                                           | it is refused, error.message contains "archived fact lines dropped" and "archive/projects/atlas.md", error.details.archived_dropped is [{ path: "projects/atlas.md", line: A0 }] and error.details.dropped is [] |
      | deleted archive/projects/atlas.md                                                                                   | it is refused and error.details.archived_dropped is [{ path: "projects/atlas.md", line: A0 }, { path: "projects/atlas.md", line: A00 }]                        |
      | added A0 to pages/projects/atlas.md and removed it from archive/projects/atlas.md                                   | it is refused and error.details.archived_dropped is [{ path: "projects/atlas.md", line: A0 }]                                                                  |
      | renamed archive/projects/atlas.md to archive/projects/atlas-platform.md, text unchanged                             | it is refused and error.details.archived_dropped is [{ path: "projects/atlas.md", line: A0 }, { path: "projects/atlas.md", line: A00 }]                        |
      | deleted archive/notes/kickoff.md                                                                                    | it is refused, error.details.archived_dropped is [{ path: "notes/kickoff.md", line: "" }] and error.message contains "archive/notes/kickoff.md (page deleted)" |
      | added A0 to pages/projects/atlas.md, kept it in the archive, and appended a copy of A1 to archive/projects/atlas.md | the exit code is 0 and data.archived is { facts: 0, pages: 0 }                                                                                                 |
      | removed A0 from archive/projects/atlas.md, and .wiki/.snapshots/src-2026-10-18-cleanup/archive/projects/atlas.md was removed | the exit code is 1, error.code is "snapshot_missing" and error.message contains "archive/projects/atlas.md"                                          |
      | removed A0 from archive/projects/atlas.md, with snapshot.json rewritten without its "archive" key and the archive copy removed, as wikeeper 0.3.0 left it | the exit code is 0: an older snapshot has no archive copy to compare with (R10) |

  @rules @data
  Scenario Outline: The archive file must hold the identical line and valid frontmatter, but not this ingest's citation
    Given pages/projects/atlas.md has frontmatter "type: project" and A1 and A2
    And since apply the writer removed A1 from pages/projects/atlas.md, which <cites>, and wrote <file> with <frontmatter>, <line> and no link to [[src-2026-10-18-cleanup]]
    When I run "wikeeper ingest finish src-2026-10-18-cleanup --json"
    Then <result>

    Examples:
      | cites                      | file                              | frontmatter                 | line                                                          | result                                                                                                                                                                          |
      | cites the ingest           | archive/projects/atlas.md         | frontmatter "type: project" | A1 with a BOM, CRLF line endings, "*" as marker, doubled spaces | the exit code is 0 and data.archived is { facts: 1, pages: 0 }                                                                                                                  |
      | cites the ingest           | archive/projects/atlas.md         | no frontmatter block        | A1 unchanged                                                  | the exit code is 0                                                                                                                                                              |
      | cites the ingest           | archive/projects/old-atlas.md     | frontmatter "type: project" | A1 unchanged                                                  | it is refused, error.details.dropped is [{ path: "projects/atlas.md", line: A1 }] and error.details.archived_dropped is []                                                      |
      | cites the ingest           | archive/projects/atlas.md         | frontmatter "type: project" | A1 with "tentative" changed to "decided"                      | it is refused and error.details.dropped is [{ path: "projects/atlas.md", line: A1 }]                                                                                            |
      | cites the ingest           | archive/projects/atlas.md         | frontmatter "summary: a: b" | A1 unchanged                                                  | it is refused, error.details.invalid is one entry with path "archive/projects/atlas.md" and a message starting "line 2: invalid frontmatter YAML: ", error.details.uncited is [] and error.details.dropped is [] |
      | cites the ingest           | archive/projects/atlas.md         | frontmatter "title: 1"      | A1 unchanged                                                  | it is refused and error.details.invalid is [{ path: "archive/projects/atlas.md", message: "frontmatter field \"title\" must be a string or null" }]                          |
      | no longer cites the ingest | archive/projects/atlas.md         | frontmatter "type: project" | A1 unchanged                                                  | it is refused, error.details.uncited is ["projects/atlas.md"] and error.details.invalid is []                                                                                  |

  @interfaces @rules
  Scenario Outline: The finish report counts what moved to the archive
    Given pages/projects/atlas.md has A1 and A2, pages/projects/beta.md has frontmatter "type: project" and C1, pages/notes/kickoff.md has frontmatter "type: meeting" and no fact line, and pages/team.md exists
    And since apply the writer <change>
    When I run "wikeeper ingest finish src-2026-10-18-cleanup --json"
    Then the exit code is 0 and data.archived is <archived>
    And in a second repository with the same write phase, "wikeeper ingest finish src-2026-10-18-cleanup" prints <line>

    Examples:
      | change                                                                                                                                   | archived              | line                                                                                     |
      | appended a fact line citing the ingest to pages/team.md                                                                                  | { facts: 0, pages: 0 } | no line starting with "   archived"                                                      |
      | moved A1 unchanged to archive/projects/atlas.md                                                                                          | { facts: 1, pages: 0 } | "   archived 1 fact line · 0 pages" directly after the line starting "   created "         |
      | moved A1 and A2 unchanged to archive/projects/atlas.md and moved pages/projects/beta.md whole to archive/projects/beta.md                 | { facts: 3, pages: 1 } | "   archived 3 fact lines · 1 page" directly after the line starting "   created "         |
      | moved pages/notes/kickoff.md whole to archive/notes/kickoff.md                                                                           | { facts: 0, pages: 1 } | "   archived 0 fact lines · 1 page" directly after the line starting "   created " (Q2)    |
      | moved A1 unchanged to archive/projects/atlas.md, and an ingest log event for the source was already written (an earlier finish stopped after logging) | { facts: 0, pages: 0 }, and json.warnings contains "already recorded" | no line starting with "   archived" |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch copy of the testbed (`testbed.md`, Making a scratch copy), run a chat-excerpt clean-up (`wikeeper ingest start -` with "archive the replaced Atlas dates"), and in its write phase cut one replaced fact line, an earlier atlas GA date from `products/atlas.md` (testbed.md "Superseded facts"), into `archive/<same path>`. Run `finish` and read the report's `archived` line. Then, in a second clean-up, delete a page without moving its lines, and read the refusal and its hint.
- [ ] In the same copy, remove a line from an archive page during an ingest, read the `archived fact lines dropped` refusal, then run `wikeeper ingest abort <id>`.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/ingest/validate.ts` |
| Related Files | `src/commands/ingest-finish.ts`, `src/ingest/report.ts` |
| Test Files | `test/ingest/ingest-follow-ups.test.ts`, `test/ingest/report.test.ts` |
| Test Files (new) | `test/ingest/conservation.test.ts`, `test/ingest/conservation.red.node.test.ts` |
| Re-scoped red tests (QA-Red) | `test/ingest/ingest-follow-ups.red.node.test.ts` |
| New Files Needed | `test/ingest/conservation.test.ts`, `test/ingest/conservation.red.node.test.ts` |

- **Notes on the files above:**
  - `test/ingest/conservation.red.node.test.ts` is QA-Red's file: the five scenarios.
  - `test/ingest/ingest-follow-ups.test.ts` (Developer, STORY-003-12): the test "does not check created pages, deleted pages or non-md files" (`:65`) no longer holds for deleted pages. It becomes "does not check created pages or non-md files", and the deleted-page cases move to `test/ingest/conservation.test.ts`.
  - `test/ingest/report.test.ts`: the `base` literal gains `archived: { facts: 0, pages: 0 }`, and the line test stays as STORY-007-05 leaves it (five lines, with its `wiki ≈` line; no `archived` line at zero).
  - `test/ingest/ingest-follow-ups.red.node.test.ts` is re-scoped only after §1.4 Q1 is approved: one test, "deleted page: accepted and reported" (`:172`), gains the `archive/roadmap.md` write. STORY-007-03 re-scopes a different test in the same file ("STORY-003-12 S3 approval request is a question", `:234`); each QA-Red edits only its own test by name, in either merge order (consistency audit, 2026-10-18).
- **Read, not edited:** `src/ingest/diff.ts` (`PageDiff`, `TreeDiff`, K9), `src/ingest/snapshot.ts` (`snapshotDir`), `src/core/paths.ts` (`archiveDir`), `src/wiki/parse-page.ts` (`parsePage`, `loadPages`, `Fact`), `src/core/text.ts` (`stripBom`).
- **Red tests that must pass unchanged:** `test/ingest/finish-frontmatter.red.node.test.ts` (its three-key `PageDiff` literal at `:228`, no deletions), `test/ingest/finish.red.node.test.ts`, every other row of `test/ingest/ingest-follow-ups.red.node.test.ts`, and STORY-008-01's `test/ingest/archive-write-phase.red.node.test.ts`.

### 3.2 Technical Logic
- **`validateIngest`** keeps its signature and stays read-only. Order:
  1. **Pages created ∪ updated** (today's loop at `src/ingest/validate.ts:53`). For updated pages, collect the snapshot keys missing from the page now, as today. Then, only when some are missing, read `archive/<p>` (`ENOENT` means an empty key set) and split them: held → `archived.facts += 1`; not held → `dropped`. The frontmatter and citation checks are unchanged.
  2. **Pages deleted.** If any `.md` is listed, build `livePages` and `archivePages` once: `Set`s of `factKey` over `loadPages(paths.pagesDir)` and `loadPages(paths.archiveDir)`. For each deleted `.md`, parse the snapshot copy (`snapshot_missing` if unreadable) and take its distinct keys: in `livePages` → kept; else in `archivePages` → `archived.facts += 1`; else → `dropped`. Then `archived.pages += 1` when `<p>` is in `archive.created` or `archive.updated`.
  3. **Archive created ∪ updated.** Parse each `.md` file from `paths.archiveDir`; frontmatter errors (`FRONTMATTER_CODES`) → `invalid` with `path: "archive/" + rel`. No `citesSource`.
  4. **Archive updated and deleted.** Read `path.join(snapshotDir(paths, sourceId), "archive", …rel.split("/"))`. For updated files, missing keys → `archived_dropped`. For deleted files, every fact → `archived_dropped`, or one `{ path: rel, line: "" }` when the copy has no fact.
  5. Sort `dropped` and `archived_dropped` stably by path; within a page, entries keep snapshot order. `ok` adds `archived_dropped.length === 0`.
- **Helpers.** One local `snapshotFacts(file, rel, label)` reads a snapshot copy and returns `{ facts, lines }` (lines split as today, `stripBom(text).split(/\r?\n/)`), or throws `snapshot_missing`. Updated pages, deleted pages and both archive cases use it. One `keysOf(page)` returns a `Set` of `factKey`. Don't add a second identity function.
- **`ingest finish`.**
  - The refusal branch (`src/commands/ingest-finish.ts:163`) gets the new hint and the new `archived fact lines dropped` part (R8), and `details.archived_dropped`.
  - The success report (`:242`) gets `archived: v.archived`; the re-run report (`:107`) gets `archived: { facts: 0, pages: 0 }`.
- **`report.ts`.** One field on `IngestReport`. `formatReport` inserts the line after the counts line (index 3) when `facts > 0 || pages > 0`. On a tree where STORY-007-05 has added its `wiki ≈` line, the `archived` line goes between them.
- **Fixtures.** Build each repository with `init`, `registerSource`, `writeFacts` and `ingest apply`, as `test/ingest/ingest-follow-ups.red.node.test.ts` does. Write the "before apply" archive files before `apply`, so the snapshot copies them (STORY-008-01). Read warnings from top-level `json.warnings` (FLASHCARD #test-harness #finish). Write a BOM as `﻿` in literals (FLASHCARD #encoding #bom).

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper ingest finish <id>` | CLI | None | `--json` | success: `IngestReport` with `archived: { facts, pages }`; error `validation_failed` with `details: { uncited, outside, invalid, dropped, archived_dropped }` |

```ts
// src/ingest/validate.ts
export interface IngestValidation {
  ok: boolean;
  uncited: string[];
  outside: string[];
  invalid: Array<{ path: string; message: string }>;          // archive pages as "archive/<path>"
  dropped: Array<{ path: string; line: string }>;             // K10: also deleted pages; relative to pages/
  archived_dropped: Array<{ path: string; line: string }>;    // K10: relative to archive/; line "" = fact-less page deleted
  archived: { facts: number; pages: number };                 // additive to K10, owned here
  warnings: string[];
}
export function validateIngest(                               // signature unchanged
  paths: ResolvedPaths, sourceId: string, diff: PageDiff, outside: { modified: string[]; deleted: string[] },
): Promise<IngestValidation>;

// src/ingest/report.ts
export interface IngestReport { /* … */ archived: { facts: number; pages: number } } // K10
```

Consumed (K9, STORY-008-01): `ResolvedPaths.archiveDir`; `PageDiff.archive?: TreeDiff` (relative to `archive/`, always set by `diffPages`); the snapshot copy under `<snapshot>/archive`.

Deviations from K10: `IngestValidation.archived` is additive; the report line also shows when only pages moved (§1.4 Q2, pending).

## Task Breakdown

- [ ] `validate.ts`: `snapshotFacts`, `keysOf`, rule 1 with the archive lookup and counts -> R1, R2, R7
- [ ] `validate.ts`: rule 2 over deleted pages with the survivor sets -> R3, R7
- [ ] `validate.ts`: archive frontmatter, rule 3 for updated and deleted archive pages, `ok` -> R4, R5, R6
- [ ] `ingest-finish.ts`: hint, `archived fact lines dropped` part, `details.archived_dropped`, `archived` in both reports -> R8, R9
- [ ] `report.ts`: `archived` field and line -> R9, R10
- [ ] Developer tests: `test/ingest/conservation.test.ts`, the `:65` change in `test/ingest/ingest-follow-ups.test.ts`, the `base` literal in `test/ingest/report.test.ts` -> §4.1
- [ ] QA-Red: `test/ingest/conservation.red.node.test.ts` (five scenarios) and, once Q1 is approved, the one-test re-scope of `test/ingest/ingest-follow-ups.red.node.test.ts:172` -> §2.1

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 8 | rule 1: a line in `archive/<same path>` is archived, one in another archive path is dropped, layout/BOM/CRLF ignored; rule 2: a merged, renamed, duplicated or archived line survives, a missing one is dropped, and a deleted page without a snapshot copy throws `snapshot_missing`; rule 3: a removed, a moved and a deleted archive line, and a fact-less deleted archive page (`line: ""`); archive frontmatter errors carry `archive/<path>` and archive pages skip the citation check; counts for a page moved whole, a fact-less page moved whole, and lines merged into a live page (not counted); a `diff` without `archive` is treated as empty; `formatReport` prints the line for (1, 0), (0, 1) and (3, 1) and not for (0, 0); the re-run report has zero counts |
| Integration tests | 0 | Temp directories only; no external service. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`, in QA-Red's `test/ingest/conservation.red.node.test.ts`. Red-test hygiene: every refusal row asserts `error.code`, the envelope's `command` (`ingest finish`), and both `error.details.dropped` and `error.details.archived_dropped` by value, never only the message, because `archived fact lines dropped` contains `fact lines dropped`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The red tests listed in §3.1 pass unchanged, and this story changes `test/ingest/ingest-follow-ups.red.node.test.ts` only inside "deleted page: accepted and reported" (Q1); STORY-007-03's re-scope of another test in that file is its own.
- [ ] `npm run typecheck` passes.
- [ ] A write phase with no archive file and no deleted page gives the same `finish` output as before this story, apart from `data.archived` (R10).
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/ingest/validate.ts:44` — `validateIngest`; its loop (`src/ingest/validate.ts:53`) reads only created and updated pages, and the dropped check for updated pages (`src/ingest/validate.ts:57`) is the base for all three rules.
- **Surface:** `src/ingest/validate.ts:32` — `factKey`, the fact identity reused unchanged; `src/ingest/validate.ts:36` — `citesSource`, not applied to archive pages.
- **Surface:** `src/wiki/parse-page.ts:203` — `parsePage` (BOM stripped and CRLF split at `src/wiki/parse-page.ts:204`); `src/wiki/parse-page.ts:443` — `loadPages`, for the survivor sets.
- **Surface:** `src/commands/ingest-finish.ts:156` — the `validation_failed` branch, with the dropped part at `src/commands/ingest-finish.ts:163` and `details` at `src/commands/ingest-finish.ts:173`; the re-run report at `src/commands/ingest-finish.ts:107` and the report at `src/commands/ingest-finish.ts:242`.
- **Surface:** `src/ingest/report.ts:7` — `IngestReport`; `src/ingest/report.ts:38` — `formatReport`, with the counts line at `src/ingest/report.ts:44`.
- **Surface:** `src/ingest/diff.ts:21` — `diffPages`, which STORY-008-01 extends with `archive` (K9).
- **Coverage of this requirement:** ≥80% extension — the snapshot copies, the parser, the identity and the refusal path exist; the new parts are the lookups in the archive and the survivor sets, and the archive rule.

## Prior work

- [[EPIC-008]] (parent, approved 2026-10-18). Relaxes the `fact lines dropped` refusal of [[CR-003]] (B1) and [[STORY-003-12]] (fact identity and its two Gate 1 decisions) into the conservation rule. Builds on [[STORY-008-01]] (K9: archive path, snapshot copy, diff) and [[STORY-003-09]] (`finish` validation, the report). [[STORY-005-03]] owns `page_hashes`; this story does not touch it. Shares the report with [[EPIC-007]]'s STORY-007-05. The duplicate check (cleargate-wiki-query, 2026-10-18) found nothing that overlaps beyond [[EPIC-007]], [[EPIC-008]] and [[SPIKE-003]].

## Why not simpler?

- **Smallest existing surface that could carry this:** the dropped check in `validateIngest` (`src/ingest/validate.ts:57`) with the snapshot copies `apply` already writes.
- **Why isn't extension / parameterization / config sufficient?** This story is that extension. A config switch that turns the dropped check off would let a full-page rewrite lose facts silently, which is why [[CR-003]] made it a refusal. Checking only "the line is somewhere in the wiki" would accept moves between live pages, which STORY-003-12's approved decision refuses, and would not keep the archive mirroring `pages/`. The three rules are the smallest set that meets EPIC-008 §2. They reuse the existing identity, parser and refusal path, and add no storage.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (EPIC-008 §0 names `validate.ts`, `report.ts` and `ingest-finish.ts`; `archiveDir` and `PageDiff.archive` come from STORY-008-01 in this sprint, per the decomposition brief.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1: the human approved every §1.4 recommendation on 2026-10-18 (`plans/gate1-decisions.md`).
