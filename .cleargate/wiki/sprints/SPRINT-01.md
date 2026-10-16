---
type: sprint
id: "SPRINT-01"
parent: ""
children: []
status: "Draft"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/SPRINT-01_foundation_and_agent_wiring.md"
last_ingest: "2026-10-16T20:46:14.931Z"
last_ingest_commit: "8ef2568f0e8057b195d142358166cda4d938147e"
repo: "planning"
report_raw_path: ".cleargate/sprint-runs/SPRINT-01/SPRINT-01_REPORT.md"
last_report_ingest_commit: "0f527a71657ff7e12e196efaafbab15fc33c9572"
---

# SPRINT-01: Foundation and agent wiring

## 0. Stakeholder Brief

- **Sprint Goal:** `npx wikeeper init` installs a working `.wiki/` and wires it into Claude Code, Codex and Antigravity; `update`, `remove` and `doctor` manage it safely.
- **Business Outcome:** wikeeper becomes installable for real: one command sets up the wiki, the agent instruction block, skills and sub-agent definitions, with an opt-in write guard. Instruction text is placeholder until EPIC-006.
- **Risks (top 3):** `src/program.ts` touched by most stories; hook payload formats for Codex and Antigravity unverified; merging into users' settings files.
- **Metrics:** second `init` changes 0 bytes; `update` / `remove` change 0 user-owned files; CI green on Linux, macOS and Windows; release `0.1.0` cut from the sprint result.

## Sprint Goal

Make `npx wikeeper init` produce a safe, idempotent install that every supported agent picks up, with lifecycle commands that never touch the user's knowledge.

## 1. Consolidated Deliverables

