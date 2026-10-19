---
cr_id: CR-004
parent_ref: null
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T12:10:55Z
context_source: "The human, 2026-10-18: \"Dev/Kurnera is running cleargate too. it has designer approach, maybe we could use something similar? have a look please\", then \"go ahead please\" to the adapted proposal (guide, map and DRAFTS before SPRINT-04 kickoff) · Kurnera .claude/agents/designer.md and CR-002 (method only) · verified in this repo: templates/system/WIKI.md, src/core/output.ts, src/core/exit-codes.ts, .claude/hooks/pre-tool-use-task.sh:84, .cleargate/.install-manifest.json (lists .claude/skills/sprint-execution/SKILL.md)"
created_at: 2026-10-18T10:40:00Z
updated_at: 2026-10-18T10:40:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
draft_tokens:
  input: null
  output: null
  cache_read: null
  cache_creation: null
  model: null
  sessions: []
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T11:01:00Z
  transition: ready-to-apply
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
---

# CR-004: Designer review for CLI output and agent instructions

## 0.5 Open Questions

- **Question (Q1, which modes run in SPRINT-04):** DRAFTS, PLAN, VERIFY and JOURNEY all exist. Which run this sprint?
- **Recommended:** DRAFTS now, before the human confirms the SPRINT-04 plan, and JOURNEY once before the real-user walkthrough. PLAN and VERIFY start in SPRINT-05, once the guide has settled. VERIFY on 13 of the 16 stories would add 13 Opus dispatches and a kickback loop to a sprint already planned as 6–7 waves. Kurnera's CR-002 moved the review to planning for the same reason: per-story reviews stopped stories mid-sprint.
- **Human decision (2026-10-18):** no JOURNEY in SPRINT-04 ("no need"); the human's walkthrough is the check. SPRINT-04 runs DRAFTS only. From SPRINT-05: DRAFTS at planning, PLAN and VERIFY per story. JOURNEY runs only when the human asks.

- **Question (Q2, where the wiring lives):** ClearGate's `sprint-execution` skill is listed in `.cleargate/.install-manifest.json`, so `cleargate upgrade` replaces it, and the edits Kurnera made there would be lost here.
- **Recommended:** a wikeeper-owned skill `.claude/skills/design-review/SKILL.md` (when each mode runs, what the orchestrator does with each verdict) and one paragraph in `CLAUDE.md` after the `CLEARGATE:END` marker, which takes precedence over ClearGate defaults.
- **Human decision (2026-10-18):** as recommended ("ok").

- **Question (Q3, who owns the guide):** May the designer change `docs/ux.md`?
- **Recommended:** no. `docs/ux.md` changes only with the human's approval (a CR, or a Gate 1 decision); the designer proposes changes as cross-flow notes. The designer keeps `docs/ux-map.md` current in VERIFY and JOURNEY.
- **Human decision (2026-10-18):** as recommended ("ok").

- **Question (Q4, what blocks):** What happens to a DRAFTS finding?
- **Recommended:** a finding blocks only when it cites a rule in `docs/ux.md` or a word-list conflict. The planner fixes findings marked "planner can fix" in the story text, recorded in that story's §1.4; findings marked "human decides" go to the human together with the plan confirmation. Anything without a cited rule is a cross-flow note with a proposed CR title. At most two rounds, then ESCALATE.
- **Human decision (2026-10-18):** as recommended ("ok").

## 1. The Context Override (Old vs. New)

**Obsolete Logic (What to Remove / Forget):**
- User-facing wording and agent behaviour are checked only by QA against each story's Gherkin, by the structural template tests (`test/templates/structure.ts`), and by the human's real-user walkthrough at the end of the sprint. [[SPRINT-02]] §4.1 row 8.11 (a WIKI.md instruction that was wrong in meaning) was found only by a real agent run, and [[CR-002]] and [[CR-003]] carried walkthrough wording fixes into the next sprint.
- Nothing compares messages, JSON keys, words or notices across stories, so two stories can each be correct and still say the same thing two ways, or add notices that pile up at session start.

**New Logic (The New Truth):**
- **`docs/ux.md`**, the UX guide: numbered rules for the agent's voice (plain words, never naming commands, tell once, ask before changing what the user didn't ask for), CLI human output, JSON conventions, exit codes, a word list with words the agent never says to the user, and a never-do list. Derived from what wikeeper already ships.
- **`docs/ux-map.md`**, the UX map: the user journeys through the agent (setup, adding a document, asking, session start, a page over its limit, a clean-up, a new version, removal), step by step, with what the CLI prints and what the agent tells the user, and every notice that can appear at session start.
- **`.claude/agents/designer.md`**, the designer agent, adapted from Kurnera's method:
  - DRAFTS: at sprint planning, all story drafts at once; conflicts with the guide and map, and between stories.
  - PLAN: before the Developer, for stories that change CLI output or agent instructions.
  - VERIFY: after QA-Verify; runs the changed commands in a scratch wiki and checks the real output (transcripts instead of screenshots).
  - JOURNEY: once per sprint, before the human's walkthrough; drives the touched journeys with `claude -p` in a scratch copy, with plain requests that never name wikeeper, and reads what the agent tells the user.
  - Blocks only on a cited rule; never edits product code, tests, stories or `docs/ux.md`; no personal documents in fixtures or transcripts.
- When each mode runs is set by Q1; the wiring by Q2.

## 2. Blast Radius & Invalidation

