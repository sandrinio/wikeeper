---
bug_id: BUG-002
parent_ref: EPIC-002 | STORY-002-06
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
severity: P2-Medium
reporter: "Orchestrator (SPRINT-01 walkthrough): found while observing the walkthrough-wiki test session, reproduced in a throwaway repo"
approved: false
context_source: STORY-002-06 R6/R7 + Review clarifications (verified) · SPRINT-01 Goal Acceptance Check item 3 · src/agents/enforce/{json-merge,index}.ts (verified) · reproduced with dist/cli.js on sprint/S-01 @ 7e55d56
complexity_label: L1
created_at: 2026-10-16T17:02:00Z
updated_at: 2026-10-16T17:02:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T17:01:00Z
  transition: ready-for-fix
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id BUG-002
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:01:00Z
  sessions: []
---

# BUG-002: `remove` leaves `.claude/settings.json.bak` behind after a permission-mode change

### Open Questions

- **Question:** Which side should the fix go on: stop writing the backup, or clean it up on `remove`?
- **Recommended:** Both.
  - (1) `saveJsonDoc` and `applyEnforce` do not write a `.bak` for a settings file that wikeeper created, meaning the file's owned manifest entries carry `created: true`. Such a file contains nothing of the user's to back up.
  - (2) Defence in depth: whenever `removeEnforce` deletes a settings file (created and empty after stripping) or restores it from its backup, it also deletes the `.bak` that the manifest records as wikeeper's. A `.bak` is kept only in the existing "file changed since init" case, which stays listed in `kept` with its warning.
- **Human decision:** {populated during Brief review}

- **Question:** Fix it in SPRINT-01 or defer it?
- **Recommended:** Fix it in SPRINT-01. This is a `UR:bug`: it breaks STORY-002-06 R7 (`remove` takes out exactly the entries wikeeper added) and Goal Acceptance Check item 3 ("after `remove`, no wikeeper-owned file or block remains"). The sprint branch must not merge to `main` while it is open.
- **Human decision:** {populated during Brief review}

## 1. The Anomaly (Expected vs. Actual)
**Expected Behavior:** After `wikeeper remove`, nothing that wikeeper wrote remains. Directories that wikeeper created and that are now empty are deleted. For a `.claude/settings.json` that wikeeper itself created, that covers the file, any backup of it, and `.claude/`.

**Actual Behavior:** `init --enforce` creates `.claude/settings.json`. Changing `ingest.permission` and then running `update` makes `saveJsonDoc` copy that wikeeper-created file to `.claude/settings.json.bak`, which the manifest records as `{kind: "hook", identity: "backup"}`. `update` reports the backup under `added`. On `remove`, `removeEnforce` deletes `settings.json` because it was created and is empty after stripping. It leaves `settings.json.bak` on disk and reports nothing about it. `.claude/` then stays too, because it is not empty.

## 2. Reproduction Protocol

1. `R=$(mktemp -d) && cd "$R" && git init -q`
2. `wikeeper init --json --agents claude --enforce --yes` (creates `.claude/settings.json` with the guard and the `ask` rules)
3. `printf 'ingest:\n  permission: ai\n' >> .wiki/config.yml`
4. `wikeeper update --json`: the result includes `"added":[".claude/settings.json.bak"]`
5. `wikeeper remove --json` (exits 0)
6. `find . -path ./.git -prune -o -print` lists `./.claude` and `./.claude/settings.json.bak`

Edge conditions:
- The bug needs a settings file that wikeeper created **and** a later change to it, which `update` makes after the permission mode or the agent list changes.
- A user's pre-existing `settings.json` is backed up at `init` and restored from the `.bak` on `remove` when nothing changed; that path is not affected.
- Codex `.codex/hooks.json` and Antigravity `.agents/hooks.json` go through the same `saveJsonDoc` path, so they are presumably affected the same way. The fix and its tests cover all three.

## 3. Evidence & Context

```
init exit 0: .claude = agents settings.json skills
{"ok":true,"command":"update","data":{"replaced":[".claude/settings.json"],"added":[".claude/settings.json.bak"],"removed":[],"backed_up":[],"warnings":[]},"warnings":[]}
.claude after update = agents settings.json settings.json.bak skills
{"ok":true,"command":"remove","data":{"removed":[".agents",".agents/skills",...,".claude/settings.json",".claude/skills",...,"AGENTS.md"],"kept":[".claude",".wiki/config.yml",".wiki/index.md",".wiki/kb_instructions.md",".wiki/log",".wiki/pages",".wik...
remove exit 0
--- left after remove:
.
./.claude
./.claude/settings.json.bak
./.wiki
./.wiki/config.yml
...
```