[+12,005 bytes not shown — read .cleargate/delivery/pending-sync/SPRINT-01_foundation_and_agent_wiring.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
<!-- BEGIN sprint-report -->
## Sprint Report

<!-- role: reporter -->

# SPRINT-01 Report: Foundation and Agent Wiring

**Status:** Shipped (pending Gate 4). PR #1 CI green on Linux, macOS and Windows, Node 22 and 24 (run 38963866637).
**Window:** 2026-10-16 to 2026-10-17 (2 calendar days; sprint-context created 2026-10-16T14:12Z, last commit 2026-10-17 00:32 +0400)
**Stories:** 16 planned (13 stories + 3 walkthrough items) / 16 shipped / 0 carried over

---

## §1 What Was Delivered

### User-Facing Capabilities
- `wikeeper init` scaffolds `.wiki/` (config, kb instructions, `system/`, manifest, content dirs) and a managed `.gitignore` block. `--agents` selects Claude Code, Codex and Antigravity. Non-interactive runs without an agent list exit 5. `--yes` and `--json` never prompt. (STORY-001-04, 002-02, 002-04)
- `init` wires each chosen agent: the WIKI block goes into the agent instruction file (never creating `CLAUDE.md`; text outside the markers untouched), the shared skills into `.agents/skills`, and the sub-agents per agent. (STORY-002-01, 002-03, 002-04)
- `wikeeper update` refreshes only manifest-tracked `.wiki/system/**` files, backing up local edits first. (STORY-001-05)
- `wikeeper remove` and `remove --purge --confirm wikeeper` delete only wikeeper-owned files and blocks. Knowledge is kept unless purged. (STORY-001-06)
- `wikeeper doctor` reports node version, config validity, manifest drift and the agent checks (missing, duplicated or deleted WIKI block, broken skill link, trust notes). `wikeeper setup --done` records setup completion. (STORY-001-07, 002-04)
- Opt-in `--enforce` writes a fail-open write guard (`wikeeper hook guard`) and permission rules into Claude, Codex and Antigravity settings, with `.bak` backups and strict JSON merge. (STORY-002-05, 002-06)
- Walkthrough fixes. `init` then `remove` restores a `.gitignore` without a final newline byte for byte (BUG-001). `remove` no longer leaves a wikeeper-written `.bak` (BUG-002). `ai` permission mode auto-allows only `wikeeper ingest …` and `npx wikeeper ingest …` (CR-001).

### Internal / Framework Improvements
- CLI core: one `--json` envelope and the 0-5 exit-code contract (`ExitCode`, `WikeeperError`, `emitResult`, `emitError`, `runCli`). 3-OS x Node 22/24 CI matrix and `.gitattributes` (`eol=lf`). (STORY-001-01)
- Config schema, path resolution, ownership manifest and template loader. `yaml` is the only new runtime dependency. (STORY-001-02, 001-03)
- `registerIntegration` / `runIntegrations` hook point (frozen form), consumed by the `agents` integration through an `AgentsExtension` seam that carries `--enforce`. (STORY-001-04, 002-04, 002-06)
- D.5 consolidation, commit `13b9f3c` (behaviour-preserving; QA consolidation PASS: typecheck, 414 tests in 40 files, build). `isInside` now has one implementation in `src/core/paths.ts`. Also new: `fromPosixRelative`, `compareCodeUnits` (`src/core/compare.ts`, replacing eight copies) and `readPackageVersion` in `src/core/templates.ts`. Raw U+FEFF literals in `src` became escapes. Verified in `b5843ea`.
- End-to-end goal test `test/e2e/goal.test.ts` (tsc build, `npm pack`, tarball extract, three fixture repos). It runs in the CI matrix.

### Carried Over
- None from the 16 items. 16 UR:review-feedback items from the walkthrough are deferred to SPRINT-02/03 as CR-002 (human sign-off); see §4.3.

---

## §2 Story Results + CR Change Log

All 16 items: Status Completed, qa=0 arch=0 total=0 bounces, lane standard, no CR or UR events logged against any item except the walkthrough items below. Complexity comes from the milestone plans (M1-M5). Merge SHAs for STORY-001-01..002-06 are not in the bundle (git log digest truncated); only SHAs the dispatch supplied are shown.

| Item | Title | Cx | Commit | Bounces (qa/arch) |
|---|---|---|---|---|
| STORY-001-01 | CLI core, `--json` envelope, exit codes, 3-OS CI | L2 | not in bundle | 0/0 |
| STORY-001-02 | Config schema and path resolution | L2 | not in bundle | 0/0 |
| STORY-001-03 | Ownership manifest and template loader | L2 | not in bundle | 0/0 |
| STORY-001-04 | `wikeeper init` (owns C4 hook point) | L3 | not in bundle | 0/0 |
| STORY-001-05 | `wikeeper update` | L2 | not in bundle | 0/0 |
| STORY-001-06 | `wikeeper remove` / `--purge` | L2 | not in bundle | 0/0 |
| STORY-001-07 | `wikeeper doctor` and `setup` | L2 | not in bundle | 0/0 |
| STORY-002-01 | Block injection engine | L2 | not in bundle | 0/0 |
| STORY-002-02 | Agent detection and target files | L2 | not in bundle | 0/0 |
| STORY-002-03 | Install skills and sub-agent definitions | L2 | not in bundle | 0/0 |
| STORY-002-04 | Integration wiring and doctor checks (adds goal test) | L2 | not in bundle | 0/0 |
| STORY-002-05 | `wikeeper hook guard` | L2 | not in bundle | 0/0 |
| STORY-002-06 | `--enforce` hooks and permission rules | L3 | not in bundle | 0/0 |
| BUG-001 | `.gitignore` without final newline gains one after init then remove | L1 | merge `fd1b0d3` | 0/0 |
| BUG-002 | `remove` leaves `.claude/settings.json.bak` | L1 | merge `db72fc9` | 0/0 |
| CR-001 | `ai` mode allows only ingest commands | L1 | merge `ab2fc10` | 0/0 |

### Walkthrough event log (Phase D)
These events were raised at the sprint walkthrough, after the 13 stories merged. None bounced a story: each became its own in-sprint item (M5).

- **BUG-001**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | UR:bug | `applyManagedBlock` appended the block after a final-newline-less `.gitignore`, so `remove` could not restore the exact bytes (STORY-001-06 R2, Goal check 3). Fixed: insert at the top (after any BOM). | none (tracked as its own item) |
- **BUG-002**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | UR:bug | A `.bak` was written for a settings file wikeeper created and `remove` left it behind (STORY-002-06 R7, Goal check 3). Fixed: no backup for created files; `removeEnforce` deletes the recorded `.bak`. | none |
- **CR-001**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:approach-change | `ai` mode auto-allowed `wikeeper *`, which included `remove --purge`. Narrowed to the ingest commands (human decision 2026-10-16; recorded in sprint-context Mid-Sprint Amendments). | none (own item, in-sprint) |
- **16 x UR:review-feedback** (walkthrough): deferred as CR-002, see §4.3.

Plan-time blockers flagged by the M5 Architect plan: BUG-001 needed a human reset to edit two lines of an immutable red test, and CR-001's authorised red-edit list was off by one line. The bundle does not record the outcome of either. Both items ended Done with 0 bounces, so the resolutions are presumed to have landed. This is unverified here.

---

## §3 Execution Metrics

| Metric | Value |
|---|---|
| Stories planned | 16 (13 stories + BUG-001, BUG-002, CR-001) |
| Stories shipped (Done) | 16 |
| Stories escalated | 0 |
| Stories carried over | 0 |
| Fast-Track Ratio | 0% (all lane: standard) |
| Fast-Track Demotion Rate | N/A (no fast-lane stories) |
| Hotfix Count (sprint window) | 0 (hotfix ledger not in bundle; none reported) |
| Hotfix-to-Story Ratio | 0 |
| Hotfix Cap Breaches | 0 |
| LD events | 0 |
| Total QA bounces | 0 |
| Total Arch bounces | 0 |
| CR:bug events | 0 |
| CR:spec-clarification events | 0 |
| CR:scope-change events | 0 |
| CR:approach-change events | 1 (CR-001) |
| UR:bug events | 2 (BUG-001, BUG-002) |
| UR:review-feedback events | 16 (all deferred to CR-002) |
| Circuit-breaker fires: test-pattern | 0 recorded |
| Circuit-breaker fires: spec-gap | 0 recorded |
| Circuit-breaker fires: environment | 0 recorded |
| **Bug-Fix Tax** | 12.5% (2 / 16) |
| **Enhancement Tax** | 100% (16 / 16 by formula; none of it shipped this sprint, all deferred) |
| **First-pass success rate** | 100% (16 / 16 with qa=0 and arch=0) |
| Token source: ledger-primary (sprint work, deltas) | 3,357,154,187 tokens (see anomaly below) |
| Token source: story-doc-secondary | N/A (not in bundle) |
| Token source: task-notification-tertiary | N/A |
| Token divergence (ledger vs session total) | ~839% (3,357,154,187 vs 357,451,140) |
| Token divergence flag (>20%) | YES |

Token cost (sprint work, dev+qa+architect): 3,357,154,187 (ledger deltas as digested; unreliable, see below)
Token cost (Reporter analysis pass):        TBD — see token-ledger.jsonl post-dispatch
Token cost (sprint total):                  357,451,140 (`.session-totals.json` sum, pre-computed in bundle)

**Anomaly (flag, not resolved here).** The digest's "sprint work" figure is about 9.4x larger than the session-totals "sprint total". Work cannot exceed total, so one source is wrong. 3.27B of the 3.36B is `cache_read`. The likely cause is that cumulative cache-read deltas were counted across 316 unattributed rows, but the bundle does not prove it. Neither figure should be used for cost.

**Attribution refusal (BUG-069).** The ledger census carries `agent_type: "unattributed"` on 316 dispatches (2,854,588,645 tokens, about 85% of the digested total). No dispatch marker was written for those rows, so the per-agent cost table is **not published**. The census itself is the finding:

- Attributed: architect 5, architect-reader 49, architect-synth 1, devops 16, cleargate-wiki-query 6, general-purpose 1, fork 7, code-simplifier 1, and developer 2 plus qa 1 dispatches at 0 tokens.
- developer and qa show 0 tokens despite the whole 16-item build, which confirms that dev/qa work landed in the `unattributed` bucket.
- Historical ledger rows were not repaired (read-only check).

USD cost: not computed. The totals are inconsistent and mostly unattributed, and no current rate source is in the bundle.

**Wall time:** about 2 calendar days overall. Per-story wall times were not computed because the ledger rows are not attributable to stories.

---

## §4 Observe Phase Findings

### 4.1 Bugs Found (UR:bug)
| Date | Description | Resolution | Commit |
|---|---|---|---|
| 2026-10-16/17 (walkthrough) | BUG-001: `.gitignore` without final newline gains a byte after `init` then `remove` | Block inserted at top (after BOM) when the text has no final line break; strip returns exact bytes | merge `fd1b0d3` |
| 2026-10-16/17 (walkthrough) | BUG-002: `remove` leaves `.claude/settings.json.bak` | No backup for wikeeper-created settings files; recorded `.bak` deleted when its file is deleted or restored | merge `db72fc9` |

### 4.2 Hotfixes Triggered
| ID | Trigger | Resolution | Commit |
|---|---|---|---|
| (none) | — | — | — |

### 4.3 Review Feedback (UR:review-feedback)
| Date | Description | Status (folded / deferred) | Deferred to / Rationale |
|---|---|---|---|
| 2026-10-16/17 (walkthrough) | 16 review-feedback items (individual texts are not in the bundle) | deferred | SPRINT-02/03 as CR-002, with the human's sign-off. They are enhancements, not goal-breaking. |

Also observed (not UR events): CR-001 (CR:approach-change, merge `ab2fc10`) was resolved in-sprint, and D.5 consolidation (`13b9f3c`) ran after the walkthrough fixes.

---

## §5 Lessons

### New Flashcards (Sprint Window)

| Date | Tags | Lesson |
|---|---|---|
| — | — | The bundle's Flashcard Slice reports "No flashcard entries found in sprint window (no date window available)". Commit `1079fa4` shows `.cleargate/FLASHCARD.md` gaining 2 lines during M5 wave A, but their text is not in the bundle. The Architect plans (M1-M5) propose about 20 flashcards (e.g. `#cli #commander` exitOverride before `.command()`, `#hooks #npm` npx PATH `node_modules/.bin`, `#qa #red-test` grep red tests before changing documented output). Whether they were recorded is not verifiable from the bundle. |

### Flashcard Audit (Stale Candidates)
Not performed. The audit needs a repo-wide grep of every active card's symbols, and this dispatch is bundle-only (no FLASHCARD.md in the bundle). Bundle slice missing for the stale-detection pass. FLASHCARD.md was not modified.

### Supersede Candidates
| Newer card | Older card | Proposed marker for older |
|---|---|---|
| (none identified; not assessable from the bundle) | — | — |

---

## §6 Framework Self-Assessment

### Templates
| Item | Rating | Notes |
|---|---|---|
| Story template completeness | Green | 13 stories shipped with 0 bounces. The Architect wrote no Task Breakdown rows into L2 stories, and the gate accepted them. |
| Sprint Plan Template usability | Yellow | Milestone plans repeatedly raised "spec-literal" open decisions (C1/C4 skeleton stub policy, base branches). They were resolved at the orchestrator, not in the template. |
| Sprint Report template (this one) | Yellow | §3 has no row for per-item sprint-goal items and no slot for UR:review-feedback that is deferred rather than shipped. The Enhancement Tax formula yields 100% here even though nothing shipped. |

### Handoffs
| Item | Rating | Notes |
|---|---|---|
| Architect → Developer brief quality | Green | Exact signatures, algorithms and gotchas per story. 0 bounces across 16 items. |
| Developer → QA artifact completeness | Green | 0 QA bounces. |
| QA → Orchestrator kickback clarity | Green | No kickbacks. M5 plan surfaced two red-test authorisation blockers before QA-Red ran. |

### Skills
| Item | Rating | Notes |
|---|---|---|
| Flashcard gate adherence | Yellow | Architect dispatches could not call the flashcard skill and listed flashcards for the orchestrator. The bundle shows only 2 flashcard lines added (`1079fa4`). |
| Adjacent-implementation reuse rate | Green | The D.5 pass found duplicated helpers (`isInside` x3, version reader, code-unit comparator x8, `abs()` x5) and consolidated them. M2 risk 7 had predicted the `isInside` duplication. That duplication is the cost of the contract-first parallel build; consolidation was cheap. |

### Process
| Item | Rating | Notes |
|---|---|---|
| Bounce cap respected | Green | 0 QA and 0 Arch bounces. |
| Three-surface landing compliance | Green | Not independently checked; no reconciler failure reported. |
| Circuit-breaker fires (if any) | Green | None recorded. |

### Lane Audit
No story was ever assigned `lane: fast` (state.json shows all 16 as standard).

| Story | Files touched | LOC | Demoted? | In retrospect, was fast correct? (y/n) | Notes |
|---|---|---|---|---|---|
| (none) | — | — | — | — | — |

### Hotfix Audit
| Hotfix ID | Originating signal | Files touched | LOC | Resolved-by SHA | Could this have been a sprint story? (y/n) | If y — why was it missed at planning? |
|---|---|---|---|---|---|---|
| (none) | — | — | — | — | — | — |

### Hotfix Trend
0 hotfixes in the window (no hotfix-ledger data in the bundle). SPRINT-01 is the first sprint, so there is no rolling 4-sprint series. Monotonic-increase flag: no.

### Tooling
| Item | Rating | Notes |
|---|---|---|
| run_script.sh diagnostic coverage | Green | No `## Script Incidents` reported; no incident JSON cited. |
| Token ledger completeness | Red | 316 unattributed dispatches (about 85% of digested tokens); developer and qa rows show 0 tokens. Per-agent breakdown refused (§3). |
| Token divergence finding | Red | §3 divergence is above 20%: ledger-work=3,357,154,187, session-total=357,451,140, delta about 839%, with work larger than total. Reporter-pass tokens are TBD, which does not explain a gap this large. |

---

## §7 Change Log

| Date | Author | Change |
|---|---|---|
| 2026-10-17 | Reporter agent | Initial generation |

## Post-report update (orchestrator, 2026-10-17)

- PR #1's first CI run, the first Windows run of SPRINT-01 code, was red on windows-latest only: two Linux-simulating guard-form red units could not run on a win32 host because of the drive-letter colon; `pathWith(true)` wrote no binary on win32; and the goal e2e test hit the 5 s default timeout.
- Routed as `bug`: STORY-002-06 reopened (qa_bounces 0 → 1). QA-Red re-scope 981eaa5, Dev f3e9829, QA PASS, merged ef9f523.
- Re-run 38963866637: all six matrix jobs green. Goal Acceptance Check item 5 is now met.
<!-- END sprint-report -->
