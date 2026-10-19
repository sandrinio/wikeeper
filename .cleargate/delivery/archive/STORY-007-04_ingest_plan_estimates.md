---
story_id: STORY-007-04
parent_epic_ref: EPIC-007
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-007 (approved 2026-10-18) §2 (`ingest plan`: extracts nothing, 1,600 tokens per PDF page, DOCX and HTML from size), §4 Data Changes · SPIKE-003 (Completed 2026-10-18) §4 round 5 and §5 · SPRINT-04 decomposition brief (2026-10-18) contracts K1, K2, K5, K6 · STORY-007-03 (Draft, 2026-10-18) R3, R4 and §1.4 Q2 · verified at 6b75807: src/ingest/plan.ts, src/commands/ingest-plan.ts, src/ingest/permissions.ts, src/ingest/registry.ts, src/read/index.ts, src/read/pdf.ts, test/ingest/ingest-plan.red.node.test.ts, test/ingest/ingest-plan.test.ts, test/fixtures/read/make-fixtures.ts · page counts, zip directories and bytes per token measured read-only on public and synthetic files (macOS License.pdf and License.html, arXiv 1706.03762 and a physics preprint, an IRS draft form, a 77-page product manual, seven DOCX (a synthetic test corpus, public templates, the python-docx template), five HTML pages) and on the read fixtures"
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-007-03
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T08:05:00Z
updated_at: 2026-10-18T08:05:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T08:05:43Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-007-04
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-18T08:07:05Z
  sessions: []
---

# STORY-007-04: Estimates in `ingest plan`
**Complexity:** L2 — two files (`src/ingest/plan.ts`, `src/commands/ingest-plan.ts`) and their tests: a per-format estimate (a PDF page count through unpdf, a DOCX zip-directory read, an HTML byte factor), the approval at `confirm_at`, the totals and the human lines, and one red assertion to re-scope. Consumes STORY-007-03's `sourceTokens`, `describeTokens`, `checkSourceSize` and `sizeLimitText` (K5) and K1/K2 from STORY-007-01.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent planning a folder for a user, I want `ingest plan` to show each new file's estimated size and the total, and to mark files at the approval limit as needing approval, without extracting any document, so that the user can approve the folder knowing its size and a folder of PDFs still plans in seconds.

### 1.2 Detailed Requirements
- **R1 — Entry fields (K6).** `PlanEntry` (`src/ingest/plan.ts:14`) gains `tokens: number | null`, `tokens_rough: boolean` and `level: TokenLevel | null` (`level` is additive to K6; it is `levelOf(tokens, config.tokens.source)`). Only `new` entries are estimated. Duplicate and denied entries are not ingested, so they carry `tokens: null`, `tokens_rough: false` and `level: null` (§1.4 Q2).
- **R2 — How each file is estimated.** The format comes from the file's extension through `formatFromExtension` (`src/read/index.ts:71`):
  - **Markdown, text, CSV, TSV** (`.md`, `.markdown`, `.txt`, `.csv`, `.tsv`): counted with `sourceTokens({ text: null, originalPath, format })` (K5, STORY-007-03), which is the count `ingest start` makes for that file. Not rough.
  - **PDF:** the page count × `PDF_TOKENS_PER_PAGE` (1,600), rough. The page count is `numPages` from unpdf's `getDocumentProxy`, opened with the options `readPdf` uses and closed with `loadingTask.destroy()` (`src/read/pdf.ts:185`, `:198`). No page is loaded and no text is read. A file pdf.js cannot open (broken, encrypted) is not estimated.
  - **DOCX:** the compressed size of `word/document.xml`, taken from the zip's central directory, ÷ `DOCX_BYTES_PER_TOKEN` (2), rounded, rough. Nothing is decompressed or parsed as XML (§1.4 Q1). A file with no readable central directory, or with no `word/document.xml`, is not estimated.
  - **HTML** (`.html`, `.htm`): the file's bytes ÷ `HTML_BYTES_PER_TOKEN` (3), rounded, rough. Under SPIKE-003's weights, bare text runs about 2.8 bytes per token in English, 3.8 in Georgian and 4.8 in Russian, and markup only adds bytes. On three text-heavy public pages `read`'s extraction ran 3.4–4.7 bytes per token, so 3 puts them at +12% to +56%: the estimate errs high, the safe side for an approval. Only a page of almost bare English text is under-counted, by about 7%.
  - **Any other format** (`.pptx`, `.png`, a file with no extension): not estimated, as `ingest start` does not count it either (STORY-007-03 R3).
