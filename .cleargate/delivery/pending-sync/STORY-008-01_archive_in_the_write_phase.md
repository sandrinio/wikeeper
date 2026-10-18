---
story_id: STORY-008-01
parent_epic_ref: EPIC-008
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-008 (approved 2026-10-18) §0 rules, §2 (write phase covers archive/), §3 (compatibility), §5 (abort scenario), §6 · SPRINT-04 decomposition brief (2026-10-18): scope 008-01, contract K9 (owner), K10 and K12 (consumers) · verified at 6b75807: src/core/paths.ts, src/core/config.ts (content_dir), src/commands/hook.ts, src/agents/hook-protocols.ts, src/ingest/snapshot.ts, src/ingest/diff.ts, src/ingest/log.ts, src/commands/ingest-apply.ts, src/commands/ingest-abort.ts, src/commands/ingest-finish.ts, src/lint/unlogged.ts · tests test/paths.red.node.test.ts, test/ingest/lock-snapshot.red.node.test.ts, test/ingest/finish.test.ts, test/ingest/finish-frontmatter.red.node.test.ts, test/ingest/ingest-apply-abort.red.node.test.ts, test/agents/hook-guard.red.node.test.ts, test/ingest/log.test.ts · FLASHCARD 2026-10-17 #snapshot #fs, #paths #ingest, #test-harness #ingest"
actor: AI coding agent
complexity_label: L3
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T07:52:12Z
updated_at: 2026-10-18T07:52:12Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T07:57:19Z
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
  last_stamp: 2026-10-18T11:48:52Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-18T07:42:57Z
---

# STORY-008-01: The archive in the write phase: path, guard, snapshot, abort, diff, archive hashes
**Complexity:** L3 — small edits in eight source files, each repeating for a second tree what the write phase already does for `pages/`: the path, the guard, the snapshot copy, restore, the diff and the hashes in the log. No in-sprint upstream. It owns contract K9, which STORY-008-02 (conservation), 008-03 (index, search), 008-04 (lint) and 008-05 (status, housekeeping) consume. STORY-007-05 and STORY-008-02 edit `src/commands/ingest-finish.ts` after this story. It adds no check on what the archive holds: that is STORY-008-02.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent running a clean-up the user asked for, I want `archive/` to be part of the write phase (blocked outside an ingest, copied at `apply`, restored by `abort`, listed by `finish` and hashed in the log), so that moving fact lines into it is as safe and as traceable as writing pages.

