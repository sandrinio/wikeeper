---
type: sprint
id: "SPRINT-04"
parent: ""
children: []
status: "Completed"
remote_id: ""
raw_path: ".cleargate/delivery/archive/SPRINT-04_token_gauges_and_fact_archive.md"
last_ingest: "2026-10-19T06:07:20.577Z"
last_ingest_commit: "6cffdc71050fe2835a3706c65378b28da6d44266"
repo: "planning"
---

# SPRINT-04: Token gauges and fact archive

## Human decisions (2026-10-18)

- **Token counts measure content:** each document, each page and the wiki in total. What the agent loads or spends is not measured.
- **Levels:** documents and pages get green, yellow and red; the wiki total is a number with no level.
- **Defaults** (written by `init`, changeable with `wikeeper config set`): page 4k / 10k, document 20k / 60k, approval at yellow.
- **Command:** a general `wikeeper config get / set / unset`.
- **Archive:** ordinary ingests keep recording as today. Facts move to the archive only in a clean-up the user asks for. The agent tells the user once when a page turns red, and the user decides whether to raise the limit or ask for a clean-up. A deleted page's facts must survive in `pages/` or `archive/`.
- **Spike method:** real counts from `claude -p` on the human's subscription; no API keys.
- **Version check and upgrade (EPIC-009, added the same day):** wikeeper checks npm for a newer version from ingest commands (at most once a day, saved, opt-out); `wikeeper upgrade` runs npm itself; in this sprint.

[+70,224 bytes not shown — read .cleargate/delivery/archive/SPRINT-04_token_gauges_and_fact_archive.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
