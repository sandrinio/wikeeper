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
updated_at: 2026-10-17T08:30:13Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T08:30:34Z
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
  last_stamp: 2026-10-17T08:30:12Z
  sessions: []
---

# SPRINT-03: Lint, status and read

> **Draft, not planned.** This file records the selected scope and a proposed story set. Stories are drafted after the open questions are answered; the Sprint Design Review, wave plan and milestones come after that, before Gate 2.

## 0. Stakeholder Brief

- **Sprint Goal (draft, to confirm at planning):** An agent keeps the wiki healthy and complete: `wikeeper lint` and `lint --rules` find page and rule problems, `wikeeper status` shows open work, re-ingest candidates and pending rule suggestions, rule decisions are remembered, and `wikeeper read` turns web pages, DOCX and PDF files into markdown the agent can ingest.
- **Business Outcome:** the CLI that INITIATIVE-001 describes is complete. After SPRINT-02 the wiki fills up and answers questions; after SPRINT-03 it also says when it is decaying (broken links, uncited claims, edits made outside an ingest, stale facts, drifting rules), and documents the agent cannot open itself can be ingested.
- **Risks (top 3):** `read` brings the first network access and five new runtime dependencies; lint, `status` and `rules` all depend on one `kb_instructions.md` parser whose line format does not exist yet; about 16 stories across six epics, with WIKI.md and the structural test touched by several.
- **Metrics:** every EPIC-005 lint check has a fixture that triggers it and one that passes (EPIC-005 metric); a rejected rule proposal is reported as "previously rejected" when proposed again (EPIC-005 metric); `read` converts the DOCX, PDF and HTML fixtures with headings, lists and tables kept (EPIC-003 metric); every INITIATIVE-001 success criterion can be checked on `main`; a part-3 acmeworks walkthrough finds no ❌.

## Sprint Goal

Finish the wikeeper CLI: health checks, rule evolution and document reading.

## 1. Consolidated Deliverables

Items selected for this sprint. Each is decomposed into stories at planning time.

| Item | Type | Title | Decomposed? | Notes |
|---|---|---|---|---|
| `EPIC-005` | Epic | Lint, status and rule evolution | no | Includes CR-002 D1 (`unlogged-change` as the backstop for shell writes) and C1's `lint --rules` half (whitelist kinds name existing kinds), and CR-003 D1–D5. |
| `EPIC-003` | Epic | Ingest pipeline: `read` | no | Archived after SPRINT-02 without `read`. `read` keeps the next EPIC-003 ids (decided at SPRINT-02 planning), with CR-002 C2 (its `ai`-mode allow rule). |
| `CR-003` | CR | SPRINT-02 walkthrough feedback | n/a | Items A–F go into stories under EPIC-001…006. **Approval pending.** |

**Proposed story set (to confirm before drafting):**

<!-- cleargate:ignore-ids -->
| Proposed story | Title | Source |
|---|---|---|
| STORY-005-01 | `kb_instructions.md` parser and line format (questions, entities, kinds, notes) | EPIC-005, CR-003 D1–D3 |
| STORY-005-02 | `wikeeper lint`: check registry, `broken-link`, `orphan-page`, `uncited-claim`, `index-drift` | EPIC-005 |
| STORY-005-03 | `unlogged-change`, stale volatile facts (`lint.stale_after_days`), lint hook in `finish` | EPIC-005, CR-002 D1 |
| STORY-005-04 | `wikeeper lint --rules`; `doctor` warns on a parse failure | EPIC-005, CR-002 C1, CR-003 D4 |
| STORY-005-05 | `wikeeper status`, with pending rule suggestions | EPIC-005, CR-003 D5 |
| STORY-005-06 | `wikeeper rules record` / `rules list` | EPIC-005 |
| STORY-005-07 | `ingest facts --dry-run` | EPIC-005 |
| STORY-003-10 | `wikeeper read`: command, URL reading, limits, `ai`-mode allow rule | EPIC-003, CR-002 C2 |
| STORY-003-11 | `read` for DOCX and PDF ("likely scanned") | EPIC-003 |
| STORY-003-12 | Ingest follow-ups: dropped fact lines, `needs_approval` output, help text | CR-003 B1–B3 |
| STORY-004-07 | Search follow-ups: `--no-miss`, `--mark`, misses count, filter-only miss text, limit note | CR-003 A1–A5 |
| STORY-002-09 | Enforce and doctor follow-ups: `ai`-mode prompts for destructive flags, wiring line, setup-files sub-checks | CR-003 C1, F3, F4 |
| STORY-001-10 | `--version` build stamp; `--help` footer | CR-003 F1, F2 |
| STORY-006-09 | Instructions for `read`, `lint`, `status` and `rules` (WIKI.md, SETUP.md, skills) | EPIC-006 |
| STORY-006-10 | CR-003 instruction items | CR-003 C2, C3, D1–D3, E1–E10 |
| STORY-006-11 | Structural template tests for the SPRINT-03 commands | EPIC-006 |
<!-- /cleargate:ignore-ids -->

