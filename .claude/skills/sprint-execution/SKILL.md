---
name: sprint-execution
description: |
  Use to orchestrate the five-dispatch sprint loop end-to-end — Architect → QA-Red →
  Developer → QA-Verify → Reporter — across one ClearGate sprint. Activates from sprint kickoff
  (preflight + cut sprint branch + state init) through per-story execution
  (worktree → dev → QA → flashcard gate → merge) into walkthrough and Gate-4 close.
  Triggers: SessionStart banner mentioning an active sprint; explicit user phrases
  "start the sprint", "run the sprint", "execute the sprint", "begin sprint
  execution", "kick off SPRINT-NN", "run STORY-NNN-NN"; CLI directives ending
  with `→ Load skill: sprint-execution`. The skill does not draft work items, run
  triage, or manage planning — those stay in always-on CLAUDE.md surface.
---

# Sprint Execution — The Playbook

You are the **Orchestrator**. You read this playbook top to bottom once when a sprint becomes active, then execute it. You never write production code. You delegate every implementation step to the four execution agents (`architect`, `developer`, `qa`, `reporter`) by spawning them via the `Agent` tool with the matching `subagent_type`.

This skill is the **execution-time** layer. Triage, drafting, and pre-sprint planning stay in CLAUDE.md and `cleargate-protocol.md`. Read those before deciding to load this skill.

---

## 0. When This Skill Loads

Three explicit load points (belt-and-suspenders — the SKILL description handles the rest):

1. **SessionStart banner.** When the doctor banner reports `Active sprint: SPRINT-NN`, the skill auto-loads. (Banner emitted by `.claude/hooks/session-start.sh`; `.cleargate/sprint-runs/.active` is the sentinel file.)
2. **CLI directive.** Any `cleargate sprint *` command finishing with the line `→ Load skill: sprint-execution` instructs the orchestrator to load this skill before continuing.
3. **Natural-language triggers.** "start the sprint", "kick off SPRINT-NN", "run the sprint", "execute the loop", "run STORY-NNN-NN" → load the skill, do not improvise.

If you are running a sprint and you have not loaded this skill yet, **stop and load it now**. Do not orchestrate from memory.

---

## 0.5 Goal-First Execution

**The sprint goal is the success criterion — not the count of merged stories.** A sprint where every story passes QA but the goal is not met is a failed sprint. Read `sprint_goal:` from the active sprint plan's frontmatter (or §1 if unstructured) at kickoff and treat it as the anchor for every decision the orchestrator makes.

Five touchpoints where the goal is the tiebreaker:

1. **Kickoff (§A.5).** Surface the sprint goal verbatim in chat before any Architect dispatch. State it as the explicit acceptance condition for the sprint, and derive + record the Goal Acceptance Check at the same halt (§A.5 below).
2. **Architect dispatch (§B).** Pass the sprint goal in the dispatch prompt. The milestone plan should reference how each story advances the goal, not only what files it changes.
3. **Mid-sprint CR triage (§C.10 rubric → §C.11 routing).** When classifying `CR:scope-change`, evaluate goal alignment before quarantining. If the new requirement is critical to the goal, escalate to the human with "this may need to land THIS sprint, not the next."
4. **Escalation (§8).** When `qa_bounces ≥ 3`, `arch_bounces ≥ 3`, or 3 circuit-breaker hits flip a story to `Escalated`, frame the human-decision question through the goal lens: "Drop this story → goal still met? Re-approach → goal still met by sprint end?"
5. **Walkthrough + Reporter brief (§D, §E.2).** Walkthrough invitation leads with the goal, not the feature checklist. Reporter brief MUST include a goal-achievement verdict — `met / partial / missed` — as a first-class signal in the close-gate Brief, derived from `sprint-context.md`'s `## Goal Acceptance Check`, not judged (§E.2).

**Compaction-proof anchor (CR-110).** The Orchestrator re-reads `sprint-context.md`'s `## Sprint
Goal` and `## Goal Acceptance Check` sections at every one of the five touchpoints above — not
only at kickoff — because the Orchestrator is the one participant whose own anchor is conversation
context, which compacts across a long sprint. The file, not memory, is the source of truth.

**What goal-first is NOT:**
- Not authority to skip stories the orchestrator deems "off-goal" — splits and merges are decomposition-time decisions, never mid-sprint.
- Not authority to rewrite the goal mid-flight — that requires a CR or a sprint reset.
- Not a license to relax acceptance criteria — story Gherkin still passes verbatim.

It is pure framing: surface deviations from the goal as first-class events, not afterthoughts.

---

## 1. Agent Roster + Dispatch Contract

| Subagent | Model | Spawn point | Output artifact |
|---|---|---|---|
| `architect` | opus | (a) Sprint Design Review pre-confirm, (b) per-milestone plan | `sprint-runs/<id>/plans/M<N>.md` (per milestone); markdown block §2 (design review) |
| `developer` | sonnet | One per story, inside its worktree | One commit `feat(<epic>): STORY-NNN-NN <desc>` + `STORY-NNN-NN-dev.md` report |
| `qa` | sonnet | After Developer reports `STATUS=done` | `STORY-NNN-NN-qa.md` report (no code edits) |
| `devops` | sonnet | Per-story, after QA-Verify + Architect post-flight | One merge commit (no-ff) + `STORY-NNN-NN-devops.md` report |
| `reporter` | sonnet | Once at sprint close, after all stories merged + walkthrough done | `sprint-runs/<id>/SPRINT-<#>_REPORT.md` |

**Registration constraint:** The Claude Code agent registry caches at session start. If an agent `.md` file under `.claude/agents/` was added or modified after the current session began, `Agent(subagent_type=<name>)` will return "Agent type '<name>' not found" even though the file exists. Fix: restart the Claude Code session. Verify `devops` reachable at sprint preflight (§A.1 check 6). If unavailable mid-sprint, use the §C.7 DevOps Escape Hatch.

### Wall-clock budgets

Each agent dispatch has a target duration. Note the start time before each `Agent` spawn; after the call returns, compare elapsed against the budget. Ran-long stories get flagged in sprint §4 Execution Log even on success.

| Agent | Budget | Notes |
|---|---|---|
| `architect` (per milestone) | ≤ 10 min | Plan-only output; long runs usually mean too many stories in the milestone |
| `developer` (per story) | ≤ 30 min | Includes typecheck + tests in the worktree; long runs near the circuit-breaker threshold |
| `qa` (per story) | ≤ 15 min | Read + re-run gates; should not edit code |
| `devops` (per story) | ≤ 5 min | Mechanical work only — merge, teardown, state; long runs indicate git/npm issue |
| `reporter` (per sprint) | ≤ 20 min | Single file write; long runs mean ledger reconciliation issues |

If a Task call has been pending for **>2× the budget** with no visible progress, surface it to the human and offer to interrupt. There is no automatic stall detection — the parent session blocks on `Agent` calls and cannot poll mid-run. The human's interrupt is the only reliable kill path until ambient watcher infra exists.

### Dispatch marker — written automatically before every spawn (fallback only)

The token-ledger hook attributes tokens by reading `.cleargate/sprint-runs/<sprint>/.dispatch-<session-id>.json`. The **primary path** is the PreToolUse:Task hook (`pre-tool-use-task.sh`), which auto-writes the marker on every `Agent` call without manual orchestrator intervention. The manual script below is a **fallback** for spawns the auto-hook cannot attribute (e.g. a generic Architect dispatch whose Task() prompt lacks a parseable work-item marker):

```bash
bash .cleargate/scripts/write_dispatch.sh <work_item_id> <agent_type>
```

- `<work_item_id>`: e.g. `STORY-020-02`, `CR-016`, `BUG-021`. For the Reporter at sprint close use the sprint ID (e.g. `SPRINT-19`).
- `<agent_type>`: exact string — `developer | architect | qa | reporter | devops | cleargate-wiki-contradict`.

The script is idempotent: if a same-session auto-marker (written by `pre-tool-use-task.sh`) already exists for the current session, it exits 0 without writing a duplicate. Omitting the manual call when the auto-hook fires is correct; calling it when unsure is safe (the guard prevents duplication). The hook deletes the marker after consumption — write fresh per dispatch if needed.

---

## 2. Execution Model — one path, no modes

