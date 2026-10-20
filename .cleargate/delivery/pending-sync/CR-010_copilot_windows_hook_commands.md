---
cr_id: CR-010
parent_ref: CR-008
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Approved
approved: true
context_source: Review of CR-008's Windows coverage on 2026-10-20 (the user asked whether Windows is covered, then agreed to a CR and a draft PR); GitHub's Copilot hooks reference and VS Code's hooks docs, read 2026-10-20; src/agents/enforce/copilot.ts and guard-command.ts. Approved for implementation on 2026-10-20 ("approved"); the human tests on Windows in a separate session.
created_at: 2026-10-20T13:40:00Z
updated_at: 2026-10-20T13:40:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-20T13:36:43Z
  transition: ready-to-apply
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id CR-010
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-20T13:26:13Z
  sessions: []
---

# CR-010: Copilot hook commands that run on Windows

## 0.5 Open Questions

- **Question:** Which fields of each `.github/hooks/wikeeper.json` entry carry the Windows command?
- **Recommended:** add `powershell`, the field Copilot CLI reads on Windows, and keep `windows`, the field VS Code's own hook format reads; both hold the same PowerShell command. `command` stays the POSIX form: Copilot CLI copies it to `bash` when `bash` is absent, and VS Code runs it on macOS and Linux.
- **Human decision:** approved as recommended (2026-10-20): `powershell` and `windows`, same PowerShell command.

- **Question:** Does the PowerShell form call the `.cmd` shims (`wikeeper.cmd`, `npx.cmd`, `node_modules/.bin/wikeeper.cmd`) or the bare names?
- **Recommended:** the `.cmd` shims. npm also installs a `wikeeper.ps1` next to `wikeeper.cmd`, and PowerShell picks the `.ps1` for a bare name. Windows PowerShell's default script policy refuses `.ps1` files, so the guard would silently never run. A `.cmd` runs whatever the script policy is.
- **Human decision:** approved as recommended (2026-10-20): the `.cmd` shims.

- **Question:** How is this verified without a Copilot session on Windows?
- **Recommended:** a test that runs each PowerShell command in a real PowerShell, with a stub wikeeper and the hook payload on stdin. It uses `pwsh` where it is installed (every GitHub runner) and also `powershell.exe` on Windows, and is skipped where neither exists (this Mac). CI on the draft PR runs it on Windows. A check in a real Copilot CLI session on Windows is optional and done by the human.
- **Human decision:** approved as recommended (2026-10-20). The human will check it in Copilot on Windows in a separate session.

## 1. The Context Override (Old vs. New)

**Obsolete Logic (What to Remove / Forget):**
- CR-008 put the PowerShell form in a `windows` field. Copilot CLI's `.github/hooks` entries take `bash` and `powershell`; `windows`, `linux` and `osx` are VS Code's fields and the agent-scoped (custom agent frontmatter) fields. So Copilot CLI on Windows most likely runs `command`, `<cmd> || true`, in PowerShell:
  - Windows PowerShell 5.1 can't parse `||`, so every shell command and every file edit would be denied.
  - PowerShell 7 parses `||`, but `true` isn't a command there, so a missing wikeeper still ends non-zero and Copilot denies the call.
- CR-008's "Known limit" line: the project-local form (`"$(git rev-parse --show-toplevel)"/node_modules/.bin/wikeeper …`) is bash syntax, and PowerShell can't parse it. A command that doesn't parse never reaches `exit 0`, so it fails closed, not open. That line said "Recorded only".
- The PowerShell form calls bare `wikeeper` and `npx`, which resolve to `.ps1` shims that a default script policy refuses.

