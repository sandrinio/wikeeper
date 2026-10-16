---
story_id: STORY-006-08
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-006 (approved 2026-10-16, amended for contract 13) · human decision 2026-10-16 (close the setup-file gaps with a doctor check, keep update as STORY-002-08 R4 has it) · decomposition contract 13 · verified src/commands/doctor.ts, src/core/integrations.ts, src/core/gitignore.ts, src/core/paths.ts, src/core/config.ts, test/doctor.red.node.test.ts
actor: AI coding agent finishing setup or onboarding, and a person running wikeeper doctor
complexity_label: L2
parallel_eligible: y
dep_predecessors:
  - STORY-002-07
  - STORY-006-02
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T23:30:00Z
updated_at: 2026-10-16T23:30:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 1
draft_tokens:
  input: null
  output: null
  cache_read: null
  cache_creation: null
  model: null
  sessions: []
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:57:43Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: a7ec45674846319c96d21f35832f7fae7003a21b0b3c6df85753f4fac338971f
---

# STORY-006-08: `wikeeper doctor` checks the setup files
**Complexity:** L2 — one new check module, one small git helper and one line in `doctor.ts`, plus tests. The git calls must work on Linux, macOS and Windows and without git.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent finishing setup or onboarding, and as a person running `wikeeper doctor`, I want doctor to say whether `.wiki/me.md` and `.wiki/project.md` are where they should be — `me.md` present, ignored and not committed; `project.md` present and not ignored — and, when one is not, the cause and the one fix for it, so that a personal profile never reaches the repository and a teammate always gets the project brief.

### 1.2 Detailed Requirements
- **R1 — The check (decomposition contract 13).** `runDoctor` runs a new check with id `setup-files` after `manifest-drift` and before the integration checks, only when the wiki is initialised (`wiki-initialised` is `ok`). It returns one or more entries, all with id `setup-files`; every finding names its file in `file` (`.wiki/me.md` or `.wiki/project.md`). When there is no `error`, `warning` or `info` finding, it returns exactly one `ok` entry. Text output uses the existing `[ok]`/`[info]`/`[warn]`/`[error]` lines with a `fix:` line where given; `--json` returns the entries in `checks`, counted in `errors` and `warnings` as today.
- **R2 — `me.md` findings.**
  - Missing → `info`: the user is not onboarded yet, and the agent onboards them at the next session (`.wiki/system/ONBOARDING.md`). This is normal for a teammate who has just cloned the repository.
  - Tracked by git → `error`, fix "run git rm --cached .wiki/me.md and commit the removal". No ignore rule stops git tracking a file it already tracks.
  - Not ignored → `warning`, with the cause and its fix, the first that applies: (a) a rule re-includes it (a `!` pattern) → name the rule as `<source>:<line>` and its pattern, fix "remove that rule"; (b) `.gitignore` is missing, or has no wikeeper block, or a malformed one (`stripManagedBlock` status `absent` or `malformed`) → fix "run wikeeper init to restore the managed .gitignore block"; (c) otherwise (the block is present but no longer lists `me.md`) → fix "run wikeeper update to refresh the managed .gitignore block" (STORY-002-08 R4).
  - A tracked `me.md` that is also not ignored gets both findings.
- **R3 — `project.md` findings.**
  - Missing while `.wiki/config.yml` has `setup_completed_at` → `warning`, fix "write it with the agent: .wiki/system/SETUP.md, section \"2. The project\"".
  - Missing while setup is not finished → `info`: setup writes it.
  - Present and ignored → `warning` naming the rule as `<source>:<line>` and its pattern: teammates will not get the project brief; fix "remove that rule, or add !/.wiki/project.md after it".
  - Not yet committed is not a finding.
