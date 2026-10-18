---
type: spike
id: "SPIKE-003"
parent: ""
children: []
status: "Completed"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/SPIKE-003_token_estimate_calibration.md"
last_ingest: "2026-10-18T07:36:10.626Z"
last_ingest_commit: ""
repo: "planning"
---

# SPIKE-003: Token estimate calibration

## 1. The Question

- Is a dependency-free estimate (characters counted per script, each script with its own weight) within ±20% of the highest real token count among the supported agents' models — Claude Opus 5.5 (Claude Code), OpenAI GPT-6 Astra and GPT-6.1 Sol (Codex), Gemini 4 Argon (Antigravity) — on English, Russian and Georgian text, or does wikeeper have to bundle a tokenizer library to get there?

## 2. Timebox & Kill Criteria

**Timebox:**
- 1 working day from the start of discovery.

**Kill criteria:**
- Win: the estimate is within ±20% of the highest of the models' counts on every sample. Stop; EPIC-007 uses it with no new dependency.
- Switch: the estimate misses ±20% on a language, and one tokenizer library is within ±20% on every sample. Stop; EPIC-007 needs that library, and the human approves the dependency by name (as in SPRINT-03).
- Lose: neither gets within ±20% on Georgian. Stop; EPIC-007 shows the measured error next to each estimate, and the limits allow for it.
- Blocked: no model's real counts can be obtained within ±5%. Stop and return to the sponsor.

[+6,581 bytes not shown — read .cleargate/delivery/pending-sync/SPIKE-003_token_estimate_calibration.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
