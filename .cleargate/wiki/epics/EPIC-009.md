---
type: epic
id: "EPIC-009"
parent: ""
children: []
status: "Draft"
remote_id: ""
raw_path: ".cleargate/delivery/pending-sync/EPIC-009_version_check_and_upgrade.md"
last_ingest: "2026-10-18T09:46:13.449Z"
last_ingest_commit: ""
repo: "planning"
---

# EPIC-009: Version check and upgrade

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Keep users on the current wikeeper. Ingest commands check npm for a newer version at most once a day (saved, opt-out, never failing the command) and say so in their output. `status` and `doctor` report it from the saved result, and also warn, with no network, when the installed wikeeper and the project's files come from different versions. `wikeeper upgrade` installs the newer version with npm the way wikeeper was installed, then runs the new version's `update` in the project.</objective>
  <architecture_rules>
    <rule>The version check never fails, blocks or changes a command: a timeout, an offline machine, a bad answer or an unwritable cache leaves the command's result and exit code exactly as without the check.</rule>
    <rule>At most one request to npm a day per project. The result, success or failure, is saved in `.wiki/.cache/update-check.json` (already git-ignored) and reused for 24 hours.</rule>
    <rule>The request is one GET for wikeeper's `latest` version from the npm registry. It sends nothing about the wiki.</rule>
    <rule>Only the `ingest` subcommands and `upgrade` contact npm.

[+15,528 bytes not shown — read .cleargate/delivery/pending-sync/EPIC-009_version_check_and_upgrade.md]

## Blast radius
Affects: no parent/child refs declared in frontmatter
