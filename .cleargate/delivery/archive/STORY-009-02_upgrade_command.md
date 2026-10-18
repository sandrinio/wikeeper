---
story_id: STORY-009-02
parent_epic_ref: EPIC-009
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-009 (Draft, pending Gate 1) §0 rules (upgrade runs only when asked, never sudo, changes only package-owned files through update), §2 'wikeeper upgrade [--check]', §3 Safety and Tests rows, §5 scenarios 5-9, §6 Q2 · SPRINT-04 plans/decomposition-epic-009.md: K16 (owned here), K14 (consumed from STORY-009-01, with its additive fetchLatestVersion and writeSavedCheck) · verified at 6b75807: src/program.ts, src/core/exit-codes.ts, src/core/output.ts, src/core/templates.ts (findPackageRoot, readPackageVersion), src/core/version.ts, src/core/paths.ts, src/commands/update.ts (runUpdate, createUpdateCommand, packageVersion), src/agents/enforce/guard-command.ts (resolveGuardForm, guardCommand npx pin), src/agents/enforce/claude.ts and codex.ts (READ_ONLY_COMMANDS, no wikeeper-wide allow rule), src/agents/index.ts (ensureAgentsIntegration), test/e2e/pack.ts:33-38 (npm through process.execPath + npm_execpath, else npm with shell), test/help.red.node.test.ts, test/init.red.node.test.ts:230, test/index-rebuild.red.node.test.ts:115, .github/workflows/ci.yml:17 (ubuntu, macos, windows) · checked on this machine 2026-10-18 (npm 11.12.1, Node 25.9.0): npm root -g = /opt/homebrew/lib/node_modules with wikeeper a real folder there; npx caches at ~/.npm/_npx/<hash>/node_modules/wikeeper; under npx, npm_execpath = .../npm/bin/npm-cli.js, npm_command = exec, npm_config_registry unset; offline with file: tarballs in a scratch project, npm install <spec> with no flag kept wikeeper in devDependencies (and in dependencies), and --save-dev and --save-prod kept their sections"
actor: AI coding agent
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-009-01
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T09:20:00Z
updated_at: 2026-10-18T09:20:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T09:21:05Z
  transition: ready-for-execution
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
  last_stamp: 2026-10-18T11:45:37Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-18T10:23:56Z
---

# STORY-009-02: `wikeeper upgrade`
**Complexity:** L3 — one new command module (`src/commands/upgrade.ts`, K16) and one registration line in `src/program.ts`. The logic is new and runs on the user's machine:
- telling a global, project, npx and unsupported install apart from the package's own folder;
- spawning npm on three operating systems;
- running the new version's `update` in a child process;
- failure handling that leaves the project unchanged.

Everything external (fetch, npm runner, package folder, platform) is injected, so the tests never run npm or reach the network.

## 1. The Spec (The Contract)

### 1.1 User Story
As a wikeeper user, I want one command that installs the newest wikeeper the way I installed it and then brings this project's wikeeper files up to that version, and that tells me exactly what to run by hand when it can't, so that upgrading never takes two steps I don't know about and never breaks my project.

### 1.2 Detailed Requirements
- **R1 — Command and registration.** `wikeeper upgrade [--check]`, with the root `--json`.
  - `src/commands/upgrade.ts` exports K16 plus `createUpgradeCommand(deps)` and `upgradeCommand`.
  - `src/program.ts` appends `upgradeCommand` at the end of `defaultCommands` (`src/program.ts:38`), as the list stands when this story merges: one import and one entry, after STORY-007-02's `configCommand` and STORY-007-06's `statuslineCommand` (the STORY-005-05 R12 convention).
  - Help texts. Command: `install the newest wikeeper the way it was installed, then update this project's files`. `--check`: `show what upgrade would run; installs nothing`.
- **R2 — Versions.**
  - `installed` is `npmVersion(readPackageVersion())` (`src/core/templates.ts:50`, `src/core/version.ts:28`).
  - `latest` comes from `fetchLatestVersion(deps)` (K14, STORY-009-01), always: `upgrade` is an explicit request, so the off switches do not apply.
  - Inside a wiki project (`<root>/.wiki/config.yml` exists, root from `findRepoRoot(ctx.cwd)`), the answer is saved with `writeSavedCheck`.
  - When `latest` is null, the command exits 1 with `registry_unreachable` before anything else runs (R8).