There is one and only one way a sprint executes, and it has no name and no toggle. Every rule in `cleargate-enforcement.md` is **always enforced** (`CLEARGATE_ADVISORY=1` is the sole break-glass, and it only softens gate *strength*, never the execution path). Every sprint runs its Architect-produced `waves.json` through the Workflow tool (`/workflows`) via the `launch_wave` contract (§C.0). There is no alternate loop and no topology toggle. If `/workflows` is unavailable, the Orchestrator halts and says so — it does not run stories outside a wave segment.

**Serial-dispatch hosts.** A host whose adapter declares `dispatchMode: serial` has no Workflow primitive; ClearGate installs it a host-specific rendering of this playbook that runs the serial dispatch contract in `dispatch-serial.md` (this directory) instead of `/workflows`. Claude Code declares `dispatchMode: wave-parallel`, so on Claude Code the halt above stands.

### 2.1 Spikes run before the loop, not inside it

A spike is bounded discovery, not a sprint story, and none of this skill's machinery applies to it:

- A spike runs **before sprint kickoff** — it resolves an unknown that would otherwise block Architect planning; it is never scheduled into a milestone's wave.
- A spike takes **no `state.json` slot** — it is absent from the sprint's story registry entirely, not merely excluded from a wave.
- The sprint loop gives a spike **no worktree** — `C.2 Create worktree` is a per-story mechanic and never runs for one.
- Prototype code from a spike lives on a throwaway `spike/SPIKE-NNN` branch that is **discarded and never merged** — nothing it produces lands in `sprint/S-<id>` or `main`.

---

## 3. Phase A — Sprint Kickoff (Ready → Active)

Run this sequence exactly once, when the human says "start sprint NN" or equivalent. Halt on any failure; do not improvise around a failed gate.

### A.1 Sprint Execution Gate (Gate 3) — preflight

```bash
cleargate sprint preflight <sprint-id>
```

Six checks, all must pass:

1. Previous sprint `sprint_status: "Completed"` in `state.json`.
2. No leftover worktrees — `git worktree list` must not contain `.worktrees/STORY-*`.
3. Sprint branch ref free — `git show-ref refs/heads/sprint/S-NN` returns nothing.
4. `main` clean — `git status --porcelain` empty.
5. Per-item readiness gates pass — every work-item ID in §1 Consolidated Deliverables has fresh `cached_gate_result.pass: true` (or terminal status). A failing item hard-blocks. Failure punch-list names each item + its failing criteria.
6. **Verify `devops` subagent reachable** — attempt `Agent(subagent_type=devops, prompt: "echo preflight-check")` immediately after session start. If it returns "Agent type 'devops' not found", halt and ask the human to restart the Claude Code session; do NOT proceed under assumption the escape hatch will cover every merge. This check is manual (not enforced by `cleargate sprint preflight`); document result in sprint §4 Execution Log.

On failure, surface the punch list verbatim and halt. Per-item resolution:

- Prev sprint not closed → run sprint close on prev first.
- Leftover worktree → `git worktree remove` if abandoned, otherwise merge.
- Branch ref exists → investigate; force-deletion only with explicit human approval.
- Dirty main → human commits/stashes/discards. **Never `git reset --hard` or stash without explicit human approval.**
- Per-item gate fail → run `cleargate gate check <file> -v` for the named item; fix the failing criterion (e.g., populate `context_source`, resolve TBDs); re-run preflight.
- Devops unreachable → restart Claude Code session; re-run all 6 preflight checks.

### A.2 Cut sprint branch

```bash
git checkout -b sprint/S-NN main
```

Sprint branch is **never committed to directly**. All work lands via story-branch merges.

### A.3 Initialize sprint state

```bash
node .cleargate/scripts/init_sprint.mjs SPRINT-NN
```

This writes `.cleargate/sprint-runs/SPRINT-NN/state.json`, flips `.cleargate/sprint-runs/.active` to `SPRINT-NN` (atomic tmp+rename), and ingests SDR lane assignments so fast-lane stories are stamped correctly without manual reclassification. Without `state.json` the lane router, dispatch hook, and close pipeline all fail.

**Lane ingest (CR-078):** `init_sprint.mjs` reads lane assignments from `<sprintDir>/plans/waves.json` (`lane_assignments: { "STORY-ID": "fast"|"standard" }` top-level key) when the file is present. When `waves.json` is absent it falls back to parsing the Sprint Plan §2.4 Lane Audit table (`| Story-ID | fast | rationale |`). Stories not declared in either source keep the `standard` default. Fast-lane stories receive `lane_assigned_by: 'sdr-lane-audit'`; no manual `cleargate story lane …` reclassification is needed after init.

**`.active` sentinel (CR-078):** `init_sprint.mjs` atomically writes the sprint ID to `.active` as its final step. This is the single place the sentinel is SET at kickoff; `cleargate sprint close` (`sprint.ts`) is the single place it is CLEARED. If a prior `.active` value differs from the sprint being initialised, init emits `WARN: .active was SPRINT-NN, overwriting with SPRINT-MM — prior sprint may not have been closed` to stderr but does not block.

`init_sprint.mjs` also writes `<sprintDir>/sprint-context.md` from `.cleargate/templates/sprint_context.md`, populated with `sprint_id` + goal (extracted from sprint plan §0 `- **Sprint Goal:** …` bullet, or placeholder if absent) + active CR list. Every Dev/QA/Architect/DevOps dispatch reads this file as preflight (see §B + §C contracts + agent prompts `## Preflight`).

**Dashboard (CR-101) — nothing for you to do.** `sprint init` also starts the background sprint dashboard, which opens itself in the human's browser once it is listening and then tracks the sprint live: the page re-polls every ~2s, and the SubagentStop token-ledger hook re-renders the durable `dashboard.html` after every agent completes. Do **not** run `cleargate sprint dashboard --serve` from an orchestrator dispatch — it blocks the process until Ctrl-C. If a human asks to see progress, point them at the URL `sprint init` printed, or run `cleargate sprint dashboard --open` (non-blocking, exits 0). `cleargate sprint close` tears the daemon down; `--stop` is the manual off switch. Suppress it entirely with `CLEARGATE_NO_DASHBOARD=1` in headless/CI runs.

### A.4 Architect Sprint Design Review

Mandatory before any story executes. **The SDR is what produces `waves.json`** — the wave plan §C.0 executes. Without it there is no wave composition and no parallelism.

Which path you take depends on story count. **You (the Orchestrator) own the dispatch in both cases** — the Architect has no `Task` tool and cannot fan out to sub-agents on its own.

**N ≤ 2 stories — single dispatch (tiny-sprint floor).** Spawn the Architect with all candidate stories' §3 Implementation Guides + ADRs + flashcards + sprint plan path:

```
Task instruction: "SPRINT DESIGN REVIEW — write Sprint Plan §2 Execution Strategy.
You have WRITE ACCESS to Sprint Plan §2 ONLY. Produce §§2.1–2.4 (Phase Plan,
Merge Ordering, Shared-Surface Warnings, ADR-Conflict Flags) plus §2.4 Lane Audit."
```

With ≤ 2 stories a wave plan is degenerate; run them in the order §2.2 Merge Ordering gives.

**N > 2 stories — reader/synth fan-out (EPIC-033 / STORY-033-03).** Two dispatch rounds:

1. **Fan out `architect-reader`, one instance per story, in a single parallel batch.** Each reads exactly one story file and returns a structured digest (its `file_surface` comes from `.cleargate/scripts/collision_surface.sh <story-file>`). Readers do not schedule and do not emit `waves.json`.

   ```
   Task instruction (one per story): "SDR READER — read <story-file> and return the
   digest shape pinned in .claude/agents/architect-reader.md. Report file_surface
   faithfully, including an empty list. Do NOT invent paths, schedule, or plan waves."
   ```

2. **Then dispatch `architect-synth` once**, passing all N digests verbatim. It evaluates the real-collision predicate and emits the §2.1–2.5 SDR block, the Wave Assignment table, and the `waves.json` artifact to `<sprintDir>/plans/waves.json`.

   ```
   Task instruction: "SDR SYNTH — consume the N reader digests below, evaluate the
   real-collision predicate, and emit §§2.1–2.5 plus the Wave
   Assignment table and waves.json. Fail-safe-serialize any story with an empty
   (file_surface ∪ file_creates) — empty is unproven, never proven-disjoint (BUG-033)."
   <digests>
   ```

   Do not skip the reader round and hand story files straight to `architect-synth` — it consumes digests, never raw story files.

