---
story_id: STORY-009-01
parent_epic_ref: EPIC-009
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-009 (Draft, pending Gate 1) §0 rules, §2 'Version check', 'When it runs', 'Where it shows', 'Files from another version', §3 Performance and Tests rows, §5 scenarios 1-4, §6 Q1 · SPRINT-04 plans/decomposition-epic-009.md: K14 and K15 (owned here), shared-file merge orders · plans/decomposition.md shared-file table (read only) · STORY-007-01 (Q3 re-scope of test/config.red.node.test.ts:19), STORY-007-02 (config set by type; tests read configLeafKeys()), STORY-007-05 R10 and STORY-008-06 Q2 (a story that adds a status key writes its WIKI.md bullet) · verified at 6b75807: src/commands/ingest.ts, src/commands/ingest-plan.ts, src/commands/ingest-start.ts, src/commands/ingest-{facts,apply,abort,finish}.ts, src/core/output.ts, src/core/config.ts, src/core/paths.ts, src/core/version.ts, src/core/templates.ts, src/core/manifest.ts, src/core/gitignore.ts, src/commands/status.ts, src/commands/doctor.ts, src/commands/update.ts, src/commands/remove.ts, src/read/url.ts, src/search/engine.ts, src/cli.ts, src/program.ts, package.json, node_modules/commander/lib/command.js (preAction hooks of ancestors run before a subcommand's action, after argument checks), node_modules/vitest 5.0.5 (test.env) · red tests read: test/config.red.node.test.ts, test/doctor.red.node.test.ts, test/doctor-reporting.red.node.test.ts, test/setup-files.red.node.test.ts, test/status.red.node.test.ts, test/ingest/ingest-start.red.node.test.ts, test/ingest/ingest-plan.red.node.test.ts, test/templates/sprint-03-commands.red.node.test.ts, test/templates/wiki-protocol.red.node.test.ts, test/templates/structure.ts, test/e2e/{ingest,read,pack,module-trace}.ts · measured 2026-10-18 on this machine: loadConfig on a 7-line config.yml 0.19 ms median, 0.37 ms p95 (dist/core/config.js, 200 runs); GET https://registry.npmjs.org/wikeeper/latest with read's user agent and Accept header answers 200 application/json, 2,694 bytes, version 0.3.0, no readme"
actor: AI coding agent
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-007-01
  - STORY-007-02
  - STORY-007-03
  - STORY-007-04
  - STORY-007-05
  - STORY-007-06
  - STORY-008-05
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T09:10:00Z
updated_at: 2026-10-18T09:10:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T09:12:40Z
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
  last_stamp: 2026-10-18T09:12:12Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-18T08:47:05Z
---

# STORY-009-01: Version check and version warnings
**Complexity:** L3 — one new module (`src/core/update-check.ts`, K14) and small additions to six existing files: a `preAction` hook on the `ingest` group, the warning in `ingest plan` and `ingest start`, the `update_check` config key, the `status` `version` field and lines, two doctor checks. Plus one WIKI.md bullet, a test config that keeps the check off under test, a perf test and two red-test re-scopes. Each piece is small. The story is L3 because it crosses the ingest group, config, status, doctor and the test harness, and four of those files are shared with earlier SPRINT-04 stories.

## 1. The Spec (The Contract)

### 1.1 User Story
As a wikeeper user whose agent runs the ingest commands, I want those commands to ask npm at most once a day whether a newer wikeeper is out and say so, and `status` and `doctor` to say when this project's files come from another version, so that I hear about new releases and stale project files without the check ever slowing down or breaking my work.

### 1.2 Detailed Requirements
- **R1 — Module (K14).** `src/core/update-check.ts` exports K14 unchanged, plus the additive exports in §3.3. No exported function throws.
- **R2 — The request.**
  - URL: `<registry>/wikeeper/latest`. The registry is `env.npm_config_registry` when that is a non-empty string, else `https://registry.npmjs.org/`. A missing trailing `/` is added before joining, so `https://npm.example.com/repo` gives `https://npm.example.com/repo/wikeeper/latest`.
  - A registry value that is not an `http:` or `https:` URL sends no request and counts as a failed check (saved with `latest: null`). The check never falls back to the public registry when the user named another one.
  - One GET through `fetchSource` (`src/read/url.ts:38`) with `timeoutMs: deps.timeoutMs ?? UPDATE_CHECK_TIMEOUT_MS`, `maxBytes: 65_536` and `fetch: deps.fetch ?? globalThis.fetch`. The user agent is therefore `USER_AGENT` (`src/read/url.ts:5`), as EPIC-009 §2 asks. No body, no cookie, and nothing about the wiki: no path, project name, page or config value.
  - The call races an `unref`'d timer of the same length, so a fetch that ignores its abort signal cannot hold the command (§1.4 Q4).
  - The answer is parsed as JSON and its `version` must match `^\d+\.\d+\.\d+$`. Anything else is a failed check with `latest: null`: a non-2xx status, a timeout, a network error, a body over 64 KB, a body that is not JSON, or a missing or malformed `version`. The version is later printed to the agent and, in STORY-009-02, passed to npm, so nothing else may reach either.
- **R3 — The saved result.**
  - File: `updateCheckFile(paths)` = `<paths.wikiDir>/.cache/update-check.json`, where `src/search/engine.ts:145` keeps `search.json`. The folder is already git-ignored (`src/core/gitignore.ts:83`), and `remove` already deletes it (`src/commands/remove.ts:196`).
  - Content: `{ "checked_at": "<ISO>", "installed": "0.4.0", "latest": "0.4.1" | null }` and a final newline. It is written after every request, whether the request succeeded or failed: `mkdir -p`, write `<file>.<pid>.tmp`, then rename. A failed write is ignored.
  - A saved result is fresh when all of these hold, and is reused without a request:
    - its `installed` equals the running version;
    - `checked_at` parses;
    - `0 <= now - checked_at < UPDATE_CHECK_TTL_MS`.
  - A `checked_at` in the future (a clock set back) is stale. A file that does not parse, or has the wrong shape (versions failing the R2 pattern), counts as no saved result.
  - `readSavedCheck` only reads the file. It never contacts npm.
- **R4 — Off switches (EPIC-009 §2).** `updateCheckEnabled(config, env, issues?)` returns false when any of these holds, and then `checkForUpdate` returns null with no request and no file written:
  - `config.update_check === false`;
  - `issues` holds a `loadConfig` error for `update_check`, for example `update_check: no`, which YAML reads as the string `"no"` (§1.4 Q8);
  - `WIKEEPER_NO_UPDATE_CHECK` is non-empty and not `0` or `false`, in any case;
  - `NO_UPDATE_NOTIFIER` is present, with any value including empty;
  - `CI` is present with any value except `false` or `0`, in any case.
- **R5 — When it runs (§1.4 Q2).** `createIngestCommand(subcommands, deps?: { updateCheck?: UpdateCheckDeps })` (`src/commands/ingest.ts:36`) adds `group.hook("preAction", …)` to the `ingest` group before its subcommands register (`:42`).
  - Commander runs the `preAction` hooks of a command's ancestors before its action, after arguments and options are checked (`node_modules/commander/lib/command.js:1614`). So the hook covers `plan`, `start`, `facts`, `apply`, `abort`, `finish` and any later subcommand. A usage error or `--help` sends no request.
  - The hook does the following:
    1. Take `getOutputContext(actionCommand).cwd`, then `findRepoRoot`, then `stat(<root>/.wiki/config.yml)`. When the file is missing, the hook does nothing, and the action reports `not_initialised` as it does today.
    2. Load the config with its own `loadConfig(root)` call, then `resolvePaths` and `checkForUpdate(paths, config, { ...deps.updateCheck, configIssues: errors })`.
    3. Remember the notice for this program run with `rememberUpdateNotice(actionCommand, notice)`. The notice is `availableMessage(latest, installed)` when `newerVersion` returns a version, else null.
    4. All of it runs inside one try/catch. Any error leaves no notice and changes nothing.
  - The C5 anchor lines in `src/commands/ingest.ts` stay exactly as written.
- **R6 — Where it shows (K15; §1.4 Q1).**
  - `ingest plan` and `ingest start` call `updateNotice(command)` just before `emitResult`. When it is not null, they append it as the last warning: in `ingest plan` (`src/commands/ingest-plan.ts:74`), and in both the `duplicate` (`src/commands/ingest-start.ts:233`) and `registered` (`:308`) results of `ingest start`.
  - The warning is the exact string, in `json.warnings`, or `warning: <text>` on stderr in human output (`src/core/output.ts:107`).
  - Error results carry no warnings (`ErrorEnvelope`, `src/core/output.ts:32`), so an exit 2–5 shows nothing.
  - `facts`, `apply`, `abort` and `finish` run the check but never show it.
  - Data, message, exit code and every other warning stay exactly as in the same run with the check off.
- **R7 — Config key (K15).**
  - `update_check: { type: "boolean", default: true }` goes into `SCHEMA` (`src/core/config.ts:46`) at the top level, right after `enforce` (`:52`), and `WikeeperConfig` gains `update_check: boolean`.
  - `init` does not write it: STORY-007-01's seed is unchanged.
  - `wikeeper config get|set|unset update_check` work through STORY-007-02's type rules (a boolean is settable, `true`/`false` in any case) with no code in this story.
  - Doctor's `config-valid` check reports an invalid value, as for any key.
- **R8 — `status` (K15; §1.4 Q6).**
  - `StatusData.version: { installed: string; latest: string | null; files: string | null }`.
    - `installed`: the running version, in registry form.
    - `latest`: the newer version from the saved result, when the check is on and `newerVersion` returns one; else null.
    - `files`: `npmVersion(manifest.package_version)` when the manifest exists and its version parses with `compareVersions`; else null.
    - It reads only the saved file and the manifest, never the network.
  - Human output: after the last existing line (STORY-008-05's), one line `availableMessage(latest, installed)` when `latest` is set, and one line with the `versionMismatch(...)` message when there is a mismatch. Nothing is printed when neither applies.
  - `collectStatus(paths, config, now, opts?: StatusVersionOptions)` takes an optional fourth parameter, so the existing calls (`test/status.test.ts:80`) still compile. `createStatusCommand(deps)` gains `installed?` and `env?` next to `now`.
  - **WIKI.md bullet (§1.4 Q7).** Section "Lint and status" gains, after STORY-008-05's `archive_candidates` bullet, exactly:
    "- `version`: `installed` is the version that ran this command; `latest` is a newer version on npm, from the check that ingest commands make at most once a day (null when none is known or the check is off); `files` is the version this project's files come from, as the manifest records it (null when it records none). Handle them as said above."
    The bullet names no command and never writes "wikeeper" before a lowercase word (FLASHCARD 2026-10-17 `#templates #vocabulary`). "As said above" points at STORY-009-03's paragraph, which lands later in this sprint.
- **R9 — Version mismatch (K14 `versionMismatch`).** Both sides go through `npmVersion` (`src/core/version.ts:28`), then `compareVersions(installed, files)` (`src/commands/doctor.ts:42`), which reads the leading `x.y.z` (so `0.4.0+abc` compares as `0.4.0`).
  - Result `> 0` → `files-older`, message `this project's wikeeper files are from 0.3.0 (installed 0.4.0): run "wikeeper update"`.
  - Result `< 0` → `files-newer`, message `this project was updated by wikeeper 0.4.0 (installed 0.3.0): run "wikeeper upgrade"`.
  - Equal versions, `files` null, or an unparsable side → null. A different build stamp (`0.4.0+dev` and `0.4.0+abc1234`) is not a mismatch.
- **R10 — Doctor (K15; §1.4 Q5).** `runDoctor` (`src/commands/doctor.ts:87`) always appends both checks, after the integration checks (`:215`), in this order:
  - **`version-mismatch`:**
    - a mismatch → `warning` with the R9 message, fix `run wikeeper update` (files older) or `run wikeeper upgrade` (files newer);
    - matching versions → `ok`: `the project's files are from <v>, the installed version`;
    - no manifest version → `info`: `not checked: the manifest records no version`.
  - **`update-available`:**
    - a newer version is known → `warning` with the `availableMessage` text, fix `run wikeeper upgrade`;
    - a saved result shows nothing newer → `ok`: `no newer version known (checked <checked_at>)`;
    - no saved result → `info`: `not checked yet: ingest commands ask npm at most once a day`;
    - the check is off → `info`: `the update check is off (<reason>)`, where `<reason>` is `update_check: false`, `WIKEEPER_NO_UPDATE_CHECK`, `NO_UPDATE_NOTIFIER` or `CI`.
  - Neither check uses the network. Warnings never change doctor's exit code, which counts errors only (`:239`).
  - `runDoctor(root, run, deps: { nodeVersion?; installed?; env? })`; `createDoctorCommand` passes the deps through.
- **R11 — Nothing else contacts npm.**
  - Only the ingest hook calls `checkForUpdate`.
  - `status` and `doctor` use only `readSavedCheck`, `newerVersion`, `versionMismatch`, `updateCheckEnabled` and `availableMessage`.
  - `hook guard`, `statusline`, `search`, `lint`, `config`, `init`, `update` and `remove` are untouched. `read` keeps its own fetch.
- **R12 — Tests never reach npm (§1.4 Q3).**
  - A new `vitest.config.ts` sets `test.env.WIKEEPER_NO_UPDATE_CHECK = "1"`, so every test runs with the check off, including e2e children that inherit `process.env` (`test/e2e/ingest.test.ts:27`).
  - Tests of the check enable it by injecting `env` (for example `{}`) and `fetch` through deps. No test uses `globalThis.fetch` for it.
- **R13 — Network note.** The header of `src/read/url.ts:1` becomes: `// src/read/url.ts -- one of wikeeper's two network uses (STORY-003-10 R6); the other is the version check in src/core/update-check.ts, which calls fetchSource.`
- **R14 — Performance (EPIC-009 §3).**
  - With a result saved under 24 hours ago, `checkForUpdate` sends no request, and its p95 over 30 calls is under 20 ms.
  - With no saved result and a fetch that never answers, `ingest plan` finishes within 1,600 ms of its median time with the check off, and the next run sends no request.
  - Both are asserted in `test/update-check-perf.red.node.test.ts`, which the `test:perf` script runs (`./package.json:46`).

### 1.3 Out of Scope
- `wikeeper upgrade`, install detection and npm runs (STORY-009-02).
- The agent's instructions on what to tell the user and when to ask; architecture.md and README (STORY-009-03). This story writes only the R8 bullet.
- The new version in the status line (EPIC-009 out of scope); release notes; reading npm's own config files (`npm config get registry`); proxy support beyond what Node's `fetch` does.
- Checking from any command other than the `ingest` subcommands (and STORY-009-02's `upgrade`).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1, EPIC-009 §6 Q1):** Which ingest commands show the notice? The human suggested "every ingest command".
- **Recommended:** Every ingest subcommand may make the daily check, but only `ingest plan` and `ingest start` print the notice. Ingesting one document takes four or five commands, so printing it on each would repeat it in every ingest. Alternative: add the notice to all six (R6 then touches four more files).
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2, hook vs. per action):** K15 puts the check "before every `ingest` subcommand". Each subcommand action already runs `findRepoRoot` and `loadConfig` itself (`src/commands/ingest-plan.ts:53`, `src/commands/ingest-start.ts:99`, and the same in `facts`, `apply`, `abort` and `finish`). Where should the check hook in, and is it acceptable to read `config.yml` twice?
- **Recommended:** One `preAction` hook on the `ingest` group (R5), which reads the config itself. That covers every present and future subcommand from one place, and only `ingest-plan.ts` and `ingest-start.ts` change to show the notice. The second read costs 0.19 ms median and 0.37 ms p95, measured on this machine. Alternative: call the check in each of the six actions after `assertInitialised`, which reads the config once. But it touches four files outside the planned surface, one of them `ingest-finish.ts`, which STORY-008-01, 007-05 and 008-02 also edit, and a future subcommand could forget the call.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q3, the check under test):** Most red tests build the ingest group with default deps: `commands: [ingestCommand]` (`test/ingest/ingest-plan.red.node.test.ts:68`), and `createIngestCommand([createIngestStartCommand(...)])` (`test/ingest/ingest-start.red.node.test.ts:47`). With the check on, these happen:
  - every such test sends a real request to npm;
  - `ingest plan` writes `.wiki/.cache/update-check.json`;
  - once a version newer than the repository's is on npm, the `warnings` assertions break: `test/ingest/ingest-start.red.node.test.ts:79` and `:95` (`toEqual([])`) and `:109` (`toHaveLength(1)`).

  How are tests switched off?
- **Recommended:** A new `vitest.config.ts` with `test: { env: { WIKEEPER_NO_UPDATE_CHECK: "1" } }`, so tests use the documented off switch (R12). Vitest 5.0.5 assigns `test.env` to `process.env` before the tests run, and e2e children spawned without `env` inherit it. No red test changes, and the product code has no test-only branch. Alternative: `update-check.ts` treats `process.env.VITEST` as an off switch. That needs no new file, but the CLI then depends on the test runner.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q4, the fetch):** Reuse `fetchSource`, whose header says it is the only network code (`src/read/url.ts:1`), or write a small dedicated fetch?
- **Recommended:** Reuse it (R2). It already gives the timeout, the size cap and the user agent, tested in `test/read/url.test.ts`. Add the race timer for a fetch that ignores the abort signal, and change the header comment (R13). The comment is the only place that pins "only network code": no test checks it, and architecture.md `:425` changes in STORY-009-03. The registry answered with JSON to `read`'s Accept header (checked 2026-10-18). `url.ts` imports only `exit-codes.js` and `ingest/report.js` (type imports and `formatSize`), so `ingest` loads no read library. `test/e2e/read.test.ts:33` keeps passing.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q5, doctor checks):** K15 names the two checks but not their place or what they show when nothing is wrong. `test/doctor.red.node.test.ts:84` pins the whole id sequence of a healthy doctor run. `test/setup-files.red.node.test.ts:91` pins its first five ids, and `test/doctor.red.node.test.ts:146` its first four.
- **Recommended:** Emit both checks on every run, `ok` or `info` when there is nothing to report, after the integration checks (R10). The two prefix tests are then untouched. The ids show in every `doctor --json`, so `doctorCheckIds()` (`test/templates/structure.ts:213`) finds them when STORY-009-03's text names them. The exact list at `:84` needs a re-scope either way (§3.1 row b).
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q6, `status` with the check off; K15 `latest`):** Should `status` and `doctor` still show a saved newer version after the user turned the check off? And is `version.latest` the raw saved answer, or only a newer one?
- **Recommended:** With the check off, `latest` is null and no "is available" line is shown; doctor's `update-available` check is `info` and names the switch. The file-version mismatch shows either way, because it needs no network and says the project's files are stale. When the check is on, `latest` is the newer version or null (R8), so the agent never compares versions itself. This narrows K15's "from the saved result".
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q7, contract deviation):** The decomposition gives `templates/system/WIKI.md` to STORY-009-03 only. But `test/templates/sprint-03-commands.red.node.test.ts:307` requires the status bullets in WIKI.md to equal the keys of `status --json`, so this story's tree fails until a `version` bullet exists. Who writes it?
- **Recommended:** This story, in the commit that adds the key (R8). STORY-007-05 does the same for `tokens` (its R10), and STORY-008-05 for `archive` and `archive_candidates` (STORY-008-06 Q2). STORY-009-03 checks the bullet and changes nothing in it. WIKI.md order: 007-05 → 008-05 → 009-01 → 007-07 → 008-06 → 009-03.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q8):** `update_check: no` is a likely hand edit. YAML reads it as the string `"no"`, `loadConfig` reports an error and falls back to the default `true`, so the check would run against the user's intent. Treat an invalid value as off?
- **Recommended:** Yes (R4): an invalid `update_check` turns the check off, and doctor's `config-valid` reports the value as today. `wikeeper config set update_check no` is refused by STORY-007-02 anyway, which accepts only `true` and `false`.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q9, immutable red tests):** `test/config.red.node.test.ts:20` and `test/doctor.red.node.test.ts:43`/`:84` fail by design (§3.1 re-scope table). May this story's QA-Red re-scope them?
- **Recommended:** Yes, by content anchor and only as the table lists (FLASHCARD 2026-10-17 `#qa #red-test`). The `config.red` edit sits on STORY-007-01's re-scope of the same assertion.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** Ingest commands gain a network request. Behind a proxy that Node's `fetch` does not use, in an agent sandbox without network, or offline, the first ingest command of the day waits up to 1.5 s.
- **Mitigation:** One failed request a day per project at most (R3); the race timer (R2); the perf test (R14). The failure is silent and saved.
- **Risk:** With `.wiki/.cache` unwritable, every ingest command asks npm again.
- **Mitigation:** Ingest writes `.wiki/raw/` and `.wiki/log/` anyway, so an unwritable `.wiki/` already breaks ingest. Scenario 2 has the row.
- **Risk:** `availableMessage` and the doctor fix name `wikeeper upgrade`, which STORY-009-02 adds after this story. Between the two merges, the sprint branch recommends a command that does not exist yet.
- **Mitigation:** Both stories ship in the same release (0.4.0). If STORY-009-02 slips, the K14 message must change before release.
- **Risk:** Four shared files: `src/core/config.ts` (007-01 → 007-02), `src/commands/status.ts` (007-05 → 008-05), `src/commands/ingest-start.ts` and `src/commands/ingest-plan.ts` (007-03, 007-04), plus `./package.json`'s `test:perf` line, which STORY-007-06 also extends.
- **Mitigation:** Every change is additive and comes last: the key after `enforce`, the status lines after 008-05's, the notice as the last warning, the perf file at the end of the script line. `dep_predecessors` lists all seven stories.
- **Risk:** A private registry in `npm_config_registry` that needs auth answers 401, so its users never see a notice.
- **Mitigation:** By design: wikeeper reads no `.npmrc` tokens (EPIC-009 out of scope). The check fails silently and is saved.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A first check, a reused saved result, and a stale one (24 hours later, or another installed version); a custom registry. |
| Interfaces | T | The notice in `ingest plan` and `ingest start` (JSON warnings and stderr), `status` (text and JSON) and two doctor checks. |
| Data | T | Registry answers (offline, a fetch that never settles, 404, HTML, a malformed version, too large, a bad registry URL) and manifest versions (older, newer, equal with another build stamp). |
| Rules | T | The off switches, a failure that never changes a command, at most one request a day, and the performance budget. |

