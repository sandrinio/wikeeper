---
story_id: STORY-007-02
parent_epic_ref: EPIC-007
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-007 (approved 2026-10-18) §2 (the wikeeper config command; list settings stay hand-edited; update never rewrites config.yml), §5 (the limits change from the CLI, an invalid limit, an unknown key), §6 (the human chose a general config get/set/unset over a limits-only command, 2026-10-18) · SPIKE-003 (Completed 2026-10-18) for the limits being set · SPRINT-04 decomposition brief: K3 (owned here), K2 (consumed from STORY-007-01) · verified at 6b75807: src/core/config.ts, src/core/paths.ts, src/core/output.ts, src/core/exit-codes.ts, src/program.ts, src/commands/rules.ts, src/commands/setup.ts, src/commands/doctor.ts, src/commands/init.ts, src/commands/update.ts, src/agents/enforce/index.ts, test/config.test.ts, test/config.red.node.test.ts, test/help.red.node.test.ts · yaml 2.9.1 setIn and deleteIn checked in a scratch script (2026-10-18), including the failure of setConfigValue on a nested key in an empty config.yml · real data read-only: the config.yml in ~/walkthrough-wiki-backup-2026-10-17.tar.gz (no tokens key; set then unset of tokens.page.red returns it byte-identical in the scratch script)"
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-007-01
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T07:53:30Z
updated_at: 2026-10-18T07:53:30Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T08:03:37Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-007-02
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-18T08:53:41Z
  sessions: []
---

# STORY-007-02: `wikeeper config get / set / unset`
**Complexity:** L2 — one new command module (`src/commands/config.ts`) with three subcommands, the K3 helpers and a fix for nested writes in `src/core/config.ts`, and one registration line in `src/program.ts`. Builds on STORY-007-01's `tokens` SCHEMA, `token-count` leaf and `tokenLimitIssues` (K2); until it merges, build against those frozen signatures.

## 1. The Spec (The Contract)

### 1.1 User Story
As a wiki user, through my agent or in a terminal, I want to see every setting with its value and where that value comes from, and to change or reset one setting with a command, so that I can raise a token limit or switch the ingest permission without opening `config.yml` and without losing its comments.

### 1.2 Detailed Requirements
- **R1 — Command.** `wikeeper config get [key]`, `wikeeper config set <key> <value>` and `wikeeper config unset <key>`, with the root `--json`.
  - Each finds the repository with `findRepoRoot(ctx.cwd)`, loads the config and calls `assertInitialised`: no `.wiki/config.yml` → exit 1 `not_initialised`.
  - A YAML syntax error → exit 1 `E_CONFIG_SYNTAX` (from `loadConfig`); the file is unchanged.
  - Keys are the SCHEMA's dotted paths, case-sensitive: 21 leaves once STORY-007-01 has added `tokens`. STORY-009-01 (same sprint) adds a top-level boolean `update_check` later, so tests take the key list from `configLeafKeys()` and never pin the count or the last key (consistency audit, 2026-10-18).
- **R2 — Leaves (K3).**
  - `getConfigLeaf(keyPath)` returns `{ type, default, allowed? }` for a leaf, and `null` for a group (map) or an unknown key. `type` is the SCHEMA type (`string`, `boolean`, `integer`, `string[]`, `string|null`, `enum`, `content_dir`, `token-count`); `allowed` is given for an enum.
  - `configLeafKeys(prefix?)` (additive) returns the leaf keys under `prefix`, or every leaf key, in SCHEMA order; `[]` when `prefix` is neither a group nor a leaf.
  - **Settable** (14): `profile`, `setup_completed_at`, `enforce`, `ingest.permission`, `ingest.ambient_offers`, `ingest.delegate`, `ingest.extractor_model`, `ingest.writer_model`, `lint.stale_after_days` and the five `tokens` keys.
  - **Not settable** (7): the six list settings (`agents`, `private`, `ingest.whitelist.kinds`, `ingest.whitelist.origins`, `hooks.pre_ingest`, `hooks.post_ingest`) and `content_dir` (§1.4 Q1). `get` shows them all.