- **R3 — How wikeeper was installed (K16 `detectInstall`; §1.4 Q2).** The package folder is `realpath(deps.packageDir ?? findPackageRoot())` (`src/core/templates.ts:32`). Path segments are split on `/` and `\`. The first rule that matches wins:
  1. **`npx`** — a segment is `_npx` (npx's cache, `~/.npm/_npx/<hash>/node_modules/wikeeper`).
  2. **`unknown`** — the folder does not end in `node_modules/wikeeper` (a source checkout, or an `npm link` target), or a segment is `.pnpm`, `.bun` or `.yarn`.
  3. **`local`** — `<root>/node_modules/wikeeper` is a real folder (`lstat`, not a symbolic link) whose realpath is the package folder. Two exceptions make it `unknown`: the folder is a link (pnpm, `npm link`, a `file:` folder dependency), or the root has a `pnpm-lock.yaml`, `yarn.lock`, `bun.lock` or `bun.lockb` but no `package-lock.json`.
  4. **`global`** — `globalRoot` is given, `<globalRoot>/wikeeper` is a real folder, and its realpath is the package folder.
  5. **`global` by path, only when `globalRoot` is not given** (npm could not run) — the parent folders are `lib/node_modules` (POSIX), or `npm\node_modules` (win32).
  6. Otherwise **`unknown`**. This covers yarn's and pnpm's global folders, Volta, and a copy outside npm's global root.

  `upgrade` runs `npm root -g` (trimmed stdout) only when rules 1–3 did not decide and the folder ends in `node_modules/wikeeper`. A failing `npm root -g` leaves `globalRoot` unset. So a pnpm, bun or yarn install, an npx run and a source checkout reach a verdict without running npm.
- **R4 — Which section, for a project install (§1.4 Q3).** `<root>/package.json` decides the save flag:
  - `devDependencies.wikeeper` → `--save-dev`;
  - `dependencies.wikeeper` → `--save-prod`;
  - `optionalDependencies.wikeeper` → `--save-optional`.

  When none lists wikeeper (a hoisted workspace dependency, a `--no-save` install), the command exits 1 with `upgrade_unsupported` and the hand command `npm install --save-dev wikeeper@<v>, then node_modules/.bin/wikeeper update`. Nothing runs.
- **R5 — Running npm (K16 `CommandRunner`; §1.4 Q5).**
  - Callers pass a logical program: `"npm"`, `"npx"` or `process.execPath`. The default runner maps it with `npmSpawn(cmd, args, { env, platform, execPath })` to `{ file, args, shell }`:
    - **`npm_execpath` set:** for `"npm"` or `"npx"`, when `env.npm_execpath` ends in `npm-cli.js` (as it does under npm and npx, checked on this machine), the file is `execPath` and the args are `[npm-cli.js or its sibling npx-cli.js, …args]`, with no shell (`test/e2e/pack.ts:33–38`).
    - **win32 otherwise:** the file is `npm.cmd` or `npx.cmd` with `shell: true`. Node 20 and later refuse a `.cmd` without a shell (FLASHCARD 2026-10-16 `#windows #test-harness`). Every argument that reaches the shell is a constant (`install`, `-g`, `--save-dev`, `root`, `-y`, `update`, `--json`) or `wikeeper@<v>` with `<v>` matching `REGISTRY_VERSION_RE` (K14). No path and no user text is passed to a shell.
    - **Otherwise:** the file is the command itself, found on PATH, with no shell.
    - `process.execPath` runs as is, with no shell.
  - The runner collects stdout and stderr (at most 1 MB each) and resolves `{ code, stdout, stderr }`. When the program cannot start (`ENOENT`, or on win32 exit code 9009 or stderr "is not recognized"), it rejects with an error whose `code` is `"ENOENT"`.
  - Children get `process.env` and `cwd` = the project root (or `ctx.cwd` outside a wiki).
  - `upgrade` never runs `sudo`, `runas` or any other elevation.
- **R6 — What runs when a newer version is out (EPIC-009 §2).** Steps run in order, each only after the previous one exited 0:

  | Install | npm step | `update` step (inside a wiki project only) | `commands_run` |
  |---|---|---|---|
  | `global` | `npm install -g wikeeper@<v>` | `process.execPath <globalRoot>/wikeeper/<bin> update --json` | `npm install -g wikeeper@<v>`, `wikeeper update` |
  | `local` | `npm install <R4 flag> wikeeper@<v>` in the root | `process.execPath <root>/node_modules/wikeeper/<bin> update --json` | `npm install <flag> wikeeper@<v>`, `node_modules/.bin/wikeeper update` |
  | `npx` | none | `npx -y wikeeper@<v> update --json` | `npx -y wikeeper@<v> update` |
  | `unknown` | none: exit 1 `upgrade_unsupported` (R8) | none | `[]` |

  - `<bin>` is `bin.wikeeper` (or `bin` when it is a string) in the newly installed `package.json`, read after the npm step; it defaults to `dist/cli.js`. Running the bin file with the current Node uses neither PATH nor `.cmd` shims, and runs the new code, because the running process still holds the old one (§1.4 Q4).
  - The update child's last stdout line is its JSON envelope. `updated` is true when it exited 0 with `ok: true`, and its `data.warnings` become `upgrade`'s warnings.
  - For `npx`, the new version's `update` builds its hook command again. With no `wikeeper` on PATH and no project `.bin`, that gives `npx -y wikeeper@<v> hook guard --agent <agent>` from its own `packageVersion` (`src/agents/enforce/guard-command.ts:73`, FLASHCARD 2026-10-17 `#enforce #test-harness`).
  - **Outside a wiki project:** `global` and `local` run the npm step only (`updated: false`). `npx` runs nothing and exits 0 with `nothing to upgrade here: npx runs the version you name, so run npx -y wikeeper@<v>; there is no wiki project here to update`.
  - After the npm step, the command loads no module it has not loaded yet: the files on disk now belong to the new version.
  - After a successful run inside a wiki, `writeSavedCheck` stores `{ installed: <v>, latest: <v> }`, so the next ingest command under the new version needs no request.
- **R7 — Nothing newer (`latest` ≤ `installed`).** No detection and no runner call.
  - Inside a wiki whose files are older than the installed version (`versionMismatch(...).kind === "files-older"`, K14): run `runUpdate(root, { flags: {}, json: true, interactive: false, io })` in-process (`src/commands/update.ts:75`), because the running code is already the latest. `commands_run: ["wikeeper update"]`, `updated: true`, `upgraded: false`; `deps.update` is passed through. Message: `wikeeper 0.4.1 is the latest version; updated this project's files from 0.4.0`.
  - Otherwise nothing runs. The message is `wikeeper 0.4.1 is the latest version` when the versions are equal, or `no newer version on npm (latest 0.3.0, installed 0.4.0)` when the installed one is newer (a development build). When the project's files are newer, the `versionMismatch` message follows.
  - Exit 0.
