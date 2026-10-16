---
sprint_id: "SPRINT-02"
created_at: "2026-10-16T20:50:22.441Z"
last_updated: "2026-10-16T20:50:22.441Z"
---

# Sprint Context

Per-sprint audit artefact. Populated at sprint init (M1 planning) and re-touched after each story merges. Referenced from every Developer/QA/Architect task brief so all agents start from the same baseline.

## Sprint Goal

An agent takes a real source from "ingest this" to cited wiki pages through `wikeeper ingest`, under all three permission modes, finding what the wiki already knows with `wikeeper search`, guided by the real SETUP.md, ONBOARDING.md and WIKI.md.

## Goal Acceptance Check

Confirmed by the human on 2026-10-16 together with the sprint plan (SPRINT-02 plan, "Goal Acceptance Check"). The goal is met when all four hold on `sprint/S-02`:

1. `test/e2e/ingest.test.ts` (STORY-003-09) passes on Linux, macOS and Windows CI: a file, a directory, a chat excerpt and a URL with agent-supplied text each complete start → facts → apply → finish under `ai`, `ask` and `whitelist`.
2. The search performance test (STORY-004-02) reports p95 < 500 ms on 500 generated pages.
3. The structural template test (STORY-006-06) passes: every command and flag the templates name exists in `--help`, every referenced file and section exists.
4. Walkthrough (qualitative): in `~/Documents/Dev/formapass_management`, `wikeeper remove` then `wikeeper init`; onboarding writes `me.md`, setup writes `project.md` for the Formapass product and drafts `kb_instructions.md`; the agent ingests sources from `~/Documents/Dev/doc_processor/.cleargate/wiki` (`product-state.md`, `roadmap.md`, and a directory such as `initiatives/` through `ingest plan`) and answers product questions with citations. No ❌ in the notes.

## Locked Versions

Frozen dependency versions for this sprint. Orchestrator populates from `package.json` snapshots at sprint init; Developers must not upgrade these mid-sprint without an explicit CR.

| Package | Version |
|---------|---------|
| Node    | `>=24.0.0` |
| TypeScript | `^5.8.0` |
| (add rows per workspace below) |  |

## Test Stack

Repo-derived test conventions. Written best-effort by `cleargate init` (detector); the
orchestrator may correct any field per-sprint. Agents read this block as OVERRIDING their
built-in defaults — Developer/QA/Architect use these values, not any hardcoded runner.

| Field | Value |
|-------|-------|
| Backend runner    | _(e.g. `pytest -q` · `go test ./...` · `npm test` · populate at init)_ |
| Frontend runner   | _(e.g. js unit runner — blank if single-stack)_ |
| Typecheck command | _(e.g. `mypy .` · `tsc --noEmit` · blank if none)_ |
| Red-test naming   | _(e.g. `*.red.test.tsx` · `test_*_red.py` · `*_red_test.go` · populate at init)_ |

_If unresolved at init: leave the table stubbed. The pre-gate scan emits a one-line
"test_stack unresolved — populate sprint_context.md §Test Stack" advisory and treats the
typecheck/test gate as advisory (not FAIL) until populated. (§0.5 backstop decision.)_

## Cross-Cutting Rules

Sprint-wide architecture rules and UI/API tokens that every story must honour. Populated from the parent Epic's `<architecture_rules>` block.

1. (rule 1)
2. (rule 2)
3. (rule 3)

## Active FLASHCARD Tags

FLASHCARD tags that appear in any story's `<agent_context>` for this sprint. Auto-populated by grepping `.cleargate/FLASHCARD.md` at sprint init. Agents: grep the flashcard file for each tag listed here before starting work.

- `#tag1` — one-line summary of the most recent card
- `#tag2` — one-line summary

## Adjacent Implementations (Reuse First)

Exported helpers and modules from already-merged stories in this sprint. The Architect updates this section after each story merges. Developers check here before writing new helpers — if the module already exists, import it; duplication is a kick-back criterion.

| Story | Module / Export | Path |
|-------|----------------|------|
| (populated as stories merge) | | |

## Mid-Sprint Amendments

_(populated by Architect on CR:scope-change or CR:approach-change; never rewrite, only append. Format: '<ISO-ts> · <ID> · <one-line note>')_
