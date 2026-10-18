---
bug_id: BUG-004
parent_ref: EPIC-007
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Triaged
severity: P2-Medium
reporter: orchestrator (SPRINT-04 new-user test, asked by the human)
approved: true
approved_by: "human (Brief approved: all recommendations, 2026-10-19)"
approved_at: 2026-10-19T00:00:00Z
context_source: "SPRINT-04 new-user test (2026-10-19, orchestrator-driven, a throwaway folder with three fictional testbed documents, 0.4.0+17aaaa7): during setup the agent read the 75 KB PRD (≈29k tokens) to draft project.md without measuring it, guessed its size before measuring, named commands to the user, showed a table of permission patterns, restarted step numbers, and in a fresh session wrote a narration line before the size line · the human classified the size gap UR:bug 'fix now' and the wording findings 'fix now too' (2026-10-19) · verified on sprint/S-04 at 17aaaa7: templates/system/SETUP.md steps 2, 4, 6, 7; templates/system/ONBOARDING.md step 5; templates/system/WIKI.md:3 and :291, :293; templates/skills/*/SKILL.md; templates/agent-block.md:4 (196 of 200 UTF-16 units); src/agents/shipped-blocks.ts; docs/ux.md §1.2, §1.7, §6.3, §8"
created_at: 2026-10-19T00:00:00Z
updated_at: 2026-10-19T00:00:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T22:26:36Z
  transition: ready-for-fix
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id BUG-004
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-18T21:42:26Z
  sessions: []
---

# BUG-004: Setup reads a large document unmeasured, and the agent names commands to the user

### Open Questions

- **Question (Q1, the size in setup):** SETUP.md step 2 says "draft the file from a document the user names" and gives no size check. What does step 2.1 say?
- **Recommended:** `1. Ask what the project is, or draft the file from a document the user names (a README, a product summary). Get its text and size first with \`wikeeper read <file|url> --out <file>\`, which takes markdown, text and CSV files too; when \`read\` warns \`likely_scanned\` on a PDF, read the PDF yourself (\`.wiki/system/WIKI.md\`, section "Register"). Tell the user the size and its level. When the level reaches \`tokens.source.confirm_at\` in \`.wiki/config.yml\`, ask before you read the text, and offer to draft from the parts the user picks instead. Draft from the file \`read\` wrote.` It uses a command that already reports the size and stores nothing (`read` on a markdown file printed `≈29k tokens 🟡 · 74.0 KB · markdown`), so no CLI code changes.
- **Human decision:** _approved as recommended (human, 2026-10-19, Brief: "Approve all")_

