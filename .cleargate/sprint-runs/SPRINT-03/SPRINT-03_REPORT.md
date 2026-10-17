---
sprint_id: "SPRINT-03"
status: "Draft"
generated_at: "2026-10-17T16:30:00Z"
generated_by: "Reporter agent"
template_version: 2
---

<!-- role: reporter -->

# SPRINT-03 Report: Lint, status and read

**Status:** Shipped (21/21 Done; `sprint/S-03` not yet merged to main: Gate 4 pending)
**Window:** 2026-10-17 to 2026-10-17 (one calendar day of execution, kickoff to close prep)
**Stories:** 21 planned / 21 shipped / 0 carried over
**Branch:** `sprint/S-03` at `73990f9`, 106 commits ahead of `main`. Nothing has been pushed.
**Epics:** EPIC-005 (all nine stories) plus new SPRINT-03 stories under EPIC-001, EPIC-002, EPIC-003, EPIC-004, EPIC-006 (6 epics touched). EPIC-005, CR-002 and CR-003 were flipped to Completed and archived at close prep.

---

## §1 What Was Delivered

### User-Facing Capabilities
- **Lint.** `wikeeper lint` checks pages (links, citations, orphans, unlogged changes, stale facts, page hashes) and `wikeeper lint --rules` checks `kb_instructions.md` (questions, entities, source kinds, changelog). 20 registered check ids; STORY-006-11 R8 holds one trigger fixture and one pass fixture per id and runs every pair. `finish` runs the page lint as a hook.
- **Status.** `wikeeper status` shows the open ingest, unfinished sources, re-ingest candidates (changed origin) and pending rule suggestions.
- **Remembered rule decisions.** `wikeeper rules record | list`: accepted and rejected rule suggestions persist in `.wiki/log`, so a rejected suggestion does not come back.
- **`wikeeper read`.** Turns a web page (HTML via defuddle/linkedom/turndown), DOCX (mammoth), PDF (unpdf) and CSV into text for ingest; the only command that goes online (20 s timeout, 10 MB cap); each library is loaded only when its format is read. Warnings such as `likely_scanned` and error codes such as `conversion_failed` are in `--json`.
- **`ingest facts --dry-run`** previews a re-ingest candidate.
- **Agent behaviour text.** WIKI.md, SETUP.md, skills, sub-agent prompts and the pointer block now tell the agent to search before answering, offer to capture decisions, check `status` / `lint`, use `read`, and record every rule decision. `update` refreshes a shipped pointer block (STORY-002-11).
- **Allow rules.** The read-only commands (`lint`, `status`, `rules list`, `read`, `search`) need no prompt under Claude Code and Codex (STORY-005-09, 003-10).
- **CR-002 / CR-003 follow-ups.** Version stamp `0.3.0+<sha>` and `--help` footer (001-10); enforce, doctor and `ai`-mode fixes (002-09, 002-10); ingest and search follow-ups (003-12, 004-07); walkthrough instruction items (006-10, 006-12).

### Internal / Framework Improvements
- 10 frozen contracts (C1-C10, `contract/S-03-*` branches) and `plans/waves.json` let 15 stories build before any merge; 8 waves, owners replaced bodies only.
- New runtime dependencies (all human-approved): `linkedom`, `defuddle`, `turndown` (003-10); `mammoth`, `unpdf`, `@joplin/turndown-plugin-gfm` (003-11).
- Test fixtures: `test/read/http-server.ts` (local HTTP server for `read`), `test/fixtures/read/make-fixtures.ts` (DOCX/PDF/CSV generator), `test/lint/check-fixtures.ts` (R8 coverage).
- D.5 consolidation `5c35caa` (code-simplifier, 9 `src/` files, +46/-37): `stripBom` replaces four leading-BOM regexes; `isPrivate` reuses `isInside` + `toPosixRelative`; `permissionRule()` replaces six rule-object copies; `normaliseBlock` reuses `splitBom`; staleness age computed once; `causeOf()` and `notReadable()` replace duplicate bodies. QA consolidation mode green; kept.
- Tests: 1009 at the contract tips, 1159 after wave 1, 1337 after wave 2, 1503 after wave 3, 1532 / 1565 / 1591 after waves 4-6, 1616 after 006-09, 1684 (150 files) after 006-11; `npm run test:perf` 2/2.

