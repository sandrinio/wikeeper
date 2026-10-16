---
sprint_id: SPRINT-01
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
created_at: 2026-10-16T13:40:00Z
updated_at: 2026-10-16T13:40:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:32:30Z
  transition: ready-for-execution
epics:
  - EPIC-001
  - EPIC-002
proposals: []
context_source: Decomposes EPIC-001 (STORY-001-01…07) and EPIC-002 (STORY-002-01…06), both approved 2026-10-16 under INITIATIVE-001.
stamp_error: no ledger rows for work_item_id SPRINT-01
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:32:26Z
  sessions: []
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

| Story ID | Title | Lane | Milestone | Parallel? | Bounce Exposure |
|---|---|---|---|---|---|
| `STORY-001-01` | CLI core — command registry, `--json` output and exit codes | standard | M1 | y | med |
| `STORY-001-02` | Config schema and path resolution | standard | M1 | y | med |
| `STORY-001-03` | Ownership manifest and template loader | standard | M1 | y | low |
| `STORY-002-01` | Block injection engine | standard | M1 | y | low |
| `STORY-001-04` | `wikeeper init` | standard | M2 | n | med |
| `STORY-002-02` | Agent detection and target files | standard | M2 | y | med |
| `STORY-002-03` | Install skills and sub-agent definitions | standard | M2 | y | med |
| `STORY-002-05` | `wikeeper hook guard` command | standard | M2 | y | med |
| `STORY-001-05` | `wikeeper update` | standard | M3 | y | low |
| `STORY-001-06` | `wikeeper remove` and `--purge` | standard | M3 | y | med |
| `STORY-001-07` | `wikeeper doctor` and setup state | standard | M3 | y | low |
| `STORY-002-04` | Integration wiring and doctor checks | standard | M4 | n | med |
| `STORY-002-06` | `--enforce` — hooks and permission rules in agent settings | standard | M4 | n | med |

Milestones follow the dependency chain: M1 has no predecessors; M2 needs M1 (`init` needs config, manifest and CLI core); M3 needs `init`; M4 needs every lifecycle command plus 002-01…03 and 002-05, and 002-06 follows 002-04.

## 2. Execution Strategy

_Written by the Architect during Sprint Design Review, before Gate 2._

### 2.1 Phase Plan
_Pending Sprint Design Review._

### 2.2 Merge Ordering (Shared-File Surface Analysis)
_Pending Sprint Design Review._

### 2.3 Shared-Surface Warnings
_Pending Sprint Design Review._

### 2.4 Lane Audit
_Pending Sprint Design Review._

### 2.5 ADR-Conflict Flags
_Pending Sprint Design Review._

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `src/program.ts` and `./package.json` are touched by most stories (command registration, dependencies). | Architect freezes the registration pattern in STORY-001-01 as a contract; later stories add one line each and merge in milestone order. |
| Codex and Antigravity hook payloads and rule-file formats are unverified (STORY-002-05, 002-06). | Architect verifies against official docs during the milestone plan; fixtures are captured from the docs; unreadable payloads follow the fail-open decision. |
| `--enforce` merges into users' own settings files. | Opt-in, `.bak` before the first change, refuse unparseable files, tagged entries removed exactly on `remove`. |
| Windows CI (symlinks, CRLF, paths) is new. | `.gitattributes` forces LF; symlink → copy fallback; `node:path` everywhere; Windows runner in CI from STORY-001-01. |
| Instruction and skill text is placeholder until EPIC-006. | Sprint outcome is the install mechanism; content lands in SPRINT-02 with EPIC-003. |

## Metrics & Metadata

- **Expected Impact:** first functional release (`0.1.0`): installable, idempotent, reversible.
- **Priority Alignment:** EPIC-001 first (everything builds on it); EPIC-002 alongside so `init` delivers the agent wiring. EPIC-003 + EPIC-006 follow in SPRINT-02, EPIC-004 + EPIC-005 in SPRINT-03.

---

## Execution Guidelines (Local Annotation — Not Pushed)

- **Starting Point:** M1 in parallel — STORY-001-01 freezes the command-registration and output contract the rest depend on.
- **Relevant Context:** `architecture.md` §4 (layout, ownership matrix), §6 (agent matrix), §11 (config); EPIC-001 and EPIC-002.
- **Constraints:** no network, no LLM calls; Node ≥ 22.12; every command `--json`; never modify user-owned files or text outside WIKI markers.