**Contract-first output (CR-124).** Readers report `exports_provided` and `exports_consumed` in each digest. From them the synth forms contracts and writes a `schema_version: 2` `waves.json`: `contracts[]` (each contract's branch, base, owner story and frozen exports), `stories` (each story's `base` and `upstream`), the derived `waves`, and `lane_assignments`. Only real collisions order the build; `parallel_eligible` and DB writes are integration-order hints. §C.0.2 runs such a plan.

In both paths: insert the returned markdown block into the sprint plan file, then **halt and ask the human to confirm the sprint plan** before any story executes.

> **Verify before leaving A.4 (N > 2).** `test -f <sprintDir>/plans/waves.json` must succeed. If it does not, §C.0 has no wave plan to run and `init_sprint.mjs` silently falls back to parsing the §2.4 Lane Audit table for lanes only — you get lane assignments with no wave composition, i.e. serial execution with none of the parallelism the sprint was planned for. Re-dispatch `architect-synth` rather than proceeding.

### A.5 Flip sprint status

After human confirms, update sprint frontmatter `status: Active` (via `cleargate stamp` after the edit).

> 🎯 **Goal check.** Before the first Architect dispatch, surface the sprint goal verbatim from the plan's `sprint_goal:` frontmatter (or §1 if unstructured) in chat: *"Sprint goal: <verbatim>. Success = this is met by close. Stories are the means; this is the end."* All subsequent halts and decisions reference back to this line.

**Derive + record the Goal Acceptance Check (CR-110), at this same halt.** Ask: what concrete
command, artifact, or observable state is true when the sprint goal above is met? Propose it to the
human alongside the sprint plan confirmation — do not add a second halt. Write the answer into
`sprint-context.md`'s `## Goal Acceptance Check` section, replacing its placeholder, once the human
confirms it in the same breath as confirming the plan. If no mechanical condition can be stated,
record the literal token `not-mechanically-verifiable` plus the qualitative evidence that will
stand in for it (walkthrough outcome, stakeholder confirmation) — an explicit, valid outcome, not a
gate failure. A goal for which no check can be stated at all is usually a goal too vague to execute
against; surface that to the human rather than forcing a synthetic metric.

---

## 4. Phase B — Per-Milestone Architect Plan

Before any Developer dispatches in a milestone, spawn the Architect once for the whole milestone:

```bash
# Fallback only — auto-marker written by PreToolUse:Task hook in most sessions.
bash .cleargate/scripts/write_dispatch.sh M<N> architect
```

Then `Agent(subagent_type=architect, ...)` with the milestone story IDs and instruction to write `.cleargate/sprint-runs/<sprint-id>/plans/M<N>.md`.

**Skip per-milestone Architect for `lane: fast` stories** — they dispatch to Developer without a plan, per the lane contract (see `.claude/agents/architect.md` Lane Classification).

- Cross-cutting rules: Read `.cleargate/sprint-runs/<sprint-id>/sprint-context.md` BEFORE any other action (Sprint Goal + Cross-Cutting Rules + Active CRs sections constrain every decision).

> 🎯 **Goal check.** Pass the sprint goal verbatim in the Architect's dispatch prompt. The plan should explicitly tie each story to the goal under "Per-story blueprint" — e.g. *"STORY-NNN-NN advances goal by <one sentence>"*. Plans that don't reference the goal go back to the Architect with a re-dispatch.

**`GOAL_RELATION` — a separate, per-milestone line, decoupled from the sprint verdict (CR-110,
§Q5-B).** Every milestone plan states one line near its top: `GOAL_RELATION: advances | off
critical path`. This answers "does this milestone relate to the Sprint Goal at all?" — a different
axis from the sprint verdict (`met`/`partial`/`missed`, §0.5/§E.2), and it does not alter that
verdict: a milestone can legitimately be `off critical path` while the sprint's overall goal
verdict stays `met`. Worked example: SPRINT-39's M3 and M4 are both `off critical path` — their
work is real and necessary, it simply is not what the sprint goal was measured by — while the
sprint's goal verdict, decided on M1+M2 evidence, is unaffected. Folding this relation into the
sprint verdict enum would force the Reporter to mark the whole sprint `partial` whenever any one
milestone is unrelated to the goal — the exact linkage this decoupling forbids.

---

## 5. Phase C — Per-Story Execution Loop

Run this loop **per story**, in the wave order the milestone plan / `waves.json` declares. Each iteration: Worktree → **QA-Red** → **TPV (Test Pattern Validation, Architect-only)** → Developer → QA-Verify → (Architect pass for `lane: standard` only) → Merge → Flashcard Gate.

> **Naming note.** State-machine values (`Bouncing`, `Ready to Bounce`), `state.json` counter fields (`qa_bounces`, `arch_bounces`), and script names (`validate_bounce_readiness.mjs`) retain the legacy "bounce" term because they are code-bound. The narrative in this skill uses "execution loop", "story cycle", and "rework" to describe the same mechanics.

### C.0 Execution — run each wave via `/workflows`

Execution has no modes and no alternate path. The Architect's Sprint Design Review always produces `waves.json`; the Orchestrator runs **every** wave through the Workflow tool (`/workflows`) via the `launch_wave` contract (§C.0.1) — worktree-isolated per-story segments, serial-barrier merge. This is the only dispatch path: there is no alternate loop and no topology toggle. If `/workflows` is unavailable, halt and surface the reason — never run stories outside a wave segment. A `schema_version: 2` plan — contracts plus per-story `base` and `upstream` — builds and integrates by the contract-first protocol in §C.0.2.

A single-story wave is one segment (inherently sequential). The per-story steps §C.1–§C.9 below describe **what a wave segment does** — they are the body of a segment, not a separate loop.

**Serial-dispatch hosts.** On a host installed with `dispatchMode: serial`, `dispatch-serial.md` replaces the §C.0.1 wave launch: one story at a time, the same worktree command, the same verdict envelope, the flashcard gate between every pair of stories, and a synchronous halt. On Claude Code, §C.0.1 is the only launch path.

#### C.0.1 Wave launch — the `launch_wave` contract

The Orchestrator runs each wave from the Architect's `waves.json` (produced by the planning workflow, STORY-033-03) as one `parallel()` Workflow of worktree-isolated per-story **segments**, then consolidates at a serial **barrier**:

1. **Pre-launch (worktrees).** Pre-create each wave story's worktree **serially** via `git worktree add .worktrees/STORY-X -b story/STORY-X sprint/S-NN` (ClearGate-managed worktrees — NOT the Workflow tool's `isolation:'worktree'`, which checks out tracked-files-only off the wrong base; spike decision 2). Serial pre-creation avoids concurrent `git worktree add` racing the repo index. The flashcard **WRITE-gate** suppression (`SKIP_FLASHCARD_GATE=1`, inherited by every segment because per-thunk child env is not settable — spike Q5; reading is unaffected) is **owned by `launch_wave.mjs`, not the Orchestrator** (BUG-034): `launchWave()` snapshots the prior value, sets `=1` before `parallel()`, and restores the exact prior value in a `try/finally`. The Orchestrator MUST NOT set or restore this var by hand — doing so would double-manage it and reintroduce the leak.

2. **Launch.** Invoke `launch_wave.mjs`, which drives `parallel()` over one segment per story. Each segment mints a stable, distinct `RUN_ID` (`mintRunId(storyId, sprintId)`), runs the linear pipeline (QA-Red → TPV → Developer → QA-Verify → Architect post-flight) inside its OWN `.worktrees/STORY-X`, accumulates `tokens` from the outset, and **RETURNS a schema-typed verdict** — it never blocks. A §22 true-blocker becomes a `BLOCKED` verdict carrying `blocker.type` (one of the five §22 kinds), **never an `AskUserQuestion`** (workflows cannot halt for a human mid-run).

3. **Barrier — validate.** Run `validateVerdicts(verdicts)` (exported from `launch_wave.mjs`). It accepts a well-formed array and raises a validation Error **naming the offending `storyId`** on a malformed verdict (missing required field, unknown discriminant, or non-GREEN without `blocker`). The named segment is marked ESCALATED and gets **no ledger row**; sibling GREEN verdicts consolidate normally.

