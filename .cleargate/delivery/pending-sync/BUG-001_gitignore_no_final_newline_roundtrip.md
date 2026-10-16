---
bug_id: BUG-001
parent_ref: EPIC-001 | STORY-001-04 | STORY-001-06
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
severity: P3-Low
reporter: "Orchestrator (SPRINT-01): found by the STORY-001-06 integration probe, confirmed during the SPRINT-01 walkthrough"
approved: false
context_source: STORY-001-06 R2 (verified) · src/core/gitignore.ts applyManagedBlock/stripManagedBlock (verified) · reproduced with dist/cli.js on sprint/S-01 @ 7e55d56
complexity_label: L1
created_at: 2026-10-16T16:30:00Z
updated_at: 2026-10-16T16:30:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T16:43:45Z
  transition: ready-for-fix
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id BUG-001
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T16:43:44Z
  sessions: []
---

# BUG-001: `.gitignore` without a final newline gains one after `init` → `remove`

### Open Questions

- **Question:** How should the fix avoid leaving the separator line behind?
- **Recommended:** Option A. When `applyManagedBlock` creates the block in a non-empty file that does not end with a line break, insert the block at the top of the file, after any BOM, instead of appending it. `stripManagedBlock` already removes the block lines with their terminators, so the user's bytes come back exactly, and no state is needed. Option B was rejected: recording "separator added" in the manifest and removing that line break on `remove` needs a new manifest field and goes wrong when the user has edited the file after `init`.
- **Human decision:** {populated during Brief review}

- **Question:** Fix it in SPRINT-01 or defer it?
- **Recommended:** Fix it in SPRINT-01. The playbook classes this as a `UR:bug`, because it breaks STORY-001-06 R2 ("all other bytes unchanged"), and the sprint branch must not merge to `main` while a `UR:bug` is open. The fix is one function plus tests.
- **Human decision:** {populated during Brief review}

## 1. The Anomaly (Expected vs. Actual)
**Expected Behavior:** `wikeeper remove` strips the managed `.gitignore` block and leaves every other byte of the file unchanged (STORY-001-06 R2). After `init` → `remove`, a pre-existing `.gitignore` is byte-identical to what it was before `init`.

**Actual Behavior:** The original file has user lines and no final line break. `init` appends a line break as a separator before the block, and `remove` strips the block but keeps that separator. The file ends up one byte longer: it gains a trailing `\n` (or `\r\n` for CRLF files).

## 2. Reproduction Protocol

1. `R=$(mktemp -d) && cd "$R" && git init -q`
2. `printf 'node_modules\n*.log' > .gitignore` (two lines, no final newline)
3. `node <repo>/dist/cli.js init --json --agents claude --yes`
4. `node <repo>/dist/cli.js remove --json` (exits 0)
5. `printf 'node_modules\n*.log' | cmp - .gitignore` prints `cmp: EOF on stdin`: the file now has an extra trailing `0a`.

Edge conditions:
- CRLF files: the added separator is `\r\n`.
- A BOM-prefixed file without a final newline behaves the same way.
- Files that already end with a line break are **not** affected.
- `init` creates `.gitignore` when there is none, and `remove` deletes it again; that case is **not** affected.

## 3. Evidence & Context

```
before:
00000000: 6e6f 6465 5f6d 6f64 756c 6573 0a2a 2e6c  node_modules.*.l
00000010: 6f67                                     og
after init:
node_modules$
*.log$
# >>> wikeeper >>>$
.wiki/me.md$
.wiki/.lock$
.wiki/.snapshots/$
.wiki/.cache/$
.wiki/log.md$
# <<< wikeeper <<<$
after remove (exit 0):
00000000: 6e6f 6465 5f6d 6f64 756c 6573 0a2a 2e6c  node_modules.*.l
00000010: 6f67 0a                                  og.
cmp: EOF on stdin
DIFFERENT
```

Source: `src/core/gitignore.ts` `applyManagedBlock` — `const sep = text.length > 0 && !text.endsWith("\n") ? eol : ""; return text + sep + block;`. `stripManagedBlock` removes only the block lines, so `sep` stays. The STORY-001-06 developer recorded the case as a known limitation in its integration round (SPRINT-01 §4 Execution Log).

## 4. Execution Sandbox (Suspected Blast Radius)

**Investigate / Modify:**
- `src/core/gitignore.ts`: `applyManagedBlock`, the create path only. Keep in-place replacement of an existing block unchanged. Keep every exported name and signature.
- `test/gitignore.test.ts`, `test/remove.test.ts`: add the new tests here.

**Do not touch:** any `*.red.node.test.ts`; `stripManagedBlock` (unless a test proves it is needed); `src/commands/*`.

## 5. Verification Protocol (The Failing Test)

**Command:** `npm test -- test/gitignore.test.ts test/remove.test.ts`. Then run the full `npm test`, which includes `test/e2e/goal.test.ts`.

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Both `remove` and `remove --purge` strip the block, and both must restore the bytes. |
| Interfaces | F | CLI only. No other surface writes `.gitignore`. |
| Data | T | The file shape decides the outcome: LF, CRLF and BOM files without a final newline, plus a file that ends with a newline (already correct, must stay correct). |
| Rules | T | STORY-001-06 R2 (all other bytes unchanged); a second `init` changes 0 bytes; a malformed block is still refused. |

```gherkin
Feature: .gitignore round-trip keeps the user's bytes

  @data @rules
  Scenario Outline: init then remove restores the original .gitignore
    Given a git repository whose .gitignore is exactly <original>
    When I run "wikeeper init --json --agents claude --yes"
    And I run "wikeeper remove --json"
    Then .gitignore is byte-identical to <original>

    Examples:
      | original                               |
      | "node_modules\n*.log"                  |
      | "node_modules\r\n*.log"                |
      | "﻿node_modules"                   |
      | "node_modules\n*.log\n"                |

  @paths
  Scenario: remove --purge also restores the original bytes
    Given a git repository whose .gitignore is exactly "node_modules\n*.log"
    When I run "wikeeper init --json --agents claude --yes"
    And I run "wikeeper remove --purge --confirm wikeeper --json"
    Then .gitignore is byte-identical to "node_modules\n*.log"

  @rules
  Scenario: a second init changes 0 bytes
    Given an initialised repository whose original .gitignore had no final newline
    When I run "wikeeper init --json" again
    Then .gitignore is byte-identical to its state after the first init

  Scenario: Error — a malformed managed block is still refused
    Given a .gitignore with "# >>> wikeeper >>>" and no end marker
    When I run "wikeeper init --json --agents claude --yes"
    Then the exit code is 1 with error code "gitignore_malformed"
    And .gitignore is unchanged
```

**Test layers.**

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 4 | `applyManagedBlock` → `stripManagedBlock` round-trip, one per Outline row |
| Integration tests | 0 | No external services; temp directories only |
| E2E / acceptance tests | 4 | One per Gherkin scenario (Outline counts once), via `runCli` against temp repositories |

---

## Prior work

- Related: [[EPIC-001]] (user-owned files are never modified; manifest is the source of truth), [[SPRINT-01]] (goal check: `update`/`remove` change 0 user-owned files), [[EPIC-002]] (every written entry is undone on remove). No existing Bug or CR covers this; archive and FLASHCARD.md checked, none found.

## Context Source

**context_source:** STORY-001-06 R2 (verified), `src/core/gitignore.ts` (verified), reproduced with `dist/cli.js` on `sprint/S-01` at 7e55d56; found by the STORY-001-06 integration probe and logged in the SPRINT-01 §4 Execution Log.

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
