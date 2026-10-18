---
epic_id: EPIC-009
parent_ref: null
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "The human's request in chat, 2026-10-18: let users update wikeeper from the CLI, and check whether a new version is available · the human's answers the same day: check on ingest commands (\"maybe on every ingest command?\"), the CLI runs npm itself, in SPRINT-04 · architecture.md v0.4 §2, §3 and :425 (`read` is the only command that uses the network) · codebase as cited"
owner: Sandro Suladze
target_date: null
created_at: 2026-10-18T08:44:47Z
updated_at: 2026-10-18T08:44:47Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T09:46:07Z
  transition: ready-for-decomposition
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id EPIC-009
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-18T08:46:01Z
  sessions: []
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
    <rule>Only the `ingest` subcommands and `upgrade` contact npm. `hook guard`, `statusline`, `search`, `lint`, `status`, `doctor`, `config`, `init`, `update` and `remove` never do; `status` and `doctor` read the saved result only.</rule>
    <rule>The check is off with `update_check: false` in config.yml, `WIKEEPER_NO_UPDATE_CHECK=1`, `NO_UPDATE_NOTIFIER`, or `CI`. No test reaches the network: the fetch and the npm runner are injected.</rule>
    <rule>`upgrade` runs only when the user asks; the agent asks first (WIKI.md). It never runs `sudo`. It changes only package-owned files, through `update` (architecture.md §2 principle 4).</rule>
  </architecture_rules>
  <target_files>
    <file path="src/core/update-check.ts" action="create" />
    <file path="src/commands/upgrade.ts" action="create" />
    <file path="src/commands/ingest.ts" action="modify" />
    <file path="src/commands/ingest-plan.ts" action="modify" />
    <file path="src/commands/ingest-start.ts" action="modify" />
    <file path="src/commands/status.ts" action="modify" />
    <file path="src/commands/doctor.ts" action="modify" />
    <file path="src/core/config.ts" action="modify" />
    <file path="src/program.ts" action="modify" />
    <file path="templates/system/WIKI.md" action="modify" />
    <file path="architecture.md" action="modify" />
    <file path="README.md" action="modify" />
  </target_files>
</agent_context>
```

## 1. Problem & Value

**Why:**
- Nothing tells a user that a newer wikeeper exists. People who started with `npx wikeeper init` have hooks pinned to that exact version (`npx -y wikeeper@0.3.0 hook guard …`, `src/agents/enforce/guard-command.ts:73`). They stay on it until someone runs `update` from a newer wikeeper.
- Upgrading takes two steps that users don't know about: install the new package, then run `wikeeper update` in each project. If the second step is skipped, the project's instructions, skills and hooks stay old. The project records the version its files came from (`.wiki/system/manifest.json`, `package_version`), but nothing compares it with the installed one.
- In a shared repository, a teammate can commit files from a newer `update` while someone else still runs an older wikeeper. Nothing says so.

**What:**
- Ingest commands check npm once a day and say when a newer version is out.
- `status` and `doctor` say when the installed wikeeper and the project's files don't match, and what to run.
- `wikeeper upgrade` does both steps.
- The agent tells the user once and upgrades only on a yes.

**Success Metrics:**
- With a newer version on npm, the first ingest command of the day reports it, and later ingest commands that day send no request (a test counts the requests to an injected fetch).
- With npm unreachable, ingest commands exit exactly as before; the extra time is at most 1.5 s, once a day.
- After `wikeeper upgrade`, `wikeeper --version` and the project's manifest both show the new version, for a global, a project and an npx install.
- Part-4 walkthrough: with the walkthrough project's files from 0.3.0 and 0.4.0 installed, the agent tells the user the files are out of date and runs `update` only after a yes.

## 2. Scope Boundaries

**IN-SCOPE (Build This)**
- [ ] **Version check** (`src/core/update-check.ts`):
  - `GET <registry>/wikeeper/latest`, where the registry is `https://registry.npmjs.org` or `npm_config_registry` when set; 1.5 s timeout; 64 KB cap; reads `version`. The user agent names wikeeper, as `read`'s does (`src/read/url.ts:5`).
  - Saved in `.wiki/.cache/update-check.json` as `{ checked_at, installed, latest }`, with `latest: null` after a failed check. Reused for 24 hours; a saved result for another installed version is stale at once.
  - Compares registry versions (`npmVersion`, `src/core/version.ts:28`) with `compareVersions` (`src/commands/doctor.ts:42`).
  - Never throws.