- **R3 — Key checks (K3).** `checkConfigKey(keyPath, use: "get" | "set")` (additive) throws a `WikeeperError` with exit 2. `get`, `set` and `unset` all use it, and `parseConfigValue` calls it first. Codes:
  - `invalid_config_key`: an unknown key; or a group key with `use: "set"`. The message is `unknown config key <key>; keys under <parent>: <k1>, <k2>, …`, where `<parent>` is the nearest prefix of the key that is a SCHEMA group. With no such prefix it is `unknown config key <key>; known keys: <every leaf key, in SCHEMA order>`. A group key gives `<key> is a group of settings; keys under <key>: …`. Details: `{ key, known: string[] }`.
  - `config_key_not_settable` (`use: "set"`), details `{ key }`, for:
    - a list setting: `<key> is a list setting: edit .wiki/config.yml by hand`, and for `agents` also `, or run wikeeper init --agents <list>`;
    - `content_dir`: `content_dir is not changed with config set: move pages/, raw/, log/ and index.md to the new folder, edit content_dir in .wiki/config.yml, then run wikeeper update`.
- **R4 — Values (K3).** `parseConfigValue(keyPath, raw: string)` returns the value to write:
  - string → `raw`;
  - `string|null` → `null` for `null`, else `raw`;
  - boolean → `true` or `false`, in any case;
  - integer → digits only, then the SCHEMA rule (positive);
  - enum → one of `allowed`;
  - `token-count` → STORY-007-01's rule (`20000`, `20k`, `1.5k`), as a number.
  Anything else throws `WikeeperError(ExitCode.USAGE, "invalid_config_value", formatConfigIssue({ key, value: raw, message }))` with the leaf's own message, e.g. `ingest.permission: "sometimes" — allowed: ai, ask, whitelist`. Details: `{ key, value: raw, message }`.
- **R5 — `get`.** No key → every leaf; a group key → the leaves under it; a leaf → that leaf. Each entry is `{ key, type, value, default, from_default, settable, allowed? }`:
  - `value` is the effective value from `loadConfig`, and `default` the SCHEMA default;
  - `from_default` is true when `config.yml` does not set the key (as `configKeyIsSet` tells), or sets it to a value `loadConfig` refused (an `errors` entry with that key).
  Data: `ConfigGetData = { key: string | null; entries }`. Every `loadConfig` error and warning is a warning (`formatConfigIssue`), so a yellow-above-red pair written by hand shows up here (STORY-007-01 R6). Human output:
  - a leaf → one line `<value>`, plus ` (default)` when `from_default`;
  - otherwise one line per entry, `<key>: <value>` plus ` (default)`.
  Strings print as they are; numbers, booleans and `null` as text; lists as JSON (`["claude"]`). `get` exits 0 and writes no file: STORY-007-07 allows it as a read-only command.
- **R6 — `set`.**
  1. `parseConfigValue`.
  2. **Pair check:** for a key under `tokens.<g>.`, put the new value into a copy of the effective config and run `tokenLimitIssues` (K2). An issue in group `<g>` → exit 2 `invalid_config_value` with `formatConfigIssue(issue)`, which names both keys (`tokens.page.yellow: 20000 — must be below tokens.page.red (10000)`). The file is unchanged.
  3. `setConfigValue(root, key, value)`.
  Data: `ConfigSetData = { key, value, previous, changed }`. `previous` is the effective value before; `changed` is what `setConfigValue` returned (false: the file already held that value and was not rewritten). Human output: `tokens.source.yellow: 30000 (was 20000)`, or `tokens.source.yellow is already 30000`. A `token-count` value is written as a number (`30k` → `30000`), as EPIC-007 §5 shows.
- **R7 — `unset` (K3).** Key check as for `set`, then the pair check with the key's default in place of a new value, then `unsetConfigValue(root, key)`. That uses the Document API:
  - it removes the key, then each group map the removal left empty, up to the top;
  - comments on other keys and blank lines elsewhere survive;
  - it returns false, and does not write, when the file does not set the key or does not exist.
  Data: `ConfigSetData` with `value` = the default now in effect. Human output: `tokens.source.yellow: back to the default 20000 (was 30000)`, or `tokens.source.yellow is not set; the default 20000 applies`.
