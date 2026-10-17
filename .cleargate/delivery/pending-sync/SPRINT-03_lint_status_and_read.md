---
sprint_id: SPRINT-03
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
created_at: 2026-10-17T08:27:39Z
updated_at: 2026-10-17T09:54:36Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:54:56Z
  transition: ready-for-execution
epics:
  - EPIC-001
  - EPIC-002
  - EPIC-003
  - EPIC-004
  - EPIC-005
  - EPIC-006
proposals: []
context_source: "Carries EPIC-005 (approved 2026-10-16; SPRINT-01 and SPRINT-02 plans name it for SPRINT-03), the `read` story of EPIC-003 (moved from SPRINT-02 by the human, 2026-10-16), CR-002 C1 (lint half), C2 and D1, and CR-003 (SPRINT-02 walkthrough feedback, approval pending). EPIC-001…004 and 006 are archived; they carry new SPRINT-03 stories for the CR-002/CR-003 follow-ups. Not yet decomposed: no stories, no SDR."
stamp_error: no ledger rows for work_item_id SPRINT-03
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T10:25:35Z
  sessions: []
---

# SPRINT-03: Lint, status and read

> **Draft, not planned.** This file records the selected scope and a proposed story set. Stories are drafted after the open questions are answered; the Sprint Design Review, wave plan and milestones come after that, before Gate 2.

## Human decisions (2026-10-17)

- **Scope:** all of EPIC-005, `read` (EPIC-003) and CR-003 in this sprint, as proposed below.
- **`read` dependencies:** approved: `linkedom`, `defuddle`, `mammoth`, `turndown` and `unpdf`, each loaded only when its format is read; first network command (20 s timeout, 10 MB cap); tests never use the internet.
- **Release:** the sprint sets the package version to `0.3.0`; publishing to npm is a separate step the human approves after Gate 4.
- **Walkthrough part 3 (Goal check):** headless, in `~/walkthrough-wiki`, after execution and before Gate 4. Run as a real user, not as a test (human, 2026-10-17): no walkthrough framing and no logging request in the prompts; plain product-management requests in the human's voice that never name a wikeeper command or WIKI.md; facts mentioned in passing, to see whether the agent records them unprompted; a fresh session per task; some permission prompts declined. The orchestrator keeps the notes table (`wikeeper-test-notes-sprint-03.md`) from the transcripts, the wiki log and the files. Any PDF on the machine may be used for `read`. The real knowledge base comes from the `~/product_repo` ClearGate wiki; the human will use wikeeper for product management, so the walkthrough also asks questions of that kind.
- **CR-003:** approved with all five recommended answers (`--no-miss`, dropped fact lines refused at `finish`, `ai` mode prompts for `abort --drop` and `apply --force-unlock`, `search --mark`, `--version` build stamp).
- **Gate 1 (stories):** all 20 stories approved as revised, with every decision in `.cleargate/sprint-runs/SPRINT-03/plans/gate1-decisions.md` (human, 2026-10-17). Decisions 14 (`search --mark`, the `--status` hint narrowed) and 16 (Codex prompts for every `abort`; `apply --force-unlock` stays allowed) change CR-003 as approved.
- **Real-user review (2026-10-17):** an outside review of the plan from a real user's side was checked against the code; the human approved four additions (Gate 1 decisions 22–26: pointer-block lines for answering, drafting and capture offers; `update` refreshes an unedited block, new STORY-002-11; re-ingest from a copy of the stored original; the `whitelist` chat-capture rule; `.csv` / `.tsv` in `read`) and deferral of the rest.

## 0. Stakeholder Brief

