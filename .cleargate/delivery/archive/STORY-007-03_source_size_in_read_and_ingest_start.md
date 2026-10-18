---
story_id: STORY-007-03
parent_epic_ref: EPIC-007
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-007 (approved 2026-10-18) §2 (`read`, `ingest start`), §4 Data Changes, §5 · SPIKE-003 (Completed 2026-10-18) §4 round 5 and §5 (about 1,600 tokens per page with no text layer) · SPRINT-04 decomposition brief (2026-10-18) contracts K1, K2, K4, K5 · verified at 6b75807: src/read/index.ts, src/read/pdf.ts, src/commands/read.ts, src/commands/ingest-start.ts, src/ingest/permissions.ts, src/ingest/registry.ts, src/ingest/report.ts, src/core/config.ts, src/core/paths.ts, test/read/read.red.node.test.ts, test/ingest/ingest-start.red.node.test.ts, test/ingest/ingest-follow-ups.red.node.test.ts, test/e2e/read.test.ts, test/fixtures/read/make-fixtures.ts · read timings and page counts measured read-only on public files (macOS License.pdf and License.html, arXiv 1706.03762, a 77-page product manual, a synthetic DOCX test corpus) and on the read fixtures"
actor: AI coding agent
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-007-01
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T07:56:00Z
updated_at: 2026-10-18T07:56:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T08:02:16Z
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
  last_stamp: 2026-10-18T12:23:56Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-18T07:42:06Z
---

# STORY-007-03: Document size in `read` and the size approval at `ingest start`
**Complexity:** L3 — six source files across `read` and `ingest start`: the estimate in `ReadResult` and the `read` message (K4), a new `src/ingest/source-size.ts` and a size check next to `evaluatePermission` (K5), the approval in `ingest start`, and two red assertions to re-scope. Consumes K1 (`estimateTokens`, `levelOf`, `formatTokens`, `formatLimit`, `levelMark`, `PDF_TOKENS_PER_PAGE`) and K2 (`config.tokens.source`) from STORY-007-01; until it merges, build against the frozen signatures.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent working for a user, I want `read` and `ingest start` to report a document's estimated size in tokens, and `ingest start` to stop for approval when the document reaches the limit, so that the user sees the size and decides before a large document is read into the session.

### 1.2 Detailed Requirements
- **R1 — `ReadResult.tokens` (K4).** `readSource` (`src/read/index.ts:117`) returns `tokens: estimateTokens(markdown)` and `tokens_rough: false` for every format. One exception (§1.4 Q1): a PDF whose result carries the `likely_scanned` warning (STORY-003-11: fewer than 25 letters on at least half the pages, `src/read/pdf.ts:205`) gets `tokens: pages × PDF_TOKENS_PER_PAGE` and `tokens_rough: true`, where `pages` is the PDF's page count. `Converted` (`src/read/index.ts:29`) gains `pages?: number`, which `readPdf` sets; the other converters leave it out. `tokens_rough` is additive to K4.
- **R2 — `read` output (K4).** `ReadCommandData` (`src/commands/read.ts:19`) gains `level: levelOf(tokens, config.tokens.source)`. The config is the one `loadConfig` reads at the repository root found from the working directory. With no `config.yml`, or one that cannot be read, the limits are `DEFAULT_CONFIG.tokens.source`, as `checkOut` already falls back for `content_dir` (`src/commands/read.ts:53`). The `--out` message (`src/commands/read.ts:99`) becomes `wrote <out> (<estimate> · <size> · <format>)`: `<estimate>` is `describeTokens` (R3), `<size>` is `formatSize` (`src/ingest/report.ts:32`) of the bytes written, e.g. `wrote out.md (≈4.6k tokens 🟡 · 18.4 KB · pdf)`. Without `--out`, stdout stays exactly the markdown and nothing new goes to stderr; the estimate is then only in `--json`.
- **R3 — Counting a source (K5).** New `src/ingest/source-size.ts`:
  - `sourceTokens({ text, originalPath, format })`. With text (`--text-file`, or stdin): `{ tokens: estimateTokens(text), rough: false }`. Otherwise, for an original whose `format` is not null: `readSource(originalPath)`, giving `{ tokens: r.tokens, rough: r.tokens_rough }`. That is the decoded text of a markdown, text, CSV or TSV file, `read`'s extraction for HTML, DOCX and PDF, and R1's page estimate for a likely-scanned PDF.
  - It returns `null` (not counted, §1.4 Q2) when there is no text and `format` is null (`.pptx`, `.png`, a file with no extension: formats `read` refuses), and when `readSource` throws a `WikeeperError` (`conversion_failed` for a broken PDF or DOCX, `unsupported`). Any other error propagates. `read`'s own warnings (`likely_scanned`, a DOCX's unconverted images) are not passed on to `ingest start`.
  - `describeTokens(tokens, level, rough)`: `≈1.8k tokens 🟡`, built from `formatTokens` and `levelMark` (K1); a rough count reads `rough ≈4.8k tokens 🟡`.