- **R8 — Writes keep the file.** `setConfigValue` and `unsetConfigValue` share one private read-edit-write helper. It keeps the BOM, CRLF line ends, comments and key order, as `setConfigValue` does today (`src/core/config.ts:216`).
  - Fix: `setConfigValue` builds a missing root map with `new YAML.YAMLMap()` and no schema (`src/core/config.ts:233`). A nested key in an empty or comment-only `config.yml` therefore throws `Expected YAML collection at ingest`, and so does a group written with no value (`tokens:`), checked with yaml 2.9.1.
  - After the fix: the root map is built with `doc.schema`; a group whose value is `null` becomes an empty map; a group that is not a map (`tokens: 5`) → exit 1 `config_invalid`, `tokens must be a mapping in .wiki/config.yml; fix it by hand`, file unchanged.
  - Its current callers set top-level keys (`setup --done`, `init --agents`, `--enforce`) and see no change.
- **R9 — Settings with effects elsewhere (§1.4 Q2).** After a `set` or `unset` of `enforce` that changed the file, the warning is `enforce takes effect after wikeeper update (it adds or removes the enforce entries)`: `update` installs or removes them from the config (`src/agents/enforce/index.ts:450`). `setup_completed_at` and `profile` are set as the SCHEMA allows, with no warning.
- **R10 — Registration and help.** `src/commands/config.ts` exports `configCommand`.
  - The group description is `show and change settings in .wiki/config.yml`.
  - `get [key]`: `print one setting, a group or every setting; (default) marks built-in defaults`.
  - `set <key> <value>`: `change one setting (list settings are edited in .wiki/config.yml)`.
  - `unset <key>`: `remove a setting from .wiki/config.yml so its default applies`.
  - `src/program.ts` appends `configCommand` at the end of `defaultCommands` as it stands when this story merges: one import and one entry, the convention of STORY-005-05 R12. STORY-007-06 appends `statusline` the same way.

### 1.3 Out of Scope
- Editing list settings (`agents`, `private`, whitelist lists, hooks) and moving the content folder.
- The allow rule that lets agents run `config get` without a prompt, and the instruction text on when to change a limit (STORY-007-07).
- New validation of a key's value beyond the SCHEMA (for example, `profile` against `init`'s profiles).
- Reading or writing any file other than `.wiki/config.yml`.

### 1.4 Open Questions

- **Question (Q1, `content_dir`):** Should `config set content_dir` (and `unset`) be allowed? `config.yml` always stays at `.wiki/config.yml` (`src/core/paths.ts:45`), but `pages/`, `raw/`, `log/` and `index.md` live under `content_dir` (`src/core/paths.ts:40`). Changing only the setting makes the wiki look empty, and `status`, `search` and `lint` would read a folder with nothing in it. The `.gitignore` block also follows `content_dir` and is rewritten only by `init` and `update` (`src/commands/update.ts:205`).
- **Recommended:** Refuse it (R3, exit 2 `config_key_not_settable`) with a message that says how to move the content: move the four entries, edit `content_dir` by hand, run `wikeeper update`. `get content_dir` works. This also keeps K3's `parseConfigValue(keyPath, raw)` free of a `root` argument, which only the `content_dir` check would need. Moving the content as a command would be its own story.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2, settings that act elsewhere):** `enforce` only takes effect when `wikeeper update` adds or removes the hook entries. `setup_completed_at` is normally stamped by `setup --done`, and unsetting it sends the agent through `SETUP.md` again. `profile` accepts any string in the SCHEMA, though `init` knows only `management`. Should `config set` allow these keys?
- **Recommended:** Allow all three, since each is a single value the SCHEMA validates and the human asked for every single-value setting. Add one warning for `enforce` (R9), and keep the SCHEMA's rules otherwise (§1.3).
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

### 1.5 Risks

