---
sprint_id: SPRINT-02
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
created_at: 2026-10-16T17:25:00Z
updated_at: 2026-10-16T17:25:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T17:10:28Z
  transition: ready-for-execution
epics:
  - EPIC-003
  - EPIC-006
proposals: []
context_source: "Carries EPIC-003 and EPIC-006 (approved 2026-10-16; SPRINT-01 plan names them for SPRINT-02) and CR-002 items A–C (SPRINT-01 walkthrough feedback, approval pending). Not yet decomposed: no stories, no SDR."
stamp_error: no ledger rows for work_item_id SPRINT-02
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:10:28Z
  sessions: []
---

# SPRINT-02: Ingest pipeline and instructions

> **Draft, not planned.** This file only records the scope that was selected. There is no story decomposition, Sprint Design Review, wave plan or milestone yet; those come at planning time, before Gate 2.

## 0. Stakeholder Brief

- **Sprint Goal (draft, to confirm at planning):** An agent takes a real source from "ingest this" to cited wiki pages through `wikeeper ingest`, under all three permission modes, guided by the real SETUP.md and WIKI.md for the Management profile.
- **Business Outcome:** wikeeper starts doing its job. After SPRINT-01 it installs an empty shell; after SPRINT-02 the agent can set up the wiki properly and fill it from meeting notes, documents and links, with provenance, permissions and a write lock.
- **Risks (top 3):** EPIC-003 is the largest epic so far (about 12 capabilities), so its decomposition may need a split; EPIC-006's structural tests depend on EPIC-003's command names; document-reading libraries (PDF, DOCX, URL) are new dependencies that must stay lazy-loaded.
- **Metrics:** a file, a directory, a URL and a chat excerpt each complete register → facts → apply → finish under `ai`, `ask` and `whitelist` (EPIC-003 metric); every command referenced in the templates exists in `--help` (EPIC-006 metric); a repeat of the formapass walkthrough finds no ❌.

## Sprint Goal

Make wikeeper usable for its first real job: setting up a Management wiki and ingesting sources into it safely.

## 1. Consolidated Deliverables

Items selected for this sprint. Each epic is decomposed into stories at planning time.

| Item | Type | Title | Decomposed? | Notes |
|---|---|---|---|---|
| `EPIC-003` | Epic | Ingest pipeline | no | Includes the CR-002 C items: whitelist kinds ignore the version; the `read` story adds its `ai` allow rule. |
| `EPIC-006` | Epic | Instructions and Management profile | no | Includes the CR-002 B items: the visible "managed by wikeeper" line, editable-file list, ingest fallback, one ingest vocabulary, `me.md` schema, permission-mode preview in SETUP.md, `log/` vs `log.md` in WIKI.md. |
| `CR-002` | CR | SPRINT-01 walkthrough feedback | n/a | Items A1–A7 (CLI polish) go into SPRINT-02 stories. Item D1 (lint backstop) goes to SPRINT-03 with EPIC-005. **Approval pending.** |

**Not in this sprint:**
- `BUG-001`, `BUG-002`: these are `UR:bug`s from the SPRINT-01 walkthrough. They block SPRINT-01's merge to `main`, so they are fixed in SPRINT-01.
- `CR-001` (narrow the `ai` allow rules): recommended for SPRINT-01, before 0.1.0, but the human decision is pending. If it is deferred, add it here.
- `EPIC-004` and `EPIC-005`: SPRINT-03.

## 2. Execution Strategy

_Not started._ The Architect writes this during the Sprint Design Review, after decomposition: phase plan, merge ordering, shared-surface warnings, lane audit, ADR-conflict flags and `waves.json`.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| EPIC-003 is large (registry, permissions, the four-step ingest, lock and snapshot, diff validation, hooks, `read`, `index rebuild`). | Use the granularity rubric at decomposition; consider splitting `read` (document conversion) into its own milestone or sprint. |
| EPIC-006's structural test ("every referenced command exists in `--help`") needs EPIC-003's final command names. | EPIC-003's command surface is frozen as a contract first; EPIC-006 builds against it. |
| New runtime dependencies for `read` (defuddle, linkedom, mammoth, turndown, unpdf). | They are lazy-loaded, named in the milestone plan, and the package size is checked. |
| CR-002 and the CR-001 decision change EPIC-001/002 code that SPRINT-01 just shipped. | Small, separate stories; `test/e2e/goal.test.ts` stays green as the regression guard. |
| SPRINT-01 must close first: BUG-001/002, D.5 consolidation, CI on 3 OSes, Gate 4. | Planning for SPRINT-02 starts only after SPRINT-01 closes (preflight check 1). |

## Metrics & Metadata

- **Expected Impact:** first end-to-end ingest; release `0.2.0` cut from the sprint result.
- **Priority Alignment:** follows the INITIATIVE-001 order (EPIC-001 + 002 → 003 + 006 → 004 + 005). Knowledge-base quality evaluation stays out of scope (INITIATIVE-001 §5).

---

## Execution Guidelines (Local Annotation — Not Pushed)

- **Starting Point:** decided at planning.
- **Relevant Context:** `architecture.md` §5 (instruction files), §7 (ingest flow, permissions, delegation), §8 (page format), §9 (rule evolution); EPIC-003, EPIC-006, CR-002; the SPRINT-01 walkthrough notes (`~/Documents/Dev/formapass_management/wikeeper-test-notes.md`).
- **Constraints:** no LLM calls in the CLI; every command has `--json` and stable exit codes; `remove` stays exact; the agent never writes pages outside an ingest.
