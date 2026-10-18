---
story_id: STORY-007-01
parent_epic_ref: EPIC-007
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-007 (approved 2026-10-18) §2 (estimator, what is measured, limits in config, defaults written at install), §3 (accuracy, performance, compatibility), §4 (data changes) · SPIKE-003 (Completed 2026-10-18, Win) §4 rounds 4-5 and §5 (weights, method, 1,600 tokens per scanned page), plus its reference script bin/final.mjs in the spike's session scratchpad, read 2026-10-18 · SPRINT-04 decomposition brief: K1 and K2 (owned here), consumers K3-K8 and K13 · verified at 6b75807: src/core/config.ts, src/commands/init.ts, src/commands/doctor.ts, src/commands/update.ts, src/agents/index.ts, src/agents/enforce/index.ts, src/wiki/parse-page.ts, src/search/engine.ts, src/ingest/report.ts, src/core/paths.ts, test/config.red.node.test.ts, test/init.red.node.test.ts · yaml 2.9.1 round trip of the seed block checked in a scratch script (2026-10-18) · real data read-only: the 43 pages of ~/walkthrough-wiki-backup-2026-10-17.tar.gz estimate to 68,374 tokens (Claude 66,042, +3.5%)"
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T07:53:30Z
updated_at: 2026-10-18T07:53:30Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T08:00:14Z
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
  last_stamp: 2026-10-18T12:23:18Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-18T07:42:42Z
---

