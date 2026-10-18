---
type: epic
id: "EPIC-004"
parent: ""
children: []
status: "Completed"
remote_id: ""
raw_path: ".cleargate/delivery/archive/EPIC-004_search.md"
last_ingest: "2026-10-18T14:20:28.738Z"
last_ingest_commit: "a0f0550394c9b76c2408480449436ca3ad4e5f24"
repo: "planning"
---

# EPIC-004: Search (`wiki_search`)

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Implement `wikeeper search` (wiki_search): ranked full-text search over pages, structured filters over frontmatter and typed links, alias resolution, changes since a date, JSON output, and logging of queries that found nothing.</objective>
  <architecture_rules>
    <rule>CLI only; no MCP tool (D-29).</rule>
    <rule>Deterministic: the same wiki and query always return the same results in the same order.</rule>
    <rule>No embeddings or network; full-text plus structure plus aliases (architecture.md §8).</rule>
    <rule>The page parser is shared with lint (EPIC-005) and index building (EPIC-003).</rule>
  </architecture_rules>
  <target_files>
    <file path="src/wiki/parse-page.ts" action="create" />
    <file path="src/search/engine.ts" action="create" />
    <file path="src/search/filters.ts" action="create" />
    <file path="src/search/aliases.ts" action="create" />
    <file path="src/search/since.ts" action="create" />
    <file path="src/search/misses.ts" action="create" />
    <file path="src/commands/search.ts" action="create" />
    <file path="package.json" action="modify" />

[+5,250 bytes not shown — read .cleargate/delivery/archive/EPIC-004_search.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