- **R4 — The size check (K5).** `src/ingest/permissions.ts` gains the pure `checkSourceSize(counted, limits)`, returning `SizeCheck { tokens, rough, level, limit, confirm_at, reached }`:
  - `level` is `levelOf(tokens, limits)`; `limit` is `limits[confirm_at]`, or `null` when `confirm_at` is `never`.
  - `reached` is true when `confirm_at` is `yellow` and the level is yellow or red, or `confirm_at` is `red` and the level is red; it is never true for `never`. A rough count is checked like an exact one.
  - `sizeLimitText(check)` returns `at or above the approval limit tokens.source.<confirm_at> (<formatLimit(limit)>)`, e.g. `tokens.source.yellow (20k)`, with K1's `formatLimit` (plan confirmation, 2026-10-18). `SizeCheck.limit` and `details.size.limit` stay numbers (`20000`).
  - `evaluatePermission` and `PermissionResult` are unchanged (contract C2).
- **R5 — When `ingest start` counts and asks (K5).** In step 6 (`src/commands/ingest-start.ts:243`), after duplicate detection and the permission decision:
  - A duplicate without `--reingest` returns at step 5 as today (`src/commands/ingest-start.ts:216`): it is not counted and never asked about size. With `--reingest` it is counted and checked like a new source.
  - A source the whitelist denies exits 4 `denied` as today, also with `--approved`. It is not counted, and its details are unchanged.
  - Every other source is counted with `sourceTokens` and checked with `checkSourceSize(…, config.tokens.source)`. It needs approval when the permission decision is `needs_approval`, or when the size check is `reached` and `--approved` was not passed. Then `ingest start` exits 3 `needs_approval` and writes nothing.
  - `--approved` clears both causes with one rerun: in `ask` mode it allows the permission (`src/ingest/permissions.ts:105`), and in every mode it skips the size check. A source that is not counted (R3 `null`) gets no size check.
- **R6 — The approval request (K5).**
  - `details` keeps `source`, `reason` and `matched` and gains `cause: "permission" | "size" | "both"` and `size: { tokens, rough, level, limit, confirm_at } | null` (null when not counted).
  - The message keeps STORY-003-12's form `<origin> needs approval (<sizes>, <kind part>): <reason>`. `<sizes>` is `<describeTokens> · <formatSize(bytes)>`, or `formatSize(bytes)` alone when not counted (today's text).
  - `<reason>`, which is also `details.reason`: for `permission`, the permission's reason as today; for `size`, `it is <sizeLimitText>: show the user the estimate and rerun with --approved once they agree.`; for `both`, the permission's reason followed by ` It is also <sizeLimitText>.`
  - EPIC-007 §4 calls the new field `reason: "size"`. It is `cause` here, because `details.reason` already carries the permission's text (STORY-003-04).
- **R7 — The registered result.** `IngestStartResult.source` (`src/commands/ingest-start.ts:65`) is the `SourceMeta` plus `tokens: number | null`, `tokens_rough: boolean` and `level: TokenLevel | null` (`level` is additive to K5; EPIC-007 §4 names it). They are not written to `raw/<id>.meta.json`. The first message line becomes `registered <id> from <origin> (<describeTokens> · <formatSize(size)>)`, or `registered <id> from <origin> (<formatSize(size)>, not counted in tokens)`. A source that is not counted adds no warning, so STORY-003-04's S1a row (a 4-byte `.pdf`, warnings `[]`, `test/ingest/ingest-start.red.node.test.ts:79`) stays green unchanged.

