---
cr_id: CR-008
parent_ref: EPIC-002
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Approved
approved: true
context_source: Code review of the uncommitted Copilot integration on main (2026-10-20), verified in a scratch copy of the testbed and against GitHub's and VS Code's current Copilot docs; the user asked to plan and apply the fixes on 2026-10-20 ("please plan the fix and fix them").
created_at: 2026-10-20T10:13:19Z
updated_at: 2026-10-20T10:13:19Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-20T10:14:05Z
  transition: ready-to-apply
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: claude-opus-5-5
  last_stamp: 2026-10-20T10:30:28Z
  sessions:
    - session: eb8400d2-bb8a-4f0e-85f7-1cd886731bab
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-20T10:15:02Z
---

# CR-008: GitHub Copilot as a fourth agent, with the review fixes

## 0.5 Open Questions

- **Question:** Copilot support was written without a work item, and [[EPIC-002]] lists "Cursor, Copilot and other agents" as out of scope. Does wikeeper keep Copilot as a supported agent?
- **Recommended:** Keep it. The code installs, updates and removes cleanly; this CR records it and fixes what the review found.
- **Human decision:** keep Copilot as a supported agent (2026-10-20, "do as you recommend").

- **Question:** Which shell commands may the Copilot permit hook allow without the user's prompt?
- **Recommended:** Exactly the forms the Claude rules allow (`wikeeper …`, `npx wikeeper …`), plus the pinned form wikeeper installs itself (`npx -y wikeeper@<version> …`, `-y` or `--yes` optional, version digits only). No paths, no other npx flags, no npm aliases.
- **Human decision:** applied as recommended under the 2026-10-20 fix request.

- **Question:** Copilot treats a `preToolUse` hook that exits non-zero as a deny ("Denied by preToolUse hook (hook errored)", GitHub hooks reference, read 2026-10-20). The committed `.github/hooks/wikeeper.json` runs whatever `wikeeper` each teammate has. A teammate without wikeeper on PATH (exit 127), or with a wikeeper older than `hook permit` (unknown command), is refused every shell command and every file edit in Copilot, with no next step. Raised by the designer's PLAN (2026-10-20, ux.md §1.3).
- **Recommended:** let the call through: each Copilot hook command ends in a success exit (`<cmd> || true`, and `<cmd>; exit 0` in the `windows` override), so a missing or older wikeeper leaves Copilot's own permission flow in place, as Claude Code already does. Alternatives were pinning the npx form (latency on every call, still refuses offline) and docs only.
- **Human decision:** let the call through (2026-10-20). The `windows` override is documented by GitHub but not tested here.

- **Question:** Which model does Copilot's `medium` tier select?
- **Recommended:** `claude-sonnet-5.5`, the id GitHub's Copilot CLI reference lists as the general-purpose default (checked 2026-10-20). `claude-sonnet-5` is not a listed id. `small` stays `gpt-6-luna`, which the same list carries.
- **Human decision:** applied as recommended under the 2026-10-20 fix request.

## 1. The Context Override (Old vs. New)

**Obsolete Logic (What to Remove / Forget):**
- wikeeper supports three agents; Copilot is out of scope ([[EPIC-002]] §out-of-scope).
- The Copilot permit hook treats any command whose first word ends in `wikeeper` (any path, any npx flags, any `wikeeper@<spec>`) as a wikeeper command.
- Copilot's `medium` tier is `claude-sonnet-5`, and the code comment gives prices and calls a model the cheapest.
- Each Copilot hook command is the bare wikeeper command, so Copilot denies every shell command and edit when a teammate's wikeeper is missing or older than `hook permit`.
- When `wikeeper hook permit` cannot decide, it reuses the guard's fail-open response: it says "hook guard allowed the write", and for Antigravity it prints an allow decision.
- The README says only Claude Code and Codex are blocked by `--enforce`; `docs/reference.md` says Copilot is blocked, without the VS Code caveat.

**New Logic (The New Truth):**
- Copilot (Copilot CLI and the Copilot agent in VS Code) is the fourth agent: it reads `AGENTS.md`, gets helpers in `.github/agents/*.agent.md`, and with `enforce` on gets `.github/hooks/wikeeper.json` (the write guard and the permit hook).
- The permit hook splits a command into words only on space and tab, as bash does; any other whitespace (no-break space, `\r`, `\v`, U+2028 …) stays inside a word (QA-Verify round 1, 2026-10-20).
- The permit hook decides only commands in these forms: `wikeeper <args>`, `npx wikeeper <args>`, `npx [-y|--yes] wikeeper@<version> <args>`, where `<version>` is digits-dot-digits-dot-digits with an optional prerelease made of letters, digits, dots and hyphens. Anything else is left to Copilot's own approval.
- Copilot's tiers are `small: gpt-6-luna`, `medium: claude-sonnet-5.5`. The comment states where the ids come from and that a user can set any id, with no prices or "cheapest" claims.
- Each Copilot hook entry carries `command: "<cmd> || true"` and `windows: "<cmd>; exit 0"`. wikeeper's own allow, ask and deny answers are JSON on stdout with exit 0, so they still apply; a wikeeper that cannot run leaves the call to Copilot's own permission flow.
- When `wikeeper hook permit` cannot decide, it prints nothing on stdout for any agent, exits 0, and prints one line on stderr: `warning: wikeeper hook permit left the command to the agent's permission settings: <detail>`, where `<detail>` is `no --agent given`, `unknown --agent "<x>"`, `no permit hook for --agent "<a>"`, `no payload on stdin`, `payload larger than 1 MB`, `payload is not valid JSON`, or an internal error message on one line (designer PLAN, 2026-10-20).
- The README and `docs/reference.md` both say Claude Code, Codex and Copilot are blocked under `--enforce`. `docs/reference.md` says the Copilot hooks cover Copilot CLI and VS Code's Copilot agent, not VS Code's Local agent, which reads another hook format; `wikeeper lint` still reports unlogged changes there.

