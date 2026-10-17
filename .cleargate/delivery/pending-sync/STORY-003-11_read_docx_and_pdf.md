---
story_id: STORY-003-11
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
ambiguity: 🟡 Medium
context_source: EPIC-003 (approved 2026-10-16; §2 `read` bullet — DOCX via mammoth → turndown + GFM, PDF via unpdf, "likely scanned"; §2 out of scope — OCR, `.doc`, `.pptx`, `.xlsx`; §1 `read` metric) · architecture.md §7.7, D-20 · SPRINT-03 decomposition brief (human decisions 2026-10-17, contract K7) · STORY-003-10 (dispatcher, `Converted`, `withHeader`, `UNSUPPORTED_HINTS`, test server, module trace) · verified src/search/engine.ts, src/core/exit-codes.ts, ./package.json, ./.gitattributes, test/e2e/pack.ts, test/fixtures/hooks/SOURCES.md · mammoth 1.13.0, @joplin/turndown-plugin-gfm 1.0.68, turndown-plugin-gfm 1.0.2, unpdf 1.9.0 checked on npm and in their published sources 2026-10-17
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
updated_at: 2026-10-17T09:11:25Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:14:17Z
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
  last_stamp: 2026-10-17T09:14:17Z
  sessions: []
---

# STORY-003-11: `wikeeper read` for DOCX and PDF ("likely scanned")
**Complexity:** L3. Two converters with their own libraries: mammoth → turndown + a GFM tables plugin for DOCX, and unpdf with a font-size layout pass for PDF. Also a scanned-PDF rule, and a deterministic fixture generator (a stored-zip DOCX writer and a PDF writer), so no binary file is committed. Depends on STORY-003-10, which owns the dispatcher, the output modes and the error envelope.

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
    - **Images.** An `<img>` becomes `[image: <alt text>]`, or `[image]` without alt text. Mammoth keeps Word's alt text on the `<img>`. When the document has images, the result carries one warning, `unsupported`: "N image(s) were not converted; their places are marked [image: …]".
    - **HTML-kept tables.** A table whose cells hold lists, headings, code or block quotes stays an HTML `<table>`, because the plugin keeps those. Its wrapper `<div class="joplin-table-wrapper">` is removed.
  - **Metadata.** `title` is the text of the first `#` heading, else `null`. `author` and `date` are `null`: a DOCX keeps them in `docProps/core.xml`, which mammoth's API does not expose. Mammoth's `messages` (for example, unrecognised styles) are not reported.
  - **Failure.** A file mammoth cannot open (not a zip, or no main document part) exits 1 with `conversion_failed` and the message "the file is not a readable DOCX: <reason>".
- **R3 — PDF** (`src/read/pdf.ts`).
  - **Loading.** `getDocumentProxy(bytes, { verbosity: 0, isEvalSupported: false, useSystemFonts: false, disableFontFace: true })`, then `extractTextItems` and `getMeta` from `unpdf`. The document is destroyed after use.
    - `verbosity: 0` is required: pdf.js prints warnings with `console.log`, which would land on stdout and corrupt the markdown or the JSON line.
    - `isEvalSupported: false` stops pdf.js from compiling font code taken from an untrusted file.
  - **Lines.** A page's items form lines: a line ends at an item with `hasEOL`. Items in a line are joined in order. A space is inserted when the gap between two items is wider than 0.15 × the font size and neither side already has whitespace there. A line's font size is the largest `fontSize` among its non-blank items.
  - **Body size.** The font size that covers the most characters in the document, rounded to 0.5 pt.
  - **Headings.** A line of at most 120 characters whose size is at least 1.15 × the body size is a heading. The distinct heading sizes, largest first, become `#`, `##` and `###`; smaller ones also get `###`. Consecutive heading lines of the same size join into one heading, so a title wrapped over two lines stays one heading.
  - **Lists.** A line that starts with `•`, `●`, `▪`, `◦`, `‣`, `–`, `-` or `*` and whitespace becomes `- <rest>`. A line that starts with 1–3 digits, then `.` or `)`, then whitespace, becomes `<n>. <rest>`.
  - **Paragraphs.** A vertical gap between consecutive lines larger than 1.5 × the body size starts a new paragraph (a blank line). Headings and list blocks are surrounded by blank lines. Lines are not reflowed or de-hyphenated.
  - **Pages.** From page 2 on, each page starts with a line `<!-- page N -->`, between blank lines, so the agent can cite pages.
  - **Tables.** There is no table detection (§1.4 Q1, drafted as recommended). Each table row comes out as one line, with its cells in order separated by spaces.
  - **Metadata.** `title` is the trimmed `info.Title` when non-empty, else the first `#` heading, else `null`. `author` is the trimmed `info.Author`, else `null`. `date` is `info.CreationDate` (`D:YYYYMMDD…`) as `YYYY-MM-DD`, else `null`.
  - **Likely scanned.** A page is near-empty when it has fewer than 25 non-whitespace characters (`NEAR_EMPTY_PAGE_CHARS`). When at least half of the pages are near-empty, the result carries the warning `likely_scanned` with the message "likely scanned: N of M pages have almost no text (pages …); read the PDF yourself, wikeeper does not do OCR". Pages are listed in order, and a run of two or more consecutive pages is written `a–b`. The exit code stays 0 and whatever text exists is returned (K7 models this as a warning).
  - **Failure.** A file pdf.js cannot load (empty, damaged, not a PDF, password-protected) exits 1 with `conversion_failed` and the message "the file is not a readable PDF: <pdf.js message>".