- **R3 — The plan extracts nothing.** The plan never calls `readSource` for PDF, DOCX or HTML. It loads no PDF page, runs no text extraction, and loads none of mammoth, turndown, the GFM plugin, linkedom and defuddle. It imports unpdf only when the folder holds a PDF. It still stores nothing and runs no hook (contract C9).
- **R4 — Approval at `confirm_at` (K6).** For a new entry with an estimate, `checkSourceSize(estimate, config.tokens.source)` (K5). When it is `reached`, `needs_approval` is true and `reason` gains ` Its estimate is <sizeLimitText>.` A rough estimate counts like an exact one. An entry with no estimate is decided by the permission alone, as today; `ask` mode still marks every new file (`src/ingest/plan.ts:115`).
- **R5 — Totals (K6).** `totals` gains `tokens` (the sum of the new entries' estimates), `tokens_rough` (true when any summed estimate is rough) and `not_estimated` (the number of new entries with no estimate); the last two are additive to K6. `totals.needs_approval` also counts entries marked for size.
- **R6 — Human output** (`src/commands/ingest-plan.ts:19`, `:28`).
  - A new entry's line is `<path>: new · <describeTokens>`, or `<path>: new · not estimated`, with ` (needs approval)` after `new` as today.
  - Duplicate and denied lines, the `totals:` line, the `skipped:` line and the `next:` line are unchanged.
  - When there is at least one new file, a line follows `totals:`: `new files: ≈<n> tokens in total`, with `rough ` before `≈` when `totals.tokens_rough`, and `; <k> not estimated` at the end when `not_estimated` is above 0. `≈<n>` is `formatTokens(totals.tokens)`; the total has no level.
- **R7 — `ingest start` decides.** The plan's estimate is not passed on. `ingest start` counts each file itself (STORY-007-03 R5) and asks for approval when its own count reaches `confirm_at`, also when the plan's estimate stayed below it. Approving the plan still covers the files it marked: the agent passes `--approved` for them, as `next:` says today.

### 1.3 Out of Scope
- The count and the approval in `ingest start` (STORY-007-03).
- Instruction text on showing the plan's sizes and the second approval at `ingest start` (STORY-007-07).
- Estimating duplicate or denied entries, and files the plan skips.
- An exact count for PDF, DOCX or HTML in the plan: that would mean extracting them.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1, the DOCX estimate):** EPIC-007 says DOCX is "estimated from its size". The file's own size says little. Measured against the estimate of `read`'s extraction, six DOCX files with text ran 3.1 to 44 bytes per token, and an empty python-docx template is 38 KB with no text at all; embedded images add megabytes with no text. The compressed size of `word/document.xml` alone ran 1.6 to 4.0 bytes per token on the same six files. At 2 bytes per token the estimates were −21% to +100% of the extraction's estimate; a whole-file factor of 3 gave +1,370% on a 38 KB, 859-token document.
- **Recommended:** Use the compressed size of `word/document.xml` from the zip's central directory ÷ 2 (R2). It is still a size: nothing is decompressed or parsed. Reading the directory needs about 30 lines of code for the end-of-central-directory record and the entries; no dependency. The alternative is the whole file's size ÷ 3, as for HTML: literal, but it marks most DOCX with images as red.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2, contract K6 vs code):** K6 types `PlanEntry.tokens` as a number. The plan lists every regular file (`src/ingest/plan.ts:81`), including formats nobody can estimate (`.pptx`, images) and PDFs or DOCX files that cannot be opened. Duplicate and denied entries will not be ingested, and estimating them costs a PDF open each.
- **Recommended:** `tokens: number | null`. `null` means not estimated: a format `read` refuses, a file that cannot be opened, or a duplicate or denied entry (R1, R2). This follows STORY-007-03 §1.4 Q2, where `ingest start` does not count such a source either. `totals.not_estimated` counts the new ones, so the total never silently leaves files out.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q3, immutable red test; consistency audit 2026-10-18):** `test/ingest/ingest-plan.red.node.test.ts`, "S1: directory plan marks duplicates and denied files; stores nothing" (`:128`), pins `totals` with `toEqual`, so R5's new keys turn it red. A red test changes only with the human's authorisation. May this story's QA-Red re-scope it?
- **Recommended:** Yes, as §3.1 lists: `totals` gains `tokens` (the count of `docs/meetings/a.md`, from `estimateTokens`), `tokens_rough: false` and `not_estimated: 0`, by test name on the tree merged with STORY-007-03; nothing else in the file changes.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Plan confirmation (human, 2026-10-18):**
  - P6: the size reason prints the limit through STORY-007-03's `sizeLimitText`, now with K1's `formatLimit` (`tokens.source.yellow (1k).`; §2.1 scenario 2, row 1).

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** 1,600 tokens a page over-counts text PDFs. On five public text PDFs, the estimate of `read`'s extraction ran about 800–1,900 tokens a page (median about 1,030). A text PDF of 13 or more pages is marked for approval in the plan even when `ingest start`'s count lets it through.
- **Mitigation:** EPIC-007 accepted 1,600 (a text PDF measured about 1,000). Over-counting is the cheaper error: approving the plan covers the file, and nothing is asked twice.
- **Risk:** HTML over-counts pages that are mostly script. A saved 193 KB app page with about 116 tokens of text is estimated at ≈64k.
- **Mitigation:** It is marked rough. Such a page gets `needs_browser` from `read` anyway, and `ingest start` counts the text the agent passes.
- **Risk:** DOCX and HTML can under-count (−21% on a Georgian DOCX; digits weigh 0.62 tokens each, so digit-heavy text runs about 1.7 bytes per token), and then `ingest start` asks a second time.
- **Mitigation:** R7 and the last scenario make that second approval the defined behaviour, and STORY-007-07's instructions tell the agent about it.
- **Risk:** A folder of many large PDFs: pdf.js reads each file whole to count its pages.
- **Mitigation:** Measured at 1–46 ms a file on 0.1–2.7 MB PDFs (the first file includes about 45 ms of pdf.js loading), against 140–400 ms for `read`'s extraction of the same files.
- **Risk:** `test/ingest/ingest-plan.red.node.test.ts:128` pins `totals` with `toEqual`, so the new keys turn it red.
- **Mitigation:** QA-Red re-scopes that one assertion by adding the three keys (§3.1); the Developer updates the plain unit test at `test/ingest/ingest-plan.test.ts:43`.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | `ingest plan` has one way through: it walks the folder and plans each file; the variations are data and rules. |
| Interfaces | T | Human output and `--json` from the same command. |
| Data | T | Markdown, text PDF, scanned PDF, DOCX, HTML, a format nobody reads, a broken PDF, a DOCX with no main part. |
| Rules | T | Approval at `confirm_at` per permission mode; the plan extracts nothing; `ingest start`'s own count decides. |

