---
cr_id: CR-002
parent_ref: EPIC-001 | EPIC-002 | EPIC-003 | EPIC-005 | EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
complexity_label: L2
context_source: "SPRINT-01 walkthrough: walkthrough-wiki test session report (2026-10-16) + orchestrator observation of its transcript · verified against src/ and the raw epic files"
created_at: 2026-10-16T17:15:00Z
updated_at: 2026-10-16T17:15:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T17:04:36Z
  transition: ready-to-apply
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id CR-002
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:04:35Z
  sessions: []
---

# CR-002: SPRINT-01 walkthrough feedback — CLI polish and scope notes for SPRINT-02/03

All items below are `UR:review-feedback` from the SPRINT-01 walkthrough. None of them is broken against spec. The two spec breaks went to [[BUG-001]] and [[BUG-002]], and the `ai` rule scope to [[CR-001]]. This CR is the input for SPRINT-02 decomposition: each item is routed to the epic that owns it.

## 0.5 Open Questions

- **Question:** Should the pointer block stay within EPIC-006's 12-line cap?
- **Recommended:** Raise the cap to 14 lines. Items B1–B3 add a visible "managed by wikeeper" line, an ownership line and an ingest fallback line, which together do not fit in 12 lines next to the current five bullets. The block loads into every session, so 14 is the upper limit.
- **Human decision:** {populated during Brief review}

- **Question:** How should the `.bak` files that wikeeper writes stay out of commits?
- **Recommended:** `init` and `update` add each `.bak` path they write to the managed `.gitignore` block, and `remove` takes it out again. Today `git add -A` commits them.
- **Human decision:** {populated during Brief review}

- **Question:** How should `me.md` be loaded reliably?
- **Recommended:** Decide during EPIC-006 decomposition. Option 1: the block keeps "read `.wiki/me.md` at session start", which relies on the agent following it. Option 2: wikeeper adds an `@.wiki/me.md` import line to `CLAUDE.md`. That works for Claude only and pulls a gitignored file into every session. The recommended default is option 1, plus a SETUP.md step that checks it works.
- **Human decision:** {populated during Brief review}

## 1. The Context Override (Old vs. New)

**Obsolete Logic (What to Remove / Forget):**
- `doctor` warns `claude-agents-md-only` as a warning whenever claude is configured and only `AGENTS.md` exists, even on Claude Code versions that read it.
- `init` writes `.wiki/` before it asks which agents to wire.
- The guard's deny message, the WIKI block and the settings rules name different ingest verbs (`ingest apply` vs `ingest start` / `ingest finish`).
- The pointer block relies on HTML-comment markers to tell the agent it is managed, but Claude Code strips HTML comments from `AGENTS.md`/`CLAUDE.md` before the agent sees them.

**New Logic (The New Truth), by owner:**

**A. CLI polish (EPIC-001 / EPIC-002 code, SPRINT-02)**
1. `init` asks every question (agents, enforce) **before** writing anything, so Ctrl-C at a prompt leaves the repository untouched.
2. `claude-agents-md-only` becomes `info`, worded "Claude Code older than v2.1.277 ignores AGENTS.md when no CLAUDE.md exists". `doctor` pluralises its summary correctly ("1 warning").
3. Every subcommand's `--help` shows `--json`.
4. `remove --purge` help names what is deleted ("the wiki content: pages/, raw/, index.md, log/, in .wiki/ or `content_dir`"), not "the content directory".
5. `doctor` also reports the setup state, the effective permission mode (marked `default` when `ingest.permission` is unset), whether enforce is on, the hooks and rules present per agent, and stale or orphaned `.bak` files.
6. The `init`/`update` reports name every settings file they change, and list a written backup under `backed_up`, not `added`.
7. The `.bak` files that wikeeper writes are gitignored (see Open Question 2).

**B. EPIC-006 content (SPRINT-02)**
1. The pointer block opens with a visible line, "Managed by wikeeper — edit outside this block only", because HTML comments are stripped.
2. The block names what the agent may edit (`.wiki/config.yml`, `.wiki/kb_instructions.md`, `.wiki/me.md`) and what is package-owned (`.wiki/system/`, skills, sub-agents, settings entries).
3. The block gives a fallback: "if `wikeeper ingest` is unavailable, do not write pages; tell the user".
4. One set of ingest verbs everywhere: block, guard deny message (`src/agents/hook-protocols.ts:5`), settings rules, SETUP.md and WIKI.md all use the EPIC-003 command names (`start` → `apply` → `finish`). The deny message points to a WIKI.md section that exists.
5. The `me.md` template defines its schema: frontmatter `type: me` plus `person:`, then body fields, with an explicit rule for unknown values (leave the field out, or write `TBD`, one rule).
6. SETUP.md's permission step shows what each mode installs in each agent's settings before applying it, and states the defaults (`ingest.permission` unset = `ask`).
7. WIKI.md explains `log/` (one file per event) vs `log.md` (generated, gitignored view).

**C. EPIC-003 (SPRINT-02)**
1. Whitelist `kinds` entries match a source-kind id ignoring its version (`meeting-notes` matches `meeting-notes (v1)`, `(v2)` and later); `lint --rules` (EPIC-005) checks that whitelist kinds name existing kinds.
2. The `read` story adds its `ai`-mode allow rule (from [[CR-001]]).

**D. EPIC-005 (SPRINT-03)**
1. The guard cannot see shell writes (`>` / `tee` into `pages/`). Lint's "page changed without a log entry" check is the stated backstop, and WIKI.md says so.