- **R4 — Office formats stay unsupported.** `.doc`, `.pptx` and `.xlsx` exit 2 with `unsupported`, using the hints in STORY-003-10's `UNSUPPORTED_HINTS`. This story asserts them next to the formats it adds and adds no code for them.
- **R5 — Lazy loading.** `mammoth`, `turndown` and `@joplin/turndown-plugin-gfm` load only in the DOCX branch, and `unpdf` only in the PDF branch, each through `await import()` inside `readDocx` / `readPdf` (the pattern at `src/search/engine.ts:175`). Reading HTML loads neither group, and `wikeeper --help` loads none of them.
- **R6 — Dependencies.** Add `mammoth` `^1.13.0`, `@joplin/turndown-plugin-gfm` `^1.0.68` and `unpdf` `^1.9.0` to `dependencies` and update the lockfile. `turndown` `^7.2.4` is already added by STORY-003-10. Facts and the reason for the GFM plugin choice are in §3.4.

### 1.3 Out of Scope
- OCR, and converting `.doc`, `.ppt(x)`, `.xls(x)`, `.odt` or `.rtf` (EPIC-003 §2).
- Detecting tables, columns or reading order in PDFs (§1.4 Q1); bold-only headings in PDFs; footnote and header/footer removal.
- Extracting or describing images; reading DOCX core properties (author, dates); tracked changes and comments in DOCX.
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
- **Human decision:** (pending)

