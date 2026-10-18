---
epic_id: EPIC-007
parent_ref: null
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Completed
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T07:08:09Z
ambiguity: 🟢 Low
context_source: "The human's request in chat, 2026-10-18: always know how many tokens the wiki takes; green/yellow/red levels; see a document's tokens before it is read and confirm or reject; limits configurable from the CLI · agreed limits and touchpoints from the same chat (merged with a second agent's review) · architecture.md v0.4 §2, §7.2, §7.3, §7.7, §10, §11 · codebase as cited"
owner: Sandro Suladze
target_date: null
created_at: 2026-10-17T23:20:00Z
updated_at: 2026-10-17T23:20:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T07:08:59Z
  transition: ready-for-decomposition
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id EPIC-007
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-18T07:36:54Z
  sessions: []
---

# EPIC-007: Token gauges

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Estimate offline how many tokens the content holds — each source document, each page, and the wiki in total — and show it in status, a one-line status command, search, read, ingest start/plan/finish and lint, with green/yellow/red levels for documents and pages; make ingest start ask for approval when a document is at or above its limit; let the user view and change the limits from the CLI.</objective>
  <architecture_rules>
    <rule>Offline and deterministic: no model calls, no API keys (architecture.md §2 principle 1). Every count is an estimate and is printed with "≈". The method is SPIKE-003's weighted character count (measured error ±15%), with no new dependency.</rule>
    <rule>The CLI is the gate (principle 2): the size approval is exit 3 `needs_approval` from `ingest start`, in every permission mode, cleared by `--approved`. A source the whitelist denies stays denied.</rule>
    <rule>Limits live in `.wiki/config.yml` under `tokens:`, validated by the config SCHEMA and written only through `setConfigValue`, so comments and key order survive.</rule>
    <rule>Content, not spend: every count is the size of a document or of wiki pages. What the agent loads (its instructions, the pointer block) and what it spends are not measured.</rule>
    <rule>Metadata only (D-08): gauges report sizes, never content.</rule>
    <rule>Never replace a Claude Code status line the user already has.</rule>
    <rule>Default limits are sized for the smallest usable context among the supported agents (Codex, about 258k tokens), not the 1M models advertise: `config.yml` is committed, so everyone in the repo shares one set of limits whatever agent they use.</rule>
  </architecture_rules>
  <target_files>
    <file path="src/core/tokens.ts" action="create" />
    <file path="src/core/config.ts" action="modify" />
    <file path="src/commands/config.ts" action="create" />
    <file path="src/commands/statusline.ts" action="create" />
    <file path="src/program.ts" action="modify" />
    <file path="src/commands/init.ts" action="modify" />
    <file path="src/commands/status.ts" action="modify" />
    <file path="src/read/index.ts" action="modify" />
    <file path="src/commands/read.ts" action="modify" />
    <file path="src/commands/ingest-start.ts" action="modify" />
    <file path="src/ingest/permissions.ts" action="modify" />
    <file path="src/ingest/plan.ts" action="modify" />
    <file path="src/commands/ingest-plan.ts" action="modify" />
    <file path="src/ingest/report.ts" action="modify" />
    <file path="src/commands/ingest-finish.ts" action="modify" />
    <file path="src/search/engine.ts" action="modify" />
    <file path="src/commands/search.ts" action="modify" />
    <file path="src/lint/size.ts" action="create" />
    <file path="src/lint/checks.ts" action="modify" />
    <file path="templates/system/WIKI.md" action="modify" />
    <file path="templates/agent-block.md" action="modify" />
    <file path="templates/skills/wiki-search/SKILL.md" action="modify" />
    <file path="architecture.md" action="modify" />
    <file path="README.md" action="modify" />
  </target_files>