- **Risk:** `src/core/config.ts` is changed by STORY-007-01 first, and `src/program.ts` by STORY-007-06 too.
- **Mitigation:** STORY-007-01 is a predecessor and this story builds on its merged tree. In `src/program.ts` each story appends one import and one array entry, so a rebase meets at most a one-line conflict at the end of `defaultCommands`.
- **Risk:** Moving the write path into a shared helper could change what `setConfigValue`'s callers write.
- **Mitigation:** The existing tests (`test/config.red.node.test.ts:124`–`:168`, `test/config.test.ts:62`–`:74`: comments, nested insert, unchanged value, missing file, BOM and CRLF) must pass unchanged; R8's fix only touches the cases that throw today.
- **Risk:** Unsetting the last key of a group removes the group's own comment line: in the seed, `# Token limits…` above `tokens:` goes once all five `tokens` keys are unset. `yaml` attaches that comment to the group's key.
- **Mitigation:** By design: the group is gone and its defaults apply. Stated here and checked in a scratch script; comments on every other key survive.
- **Risk:** An agent changes a limit the user did not ask for.
- **Mitigation:** Only `config get` gets an allow rule (STORY-007-07), so `set` and `unset` still ask in the agent's permission prompt. The instructions say to change limits only when the user asks (EPIC-007 §2).

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A setting changes by `set` or returns to its default by `unset`; an unchanged value writes nothing. |
| Interfaces | T | Human output and `--json` from the same subcommands. |
| Data | T | Each value type (token count, enum, integer, boolean), and `config.yml` files of different shapes (empty, comments only, a group with no value, BOM and CRLF, a group that is not a map). |
| Rules | T | Unknown and group keys, list settings and `content_dir`, values the SCHEMA refuses, yellow below red on `set` and on `unset`, the `enforce` warning. |