- **Sprint Goal (draft, to confirm at planning):** An agent keeps the wiki healthy and complete: `wikeeper lint` and `lint --rules` find page and rule problems, `wikeeper status` shows open work, re-ingest candidates and pending rule suggestions, rule decisions are remembered, and `wikeeper read` turns web pages, DOCX and PDF files into markdown the agent can ingest.
- **Business Outcome:** the CLI that INITIATIVE-001 describes is complete. After SPRINT-02 the wiki fills up and answers questions; after SPRINT-03 it also says when it is decaying (broken links, uncited claims, edits made outside an ingest, stale facts, drifting rules), and documents the agent cannot open itself can be ingested.
- **Risks (top 3):** `read` brings the first network access and five new runtime dependencies; lint, `status` and `rules` all depend on one `kb_instructions.md` parser whose line format does not exist yet; 21 stories across six epics, with WIKI.md and the structural test touched by several.
- **Metrics:** every EPIC-005 lint check has a fixture that triggers it and one that passes (EPIC-005 metric); a rejected rule proposal is reported as "previously rejected" when proposed again (EPIC-005 metric); `read` converts the DOCX, PDF and HTML fixtures with headings and lists kept, and tables kept for DOCX and HTML (EPIC-003 metric; PDF table rows become lines, Gate 1 decision 7); every INITIATIVE-001 success criterion can be checked on `main`; the part-3 real-user walkthrough in walkthrough-wiki finds no ❌.

## Sprint Goal

Finish the wikeeper CLI: health checks, rule evolution and document reading.

## 1. Consolidated Deliverables

Items selected for this sprint. Each is decomposed into stories at planning time.

| Item | Type | Title | Decomposed? | Notes |
|---|---|---|---|---|
| `EPIC-005` | Epic | Lint, status and rule evolution | no | Includes CR-002 D1 (`unlogged-change` as the backstop for shell writes) and C1's `lint --rules` half (whitelist kinds name existing kinds), and CR-003 D1–D5. |
| `EPIC-003` | Epic | Ingest pipeline: `read` | no | Archived after SPRINT-02 without `read`. `read` keeps the next EPIC-003 ids (decided at SPRINT-02 planning), with CR-002 C2 (its `ai`-mode allow rule). |
| `CR-003` | CR | SPRINT-02 walkthrough feedback | n/a | Items A–F go into stories under EPIC-001…006. Approved 2026-10-17. |

**Story set (21; Gate 1 approved 2026-10-17; STORY-002-11 added after the real-user review):**

<!-- cleargate:ignore-ids -->
| Proposed story | Title | Source |
|---|---|---|
| STORY-005-01 | `kb_instructions.md` parser and line format (questions, entities, kinds, notes) | EPIC-005, CR-003 D1–D3 |
| STORY-005-02 | `wikeeper lint`: check registry, `broken-link`, `orphan-page`, `uncited-claim`, `index-drift` | EPIC-005 |
| STORY-005-03 | Page hashes, `unlogged-change`, lint hook in `finish` | EPIC-005, CR-002 D1 |
| STORY-005-04 | `wikeeper lint --rules`; `doctor` warns on a parse failure | EPIC-005, CR-002 C1, CR-003 D4 |
| STORY-005-05 | `wikeeper status`, with re-ingest candidates and pending rule suggestions | EPIC-005, CR-003 D5 |
| STORY-005-06 | `wikeeper rules record` / `rules list` | EPIC-005 |
| STORY-005-07 | `ingest facts --dry-run` | EPIC-005 |
| STORY-005-08 | `stale-fact`: stale volatile facts (`lint.stale_after_days`) | EPIC-005 |
| STORY-005-09 | Allow rules for the read-only `lint`, `status` and `rules list` in every permission mode | EPIC-005, Gate 1 decision 17 |
| STORY-003-10 | `wikeeper read`: command, URL reading, limits, `ai`-mode allow rule | EPIC-003, CR-002 C2 |
| STORY-003-11 | `read` for DOCX and PDF ("likely scanned") | EPIC-003 |
| STORY-003-12 | Ingest follow-ups: dropped fact lines, `needs_approval` output, help text | CR-003 B1–B3 |
| STORY-004-07 | Search follow-ups: `--no-miss`, `--mark`, misses count, filter-only miss text, limit note | CR-003 A1–A5 |
| STORY-002-09 | `ai`-mode prompts for `--drop` and `--force-unlock`, and `update` with `enforce: false` removes the rules | CR-003 C1 |
| STORY-002-10 | Doctor messages: wiring line, setup-files sub-checks | CR-003 F3, F4 |
| STORY-002-11 | `wikeeper update` refreshes an unedited pointer block | Real-user review, Gate 1 decision 23 |
| STORY-001-10 | `--version` build stamp; `--help` footer | CR-003 F1, F2 |
| STORY-006-09 | Instructions for `read`, `lint`, `status` and `rules` (WIKI.md, SETUP.md, skills) | EPIC-006 |
| STORY-006-10 | CR-003 rules, permissions and search text | CR-003 A1, A5, C1–C3, D1–D3 text |
| STORY-006-12 | CR-003 writing, answering and onboarding text | CR-003 E1–E10 |
| STORY-006-11 | Structural template tests for the SPRINT-03 commands | EPIC-006 |
<!-- /cleargate:ignore-ids -->