Already decided; cited, not reopened:
- The libraries: mammoth, turndown + a GFM tables plugin, unpdf (human, 2026-10-17).
- "Likely scanned" when a PDF yields almost no text per page; `.doc`, `.pptx` and `.xlsx` are not supported (EPIC-003 §2).
- Tests use files we make ourselves and never the internet (human, 2026-10-17).
- Branch-only edits of the dispatcher (contract K7).

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** pdf.js writes warnings to stdout with `console.log`, which would corrupt the markdown and the `--json` line.
- **Mitigation:** `verbosity: 0` (R3). S2 checks that a human-mode run's stdout is exactly the markdown and that stderr has no `Warning:` line.
- **Risk:** Untrusted documents. A PDF font program could try to run code; a DOCX can link to local files; a zip bomb can expand without limit (local files have no cap).
- **Mitigation:** `isEvalSupported: false`, and mammoth's `externalFileAccess` stays off. The 10 MB URL cap bounds the compressed size of fetched files. A decompression limit is out of scope; the user hands `read` its local files.
- **Risk:** Importing unpdf replaces some browser globals (`stubBrowserGlobals`) and inlines the pdf.js worker.
- **Mitigation:** It happens only in the PDF branch of a one-shot `read` process, and no other command loads unpdf (S4 module trace).
- **Risk:** Font-size headings misfire: PDFs that mark headings by weight only lose them, and large pull quotes become headings.
- **Mitigation:** Constants are named and unit-tested. The manual check uses real PDFs (§2.2), and the agent still has the full text.
- **Risk:** unpdf looks for standard fonts and CJK character maps in a local `pdfjs-dist`, which is not installed. PDFs that use predefined CJK CMaps without a ToUnicode table may extract badly.
- **Mitigation:** Most PDFs embed ToUnicode, as the Georgian forms used in the manual check do (Identity-H fonts with ToUnicode, checked with `pdffonts`). The dev report notes any PDF that fails.
- **Risk:** `@joplin/turndown-plugin-gfm` is maintained by the Joplin project for Joplin's needs, and its HTML-kept tables carry a Joplin wrapper `div`.
- **Mitigation:** It is pinned to `^1.0.68` and tested against turndown 7.2.4 (its own devDependency). The wrapper is removed (R2), and the plugin is 19 kB, so it can be replaced by a local table rule if it drifts.
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
| Data | T | Behaviour differs by format (DOCX, text PDF, scanned PDF), by the share of near-empty pages (Outline), and by broken or unsupported input (Outline). |
| Rules | T | The likely-scanned threshold (at least half the pages); each library loads only in its own branch. |

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
    Given report.pdf from makeReportPdf(): 2 pages; Info Title "Q4 status", Author "Ana Kim", CreationDate "D:20261001090000Z"; page 1 has "Q4 status" at 24 pt, "Risks" at 16 pt, body lines at 11 pt, "• Vendor delay", "• Hiring" and "1. Sign contract"; page 2 has "Timeline" at 16 pt and a 3-column table drawn as positioned text with the row "Item", "Owner", "Due"
    When I run "wikeeper read report.pdf --json"
    Then the exit code is 0, data.format is "pdf", data.title is "Q4 status", data.author is "Ana Kim", data.date is "2026-10-01" and data.warnings is []
    And data.markdown begins with the lines "# Q4 status", "", "Author: Ana Kim · Date: 2026-10-01"
    And it contains "## Risks", "- Vendor delay", "- Hiring", "1. Sign contract", a line "<!-- page 2 -->", "## Timeline" and a line "Item Owner Due"
    When I run "wikeeper read report.pdf"
    Then stdout is exactly data.markdown followed by one newline, and stderr has no line containing "Warning:"

  @rules @data
  Scenario Outline: A PDF whose pages have almost no text is reported as likely scanned
    Given <file> from makeScannedPdf(<spec>), where an image-only page has one 8×8 image and only its page number as text
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
- [ ] Read a Georgian form from `~/Documents/Dev/doc_processor/codex_probes/GOAL-2/batch/` (for example `P1__operatsiis_okmi.pdf`) and compare it with `pdftotext` of the same file: the same text, in reading order, with no `Warning:` lines.
- [ ] Make an image-only PDF from a real page (`mutool draw -o /tmp/p.png <pdf> 1`, then `sips -s format pdf /tmp/p.png --out /tmp/scan.pdf`) and check the "likely scanned" warning.
- [ ] Read a real Word document with headings, nested lists and a table, and check the markdown in a viewer.
- [ ] Open the generated `report.docx` and `report.pdf` once in Word (or LibreOffice) and Preview, to confirm the generator writes files real tools accept.
- [ ] Record in the dev report the size the three packages add to `node_modules`.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/read/pdf.ts` |
| Related Files | `src/read/docx.ts`, `src/read/vendor.d.ts` |
| Modified Files | `src/read/index.ts` (the bodies of `convertDocx` and `convertPdf` only), `test/read/read-command.test.ts` (removes STORY-003-10's two stub rows, `report.docx` and `report.pdf` → `unsupported`), `test/read/http-server.ts` (the three document routes), `test/fixtures/read/SOURCES.md` (one line for the generator), `./package.json`, `./package-lock.json` |
| Test Files | `test/read/docx.test.ts`, `test/read/pdf.test.ts`, `test/read/read-documents.test.ts`, `test/e2e/read-documents.test.ts`, `test/fixtures/read/make-fixtures.test.ts` |
| Fixtures | `test/fixtures/read/make-fixtures.ts` |
| New Files Needed | Yes — `src/read/docx.ts`, `src/read/pdf.ts`, `src/read/vendor.d.ts`, `test/fixtures/read/make-fixtures.ts` and the five test files |

### 3.2 Technical Logic
- **DOCX.**
  - `readDocx(bytes)` does `const { default: mammoth } = await import("mammoth")`. mammoth is CommonJS, and its `module.exports` arrives as `default`.
  - It calls `convertToHtml({ buffer: Buffer.from(bytes) }, …)`, then `promoteFirstRows(html)`, then `htmlToMarkdown(html)`. Errors are wrapped in `WikeeperError(ExitCode.ERROR, "conversion_failed", …)`.
  - `htmlToMarkdown` does `const { default: TurndownService } = await import("turndown")` and `const { gfm } = await import("@joplin/turndown-plugin-gfm")`. The plugin is CommonJS with `exports.gfm`, which Node's ESM import exposes as a named export. It builds the service once per call with the R2 settings, `use(gfm)`, and adds the `listItem` and `img` rules.
  - `promoteFirstRows` is a string pass over mammoth's regular HTML. For each `<table>` that does not open with `<thead>` and whose first `<tr>` has no `<th>`, it rewrites that row's `<td>`/`</td>` to `<th>`/`</th>`. Nested tables are left alone (the plugin keeps them as HTML).
- **PDF.**
  - `readPdf(bytes)` does `const { getDocumentProxy, extractTextItems, getMeta } = await import("unpdf")`. It calls `getDocumentProxy(bytes, options)`, then `extractTextItems(pdf)`, which gives per page `{ str, x, y, width, height, fontSize, hasEOL }`. It then calls `getMeta(pdf)` and finally `pdf.destroy()`.
  - Items become `PdfLine[][]`. `linesToMarkdown` and `scannedPages` are pure functions over those lines, so the layout rules are unit-tested without pdf.js.
  - A load error from pdf.js (`InvalidPDFException`, `PasswordException`, an empty file) becomes `conversion_failed`.
- **Types.** `turndown` and `@joplin/turndown-plugin-gfm` ship no TypeScript types. `src/read/vendor.d.ts` declares the parts used (`TurndownService` constructor options, `use`, `addRule`, `turndown`; `gfm`). No `@types/turndown` is added: it would be a package beyond the approved list. mammoth (`lib/index.d.ts`) and unpdf (`dist/index.d.mts`) ship their own types.
- **Fixtures** (`test/fixtures/read/make-fixtures.ts`). The generator builds every DOCX and PDF in memory, byte-for-byte deterministic; tests write the bytes to temp directories. No binary file is committed. That keeps provenance in code, and avoids `./.gitattributes` (`* text=auto eol=lf`) treating an all-ASCII PDF as text.
  - **DOCX.** A zip with the STORE method, CRC-32 from `zlib.crc32` (Node ≥ 22.2; engines require 22.12) and a fixed 1980-01-01 00:00 timestamp. Its parts are `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/styles.xml` (Heading1, Heading2), `word/numbering.xml` (one bullet and one decimal list), `word/_rels/document.xml.rels` and `word/media/image1.png`. The image is a generated 1×1 PNG, referenced by a `wp:inline` drawing whose `wp:docPr descr` is "Org chart".
  - **PDF.** PDF 1.4 with uncompressed content streams, the standard fonts Helvetica and Helvetica-Bold (WinAnsiEncoding, so `•` is code 0x95), an Info dictionary and an xref table with computed byte offsets. An image-only page draws one 8×8 DeviceGray image XObject and a page-number string.
  - **Broken inputs.** `makeBrokenPdf()` returns `%PDF-1.4\n` and a fixed pseudo-random tail. `makeNoDocumentDocx()` returns a stored zip holding only `[Content_Types].xml`.
- **Test server routes.** Add `/report.pdf` (`application/pdf`), `/files/report.pdf` (`application/octet-stream`) and `/report` (DOCX type) to `test/read/http-server.ts`, serving the generated bytes.
- **Module trace.** `test/e2e/read-documents.test.ts` reuses STORY-003-10's `traceCli` from `test/e2e/module-trace.ts` on the packed CLI.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper read <file.docx\|file.pdf\|url>` | CLI | None | as STORY-003-10 | `ReadResult` with `format` `"docx"` or `"pdf"`. Errors: exit 1 `conversion_failed`; exit 2 `unsupported` for `.doc`, `.pptx`, `.xlsx`. |

