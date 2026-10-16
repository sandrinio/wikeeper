---
type: sprint
id: "SPRINT-02"
parent: ""
children: []
status: "Draft"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/SPRINT-02_ingest_and_instructions.md"
last_ingest: "2026-10-16T17:10:29.030Z"
last_ingest_commit: ""
repo: "planning"
---

# SPRINT-02: Ingest pipeline and instructions

> **Draft, not planned.** This file only records the scope that was selected. There is no story decomposition, Sprint Design Review, wave plan or milestone yet; those come at planning time, before Gate 2.

## 0. Stakeholder Brief

- **Sprint Goal (draft, to confirm at planning):** An agent takes a real source from "ingest this" to cited wiki pages through `wikeeper ingest`, under all three permission modes, guided by the real SETUP.md and WIKI.md for the Management profile.
- **Business Outcome:** wikeeper starts doing its job. After SPRINT-01 it installs an empty shell; after SPRINT-02 the agent can set up the wiki properly and fill it from meeting notes, documents and links, with provenance, permissions and a write lock.
- **Risks (top 3):** EPIC-003 is the largest epic so far (about 12 capabilities), so its decomposition may need a split; EPIC-006's structural tests depend on EPIC-003's command names; document-reading libraries (PDF, DOCX, URL) are new dependencies that must stay lazy-loaded.

[+3,725 bytes not shown — read .cleargate/delivery/pending-sync/SPRINT-02_ingest_and_instructions.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
