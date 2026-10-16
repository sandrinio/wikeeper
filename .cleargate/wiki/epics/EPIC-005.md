---
type: epic
id: "EPIC-005"
parent: ""
children: []
status: "Draft"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/EPIC-005_lint_status_and_rule_evolution.md"
last_ingest: "2026-10-16T13:11:56.026Z"
last_ingest_commit: ""
repo: "planning"
---

# EPIC-005: Lint, status and rule evolution

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Build the wiki's health and evolution tooling: `lint` for pages, `lint --rules` for kb_instructions.md, `status`, a rule-proposal log so rejected proposals are not re-offered, and a facts dry-run diff for previewing rule changes on old sources.</objective>
  <architecture_rules>
    <rule>Report only: lint never rewrites pages or kb_instructions.md (the one repair, `index rebuild`, lives in EPIC-003).</rule>
    <rule>kb_instructions.md is user-owned; the CLI parses it but only the agent edits it, after user approval (D-14).</rule>
    <rule>Uses the shared page parser from EPIC-004 and the log format from EPIC-003.</rule>
    <rule>Every check has an id, a severity (error / warning) and a --json form; errors give a non-zero exit code.</rule>
  </architecture_rules>
  <target_files>
    <file path="src/lint/checks.ts" action="create" />
    <file path="src/lint/links.ts" action="create" />
    <file path="src/lint/citations.ts" action="create" />
    <file path="src/lint/unlogged.ts" action="create" />
    <file path="src/lint/staleness.ts" action="create" />
    <file path="src/lint/rules-lint.ts" action="create"

[+5,934 bytes not shown — read .cleargate/delivery/pending-sync/EPIC-005_lint_status_and_rule_evolution.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
