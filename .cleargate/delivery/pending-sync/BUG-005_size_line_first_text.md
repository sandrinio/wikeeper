---
bug_id: BUG-005
parent_ref: EPIC-007
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Triaged
severity: P2-Medium
reporter: orchestrator (BUG-004 re-walk)
approved: true
approved_by: "human (Brief approved: Q1 as written, Q3 proceed, 2026-10-19)"
approved_at: 2026-10-19T00:00:00Z
context_source: "BUG-004 re-walk (2026-10-19, orchestrator-driven, 0.4.0+011f640): a fresh new-user folder and a testbed scratch copy after `update`; the size line was the first text in 0 of 3 fresh sessions (two narration lines first, one session never showed it) · orchestrator experiment in scratch copies: a reworded rule put it first in 8 of 8 fresh sessions · the human chose 'fix now' and 'skip the Architect' (2026-10-19) · verified on sprint/S-04 at 011f640: templates/agent-block.md lines 3 and 4 (53 and 199 UTF-16 units), templates/system/WIKI.md:299, src/agents/shipped-blocks.ts, architecture.md:263, docs/ux-map.md:244"
created_at: 2026-10-19T00:00:00Z
updated_at: 2026-10-19T00:00:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-19T01:59:01Z
  transition: ready-for-fix
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id BUG-005
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-19T01:59:01Z
  sessions: []
---

# BUG-005: The size line is still not the first text of a fresh session

### Open Questions

- **Question (Q1, the text):** BUG-004's line 4 ("open each session with the line `wikeeper statusline` prints, before any text") and its WIKI.md sentence ("Show it to the user as the first text you write in every session, before any other words.") put the size line first in 0 of 3 fresh sessions. What do they say instead?
- **Recommended:** The texts that went 8 of 8 in scratch copies (§3). Each says when to run the check and that its line comes before any other step, not only before other words:
  - Line 3 takes the clause that opens line 4 today: `Managed by wikeeper — edit outside this block only. Wiki: \`.wiki/\`, content folder \`content_dir\` in \`.wiki/config.yml\`.` (119 UTF-16 units)
  - Line 4: `Once set up, start each session with \`wikeeper statusline\` and write its line before any other step or text; on 🔴 follow WIKI.md "Lint and status".` (148 units)
  - WIKI.md "Lint and status": "Show it to the user as the first text you write in every session, before any other words." becomes `Run it first in every session and write its line to the user at once, before any other command or text; then go on with the request.`
  - Append the new block to `SHIPPED_BLOCKS` (append-only, as for BUG-003 and BUG-004). The block keeps 14 lines of at most 200 units.
  - Why line 3 changes: the tested line 4 is 216 units with its clause. A fitted 199-unit version ("…; write its line before any other step. On 🔴: WIKI.md …") was first in only 2 of 3 sessions. Moving the clause keeps the tested words. Line 3 still starts with the sentence `pointer-block.red` checks.
- **Human decision:** _approved as written, including the line 3 move (human, 2026-10-19, Brief: "Approve"; "fix now" given earlier)_

- **Question (Q2, the plan):** The fast-lane rubric fails on size (five files plus re-scopes), so the playbook would dispatch the Architect. Is a plan needed?
- **Recommended:** No. The texts are tested and given here. QA-Red finds every sealed test that pins a changed line, the WIKI.md sentence or a changed file's sha256, re-scopes it, and re-derives each hash by applying Q1 to a temp copy of `templates/`. If a pin is missed, the full suite fails and the item goes back to QA-Red.
- **Human decision:** _skip the Architect (human, 2026-10-19)_

- **Question (Q3, the gate):** The repro is behavioural (fresh headless sessions), so "100% deterministic" is not met literally. Proceed?
- **Recommended:** Yes, as for BUG-003 and BUG-004. The red test checks the text deterministically; the re-walk in §5 checks the behaviour.
- **Human decision:** _approved (human, 2026-10-19, Brief: "Approve")_

## 1. The Anomaly (Expected vs. Actual)

**Expected Behavior:**
- Once set up, the size line is the first text of each session, before any narration or answer (EPIC-007; STORY-007-07 R1; BUG-003; BUG-004 Q6). This is the sprint goal's "the user always knows how big the wiki … [is] in tokens".

**Actual Behavior:**
- Fresh session R2 (new-user folder): the first text was "Let me read the project page and risks to check the launch date picture."; the size line opened the second text.
- Fresh session R3 (new-user folder): the agent ran `wikeeper statusline` in its first command and never showed the line.
- Fresh session R4 (testbed copy after `update`): the first text was "I've read the payments page, the risk list and the decisions; checking one more entry on Levan before I answer."; the size line opened the second text.
- Cause: the agent runs the check together with other commands and writes nothing until it has more to say. The rule says where the line goes ("before any text") but not when to write it. When the agent ran the check alone and wrote the line straight away, it was first every time (§3).