### 1.3 Out of Scope
- Estimates in `ingest plan` (STORY-007-04, which reuses `sourceTokens`, `checkSourceSize`, `sizeLimitText` and `describeTokens`).
- Instruction text: showing the estimate when asking, asking before the agent reads a likely-scanned PDF itself, offering the extractor sub-agent for a red source (STORY-007-07).
- Keeping the count in `raw/<id>.meta.json`, `status` or the `ingest finish` report (STORY-007-05 measures pages, not sources).
- A new time or byte limit on the extraction `ingest start` runs (§3.2, §1.5).
- What the agent reads by itself: images, or the pages of a PDF it opens.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1, contract K4 vs code):** K4 defines `ReadResult.tokens` as `estimateTokens(markdown)`. For a likely-scanned PDF that is the near-empty markdown `read` wrote: the 3-page image-only fixture (`makeScannedPdf`, `test/fixtures/read/make-fixtures.ts:295`) estimates at 23 tokens 🟢. The agent then reads the PDF itself, which costs about 1,600 tokens a page (SPIKE-003 round 5), so the user would see 🟢 before a 32k-token read of a 20-page scan. K5 already needs the page count for the same PDF at `ingest start`, and `readPdf` does not expose it today.
- **Recommended:** For a PDF with the `likely_scanned` warning, `tokens` is pages × 1,600 and the new `tokens_rough` is `true` (R1). `read` and `ingest start` then report the same number. The alternative is K4 as written: the markdown's estimate, with `sourceTokens` getting the page count some other way.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2, contract K5 vs code):** K5 returns `{ tokens: number; rough: boolean }`. But `ingest start` accepts any regular file (`src/commands/ingest-start.ts:155`), and `read` converts only five formats (`src/read/index.ts:46`). A `.pptx`, an image or a file with no extension cannot be counted, and neither can a broken PDF: `read` fails with `conversion_failed`, and STORY-003-04's S1a row registers a 4-byte `.pdf` with no warning.
- **Recommended:** `sourceTokens` returns `null` for these. `ingest start` registers them as today, with no size check and no warning; `source.tokens` and `details.size` are `null`, and the message says "not counted in tokens" (R3, R5, R7). The alternatives are refusing such files (a regression: `ingest start` registers them today) or counting them as 0 (a false 🟢).
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q3, red tests):** Two red assertions pin output this story changes. (a) `test/read/read.red.node.test.ts:195` pins `wrote page.md (<n> bytes, html)`; K4 replaces that message, so this re-scope cannot be avoided. (b) `test/ingest/ingest-follow-ups.red.node.test.ts:234` pins the `ask`-mode approval line `notes.md needs approval (6 B, <kind part>): …`. It changes only if the estimate also appears when the permission alone asks. A red test changes only with the human's authorisation.
- **Recommended:** QA-Red re-scopes both by test name on the merged tree (§3.1), only by inserting the estimate. In `ask` mode the user is asked about every source, and seeing its size then is what EPIC-007 asks for. The alternative for (b) is to keep today's text when `cause` is `permission`, with the estimate in `details.size` only.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Plan confirmation (human, 2026-10-18):**
  - P6: `sizeLimitText` prints the limit with K1's `formatLimit` (`tokens.source.yellow (20k)`; R4, §2.1 scenario 5, §2.2, §3.3); `details.size.limit` stays a number. `formatLimit` is in `src/core/tokens.ts` (STORY-007-01), so this story still needs only STORY-007-01.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** An original passed without `--text-file` is counted by running `read`'s converter inside `ingest start`. Measured on public files, that took 140–400 ms for 0.1–2.7 MB PDFs (15–77 pages), 170 ms for a DOCX and 260 ms for a 95 KB HTML page, library loading included. No timeout or byte limit applies to local files (§3.2).
- **Mitigation:** WIKI.md sends PDF, DOCX and HTML through `read` first and passes `--text-file` (`templates/system/WIKI.md:22`, `:23`), so the usual `ingest start` counts text in memory. The extraction cost is the cost `wikeeper read` already has on the same file. The cost is stated here and in §3.2; no new limit is added.
- **Risk:** A source that is not counted (Q2) skips the size check, so a big `.pptx` or a broken PDF registers without a size approval.
- **Mitigation:** `read` refuses those formats, and WIKI.md's `unsupported` and `conversion_failed` rows (`templates/system/WIKI.md:37`, `:41`) send the agent to a convertible version, or to its own reading passed with `--text-file`, which is counted.
- **Risk:** For a likely-scanned PDF the agent reads the PDF itself and then passes its text with `--text-file`, so `ingest start` asks only after the reading.
- **Mitigation:** R1 gives `read` the page estimate, so the instructions can have the agent ask before it reads the PDF. That instruction is STORY-007-07 §1.4 Q7 (the `likely_scanned` row of WIKI.md "Register"), open at Gate 1.
- **Risk:** Expected numbers depend on STORY-007-01's estimator.
- **Mitigation:** Tests compute expected counts with `estimateTokens` and expected text with `describeTokens`. The only fixed numbers are page estimates (3 × 1,600) and byte sizes.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A source registers directly, on an `--approved` rerun, or returns as a duplicate without being counted. |
| Interfaces | T | `read --out` and `ingest start`, each in human and `--json` output. |
| Data | T | Text, stdin, markdown, CSV, DOCX, text and scanned PDFs, formats `read` refuses, a broken PDF. |
| Rules | T | Approval at `confirm_at` in every permission mode; `--approved` clears both causes; a denied source stays denied; duplicates are not counted. |

