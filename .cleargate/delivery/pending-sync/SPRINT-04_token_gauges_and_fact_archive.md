---
sprint_id: SPRINT-04
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
lifecycle_init_mode: warn
remote_id: null
source_tool: null
status: Draft
start_date: null
end_date: null
synced_at: null
created_at: 2026-10-18T07:40:00Z
updated_at: 2026-10-18T07:40:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T07:43:59Z
  transition: ready-for-execution
epics:
  - EPIC-007
  - EPIC-008
  - EPIC-009
proposals: []
context_source: "Carries EPIC-007 (Token gauges) and EPIC-008 (Fact archive), both approved by the human on 2026-10-18, after SPIKE-003 (Completed 2026-10-18, Win: a dependency-free estimate within ±15% of Claude Opus 5.5's real counts). Decomposed into 13 stories (STORY-007-01…07, STORY-008-01…06) from plans/decomposition.md (story set, file ownership, contracts K1–K13). EPIC-009 (Version check and upgrade, requested and approved 2026-10-18) adds STORY-009-01…03 from plans/decomposition-epic-009.md (contracts K14–K16). Sprint Design Review pending (§2)."
stamp_error: no ledger rows for work_item_id SPRINT-04
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-18T07:43:59Z
  sessions: []
---

# SPRINT-04: Token gauges and fact archive

## Human decisions (2026-10-18)

- **Token counts measure content:** each document, each page and the wiki in total. What the agent loads or spends is not measured.
- **Levels:** documents and pages get green, yellow and red; the wiki total is a number with no level.
- **Defaults** (written by `init`, changeable with `wikeeper config set`): page 4k / 10k, document 20k / 60k, approval at yellow.
- **Command:** a general `wikeeper config get / set / unset`.
- **Archive:** ordinary ingests keep recording as today. Facts move to the archive only in a clean-up the user asks for. The agent tells the user once when a page turns red, and the user decides whether to raise the limit or ask for a clean-up. A deleted page's facts must survive in `pages/` or `archive/`.
- **Spike method:** real counts from `claude -p` on the human's subscription; no API keys.
- **Version check and upgrade (EPIC-009, added the same day):** wikeeper checks npm for a newer version from ingest commands (at most once a day, saved, opt-out); `wikeeper upgrade` runs npm itself; in this sprint. At Gate 1 the human approved the recommendations: only `ingest plan` and `ingest start` print the notice; npm only; the agent asks before `update` and `upgrade`.
- **Gate 1 (all 16 stories):** the human agreed with every recommendation in `plans/gate1-decisions.md` (61 decisions, 19 red-test re-scopes).

## 0. Stakeholder Brief

- **Sprint Goal:** The user always knows how big the wiki, each page and each document are in tokens, approves a large document before it is read, changes the limits from the CLI, can ask for a clean-up that moves outdated facts to an archive without losing any, and hears when a newer wikeeper is out and can upgrade with one command.
- **Business Outcome:** the wiki stays small enough to be useful as it grows. Before SPRINT-04 a long PDF could be read and every page kept growing without anyone noticing; after it, the size is visible everywhere it matters, large documents wait for a yes, and old facts can be moved out of the way and still be found, and users learn about new releases and stay on them.
- **Risks (top 3):** the conservation rule changes `ingest finish`'s core refusal, so a wrong rule would block real ingests; `wikeeper upgrade` runs npm on the user's machine, and ingest commands gain a network request; 16 stories share `status`, `search`, `lint`, the finish report and `WIKI.md`.
- **Metrics:** estimates within ±15% of Claude's real count on SPIKE-003's samples; `wikeeper statusline` p95 < 300 ms on 500 pages; no fact line can leave `pages/` except into the archive (every rule has a refusing test and a passing test); with npm unreachable, ingest commands exit as before; the part-4 real-user walkthrough finds no ❌.

## Sprint Goal

The user always knows how big the wiki, each page and each document are in tokens, approves a large document before it is read, changes the limits from the CLI, can ask for a clean-up that moves outdated facts to an archive without losing any, and hears when a newer wikeeper is out and can upgrade with one command.