- **R4 — Without git.** When `git` cannot be started, or the root is not inside a git work tree, the git parts of R2 and R3 are skipped with one `info` entry ("git not found; ignore checks skipped" or "not a git repository; ignore checks skipped"), and the presence findings are still reported. A failing git call never turns into an `error`; anything unexpected is caught by doctor's existing guard as today.
- **R5 — Git helper (`src/core/git.ts`).** The only place wikeeper runs git. It starts `git` with `execFile` (no shell), `cwd` = the repository root, a 10-second timeout and `windowsHide`. It answers three questions for a root-relative posix path: is the root in a work tree (`git rev-parse --is-inside-work-tree`), is the path tracked (`git ls-files --error-unmatch -- <path>`, exit 0 = tracked, 1 = not), and which rule decides whether it is ignored (`git check-ignore -v -n -z --no-index -- <path>`, exit 0 or 1 both read; the NUL-separated fields are source, line, pattern, path; an empty pattern means no rule matches, a pattern starting with `!` means the path is re-included, any other pattern means it is ignored). `ENOENT` means git is missing. The runner is injectable so unit tests need no git.
- **R6 — Healthy-install test kept green.** STORY-001-07's healthy-install test (`test/doctor.red.node.test.ts:83`) pins doctor's check ids and expects every check `ok`. A fresh install has no `me.md`, so `setup-files` is `info` there. Its fixture has an empty `.git` directory, not a real repository, so `setup-files` reports three `info` entries there (no `me.md`, no `project.md`, not a git repository). QA-Red re-scopes the test once: it compares the check ids with repeated ids collapsed, the list gains `"setup-files"` after `"manifest-drift"`, and the severity assertion accepts `ok` or `info`; `errors` and `warnings` stay 0 and the exit code stays 0.

### 1.3 Out of Scope
- What `me.md` and `project.md` say: the agent writes them with the user's approval (STORY-006-07, STORY-006-02); doctor checks where they are, not their content or line caps (STORY-006-06 checks the templates' caps).
- Changing `update` to re-add a missing `.gitignore` block: STORY-002-08 R4 stays as it is — a missing block is usually the user's choice, and `init` is the explicit fix.
- Removing a tracked `me.md` from git: doctor names the command; it never runs `git rm` or edits `.gitignore`.
- Reporting setup files in `doctor --json`'s `state` object (STORY-002-07 R3).
- The SETUP.md and ONBOARDING.md lines that run doctor and read this check (STORY-006-02 R7, STORY-006-07 R6).

### 1.4 Open Questions

- None — the check, its severities and the decision to leave `update` unchanged were agreed by the human on 2026-10-16 after the planning Brief.

### 1.5 Risks