In every scenario "word" × 1,000 means the word `word` written 1,000 times with single spaces between: 4,999 bytes, estimated at about 1.8k tokens. Expected counts are computed with `estimateTokens` (K1), and expected estimate text with `describeTokens`.

```gherkin
Feature: Document size in read and the size approval at ingest start

  @interfaces @data
  Scenario Outline: read reports the estimate and the level
    Given <config>
    And the file "<file>" built as <built>
    When I run "wikeeper read <file> --out out.md --json"
    Then data.tokens is <tokens>, data.tokens_rough is <rough> and data.level is "<level>"
    And "wikeeper read <file> --out out2.md" prints "wrote out2.md (<estimate> · <size of out2.md> · <format>)"
    And "wikeeper read <file>" prints exactly data.markdown and a newline on stdout

    Examples:
      | config                                                  | file       | built                                                   | tokens                         | rough | level  | estimate                        | format   |
      | a wiki whose config.yml sets tokens.source 4k / 10k     | notes.md   | "word" × 1,000                                          | estimateTokens(data.markdown)  | false | green  | ≈1.8k tokens 🟢                 | markdown |
      | a wiki whose config.yml sets tokens.source 4k / 10k     | report.pdf | makeReportPdf(), 2 pages with text                      | estimateTokens(data.markdown)  | false | green  | describeTokens of that count    | pdf      |
      | a wiki whose config.yml sets tokens.source 4k / 10k     | scan.pdf   | makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] }) | 4800                           | true  | yellow | rough ≈4.8k tokens 🟡           | pdf      |
      | a folder with no wiki and no git repository             | scan.pdf   | makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] }) | 4800                           | true  | green  | rough ≈4.8k tokens 🟢           | pdf      |

  @rules @paths
  Scenario Outline: ingest start asks at confirm_at in every permission mode
    Given an initialised wiki with kb_instructions.md, ingest.permission <mode> and the whitelist origin "docs/**"
    And config.yml sets tokens.source to yellow 1k, red 3k and confirm_at <confirm_at>
    And "<file>" holds "word" × 1,000 (yellow)
    When I run "wikeeper ingest start <file> --json" <approval>
    Then the exit code is <exit> and <outcome>
    And when the exit code is 3 or 4, .wiki/raw/ holds no source file

    Examples:
      | mode      | confirm_at | file            | approval              | exit | outcome                                                                          |
      | ai        | yellow     | docs/notes.txt  | without --approved    | 3    | error.code is "needs_approval" and error.details.cause is "size"                 |
      | ai        | yellow     | docs/notes.txt  | with --approved       | 0    | data.status is "registered" and data.source.level is "yellow"                    |
      | ai        | red        | docs/notes.txt  | without --approved    | 0    | data.status is "registered"                                                      |
      | ai        | never      | docs/notes.txt  | without --approved    | 0    | data.status is "registered" and data.source.tokens is the estimate               |
      | whitelist | yellow     | docs/notes.txt  | without --approved    | 3    | error.details.cause is "size" and error.details.matched.entry is "docs/**"       |
      | whitelist | yellow     | other/notes.txt | with --approved       | 4    | error.code is "denied" and error.details has neither "size" nor "cause"          |
      | ask       | yellow     | docs/notes.txt  | without --approved    | 3    | error.details.cause is "both"                                                    |
      | ask       | never      | docs/notes.txt  | without --approved    | 3    | error.details.cause is "permission" and error.details.size.level is "yellow"     |
      | ask       | yellow     | docs/notes.txt  | with --approved       | 0    | data.status is "registered"                                                      |

  @data
  Scenario Outline: What ingest start counts
    Given an initialised wiki with kb_instructions.md, ingest.permission ai and the default limits
    And <setup>
    When I run "wikeeper ingest start <args> --json"
    Then the exit code is 0 and json.warnings is []
    And data.source.tokens is <tokens>, data.source.tokens_rough is <rough> and data.source.level is <level>
    And "wikeeper ingest start <args> --reingest" prints a first line ending in "<ending>"

    Examples:
      | args                                            | setup                                                                     | tokens                              | rough | level   | ending                                   |
      | https://acme.example.com/q4 --text-file page.md | page.md holds "word" × 1,000                                              | estimateTokens of page.md           | false | "green" | (≈1.8k tokens 🟢 · 4.9 KB)               |
      | - --title vendor-decision                       | stdin is "We decided to drop vendor X"                                    | estimateTokens of the stdin text    | false | "green" | (<describeTokens of the count> · 27 B)   |
      | docs/table.csv                                  | docs/table.csv is a copy of test/fixtures/read/table.csv (74 bytes)       | readSource(docs/table.csv).tokens   | false | "green" | (<describeTokens of the count> · 74 B)   |
      | docs/report.docx                                | docs/report.docx is makeReportDocx() (6,512 bytes)                        | readSource(docs/report.docx).tokens | false | "green" | (<describeTokens of the count> · 6.4 KB) |
      | docs/scan.pdf                                   | docs/scan.pdf is makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] })  | 4800                                | true  | "green" | (rough ≈4.8k tokens 🟢 · 2.4 KB)         |
      | docs/deck.pptx                                  | docs/deck.pptx holds the bytes 1, 2, 3, 4                                 | null                                | false | null    | (4 B, not counted in tokens)             |
      | docs/q4.pdf                                     | docs/q4.pdf holds the bytes 1, 2, 3, 4                                    | null                                | false | null    | (4 B, not counted in tokens)             |

  @rules @paths
  Scenario: A duplicate is not counted; a re-ingest is counted and asks again
    Given an initialised wiki with ingest.permission ai and tokens.source yellow 1k, red 3k, confirm_at yellow
    And "docs/notes.txt" holds "word" × 1,000 and is registered with --approved
    When I run "wikeeper ingest start docs/notes.txt --json"
    Then the exit code is 0, data.status is "duplicate" and data.source is null
    When I run "wikeeper ingest start docs/notes.txt --reingest --json"
    Then the exit code is 3 and error.details.cause is "size"
    When I run "wikeeper ingest start docs/notes.txt --reingest --approved --json"
    Then the exit code is 0 and data.source.reingest_of is the first registration's id

  @interfaces
  Scenario Outline: The approval request names the estimate, the level and the limit
    Given an initialised wiki with ingest.permission <mode> and tokens.source yellow 1k, red 3k, confirm_at yellow
    And "<file>" holds <text>
    When I run "wikeeper ingest start <file>"
    Then the exit code is 3 and stderr is exactly one line, not starting with "error:": "<line>"
    When I run "wikeeper ingest start <file> --json"
    Then error.details.cause is "<cause>" and error.details.size is { tokens: the estimate, rough: false, level: "<level>", limit: 1000, confirm_at: "yellow" }
    And error.details.reason is the part of "<line>" after the first "): "

    Examples:
      | mode | file      | text            | cause      | level  | line                                                                                                                                                                                                   |
      | ai   | notes.txt | "word" × 1,000  | size       | yellow | notes.txt needs approval (≈1.8k tokens 🟡 · 4.9 KB, no kind yet): it is at or above the approval limit tokens.source.yellow (1k): show the user the estimate and rerun with --approved once they agree. |
      | ask  | notes.txt | "word" × 1,000  | both       | yellow | notes.txt needs approval (≈1.8k tokens 🟡 · 4.9 KB, no kind yet): ingest.permission is ask: show the user the source "notes.txt" and rerun with --approved once they agree. It is also at or above the approval limit tokens.source.yellow (1k). |
      | ask  | small.md  | "hello\n"       | permission | green  | small.md needs approval (≈2 tokens 🟢 · 6 B, no kind yet): ingest.permission is ask: show the user the source "small.md" and rerun with --approved once they agree.                                    |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repository (`git init`, `wikeeper init --yes --agents claude`, `ingest.permission: ai`), copy the macOS `/Library/Documentation/License.lpdf/Contents/Resources/English.lproj/License.pdf` (16 pages of text) in, and run `wikeeper read License.pdf --out /tmp/wk-license.md`. The message shows about ≈28k tokens 🟡; `--json` has `tokens_rough: false`.
- [ ] `wikeeper ingest start License.pdf --text-file /tmp/wk-license.md` exits 3 and names `tokens.source.yellow (20k)`; the rerun with `--approved` registers it, and its first line shows the same estimate.
- [ ] `wikeeper config set tokens.source.confirm_at never` (STORY-007-02), then the same `ingest start` on a copy of the PDF registers without `--approved`.
- [ ] A 3-page scanned PDF from `makeScannedPdf` gives `rough ≈4.8k tokens` in `read` and in `ingest start` without `--text-file`.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/commands/ingest-start.ts` |
| Related Files | `src/ingest/permissions.ts`, `src/read/index.ts`, `src/read/pdf.ts`, `src/commands/read.ts` |
| Related Files (new) | `src/ingest/source-size.ts` |
| Test Files | `test/ingest/permissions.test.ts` |
| Test Files (new) | `test/ingest/source-size.test.ts`, `test/ingest/source-size.red.node.test.ts`, `test/read/read-tokens.red.node.test.ts` |
| Re-scoped red tests (QA-Red) | `test/read/read.red.node.test.ts`, `test/ingest/ingest-follow-ups.red.node.test.ts` |
| New Files Needed | `src/ingest/source-size.ts`, `test/ingest/source-size.test.ts`, `test/ingest/source-size.red.node.test.ts`, `test/read/read-tokens.red.node.test.ts` |

