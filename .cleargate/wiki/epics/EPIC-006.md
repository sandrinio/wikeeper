---
type: epic
id: "EPIC-006"
parent: ""
children: []
status: "Draft"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/EPIC-006_instructions_and_management_profile.md"
last_ingest: "2026-10-16T13:12:25.841Z"
last_ingest_commit: ""
repo: "planning"
---

# EPIC-006: Instructions and Management profile

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Author all package-owned instruction content: SETUP.md, WIKI.md, the Management profile, the kb_instructions.md seed, the me.md template, page templates, the pointer block, skill texts and sub-agent prompts for Claude Code, Codex and Antigravity; plus structural tests that keep the content consistent with the CLI.</objective>
  <architecture_rules>
    <rule>Process lives in package-owned files (SETUP.md, WIKI.md, skills); content rules live in the user-owned kb_instructions.md seed (architecture.md §5).</rule>
    <rule>Questions are the root of kb_instructions.md; the agent drafts them from the profile and me.md and the user approves changes (D-31).</rule>
    <rule>A source is read once; agents hand off facts, not sources; WIKI.md defines the brief template and the facts format (D-16–D-19).</rule>
    <rule>Codex delegates only when told: the wiki-ingest skill states explicitly when to use wiki-extractor and wiki-writer.</rule>
    <rule>Skills use only `name` and `description` frontmatter (Agent Skills standard); sub-agent files follow each agent's documented format (architecture.md §6.2).</rule>

[+7,242 bytes not shown — read .cleargate/delivery/pending-sync/EPIC-006_instructions_and_management_profile.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
