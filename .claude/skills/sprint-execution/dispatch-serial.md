# Serial Dispatch Contract

This contract is the dispatch path for a host whose adapter declares `dispatchMode: serial` — a host with no Workflow primitive. It replaces the playbook's wave launch and nothing else: §22 (autonomy and the five true-blocker kinds), the per-story steps §C.1–§C.9, every role boundary, and every rule in `cleargate-enforcement.md` apply unchanged. A host that declares `dispatchMode: wave-parallel` never uses this file.

## 1. When this contract applies

- The installed playbook for this host names this file in §2 and §C.0.
- `dispatchMode` is fixed when ClearGate is installed. It is never chosen per session, and it is never a fallback for a host that has a Workflow primitive but cannot reach it — that host halts (§C.0).

## 2. The serial loop

Run the waves in `.cleargate/sprint-runs/<sprint-id>/plans/waves.json` order and, inside a wave, its stories in `stories` order. Exactly one story is in flight at any time, and inside a story exactly one role dispatch is in flight at any time.

**Contract-first plans.** A `waves.json` with `schema_version: 2` adds contracts and per-story `base` and `upstream`. A serial host ignores `contracts[]` and `base`: it runs the derived `waves` exactly as above, and it never starts a story before every story in its `upstream` has merged, so each story is cut from `sprint/S-NN` with its upstream already merged into it — there is no contract branch to create and no separate integration step.

1. Ask for the next action:
   `node .cleargate/scripts/dispatch_serial.mjs next --sprint <sprint-id> --wave <wave-id>`
   It prints one JSON object. Act on its `action`:
   - `process-flashcards` (exit 4) — process every listed card exactly as §C.9 says (approve or reject, then write its `.processed-<hash>` marker), rewrite every listed `unparseable` report's `flashcards_flagged` block as a `- "card"` list, then ask again.
   - `dispatch` (exit 0) — continue with step 2 for the named `storyId`.
   - `halt` (exit 3) — a recorded verdict for this story is not GREEN. Stop and surface its blocker to the human in this turn.
   - `wave-complete` (exit 0) — go to the next wave.
2. Create the story's worktree with exactly the printed `worktreeCommand` — `git worktree add .worktrees/STORY-X -b story/STORY-X sprint/S-NN` — unless `worktreeExists` is `true`.
3. Run the story through §C.1–§C.7. Each role works only inside `.worktrees/STORY-X`, plus its report under `.cleargate/sprint-runs/<sprint-id>/reports/`. Dispatch one role, wait for its final report, then decide the next dispatch. Never start a second role while one is still running.
4. Write the story's verdict (§5) to a file and record it:
   `node .cleargate/scripts/dispatch_serial.mjs record --sprint <sprint-id> --wave <wave-id> --verdict <file>`
   Exit 0: the verdict is GREEN — go back to step 1. Exit 3: the verdict is not GREEN — halt now, in this turn, and dispatch nothing else. Exit 1: the verdict is malformed — fix the verdict, never the validator.

## 3. Invariants reproduced

| Invariant | How the serial path keeps it |
|---|---|
| One ClearGate-managed worktree per story, cut from the sprint branch | `next` prints the command the wave path builds (`worktreeAddCommand` in `launch_wave.mjs`); worktrees are created one at a time |
| Flashcard write-gate per story (`cleargate-enforcement.md` §4.3) | `next` refuses to name the next story until every flagged card has a `.processed-<hash>` marker and no report's `flashcards_flagged` block is unparseable; the host's dispatch hook enforces the same gate (§4.6) at every role dispatch |
| Exactly-once dispatch attribution | the host's own dispatch hook chain attributes each role dispatch once (a dispatch marker or sentinel, claimed when the subagent stops); never write attribution by hand |
| Single-writer serial merge | DevOps merges each GREEN story to `sprint/S-NN` (§C.7) before the next story starts |
| True-blocker halt (§22) | a non-GREEN verdict halts the loop synchronously in the orchestrator's own turn |
| Idempotent resume | `next --resume` re-dispatches only the blocked story, reuses its worktree, and never re-dispatches a GREEN story |

## 4. Deliberately omitted

These three mechanisms exist only to work around a parallel wave; copying them would weaken the serial path.

| Mechanism (wave path) | Why the wave path has it | Why this contract omits it |
|---|---|---|
| `SKIP_FLASHCARD_GATE=1` for the whole wave | a parallel dispatch cannot give each segment its own environment, so the write-gate is relocated to the barrier | one story runs at a time, so the original per-story gate (§4.3) applies unmodified; setting the variable would silently widen the flashcard blind spot. Never set it during a serial run. |
| `RUN_ID`-keyed barrier ledger rows | under a Workflow run the dispatch hook never fires and the subagent stop event carries the orchestrator's session | serial dispatches go through the host's own dispatch hook chain; where the host exposes no verifiable usage, no usage row is written at all |
| Verdict returned instead of halting | a parallel run cannot stop for a human mid-run | the serial loop halts in its own turn, which is strictly stronger |

## 5. Verdict

Every story ends with one verdict object — the protocol §23.1 envelope, validated with `validateVerdicts(verdicts, { mode: 'serial' })`:

- `verdict` (`GREEN`, `ESCALATED` or `BLOCKED`), `storyId`, `runId` (the `runId` that `next` printed), `counters` (`qa_bounces`, `arch_bounces`, `breaker_hits`) and `flashcards_flagged` (the union of the dev and QA reports' cards).
- `devSha`, `qaSha`: required on GREEN; `null` on a non-GREEN verdict when that commit does not exist. Never invent a SHA.
- `tokens`: the measured object when the host reports verifiable usage, otherwise exactly `{ "metering": "unavailable" }`. Never zeros.
- `blocker` (`type`, `message`): required on a non-GREEN verdict; `type` is one of the five §22 kinds.

## 6. Resume after a blocker

After the human resolves a blocker, run `node .cleargate/scripts/dispatch_serial.mjs next --sprint <sprint-id> --wave <wave-id> --resume`. It names the blocked story again (`worktreeExists: true`). Run it from the step the blocker interrupted, record its new verdict, and continue with step 1. GREEN stories are never re-dispatched.
