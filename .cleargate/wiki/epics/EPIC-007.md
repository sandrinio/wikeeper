---
type: epic
id: "EPIC-007"
parent: ""
children: []
status: "Draft"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/EPIC-007_token_gauges.md"
last_ingest: "2026-10-18T07:36:55.026Z"
last_ingest_commit: ""
repo: "planning"
---

# EPIC-007: Token gauges

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Estimate offline how many tokens the content holds — each source document, each page, and the wiki in total — and show it in status, a one-line status command, search, read, ingest start/plan/finish and lint, with green/yellow/red levels for documents and pages; make ingest start ask for approval when a document is at or above its limit; let the user view and change the limits from the CLI.</objective>
  <architecture_rules>
    <rule>Offline and deterministic: no model calls, no API keys (architecture.md §2 principle 1). Every count is an estimate and is printed with "≈". The method is SPIKE-003's weighted character count (measured error ±15%), with no new dependency.</rule>
    <rule>The CLI is the gate (principle 2): the size approval is exit 3 `needs_approval` from `ingest start`, in every permission mode, cleared by `--approved`.

[+18,095 bytes not shown — read .cleargate/delivery/pending-sync/EPIC-007_token_gauges.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