```gherkin
Feature: wikeeper config get / set / unset

  @data @rules
  Scenario Outline: set changes one setting and keeps the rest of config.yml
    Given a wiki initialised by "wikeeper init --yes --agents claude"
    When I run "wikeeper config set <key> <raw> --json"
    Then the exit code is 0 and data is { key: "<key>", value: <value>, previous: <previous>, changed: true }
    And config.yml is the file before, except that <change>
    And "wikeeper config get <key>" prints "<printed>"
    And json.warnings is <warnings>

    Examples:
      | key                      | raw   | value   | previous | change                                                                                                   | printed | warnings |
      | tokens.source.yellow     | 30k   | 30000   | 20000    | the line "    yellow: 20k # a document to ingest this size is yellow" reads "    yellow: 30000 # a document to ingest this size is yellow" | 30000 | [] |
      | tokens.page.red          | 12.5K | 12500   | 10000    | the line "    red: 10k # and this size red" reads "    red: 12500 # and this size red"                     | 12500   | [] |
      | tokens.source.confirm_at | never | "never" | "yellow" | the confirm_at line reads "    confirm_at: never # ingest start asks for approval from this level: yellow, red or never" | never | [] |
      | ingest.permission        | ai    | "ai"    | "ask"    | "ingest:\n  permission: ai\n" is appended                                                                | ai      | [] |
      | lint.stale_after_days    | 14    | 14      | 30       | "lint:\n  stale_after_days: 14\n" is appended                                                           | 14      | [] |
      | enforce                  | true  | true    | false    | "enforce: true\n" is appended                                                                            | true    | ["enforce takes effect after wikeeper update (it adds or removes the enforce entries)"] |

  @interfaces
  Scenario: get shows the effective settings and marks defaults, in text and JSON
    Given an initialised wiki whose .wiki/config.yml is "profile: management\nagents: [claude]\ningest:\n  permission: sometimes\n"
    When I run "wikeeper config get tokens"
    Then the exit code is 0 and it prints exactly
      """
      tokens.page.yellow: 4000 (default)
      tokens.page.red: 10000 (default)
      tokens.source.yellow: 20000 (default)
      tokens.source.red: 60000 (default)
      tokens.source.confirm_at: yellow (default)
      """
    When I run "wikeeper config get --json"
    Then data.key is null and the keys of data.entries equal configLeafKeys(), in SCHEMA order, starting with "profile" and holding the five "tokens." keys in a row
    And the entry for "agents" is { key: "agents", type: "string[]", value: ["claude"], default: [], from_default: false, settable: false }
    And the entry for "ingest.permission" has value "ask", default "ask", from_default true, settable true and allowed ["ai", "ask", "whitelist"]
    And json.warnings contains 'ingest.permission: "sometimes" — allowed: ai, ask, whitelist'
    When I run "wikeeper config get tokens.page.red"
    Then it prints "10000 (default)"
    And no file in the repository was created, changed or deleted by the three runs

  @paths
  Scenario: unset returns a setting to its default and removes the groups it empties
    Given a wiki initialised by "wikeeper init --yes --agents claude", then "wikeeper config set tokens.source.yellow 30k"
    When I run "wikeeper config set tokens.source.yellow 30000 --json"
    Then data.changed is false and config.yml is byte-identical
    When I run "wikeeper config unset tokens.source.yellow --json"
    Then data is { key: "tokens.source.yellow", value: 20000, previous: 30000, changed: true }
    And config.yml is the file before without its "    yellow: 30000 …" line, every other line, comment and blank line unchanged
    And "wikeeper config get tokens.source.yellow" prints "20000 (default)"
    When I run "wikeeper config unset tokens.page.yellow" and "wikeeper config unset tokens.page.red"
    Then config.yml has no "page:" line, and keeps "tokens:" with its comment line and the source keys with their comments
    When I run "wikeeper config unset tokens.page.red --json" again
    Then the exit code is 0, data.changed is false and config.yml is byte-identical

  @rules
  Scenario Outline: Error — an unknown key, a refused value or a list setting is refused, and config.yml is unchanged
    Given a wiki initialised by "wikeeper init --yes --agents claude"<before>
    When I run "wikeeper config <args> --json"
    Then the exit code is 2, json.error.code is "<code>" and json.error.message contains "<message>"
    And config.yml is byte-identical to the file before this run

    Examples:
      | before                                                                              | args                            | code                    | message |
      |                                                                                     | set tokens.pages.red 5k         | invalid_config_key      | unknown config key tokens.pages.red; keys under tokens: tokens.page.yellow, tokens.page.red, tokens.source.yellow, tokens.source.red, tokens.source.confirm_at |
      |                                                                                     | set tokens 5                    | invalid_config_key      | tokens is a group of settings; keys under tokens: |
      |                                                                                     | get colour                      | invalid_config_key      | unknown config key colour; known keys: profile, setup_completed_at, agents, content_dir |
      |                                                                                     | set ingest.permission sometimes | invalid_config_value    | ingest.permission: "sometimes" — allowed: ai, ask, whitelist |
      |                                                                                     | set tokens.page.red abc         | invalid_config_value    | tokens.page.red: "abc" — must be a positive whole number, or a number with k (20000, 20k, 1.5k) |
      |                                                                                     | set tokens.page.yellow 20k      | invalid_config_value    | tokens.page.yellow: 20000 — must be below tokens.page.red (10000) |
      |                                                                                     | set tokens.page.red 3k          | invalid_config_value    | tokens.page.yellow: 4000 — must be below tokens.page.red (3000) |
      | , then "wikeeper config set tokens.page.red 30k" and "wikeeper config set tokens.page.yellow 15k" | unset tokens.page.red | invalid_config_value | tokens.page.yellow: 15000 — must be below tokens.page.red (10000) |
      |                                                                                     | set agents codex                | config_key_not_settable | agents is a list setting: edit .wiki/config.yml by hand, or run wikeeper init --agents |
      |                                                                                     | unset hooks.pre_ingest          | config_key_not_settable | hooks.pre_ingest is a list setting: edit .wiki/config.yml by hand |
      |                                                                                     | set content_dir wiki            | config_key_not_settable | move pages/, raw/, log/ and index.md to the new folder |

  @data
  Scenario Outline: set works on every config.yml shape loadConfig accepts
    Given a git repository whose .wiki/config.yml is <before>
    When I run "wikeeper config set <key> <raw> --json"
    Then the exit code is <exit>
    And .wiki/config.yml is <after>

    Examples:
      | before                                     | key                   | raw | exit | after |
      | ""                                         | tokens.page.red       | 12k | 0    | "tokens:\n  page:\n    red: 12000\n" |
      | "# only a comment\n"                       | ingest.permission     | ai  | 0    | "# only a comment\n\ningest:\n  permission: ai\n" |
      | "profile: management\ntokens:\n"           | tokens.page.red       | 12k | 0    | "profile: management\ntokens:\n  page:\n    red: 12000\n" |
      | "﻿# c\r\nprofile: management\r\n"     | lint.stale_after_days | 14  | 0    | "﻿# c\r\nprofile: management\r\nlint:\r\n  stale_after_days: 14\r\n" |
      | "tokens: 5\n"                              | tokens.page.red       | 12k | 1    | unchanged, and json.error.code is "config_invalid" |
      | missing                                    | tokens.page.red       | 12k | 1    | still missing, and json.error.code is "not_initialised" |
```

