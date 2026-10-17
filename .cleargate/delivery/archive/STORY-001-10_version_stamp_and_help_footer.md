---
story_id: STORY-001-10
parent_epic_ref: EPIC-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
ambiguity: 🟢 Low
context_source: CR-003 F1, F2 and Open Question 5 (approved 2026-10-17; walkthrough rows 0.6, 11.1) · SPRINT-03 decomposition contract K10 and the human decision on version 0.3.0 · EPIC-001 · SPRINT-03 gate1-decisions.md technical calls (`package.json` and `src/program.ts` order; the build stamp never reaches the npx guard) and consistency-audit finding 13 · verified src/program.ts, src/core/templates.ts, src/core/manifest.ts, src/commands/init.ts, src/commands/update.ts, src/agents/enforce/guard-command.ts, package.json, package-lock.json, tsconfig.build.json, test/e2e/pack.ts, test/program.test.ts, .github/workflows/ci.yml
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T09:02:51Z
updated_at: 2026-10-17T09:58:51Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:59:16Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-001-10
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T09:59:23Z
  sessions: []
---

# STORY-001-10: `--version` names the build's commit; version `0.3.0`; `--help` footer
**Complexity:** L2 — a build step that writes the commit into `dist/`, one small runtime module, the version string in three places (`--version`, `--help`, the install manifest) and the packed-CLI helper. Extends STORY-001-01, STORY-001-03, STORY-001-04, STORY-001-05 and STORY-001-09. No in-sprint upstream. It lands first on `package.json` and `package-lock.json` (before STORY-003-10, then STORY-003-11) and edits `src/program.ts` only at `VERSION` and the help footer, outside `defaultCommands`, where STORY-003-10, STORY-005-02, STORY-005-05 and STORY-005-06 each append their command in merge order (gate1-decisions technical call, revised 2026-10-17).

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent checking which wikeeper build a repository uses, I want `wikeeper --version`, the `--help` footer and the install manifest to show the package version plus the commit it was built from, so that two builds of the same version can be told apart and the help no longer suggests its commands are unfinished.

### 1.2 Detailed Requirements
- **R1 — Version `0.3.0`.** `package.json` `version` is `0.3.0`, and `package-lock.json` matches it in both places (`version` and `packages[""].version`). Publishing stays a human step after Gate 4.
- **R2 — The build stamps the commit.** `npm run build` becomes `tsc -p tsconfig.build.json && node scripts/build-info.mjs dist`. The script takes the output directory as its one argument and runs `git rev-parse --short=7 HEAD` in the current directory (the package root under `npm run`), with `execFileSync` (no shell), stdin ignored, a 10-second timeout and `windowsHide`. When git prints a 7 to 64 character hex commit, it writes `<dir>/build-info.json` as `{"commit":"<sha>"}`. When git is not installed, no repository is found (a source tarball, for example), the repository has no commit, or the call fails in any other way, it writes `{"commit":null}`. Either way it exits 0, so a build without git still succeeds. The file is UTF-8 with LF and a trailing newline. A missing argument exits 1 with a usage line. `dist/` is in `package.json` `files`, so `npm pack` and `npm publish` (`prepublishOnly` runs the build) carry the stamp; `dist/` is gitignored, so the stamp is never committed.
- **R3 — `--version` reads the stamp.** `VERSION` in `src/program.ts` is `<package.json version>+<commit>`, or `<package.json version>+dev` when `build-info.json` is missing, does not parse, or holds no valid commit. `wikeeper --version` prints it, for example `0.3.0+a0f0550`. The stamp is read from `build-info.json` next to the compiled `dist/` root (`new URL("../build-info.json", import.meta.url)` from `dist/core/version.js`), so running from source, as the test suite does, finds no file and prints `+dev`. Reading the stamp never throws.
- **R4 — The manifest records the same string.** `init` and `update` default their version to the R3 string instead of `readPackageVersion()` (`src/commands/init.ts:92`, `src/commands/update.ts:85`), so `.wiki/system/manifest.json` `package_version` equals what `--version` prints. A version injected through `deps.packageVersion` is recorded as given, as today.
- **R5 — The npx guard pin drops the build part.** The same value reaches `IntegrationOptions.packageVersion`, which `guardCommand` pins as `npx -y wikeeper@<version>` (`src/agents/enforce/guard-command.ts:72`). The pin uses the version without its `+…` part (`npx -y wikeeper@0.3.0 …`), because npm installs by registry version, and so a rebuild of the same version does not change the hook command (Codex asks for every changed hook to be approved again in `/hooks`).
- **R6 — `--help` footer.** The footer line is `Status: pre-alpha. Version <VERSION>. Docs: <homepage>`, with `<homepage>` read from `package.json` (`https://github.com/sandrinio/wikeeper#readme`). It no longer says "Commands land in upcoming releases" (CR-003 F2). The text is ASCII only. "Status: pre-alpha." stays: CR-003 drops only the "Commands land" phrase, and `README.md` still calls the project pre-alpha.
- **R7 — The packed CLI keeps working and carries the stamp.** `test/e2e/pack.ts` runs `node scripts/build-info.mjs <build>` on its staging build directory after `tsc` (cwd = the package root), so the tarball it packs has `dist/build-info.json` as a real `npm pack` would. It still never writes the repository's own `dist/` (FLASHCARD #e2e: parallel e2e files race on a shared `dist/`).