### 1.2 Detailed Requirements
- **R1 — Path (K9).** `ResolvedPaths` gains `archiveDir`, after `pagesDir`: `path.join(contentDir, "archive")`. It follows `content_dir` like `pages/`, `raw/` and `log/`: `.wiki/archive` by default, `wiki/archive` with `content_dir: wiki`, `<root>/archive` with `content_dir: .`. Nothing creates the folder (`init` and `update` are unchanged), and every reader in this story treats a missing folder as empty.
- **R2 — Guard.** `runGuard` (`src/commands/hook.ts:51`) treats `archive/` like `pages/`: a write whose target is inside `pagesDir` or inside `archiveDir` is denied while `.wiki/.lock` does not exist, for all three agents, with the same `GUARD_REASON`; while the lock exists both are allowed. `isInside` is strict, so the `archive` folder itself and a sibling such as `archive-old/` are not guarded. `GUARD_REASON` and the `hook guard` description stay as they are.
- **R3 — Snapshot (K9).** `takeSnapshot` (`src/ingest/snapshot.ts:71`):
  - copies `archiveDir` to `<snapshot>/archive` with the same symlink filter as `pages/` (FLASHCARD #snapshot #fs);
  - always creates `<snapshot>/archive`, also when `archive/` does not exist;
  - writes `archive` into `snapshot.json` after `pages`: `hashTree` of the copy, paths relative to `archive/` (POSIX) → sha256.

  `readSnapshot` (`src/ingest/snapshot.ts:109`):
  - a `snapshot.json` without an `archive` key (taken before this version) gives `archive: {}`;
  - an `archive` value that is not a string map, or an `archive` key without a `<snapshot>/archive` directory, gives `null`, as a bad `pages` does.
- **R4 — Apply.** `ApplyData.snapshot` gains `archive: number`, the number of files in the archive copy (0 for an older snapshot), beside `pages`. The `apply` description becomes `open the write phase for a source: take the lock, snapshot pages/ and archive/, print the facts`, and the `snapshot_failed` message becomes `could not snapshot pages/ and archive/: <reason>`.
- **R5 — Restore (K9).** `restoreSnapshot` (`src/ingest/snapshot.ts:136`) restores `archive/` the way it restores `pages/`:
  - files changed or deleted since the snapshot are copied back;
  - files that are not in the snapshot are removed;
  - subfolders emptied by a removal are removed, up to but not including `archive/` itself.

  The return value gains `archive: { restored: string[]; removed: string[] } | null`, sorted, relative to `archive/`. It is `null` when the snapshot has no `<snapshot>/archive` directory, and then `archive/` is left as it is (§1.4 Q1).
- **R6 — Abort.** `ingest abort` (`src/commands/ingest-abort.ts`):
  - `data.archive` is `{ restored, removed }`: empty lists when nothing changed or the snapshot is older;
  - the human line gains `, archive/: <n> restored, <m> removed` before the `--drop` part, only when n + m > 0. Example: `aborted src-2026-10-18-cleanup: 1 page restored, 0 removed, archive/: 1 restored, 1 removed`;
  - an older snapshot adds the warning `the snapshot of <id> was taken by an older wikeeper, so archive/ was not restored: run wikeeper lint to find archive files this ingest left`;
  - the abort log event gains `archive_restored?: string[]` (archive restored ∪ removed, sorted), written only when it is non-empty. `restored` stays pages-only;
  - `ABORT_HELP` starts `After apply, abort restores pages/ and archive/ from the snapshot and releases the lock.`; the rest of the text is unchanged;
  - the warning `snapshot missing; pages were not restored` is unchanged (a red test pins it).
- **R7 — Diff (K9, one deviation).** `src/ingest/diff.ts` exports `TreeDiff { created; updated; deleted }`, and `PageDiff` becomes `TreeDiff & { archive?: TreeDiff }`. `diffPages` (`src/ingest/diff.ts:21`) always sets `archive`: `snapshot.archive` against `hashTree(paths.archiveDir)`, with the same dot-segment filter and sort as pages, paths relative to `archive/`. The field is optional in the type only. Readers treat a missing `archive` as empty. The reason: the immutable red test `test/ingest/finish-frontmatter.red.node.test.ts:228` passes a three-key `PageDiff` literal to `validateIngest`, and `npm run typecheck` (`tsc --noEmit`) covers `test/`.
- **R8 — Archive writes are not outside writes.** `hashOutside` (`src/ingest/snapshot.ts:58`) hashes `index.md`, `log/` and `raw/`. `archiveDir` is a sibling of `pages/`, `raw/` and `log/` for every `content_dir`, so it is never inside a hashed tree and no code change is needed. Tests pin it for the default config, `content_dir: wiki` and `content_dir: .`.
- **R9 — Archive hashes (K9).** `IngestLogEvent` gains `archive_hashes?: Record<string, string>`:
  - one entry per created or updated `.md` file in `diff.archive`;
  - keys relative to `archive/` (POSIX, sorted);
  - values from `pageHash(text)` (`src/lint/unlogged.ts:19`: BOM and CRLF ignored).

  `finish` computes them next to `page_hashes` (`src/commands/ingest-finish.ts:184`) and passes the field only when it has an entry, so an ingest that writes no archive file logs the same bytes as today (EPIC-008 §3, compatibility). In `src/ingest/log.ts`:
  - `"archive_hashes"` goes after `"page_hashes"` in `KEY_ORDER.ingest`;
  - `"archive_restored"` goes after `"restored"` in `KEY_ORDER.abort`;
  - `validate` adds `need(archive_hashes === undefined || isPageHashes(archive_hashes), "archive_hashes")` and `need(archive_restored === undefined || isStrArr(archive_restored), "archive_restored")`.
- **R10 — Ingests applied before the upgrade still finish.** With an older snapshot, `archive` is `{}`, so every archive file counts as created, and finish hashes every archive `.md` file in `archive_hashes`.

### 1.3 Out of Scope
- The conservation rules, archive frontmatter checks, the citation exemption and the report's `archived` counts (STORY-008-02, K10). This story does not edit `src/ingest/validate.ts`, and `finish`'s report, index write and lint hook stay as they are.
- `index.md`, search and the search cache over `archive/` (STORY-008-03, K11).
- Lint over `archive/`, including `unlogged-change` reading `archive_hashes` and the lint hook in `finish` (STORY-008-04, K12).
- `status`, `.gitignore` entries for `private:` pages, `remove` and `--purge` (STORY-008-05, K13).
- Instruction text (WIKI.md, the pointer block line about `.wiki/pages/`) and docs (STORY-008-06).
- Creating `archive/` at `init`, or a check that warns when `content_dir` points at a folder that already has an unrelated `archive/` (§1.5).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1, K9 says "missing in an older snapshot = `{}`"):** What does `abort` do to `archive/` when the snapshot was taken by an older wikeeper and recorded nothing about it? Read literally, `{}` means "the archive was empty", and restore would delete every archive file, including files the user made by hand before the upgrade.
- **Recommended:** Read it as empty for the diff only (R7, R10), so the ingest still finishes. Restore leaves `archive/` as it is and warns (R5, R6), because it has no copy to restore from, and deleting files it never saw cannot be undone. The cost: archive files the writer added during that one write phase stay; no fact line is lost, and STORY-008-04's `unlogged-change` reports them.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2):** `archiveDir` is a new `ResolvedPaths` field, and the immutable red test `test/paths.red.node.test.ts` "resolvePaths with default config returns the full documented set" (`:42`) compares `resolvePaths` with the exact field set. A red test changes only with the human's authorisation. May this story's QA-Red re-scope it?
- **Recommended:** Yes. Add only `archiveDir: path.join(w, "archive")` to that one expected object and change nothing else, as STORY-006-02 did for `projectFile` in SPRINT-02. Dropping the assertion would lose the guard on the documented path set.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q3, `content_dir: .`; consistency audit 2026-10-18, referenced by STORY-008-05):** R1 puts the archive at `<contentDir>/archive`, so with `content_dir: .` it is `<repo>/archive/`, a common folder name. `pages/` has the same exposure today: with `content_dir: .`, `remove --purge` already deletes `<root>/pages`, `<root>/raw`, `<root>/log`, `<root>/index.md` and `<root>/log.md` (`src/commands/remove.ts:213`–`:227`), and the guard blocks writes under `<root>/pages/` outside an ingest. The difference is timing: a user's own `pages/` is wiki content from `init` on, while a user's own `archive/` is adopted silently when a 0.3.x wiki moves to 0.4.0. From then on it is guarded (R2), copied at every `apply` (R3), searched by `search --archive` (STORY-008-03), counted in `status` (STORY-008-05), reported file by file by `wikeeper lint` as `unlogged-change` errors (STORY-008-04), and deleted by `remove --purge` (STORY-008-05 R7).
- **Recommended:** Keep `<contentDir>/archive` for every layout (K9 as written), like `pages/`, `raw/` and `log/`, and add no code. The adoption shows at once: the first `wikeeper lint` names every adopted `.md` file `in no ingest log event`. `--purge` needs the confirmation word and names `archive/` in its help (STORY-008-05 R7), and architecture.md §4 says `archive/` under `content_dir` belongs to the wiki (STORY-008-06 R8 (a)). The default `content_dir: .wiki` cannot collide. Alternative, if the human wants a guard: `wikeeper update` and `doctor` warn when `content_dir` is outside `.wiki/` and `<contentDir>/archive` holds files that no ingest event's `archive_hashes` records; that adds a doctor check and an `update` warning to this story.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

