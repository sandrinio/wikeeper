---
type: epic
id: "EPIC-002"
parent: ""
children: []
status: "Draft"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/EPIC-002_agent_integration.md"
last_ingest: "2026-10-16T13:10:32.386Z"
last_ingest_commit: ""
repo: "planning"
---

# EPIC-002: Agent integration

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Wire wikeeper into Claude Code, Codex and Antigravity: inject the marked pointer block into agent instruction files, install skills and sub-agent definitions, and optionally (--enforce) write write-guard hooks and permission rules; undo all of it on remove.</objective>
  <architecture_rules>
    <rule>An agent file whose WIKI markers already exist is never modified (D-11).</rule>
    <rule>The block goes at the top of the file, after frontmatter if present; line endings and BOM are preserved.</rule>
    <rule>If no agent file exists, create AGENTS.md and ask which others to add (D-12); non-interactive runs return exit code 5 (needs_input).</rule>
    <rule>Every file or entry written is recorded in the EPIC-001 manifest so update/remove can find it.</rule>
    <rule>Merges into user settings files (JSON/TOML) keep every user key and write a .bak first; --enforce is opt-in, init asks, default no (D-30).</rule>
    <rule>Skill and sub-agent text comes from EPIC-006 templates; this epic only installs it.</rule>
  </architecture_rules>
  <target_files>
    <file path="src/agents/detect.ts" action="create" />
    <file

[+8,168 bytes not shown — read .cleargate/delivery/pending-sync/EPIC-002_agent_integration.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
