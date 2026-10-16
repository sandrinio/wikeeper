---
type: initiative
id: "INITIATIVE-001"
parent: ""
children: []
status: "In Triage"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/INITIATIVE-001_wiki_cli.md"
last_ingest: "2026-10-16T11:59:08.609Z"
last_ingest_commit: ""
repo: "planning"
---

# INITIATIVE-001: Wiki CLI — Karpathy-style LLM wiki for AI agents

> Captured from the design conversation of 2026-10-16. Detailed design: `architecture.md` (Draft v0.2), whose decision log (D-01…D-15) records what was agreed.

## 1. User Flow

**Install and setup**
1. The user runs `npx <pkg> init` in a repository.
2. The CLI scaffolds everything under `.wiki/`, injects a short, marked wiki-instructions block at the top of the agent files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`), and installs the wiki skills. If no agent file exists, it creates `AGENTS.md` and asks which others to add. Files that already contain the block are not modified.
3. In the next agent session, the agent sees setup isn't finished and follows the setup instructions: asks the user's name, how to address them and their role (written to `me.md`); confirms the purpose (Management); drafts the capture instructions (`kb_instructions.md`); agrees the ingest permission mode; checks the wiring; offers a first ingest.

[+6,030 bytes not shown — read .cleargate/delivery/pending-sync/INITIATIVE-001_wiki_cli.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