- **R8 — Failures (K16, exit 1).** Each is a `WikeeperError(ExitCode.ERROR, …)` (`src/core/exit-codes.ts:3`). Nothing after the failing step runs, and when nothing was installed the project's files are byte-identical.
  - **Hand commands.** Every failure's details carry two fields:
    - `command`: the one command to run by hand, or null;
    - `then`: what to run afterwards in this project (`wikeeper update`, or `node_modules/.bin/wikeeper update` for a project install), or null outside a wiki project.

    The message's first line reads `<what is wrong>: <next step>`, with no final period. With a `command`, the next step is `to upgrade by hand, run <command>, then run <then> in this project` (the `then` part only when there is one). Tool output (npm's, or the update child's) follows as detail lines, each indented two spaces (ux.md §3.4).
  - `registry_unreachable` — `could not reach the npm registry (<cause>); nothing was changed: try again later`, e.g. `could not reach the npm registry (ENOTFOUND); nothing was changed: try again later`. Details `{ cause, command: null, then: null }` (§1.4 Q8).
  - `npm_missing` — `npm was not found; nothing was changed: to upgrade by hand, run <command>, then run <then> in this project`, e.g. `npm was not found; nothing was changed: to upgrade by hand, run npm install -g wikeeper@0.4.1, then run wikeeper update in this project`. Details `{ command, then, install }`; `command` is the R6 npm step.
  - `npm_failed` — `npm install failed (exit <code>); nothing was changed: to upgrade by hand, run <command>, then run <then> in this project`, followed by npm's last 10 non-empty lines (stderr, else stdout) as detail lines. For example `npm install failed (exit 243); nothing was changed: to upgrade by hand, run sudo npm install -g wikeeper@0.4.1, then run wikeeper update in this project`, then `  npm error code EACCES` and the other npm lines. Details `{ command, then, install, exit_code, output }`.
    - For a `global` install whose output contains `EACCES` or `EPERM`, `command` is `sudo npm install -g wikeeper@<v>` on POSIX. On win32 it is `npm install -g wikeeper@<v>`, and the hand step reads `run npm install -g wikeeper@<v> in a terminal run as administrator`.
    - Otherwise `command` is the R6 npm step.
  - `upgrade_unsupported` — `wikeeper runs from <dir>, <how>, which wikeeper upgrade does not handle; nothing was run: to upgrade by hand, run <command>, then run <then> in this project`, e.g. `…; nothing was run: to upgrade by hand, run pnpm add -g wikeeper@0.4.1, then run wikeeper update in this project`. Details `{ command, then, install, reason }`. `command` uses the recognised manager:
    - pnpm: `pnpm add -g wikeeper@<v>` or `pnpm add -D wikeeper@<v>`;
    - yarn: `yarn global add wikeeper@<v>` or `yarn add --dev wikeeper@<v>`;
    - bun: `bun add -g wikeeper@<v>` or `bun add -d wikeeper@<v>`;
    - a project install that `package.json` does not list (R4): `npm install --save-dev wikeeper@<v>`;
    - a source checkout or a linked folder: null. There is no safe single command for a folder that npm did not install, so the next step reads `update that folder yourself, then run <then> in this project` (`…; nothing was run: update that folder yourself, then run wikeeper update in this project`).
  - `update_failed` — `wikeeper <v> is installed, but its update failed: run <command> in this project`, e.g. `wikeeper 0.4.1 is installed, but its update failed: run wikeeper update in this project`, followed by the child's last 10 lines as detail lines. Details `{ upgraded: true, install, commands_run, command, then: null }`, where `command` is the update step as `commands_run` shows it (`wikeeper update`, `node_modules/.bin/wikeeper update` or `npx -y wikeeper@<v> update`).
- **R9 — `--check` (K16 `UpgradeCheckResult`).**
  - It fetches and saves as R2, then detects as R3; it may run `npm root -g`, which changes nothing.
  - Data `{ installed, latest, newer, install, command }`. `command` is the first command `upgrade` would run: the npm step, the update for `npx`, the hand command for `unknown` (or R4's refusal), or `wikeeper update` when nothing is newer but the files are older. It is null when there is nothing to do.
  - Human output: `wikeeper 0.4.1 is available (installed 0.4.0); wikeeper upgrade would run: npm install -g wikeeper@0.4.1, then wikeeper update`, or the R7 message.
  - Exit 0 for every install kind; exit 1 only for `registry_unreachable` (§1.4 Q7). It installs and updates nothing.
- **R10 — Output on success (K16 `UpgradeResult`).** `{ installed, latest, upgraded, install, commands_run, updated }`. Human lines:
  - `global`: `upgraded wikeeper 0.4.0 → 0.4.1 with npm install -g and updated this project's files`, then `other projects that use this wikeeper: run wikeeper update in each (wikeeper status there says so)`.
  - `local`: `upgraded wikeeper 0.4.0 → 0.4.1 in this project's devDependencies and updated this project's files` (or `dependencies`, `optionalDependencies`).
  - `npx`: `updated this project's files with wikeeper 0.4.1 through npx`.
- **R11 — No allow rule (§1.4 Q6).** `READ_ONLY_COMMANDS` (`src/agents/enforce/claude.ts:28`) and the Codex lines built from it (`src/agents/enforce/codex.ts:27`) stay as they are, and no ask rule is added. No existing rule matches `wikeeper upgrade`: the only wikeeper-wide patterns are `ingest`, `read`, `search` and the read-only commands. So Claude Code and Codex treat it as any unlisted command, and the user's host asks before it runs.
- **R12 — Tests never run npm.** `createUpgradeCommand(deps: UpgradeDeps)` takes `fetch`, `run`, `packageDir`, `installed`, `env`, `platform`, `execPath`, `now` and `update` (the `UpdateDeps` of R7's in-process `runUpdate`). `npmSpawn` is tested as a pure function. No test calls the default runner.

### 1.3 Out of Scope
- Upgrading through pnpm, yarn, bun, Volta or Homebrew: they get the hand command (EPIC-009 out of scope, §1.4 Q1).
- Automatic or background upgrades; `upgrade --version <v>`; downgrades; release notes.
- Updating other projects that use the same global install. Their `status` and `doctor` say so (STORY-009-01).
- An allow or ask rule for `upgrade`; the agent's instructions (STORY-009-03).
- Reading `.npmrc` (registry tokens, prefix): npm itself reads it when `upgrade` runs it.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1, EPIC-009 §6 Q2):** Package managers: should `upgrade` install with anything other than npm?
- **Recommended:** npm only for 0.4.0. pnpm, yarn and bun installs are recognised (R3) and get the matching hand command (R8). Nothing runs for them, because running npm in a pnpm or yarn project would write a second lockfile.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2, detection):** EPIC-009 says "from its own package folder". `resolveGuardForm` (`src/agents/enforce/guard-command.ts:35`) already tells PATH, project and npx apart. Reuse it, and when may `upgrade` run `npm root -g`?
- **Recommended:** Do not reuse it: it answers how the hooks should call wikeeper (PATH first), not which copy is running, and a user can have both a global and a project copy. Detect from the running package's realpath (R3), and run `npm root -g` once, only to confirm a global candidate. Symbolic links (`npm link`, pnpm, `file:` folders) count as `unknown`, so a developer's linked checkout is never replaced by a registry copy. Consequence: `upgrade` upgrades the copy that ran; another copy on PATH stays as it was, and `status` run through it shows the mismatch.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q3, devDependencies):** Does `npm install wikeeper@<v>` keep an existing devDependency in `devDependencies`?
- **Recommended:** It did on this machine (npm 11.12.1). In a scratch project, offline with `file:` tarballs: `npm install <spec>` with no flag kept wikeeper in `devDependencies` and also in `dependencies`, and `--save-dev` and `--save-prod` kept their sections. A registry spec could not be checked without a network install. Still pass the explicit flag of the section `package.json` lists (R4): the result then does not depend on npm's inference or its version, and the tests check exactly that argument list with a fake runner. **Implementation note:** the Developer adds a unit test that every `local` row passes exactly one of `--save-dev`, `--save-prod` or `--save-optional`, and never `--save` or `-g`.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q4, running the new `update`):** How does `update` run as the new version?
- **Recommended:** In a child process, as EPIC-009 says.
  - `global` and `local`: `process.execPath <package folder>/<bin> update --json`, which needs no PATH lookup, `.bin` shim or `.cmd` file.
  - `npx`: `npx -y wikeeper@<v> update --json`.
  - Nothing newer but the files are older: `runUpdate` in-process, because the running code is already the latest (R7).

  Alternative: run `wikeeper update` from PATH, which can pick another copy, or need a shell on Windows.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q5, spawning npm):** How is npm started on Windows, and when it is missing?
