---
spike_id: SPIKE-002
parent_cleargate_id: null
status: Completed
approved: false
ambiguity: 🟢 Low
context_source: "SPRINT-03 planning: STORY-002-09 draft (Claude Code permission docs fetched 2026-10-17) · the human's question 'would you prefer to spike to make sure all work items are accurate?' (2026-10-17) · run by the orchestrator in the session scratchpad with two headless claude -p sessions"
area: enforce
timebox: 2026-10-17T09:05:00Z/2026-10-17T09:35:00Z
kill_criteria: A command that matches an ask rule runs without reaching the permission prompt, or a routine ingest command that matches only the allow rule is prompted
spawned_items: []
concluded_at: 2026-10-17T09:19:23Z
created_at: 2026-10-17T09:19:23Z
updated_at: 2026-10-17T09:19:23Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:20:31Z
  transition: ready-to-investigate
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id SPIKE-002
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T09:20:30Z
  sessions: []
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

| Round | Date | Finding | Confidence |
|---|---|---|---|
| 1 | 2026-10-17 | Throwaway folder with the rules in `.claude/settings.json`, headless `claude -p` (Haiku 5.5, `--permission-mode default`, a logging permission-prompt tool). All six commands reached the prompt, including `abort <id>` and `finish <id>`: the project settings file was not applied in this new, untrusted folder. Inconclusive about the rules; a note for test setups. | high |
| 2 | 2026-10-17 | Same rules passed with `--settings <file>`, plus a control `deny: Bash(echo deny-probe*)`. `abort <id>` and `finish <id>` ran **without** a prompt; `abort <id> --drop`, `apply <id> --force-unlock`, `ingest --json abort <id> --drop` and `npx wikeeper ingest abort <id> --drop` each reached the prompt; `echo deny-probe` was denied. The ask rule wins over the broader allow rule, and the leading `*` after `ingest` also catches a global option before the subcommand. Cost of both runs: $0.013. | high |

## 5. Outcome & Spawned Items

- **Answer: yes.** The ask rules drafted in [[STORY-002-09]] work as written for Claude Code, including the `--json`-before-subcommand and `npx` forms. Codex still needs the drafted fallback (its prefix rules cannot see a later flag). Test setups that use a fresh folder must pass the settings explicitly or use a trusted folder, or the rules are not applied. No new work item.

## Prior work

- [[STORY-002-09]] (the draft this checks), [[CR-003]] (C1), [[CR-001]] (the `ai`-mode allow rules), [[SPRINT-03]].

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