"word" × 1,000 means the word `word` written 1,000 times with single spaces between (4,999 bytes, about 1.8k tokens). Expected exact counts are computed with `estimateTokens` (K1) and estimate text with `describeTokens` (K5).

```gherkin
Feature: Estimates in ingest plan

  @data
  Scenario Outline: Each new file gets an estimate by its format
    Given an initialised wiki with ingest.permission ai and the default limits
    And a folder "docs" holding only "<file>", built as <built>
    When I run "wikeeper ingest plan docs --json"
    Then the exit code is 0
    And the entry for docs/<file> has status "new", tokens <tokens>, tokens_rough <rough> and level <level>
    And "wikeeper ingest plan docs" prints the line "docs/<file>: new · <shown>"

    Examples:
      | file         | built                                                                 | tokens                                     | rough | level   | shown                   |
      | notes.md     | "word" × 1,000                                                        | the count ingest start makes for the file  | false | "green" | ≈1.8k tokens 🟢         |
      | report.pdf   | makeReportPdf(), 2 pages with text                                    | 3200                                       | true  | "green" | rough ≈3.2k tokens 🟢   |
      | scan.pdf     | makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] })               | 4800                                       | true  | "green" | rough ≈4.8k tokens 🟢   |
      | report.docx  | makeReportDocx(), whose word/document.xml is stored, 2,841 bytes      | 1421                                       | true  | "green" | rough ≈1.4k tokens 🟢   |
      | article.html | a copy of test/fixtures/read/article.html, 1,225 bytes                | 408                                        | true  | "green" | describeTokens(408, "green", true) |
      | deck.pptx    | the bytes 1, 2, 3, 4                                                  | null                                       | false | null    | not estimated           |
      | broken.pdf   | makeBrokenPdf()                                                       | null                                       | false | null    | not estimated           |
      | empty.docx   | makeNoDocumentDocx()                                                  | null                                       | false | null    | not estimated           |

  @rules
  Scenario Outline: Files at confirm_at need approval in the plan
    Given an initialised wiki with ingest.permission <mode> and the whitelist origin "docs/**"
    And config.yml sets tokens.source to yellow 1k, red 3k and confirm_at <confirm_at>
    And "docs" holds big.md ("word" × 1,000, yellow), scan.pdf (makeScannedPdf, 3 image-only pages: rough 4,800, red) and small.md ("hello")
    When I run "wikeeper ingest plan docs --json"
    Then needs_approval is <big> for docs/big.md, <scan> for docs/scan.pdf and <small> for docs/small.md
    And totals.needs_approval is <n>
    And the reason of docs/big.md contains "<reason>"

    Examples:
      | mode      | confirm_at | big   | scan  | small | n | reason                                                                       |
      | ai        | yellow     | true  | true  | false | 2 | Its estimate is at or above the approval limit tokens.source.yellow (1k).    |
      | ai        | red        | false | true  | false | 1 | ingest.permission is ai                                                      |
      | ai        | never      | false | false | false | 0 | ingest.permission is ai                                                      |
      | whitelist | yellow     | true  | true  | false | 2 | matches the whitelist entry "docs/**". Its estimate is at or above           |
      | ask       | never      | true  | true  | true  | 3 | ingest.permission is ask                                                     |

  @interfaces
  Scenario: The plan shows each estimate and the total
    Given an initialised wiki with ingest.permission ai and the default limits
    And "docs" holds a.md ("word" × 1,000), b.md (the same bytes), deck.pptx (4 bytes) and scan.pdf (makeScannedPdf, 3 image-only pages)
    When I run "wikeeper ingest plan docs --json"
    Then the entry for docs/b.md has status "duplicate", tokens null, tokens_rough false and level null
    And data.totals is { new: 3, duplicate: 1, denied: 0, needs_approval: 0, tokens: <a.md's count> + 4800, tokens_rough: true, not_estimated: 1 }
    When I run "wikeeper ingest plan docs"
    Then stdout starts with these lines:
      """
      docs/a.md: new · ≈1.8k tokens 🟢
      docs/b.md: duplicate of docs/a.md
      docs/deck.pptx: new · not estimated
      docs/scan.pdf: new · rough ≈4.8k tokens 🟢
      totals: 3 new (0 need approval), 1 duplicate, 0 denied
      new files: rough ≈6.6k tokens in total; 1 not estimated
      """

  @rules
  Scenario: The plan extracts nothing
    Given an initialised wiki with ingest.permission ai
    And "docs" holds report.pdf (makeReportPdf), report.docx (makeReportDocx) and article.html
    And the test records every PDF page load (getPage), every call of unpdf's extractTextItems, and every load of mammoth, turndown, @joplin/turndown-plugin-gfm, linkedom and defuddle
    When I run "wikeeper ingest plan docs --json"
    Then the exit code is 0 and every entry has a rough estimate
    And no PDF page was loaded, no text was extracted and none of those libraries was loaded
    And .wiki/raw/, .wiki/log/ and the pages are unchanged

  @rules
  Scenario: ingest start counts again and asks although the plan's estimate stayed below the limit
    Given an initialised wiki with ingest.permission ai and tokens.source yellow 1.5k, red 3k, confirm_at yellow
    And "docs/codes.html" is "<!doctype html><html><head><title>Codes</title></head><body><p>" + 300 numbers "1234567890" with single spaces between + "</p></body></html>", 3,380 bytes in all
    And "codes.md" holds the same 300 numbers, the text the agent passes
    When I run "wikeeper ingest plan docs --json"
    Then the entry for docs/codes.html has tokens 1127, level "green" and needs_approval false
    When I run "wikeeper ingest start docs/codes.html --text-file codes.md --json"
    Then the exit code is 3, error.details.cause is "size" and error.details.size.level is "yellow"
    And error.details.size.tokens is estimateTokens of codes.md's text, about 2.0k
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repository with `ingest.permission: ai`, copy a few public PDFs (e.g. macOS `/Library/Documentation/License.lpdf/Contents/Resources/English.lproj/License.pdf`, 16 pages), a DOCX and a saved HTML page into `docs/`, and run `wikeeper ingest plan docs`. Each line shows a rough estimate (License.pdf: rough ≈26k tokens 🟡, needs approval), the `new files:` line shows the total, and the run takes well under a second.
- [ ] Run `wikeeper ingest start docs/License.pdf` without `--text-file`: its count (≈28k, not rough) also asks for approval. With `--approved` it registers.
- [ ] `git status` in the scratch repository shows no change from the plan.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/ingest/plan.ts` |
| Related Files | `src/commands/ingest-plan.ts` |
| Test Files | `test/ingest/ingest-plan.test.ts` |
| Test Files (new) | `test/ingest/plan-estimates.test.ts`, `test/ingest/plan-estimates.red.node.test.ts` |
| Re-scoped red tests (QA-Red) | `test/ingest/ingest-plan.red.node.test.ts` |
| New Files Needed | `test/ingest/plan-estimates.test.ts`, `test/ingest/plan-estimates.red.node.test.ts` |

