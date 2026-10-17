---
type: sprint
id: "SPRINT-03"
parent: ""
children: []
status: "Active"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/SPRINT-03_lint_status_and_read.md"
last_ingest: "2026-10-17T15:07:28.337Z"
last_ingest_commit: "15e519dd197205f773ad1e496bd640850ed66526"
repo: "planning"
---

# SPRINT-03: Lint, status and read

> **Active since 2026-10-17.** The 21 stories are approved (Gate 1); the human confirmed this plan, the sprint goal and the Goal Acceptance Check (Gate 2) and started the sprint.

## Human decisions (2026-10-17)

- **Scope:** all of EPIC-005, `read` (EPIC-003) and CR-003 in this sprint, as proposed below.
- **`read` dependencies:** approved: `linkedom`, `defuddle`, `mammoth`, `turndown` and `unpdf`, each loaded only when its format is read; first network command (20 s timeout, 10 MB cap); tests never use the internet.
- **Release:** the sprint sets the package version to `0.3.0`; publishing to npm is a separate step the human approves after Gate 4.
- **Walkthrough part 3 (Goal check):** headless, in `~/Documents/Dev/formapass_management`, after execution and before Gate 4. Run as a real user, not as a test (human, 2026-10-17): no walkthrough framing and no logging request in the prompts; plain product-management requests in the human's voice that never name a wikeeper command or WIKI.md; facts mentioned in passing, to see whether the agent records them unprompted; a fresh session per task; some permission prompts declined.

[+52,792 bytes not shown — read .cleargate/delivery/pending-sync/SPRINT-03_lint_status_and_read.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