- **Notes on the files above:**
  - `src/read/pdf.ts` is not in the decomposition brief's list for this story. It changes by one field: `readPdf` returns `pages: pages.length` (R1, §1.4 Q1).
  - Test files: `test/read/read-tokens.red.node.test.ts` (the first scenario) and `test/ingest/source-size.red.node.test.ts` (the other four) are QA-Red's.
- **Read, not edited (consumed, unchanged):** `src/core/tokens.ts` (K1, STORY-007-01), `src/core/config.ts` (K2, `loadConfig`, `DEFAULT_CONFIG`), `src/ingest/report.ts` (`formatSize`), `src/ingest/registry.ts` (`hashSource`, `findDuplicate`, `SourceMeta`), `test/fixtures/read/make-fixtures.ts` (`makeReportPdf`, `makeScannedPdf`, `makeReportDocx`).

Re-scoped red-test assertions (lines at 6b75807, a guide only; QA-Red edits by test name on the merged tree, only by inserting the estimate, §1.4 Q3):
- `test/read/read.red.node.test.ts`, "stdout, --out, --json, the /app warning and ingest start --text-file" (`:195`): `wrote page.md (${bytes.length} bytes, html)` becomes `wrote page.md (${describeTokens(…)} · ${formatSize(bytes.length)} · html)`, with the count taken from `estimateTokens` of the written markdown and the level under default limits.
- `test/ingest/ingest-follow-ups.red.node.test.ts`, "STORY-003-12 S3 approval request is a question" (`:234`): `(6 B, ${named})` becomes `(${describeTokens(…)} · 6 B, ${named})` for the text `hello` under default limits. The rest of the line, the exit code and the JSON assertions stay. STORY-008-02 re-scopes a different test in the same file ("deleted page: accepted and reported", `:172`); each QA-Red edits only its own test by name, so the two re-scopes apply in either merge order (consistency audit, 2026-10-18).