- [ ] **When it runs:** before every `wikeeper ingest` subcommand (plan, start, facts, apply, abort, finish), inside a wiki project. Off with:
  - `update_check: false`, a new top-level config key (boolean, default true, not written by `init`, settable with `wikeeper config set`);
  - `WIKEEPER_NO_UPDATE_CHECK=1`, `NO_UPDATE_NOTIFIER` (any value), or `CI` (any value except `false` or `0`).
- [ ] **Where it shows:** while a newer version is known, `ingest plan` and `ingest start` add the warning `wikeeper 0.4.1 is available (installed 0.4.0): run wikeeper upgrade`; `status` and `doctor` show the same text from the saved result.
- [ ] **Files from another version** (no network), shown by `status` and `doctor`:
  - installed newer than the project's files: `this project's wikeeper files are from 0.3.0 (installed 0.4.0): run wikeeper update`;
  - installed older than the project's files: `this project was updated by wikeeper 0.4.0 (installed 0.3.0): run wikeeper upgrade`.
- [ ] **`wikeeper upgrade [--check]`** (`src/commands/upgrade.ts`):
  - Asks npm afresh and saves the answer.
  - Finds how the running wikeeper was installed, from its own package folder:
    - a global npm install: `npm install -g wikeeper@<latest>`, then `wikeeper update` in the project;
    - the project's `node_modules`: `npm install wikeeper@<latest>` in the project root, in the same dependencies section, then `node_modules/.bin/wikeeper update`;
    - npx's cache: nothing to install; `npx -y wikeeper@<latest> update`, which re-pins the hooks;
    - anything else (pnpm, yarn, bun, a source checkout): exit 1 with the command to run by hand; nothing runs.
  - `update` runs as the new version, in a child process, because the running process still holds the old code.
  - Already on the latest: when the project's files are older, it runs `update`; otherwise it says so and runs nothing.
  - Outside a wiki project, a global install is upgraded and no `update` runs.
  - When npm fails (permissions, network), it exits 1 and shows npm's last lines and the command to run by hand. For a global permission error that command starts with `sudo`, which `upgrade` never runs itself.
  - `--check` reports `{ installed, latest, newer, install, command }` and installs nothing.
- [ ] **Agent instructions** (`WIKI.md`):
  - When output says a newer version is available, tell the user once per session and ask; on yes, run `wikeeper upgrade`. Never upgrade unasked.
  - When `status` says the project's files are from another version, tell the user and, on yes, run the command it names (`update` or `upgrade`); never run either unasked.
- [ ] **Docs:**
  - architecture.md: `read` and the version check are the only network uses, and `upgrade` runs npm (`:425`, §2); §3 lifecycle gains `upgrade`; a new decision entry.
  - README: upgrading, the check, and how to turn it off.

**OUT-OF-SCOPE (Do NOT Build This)**
- Upgrading through pnpm, yarn, bun, Volta or Homebrew.
- Upgrading automatically or in the background; checking from commands other than `ingest` and `upgrade`.
- The new version in the status line.
- Release notes in the notice; downgrades; installing a chosen version (`upgrade --version`).
- Reading npm's own config (`npm config get registry`); only `npm_config_registry` is read. Proxy support beyond what Node's `fetch` does.

## 3. The Reality Check (Context)

| Constraint Type | Limit / Rule |
|---|---|
| Reliability | The check never changes a command's result or exit code; a failure is silent and saved. |
| Performance | Extra time per ingest command, measured by a test with an injected fetch: with a saved result under 24 hours old, no request and < 20 ms; with a fetch that never answers, the command still finishes within 1.6 s of its usual time, once a day. |
| Network | The second network use after `read`: one GET to the npm registry, no wiki data. Behind a proxy that Node's `fetch` doesn't use, the check fails silently. |
| Safety | `upgrade` runs npm only when asked and never with `sudo`; it replaces only package-owned files, through `update`. |
| Tests | No test reaches npm or runs npm: the fetch and the npm runner are injected, and the check is off in the test environment. |
| Sequencing | After STORY-007-02 (`config set` covers `update_check`) and STORY-007-07 (0.4.0). `WIKI.md` merges last, after STORY-008-06. |

## Existing Surfaces

- **Surface:** `src/commands/update.ts:75` — `runUpdate` refreshes package-owned files from the installed package. `upgrade` runs it as the new version.
- **Surface:** `src/agents/enforce/guard-command.ts:35` — `resolveGuardForm` tells PATH, project and npx installs apart for the hooks; `:73` pins npx hooks to a version.
- **Surface:** `src/core/version.ts:28` — `npmVersion`; `src/commands/doctor.ts:42` — `compareVersions`.
- **Surface:** `src/core/manifest.ts:31` — `package_version`, written to the project's manifest (`manifestFile`, `src/core/paths.ts:46`, committed with the project), never compared today.
- **Surface:** `src/read/url.ts:38` — `fetchSource`, today's only network code: timeout, size cap, user agent.
- **Surface:** `src/core/gitignore.ts:83` — the wiki's cache folder is already git-ignored.
- **Surface:** `src/commands/ingest.ts:36` — `createIngestCommand`, the group the check hooks into.
- **Surface:** `src/core/config.ts:46` — `SCHEMA`, which gains `update_check`.
- **Coverage of this epic's scope:** about 60% extension. Versions, the manifest, install detection, fetching, the cache folder and `update` exist; the check and `upgrade` are new.

## Prior work

- No prior work on an update check or an upgrade command (cleargate-wiki-query, 2026-10-18).
- [[STORY-002-11]] and [[STORY-001-05]]: `update` brings wikeeper's own files up to the installed version; tests can't easily simulate a newer package, so versions are injected.
- [[STORY-001-10]]: the `<version>+<commit>` version stamp.
- [[EPIC-003]] and [[STORY-003-10]]: "only `read` may touch the network", which this epic amends.
- [[STORY-002-07]]: doctor checks whose fix is "run wikeeper update".
- [[STORY-007-07]]: the 0.4.0 version; publishing stays a human step after Gate 4.

## Why not simpler?

- **Smallest existing surface that could carry this epic:** a README line ("run `npm install -g wikeeper@latest`, then `wikeeper update`") and a doctor check comparing the installed version with the project's manifest, with no network.
- **Why isn't extension / parameterization / config sufficient?** Users don't reread the README after installing. The doctor check sees only the installed version, never a newer one on npm, so nobody would hear of a release, and npx users' hooks stay pinned. The human asked for both the check and the CLI running npm (2026-10-18).

## 4. Technical Grounding (The "Shadow Spec")

**Affected Files:**
- `src/core/update-check.ts` (new) — the check, the saved result, the off switches.
- `src/commands/ingest.ts` — runs the check before each subcommand.
- `src/commands/ingest-plan.ts`, `src/commands/ingest-start.ts` — the warning.
- `src/commands/status.ts` — the `version` field and lines.
- `src/commands/doctor.ts` — `update-available` and `version-mismatch` checks.
- `src/core/config.ts` — `update_check`.
- `src/commands/upgrade.ts` (new), `src/program.ts` — the command.
- `templates/system/WIKI.md`, `architecture.md`, `README.md` — instructions and docs.

**Data Changes:**
- New file `.wiki/.cache/update-check.json`: `{ "checked_at": "<ISO>", "installed": "0.4.0", "latest": "0.4.1" | null }`.
- config.yml: `update_check` (boolean, default true).
- `status --json`: `version: { installed, latest, files }` (`latest` from the saved result or null; `files` from the manifest or null).
- `upgrade --json`: `{ installed, latest, upgraded, install, commands_run, updated }`; `upgrade --check --json`: `{ installed, latest, newer, install, command }`.

## 5. Acceptance Criteria

```gherkin
Feature: Version check and upgrade

  Scenario: A newer version is reported, and npm is asked once a day
    Given wikeeper 0.4.0 is installed and npm's latest version is 0.4.1
    When I run "wikeeper ingest start notes.md --json"
    Then its warnings include 'wikeeper 0.4.1 is available (installed 0.4.0): run wikeeper upgrade'
    When I run another ingest command an hour later
    Then no request goes to npm

  Scenario: Offline, ingest works as before
    Given npm cannot be reached
    When I run "wikeeper ingest start notes.md"
    Then it exits as it would without the check, with no version warning
    And no ingest command sends another request that day

  Scenario: The check is off
    Given "update_check: false" in config.yml
    When I run any ingest command
    Then no request goes to npm

  Scenario: The project's files are from an older version
    Given the project's manifest says 0.3.0 and wikeeper 0.4.0 is installed
    When I run "wikeeper status"
    Then it says 'this project's wikeeper files are from 0.3.0 (installed 0.4.0): run wikeeper update'
    And "wikeeper doctor" reports it as a warning

  Scenario: Upgrade a global install
    Given wikeeper 0.4.0 is installed globally with npm and npm's latest version is 0.4.1
    When I run "wikeeper upgrade" in a wiki project
    Then it runs "npm install -g wikeeper@0.4.1", then wikeeper 0.4.1's "update" in the project
    And the project's manifest says 0.4.1

  Scenario: Upgrade through npx re-pins the hooks
    Given the project's hooks run "npx -y wikeeper@0.4.0 hook guard --agent claude" and npm's latest version is 0.4.1
    When I run "wikeeper upgrade" through npx
    Then it runs "npx -y wikeeper@0.4.1 update"
    And the hooks run "npx -y wikeeper@0.4.1 hook guard --agent claude"

  Scenario: Already up to date
    Given wikeeper 0.4.1 is installed, npm's latest version is 0.4.1, and the project's files are from 0.4.1
    When I run "wikeeper upgrade"
    Then it says wikeeper 0.4.1 is the latest version and runs nothing

  Scenario: Error — npm refuses
    Given a global install whose folder needs administrator rights
    When I run "wikeeper upgrade"
    Then it exits 1, shows npm's error and "sudo npm install -g wikeeper@0.4.1" to run by hand
    And the project's files are unchanged

  Scenario: Error — an install wikeeper can't upgrade
    Given wikeeper was installed with pnpm
    When I run "wikeeper upgrade"
    Then it exits 1, prints the command to run by hand, and runs nothing
```

## 6. AI Interrogation Loop (Human Input Required)

- None. On 2026-10-18 the human approved the recommended answers (SPRINT-04 `plans/gate1-decisions.md` items 41–43), now part of §2:
  - Any ingest subcommand may make the daily check; only `ingest plan` and `ingest start` print the notice.
  - `upgrade` installs with npm only; pnpm, yarn and bun installs get the command to run by hand.
  - The agent asks before running `upgrade` and before running `update`.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Coding Agent):
- [x] `approved: true` is set in the YAML frontmatter.
- [x] The `<agent_context>` block is complete and validated.
- [x] §4 Technical Grounding contains 100% real, verified file paths.
- [x] §6 AI Interrogation Loop is empty (all human answers integrated into the spec).
- [x] 0 "TBDs" exist in the document.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered.