- **Notes on the files above:**
  - Test files: `test/ingest/plan-estimates.red.node.test.ts` is QA-Red's (the five scenarios). `test/ingest/ingest-plan.test.ts` changes only at `:43`, where `totals` gains `tokens: 0, tokens_rough: false, not_estimated: 0`.
- **Read, not edited (consumed, unchanged):** `src/ingest/source-size.ts` (`sourceTokens`, `describeTokens`, STORY-007-03), `src/ingest/permissions.ts` (`checkSourceSize`, `sizeLimitText`, `evaluatePermission`), `src/core/tokens.ts` (K1, STORY-007-01), `src/core/config.ts` (K2), `src/read/index.ts` (`formatFromExtension`, `ReadFormat`), `src/ingest/registry.ts` (`hashSource`), `test/fixtures/read/make-fixtures.ts`.

Re-scoped red-test assertion (line at 6b75807, a guide only; QA-Red edits by test name on the tree merged with STORY-007-03):
- `test/ingest/ingest-plan.red.node.test.ts`, "S1: directory plan marks duplicates and denied files; stores nothing" (`:128`): `totals` gains `tokens` (the count of `docs/meetings/a.md`, computed with `estimateTokens`), `tokens_rough: false` and `not_estimated: 0`. Nothing else in the file changes; S2's `new (needs approval)` substring still holds.