### 3.2 Technical Logic
- **`ingest start` order** (`src/commands/ingest-start.ts`):
  1. Steps 1–5 are unchanged: resolve the source, kind, kb_instructions.md, hash, and the duplicate return.
  2. `evaluatePermission` (`:243`). `denied` → throw exit 4 with today's details, before any count.
  3. `format`: for a file origin without `--text-file`, `formatFromExtension(path.extname(abs))` (`src/read/index.ts:71`); otherwise `null`.
  4. `counted = await sourceTokens({ text: resolved.text, originalPath: resolved.originalPath, format })`; `size = counted === null ? null : checkSourceSize(counted, config.tokens.source)`.
  5. `permAsks = perm.decision === "needs_approval"`; `sizeAsks = size !== null && size.reached && opts.approved !== true`. Either → throw exit 3 with `cause` and the R6 message.
  6. Register as today; the result's `source` is `{ ...meta, tokens, tokens_rough, level }`.
- **Reading an original.** `sourceTokens` calls `readSource(originalPath, { cwd: path.dirname(originalPath) })` with the absolute path, so the URL branch never runs. It catches only `WikeeperError`; a bug still fails loudly.
- **Cost and limits.** Counting text from `--text-file` or stdin is an in-memory loop (SPIKE-003 §5: about 10.8M characters a second). Counting an original without `--text-file` runs `read`'s converter in the same process, at the cost `wikeeper read` has on that file (§1.5). `readSource` applies `DEFAULT_TIMEOUT_MS` (20 s) and `DEFAULT_MAX_BYTES` (10 MB) only to URL fetches (`src/read/index.ts:134`); local files have neither. `ingest start` never fetches, because a URL needs `--text-file` (`:141`). Stdin is capped at 10 MB (`MAX_STDIN_BYTES`, `:33`), and `--text-file` has no cap today. This story adds no limit.
- **Lazy loading.** `source-size.ts` imports `readSource` statically. The converters stay dynamic imports (`src/read/index.ts:81`, `:85`; `src/read/html.ts:43`), so `ingest --help` still loads no linkedom, defuddle or turndown (`test/e2e/read.test.ts:30`). An `ingest start` of a PDF original now loads unpdf.
- **`read` limits.** Load the config once per run: `findRepoRoot(ctx.cwd)`, then `loadConfig` inside `try`, falling back to `DEFAULT_CONFIG`. `checkOut` then reuses the same result for `content_dir`.
- **Scanned estimate.** In `readSource`, after conversion: `rough = format === "pdf" && converted.warnings.some((w) => w.code === "likely_scanned")`; `tokens = rough ? (converted.pages ?? 0) * PDF_TOKENS_PER_PAGE : estimateTokens(markdown)`.
- **Fixtures.** Limits go into `config.yml` as `tokens: { source: { yellow: 1k, red: 3k, confirm_at: … } }` (K2 accepts `1k`). PDFs and DOCX come from `test/fixtures/read/make-fixtures.ts`; no binary file is committed. Copy the `run` helper of `test/ingest/ingest-start.red.node.test.ts:40` (in-process `runCli`, injected `now`), and take ids from `data.id` (FLASHCARD 2026-10-17 `#test-harness #ingest`).

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper read <source>` | CLI | None | `--out <file>`, `--json` | `ReadCommandData` with `tokens`, `tokens_rough`, `level` |
| `wikeeper ingest start <source>` | CLI | None | `--approved`, `--text-file`, `--reingest`, `--json` | `IngestStartResult` (registered: `source.tokens`, `source.tokens_rough`, `source.level`); exit 3 details with `cause`, `size` |

```ts
// src/read/index.ts (K4)
export interface ReadResult {
  markdown: string; title: string | null; author: string | null; date: string | null;
  format: ReadFormat; warnings: ReadWarning[];
  tokens: number;        // K4: estimateTokens(markdown); a likely-scanned PDF: pages × PDF_TOKENS_PER_PAGE (§1.4 Q1)
  tokens_rough: boolean; // additive to K4: true only for that page estimate
}
export interface Converted { body: string; title: string | null; author: string | null; date: string | null; warnings: ReadWarning[]; pages?: number }