- **Recommended:** R5, the pattern `test/e2e/pack.ts:33–38` already uses:
  - `process.execPath` + `npm_execpath` when npm started us (always the case under npx);
  - else `npm.cmd` with a shell on win32, with only constants and a checked version as arguments;
  - else `npm` from PATH.

  A program that cannot start becomes `npm_missing`. CI runs on Windows (`.github/workflows/ci.yml:17`), so `npmSpawn`'s win32 rows run there as unit tests. No test spawns npm.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q6, permission rules):** Should `upgrade` get a Claude Code or Codex allow rule, or an ask rule?
- **Recommended:** Neither (R11). With no rule, the agent's host asks the user before the command runs, which is what EPIC-009 wants for a command that runs npm. An ask rule would only repeat that, and would change the exact rule lists that several SPRINT-03 red tests pin (FLASHCARD 2026-10-17 `#enforce #red-test`).
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q7, `--check`; contract K16):** K16 lists an `unknown` install among the exit-1 cases. Should `upgrade --check` on an unknown install exit 1?
- **Recommended:** No. `--check` only reports, so it exits 0 for every install kind and names the hand command in `command`. It exits 1 only when the registry cannot be reached. `upgrade` without `--check` keeps K16's exit 1 for `unknown`.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q8, contract K16):** K16 says the hand command is in the message and in `details.command`. What is it when the registry cannot be reached?
- **Recommended:** None: `details.command` is null, and the message says nothing was changed and to try again later. Without the registry's answer there is no version to name, and `npm install -g wikeeper@latest` would install the wrong copy for a project or npx install.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **DRAFTS review (designer, 2026-10-18):** wording aligned with docs/ux.md — every failure message's first line reads `<what is wrong>: <next step>` with no final period, the hand step `to upgrade by hand, run <command>, then run <then> in this project` replaces the "To upgrade by hand: …." tail, and npm's or the child's lines follow as detail lines indented two spaces (R8); the npx-outside-a-wiki line starts `nothing to upgrade here:` and says "run" instead of "use" (R6); the "other projects" hint names `wikeeper update` and `wikeeper status` bare (R10); the §1.5 sandbox mitigation follows STORY-009-03's new failure text. No decision changed.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** `upgrade` runs npm on the user's machine and can fail halfway, for example installed but `update` failed.
- **Mitigation:** Each step runs only after the previous one exits 0. `update_failed` names the command to finish by hand and says the install happened (R8). `update` itself backs up edited files (`src/commands/update.ts:150`).
- **Risk:** npm replaces the running package's files while the old process still runs. A module loaded after that point would come from the new version.
- **Mitigation:** R6 forbids any new import after the npm step. Every module `upgrade` needs is imported statically at load time, and the update runs in a child.
- **Risk:** Windows spawning (`.cmd`, shell quoting) and Windows global layouts cannot be checked on this machine.
- **Mitigation:** `npmSpawn` is a pure function with win32 rows. Only constants and a checked version reach a shell. The Windows CI job runs the detection tests on real temp folders, with folder links created as `"junction"`, as `test/e2e/pack.ts:41` does.
- **Risk:** Inside an agent's sandbox (Codex workspace-write, for example), npm has no network or cannot write the global folder.
- **Mitigation:** The error is npm's own, shown with the hand command (R8). WIKI.md (STORY-009-03) tells the agent to tell the user what failed and to show the hand command when it is the user's to run.
- **Risk:** `src/program.ts` is also appended to by STORY-007-02 and STORY-007-06.
- **Mitigation:** One import and one entry at the end of `defaultCommands`, on the merged tree. STORY-009-01 already follows both stories.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A global, a project (two sections) and an npx install; an install outside a wiki project; an update-only run when nothing is newer. |
| Interfaces | T | `upgrade` and `upgrade --check`, each as human text and `--json`. |
| Data | T | Install layouts (global, project, npx cache, pnpm, bun, yarn lockfile, source checkout, a project that does not list wikeeper); npm results (EACCES, missing, a failing update); registry answers. |
| Rules | T | npm only; never `sudo`; `update` only after npm succeeds; nothing runs for an unsupported install; files unchanged on failure. |

