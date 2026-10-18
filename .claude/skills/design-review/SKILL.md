---
name: design-review
description: When the orchestrator dispatches wikeeper's designer agent and what it does with each verdict. DRAFTS once at sprint planning (after the SDR, before the human confirms the plan); from SPRINT-05, PLAN before the Developer and VERIFY after QA-Verify for stories that change CLI output or agent instructions; JOURNEY only when the human asks. Load at sprint planning and before dispatching a Developer for such a story.
---

# Design review: the designer in wikeeper's sprint loop

This skill belongs to wikeeper (CR-004), not to ClearGate, so `cleargate upgrade` leaves it alone. Where it differs from `.claude/skills/sprint-execution/SKILL.md`, this skill wins (the project section of `CLAUDE.md`).

The designer checks what a user meets (CLI output and what the agent tells the user) against two documents:
- `docs/ux.md`, the UX guide. Only the human changes it, through a CR or a Gate 1 decision. The designer proposes changes as cross-flow notes.
- `docs/ux-map.md`, the user journeys and the session-start notices. The designer keeps it current.

## When each mode runs

| Mode | When | Which stories | Since |
|---|---|---|---|
| DRAFTS | Once per sprint, after the SDR has written `waves.json` and before the human confirms the plan | All of the sprint's stories at once | SPRINT-04 |
| PLAN | After the Architect's milestone plan, before the Developer | Each story that changes CLI output or agent instructions | SPRINT-05 |
| VERIFY | After QA-Verify passes, before DevOps merges | The same stories | SPRINT-05 |
| JOURNEY | Only when the human asks for it. The human's real-user walkthrough is the final check | The journeys the sprint touched | when asked |

A story changes CLI output or agent instructions when its file surface includes `src/commands/**`, `src/core/output.ts`, `src/core/exit-codes.ts` or `templates/**`, or when its Gherkin quotes a line the CLI prints or the agent says. When unsure, include it.

PLAN and VERIFY are not yet part of the wave script (`launch_wave`). Before SPRINT-05 kickoff, add them to it between the Architect plan and the Developer, and between QA-Verify and DevOps.

## Dispatch

```
Agent(subagent_type=designer, prompt:
  "MODE: DRAFTS SPRINT=<id>. Stories: <paths>. Wave plan: <sprintDir>/plans/waves.json.")
  "MODE: PLAN STORY=<id> SPRINT=<id>. Story: <path>. Architect plan: <sprintDir>/plans/M<N>.md.")
  "MODE: VERIFY STORY=<id> SPRINT=<id>. Worktree: <path>. Commit: <sha>. QA report: <path>.")
  "MODE: JOURNEY SPRINT=<id>. Merged build: <path>. Journeys touched: <ux-map J ids>.")
```

- Pass the sprint goal in PLAN and VERIFY prompts, as for every execution dispatch.
- If `Agent(subagent_type=designer)` returns "not found" (the agent registry is cached at session start), run a general-purpose agent with the body of `.claude/agents/designer.md` as its instructions. To have it resolve again, restart Claude Code.
- The token ledger does not count designer runs, because `designer` is not in the dispatch-marker allow-list in `.claude/hooks/pre-tool-use-task.sh`. That hook belongs to ClearGate, so don't edit it here. Write the designer runs in the sprint report's cost section by hand.

## What to do with each verdict

**DRAFTS**
- `READY`: bring the plan to the human for confirmation.
- `NEEDS-CHANGES`, finding marked "planner can fix":
  - Change the story text, yourself or through an edit agent.
  - Wording only. Never change a Gate 1 decision, scope, a contract signature, a file list or an exit code.
  - Add a bullet to the end of the story's §1.4: `**DRAFTS review (designer, <date>):** wording aligned with docs/ux.md — <what changed>. No decision changed.`
  - Re-run `cleargate gate check` on each changed file.
- A planner fix that would change a contract or a Gate 1 decision goes to the human instead.
- A finding marked "human decides": put it in the plan confirmation, with the designer's recommendation and the alternative.
- After the human's decisions are applied, run DRAFTS round 2 over the changed stories. On round 3, `ESCALATE`.

**PLAN**
- `READY`: dispatch the Developer, and include the designer's `UX_NOTES` verbatim in the dispatch prompt.
- `NEEDS-CHANGES`: fix the Architect plan or the story wording before the Developer starts, with the same limits as DRAFTS. A fix that changes a contract goes to the human. At most 2 rounds.

**VERIFY**
- `PASS`: continue to the Architect post-flight and DevOps.
- `FAIL`: send the story back to the Developer with the cited findings, as for a QA fail. At most 2 rounds, then `ESCALATE`.
- `TRANSCRIPT_CHECK: partial` with a stated reason (e.g. upgrade's install paths) is not a fail.

**JOURNEY**
- Bring the report to the human before the walkthrough. The human decides which fails are fixed now and which become CRs.

**Every mode**
- `ESCALATE`: halt and bring the blockers report to the human.
- Cross-flow notes never block. Collect them for the sprint report, and the human decides which become CRs.
- Append `flashcards_flagged` entries to `.cleargate/FLASHCARD.md`.

## Rules

- A finding blocks only when it cites a `docs/ux.md` section or a word-list row.
- The designer never edits product code, tests, stories or `docs/ux.md`.
- The designer works only in scratch wikis with neutral content (`.claude/agents/designer.md`, Safety). It never works in a real wiki, a user's project folder, or a copy or backup of one.