### Carried Over
No story is carried over. Proposed carry-over (the human has not signed off; see §4.3): seven `UR:review-feedback` items from walkthrough part 3, a follow-up CR for them, the Gate-4 `architecture.md` refresh, and the 0.3.0 npm publish (separate approval).

---

## §2 Story Results + CR Change Log

Each story is one merge commit on `sprint/S-03` (SHA from the sprint plan §4). All 21 lanes are `standard`. `state.json` records qa=0 arch=0 for all 21; the plan log records one extra QA bounce (005-06) and five red-test defects, written out below. Complexity is not recorded in the bundle.

### STORY-002-09: Enforce and doctor follow-ups (wave 1)
- **Status:** Completed. **Commit:** `a448812`. **Bounce count:** qa=0 arch=0 (state.json)
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | red-test defect (no CR token) | Red file expected Claude `"prompt"`, contract C5's type is `"ask"`. Fixed by QA-Red at `a0b4115`; Developer work kept and resumed | none recorded |
- **UR Events:** none

### STORY-003-12: Ingest follow-ups (wave 1)
- **Status:** Completed. **Commit:** `ec56e6f`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | red-test defect | Red asserted `.wiki/raw` absent, but `init` seeds `.gitkeep`. Fixed `1143080` | none recorded |
- **UR Events:** none

### STORY-002-11: `update` refreshes the pointer block (wave 2)
- **Status:** Completed. **Commit:** `816ab71`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | red-test defect | Red asserted the whole manifest unchanged; `update` always rewrites `package_version`. Fixed `c167bf2` | none recorded |
- **UR Events:** none

### STORY-005-06: `rules record` and `rules list` (wave 2)
- **Status:** Completed. **Commit:** `87fb380`. **Bounce count:** qa=0 in state.json; the plan log records one QA bounce
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | red-test defect | Red asserted `.wiki/log` empty; `init` seeds `.gitkeep`. Fixed `55fc3f1` | none recorded |
  | 2 | QA bounce (implementation) | Developer unit tests missing (DoD minimum); added `97db3a7` | qa_bounces +1 per plan log (state.json shows 0) |
  | 3 | integrate round | Conflict in `src/program.ts` only; one round kept every command line (`842005c`) | none |
- **UR Events:** none

