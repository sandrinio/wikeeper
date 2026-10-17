---
sprint_id: "SPRINT-02"
status: "Draft"
generated_at: "2026-10-17T08:30:00Z"
generated_by: "Reporter agent"
template_version: 2
---

<!-- role: reporter -->

# SPRINT-02 Report: Ingest, search and instructions

**Status:** Shipped (27/27 Done; sprint/S-02 not yet merged to main: Gate 4 pending)
**Window:** 2026-10-17 to 2026-10-17 (1 calendar day of execution; planning and Gate 2 on 2026-10-16)
**Stories:** 27 planned / 27 shipped / 0 carried over
**Branch:** `sprint/S-02` at `889b67b`, 141 commits ahead of `main`; draft PR #2 (https://github.com/sandrinio/wikeeper/pull/2); origin holds up to `f38de49`.
**Epics:** EPIC-001, EPIC-002, EPIC-003 (without `read`), EPIC-004, EPIC-006 (5 epics; all five archived at close prep). EPIC-005 and `read` are not in this sprint.

---

## §1 What Was Delivered

### User-Facing Capabilities
- **Ingest pipeline.** `wikeeper ingest start | plan | facts | apply | finish | abort`: a file, a directory (through `plan`), a chat excerpt and a URL with agent-supplied text each complete start, facts, apply, finish under `ai`, `ask` and `whitelist` (`test/e2e/ingest.test.ts`, packed CLI). Source registry with ids and provenance, permission evaluation with per-kind rules, user `pre_ingest`/`post_ingest` hooks, a write lock with snapshot and restore on abort, `index.md` and `log/` events, `wikeeper index rebuild`.
- **Search.** `wikeeper search`: ranked full-text (minisearch), `--type`/`--where`/`--status` filters, `--entity` with alias resolution and backlinks, `--since`, `--misses`, on-disk cache; allowed automatically in all three modes. Measured p95 236.8 ms on 500 pages (isolated).
- **Real instruction files.** SETUP.md (writes `project.md`, drafts `kb_instructions.md`), ONBOARDING.md (writes `me.md`), WIKI.md (13-section wiki protocol), `wiki-ingest`/`wiki-search`/`wiki-setup` skills, extractor and writer sub-agent prompts, management-profile suggestions, `kb_instructions.md` seed and source page template.
- **CLI polish (CR-002 A1-A7).** `init` asks every question before it writes; `--json` appears in every subcommand's help; `doctor` reports severities, plurals, setup, permission, enforce, hooks, `.bak`, and checks the setup files (`me.md` ignored and not committed, `project.md` present); settings files and backups appear in `init`/`update` reports and `.bak` is gitignored.
- **Walkthrough fixes (M6).** `finish` refuses invalid frontmatter on pages the ingest touched; `apply` prints only the brief's one `ingest` line; WIKI.md documents `search --status` as built; writer rules say file-edit tools only, nothing after `finish`, brief carried in the writer's task.