## 2. Blast Radius & Invalidation

- [ ] Invalidate/Update Epic: [[EPIC-002]] (Completed). Its out-of-scope line no longer holds. The epic stays closed; this CR is the record of the change.
- [ ] Invalidate/Update Story: none reopened. [[STORY-002-03]] (model tiers), [[STORY-002-06]] (Antigravity hooks) and the enforce stories are extended, not changed.
- [x] Database schema impacts? No. `AGENT_NAMES` gains `copilot`; config keys are unchanged.
- Shares `templates/system/SETUP.md` and its hash pins with [[CR-007]], which is also uncommitted. The two cannot be committed separately without splitting hunks.
- Sealed red tests from closed stories were edited to add `copilot` to agent lists and file lists (`detect.red`, `subagents.red`, `doctor-reporting.red`, `upgrade-instructions.red`). They are recorded here as re-scopes.
- Known limit: on Windows, the project-local guard form (`"$(git rev-parse --show-toplevel)"/node_modules/.bin/wikeeper`) is POSIX shell syntax, as it already is for Codex and Antigravity; the `windows` override cannot rescue a command PowerShell cannot parse. Recorded only.
- In a repo set up for Claude Code and Copilot, Copilot CLI also runs the Claude hooks in `.claude/settings.json`. The Claude guard fails open, with a warning, on Copilot's patch-string edits; the Copilot guard still blocks them. Recorded only; not changed here.

## Existing Surfaces

- **Surface:** `src/agents/permit.ts:22` — `wikeeperArgs` reads the command's first word (after npx flags) as wikeeper when its basename is `wikeeper`.
- **Surface:** `src/agents/model-tiers.ts:20` — Copilot tier ids.
- **Surface:** `src/commands/hook.ts:79` — `runPermit`, which falls back through `failOpen` in `src/agents/hook-protocols.ts`.
- **Surface:** `src/agents/enforce/claude.ts:18` — the Claude permission rules the permit hook mirrors.
- **Surface:** `./README.md` — the "Works with" paragraph; `docs/reference.md` — the enforce tip and the multi-agent table.
- **Why this CR extends rather than rebuilds:** the Copilot adapter, enforce spec, helpers and doctor checks already work (install, permission change, removal and enforce-off were checked in a scratch testbed copy). Only the command matching, one model id, the permit fallback and two doc lines are wrong.

## Prior work

- [[CR-007]] — the setup model choice applies to all supported agents, Copilot included; it shares `SETUP.md` with this CR.
- [[EPIC-002]] — agent integration; listed Copilot as out of scope.
- [[INITIATIVE-001]] — umbrella initiative, background only.
- No Copilot entries in `.cleargate/delivery/archive/` beyond EPIC-002's out-of-scope line, and none in `.cleargate/FLASHCARD.md`.

## 3. Execution Sandbox

**Modify:**
- `src/agents/permit.ts` — accept only the three command forms.
- `src/agents/enforce/copilot.ts` — hook commands that end in a success exit.
- `src/agents/model-tiers.ts` — `medium: "claude-sonnet-5.5"` and the comment.
- `src/commands/hook.ts` — the permit fallback.
- `src/agents/hook-protocols.ts` — only if the fallback helper lives beside `failOpen`.
- `README.md` — the `--enforce` sentence.
- `docs/reference.md` — the enforce tip and a Copilot note under the multi-agent table.
- `test/agents/permit.test.ts` — forms that must and must not be decided.
- `test/agents/subagents.red.node.test.ts` — the Copilot tier expectation added with the integration.
- `test/agents/hook-guard.test.ts` — the permit fallback.

**Designer-owned:** `docs/ux-map.md`, if the designer records the permit warning.

Do not modify `docs/ux.md`, the guard's own fail-open text, or CR-007's setup wording here.

## Task Breakdown

- [x] Write the failing tests for the four scenarios below.
- [x] Narrow `wikeeperArgs` to the three forms.
- [x] Set Copilot `medium` to `claude-sonnet-5.5` and rewrite the comment.
- [x] Give `runPermit` its own fallback response with the designer's wording.
- [x] Update the README and `docs/reference.md` lines.
- [x] End each Copilot hook command in a success exit, with a `windows` override.
- [x] Run typecheck, the full suite and the build; check the hooks in a scratch copy of the testbed.

