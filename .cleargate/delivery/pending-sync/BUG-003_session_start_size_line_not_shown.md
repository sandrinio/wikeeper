---
bug_id: BUG-003
parent_ref: STORY-007-07
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Triaged
severity: P1-High
reporter: orchestrator (SPRINT-04 walkthrough part 4)
approved: true
approved_by: "human (walkthrough classification: UR:bug, fix now)"
approved_at: 2026-10-19T00:00:00Z
context_source: "SPRINT-04 walkthrough part 4 (2026-10-18/19, orchestrator-driven, testbed scratch copies, 0.4.0+30eb5dd): the size line was shown at session start in 1 of 5 fresh sessions, and a fresh session whose statusline showed 🔴 did not tell the user · the human classified both rows UR:bug and chose 'fix now' with this fix (reword pointer-block line 4) · verified on sprint/S-04 at 7061430: templates/agent-block.md:4 (198 of 200 UTF-16 units), src/agents/shipped-blocks.ts (SPRINT-04 entry, append-only), templates/system/WIKI.md:293, test/templates/token-instructions.red.node.test.ts:179, test/templates/writing-and-answering-text.red.node.test.ts:218 and :459, test/templates/upgrade-instructions.red.node.test.ts (R2 pins agent-block.md), test/agents/pointer-block.red.node.test.ts:54, test/agents/shipped-blocks.test.ts:8"
created_at: 2026-10-19T00:00:00Z
updated_at: 2026-10-19T00:00:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T20:57:02Z
  transition: ready-for-fix
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id BUG-003
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-18T20:28:25Z
  sessions: []
---

# BUG-003: The agent runs the size line at session start but does not show it, and misses a 🔴 page

### Open Questions

- **Question (Q1, the wording):** Pointer-block line 4 has two free UTF-16 units and the block is at 14 of 14 lines. What does line 4 say?
- **Recommended:** `Wiki: \`.wiki/\`, content folder \`content_dir\` in \`.wiki/config.yml\`. Once set up, open each session's first reply with the line \`wikeeper statusline\` prints; on 🔴 follow WIKI.md "Lint and status".` (196 UTF-16 units). It keeps the three phrases 007-07's red test requires ("Once set up", "open each session", "`wikeeper statusline`"), says where the line goes (the first reply, so the user sees it), and names the section that says what to do on 🔴, which a question-only session otherwise never reads. It drops "This repo has a knowledge wiki in" (the heading `## Project Wiki` and line 3 already say it) and "not an error" (WIKI.md says what to do when the line is an error).
- **Human decision:** _approved as recommended (human, 2026-10-19, walkthrough classification: "fix now" with the line-4 rewording)_

- **Question (Q2, WIKI.md):** WIKI.md "Lint and status" says "Show it to the user at the start of every session." Change it too?
- **Recommended:** Yes, to "Show it to the user in your first reply of every session.", so both texts say the same. Nothing else in WIKI.md changes.
- **Human decision:** _approved as recommended (human, 2026-10-19; part of the same fix)_