### 3.2 Technical Logic
- **Where.** `estimateFile(abs, format)` in `src/ingest/plan.ts`, called in the per-file loop only on the `new` branch (`src/ingest/plan.ts:118`), after `evaluatePermission` and the in-plan duplicate check. It returns `{ tokens, rough } | null`.
- **PDF page count.** `const { getDocumentProxy } = await import("unpdf")`, then `getDocumentProxy(new Uint8Array(await readFile(abs)), { verbosity: 0, useSystemFonts: false, disableFontFace: true })`, `numPages`, and `loadingTask.destroy()` in `finally`. Pass a fresh `Uint8Array` (FLASHCARD 2026-10-17 `#read #pdf`). Any throw → `null`. Counting raw `/Type /Page` markers is not used: on a public IRS form it found 43 for 22 pages, and three of five public PDFs keep their page tree in compressed object streams.
- **DOCX directory.** Read the file. Find the end-of-central-directory record (signature `0x06054b50`) in the last 65,557 bytes, scanning backwards. Read the entry count and directory offset, then walk the entries (signature `0x02014b50`; name length at +28, extra at +30, comment at +32, compressed size at +20, name at +46). Take the compressed size of the entry named exactly `word/document.xml`. A missing record, a bad signature, an offset outside the file, or no such entry → `null`. ZIP64 is out of reach for real DOCX and is not handled. The read fixtures store their parts uncompressed, so the fixture's estimate (1,421) is high; real Word files deflate.
- **HTML.** `Math.round(size / HTML_BYTES_PER_TOKEN)`, with `size` from `hashSource` (`src/ingest/plan.ts:93`); no extra read.
- **Constants.** `HTML_BYTES_PER_TOKEN = 3` and `DOCX_BYTES_PER_TOKEN = 2` are exported from `src/ingest/plan.ts`. The reasoning is in R2 and §1.4 Q1.
- **Approval.** `const size = estimate && checkSourceSize(estimate, config.tokens.source)`; `needs_approval = r.decision === "needs_approval" || size?.reached === true`; append the R4 sentence to `reason` when `size?.reached`.
- **Totals.** Computed in the existing loop (`src/ingest/plan.ts:130`).
- **Proving R3.** In the red and unit tests, `vi.mock("unpdf", …)` keeps the real `getDocumentProxy` but wraps the proxy's `getPage` and replaces `extractTextItems` with recorders. `vi.mock` factories for `mammoth`, `turndown`, `@joplin/turndown-plugin-gfm`, `linkedom` and `defuddle/node` record a load. Use literal specifiers (FLASHCARD 2026-10-17 `#qa #red-test`, the Vite dynamic-import note).
- **Fixtures.** Copy the `run`, `repo` and `wikiState` helpers of `test/ingest/ingest-plan.red.node.test.ts` (in-process `runCli`). Limits go into `config.yml` as `tokens: { source: { yellow: 1k, red: 3k, confirm_at: … } }`.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper ingest plan <dir>` | CLI | None | `--kind`, `--json` | `IngestPlan` with per-entry `tokens`, `tokens_rough`, `level` and `totals.tokens`, `totals.tokens_rough`, `totals.not_estimated` |

```ts
// src/ingest/plan.ts (K6; C9 exports otherwise unchanged)
export interface PlanEntry {
  path: string; size: number; sha256: string; status: PlanStatus;
  needs_approval: boolean;     // K6: also true when the estimate reaches tokens.source.confirm_at
  kind_pending: boolean; reason: string; prior: PlanPrior | null;
  tokens: number | null;       // K6; null = not estimated (§1.4 Q2)
  tokens_rough: boolean;       // K6
  level: TokenLevel | null;    // additive to K6
}
export interface IngestPlan {
  dir: string; mode: WikeeperConfig["ingest"]["permission"]; kind: string | null;
  entries: PlanEntry[]; skipped: PlanSkip[];
  totals: {
    new: number; duplicate: number; denied: number; needs_approval: number;
    tokens: number;            // K6: sum over new entries with an estimate
    tokens_rough: boolean;     // additive to K6
    not_estimated: number;     // additive to K6
  };
}
export const HTML_BYTES_PER_TOKEN = 3;
export const DOCX_BYTES_PER_TOKEN = 2;
export function estimateFile(abs: string, format: ReadFormat | null, size: number): Promise<{ tokens: number; rough: boolean } | null>;
export function pdfPageCount(bytes: Uint8Array): Promise<number | null>;
export function docxDocumentBytes(bytes: Uint8Array): number | null; // compressed size of word/document.xml
```

Consumed (frozen): `sourceTokens`, `describeTokens` (K5, `src/ingest/source-size.ts`); `checkSourceSize`, `sizeLimitText`, `SizeCheck` (K5, `src/ingest/permissions.ts`); `levelOf`, `formatTokens`, `PDF_TOKENS_PER_PAGE`, `TokenLevel` (K1); `config.tokens.source` (K2).

## Task Breakdown

- [ ] Implement `pdfPageCount`, `docxDocumentBytes`, `estimateFile` and the two constants in `src/ingest/plan.ts` -> R2, R3
- [ ] In `planDirectory`, estimate new entries, apply `checkSourceSize` to `needs_approval` and `reason`, fill `level`, null the other entries, add the totals -> R1, R4, R5
- [ ] In `src/commands/ingest-plan.ts`, add the estimate to new lines and the `new files:` line -> R6
- [ ] QA-Red: re-scope the §3.1 red assertion on the tree merged with STORY-007-03 -> R5
- [ ] Update `test/ingest/ingest-plan.test.ts:43` and write the §4.1 unit tests in `test/ingest/plan-estimates.test.ts` -> R2, R3, R5, R7

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 7 | `pdfPageCount` on the 2- and 3-page fixtures and `null` on `makeBrokenPdf`; `docxDocumentBytes` on `makeReportDocx`, on `makeNoDocumentDocx` and on a truncated zip; `estimateFile` per format with the rounding of 1,225 / 3 and 2,841 / 2; text files equal `sourceTokens`; totals with a rough entry and a not-estimated entry; the human `new files:` line with and without `rough` and `not estimated` |
| Integration tests | 0 | Temp directories and in-process fixtures only; no network, no external service. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`, in QA-Red's `test/ingest/plan-estimates.red.node.test.ts`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The §3.1 red assertion re-scoped by QA-Red, not the Developer; every other red file green without an edit, including `test/ingest/ingest-flow.red.node.test.ts` and STORY-003-05's S2 (`new (needs approval)`).
- [ ] `test/e2e/read.test.ts` passes: `ingest --help` loads no read library.
- [ ] No new runtime dependency in `package.json`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/ingest/plan.ts:46` — `planDirectory`, the walk, hash and duplicate checks; `src/ingest/plan.ts:115` — the per-file permission that `needs_approval` and `reason` come from; `src/ingest/plan.ts:130` — the totals loop.
- **Surface:** `src/commands/ingest-plan.ts:19` — `entryLine`; `src/commands/ingest-plan.ts:28` — `renderPlan`, the `totals:` and `next:` lines.
- **Surface:** `src/read/pdf.ts:185` — how `readPdf` opens a PDF with unpdf and closes it (`:198`); the plan opens it the same way and stops at `numPages`.
- **Surface:** `src/read/index.ts:71` — `formatFromExtension`, the format of each file.
- **Surface:** `src/ingest/registry.ts:79` — `hashSource`, which already gives each file's byte size.
- **Coverage of this requirement:** partial. The plan, its permission marks and its output exist; the estimates, the size marks and the totals are net-new.

## Prior work

- [[EPIC-007]] (parent, approved 2026-10-18) and [[SPIKE-003]] (1,600 tokens a page). Builds on [[STORY-007-03]] (`sourceTokens`, `checkSourceSize`, its §1.4 Q2) and [[STORY-007-01]] (K1, K2). Extends [[STORY-003-05]] (`ingest plan`, contract C9) and reuses how [[STORY-003-11]] opens a PDF with unpdf. [[STORY-007-07]] writes the instructions. Duplicate check (cleargate-wiki-query, 2026-10-18): nothing overlaps beyond [[EPIC-007]], [[EPIC-008]] and [[SPIKE-003]].

## Why not simpler?

- **Smallest existing surface that could carry this:** the per-file loop of `planDirectory` (`src/ingest/plan.ts:115`), calling STORY-007-03's `sourceTokens` for every file.
- **Why isn't extension / parameterization / config sufficient?** It mostly is an extension: one estimate per new entry in the existing loop and one line in the output. But `sourceTokens` extracts PDF, DOCX and HTML (140–400 ms a PDF, plus loading mammoth or defuddle), and the human asked that the plan extract nothing so a folder of PDFs stays fast. The PDF page count and the DOCX directory read are the smallest additions that keep the plan cheap; both use what is already installed.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/ingest/source-size.ts` is created by STORY-007-03, this story's predecessor.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Status stays 🟡 until the human decides §1.4 Q1–Q3; Q2 changes the frozen K6 type and follows STORY-007-03 §1.4 Q2, and Q3 authorises one red-test re-scope.