## 4. Verification Protocol

**Command/Test:** `npm run typecheck && npm test && npm run build`, then `npx vitest run test/agents test/templates`.

Manual check: in a scratch copy of `~/Documents/Dev/wikeeper-testbed`, `init --agents claude,copilot --enforce`, then pipe sample payloads into `wikeeper hook permit --agent copilot` and `wikeeper hook guard --agent copilot`.

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One way through each hook; the command forms are data, not separate paths. |
| Interfaces | F | One surface, the `hook permit` entry point; the docs are checked as text. |
| Data | T | Command forms; the tier ids. |
| Rules | T | Only wikeeper itself is allowed; a hook that cannot decide never allows. |

```gherkin
Feature: Copilot as a fourth agent, with the review fixes

  @data @rules
  Scenario Outline: The permit hook decides only wikeeper's own command forms
    Given the wiki's permission mode is whitelist
    When Copilot asks the permit hook about "<command>"
    Then the decision is "<decision>"

    Examples:
      | command                                   | decision |
      | wikeeper search x                         | allow    |
      | npx wikeeper status                       | allow    |
      | npx -y wikeeper@0.4.0 rules list          | allow    |
      | npx --yes wikeeper@1.2.3-beta.1 search x  | allow    |
      | npx --package=evil wikeeper search x      | none     |
      | npx wikeeper@npm:evil search x            | none     |
      | ./tmp/wikeeper status                     | none     |
      | /repo/node_modules/.bin/wikeeper status   | none     |
      | npx -p evil wikeeper search x             | none     |
      | wikeeper<U+00A0>search x                  | none     |
      | wikeeper<CR>search x                      | none     |
      | wikeeper<TAB>search x                     | allow    |

  @rules
  Scenario: A permit hook that cannot decide never allows
    Given the permit hook is run for an agent without a permit adapter, or with a payload it cannot read
    When it answers
    Then it prints nothing on stdout
    And it prints one warning line on stderr that names the permit hook, not the guard
    And it exits 0

  @rules
  Scenario: A teammate whose wikeeper cannot run is not blocked
    Given the Copilot hook file is installed with enforce on
    When a hook runs on a machine where wikeeper is missing or predates "hook permit"
    Then the hook command still exits 0 and prints no decision
    And on a machine with this wikeeper, a write outside an ingest is still denied

  @data
  Scenario: Copilot tiers select listed model ids
    When the Copilot tiers are mapped
    Then small selects "gpt-6-luna" and medium selects "claude-sonnet-5.5"

  @rules
  Scenario: The docs say which agents --enforce blocks
    When a reader opens the README and docs/reference.md
    Then both name Claude Code, Codex and Copilot as blocked under --enforce
    And docs/reference.md says VS Code's Local agent is not covered by the Copilot hooks
```

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 5 | One per scenario; the outline counts as one, with its twelve rows. |
| Integration tests | 0 | The hooks are pure functions over a payload; the scratch testbed run covers the installed file. |
| E2E / acceptance tests | 0 | No real Copilot session is available here; the doc limits say so. |

**Verification results (2026-10-20):**
- `npm run typecheck`, `npm test` (188 files, 2353 passed, 1 skipped), `npm run build` and `git diff --check`: pass (QA-Verify round 2).
- QA-Verify round 1 failed on the permit matcher splitting on JS `\s` (NBSP, U+2003, `\r` … forged a program name); fixed by splitting on space and tab only. Round 2 passed, with an adversarial probe of 14 Unicode whitespace characters, backslash escapes, quoting, globs, look-alikes and empty commands: no non-wikeeper program is decided `allow` or `ask`.
- `wikeeper ingest … --drop=1`, `--force-unlock=yes` and `--dr` are refused by the CLI (exit 2), so the permit hook's exact-word match on the destructive flags is safe.
- Designer PLAN gave the wording; designer VERIFY passed (TRANSCRIPT_CHECK partial: no real Copilot session, the `windows` form not run). It ran the installed hook commands with this build, with no wikeeper on PATH and with released 0.4.0: a page write outside an ingest is still denied; the other two exit 0 with no decision. `docs/ux-map.md` J1 11–11a and a new table H record the lines.
- Cross-flow notes (not blocking), for the human to make CRs of or drop: the permit reasons' shape; the guard's `unknown --agent "undefined"`; ux.md §2.4/§5 name only `hook guard`; a word-list row for helper models; skip the model question when helpers don't run; the `copilot-trust` note should cover permission changes; nobody is told to trust the folder; doctor counts the `version` key as a hook; the docs don't say enforce lets a teammate without wikeeper through; `init` adding an agent leaves an old pointer block.

---

## Context Source

**context_source:** Code review on 2026-10-20 of the uncommitted Copilot work on main; scratch testbed runs; GitHub's Copilot hooks reference, CLI command reference and supported-models pages and VS Code's hooks docs, read 2026-10-20. The user asked to plan and apply the fixes on 2026-10-20.

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

The downstream box stays unchecked literally: EPIC-002 is identified but, being Completed, is not reverted to 🔴.