Every scenario runs in-process through `runCli` with `createUpgradeCommand(deps)`. The deps are:
- `installed: "0.4.0"`;
- a fake fetch answering `{"version": <latest>}`;
- `packageDir` pointing at a temp folder laid out like the install under test, holding a `package.json` named `wikeeper` with `bin: { wikeeper: "dist/cli.js" }`;
- a fake `run` that records each call's `cmd`, `args` and `cwd`.

The fake runner answers `npm root -g` with the layout's global root, and npm installs with exit 0 unless the row says otherwise. When asked to run the new version's update, it calls `ensureAgentsIntegration()` and then `runCli(["update", "--json"], { commands: [createUpdateCommand({ packageVersion: "0.4.1+abc1234" })], io: { cwd } })`, and returns that run's exit code and stdout. The project is a wiki created by `init` through the default program in a temp git repository whose manifest says `0.4.0+abc1234`. `deps.update` is `{ packageVersion: "0.4.0+abc1234" }`, for R7's in-process update.

```gherkin
Feature: wikeeper upgrade

  @paths @data
  Scenario Outline: Upgrade an npm install, then update the project as the new version
    Given wikeeper 0.4.0 installed <how>, npm's latest version 0.4.1, and <where>
    When I run "wikeeper upgrade --json" there
    Then the runner was called with exactly <calls>, each with cwd <cwd>
    And the exit code is 0 and data is { installed: "0.4.0", latest: "0.4.1", upgraded: true, install: "<kind>", commands_run: [<shown>], updated: <updated> }
    And <after>

    Examples:
      | how | where | calls | cwd | kind | shown | updated | after |
      | globally: the package folder is <prefix>/lib/node_modules/wikeeper | a wiki project | "npm root -g"; "npm install -g wikeeper@0.4.1"; "<execPath> <prefix>/lib/node_modules/wikeeper/dist/cli.js update --json" | the project root | global | "npm install -g wikeeper@0.4.1", "wikeeper update" | true | the project's manifest says "0.4.1+abc1234", update-check.json holds "installed": "0.4.1" and "latest": "0.4.1", and the human output names "wikeeper update" for other projects |
      | as the project's devDependency: <root>/node_modules/wikeeper, package.json devDependencies { "wikeeper": "^0.4.0" } | a wiki project | "npm install --save-dev wikeeper@0.4.1"; "<execPath> <root>/node_modules/wikeeper/dist/cli.js update --json" | the project root | local | "npm install --save-dev wikeeper@0.4.1", "node_modules/.bin/wikeeper update" | true | the project's manifest says "0.4.1+abc1234" |
      | as the project's dependency: package.json dependencies { "wikeeper": "0.4.0" } | a wiki project | "npm install --save-prod wikeeper@0.4.1"; "<execPath> <root>/node_modules/wikeeper/dist/cli.js update --json" | the project root | local | "npm install --save-prod wikeeper@0.4.1", "node_modules/.bin/wikeeper update" | true | the project's manifest says "0.4.1+abc1234" |
      | globally, as in row 1 | a git repository with no .wiki/config.yml | "npm root -g"; "npm install -g wikeeper@0.4.1" | that repository | global | "npm install -g wikeeper@0.4.1" | false | no .wiki folder was created and no update ran |

  @paths
  Scenario: Upgrade through npx re-pins the hooks
    Given a wiki project initialised with "--agents claude --enforce" and PATH set to an empty folder, whose hooks a 0.4.0 update wrote as "npx -y wikeeper@0.4.0 hook guard --agent claude"
    And the package folder is <tmp>/.npm/_npx/0a1b2c3d/node_modules/wikeeper and npm's latest version is 0.4.1
    When I run "wikeeper upgrade --json" in the project
    Then the runner was called only with "npx -y wikeeper@0.4.1 update --json", and never with "npm root -g" or "npm install"
    And data is { installed: "0.4.0", latest: "0.4.1", upgraded: false, install: "npx", commands_run: ["npx -y wikeeper@0.4.1 update"], updated: true }
    And .claude/settings.json's guard hook runs "npx -y wikeeper@0.4.1 hook guard --agent claude"

  @interfaces @rules
  Scenario Outline: Nothing to install: up to date, files behind, or only checking
    Given a global install of 0.4.0 as in scenario 1, npm's latest version <latest>, and a wiki project whose manifest says <files>
    When I run "wikeeper <args>"
    Then the exit code is 0, <result>, and the runner was called <calls>

    Examples:
      | latest | files         | args                  | result | calls |
      | 0.4.0  | 0.4.0+abc1234 | upgrade               | it prints "wikeeper 0.4.0 is the latest version" and no file in the project changed | never |
      | 0.4.0  | 0.3.0+abc1234 | upgrade --json        | data is { installed: "0.4.0", latest: "0.4.0", upgraded: false, install: "global", commands_run: ["wikeeper update"], updated: true } and the manifest says "0.4.0+abc1234" | never |
      | 0.3.0  | 0.4.0+abc1234 | upgrade               | it prints "no newer version on npm (latest 0.3.0, installed 0.4.0)" and no file in the project changed | never |
      | 0.4.1  | 0.4.0+abc1234 | upgrade --check --json | data is { installed: "0.4.0", latest: "0.4.1", newer: true, install: "global", command: "npm install -g wikeeper@0.4.1" }, only update-check.json changed | only with "npm root -g" |
      | 0.4.1  | 0.4.0+abc1234 | upgrade --check       | it prints "wikeeper 0.4.1 is available (installed 0.4.0); wikeeper upgrade would run: npm install -g wikeeper@0.4.1, then wikeeper update" | only with "npm root -g" |

  @rules @data
  Scenario Outline: Error — npm or the registry fails, and the project is unchanged
    Given a wiki project, npm's latest version 0.4.1 unless the row says otherwise, and <setup>
    When I run "wikeeper upgrade --json"
    Then the exit code is 1, json.error.code is "<code>", json.error.message contains <message>, and json.error.details.command is <command>
    And every file under the project root except .wiki/.cache/update-check.json is byte-identical to before
    And the runner was called <calls>

    Examples:
      | setup | code | message | command | calls |
      | a global install; npm install exits 243 with stderr "npm error code EACCES\nnpm error syscall mkdir\nnpm error path /usr/lib/node_modules/wikeeper" | npm_failed | "npm error code EACCES" and "sudo npm install -g wikeeper@0.4.1" | "sudo npm install -g wikeeper@0.4.1" | with "npm root -g" and "npm install -g wikeeper@0.4.1", never with an update |
      | a global install; the runner rejects every call with code ENOENT | npm_missing | "npm was not found" | "npm install -g wikeeper@0.4.1" | only with "npm root -g" and "npm install -g wikeeper@0.4.1" |
      | a global install; the fetch rejects with cause ENOTFOUND | registry_unreachable | "could not reach the npm registry (ENOTFOUND)" | null | never |
      | a global install; npm install succeeds and the update child exits 1 with stderr "error: not initialised" | update_failed | "wikeeper 0.4.1 is installed, but its update failed" | "wikeeper update" | with "npm root -g", "npm install -g wikeeper@0.4.1" and the update |

  @rules @data
  Scenario Outline: Error — an install wikeeper can't upgrade runs nothing
    Given a wiki project, npm's latest version 0.4.1, and the package folder <layout>
    When I run "wikeeper upgrade --json"
    Then the exit code is 1, json.error.code is "upgrade_unsupported", and json.error.details has install "<kind>", command <command> and then <then>
    And the runner was never called and no file in the project changed
    And "wikeeper upgrade --check --json" exits 0 with data.install "<kind>" and data.command <command>

    Examples:
      | layout | kind | command | then |
      | <tmp>/pnpm/global/5/.pnpm/wikeeper@0.4.0/node_modules/wikeeper | unknown | "pnpm add -g wikeeper@0.4.1" | "wikeeper update" |
      | <tmp>/.bun/install/global/node_modules/wikeeper | unknown | "bun add -g wikeeper@0.4.1" | "wikeeper update" |
      | <root>/node_modules/wikeeper, with a yarn.lock and no package-lock.json in the root | unknown | "yarn add --dev wikeeper@0.4.1" | "node_modules/.bin/wikeeper update" |
      | <tmp>/src/wikeeper, a source checkout (not under node_modules) | unknown | null, and the message says "update that folder yourself" | "wikeeper update" |
      | <root>/node_modules/wikeeper, with a package.json that lists wikeeper in no dependency section | local | "npm install --save-dev wikeeper@0.4.1" | "node_modules/.bin/wikeeper update" |
```