### Internal / Framework Improvements
- 14 frozen contracts (C1-C14, `contract/S-02-*` branches) and `waves.json` let four tracks build in parallel from stubs; owners replaced bodies only.
- Test infrastructure: `test/e2e/pack.ts` (pack-and-extract into a staging `--outDir`, never the repo's `dist/`), `test/templates/structure.ts` (structural checker: commands, flags, files, sections, doctor ids), `generateWiki` fixture for the 500-page perf test, `npm run test:perf` (timing tests alone, `--no-file-parallelism`).
- D.5 consolidation (`51fcc4c`): `CITATION_RE` derived from `SOURCE_ID_PATTERN`; `assertInitialised` replaces 7 `not_initialised` blocks; `src/core/dates.ts` replaces 3 calendar-date helpers; `stripBom` x4; `formatLockAge` x3; `goal.test.ts` builds through `pack.ts`.
- One new runtime dependency: `minisearch@^7.2.0`.
- Tests: 414 at the first contract tip, 600 after wave 1, 988 after wave 10, 1011 after M6 and after consolidation (all green, typecheck clean, 0 structural-template findings).

### Carried Over
None for the 27 stories. Carry-over into SPRINT-03 (not stories of this sprint): EPIC-005 (lint, `lint --rules`, CR-002 D1/C1 lint half), `read` (with CR-002 C2), 17 deferred UR:review-feedback items (§4.3), and the `architecture.md` §7.3 wording fix at the doc refresh.

---

## §2 Story Results + CR Change Log

Each story is a single merge commit on `sprint/S-02`; the SHA below is the merge (or fast-forward) commit from the §4 execution log. Complexity is not recorded in the bundle. All 27 lanes are `standard`. "Wave" shows build order, "M" the milestone plan.

Stories with a non-zero bounce or a recorded event are written out in full; the remaining 20 are one line each (Status Completed, qa=0 arch=0 total=0, no CR/UR events) in the table that follows them.

### STORY-003-03: User `pre_ingest` / `post_ingest` hooks (M1)
- **Status:** Completed
- **Commit:** `9b67b9d`
- **Bounce count:** qa=1 arch=0 total=1
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | "Hook that runs too long" scenario: `timeoutMs` 300 changed to 1200 (a node child's cold start misses 300 ms under full-suite load); the 2 s return bound is unchanged. QA-Red re-dispatch fixed the red test at `c80a785` | qa_bounces +1 (red-test defect, not implementation) |
- **UR Events:** none

### STORY-004-01: Page parser (M1)
- **Status:** Completed
- **Commit:** `bdea22c`
- **Bounce count:** qa=1 arch=0 total=1
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | red-test defect (no CR token) | Fixture wrote `b.md` and `B.md`, one file on macOS/Windows. QA-Red re-dispatch, fixed at `6f26b34` | qa_bounces +1 |
- **UR Events:** none

### STORY-004-02: `wikeeper search`, JSON schema, performance budget (M2)
- **Status:** Completed
- **Commit:** `f0863a3` (final story commit `bd9e44e`, C13)
- **Bounce count:** qa=0 arch=1 total=1
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | Section 3.1 gains three QA-Red re-scoped red files (`enforce-ai-rules`, `enforce`, `setup` at line 353): the search allow rule in all three modes falsifies their exact rule lists | none |
  | 2 | CR:approach-change (recorded as an amendment) | Additive exports `searchWarnings(data)` and `MINISEARCH_OPTIONS`; no frozen C10 export changed | none |
  | 3 | Architect post-flight fix round | `ranked` and `data` declared with `let` for the 004-03/04/05 insertion points | arch_bounces +1 |
- **UR Events:** none

### STORY-003-09: `ingest finish`, report, end-to-end test (M5; amended in M6)
- **Status:** Completed
- **Commit:** `08b317b` (M6 fix merged `2d8d145`)
- **Bounce count:** qa=0 arch=0 total=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | Section 4.1: QA-Red covers the end-to-end scenario in-process; the Developer writes `test/e2e/ingest.test.ts` and `pack.ts` (staging `tsc --outDir`) | none |
- **UR Events:**
  | # | Event type | Feedback | Tax impact |
  |---|---|---|---|
  | 1 | UR:review-feedback | Walkthrough row 8.3: `finish` accepted broken frontmatter on pages the ingest touched. Fixed in M6 (R10: `validation_failed`, `details.invalid`, lock kept) | none (enhancement) |

### STORY-003-08: Write lock, snapshot, `ingest apply`, `ingest abort` (M4; amended in M6)
- **Status:** Completed
- **Commit:** `cecd0b2` (M6 fix `2d8d145`)
- **Bounce count:** qa=0 arch=0 total=0 (the Developer could not commit because of two defects in its own red file; QA-Red fixed both at `1a9826f`, test-only, no bounce counted)
- **CR Change Log:** none (approach amendment: refusal order, new error codes `snapshot_failed`, `restore_failed`, `snapshot_missing`)
- **UR Events:**
  | # | Event type | Feedback | Tax impact |
  |---|---|---|---|
  | 1 | UR:review-feedback | Walkthrough row 8.2: the brief must travel in the writer's task; `apply` prints only the brief's `ingest` line (R4). Fixed in M6 | none (enhancement) |

### STORY-006-04: WIKI.md, the wiki protocol (M4; amended in M6)
- **Status:** Completed
- **Commit:** `a51cbec` (M6 fix `2d8d145`)
- **Bounce count:** qa=0 arch=0 total=0
- **CR Change Log:** none
- **UR Events:**
  | # | Event type | Feedback | Tax impact |
  |---|---|---|---|
  | 1 | UR:bug | Walkthrough row 8.11: WIKI.md documented `search --status` as fact status, against 006-04 R12. Fixed in M6 (W1-W8); re-verified (`--status Triaged` returns 7 initiatives) | Bug-Fix Tax |
  | 2 | UR:review-feedback | Walkthrough row 8.4: pages written with file-edit tools only, nothing after `finish`. Fixed in the instructions (R6/R8/R9/R10); not enforced (guard ignores Bash, by design, STORY-002-05 R2; EPIC-005 lint is the backstop) | none (enhancement) |

### STORY-006-05: Skills and sub-agent prompts (M1; amended in M6)
- **Status:** Completed
- **Commit:** `98d185a` (M6 fix `2d8d145`)
- **Bounce count:** qa=0 arch=0 total=0
- **CR Change Log:** none
- **UR Events:** M6 edits T1-T3 (wiki-writer) and S1 (skill) are the instruction half of the rows 8.2/8.4 events counted under 003-08 and 006-04; not counted again.

### Remaining 20 stories (Completed, qa=0 arch=0, no events)

| Story | Merge commit | Milestone / wave note |
|---|---|---|
| STORY-001-08 `init` asks before writing | `857a739` (C14 = `37f497d`) | M1 |
| STORY-001-09 `--json` in every subcommand's help | `9d900b8` | M1 |
| STORY-002-07 `doctor` reporting | `8ae85e7` | M1 |
| STORY-002-08 settings files and `.bak` gitignore | `a73bffc` | M2, wave 4 built ahead of wave 3 |
| STORY-003-01 source ids and raw registry | `926ede8` | M1 |
| STORY-003-02 permissions and kind rules | `c6e1ba7` | M1 |
| STORY-003-04 `ingest start` | `b5b661c` | M2; spec-clarification on `error.command` vs top-level `command` (Gherkin line 164, 3 red assertions re-scoped at `f888a88`); Developer resumed |
| STORY-003-05 `ingest plan` | `a5d7593` | M3; spec-clarification on in-plan duplicate (R3) |
| STORY-003-06 `ingest facts` and schema | `ef198e2` | M3 |
| STORY-003-07 `index.md`, `log/`, `index rebuild` | `84236ed` | M2; re-synced once (keep-both on `src/program.ts`) |
| STORY-004-03 structured filters | `40d7d05` | M3; edits outside C10 anchors accepted |
| STORY-004-04 `--entity` and `--since` | `13bda5d` | M4; approach notes (a)-(j) |
| STORY-004-05 search misses | `2b04518` | M5 |
| STORY-004-06 on-disk search cache | `835dfa8` | M3; spec-clarification: optional `SearchDeps.onRebuild` |
| STORY-006-01 pointer block and guard text | `54e5da4` | M1 |
| STORY-006-02 SETUP.md, `project.md` template, skill | `23e05f9` | M1; spec-clarification: `data.kept` stays sorted |
| STORY-006-03 profile, kb seed, source template | `017bc79` | M2 |
| STORY-006-06 structural template tests | `bcf3663` | M5; spec-clarification: checker in `structure.ts`, `templates/index.md` |
| STORY-006-07 ONBOARDING.md and `me.md` template | `ebbe3f9` | M2 |
| STORY-006-08 `doctor` setup-files check | `7c68a71` | M2; spec-clarification: `git check-ignore ... --stdin`, `GitRunner.input` |

(20 rows above plus the 7 written-out stories 003-03, 004-01, 004-02, 003-09, 003-08, 006-04, 006-05 account for all 27.)

### Per-milestone summary

| Milestone | Waves | Stories | Outcome | GOAL_RELATION |
|---|---|---|---|---|
| M1 | 1 | 001-08, 001-09, 002-07, 003-01, 003-02, 003-03, 004-01, 006-01, 006-02, 006-05 (10) | 8 green first pass; 003-03 and 004-01 each stopped on a red-test defect (qa_bounces 1), fixed by QA-Red without a new Developer pass; 600/600 | Not stated in the bundle's milestone plan; treated as on the critical path (foundations of all four tracks) |
| M2 | 2-4 | 003-04, 003-07, 004-02, 006-03, 006-07, 006-08, 002-08 (7) | All green; 004-02 one Architect fix round; p95 236.8 ms; 722/722 | Not stated in the bundle; ingest start, search and instruction content: critical path |
| M3 | 5-6 | 003-05, 003-06, 004-06, 004-03 (4) | 4 parallel, 0 bounces; 820/820 | Not stated in the bundle; critical path (plan, facts, filters) |
| M4 | 7-8 | 003-08, 006-04, 004-04 (3) | 0 bounces; 003-08 red-file defects fixed by QA-Red; 913/913 | Not stated in the bundle; critical path (lock, WIKI.md, entity/since) |
| M5 | 9-11 | 004-05, 003-09, 006-06 (3) | 0 bounces; 006-06 built with exactly the 6 expected findings, then 0 after re-sync; 988/988 | Not stated in the bundle; critical path (end-to-end test, structural test) |
| M6 | W12 | amends 003-09, 003-08, 006-04, 006-05 (one unit `story/walkthrough-fixes`) | Spec amendments `fdc6986`, QA-Red `1229ddd` (3 files, 20 red + 2 scope guards), Developer `d525add` (9 files, exactly the planned surface), QA-Verify PASS, merged `2d8d145`; 1011/1011 | Not stated in the bundle; walkthrough fixes for Goal check item 4 |

Footnote: the milestone plan slices in the bundle carry no `GOAL_RELATION` line, so none could be quoted verbatim; the column above is the Reporter's reading, flagged as such.

---

## §3 Execution Metrics

| Metric | Value |
|---|---|
| Stories planned | 27 |
| Stories shipped (Done) | 27 |
| Stories escalated | 0 |
| Stories carried over | 0 |
| Fast-Track Ratio | 0% (all 27 `standard`) |
| Fast-Track Demotion Rate | N/A (no fast-lane story) |
| Hotfix Count (sprint window) | 0 (`wiki/topics/hotfix-ledger.md` absent; fallback applied) |
| Hotfix-to-Story Ratio | 0 |
| Hotfix Cap Breaches | 0 |
| LD events | 0 |
| Total QA bounces | 2 (003-03, 004-01; both red-test defects) |
| Total Arch bounces | 1 (004-02) |
| CR:bug events | 0 |
| CR:spec-clarification events | 9 (006-02, 003-03, 004-02, 006-08, 003-04, 004-06, 003-05, 003-09, 006-06) |
| CR:scope-change events | 0 formal (M6 was human-approved scope, classified as UR events) |
| CR:approach-change events | 0 formal; roughly 14 approach notes recorded as Mid-Sprint Amendments without the CR token |
| UR:bug events | 1 (row 8.11) |
| UR:review-feedback events | 20 (3 fixed in M6: rows 8.3, 8.4, 8.2; 17 deferred, see §4.3) |
| Circuit-breaker fires: test-pattern | 0 |
| Circuit-breaker fires: spec-gap | 0 |
| Circuit-breaker fires: environment | 0 |
| **Bug-Fix Tax** | 3.7% (1 / 27) |
| **Enhancement Tax** | 74.1% (20 / 27); 11.1% (3 / 27) counting only the items fixed in-sprint |
| **First-pass success rate** | 88.9% (24 / 27 with qa=0 and arch=0) |
| Token source: ledger-primary (sprint total, session-totals) | 306,704,624 tokens (1 session) |
| Token source: story-doc-secondary | N/A (no `token_usage` field in the bundle) |
| Token source: task-notification-tertiary | N/A |
| Token divergence (ledger vs session total) | not computable, see below |
| Token divergence flag (>20%) | YES |

### Token cost (CR-035 split)

```
Token cost (sprint work, dev+qa+architect): NOT PUBLISHED (attribution refused, see below)
Token cost (Reporter analysis pass):        TBD - see token-ledger.jsonl post-dispatch
Token cost (sprint total):                  306,704,624  (.session-totals.json, 1 session)
Walkthrough headless sessions (not in ledger): ~$12.90 (part 1 $8.21, part 2 $4.65)
```

**Attribution refusal (BUG-069 check).** The ledger holds 547 rows: `unattributed` 511, devops 14, qa 9, architect 6, developer 4, general-purpose 2, code-simplifier 1. 511 of 547 rows (93%) carry `agent_type: "unattributed"` because no dispatch marker was written for those dispatches (the sprint ran through the workflow script and parallel dispatches). A per-agent or per-story cost table over this data would be wrong, so none is published. The census is the finding. Historical rows were not touched.

**Divergence.** The bundle's ledger digest sums deltas to 6,851,398,335 tokens (cache_read 6.7 billion), which is 22 times the session total of 306,704,624. Delta rows from unattributed dispatches evidently repeat cumulative context, so the digest figure is not a usable "sprint work" number. The session-totals figure is the only one reported as the sprint total; the sprint-work line is withheld. Flagged Red in §6 Tooling because the gap is far outside the expected TBD gap. Attributed-only rows (architect 2,105,318 / qa 863,326 / devops 2,419,689 / developer 0) are not published either: developer showing 0 across 4 dispatches shows the attributed rows are also incomplete.

Cost in USD for the sprint is not stated: the session total cannot be split by token type from the bundle and no rate table was supplied. Only the headless walkthrough figure (~$12.90, from the sprint plan log) is reported.

---

## §4 Observe Phase Findings

Observe window: last story merge (`bcf3663`, 2026-10-17) to close prep (`889b67b`). Source: sprint plan §4 execution log.

### 4.1 Bugs Found (UR:bug)
| Date | Description | Resolution | Commit |
|---|---|---|---|
| 2026-10-17 | Walkthrough row 8.11: WIKI.md documented `search --status` as fact status, against STORY-006-04 R12. Not caught by the structural template test (which checks names, not semantics) | Fixed in M6 (W1-W8); re-verified in walkthrough part 2 (`--status Triaged` returns 7 initiatives) | `d525add`, merged `2d8d145` |

Operational incidents in the window (not UR events):
- **CI incident.** First CI run on draft PR #2 (run 39015547714): `test/e2e/ingest.test.ts` passed on all 6 jobs (ubuntu, macos, windows x Node 22, 24), but 4 jobs failed on `test/search/search-perf.red.node.test.ts` alone (p95 506-829 ms against 500 ms, inside the full parallel suite; 100/101 files passed). The same test had hit 532-1066 ms locally only while 3-4 story suites ran at once. Human chose isolation: `story/ci-perf-isolation` (Developer `81534d0`, QA PASS): `npm test` excludes `**/*-perf.red.node.test.ts`, new `npm run test:perf` runs the two perf files with `--no-file-parallelism`, CI step added, README line; budget and red tests unchanged; merged `8815f3d`. Second run 39016262730: all 6 jobs green, perf tests included.
- **D.5 consolidation** `51fcc4c` (code-simplifier): see §1. QA consolidation mode GREEN: no red file touched, frozen regex `.source`/`.flags` byte-identical between `3fcfa13` and `51fcc4c`, 18 date edge cases identical, 1011/1011. Kept. Skipped on purpose: `search.ts`'s different not-initialised check, `setup.ts` (outside the sprint diff), 3-line `usage()` helpers, two different `isRecord`s.

### 4.2 Hotfixes Triggered
| ID | Trigger | Resolution | Commit |
|---|---|---|---|
| (none) | - | - | - |

### 4.3 Review Feedback (UR:review-feedback)

Classification: 3 fixed in M6 (rows 8.3, 8.4, 8.2); row 7.6 (the kb rule invited the epic-to-initiative mapping) judged by design, resolved by a kb rule change through WIKI.md "Proposing rule changes"; 17 deferred to SPRINT-03 with the human's sign-off (2026-10-17).

| Date | Description | Status | Deferred to / Rationale |
|---|---|---|---|
| 2026-10-17 | 8.3: `finish` accepts broken frontmatter on touched pages | folded (M6 R10) | - |
| 2026-10-17 | 8.4: writers must use file-edit tools only, nothing after `finish` | folded in instructions; enforcement deferred | Guard ignores Bash by design (STORY-002-05 R2); EPIC-005 lint backstop |
| 2026-10-17 | 8.2: the brief travels in the writer's task; `apply` prints one line | folded (M6) | - |
| 2026-10-17 | `--help` footer still says commands land in upcoming releases | deferred | SPRINT-03 |
| 2026-10-17 | `ai` mode auto-allows `ingest abort --drop` and `--force-unlock` | deferred | SPRINT-03 |
| 2026-10-17 | `whitelist.origins` format undefined | deferred | SPRINT-03 |
| 2026-10-17 | `kb_instructions.md` never validated | deferred | SPRINT-03 |
| 2026-10-17 | No command lists rule suggestions | deferred | SPRINT-03 |
| 2026-10-17 | Every sparse-wiki triage search logs a miss | deferred | SPRINT-03 |
| 2026-10-17 | `--since` without `--limit` stops at 10 with no hint | deferred | SPRINT-03 |
| 2026-10-17 | WIKI.md silent on answering from `project.md` | deferred | SPRINT-03 |
| 2026-10-17 | `architecture.md` section 7.3 still says `apply` prints the brief | deferred | Gate-4 doc refresh (brief wording) |
| 2026-10-17 | Guard limit not stated in WIKI.md | deferred | SPRINT-03 |
| 2026-10-17 | `finish` checks that a citation exists, not that the source supports it, nor that a full rewrite kept earlier fact lines | deferred | SPRINT-03 |
| 2026-10-17 | Writer adds aliases not in the facts | deferred | SPRINT-03 |
| 2026-10-17 | No place for routing notes or undated `as_of` in kb rules | deferred | SPRINT-03 |
| 2026-10-17 | No path for fixing a closed ingest without a new source | deferred | SPRINT-03 |
| 2026-10-17 | Skill stricter than WIKI.md on who extracts | deferred | SPRINT-03 |
| 2026-10-17 | `--version` cannot tell builds apart | deferred | SPRINT-03 |
| 2026-10-17 | A filter-only miss logs `No results for "".` (STORY-003-07 summary line) | deferred | SPRINT-03 |

Walkthrough (Goal check item 4) summary: part 1 ran in a fresh headless Claude Code session (`claude -p`, resumed turn by turn) in `formapass_management`; onboarding, `project.md`, `kb_instructions.md` and `ask` mode worked; `roadmap.md` was dropped before `apply` (`abort --drop` works pre-apply); `initiatives/` (7 files) through `ingest plan` produced 16 cited pages; 5 product questions were answered with citations; 5 failures (rows 8.11, 8.3, 8.4, 8.2, 7.6). Part 2, on the M6 build after `wikeeper update`: each part-1 failure resolved or by design; `roadmap.md` and `product-state.md` ingested (0 contradictions; 29 sprints, 60 epics, 7 initiatives); no new failure. The human recorded the item as met.

---

## §5 Lessons

### New Flashcards (Sprint Window)

59 cards dated 2026-10-17 in `.cleargate/FLASHCARD.md` (lines 9-67). The bundle's flashcard slice was empty ("no date window available"), so the list was taken from the file's date prefix. Themes by tag:

| Date | Tags | Lesson (grouped) |
|---|---|---|
| 2026-10-17 | #qa #red-test (about 14 cards) | Fixtures differing only by case collide on macOS/Windows; timeouts around node children flake below ~2 s; `runGuard` stdout is optional; `writeLogEvent` takes `permission` as a string; re-scope immutable reds by content anchors, not line numbers; usage-error rows pass spuriously on an unknown subcommand |
| 2026-10-17 | #test-harness #perf #worktrees #e2e (about 10 cards) | search-perf p95 fails in a plain full run and under parallel story load: re-run isolated (led to `test:perf`); e2e files building into shared `dist/` race: `tsc --outDir` a stage; `npm test` double-counts `.worktrees/` |
| 2026-10-17 | #templates #sections #yaml #codex (about 9 cards) | Wiki-writer text identical in all 3 agents; `{{model}}` and placeholders break TOML/YAML; section targets named in non-system files are structure findings; `listTemplateFiles("")` leading slash |
| 2026-10-17 | #walkthrough #templates | Structural template tests miss wrong semantics (WIKI.md `--status`); only a real agent run caught it |
| 2026-10-17 | #pre-commit #surface-gate | The surface gate is not wired as a git or Claude hook here; QA-Verify's file-list diff is the only surface check |
| 2026-10-17 | #ci #windows | CI runs only on PRs and main pushes; open the sprint-to-main draft PR early |
| 2026-10-17 | #search #cli #ingest #contract #git (rest) | Date.parse rollover, `entityHit` has no entity key, commander empty-string options, `let` for consumer-reassigned locals, `git check-ignore -z` needs `--stdin`, hidden-name skip only below the walked dir |

### Flashcard Audit (Stale Candidates)

Not run. The stale-detection pass needs repo-wide symbol greps, which are outside the bundle-only input rule for this dispatch, and the bundle carries no pre-extracted symbol list. No candidate is asserted. Left for the human or a broad-fetch dispatch if wanted.

### Supersede Candidates

| Newer card | Older card | Proposed marker for older |
|---|---|---|
| none identified from the bundle | - | - |

---

## §6 Framework Self-Assessment

### Templates
| Item | Rating | Notes |
|---|---|---|
| Story template completeness | Green | 27 stories reached Done; 9 CR:spec-clarification events were all wording or fixture detail, none a missing requirement |
| Sprint Plan Template usability | Yellow | Execution log (section 4) carried the whole record and grew to a 35-line wall; the plan was both the log and the contract |
| Sprint Report template (this one) | Yellow | Event vocabulary has no slot for approach notes without a CR token or for QA bounces caused by red-test defects |

### Handoffs
| Item | Rating | Notes |
|---|---|---|
| Architect → Developer brief quality | Green | M1-M6 plans prototyped every edit in scratch; Developer M6 commit equalled the planned surface exactly; 24/27 first pass |
| Developer → QA artifact completeness | Green | One Developer could not commit because of defects in its own red file (003-08); QA-Red fixed them |
| QA → Orchestrator kickback clarity | Green | Both QA bounces were red-test defects, identified and fixed without a new Developer pass |

### Skills
| Item | Rating | Notes |
|---|---|---|
| Flashcard gate adherence | Green | 59 cards recorded in one day; several repeated lessons were folded as duplicates |
| Adjacent-implementation reuse rate | Green | "Adjacent Implementations" table in sprint-context.md was maintained per merge; D.5 consolidation found only small duplications |

### Process
| Item | Rating | Notes |
|---|---|---|
| Bounce cap respected | Green | Max 1 bounce per story |
| Three-surface landing compliance | Green | Close prep archived 27 stories, 5 epics and the plan (`889b67b`) |
| Circuit-breaker fires (if any) | Green | None |
| Headless walkthrough method | Green | A fresh `claude -p` session plus a local MCP permission-prompt tool (logged every request, refused `rm`, git writes, `wikeeper remove` and writes outside the folder) made a repeatable, auditable walkthrough; ~$12.90 for two parts. Even `bypassPermissions` honours the `ask` rule on `ingest start` |
| Workflow script | Yellow | Evolved v1 to v9 in the sprint (e.g. `resume` mode in v8); needs a registered story id, so M6 and the CI fix used direct dispatches |
| Surface gate | Yellow | `SKIP_SURFACE_GATE=1` has no effect: the gate is not wired as a git or Claude hook. QA-Verify's file-list diff is the only surface check |
| Close Step 2.6c | Yellow | Halted on EPIC-005 (planned for SPRINT-03, 0 children); needed `CLEARGATE_SKIP_PARENT_ROLLUP=1`, as at SPRINT-01. ClearGate improvement suggestion: the parent-rollup check should skip epics whose status is future/planned with no children |
| AskUserQuestion during execution | Yellow | See Autonomy Warnings below |

### Lane Audit
| Story | Files touched | LOC | Demoted? | In retrospect, was fast correct? (y/n) | Notes |
|---|---|---|---|---|---|
| (none: no `lane: fast` story this sprint) | - | - | - | - | |

### Hotfix Audit
| Hotfix ID | Originating signal | Files touched | LOC | Resolved-by SHA | Could this have been a sprint story? (y/n) | If y — why was it missed at planning? |
|---|---|---|---|---|---|---|
| (none) | - | - | - | - | - | - |

### Hotfix Trend
0 hotfixes (`wiki/topics/hotfix-ledger.md` absent; no hotfix this sprint). No monotonic increase. Prior sprint reports were not read (bundle-only).

### Tooling
| Item | Rating | Notes |
|---|---|---|
| run_script.sh diagnostic coverage | Green | No script incidents recorded for SPRINT-02 (no `.script-incidents` directory). Architect M1-M6 plans each report "Script Incidents: None" |
| Token ledger completeness | Red | 511 of 547 rows `unattributed` (93%): no dispatch marker was written for most dispatches; per-agent cost refused (see §3) |
| Token divergence finding | Red | Digest sprint-work 6,851,398,335 vs session total 306,704,624 (about 22x, delta far above 20%); Reporter pass TBD does not explain it. Ledger deltas for unattributed rows appear to double-count cache reads |
| Headless walkthrough cost | Yellow | ~$12.90 is not in the ledger; sprint cost is under-reported by this amount |
| Surface gate wiring | Yellow | See Process |

### Autonomy Warnings
`.cleargate/hook-log/autonomy-warnings.log` holds 6 `AskUserQuestion` entries (agent unknown, no detail), all allowed through:
- 2026-10-16T17:30:20Z, 2026-10-16T19:05:23Z, 2026-10-16T19:59:32Z (planning and Gate 1/2 phase, before Active)
- 2026-10-17T00:43:11Z, 2026-10-17T07:52:52Z, 2026-10-17T08:00:00Z (during Active; the 07:52 and 08:00 entries coincide with the walkthrough and the human's decisions on the deferred list)

### Script Incidents
None.

---

## §7 Change Log

| Date | Author | Change |
|---|---|---|
| 2026-10-17 | Reporter agent | Initial generation |