### 2.2 Verification Steps (Manual)
- [ ] Extract `~/walkthrough-wiki-backup-2026-10-17.tar.gz` into a scratch folder (read-only use). In the copy, `wikeeper config get` lists 21 settings: `profile`, `agents`, `enforce`, `ingest.permission` and `setup_completed_at` without `(default)`, the other 16 with it. Its `config.yml` has no `tokens` key, so `wikeeper config get tokens` prints the five defaults.
- [ ] In the same copy, `wikeeper config set tokens.page.red 12k` appends `tokens:\n  page:\n    red: 12000` and changes no other line; `wikeeper config unset tokens.page.red` then leaves `config.yml` byte-identical to the original (`cmp`).

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File (new) | `src/commands/config.ts` |
| Related Files | `src/core/config.ts`, `src/program.ts` |
| Developer Tests (new) | `test/config-command.test.ts` |
| QA-Red Tests (new) | `test/config-command.red.node.test.ts` |
| New Files Needed | `src/commands/config.ts`, `test/config-command.test.ts`, `test/config-command.red.node.test.ts` |

- **Read, not edited:** `src/core/paths.ts` (`findRepoRoot`, `resolvePaths`, `assertInitialised`), `src/core/output.ts` (`emitResult`, `getOutputContext`), `src/core/exit-codes.ts` (`ExitCode.USAGE`, `WikeeperError`), `src/commands/rules.ts` (the subcommand group pattern, `:37`), `src/agents/enforce/index.ts` (`:450`). STORY-007-01's `tokenLimitIssues` and `token-count` leaf are in `src/core/config.ts` by the time this story starts.

No red test changes: `config` is a new command, and no red file lists every registered command (`test/help.red.node.test.ts` walks them and checks `--json`, which the root option gives every subcommand).

### 3.2 Technical Logic
- **Helpers in `src/core/config.ts`.**
  - `getConfigLeaf` walks `SCHEMA` by key segment and returns a copy of the leaf's `type`, `default` (cloned) and `allowed`.
  - `configLeafKeys` is a depth-first walk in SCHEMA order.
  - `checkConfigKey` builds the R3 errors. It finds `<parent>` by dropping segments from the end until `configLeafKeys(prefix)` is not empty and the prefix is a group; the root is the fallback.
  - `parseConfigValue` calls `checkConfigKey(keyPath, "set")`, converts `raw` by type (R4), then runs `validateLeaf` and STORY-007-01's `normalizeLeaf` on the converted value. So every message is the SCHEMA's own, and a `token-count` comes back as a number.
  - `config.ts` imports `ExitCode` and `WikeeperError` from `./exit-codes.js`, as `src/core/paths.ts:5` does; `exit-codes.ts` imports nothing, so no cycle is created.
- **Shared write path (R8).** A private `editConfig(root, edit: (doc) => boolean): Promise<boolean>` holds today's `setConfigValue` body (`src/core/config.ts:217`–`:240`): read, BOM and CRLF detection, `parseDocument`, the syntax-error throw, then `edit(doc)`. It writes only when `edit` returns true.
  - `setConfigValue` keeps its unchanged-value check (`:228`–`:232`). It then creates the root map with `new YAML.YAMLMap(doc.schema)`; for each proper prefix of the key, a `null` value is replaced by `new YAML.YAMLMap(doc.schema)` and a non-map value throws `config_invalid` (`configError`, exit 1 through `emitError`, `src/core/output.ts:127`); then `doc.setIn`.
  - `unsetConfigValue` returns false when the file is missing or `doc.hasIn(keys)` is false. Otherwise it calls `doc.deleteIn(keys)`, then for each prefix from the longest down deletes it while it is a map with no items.
  - The scratch script produced exactly the §2.1 rows with these steps.