Frozen exports. Consumers: `src/read/index.ts` calls `readDocx` and `readPdf`. `Converted` is STORY-003-10's type.

```ts
// src/read/docx.ts
import type { Converted } from "./index.js";
export function readDocx(bytes: Uint8Array): Promise<Converted>;
export function htmlToMarkdown(html: string): Promise<string>;
export function promoteFirstRows(html: string): string;

// src/read/pdf.ts
import type { Converted } from "./index.js";
export const NEAR_EMPTY_PAGE_CHARS: 25;
export interface PdfLine { text: string; fontSize: number; y: number; }
export function readPdf(bytes: Uint8Array): Promise<Converted>;
export function linesToMarkdown(pages: ReadonlyArray<ReadonlyArray<PdfLine>>): string;
export function scannedPages(pages: ReadonlyArray<ReadonlyArray<PdfLine>>): number[]; // 1-based near-empty pages
export function formatPageList(pages: readonly number[]): string;                    // [1, 2, 3, 7] -> "1–3, 7"
export function pdfDate(value: unknown): string | null;                              // "D:20261001090000Z" -> "2026-10-01"

// test/fixtures/read/make-fixtures.ts
export function makeReportDocx(): Uint8Array;
export function makeNoDocumentDocx(): Uint8Array;
export function makeReportPdf(): Uint8Array;
export function makeScannedPdf(spec: { pages: number; imageOnlyPages: number[] }): Uint8Array;
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

All transitive licenses are permissive (MIT, BSD-2-Clause, `MIT OR GPL-3.0-or-later` for jszip, `MIT AND Zlib` for pako). All six `read` packages together add about 23 MB unpacked, including this story's about 7 MB.

## Task Breakdown

- [ ] Add `mammoth` `^1.13.0`, `@joplin/turndown-plugin-gfm` `^1.0.68` and `unpdf` `^1.9.0` to `dependencies` and update the lockfile -> R6
- [ ] Write `test/fixtures/read/make-fixtures.ts` (stored-zip DOCX writer, PDF writer, broken inputs) and its determinism test; add the generator line to `SOURCES.md`
- [ ] Write `src/read/vendor.d.ts` for turndown and the GFM plugin -> R2
- [ ] Implement `src/read/docx.ts`: mammoth with the image converter, `promoteFirstRows`, `htmlToMarkdown` with the list-item and image rules, wrapper removal, title, image warning, `conversion_failed` -> R2, R5
- [ ] Implement `src/read/pdf.ts`: pdf.js options, line building, `linesToMarkdown`, `scannedPages`, `formatPageList`, `pdfDate`, metadata, `conversion_failed` -> R3, R5
- [ ] Replace the bodies of `convertDocx` and `convertPdf` in `src/read/index.ts`; remove STORY-003-10's two stub rows from `test/read/read-command.test.ts` -> R1
- [ ] Add the three document routes to `test/read/http-server.ts` -> R1
- [ ] Write `test/read/docx.test.ts`, `test/read/pdf.test.ts` and `test/read/read-documents.test.ts` for S1, S2, S3, S5 and the unit tests in §4.1 -> R2, R3, R4
- [ ] Write `test/e2e/read-documents.test.ts` for S4 (URLs, module trace, packed `package.json`) -> R1, R5, R6

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 10 | `linesToMarkdown`: heading ranks; a wrapped heading joined; bullet and number markers; a paragraph gap; page markers. `scannedPages` at exactly half and below half; `formatPageList`; `pdfDate` (valid, missing, malformed); `htmlToMarkdown`: a headerless table promoted to a GFM header, `[image: alt]` and `[image]`, `- ` / `N. ` list prefixes, the Joplin wrapper removed; `promoteFirstRows` leaves `<thead>` tables alone; the generator returns identical bytes on two calls. |
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

- [[EPIC-003]] (parent; the DOCX, PDF and "likely scanned" scope, and the `read` metric). [[STORY-003-10]] (the command, the dispatcher and the K7 types this story fills). [[STORY-003-04]] (`ingest start --text-file`, which takes `read`'s output for the original file). [[STORY-004-02]] (the dynamic-import pattern for a runtime dependency). [[SPRINT-03]] (sprint plan). The `cleargate-wiki-query` duplicate check (2026-10-17) found no other item that converts DOCX or PDF.

## Why not simpler?

- **Smallest existing surface that could carry this:** `wikeeper ingest start <file> --text-file <file>`, where the agent extracts the text itself; the converter stubs in STORY-003-10's dispatcher.
- **Why isn't extension / parameterization / config sufficient?** Most agents can't open a DOCX at all, and PDF reading differs from agent to agent (architecture.md §7.7). A converter gives every agent the same markdown and tells it when a PDF is a scan.
  - mammoth is the standard semantic DOCX → HTML converter, and turndown with a GFM plugin is the approved HTML → markdown path.
  - unpdf is pdf.js packaged for Node without a native canvas, and its `extractTextItems` gives the font sizes needed to find headings.
  - Generating the fixtures in code instead of committing binaries keeps their provenance reviewable and their bytes stable under `./.gitattributes`.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (EPIC-003 §4 names `src/read/docx.ts` and `src/read/pdf.ts`; `src/read/index.ts`, `test/read/read-command.test.ts`, `test/read/http-server.ts` and `test/e2e/module-trace.ts` come from STORY-003-10; the other files are new and listed as new.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Open: §1.4 Q1 (PDF tables, and with it how EPIC-003's "tables preserved" metric applies to PDF) awaits the human. The draft follows the recommended answer.