4. **Barrier — flashcards (between-wave gate, §C.9).** Process every segment's `flashcards_flagged[]` and write the `.processed-<hash>` markers **before launching the next wave** — see §C.9.

5. **Barrier — serial merge (§C.7).** For each GREEN story in turn, DevOps merges `story/STORY-X` to `sprint/S-NN` — **one worktree at a time, never two concurrently** — see §C.7.

6. **Barrier — advance.** The `SKIP_FLASHCARD_GATE` value was ALREADY restored by `launch_wave.mjs`'s `finally` the moment `launchWave()` returned or threw (BUG-034 — no longer a prose obligation; a mid-barrier throw can no longer leak gate suppression). If every verdict is GREEN, advance to the next wave. If any verdict is `ESCALATED`/`BLOCKED`, **halt the wave loop for the human** (fully autonomous up to this point per §6 Q3 / protocol §22); on the human's "re-approach", `resumeFromRunId` re-enters the **same run** and re-dispatches only the ESCALATED/BLOCKED story's segment — GREEN segments **short-circuit on resume with zero new ledger rows** (spike Q4: 0 tokens on replay), so re-merging GREEN stories is a no-op.

**Idempotent segments.** Segments are **idempotent** as a belt-and-suspenders safety net: a `resumeFromRunId` re-run of a GREEN segment, or a re-launch after a partial failure, must produce no duplicate side effects (no double-commit, no double-merge, no duplicate ledger row). The RUN_ID-keyed ledger no-op (STORY-033-02) and the serial barrier merge together enforce this; segment idempotency is the redundant guard if either upstream protection regresses.

#### C.0.2 Contract-first build and integration (CR-124)

A `schema_version: 2` `waves.json` is a contract-first build-then-integrate DAG: upstream dependencies block integration, not building.

