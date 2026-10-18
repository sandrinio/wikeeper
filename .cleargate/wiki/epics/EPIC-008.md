---
type: epic
id: "EPIC-008"
parent: ""
children: []
status: "Draft"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/EPIC-008_fact_archive.md"
last_ingest: "2026-10-18T14:20:31.725Z"
last_ingest_commit: "8988a2c33332accb4c940e26c8f087fd85ed697c"
repo: "planning"
---

# EPIC-008: Fact archive

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Let the wiki shrink without losing knowledge, when the user asks: in a clean-up the user requests, replaced facts and finished entities move from `pages/` to `archive/` (same paths, same page format); ordinary ingests keep recording as today; `ingest finish` lets a fact line leave a page only when the identical line is in the archive; the index, default search and page lint skip the archive; `search --archive` and history searches include it; `status` lists archive candidates.</objective>
  <architecture_rules>
    <rule>Archive, never delete: a fact line dropped from a page must be in `archive/`; every fact line of a deleted page must still be in `pages/` or `archive/`; no fact line ever leaves `archive/`. `ingest finish` enforces all three.</rule>
    <rule>The agent judges which facts are replaced or finished; the CLI makes no judgement and moves nothing itself (architecture.md §2 principle 1).</rule>
    <rule>Facts move to the archive only in a clean-up the user asks for. Ordinary ingests keep recording as today: a replaced fact stays on the page.

[+14,850 bytes not shown — read .cleargate/delivery/pending-sync/EPIC-008_fact_archive.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