// src/commands/read.ts (K4)
export interface ReadCommandData extends ReadResult { level: TokenLevel; out?: string }

// src/ingest/source-size.ts (new, K5)
export function sourceTokens(input: { text: string | null; originalPath: string | null; format: ReadFormat | null }):
  Promise<{ tokens: number; rough: boolean } | null>; // null: not counted (§1.4 Q2)
export function describeTokens(tokens: number, level: TokenLevel, rough: boolean): string; // "≈1.8k tokens 🟡", "rough ≈4.8k tokens 🟡"

// src/ingest/permissions.ts (K5; C2 exports unchanged)
export type SourceLimits = WikeeperConfig["tokens"]["source"]; // TokenLimits & { confirm_at: "yellow" | "red" | "never" }
export interface SizeCheck {
  tokens: number; rough: boolean; level: TokenLevel;
  limit: number | null; // limits[confirm_at]; null for "never"
  confirm_at: SourceLimits["confirm_at"];
  reached: boolean;
}
export function checkSourceSize(counted: { tokens: number; rough: boolean }, limits: SourceLimits): SizeCheck;
export function sizeLimitText(check: SizeCheck): string; // "at or above the approval limit tokens.source.yellow (20k)", the limit via formatLimit (K1)

// src/commands/ingest-start.ts (K5)
export interface IngestStartResult {
  // … other fields unchanged
  source: (SourceMeta & { tokens: number | null; tokens_rough: boolean; level: TokenLevel | null }) | null;
}
// exit 3 needs_approval details:
// { source: { origin, origin_type, size, sha256, kind, rule }, reason: string, matched: WhitelistMatch | null,
//   cause: "permission" | "size" | "both",
//   size: { tokens: number; rough: boolean; level: TokenLevel; limit: number | null; confirm_at: SourceLimits["confirm_at"] } | null }
```

Consumed (frozen, K1/K2): `estimateTokens`, `levelOf`, `formatTokens`, `formatLimit`, `levelMark`, `PDF_TOKENS_PER_PAGE = 1600`, `TokenLevel`, `TokenLimits`, `WikeeperConfig.tokens.source` with defaults 20000 / 60000 / `yellow`.

## Task Breakdown

- [ ] Add `pages` to `Converted` and set it in `readPdf`; return `tokens` and `tokens_rough` from `readSource` -> R1
- [ ] `read`: load the source limits once, add `level` to `ReadCommandData`, write the new `--out` message -> R2
- [ ] Create `src/ingest/source-size.ts` with `sourceTokens` and `describeTokens` -> R3
- [ ] Add `checkSourceSize`, `sizeLimitText`, `SizeCheck` and `SourceLimits` to `src/ingest/permissions.ts` -> R4
- [ ] `ingest start`: count and check after the permission decision; exit 3 with `cause`, `size` and the message; the registered result fields and first line -> R5, R6, R7
- [ ] QA-Red: re-scope the two §3.1 red assertions on the merged tree, only by inserting the estimate -> R2, R6
- [ ] Write the §4.1 unit tests in `test/ingest/source-size.test.ts` and `test/ingest/permissions.test.ts` -> R1, R3, R4

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 9 | `sourceTokens`: text, markdown original, DOCX original, likely-scanned PDF (rough), format null → null, `conversion_failed` → null, a non-`WikeeperError` propagates; `readSource` sets `tokens_rough` only for a likely-scanned PDF and `readPdf` sets `pages`; `checkSourceSize` over 3 levels × 3 `confirm_at` values with `limit` null for `never`; `sizeLimitText`; `describeTokens` with and without rough |
| Integration tests | 0 | Temp directories and in-process fixtures only; no network, no external service. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`, in QA-Red's two red files. Error rows assert `error.code` and `json.command`, not only the exit code. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The two §3.1 red assertions re-scoped by QA-Red, not the Developer; every other red file green without an edit, including STORY-003-04 S1a (`test/ingest/ingest-start.red.node.test.ts:66`).
- [ ] `test/e2e/read.test.ts` and `test/e2e/read-documents.test.ts` pass: `ingest --help` loads no read library, and each converter loads only in its branch.
- [ ] No new runtime dependency in `package.json`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/read/index.ts:117` — `readSource`, which already converts every supported format and returns `ReadResult` (`src/read/index.ts:14`); `src/read/index.ts:71` — `formatFromExtension`, the format of an original.
- **Surface:** `src/read/pdf.ts:205` — the `likely_scanned` rule (STORY-003-11) this story reuses; `src/read/pdf.ts:181` — `readPdf`, which has the page count in hand.
- **Surface:** `src/commands/read.ts:99` — the `--out` message (bytes only today); `src/commands/read.ts:53` — the config fallback `read` already uses.
- **Surface:** `src/commands/ingest-start.ts:243` — `evaluatePermission` and the `needs_approval` (exit 3) and `denied` (exit 4) errors with source details; `src/commands/ingest-start.ts:216` — the duplicate return before any permission check.
- **Surface:** `src/ingest/permissions.ts:94` — `evaluatePermission`, the C2 decision the size check sits next to.
- **Surface:** `src/ingest/report.ts:32` — `formatSize`, the byte format used in the messages.
- **Coverage of this requirement:** partial. The gate, the error shape and the extraction exist; the count, the size check and the new fields are net-new.

## Prior work

- [[EPIC-007]] (parent, approved 2026-10-18) and [[SPIKE-003]] (the estimate and the 1,600-token page). Consumes [[STORY-007-01]] (K1, K2). Extends [[STORY-003-10]] (`read` and its `--out` message), [[STORY-003-11]] (`likely_scanned`, the PDF and DOCX converters), [[STORY-003-04]] (`ingest start`, its approval and denial errors), [[STORY-003-12]] (the one-line approval request) and [[STORY-003-02]] (C2 permissions); reads [[STORY-003-01]]'s `hashSource` and duplicate lookup. [[STORY-007-04]] reuses this story's helpers; [[STORY-007-07]] writes the instructions. Duplicate check (cleargate-wiki-query, 2026-10-18): nothing overlaps beyond [[EPIC-007]], [[EPIC-008]] and [[SPIKE-003]].

## Why not simpler?

- **Smallest existing surface that could carry this:** `evaluatePermission` (`src/ingest/permissions.ts:94`), extended with the token count in `PermissionRequest`.
- **Why isn't extension / parameterization / config sufficient?** `PermissionResult` is frozen (C2), and its fields are stored in `raw/<id>.meta.json` as the source's permission. The size is a second cause with its own details, and it needs the count, which costs an extraction that a denied source should not pay for. `ingest plan` (STORY-007-04) also needs the level without `--approved`. A pure `checkSourceSize` next to `evaluatePermission` keeps C2 unchanged and serves both commands. `sourceTokens` is a thin layer over `readSource`; no converter is duplicated.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/ingest/source-size.ts` is new, named by the decomposition brief; `src/read/pdf.ts` is added to the brief's list for one field, §3.1.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Status stays 🟡 until the human decides §1.4 Q1–Q3; each changes a frozen contract (K4, K5) or a red test.