All scenarios run in-process through `runCli`. The wiki is created by `init` through the default program in a temp git repository (FLASHCARD 2026-10-17 `#qa #test-harness`), with `ingest.permission: ai`, a file `notes.md` and a folder `docs/` holding one new file. Ingest runs use `commands: [createIngestCommand(ingestSubcommands, { updateCheck })]`, where `updateCheck` sets `env`, `fetch`, `now` and `installed: "0.4.0"`.

```gherkin
Feature: Version check and version warnings

  @paths @interfaces
  Scenario: A newer version is reported, and npm is asked once a day
    Given the wiki, the check on (env {}), and an injected fetch that answers {"version":"0.4.1"} and counts its requests
    When I run "wikeeper ingest start notes.md --json" at 2026-10-20T09:00:00Z
    Then one request went to "https://registry.npmjs.org/wikeeper/latest"
    And json.warnings ends with 'wikeeper 0.4.1 is available (installed 0.4.0): run "wikeeper upgrade"', and json.data and the other warnings equal those of the same run with the check off
    And .wiki/.cache/update-check.json holds { "checked_at": "2026-10-20T09:00:00.000Z", "installed": "0.4.0", "latest": "0.4.1" }
    When I run "wikeeper ingest plan docs --json", "wikeeper ingest abort <id> --json" and "wikeeper ingest plan docs" at 2026-10-20T10:00:00Z
    Then no request goes to npm
    And ingest plan's json.warnings is ['wikeeper 0.4.1 is available (installed 0.4.0): run "wikeeper upgrade"'] and no warning of ingest abort contains "is available"
    And the human ingest plan prints 'warning: wikeeper 0.4.1 is available (installed 0.4.0): run "wikeeper upgrade"' on stderr and the same stdout as with the check off
    When I run "wikeeper ingest plan docs --json" at 2026-10-21T09:00:00Z, and then again with installed "0.4.1"
    Then each run sends one more request, and the run with installed "0.4.1" has no version warning
    When npm_config_registry is "https://npm.example.com/repo" in the env and the saved file is deleted
    Then the next ingest command's request goes to "https://npm.example.com/repo/wikeeper/latest"

  @data @rules
  Scenario Outline: Error — when npm can't answer, ingest works as before and asks again only the next day
    Given the wiki with no saved result, the check on, the timeout set to 200 ms through deps, and an injected fetch that <answer>
    When I run "wikeeper ingest start notes.md --json"
    Then the exit code, json.data and json.warnings equal those of the same run with the check off
    And .wiki/.cache/update-check.json <saved>
    And "wikeeper ingest plan docs --json" an hour later sends <again> requests and has no warning containing "is available"

    Examples:
      | answer                                                                  | saved                                                    | again |
      | rejects with a TypeError whose cause code is ENOTFOUND                  | holds "latest": null                                     | 0     |
      | never settles, even after its abort signal fires                        | holds "latest": null                                     | 0     |
      | answers 404                                                             | holds "latest": null                                     | 0     |
      | answers 200 with the body "<html></html>"                               | holds "latest": null                                     | 0     |
      | answers 200 with {"version":"0.4.1 && rm -rf ~"}                        | holds "latest": null                                     | 0     |
      | answers 200 with {"version":"0.4.1"} padded to 70,000 bytes             | holds "latest": null                                     | 0     |
      | is never called, because npm_config_registry is "file:///etc/passwd"    | holds "latest": null                                     | 0     |
      | rejects with ENOTFOUND, while .wiki/.cache is a regular file            | does not exist, and .wiki/.cache is byte-identical       | 1     |

  @rules
  Scenario Outline: The check is off
    Given the wiki, an injected fetch that answers {"version":"0.4.1"}, the env <env> for ingest and status, and <config>
    When I run "wikeeper ingest plan docs --json" and "wikeeper ingest start notes.md --json"
    Then the fetch was called <n> times
    And .wiki/.cache/update-check.json <file>
    And "wikeeper status --json" has data.version.latest <latest>

    Examples:
      | env                                           | config                                          | n | file                     | latest  |
      | {}                                            | "wikeeper config set update_check false" ran    | 0 | does not exist           | null    |
      | {}                                            | config.yml has the line "update_check: no"      | 0 | does not exist           | null    |
      | { WIKEEPER_NO_UPDATE_CHECK: "1" }             | nothing more                                    | 0 | does not exist           | null    |
      | { NO_UPDATE_NOTIFIER: "" }                    | nothing more                                    | 0 | does not exist           | null    |
      | { CI: "true" }                                | nothing more                                    | 0 | does not exist           | null    |
      | { CI: "false", WIKEEPER_NO_UPDATE_CHECK: "0" }| nothing more                                    | 1 | holds "latest": "0.4.1"  | "0.4.1" |

  @interfaces @data
  Scenario Outline: status and doctor report versions from the manifest and the saved result, with no network
    Given the wiki with its manifest's package_version set to "<files>", installed "0.4.0", the check on (env {}), <saved>, and globalThis.fetch replaced by a function that throws
    When I run "wikeeper status", "wikeeper status --json" and "wikeeper doctor --json"
    Then the human status ends with <lines>, and data.version is <version>
    And doctor's "version-mismatch" check is <mismatch>, its "update-available" check is <available>, and doctor exits 0
    And globalThis.fetch was never called

    Examples:
      | files         | saved                                              | lines                                                                                          | version                                                | mismatch                              | available                                                              |
      | 0.3.0+a1b2c3d | no saved result                                    | the line 'this project's wikeeper files are from 0.3.0 (installed 0.4.0): run "wikeeper update"' | { installed: "0.4.0", latest: null, files: "0.3.0" }  | warning with fix "run wikeeper update" | info "not checked yet: ingest commands ask npm at most once a day"     |
      | 0.5.0+dev     | no saved result                                    | the line 'this project was updated by wikeeper 0.5.0 (installed 0.4.0): run "wikeeper upgrade"'  | { installed: "0.4.0", latest: null, files: "0.5.0" }  | warning with fix "run wikeeper upgrade"| info                                                                   |
      | 0.4.0+dev     | a result saved three days ago with "latest": "0.4.1" | the line 'wikeeper 0.4.1 is available (installed 0.4.0): run "wikeeper upgrade"'             | { installed: "0.4.0", latest: "0.4.1", files: "0.4.0" }| ok                                    | warning with fix "run wikeeper upgrade"                                |
      | 0.4.0+abc1234 | a result saved an hour ago with "latest": "0.4.0"  | its "misses:" line and the lines of earlier stories, and no version line                       | { installed: "0.4.0", latest: null, files: "0.4.0" }  | ok                                    | ok "no newer version known (checked <its checked_at>)"                 |

  @rules
  Scenario: The check stays within its time budget
    Given the wiki, installed "0.4.0" and the check on
    When checkForUpdate runs 30 times with a result saved an hour ago and a fetch that counts its calls
    Then the fetch is never called and the p95 of the 30 durations is under 20 ms
    When "wikeeper ingest plan docs --json" runs in-process 5 times with the check off, then once with no saved result and a fetch that never settles, with the default timeout
    Then that run finishes within 1,600 ms of the median of the 5 runs, with their exit code and data, and update-check.json holds "latest": null
    And the next run with the same fetch sends no request
```