## 2. Blast Radius & Invalidation

- [x] Update Epic: EPIC-001 (A1–A5: `init`, `doctor`, help text), EPIC-002 (A2, A5–A7: doctor checks, enforce reporting and backups), EPIC-003 (C1, C2), EPIC-005 (D1), EPIC-006 (B1–B7, plus the block line cap). These are scope additions applied at SPRINT-02/03 decomposition; no Done story is reopened.
- [x] Update Story: none. All SPRINT-01 stories stay Done; the work becomes new SPRINT-02/03 stories.
- [ ] Database schema impacts? No.

## Existing Surfaces

- **Surface:** `src/commands/init.ts:222`: `runIntegrations("init", …)` runs the agents prompt after core files are written (A1).
- **Surface:** `src/agents/doctor-checks.ts:109`: the `claude-agents-md-only` check (A2).
- **Surface:** `src/commands/doctor.ts:233`: the summary line `${errors} errors, ${warnings} warnings` (A2).
- **Surface:** `src/commands/remove.ts:156`: the `--purge` help text "the content directory" (A4).
- **Surface:** `src/program.ts:47`: `--json` is a root-only option (A3).
- **Surface:** `src/commands/update.ts:140`: the report puts a new backup under `added` (A6).
- **Surface:** `src/agents/hook-protocols.ts:5`: `GUARD_REASON` names `ingest apply` (B4).
- **Surface:** `src/core/gitignore.ts:79`: the `log.md` ignore entry (B7).
- **Surface:** `./templates/agent-block.md`: the pointer block (B1–B4).
- **Why this CR extends rather than rebuilds:** every item adjusts an existing command, check or template; none adds a new subsystem.

## Prior work

- Related: [[EPIC-001]], [[EPIC-002]] (doctor checks and `--enforce`), [[EPIC-003]] (permission modes and the D-28 log design), [[EPIC-005]] (lint backstop), [[EPIC-006]] (pointer block, me.md template, SETUP.md/WIKI.md), [[BUG-001]], [[BUG-002]], [[CR-001]]. The wiki-query duplicate check found no existing CR for any item. The raw epic files cover the me.md template and the doctor checks only partly.

## 3. Execution Sandbox

**Modify (when the SPRINT-02/03 stories run):**
- `src/commands/init.ts`, `src/commands/doctor.ts`, `src/commands/remove.ts`, `src/commands/update.ts`, `src/program.ts`
- `src/agents/doctor-checks.ts`, `src/agents/enforce/index.ts`, `src/agents/hook-protocols.ts`, `src/core/gitignore.ts`
- `templates/agent-block.md`, `templates/me.md`, `templates/system/SETUP.md`, `templates/system/WIKI.md`
- The EPIC-003 and EPIC-005 files named in their own stories

**Now (on approval):** add a one-line "CR-002 scope addition" bullet to EPIC-001, EPIC-002, EPIC-003, EPIC-005 and EPIC-006 §2, pointing at this CR.

## 4. Verification Protocol

**Command/Test:** `npm test` (each SPRINT-02/03 story carries its own Gherkin); plus a repeat of the acmeworks-style walkthrough at the end of SPRINT-02.

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | `init` interrupted at the prompt vs completed. |
| Interfaces | T | Human `--help` / `doctor` text vs `--json` reports. |
| Data | F | No item varies by data shape; per-item stories add their own Data axes. |
| Rules | T | Interrupted `init` writes nothing; the block line cap; one set of ingest verbs. |

```gherkin
Feature: SPRINT-01 walkthrough feedback

  @paths @rules
  Scenario: init interrupted at the agents prompt leaves no trace
    Given an empty git repository
    When I run "wikeeper init" in a terminal and press Ctrl-C at the agents prompt
    Then the repository contains no .wiki/ and no other new file

  @interfaces
  Scenario: doctor tells the truth about agent files and defaults
    Given claude is configured, only AGENTS.md exists, and ingest.permission is unset
    When I run "wikeeper doctor --json"
    Then "claude-agents-md-only" has severity "info"
    And the output reports permission mode "ask" marked as default

  @rules
  Scenario: one ingest vocabulary
    Given templates/agent-block.md, the guard deny message and the settings rules
    When the structural test extracts every "wikeeper ingest <verb>" reference
    Then every verb exists in "wikeeper ingest --help"

  Scenario: Obsolete logic is gone — the block is visibly managed without HTML comments
    Given AGENTS.md after init, with HTML comments removed as Claude Code does
    Then the remaining block text still says it is managed by wikeeper and names the files the agent may edit
```

**Test layers.**

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 0 | Set per story at SPRINT-02/03 decomposition |
| Integration tests | 0 | No external services |
| E2E / acceptance tests | 4 | One per Gherkin scenario above; story-level tests are added at decomposition |

---

## Context Source

**context_source:** SPRINT-01 walkthrough on 2026-10-16. A Claude Code test agent set up `~/walkthrough-wiki` with the `sprint/S-01` build; the orchestrator drove and observed it. Every finding was checked against `src/`, `architecture.md` and the raw epic files.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] "Obsolete Logic" to be evicted is explicitly declared.
- [ ] All impacted downstream Epics/Stories are identified and reverted to 🔴 High Ambiguity.
- [x] Execution Sandbox contains exact file paths.
- [x] Verification command is provided.
- [ ] `approved: true` is set in the YAML frontmatter.
- [x] Existing Surfaces cites at least one source-tree path the CR extends.