Decided while drafting (not open):
- `archive_hashes` and `archive_restored` are written only when non-empty, so wikis that never use the archive log the same bytes as today (EPIC-008 §3). STORY-008-04 needs no baseline marker: no ingest before this version could record an archive file.
- `PageDiff.archive` is optional in the type, for the reason in R7.
- `archive/` itself is kept after a restore, as `pages/` is. An empty folder is invisible to git, and every reader treats missing and empty alike.

- **DRAFTS review (designer, 2026-10-18):** wording aligned with docs/ux.md — the older-snapshot warning names its next step (`the snapshot of <id> was taken by an older wikeeper, so archive/ was not restored: run wikeeper lint to find archive files this ingest left`; R6; §2.1 scenario 4's "archive/ was not restored" still holds). No decision changed.

### 1.5 Risks

- **Risk:** The archive only grows, and `apply` copies all of it on every ingest.
- **Mitigation:** The copy has the same cost class as the `pages/` copy (`fs.cp`, local disk), and EPIC-008 §3 states no performance budget. Manual verification (§2.2) times `apply` on a scratch copy of the testbed (`.cleargate/sprint-runs/SPRINT-04/testbed.md`) with a 200-file `archive/`. If it is slow, a later change can copy only the archive files that change.
- **Risk:** With `content_dir: .` or a content folder that already holds an unrelated `archive/` folder, that folder becomes the wiki archive: guarded, snapshotted, and searched by `search --archive` (STORY-008-03).
- **Mitigation:** §1.4 Q3. The same is already true for `pages/`, `raw/` and `log/` there. The default content folder `.wiki` cannot collide. STORY-008-06 names the folder in architecture.md §4.
- **Risk:** Between this story's merge and STORY-008-02's, `finish` accepts any archive change unchecked.
- **Mitigation:** Both land in SPRINT-04; 008-02 depends on this story, and no release happens before Gate 4.
- **Risk:** Shared files. STORY-007-05 and STORY-008-02 edit `src/commands/ingest-finish.ts` after this story.
- **Mitigation:** This story lands first (brief, shared files). Its `finish` hunk is one loop and one field next to `page_hashes`; cited lines are those at 6b75807.
- **Risk:** Hand-built `ResolvedPaths` literals in tests lack `archiveDir`, for example `test/settings-reports.red.node.test.ts:84` (`as never`). A consumer that reads `paths.archiveDir` from such a literal gets `undefined`. STORY-008-05's `managedIgnoreEntries` is the case.
- **Mitigation:** This story's code reads `archiveDir` only from `resolvePaths` results. STORY-008-05 §1.4 Q2 re-scopes `test/settings-reports.red.node.test.ts` (the literal gains `archiveDir`, the private-entry expectation gains its mirror), pending the human's authorisation.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Two ways out of a write phase that touched the archive: `abort` restores both trees, `finish` lists and hashes the archive changes. |
| Interfaces | T | The guard for three agents' payloads; `abort` and `apply` in JSON and human output. |
| Data | T | A snapshot from this version against one from an older wikeeper; `content_dir` layouts. |
| Rules | T | The guard rule for `archive/`; archive writes are not outside writes. |

Fixtures: the source id is `src-2026-10-18-cleanup` (FLASHCARD #test-harness #ingest). `pages/projects/atlas.md` has frontmatter `type: project`, `title: Atlas` and, under `## Facts`, the lines A1 `- 2026-09-01 · tentative · Atlas ships 2026-10-15. [[src-2026-09-01-plan]]` and A2 `- 2026-10-10 · decided · Atlas ships 2026-11-03. [[src-2026-10-10-review]]`. `archive/projects/atlas.md` has the same frontmatter and the line A0 `- 2026-08-01 · tentative · Atlas ships 2026-09-30. [[src-2026-08-01-plan]]`. Every page a writer changes cites `[[src-2026-10-18-cleanup]]` (FLASHCARD #test-harness #finish). Fixtures that run `finish` remove no fact line from `pages/` or `archive/`, so they stay valid under STORY-008-02's rules.

```gherkin
Feature: The archive in the write phase

  @rules @interfaces @data
  Scenario Outline: The guard treats archive/ like pages/
    Given an initialised repository with <config> and <lock>
    When "wikeeper hook guard --agent <agent>" gets a payload that writes "<target>"
    Then the guard <decision>

    Examples:
      | config              | lock          | agent       | target                                    | decision                                                         |
      | the default config  | no .wiki/.lock | claude      | .wiki/archive/projects/atlas.md           | denies with the guard reason (permissionDecision "deny", exit 0) |
      | the default config  | no .wiki/.lock | codex       | .wiki/archive/projects/atlas.md           | denies with the guard reason on stderr and exit 2                |
      | the default config  | no .wiki/.lock | antigravity | .wiki/archive/projects/atlas.md           | denies with decision "deny" and exit 0                           |
      | the default config  | a .wiki/.lock  | claude      | .wiki/archive/projects/atlas.md           | allows with no output                                            |
      | the default config  | no .wiki/.lock | claude      | .wiki/archive-old/atlas.md                | allows with no output                                            |
      | content_dir: wiki   | no .wiki/.lock | claude      | wiki/archive/a.md                         | denies with the guard reason                                     |
      | content_dir: wiki   | no .wiki/.lock | claude      | .wiki/archive/a.md                        | allows with no output                                            |
      | content_dir: .      | no .wiki/.lock | claude      | archive/a.md                              | denies with the guard reason                                     |

  @paths @interfaces
  Scenario: apply copies archive/, and abort restores pages/ and archive/
    Given pages/projects/atlas.md with A1 and A2, archive/projects/atlas.md with A0, and "src-2026-10-18-cleanup" registered with facts
    When I run "wikeeper ingest apply src-2026-10-18-cleanup --json"
    Then the exit code is 0 and data.snapshot.archive is 1
    And .wiki/.snapshots/src-2026-10-18-cleanup/snapshot.json has an "archive" map with the one key "projects/atlas.md"
    And .wiki/.snapshots/src-2026-10-18-cleanup/archive/projects/atlas.md has the text of archive/projects/atlas.md
    When the writer cuts A1 from pages/projects/atlas.md, appends it to archive/projects/atlas.md and writes archive/people/designer/old.md
    And I run "wikeeper ingest abort src-2026-10-18-cleanup --json"
    Then the exit code is 0, and pages/ and archive/ hash as they did before apply
    And archive/people does not exist and archive/ does
    And data.restored is ["projects/atlas.md"] and data.archive is { restored: ["projects/atlas.md"], removed: ["people/designer/old.md"] }
    And the abort log event has restored ["projects/atlas.md"] and archive_restored ["people/designer/old.md", "projects/atlas.md"]
    And the same write phase aborted without --json, in a second repository, prints "aborted src-2026-10-18-cleanup: 1 page restored, 0 removed, archive/: 1 restored, 1 removed"
    And "wikeeper ingest apply --help" contains "snapshot pages/ and archive/" and "wikeeper ingest abort --help" contains "restores pages/ and archive/ from the snapshot"

  @paths @rules
  Scenario: finish lists archive changes, does not count them as outside writes, and logs their hashes
    Given "src-2026-10-18-cleanup" is applied with pages/projects/atlas.md and archive/projects/atlas.md as above
    And since apply the writer appended "- 2026-10-18 · decided · Atlas clean-up agreed. [[src-2026-10-18-cleanup]]" to pages/projects/atlas.md, wrote pages/sources/src-2026-10-18-cleanup.md, appended a copy of A1 to archive/projects/atlas.md, wrote archive/projects/beta.md with frontmatter "type: project" and one fact line, and wrote archive/.DS_Store
    When I run "wikeeper ingest finish src-2026-10-18-cleanup --json"
    Then the exit code is 0 and no error says "changed outside pages/"
    And data.updated is ["projects/atlas.md"] and data.created is ["sources/src-2026-10-18-cleanup.md"]
    And the ingest log event's archive_hashes is { "projects/atlas.md": <pageHash of archive/projects/atlas.md>, "projects/beta.md": <pageHash of archive/projects/beta.md> }
    And its page_hashes has the keys ["projects/atlas.md", "sources/src-2026-10-18-cleanup.md"] only
    When a second ingest "src-2026-10-18-standup" changes only pages/ and finishes
    Then its log event file does not contain "archive_hashes"
    And writeLogEvent of an ingest event with archive_hashes { "a.md": "abc" }, or of an abort event with archive_restored "a.md", throws "invalid_event" and writes no file

  @data @paths
  Scenario Outline: An ingest applied by an older wikeeper still finishes and aborts
    Given archive/projects/atlas.md exists and "src-2026-10-18-cleanup" is applied
    And its snapshot.json is then rewritten <snapshot>
    And since apply the writer appended a line citing "[[src-2026-10-18-cleanup]]" to pages/projects/atlas.md and wrote archive/projects/beta.md with frontmatter "type: project"
    When I run "wikeeper ingest <verb> src-2026-10-18-cleanup --json"
    Then <result>

    Examples:
      | snapshot                                                                                                  | verb   | result                                                                                                                                                                                                 |
      | without the "archive" key, and .wiki/.snapshots/src-2026-10-18-cleanup/archive removed, as wikeeper 0.3.0 left it | finish | the exit code is 0 and the ingest log event's archive_hashes has the keys ["projects/atlas.md", "projects/beta.md"]                                                                     |
      | without the "archive" key, and .wiki/.snapshots/src-2026-10-18-cleanup/archive removed, as wikeeper 0.3.0 left it | abort  | the exit code is 0, pages/projects/atlas.md is as it was at apply, archive/projects/atlas.md and archive/projects/beta.md still exist, data.archive is { restored: [], removed: [] } and json.warnings contains "archive/ was not restored" |
      | with "archive": ["projects/atlas.md"]                                                                     | finish | the exit code is 1 and error.code is "snapshot_missing"                                                                                                                                                |

```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch wiki with Claude Code and `enforce` on: ask the agent to write `.wiki/archive/x.md` with no ingest open (blocked, with the guard reason); then `ingest apply` a chat-excerpt source and write it again (allowed); `ingest abort` removes it.
- [ ] In a scratch copy of the testbed (`testbed.md`, Making a scratch copy), add 200 files under `.wiki/archive/` (copies of its pages), and time `wikeeper ingest apply` and `abort` with and without them. Record both times in the story's QA notes.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/ingest/snapshot.ts` |
| Related Files | `src/core/paths.ts`, `src/commands/hook.ts`, `src/ingest/diff.ts`, `src/ingest/log.ts`, `src/commands/ingest-apply.ts`, `src/commands/ingest-abort.ts`, `src/commands/ingest-finish.ts` |
| Test Files | `test/ingest/finish.test.ts`, `test/ingest/log.test.ts`, `test/paths.test.ts` |
| Test Files (new) | `test/ingest/archive-write-phase.test.ts`, `test/ingest/archive-write-phase.red.node.test.ts` |
| Re-scoped red tests (QA-Red) | `test/paths.red.node.test.ts` |
| New Files Needed | `test/ingest/archive-write-phase.test.ts`, `test/ingest/archive-write-phase.red.node.test.ts` |

- **Notes on the files above:**
  - `test/ingest/archive-write-phase.red.node.test.ts` is QA-Red's file: the four scenarios.
  - `test/ingest/finish.test.ts` (Developer, STORY-003-09) changes in two places: its `SnapshotInfo` literal (`:31`) gains `archive: {}`, and the diff assertion (`:52`) expects `archive: { created: [], updated: [], deleted: [] }`.
  - `test/paths.red.node.test.ts` is re-scoped only after §1.4 Q2 is approved: one key added at `:42`.
- **Read, not edited:** `src/agents/hook-protocols.ts` (`GUARD_REASON`, `resolveTarget`), `src/lint/unlogged.ts` (`pageHash`), `src/core/compare.ts`, `src/commands/doctor.ts` (`plural`).
- **Red tests that must pass unchanged:** `test/ingest/lock-snapshot.red.node.test.ts` (`:94`–`:147`; `restored` and `removed` keep their meaning), `test/ingest/ingest-apply-abort.red.node.test.ts` (S1 reads `snapshot.pages` by key; S4 pins the pages-only `restored` list and the `snapshot missing` warning), `test/agents/hook-guard.red.node.test.ts`, `test/ingest/finish-frontmatter.red.node.test.ts` (R7), `test/ingest/log.red.node.test.ts`.

### 3.2 Technical Logic
- **`paths.ts` (R1).** One field in the interface and one in `resolvePaths`.
- **`hook.ts` (R2).** `const hit = t.paths.some((p) => { const abs = resolveTarget(t.cwd, p); return isInside(paths.pagesDir, abs) || isInside(paths.archiveDir, abs); });`. The lock check after it is unchanged.
- **`snapshot.ts` (R3, R5).**
  - `takeSnapshot`: after the pages copy, `mkdir(<dir>/archive)` and `cp(paths.archiveDir, …)` with the same filter, ignoring `ENOENT`. Then `archive: await hashTree(archiveCopy)`. The key order in `snapshot.json` is `source_id`, `taken_at`, `facts_sha256`, `pages`, `archive`, `outside`.
  - `readSnapshot`: `archive` absent → `{}`; present → `isStringMap` and a `stat` of `<dir>/archive` that is a directory, else `null`.
  - `restoreSnapshot`: move the per-tree work of today's body into a local `restoreTree(liveDir, copyDir, recorded, label)`. It returns `{ restored, removed, failed }`, and its emptied-folder loop stops at `liveDir`. Call it for pages, then, when `<dir>/archive` is a directory, for the archive with `label` `archive/`. Failures of both trees go into the one `restore_failed` error, archive entries named `archive/<path>`, and its message format stays as it is.
- **`diff.ts` (R7).** `diffTree(before, now): TreeDiff` holds today's loop; `diffPages` returns `{ ...diffTree(filtered(snapshot.pages), filtered(await hashTree(paths.pagesDir))), archive: diffTree(filtered(snapshot.archive ?? {}), filtered(await hashTree(paths.archiveDir))) }`. The `?? {}` covers literals built in tests. `diffOutside` is unchanged.
- **`log.ts` (R6, R9).** The two optional fields, the two `KEY_ORDER` entries and the two `need` lines. `orderedFields` already drops `undefined` values when YAML stringifies, so events without the fields keep today's bytes (`test/ingest/log.test.ts:82` is the pattern).
- **`ingest-apply.ts` (R4).** `archive: Object.keys(snap.archive).length` in both `snapshot` branches; the description and the `snapshot_failed` message.
- **`ingest-abort.ts` (R6).** Read `archive` from `restoreSnapshot`. `null` means: push the warning and report empty lists. Build `data.archive` and the human part, and pass `archive_restored` to `writeLogEvent` only when it is non-empty. Change the first sentence of `ABORT_HELP`.
- **`ingest-finish.ts` (R9).** After the `pageHashes` loop (`:185`), loop over `[...diff.archive.created, ...diff.archive.updated].sort(compareCodeUnits)`, skip non-`.md`, read from `paths.archiveDir`, and fill `archiveHashes`. Spread `...(Object.keys(archiveHashes).length > 0 ? { archive_hashes: archiveHashes } : {})` into the event. Nothing else in `finish` changes: validation, the report, the index and the lint hook stay as they are.
- **Fixtures.** Use `runCli` with `io.cwd` (FLASHCARD #qa #test-harness), `writeFacts` and `registerSource` as `test/ingest/ingest-apply-abort.red.node.test.ts` does, and read warnings from the top-level `json.warnings` (FLASHCARD #test-harness #finish). The older-snapshot rows edit `snapshot.json` after `apply`.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper hook guard --agent <a>` | CLI hook | None | agent payload on stdin | deny also for targets inside `archive/` without a lock (R2) |
| `wikeeper ingest apply <id>` | CLI | None | unchanged | `data.snapshot` gains `archive: number` |
| `wikeeper ingest abort <id>` | CLI | None | unchanged | `data.archive: { restored: string[]; removed: string[] }`; abort log event `archive_restored?` |
| `wikeeper ingest finish <id>` | CLI | None | unchanged | unchanged output; ingest log event `archive_hashes?` |

```ts
// src/core/paths.ts
export interface ResolvedPaths { /* … */ pagesDir: string; archiveDir: string; /* … */ } // K9: <contentDir>/archive

// src/ingest/snapshot.ts
export interface SnapshotInfo {
  source_id: string; taken_at: string; facts_sha256: string;
  pages: Record<string, string>;
  archive: Record<string, string>;  // K9: relative to archive/; {} when snapshot.json has no "archive" key
  outside: Record<string, string>;
}
export function restoreSnapshot(paths: ResolvedPaths, sourceId: string): Promise<{
  restored: string[]; removed: string[];
  archive: { restored: string[]; removed: string[] } | null; // additive: null = older snapshot, archive/ untouched
}>;

// src/ingest/diff.ts
export interface TreeDiff { created: string[]; updated: string[]; deleted: string[] }
export interface PageDiff extends TreeDiff {
  archive?: TreeDiff; // K9; always set by diffPages, optional in the type only (R7)
}

// src/ingest/log.ts
export interface IngestLogEvent { /* … */ page_hashes?: Record<string, string>; archive_hashes?: Record<string, string> } // K9
export interface AbortLogEvent { /* … */ restored: string[]; archive_restored?: string[] } // additive, owned here

// src/commands/ingest-apply.ts
export interface ApplyData { /* … */ snapshot: { dir: string; pages: number; archive: number } | null; /* … */ }
```

Deviations from K9, both additive or type-only: `PageDiff.archive` is optional in the type (R7); `restoreSnapshot` gains `archive`, `AbortLogEvent` gains `archive_restored` and `ApplyData.snapshot` gains `archive` (owned here; consumer `ingest abort` and `ingest apply`, in this story).

## Task Breakdown

- [ ] `paths.ts`: `archiveDir` -> R1
- [ ] `hook.ts`: guard `archive/` like `pages/` -> R2
- [ ] `snapshot.ts`: copy, hash and read the archive; `restoreTree` and the archive restore with the older-snapshot `null` -> R3, R5
- [ ] `diff.ts`: `TreeDiff`, `diffTree`, `PageDiff.archive` -> R7, R10
- [ ] `log.ts`: `archive_hashes`, `archive_restored`, key order and validation -> R6, R9
- [ ] `ingest-apply.ts`: `snapshot.archive`, description and message -> R4
- [ ] `ingest-abort.ts`: `data.archive`, human part, warning, `archive_restored`, help text -> R6
- [ ] `ingest-finish.ts`: `archive_hashes` beside `page_hashes` -> R9
- [ ] Developer tests: update `test/ingest/finish.test.ts` (`:31`, `:52`), add to `test/ingest/log.test.ts` and `test/paths.test.ts`, write `test/ingest/archive-write-phase.test.ts` -> §4.1
- [ ] QA-Red: `test/ingest/archive-write-phase.red.node.test.ts` (four scenarios) and, once Q2 is approved, the one-key re-scope of `test/paths.red.node.test.ts:42` -> §2.1

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 8 | `archiveDir` for the default config, `content_dir: wiki` and `content_dir: .`; `takeSnapshot` copies and hashes `archive/`, skips a symlink, and creates an empty copy when `archive/` is missing; `readSnapshot` with no `archive` key, a bad one, and a key without the copy directory; `restoreSnapshot` restores edited, deleted and created archive files, removes emptied subfolders, keeps `archive/`, and returns `archive: null` for an older snapshot without touching `archive/`; `diffPages` archive lists relative to `archive/`, dot files ignored, and `snapshot.archive` missing treated as `{}`; `hashOutside` and `diffOutside` never list an archive file in the three layouts; `writeLogEvent` with `archive_hashes` and `archive_restored` round-trips, refuses malformed values, and writes today's bytes without them; guard `isInside` for `archive/`, `archive` itself and `archive-old/` |
| Integration tests | 0 | Temp directories only; no external service. |
| E2E / acceptance tests | 4 | One per Gherkin scenario (Outline rows counted once), through `runCli`, in QA-Red's `test/ingest/archive-write-phase.red.node.test.ts`. Error and deny rows assert the decision field or `error.code`, not only the exit code. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The red tests listed in §3.1 pass unchanged, and `test/paths.red.node.test.ts` differs from 6b75807 only by the one `archiveDir` key (Q2).
- [ ] `npm run typecheck` passes, including the immutable red tests that build `PageDiff` literals.
- [ ] A wiki with no `archive/` folder writes byte-identical ingest and abort log events (R9).
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/paths.ts:37` — `resolvePaths`, where `pagesDir`, `rawDir` and `logDir` are derived from `contentDir` (`src/core/paths.ts:52`).
- **Surface:** `src/commands/hook.ts:51` — the guard's `isInside(paths.pagesDir, …)` test, followed by the lock check at `src/commands/hook.ts:52`.
- **Surface:** `src/ingest/snapshot.ts:71` — `takeSnapshot` copies `pages/` with the symlink filter; `src/ingest/snapshot.ts:109` — `readSnapshot`; `src/ingest/snapshot.ts:136` — `restoreSnapshot`, whose loop becomes the per-tree helper; `src/ingest/snapshot.ts:58` — `hashOutside` (index, log, raw).
- **Surface:** `src/ingest/diff.ts:21` — `diffPages`, with the dot-segment filter at `src/ingest/diff.ts:13`.
- **Surface:** `src/ingest/log.ts:26` — `page_hashes`, the pattern for `archive_hashes`; `src/ingest/log.ts:63` — `KEY_ORDER`; `src/ingest/log.ts:102` — the `page_hashes` validation.
- **Surface:** `src/commands/ingest-finish.ts:184` — the loop that computes `page_hashes`; `src/commands/ingest-abort.ts:70` — the restore call; `src/commands/ingest-apply.ts:79` — the snapshot call.
- **Surface:** `src/lint/unlogged.ts:19` — `pageHash`.
- **Coverage of this requirement:** ≥80% extension — every step already exists for `pages/`; the new part is running it for a second tree.

## Prior work

- [[EPIC-008]] (parent, approved 2026-10-18). Extends [[STORY-003-08]] (lock, snapshot, `apply`, `abort`), [[STORY-003-09]] (`finish`, the page and outside diffs), [[STORY-002-05]] (the guard) and [[STORY-005-03]] (`page_hashes`, the pattern for `archive_hashes`). [[STORY-003-12]] and [[CR-003]] (B1) gave `finish` the `fact lines dropped` refusal that STORY-008-02 relaxes on top of this story. The duplicate check (cleargate-wiki-query, 2026-10-18) found nothing that overlaps beyond [[EPIC-007]], [[EPIC-008]] and [[SPIKE-003]].

## Why not simpler?

- **Smallest existing surface that could carry this:** the existing `pages/` snapshot: put the archive under `pages/archive/` and get the guard, snapshot, restore and diff for free.
- **Why isn't extension / parameterization / config sufficient?** A folder inside `pages/` would be indexed, searched, linted and cited as live pages by every reader that lists `pages/`, which is what EPIC-008 must avoid. Each of those readers would need an exclusion, and STORY-008-02 could no longer tell a moved line from a line kept on another page. A sibling tree keeps every default reader as it is. This story is that extension: it reuses `hashTree`, the copy filter, the restore loop (as a helper), the diff loop and `pageHash` for the second tree, and it adds no new mechanism.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (EPIC-008 §0 names `paths.ts`, `snapshot.ts`, `diff.ts` and `ingest-finish.ts`; `hook.ts`, `log.ts`, `ingest-apply.ts` and `ingest-abort.ts` are verified codebase grounding named by the decomposition brief.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1: the human approved every §1.4 recommendation on 2026-10-18 (`plans/gate1-decisions.md`).
