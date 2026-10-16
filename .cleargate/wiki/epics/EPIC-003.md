---
type: epic
id: "EPIC-003"
parent: ""
children: []
status: "Draft"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/EPIC-003_ingest_pipeline.md"
last_ingest: "2026-10-16T13:11:08.324Z"
last_ingest_commit: ""
repo: "planning"
---

# EPIC-003: Ingest pipeline

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Implement the gated three-phase ingest (register → facts → write) with pre- and post-hooks, permission modes, raw-source registry, lock and snapshot, diff-based report, merge-safe log and deterministic index; plus the `wikeeper read` conversion helper.</objective>
  <architecture_rules>
    <rule>Raw files are immutable once written; the CLI never converts during ingest (D-20).</rule>
    <rule>The lock covers the write phase only (apply → finish/abort); register and facts may run in parallel (D-17).</rule>
    <rule>The finish report is computed from the snapshot diff, never from agent claims (D-08).</rule>
    <rule>Permission modes ai / ask / whitelist; whitelist entries match kind and/or origin; unmatched sources are denied (D-06, D-07, D-25).</rule>
    <rule>One log file per event under log/; log.md is a generated, gitignored view; index.md is rebuilt deterministically from page frontmatter (D-28).</rule>
    <rule>Only `read` may touch the network.</rule>
  </architecture_rules>
  <target_files>
    <file path="src/ingest/source-id.ts" action="create" />
    <file path="src/ingest/registry.ts"

[+8,765 bytes not shown — read .cleargate/delivery/pending-sync/EPIC-003_ingest_pipeline.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