- **Risk:** git behaves differently on Windows (path separators, quoting of unusual names, `.exe` resolution), so the ignore answers differ by OS.
- **Mitigation:** posix relative paths passed after `--`, `-z` output so no quoting applies, `execFile("git")` resolves `git.exe` on Windows; the integration tests run against real git in temp repositories on all three CI OSes.
- **Risk:** a user's global excludes file (`core.excludesFile`) ignores `.wiki/project.md`, and the warning names a file outside the repository.
- **Mitigation:** that is the right answer — the rule is named with its source path, and the fix (`!/.wiki/project.md` in the repository's `.gitignore`) works whatever the source.
- **Risk:** the new check breaks STORY-001-07's pinned healthy-install test.
- **Mitigation:** R6 — one QA-Red re-scope in this story; STORY-002-07, which keeps that test unchanged, is upstream, so the re-scope lands after it.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Two successful ways through: with git (ignore and tracking checks) and without git or outside a repository (presence only). |
| Interfaces | T | The finding reaches the user through text output and through `--json`, and sets doctor's exit code. |
| Data | F | Two fixed files with one shape each; the cases are rules, not data shapes. |
| Rules | T | One row per rule in R2 and R3: missing, tracked, not ignored by each cause, ignored project brief. |

```gherkin
Feature: wikeeper doctor checks the setup files

  @rules
  Scenario: A fresh install reports the setup files as information, not as a problem
    Given a git repository where "wikeeper init --yes" has run and neither .wiki/me.md nor .wiki/project.md exists
    When "wikeeper doctor --json" runs
    Then the distinct check ids are "node-version", "wiki-initialised", "config-valid", "manifest-drift", "setup-files", in that order, before any integration check
    And the setup-files entries are "info" for ".wiki/me.md" naming ".wiki/system/ONBOARDING.md" and "info" for ".wiki/project.md"
    And errors and warnings are 0 and the exit code is 0
    And once .wiki/me.md and .wiki/project.md exist, setup-files is exactly one "ok" entry

  @rules
  Scenario Outline: me.md that is not ignored is reported with its cause and fix
    Given a git repository with an initialised wiki and an untracked .wiki/me.md
    And <gitignore>
    When "wikeeper doctor --json" runs
    Then the setup-files entry for ".wiki/me.md" has severity "warning" and a fix containing <fix>

    Examples:
      | gitignore                                                                      | fix                                                        |
      | .gitignore without the wikeeper block                                           | "wikeeper init"                                            |
      | the wikeeper block followed by the line "!/.wiki/me.md"                        | "remove that rule" and the message names ".gitignore:" and "!/.wiki/me.md" |
      | the wikeeper block with its "/.wiki/me.md" line deleted                        | "wikeeper update"                                          |

  @rules
  Scenario Outline: project.md is expected after setup and must not be ignored
    Given a git repository with an initialised wiki and an ignored .wiki/me.md
    And <state>
    When "wikeeper doctor --json" runs
    Then the setup-files entry for ".wiki/project.md" has severity <severity> and names <named>

    Examples:
      | state                                                                    | severity  | named                                   |
      | no .wiki/project.md and "setup_completed_at" set in .wiki/config.yml     | "warning" | "SETUP.md" and "2. The project"         |
      | no .wiki/project.md and "setup_completed_at" unset                       | "info"    | "SETUP.md"                              |
      | .wiki/project.md present and the line "/.wiki/project.md" in .gitignore  | "warning" | ".gitignore:" and "!/.wiki/project.md"  |

  @paths
  Scenario Outline: Without git the presence findings are still reported
    Given an initialised wiki with no .wiki/me.md, where <condition>
    When "wikeeper doctor --json" runs
    Then setup-files has an "info" entry containing <message>
    And the ".wiki/me.md" entry is still "info" and no setup-files entry is "error" or "warning"

    Examples:
      | condition                                    | message                                         |
      | the git runner reports ENOENT                | "git not found; ignore checks skipped"          |
      | the root is not inside a git work tree       | "not a git repository; ignore checks skipped"   |

  @interfaces
  Scenario: Error — a committed me.md makes doctor fail with the fix
    Given a git repository with an initialised wiki where .wiki/me.md was added with "git add -f" and committed
    When "wikeeper doctor" runs
    Then the output has the line "[error] setup-files: .wiki/me.md is committed to git" followed by "  fix: run git rm --cached .wiki/me.md and commit the removal"
    And the exit code is 1
    And "wikeeper doctor --json" has a setup-files entry with severity "error" and file ".wiki/me.md", and errors is at least 1
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repository, write `.wiki/me.md`, run `git add -f .wiki/me.md && git commit -m x`, run `wikeeper doctor` and check the error and fix line; follow the fix and check the error is gone.
- [ ] On Windows (CI or a VM), run `wikeeper doctor` in a repository with `.wiki/me.md` and check `setup-files` is `ok`.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/core/setup-files.ts` |
| Related Files | `src/core/git.ts`, `src/commands/doctor.ts` |
| Test Files | `test/setup-files.test.ts`, `test/git.test.ts` |
| Re-scoped red tests (QA-Red) | `test/doctor.red.node.test.ts` |
| New Files Needed | Yes — `src/core/setup-files.ts`, `src/core/git.ts`, `test/setup-files.test.ts`, `test/git.test.ts` |

### 3.2 Technical Logic
- `src/core/git.ts` (R5): `createGit(root, run = execFileRunner)` returns `{ inWorkTree(): Promise<boolean | "missing">, isTracked(rel): Promise<boolean>, ignoreRule(rel): Promise<IgnoreRule | null> }`. The default runner wraps `execFile("git", args, { cwd: root, timeout: 10_000, windowsHide: true, encoding: "utf8" })` and resolves `{ code, stdout }`, or `"missing"` on `ENOENT`. `ignoreRule` splits stdout on `\0` into source, line, pattern, path; an empty pattern → `null`; otherwise `{ source, line: Number(line), pattern, negated: pattern.startsWith("!") }`.
- `src/core/setup-files.ts` (R1–R4): `checkSetupFiles(root, paths, config, git = createGit(root)): Promise<DoctorCheck[]>`. Paths come from `paths.meFile` and `paths.projectFile` (STORY-006-02), reported with `toPosixRelative`. Order: presence of each file → git availability (one `info` and stop the git part) → for `me.md`: `isTracked`, then `ignoreRule` (ignored when the rule exists and is not negated); for the not-ignored cause read `.gitignore` at the root (`ENOENT` → block missing) and use `stripManagedBlock(text).status` from `src/core/gitignore.ts:99` → for `project.md`: `ignoreRule`. No finding → one `ok` entry.
- `src/commands/doctor.ts`: one `await guard("setup-files", () => checkSetupFiles(root, paths, config))` after the `manifest-drift` guard, skipped when `manifest` is `null` (the wiki is not initialised). The `config` it passes is the one `config-valid` loaded (`src/commands/doctor.ts:146`).
- Messages are one line each and name the file first (`.wiki/me.md is committed to git`), so the agent following SETUP.md step 6 or ONBOARDING.md step 5 can quote them.
- Integration tests create temp repositories with `git init` and run `runDoctor`; unit tests pass a fake runner (ENOENT, exit 128, `-z` output with a negated rule and with an empty pattern).

### 3.3 API Contract (if applicable)

```ts
// src/core/git.ts
export interface IgnoreRule { source: string; line: number; pattern: string; negated: boolean }
export type GitRunner = (args: string[], cwd: string) => Promise<{ code: number; stdout: string } | "missing">;
export interface Git {
  inWorkTree(): Promise<boolean | "missing">;
  isTracked(relPosix: string): Promise<boolean>;
  ignoreRule(relPosix: string): Promise<IgnoreRule | null>;
}
export function createGit(root: string, run?: GitRunner): Git;

// src/core/setup-files.ts
export const SETUP_FILES_CHECK_ID = "setup-files";
export function checkSetupFiles(
  root: string,
  paths: ResolvedPaths,
  config: Pick<WikeeperConfig, "setup_completed_at">,
  git?: Git,
): Promise<DoctorCheck[]>;
```

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | `git.ts`: `-z` parsing (ignored, negated, no rule), `ENOENT` → missing, exit 128 → not a work tree; `setup-files.ts` with a fake `Git`: tracked and not ignored gives both findings |
| Integration tests | 3 | Real git in temp repositories: fresh install, committed `me.md`, `!/.wiki/me.md` rule |
| E2E / acceptance tests | 12 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/doctor.red.node.test.ts` re-scoped by QA-Red (not the Developer) as R6 says, and green; no other doctor test changed.
- [ ] Tests pass on Linux, macOS and Windows CI.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/commands/doctor.ts:73` — `guard(id, fn)` runs a check and turns a throw into an `error` entry; it already accepts an array of entries.
- **Surface:** `src/commands/doctor.ts:220` — `errors`/`warnings` counts; `src/commands/doctor.ts:225` — the `[info]` label already exists.
- **Surface:** `src/core/integrations.ts:8` — the `DoctorCheck` shape (`id`, `severity`, `message`, `fix`, `file`).
- **Surface:** `src/core/gitignore.ts:99` — `stripManagedBlock` reports `absent`/`malformed`/`stripped`, which tells whether the managed block is there; `src/core/gitignore.ts:75` — `me.md` is the block's first entry.
- **Surface:** `src/core/paths.ts:45` — `meFile`; `projectFile` comes from STORY-006-02.
- **Surface:** `src/core/config.ts:11` — `setup_completed_at`.
- **Surface:** `test/doctor.red.node.test.ts:83` — the pinned healthy-install check list R6 re-scopes.
- **Coverage of this requirement:** partial — doctor, its output and the managed block exist; the check and the git helper are net-new (no source file runs git today).

## Prior work

- [[EPIC-006]] (parent; contract 13 setup files), [[STORY-006-02]] (`projectFile`, SETUP.md step 6 runs this check), [[STORY-006-07]] (ONBOARDING.md step 5 runs this check; it leaves `me.md` content checks out, as this story does), [[STORY-002-07]] (doctor reporting, the other SPRINT-02 edit of `doctor.ts`, upstream), [[STORY-002-08]] (R4: `update` refreshes a present block, named as fix (c)), [[STORY-001-07]] (doctor and setup state, whose healthy-install test is re-scoped), [[CR-002]] (A5: doctor reports setup state), [[BUG-001]] (managed-block round trip, fixed in SPRINT-01). Duplicate check (cleargate-wiki-query, 2026-10-16): no item plans a setup-file check or a git helper; for the git helper, none found.

## Why not simpler?

- **Smallest existing surface that could carry this:** the agent running `git check-ignore` itself in SETUP.md step 6 and ONBOARDING.md step 5, as the stories said before this decision.
- **Why isn't extension / parameterization / config sufficient?** The agent's own git call answers only "ignored or not": it cannot tell a missing block from a re-including rule from a committed file, so it gives one fix for three causes, and it is a shell command that may prompt for permission in `ask` and `whitelist` modes. Extending STORY-002-07 instead would push it past five scenarios. A check in doctor reuses doctor's output, exit code and existing allow rule, keeps the rule in one place, and the git helper is the smallest wrapper that answers the three questions.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (EPIC-006 §4 amended on 2026-10-16 to list `src/core/setup-files.ts`, `src/core/git.ts` and `src/commands/doctor.ts`.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
