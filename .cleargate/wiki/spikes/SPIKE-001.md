---
type: spike
id: "SPIKE-001"
parent: ""
children: []
status: "Completed"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/SPIKE-001_read_libraries.md"
last_ingest: "2026-10-17T09:20:11.409Z"
last_ingest_commit: ""
repo: "planning"
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

[+4,614 bytes not shown — read .cleargate/delivery/pending-sync/SPIKE-001_read_libraries.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
