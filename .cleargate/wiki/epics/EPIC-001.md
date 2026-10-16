---
type: epic
id: "EPIC-001"
parent: ""
children: []
status: "Draft"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/EPIC-001_foundation_and_lifecycle.md"
last_ingest: "2026-10-16T13:09:59.928Z"
last_ingest_commit: ""
repo: "planning"
---

# EPIC-001: Foundation and lifecycle

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Build the CLI core (config, paths, --json output, exit codes, ownership manifest, template loader) and the lifecycle commands init / update / remove / doctor / setup, which scaffold .wiki/ from packaged templates and never modify user-owned files.</objective>
  <architecture_rules>
    <rule>The CLI makes no LLM calls and no network calls in this epic.</rule>
    <rule>Package-owned vs user-owned files follow the ownership matrix in architecture.md §4.1; the manifest is the single source of truth for what the package owns.</rule>
    <rule>Every command supports --json and returns a stable exit code (§4 Data Changes).</rule>
    <rule>Agent wiring (blocks, skills, sub-agents, enforce) is called through an integration hook point; its implementation belongs to EPIC-002.</rule>
    <rule>Instruction and template content is placeholder here; EPIC-006 supplies the real text.</rule>
  </architecture_rules>
  <target_files>
    <file path="src/program.ts" action="modify" />
    <file path="src/core/config.ts" action="create" />
    <file path="src/core/paths.ts" action="create" />
    <file path="src/core/output.ts"

[+8,498 bytes not shown — read .cleargate/delivery/pending-sync/EPIC-001_foundation_and_lifecycle.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