**New Logic (The New Truth):**
- Each Copilot hook entry carries `command` (POSIX: `<cmd> || true`), `powershell` and `windows` (both the same PowerShell form), and `timeout`.
- The PowerShell form of each guard form, for the guard and for `hook permit … --permission <mode>`:
  - path: `wikeeper.cmd hook guard --agent copilot; exit 0`
  - npx: `npx.cmd -y wikeeper@<version> hook guard --agent copilot; exit 0`
  - local: `& "$(git rev-parse --show-toplevel)/node_modules/.bin/wikeeper.cmd" hook guard --agent copilot; exit 0`
- In PowerShell, as in POSIX shells, wikeeper's own decision is passed through: its JSON on stdout with exit 0. A wikeeper that is missing, too old or can't start ends with exit 0 and no stdout, so Copilot's own permission flow applies.
- `wikeeper update` rewrites an existing Copilot hook file to the new entries, as it already does for any changed entry.

## 2. Blast Radius & Invalidation

- [ ] Invalidate/Update Story: none reopened. Extends [[CR-008]], which is not yet Completed; its "Known limit" line is superseded by this CR.
- [ ] Invalidate/Update Epic: [[EPIC-002]] (Completed) owns the enforce hooks; it stays closed.
- [x] Database schema impacts? None. The manifest keeps the same entries; only their values change.
- Out of scope, recorded: Codex and Antigravity hooks written in the project-local form are also bash syntax. Their Windows shells aren't documented, and they have no per-platform field.
- Out of scope, recorded: VS Code's hooks docs (read 2026-10-20) say its Local harness also reads Copilot-compatible files in `.github/hooks` and maps their fields. If so, `docs/reference.md`'s note that the hooks don't cover VS Code's Local agent is too cautious. Checking that needs a VS Code session; it's a separate CR if the human wants it.
- Out of scope: Copilot's permit hook on Windows. GitHub's reference maps the Windows `powershell` tool to the Claude name `Bash`, so the `Bash` matcher already fires there. The permit parser already refuses `$`, quotes, brackets, backticks, `;`, `&`, `|`, `<`, `>` and newlines, so it refuses PowerShell's variables, subexpressions and escapes too.
- No CLI output, template or agent instruction changes, so the design review does not run.

## Existing Surfaces

- **Surface:** `src/agents/enforce/copilot.ts:11` — `hookEntry` builds each entry's `command` and `windows` from the one guard command string.
- **Surface:** `src/agents/enforce/guard-command.ts:68` — `guardCommand` builds the path, local and npx forms; `src/agents/enforce/index.ts:189` passes the result to each agent's `items()`.
- **Surface:** `test/agents/permit.test.ts:123` — pins the `command` and `windows` text.
- **Why this CR extends rather than rebuilds:** the forms, the entry builder and the success-exit design exist. Only the Windows field name and the PowerShell text for each form change.

## Prior work

- [[CR-008]] — Copilot as a fourth agent; added the `windows` field and recorded the local-form limit.
- [[CR-009]] — doctor and docs for Copilot's enforce state; touches the same hook file but not its commands.
- [[EPIC-002]] — agent integration and the enforce hooks.

## 3. Execution Sandbox

**Modify:**
- `src/agents/enforce/copilot.ts` — add `powershell`; build the PowerShell form for each guard form.
- `src/agents/enforce/guard-command.ts` — a PowerShell variant of `guardCommand`, if the form is needed to build it.
- `src/agents/enforce/index.ts` — pass the form or the PowerShell command to `items()`, if needed.
- `test/agents/permit.test.ts` — the entry text pins.
- `.cleargate/delivery/pending-sync/CR-008_copilot_agent_support.md` — mark the "Known limit" line superseded by CR-010.

**Add:**
- `test/agents/copilot-powershell.node.test.ts`

## Task Breakdown

- [x] Write the red tests: the entry fields and the PowerShell text for each form; the PowerShell run test.
- [x] Build the PowerShell form for the path, npx and local forms, and write it to `powershell` and `windows`.
- [ ] Run the PowerShell test where a PowerShell exists; push to the draft PR and read the Windows CI result.
- [x] Mark CR-008's known-limit line superseded.