- **Question (Q3, SHIPPED_BLOCKS):** The SPRINT-04 entry of `SHIPPED_BLOCKS` was never released (0.4.0 is not on npm). Replace it or append?
- **Recommended:** Append a new entry and its sha256, as the file's header requires ("Append-only … Never edit, remove or reorder an entry"). The unreleased entry stays; it costs one recognised block that no project has.
- **Human decision:** _approved as recommended (orchestrator, following the file's own rule; no behaviour depends on it)_

- **Question (Q4, the gate):** The reproduction is behavioural (the agent missed the line in 4 of 5 fresh sessions), so the gate's "100% deterministic" criterion is not met literally. Proceed?
- **Recommended:** Yes. The text half is checked deterministically by the red test; the behaviour is checked by a re-walk in 3 fresh sessions, which passes only if the size line is in the first reply of all 3 and the 🔴 notice is in the red one.
- **Human decision:** _proceed as recommended (human, 2026-10-19)_

- **Question (Q5, re-scopes):** The Architect (plans/M6.md) found four sealed tests to re-scope, #21–#24, two more than this bug named (#22 token-instructions.red's WIKI.md phrase, #23 archive-instructions.red's agent-block.md pin). Covered?
- **Recommended:** Yes: the human's "proceed" approved "Architect lists the pinned tests, QA-Red re-scopes"; each is the minimal edit for the approved text (sprint-execution §C.0.2 step 6).
- **Human decision:** _covered by the human's "proceed" (2026-10-19); recorded by the orchestrator_

## 1. The Anomaly (Expected vs. Actual)

**Expected Behavior:**
- Once a wiki is set up, the agent's first reply in every session shows the line `wikeeper statusline` prints (for example `wiki ≈70k tokens · 56 pages · largest page ≈6.5k 🟡`). This is the sprint goal's first clause and EPIC-007's session-start line (STORY-007-07 R1).
- When that line shows 🔴, the agent tells the user once in the session: the page and its size, and the two choices, a higher limit or a clean-up (WIKI.md "Lint and status").

**Actual Behavior:**
- The agent runs `wikeeper statusline` at session start but does not show it. Its first and only message is the answer to the request.
- In a fresh session whose `statusline` printed `largest page ≈6.5k 🔴`, the agent did not mention the red page. It read WIKI.md's "Page format" and search sections, not "Lint and status", where the red-page rule is.
- Cause: line 4 says "open each session with the size `wikeeper statusline` prints", which the agent takes as an instruction to run the command, not to show its output; and the 🔴 rule lives only in a WIKI.md section that a question-only session does not read.

## 2. Reproduction Protocol

1. Make a scratch copy of the testbed (`.cleargate/sprint-runs/SPRINT-04/testbed.md`, "Making a scratch copy") and run `wikeeper update` in it with the 0.4.0 build first on PATH.
2. In the copy, start a fresh headless session: `claude -p "hi! quick one — what did we land on for the atlas Pro price?"`.
3. Observe in the transcript: a `wikeeper statusline` call, and no assistant message containing its line.
4. Run `wikeeper config set tokens.page.red 6k` in the copy (two pages turn 🔴), then start another fresh session: `claude -p "morning. can you pull together the open risks for atlas? I need them for my Monday update."`.
5. Observe: `statusline` prints `… largest page ≈6.5k 🔴`; no message names the red page.

Edge conditions: in a session where the user asks about sizes or changes a limit, the agent does tell (walkthrough C1), so a probe must be a request that has nothing to do with sizes. A session that starts an ingest showed the line once (walkthrough A3).

## 3. Evidence & Context

Walkthrough part 4 transcripts (orchestrator notes, kept outside the repo), sessions in fresh scratch copies with `0.4.0+30eb5dd`:

```
A2  Bash   | wikeeper statusline | wiki ≈70k tokens · 56 pages · largest page ≈6.5k 🟡
A2  TEXT1: Hi Test, it was decided at the leadership meeting on 2026-10-01: …   (only message)
A3  TEXT2: Wiki status line: `wiki ≈70k tokens · 56 pages · largest page ≈6.5k 🟡`. The PRD is in `inbox/` …   (shown)
C1  Bash   | wikeeper statusline; … | wiki ≈70k tokens · 56 pages · largest page ≈6.5k 🟡
C1  TEXT1: A page now counts as too big at 6,000 tokens; …   (only message)
C2  Bash   | …; wikeeper statusline | … largest page ≈6.5k 🔴
C2  TEXT1: Found the risk register (17 risks), so I'm reading it now …
C2  TEXT2: Morning, Test. The wiki's risk register lists 9 open risks …   (no size line, no red page)
C3  Bash   | wikeeper statusline; wikeeper search "v2 SDK fallback payments" --json | wiki ≈69k tokens · 57 pages · largest page ≈6.5k 🟡
C3  TEXT1: Yes, Test. It was the plan at the atlas kickoff on 2026-07-06 …   (only message)
```

Line 4 today (`templates/agent-block.md:4`, 198 UTF-16 units):

```
This repo has a knowledge wiki in `.wiki/`; its content folder is set by `content_dir` in `.wiki/config.yml`. Once set up, open each session with the size `wikeeper statusline` prints, not an error.
```

## 4. Execution Sandbox (Suspected Blast Radius)

**Investigate / Modify:**
- `templates/agent-block.md` — line 4 only (Q1). Still 14 lines, each at most 200 UTF-16 units; no `wikeeper status` without `line`.
- `src/agents/shipped-blocks.ts` — append the new block as the last entry (Q3); never edit an earlier one.
- `test/agents/shipped-blocks.test.ts` — append the new sha256 to `SHIPPED_BLOCK_SHA256` (Developer test).
- `templates/system/WIKI.md` — section "Lint and status", the one sentence of Q2.
- `./architecture.md` — the quoted pointer block (`:263`), line 4 only.
- `docs/ux-map.md` — row N3's quote of line 4 only.
- QA-Red only: `test/templates/bug-003-session-line.red.node.test.ts` (new), and the four re-scopes the Architect listed (`plans/M6.md`):
  - #21 `test/templates/writing-and-answering-text.red.node.test.ts`: the value of `LINE_4_SPRINT_04` becomes Q1's line;
  - #22 `test/templates/token-instructions.red.node.test.ts`: the "session (R5)" row's phrase `start of every session` becomes `first reply of every session` (Q2);
  - #23 `test/templates/archive-instructions.red.node.test.ts` and #24 `test/templates/upgrade-instructions.red.node.test.ts`: the sha256 pin of `templates/agent-block.md`, by test name.

**Read, not edited:** `src/agents/inject.ts` and `src/commands/update.ts` (how `update` replaces a recognised shipped block), `test/agents/pointer-block.red.node.test.ts`, `test/agents/block-refresh.red.node.test.ts`, `test/templates/token-instructions.red.node.test.ts:179` (its line-4 phrases still hold), `test/e2e/goal.test.ts`.

No CLI code, command output, JSON key or exit code changes.

## Task Breakdown

- [ ] Architect: list every test that pins pointer-block line 4 or the bytes of `templates/agent-block.md` or the WIKI.md sentence, and the exact re-scope for each.
- [ ] QA-Red: write the new red file from §5 and apply the listed re-scopes.
- [ ] Developer: line 4 (Q1), the SHIPPED_BLOCKS entry and its sha256 (Q3), the WIKI.md sentence (Q2), the architecture.md and ux-map quotes.
- [ ] QA-Verify: full suite, test:perf, `update` on a 0.3.0 testbed scratch copy writes the new line 4.
- [ ] Orchestrator: re-walk the two rows in 3 fresh sessions in testbed scratch copies (plain requests unrelated to sizes; one with a 🔴 page).

## 5. Verification Protocol (The Failing Test)

**Command:** `npx vitest run test/templates/bug-003-session-line.red.node.test.ts test/agents test/templates`, then the full suite; then the re-walk (§2 steps 2 and 4, plus one more plain request), each in a fresh session.

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One path: a session's first reply after setup. |
| Interfaces | T | The same block reaches Claude Code (`CLAUDE.md`) and Codex (`AGENTS.md`), written by `init` and replaced by `update`. |
| Data | F | The line's content comes from `statusline`, unchanged; only where the agent puts it changes. |
| Rules | T | On 🔴 the agent tells once and follows "Lint and status"; on 🟢/🟡 it only shows the line. |

```gherkin
Feature: The agent shows the size line in its first reply and tells about a red page

  Scenario: Line 4 says where the size line goes
    Given templates/agent-block.md
    Then line 4 is exactly the text of §Open Questions Q1
    And the block has 14 lines of at most 200 UTF-16 units each
    And line 4 holds "Once set up", "open each session", "first reply", "`wikeeper statusline`" and "🔴"
    And the block names no `wikeeper status` command other than `wikeeper statusline`

  @rules
  Scenario: WIKI.md says the same
    Given templates/system/WIKI.md, section "Lint and status"
    Then it holds "Show it to the user in your first reply of every session."
    And it no longer holds "Show it to the user at the start of every session."
    And the section "Lint and status" that line 4 names exists

  @interfaces
  Scenario Outline: init and update write the new block
    Given a scratch project <with>
    When wikeeper <command> runs
    Then <file> holds the new block, byte for byte
    And SHIPPED_BLOCKS ends with that block and test/agents/shipped-blocks.test.ts pins its sha256

    Examples:
      | with                                        | command          | file      |
      | a CLAUDE.md and no wiki                     | init --agents claude | CLAUDE.md |
      | an AGENTS.md and no wiki                    | init --agents codex  | AGENTS.md |
      | the SPRINT-03 (0.3.0) block in CLAUDE.md    | update           | CLAUDE.md |
      | the unreleased SPRINT-04 block in AGENTS.md | update           | AGENTS.md |

  @rules
  Scenario: A changed block is still left alone
    Given a CLAUDE.md whose pointer block a user edited by hand
    When wikeeper update runs
    Then the block is not replaced and update reports it as before
```

**Test layers.**

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 1 | The SHIPPED_BLOCK_SHA256 pin (Developer). |
| Integration tests | 0 | No integration-layer code changes; init and update run through `runCli` in the red file. |
| E2E / acceptance tests | 4 | One per Gherkin scenario (the Outline counts once), plus the behavioural re-walk in 3 fresh sessions. |

---

## Prior work

- [[EPIC-007]]: token gauges; STORY-007-07 R1 wrote line 4 and the "Lint and status" paragraphs this bug rewords.
- [[CR-004]]: designer review for agent instructions; PLAN and VERIFY start in SPRINT-05, so this fix gets no designer pass (DRAFTS only in SPRINT-04).
- [[SPRINT-04]]: the sprint whose walkthrough found it; the sprint branch does not merge to main before this is fixed.
- No earlier bug about the session-start line or the red-page notice (cleargate-wiki-query, 2026-10-19).

## Context Source

**context_source:** the SPRINT-04 walkthrough part 4 transcripts; the human's classification (UR:bug, fix now) on 2026-10-19; the code on `sprint/S-04` at 7061430 as cited.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Fix):
- [ ] Reproduction steps are 100% deterministic. (Not literally: the agent missed the line in 4 of 5 fresh sessions and the 🔴 notice in 1 of 1; the text half of the fix is checked deterministically by the red test, the behaviour by the re-walk.)
- [x] Actual vs. Expected behavior is explicitly defined.
- [x] Raw error logs/evidence are attached.
- [x] Verification command (failing test) is provided.
- [x] `approved: true` is set in the YAML frontmatter.