**Not in this sprint:**
- Knowledge-base quality evaluation: after INITIATIVE-001 (its §5).
- Publishing to npm: a separate step the human approves after Gate 4.
- From the real-user review, deferred to a CR after walkthrough part 3 (`plans/gate1-decisions.md`): retracting a wrong or sensitive fact line; dismissing re-ingest candidates; dismissing pending rule suggestions per item; DOCX author and date.

## 2. Execution Strategy

_Not started._ The Architect writes this during the Sprint Design Review, after decomposition: phase plan, merge ordering, shared-surface warnings, lane audit, ADR-conflict flags and `waves.json`.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `read` is the first command that uses the network, and adds `linkedom`, `defuddle`, `mammoth`, `turndown` (+ GFM plugin) and `unpdf` (about 32 MB on disk with their dependencies, measured in [[SPIKE-001]]). | Each library is loaded only when its format is read; tests use a local HTTP server and fixture files, never the internet; versions checked on npm 2026-10-17; [[SPIKE-001]] converted the human's real Georgian and English PDF, DOCX and web pages on Node 22.12, 24 and 25. |
| Lint (`lint --rules`), `status`, `rules` and `doctor` all depend on the `kb_instructions.md` parser, and the line format for questions and entities is new. | STORY-005-01 freezes the parser and format as a contract first; the seed (`templates/kb_instructions.management.md`) and SETUP.md step 3 are updated to the same format in STORY-006-10. |
| WIKI.md, SETUP.md and the structural test are touched by STORY-006-09, 006-10, 006-12 and 006-11, and must name only commands that exist. | The command surfaces of the new commands are frozen as contracts; the instruction stories build against them; 006-11 runs last. |
| Stories under archived epics (EPIC-001…004, 006) may trip the close-time parent roll-up. | Checked at the SPRINT-02 close: `cleargate new story --epic EPIC-003` accepts an archived parent. The roll-up already runs with `CLEARGATE_SKIP_PARENT_ROLLUP=1`; the reconciler is checked at preflight. |
| The `ai`-mode change (CR-003 C1) depends on whether a Claude Code permission rule can match a flag inside a command. | Verified in [[SPIKE-002]] for Claude Code; Codex prefix rules cannot, so Codex prompts for every `abort` and leaves `apply` allowed (Gate 1 decision 16). |

## Metrics & Metadata

- **Expected Impact:** every INITIATIVE-001 success criterion is met on `main`; the CLI surface in `architecture.md` §10 is fully built.
- **Priority Alignment:** follows the INITIATIVE-001 order (EPIC-001 + 002 → 003 + 004 + 006 → 005), with `read` moved here from SPRINT-02 (human, 2026-10-16). Knowledge-base quality evaluation stays out of scope (INITIATIVE-001 §5).

---

## Execution Guidelines (Local Annotation — Not Pushed)

- **Starting Point:** decided at planning; likely STORY-005-01 (parser contract) and STORY-003-10 (`read`) in parallel, since neither depends on the other.
- **Relevant Context:** `architecture.md` §7.7 (`read`), §8 (knowledge model), §9 (rule evolution), §10 (CLI surface); EPIC-005, EPIC-003 (`read` scope), CR-002, CR-003; the SPRINT-02 walkthrough notes (`~/walkthrough-wiki/wikeeper-test-notes-sprint-02.md`).
- **Constraints:** no LLM calls in the CLI; only `read` uses the network; lint is read-only over pages and `kb_instructions.md`; every command has `--json` and stable exit codes; instruction text names only commands that exist at the end of the sprint.