## 4. Verification Protocol

**Command/Test:** `npm run typecheck && npm test && npm run build`, and CI green on `windows-latest` on the draft PR (the PowerShell test runs there).

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Three guard forms (path, npx, local), each with its own PowerShell text. |
| Interfaces | T | Two hook readers: Copilot CLI reads `powershell`, VS Code reads `windows`; POSIX shells still run `command`. |
| Data | F | The payload's shape doesn't change the command; the hooks' decisions are covered by CR-008's tests. |
| Rules | T | Never deny because wikeeper can't run; always pass wikeeper's decision through. |

```gherkin
Feature: Copilot hook commands that run on Windows

  @interfaces
  Scenario: Each Copilot hook entry carries a Windows command for both hook readers
    Given a Copilot wiki with enforce on
    When .github/hooks/wikeeper.json is written
    Then each entry has command "<cmd> || true"
    And powershell and windows both hold the PowerShell form ending in "; exit 0"

  @paths
  Scenario Outline: The PowerShell form of each guard form parses and runs
    Given the <form> guard form and a stub wikeeper.cmd that prints a deny decision
    When PowerShell runs the hook's PowerShell command with a payload on stdin
    Then the stub receives the payload and its decision is on stdout
    And PowerShell exits 0

    Examples:
      | form  |
      | path  |
      | npx   |
      | local |

  @rules
  Scenario: A wikeeper that can't run doesn't block Copilot on Windows
    Given no wikeeper on PATH and none in the project
    When PowerShell runs each hook's PowerShell command with a payload on stdin
    Then it exits 0 with nothing on stdout

  @rules
  Scenario: The POSIX command is unchanged
    Given a Copilot wiki with enforce on
    When .github/hooks/wikeeper.json is written
    Then each entry's command is the same as before this change
```

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 2 | The entry fields; the PowerShell text for each form. |
| Integration tests | 2 | Real PowerShell runs: each form with a stub (pwsh, and powershell.exe on Windows), and no wikeeper; skipped where no PowerShell exists. |
| E2E / acceptance tests | 0 | No Copilot session on Windows is available here; the human may check one by hand. |

**Verification results (2026-10-20):**
- `npm run typecheck`, `npm test` (190 files, 2363 passed, 2 skipped), `npm run build` and `git diff --check`: pass (QA-Verify PASS, 4/4 scenarios mapped, no gaps).
- No PowerShell on the maintainer's Mac, so the real-PowerShell cases run only on CI (draft PR #3: ubuntu, macos, windows); a CI-only test fails the job if CI finds no PowerShell. The stub that exits 1 now leaves a marker, so that case proves the stub ran (QA advisory).
- Manual check in a scratch copy of the testbed: `init --agents claude,copilot --enforce` writes `powershell` and `windows`; a hook file reverted to the CR-008 shape is rewritten by `update`; doctor reports `0 errors, 0 warnings`.
- Pending: the Windows CI result on PR #3, and the human's check in Copilot CLI on Windows (separate session).

---

## Context Source

**context_source:** Review of CR-008's Windows coverage on 2026-10-20: the user asked "can you confirm if we're also considering windows?" and then agreed to a CR and a draft PR (PR #3). Grounded in GitHub's Copilot hooks reference and VS Code's hooks docs (read 2026-10-20) and in `src/agents/enforce/copilot.ts` and `guard-command.ts`.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity — approved with an explicit downstream-reset exception (EPIC-002 is Completed and stays closed)**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] "Obsolete Logic" to be evicted is explicitly declared.
- [ ] All impacted downstream Epics/Stories are identified and reverted to 🔴 High Ambiguity.
- [x] Execution Sandbox contains exact file paths.
- [x] Verification command is provided.
- [x] `approved: true` is set in the YAML frontmatter.
- [x] Existing Surfaces cites at least one source-tree path the CR extends.