- **Command (`src/commands/config.ts`).** A group as in `src/commands/rules.ts:37`, with three subcommands. Each action: `getOutputContext`, `findRepoRoot`, `loadConfig` (keep `errors` and `warnings`), `resolvePaths`, `assertInitialised`, then:
  - **get:** `checkConfigKey(key, "get")` when a key is given; keys from `getConfigLeaf(key) ? [key] : configLeafKeys(key)`; values by dotted lookup in the effective config; `from_default` from `configKeyIsSet(root, key)` (`src/core/config.ts:198`) and the `errors` keys. Parsing the file once and calling `hasIn` per key is fine as well.
  - **set:** `parseConfigValue`; for a `tokens.<g>.` key, `tokenLimitIssues` on a `structuredClone` of the effective config with the value set, keeping the issues whose key starts with `tokens.<g>.`; then `setConfigValue`.
  - **unset:** `checkConfigKey(key, "set")`; the pair check with `getConfigLeaf(key).default`; then `unsetConfigValue`.
  - `emitResult` with the R5–R7 data, message and warnings; R9's warning when `key === "enforce"` and `changed`.
- **Tests.** Copy the `run()` helper of `test/lint/lint-command.test.ts:23`. Wikis are created through `runCli`'s default program in a temp folder with `.git` (flashcard 2026-10-17 `#qa #test-harness`). Byte-identical checks compare the file's bytes before and after, and the read-only check hashes every file under the temp repository. Error rows assert `json.error.code` and the message hint, not the exit code alone: an unknown subcommand also exits 2 (flashcard 2026-10-17 `#qa #red-test`).

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper config get [key]` | CLI | None | optional dotted key, `--json` | `ConfigGetData` (R5) |
| `wikeeper config set <key> <value>` | CLI | None | dotted key, raw value, `--json` | `ConfigSetData` (R6) |
| `wikeeper config unset <key>` | CLI | None | dotted key, `--json` | `ConfigSetData` (R7) |

```ts
// src/core/config.ts (K3, frozen; configLeafKeys and checkConfigKey are additive)
export function getConfigLeaf(keyPath: string): { type: string; default: unknown; allowed?: readonly string[] } | null;
export function parseConfigValue(keyPath: string, raw: string): unknown; // throws invalid_config_key | config_key_not_settable | invalid_config_value (exit 2)
export function unsetConfigValue(root: string, keyPath: string): Promise<boolean>;
export function configLeafKeys(prefix?: string): string[];
export function checkConfigKey(keyPath: string, use: "get" | "set"): void;