### 1.3 Out of Scope
- A dirty-tree marker (`+a0f0550.dirty`): CR-003 approved `<version>+<commit>` only.
- The search cache key (`src/search/engine.ts:216`) keeps the plain package version; `remove` and `doctor` keep `readPackageVersion()`, since they write no manifest version and no guard command.
- `README.md` status text and the npm publish itself (Gate 4 doc refresh and a human step).
- CI changes: `actions/checkout@v5` checks out the commit with git metadata (a shallow clone is enough for `git rev-parse`), and `npm run build` already runs as the last CI step.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- None. CR-003 Open Question 5 fixes the format (`0.3.0+a0f0550`, `+dev` without git) and that the manifest records the full string; the human set version `0.3.0` on 2026-10-17; contract K10 fixes the stamp's place in the package. R5 (the npx pin without the build part) follows from the code: `init` and `update` pass one version string to both the manifest and the guard command.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** `test/program.test.ts:22-23` expects `VERSION` and the `--version` output to equal the `package.json` version.
- **Mitigation:** it is a plain test; the Developer changes it to expect `<package.json version>+dev` from source. No red test pins the version string (checked 2026-10-17: `test/cli-core.red.node.test.ts:150` only checks that `--version` exits 0 with output).
- **Risk:** in the build-script test, git run in a temp directory finds a repository above it and reports that commit instead of "no repository".
- **Mitigation:** the test sets `GIT_CEILING_DIRECTORIES` to the temp directory's parent, and the no-git case sets `PATH` to an empty directory for the child.
- **Risk:** `package.json` and `package-lock.json` are also edited by the `read` stories (STORY-003-10, STORY-003-11 add dependencies).
- **Mitigation:** this story changes only the version fields and the `build` script, and it lands first: the order is 001-10, then STORY-003-10, then STORY-003-11 (gate1-decisions technical calls), each regenerating the lock file on top of the one before.
- **Risk:** five stories edit `src/program.ts` this sprint.
- **Mitigation:** this story changes only the `packageJson` type, `VERSION` and the footer (`src/program.ts:23-27`, `:57`), not `defaultCommands` (`src/program.ts:33-43`), where STORY-003-10, STORY-005-02, STORY-005-05 and STORY-005-06 each append one registration line in merge order (gate1-decisions technical call, revised 2026-10-17). STORY-003-10 depends on this story; the other three may merge before or after it, and their lines do not touch this story's.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A build where git names the commit vs a build where it cannot (no repository, no commit, no git). |
| Interfaces | T | The version shows in `--version`, the `--help` footer and the install manifest, from source and from the packed package. |
| Data | F | The stamp is one string; unreadable stamps are covered by the error scenario. |
| Rules | T | The npx pin drops the build part; the old footer text is gone; an invalid stamp falls back to `+dev`. |