1. **Plan fields.** `contracts[]` lists each contract (`id`, `branch` = `contract/S-<NN>-<slug>`, `base`, `owner_story`, `frozen_exports`). `stories` gives each story's `base` (the sprint branch or a contract branch) and `upstream` (the stories that must merge before it integrates). `waves` is the derived layered view of the integration order; `lane_assignments` is unchanged.
2. **Contract step.** Before any consumer builds, create each `contracts[]` branch from its `base` (a contract can stack on another contract's branch). Its content is a type-exact skeleton — the frozen exports with their exact types, and bodies that throw or return a stub — written by a Developer dispatch, or it is the owner story's own Developer commit. The exports are frozen: the owner replaces the bodies later but never renames or retypes a frozen export. If a later owner commit changes a frozen export, record the new SHA in the sprint plan's §4 Execution Log; every consumer picks it up at integration.
3. **Parallel build.** Every story whose base exists builds at once, in its own worktree cut from its `base` — `storyBases(plan)` maps each story to its base and `launchWave({…, bases})` cuts each worktree from it — through QA-Red → TPV → Developer, within the plan's build lanes. A built story that waits on its upstream holds no lane.
4. **Integration by DAG.** A story integrates only when `integrationReady(plan, storyId, mergedIds)` is true: every story in its `upstream` has merged. In the story's worktree, merge `sprint/S-NN` into `story/<ID>`. On a conflict the owner's file wins and the story re-applies its own insertions. Regenerate generated artifacts, re-run the story's full verification, then run QA-Verify and the Architect post-flight on the integrated tree.
5. **Serial merges.** DevOps merges the integrated stories in turn, one merge at a time (§C.7). If `sprint/S-NN` moved after a story integrated, re-sync the story (integrate it again) before its merge.
6. **Red-test re-scope.** A red test that another story's legitimate additions over-constrain, or whose casts become redundant once a real type lands, is re-scoped by QA-Red, never by the Developer.

Until EPIC-055's scheduler lands, the Orchestrator runs this protocol by hand.

### C.1 Pre-execution check

```bash
node .cleargate/scripts/validate_state.mjs
node .cleargate/scripts/validate_bounce_readiness.mjs STORY-NNN-NN
```

`state.json` `sprintId` must equal the active sprint. If not, re-run `init_sprint.mjs` — **do not create a worktree with a stale state.json**.

`validate_bounce_readiness.mjs` checks: story is "Ready to Bounce", §§1/2/3 present, working tree clean. Fail → halt.

### C.2 Create worktree

```bash
git worktree add .worktrees/STORY-NNN-NN -b story/STORY-NNN-NN sprint/S-NN
```

Story branch is cut from the **sprint branch**, never from main. Verify:

```bash
git worktree list
```

**Do not run `git worktree add` inside `mcp/`.** It is a nested git repo. If the story touches `mcp/`, the Developer might expect to edit it at `.worktrees/STORY-NNN-NN/mcp/...` — but that path does NOT exist in a worktree: `mcp/` has zero tracked files in the outer repo, so edit it in the main checkout instead. (`cleargate-enforcement.md` §1.3.)

After creating the worktree, provision configured gitignored config into it:

```bash
bash .cleargate/scripts/provision_worktree_config.sh .worktrees/STORY-NNN-NN
```

This symlinks (or copies, per `config.yml worktree.provision_mode`) the roots in
`config.yml worktree.provision_config` (default `[.env]`) so the target's build/tests
load their config in-worktree without a manual step. The provisioned roots are exempt
from the `stray_env_files` pre-gate scan — the same configured list serves as both the
provisioning spec and the scan-exemption list (single source of truth, CR-079).

### C.3 Spawn QA-Red (standard lane only — fast lane skips this step)

```bash
# Fallback only — auto-marker written by PreToolUse:Task hook in most sessions.
bash .cleargate/scripts/write_dispatch.sh STORY-NNN-NN qa
```

**Script invocation rule (CR-046):** Any bash/node script invoked within the QA-Red dispatch MUST go through the wrapper: `bash .cleargate/scripts/run_script.sh <cmd> [args...]`. Direct invocation without the wrapper is forbidden.

Then spawn with `subagent_type=qa`. Dispatch prompt MUST inject:

- Cross-cutting rules: Read `.cleargate/sprint-runs/<sprint-id>/sprint-context.md` BEFORE any other action.
- Test-layer naming (CR-111): integration-layer tests are `*.integration.node.test.ts`; QA-Red's failing-first variant for that layer is `*.red.integration.node.test.ts` (see the File-naming clause below), not the general `*.red.node.test.ts` form. A legacy hyphenated form (`<name>-integration.node.test.ts`, e.g. `cr-026-integration.node.test.ts`) predates this convention.

> `Mode: RED — write failing tests against the acceptance Gherkin — Story §2.1, CR §4, Bug §5 — or, for an item written before CR-123, its numbered verification steps, no implementation Read access. Tests must fail with "not yet implemented" errors against the clean baseline. File-naming: *.red.node.test.ts (immutable post-Red) for non-integration reds; integration-layer reds use *.red.integration.node.test.ts instead. Forbidden: editing implementation files.`

QA-Red returns:

```
QA-RED: WRITTEN | BLOCKED
RED_TESTS: <list of *.red.node.test.ts files written>
BASELINE_FAIL: <count of failing scenarios>
flashcards_flagged: [ ... ]
```

On `QA-RED: BLOCKED`: surface Spec-Gap to human; do not proceed to §C.4 until resolved.

On `QA-RED: WRITTEN`: orchestrator commits the Red tests on the story branch with subject `qa-red(STORY-NNN-NN): write failing tests`, then proceeds to §C.3.5 TPV Gate.

**Fast lane skip:** if `state.json.stories[<id>].lane === "fast"`, skip this entire step AND §C.3.5 and proceed directly to §C.4 Spawn Developer.

### C.3.5 TPV Gate (Architect-only — standard lane)

**Skip if:** `state.json.stories[<id>].lane === 'fast'`.

After QA-Red commits Red tests, run the wiring/pre-gate scan first:

```bash
bash .cleargate/scripts/pre_gate_runner.sh arch .worktrees/STORY-NNN-NN/ sprint/S-NN
```

**Semantic fixture lint (CR-081 — included in the pre-gate scan above):** `pre_gate_runner.sh arch` automatically invokes `qa_red_lint.mjs` (check #5 inside `run_arch()`) against the worktree's QA-Red test files (`*.red.node.test.ts` and other red-test forms). This is a pre-gate step — it runs as part of the scan, before any TPV or Developer dispatch. If `qa_red_lint` flags a semantic fixture error (R-enum: invalid enum literal; R-query: duplicate-text `queryByText`/`getByText`), the scan exits non-zero and routes back to QA-Red via `arch_bounces` (identical to a TPV wiring gap — increment `arch_bounces` via `node .cleargate/scripts/update_state.mjs STORY-NNN-NN --arch-bounce`, then re-dispatch §C.3 QA-Red with the lint flag description). The lint check is gated by `arch.qa_red_lint` in `gate-checks.json` (default `true`).

**Conditional TPV dispatch (scan-flag gated — a clean standard-lane story proceeds to §C.4 with NO Architect TPV dispatch):**

- **If the scan returns exit 0 with no flags:** skip the live Architect `Mode: TPV` dispatch and proceed directly to §C.4 Spawn Developer. No Architect agent is spawned for TPV on the clean path.
- **If the scan returns a flag (exit 1) or scan-could-not-run (exit 2):** spawn the Architect in `Mode: TPV` to perform wiring-only validation before Dev dispatch. TPV does NOT evaluate test logic correctness — it verifies wiring so Dev does not waste a full dispatch on a mis-wired test harness.

> **Safeguard (non-removable):** ANY pre-gate flag — demotion, `arch_bounce` signal, surface drift, new-deps, structural issue, OR exit-2 (scan-could-not-run) — MUST still dispatch the live Architect. Treat exit 2 as a flag (fail toward dispatching, never toward skipping). This optimization removes the Architect ONLY on a proven-clean scan; it never removes the Architect from a flagged path.

```bash
# Fallback only — auto-marker written by PreToolUse:Task hook in most sessions.
bash .cleargate/scripts/write_dispatch.sh STORY-NNN-NN architect
```

Dispatch prompt MUST inject:

> `Mode: TPV — Test Pattern Validation only. You receive: story file, QA-Red commit SHA, list of *.red.node.test.ts files. Verify ONLY: (1) imports resolve to real paths, (2) constructor signatures match, (3) mocked methods exist on the mocked object, (4) after-hooks present when before-hooks write state, (5) file naming *.red.node.test.ts. Do NOT evaluate test logic. Return: TPV: APPROVED (Dev proceeds) or TPV: BLOCKED-WIRING-GAP — <one-sentence specific issue> (orchestrator routes back to QA-Red).`

Architect returns one of:

- `TPV: APPROVED` — proceed to §C.4 Spawn Developer.
- `TPV: BLOCKED-WIRING-GAP — <issue>` — orchestrator increments `arch_bounces` via:
  ```bash
  node .cleargate/scripts/update_state.mjs STORY-NNN-NN --arch-bounce
  ```
  Then routes back to §C.3 QA-Red with the gap description in the re-dispatch prompt. If `arch_bounces ≥ 3` → flip story to `Escalated`, halt.

TPV is a WIRING gate, not a correctness gate. A test that imports the right module but asserts incorrectly still gets `TPV: APPROVED` — Dev's TDD cycle handles assertion correctness.

### C.4 Spawn Developer

```bash
# Fallback only — auto-marker written by PreToolUse:Task hook in most sessions.
bash .cleargate/scripts/write_dispatch.sh STORY-NNN-NN developer
```

**Script invocation rule (CR-046):** Any bash/node script invoked within the Developer dispatch MUST go through the wrapper: `bash .cleargate/scripts/run_script.sh <cmd> [args...]`. Direct invocation without the wrapper is forbidden.

Then spawn with `subagent_type=developer`. Inputs the prompt must include verbatim:

- Cross-cutting rules: Read `.cleargate/sprint-runs/<sprint-id>/sprint-context.md` BEFORE any other action.

- `STORY=NNN-NN` (Developer must echo this on its first response line).
- Path to story file.
- Path to milestone plan.
- Worktree path (assigned).
- Sprint ID.

Developer returns:

```
STORY: STORY-NNN-NN
STATUS: done | blocked
COMMIT: <sha> | none
TYPECHECK: pass | fail
TESTS: X passed, Y failed
FILES_CHANGED: <list>
flashcards_flagged: [ ... ]
```

If `STATUS=blocked`: route per §C.8 (Blockers Triage).

### C.5 Spawn QA-Verify

```bash
# Fallback only — auto-marker written by PreToolUse:Task hook in most sessions.
bash .cleargate/scripts/write_dispatch.sh STORY-NNN-NN qa
```

**Script invocation rule (CR-046):** Any bash/node script invoked within the QA-Verify dispatch MUST go through the wrapper: `bash .cleargate/scripts/run_script.sh <cmd> [args...]`. Direct invocation without the wrapper is forbidden.

Dispatch prompt MUST inject: `Mode: VERIFY — read-only acceptance trace. Verify Developer's implementation against the acceptance Gherkin — Story §2.1, CR §4, Bug §5 — or, for an item written before CR-123, its numbered verification steps. Do not write or modify any files.`

- Cross-cutting rules: Read `.cleargate/sprint-runs/<sprint-id>/sprint-context.md` BEFORE any other action.

QA inputs: story file path, worktree path, Developer commit SHA. QA returns:

```
QA: PASS | FAIL
ACCEPTANCE_COVERAGE: N of M scenarios
MISSING: <list>
REGRESSIONS: <list>
flashcards_flagged: [ ... ]
```

**On `QA: FAIL`:** increment `qa_bounces` via `update_state.mjs STORY-NNN-NN --qa-bounce`. If counter ≥ 3 → flip story to `Escalated`, surface to human, halt. Else → re-spawn Developer with QA's bug report as input. Return to §C.4.

**On `QA: PASS`:** update state to `QA Passed`, proceed.

### C.6 Architect Pass (`lane: standard` only)

`lane: fast` skips this step entirely.

- Cross-cutting rules: Read `.cleargate/sprint-runs/<sprint-id>/sprint-context.md` BEFORE any other action.

**Script invocation rule (CR-046):** Any bash/node script invoked within the Architect Pass dispatch MUST go through the wrapper: `bash .cleargate/scripts/run_script.sh <cmd> [args...]`. Direct invocation without the wrapper is forbidden.

```bash
bash .cleargate/scripts/pre_gate_runner.sh arch .worktrees/STORY-NNN-NN/ sprint/S-NN
```

If pre-gate scan reveals new dependencies / structural issues → return to Developer (do NOT spawn Architect for mechanical failures). 3+ pre-gate failures → escalate.

**Conditional post-flight dispatch (scan-flag gated — a clean standard-lane story dispatches ≤4 agents, not 6; ≤5 when one re-entry fires; 6 when both flag):**

- **If the scan returns exit 0 with no flags (clean scan):** skip the live Architect post-flight dispatch and proceed directly to §C.7 Story Merge. No Architect agent is spawned on the clean path. This drops a fully-clean standard-lane story from 6 dispatches to 4 (QA-Red → Developer → QA-Verify → DevOps — both §C.3.5 TPV and §C.6 post-flight skipped on a fully-clean scan).
- **If the scan returns a flag (exit 1) or scan-could-not-run (exit 2):** spawn the live Architect for post-flight review. On `FAIL`: increment `arch_bounces`. ≥ 3 → escalate.

> **Safeguard (non-removable):** ANY pre-gate flag — demotion, `arch_bounce` signal, surface drift, new-deps, structural issue, OR exit-2 (scan-could-not-run) — MUST still dispatch the live Architect. Treat exit 2 as a flag (fail toward dispatching, never toward skipping). This optimization removes the Architect ONLY on a proven-clean scan; it never removes the Architect from a flagged path.

### C.7 Story Merge

**DevOps-owned.** The orchestrator does NOT run `git merge`, `git worktree remove`, `git branch -d`, `update_state.mjs`, or `npm run prebuild` directly. All mechanical merge work is delegated to the DevOps agent.

**Serial barrier merge.** When a wave's verdicts consolidate at the barrier, the merge is **serial**: DevOps merges each GREEN `story/STORY-X` to `sprint/S-NN` **one worktree at a time** — **no two worktrees merge concurrently**. Even though the wave's segments ran in parallel and committed to FS-isolated `.worktrees/STORY-X` (each with its own `.git` index, so the per-worktree pre-commit surface gate never races), the shared `sprint/S-NN` branch is a single-writer axis. The Orchestrator therefore loops over the GREEN stories in order and dispatches DevOps for **one merge at a time**, awaiting `STATUS=done` before the next. A mixed GREEN+ESCALATED wave merges the GREEN stories immediately at the barrier (serial), then resumes only the ESCALATED segment via `resumeFromRunId` — the already-merged GREEN segments short-circuit on resume (zero new ledger rows).

**Required reports — verify before dispatch:**

| Report | Required when |
|---|---|
| `STORY-NNN-NN-dev.md` | Always (all lanes) |
| `STORY-NNN-NN-qa.md` | Always, unless lane=fast explicitly skipped QA-Verify |
| `STORY-NNN-NN-arch.md` | standard-lane only, AND only when the §C.6 pre-gate scan flagged (Architect post-flight was dispatched); absent on a clean-scan story |
| `STORY-NNN-NN-devops.md` | Written BY DevOps during this step (not a prerequisite) |

Missing `dev.md` or `qa.md` (when required) → return to spawn that agent. **Do not dispatch DevOps with missing reports.**

**Orchestrator dispatch sequence:**

1. Mark the dispatch:
   ```bash
   # Fallback only — auto-marker written by PreToolUse:Task hook in most sessions.
   bash .cleargate/scripts/write_dispatch.sh STORY-NNN-NN devops
   ```

2. Spawn the DevOps agent with the following context (§3.1 Context Pack):
   ```
   SPRINT-{NN} — DevOps dispatch for {STORY-ID}.

   INPUTS:
   - Story ID: {STORY-ID}
   - Sprint ID: SPRINT-{NN}
   - Worktree path: .worktrees/{STORY-ID}/
   - Story branch: story/{STORY-ID}
   - Sprint branch: sprint/S-{NN}
   - Dev commit SHA: {abc1234}
   - QA commit SHA (if present): {def5678}
   - Architect commit SHA (if present): {ghi9012}
   - Files-changed manifest: {list from git show --stat <dev-sha>}
   - Canonical scaffold touched? {yes|no}
   - Lane: {standard | fast}
   - Required reports present:
       - {STORY-ID}-dev.md    ✓
       - {STORY-ID}-qa.md     ✓ (or "skipped — fast lane")
       - {STORY-ID}-arch.md   ✓ (standard lane only, AND only when pre-gate scan flagged — absent if Architect was not dispatched)

   ACTIONS (in order):
   1. Verify all required reports exist; halt if any missing. Exception: arch.md is required ONLY when the §C.6 pre-gate scan flagged (Architect was dispatched); a clean-scan story legitimately has no arch.md and must NOT halt.
   2. Checkout sprint branch.
   3. git merge story/{STORY-ID} --no-ff -m "merge(story/{STORY-ID}): {commit subject}"
   4. If canonical scaffold touched: cd cleargate-cli && npm run prebuild
   5. Mirror parity audit: for each file in files-changed where canonical mirror exists,
      diff live ↔ canonical. Report drift in §Mirror Parity (DO NOT auto-fix).
   6. Post-merge test verification: run only test files touched by this commit.
   7. git worktree remove .worktrees/{STORY-ID}
   8. git branch -d story/{STORY-ID}
   9. CLEARGATE_STATE_FILE=... node .cleargate/scripts/update_state.mjs {STORY-ID} Done
   ```

3. **Halt** and wait for DevOps to return `STATUS=done` or `STATUS=blocked`.

**On `STATUS=done`:** DevOps has written `.cleargate/sprint-runs/SPRINT-{NN}/reports/{STORY-ID}-devops.md`. If it notes live re-sync needed (mirror parity drift), address via `cleargate init` or hand-port at Gate-4 doc-refresh (see §C.9 Flashcard Gate for the next step, then proceed to the next story / wave).

**On `STATUS=blocked`:** DevOps has written `{STORY-ID}-devops-blockers.md`. Surface the blockers report to the human. DevOps does NOT auto-resolve conflicts — orchestrator escalates and waits for human resolution before re-dispatching DevOps.

**Forbidden orchestrator patterns:** `git merge`, `git worktree remove`, `git branch -d`, `update_state.mjs`, `npm run prebuild` in the orchestrator's main session bash log. If any appear, classify as edge case and document in sprint §4 Execution Log.

#### DevOps Escape Hatch — subagent_type=devops unavailable

If spawning `Agent(subagent_type=devops)` returns "Agent type 'devops' not found" (registry miss — see §1 registration constraint note), the orchestrator executes the §C.7 ACTIONS steps 2-9 verbatim inline (in the orchestrator's own bash session). All rules still apply: no `git merge` short-circuit, no conflict auto-resolution. Write the same `STORY-NNN-NN-devops.md` report with an additional frontmatter field `operator: orchestrator-fallback` and note the session restart requirement. This path is exceptional — if it triggers, queue a session restart at the next natural break and verify `devops` appears in the next session's available agent list before continuing the sprint.

### C.8 Blockers Triage (Developer circuit breaker)

When Developer returns `BLOCKED: circuit breaker triggered`, read `.cleargate/sprint-runs/<id>/reports/STORY-NNN-NN-dev-blockers.md`. The report has three sections:

| Non-N/A section | Routing |
|---|---|
| `## Test-Pattern` | Re-launch Developer with the pattern hint as additional context. Pass the sentence verbatim in the new prompt. |
| `## Spec-Gap` | **Halt and surface the sentence to the human.** Do NOT re-launch Developer until human clarifies. |
| `## Environment` | Re-run `pre_gate_runner.sh`. If pre-gate passes, re-launch Developer; otherwise surface env issue. |

3 consecutive circuit-breaker hits on the same story → `update_state.mjs STORY-NNN-NN Escalated`, halt.

### C.9 Flashcard Gate

After every story merge — **before creating story N+1's worktree** — process the merged `flashcards_flagged` list (union of dev + QA, dedupe by exact-string):

For each card:

| Action | Effect |
|---|---|
| **Approve** | Append the line verbatim to `.cleargate/FLASHCARD.md` (newest-first). |
| **Reject** | Discard. Log `FLASHCARD-REJECT YYYY-MM-DD — "<card>" — reason: <one sentence>` in sprint §4 Execution Log. |

Then mark each card processed:

```bash
HASH=$(printf '%s' "<card text>" | shasum -a 1 | cut -c1-12)
touch .cleargate/sprint-runs/<sprint-id>/.processed-${HASH}
```

The `pending-task-sentinel.sh` PreToolUse hook blocks the next `Task` spawn until every card has a `.processed-<hash>` marker. Bypass only with `SKIP_FLASHCARD_GATE=1` — log the bypass in sprint §4.

**Between-wave relocation.** The flashcard gate runs **between waves**, not between stories. The PreToolUse write-gate cannot fire mid-wave (it would block a segment's own `Task` spawns inside the running `parallel()` Workflow and deadlock the wave), so `launch_wave.mjs` sets `SKIP_FLASHCARD_GATE=1` (relocating only the WRITE-gate; flashcard reading inside segments is unaffected) for the duration of the `parallel()` dispatch and restores it in a `try/finally` (BUG-034 — code-enforced, not a prose obligation). Each segment returns its cards in its verdict's `flashcards_flagged[]` instead of blocking. At the barrier, BEFORE launching the next wave, the Orchestrator collects the union of every segment's `flashcards_flagged[]` (dedupe by exact-string), approves/rejects each card exactly as in the per-story table above, and writes the `.processed-<hash>` markers — `HASH=$(printf '%s' "<card text>" | shasum -a 1 | cut -c1-12); touch .cleargate/sprint-runs/<sprint-id>/.processed-${HASH}`. Because `launchWave()`'s `finally` has already restored the gate to its exact prior value by the time it returns, the write-gate is active again before any non-wave dispatch — even if validation or merge throws. The markers are written **between waves**, not between stories.

### C.10 Mid-Sprint Triage

When the user injects new input mid-sprint (between story kickoff and merge), classify it before routing. Apply the keyword-heuristic rubric from `.cleargate/knowledge/mid-sprint-triage-rubric.md` as a first-pass advisory, then confirm with the user. The four classes are: `bug`, `clarification`, `scope`, `approach` — match the user's language against the keyword banks in the rubric doc.

| Class | Trigger | Counter | Human Approval | First-pass action |
|---|---|---|---|---|
| `bug` | Defect vs spec | `qa_bounces++` | No | Re-open story; Dev fix; QA re-verify |
| `clarification` | Ambiguity question | None | No (yes if spec gap) | Update §1.2 in place; re-run impacted test |
| `scope` | Net-new requirement | None | YES for mid-sprint add | Quarantine to next sprint (default); escalate if goal-critical |
| `approach` | Different impl, same spec | None | No (yes if cross-story impact) | Reset Dev context; re-spawn with updated approach |

**Confidence signal:** When no keyword in the rubric matches the user's input, treat the classification as low-confidence. LOW confidence classifications MUST be confirmed with the human before routing.

**Scope-only note:** This rubric covers USER input only. QA-FAIL bounces continue to use `qa_bounces` (existing §C.5 path). TPV-gap bounces use `arch_bounces` (§C.3.5 path).

For the operational routing table with per-type routing rules, see §C.11 (Mid-cycle User Input — CR Triage).

### C.11 Mid-cycle User Input — CR Triage

If the user injects new input mid-story, classify before routing:

| Type | Effect | Routing |
|---|---|---|
| `CR:bug` | Defect in current story | Increments `qa_bounces`; re-open story; Dev fixes; QA re-verifies |
| `CR:spec-clarification` | Removes ambiguity, no new scope | No counter; update §1.2 in place; re-run impacted test |
| `CR:scope-change` | Net-new requirement | **Quarantine.** New Story file in `pending-sync/`; current story unchanged |
| `CR:approach-change` | Different impl, same spec | No counter; reset Dev context; re-spawn with updated approach |

Log every CR in sprint §4 Execution Log with date + ID.

> 🎯 **Goal check on `CR:scope-change`.** Default routing is quarantine-into-next-sprint. **Override the default if the new requirement is critical to the active sprint goal** — escalate to the human with: *"This scope-change is goal-critical: the sprint goal is `<verbatim>` and without this change, the goal will not be met. Add to current sprint? (Adding mid-sprint requires explicit ack per §C.11.)"* Quarantine remains default for goal-incidental scope.

### C.11 Script Invocation Contract (CR-046)

All bash/node script invocations dispatched FROM agents (Developer / QA / Architect / DevOps) MUST use the wrapper:

```bash
bash .cleargate/scripts/run_script.sh <command> [args...]
```

**What the wrapper does (on failure):**
- Captures stdout + stderr independently (≤4KB each; truncated with `... [truncated]` if exceeded).
- Writes a structured JSON incident to `.cleargate/sprint-runs/<sprint-id>/.script-incidents/<ts>-<hash>.json`.
- Propagates the original exit code to the caller.

**Self-exemption clause:** The wrapper itself (`run_script.sh`) is exempt from wrapping — it sets `RUN_SCRIPT_ACTIVE=1` before executing the wrapped command so recursive calls pass through directly. Orchestrator-direct invocations of `run_script.sh` are the canonical entry point; they are exempt by this contract.

**Agent reporting obligation:** If a wrapped script fails (incident JSON written), the dispatching agent MUST include the incident JSON path in its report's `## Script Incidents` section.

**Pre-sprint invocations (before `.active` sentinel exists):** Wrapper writes to `.cleargate/sprint-runs/_off-sprint/.script-incidents/` when no active sprint is detected. This is expected during preflight steps.

---

## 6. Phase D — Sprint Walkthrough

Mandatory. After all stories merged into `sprint/S-NN` (every story state ∈ `TERMINAL_STATES`) and **before** sprint→main merge, invite the user to test on the sprint branch. Classify every piece of feedback:

| Event | Definition | Bug-Fix Tax |
|---|---|---|
| `UR:bug` | Defect, crash, behavior broken vs spec | Increments |
| `UR:review-feedback` | Polish, copy, UX preference | Does not increment |

**When in doubt, ask:** "Is this broken vs spec, or a preference?" Do not default to `UR:bug`.

Log every event in sprint §4. **Sprint branch MUST NOT merge to main while any `UR:bug` is unresolved.** `UR:review-feedback` may defer with explicit human sign-off.

> 🎯 **Goal check.** Open the walkthrough invitation with the sprint goal verbatim, not a feature checklist: *"Sprint goal: `<verbatim>`. The branch is ready on `sprint/S-NN`. Test it and tell me — does the running build achieve the goal?"* This forces the framing to be outcome-vs-spec rather than feature-tour.

**Pull request (`vcs.sprint_pr: true` in `.cleargate/config.yml`, CR-107).** At the start of Phase D, push `sprint/S-NN` and open a pull request against `main` via `gh pr create`. The open PR is the physical form of the `cleargate-enforcement.md` §2 walkthrough gate — the human reads the diff and tests the branch, instead of only testing it, and the gate stops being a promise and becomes an object with a URL. The PR body is generated deterministically from artifacts that already exist — the sprint goal, the DoD checklist, and the `SPRINT-<#>_REPORT.md` summary — so it costs no new authored content and requires no network round-trip to build — no lookup of the pull request's live state is involved. Gate-4 close (§E.5) merges the PR. When `vcs.sprint_pr` is `false` (the default), Phase D proceeds exactly as above and no PR is opened.

---

## 6.5 Phase D.5 — Consolidation

**When:** Runs ONCE per sprint, after all stories have merged into `sprint/S-NN` (walkthrough done, all `UR:bug` items resolved) and **before** Gate-4 close (Phase E). Worktrees are already torn down by §C.7 at this point — this is a sprint-branch operation, not a story-branch operation.

**Rationale:** Each story is built by a Developer sealed in its own worktree, blind to the others. Cross-story duplication, divergent patterns, and missed reuse are structurally invisible during execution. Phase D.5 is the only place one reviewer sees the whole sprint diff — it is the dedup/reuse/altitude pass that per-story isolation cannot provide.

### D.5.1 Run /simplify on the full sprint diff

Invoke the `code-simplifier` agent (`/simplify`) against the full sprint diff:

```bash
git diff main...sprint/S-NN
```

The agent applies reuse, deduplication, and altitude fixes and produces ONE consolidation commit on the sprint branch `sprint/S-NN`. This is not a story branch commit — the worktrees are gone.

**Red-test immutability constraint:** The consolidation MUST NOT touch any `*.red.node.test.ts` file (frozen post-Red per §C.3 — same immutability rule as Developer). Before accepting the consolidation commit, the Orchestrator MUST verify the commit's file list contains no `*.red.node.test.ts` path:

```bash
git show --name-only <consolidation-sha> | grep '\.red\.node\.test\.ts'
# Must return empty — any match is a violation; revert immediately.
```

If `*.red.node.test.ts` files appear in the consolidation commit's file list, revert the commit unconditionally and log the violation in sprint §4 Execution Log.

### D.5.2 QA-Verify re-runs the full suite (safety net)

After the consolidation commit lands on `sprint/S-NN`, dispatch QA in Consolidation mode (see `qa.md` § Consolidation-mode dispatch) — a sprint-diff full-suite re-run, read-only, sole question: does the full suite stay green after the /simplify commit?

**Green → keep:** Full suite is green — keep the consolidation commit on `sprint/S-NN` and proceed to Phase E (Gate 4 close).

**Red → revert:** Full suite is red — run `git revert <consolidation-sha>` on `sprint/S-NN`. Log the revert in sprint §4 Execution Log. Close the sprint on the un-simplified still-green diff. The un-simplified diff is the correctness floor — a failed simplification never blocks the sprint.

### D.5.3 Optional advisory sprint-diff code review

After D.5.1–D.5.2 (whether or not consolidation succeeded), the Orchestrator MAY run an advisory `/code-review` on `git diff main...sprint/S-NN`. This is advisory only — it is NOT a gate. Findings go into sprint §4 Execution Log; they do not block Phase E.

---

## 7. Phase E — Gate 4 Close (Reporter + Human Sign-off)

This is a **Gate-3-class action**. Authorising sprint execution does NOT authorise close. Close requires its own dedicated human approval.

### E.1 Step A — orchestrator runs close

```bash
node .cleargate/scripts/close_sprint.mjs <sprint-id>
```

No flags. Script validates Steps 1–2.6 (lifecycle reconciler runs at Step 2.6; see `cleargate-enforcement.md` §10), prefills `SPRINT-<#>_REPORT.md` stub if missing via the Reporter agent, and exits 0 with the prompt:

> Review the report, then confirm close by re-running with --assume-ack.

### E.2 Reporter dispatch (Step 3.5)

If the report stub does not exist, dispatch the Reporter:

```bash
# Fallback only — auto-marker written by PreToolUse:Task hook in most sessions.
bash .cleargate/scripts/write_dispatch.sh SPRINT-NN reporter
```

- Cross-cutting rules: Read `.cleargate/sprint-runs/<sprint-id>/sprint-context.md` BEFORE any other action.

> **Fresh session.** The Reporter MUST dispatch in a fresh session — do not inherit dev+qa cumulative context. `write_dispatch.sh` already spawns a clean shell child; the `Agent` tool path requires no session-continuation flag. If the runtime offers a session-reset knob (e.g. `--resume false` or equivalent), use it. The Reporter starts cold and reads only `.reporter-context.md` + `sprint_report.md`.

> **Token budget.** Soft warn at 200k tokens, hard advisory at 500k (per CR-036). The token-ledger SubagentStop hook emits the warning to stdout; orchestrator surfaces the line into chat. Hard advisory auto-records a flashcard. The dispatch is NOT killed — the warning is informational; review the bundle slices on next sprint.

Reporter writes `.cleargate/sprint-runs/<id>/SPRINT-<#>_REPORT.md` and returns the Brief:

> **Goal:** `<verbatim sprint goal>` — **Verdict: met | partial | missed.**
> Delivered N stories, M epics. Observe: X bugs, Y review-feedback. Carry-over: Z. Token cost: T.
> See SPRINT-\<#>_REPORT.md for full report.
> Ready to authorize close (Gate 4)?

> 🎯 **Goal check.** The verdict line is mandatory and is the first line of the Brief. `met` = goal achieved as written. `partial` = some sprint-goal acceptance criteria met, others not — explain which in REPORT §1. `missed` = goal not achieved despite stories merging. A `partial` or `missed` verdict does NOT block close, but it is a first-class signal to the human that close-ack should be deliberate, not reflexive.

**The verdict reads the check, it does not judge (CR-110).** The Reporter derives the verdict
above from `sprint-context.md`'s `## Goal Acceptance Check` — the condition recorded and human-
confirmed at §A.5 — not from its own read of how the sprint went. Per OD-4 this verdict is spoken
in the Brief only; it is never written into `SPRINT-<#>_REPORT.md`. See `.claude/agents/reporter.md`
§Goal Acceptance Check for the full instruction.

### E.3 Step B — surface and HALT

Surface the Brief verbatim to the human. **Halt.** Do not re-run with `--assume-ack`.

The human either:

- Re-runs `close_sprint.mjs <id> --assume-ack` themselves, OR
- Says "approved, close it" — at which point you may pass the flag on their behalf.

`--assume-ack` is reserved for **automated test environments only**. Passing it autonomously is a Gate-4 breach equivalent to an unauthorized push.

### E.4 Doc & metadata refresh on close

During Gate 4 sign-off, read `.cleargate/sprint-runs/<id>/.doc-refresh-checklist.md` (generated by `prep_doc_refresh.mjs`). Apply or punt each `- [ ]` item per `.cleargate/knowledge/sprint-closeout-checklist.md`. Items already `- [x]` mean "no changes detected, skip."

### E.5 Sprint→main merge

After sign-off and after all walkthrough `UR:bug` items resolved, the merge path depends on `vcs.sprint_pr` in `.cleargate/config.yml` (CR-107):

**`vcs.sprint_pr: false` (default — the only path available to any install without a GitHub remote):**

```bash
git checkout main
git merge sprint/S-NN --no-ff -m "Sprint S-NN: <goal>"
```

**`vcs.sprint_pr: true`:** merge the pull request opened at the start of Phase D (§6) instead of running a local merge — `gh pr merge --merge` (merge-commit strategy only; squash and rebase merges destroy the ancestry `close_sprint.mjs` Step 2.8 checks).

```bash
gh pr merge --merge <pr-number-or-url>
```

Then flip sprint frontmatter `status: Completed`, archive the sprint file (`pending-sync/` → `archive/`).

---

## 8. Rework Counter Quick Reference

| Counter | Increment trigger | Escalation |
|---|---|---|
| `qa_bounces` | Each `QA: FAIL` | ≥ 3 → `Escalated`, halt |
| `arch_bounces` | Each `Architect: FAIL` | ≥ 3 → `Escalated`, halt |
| Circuit breaker | 50 tool calls without test pass OR 2 identical failures | 3 hits same story → `Escalated`, halt |
| Pre-gate failures | Each `pre_gate_runner.sh` non-zero | 3 hits same story → human escalation (descope / re-approach) |

> 🎯 **Goal check on escalation.** When a story flips to `Escalated`, frame the human-decision question through the goal lens, not in isolation: *"STORY-NNN-NN escalated after N rework cycles. Sprint goal is `<verbatim>`. Options: (a) drop the story — is the goal still met without it? (b) re-approach with X — same goal met by sprint end? (c) split into smaller stories — which scope serves the goal? (d) defer to next sprint — does the goal change?"* Never present escalation as a generic "what do you want to do?" — always tie options to goal achievement.

State updates go through:

```bash
node .cleargate/scripts/update_state.mjs STORY-NNN-NN [--qa-bounce | --arch-bounce | <new-state>]
```

`Escalated` halts the loop until human decides: descope, re-assign approach, or split story.

---

## 9. File-Surface Contract

Each story's §3.1 "Context & Files" table is the **authoritative file surface** for its commit. The pre-commit hook (`.git/hooks/pre-commit` → `.claude/hooks/pre-commit-surface-gate.sh`) blocks commits that touch off-surface files.

Off-surface edits require **either**:

1. A `CR:scope-change` approved before the commit, OR
2. An updated §3.1 table committed in the same story (self-amending — must be justified in commit message).

Bypass with `SKIP_SURFACE_GATE=1` only when absolutely necessary; log in sprint §4.

---

## 10. What This Skill Does NOT Cover

These live elsewhere — do not duplicate inline:

- **Triage / drafting / Gate 1 Brief** → CLAUDE.md + `cleargate-protocol.md` §§1–4.
- **Worktree command details and edge cases** → `cleargate-enforcement.md` §1.
- **Lane classification rubric (7 checks)** → `.claude/agents/architect.md` Lane Classification + `cleargate-enforcement.md` §9.
- **Sprint Plan template / Gate 2 Sprint Ready** → `.cleargate/templates/Sprint Plan Template.md`.
- **Wiki ingest / lint / contradiction detection** → `cleargate-protocol.md` §10.
- **Doctor exit codes** → `cleargate-enforcement.md` §8.
- **Hotfix flow** → V-Bounce-style hotfix handling, see flashcard tag `#hotfix` and `wiki/topics/hotfix-ledger.md`.
- **Spike charter, timebox and gate criteria** → `.cleargate/templates/spike.md`; the pre-sprint doctrine is §2.1 above.

When in doubt, read the source-of-truth doc — this skill cites them, it does not replace them.

---

## 11. Conversational Discipline During Execution

- **Sprint execution is autonomous.** See `.cleargate/knowledge/cleargate-protocol.md` § Sprint Execution Autonomy for the canonical rule and blocker enumeration. In short: once started, run the loop end-to-end; halt only on the five defined true-blocker cases (destructive actions, secrets, user-intent decisions, technical impossibility, spec-internal contradictions).
- **Terse output.** Status updates one sentence each. Details live in story reports and `SPRINT-<#>_REPORT.md`, not in chat.
- **Halt at gates without negotiation.** Gate 3 (preflight), Gate 4 (close sign-off), `Escalated` state — these are not advisory. Surface, halt, wait.
- **Never `--no-verify`, `--assume-ack` autonomously, force-push, or `git reset --hard`.** Every one of these requires explicit per-action human approval.
- **Verify, don't trust agent self-reports.** A Developer claiming `STATUS=done` is not done — QA verifies. A `QA: PASS` is not approved-to-merge until reports exist and merge prerequisites pass.