# STORY-007-01: Token estimator, `tokens` limits in config, limits written by `init`
**Complexity:** L2 — one new module (`src/core/tokens.ts`: the estimate, levels, display and the wiki's size), a `tokens` group with a `token-count` leaf type and a yellow-below-red check in the config SCHEMA (`src/core/config.ts`), and the commented `tokens` block in a new `config.yml` (`src/commands/init.ts`). Owns contracts K1 and K2, which STORY-007-02 … 007-06 and STORY-008-05 consume; it depends on no other story.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent working in a wiki, I want one offline function that estimates how many tokens a text holds, a level for that number against limits the user can change, and the wiki's size page by page, so that every command in EPIC-007 reports the same numbers and the user sees the limits in `config.yml` from the day the wiki is created.

### 1.2 Detailed Requirements
- **R1 — The estimate (K1, SPIKE-003 §5).** `estimateTokens(text: string): number`, offline, deterministic, no new dependency:
  1. Remove every run of three or more of the same character that is not whitespace, an ASCII letter or digit, a Cyrillic letter (U+0400–U+04FF) or a Georgian letter (U+10A0–U+10FF), and count the runs. This is the regex of SPIKE-003's reference script `bin/final.mjs`, `/([^\sA-Za-z0-9Ⴀ-ჿЀ-ӿ])\1{2,}/g`, applied without the `u` flag (§1.4 Q1).
  2. In the text that is left, count whitespace runs (`/\s+/g`, JavaScript's `\s`). Then classify each code point: ASCII letter; ASCII digit; whitespace (already counted as runs); any other code point below 128 (ASCII punctuation); Cyrillic U+0400–U+04FF; Georgian U+10A0–U+10FF; anything else is "other", one per code point, so an emoji outside the BMP counts once.
  3. Add the weights in hundredths: ASCII letter 32, digit 62, whitespace run 51, ASCII punctuation 88, repeated run 30, Cyrillic 37, Georgian 74, other 38. The result is `Math.round(sum / 100)`. The sum is an integer, so a sum ending in 50 always rounds up. Empty text gives 0.
  Step 2 must be one char-code loop with no per-character regular expression or per-character string allocation (step 1 stays one `String.replace` pass). STORY-007-06's `statusline` budget (p95 < 300 ms on 500 pages, K8) depends on it: on the 500-page fixture's ≈3.0M characters a char-code loop takes about 13 ms, SPIKE-003's naive loop (≈10.8M characters a second) about 275 ms (STORY-007-06 §1.4 Q1). It must return the reference's value for every input (§4.1, the oracle test).
- **R2 — Levels and display (K1).**
  - `levelOf(tokens, limits)`: `red` when `tokens ≥ limits.red`, else `yellow` when `tokens ≥ limits.yellow`, else `green`.
  - `levelMark(level)`: `🟢`, `🟡`, `🔴`.
  - `PDF_TOKENS_PER_PAGE = 1600` (SPIKE-003 round 5), used by STORY-007-03 and 007-04.
  - `formatTokens(n)`, with `n` rounded to an integer first:
    - `n < 1000` → `≈<n>` (`≈870`);
    - else `t = Math.round(n / 100)`; when `t < 100` → `≈<t / 10>k` with one decimal and a trailing `.0` dropped (`≈6.3k`, `≈1k`);
    - else `k = Math.round(n / 1000)`; when `k < 1000` → `≈<k>k` (`≈66k`);
    - else `m = Math.round(n / 100000)` → `≈<m / 10>M`, trailing `.0` dropped (`≈1.2M`, `≈1M`);
    - a negative `n` gives `≈-` followed by the form of `-n` without its `≈` (`≈-1.2k`), for callers that show a change.
    The decimal digit is built from the integers `t` and `m`, never with `toFixed`.
  - `formatLimit(n)` (additive to K1; plan confirmation, 2026-10-18): a limit is an exact number, so it prints without `≈`. A value of at least 1000 that divides by 100 prints as thousands with `k`, one decimal at most and no trailing `.0` (`4000` → `4k`, `1500` → `1.5k`, `20000` → `20k`); any other value prints as the integer (`1234` → `1234`, `999` → `999`). The decimal is built from integers, as for `formatTokens`. Every line that prints a limit uses it: STORY-007-03's `sizeLimitText`, STORY-007-05's status `limits:` line and `oversized-page` message, and STORY-008-05's size candidates. Lines that echo `config.yml` (`formatConfigIssue`, `config get / set / unset`) keep the stored number.
- **R3 — The wiki's size (K1).** `measureWiki(paths)` reads, as UTF-8, every file that `listPageFiles(paths.pagesDir)` returns (`.md` files under `pages/`, entries whose name starts with `.` skipped) and `paths.indexFile`. It returns `WikiSize`:
  - `pages`: each page's `path` (relative to `pages/`, POSIX, the form of `Page.path`) and `tokens`, sorted by tokens descending, then path in code-unit order (`compareCodeUnits`);
  - `total`: the sum over pages (`index.md` is not included); `page_count`: the number of pages;
  - `index`: the estimate of `index.md`, 0 when it is missing.
  A missing `pages/` gives `total` 0, `page_count` 0 and `pages` `[]`. Files are read concurrently, as `loadSearchCorpus` does (`src/search/engine.ts:246`). `measureWiki` writes nothing. `archive/` (EPIC-008) is not part of it; STORY-008-05 measures it (K13).
- **R4 — Limits in config (K2).** The SCHEMA gains a `tokens` group after `lint`:
  - `tokens.page.yellow` 4000 and `tokens.page.red` 10000;
  - `tokens.source.yellow` 20000 and `tokens.source.red` 60000;
  - `tokens.source.confirm_at`: enum `yellow`, `red`, `never`, default `yellow`.
  The four limits are `token-count` leaves (R5). `WikeeperConfig.tokens` is `{ page: TokenLimits; source: TokenLimits & { confirm_at: TokenConfirmAt } }`, and `src/core/config.ts` exports `type TokenConfirmAt = "yellow" | "red" | "never"`. `DEFAULT_CONFIG` follows from the SCHEMA.
- **R5 — The `token-count` leaf (K2).** Accepted values:
  - a positive safe integer (`20000`);
  - a string that, trimmed, is digits (`"20000"`), or digits with at most three decimals followed by `k` or `K` (`20k`, `1.5k`, `0.25k`), meaning ×1000.
  The result must be a positive integer, and `loadConfig` stores it as a number. Anything else (`0`, `-5`, `1.2345k`, `20 k`, `abc`, `true`, a list) is a `ConfigIssue` in `errors` with the message `must be a positive whole number, or a number with k (20000, 20k, 1.5k)`, and the default applies, as for every other invalid leaf (`src/core/config.ts:155`).
- **R6 — Yellow below red (K2).** For each group `page` and `source` with no error on the group or its two limits: when `yellow ≥ red`, `errors` gets `{ key: "tokens.<g>.yellow", value: <yellow>, message: "must be below tokens.<g>.red (<red>)" }`. `formatConfigIssue` prints it as `tokens.page.yellow: 20000 — must be below tokens.page.red (10000)`. Both values stay as written (§1.4 Q2). The check is exported as `tokenLimitIssues(tokens)` (additive to K2), so that `config set` (STORY-007-02) can run it before it writes.
- **R7 — Limits written at install.** A new `config.yml` (`src/commands/init.ts:193`) is exactly this text, with the profile substituted:
  ```yaml
  # wikeeper configuration (user-owned). Missing keys use built-in defaults.
  profile: management
  agents: []

  # Token limits. Sizes are estimates (about ±15%). Write 4000 or 4k; yellow must be below red.
  tokens:
    page:
      yellow: 4k # a wiki page this size is yellow
      red: 10k # and this size red
    source:
      yellow: 20k # a document to ingest this size is yellow
      red: 60k # and this size red
      confirm_at: yellow # ingest start asks for approval from this level: yellow, red or never
  ```
  - The `4k` form follows EPIC-007 §4 (Data Changes); `config set` writes numbers (EPIC-007 §5, STORY-007-02).
  - Nothing else is added: `doctor` reports the permission as `(default)` because `ingest.permission` is not set (`src/commands/doctor.ts:264`).
  - Each inline comment has one space before `#`, which is how `yaml` 2.9.1 writes them. Later `setConfigValue` calls (`init --agents`, `--enforce`, `setup --done`) therefore change no line of this block (checked in a scratch script).
  - The text comes from an exported `initialConfigText(profile)` in `src/commands/init.ts`.
- **R8 — Existing repos.** `init` on an existing `config.yml` and `update` leave the file byte-identical, as today: the seed is written only when the file is missing (`src/commands/init.ts:183`), and `update` only reads the config (`src/commands/update.ts:79`). A `config.yml` without `tokens` loads with the R4 defaults and no warning.

### 1.3 Out of Scope
- Showing a size anywhere: `read` and `ingest start` (STORY-007-03), `ingest plan` (STORY-007-04), `status`, the finish report, search hits and the `oversized-page` lint (STORY-007-05), `statusline` (STORY-007-06).
- `wikeeper config get / set / unset` (STORY-007-02), which consumes the `token-count` leaf and `tokenLimitIssues`.
- Instruction and doc text, including the ±15% statement in `WIKI.md` and the README (STORY-007-07).
- The archive's size (STORY-008-05).

### 1.4 Open Questions

- **Question (Q1, SPIKE-003 §5 text vs its script):** §5 says "each run of three or more of the same punctuation mark". The script that produced the ±14% (`bin/final.mjs`) removes runs of any character that is not whitespace, an ASCII letter or digit, Cyrillic or Georgian. So `———`, `……` and `★★★` also count as one run. It also applies the regex without the `u` flag, so a run of one emoji is never removed (each emoji counts as "other").
- **Recommended:** Follow the script exactly (R1). The measured error only holds for the formula that was measured, and the two differ only on runs of non-ASCII symbols. A scratch char-code version matched the script on all 43 backup pages and on 2,000 seeded random strings. No other SPRINT-04 story depends on the narrower reading: the consumers compute expected counts with `estimateTokens`, and STORY-007-07's text says only "SPIKE-003's weighted character count" (consistency audit, 2026-10-18).
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2, yellow at or above red, written by hand):** K2 makes this a `ConfigIssue` but does not say which values then apply. Every other invalid leaf falls back to its default (`src/core/config.ts:155`).
- **Recommended:** Keep both values as written and report the error (doctor's `config-valid` check, warnings of `config get`). `levelOf` checks red first, so such a pair has no yellow band. A user who lowered red to 3k and left yellow at 4k gets red pages from 3k, as intended. Falling back to the defaults would move that red back to 10k without a word. `config set` refuses to write such a pair (STORY-007-02).
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q3, immutable red test):** `test/config.red.node.test.ts:19` ("DEFAULT_CONFIG has the documented R1 defaults", SPRINT-01 QA-Red) checks the whole `DEFAULT_CONFIG` with `toEqual`. R4 adds `tokens`, so the test fails. May this story's QA-Red re-scope it?
- **Recommended:** Yes. Add only the `tokens` member to that expected object, anchored by content (flashcard 2026-10-17 `#qa #red-test`), as STORY-004-07 did for `search-misses.red`. No other test pins the whole config or the seed text: `test/init.red.node.test.ts:173` checks that an existing `config.yml` stays untouched, which R8 keeps.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Plan confirmation (human, 2026-10-18):**
  - P6: `formatLimit(n)` moves here from STORY-007-05 (`src/lint/size.ts`) as an additive K1 export (R2, §2.1 scenario 2, §3.3), so every limit prints one way (`tokens.source.yellow (20k)`, `tokens.page.red is 10k`); config echo lines keep stored numbers.

### 1.5 Risks

- **Risk:** Five stories consume K1 and K2; a change after this story merges ripples through all of them.
- **Mitigation:** Signatures are frozen in §3.3, and every number is pinned by a unit test with its arithmetic in §3.2, so a consumer can build against the contract before the merge.
- **Risk:** The Epic's performance budget (§3: `wikeeper statusline` p95 < 300 ms on 500 pages) is mostly `measureWiki`, but this story has no perf test. The budget is measured end to end by STORY-007-06 (K8), and a second perf file would have to be listed in `package.json`'s `test:perf` script, which STORY-007-06 edits.
- **Mitigation:** R1 requires a char-code loop and R3 reads files concurrently. A scratch char-code version took about 13 ms for 516 pages (1.8M characters, the backup's 43 pages twelve times; the regex reference took 59 ms), so the CPU part leaves most of the budget to process start-up and file reads.
- **Risk:** The estimate is fitted to Claude Opus 5.5 only (Gemini could not be measured) and is about ±15%.
- **Mitigation:** Every display uses `≈` (`formatTokens`); STORY-007-07 states the error. The backup wiki checks it once more (§2.2).

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A new wiki gets the limits from the `config.yml` that `init` writes; an existing wiki gets them from code. |
| Interfaces | F | The estimator, levels and limits are library code. Their one CLI effect is the file `init` writes; the commands that show sizes are later stories. |
| Data | T | English, Russian, Georgian, form lines, markdown tables and emoji; limit values as numbers, strings and `k` forms; a wiki with nested, hidden and non-markdown files. |
| Rules | T | Level boundaries, yellow below red, the `confirm_at` values. |

The fixture names in the first scenario are the strings in §3.2.

```gherkin
Feature: Token estimator and limits

  @data
  Scenario Outline: The estimate follows SPIKE-003's weights
    When estimateTokens is given the <fixture> fixture
    Then it returns <tokens>

    Examples:
      | fixture | tokens |
      | en      | 16     |
      | ru      | 19     |
      | ka      | 27     |
      | form    | 6      |
      | table   | 11     |
      | other   | 4      |
      | emoji   | 2      |
      | half    | 3      |
      | empty   | 0      |

  @rules
  Scenario: A size gets its level against the limits and is shown with "≈"
    Given the default page limits, yellow 4000 and red 10000
    Then levelOf, levelMark and formatTokens give
      | tokens  | level  | mark | text   |
      | 0       | green  | 🟢   | ≈0     |
      | 870     | green  | 🟢   | ≈870   |
      | 3999    | green  | 🟢   | ≈4k    |
      | 4000    | yellow | 🟡   | ≈4k    |
      | 6300    | yellow | 🟡   | ≈6.3k  |
      | 9999    | yellow | 🟡   | ≈10k   |
      | 10000   | red    | 🔴   | ≈10k   |
      | 66042   | red    | 🔴   | ≈66k   |
      | 1234567 | red    | 🔴   | ≈1.2M  |
      | -1200   | green  | 🟢   | ≈-1.2k |
    And PDF_TOKENS_PER_PAGE is 1600
    And formatLimit gives "4k" for 4000, "10k" for 10000, "1.5k" for 1500, "20k" for 20000, "1234" for 1234 and "999" for 999

  @data
  Scenario: The wiki's size counts pages, not index.md, largest first
    Given an initialised wiki whose pages/ holds "b.md" and "c.md" with the en fixture, "people/a.md" with the ka fixture, ".drafts/x.md" with the ru fixture and "notes.txt" with the ru fixture
    And whose index.md holds the ru fixture
    When measureWiki runs
    Then pages is [{ path: "people/a.md", tokens: 27 }, { path: "b.md", tokens: 16 }, { path: "c.md", tokens: 16 }]
    And total is 59, page_count is 3 and index is 19
    And no file in the repository was created, changed or deleted
    When pages/ and index.md are deleted and measureWiki runs again
    Then it returns total 0, page_count 0, index 0 and pages []

  @rules @data
  Scenario Outline: Token limits in config.yml are normalised and checked
    Given .wiki/config.yml is "<yaml>"
    When loadConfig runs
    Then config.tokens.<group> is <effective>
    And errors, each printed with formatConfigIssue, is <errors>

    Examples:
      | yaml                                                                 | group  | effective                                          | errors |
      | profile: management                                                  | page   | { yellow: 4000, red: 10000 }                       | []     |
      | tokens: { page: { yellow: 2.5k, red: 12K } }                         | page   | { yellow: 2500, red: 12000 }                       | []     |
      | tokens: { source: { yellow: '25000', red: 90000, confirm_at: never } } | source | { yellow: 25000, red: 90000, confirm_at: "never" } | []     |
      | tokens: { page: { yellow: 1.2345k } }                                | page   | { yellow: 4000, red: 10000 }                       | ['tokens.page.yellow: "1.2345k" — must be a positive whole number, or a number with k (20000, 20k, 1.5k)'] |
      | tokens: { page: { red: 0 } }                                         | page   | { yellow: 4000, red: 10000 }                       | ['tokens.page.red: 0 — must be a positive whole number, or a number with k (20000, 20k, 1.5k)'] |
      | tokens: { page: { yellow: 20k, red: 10k } }                          | page   | { yellow: 20000, red: 10000 }                      | ['tokens.page.yellow: 20000 — must be below tokens.page.red (10000)'] |
      | tokens: { page: { red: 3k } }                                        | page   | { yellow: 4000, red: 3000 }                        | ['tokens.page.yellow: 4000 — must be below tokens.page.red (3000)'] |
      | tokens: { source: { confirm_at: sometimes } }                        | source | { yellow: 20000, red: 60000, confirm_at: "yellow" } | ['tokens.source.confirm_at: "sometimes" — allowed: yellow, red, never'] |

  @paths
  Scenario: A new wiki gets the limits written out; an existing wiki gets them from code
    Given an empty git repository
    When I run "wikeeper init --yes --agents claude"
    Then .wiki/config.yml is initialConfigText("management") with "agents: []" replaced by "agents:\n  - claude"
    And loadConfig returns no errors and no warnings, and config.tokens equals DEFAULT_CONFIG.tokens
    And "wikeeper doctor --json" reports data.state.permission.default true and the config-valid check "ok"
    Given another initialised git repository whose .wiki/config.yml is "# mine\nprofile: management\nagents: []\n"
    When I run "wikeeper update" and then "wikeeper init --yes"
    Then .wiki/config.yml is byte-identical
    And loadConfig returns config.tokens equal to DEFAULT_CONFIG.tokens, with no errors and no warnings
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch copy of the testbed (`testbed.md`, Making a scratch copy), run `measureWiki` on it from a scratch script. Expected, from testbed.md "Sizes": `page_count` 56; `total` 70,318, the pages only with `index.md` not included (−4.2% against Claude's 73,369 for the 56 pages, inside ±15%); `index` 7,559 (Claude 7,822); largest page `decisions.md` 6,529 (Claude 6,755).
- [ ] In a fresh git repository run `wikeeper init --yes --agents claude`, open `.wiki/config.yml` and check that the `tokens` block and its comments read as R7, then run `wikeeper doctor`: `ingest permission: ask (default)` and no config warning.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File (new) | `src/core/tokens.ts` |
| Related Files | `src/core/config.ts`, `src/commands/init.ts` |
| Developer Tests (new) | `test/tokens.test.ts`, `test/config-tokens.test.ts` |
| QA-Red Tests | `test/tokens.red.node.test.ts` (new), `test/config.red.node.test.ts` (re-scope of the `DEFAULT_CONFIG` assertion at `:19`, §1.4 Q3) |
| New Files Needed | `src/core/tokens.ts`, `test/tokens.test.ts`, `test/config-tokens.test.ts`, `test/tokens.red.node.test.ts` |

- **Read, not edited:** `src/wiki/parse-page.ts` (`listPageFiles`, `:432`), `src/core/compare.ts` (`compareCodeUnits`), `src/core/paths.ts` (`ResolvedPaths`, `pagesDir`, `indexFile`), `src/commands/doctor.ts`, `src/commands/update.ts`, `src/agents/index.ts` (`setConfigValue(root, "agents", …)` at `:285`), `src/agents/enforce/index.ts` (`:444`).

### 3.2 Technical Logic
- **`src/core/tokens.ts`.** Imports `listPageFiles` from `../wiki/parse-page.js`, `compareCodeUnits`, `readFile`, and `ResolvedPaths` as a type. Nothing in it imports `config.ts` at run time; `config.ts` imports `TokenLimits` with `import type`, so no cycle is created.
- **Estimate (R1).** Step 1 is the reference regex with `String.replace` and a counter. Step 2 is one pass over char codes:
  - whitespace is the set JavaScript's `\s` matches: `\t \n \v \f \r`, space, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF; a whitespace run adds 51 once;
  - a high surrogate followed by a low surrogate is one "other" code point (38);
  - then the class tests in R1 order.
  The scratch version of this loop matched the reference on all 43 backup pages and 2,000 seeded random strings.
- **Fixtures** (R1; the Gherkin names them; hundredths, then the rounded result):
  - `en` = `The quick brown fox jumps over the lazy dog.`: 35 letters, 8 whitespace runs, 1 punctuation → 35×32 + 8×51 + 88 = 1120 + 408 + 88 = 1616 → **16**.
  - `ru` = `Концерт в 2030 году — 1 500 мест в зале.`: 21 Cyrillic, 8 digits, 9 whitespace runs, 1 punctuation (`.`), 1 other (`—`) → 777 + 496 + 459 + 88 + 38 = 1858 → **19**.
  - `ka` = `კონცერტი 2030 წელს: 1500 ადგილი კლუბში.`: 24 Georgian, 8 digits, 5 whitespace runs, 2 punctuation (`:` `.`) → 1776 + 496 + 255 + 176 = 2703 → **27**.
  - `form` = `"Name: " + "_".repeat(12) + " Date: " + "_".repeat(10)`: 2 runs removed, leaving `Name:  Date: `: 8 letters, 2 punctuation, 2 whitespace runs (the two spaces around a removed run join into one) → 256 + 176 + 102 + 60 = 594 → **6**.
  - `table` = `"| Item | Cost |\n|---|---|"`: 2 runs (`---`) removed, leaving `| Item | Cost |\n|||`: 8 letters, 6 punctuation, 5 whitespace runs → 256 + 528 + 255 + 60 = 1099 → **11**.
  - `other` = `Café ☕ 10€`: 3 letters, 2 digits, 2 whitespace runs, 3 other (`é`, `☕`, `€`) → 96 + 124 + 102 + 114 = 436 → **4**.
  - `emoji` = `"👍".repeat(5)`: 5 other code points and no run (the regex has no `u` flag) → 190 → **2**; counting UTF-16 units instead would give 380 → 4.
  - `half` = `€1?1`: 2 digits, 1 punctuation, 1 other → 124 + 88 + 38 = 250 → **3** (half rounds up).
  - `empty` = `""` → 0 → **0**.
- **`measureWiki` (R3).** `listPageFiles`, then `Promise.all` over `readFile(path.join(paths.pagesDir, ...rel.split("/")), "utf8")`, then `estimateTokens` on each. `index.md` is read with an `ENOENT` → 0 rule; any other read error is thrown.
- **SCHEMA (R4, R5).**
  - The `Leaf` union (`src/core/config.ts:39`) gains `{ type: "token-count"; default: number }`.
  - A private `parseTokenCount(value: unknown): number | null` implements R5 with integer arithmetic (`"1.5k"` → 1×1000 + 500; never `parseFloat`).
  - `validateLeaf` (`:98`) returns the R5 message when `parseTokenCount` gives `null`.
  - `walk` (`:121`) stores `parseTokenCount(input[k])` for a valid `token-count` leaf and `input[k]` for every other type. A small private `normalizeLeaf(node, value)` keeps this in one place for STORY-007-02's `parseConfigValue`.
- **Pair check (R6).** `tokenLimitIssues(tokens)` returns the issues for `page` then `source`. `loadConfig` (`:193`) appends them to `errors` after `walk`, but skips a group when `errors` already holds `tokens`, `tokens.<g>`, `tokens.<g>.yellow` or `tokens.<g>.red`, so one bad value never gives two messages (an invalid `confirm_at` does not skip it).
- **Seed (R7).** `initialConfigText(profile)` returns the R7 text (LF line ends, final newline). The `seed` call at `src/commands/init.ts:193` writes it in place of today's literal at `:196`.
- **Tests.** Unit tests import the modules directly. The `init` and `update` rows run through `runCli`'s default program in a temp repository that has `.git`, so the agents integration registers (flashcard 2026-10-17 `#qa #test-harness`); copy the `run()` helper of `test/lint/lint-command.test.ts:23`. The red test re-scope (§1.4 Q3) adds only `tokens: { page: { yellow: 4000, red: 10000 }, source: { yellow: 20000, red: 60000, confirm_at: "yellow" } }`.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `estimateTokens`, `levelOf`, `formatTokens`, `formatLimit`, `levelMark`, `measureWiki` | function | None | see below (K1) | see below (K1) |
| `loadConfig` | function | None | `.wiki/config.yml` with `tokens` | `config.tokens` (K2), `errors` per R5 and R6 |

```ts
// src/core/tokens.ts (K1, frozen)
import type { ResolvedPaths } from "./paths.js";
export type TokenLevel = "green" | "yellow" | "red";
export interface TokenLimits { yellow: number; red: number }
export function estimateTokens(text: string): number;          // SPIKE-003 §5 weights, Math.round, ≥ 0
export function levelOf(tokens: number, limits: TokenLimits): TokenLevel; // ≥ red → red; ≥ yellow → yellow
export function formatTokens(n: number): string;               // "≈870", "≈6.3k", "≈66k", "≈1.2M"
export function formatLimit(n: number): string;                // 4000 → "4k", 1500 → "1.5k", 1234 → "1234"; additive (plan confirmation, 2026-10-18)
export function levelMark(level: TokenLevel): string;          // "🟢" | "🟡" | "🔴"
export const PDF_TOKENS_PER_PAGE = 1600;
export interface WikiSize { total: number; page_count: number; index: number; pages: Array<{ path: string; tokens: number }> } // pages: tokens desc, then path
export function measureWiki(paths: ResolvedPaths): Promise<WikiSize>;

// src/core/config.ts (K2, frozen; tokenLimitIssues is additive)
export type TokenConfirmAt = "yellow" | "red" | "never";
export interface WikeeperConfig {
  // …existing keys…
  tokens: { page: TokenLimits; source: TokenLimits & { confirm_at: TokenConfirmAt } };
}
export function tokenLimitIssues(tokens: WikeeperConfig["tokens"]): ConfigIssue[];

// src/commands/init.ts (additive)
export function initialConfigText(profile: string): string;
```

## Task Breakdown

- [ ] Write `src/core/tokens.ts`: `estimateTokens`, `levelOf`, `levelMark`, `formatTokens`, `formatLimit`, `PDF_TOKENS_PER_PAGE` -> R1, R2
- [ ] Add `measureWiki` with concurrent reads -> R3
- [ ] Add the `tokens` SCHEMA, the `token-count` leaf (`parseTokenCount`, `validateLeaf`, `walk`) and `TokenConfirmAt` to `src/core/config.ts` -> R4, R5
- [ ] Add `tokenLimitIssues` and its call in `loadConfig` -> R6
- [ ] Add `initialConfigText` and use it in the `init` seed -> R7, R8
- [ ] QA-Red writes `test/tokens.red.node.test.ts` from the five §2.1 scenarios and re-scopes `test/config.red.node.test.ts:19` (§1.4 Q3); the Developer writes the §4.1 unit tests in `test/tokens.test.ts` and `test/config-tokens.test.ts` -> §2.1

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 10 | Each fixture in §3.2. The oracle: SPIKE-003's reference counting from `bin/final.mjs`, copied into the test with integer weights, equals `estimateTokens` on the fixtures and on 2,000 strings from a seeded generator over a mixed alphabet (letters, digits, space, `\n`, `\t`, U+00A0, `.`, `_`, `-`, `\|`, `д`, `ა`, `é`, `—`, `…`, `€`, `👍`, each sometimes repeated). `levelOf` at both boundaries; `levelMark`; `formatTokens` at 999, 1000, 1049, 1050, 9949, 9950, 999499, 999500, -1200 and 870.6; `formatLimit` at 4000, 10000, 1500, 1234 and 999; `measureWiki` order, ties and missing paths; the R5 accepted and refused forms; `tokenLimitIssues` for both groups and the skipped group; `initialConfigText` loads with no errors or warnings and equals the defaults; the seed text is unchanged except `agents` after `setConfigValue(root, "agents", ["claude"])`. |
| Integration tests | 0 | Temp directories only; no external service. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), in QA-Red's `test/tokens.red.node.test.ts`; the last one through `runCli` in a temp git repository. |
| Performance test | 0 | The Epic budget (`statusline` p95 < 300 ms on 500 pages) is measured end to end by STORY-007-06's perf test (K8), which runs `measureWiki` (§1.5). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/config.red.node.test.ts` passes with only the §1.4 Q3 re-scope; no other red file is modified.
- [ ] `npm run typecheck` and `npm test` pass; no new runtime dependency in `package.json`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/config.ts:46` — `SCHEMA`, the one table that drives defaults, validation and messages; `src/core/config.ts:98` — `validateLeaf`; `src/core/config.ts:121` — `walk`, which reports an invalid leaf and keeps its default; `src/core/config.ts:211` — `formatConfigIssue`.
- **Surface:** `src/core/config.ts:216` — `setConfigValue`, which `init --agents` (`src/agents/index.ts:285`) and `--enforce` (`src/agents/enforce/index.ts:444`) call after the seed is written.
- **Surface:** `src/commands/init.ts:196` — today's seed (`profile` and `agents` only); `src/commands/doctor.ts:264` — the `(default)` permission check that R7 keeps.
- **Surface:** `src/wiki/parse-page.ts:432` — `listPageFiles`, the page list (dot entries skipped); `src/search/engine.ts:245` — reading every page concurrently.
- **Surface:** `src/ingest/report.ts:32` — `formatSize`, the byte display that `formatTokens` sits beside.
- **Coverage of this requirement:** partial — the config machinery and the page list exist; the estimator, levels, display, the `token-count` leaf and the seed block are net-new.

## Prior work

- [[EPIC-007]] (parent; §2 sets the weights, limits and seed block). [[SPIKE-003]] settled the method and measured the weights and the 1,600 tokens per scanned page. [[EPIC-008]] uses the page limit for archive candidates (STORY-008-05). Builds on [[STORY-001-02]] (the SCHEMA, `loadConfig`, `setConfigValue`), [[STORY-001-04]] (`init` seeds `config.yml` only when it is missing), [[STORY-002-07]] (`configKeyIsSet` and doctor's `(default)` permission), [[STORY-004-01]] (`listPageFiles`) and [[STORY-005-08]] (`lint.stale_after_days`, the precedent for a configurable threshold). No duplicates found (cleargate-wiki-query, 2026-10-18).

## Why not simpler?

- **Smallest existing surface that could carry this:** `formatSize` (`src/ingest/report.ts:32`) for display and the SCHEMA's `integer` leaf (`src/core/config.ts:106`) for limits.
- **Why isn't extension / parameterization / config sufficient?** Bytes say little about tokens: SPIKE-003 found byte-based and ASCII÷4 rules off by −53% to +109%, and Georgian takes three bytes a letter. An `integer` leaf would refuse `20k`, which EPIC-007 asks for. Five later stories call the estimate, the level and the wiki measure, so they live in one module instead of in each command. Everything else extends what exists: one SCHEMA group, one leaf type, one pair check, one seed text.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/core/tokens.ts` is planned by EPIC-007 §4 and the decomposition brief; the new test files are this story's.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1: the human approved every §1.4 recommendation on 2026-10-18 (`plans/gate1-decisions.md`).
