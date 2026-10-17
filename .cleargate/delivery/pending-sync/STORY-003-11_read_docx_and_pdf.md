---
story_id: STORY-003-11
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-003 (approved 2026-10-16; §2 `read` bullet — DOCX via mammoth → turndown + GFM, PDF via unpdf, "likely scanned"; §2 out of scope — OCR, `.doc`, `.pptx`, `.xlsx`; §1 `read` metric) · architecture.md §7.7, D-20 · SPRINT-03 decomposition brief (human decisions 2026-10-17, contract K7) · STORY-003-10 (dispatcher, `Converted`, `withHeader`, `UNSUPPORTED_HINTS`, test server, module trace) · verified src/search/engine.ts, src/core/exit-codes.ts, ./package.json, ./.gitattributes, test/e2e/pack.ts, test/fixtures/hooks/SOURCES.md · mammoth 1.13.0, @joplin/turndown-plugin-gfm 1.0.68, turndown-plugin-gfm 1.0.2, unpdf 1.9.0 checked on npm and in their published sources 2026-10-17 · SPIKE-001 (the human's Georgian and English PDF and DOCX files, letters-based scanned rule, 32 MB on disk, Node 22.12, 24 and 25, import cost) · SPRINT-03 gate1-decisions.md 2026-10-17 (decisions 7, 8; package.json order) · SPRINT-03 consistency-audit.md 2026-10-17 (findings 7, 10, 13)
actor: AI coding agent
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-003-10
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T09:11:25Z
updated_at: 2026-10-17T10:04:23Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:04:52Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-003-11
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T10:07:14Z
  sessions: []
---

# STORY-003-11: `wikeeper read` for DOCX and PDF ("likely scanned")
**Complexity:** L3. Two converters with their own libraries: mammoth → turndown + a GFM tables plugin for DOCX, and unpdf with a font-size layout pass for PDF. Also a scanned-PDF rule that counts letters, and a deterministic fixture generator (a stored-zip DOCX writer and a PDF writer), so no binary file is committed. Depends on STORY-003-10, which owns the dispatcher, the output modes and the error envelope.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent handed a Word document or a PDF, I want `wikeeper read` to give me its text as markdown, with headings, lists and tables kept, and to tell me when a PDF is a scan, so that I can extract facts without opening a format I can't read, and know when I must read the file myself.

### 1.2 Detailed Requirements
- **R1 — Branches** (contract K7). In `src/read/index.ts`, the body of `convertDocx` becomes `return readDocx(bytes)` and the body of `convertPdf` becomes `return readPdf(bytes)`, importing from `src/read/docx.ts` and `src/read/pdf.ts`. Nothing else in the dispatcher changes.
  - STORY-003-10's dispatch (R2) already routes `.docx` and `.pdf` files to these branches. It also routes URLs whose `Content-Type` is the DOCX or PDF type, or whose type is unknown and whose path ends in `.docx` or `.pdf`.
  - The header (title, author, date) is added by STORY-003-10's `withHeader`.
- **R2 — DOCX** (`src/read/docx.ts`).
  - **Conversion.** `mammoth.convertToHtml({ buffer }, { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) })`. Mammoth's defaults are kept: its default style map (Heading 1–6 → h1–h6, numbered and bulleted paragraphs → `ol`/`ul`) and `externalFileAccess: false` (a document cannot make `read` open files it links to).
  - **Markdown.** The HTML goes through `htmlToMarkdown`, which uses turndown with `headingStyle: "atx"`, `bulletListMarker: "-"`, `codeBlockStyle: "fenced"`, `emDelimiter: "*"` and `hr: "---"` (the settings defuddle uses for HTML, so both formats look alike), plus `gfm` from `@joplin/turndown-plugin-gfm`. It also adds:
    - **List items.** A list-item rule writes `- ` and `N. ` with one space (turndown's default writes `-   ` and `1.  `), and indents nested items by one tab per level, as defuddle does.
    - **Header row.** A table without a header row gets its first row promoted to the header (`<td>` → `<th>` in its first `<tr>`) before conversion. Mammoth marks a header row only when Word's "repeat header row" is set, and the plugin would otherwise put an empty header above the data.
    - **Images.** An `<img>` becomes `[image: <alt text>]`, or `[image]` without alt text. Mammoth keeps Word's alt text on the `<img>`. When the document has images, the result carries one `unsupported` warning: "N image(s) were not converted; their places are marked [image: …]". This is the warning (exit 0, the markdown is returned), not the `unsupported` error (exit 2, nothing read) of STORY-003-10 R2; STORY-003-10 R7 defines both.
    - **HTML-kept tables.** A table whose cells hold lists, headings, code or block quotes stays an HTML `<table>`, because the plugin keeps those. Its wrapper `<div class="joplin-table-wrapper">` is removed.
  - **Metadata.** `title` is the text of the first `#` heading, else `null`. `author` and `date` are `null`: a DOCX keeps them in `docProps/core.xml`, which mammoth's API does not expose. Mammoth's `messages` (for example, unrecognised styles) are not reported.
  - **Failure.** A file mammoth cannot open (not a zip, or no main document part) exits 1 with `conversion_failed` and the message "the file is not a readable DOCX: <reason>".
- **R3 — PDF** (`src/read/pdf.ts`).
  - **Loading.** `getDocumentProxy(new Uint8Array(bytes), { verbosity: 0, useSystemFonts: false, disableFontFace: true })`, then `extractTextItems` and `getMeta` from `unpdf`. The document is destroyed after use with `pdf.loadingTask.destroy()`.
    - `verbosity: 0` is required: pdf.js prints warnings with `console.log`, which would land on stdout and corrupt the markdown or the JSON line.
    - The bytes are copied into a plain `Uint8Array`: pdf.js rejects a Node `Buffer` and detaches the array it is given.
    - CR:spec-clarification (orchestrator 2026-10-17, M3 plan Open decision 2): the `isEvalSupported` option is dropped. unpdf 1.9.0 bundles pdf.js 6.4.299, whose `DocumentInitParameters` has no such option (TS2353) and whose bundle contains no `eval(` or `new Function`, so font code from a file cannot be compiled. pdf.js 6.4 also has no `PDFDocumentProxy.destroy()`; `loadingTask.destroy()` closes the document.
  - **Lines.** A page's items form lines: a line ends at an item with `hasEOL`. Items in a line are joined in order. A space is inserted when the gap between two items is wider than 0.15 × the font size and neither side already has whitespace there. A line's font size is the largest `fontSize` among its non-blank items.
  - **Body size.** The font size that covers the most characters in the document, rounded to 0.5 pt.
  - **Headings.** A line of at most 120 characters whose size is at least 1.15 × the body size is a heading. The distinct heading sizes, largest first, become `#`, `##` and `###`; smaller ones also get `###`. Consecutive heading lines of the same size join into one heading, so a title wrapped over two lines stays one heading.
  - **Lists.** A line that starts with `•`, `●`, `▪`, `◦`, `‣`, `–`, `-` or `*` and whitespace becomes `- <rest>`. A line that starts with 1–3 digits, then `.` or `)`, then whitespace, becomes `<n>. <rest>`.
  - **Paragraphs.** A vertical gap between consecutive lines larger than 1.5 × the body size starts a new paragraph (a blank line). Headings and list blocks are surrounded by blank lines. Lines are not reflowed or de-hyphenated.
  - **Pages.** From page 2 on, each page starts with a line `<!-- page N -->`, between blank lines, so the agent can cite pages.
  - **Tables** (Gate 1 decision 7, §1.4 Q1). There is no table detection. Each table row comes out as one line, with its cells in order separated by spaces. EPIC-003's "tables preserved" holds for DOCX and HTML; a PDF keeps its table text row by row.
  - **Metadata.** `title` is the trimmed `info.Title` when non-empty, else the first `#` heading, else `null`. `author` is the trimmed `info.Author`, else `null`. `date` is `info.CreationDate` (`D:YYYYMMDD…`) as `YYYY-MM-DD`, else `null`.
  - **Likely scanned** (Gate 1 decision 8, §1.4 Q2; [[SPIKE-001]] round 3).
    - **Near-empty page.** A page is near-empty when its text has fewer than 25 letters (`NEAR_EMPTY_PAGE_LETTERS`). Letters are the matches of `\p{L}`: letters of any script, Georgian included. Digits, punctuation, symbols and whitespace do not count.
    - **Warning.** When at least half of the pages are near-empty, the result carries the warning `likely_scanned` with the message "likely scanned: N of M pages have almost no extractable text (pages …); read the PDF yourself, wikeeper does not do OCR". Pages are listed in order, and a run of two or more consecutive pages is written `a–b`. The exit code stays 0 and whatever text exists is returned (K7 models this as a warning).
    - **Why letters.** The rule also flags a PDF whose words are drawn as shapes. Take the human's sample deck: 11 pages, its only font a non-embedded Helvetica. Its pages yield only Latin words, digits and punctuation, which is 23–128 non-space characters per page, so a character count does not flag it. The same pages have 9–21 letters on 10 of 11 pages, so the letter count does. None of SPIKE-001's five text PDFs is flagged.
  - **Failure.** A file pdf.js cannot load (empty, damaged, not a PDF, password-protected) exits 1 with `conversion_failed` and the message "the file is not a readable PDF: <pdf.js message>".
- **R4 — Office formats stay unsupported.** `.doc`, `.pptx` and `.xlsx` fail with the `unsupported` error (exit 2), using the hints in STORY-003-10's `UNSUPPORTED_HINTS`. This story asserts them next to the formats it adds and adds no code for them. A deck is read from its PDF export; when that PDF's text is drawn as shapes, `likely_scanned` sends the agent to its own PDF reading (SPIKE-001 round 7).
- **R5 — Lazy loading.** `mammoth`, `turndown` and `@joplin/turndown-plugin-gfm` load only in the DOCX branch, and `unpdf` only in the PDF branch, each through `await import()` inside `readDocx` / `readPdf` (the pattern at `src/search/engine.ts:175`). Reading HTML loads neither group, and `wikeeper --help` loads none of them. The first import costs about 100 ms for mammoth and turndown, and under 10 ms for unpdf ([[SPIKE-001]] round 6).
- **R6 — Dependencies.** Add `mammoth` `^1.13.0`, `@joplin/turndown-plugin-gfm` `^1.0.68` and `unpdf` `^1.9.0` to `dependencies` and update the lockfile. `turndown` `^7.2.4` is already added by STORY-003-10. Facts and the reason for the GFM plugin choice are in §3.4.

### 1.3 Out of Scope
- OCR, and converting `.doc`, `.ppt(x)`, `.xls(x)`, `.odt` or `.rtf` (EPIC-003 §2).
- Detecting tables, columns or reading order in PDFs (Gate 1 decision 7, §1.4 Q1); bold-only headings in PDFs; footnote and header/footer removal.
- Extracting or describing images; reading DOCX core properties (author, dates); tracked changes and comments in DOCX; undoing turndown's markdown escapes (`\[`, `\_`) in placeholders.
- A size limit for local files (STORY-003-10 R6 applies the 10 MB cap to URLs only).
- Command options, output modes and the error envelope (STORY-003-10).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1):** Should `read` rebuild tables from a PDF? EPIC-003's metric says "`read` converts the DOCX, PDF and HTML fixtures with headings, lists and tables preserved". A PDF has no table structure, only positioned text, and unpdf returns text items with positions.
- **Recommended:** No table detection in SPRINT-03. Each table row comes out as one line, with its cells in order (R3), and the metric is read as "table text kept row by row" for PDF; DOCX and HTML keep real GFM tables.
  - A column-alignment rule (several consecutive lines whose items start at the same x positions) also fires on two-column page layouts, and would turn whole papers into tables.
  - Doing it well needs a layout pass this story can't bound.
  - The agent can read the PDF itself when a table matters (Claude Code reads PDFs natively).

  The alternative is a GFM table when at least 3 consecutive lines split into the same number (≥ 2) of items whose left edges match within 2 pt, on pages with one text column. That is more code, and more bounce risk on real PDFs.
- **Decision:** No table detection in PDFs: each table row becomes one line with its cells in order; EPIC-003's "tables preserved" holds for DOCX and HTML (R3; Gate 1 decision 7) — _approved (human, 2026-10-17, Gate 1)_

- **Question (Q2):** How does "likely scanned" decide that a page has almost no text? The first draft counted non-whitespace characters (fewer than 25 per page). [[SPIKE-001]] round 3 found a real deck, the human's sample presentation, whose Georgian text is drawn as shapes. Its pages still carry 23–128 non-space characters of Latin words, digits and punctuation, so the character rule does not flag it, and the agent would ingest a deck with no Georgian text.
- **Recommended:** Count letters (`\p{L}`). A page with fewer than 25 letters is near-empty, and the warning fires when at least half the pages are near-empty. In SPIKE-001 this flags the deck (9–21 letters on 10 of 11 pages) and none of the five text PDFs. The agent then reads the PDF itself.
- **Decision:** "Likely scanned" counts letters (`\p{L}`): fewer than 25 letters on at least half the pages; for a PDF the agent runs `read` first and reads the PDF itself when `read` warns `likely_scanned` (R3; Gate 1 decision 8) — _approved (human, 2026-10-17, Gate 1)_

Already decided; cited, not reopened:
- The libraries: mammoth, turndown + a GFM tables plugin, unpdf (human, 2026-10-17).
- "Likely scanned" when a PDF yields almost no text per page (how a page's text is counted is Q2); `.doc`, `.pptx` and `.xlsx` are not supported (EPIC-003 §2).
- Tests use files we make ourselves and never the internet (human, 2026-10-17).
- Branch-only edits of the dispatcher (contract K7).
- `package.json` / `package-lock.json` order: STORY-001-10, STORY-003-10, then this story (orchestrator technical call, gate1-decisions.md, 2026-10-17).
- The libraries convert the human's real Georgian and English PDF and DOCX files on Node 22.12, 24 and 25 ([[SPIKE-001]] rounds 2, 4 and 6).

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** pdf.js writes warnings to stdout with `console.log`, which would corrupt the markdown and the `--json` line.
- **Mitigation:** `verbosity: 0` (R3). S2 checks that a human-mode run's stdout is exactly the markdown and that stderr has no `Warning:` line.
- **Risk:** Untrusted documents. A PDF font program could try to run code; a DOCX can link to local files; a zip bomb can expand without limit (local files have no cap).
- **Mitigation:** the bundled pdf.js 6.4 has no code-evaluation path (no `eval` or `new Function`; CR:spec-clarification, R3), and mammoth's `externalFileAccess` stays off. The 10 MB URL cap bounds the compressed size of fetched files. A decompression limit is out of scope; the user hands `read` its local files.
- **Risk:** Importing unpdf replaces some browser globals (`stubBrowserGlobals`) and inlines the pdf.js worker.
- **Mitigation:** It happens only in the PDF branch of a one-shot `read` process, and no other command loads unpdf (S4 module trace).
- **Risk:** Font-size headings misfire: PDFs that mark headings by weight only lose them, and large pull quotes become headings.
- **Mitigation:** Constants are named and unit-tested. The manual check uses real PDFs (§2.2), and the agent still has the full text.
- **Risk:** unpdf looks for standard fonts and CJK character maps in a local `pdfjs-dist`, which is not installed. PDFs that use predefined CJK CMaps without a ToUnicode table may extract badly.
- **Mitigation:** Most PDFs embed ToUnicode, as the Georgian PDFs used in the manual check do (Identity-H fonts with ToUnicode, checked with `pdffonts`). [[SPIKE-001]] round 2 extracted four Georgian PDFs and a 26-page English report with 0 replacement characters. The dev report notes any PDF that fails.
- **Risk:** A PDF with real text but few letters per page, such as a deck of figures or a numbers-only table, is reported as likely scanned.
- **Mitigation:** The warning never fails the read, and the text is still returned. The agent then reads the PDF itself (Gate 1 decision 8), which is the safe direction.
- **Risk:** Some real DOCX files lay out each paragraph pair as its own one-row table. The human's bilingual agreement does ([[SPIKE-001]] round 4), so the markdown repeats `| --- | --- |` under every row. Placeholder brackets and underscores come out escaped (`\[\_\_\_\]`).
- **Mitigation:** Accepted: the output is readable and not wrong, and the text and its order are kept. A unit test pins that a one-row table becomes one header line and one separator line.
- **Risk:** `@joplin/turndown-plugin-gfm` is maintained by the Joplin project for Joplin's needs, and its HTML-kept tables carry a Joplin wrapper `div`.
- **Mitigation:** It is pinned to `^1.0.68` and tested against turndown 7.2.4 (its own devDependency). The wrapper is removed (R2), and the plugin is 19 kB, so it can be replaced by a local table rule if it drifts.
- **Risk:** STORY-001-10 and STORY-003-10 edit `package.json` and `package-lock.json` first (consistency audit finding 13).
- **Mitigation:** This story follows STORY-003-10 (`dep_predecessors`), which follows STORY-001-10. The lockfile is regenerated with `npm install` on the merged tree, never merged by hand.
- **Risk:** The install grows. All six `read` packages and their dependencies take 32 MB on disk (53 packages; [[SPIKE-001]] round 1).
- **Mitigation:** Each library loads only in its branch (R5), and the wikeeper tarball itself does not grow. The dev report records the measured size.
- **Risk:** The hand-written fixture generator writes a PDF or DOCX that only lenient readers accept, so tests pass on files real tools reject.
- **Mitigation:** A unit test checks that the generator output is byte-for-byte deterministic. The manual check opens the generated files in Preview and Word (or LibreOffice) once, and real documents are read in §2.2.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.** One row per axis. `T` = at least one scenario below carries the axis tag
(`@paths`, `@interfaces`, `@data`, `@rules`). `F` = no scenario carries it, and the row states
why. There is no Spike row: open discovery is chartered as a SPIKE item (`templates/spike.md`)
before this item is written.

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A local file, a URL with the document's content type, and a URL with a generic type and a `.pdf` path all read the same document. |
| Interfaces | F | The output surfaces (stdout, `--out`, `--json`) belong to STORY-003-10 and are unchanged; this story only checks that pdf.js writes nothing to stdout. |
| Data | T | Behaviour differs by format (DOCX, text PDF, scanned PDF), by the share of near-empty pages and the text they still carry (image-only pages, text drawn as shapes; Outline), and by broken or unsupported input (Outline). |
| Rules | T | The likely-scanned threshold (fewer than 25 letters on at least half the pages); each library loads only in its own branch. |

```gherkin
Feature: wikeeper read — DOCX and PDF

  @data
  Scenario: A DOCX keeps its headings, lists and table, and marks its image
    Given report.docx from makeReportDocx(): Heading 1 "Q4 status", Heading 2 "Risks", a bulleted list "Vendor delay", "Hiring", a numbered list "Sign contract", "Hire QA", a 3×3 table whose first row is "Item", "Owner", "Due" with no header-row flag, and an image with alt text "Org chart"
    When I run "wikeeper read report.docx --json"
    Then the exit code is 0, data.format is "docx", data.title is "Q4 status", data.author is null and data.date is null
    And data.markdown starts with "# Q4 status" and contains that heading once
    And it contains "## Risks", the lines "- Vendor delay", "- Hiring", "1. Sign contract" and "2. Hire QA"
    And it contains a GFM table whose first line is "| Item | Owner | Due |" followed by a separator line and two data lines
    And it contains "[image: Org chart]", and contains neither "data:" nor "<table"
    And data.warnings is one "unsupported" warning whose message starts with "1 image(s) were not converted"

  @data
  Scenario: A text PDF keeps its headings, list items, pages and metadata
    Given report.pdf from makeReportPdf(): 2 pages; Info Title "Q4 status", Author "Product Lead", CreationDate "D:20261001090000Z"; page 1 has "Q4 status" at 24 pt, "Risks" at 16 pt, body lines at 11 pt, "• Vendor delay", "• Hiring" and "1. Sign contract"; page 2 has "Timeline" at 16 pt and a 3-column table drawn as positioned text with the rows "Item", "Owner", "Due" and "Sign contract", "Product Lead", "2026-11-03" (38 letters on page 2, so neither page is near-empty)
    When I run "wikeeper read report.pdf --json"
    Then the exit code is 0, data.format is "pdf", data.title is "Q4 status", data.author is "Product Lead", data.date is "2026-10-01" and data.warnings is []
    And data.markdown begins with the lines "# Q4 status", "", "Author: Product Lead · Date: 2026-10-01"
    And it contains "## Risks", "- Vendor delay", "- Hiring", "1. Sign contract", a line "<!-- page 2 -->", "## Timeline", a line "Item Owner Due" and a line "Sign contract Product Lead 2026-11-03"
    When I run "wikeeper read report.pdf"
    Then stdout is exactly data.markdown followed by one newline, and stderr has no line containing "Warning:"

  @rules @data
  Scenario Outline: A PDF whose pages have almost no letters is reported as likely scanned
    Given <file> from makeScannedPdf(<spec>), where an image-only page has one 8×8 image and only its page number as text
    And an outlined page draws its words as filled paths and carries as text only "AcmeWorks · 2026-10-01 · N/M · +000 000 000 000 · 10.00 / 100%", with N its page number and M the page count (9 letters and 49 non-space characters, modelled on the sample deck of SPIKE-001 round 3)
    And every other page carries a paragraph of at least 25 letters
    When I run "wikeeper read <file> --json"
    Then the exit code is 0, data.format is "pdf" and the codes in data.warnings are <codes>
    And the warning message <message>
    When I run "wikeeper read <file>" without --json
    Then stderr <stderr>

    Examples:
      | file     | spec                                       | codes              | message                                         | stderr                                                         |
      | scan.pdf | { pages: 3, imageOnlyPages: [1, 2, 3] }    | ["likely_scanned"] | names "3 of 3 pages" and "(pages 1–3)"          | has a line starting "warning: likely scanned: 3 of 3 pages"    |
      | half.pdf | { pages: 4, imageOnlyPages: [2, 4] }       | ["likely_scanned"] | names "2 of 4 pages" and "(pages 2, 4)"         | has a line starting "warning: likely scanned: 2 of 4 pages"    |
      | one.pdf  | { pages: 4, imageOnlyPages: [3] }          | []                 | does not exist                                  | is empty                                                       |
      | deck.pdf | { pages: 4, outlinedPages: [1, 2, 3] }     | ["likely_scanned"] | names "3 of 4 pages" and "(pages 1–3)"          | has a line starting "warning: likely scanned: 3 of 4 pages"    |

  @paths @rules
  Scenario: Documents behind a URL read the same, and each library loads only in its branch
    Given the fixture server (test/read/http-server.ts) serves report.pdf at /report.pdf as "application/pdf", report.pdf at /files/report.pdf as "application/octet-stream", and report.docx at /report as "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    When I run "wikeeper read <url> --json" for each of the three URLs
    Then data.format is "pdf", "pdf" and "docx", and each data.markdown equals the markdown of reading the same file from disk
    When the packed CLI runs under the module trace (test/e2e/module-trace.ts)
    Then "wikeeper read report.docx" resolves "node_modules/mammoth/", "node_modules/turndown/" and "node_modules/@joplin/turndown-plugin-gfm/" and not "node_modules/unpdf/" or "node_modules/linkedom/"
    And "wikeeper read report.pdf" resolves "node_modules/unpdf/" and none of mammoth, turndown or linkedom
    And "wikeeper read article.html" and "wikeeper --help" resolve neither mammoth nor unpdf
    And the packed package.json lists mammoth "^1.13.0", @joplin/turndown-plugin-gfm "^1.0.68" and unpdf "^1.9.0" under dependencies

  @data
  Scenario Outline: Error — unsupported and unreadable documents fail cleanly
    Given <file> in the working directory
    When I run "wikeeper read <file> --json"
    Then the exit code is <exit>, error.code is "<code>", error.message contains "<text>" and the envelope's command is "read"
    And stdout holds only that JSON line

    Examples:
      | file                                                    | exit | code              | text                |
      | old.doc                                                 | 2    | unsupported       | save it as .docx    |
      | deck.pptx                                               | 2    | unsupported       | export it to PDF    |
      | sheet.xlsx                                              | 2    | unsupported       | CSV                 |
      | notzip.docx (plain text)                                | 1    | conversion_failed | not a readable DOCX |
      | nodoc.docx (a zip without word/document.xml)            | 1    | conversion_failed | not a readable DOCX |
      | empty.pdf (0 bytes)                                     | 1    | conversion_failed | not a readable PDF  |
      | broken.pdf ("%PDF-1.4" followed by random bytes)        | 1    | conversion_failed | not a readable PDF  |
```

### 2.2 Verification Steps (Manual)
- [ ] Read a Georgian PDF from `~/product_repo/samples/` (for example `sample-d.pdf`) and compare it with `pdftotext` of the same file: the same text, in reading order, with no `Warning:` lines.
- [ ] Make an image-only PDF from a real page (`mutool draw -o /tmp/p.png <pdf> 1`, then `sips -s format pdf /tmp/p.png --out /tmp/scan.pdf`) and check the "likely scanned" warning.
- [ ] Read the human's sample deck PDF (SPIKE-001 round 3) and check that `likely_scanned` names 10 of 11 pages; read the four Georgian text PDFs of SPIKE-001 round 2 and check that none is flagged.
- [ ] Read a real Word document with headings, nested lists and a table, and check the markdown in a viewer.
- [ ] Open the generated `report.docx` and `report.pdf` once in Word (or LibreOffice) and Preview, to confirm the generator writes files real tools accept.
- [ ] Record in the dev report the size the three packages add to `node_modules`, next to SPIKE-001's 32 MB on disk for all six.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File (new) | `src/read/pdf.ts` |
| Related Files (new) | `src/read/docx.ts`, `src/read/vendor.d.ts` |
| Modified Files | `src/read/index.ts`, `test/read/read-command.test.ts`, `test/read/http-server.ts`, `test/fixtures/read/SOURCES.md`, `./package.json`, `./package-lock.json` |
| Test Files (new) | `test/read/docx.test.ts`, `test/read/pdf.test.ts`, `test/read/read-documents.test.ts`, `test/e2e/read-documents.test.ts`, `test/fixtures/read/make-fixtures.test.ts` |
| Fixtures (new) | `test/fixtures/read/make-fixtures.ts` |
| New Files Needed | `src/read/docx.ts`, `src/read/pdf.ts`, `src/read/vendor.d.ts`, `test/fixtures/read/make-fixtures.ts`, `test/read/docx.test.ts`, `test/read/pdf.test.ts`, `test/read/read-documents.test.ts`, `test/e2e/read-documents.test.ts`, `test/fixtures/read/make-fixtures.test.ts` |

- **Notes on the files above:**
  - Modified files: `src/read/index.ts` (the bodies of `convertDocx` and `convertPdf` only), `test/read/read-command.test.ts` (removes STORY-003-10's two stub rows, `report.docx` and `report.pdf` → `unsupported`), `test/read/http-server.ts` (the three document routes), `test/fixtures/read/SOURCES.md` (one line for the generator).
  - New files needed: `src/read/docx.ts`, `src/read/pdf.ts`, `src/read/vendor.d.ts`, `test/fixtures/read/make-fixtures.ts` and the five test files.

### 3.2 Technical Logic
- **DOCX.**
  - `readDocx(bytes)` does `const { default: mammoth } = await import("mammoth")`. mammoth is CommonJS, and its `module.exports` arrives as `default`.
  - It calls `convertToHtml({ buffer: Buffer.from(bytes) }, …)`, then `promoteFirstRows(html)`, then `htmlToMarkdown(html)`. Errors are wrapped in `WikeeperError(ExitCode.ERROR, "conversion_failed", …)`.
  - `htmlToMarkdown` does `const { default: TurndownService } = await import("turndown")` and `const { gfm } = await import("@joplin/turndown-plugin-gfm")`. The plugin is CommonJS with `exports.gfm`, which Node's ESM import exposes as a named export. It builds the service once per call with the R2 settings, `use(gfm)`, and adds the `listItem` and `img` rules.
  - `promoteFirstRows` is a string pass over mammoth's regular HTML. For each `<table>` that does not open with `<thead>` and whose first `<tr>` has no `<th>`, it rewrites that row's `<td>`/`</td>` to `<th>`/`</th>`. Nested tables are left alone (the plugin keeps them as HTML).
- **PDF.**
  - `readPdf(bytes)` does `const { getDocumentProxy, extractTextItems, getMeta } = await import("unpdf")`. It calls `getDocumentProxy(bytes, options)`, then `extractTextItems(pdf)`, which gives per page `{ str, x, y, width, height, fontSize, hasEOL }`. It then calls `getMeta(pdf)` and finally `pdf.loadingTask.destroy()`. `bytes` is passed as `new Uint8Array(bytes)` (R3).
  - Items become `PdfLine[][]`. `linesToMarkdown` and `scannedPages` are pure functions over those lines, so the layout rules are unit-tested without pdf.js.
  - `scannedPages` counts the matches of `/\p{L}/gu` in each page's line texts and returns the pages below `NEAR_EMPTY_PAGE_LETTERS`. The `likely_scanned` warning fires when that list holds at least half of the pages (R3).
  - A load error from pdf.js (`InvalidPDFException`, `PasswordException`, an empty file) becomes `conversion_failed`.
- **Types.** `turndown` and `@joplin/turndown-plugin-gfm` ship no TypeScript types. `src/read/vendor.d.ts` declares the parts used (`TurndownService` constructor options, `use`, `addRule`, `turndown`; `gfm`). No `@types/turndown` is added: it would be a package beyond the approved list. mammoth (`lib/index.d.ts`) and unpdf (`dist/index.d.mts`) ship their own types.
- **Fixtures** (`test/fixtures/read/make-fixtures.ts`). The generator builds every DOCX and PDF in memory, byte-for-byte deterministic; tests write the bytes to temp directories. No binary file is committed. That keeps provenance in code, and avoids `./.gitattributes` (`* text=auto eol=lf`) treating an all-ASCII PDF as text.
  - **DOCX.** A zip with the STORE method, CRC-32 from `zlib.crc32` (Node ≥ 22.2; engines require 22.12) and a fixed 1980-01-01 00:00 timestamp. Its parts are `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/styles.xml` (Heading1, Heading2), `word/numbering.xml` (one bullet and one decimal list), `word/_rels/document.xml.rels` and `word/media/image1.png`. The image is a generated 1×1 PNG, referenced by a `wp:inline` drawing whose `wp:docPr descr` is "Org chart".
  - **PDF.** PDF 1.4 with uncompressed content streams, the standard fonts Helvetica and Helvetica-Bold (WinAnsiEncoding, so `•` is code 0x95 and `·` is 0xB7), an Info dictionary and an xref table with computed byte offsets.
    - An image-only page draws one 8×8 DeviceGray image XObject and a page-number string.
    - An outlined page draws a few filled path shapes (`re f` and `m … c … f`) where its words would be, plus one text line, the S3 string with its page number and page count. That string has 9 letters and 49 non-space characters, so it is near-empty by letters but not by characters.
    - Every other page of `makeScannedPdf` carries a fixed paragraph of at least 25 letters. `report.pdf` page 2 carries "Timeline" and two table rows (38 letters).
  - **Broken inputs.** `makeBrokenPdf()` returns `%PDF-1.4\n` and a fixed pseudo-random tail. `makeNoDocumentDocx()` returns a stored zip holding only `[Content_Types].xml`.
- **Test server routes.** Add `/report.pdf` (`application/pdf`), `/files/report.pdf` (`application/octet-stream`) and `/report` (DOCX type) to `test/read/http-server.ts`, serving the generated bytes.
- **Module trace.** `test/e2e/read-documents.test.ts` reuses STORY-003-10's `traceCli` from `test/e2e/module-trace.ts` on the packed CLI.
- **Shared files and order** (gate1-decisions technical call; consistency audit finding 13). `package.json` / `package-lock.json` go STORY-001-10, then STORY-003-10, then this story. Add the three dependencies to STORY-003-10's `package.json` and regenerate the lockfile with `npm install`. `src/read/*`, `test/read/*`, `test/fixtures/read/*` and `test/e2e/module-trace.ts` come from STORY-003-10, which merges first.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper read <file.docx\|file.pdf\|url>` | CLI | None | as STORY-003-10 | `ReadResult` with `format` `"docx"` or `"pdf"`. Warnings (exit 0): `likely_scanned` (PDF), the `unsupported` warning (DOCX images). Errors: exit 1 `conversion_failed`; the `unsupported` error (exit 2) for `.doc`, `.pptx`, `.xlsx`. |

Frozen exports. Consumers: `src/read/index.ts` calls `readDocx` and `readPdf`. `Converted` is STORY-003-10's type.

```ts
// src/read/docx.ts
import type { Converted } from "./index.js";
export function readDocx(bytes: Uint8Array): Promise<Converted>;
export function htmlToMarkdown(html: string): Promise<string>;
export function promoteFirstRows(html: string): string;

// src/read/pdf.ts
import type { Converted } from "./index.js";
export const NEAR_EMPTY_PAGE_LETTERS: 25; // letters (\p{L}) per page
export interface PdfLine { text: string; fontSize: number; y: number; }
export function readPdf(bytes: Uint8Array): Promise<Converted>;
export function linesToMarkdown(pages: ReadonlyArray<ReadonlyArray<PdfLine>>): string;
export function scannedPages(pages: ReadonlyArray<ReadonlyArray<PdfLine>>): number[]; // 1-based pages with fewer than NEAR_EMPTY_PAGE_LETTERS letters
export function formatPageList(pages: readonly number[]): string;                    // [1, 2, 3, 7] -> "1–3, 7"
export function pdfDate(value: unknown): string | null;                              // "D:20261001090000Z" -> "2026-10-01"

// test/fixtures/read/make-fixtures.ts
export function makeReportDocx(): Uint8Array;
export function makeNoDocumentDocx(): Uint8Array;
export function makeReportPdf(): Uint8Array;
export function makeScannedPdf(spec: { pages: number; imageOnlyPages?: number[]; outlinedPages?: number[] }): Uint8Array; // both lists default to []
export function makeBrokenPdf(): Uint8Array;
```

### 3.4 Dependency check (npm and published sources, 2026-10-17)

| Package | Version | License | Unpacked | Dependencies | Module format, Node 22 ESM | DOM / native |
|---|---|---|---|---|---|---|
| `mammoth` | 1.13.0 | BSD-2-Clause | 1.67 MB | lop, jszip, argparse, base64-js, underscore, xmlbuilder, @xmldom/xmldom, dingbat-to-unicode (about 4.8 MB with theirs) | CommonJS `main` `./lib/index.js`, no `exports`; `import()` gives `module.exports` as `default`; ships `lib/index.d.ts`; engines node >= 12 | no DOM, no native code |
| `@joplin/turndown-plugin-gfm` | 1.0.68 | MIT | 19 kB | none (turndown 7.2.4 is its devDependency) | CommonJS `main`, named exports `gfm`, `tables`, `strikethrough`, `taskListItems`; no types | uses the DOM turndown builds (domino); no native code |
| `unpdf` | 1.9.0 | MIT | 2.18 MB | none; optional peer `@napi-rs/canvas`, used only for rendering, not installed | `"type": "module"`, `exports.import` → `./dist/index.mjs`, types `./dist/index.d.mts`; engines node >= 22; bundles pdf.js 6.4.299, which needs the global `Iterator` (Node 22 has it) | no DOM; stubs browser globals on import; no native build |
| `turndown` (added by STORY-003-10) | 7.2.4 | MIT | 0.19 MB | @mixmark-io/domino (7.7 MB) | CommonJS, default export | no native code |

**GFM plugin choice.** `@joplin/turndown-plugin-gfm` over `turndown-plugin-gfm` 1.0.2:
- The original was last published on 2018-05-11. The Joplin fork was published on 2026-09-07 and is tested against turndown 7.2.4.
- The fork escapes `|` inside cells, turns line breaks inside cells into `<br>` so a multi-line cell does not break the table, handles `colspan`, and still renders a table without a header row. The original keeps such a table as raw HTML.

All transitive licenses are permissive (MIT, BSD-2-Clause, `MIT OR GPL-3.0-or-later` for jszip, `MIT AND Zlib` for pako).

**Size and runtimes.** "Unpacked" is the npm registry's `unpackedSize` of each package alone; mammoth's "about 4.8 MB with theirs" adds its dependencies' npm sizes. On disk, all six `read` packages and their dependencies take 32 MB (53 packages, no native build; [[SPIKE-001]] round 1). This story's largest parts are mammoth's `underscore` (2.6 MB) and unpdf (2.5 MB). SPIKE-001 round 6 found identical DOCX and PDF output on Node 22.12.0, 24.14.0 and 25.9.0.

## Task Breakdown

- [ ] Add `mammoth` `^1.13.0`, `@joplin/turndown-plugin-gfm` `^1.0.68` and `unpdf` `^1.9.0` to `dependencies` on top of STORY-003-10's `package.json`, and regenerate the lockfile with `npm install` -> R6
- [ ] QA-Red: write `test/fixtures/read/make-fixtures.ts` (stored-zip DOCX writer, PDF writer with image-only and outlined pages, broken inputs), add the three document routes to `test/read/http-server.ts` and the generator line to `SOURCES.md`, in the QA-Red commit (CR:approach-change, orchestrator 2026-10-17, M3 plan Open decision 1; the Developer may add exports or options but never changes the bytes an existing call returns). The Developer writes the generator's determinism test
- [ ] Write `src/read/vendor.d.ts` for turndown and the GFM plugin -> R2
- [ ] Implement `src/read/docx.ts`: mammoth with the image converter, `promoteFirstRows`, `htmlToMarkdown` with the list-item and image rules, wrapper removal, title, image warning, `conversion_failed` -> R2, R5
- [ ] Implement `src/read/pdf.ts`: pdf.js options, line building, `linesToMarkdown`, `scannedPages` (letters, `NEAR_EMPTY_PAGE_LETTERS`), `formatPageList`, `pdfDate`, metadata, `conversion_failed` -> R3, R5
- [ ] Replace the bodies of `convertDocx` and `convertPdf` in `src/read/index.ts`; remove STORY-003-10's two stub rows from `test/read/read-command.test.ts` -> R1
- [ ] Write `test/read/docx.test.ts`, `test/read/pdf.test.ts` and `test/read/read-documents.test.ts` for S1, S2, S3, S5 and the unit tests in §4.1 -> R2, R3, R4
- [ ] Write `test/e2e/read-documents.test.ts` for S4 (URLs, module trace, packed `package.json`) -> R1, R5, R6

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 10 | `linesToMarkdown`: heading ranks; a wrapped heading joined; bullet and number markers; a paragraph gap; page markers. `scannedPages` at exactly half and below half; `scannedPages` on a page of only digits and punctuation (40 non-space characters, 0 letters: near-empty), a page of 24 letters (near-empty) and a page of 25 Georgian letters (not near-empty); `NEAR_EMPTY_PAGE_LETTERS === 25`; `formatPageList`; `pdfDate` (valid, missing, malformed); `htmlToMarkdown`: a headerless table promoted to a GFM header, a one-row table as one header line and one separator line, `[image: alt]` and `[image]`, `- ` / `N. ` list prefixes, the Joplin wrapper removed; `promoteFirstRows` leaves `<thead>` tables alone; the generator returns identical bytes on two calls. |
| Integration tests | 0 | Temp directories and the 127.0.0.1 fixture server only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). S4's module trace runs the packed CLI; the others run in-process through `runCli`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Exports match §3.3 exactly (names and types); `src/read/index.ts` differs from STORY-003-10 only in the bodies of `convertDocx` and `convertPdf`.
- [ ] No binary fixture is committed (`git ls-files test/fixtures/read` lists only text files).
- [ ] `npm pack --dry-run` shows no files beyond `dist/` and `templates/`; `package.json` and the lockfile agree on the three dependencies.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/search/engine.ts:175` — the dynamic-import pattern each converter follows.
- **Surface:** `src/core/exit-codes.ts:1` — `ExitCode.ERROR` (1) for `conversion_failed`, and `USAGE` (2) for `unsupported`.
- **Surface:** `test/e2e/pack.ts:13` — `packCli`, which S4's module trace runs.
- **Surface:** `test/fixtures/hooks/SOURCES.md` — the provenance-file format the read fixtures follow.
- **Surface:** the repository's .gitattributes (line 1, `* text=auto eol=lf`) — the reason binary fixtures are generated rather than committed.
- **Surface:** STORY-003-10's dispatcher (`convertDocx` / `convertPdf` stubs, `Converted`, `withHeader`, `UNSUPPORTED_HINTS`), test server and module trace. These are not on disk until that story merges (contract K7).
- **Coverage of this requirement:** partial — the command, dispatch, output and error handling come from STORY-003-10; the DOCX and PDF converters and the fixture generator are net-new.

## Prior work

- [[EPIC-003]] (parent; the DOCX, PDF and "likely scanned" scope, and the `read` metric). [[STORY-003-10]] (the command, the dispatcher and the K7 types this story fills). [[STORY-003-04]] (`ingest start --text-file`, which takes `read`'s output for the original file). [[STORY-004-02]] (the dynamic-import pattern for a runtime dependency). [[SPIKE-001]] (the libraries on the human's real Georgian and English documents; the letters rule; 32 MB on disk). [[STORY-006-09]] (instruction text for the warnings). [[SPRINT-03]] (sprint plan). The `cleargate-wiki-query` duplicate check (2026-10-17) found no other item that converts DOCX or PDF.

## Why not simpler?

- **Smallest existing surface that could carry this:** `wikeeper ingest start <file> --text-file <file>`, where the agent extracts the text itself; the converter stubs in STORY-003-10's dispatcher.
- **Why isn't extension / parameterization / config sufficient?** Most agents can't open a DOCX at all, and PDF reading differs from agent to agent (architecture.md §7.7). A converter gives every agent the same markdown and tells it when a PDF is a scan.
  - mammoth is the standard semantic DOCX → HTML converter, and turndown with a GFM plugin is the approved HTML → markdown path.
  - unpdf is pdf.js packaged for Node without a native canvas, and its `extractTextItems` gives the font sizes needed to find headings.
  - Generating the fixtures in code instead of committing binaries keeps their provenance reviewable and their bytes stable under `./.gitattributes`.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (EPIC-003 §4 names `src/read/docx.ts` and `src/read/pdf.ts`; `src/read/index.ts`, `test/read/read-command.test.ts`, `test/read/http-server.ts` and `test/e2e/module-trace.ts` come from STORY-003-10; the other files are new and listed as new.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1 approved by the human on 2026-10-17: every §1.4 Decision line is approved as recommended.