- [x] Invalidate/Update Story: none. No story's scope changes. The DRAFTS findings on SPRINT-04's 16 stories are handled under Q4: wording fixes in the story text (recorded in each story's §1.4) or decisions for the human.
- [x] Invalidate/Update Epic: none.
- [x] Database schema impacts? No.
- **Process:** SPRINT-04's plan confirmation waits for the DRAFTS report. The orchestrator's token ledger does not attribute designer dispatches: `designer` is not in the dispatch-marker allow-list (`.claude/hooks/pre-tool-use-task.sh:84`, ClearGate-owned). Kurnera has the same gap; it is reported, not fixed here.
- **Session:** a new agent file is picked up only after Claude Code restarts. Until then the orchestrator runs the designer's instructions through a general agent.

## Existing Surfaces

- **Surface:** `templates/system/WIKI.md` — the agent instructions whose user-facing behaviour the designer reviews.
- **Surface:** `src/core/output.ts:20` — the result and error envelopes; `src/core/exit-codes.ts:1` — exit codes.
- **Surface:** `test/templates/structure.ts` — structural template tests, which check form and leave meaning to the walkthrough.
- **Surface:** `.claude/agents/qa.md` — QA checks acceptance against Gherkin, not consistency across stories.
- **Why this CR extends rather than rebuilds:** it adds one review agent and two documents to the existing five-agent loop; nothing in the loop changes, and the real-user walkthrough stays the final check.

## Prior work

- No prior designer, UX guide or CLI style guide (cleargate-wiki-query, 2026-10-18).
- [[CR-002]] and [[CR-003]]: walkthrough feedback with CLI polish and wording follow-ups, the problem this CR catches earlier.
- [[SPRINT-02]]: report §4.1 row 8.11, a wrong WIKI.md instruction found only by a real agent run.
- [[EPIC-003]]: D-08, reports computed from the snapshot diff (metadata only), one of the guide's rules.

## 3. Execution Sandbox

**Create:**
- `docs/ux.md`
- `docs/ux-map.md`
- `.claude/agents/designer.md`
- `.claude/skills/design-review/SKILL.md`

**Modify:**
- `./CLAUDE.md` — one paragraph after `<!-- CLEARGATE:END -->`.

## Task Breakdown

- [x] Write `docs/ux.md` and `docs/ux-map.md` from the shipped code and templates, plus the SPRINT-04 journeys.
- [x] Write `.claude/agents/designer.md` with the four modes.
- [x] Run DRAFTS over SPRINT-04's 16 stories; apply planner-fixable findings to the stories; bring the rest to the human with the plan confirmation.
- [x] Write `.claude/skills/design-review/SKILL.md` and the `CLAUDE.md` paragraph per Q1 and Q2.
- [x] No JOURNEY before SPRINT-04's walkthrough (Q1).

## 4. Verification Protocol

**Command/Test:** `cleargate gate check .cleargate/delivery/pending-sync/CR-004_designer_review.md`; the DRAFTS report exists at `.cleargate/sprint-runs/SPRINT-04/design/SPRINT-04-design-drafts.md` and every blocking finding cites a `docs/ux.md` section; after a restart, `Agent(subagent_type=designer)` resolves.

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | DRAFTS at planning and JOURNEY when the human asks are two ways the review runs. |
| Interfaces | F | One surface only: the orchestrator dispatching the agent. |
| Data | F | The input is always story files (DRAFTS) or a scratch wiki (JOURNEY). |
| Rules | T | Blocks only on a cited rule; never edits product code or `docs/ux.md`. |

```gherkin
Feature: Designer review

  @paths
  Scenario: DRAFTS finds conflicts across stories before the plan is confirmed
    Given SPRINT-04's 16 approved stories and docs/ux.md
    When the designer runs in Mode DRAFTS
    Then .cleargate/sprint-runs/SPRINT-04/design/SPRINT-04-design-drafts.md lists each conflict with its docs/ux.md section and says who fixes it

  @rules
  Scenario: A finding without a cited rule never blocks
    Given a DRAFTS observation that no docs/ux.md rule covers
    Then it appears as a cross-flow note with a proposed CR title, not as a finding

  @paths
  Scenario: JOURNEY reads what the agent tells the user
    Given a scratch copy of a wiki and the sprint's merged build
    When the designer runs in Mode JOURNEY with plain requests that never name wikeeper
    Then the report quotes what the agent told the user at each step and flags notices that pile up

  @rules
  Scenario: The designer changes no product code
    When the designer finishes any mode
    Then git shows changes only under .cleargate/sprint-runs/<sprint>/design/ and docs/ux-map.md
```

**Test layers.**

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 0 | No product code changes. |
| Integration tests | 0 | No product code changes. |
| E2E / acceptance tests | 1 | The DRAFTS run on SPRINT-04. JOURNEY is checked the first time the human asks for one. |

---

## Context Source

**context_source:** the human's request and go-ahead in chat, 2026-10-18; Kurnera's designer agent and CR-002 (method only); this repo's code as cited.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] "Obsolete Logic" to be evicted is explicitly declared.
- [x] All impacted downstream Epics/Stories are identified and reverted to 🔴 High Ambiguity.
- [x] Execution Sandbox contains exact file paths.
- [x] Verification command is provided.
- [x] `approved: true` is set in the YAML frontmatter.
- [x] Existing Surfaces cites at least one source-tree path the CR extends.