### STORY-003-10: `read` command and URL (wave 2)
- **Status:** Completed. **Commit:** `eabbec0`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | M2 decision 1: QA-Red (and later 005-09's) re-scopes `enforce-prompts.red` by inserting only its own rules | none |
  | 2 | integrate round | `src/program.ts` conflict, kept every command line (`ea556aa`) | none |
- **UR Events:** none

### STORY-005-03: Unlogged change, stale facts and finish hook (wave 3)
- **Status:** Completed. **Commit:** `a78aacf`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | red-test defect | Red S3 read `finish` warnings at `json.data.warnings`; the envelope carries them at `json.warnings`. One-line fix `b1b3d3f`; GREEN on re-run | none recorded |
  | 2 | incident | The Developer ran `git stash` / `pop`; the stash stack is shared by every worktree, so its changes and 005-04's swapped. Swapped back by patch; orchestrator audited every wave-3 commit and worktree (each holds only its own files). All later dispatches forbid `git stash` | none |
- **UR Events:** none

### STORY-003-11: `read` DOCX and PDF (wave 3)
- **Status:** Completed. **Commit:** `f684a32`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:approach-change | QA-Red writes the fixture generator and three HTTP routes (M2 decision 3 precedent) | none |
  | 2 | CR:spec-clarification | R3 drops `isEvalSupported` (absent in pdf.js 6.4.299), closes with `pdf.loadingTask.destroy()`, passes `new Uint8Array(bytes)` | none |
- **UR Events:** walkthrough rows 6.x also bear on `read` quality (finding 5 in §4.3); counted there

### STORY-006-10: Walkthrough instruction items (wave 5, built early)
- **Status:** Completed. **Commit:** `50f3867`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | R3's permission bullet says "before a command runs" (the vocabulary check reads "wikeeper command" as an unknown command) | none |
  | 2 | CR:approach-change | Builds now from `sprint/S-03`; C8 cut from its Developer commit with three named expected-red rows until 005-04 merged | none |
- **UR Events:** none

### STORY-006-12: Writing and answering instruction items (wave 6, built early)
- **Status:** Completed. **Commit:** `eeaa6fa`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | `test/agents/shipped-blocks.test.ts:56` changed from `entry 2` to `entry ${SHIPPED_BLOCKS.length}` | none |
  | 2 | process | Re-sync and QA-Verify ran alongside 006-10's at the human's question about parallel waves; merge tree equalled tested tree | none |
- **UR Events:** none

### STORY-006-09: Instructions for new commands (wave 7)
- **Status:** Completed. **Commit:** `69ef1f3`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | R1(a) "the only command that goes online"; a lead-in above the `read` table (codes appear only with `--json`); R2 names Claude Code and Codex for the no-prompt rules | none |
- **UR Events:** none

### STORY-006-11: Structural tests for SPRINT-03 (wave 8)
- **Status:** Completed. **Commit:** `0722e77`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:scope-change (human-approved, "Add it to 006-11") | New R8: test-only `test/lint/check-fixtures.ts`, one trigger and one pass fixture per registered lint id, plus a red row comparing its keys with `PAGE_CHECKS` + `RULE_CHECKS`. Reason: the Goal Acceptance Check named a per-lint-id coverage check that no story specified. Goal Acceptance Check text unchanged | none |
- **UR Events:** none

### Remaining 10 stories (Completed, qa=0 arch=0, no events)

| Story | Merge commit | Wave / note |
|---|---|---|
| STORY-004-07 search follow-ups | `3d6d431` | wave 1 |
| STORY-005-01 `kb_instructions.md` parser | `d70814c` | wave 1, built from C1 |
| STORY-002-10 doctor message follow-ups | `90c407e` | wave 1 |
| STORY-001-10 version stamp and help footer | `84ad59a` | wave 1 (also C4) |
| STORY-005-07 `ingest facts --dry-run` | `8860426` | wave 2 |
| STORY-005-02 `lint` command and page checks | `69e1ba6` | wave 2 (also C7); CR:approach-change in M1: `src/lint/paths.ts` holds `pagePath` (avoids a TDZ error from a registry import cycle) |
| STORY-005-05 `status` command | `5a6b341` | wave 3 |
| STORY-005-04 `lint --rules` | `ae7e4d1` | wave 3 |
| STORY-005-08 stale-fact check | `512e0a2` | wave 3 |
| STORY-005-09 read-only allow rules | `f52bef4` | wave 4; re-synced after 005-05, seven expected reds went green |

(11 stories written out above plus these 10 account for all 21.)

### Per-milestone summary

| Milestone | Waves | Stories | Outcome | GOAL_RELATION (verbatim, first line of the plan's line) |
|---|---|---|---|---|
| M1 | contract step, wave 1 | 001-10, 002-09, 002-10, 003-12, 004-07, 005-01 (6) | 4 green first pass; 002-09 and 003-12 stopped on red-test defects; 1159/1159 | `GOAL_RELATION: advances. M1 lays the surfaces every SPRINT-03 goal clause stands on:` |
| M2 | wave 2 | 002-11, 003-10, 005-02, 005-06, 005-07 (5) | 2 first pass; 002-11, 005-06 red-test defects (005-06 also one QA bounce); 1337/1337 | `GOAL_RELATION: advances. Wave 2 builds four surfaces the goal names: lint (005-02), read with CSV (003-10), remembered rule decisions (005-06), and previewing a re-ingest candidate with ingest facts --dry-run (005-07).` (plan line continues about 002-11) |
| M3 | wave 3 | 003-11, 005-03, 005-04, 005-05, 005-08 (5) | 4 first pass; 005-03 red-test defect plus the `git stash` incident; 1503/1503 | `GOAL_RELATION: advances. Wave 3 completes four goal clauses:` |
| M4 | waves 4-6 | 005-09, 006-10, 006-12 (3) | All green first pass after clean re-syncs; 1591/1591 | `GOAL_RELATION: advances. These three stories carry the goal's last clause, "in a fresh session the agent searches the wiki before answering and offers to capture new decisions":` |
| M5 | waves 7-8 | 006-09, 006-11 (2) | Green first pass; 1684/1684, `test:perf` 2/2 | `GOAL_RELATION: advances.` (006-09 text for the `status` / `lint` / `read` clauses; 006-11 verifies every red-test re-scope and runs the mechanical half of the Goal Acceptance Check) |

All five milestones are on the goal's critical path; none is off it.

---

## §3 Execution Metrics

| Metric | Value |
|---|---|
| Stories planned | 21 |
| Stories shipped (Done) | 21 |
| Stories escalated | 0 |
| Stories carried over | 0 |
| Fast-Track Ratio | 0% (all 21 `standard`) |
| Fast-Track Demotion Rate | N/A (no fast-lane story) |
| Hotfix Count (sprint window) | 0 (`wiki/topics/hotfix-ledger.md` absent; fallback applied) |
| Hotfix-to-Story Ratio | 0 |
| Hotfix Cap Breaches | 0 |
| LD events | 0 |
| Total QA bounces | 0 in state.json; 1 per the plan log (005-06, missing Developer unit tests). Five further stops were red-test defects fixed by QA-Red (002-09, 003-12, 002-11, 005-06, 005-03) |
| Total Arch bounces | 0 |
| CR:bug events | 0 |
| CR:spec-clarification events | 5 in the plan log's decision lists (003-10/005-09 `enforce-prompts` re-scope, 003-11 R3, 006-10 R3, 006-12 `shipped-blocks`, 006-09 R1/R2) |
| CR:scope-change events | 1 (006-11 R8, human-approved) |
| CR:approach-change events | 3 (M1 `src/lint/paths.ts`; M3 003-11 fixtures by QA-Red; M4 early builds of 006-10 and 005-09 from `sprint/S-03`) |
| UR:bug events | 0 |
| UR:review-feedback events | 7 (all proposed carry-over, see §4.3) |
| Circuit-breaker fires: test-pattern | 0 |
| Circuit-breaker fires: spec-gap | 0 |
| Circuit-breaker fires: environment | 0 |
| **Bug-Fix Tax** | 0% (0 / 21) |
| **Enhancement Tax** | 33.3% (7 / 21); none fixed in-sprint |
| **First-pass success rate** | 76.2% (16 / 21 with no stop and no bounce); state.json alone shows 100% (21 / 21 qa=0 arch=0) because red-test defects are not counted as bounces |
| Token source: ledger-primary (sprint total, session-totals) | 582,087,903 tokens (1 session) |
| Token source: story-doc-secondary | N/A (no `token_usage` field in the bundle) |
| Token source: task-notification-tertiary | N/A |
| Token divergence (ledger digest vs session total) | digest 11,261,309,912 vs 582,087,903 (about 19x) |
| Token divergence flag (>20%) | YES |

The five stories that stopped (002-09, 003-12, 002-11, 005-06, 005-03) stopped on defects in QA-Red files, not in the implementation; 005-06 also had the one QA bounce.

### Token cost (CR-035 split)

```
Token cost (sprint work, dev+qa+architect): NOT PUBLISHED (attribution refused, see below)
Token cost (Reporter analysis pass):        TBD - see token-ledger.jsonl post-dispatch
Token cost (sprint total):                  582,087,903  (.session-totals.json, 1 session)
Walkthrough part 3 headless sessions:       no cost figure in the bundle (the notes list per-session $: see §4)
```

`.session-totals.json` sums to 582,087,903 (input 5,814; output 3,350,609; cache_creation 7,573,666; cache_read 571,157,814), last updated 16:22Z, before the Reporter dispatch.

**Attribution refusal (BUG-069 check).** The ledger holds 486 rows: `unattributed` 460 (94.7%), devops 18, architect 4, developer 2, qa 1, code-simplifier 1. No dispatch marker was written for the unattributed dispatches. A per-agent or per-story table over this data would be wrong, so none is published. Attributed rows are also incomplete (the digest shows developer 0 for 2 dispatches, qa 0 for 1, devops 0 for 18). Historical rows were not touched.

**Divergence.** The digest sums deltas to 11,261,309,912 tokens (cache_read 11.04 billion), roughly 19 times the session total. As in SPRINT-02, delta rows from unattributed dispatches evidently repeat cumulative context, so the digest figure is not a usable sprint-work number. Flagged in §6 Tooling. USD cost is not stated: no rate table was supplied and the session total cannot be split by price class from the bundle. No estimate is given.

---

## §4 Observe Phase Findings

Observe window: last story merge (`0722e77`) to close prep (`73990f9`). Source: sprint plan §4 execution log and `wikeeper-test-notes-sprint-03.md` (in `walkthrough-wiki`, uncommitted; cited, not copied).

### 4.1 Bugs Found (UR:bug)
| Date | Description | Resolution | Commit |
|---|---|---|---|
| (none) | No `UR:bug` from walkthrough part 3; no row is broken against a story's spec | - | - |

Goal Acceptance Check evidence:
- **Part 1 (mechanical), `72c230b`, re-run after D.5 at `5c35caa`:** `npm run typecheck` clean; `npm test` 150 files / 1684 tests; `npm run test:perf` 2/2; `wikeeper --version` prints `0.3.0+72c230b` (`0.3.0+5c35caa` after D.5); STORY-006-11 R8 coverage row passes for all 20 registered lint ids; the `read` tests convert the HTML, DOCX, PDF and CSV fixtures. PASS.
- **Part 2 (behavioural), walkthrough part 3 as a real user in `walkthrough-wiki`:** 7 fresh `claude -p` sessions plus follow-ups, plain product-management prompts that never name wikeeper or WIKI.md; a stand-in for the user declined `/tmp` writes, an `rm` and every page write in one ingest. No failing row. Observed unprompted: search before drafting (2.1) and before answering (7.1); an offer to capture a date mentioned in passing (2.2, captured in 2.3); `read` plus ingest of a web page (3.x), a DOCX (4.x) and a PDF (6.x); `status` / `lint` / `lint --rules` checked and acted on (1.x); page writes declined mid-ingest led to `ingest abort`, no open ingest or stale lock, then a question to the user, and a clean finish after approval (6.2, 6.5). The agent also refused a PDF that held personal data before storing anything (5.1; the source choice was the orchestrator's, now removed).

Operational incidents in the window (not UR events):
- **`git stash` shared across worktrees (wave 3, 005-03).** See §2; audited clean; every later dispatch forbids stash. Flashcarded.
- **Load-sensitive tests.** `test/setup-files.red.node.test.ts` S1 and git-spawning tests time out at 5 s only while several worktree suites run (pass alone; never on the sprint branch). `--maxWorkers=4` removed them. Plain `npm test` also collects `.worktrees/**`; DevOps runs exclude it.
- **D.5 consolidation `5c35caa`:** QA consolidation mode GREEN (no red file touched; 1684/1684, 150 files; test:perf 2/2). Kept. Skipped on purpose: shared `usage()` / `exists()` / `plural` moves in earlier-sprint files, the two fence scanners (different closing-fence rules), anything in the frozen `checks.ts` filter.
- **Close prep `73990f9`:** `close_sprint.mjs` Step 2.6d back-synced and archived the 21 stories; `CLEARGATE_SKIP_PARENT_ROLLUP=1` as at the SPRINT-01 and SPRINT-02 closes; EPIC-005, CR-002 (A-D across SPRINT-02 and 03) and CR-003 (A-F) archived as Completed by hand. Steps 2.6, 2.6b, 2.7 pass; Step 2.8 waits for the sprint-to-main merge.

### 4.2 Hotfixes Triggered
| ID | Trigger | Resolution | Commit |
|---|---|---|---|
| (none) | - | - | - |

### 4.3 Review Feedback (UR:review-feedback)

All seven are **proposed** carry-over to a follow-up CR. The human has not yet signed off on deferring them; that is a Gate 4 decision.

| # | Date | Description (notes rows) | Status | Proposed disposition |
|---|---|---|---|---|
| 1 | 2026-10-17 | WIKI.md "Register" never names the `--provided-by` values `user` / `agent`; three sessions passed a person's name and retried after exit 2 (3.2, 4.2, 6.4) | proposed carry-over | Follow-up CR |
| 2 | 2026-10-17 | Read-only allow rules miss chained commands that contain `$?` (`; echo "=== exit $?"`), so `status` / `lint` / `rules list` still prompted; a plain chain does not prompt (1.2, narrowed by 7.2) | proposed carry-over | Follow-up CR |
| 3 | 2026-10-17 | A rule decision clears a whole source's suggestions, not one item; four sources kept suggestions because they mix metadata and real items (1.7) | proposed carry-over | Follow-up CR |
| 4 | 2026-10-17 | After the first declined page write the writer tried seven more before aborting; one decline should pause it (6.3) | proposed carry-over | Follow-up CR |
| 5 | 2026-10-17 | `read` keeps every copy of overprinted bold PDF text (repeated headings), and some PDF table headings come out letter by letter (pre-session check, 6.5); `likely_scanned` warning on outlined-text PDFs works as designed | proposed carry-over | Follow-up CR |
| 6 | 2026-10-17 | No default source kind for chat captures; `finish` warns on every one (1.8, 4.3, 6.5) | proposed carry-over | Follow-up CR |
| 7 | 2026-10-17 | One session grepped pages instead of `wikeeper search` for a non-project question (1.3); minor | proposed carry-over | Follow-up CR |

Also noted (not counted as UR events): `read` on a legacy Word 97 `.doc` named `.docx` exits 1 `conversion_failed` "not a readable DOCX", which is correct.

---

## §5 Lessons

### New Flashcards (Sprint Window)

The bundle's flashcard slice was empty ("no date window available"). `.cleargate/FLASHCARD.md` holds 119 cards dated 2026-10-17 in total, 59 of which belong to SPRINT-02 (see that report), so about 60 are new this sprint; the plan log counts recorded cards per phase (5, 7, 7, 10, 7, 9, 6, 3, 6, 2, 1 and the wave-1 batch). Themes by tag:

| Date | Tags | Lesson (grouped) |
|---|---|---|
| 2026-10-17 | #qa #red-test (about 14 cards) | Red files that mirror contracts or pin exact lists (C5 `"ask"` vs `"prompt"`, `enforce-prompts`) break later stories; rows a later story replaces belong in Developer tests; `init` seeds `.gitkeep`, so assert no source files, not an absent dir; a "no finding" row passes vacuously before the id exists or when the stub errors (assert `json.ok` first); `update` rewrites `package_version` |
| 2026-10-17 | #git #worktree #contract #merge | `git stash` is shared by every worktree; prove a re-sync with `git merge-tree --write-tree` against `<merge>^{tree}`; a story cut from a contract commit carries the owner's red files |
| 2026-10-17 | #read #pdf #docx #defuddle | unpdf 1.9 needs a `Uint8Array` and has no `PDFDocumentProxy.destroy()` or `isEvalSupported`; turndown drops `<img src="">` and GFM gives headerless tables an empty header; defuddle returns a Promise and resolves relative links; read's human output prints only `warning:` / `error:` messages |
| 2026-10-17 | #lint #esm #fixtures | A check module that value-imports its registry hits a TDZ error; `finish` registers its lint hook at module load; a `[[src-...]]` citation without a source page is an error |
| 2026-10-17 | #templates #structure #vocabulary #shipped-blocks | `checkVocabulary` reads "wikeeper <word>" in prose; `SECTION_RE` and finding line numbers are offset; `shipped-blocks.test.ts` hard-coded `entry 2`; pointer-block quotes need escaping in the literal |
| 2026-10-17 | #test-harness #perf #worktrees | Worktree suites time out git-spawning tests at 5 s (`--maxWorkers=4`); scratch copies linked to a worktree's `node_modules` break at teardown; a never-answering HTTP route needs `closeAllConnections()` |
| 2026-10-17 | #goal #acceptance | A Goal Acceptance Check clause (a fixture per lint id) matched no story requirement; check each clause against story text at kickoff (led to the 006-11 R8 scope change) |
| 2026-10-17 | #cli #commander #windows #shell | Commander wraps help at 80 columns; variadic options also concatenate repeats; override `PATH` case-insensitively on Windows; zsh `:s` modifier in `"$T:src/x"` |

### Flashcard Audit (Stale Candidates)

Not run. The stale-detection pass needs repo-wide symbol greps, outside the bundle-only input rule for this dispatch. No candidate is asserted.

### Supersede Candidates

| Newer card | Older card | Proposed marker for older |
|---|---|---|
| none identified from the bundle | - | - |

---

## §6 Framework Self-Assessment

### Templates
| Item | Rating | Notes |
|---|---|---|
| Story template completeness | Green | 21 stories Done; 5 CR:spec-clarification events were wording or fixture detail, one scope change was a gap in the Goal Acceptance Check, not in a story |
| Sprint Plan Template usability | Yellow | §4 execution log again carried the whole record (one very long paragraph per wave); the plan is both the log and the contract |
| Sprint Report template (this one) | Yellow | No slot for red-test defects that are not bounces; `state.json` shows qa=0 for stories that stopped on them, so the first-pass metric overstates |

### Handoffs
| Item | Rating | Notes |
|---|---|---|
| Architect to Developer brief quality | Green | M1-M5 plans probed text and code in scratch copies; every re-sync after wave 3 was a clean merge and merged trees equalled tested trees |
| Developer to QA artifact completeness | Yellow | 005-06 lacked Developer unit tests (QA bounce); five Developers stopped on defects in a red file rather than their own code |
| QA to Orchestrator kickback clarity | Green | Each red-test defect was identified and fixed by QA-Red with a one-line change; no new Developer pass needed |

### Skills
| Item | Rating | Notes |
|---|---|---|
| Flashcard gate adherence | Green | About 60 cards recorded, duplicates skipped at plan time |
| Adjacent-implementation reuse rate | Green | D.5 found only small duplications (BOM regexes, rule literals); the sprint-context table was kept per merge |

### Process
| Item | Rating | Notes |
|---|---|---|
| Bounce cap respected | Green | At most one QA bounce on any story |
| Three-surface landing compliance | Green | Close prep archived 21 stories, EPIC-005, CR-002 and CR-003 (`73990f9`) |
| Circuit-breaker fires (if any) | Green | None |
| Contract-first parallelism | Green | 10 contracts let 15 stories build before any merge; waves 4-6 ran with early builds and one parallel re-sync/QA at the human's question |
| Worktree isolation | Yellow | The shared `git stash` stack swapped two stories' edits (005-03, 005-04); caught and audited, but only by the Developer noticing |
| Goal Acceptance Check authoring | Yellow | The check named a coverage test no story specified; found at M5 and fixed by scope change. Check clauses against stories at kickoff |
| Close Step 2.6c | Yellow | Needed `CLEARGATE_SKIP_PARENT_ROLLUP=1` again (third sprint); archived parents with new child stories trip the roll-up |
| AskUserQuestion during execution | Yellow | See Autonomy Warnings below |

### Lane Audit
| Story | Files touched | LOC | Demoted? | In retrospect, was fast correct? (y/n) | Notes |
|---|---|---|---|---|---|
| (none: no `lane: fast` story this sprint) | - | - | - | - | |

### Hotfix Audit
| Hotfix ID | Originating signal | Files touched | LOC | Resolved-by SHA | Could this have been a sprint story? (y/n) | If y: why was it missed at planning? |
|---|---|---|---|---|---|---|
| (none) | - | - | - | - | - | - |

### Hotfix Trend
0 hotfixes (`wiki/topics/hotfix-ledger.md` absent; none this sprint). No monotonic increase. Prior sprint reports were not read (bundle-only).

### Tooling
| Item | Rating | Notes |
|---|---|---|
| run_script.sh diagnostic coverage | Yellow | 17 incident JSONs in `.cleargate/sprint-runs/SPRINT-03/.script-incidents/` (12:32Z-14:10Z), none attributed to an agent type; see Script Incidents |
| Token ledger completeness | Red | 460 of 486 rows `unattributed` (94.7%): no dispatch marker for most dispatches; per-agent cost refused (see §3). Third sprint in a row |
| Token divergence finding | Red | Digest 11,261,309,912 vs session total 582,087,903 (about 19x, far above 20%); the Reporter-pass TBD does not explain it |
| Walkthrough cost | Yellow | Per-session cost is in the notes (e.g. 6.5 cumulative $5.94) but not in the ledger; sprint cost is under-reported by the headless walkthrough spend |
| Walkthrough harness | Green | Fresh `claude -p` per task with a permission stand-in that logged every prompt made declines reproducible (6.2, 5.2) |

### Autonomy Warnings
`.cleargate/hook-log/autonomy-warnings.log` holds 7 `AskUserQuestion` entries (agent unknown, no detail), all allowed through:
- 2026-10-16T17:30:20Z, 2026-10-16T19:05:23Z, 2026-10-16T19:59:32Z, 2026-10-17T00:43:11Z, 2026-10-17T07:52:52Z, 2026-10-17T08:00:00Z (the first six are the SPRINT-02 entries, before this sprint's kickoff)
- 2026-10-17T15:07:58Z (during the Active window; the log carries no detail, so its cause is not stated here)

### Script Incidents
17 incident JSONs sit in `.cleargate/sprint-runs/SPRINT-03/.script-incidents/` with `agent_type` unset; no agent report cites one. Pattern `<ts> · agent · command exited code · summary`:
- 2026-10-17T12:32:06Z · unknown · node exited 1 · `ERR_MODULE_NOT_FOUND`
- 2026-10-17T12:52:00Z · unknown · bash exited 1 · `head: illegal line count -- 0`
- 2026-10-17T13:45:45Z · unknown · `node_modules/.bin/tsc` exited 1 · no stderr
- 2026-10-17T13:51:40Z to 14:08:20Z · unknown · 11 `npx` (vitest) runs exited 1 · failed tests in scratch probe copies (for example `test/templates/setup.red.node.test.ts`, `test/templates.test.ts` wildcard references), the expected-red states the Architect plans describe
- 2026-10-17T14:10:17Z · unknown · npx exited 1 · `Cannot find module` in a scratch copy

---

## §7 Change Log

| Date | Author | Change |
|---|---|---|
| 2026-10-17 | Reporter agent | Initial generation |