</agent_context>
```

## 1. Problem & Value

**Why are we doing this?**
The user can't see how big their content is in tokens: what a document is worth before it is read, how big each page is, and how much the whole wiki holds. `read` and `ingest start` report bytes only, which say little for a PDF or for Georgian text. A long PDF can be tens of thousands of tokens. The user wants to always know these sizes, and to confirm or reject a large document before it is read. The walkthrough wiki holds about 66k tokens across 43 pages (median about 870, largest about 6.3k), measured by SPIKE-003.

**Success Metrics (North Star):**
- Every command that reads, registers or writes wiki content reports its size as an estimate with a level.
- A source at or above `tokens.source.confirm_at` never reaches extraction without the user's approval, in every permission mode.
- Estimates are within the error SPIKE-003 measured, and that error is stated in `WIKI.md` and the README.

## 2. Scope Boundaries

**✅ IN-SCOPE (Build This)**
- [ ] **Estimator** (`src/core/tokens.ts`): text → estimated tokens, plus a level against a limit pair.
  - It implements the weights in SPIKE-003 §5: long runs of one punctuation mark count as one unit, then each character class has its own weight (ASCII letter 0.32, digit 0.62, whitespace run 0.51, punctuation 0.88, repeated run 0.30, Cyrillic 0.37, Georgian 0.74, other 0.38).
  - The weights follow Claude Opus 5.5's count, the highest of the measured models (GPT-6 counts 0.46–0.75× Claude), so no gauge under-reports for Codex. Gemini could not be measured.
  - Unit tests pin the estimate on short fixed strings in English, Russian and Georgian, and on a form line of underscores.
- [ ] **What is measured:**
  - **source** — the text of a document: when `read` extracts it, before `ingest start` registers it, and in a plan. It has yellow and red limits.
  - **page** — each page under `pages/`. It has yellow and red limits.
  - **wiki** — the total of all pages, with `index.md` shown next to it. A number with no level: the wiki is meant to grow, and agents read the pages a search finds, not the whole wiki.
- [ ] **Limits in config,** with these defaults:
  - page: yellow 4k, red 10k
  - source: yellow 20k, red 60k
  - `tokens.source.confirm_at`: `yellow` (allowed values: yellow, red, never)

  Values are accepted as `20000` or `20k`. Yellow must be below red.

  Why these numbers (on a 250k budget, the smallest usable window):
  - A source at red (60k) is about a quarter of the budget; with a few red pages beside it, more than half is still free.
  - A page reaches red at 10k because the writer reads several pages per ingest.
  - A source asks at 20k, not lower. At 4k (about 3 pages of English, or 1.5 of Georgian) it would ask about almost every document, and people would approve without reading.
- [ ] **Defaults written at install:** `init` writes the `tokens` block, with each default and a short comment, into the new `config.yml`. The user sees the limits without running a command.
  - The other settings stay as they are today, because `doctor` checks whether `ingest.permission` is set explicitly (`src/commands/doctor.ts:264`).
  - In existing repos `update` never rewrites `config.yml`. The defaults apply from code, and `config get tokens` shows them, marked as defaults.
- [ ] **`wikeeper config` command:** `wikeeper config get [key]`, `wikeeper config set <key> <value>` and `wikeeper config unset <key>` (unset returns the key to its default).
  - It works for every single-value setting: `ingest.permission`, `lint.stale_after_days`, the token limits and the rest.
  - List settings (`agents`, `private`, the whitelist, hooks) stay hand-edited.
- [ ] **`wikeeper status`** gains a `tokens` section: the wiki total and page count, `index.md`, the limits, and the five largest pages with their levels.
- [ ] **`wikeeper statusline`** prints one line, e.g. `wiki ≈66k tokens · 43 pages · largest page ≈6.3k 🟡`.
  - `--install` adds it to `.claude/settings.local.json`, which is personal to this repo.
  - It refuses when a status line is already set in that file, in `.claude/settings.json` or in `~/.claude/settings.json`. It then prints how to add the line to the existing one instead.
- [ ] **`wikeeper read`** reports the estimate and level: in the `--out` message, and in the `--json` fields `tokens` and `level`.
- [ ] **`ingest start`** counts the source's text and asks for approval at `confirm_at`.
  - The counted text is the `--text-file`, the stdin text, or the original when it is `.md`, `.txt`, `.csv` or `.tsv`.
  - An original without `--text-file` is counted from the extraction `read` uses.
  - A PDF with no extractable text is estimated from its page count at about 1,600 tokens per page (SPIKE-003), and marked as rough.
  - The `needs_approval` message and details carry the estimate, the level and the limit.
- [ ] **`ingest plan`** shows each file's estimate and the total, and marks files at or above `confirm_at` as needing approval. The plan approval covers them, as it does today.
  - The plan extracts nothing, so a folder of PDFs stays fast. Text files are counted. A PDF is estimated at 1,600 tokens per page (a text PDF measured about 1,000). DOCX and HTML are estimated from their size and marked as rough.
  - `ingest start` makes the exact count, and asks for approval when that count reaches `confirm_at` even though the plan's estimate stayed below it.
- [ ] **The `ingest finish` report** adds one line: the wiki total after the ingest, its change, and the largest page.
- [ ] **Search hits** carry `page_tokens`, the size of the page the hit is on.
- [ ] **Lint warning** `oversized-page`: a page at or above the page red limit.
- [ ] **Agent instructions** (`WIKI.md`, pointer block, wiki-search skill):
  - Show the one-line gauge at the start of every session, once setup is done.
  - Show the estimate when asking for approval.
  - For a red source, offer the extractor sub-agent (only facts come back) or reading selected sections.
  - When a page turns red, tell the user once. They decide whether to raise the limit or, once EPIC-008 ships, ask for a clean-up.
  - Change limits only when the user asks.
- [ ] **Docs:** `architecture.md` (a new §7.8, the §10 rows and §11 config) and the README.

**❌ OUT-OF-SCOPE (Do NOT Build This)**
- Exact per-model token counts, or any network call to count tokens.
- Gauges for files the user attaches in chat: the agent has already read them.
- What the agent spends: its instructions (`WIKI.md`, the pointer block, `me.md`, `project.md`, `kb_instructions.md`), its context window, and its other tools.
- Archiving, which belongs to EPIC-008. This epic only flags oversized pages.
- Status lines for Codex or Antigravity. They get the same line at session start through the instructions.

## 3. The Reality Check (Context)

| Constraint Type | Limit / Rule |
|---|---|
| Context budgets (checked 2026-10-18, mostly third-party sources) | Every supported model advertises about 1M tokens: Claude Opus 5.5 (Claude Code) 1M; GPT-6 Astra and GPT-6.1 Sol (Codex) 1.05M; Gemini 4 Argon (Antigravity) 1,048,576, shared by input, thinking and output. Codex has capped the usable window at about 258k–272k for GPT-5.6 Sol, and the 1M override reportedly doesn't stick. GPT-6 Astra charges a higher rate on the whole request once input passes 272k. Defaults are therefore sized for about 250k. |
| Accuracy | ±15% against Claude's real counts on 16 samples in English, Russian, Georgian and markdown (SPIKE-003); stated in `WIKI.md` and the README. The worst case is a markdown-table document, under-counted by 14%. The old rule (ASCII ÷ 4, other characters 1 each) missed by −53% to +109%. |
| Performance | `wikeeper statusline` p95 < 300 ms on a wiki of 500 pages, measured by a perf test next to `test/search/search-perf.red.node.test.ts` and run by `npm run test:perf`. It runs whenever Claude Code redraws its status line. |
| Compatibility | Existing config files keep working: the `tokens` keys get defaults in code (architecture.md §4.1). |
| Sequencing | SPIKE-003 is done (Win, 2026-10-18). EPIC-008 uses this epic's page gauge. |

## Existing Surfaces

- **Surface:** `src/core/config.ts:46` — `SCHEMA` drives defaults, validation and messages; `setConfigValue` (`src/core/config.ts:216`) writes one key and keeps comments. Used today by `setup --done`, `init --agents` and `--enforce`.
- **Surface:** `src/commands/ingest-start.ts:243` — `evaluatePermission` and the `needs_approval` error (exit 3) with source details; `src/ingest/permissions.ts:94`.
- **Surface:** `src/ingest/plan.ts:115` — the per-file permission in `ingest plan`.
- **Surface:** `src/commands/read.ts:99` — the `--out` message (bytes only today); `ReadResult` at `src/read/index.ts:14`.
- **Surface:** `src/ingest/report.ts:38` — `formatReport`, the metadata-only ingest report.
- **Surface:** `src/commands/status.ts:67` — `collectStatus`.
- **Surface:** `src/search/engine.ts:27` — `SearchHit`.
- **Surface:** `src/lint/checks.ts:153` — `PAGE_CHECKS` registry.
- **Coverage of this epic's scope:** partial. Every touchpoint is an existing command extended with one field or line. The new pieces are the estimator, the `config` command and the `statusline` command.

## Prior work

- No prior work on token sizes, size limits or a status line (cleargate-wiki-query, 2026-10-18).
- [[EPIC-005]]: `lint.stale_after_days` is the precedent for a configurable threshold; `status` is the surface this epic extends.
- [[EPIC-003]] and [[STORY-003-12]]: the `needs_approval` exit and the `--approved` rerun that the size check reuses.
- [[SPIKE-003]]: settled how tokens are counted (weighted character classes, ±15%) and measured the real sizes used here.

## Why not simpler?

- **Smallest existing surface that could carry this epic:** `evaluatePermission` plus `collectStatus`, for the gate and the status gauge.
- **Why isn't extension / parameterization / config sufficient?** It mostly is: each touchpoint is an extension. Three things are new.
  - The estimator, which the CLI doesn't have.
  - A command to change the limits, which the human asked for. Editing `config.yml` by hand is the only way today, and the SCHEMA already validates each key, so a general `config get/set` costs little more than one for limits only.
  - The one-line `statusline` command, because `status` does more work than a status line redraw should wait for.

## 4. Technical Grounding (The "Shadow Spec")

**Affected Files:**
- `src/core/tokens.ts` — new: the estimator and levels.
- `src/core/config.ts` — `tokens` schema; a token-count leaf type (`20000` or `"20k"`); a yellow-below-red check.
- `src/commands/config.ts` — new: `config get|set|unset`, parsing values by leaf type.
- `src/commands/statusline.ts` — new: the one-line gauge and `--install`.
- `src/program.ts` — registers `config` and `statusline`.
- `src/commands/init.ts` — the initial `config.yml` (written at line 196 today) gains the commented `tokens` block.
- `src/commands/status.ts` — the `tokens` section.
- `src/read/index.ts`, `src/commands/read.ts` — the estimate and level in the result and the message.
- `src/commands/ingest-start.ts`, `src/ingest/permissions.ts` — counting the source and the size check.
- `src/ingest/plan.ts`, `src/commands/ingest-plan.ts` — per-file and total estimates.
- `src/ingest/report.ts`, `src/commands/ingest-finish.ts` — the report line.
- `src/search/engine.ts`, `src/commands/search.ts` — `page_tokens` on hits.
- `src/lint/size.ts` (new), `src/lint/checks.ts` — `oversized-page`.
- `templates/system/WIKI.md`, `templates/agent-block.md`, `templates/skills/wiki-search/SKILL.md` — instructions.
- `architecture.md`, `README.md` — docs.

**Data Changes:**
- `config.yml`:
  ```yaml
  tokens:
    page:   { yellow: 4k, red: 10k }
    source: { yellow: 20k, red: 60k, confirm_at: yellow }
  ```
- JSON fields:
  - `read`: `data.tokens`, `data.level`
  - `ingest start`: `source.tokens`, `source.level`; the `needs_approval` details add `cause: "permission" | "size" | "both"` and `size: { tokens, rough, level, limit, confirm_at }`
  - `ingest plan`: `tokens` per file and `totals.tokens`
  - `ingest finish`: `tokens` (wiki total, change, largest page)
  - search hits: `page_tokens`
  - `status`: `tokens`
- `.claude/settings.local.json` gains a `statusLine` only after `wikeeper statusline --install`, and only when no status line exists.

## 5. Acceptance Criteria

```gherkin
Feature: Token gauges

  Scenario: Status shows the wiki's size
    Given a wiki with 43 pages and default limits
    When I run "wikeeper status --json"
    Then data.tokens has the wiki total, 43 pages, index.md, the page and source limits, and the five largest pages, each with a level

  Scenario: A large source needs approval in ai mode
    Given ingest.permission is ai and a text file of about 30k estimated tokens
    When I run "wikeeper ingest start notes.txt"
    Then it exits 3 with needs_approval, cause "size", the estimate, level yellow and limit 20k
    And rerunning with --approved registers the source

  Scenario: A whitelisted large source still needs approval; a denied one stays denied
    Given ingest.permission is whitelist
    When a whitelisted source above confirm_at is started
    Then it exits 3 needs_approval
    When a source the whitelist does not match is started with --approved
    Then it exits 4 denied

  Scenario: A new repo gets the limits written out
    Given an empty git repository
    When I run "wikeeper init --yes --agents claude"
    Then .wiki/config.yml contains the tokens block with page 4k/10k, source 20k/60k and confirm_at yellow, each with a comment

  Scenario: The limits change from the CLI
    When I run "wikeeper config set tokens.source.yellow 30k"
    Then config.yml has tokens.source.yellow 30000 and its comments are unchanged
    And "wikeeper config get tokens.source.yellow" prints 30000

  Scenario: The status line never replaces an existing one
    Given ~/.claude/settings.json already sets a statusLine
    When I run "wikeeper statusline --install"
    Then no settings file changes, and the output says how to add the wiki line to the existing status line

  Scenario: Error — an invalid limit is rejected
    When I run "wikeeper config set tokens.page.yellow 20k" while tokens.page.red is 10k
    Then it exits 2 and names both keys, and config.yml is unchanged

  Scenario: Error — an unknown key is rejected
    When I run "wikeeper config set tokens.pages.red 5k"
    Then it exits 2 with invalid_config_key and lists the known tokens keys
```

## 6. AI Interrogation Loop (Human Input Required)

- None. On 2026-10-18 the human chose a general `wikeeper config get | set | unset` over a limits-only command (§2).

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Coding Agent):
- [x] `approved: true` is set in the YAML frontmatter.
- [x] The `<agent_context>` block is complete and validated.
- [x] §4 Technical Grounding contains 100% real, verified file paths. (Existing paths verified on 2026-10-18; planned paths for the four new files — `src/core/tokens.ts`, `src/commands/config.ts`, `src/commands/statusline.ts`, `src/lint/size.ts` — accepted by the human at Gate 1, 2026-10-18.)
- [x] §6 AI Interrogation Loop is empty (all human answers integrated into the spec).
- [x] 0 "TBDs" exist in the document.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered.
