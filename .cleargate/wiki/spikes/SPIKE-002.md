---
type: spike
id: "SPIKE-002"
parent: ""
children: []
status: "Completed"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/SPIKE-002_claude_ask_rules_for_flags.md"
last_ingest: "2026-10-17T09:20:31.543Z"
last_ingest_commit: ""
repo: "planning"
---

# SPIKE-002: Does a mid-command wildcard ask rule make Claude Code prompt for `--drop` and `--force-unlock`?

## 1. The Question

- With `allow: Bash(wikeeper ingest *)` and `ask: Bash(wikeeper ingest *--drop*)` / `Bash(wikeeper ingest *--force-unlock*)` (and the `npx` forms) in a project's Claude Code settings, does `wikeeper ingest abort <id> --drop` reach the permission prompt while `wikeeper ingest abort <id>` runs without one?

## 2. Timebox & Kill Criteria

**Timebox:**
- 30 minutes on 2026-10-17; at most two headless `claude -p` runs on the smallest model.

**Kill criteria:**
- A command that matches an ask rule runs without reaching the permission prompt.
- A routine ingest command that matches only the allow rule is prompted while the settings are loaded.

## 3. Decision Unblocked

Whether [[STORY-002-09]] can use Claude Code ask rules for the two destructive flags ([[CR-003]] C1, Open Question 3), or must fall back to prompting for every `abort`. Waiting: the human at Gate 1 for STORY-002-09.

## 4. Decision Log

[+2,394 bytes not shown — read .cleargate/delivery/pending-sync/SPIKE-002_claude_ask_rules_for_flags.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
