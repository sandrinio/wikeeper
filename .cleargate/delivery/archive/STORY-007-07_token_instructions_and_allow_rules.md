---
story_id: STORY-007-07
parent_epic_ref: EPIC-007
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-007 §2 'Agent instructions' and 'Docs' bullets, §3 Accuracy row (approved by the human 2026-10-18, Gate 1) · SPIKE-003 §5 (Completed, Win, 2026-10-18: ±15% against Claude's count, about 1,600 tokens per scanned PDF page) · SPRINT-04 decomposition brief, plans/decomposition.md (contracts K2–K8; the commands at the end of SPRINT-04; shared files 007-07 → 008-06; version 0.4.0 in this story) · human decisions 2026-10-18 (content, not spend; the wiki total has no level; a general config command; ordinary ingests keep recording and the agent tells the user once when a page turns red) · SPRINT-03 contract C10 (append-only shipped pointer blocks, STORY-002-11) and STORY-005-09 (READ_ONLY_COMMANDS) · verified 2026-10-18: templates/system/WIKI.md, templates/agent-block.md, templates/skills/wiki-search/SKILL.md, templates/skills/wiki-ingest/SKILL.md, templates/system/SETUP.md, src/agents/enforce/{claude,codex,antigravity}.ts, src/agents/shipped-blocks.ts, test/agents/shipped-blocks.test.ts, test/agents/enforce.test.ts, test/templates/structure.ts, the red tests in §3.1, architecture.md, README.md, package.json, package-lock.json"
actor: AI coding agent (main agent or sub-agent) operating the wiki
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-007-02
  - STORY-007-03
  - STORY-007-04
  - STORY-007-05
  - STORY-007-06
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T08:00:00Z
updated_at: 2026-10-18T08:00:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T08:05:53Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: claude-opus-5-5
  last_stamp: 2026-10-18T11:47:47Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-18T07:42:41Z
---

# STORY-007-07: Token instructions, allow rules for `statusline` and `config get`, docs and version 0.4.0
**Complexity:** L3 — text in four WIKI.md sections, one pointer-block line with its shipped-blocks append (C10), one wiki-search skill sentence, two entries in `READ_ONLY_COMMANDS` with three SETUP.md rows, the structural template tests, architecture.md, the README and the version. Known patterns (STORY-006-09, STORY-005-09, STORY-006-12), but it crosses templates, the enforce writers and docs, and re-scopes seven red files.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent running a wikeeper wiki (for this human: product management), I want the pointer block, WIKI.md and the wiki-search skill to tell me how to read and show the token sizes the CLI now reports, when to ask before reading a large document, what to offer for a very large one, what to say when a page turns red, and when I may change a limit, and I want `wikeeper statusline` and `wikeeper config get` to run without a permission prompt, so that the user always knows how big the wiki and each document are, approves large documents knowingly, and never has a limit changed behind their back.

### 1.2 Detailed Requirements

The text names only the commands and flags that exist at the end of SPRINT-04 (decomposition brief). Each quoted text below is the text to write; WIKI.md lines are cited at `6b75807`.

- **R1 — The session line in the pointer block (§1.4 Q1; EPIC-007 §2 "Show the one-line gauge at the start of every session, once setup is done").** Line 4 of `templates/agent-block.md` becomes: "This repo has a knowledge wiki in `.wiki/`; its content folder is set by `content_dir` in `.wiki/config.yml`. Once set up, open each session with the size `wikeeper statusline` prints, not an error." (198 characters). On a wiki whose setup is not done (no `setup_completed_at`, line 5), the agent does not show the size line: setup comes first. WIKI.md is read only once setup is done (lines 5–6), so R5 (b) 2 needs no setup clause. No line is added: the block stays at 14 lines, each at most 200 characters (`test/agents/pointer-block.red.node.test.ts:53`, `test/templates/structure.ts:399`).
- **R2 — WIKI.md section "Register" (K4, K5, K6).**
  - (a) The `--json` paragraph (`templates/system/WIKI.md:28`) gains: "`read` also reports the text's estimated size and its level (section "Lint and status"): `≈4.6k tokens 🟡` in the message, and `data.tokens` and `data.level` with `--json`."
  - (b) The exit-3 bullet (`:50`) becomes: "- exit code 3 (`needs_approval`): show the user what `wikeeper ingest start` returned and ask in chat. With `--json`, `error.details.cause` says why: `permission` (show the origin, size in bytes, kind and rule), `size` or `both`. A `size` approval comes in every permission mode when the source's estimate reaches `tokens.source.confirm_at`: show the estimate, its level and the limit from `error.details.size`, and say the estimate is rough when `rough` is true (a PDF without a text layer, counted at about 1,600 tokens a page). Rerun with `--approved` only after the user agrees. One chat approval of this exact source (same path and size) covers the `--approved` rerun, so do not ask again. If the user declines, stop: nothing was stored."
  - (c) A new bullet after it: "- A 🔴 source, at or above `tokens.source.red`: when you ask, offer two ways to keep it out of your own context, in plain words: a helper reads it and hands back only the facts (the `wiki-extractor` sub-agent, section "Delegation"; never name it to the user), or you read only the parts the user picks and tell them the rest is not captured. Without sub-agents, offer only the second."
  - (d) The directory bullet (`:53`) becomes: "- A directory: run `wikeeper ingest plan <dir>`, show the plan with each file's estimate and the total, say which estimates are rough, and get approval. Then run `wikeeper ingest start <file>` for each approved new file, with `--approved` when the plan marks it `needs_approval`: the plan approval covers them. When `ingest start` still exits 3 for `size`, the exact count reached `tokens.source.confirm_at` although the plan's estimate did not: ask about that file as above." This keeps EPIC-007 §2's rule that `ingest start` asks when its exact count reaches `confirm_at` though the plan's estimate stayed below; passing `--approved` to every plan file would skip that question.
  - (e) The `likely_scanned` row (`:33`; §1.4 Q7, Gate 1 decision 22): the first cell stays `` `likely_scanned` warning ``; the second cell becomes exactly: "Its `data.tokens` is a rough estimate (`data.tokens_rough`, about 1,600 tokens a page). When `data.level` reaches `tokens.source.confirm_at`, show the user the estimate and ask before you read the PDF; after a yes, read it, pass your text with `--text-file`, and the same approval covers the `--approved` rerun. If you cannot read it, tell the user."
- **R3 — WIKI.md section "Write phase", step 9 (`:78`; K7 report line).** Append: "Its `wiki ≈… tokens` line gives the wiki's size after the ingest, the change and the largest page."
- **R4 — WIKI.md section "Search" (K7 `page_tokens`).** After the options list (`:230`), before "Use search at triage and to answer questions.": "With `--json`, each hit carries `page_tokens`, the estimated size of its page (section "Lint and status"). Of a 🔴 page, read only the parts the question needs."
- **R5 — WIKI.md section "Lint and status" (K3, K7, K8).**
  - (a) The second and third sentences of the first paragraph (`:273`) become: "`wikeeper status`, `wikeeper lint`, `wikeeper rules list`, `wikeeper config get` and `wikeeper statusline` only read: with `enforce` on, Claude Code and Codex run them without a permission prompt in every mode. That rule also covers `wikeeper statusline --install`, which writes a settings file, so run it only as said below. `wikeeper rules record` writes a log event, and `wikeeper config set` and `wikeeper config unset` change `.wiki/config.yml`, so your harness may ask first."
  - (b) Four paragraphs after the first one, before "The fields of the `--json` output":
    1. "Sizes are estimated tokens: how much of a context a document or a page fills. Each is printed with `≈` and is within about ±15% of Claude's count; Codex models count fewer tokens for the same text. A source is 🟢, 🟡 or 🔴 against `tokens.source` in `.wiki/config.yml` (yellow 20k and red 60k by default), a page against `tokens.page` (4k and 10k); the wiki total has no level. `wikeeper read`, `wikeeper ingest start`, `wikeeper ingest plan`, the `finish` report, search hits, `wikeeper status` and `wikeeper statusline` report sizes."
    2. "`wikeeper statusline` prints one line, for example `wiki ≈66k tokens · 43 pages · largest page ≈6.3k 🟡`. Show it to the user at the start of every session. If it prints `wiki size unavailable (…)` instead, do not show that line: run `wikeeper doctor` and tell the user in plain words what is wrong. When the user wants it always in view in Claude Code, run `wikeeper statusline --install` with their agreement: it adds the line to Claude Code's status line for this repo, in `.claude/settings.local.json`. It never replaces a status line that is already set. When it refuses, tell the user which settings file already has a status line, and show them, in a code span, the one line from the refusal they can add to that status line's script (`printf '%s' "$input" | …`); you never edit their status line."
    3. "`wikeeper config get tokens` shows the limits and marks the values that come from the defaults. Change a limit only when the user asks, with `wikeeper config set <key> <value>`, for example `wikeeper config set tokens.page.red 12k`; `wikeeper config unset <key>` returns a key to its default. A value is a whole number or a short form such as `20k`, and yellow stays below red. `tokens.source.confirm_at` is `yellow`, `red` or `never`: the level at which `wikeeper ingest start` asks before a source is read."
    4. "When a page reaches 🔴 (the `finish` report's largest page, `tokens.largest` in `wikeeper status --json`, `wikeeper statusline` or an `oversized-page` finding), tell the user once in the session, however many of these show it: name the page and its size, and offer to raise the page limit for them; on a yes, run `wikeeper config set tokens.page.red <n>`. Do not bring it up again in that session unless the user asks, and never change a limit yourself." (§1.4 Q3.)
  - (c) A status-field bullet, after `misses`: "- `tokens`: the wiki's size: `wiki` (all pages), `page_count`, `index` (`.wiki/index.md`), the `limits`, and the five `largest` pages, each with its `level`. A 🔴 page is handled as said above."
  - (d) A finding-table row, after `stale-fact`: "| `oversized-page` | A page is at or above `tokens.page.red`. Tell the user once in the session, as said above; an ordinary ingest never shrinks a page. |"
  - (c) and (d) must land in the commit that adds the `tokens` status key and the `oversized-page` check (§1.4 Q4). Under the recommended answer STORY-007-05 writes them with this text (its R10 carries it verbatim), and this story checks them and changes nothing else in them. QA-Red checks them by phrase (§2.1 "status lines (R5)"), not byte for byte: STORY-008-06 R5 (b) later rewrites the `oversized-page` row, and this story's red test must still pass on that tree.
  - (e) In the first paragraph's sentence "`wikeeper ingest finish` already reports the `broken-link`, `uncited-claim` and `unlogged-change` findings for the pages it changed." (`:288`), the list gains `oversized-page`: "…the `broken-link`, `uncited-claim`, `unlogged-change` and `oversized-page` findings for the pages it changed." STORY-007-05 adds the check to `FINISH_CHECKS` and may not edit this sentence (its R10); this story does, after 007-05 has merged.
- **R6 — wiki-search skill.** `templates/skills/wiki-search/SKILL.md:10` gains a last sentence: "Check each hit's `page_tokens` before you read its page (section "Search")." Frontmatter, description and the named sections "Search" and "Answering questions" are unchanged (`test/templates/skills-subagents.red.node.test.ts:73`).
- **R7 — Allow rules (decomposition brief; STORY-005-09 R3).** `READ_ONLY_COMMANDS` in `src/agents/enforce/claude.ts:28` becomes `["lint", "status", "rules list", "statusline", "config get"]`, new entries last. Its comment says these commands write no file, except `statusline --install`, which only adds a status line where none is set (§1.4 Q2). The Claude writer then adds, in every mode, `Bash(npx wikeeper statusline *)`, `Bash(wikeeper statusline *)`, `Bash(npx wikeeper config get *)` and `Bash(wikeeper config get *)` after `Bash(wikeeper rules list *)` (`src/agents/enforce/claude.ts:60–64`). The Codex writer builds `READ_ONLY_LINES` from the same list (`src/agents/enforce/codex.ts:27–31`), so it adds `prefix_rule(pattern=["npx","wikeeper","statusline"], decision="allow")`, `prefix_rule(pattern=["wikeeper","statusline"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","config","get"], decision="allow")` and `prefix_rule(pattern=["wikeeper","config","get"], decision="allow")` with no change to `codex.ts`. `config set` and `config unset` get no rule. Antigravity has no project rule file (`src/agents/enforce/antigravity.ts:5`) and gets nothing. `wikeeper update` adds the rules to an older install by identity and records them in the manifest; `remove`, and `update` with `enforce: false`, take them out (STORY-005-09 R5; no change to `src/agents/enforce/index.ts`).
- **R8 — SETUP.md step-4 rows (`templates/system/SETUP.md:53–55`).** In the `ai`, `ask` and `whitelist` rows, the four Claude rules of R7 go at the end of the `permissions.allow` part (before `; ` and `permissions.ask` in the `ai` row), one code span each, and the four Codex lines go at the end of the Codex cell. No other SETUP.md text changes. S2 of `test/templates/setup.red.node.test.ts:243` compares the rows with the writers, so they change in the same commit as R7.
- **R9 — Shipped pointer blocks (contract C10).** In the commit that changes `templates/agent-block.md`, `SHIPPED_BLOCKS` in `src/agents/shipped-blocks.ts` gains a fourth entry, "SPRINT-04 (STORY-007-07)", equal to the new template (no BOM, LF, no trailing line break), and `SHIPPED_BLOCK_SHA256` in `test/agents/shipped-blocks.test.ts:8` gains its sha256. The three earlier entries and pins are not touched. `wikeeper update` then replaces an unedited SPRINT-01, SPRINT-02 or SPRINT-03 block with the new one, and leaves an edited block alone (STORY-002-11).
- **R10 — Structural template tests.** `DOCUMENTED_FORMS` (`test/templates/structure.ts:467`) gains `statusline`, `statusline --install`, `config get`, `config set` and `config unset`. `test/templates.test.ts` pins in the command tree: command `config` with subcommands `get`, `set` and `unset`, and command `statusline` with option `--install`. QA-Red writes `test/templates/token-instructions.red.node.test.ts` from §2.1.
- **R11 — Docs.**
  - (a) `architecture.md` §6.5 (`:249`): the quoted block shows line 4 as R1 sets it.
  - (b) A new §7.8 "Token gauges **[Built — SPRINT-04]**" after §7.7 (`:423`), before §8. It covers: what is measured (a source's text, each page, the wiki total with `index.md` beside it) and what is not (what the agent loads or spends); the method (SPIKE-003's weighted character count, within ±15% of Claude Opus 5.5's count; Claude counts the most of the measured models, GPT-6 0.46–0.75× as many; Gemini not measured; a PDF with no text layer at about 1,600 tokens a page, marked rough; every count printed with ≈); the levels and that the wiki total has none; the defaults (page 4k/10k, source 20k/60k, `confirm_at: yellow`) and why (sized for a usable window of about 250k, the smallest among the supported agents); the size approval at `ingest start` (exit 3, `cause` `size` or `both`, every mode, a denied source stays denied); the plan estimates; where sizes show (read, ingest start, ingest plan, the finish report, search `page_tokens`, status `tokens`, `statusline`, the `oversized-page` warning); `config get / set / unset`; `statusline [--install]` and its refusal to replace a status line; the agent instructions of R1–R5.
  - (c) §10 (`:463`): new rows `config get [key] / set <key> <value> / unset <key>` and `statusline [--install]`, both "Built (SPRINT-04)"; the `read`, `status` and `lint` rows add the token estimate, the `tokens` section and oversized pages.
  - (d) §11 (`:481`): the config sample gains the `tokens:` block of EPIC-007 §4 with a comment per key.
  - (e) `README.md`: the CLI table (`README.md:117–127`) gains rows for `wikeeper config get · set · unset` and `wikeeper statusline [--install]`, and the `read`, `status` and `lint` rows add the size, the `tokens` section and `oversized-page`; a short "Token gauges" section states that every size is an estimate (≈, within about ±15% of Claude's count), the levels and defaults, the size approval in every permission mode, and that limits change with `wikeeper config set`; `npm run test:perf` (`README.md:160`) also names the status-line benchmark.
- **R12 — Version 0.4.0 (decomposition brief, "Release").** `package.json` `version` and `package-lock.json` `version` and `packages[""].version` become `0.4.0`, as STORY-001-10 R1 set 0.3.0. The build stamp is unchanged: `wikeeper --version` prints `0.4.0+<commit>`, or `0.4.0+dev` from source. No test pins the package version (the `0.3.0` literals in `test/version.test.ts` and `test/build-info.test.ts:11` are inputs, not reads). Publishing stays a human step after Gate 4.
- **R13 — Vocabulary.** The new text names exactly these SPRINT-04 forms: `wikeeper statusline`, `wikeeper statusline --install`, `wikeeper config get`, `wikeeper config get tokens`, `wikeeper config set <key> <value>`, `wikeeper config set tokens.page.red 12k`, `wikeeper config set tokens.page.red <n>`, `wikeeper config unset <key>`, and the existing `wikeeper doctor`; the fields `data.tokens`, `data.level`, `error.details.cause`, `error.details.size`, `rough`, `data.tokens_rough`, `needs_approval`, `page_tokens`, `tokens`, `tokens.largest`; the config keys `tokens.source`, `tokens.source.red`, `tokens.source.confirm_at`, `tokens.page`, `tokens.page.red`; the finding `oversized-page`.
- **R14 — Invariants.** (a) Every command, flag and section named exists when this story merges (`test/templates.test.ts:113`). (b) WIKI.md keeps its 14 `##` sections and at most 400 lines (`test/templates/wiki-protocol.red.node.test.ts:132`, `:162`). (c) Section "Register" keeps its anchor lines (`- Every URL`, `- A PDF goes through`, `- Markdown, plain-text, …`) and never says "truncated" (`test/templates/sprint-03-commands.red.node.test.ts:266–276`). (d) The whitelist paragraph that WIKI.md shares with SETUP.md is not touched (`test/templates/rules-and-search-text.red.node.test.ts:178`). (e) The six sub-agent prompts, the wiki-ingest skill, ONBOARDING.md and SETUP.md prose are not touched. (f) Every red test passes, changed only as §3.1 lists.

### 1.3 Out of Scope
- The commands and fields themselves: the estimator and limits (STORY-007-01), `config` (STORY-007-02), the sizes in `read` and `ingest start` (STORY-007-03), the plan estimates (STORY-007-04), status, report, search and lint sizes (STORY-007-05), `statusline` (STORY-007-06).
- Archive and clean-up text, and the second choice for a red page (ask for a clean-up): STORY-008-06, which builds on this story's text.
- An ask or prompt rule for `wikeeper statusline --install`, unless §1.4 Q2 is decided otherwise.
- Status lines for Codex and Antigravity: they get the session-start line through the pointer block (EPIC-007 §2, out of scope).
- Publishing 0.4.0 to npm.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question:** Q1. Where does "show the `wikeeper statusline` line at session start" go? The pointer block is read every session but holds 14 of 14 lines; WIKI.md is read only before the first wiki task. SPRINT-03 kept a `status` line out of the block for the cap (STORY-006-09 Q1).
- **Recommended:** The pointer block, as one sentence appended to line 4 (R1): no new line, 198 characters. Only the block reaches the agent at the start of every session, as EPIC-007 asks. Cost: the C10 append (R9) and one re-scoped red test (§3.1 row g). Alternative: no block change; WIKI.md paragraph 2 of R5 (b) says "Show it to the user the first time you read this file in a session", and R1, R9 and row (g) drop out.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question:** Q2. `Bash(wikeeper statusline *)` and the Codex prefix rule also match `wikeeper statusline --install`, which writes `.claude/settings.local.json`. STORY-005-09 R3 keeps the list to commands that write no file. Narrow it?
- **Recommended:** No. Keep `statusline` in `READ_ONLY_COMMANDS` and say why in its comment: `--install` only adds a status line where none is set, refuses otherwise without changing a file (K8), and WIKI.md runs it only on the user's request (R5 (b) 2). Alternative: in every mode add `permissions.ask` rules `Bash(npx wikeeper statusline *--install*)` and `Bash(wikeeper statusline *--install*)` and Codex `prefix_rule(pattern=["npx","wikeeper","statusline","--install"], decision="prompt")` and its `wikeeper` twin, as STORY-002-09 did for `--drop`; that gives `whitelist` mode its first ask list and re-scopes about fifteen more red assertions (every `permissions.ask` equality, `enforce-prompts.red:301` `toBeUndefined`, `enforce.red:307` `{ allow }`).
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question:** Q3. "Tell the user once when a page turns red": once ever, or once per session? Nothing in the wiki records that the user was told, and `status` runs every session.
- **Recommended:** Once per session (R5 (b) 4): the first time the agent sees the page red in a session, from the report, `status`, `statusline` or lint, and not again in that session unless the user asks. A page the user keeps red is mentioned again in a later session. Both of the user's choices (raise the limit, or after STORY-008-06 a clean-up) end the red state, so the reminders stop.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question:** Q4. STORY-007-05 adds the `tokens` key to `status --json` and the `oversized-page` check to `PAGE_CHECKS`. Two existing checks then fail on 007-05's own tree until WIKI.md names them: the status bullets must equal the status keys (`test/templates/sprint-03-commands.red.node.test.ts:307`), and the finding table must have a row for every page check (`findingTableFindings`, `test/templates/structure.ts:504`, run by `test/templates.test.ts:113`). This story merges after 007-05. Who writes the two lines?
- **Recommended:** STORY-007-05, in the commit that adds the key and the check, with the text of R5 (c) and (d), as the SETUP.md step-4 rows change in the commit that changes the enforce writers (STORY-005-09 R6). STORY-008-05 does the same for its two status keys (STORY-008-06 Q2). WIKI.md's merge order becomes 007-05 → 008-05 → 007-07 → 008-06 (STORY-007-05 R10 and STORY-008-05 R8 carry the text; consistency audit, 2026-10-18). This story checks the two lines and edits around them.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question:** Q5. The rules of R7, the command names of R5 and the block line of R1 fail red tests that pin exact rule lists, the WIKI.md command set and the SPRINT-03 block (§3.1, re-scoped red tests). A red test changes only with the human's authorisation. May this story's QA-Red re-scope them?
- **Recommended:** Yes, exactly as §3.1 lists, by content anchor on the merged tree, only by adding the four rules, the two commands and the new block line; no assertion is dropped (STORY-005-09 Q3 and STORY-006-11 Q1 precedents).
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question:** Q6. Granularity: the allow rules (R7, R8) touch the enforce writers, a second subsystem; STORY-005-09 was split from STORY-005-05 for that reason. Split them into their own story?
- **Recommended:** Keep one story. The rules exist for this text (the session-start run and the "only read" sentence), they land on the same tree, and the decomposition fixed the story set at 13.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question:** Q7 (consistency audit, 2026-10-18). WIKI.md "Register" sends the agent to read a PDF itself when `read` warns `likely_scanned` (`templates/system/WIKI.md:22` and the table row at `:32`). STORY-007-03 R1 gives `read` a rough page estimate for that PDF (`data.tokens`, `data.tokens_rough: true`, `data.level`) so the agent can ask before reading, and its §1.5 leaves that instruction to this story, but R2 does not have it. Without it, the agent reads a large scan before `wikeeper ingest start` counts the text and asks, against EPIC-007's success metric (a source at `confirm_at` never reaches extraction without approval). Add it?
- **Recommended:** Yes, by changing only the `likely_scanned` row: "Its `data.tokens` is a rough estimate (`data.tokens_rough`, about 1,600 tokens a page). When `data.level` reaches `tokens.source.confirm_at`, show the user the estimate and ask before you read the PDF; after a yes, read it, pass your text with `--text-file`, and the same approval covers the `--approved` rerun. If you cannot read it, tell the user." R13 then gains `data.tokens_rough`, and scenario 1 gains a row for the `likely_scanned` row. Alternative: leave it out, and `wikeeper ingest start` asks only after the agent has read the scan.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

Settled and not reopened: the K3–K8 surfaces, the defaults (EPIC-007 §2), and the merge order 007-05 → 008-05 → 007-07 → 008-06 on WIKI.md and 007-07 → 008-06 on the wiki-search skill, architecture.md (shared §10, §11) and README.md (shared CLI table).

- **DRAFTS review (designer, 2026-10-18):** wording aligned with docs/ux.md — line 4 said "the size line `wikeeper statusline` prints, not an error", then 199 characters under the 200 cap (R1; replaced at plan confirmation, below); a 🔴 source's helper is offered in plain words, with `wiki-extractor` never named to the user (R2 (c)); the status-line example puts the mark after its figure (R5 (b) 2, §2.1 "session (R5)"); paragraph 2 says what to do when the line is `wiki size unavailable (…)` (run `wikeeper doctor`, plain words; R13 gains `wikeeper doctor`) and, on a refusal, to name the settings file and show only the line to add (R5 (b) 2, §2.2); paragraph 4 tells a red page once however many signals show it, and offers to raise the limit, running `wikeeper config set` on a yes (R5 (b) 4). No decision changed. Round 2: the "red page (R5)" phrase is "never change a limit", a substring of this story's sentence and of STORY-008-06 R5 (a)'s rewrite, so this story's red test stays green when 008-06 merges; R5 (c) and (d) are checked by phrase, not byte for byte, because 008-06 R5 (b) rewrites the `oversized-page` row (R5, §2.1, §3.2; R2-P3).

- **Spec clarification (orchestrator, 2026-10-18, integration):** "(default)" marks a key that is not set in config.yml (STORY-007-02's approved `from_default`); STORY-007-01's init writes all five limits, so on a fresh wiki only an unset key is marked. Scenario 1's config row now expects `tokens.page.red` marked after the unset, and QA-Red re-scopes that one red row. No code change; R5 (b) 3's text stays true.
- **Spec clarification (orchestrator, 2026-10-18, M2 plan):** Gate 1 decision 22 (§1.4 Q7) was approved but missing from the body: R2 (e) carries the `likely_scanned` row text, R13 names `data.tokens_rough`, and scenario 1 gains the "scanned PDF (R2, Q7)" row.
- **Spec clarification (orchestrator, 2026-10-18, M1 plan):** R5 (e) adds `oversized-page` to WIKI.md's list of findings `ingest finish` reports; 007-05 adds the check but may not edit that sentence.
- **Plan confirmation (human, 2026-10-18):**
  - H2: line 4's sentence is " Once set up, open each session with the size `wikeeper statusline` prints, not an error." (line 4 is then 198 characters), replacing the DRAFTS sentence; on a wiki whose setup is not done the size line waits, and setup comes first (R1, §1.4 Q1, §2.1 "session (R1)"). EPIC-007 §2 reads "once setup is done".

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** The text describes six surfaces drafted in parallel (K3–K8); a renamed field (`cause`, `rough`, `page_tokens`, `largest`) or a different line format makes it wrong.
- **Mitigation:** Every owner story is a predecessor; §2.1 scenario 2 runs `ingest start`, `statusline`, `config` and `status` and checks the names the text uses against their real output.
- **Risk:** Q4: if 007-05 or 008-05 merge without their WIKI.md lines, the sprint branch is red until this story lands.
- **Mitigation:** Q4's answer goes into the Sprint Design Review; R5 (c) and (d) give the exact text to copy.
- **Risk:** `wikeeper statusline` reads Claude Code's JSON on stdin when present (K8). Run from an agent's shell, stdin may stay open with nothing on it, and the command could wait.
- **Mitigation:** Scenario 2 runs it with empty stdin. STORY-007-06 R2 bounds the read at 200 ms and 1 MB and falls back to the working directory on JSON that does not parse, so the command never waits.
- **Risk:** `wikeeper config get tokens` names a map key; K3's `getConfigLeaf` returns null for a map.
- **Mitigation:** EPIC-007 §2 says `config get tokens` shows the limits; STORY-007-02 R5 prints every leaf under a group key, and scenario 2 runs it.
- **Risk:** Seven red files are re-scoped, some already edited by three SPRINT-03 stories; line numbers drift.
- **Mitigation:** QA-Red edits by test name and content anchor (FLASHCARD 2026-10-17 `#qa #red-test`, `#enforce #qa`); STORY-006-11's S4 anchors are re-scoped in the same step (row f).
- **Risk:** The new pointer block replaces every unedited block on `wikeeper update`.
- **Mitigation:** Intended (STORY-002-11); an edited block is left alone, and scenario 4 checks both.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.** One row per axis. `T` = at least one scenario below carries the axis tag
(`@paths`, `@interfaces`, `@data`, `@rules`). `F` = no scenario carries it, and the row states
why. There is no Spike row: open discovery is chartered as a SPIKE item (`templates/spike.md`)
before this item is written.

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | The rules and the block reach a repo through a fresh install (the writers) and through `update` of a 0.3.0 install. |
| Interfaces | T | The same guidance reaches the agent through the pointer block, WIKI.md, the wiki-search skill and SETUP.md; the rules through Claude Code and Codex settings. |
| Data | T | One row per instruction and file part; one row per command and decision. |
| Rules | T | Limits change only when the user asks; read-only commands run without a prompt and `config set` / `unset` do not; a shipped block is never edited; a form the CLI lacks fails the checks. |

```gherkin
Feature: Token instructions, allow rules for statusline and config get, docs and 0.4.0

  @data @interfaces
  Scenario Outline: Each size instruction lands in its file and part
    Given the templates tree and docs after this story
    Then <part> of <file> contains <phrases>

    Examples:
      | item              | file                                  | part                            | phrases |
      | session (R1)      | templates/agent-block.md              | line 4                          | "Once set up", "open each session", "`wikeeper statusline`" |
      | read size (R2)    | templates/system/WIKI.md              | section "Register"              | "`≈4.6k tokens 🟡`", "`data.tokens`", "`data.level`" |
      | approval (R2)     | templates/system/WIKI.md              | section "Register"              | "`error.details.cause`", "`both`", "`error.details.size`", "`tokens.source.confirm_at`", "every permission mode", "`rough`", "nothing was stored" |
      | red source (R2)   | templates/system/WIKI.md              | section "Register"              | "A 🔴 source", "`wiki-extractor`", "only the facts", "the parts the user picks" |
      | plan (R2)         | templates/system/WIKI.md              | section "Register"              | "each file's estimate", "rough", "`needs_approval`", "exits 3 for `size`" |
      | scanned PDF (R2, Q7) | templates/system/WIKI.md          | section "Register"              | "`data.tokens_rough`", "1,600 tokens a page", "ask before you read the PDF" |
      | finish (R3)       | templates/system/WIKI.md              | section "Write phase"           | "`wiki ≈… tokens`", "the largest page" |
      | search (R4)       | templates/system/WIKI.md              | section "Search"                | "`page_tokens`", "Of a 🔴 page" |
      | allowed (R5)      | templates/system/WIKI.md              | section "Lint and status"       | "`wikeeper config get`", "`wikeeper statusline`", "`wikeeper statusline --install`", "`wikeeper config set`", "`wikeeper config unset`" |
      | sizes (R5)        | templates/system/WIKI.md              | section "Lint and status"       | "`≈`", "±15%", "`tokens.source`", "`tokens.page`", "no level" |
      | session (R5)      | templates/system/WIKI.md              | section "Lint and status"       | "`wiki ≈66k tokens · 43 pages · largest page ≈6.3k 🟡`", "start of every session", "`.claude/settings.local.json`", "never replaces" |
      | limits (R5)       | templates/system/WIKI.md              | section "Lint and status"       | "`wikeeper config get tokens`", "only when the user asks", "`wikeeper config set tokens.page.red 12k`", "`20k`", "`never`" |
      | red page (R5)     | templates/system/WIKI.md              | section "Lint and status"       | "once in the session", "`wikeeper config set tokens.page.red <n>`", "never change a limit" |
      | status lines (R5) | templates/system/WIKI.md              | section "Lint and status"       | "- `tokens`: ", "`largest`", "`oversized-page`", "an ordinary ingest never shrinks a page" |
      | finish findings (R5) | templates/system/WIKI.md              | section "Lint and status"       | "`unlogged-change` and `oversized-page` findings for the pages it changed" |
      | skill (R6)        | templates/skills/wiki-search/SKILL.md | body                            | "`page_tokens`", "section \"Search\"" |
      | architecture (R11)| architecture.md                       | §7.8                            | "±15%", "`confirm_at`", "1,600", "`wikeeper statusline --install`" |
      | architecture (R11)| architecture.md                       | §10 and §11                     | "`config get [key] / set <key> <value> / unset <key>`", "`statusline [--install]`", "tokens:" |
      | README (R11)      | README.md                             | body                            | "±15%", "wikeeper config", "wikeeper statusline" |

  @rules @interfaces
  Scenario: The size guidance matches what the commands report
    Given a temp git wiki with ingest.permission "ai", default limits, and notes.txt of about 30k estimated tokens
    When the agent runs "wikeeper ingest start notes.txt --json"
    Then it exits 3 with error.code "needs_approval", error.details.cause "size", and error.details.size holding tokens, rough false, level "yellow", limit and confirm_at, the names section "Register" uses
    And rerunning it with "--approved" exits 0
    When the agent runs "wikeeper statusline" with empty stdin
    Then it exits 0 and prints one line of the form the "Lint and status" example shows
    When the agent runs the section's "wikeeper config set tokens.page.red 12k" form, then "wikeeper config get tokens.page.red"
    Then .wiki/config.yml holds tokens.page.red 12000, and after "wikeeper config unset tokens.page.red" the get prints 10000
    And "wikeeper config get tokens" exits 0 and marks tokens.page.red " (default)", the key the unset removed; init wrote the other four limits into config.yml, so they print without the mark (STORY-007-01 R7, STORY-007-02 `from_default`)
    And the fields that open a status bullet in section "Lint and status" are exactly the keys of "wikeeper status --json" data, "tokens" among them
    And the finding table has one row per PAGE_CHECKS id, "oversized-page" among them
    And WIKI.md keeps its fourteen sections in order and at most 400 lines, and the files R14 (e) names are byte-identical to the base

  @interfaces @data
  Scenario Outline: statusline and config get run without a prompt in every mode; config set and unset do not
    Given the "ai", "ask" and "whitelist" output of CLAUDE_ENFORCE and CODEX_ENFORCE
    Then in each mode, under the documented rule matching of test/agents/rule-match.ts, "<command>" is decided "<claude>" by Claude Code and "<codex>" by Codex
    And READ_ONLY_COMMANDS is exactly lint, status, rules list, statusline and config get, and each mode's SETUP.md step-4 row equals the writers

    Examples:
      | command                                 | claude  | codex   |
      | wikeeper statusline                     | allow   | allow   |
      | npx wikeeper statusline                 | allow   | allow   |
      | wikeeper statusline --install           | allow   | allow   |
      | wikeeper config get                     | allow   | allow   |
      | npx wikeeper config get tokens --json   | allow   | allow   |
      | wikeeper config set tokens.page.red 12k | default | default |
      | wikeeper config unset tokens.page.red   | default | default |

  @paths @rules
  Scenario: update brings a 0.3.0 install up to date
    Given a hand-built 0.3.0 install with agents "claude, codex", enforce true and mode "ask", whose settings and manifest hold the SPRINT-03 rules, and whose CLAUDE.md holds the SPRINT-03 pointer block unedited and AGENTS.md an edited one
    When I run "wikeeper update --json" from this build
    Then .claude/settings.json and .codex/rules/wikeeper.rules gain the four rules of R7, each recorded in the manifest as a wikeeper-owned "rule" entry, and keep every other rule
    And the CLAUDE.md block becomes templates/agent-block.md, the AGENTS.md block is unchanged, and SHIPPED_BLOCKS ends with the template, pinned, with its first three entries unchanged
    And the manifest's package_version starts with "0.4.0+", matching package.json and package-lock.json
    And a second "wikeeper update --json" changes no file

  @rules
  Scenario Outline: Error — a form the CLI does not have, or a missing one, fails the checks
    Given a copy of the templates directory where <change>
    When the checks of test/templates/structure.ts run on the copy
    Then they report <finding>

    Examples:
      | change                                                                       | finding |
      | WIKI.md section "Lint and status" contains "`wikeeper config show tokens`"   | 'unknown subcommand "config show"', with its line |
      | WIKI.md section "Lint and status" contains "`wikeeper statusline --json-out`"| '"--json-out" is not an option of "statusline"', with its line |
      | no template names "wikeeper statusline --install"                            | '"wikeeper statusline --install" is named by no template' |
      | templates/agent-block.md has a fifteenth line                                | "agent-block.md" over the cap of 14 |
```

### 2.2 Verification Steps (Manual)
- [ ] Walkthrough in a scratch copy of the testbed (`testbed.md`, Making a scratch copy), one fresh copy per session where a session's changes affect the next, in Claude Code and in Codex: start a new session and check that the agent shows the wiki's size line before anything else.
- [ ] Ask in plain words for `inbox/atlas-prd-v2.3-full-specification.md` to be added (testbed.md "Large inbox document": about 26k by Claude's count, 28,867 estimated, 🟡, above the 20k approval limit); check that it shows the estimate, the level and the limit when it asks. Decline once and check that nothing is stored. In a fresh copy with `tokens.source.red` lowered to 25k, so that the same document is 🔴, check that it also offers the extractor or selected parts.
- [ ] Ask the agent to make the page limit larger; check that it runs the `config set` form and nothing else. In another session, check that it never changes a limit unasked.
- [ ] In a fresh copy with `tokens.page.red` lowered to 6k, so that `decisions.md` and `risks.md` are 🔴 (testbed.md "Pages for specific checks"), start a session and ingest new meeting notes; check that the agent says so once and does not repeat it in the same session.
- [ ] Ask the agent to keep the size in Claude Code's status line; check that it asks first, and that with a status line already set it says so and shows the line to add instead of changing a file.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `templates/system/WIKI.md` |
| Related Files | `templates/agent-block.md`, `src/agents/shipped-blocks.ts`, `templates/skills/wiki-search/SKILL.md`, `templates/system/SETUP.md`, `src/agents/enforce/claude.ts`, `architecture.md`, `README.md`, `package.json`, `package-lock.json` |
| Test Files | `test/agents/shipped-blocks.test.ts`, `test/agents/enforce.test.ts`, `test/agents/rule-match.test.ts`, `test/templates/structure.ts`, `test/templates.test.ts` |
| Re-scoped red tests (QA-Red) | `test/templates/wiki-protocol.red.node.test.ts`, `test/agents/enforce-ai-rules.red.node.test.ts`, `test/agents/enforce-prompts.red.node.test.ts`, `test/agents/enforce.red.node.test.ts`, `test/templates/setup.red.node.test.ts`, `test/templates/structure-sprint-03.red.node.test.ts`, `test/templates/writing-and-answering-text.red.node.test.ts` |
| New Files Needed | `test/templates/token-instructions.red.node.test.ts` (written by QA-Red) |

- **Read, not edited:** `src/agents/enforce/codex.ts` (builds its lines from `READ_ONLY_COMMANDS`, `:27–31`), `src/agents/enforce/antigravity.ts`, `src/agents/enforce/index.ts` (identity diff, append, `removeEnforce`), `test/agents/rule-match.ts`, `src/agents/inject.ts` (block refresh), `templates/skills/wiki-ingest/SKILL.md` (already lists "Register" and "Lint and status").
- **Re-scoped red-test assertions** (lines at `6b75807`, a guide only; QA-Red edits by test name and content anchor on the merged tree, §1.4 Q5):

  | Row | File and assertion | Change |
  |---|---|---|
  | (a) | `wiki-protocol.red`: `COMMANDS` (`:27`) | add `"config"`, `"statusline"` after `"rules"`; titles unchanged, so `structure-sprint-03.red` S4's `/"read", "lint", "status", "rules"/`, "one SPRINT-03 vocabulary" and "fourteen sections" anchors still hold |
  | (b) | `enforce-ai-rules.red`: `READ_ONLY_CLAUDE` (`:50`), `READ_ONLY_CODEX` (`:58`) | add the four rules / lines of R7 at the end; every assertion uses the constants |
  | (c) | `enforce-prompts.red`: `READ_ONLY_CLAUDE` (`:58`), `READ_ONLY_CODEX` (`:66`) | same as (b) |
  | (d) | `enforce.red`: `READ_ONLY_CLAUDE` (`:49`), `READ_ONLY_CODEX` (`:57`); "CLAUDE_ENFORCE items per permission mode" (`:565–568` ai, `:579–582` ask, `:584` whitelist count) | same as (b); the two inline lists gain the four identities after `rules list`; the count goes from 9 to 13 |
  | (e) | `setup.red` S5 (`:353`) | the `missing [...]` text gains the four Claude rules after `Bash(wikeeper rules list *)` |
  | (f) | `structure-sprint-03.red` S4 (`:155`, `:174`) | `"Bash(wikeeper rules list *)]"` becomes `"Bash(wikeeper config get *)]"`; `"toHaveLength(9)"` becomes `"toHaveLength(13)"` |
  | (g) | `writing-and-answering-text.red` "templates/agent-block.md is exactly R14's 14 lines" (`:457–465`) | the template is compared with R14's lines with line 4 as R1 sets it; `not.toContain("wikeeper status")` becomes "names no `wikeeper status` command" (`statusline` allowed); `BLOCK_LINES`, `PINS` and the `SHIPPED_BLOCKS[2]` test (`:467–470`) unchanged |

  Not edited: `pointer-block.red` S1–S5 (cap, 200 characters, markers, phrases and ingest verbs hold), `block-refresh.red` (it never asserts the list length), `sprint-03-commands.red` (scenario 2 of this story needs its status and table checks green as they are), `test/templates.red.node.test.ts` S1, `setup.red` S2.

### 3.2 Technical Logic
- **No new WIKI.md section.** Every addition goes into an existing section, so the section list, the wiki-ingest skill's list and their red tests stay as they are. WIKI.md grows by about 15 lines, to about 322 of 400; STORY-008-06 adds about 20 more.
- **Order.** Start from the tree with 007-02 … 007-06 merged and, under Q4, 007-05's two WIKI.md lines. Edit "Register" (R2), "Write phase" step 9 (R3), "Search" (R4) and "Lint and status" (R5 (a), (b)), then the skill (R6). Section references use the form `section "<Heading>"`, which `checkSections` resolves (`test/templates/structure.ts:328`); no sentence puts "section" within 40 characters of a quoted string that is not a heading (FLASHCARD `#templates #sections`).
- **Pointer block and C10 in one commit (R1, R9).** Change line 4, then append the normalised text to `SHIPPED_BLOCKS` and its sha256 to `SHIPPED_BLOCK_SHA256`; the check at `test/agents/shipped-blocks.test.ts:16` names the hash to pin. Under Q1's alternative, skip both.
- **Rules and rows in one commit (R7, R8).** Extend `READ_ONLY_COMMANDS` and its comment; append the four rules to each SETUP.md row. `test/agents/enforce.test.ts` (plain): `RO_CLAUDE_IDS` and `RO_CODEX` (`:245`, `:253`) gain the four, the exactness test (`:322`) expects five commands and checks the last ten rules, and the init and update tests (`:344–392`) slice ten. `test/agents/rule-match.test.ts` gains the rows of scenario 3.
- **QA-Red test.** `test/templates/token-instructions.red.node.test.ts` splits sections as `test/templates/sprint-03-commands.red.node.test.ts:59` does, runs the CLI in-process with `runCli` in temp git repos, and builds the 30k-token text file in the test (repeated English prose; the estimate comes from `estimateTokens`). The update scenario hand-builds the 0.3.0 settings, manifest and blocks (FLASHCARD `#qa #test-harness`: a test that relies on `init` does not exercise the identity diff). The error outline uses `runAllChecks` on a copy of the templates, as `test/templates.test.ts:100` does. WIKI.md text is checked by the §2.1 phrases, never by whole sentences or rows: STORY-008-06 R5 (a) and (b) later rewrite paragraph 4 and the `oversized-page` row, and every phrase here is a substring of both texts ("never change a limit" of "never change a limit or start a clean-up yourself").
- **Docs and version last.** architecture.md and README.md as R11; `package.json` and `package-lock.json` as R12, with no other lock change.

### 3.3 API Contract (if applicable)

No new command or option. Changed exports:

```ts
// src/agents/enforce/claude.ts
export const READ_ONLY_COMMANDS: readonly ["lint", "status", "rules list", "statusline", "config get"];
// src/agents/shipped-blocks.ts — a fourth entry, the SPRINT-04 block (C10, append-only)
export const SHIPPED_BLOCKS: readonly string[];
// test/templates/structure.ts — five forms appended
export const DOCUMENTED_FORMS: readonly string[];
```

Consumed, frozen: K3 (`config get / set / unset`, `invalid_config_key`), K4 (`data.tokens`, `data.level`, the `--out` message), K5 (`error.details.cause`, `error.details.size`), K6 (`needs_approval`, `tokens_rough`), K7 (`status` `tokens`, the report line, `page_tokens`, `oversized-page`), K8 (`statusline` line and `--install`).

## Task Breakdown

- [ ] QA-Red: re-scope the §3.1 red-test rows (a)–(g) on the merged tree by content anchor, only as listed -> R1, R5, R7, R8
- [ ] QA-Red: write `test/templates/token-instructions.red.node.test.ts` from the five scenarios in §2.1 -> R1–R14
- [ ] Change line 4 of `templates/agent-block.md`; append the SHIPPED_BLOCKS entry and its pin -> R1, R9
- [ ] Edit WIKI.md "Register": the `read` size sentence, the exit-3 bullet, the 🔴 source bullet, the directory bullet -> R2
- [ ] Edit WIKI.md "Write phase" step 9 and "Search" -> R3, R4
- [ ] Edit WIKI.md "Lint and status": the read-only sentence and the four size paragraphs; check the `tokens` bullet and `oversized-page` row and add `oversized-page` to the finish findings sentence -> R5
- [ ] Add the `page_tokens` sentence to the wiki-search skill -> R6
- [ ] Extend `READ_ONLY_COMMANDS`; add the rules to the three SETUP.md rows; update `test/agents/enforce.test.ts` and `test/agents/rule-match.test.ts` -> R7, R8
- [ ] Append the five forms to `DOCUMENTED_FORMS`; pin `config` and `statusline` in `test/templates.test.ts` -> R10
- [ ] Update architecture.md §6.5, §7.8, §10, §11 and the README -> R11
- [ ] Set version 0.4.0 in `package.json` and `package-lock.json` -> R12
- [ ] Run `npm test` in full; check `test/templates.test.ts` reports no finding -> R13, R14

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 5 | `READ_ONLY_COMMANDS` is exactly the five and both writers end each mode with its ten rules; the scenario-3 decisions in `rule-match.test.ts` for every mode; the command-tree pins for `config` and `statusline`; `DOCUMENTED_FORMS` holds the five forms; the shipped-blocks pins with four entries |
| Integration tests | 2 | Scenario 2 (`ingest start`, `statusline`, `config`, `status` in a temp git wiki) and scenario 4 (`update` on a hand-built 0.3.0 install), in-process with `runCli`, no network |
| E2E / acceptance tests | 30 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately (17 + 1 + 7 + 1 + 4) |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Red tests re-scoped by QA-Red (not the Developer), only as §3.1 lists.
- [ ] `npm test` passes in full; `test/templates.test.ts` reports no finding on the merged tree.
- [ ] `wikeeper --version` prints `0.4.0+dev` from source.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/system/WIKI.md:28` — the `read` `--json` paragraph; `:50` — the exit-3 bullet; `:53` — the directory bullet; `:78` — "Write phase" step 9; `:217` — section "Search"; `:273` — the first paragraph of "Lint and status"; `:277–286` — the status-field bullets; `:290–297` — the finding table.
- **Surface:** `templates/agent-block.md:4` — the line R1 extends; `src/agents/shipped-blocks.ts:6` — `SHIPPED_BLOCKS`, append-only (C10); `test/agents/shipped-blocks.test.ts:8` — `SHIPPED_BLOCK_SHA256`.
- **Surface:** `src/agents/enforce/claude.ts:28` — `READ_ONLY_COMMANDS`; `:60` — the loop that writes its rules in every mode; `src/agents/enforce/codex.ts:27` — `READ_ONLY_LINES`, built from the same list.
- **Surface:** `templates/system/SETUP.md:53` — the `ai` step-4 row (`:54` `ask`, `:55` `whitelist`); `test/templates/setup.red.node.test.ts:243` — S2 compares them with the writers.
- **Surface:** `test/templates/structure.ts:467` — `DOCUMENTED_FORMS`; `:504` — `findingTableFindings`; `:585` — `runAllChecks`; `test/templates/sprint-03-commands.red.node.test.ts:302` — the status-field check.
- **Surface:** `templates/skills/wiki-search/SKILL.md:10` — the skill body R6 extends.
- **Surface:** `./architecture.md` §6.5, §7.7, §10, §11; `./README.md` CLI table; `./package.json:3` — version 0.3.0.
- **Coverage of this requirement:** partial — every surface exists and is extended; nothing in the templates names a token size, `config` or `statusline` yet, and the allow-rule list lacks the two commands.

## Prior work

- Duplicate check (cleargate-wiki-query, 2026-10-18): nothing overlaps beyond [[EPIC-007]] (parent), [[EPIC-008]] (adds the clean-up choice on top of this text) and [[SPIKE-003]] (the method and the ±15% error).
- Builds on: [[STORY-006-09]] (WIKI.md "Lint and status", the status-field and finding-table text, the "only read" sentence), [[STORY-005-09]] (`READ_ONLY_COMMANDS`, the step-4 rows, the red-test re-scope pattern), [[STORY-006-12]] (the 14-line pointer block, decision 22) and [[STORY-002-11]] (contract C10, the shipped-blocks list and block refresh), [[STORY-006-11]] (`DOCUMENTED_FORMS`, `checkLintIds`, the S4 anchors), [[STORY-004-02]] (the first every-mode allow rule), [[STORY-001-10]] (the version and build stamp).

## Why not simpler?

- **Smallest existing surface that could carry this:** WIKI.md sections "Register" and "Lint and status", `READ_ONLY_COMMANDS`, and line 4 of the pointer block.
- **Why isn't extension / parameterization / config sufficient?** It is extension only: sentences in existing sections, two entries in an existing list, one appended block. The commands report sizes; only the instructions tell the agent to show them, to ask with them, and to leave limits alone. Without the two allow rules, the session-start run would prompt the user every session in `ask` and `whitelist` mode. Without the version bump, `update` could not tell a 0.4.0 install from a 0.3.0 one.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Gate 1: the human approved every §1.4 recommendation on 2026-10-18 (`plans/gate1-decisions.md`).

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding.
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