**Goal Acceptance Check (proposed; the human confirms it at Gate 2):**
1. *Mechanical*, on the merged `sprint/S-04` tree: `npm run typecheck`, `npm test` and `npm run test:perf` pass; `wikeeper --version` prints `0.4.0` with the build stamp; in a copy of the SPRINT-03 walkthrough wiki (`walkthrough-wiki-backup-2026-10-17.tar.gz`), `wikeeper status --json` reports `tokens.wiki` within ±15% of 66,042 (Claude's real count, SPIKE-003), and `version.files` is `0.3.0` with a line telling the user to run `wikeeper update`.
2. *Behavioural*: walkthrough part 4 (real user, `~/walkthrough-wiki`, a fresh session per task, plain requests that never name wikeeper) ends with no ❌. It must show the agent, unprompted: showing the wiki's size at the start of a session; not reading a document above the approval limit before the user says yes, and telling the user its size; changing a limit when the user asks in plain words; telling the user once about a red page; when the user asks for a clean-up, moving outdated facts to the archive with `ingest finish` passing and the facts still found by a history search; and, with the project's files from 0.3.0, telling the user they are out of date and running `update` only after a yes. (A newer version than 0.4.0 can't exist on npm during the walkthrough, so `upgrade` is checked by tests with an injected fetch and npm runner.)

## 1. Consolidated Deliverables

| Item | Type | Title | Decomposed? | Notes |
|---|---|---|---|---|
| `EPIC-007` | Epic | Token gauges | yes (007-01…07) | Estimator from SPIKE-003. |
| `EPIC-008` | Epic | Fact archive | yes (008-01…06) | Uses EPIC-007's page limits for candidates. |
| `EPIC-009` | Epic | Version check and upgrade | yes (009-01…03) | Added and approved 2026-10-18. |
| `SPIKE-003` | Spike | Token estimate calibration | done | Completed before the sprint (Win). |

**Story set (16):**

<!-- cleargate:ignore-ids -->
| Story ID | Title | Lane | Milestone | Parallel? | Bounce Exposure |
|---|---|---|---|---|---|
| STORY-007-01 | Token estimator, `tokens` limits in config, limits written by `init` | standard | SDR | y | med |
| STORY-007-02 | `wikeeper config get / set / unset` | standard | SDR | n | low |
| STORY-007-03 | Document size in `read` and the size approval at `ingest start` | standard | SDR | n | med |
| STORY-007-04 | Estimates in `ingest plan` | standard | SDR | n | med |
| STORY-007-05 | Wiki and page sizes: `status`, the finish report, search hits, `oversized-page` lint | standard | SDR | n | med |
| STORY-007-06 | `wikeeper statusline` and `--install` | standard | SDR | n | med |
| STORY-007-07 | Token instructions, allow rules for `statusline` and `config get`, docs, 0.4.0 | standard | SDR | n | med |
| STORY-008-01 | The archive in the write phase: paths, guard, snapshot, abort, diff, page hashes | standard | SDR | y | med |
| STORY-008-02 | The conservation rule at `ingest finish`, archive validation, archived counts | standard | SDR | n | high |
| STORY-008-03 | Index and search: `index.md` from `pages/` only, `search --archive`, history searches | standard | SDR | n | med |
| STORY-008-04 | Lint covers the archive | standard | SDR | n | med |
| STORY-008-05 | `status` archive size and candidates; `remove`, `--purge` and `private:` | standard | SDR | n | med |
| STORY-008-06 | Archive instructions and docs | standard | SDR | n | med |
| STORY-009-01 | Version check and version warnings | standard | SDR | n | med |
| STORY-009-02 | `wikeeper upgrade` | standard | SDR | n | med |
| STORY-009-03 | Upgrade instructions and docs | standard | SDR | n | low |
<!-- /cleargate:ignore-ids -->

Milestones, lanes and parallelism are set by the Sprint Design Review (§2); the values above are the drafting estimates. Upstreams and shared files are in `.cleargate/sprint-runs/SPRINT-04/plans/decomposition.md` and, for EPIC-009, `plans/decomposition-epic-009.md`.

### Not in this sprint

- Gemini 4 Argon token counts (no headless count for individual accounts) and direct counts for GPT-6 Astra and Sol (the ChatGPT account allows only GPT-6 Luna).
- Status lines for Codex and Antigravity; they get the size line at session start through the instructions.
- Deleting content for good inside an ingest, and any archive move made by the CLI or without the user asking.
- Upgrading through pnpm, yarn or bun; upgrading automatically or in the background; the new version in the status line.
- Publishing to npm: a separate step the human approves after Gate 4.

## 2. Execution Strategy

Pending the Sprint Design Review, which the Architect runs at kickoff (13 stories: reader/synth fan-out, `plans/waves.json`). Inputs: the story files, `plans/decomposition.md` (contracts K1–K13, shared files) and `plans/decomposition-epic-009.md` (K14–K16).

### 2.1 Phase Plan
Written by the Sprint Design Review.

### 2.2 Merge Ordering (Shared-File Surface Analysis)
Written by the Sprint Design Review. Starting point (decomposition brief):

| Shared File | Stories Touching It | Merge Order | Rationale |
|---|---|---|---|
| `src/core/config.ts` | STORY-007-01, STORY-007-02, STORY-009-01 | 007-01 → 007-02 → 009-01 | 01 adds the `tokens` schema; 02 adds the command helpers; 009-01 adds `update_check` |
| `src/program.ts` | STORY-007-02, STORY-007-06, STORY-009-02 | merge order | each appends one command |
| `src/commands/status.ts` | STORY-007-05, STORY-008-05, STORY-009-01 | 007-05 → 008-05 → 009-01 | 008-05 adds the archive next to the wiki total; 009-01 adds `version` |
| `src/commands/ingest-start.ts`, `src/commands/ingest-plan.ts` | STORY-007-03, STORY-007-04, STORY-009-01 | 007-03 / 007-04 → 009-01 | the version warning goes in after the size fields |
| `src/ingest/report.ts`, `src/commands/ingest-finish.ts` | STORY-008-01, STORY-007-05, STORY-008-02 | 008-01 → 007-05 → 008-02 | hashes, then the tokens line, then archived counts |
| `src/search/engine.ts`, `src/commands/search.ts` | STORY-007-05, STORY-008-03 | 007-05 → 008-03 | `page_tokens` first |
| `src/lint/checks.ts` | STORY-007-05, STORY-008-04 | 007-05 → 008-04 | `oversized-page` first; 008-04 makes it skip the archive |
| `templates/system/WIKI.md` | STORY-007-05, STORY-008-05, STORY-009-01, STORY-007-07, STORY-008-06, STORY-009-03 | 007-05 → 008-05 → 009-01 → 007-07 → 008-06 → 009-03 | each story that adds a `status` key writes its WIKI.md bullet (a red test pins bullets to the keys); the instruction stories follow |
| `templates/skills/wiki-search/SKILL.md`, `architecture.md`, `README.md` | STORY-007-07, STORY-008-06, STORY-009-03 | 007-07 → 008-06 → 009-03 | the archive text builds on the token text; the upgrade text comes last |
| `package.json` | STORY-007-06, STORY-007-07, STORY-009-01 | 007-06 → 007-07 → 009-01 | `test:perf` lines and version 0.4.0 |

### 2.3 Shared-Surface Warnings
Written by the Sprint Design Review.

### 2.4 Lane Audit
Written by the Sprint Design Review.

### 2.5 ADR-Conflict Flags
- EPIC-008 relaxes [[CR-003]] B1 (`finish` refuses any dropped fact line) into the conservation rule. Approved with EPIC-008 on 2026-10-18; architecture.md gains a decision entry (STORY-008-06).
- EPIC-009 amends the rule that only `read` uses the network ([[EPIC-003]], architecture.md `:425`): ingest commands and `upgrade` ask npm for the latest version. Approved with EPIC-009 on 2026-10-18; architecture.md gains a decision entry, D-38 (STORY-009-03).

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| The conservation rule refuses a legitimate ingest (a page renamed, merged, or moved whole to the archive). | STORY-008-02 has a passing test for each of these and a refusing test for each rule; the refusal keeps the lock, so the writer can fix the page, as today. |
| The estimate is calibrated against Claude only; Gemini is unmeasured. | Claude counts highest of the measured models, so the gauges over-report for Codex rather than under-report. The ±15% error is stated in `WIKI.md` and the README. |
| Counting a PDF at `ingest start` runs `read`'s extraction and takes time. | `read`'s timeout and size limits apply; `ingest plan` extracts nothing; in the normal flow `start` counts the `--text-file` `read` already wrote. |
| `wikeeper statusline` runs on every redraw of Claude Code's status line. | p95 < 300 ms on 500 pages, enforced by `npm run test:perf` (STORY-007-06). |
| Several stories edit `status`, `search`, `lint`, the finish report and `WIKI.md`. | Merge order in §2.2; the SDR fixes contracts and waves. |
| The human's own `~/.claude/settings.json` already sets a status line. | `statusline --install` refuses and prints how to add the wiki line to the existing one; it never replaces one. |
| The version check slows or breaks ingest (offline, behind a proxy, in an agent sandbox). | One request a day at most, a 1.5 s timeout, failures saved and silent; the check never changes a result or exit code (STORY-009-01 tests with a fetch that never answers). |
| `wikeeper upgrade` runs npm on the user's machine and can fail halfway. | It runs only when the user asks, never with `sudo`; npm's error and the command to run by hand are shown; `update` runs only after npm succeeds. Tests use an injected npm runner. |

## Metrics & Metadata
- **Expected Impact:** the user sees the wiki's size at every session start and every document's size before it is read; pages can shrink again without losing a fact.
- **Priority Alignment:** requested by the human after real use (2026-10-18). EPIC-007 first; EPIC-008 builds on its page limits.

---

## Execution Guidelines (Local Annotation — Not Pushed)

- **Starting Point:** STORY-007-01 and STORY-008-01 have no upstream and unblock everything else. EPIC-009's stories merge late: they share `config`, `status`, the ingest commands and `WIKI.md` with EPIC-007 and EPIC-008.
- **Relevant Context:** `plans/decomposition.md` (contracts K1–K13), `plans/decomposition-epic-009.md` (K14–K16), SPIKE-003 §5 (the estimator), EPIC-007, EPIC-008 and EPIC-009.
- **Constraints:** no new runtime dependency; the CLI makes no model calls; no test reaches npm or runs npm; never replace a user's status line; the samples and scripts from SPIKE-003 stay out of the repository; walkthroughs run as a real user, never with personal documents.
- **Release:** `package.json` moves to `0.4.0` (STORY-007-07). Publishing is a separate step after Gate 4.