- **Question (Q2, unmeasured sizes):** The agent guessed "roughly 19k tokens" before anything measured the PRD (≈29k, which is over the 20k approval limit). Where does the rule go?
- **Recommended:** Two sentences. SETUP.md step 7: `Give a document's size only as wikeeper printed it; until then, say nothing about its size.` WIKI.md "Lint and status", at the end of the sizes paragraph: `Give the user only sizes wikeeper printed; never estimate one yourself.` (docs/ux.md §1.7: no size, count or outcome the CLI didn't print.)
- **Human decision:** _approved as recommended (human, 2026-10-19, Brief: "Approve all")_

- **Question (Q3, the agent's voice):** The agent told the user "If I don't, run `wikeeper doctor`", "`wikeeper lint --rules` found no issues" and "ran `wikeeper update`". SETUP.md step 6 and ONBOARDING.md step 5 tell it to say the first one, and no instruction file tells it docs/ux.md §1.2. What changes?
- **Recommended:**
  - A new WIKI.md section "Talking to the user", right after the opening paragraph: `The commands, flags, codes, JSON and settings keys and wikeeper's own file names in these instructions are for you, not for the user. Never say one to the user, and never ask the user to run a command: run it yourself, after their yes where one is needed, and tell them in plain words what you did or found. You may name the user's own files (\`me.md\`, \`project.md\`, \`config.yml\`, \`kb_instructions.md\`) when you show or change one. The one exception is a step only the user can take, such as a command you must never run (section "Lint and status"): show that one command in a code span and say why you can't run it.`
  - One sentence under the title of SETUP.md and of ONBOARDING.md, and one at the end of each of the three skills (`wiki-ingest`, `wiki-search`, `wiki-setup`): `Talk to the user in plain words: \`.wiki/system/WIKI.md\`, section "Talking to the user".`
  - SETUP.md step 6 and ONBOARDING.md step 5: "…and that if it does not, they should run `wikeeper doctor`" becomes "…and that if it does not, they can tell you and you will check the setup".
  - Added at the human's review (the agent runs doctor itself, never the user): WIKI.md "Talking to the user" also says `When the user says you did not use their name, their preferences or the project brief, run \`wikeeper doctor\` yourself, tell them in plain words what it found, and fix it with their approval.`, so a later session knows what "check the setup" means.
- **Human decision:** _approved as recommended (human, 2026-10-19, Brief: "Approve all"); the doctor sentence added after the human asked "it could run it itself, right?"_

- **Question (Q4, the permission modes):** SETUP.md step 4 says "Show this table of what each mode installs", and the agent showed the user a table of command patterns (`ingest *--drop*`, `.codex/rules/wikeeper.rules`). What does step 4 say?
- **Recommended:** "Explain the three modes of `ingest.permission`:" becomes `Explain the three modes of \`ingest.permission\` to the user in plain words, one sentence each: who approves before a document goes into the wiki.` "Show this table of what each mode installs when `enforce` is on:" becomes `This table, for you, lists what each mode installs when \`enforce\` is on. Show it only if the user asks what changes in their agent's settings, and then say it in plain words:` The table itself stays.
- **Human decision:** _approved as recommended (human, 2026-10-19, Brief: "Approve all")_

- **Question (Q5, step numbers):** The agent said "Setup has eight steps", numbered onboarding's steps 1–3, then said "Step 2: the project". What fixes it?
- **Recommended:** In the same SETUP.md sentence as Q3: `When you tell the user where they are, use this file's step numbers: all of ONBOARDING.md is step 1.` In ONBOARDING.md: `Coming from SETUP.md, these steps are all its step 1: do not number them to the user.`
- **Human decision:** _approved as recommended (human, 2026-10-19, Brief: "Approve all")_

- **Question (Q6, the narration before the size line):** In a fresh session the agent wrote "Setup is done. Loading the search skill and the statusline in parallel." before the size line. Line 4 says "open each session's first reply with the line", which the agent reads as the reply after its tool calls. What does line 4 say?
- **Recommended:** `Wiki: \`.wiki/\`, content folder \`content_dir\` in \`.wiki/config.yml\`. Once set up, open each session with the line \`wikeeper statusline\` prints, before any text; on 🔴 follow WIKI.md "Lint and status".` (199 UTF-16 units; it keeps "Once set up", "open each session", "`wikeeper statusline`" and "🔴"). WIKI.md "Lint and status": "Show it to the user in your first reply of every session." becomes `Show it to the user as the first text you write in every session, before any other words.` Append the new block to `SHIPPED_BLOCKS` (append-only, as for BUG-003).
- **Human decision:** _approved as recommended (human, 2026-10-19, Brief: "Approve all")_

- **Question (Q7, the gate):** The reproduction is behavioural (one new-user run), so the gate's "100% deterministic" criterion is not met literally. Proceed?
- **Recommended:** Yes, as for BUG-003. The text is checked deterministically by the red test; the behaviour by a re-walk: a new-user run in a fresh throwaway folder (setup to the first source) and 3 fresh sessions, with the pass rules in §5.
- **Human decision:** _approved as recommended (human, 2026-10-19, Brief: "Approve all")_

- **Question (Q8, the plan's wording corrections):** The Architect (`plans/M7.md` §1.0) found four defects in the recommended texts. C1: "sizes wikeeper printed" fails two sealed vocabulary checks (they read `printed` as a command). C2: Q1 never says `--out` goes in the system temp folder. C3: `read --json` prints the whole document, so measuring with it reads it. C4: Q4's "Show it only if …, and then say it in plain words" contradicts itself. Accept?
- **Recommended:** Yes: C1 "sizes the CLI printed" (ux.md §1.7's own words); C2 adds "make `--out` a new file in the system temp directory"; C3 adds "Run it without `--json`: with it, `read` prints the whole text."; C4 "Show" → "Use". None changes a decision.
- **Human decision:** _accepted by the orchestrator as wording fixes (2026-10-19); reported to the human_

- **Question (Q9, five more sentences):** The plan found sentences that contradict Q3's rule: WIKI.md "Write phase" step 9 "show the user its report" (the raw report holds a hash, a rule version and the permission mode; ux.md A.23); Register's exit-3 "show the user what `wikeeper ingest start` returned"; "Lint and status"'s whitelist re-ingest bullet naming `ingest.whitelist.kinds` to the user; SETUP.md step 4 "agree `ingest.whitelist.kinds` and `ingest.whitelist.origins` with the user"; SETUP.md step 6 and ONBOARDING.md step 5 "quote the finding". Fix now?
- **Recommended:** Fix now, in this bug: the same defect in the same files, and the re-walk's first ingest is on the path. The Architect gives the exact texts in `plans/M7.md`.
- **Human decision:** _fix now in BUG-004 (human, 2026-10-19)_. The Architect's grep of `templates/**` found five more sentences with the same defect, included by the orchestrator under the same decision (`plans/M7.md` §1.9, items f–j): SETUP.md step 4's chat-capture sentence (kind id and key) and step 3's rules-check findings (check ids); WIKI.md "Register" exit 4 (the denial reason names `ingest.permission`) and the directory plan (its `run wikeeper ingest start … --approved` line); "Proposing rule changes"' dry run (source ids, rule versions, raw fact lines). Every sentence left alone has its reason in §1.9 (the user's own content, a size the user must see, or the allowed exception); no sub-agent template mentions the user.

- **Question (Q10, re-scopes):** Which sealed tests change?
- **Recommended:** #25–#30 exactly as `plans/M7.md` §2.2 gives them, applied by QA-Red only: #25 `bug-003-session-line.red` (line 4, "before any text", the WIKI.md sentence); #26 `writing-and-answering-text.red` (LINE_4_SPRINT_04); #27 `token-instructions.red` (the session phrase, the section list, the skill/ONBOARDING/SETUP pins); #28 `archive-instructions.red` and #29 `upgrade-instructions.red` (section lists and hash pins); #30 `wiki-protocol.red` (section list). No other sealed file pins a changed sentence.
- **Human decision:** _covered by the approved Brief ("the Architect will list each one, and QA-Red alone edits them", Risks); recorded by the orchestrator (2026-10-19)_

## 1. The Anomaly (Expected vs. Actual)

**Expected Behavior:**
- Before the agent reads a document, the user knows its size in tokens, and above the approval limit the user says yes first. This is the sprint goal's "always knows how big … each document [is] in tokens, approves a large document before it is read", and it holds in setup too.
- The agent gives only sizes wikeeper measured (docs/ux.md §1.7).
- The agent speaks in plain words: no command, flag, code or settings key, and it never asks the user to run something it can run (docs/ux.md §1.2, §6.3, §8).
- Setup's steps are numbered once, and the permission modes are explained in the user's terms.
- Once set up, the size line is the first text of each session (EPIC-007, STORY-007-07 R1; BUG-003).

**Actual Behavior:**
- Setup step 2: the agent read the whole 75 KB PRD (≈29k tokens, 🟡, over the 20k approval limit) to draft `project.md`, having said only "~75 KB". The user had named the file, but without knowing its cost.
- Setup step 7: "the largest, roughly 19k tokens", before anything measured it; `ingest plan` then printed ≈29k.
- The agent named `wikeeper doctor` (twice, telling the user to run it), `wikeeper lint --rules`, `wikeeper update`, `--drop`, `--force-unlock` and `ingest.permission: ask` to the user, and showed a table of permission patterns.
- Step numbers: "Step 1: about you", "Step 2: what you'll use the wiki for", "Step 3: how you like answers" (onboarding), then "Step 2: the project" (setup).
- Fresh session: the first text was "Setup is done. Loading the search skill and the statusline in parallel."; the size line opened the second.
- Cause: the instruction files. SETUP.md step 2 has no size check; SETUP.md step 6 and ONBOARDING.md step 5 tell the agent to tell the user to run `wikeeper doctor`; SETUP.md step 4 says "Show this table"; no file the agent reads holds docs/ux.md's voice rule; line 4 says "first reply".

## 2. Reproduction Protocol

1. Make an empty folder in the scratchpad holding only `docs/` with three fictional testbed documents: the 2026-10-01 leadership decisions, the 2026-10-13 status update and the 75 KB PRD (`.cleargate/sprint-runs/SPRINT-04/testbed.md`). No git, no CLAUDE.md.
2. With the 0.4.0 build in a temp prefix first on PATH, run `wikeeper init` in a terminal, answer `1` (claude) and Enter.
3. Start a headless session: `claude -p "Hi! Let's finish setting up the wiki."`, then answer as the user in `--resume` turns. At setup step 2, ask it to draft the project brief from the PRD.
4. Observe: the agent reads the PRD without a size in tokens; at step 7 it states a size before measuring; across the turns it names commands to the user; the step numbers restart.
5. After `setup --done`, start a fresh session with a plain question (`morning! who's on the hook for payments, and is it still on track for the launch date?`). Observe: a narration line before the size line.

Edge conditions: when the user names no document at step 2 (the agent asks what the project is), nothing is read and no size is due. A document under `tokens.source.confirm_at` is told by size and read without asking. A command only the user can run (`sudo`, pnpm, yarn, bun, the user's own status line script) is still shown in a code span (docs/ux.md §1.2).

## 3. Evidence & Context

New-user test transcripts (orchestrator notes, kept outside the repo), `0.4.0+17aaaa7`, session 1 = setup, session 2 = fresh:

```
S1 TEXT1  Setup has eight steps … **Step 1: about you**
S1 TEXT2  That's step 1 done. | **Step 2: what you'll use the wiki for**
S1 TEXT3  **Step 3: how you like answers**
S1 TEXT5  I wrote `.wiki/me.md`. `wikeeper doctor` reports 0 errors and 0 warnings … If I don't, run `wikeeper doctor`. | **Step 2: the project** … `atlas-prd-v2.3-full-specification.md`, the full product spec (~75 KB)
S1 Read   docs/atlas-prd-v2.3-full-specification.md (lines 1–1005, then 1006–end)
S1 TEXT6  I read the PRD, and skimmed the status update and the leadership notes …
S1 TEXT8  I wrote `.wiki/kb_instructions.md`, and `wikeeper lint --rules` found no issues … **Step 4: who approves ingests** … dropping a document (`--drop`) and taking over another ingest's lock (`--force-unlock`) … | Mode | Runs without a prompt | Prompts first | … `ingest *--drop*`, `ingest *--force-unlock*` … Codex would get the same rules in `.codex/rules/wikeeper.rules`.
S1 TEXT9  I set `ingest.permission: ask` in `.wiki/config.yml` and ran `wikeeper update` … If I don't, run `wikeeper doctor`. … (the largest, roughly 19k tokens)
S1 TEXT10 | `atlas-prd-v2.3-full-specification.md` | ≈29k tokens | 🟡 | … I was off earlier: the PRD is about 29k tokens, not 19k.
S2 TEXT1  Setup is done. Loading the search skill and the statusline in parallel.
S2 TEXT2  wiki ≈23k tokens · 19 pages · largest page ≈2.7k 🟢 | Morning, <the user's chosen name>. …
```

`wikeeper read` already measures a markdown file and stores nothing in the wiki:

```
$ wikeeper read docs/atlas-prd-v2.3-full-specification.md --out <scratch>/readcheck-prd.md
wrote <scratch>/readcheck-prd.md (≈29k tokens 🟡 · 74.0 KB · markdown)
```

Text today (sprint/S-04 at 17aaaa7):

```
SETUP.md 2.1   Ask what the project is, or draft the file from a document the user names (a README, a product summary). Read a URL, a DOCX or a local `.html` or `.htm` file with `wikeeper read <file|url> --out <file>` first, and a PDF too; …
SETUP.md 4     Explain the three modes of `ingest.permission`: … Show this table of what each mode installs when `enforce` is on:
SETUP.md 6     … If it does not, they should run `wikeeper doctor`.
ONBOARDING 5   … and that if it does not, they should run `wikeeper doctor`.
agent-block 4  Wiki: `.wiki/`, content folder `content_dir` in `.wiki/config.yml`. Once set up, open each session's first reply with the line `wikeeper statusline` prints; on 🔴 follow WIKI.md "Lint and status".
WIKI.md 293    … Show it to the user in your first reply of every session.
```

## 4. Execution Sandbox (Suspected Blast Radius)

**Investigate / Modify:**
- `templates/system/SETUP.md`: the sentence under the title (Q3, Q5), step 2.1 (Q1), step 3's rules-check sentence (Q9), step 4's two lead sentences (Q4), its whitelist and chat-capture sentences (Q9), step 6's doctor sentences (Q3, Q9), step 7 (Q2). The step 4 table stays.
- `templates/system/ONBOARDING.md`: the sentence under the title (Q3, Q5), step 5's doctor sentences (Q3, Q9).
- `templates/system/WIKI.md`: the new section "Talking to the user" after the opening paragraph (Q3); "Write phase" step 9 (Q9); "Register": the exit-3, exit-4 and directory bullets (Q9); "Proposing rule changes": the dry-run sentence (Q9); "Lint and status": the sizes paragraph's last sentence (Q2), the statusline sentence (Q6) and the whitelist re-ingest bullet (Q9). Exact texts: `plans/M7.md` §1.
- `templates/skills/wiki-ingest/SKILL.md`, `templates/skills/wiki-search/SKILL.md`, `templates/skills/wiki-setup/SKILL.md`: one sentence each (Q3).
- `templates/agent-block.md`: line 4 only (Q6). Still 14 lines, each at most 200 UTF-16 units.
- `src/agents/shipped-blocks.ts`: append the new block (Q6); never edit an earlier entry.
- `test/agents/shipped-blocks.test.ts`: append its sha256 (Developer test).
- `./architecture.md` and `docs/ux-map.md`: their quotes of line 4 and of the changed sentences only.
- QA-Red only: the new red file `test/templates/bug-004-setup-and-voice.red.node.test.ts`, and the re-scopes of sealed tests the Architect lists (expected: BUG-003's red file, which pins line 4 and the WIKI.md sentence; `writing-and-answering-text.red` LINE_4; `token-instructions.red`'s "first reply of every session" phrase; the agent-block.md sha256 pins in `archive-instructions.red` and `upgrade-instructions.red`; any test pinning the changed SETUP.md, ONBOARDING.md or skill sentences, or WIKI.md's section list).

**Read, not edited:** `docs/ux.md` (only the human changes it), `src/commands/read.ts` (Q1 relies on `read` measuring markdown, unchanged), `src/agents/inject.ts`, `src/commands/update.ts`.

No CLI code, command output, JSON key or exit code changes.

## Task Breakdown

- [ ] Architect: the exact final text of each change, every sealed test that pins a changed line or the bytes of a changed file, and the re-scope for each.
- [ ] QA-Red: write the new red file from §5 and apply the listed re-scopes.
- [ ] Developer: SETUP.md, ONBOARDING.md, WIKI.md and the three skills (Q1–Q6), line 4 and the SHIPPED_BLOCKS entry with its sha256, the architecture.md and ux-map quotes.
- [ ] QA-Verify: full suite, test:perf, `init` in a scratch folder and `update` on a 0.3.0 testbed scratch copy write the new files.
- [ ] Orchestrator: the re-walk in §5.

## 5. Verification Protocol (The Failing Test)

**Command:** `npx vitest run test/templates/bug-004-setup-and-voice.red.node.test.ts test/agents test/templates`, then the full suite; then the re-walk.

**Re-walk (orchestrator, real user, plain requests).** A new-user run in a fresh throwaway folder (§2 steps 1–4, asking for the project brief from the PRD), then 3 fresh sessions with plain questions unrelated to sizes, two in that folder and one in a testbed scratch copy after `update`. It passes only if: before reading the PRD the agent tells its size in tokens and asks; no size is given before wikeeper printed one; no assistant text names a wikeeper command, flag, code or settings key or asks the user to run one; the step numbers do not restart; the modes are explained without command patterns; and the size line is the first text in all 3 fresh sessions.

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One path per rule: setup, or a session's first text. |
| Interfaces | T | The voice rule reaches every file the agent reads (WIKI.md, SETUP.md, ONBOARDING.md, three skills), and the block reaches CLAUDE.md and AGENTS.md through `init` and `update`. |
| Data | F | No input data shapes the text; `read`'s size output is unchanged. |
| Rules | T | Measure before reading in setup, only measured sizes, plain words with one exception, one numbering. |

```gherkin
Feature: Setup measures a document before reading it, and the agent speaks in plain words

  @rules
  Scenario: Setup measures a named document first and gives only measured sizes
    Given templates/system/SETUP.md
    Then step 2 tells the agent to get a named document's size with `wikeeper read`, tell the user the size and its level, and ask before reading it when the level reaches `tokens.source.confirm_at`
    And step 7 says a document's size is given only as wikeeper printed it
    And WIKI.md "Lint and status" says to give the user only sizes wikeeper printed

  @interfaces
  Scenario Outline: Every file the agent reads points to the plain-words rule
    Given <file>
    Then it holds the sentence of §Open Questions Q3 that points to WIKI.md "Talking to the user"
    And WIKI.md has a section "Talking to the user" with the text of Q3, after the opening paragraph

    Examples:
      | file                                  |
      | templates/system/SETUP.md             |
      | templates/system/ONBOARDING.md        |
      | templates/skills/wiki-ingest/SKILL.md |
      | templates/skills/wiki-search/SKILL.md |
      | templates/skills/wiki-setup/SKILL.md  |

  @rules
  Scenario: Setup and onboarding ask the user to run nothing and number steps once
    Given templates/system/SETUP.md and templates/system/ONBOARDING.md
    Then neither holds "they should run `wikeeper doctor`"
    And SETUP.md step 4 tells the agent to explain the modes in plain words and holds no "Show this table"
    And SETUP.md says all of ONBOARDING.md is step 1, and ONBOARDING.md says not to number its steps to the user
    And WIKI.md "Write phase" tells the agent to pass on the finish report's figures in plain words and never paste the report
    And WIKI.md "Register" tells the agent to ask for an approval, give a refusal's reason and show a folder plan in plain words, never the command's raw output
    And WIKI.md "Proposing rule changes" and "Lint and status" tell the user in plain words what a rule change would do and what a whitelist re-ingest needs
    And SETUP.md steps 3 and 4 go through the rules check and agree the whitelist in plain words, and the agent writes the whitelist keys itself
    And SETUP.md step 6 and ONBOARDING.md step 5 tell the user in plain words what doctor found, quote no finding, and have the agent run a fix line itself after a yes

  Scenario: Line 4 puts the size line before any text
    Given templates/agent-block.md
    Then line 4 is exactly the text of §Open Questions Q6
    And the block has 14 lines of at most 200 UTF-16 units each
    And WIKI.md "Lint and status" holds "Show it to the user as the first text you write in every session, before any other words."

  @interfaces
  Scenario Outline: init and update write the new block
    Given a scratch project <with>
    When wikeeper <command> runs
    Then <file> holds the new block, byte for byte
    And SHIPPED_BLOCKS ends with that block and test/agents/shipped-blocks.test.ts pins its sha256

    Examples:
      | with                                       | command              | file      |
      | a CLAUDE.md and no wiki                    | init --agents claude | CLAUDE.md |
      | an AGENTS.md and no wiki                   | init --agents codex  | AGENTS.md |
      | the SPRINT-03 (0.3.0) block in CLAUDE.md   | update               | CLAUDE.md |
      | the BUG-003 block in AGENTS.md             | update               | AGENTS.md |
```

**Test layers.**

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 1 | The SHIPPED_BLOCK_SHA256 pin (Developer). |
| Integration tests | 0 | No integration-layer code changes; init and update run through `runCli` in the red file. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (each Outline counts once), plus the re-walk. |

---

## Prior work

- [[BUG-003]]: reworded line 4 to "first reply"; this bug moves the line before any text and appends another shipped block.
- [[EPIC-007]]: token gauges; the approval limit and the "≈" sizes this bug extends to setup.
- [[CR-004]]: the designer review against docs/ux.md; PLAN and VERIFY start in SPRINT-05, so this fix gets no designer pass.
- [[SPRINT-04]]: the sprint whose new-user test found it; the sprint branch does not merge to main before this is fixed.
- [[STORY-006-02]] and [[STORY-006-07]]: wrote SETUP.md and ONBOARDING.md, including the "run `wikeeper doctor`" lines.
- No earlier item about setup's size check, the agent's voice in the instruction files or setup's step numbers (cleargate-wiki-query and archive grep, 2026-10-19).

## Context Source

**context_source:** the SPRINT-04 new-user test transcripts; the human's classification (size gap UR:bug, fix now; wording findings, fix now too) on 2026-10-19; the code on `sprint/S-04` at 17aaaa7 as cited.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Fix):
- [ ] Reproduction steps are 100% deterministic. (Not literally: the behaviour comes from one new-user run; the text half is checked deterministically by the red test, the behaviour by the re-walk, Q7.)
- [x] Actual vs. Expected behavior is explicitly defined.
- [x] Raw error logs/evidence are attached.
- [x] Verification command (failing test) is provided.
- [x] `approved: true` is set in the YAML frontmatter.