// src/commands/config.ts
import type { CommandModule } from "../program.js";
export interface ConfigEntry {
  key: string;
  type: string;
  value: unknown;
  default: unknown;
  from_default: boolean;
  settable: boolean;
  allowed?: readonly string[];
}
export interface ConfigGetData { key: string | null; entries: ConfigEntry[] }
export interface ConfigSetData { key: string; value: unknown; previous: unknown; changed: boolean }
export const configCommand: CommandModule;
```

Consumed (frozen, STORY-007-01, K2): the `tokens` SCHEMA, the `token-count` leaf, `tokenLimitIssues(tokens): ConfigIssue[]` and the private `normalizeLeaf`.

## Task Breakdown

- [ ] Add `getConfigLeaf`, `configLeafKeys` and `checkConfigKey` to `src/core/config.ts` -> R2, R3
- [ ] Add `parseConfigValue` -> R4
- [ ] Move the write path into `editConfig`, fix nested writes in `setConfigValue`, add `unsetConfigValue` -> R7, R8
- [ ] Write `src/commands/config.ts`: `get`, `set` with the pair check, `unset`, messages and the `enforce` warning -> R1, R5, R6, R7, R9
- [ ] Append `configCommand` to `defaultCommands` in `src/program.ts` on the merged tree -> R10
- [ ] QA-Red writes `test/config-command.red.node.test.ts` from the five §2.1 scenarios; the Developer writes the §4.1 unit tests in `test/config-command.test.ts` -> §2.1

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 8 | `getConfigLeaf` for each type, a group and an unknown key; `configLeafKeys` (every leaf in SCHEMA order, 21 at this story's merge; a prefix; an unknown prefix); `checkConfigKey` for every R3 message, including the root fallback; `parseConfigValue` accepted and refused forms per type (`TRUE`, `05`, `1.5` for an integer, `null` for `string\|null`, `1.5k`); `unsetConfigValue` (emptied groups removed up to the top, comments elsewhere kept, absent key and missing file give false with the file untouched, BOM and CRLF kept); the R8 fix rows; value rendering; the four set and unset messages. |
| Integration tests | 0 | Temp directories only; no external service. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`, in QA-Red's `test/config-command.red.node.test.ts`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The existing `setConfigValue` tests (`test/config.red.node.test.ts`, `test/config.test.ts`) pass unchanged.
- [ ] `test/help.red.node.test.ts` passes: `config`, `config get`, `config set` and `config unset` help list `--json`.
- [ ] `npm run typecheck` and `npm test` pass; no new runtime dependency in `package.json`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/config.ts:216` — `setConfigValue`, which writes one dotted key with the Document API and keeps comments, key order, BOM and CRLF; `src/core/config.ts:233` — the root map built without the schema (R8).
- **Surface:** `src/core/config.ts:46` — `SCHEMA` with every leaf's type and default; `src/core/config.ts:98` — `validateLeaf`, the messages `set` reuses; `src/core/config.ts:211` — `formatConfigIssue`.
- **Surface:** `src/core/config.ts:198` — `configKeyIsSet`, what marks a value as a default; `src/commands/doctor.ts:286` — doctor's `(default)` marker on the permission, the precedent for the marker.
- **Surface:** `src/commands/rules.ts:37` — a command group with subcommands; `src/program.ts:38` — `defaultCommands`.
- **Surface:** `src/agents/enforce/index.ts:450` — `update` adds or removes the enforce entries from the config (R9); `src/commands/update.ts:205` — `update` rewrites the `.gitignore` block for `content_dir` (§1.4 Q1).
- **Coverage of this requirement:** partial — reading, validating and comment-keeping writes exist; the command, the key and value parsing, `unset` and the nested-write fix are net-new.

## Prior work

- [[EPIC-007]] (parent; §6 records the human's choice of a general command). Consumes [[STORY-007-01]] (K2: the `tokens` SCHEMA, the `token-count` leaf, `tokenLimitIssues`), whose limits come from [[SPIKE-003]]; [[EPIC-008]]'s clean-up flow has the user raise a limit with this command. Builds on [[STORY-001-02]] (the SCHEMA, `loadConfig`, `setConfigValue`), [[STORY-001-07]] (`setup --done` stamps `setup_completed_at` through `setConfigValue`) and [[STORY-002-07]] (`configKeyIsSet`, doctor's `(default)`), and follows [[STORY-005-06]] (`rules`, a subcommand group) and [[STORY-005-05]] (appending to `defaultCommands` in merge order). No duplicates found (cleargate-wiki-query, 2026-10-18).

## Why not simpler?

- **Smallest existing surface that could carry this:** editing `.wiki/config.yml` by hand, with `setConfigValue` (`src/core/config.ts:216`) for the programmatic writes that exist today.
- **Why isn't extension / parameterization / config sufficient?** The human asked for the limits to change from the CLI (EPIC-007 §2) and chose a general command over a limits-only one (EPIC-007 §6). A hand edit is checked only when `doctor` runs, and a mistake silently falls back to a default. The SCHEMA already holds every key's type, default and message, so the command is a thin layer over it: parse by type, refuse lists, check the token pair, write with `setConfigValue`. The new pieces are `unset`, the key checks and the nested-write fix that `set` needs.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/commands/config.ts` is planned by EPIC-007 §4 and the decomposition brief; the test files are this story's.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1: the human approved every §1.4 recommendation on 2026-10-18 (`plans/gate1-decisions.md`).