### 2.2 Verification Steps (Manual)
- [ ] Extract `~/walkthrough-wiki-backup-2026-10-17.tar.gz` into a scratch folder (read-only use), with wikeeper 0.4.0 from this branch on PATH (`npm link` from a scratch clone, or `node <clone>/dist/cli.js`). In the copy:
  - `wikeeper ingest plan <a folder>` writes `.wiki/.cache/update-check.json`, with `latest` "0.3.0" while 0.3.0 is npm's latest, and prints no version warning;
  - a second run within the hour makes no request (the file's `checked_at` is unchanged);
  - `wikeeper status` prints `this project's wikeeper files are from 0.3.0 (installed 0.4.0): run "wikeeper update"`.
- [ ] With the network off, delete the saved file and run `wikeeper ingest plan <folder>`. It prints the same plan within about 1.5 s more than usual, and the file holds `"latest": null`.
- [ ] `WIKEEPER_NO_UPDATE_CHECK=1 wikeeper ingest plan <folder>` and `CI=1 wikeeper ingest plan <folder>` write no file. `wikeeper doctor` says `the update check is off (WIKEEPER_NO_UPDATE_CHECK)` and `(CI)`.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File (new) | `src/core/update-check.ts` |
| Related Files | `src/commands/ingest.ts`, `src/commands/ingest-plan.ts`, `src/commands/ingest-start.ts`, `src/commands/status.ts`, `src/commands/doctor.ts`, `src/core/config.ts`, `src/core/version.ts`, `src/read/url.ts`, `templates/system/WIKI.md`, `./package.json` |
| Test config (new) | `./vitest.config.ts` |
| Developer Tests (new) | `test/update-check.test.ts` |
| QA-Red Tests (new) | `test/update-check.red.node.test.ts`, `test/update-check-perf.red.node.test.ts` |
| Re-scoped red tests (QA-Red) | `test/config.red.node.test.ts`, `test/doctor.red.node.test.ts` |
| New Files Needed | `src/core/update-check.ts`, `./vitest.config.ts`, `test/update-check.test.ts`, `test/update-check.red.node.test.ts`, `test/update-check-perf.red.node.test.ts` |

- **`src/core/version.ts`:** gains `compareVersions`, moved unchanged from `src/commands/doctor.ts:42` (§3.2).
- **`./package.json`:** only the `test:perf` script (`:46`) gains `test/update-check-perf.red.node.test.ts` at its end. STORY-007-06 extends the same line first.
- **`templates/system/WIKI.md`:** only the R8 bullet.
- **Read, not edited:** `src/core/output.ts` (`getOutputContext`, `emitResult`, the root `preAction` at `:64`), `src/core/paths.ts` (`findRepoRoot`, `resolvePaths`), `src/core/templates.ts` (`readPackageVersion`, `:50`), `src/core/manifest.ts` (`readManifest`, `package_version` at `:31`), `src/commands/update.ts` (`:179` writes `package_version` from `fullVersion()`), `src/search/engine.ts:145`, `src/core/gitignore.ts:83`, `src/commands/remove.ts:196`, `src/cli.ts` (sets `process.exitCode`; never calls `process.exit`).

**Re-scoped red-test assertions** (lines at `6b75807`, a guide only; QA-Red edits by test name and content anchor on the merged tree, §1.4 Q9):

| Row | File and assertion | Change |
|---|---|---|
| (a) | `test/config.red.node.test.ts:19` "DEFAULT_CONFIG has the documented R1 defaults", `expect(DEFAULT_CONFIG).toEqual({ … })` at `:20` | Add `update_check: true` to the expected object, next to STORY-007-01's `tokens` addition. |
| (b) | `test/doctor.red.node.test.ts:84` (S1), `expect(ids).toEqual(["node-version", "wiki-initialised", "config-valid", "manifest-drift", "setup-files", "test-check"])` | Append `"version-mismatch", "update-available"`. |
| (c) | `test/doctor.red.node.test.ts:43`, the fixture's `package_version: "0.0.1"`. S1 and U5 use it. | Change it to the version in `package.json`, read in the test, so a healthy fixture's files match the installed version. Without this, `version-mismatch` warns and three assertions fail: S1 `:85` (`checks.every(… "ok" \|\| … "info")`), S1 `:87` (`json.data.warnings` is 0), and U5 `:189` (`res.warnings` is 1). |

Not re-scoped:
- `test/ingest/ingest-start.red.node.test.ts:79`, `:95` and `:109`, `test/ingest/facts-dry-run.red.node.test.ts:160`, `test/ingest/ingest-facts.red.node.test.ts:139` and `test/ingest/ingest-plan.red.node.test.ts` stay as they are: the check is off under test (R12).
- `test/templates/sprint-03-commands.red.node.test.ts:307` passes once the R8 bullet is in.
- `test/setup-files.red.node.test.ts:91` and `test/doctor.red.node.test.ts:146` check prefixes that the appended checks leave alone.
- `test/doctor-reporting.red.node.test.ts` builds its wikis with `init`, so their files match the installed version and the new checks are `ok` or `info`.
- `test/status.red.node.test.ts` checks lines with `toContain`.

### 3.2 Technical Logic
- **`src/core/update-check.ts`.**
  - Imports: `fetchSource` (`../read/url.js`), `npmVersion` and `compareVersions` (`./version.js`), `readPackageVersion` (`./templates.js`), `ResolvedPaths` and `WikeeperConfig` as types, and `Command` from commander as a type.
  - `compareVersions` moves from `src/commands/doctor.ts:42` to `src/core/version.ts`, unchanged, and `doctor.ts` re-exports it (`export { compareVersions } from "../core/version.js"`). Importing it from `doctor.ts` would create an import cycle, because `doctor.ts` and `status.ts` import `update-check.ts`. `test/doctor.red.node.test.ts:126` loads it from `doctor.js` and keeps working through the re-export, so that file needs no re-scope for this move.
  - `installed` defaults to `npmVersion(readPackageVersion())`, `now` to `() => new Date()`, `env` to `process.env`.
  - **`checkForUpdate`:**
    1. `!updateCheckEnabled(...)` and not `force` → return null.
    2. Unless `force`, read the saved result and return it when fresh (R3).
    3. Otherwise `fetchLatestVersion`, then `writeSavedCheck`, and return the new `SavedCheck`.
  - **`fetchLatestVersion`:** registry URL (R2), then `Promise.race([fetchSource(url, …), timer])`, where the timer resolves `{ latest: null, error: "timeout" }` and is `unref`'d and cleared when the fetch finishes first. Then `JSON.parse(new TextDecoder().decode(bytes))` and the version pattern. The function wraps everything in try/catch and returns `{ latest, error }`. `error` is a short cause (`timeout`, the `fetch_failed` cause such as `ENOTFOUND`, `http 404`, `too_large`, `invalid_answer`, `invalid_registry`), which STORY-009-02 prints.
  - **Per-run notice:** a module-level `WeakMap<Command, string | null>`, keyed by the root command (walk `.parent`).
    - `rememberUpdateNotice(command, notice)` sets it;
    - `updateNotice(command)` reads it, with null when unset.
    - One `createProgram` per `runCli` call means tests in one process never see each other's notice.
- **Hook (`src/commands/ingest.ts`).** Add `group.hook("preAction", (_group, action) => runIngestUpdateCheck(action, deps.updateCheck))` right after `.description(...)` (`:41`), before the subcommand loop.
  - `runIngestUpdateCheck` lives in `update-check.ts` and does R5 steps 1–4.
  - Commander awaits an async hook under `parseAsync` (`node_modules/commander/lib/command.js:1614`). The root's own `preAction` (`src/core/output.ts:64`) runs first, so `ctx.command` is already set.
- **Notice (`ingest-plan.ts`, `ingest-start.ts`).** `const notice = updateNotice(command); if (notice !== null) warnings.push(notice);`, just before each `emitResult`. In `ingest-plan.ts`, pass `warnings` to `emitResult` (today it passes none, so the envelope's `[]` stays `[]` when there is no notice).
- **Status.** At the end of `collectStatus` (`src/commands/status.ts:67`), after STORY-008-05's step:
  - `readManifest(paths.manifestFile)` (null when missing, with an invalid manifest caught as null);
  - `readSavedCheck(paths)`;
  - `updateCheckEnabled(config, env, configIssues)`;
  - then `version` (R8).
  
  `renderStatus` (`:160`) appends the R8 lines last. The status action passes `loadConfig`'s `errors` as `configIssues`.
- **Doctor.** After the integrations guard (`src/commands/doctor.ts:215`):
  - `await guard("version-mismatch", …)`, using the `manifest` doctor already read;
  - `await guard("update-available", …)`, using `readSavedCheck(paths)` and `updateCheckEnabled(config, env, issues)`, where `issues` comes from the `config-valid` step's `loadConfig` result (keep it in a variable).
  
  The `guard` wrapper turns any throw into an error check, as for the others.
- **Config.** One SCHEMA line after `enforce`, and one `WikeeperConfig` field. `DEFAULT_CONFIG` follows from the SCHEMA (`src/core/config.ts:88`).
- **Tests.**
  - The red file drives the CLI through `runCli` with injected deps. The wiki comes from `init` through the default program (FLASHCARD `#qa #test-harness`).
  - The fake fetch records `String(url)` and the `init` it got, and returns `new Response(body, { status })`.
  - The "never settles" fetch ignores the signal; the ENOTFOUND one rejects with `Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } })`.
  - Pass `--json` wherever stdout is parsed (FLASHCARD 2026-10-16 `#qa #cli`).
  - Assert `json.ok` before asserting an absence (FLASHCARD 2026-10-17 `#qa #red-test`).
  - The perf file copies the p95 method of `test/search/search-perf.red.node.test.ts` (index `Math.ceil(0.95 * n) - 1`).

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `<registry>/wikeeper/latest` | GET | None | user agent only | npm version document; only `version` is read |
| `wikeeper ingest plan` / `ingest start` | CLI | None | unchanged | unchanged, plus the notice as the last warning (R6) |
| `wikeeper status` | CLI | None | `--json` | `StatusData` with `version` (R8) |
| `wikeeper doctor` | CLI | None | `--json` | two more checks, `version-mismatch` and `update-available` (R10) |

```ts
// src/core/update-check.ts — K14 (frozen) plus the additive exports marked "additive"
import type { Command } from "commander";
import type { ConfigIssue, WikeeperConfig } from "./config.js";
import type { ResolvedPaths } from "./paths.js";

export const UPDATE_CHECK_TTL_MS = 86_400_000;
export const UPDATE_CHECK_TIMEOUT_MS = 1_500;
export interface SavedCheck { checked_at: string; installed: string; latest: string | null }
export interface UpdateCheckDeps {
  fetch?: typeof fetch;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  installed?: string;           // registry form, e.g. "0.4.0"
  timeoutMs?: number;           // additive: tests use a short timeout
  configIssues?: readonly ConfigIssue[]; // additive: loadConfig errors, for R4's invalid-value rule
}
export function updateCheckEnabled(config: WikeeperConfig, env: NodeJS.ProcessEnv, issues?: readonly ConfigIssue[]): boolean; // third parameter additive
export function readSavedCheck(paths: ResolvedPaths): Promise<SavedCheck | null>;
/** force: skip the saved result and the off switches (an explicit request); the answer is still saved. */
export function checkForUpdate(paths: ResolvedPaths, config: WikeeperConfig, deps?: UpdateCheckDeps & { force?: boolean }): Promise<SavedCheck | null>;
export function newerVersion(saved: SavedCheck | null, installed: string): string | null;
export function availableMessage(latest: string, installed: string): string;
export type VersionMismatch =
  | { kind: "files-older"; files: string; installed: string; message: string }
  | { kind: "files-newer"; files: string; installed: string; message: string };
export function versionMismatch(installed: string, files: string | null): VersionMismatch | null;

// additive
export const REGISTRY_VERSION_RE: RegExp; // /^\d+\.\d+\.\d+$/
export function updateCheckFile(paths: ResolvedPaths): string;
export function fetchLatestVersion(deps?: Pick<UpdateCheckDeps, "fetch" | "env" | "timeoutMs">): Promise<{ latest: string | null; error: string | null }>;
export function writeSavedCheck(paths: ResolvedPaths, saved: SavedCheck): Promise<boolean>; // false when the write failed
export function updateCheckOffReason(config: WikeeperConfig, env: NodeJS.ProcessEnv, issues?: readonly ConfigIssue[]): string | null; // for doctor
export function runIngestUpdateCheck(command: Command, deps?: UpdateCheckDeps): Promise<void>;
export function rememberUpdateNotice(command: Command, notice: string | null): void;
export function updateNotice(command: Command): string | null;

// src/commands/ingest.ts (additive optional parameter)
export function createIngestCommand(subcommands?: readonly IngestSubcommand[], deps?: { updateCheck?: UpdateCheckDeps }): CommandModule;

// src/commands/status.ts (K15)
export interface StatusVersionOptions { installed?: string; env?: NodeJS.ProcessEnv; configIssues?: readonly ConfigIssue[] }
// StatusData gains: version: { installed: string; latest: string | null; files: string | null };
export function collectStatus(paths: ResolvedPaths, config: WikeeperConfig, now: Date, opts?: StatusVersionOptions): Promise<{ data: StatusData; warnings: string[] }>;
export function createStatusCommand(deps?: { now?: () => Date; installed?: string; env?: NodeJS.ProcessEnv }): CommandModule;

// src/commands/doctor.ts
export function runDoctor(root: string, run: Run, deps?: { nodeVersion?: string; installed?: string; env?: NodeJS.ProcessEnv }): Promise<DoctorResult>;
export function createDoctorCommand(deps?: { nodeVersion?: string; installed?: string; env?: NodeJS.ProcessEnv }): CommandModule;

// src/core/config.ts: WikeeperConfig gains update_check: boolean (SCHEMA default true, after enforce)
```

**Contract deviations from K14/K15, all stated:**
1. K14 gains the additive exports above. STORY-009-02 uses `fetchLatestVersion` (it needs the cause, and works outside a wiki) and `writeSavedCheck`. `UpdateCheckDeps` gains `timeoutMs` and `configIssues`; `updateCheckEnabled` gains an optional third parameter.
2. K14 `force` also skips the off switches: `upgrade` is an explicit request (EPIC-009 §0: only ingest subcommands and `upgrade` contact npm).
3. K15 `StatusData.version.latest` is the newer version or null, not the raw saved answer; it is null while the check is off (§1.4 Q6).
4. K15's doctor checks are always emitted (`ok` or `info` when nothing is wrong), after the integration checks (§1.4 Q5).
5. File surface beyond the decomposition: one WIKI.md bullet (§1.4 Q7), `./vitest.config.ts` (§1.4 Q3), the `test:perf` line in `./package.json`, the `src/read/url.ts` header comment (R13), and `compareVersions` moved to `src/core/version.ts` with a re-export from `doctor.ts` (§3.2).

## Task Breakdown

- [ ] QA-Red: re-scope §3.1 rows (a)–(c) by content anchor, on the tree with STORY-007-01's re-scope in place -> R7, R10
- [ ] QA-Red: write `test/update-check.red.node.test.ts` (scenarios 1–4) and `test/update-check-perf.red.node.test.ts` (scenario 5) -> §2.1
- [ ] Add `./vitest.config.ts` with `test.env.WIKEEPER_NO_UPDATE_CHECK = "1"`; confirm `npm test` passes unchanged before any other change -> R12
- [ ] Add `update_check` to `SCHEMA` and `WikeeperConfig` -> R7
- [ ] Write `src/core/update-check.ts`: registry URL, `fetchLatestVersion`, saved result, off switches, `checkForUpdate`, messages, `versionMismatch`, the per-run notice -> R1–R4, R9
- [ ] Add the `preAction` hook to `createIngestCommand`, and the notice to `ingest plan` and `ingest start` -> R5, R6
- [ ] Add `StatusData.version`, its lines and the WIKI.md bullet; add the two doctor checks -> R8, R10
- [ ] Change the `src/read/url.ts` header comment; add the perf file to `test:perf` in `./package.json` -> R13, R14
- [ ] Write `test/update-check.test.ts` (§4.1 unit tests); run `npm run typecheck`, `npm test` and `npm run test:perf` -> R11

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 10 | Registry URL joining (trailing slash, a path, empty, `file:`, not a URL). `REGISTRY_VERSION_RE` (`0.4.1` passes; `v0.4.1`, `0.4.1-beta.1`, `0.4.1 && x`, `0.4` fail). Freshness (23 h 59 m fresh, 24 h stale, a future `checked_at` stale, another installed version stale). A saved file with the wrong shape counts as none. Atomic write, and a write into a `.cache` that is a file returns false. Every R4 switch, including `CI=FALSE`, `CI=0`, `CI=""` and `WIKEEPER_NO_UPDATE_CHECK=false`. `newerVersion` (newer, equal, older, null). `versionMismatch` (older, newer, `+commit` ignored, unparsable, null). `updateNotice` keyed per program (two programs, one module). `updateCheckOffReason` names each switch. The hook does nothing outside an initialised wiki, on a config syntax error, or on a usage error (no fetch call). |
| Integration tests | 0 | No external service: the fetch is injected and the registry is never reached. |
| E2E / acceptance tests | 4 | Scenarios 1–4 through `runCli` (Outline rows counted once). |
| Performance test | 1 | Scenario 5 in `test/update-check-perf.red.node.test.ts`, run by `npm run test:perf`. The p95 of 30 `checkForUpdate` calls with a fresh saved result is under 20 ms, with no request. With a fetch that never settles and the default 1,500 ms timeout, one `ingest plan` run finishes within 1,600 ms of the median of 5 runs with the check off. Baseline (this machine, 2026-10-18): `loadConfig` 0.19 ms median; the saved read is one small JSON file. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] No test reaches the network or writes a real `.wiki/.cache/update-check.json` outside a temp folder. `npm test` passes with only the §3.1 re-scopes in red files.
- [ ] `npm run test:perf` passes with the update-check budget and the earlier budgets.
- [ ] `test/templates/sprint-03-commands.red.node.test.ts:307`, `test/templates/wiki-protocol.red.node.test.ts` and `test/templates.test.ts` pass with the R8 bullet.
- [ ] `npm run typecheck` passes; no new runtime dependency in `./package.json`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/commands/ingest.ts:36` — `createIngestCommand`, the group the hook goes on; `src/core/output.ts:64` — the root `preAction` hook, the precedent for a hook.
- **Surface:** `src/read/url.ts:38` — `fetchSource` (timeout, size cap, `USER_AGENT` at `:5`), reused for the request.
- **Surface:** `src/core/version.ts:28` — `npmVersion`; `src/commands/doctor.ts:42` — `compareVersions`, which already reads `0.4.0+abc` as `0.4.0`.
- **Surface:** `src/core/manifest.ts:31` — `package_version`, written by `update` (`src/commands/update.ts:179`) and `init`, and never compared until now.
- **Surface:** `src/search/engine.ts:145` — where `search.json` sits in the wiki's cache folder, the pattern for the saved result; `src/core/gitignore.ts:83` — the folder is ignored; `src/commands/remove.ts:196` — `remove` deletes it.
- **Surface:** `src/core/config.ts:46` — `SCHEMA`; `src/commands/status.ts:67` — `collectStatus`; `src/commands/doctor.ts:87` — `runDoctor`.
- **Coverage of this requirement:** partial (about 60%, as EPIC-009 §Existing Surfaces says). Versions, the manifest, the fetch with its limits, the cache folder and the doctor and status frames exist. The check, the saved result, the off switches and the four outputs are new.

## Prior work

- [[EPIC-009]] (parent; §6 Q1 is §1.4 Q1 here). The duplicate check (cleargate-wiki-query, 2026-10-18, recorded in EPIC-009) found no earlier update check. A grep of `.cleargate/wiki`, `.cleargate/delivery/archive` and `FLASHCARD.md` for "update check", "upgrade" and "newer version" finds only SPRINT-04 and EPIC-009 (2026-10-18).
- Builds on [[STORY-003-10]] (`fetchSource` and "only `read` uses the network", amended here), [[STORY-001-10]] (the `<version>+<commit>` stamp `npmVersion` strips), [[STORY-001-05]] and [[STORY-002-11]] (`update` writes `package_version`), [[STORY-001-07]] and [[STORY-002-07]] (doctor checks and their reporting), [[STORY-005-05]] (`status`), [[STORY-003-04]] (the ingest group, contract C5) and [[STORY-006-09]] (the status-bullet check in WIKI.md).
- Coordinates with [[STORY-007-01]] (the `config.red` re-scope), [[STORY-007-02]] (`config set` by type), [[STORY-007-05]] and [[STORY-008-05]] (status lines and WIKI.md bullets), [[STORY-007-03]] and [[STORY-007-04]] (`ingest start`, `ingest plan`), [[STORY-007-06]] (`test:perf`). Consumed by [[STORY-009-02]] (K14) and [[STORY-009-03]] (the bullet and the messages).

## Why not simpler?

- **Smallest existing surface that could carry this:** a doctor check comparing `package_version` in the manifest with the installed version (`src/commands/doctor.ts:42`, `src/core/manifest.ts:31`), with no network, plus a README line about `npm install -g wikeeper@latest`.
- **Why isn't extension / parameterization / config sufficient?** That check sees only the installed version, never a newer one on npm. A user (or an npx user whose hooks are pinned) would never hear of a release, and EPIC-009 asks for both the release notice and the mismatch notice. The epic's rules shape the rest, and each rule maps to an existing piece:
  - the check must never change a command → one guarded hook rather than edits to six actions;
  - at most one request a day → the saved file in the existing cache folder;
  - opt-out → one SCHEMA key and three environment variables;
  - no test may reach the network → injected deps and the test-config switch;
  - the request itself → `fetchSource`.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/core/update-check.ts` is a planned path in EPIC-009 §4 and K14; `./vitest.config.ts` and the test files are this story's own.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
- [x] §1.4 Q1–Q9 decided by the human, and EPIC-009 approved (Gate 1).
