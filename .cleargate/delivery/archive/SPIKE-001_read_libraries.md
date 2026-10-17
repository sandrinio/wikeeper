---
spike_id: SPIKE-001
parent_cleargate_id: null
status: Completed
approved: false
ambiguity: 🟢 Low
context_source: "SPRINT-03 planning: STORY-003-10 / STORY-003-11 drafts (dependency table, npm 2026-10-17) · the human's question 'would you prefer to spike to make sure all work items are accurate?' (2026-10-17) · run by the orchestrator in the session scratchpad; nothing installed in the repo"
area: read
timebox: 2026-10-17T09:00:00Z/2026-10-17T09:45:00Z
kill_criteria: Any of the six approved libraries fails to load under Node 22.12 ESM, or text PDFs in Georgian come back without their Georgian text, or DOCX tables are lost
spawned_items: []
concluded_at: 2026-10-17T09:19:23Z
created_at: 2026-10-17T09:15:52Z
updated_at: 2026-10-17T09:19:23Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:20:11Z
  transition: ready-to-investigate
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id SPIKE-001
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T09:20:10Z
  sessions: []
---

# SPIKE-001: Do the approved `read` libraries convert the human's real documents?

## 1. The Question

- On Node 22.12 ESM, do `linkedom` + `defuddle`, `mammoth` + `turndown` + `@joplin/turndown-plugin-gfm`, and `unpdf` turn the human's real web pages, DOCX and PDF files (Georgian and English) into markdown with text, headings and tables kept, and does the drafted "likely scanned" rule flag a PDF whose text is not extractable?

## 2. Timebox & Kill Criteria

**Timebox:**
- 45 minutes on 2026-10-17, in the session scratchpad (no repo changes, no installs in the repo).

**Kill criteria:**
- A library fails to load or convert under Node 22.12 ESM (the package's minimum engine).
- A Georgian text PDF or DOCX comes back without its Georgian text.
- DOCX tables are lost.

## 3. Decision Unblocked

Whether [[STORY-003-10]] and [[STORY-003-11]] can be approved as drafted, with the approved dependency list, or need a different library or a changed rule. Waiting: the human at Gate 1 for the SPRINT-03 stories.

## 4. Decision Log

| Round | Date | Finding | Confidence |
|---|---|---|---|
| 1 | 2026-10-17 | `npm install` of the six packages at the drafted versions (linkedom 0.18.13, defuddle 0.19.5, turndown 7.2.4, @joplin/turndown-plugin-gfm 1.0.68, mammoth 1.13.0, unpdf 1.9.0): 53 packages, 32 MB on disk (largest: @mixmark-io/domino 8.6 MB, defuddle 3.1 MB, underscore 2.6 MB, unpdf 2.5 MB, linkedom 2.5 MB, temml 2.4 MB). No native build. | high |
| 2 | 2026-10-17 | PDF via `unpdf` (`verbosity: 0`, `isEvalSupported: false`): Georgian text PDFs extract cleanly — a 1-page certificate (366 Georgian letters), `doc_processor` form `f100__blank.pdf` (4 pages, 436) and `f100__example.pdf` (4 pages, 6,639), `P1__cnoba_janmrtelobis.pdf` (887); a 26-page English report extracts on every page; 0 replacement characters in all; 80–165 ms per file. | high |
| 3 | 2026-10-17 | The Formapass deck PDF (`FormaPass — პრეზენტაცია (ქართ.).pdf`, 11 pages) has **no extractable Georgian text**: its only font is non-embedded Helvetica, and poppler (`pdftotext`) and MuPDF also find 0 Georgian characters, so the Georgian is drawn as shapes. unpdf returns only Latin words, digits and punctuation: 23–128 non-space characters per page. The drafted rule (fewer than 25 non-space characters on at least half the pages) does **not** flag it. Counting letters (`\p{L}`) instead gives 9–21 letters on 10 of 11 pages and flags it, while none of the five text PDFs is flagged. | high |
| 4 | 2026-10-17 | DOCX via mammoth → turndown + Joplin GFM: the bilingual Formapass agreement (`FormaPass_Agreement_KA_EN_Draft.docx`) gives 50,785 characters, 20,158 Georgian letters, 9 headings, 180 table rows, 0 replacement characters, 245 ms (113 ms of it the first import). The document lays out each Georgian/English pair as its own one-row table, so the output repeats `\| --- \| --- \|` under every row: readable, not wrong. Brackets and underscores in placeholders come out escaped (`\[\_\_\_\]`). | high |
| 5 | 2026-10-17 | Web pages via fetch → linkedom → defuddle (`markdown: true`, `useAsync: false`): en.wikipedia.org/wiki/Markdown (2,835 words, 11 headings, tables kept), github.com/sandrinio/wikeeper (title and README, 18 table rows), ka.wikipedia.org/wiki/საქართველო (38,275 Georgian letters, 34 headings); 0.9–1.3 s each including the fetch; title and word count returned. Links to Georgian pages come out percent-encoded, which makes the markdown long. | high |
| 6 | 2026-10-17 | Node versions: the same DOCX, PDF and URL runs give identical output on Node 22.12.0, 24.14.0 and 25.9.0. First-import cost: defuddle + linkedom about 580 ms, mammoth + turndown about 100 ms, unpdf under 10 ms. | high |
| 7 | 2026-10-17 | The human's presentation also exists as `.pptx`; `read` does not support `.pptx` (architecture §7.7), so for decks the PDF export is the input, and an outlined-text PDF like this one goes to the agent's own PDF reading after the "likely scanned" warning. | medium |

## 5. Outcome & Spawned Items

- **Answer: yes, with one rule change.** All six libraries load and convert on Node 22.12, 24 and 25; Georgian text survives in PDF, DOCX and HTML; DOCX tables are kept. The "likely scanned" rule must count letters (`\p{L}`), not non-space characters: with 25 letters per page on at least half the pages, the Formapass deck is flagged and no text PDF is. [[STORY-003-11]] takes that change; [[STORY-003-10]] and the dependency list stand. Install size is about 32 MB on disk, not 8 MB (the SPRINT-03 plan risk row and the stories say so). No new work item.

## Prior work

- [[STORY-003-10]], [[STORY-003-11]] (the drafts this checks), [[EPIC-003]] (`read` scope), [[SPRINT-03]].

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

**This gate is inverted relative to every other template in this directory. Reaching
green here does NOT mean the answer to Section 1 is known — it means the question is
sharp, the timebox is set, and the kill criteria are falsifiable enough that bounded
discovery can safely start.**

Requirements to pass to Green (Ready for Discovery):
- [x] Section 1 states a single, falsifiable question — not a task list, not a plural.
- [x] Section 2's timebox is a concrete bound, and its kill criteria are conditions that could actually trigger.
- [x] Section 3 names both the decision this spike unblocks and who is waiting on it.