### 2.2 Verification Steps (Manual)
No version newer than 0.4.0 can exist on npm during the sprint, so a real upgrade cannot run. These steps check detection and `--check` on real layouts, with the real registry answering 0.3.0.
- [ ] Pack the branch (`npm pack` of a scratch build at 0.4.0). Install the tarball into a temp prefix: `npm install -g --prefix <tmp>/g ./wikeeper-0.4.0.tgz`. In a scratch copy of the testbed (`testbed.md`, Making a scratch copy), run `<tmp>/g/bin/wikeeper upgrade --check --json`. It reports `install: "global"`, `latest: "0.3.0"`, `newer: false`, and `command: "wikeeper update"` (the testbed's manifest is from 0.3.0). With the tarball as a devDependency of a scratch project, `node_modules/.bin/wikeeper upgrade --check --json` reports `install: "local"`.
- [ ] In the same copy, `<tmp>/g/bin/wikeeper upgrade` prints `no newer version on npm (latest 0.3.0, installed 0.4.0)`, then the files-older handling of R7. Check that `.wiki/system/manifest.json` then says `0.4.0+<commit>`, and `git status` shows only wikeeper's own files.
- [ ] `npx -y ./wikeeper-0.4.0.tgz upgrade --check --json` in the copy reports `install: "npx"`.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File (new) | `src/commands/upgrade.ts` |
| Related Files | `src/program.ts` |
| Developer Tests (new) | `test/upgrade.test.ts` |
| QA-Red Tests (new) | `test/upgrade.red.node.test.ts` |
| New Files Needed | `src/commands/upgrade.ts`, `test/upgrade.test.ts`, `test/upgrade.red.node.test.ts` |

- **Read, not edited:**
  - `src/core/update-check.ts` (K14 with STORY-009-01's additive `fetchLatestVersion`, `writeSavedCheck`, `REGISTRY_VERSION_RE`, `versionMismatch`);
  - `src/core/templates.ts` (`findPackageRoot` at `:32`, `readPackageVersion` at `:50`), `src/core/version.ts` (`npmVersion`, `compareVersions`), `src/core/paths.ts` (`findRepoRoot`, `resolvePaths`);
  - `src/core/manifest.ts` (`readManifest`), `src/core/output.ts` (`emitResult`, `getOutputContext`), `src/core/exit-codes.ts`;
  - `src/commands/update.ts` (`runUpdate` at `:75`, `createUpdateCommand`);
  - `src/agents/enforce/guard-command.ts` (`:56` skips npx's `.bin` on PATH; `:73` the npx pin), `src/agents/enforce/claude.ts:28`, `src/agents/enforce/codex.ts:27`;
  - `test/e2e/pack.ts:33–41`.
- **Red tests:** none re-scoped. No red test pins the command list: `test/init.red.node.test.ts:230` and `test/index-rebuild.red.node.test.ts:115` use `toContain`. `test/help.red.node.test.ts` S1 checks that every command lists `--json`, which the root option gives `upgrade`. The enforce rule lists do not change (R11).

### 3.2 Technical Logic
- **Order of the action:**
  1. `ctx`, `root = findRepoRoot(ctx.cwd)`, `inWiki = exists(<root>/.wiki/config.yml)`.
  2. `installed`; `{ latest, error } = await fetchLatestVersion(deps)`. Null → `registry_unreachable`.
  3. In a wiki: `writeSavedCheck`. Read the manifest version as `files`, from `readManifest(paths.manifestFile)` with `npmVersion`.
  4. `newer = compareVersions(latest, installed) > 0`. When not newer and not `--check`: R7.
  5. Detect (R3), with `npm root -g` only when needed; then R4 for `local`.
  6. `--check`: emit R9 and return.
  7. R6 steps through `deps.run ?? execRunner`; R8 on failure; R10 on success.
- **`detectInstall`** is synchronous: `realpathSync`, `lstatSync` and `existsSync`, the same style as `resolveGuardForm`'s `existsSync`. Compare realpaths with `===` after `path.resolve`. On win32, compare case-insensitively: `C:\Users\…` and `c:\users\…` are the same folder.
- **Hand commands** come from `handCommand(kind, { manager, scope, dir, latest, flag })`. `manager` comes from the R3 markers: `.pnpm` or a `pnpm` segment → pnpm; `.bun` → bun; `yarn.lock` or a `yarn` segment → yarn. `scope` is `global` when the folder is not under the root.
- **npm output tail:** split stderr (else stdout) on `\r?\n`, drop empty lines, keep the last 10. EACCES/EPERM detection: `/\bE(ACCES|PERM)\b/` on the whole output.
- **Tests.**
  - The red file builds layouts in temp folders: a fake global prefix `<tmp>/prefix/lib/node_modules/wikeeper`, the project's `node_modules/wikeeper`, an `_npx` folder, a pnpm folder, a bun folder, a source folder. Folder links use `symlink(target, link, "junction")` (works on Windows CI; `test/e2e/pack.ts:41`).
  - The npx scenario stubs `PATH` to an empty temp folder (`vi.stubEnv`, as `test/doctor-reporting.red.node.test.ts:27` does), so the in-process update chooses the npx form.
  - The update the fake runner runs needs `ensureAgentsIntegration()` (`src/agents/index.ts:56`) before `runCli` with custom commands, or the hooks are not rewritten (FLASHCARD 2026-10-16 `#test-harness #integrations`).
  - The wiki is created through `runCli`'s default program with `.git` present (FLASHCARD 2026-10-17 `#qa #test-harness`). Pass `--json` wherever stdout is parsed, and assert `json.error.code` together with the message, never the exit code alone (FLASHCARD 2026-10-17 `#qa #red-test`).
  - "Byte-identical" means a hash of every file under the root before and after, skipping `.wiki/.cache/` (hashes of files only: FLASHCARD 2026-10-17 `#test-harness #fs`).

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper upgrade` | CLI | None | `--json` | `UpgradeResult` (R10); errors `registry_unreachable`, `npm_missing`, `npm_failed`, `upgrade_unsupported`, `update_failed` (exit 1) |
| `wikeeper upgrade --check` | CLI | None | `--json` | `UpgradeCheckResult` (R9); error `registry_unreachable` (exit 1) |

```ts
// src/commands/upgrade.ts — K16 (frozen) plus the additive exports marked "additive"
import type { CommandModule } from "../program.js";
import type { UpdateDeps } from "./update.js";

export type InstallKind = "global" | "local" | "npx" | "unknown";
export interface RunResult { code: number; stdout: string; stderr: string }
/** Rejects with an error whose code is "ENOENT" when the program cannot start (R5). */
export type CommandRunner = (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => Promise<RunResult>;
export function detectInstall(
  packageDir: string,
  o: { root: string | null; env: NodeJS.ProcessEnv; platform: NodeJS.Platform; globalRoot?: string },
): InstallKind;
export interface UpgradeResult {
  installed: string; latest: string | null; upgraded: boolean; install: InstallKind;
  commands_run: string[]; updated: boolean;
}
export interface UpgradeCheckResult { installed: string; latest: string | null; newer: boolean; install: InstallKind; command: string | null }

// additive
export interface UpgradeDeps {
  fetch?: typeof fetch;
  run?: CommandRunner;
  packageDir?: string;
  installed?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  execPath?: string;
  now?: () => Date;
  update?: UpdateDeps; // R7's in-process runUpdate (src/commands/update.ts)
}
export function npmSpawn(
  cmd: string,
  args: readonly string[],
  o: { env: NodeJS.ProcessEnv; platform: NodeJS.Platform; execPath: string },
): { file: string; args: string[]; shell: boolean };
export const execRunner: CommandRunner;
export function handCommand(
  kind: InstallKind,
  o: { manager: "npm" | "pnpm" | "yarn" | "bun" | null; scope: "global" | "project"; dir: string; latest: string; flag?: string },
): string;
export function createUpgradeCommand(deps?: UpgradeDeps): CommandModule;
export const upgradeCommand: CommandModule;
```

Consumed (frozen, STORY-009-01): `fetchLatestVersion`, `writeSavedCheck`, `REGISTRY_VERSION_RE`, `versionMismatch`, `compareVersions` (in `src/core/version.ts` after STORY-009-01's move).

**Contract deviations from K16, all stated:**
1. `detectInstall` keeps K16's signature but reads the file system (`realpath`, `lstat`, lockfiles), and returns `unknown` for linked installs and for non-npm lockfiles (R3).
2. `CommandRunner` rejects with `code: "ENOENT"` when a program cannot start; K16's `RunResult` covers only started processes.
3. `upgrade --check` exits 0 for an `unknown` install (§1.4 Q7); `upgrade` itself keeps exit 1.
4. `registry_unreachable` has `details.command: null` (§1.4 Q8), and so does an install from a source checkout or a linked folder (R8). Every failure's details add `then`, the command to run in the project afterwards.
5. Additive exports: `UpgradeDeps`, `npmSpawn`, `execRunner`, `handCommand`, `createUpgradeCommand`, `upgradeCommand`. Error codes: `registry_unreachable`, `npm_missing`, `npm_failed`, `upgrade_unsupported`, `update_failed`.
6. `upgrade` consumes K14 through STORY-009-01's additive `fetchLatestVersion` and `writeSavedCheck`, not `checkForUpdate({ force })`. It needs the failure's cause, and it must also work outside a wiki project, where there are no `paths`.

## Task Breakdown

- [ ] QA-Red: write `test/upgrade.red.node.test.ts` from the five scenarios in §2.1, with the fake fetch, the fake runner and temp layouts -> §2.1
- [ ] Write `detectInstall` and `handCommand` with their unit tests (every R3 rule, win32 case-folding, links as junctions) -> R3, R8
- [ ] Write `npmSpawn` and `execRunner` with the ENOENT mapping; unit-test the win32, POSIX and `npm_execpath` rows -> R5
- [ ] Write the action: versions, R7, the R4 section, R6 steps, R8 failures, R9 `--check`, R10 output -> R2, R4, R6–R10
- [ ] Append `upgradeCommand` to `defaultCommands` in `src/program.ts` on the merged tree -> R1
- [ ] Write `test/upgrade.test.ts` (§4.1 unit tests); run `npm run typecheck` and `npm test` -> R11, R12

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 8 | `detectInstall`: each R3 rule on real temp layouts, including a junction-linked project install, a linked global install, a `package-lock.json` beside a `yarn.lock` (stays `local`), and win32 case-folding. `npmSpawn`: `npm_execpath` set (npm and npx), win32 without it (`npm.cmd`, shell), POSIX without it. The ENOENT mapping, including win32 exit 9009. `handCommand` for each manager and scope. The R4 flag for each section, including exactly one flag per `local` call (§1.4 Q3). The npm output tail (10 lines, empty lines dropped, CRLF). EACCES and EPERM detection, and the win32 wording. The `<bin>` lookup (string, map, missing). |
| Integration tests | 0 | No npm and no network: the runner and the fetch are injected. |
| E2E / acceptance tests | 5 | One per Gherkin scenario through `runCli` (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] No test starts npm, npx or a shell, or reaches the network; the default runner is used by no test.
- [ ] `test/help.red.node.test.ts` passes: `upgrade --help` lists `--json` and `--check`.
- [ ] `npm run typecheck` and `npm test` pass on the CI matrix (ubuntu, macos, windows); no new runtime dependency.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/commands/update.ts:75` — `runUpdate`, run as the new version in a child (or in-process when nothing is newer); `src/commands/update.ts:85` — `packageVersion`, which re-pins npx hooks.
- **Surface:** `src/agents/enforce/guard-command.ts:35` — `resolveGuardForm`, the precedent for telling installs apart (not reused, §1.4 Q2); `src/agents/enforce/guard-command.ts:73` — the npx pin `update` rewrites.
- **Surface:** `src/core/templates.ts:32` — `findPackageRoot`, the running package's folder.
- **Surface:** `test/e2e/pack.ts:33` — spawning npm through `process.execPath` and `npm_execpath`, else with a shell.
- **Surface:** `src/program.ts:38` — `defaultCommands`, where `upgradeCommand` is appended.
- **Coverage of this requirement:** partial. Updating the project, the package folder and the npm-spawning pattern exist. Detection, running npm from the CLI, the child update and the failure handling are new.

## Prior work

- [[EPIC-009]] (parent; its §6 Q2 is §1.4 Q1 here). The duplicate check (cleargate-wiki-query, 2026-10-18, recorded in EPIC-009) found no earlier upgrade command; a grep of `.cleargate/wiki`, `.cleargate/delivery/archive` and `FLASHCARD.md` finds only SPRINT-04 and EPIC-009.
- Builds on [[STORY-001-05]] and [[STORY-002-11]] (`update` and its `packageVersion`, which tests inject because a newer package can't be simulated), [[STORY-002-05]] and [[STORY-002-06]] (the guard command forms and the npx pin), [[STORY-001-10]] (the version stamp) and [[STORY-005-05]] (appending to `defaultCommands`).
- Consumes [[STORY-009-01]] (K14). Consumed by [[STORY-009-03]] (instructions and docs). Shares `src/program.ts` with [[STORY-007-02]] and [[STORY-007-06]].

## Why not simpler?

- **Smallest existing surface that could carry this:** a message from STORY-009-01's check naming `npm install -g wikeeper@latest`, then `wikeeper update` (`src/commands/update.ts:75`), for the user to run.
- **Why isn't extension / parameterization / config sufficient?** That command is wrong for a project install, which needs `npm install --save-dev` in the project, and for an npx install, which needs no install, only `npx -y wikeeper@<v> update` to re-pin the hooks. Users also skip the second step, which leaves the project's files and hooks old (EPIC-009 §1). The human asked for the CLI to run npm (2026-10-18). Each new piece is the smallest that does one job:
  - detection from the package's own folder;
  - one npm call;
  - one child `update`;
  - a hand command whenever the CLI cannot do it safely.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/commands/upgrade.ts` is a planned path in EPIC-009 §4 and K16; `src/core/update-check.ts` is created by STORY-009-01 in this sprint.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
- [x] §1.4 Q1–Q8 decided by the human, and EPIC-009 approved (Gate 1).