**Not in this sprint:**
- Knowledge-base quality evaluation: after INITIATIVE-001 (its §5).
- Publishing to npm: a separate step after Gate 4 (see Open Questions in the planning Brief).

## 2. Execution Strategy

_Not started._ The Architect writes this during the Sprint Design Review, after decomposition: phase plan, merge ordering, shared-surface warnings, lane audit, ADR-conflict flags and `waves.json`.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `read` is the first command that uses the network, and adds `linkedom`, `defuddle`, `mammoth`, `turndown` and `unpdf` (about 8 MB). | Each library is loaded only when its format is read; tests use a local HTTP server and fixture files, never the internet; versions are checked on npm when the story is drafted; the package size is checked. |
| Lint (`lint --rules`), `status`, `rules` and `doctor` all depend on the `kb_instructions.md` parser, and the line format for questions and entities is new. | STORY-005-01 freezes the parser and format as a contract first; the seed (`templates/kb_instructions.management.md`) and SETUP.md step 3 are updated to the same format in STORY-006-10. |
| WIKI.md, SETUP.md and the structural test are touched by STORY-006-09, 006-10 and 006-11, and must name only commands that exist. | The command surfaces of the new commands are frozen as contracts; the instruction stories build against them; 006-11 runs last. |
| Stories under archived epics (EPIC-001…004, 006) may trip the close-time parent roll-up. | Checked at the SPRINT-02 close: `cleargate new story --epic EPIC-003` accepts an archived parent. The roll-up already runs with `CLEARGATE_SKIP_PARENT_ROLLUP=1`; the reconciler is checked at preflight. |
| The `ai`-mode change (CR-003 C1) depends on whether a Claude Code permission rule can match a flag inside a command. | The story verifies the rule syntax against Claude Code's documentation and falls back to prompting for every `abort`. |

## Metrics & Metadata

- **Expected Impact:** every INITIATIVE-001 success criterion is met on `main`; the CLI surface in `architecture.md` §10 is fully built.
- **Priority Alignment:** follows the INITIATIVE-001 order (EPIC-001 + 002 → 003 + 004 + 006 → 005), with `read` moved here from SPRINT-02 (human, 2026-10-16). Knowledge-base quality evaluation stays out of scope (INITIATIVE-001 §5).

---

## Execution Guidelines (Local Annotation — Not Pushed)

- **Starting Point:** decided at planning; likely STORY-005-01 (parser contract) and STORY-003-10 (`read`) in parallel, since neither depends on the other.
- **Relevant Context:** `architecture.md` §7.7 (`read`), §8 (knowledge model), §9 (rule evolution), §10 (CLI surface); EPIC-005, EPIC-003 (`read` scope), CR-002, CR-003; the SPRINT-02 walkthrough notes (`~/walkthrough-wiki/wikeeper-test-notes-sprint-02.md`).
- **Constraints:** no LLM calls in the CLI; only `read` uses the network; lint is read-only over pages and `kb_instructions.md`; every command has `--json` and stable exit codes; instruction text names only commands that exist at the end of the sprint.
