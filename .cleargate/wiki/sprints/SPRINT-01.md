---
type: sprint
id: "SPRINT-01"
parent: ""
children: []
status: "Draft"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/SPRINT-01_foundation_and_agent_wiring.md"
last_ingest: "2026-10-16T13:53:03.504Z"
last_ingest_commit: "8ef2568f0e8057b195d142358166cda4d938147e"
repo: "planning"
---

# SPRINT-01: Foundation and agent wiring

## 0. Stakeholder Brief

- **Sprint Goal:** `npx wikeeper init` installs a working `.wiki/` and wires it into Claude Code, Codex and Antigravity; `update`, `remove` and `doctor` manage it safely.
- **Business Outcome:** wikeeper becomes installable for real: one command sets up the wiki, the agent instruction block, skills and sub-agent definitions, with an opt-in write guard. Instruction text is placeholder until EPIC-006.
- **Risks (top 3):** `src/program.ts` touched by most stories; hook payload formats for Codex and Antigravity unverified; merging into users' settings files.
- **Metrics:** second `init` changes 0 bytes; `update` / `remove` change 0 user-owned files; CI green on Linux, macOS and Windows; release `0.1.0` cut from the sprint result.

## Sprint Goal

Make `npx wikeeper init` produce a safe, idempotent install that every supported agent picks up, with lifecycle commands that never touch the user's knowledge.

## 1. Consolidated Deliverables

[+12,005 bytes not shown — read .cleargate/delivery/pending-sync/SPRINT-01_foundation_and_agent_wiring.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