```gherkin
Feature: --version tells builds apart; --help names the version and the docs

  @paths
  Scenario Outline: the build stamps the commit, or null when git cannot name one
    Given a temp directory where <where>
    When "node scripts/build-info.mjs out" runs in that directory
    Then it exits 0 and out/build-info.json is <content>
    And the version wikeeper derives from that file is "<package.json version>+<shown>"

    Examples:
      | where                                      | content                                              | shown       |
      | git has a repository with one commit       | {"commit":"<git rev-parse --short=7 HEAD there>"}    | that commit |
      | git has a repository with no commit yet    | {"commit":null}                                      | dev         |
      | git finds no repository (a source tarball) | {"commit":null}                                      | dev         |
      | git is not on PATH                         | {"commit":null}                                      | dev         |

  @interfaces
  Scenario: the packed package carries the stamp and the manifest records the same version
    Given package.json and package-lock.json at version "0.3.0"
    And the package built and packed by test/e2e/pack.ts
    When I run the packed "wikeeper --version", then the packed "wikeeper init --yes" in an empty git repository
    Then --version prints "0.3.0+<c>", where <c> is the commit in the packed dist/build-info.json, or "dev" when it is null
    And when git runs in the wikeeper repository root, <c> is what "git rev-parse --short=7 HEAD" prints there
    And .wiki/system/manifest.json has a package_version equal to the --version output

  @rules
  Scenario: the npx guard command pins the version without the build part
    Given wikeeper is resolvable neither on PATH nor in node_modules/.bin
    When "wikeeper init --agents claude --enforce --yes" runs as version "0.3.0+a0f0550"
    Then the guard hook in .claude/settings.json runs "npx -y wikeeper@0.3.0 hook guard --agent claude"
    And .wiki/system/manifest.json has package_version "0.3.0+a0f0550"
    And after "wikeeper update" runs as version "0.3.0+b1c2d3e", the guard hook command is unchanged and package_version is "0.3.0+b1c2d3e"

  @rules
  Scenario: the help footer names the version and the docs link
    When I run "wikeeper --help"
    Then the output ends with the line "Status: pre-alpha. Version <V>. Docs: https://github.com/sandrinio/wikeeper#readme", where <V> is what "wikeeper --version" prints
    And the output does not contain "Commands land in upcoming releases"

  Scenario Outline: Error — an unreadable build stamp never breaks the CLI
    Given a build whose dist/build-info.json <state>
    When I run "wikeeper --version"
    Then it prints "<package.json version>+dev" and exits 0

    Examples:
      | state                            |
      | is missing (running from source) |
      | contains "{ not json"            |
      | contains {"commit":"../../x"}    |
```

### 2.2 Verification Steps (Manual)
- [ ] Run `npm run build && node dist/cli.js --version` in the repository and compare the suffix with `git rev-parse --short=7 HEAD`.
- [ ] Copy the repository without `.git` to a temp folder, run `npm ci && npm run build` there, and check that `--version` ends in `+dev`.
- [ ] Read `node dist/cli.js --help` and check the footer line.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File (new) | `src/core/version.ts` |
| Related Files (new) | `scripts/build-info.mjs` |
| Related Files | `src/program.ts`, `src/commands/init.ts`, `src/commands/update.ts`, `src/agents/enforce/guard-command.ts`, `./package.json`, `./package-lock.json`, `test/e2e/pack.ts` |
| Test Files (new) | `test/version.test.ts`, `test/build-info.test.ts` |
| Test Files | `test/program.test.ts`, `test/e2e/goal.test.ts` |
| New Files Needed | `src/core/version.ts`, `scripts/build-info.mjs`, `test/version.test.ts`, `test/build-info.test.ts` |