The same `.bak` was written in the live test repo (`~/walkthrough-wiki`) when the permission mode changed from `ask` to `ai`, and the test agent's `git add -A` committed it.

Source:
- `src/agents/enforce/json-merge.ts` `saveJsonDoc`: `if (doc.existed && opts.backup !== false) copyFile(doc.abs, doc.abs + ".bak", COPYFILE_EXCL)`. It runs whenever the file exists, including one that wikeeper created.
- `src/agents/enforce/index.ts` `removeEnforce`: the `created && next is {}` branch calls `rm(file)` and never touches the recorded backup.

## 4. Execution Sandbox (Suspected Blast Radius)

**Investigate / Modify:**
- `src/agents/enforce/index.ts`: `applyEnforce` (skip the backup for created files) and `removeEnforce` (delete the recorded backup when the file is deleted or restored).
- `src/agents/enforce/json-merge.ts`: only if `saveJsonDoc` needs the created flag passed through `opts`. Keep every exported name and signature; add only optional fields.
- `test/agents/enforce.test.ts`: add the new tests here.

**Do not touch:** any `*.red.node.test.ts`; `src/agents/index.ts`; core commands.

## 5. Verification Protocol (The Failing Test)

**Command:** `npm test -- test/agents/enforce.test.ts`. Then run the full `npm test`, which includes `test/e2e/goal.test.ts`.

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Two triggers change a settings file that wikeeper created: a permission-mode change and an agent-list change, each followed by `update`. |
| Interfaces | F | CLI only. |
| Data | T | All three agents' settings files (Claude `settings.json`, Codex `hooks.json`, Antigravity `hooks.json`) go through the same backup path. |
| Rules | T | R7 (remove takes out exactly what wikeeper added); a user's own pre-existing file still gets its backup and byte restore; a user-changed file keeps its `.bak` with a warning. |

```gherkin
Feature: remove leaves no wikeeper backup behind

  @paths @data
  Scenario Outline: a settings file wikeeper created is never backed up and leaves nothing behind
    Given a repository initialised with "wikeeper init --json --agents <agent> --enforce --yes"
    And ingest.permission is changed from "ask" to "ai" in .wiki/config.yml
    When I run "wikeeper update --json"
    Then no "<file>.bak" exists and the update report lists no backup
    When I run "wikeeper remove --json"
    Then neither "<file>" nor "<file>.bak" exists
    And no directory that wikeeper created remains

    Examples:
      | agent       | file                  |
      | claude      | .claude/settings.json |
      | codex       | .codex/hooks.json     |
      | antigravity | .agents/hooks.json    |

  @paths
  Scenario: an agent-list change followed by update behaves the same
    Given a repository initialised with "--agents claude,codex --enforce --yes"
    When agents are changed to "claude" in config.yml and I run "wikeeper update --json"
    And I run "wikeeper remove --json"
    Then no settings file, backup or created directory remains

  @rules
  Scenario: a user's own settings file still gets its backup and exact restore
    Given .claude/settings.json exists with the user's keys before init
    When I run "wikeeper init --json --agents claude --enforce --yes" and then "wikeeper remove --json"
    Then .claude/settings.json is byte-identical to the original and no .bak remains

  Scenario: Error — a user-changed settings file keeps its backup with a warning
    Given a user's settings file that was backed up at init and edited by hand afterwards
    When I run "wikeeper remove --json"
    Then the .bak is kept, listed under "kept", with the warning "changed since init; backup kept"
```

**Test layers.**

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 2 | Backup skipped when created; backup deleted on delete or restore |
| Integration tests | 0 | No external services; temp directories only |
| E2E / acceptance tests | 4 | One per Gherkin scenario (Outline counts once), via `runCli` in temp repositories |

---

## Prior work

- Related: [[EPIC-002]] (every written entry is recorded and undone on remove), [[SPRINT-01]] (Goal Acceptance Check item 3), [[EPIC-001]] (manifest is the source of truth). No existing Bug or CR covers this; archive and FLASHCARD.md checked, none found.

## Context Source

**context_source:** STORY-002-06 R6/R7 and its 2026-10-16 Review clarifications (verified), `src/agents/enforce/json-merge.ts` and `src/agents/enforce/index.ts` (verified), reproduced with `dist/cli.js` on `sprint/S-01` at 7e55d56 during the SPRINT-01 walkthrough.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Fix):
- [x] Reproduction steps are 100% deterministic.
- [x] Actual vs. Expected behavior is explicitly defined.
- [x] Raw error logs/evidence are attached.
- [x] Verification command (failing test) is provided.
- [ ] `approved: true` is set in the YAML frontmatter.