## 2. Reproduction Protocol

1. Build sprint/S-04 into a temp prefix and put it first on PATH.
2. Use a set-up wiki: a scratch copy of the testbed at `baseline-0.3.0` with `me.md` copied in, after `wikeeper update` (`.cleargate/sprint-runs/SPRINT-04/testbed.md`, "Making a scratch copy"), or a new-user folder after setup.
3. Start a fresh headless session with a plain question that is not about sizes: `claude -p "can you remind me who owns payments for atlas, and what's blocking it right now?"`.
4. Read every assistant text block of the session in order. Observe: the first text is a narration line, or no text shows the size line.

Edge conditions: before setup (`setup_completed_at` unset), no size line is due ("Once set up"). When `statusline` prints `wiki size unavailable (…)`, the agent shows no line and says in plain words what is wrong (WIKI.md, unchanged). On a 🔴 page, the agent tells the user once in the session (WIKI.md "Lint and status", unchanged).

## 3. Evidence & Context

BUG-004 re-walk, `0.4.0+011f640` (orchestrator notes, kept outside the repo). Assistant texts in order:

```
R2 TEXT1  Let me read the project page and risks to check the launch date picture.
R2 TEXT2  wiki ≈19k tokens · 16 pages · largest page ≈3.7k 🟢 | Morning! …
R3 Bash   cat .wiki/config.yml; echo "---"; wikeeper statusline; echo "---"; ls .wiki
R3 TEXT1  On 2026-10-01, leadership set Atlas Pro pricing: …            (no size line in any text)
R4 TEXT1  I've read the payments page, the risk list and the decisions; checking one more entry …
R4 TEXT2  wiki ≈70k tokens · 56 pages · largest page ≈6.5k 🟡 | …
```

Orchestrator experiment, scratch copies only (a testbed copy after `update`, a copy of the new-user folder, and a testbed copy with `tokens.page.red` 6k), each session fresh:

| Wording (line 4 · WIKI.md) | Sessions | Size line first |
|---|---|---|
| Shipped by BUG-004 | R2, R3, R4 | 0 of 3 |
| "start each session with `wikeeper statusline` and write its line before any other step or text" · Q1's WIKI.md sentence; clause on line 4 (216 units) | 5: payments, Pro price, open risks, payments, pricing | 5 of 5 |
| Fitted to 199 units: "…; write its line before any other step. On 🔴: WIKI.md …" | 3 | 2 of 3 (one narration first) |
| Q1 exactly (clause moved to line 3) | 3: payments, pricing (R3's question), open risks with a 🔴 page | 3 of 3; the 🔴 page told once in plain words |

A passing session runs the check alone and writes the line at once. The failing fitted-line session batched the check with other commands:

```
pass  Bash wikeeper statusline → TEXT1 wiki ≈70k tokens · 56 pages · largest page ≈6.5k 🟡 → Bash … Skill wiki-search … → TEXT2 answer
fail  Bash wikeeper statusline; cat .wiki/config.yml → Read, Read, Skill, Bash, Read, Read, Bash → TEXT1 "Found the Payments page …" → TEXT2 size line + answer
```

Text today (sprint/S-04 at 011f640):

```
agent-block 3   Managed by wikeeper — edit outside this block only.
agent-block 4   Wiki: `.wiki/`, content folder `content_dir` in `.wiki/config.yml`. Once set up, open each session with the line `wikeeper statusline` prints, before any text; on 🔴 follow WIKI.md "Lint and status".
WIKI.md 299     … Show it to the user as the first text you write in every session, before any other words. …
```

## 4. Execution Sandbox (Suspected Blast Radius)

**Investigate / Modify:**
- `templates/agent-block.md`: lines 3 and 4 only (Q1). Still 14 lines, each at most 200 UTF-16 units.
- `templates/system/WIKI.md`: the one statusline sentence in "Lint and status" (Q1).
- `src/agents/shipped-blocks.ts`: append the new block; never edit an earlier entry.
- `test/agents/shipped-blocks.test.ts`: append its sha256 (Developer test).
- `./architecture.md` (its quote of line 4, at :263) and `docs/ux-map.md` (row N3's quote of line 4, at :244): those quotes only.
- QA-Red only: the new red file `test/templates/bug-005-size-line-first.red.node.test.ts` and the re-scopes of every sealed test that pins line 3, line 4, the WIKI.md sentence, or the sha256 of `templates/agent-block.md` or `templates/system/WIKI.md`. Expected, from a grep at 011f640: `test/templates/bug-003-session-line.red.node.test.ts` (line 4 at :18, the sentence at :125), `test/templates/bug-004-setup-and-voice.red.node.test.ts` (line 4 at :20, the sentence at :322), `test/templates/writing-and-answering-text.red.node.test.ts` (the block lines at :203 and :218), `test/templates/token-instructions.red.node.test.ts` (the phrase at :163), and the agent-block.md sha256 pins in `archive-instructions.red` and `upgrade-instructions.red`. `test/agents/pointer-block.red.node.test.ts:69` checks that line 3's sentence is contained, which still holds.

**Read, not edited:** `docs/ux.md` (only the human changes it), `src/agents/inject.ts`, `src/commands/update.ts`.

No CLI code, command output, JSON key or exit code changes.

## Task Breakdown

- [ ] QA-Red: write the red file from §5; find and apply every re-scope in §4, deriving each new hash from Q1 applied to a temp copy of `templates/`.
- [ ] Developer: lines 3 and 4 and the WIKI.md sentence, byte for byte from Q1; append the block to `SHIPPED_BLOCKS` with its sha256 pin; the architecture.md and ux-map quotes.
- [ ] QA-Verify: full suite, test:perf, `init` in a scratch folder and `update` of a testbed scratch copy write the new block.
- [ ] Orchestrator: the re-walk in §5.

## 5. Verification Protocol (The Failing Test)

**Command:** `npx vitest run test/templates/bug-005-size-line-first.red.node.test.ts test/agents test/templates`, then the full suite; then the re-walk.

**Re-walk (orchestrator, real user, plain requests).** Build the merged tree into a new temp prefix. Run 3 fresh sessions with plain questions not about sizes: one in a copy of the BUG-004 new-user folder after `update`, one in a testbed scratch copy after `update`, and one in a testbed scratch copy after `update` with `tokens.page.red` set to 6k. It passes only if the size line is the first assistant text in all 3, and the 🔴 session tells the user once, in plain words, which page is over the limit.

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One path: the first text of a set-up session. |
| Interfaces | T | The block reaches CLAUDE.md and AGENTS.md through `init` and `update`. |
| Data | F | No input data shapes the text. |
| Rules | T | One rule: run the check first and write its line before any other step or text. |

```gherkin
Feature: The size line is the first text of a fresh session

  @rules
  Scenario: Lines 3 and 4 and the protocol put the size check first
    Given templates/agent-block.md and templates/system/WIKI.md
    Then line 3 is exactly the line 3 text of §Open Questions Q1
    And line 4 is exactly the line 4 text of §Open Questions Q1
    And the block has 14 lines of at most 200 UTF-16 units each
    And WIKI.md "Lint and status" holds the sentence of §Open Questions Q1
    And WIKI.md holds no "Show it to the user as the first text you write in every session"

  @interfaces
  Scenario Outline: init and update write the new block
    Given a scratch project <with>
    When wikeeper <command> runs
    Then <file> holds the new block, byte for byte
    And SHIPPED_BLOCKS ends with that block, still holds the BUG-004 block unchanged, and test/agents/shipped-blocks.test.ts pins the new block's sha256

    Examples:
      | with                                     | command              | file      |
      | a CLAUDE.md and no wiki                  | init --agents claude | CLAUDE.md |
      | an AGENTS.md and no wiki                 | init --agents codex  | AGENTS.md |
      | the BUG-004 block in AGENTS.md           | update               | AGENTS.md |
      | the SPRINT-03 (0.3.0) block in CLAUDE.md | update               | CLAUDE.md |
```

**Test layers.**

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 1 | The SHIPPED_BLOCK_SHA256 pin (Developer). |
| Integration tests | 0 | No integration-layer code changes; init and update run through `runCli` in the red file. |
| E2E / acceptance tests | 2 | One per Gherkin scenario (the Outline counts once), plus the re-walk. |

---

## Prior work

- [[BUG-004]]: moved line 4 to "before any text" and reworded the WIKI.md sentence; its re-walk found this. Its other rows passed.
- [[BUG-003]]: the first rewording of line 4 ("first reply") and the appended shipped block this item follows.
- [[EPIC-007]]: token gauges; the size line this item makes reliable.
- [[CR-004]]: designer review against docs/ux.md; PLAN and VERIFY start in SPRINT-05, so this fix gets no designer pass.
- [[SPRINT-04]]: the sprint branch does not merge to main before this is fixed.
- cleargate-wiki-query (2026-10-19): only [[BUG-004]] and [[CR-004]] are related; archive and flashcard grep add [[BUG-003]] and the card "say where the output goes".

## Context Source

**context_source:** the BUG-004 re-walk transcripts and the orchestrator's scratch experiment (2026-10-19); the human's answers "fix now" and "skip the Architect" (2026-10-19); the code on `sprint/S-04` at 011f640 as cited.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Fix):
- [ ] Reproduction steps are 100% deterministic. (Not literally: the behaviour comes from fresh headless sessions; the text half is checked deterministically by the red test, the behaviour by the re-walk, Q3.)
- [x] Actual vs. Expected behavior is explicitly defined.
- [x] Raw error logs/evidence are attached.
- [x] Verification command (failing test) is provided.
- [x] `approved: true` is set in the YAML frontmatter.