### 3.2 Technical Logic
- `scripts/build-info.mjs` (R2): plain ESM, Node built-ins only (`node:child_process`, `node:fs`, `node:path`), so it runs before or without the TypeScript build and is not part of `tsconfig.json`'s `include`. `execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000, windowsHide: true })` inside `try`; trim; accept `/^[0-9a-f]{7,64}$/`; write `JSON.stringify({ commit }) + "\n"` to `path.join(outDir, "build-info.json")`, creating `outDir` if needed. `execFileSync("git")` resolves `git.exe` on Windows; `&&` in the npm script works in cmd and sh.
- `src/core/version.ts` (R3–R5): `buildCommit(file: URL = new URL("../build-info.json", import.meta.url)): string | null` reads and parses the file in `try` and returns the commit only when it matches `/^[0-9a-f]{7,64}$/`; `versionString(pkg: string, commit: string | null): string` returns `` `${pkg}+${commit ?? "dev"}` ``; `fullVersion(): string` returns `versionString(readPackageVersion(), buildCommit())`; `npmVersion(v: string): string` returns `v` without a `+…` suffix. The `file` parameter exists for the error-scenario unit tests.
- `src/program.ts` (R3, R6): `VERSION = versionString(packageJson.version, buildCommit())`, with `packageJson` typed `{ version: string; homepage?: string }`; the footer becomes `` `\nStatus: pre-alpha. Version ${VERSION}. Docs: ${packageJson.homepage}` `` (line 57). `.version(VERSION, "-v, --version")` stays.
- `init.ts` and `update.ts` (R4): `deps.packageVersion ?? fullVersion()` at the two default sites; nothing else changes, because the manifest (`init.ts:134`, `:224`; `update.ts:179`) and the integration options (`init.ts:136`; `update.ts:186`) already take that one value.
- `guard-command.ts` (R5): the `npx` case pins `wikeeper@${npmVersion(packageVersion)}`. The existing tests that inject `"1.0.0"`/`"2.0.0"` keep their output.
- `test/e2e/pack.ts` (R7): after the `tsc` call, `execFileSync(process.execPath, [path.join(PKG_ROOT, "scripts", "build-info.mjs"), build], { cwd: PKG_ROOT, stdio: "pipe" })`. The copy into `stage/dist` then includes `build-info.json`.
- `test/e2e/goal.test.ts` (scenario 2): one test using the packed CLI it already builds: read `path.join(path.dirname(cli), "build-info.json")`, compare `--version` with it, compare with `git rev-parse --short=7 HEAD` in the repository root when that call succeeds, and compare the `init` manifest's `package_version` with the `--version` output.
- `test/build-info.test.ts` (scenario 1): spawn the script with `process.execPath` in temp directories (`git init` plus one commit with a fixed author; `git init` only; no repository; `PATH` set to an empty directory), with `GIT_CEILING_DIRECTORIES` set; skip the git rows when git is not installed on the test machine.
- `test/version.test.ts` (scenarios 3–5): `versionString`, `buildCommit` on a missing, malformed and invalid file, `npmVersion`, `guardCommand("npx", "claude", "0.3.0+a0f0550")`, and `runInit`/`runUpdate` with `deps.packageVersion` and a `PATH` that resolves no `wikeeper`, reading the settings file and the manifest. `test/program.test.ts` expects `<package.json version>+dev`, `pre-alpha`, `Version <VERSION>`, the homepage, and no "Commands land".

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper --version` | CLI | None | — | one line: `<package.json version>+<7–64 hex commit \| dev>` |
| `wikeeper --help` | CLI | None | — | help text whose last line is `Status: pre-alpha. Version <VERSION>. Docs: <package.json homepage>` |
| `dist/build-info.json` | file | — | written by `node scripts/build-info.mjs <dir>` | `{ "commit": string \| null }` |

`.wiki/system/manifest.json` keeps its shape (`{ package_version, files }`); only the value of `package_version` gains the `+…` part.

## Task Breakdown

- [x] Set `package.json` and `package-lock.json` to `0.3.0` and add the stamp step to the `build` script -> R1, R2
- [x] Write `scripts/build-info.mjs` and `test/build-info.test.ts` -> R2
- [x] Add `src/core/version.ts` and use it for `VERSION` and the help footer in `src/program.ts`; update `test/program.test.ts` -> R3, R6
- [x] Default `init` and `update` to `fullVersion()`; pin the npx guard with `npmVersion` -> R4, R5
- [x] Run the stamp step in `test/e2e/pack.ts` and add the packed `--version` and manifest test to `test/e2e/goal.test.ts` -> R7
- [x] Write `test/version.test.ts` for scenarios 3–5 -> R3, R4, R5

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 4 | `versionString`; `buildCommit` (valid, missing, malformed, invalid commit); `npmVersion`; `guardCommand` with a `+…` version. |
| Integration tests | 0 | Real git in temp directories only; no external services. |
| E2E / acceptance tests | 10 | One per Gherkin scenario, Outline rows counted separately (4 + 1 + 1 + 1 + 3). No test depends on a specific commit. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `npm run build` passes on Linux, macOS and Windows CI, and `test/e2e/goal.test.ts` and `test/e2e/ingest.test.ts` still pass with the stamped pack.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts:27` — `VERSION` is the bare `package.json` version; `src/program.ts:52` passes it to `.version()`; `src/program.ts:57` — the footer "Status: pre-alpha. Commands land in upcoming releases".
- **Surface:** `src/core/templates.ts:50` — `readPackageVersion()`, the plain version `init`, `update`, `remove`, `doctor` and the search cache read today.
- **Surface:** `src/commands/init.ts:92` and `src/commands/update.ts:85` — the version defaults that feed both the manifest and the guard command.
- **Surface:** `src/core/manifest.ts:31` — `package_version: string`.
- **Surface:** `src/agents/enforce/guard-command.ts:72` — the `npx -y wikeeper@<version>` pin.
- **Surface:** `./package.json` — `version` `0.0.1`, `build` is `tsc -p tsconfig.build.json`, `files` is `dist` and `templates`.
- **Surface:** `test/e2e/pack.ts:20` — the staging `tsc` build the packed-CLI tests use.
- **Coverage of this requirement:** partial — the version flows through `--version`, the help and the manifest already; the commit stamp, the build step and the footer text are new.

## Prior work

- [[EPIC-001]] (parent), [[CR-003]] items F1, F2 and its Open Question 5. Extends [[STORY-001-01]] (`--version`, `--help`), [[STORY-001-03]] (manifest `package_version`, `readPackageVersion`), [[STORY-001-04]] and [[STORY-001-05]] (the version `init` and `update` record), [[STORY-001-09]] (help footer area) and [[STORY-002-06]] (the npx guard pin `update` re-renders). The wiki duplicate check (index and archive grep, 2026-10-17) found no other item about build stamps or the help footer.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/program.ts:27`, the `VERSION` constant.
- **Why isn't extension / parameterization / config sufficient?** Bumping `package.json` alone makes every build of `0.3.0` look the same, which is walkthrough row 11.1 again at the first rebuild. Asking git at run time fails in an installed package (no `.git` under `node_modules`) and starts a process on every command. Writing the commit into `package.json` would change a tracked file on every build and the npm version itself. A generated file in the gitignored, packed `dist/` is the smallest place that every build writes and every package carries.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/core/version.ts`, `scripts/build-info.mjs`, `test/version.test.ts` and `test/build-info.test.ts` are planned new files.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
