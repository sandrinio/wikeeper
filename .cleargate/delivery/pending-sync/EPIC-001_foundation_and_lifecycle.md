---
epic_id: EPIC-001
parent_ref: INITIATIVE-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: architecture.md v0.4 (decisions D-01–D-31) · INITIATIVE-001 · verified scaffold src/program.ts, src/cli.ts, package.json
owner: Sandro Suladze
target_date: null
created_at: 2026-10-16T13:15:00Z
updated_at: 2026-10-16T13:15:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:22:46Z
  transition: ready-for-decomposition
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id EPIC-001
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:09:58Z
  sessions: []
---

# EPIC-001: Foundation and lifecycle

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Build the CLI core (config, paths, --json output, exit codes, ownership manifest, template loader) and the lifecycle commands init / update / remove / doctor / setup, which scaffold .wiki/ from packaged templates and never modify user-owned files.</objective>
  <architecture_rules>
    <rule>The CLI makes no LLM calls and no network calls in this epic.</rule>
    <rule>Package-owned vs user-owned files follow the ownership matrix in architecture.md §4.1; the manifest is the single source of truth for what the package owns.</rule>
    <rule>Every command supports --json and returns a stable exit code (§4 Data Changes).</rule>
    <rule>Agent wiring (blocks, skills, sub-agents, enforce) is called through an integration hook point; its implementation belongs to EPIC-002.</rule>
    <rule>Instruction and template content is placeholder here; EPIC-006 supplies the real text.</rule>
  </architecture_rules>
  <target_files>
    <file path="src/program.ts" action="modify" />
    <file path="src/core/config.ts" action="create" />
    <file path="src/core/paths.ts" action="create" />
    <file path="src/core/output.ts" action="create" />
    <file path="src/core/exit-codes.ts" action="create" />
    <file path="src/core/manifest.ts" action="create" />
    <file path="src/core/templates.ts" action="create" />
    <file path="src/core/gitignore.ts" action="create" />
    <file path="src/commands/init.ts" action="create" />
    <file path="src/commands/update.ts" action="create" />
    <file path="src/commands/remove.ts" action="create" />
    <file path="src/commands/doctor.ts" action="create" />
    <file path="src/commands/setup.ts" action="create" />
    <file path="templates/system/" action="create" />
    <file path="package.json" action="modify" />
    <file path=".github/workflows/ci.yml" action="modify" />
  </target_files>
</agent_context>
```

## 1. Problem & Value

**Why are we doing this?**
Every other capability (agent wiring, ingest, search, lint) needs a working install: a `.wiki/` folder, a validated config, and a reliable answer to "which files belong to wikeeper and which belong to the user". Without that, `update` and `remove` could destroy the user's knowledge.

**Success Metrics (North Star):**
- Running `init` twice produces zero byte changes on the second run (tree-hash test).
- `update` and `remove` modify zero user-owned files across all lifecycle fixture tests.
- Every lifecycle command has a `--json` mode covered by tests.

## 2. Scope Boundaries

**✅ IN-SCOPE (Build This)**
- [ ] Command framework: subcommand registration in `src/program.ts`, global `--json`, exit-code table.
- [ ] Config: load, validate and default `.wiki/config.yml` (profile, agents, content_dir, private, enforce, ingest.*, hooks.*); unknown keys produce warnings, not failures.
- [ ] Path resolution for `.wiki/` and `content_dir` (D-24).
- [ ] Ownership manifest (`.wiki/system/manifest.json`): package version plus path and sha256 of every package-owned file.
- [ ] Template loader that resolves packaged templates from the installed package root; `package.json` `files` ships `templates/`.
- [ ] `init [--profile management] [--agents …] [--yes]`: scaffold the layout, copy package-owned files, seed user-owned files only if missing, write `.gitignore` entries (`me.md`, generated `log.md`, `private` pages, lock and snapshot dirs), call the agent-integration hook point. Idempotent.
- [ ] `update`: replace package-owned files listed in the manifest; never touch user-owned files; back up and warn when a package-owned file was edited locally.
- [ ] `remove [--purge]`: delete package-owned files and call the integration hook to strip agent wiring; `--purge` also deletes knowledge and requires typed confirmation (`--confirm wikeeper` when non-interactive).
- [ ] `doctor`: Node version, config validity, manifest drift, and the integration checks provided by EPIC-002.
- [ ] `setup --done`: stamps `setup_completed_at` in config.
- [ ] CI matrix adds macOS and Windows runners.
- [ ] CR-002 scope addition (SPRINT-02): A1 `init` asks every question before writing; A3 `--json` in every subcommand's help; A4 `remove --purge` help names what is deleted ([[CR-002]]).

**❌ OUT-OF-SCOPE (Do NOT Build This)**
- Agent file injection, skills, sub-agent definitions and `--enforce` (EPIC-002).
- The text of SETUP.md, WIKI.md, the profile and page templates (EPIC-006).
- Ingest, search, lint and status commands (EPIC-003, EPIC-004, EPIC-005).
- Profiles other than `management`; an MCP server.

## 3. The Reality Check (Context)

| Constraint Type | Limit / Rule |
|---|---|
| Runtime | Node ≥ 22.12, ESM only, no network access, no LLM calls. |
| Safety | `update` / `remove` touch only paths in the manifest plus marker blocks; verified by fixture tests containing user files with identical names outside `system/`. |
| Idempotency | Second `init` on the same tree changes 0 bytes, measured by hashing the tree before and after in `test/`. |
| Portability | Paths built with `node:path`; CI green on ubuntu, macOS and Windows. |
| Sequencing | First epic: EPIC-002, EPIC-003 and EPIC-006 build on its manifest, config and template loader. |

## Existing Surfaces

- **Surface:** `src/program.ts` — commander program answering `--version` / `--help`; becomes the command registry.
- **Surface:** `src/cli.ts` — bin entry that runs the program.
- **Surface:** `package.json` — bin, files and engines; `files` gains `templates`.
- **Coverage of this epic's scope:** partial — entry point only; everything else is net-new.

## Prior work

- [[INITIATIVE-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this epic:** `src/program.ts`.
- **Why isn't extension / parameterization / config sufficient?** Copying a template folder would be enough for `init`, but `update` and `remove` must tell package-owned files from user-owned ones even after the user edits things, and the agent consumes every command's output. That requires a manifest, a config schema and a machine-readable output contract — none of which exist yet.

## 4. Technical Grounding (The "Shadow Spec")

**Affected Files:**
- `src/program.ts` — register subcommands and the global `--json` flag.
- `src/core/config.ts` — config schema, defaults, validation (YAML via the `yaml` package).
- `src/core/paths.ts` — resolve `.wiki/` and `content_dir`.
- `src/core/output.ts`, `src/core/exit-codes.ts` — human and JSON output, exit-code table.
- `src/core/manifest.ts` — read/write/diff the ownership manifest.
- `src/core/templates.ts` — locate and copy packaged templates.
- `src/core/gitignore.ts` — managed `.gitignore` block.
- `src/commands/{init,update,remove,doctor,setup}.ts` — lifecycle commands.
- `templates/system/` — placeholder package-owned files (real content from EPIC-006).
- `package.json` — `files` += `templates`; dependency `yaml`.
- `.github/workflows/ci.yml` — OS matrix.

**Data Changes:**
- `.wiki/config.yml` schema per architecture.md §11.
- `.wiki/system/manifest.json`: `{ package_version, files: [{ path, sha256 }] }`.
- Exit codes: 0 ok · 1 error · 2 usage · 3 needs_approval · 4 denied · 5 needs_input.

## 5. Acceptance Criteria

```gherkin
Feature: Foundation and lifecycle

  Scenario: init scaffolds a fresh repository
    Given a git repository without .wiki/
    When I run "wikeeper init --profile management --yes"
    Then .wiki/ contains system/, config.yml, kb_instructions.md, raw/, pages/ and log/
    And .wiki/system/manifest.json lists every package-owned file with its sha256

  Scenario: init is idempotent
    Given a repository where init has already run
    When I run "wikeeper init --yes" again
    Then no file in the repository changes

  Scenario: update replaces package files only
    Given an initialised repository with edited kb_instructions.md and pages
    When a newer package version runs "wikeeper update"
    Then files listed in the manifest are replaced
    And kb_instructions.md, config.yml, me.md, raw/ and pages/ are byte-identical

  Scenario: remove keeps knowledge
    Given an initialised repository with pages
    When I run "wikeeper remove"
    Then .wiki/system/ is deleted
    And pages/, raw/, log/ and kb_instructions.md remain

  Scenario: Error — purge without confirmation is refused
    Given an initialised repository
    When I run "wikeeper remove --purge --json" without "--confirm wikeeper"
    Then the command exits with code 5
    And the JSON output names the missing confirmation
    And no file is deleted

  Scenario: Error — invalid config is reported
    Given .wiki/config.yml with "ingest.permission: sometimes"
    When I run "wikeeper doctor --json"
    Then the command exits with code 1
    And the JSON output names the invalid key and the allowed values
```

## 6. AI Interrogation Loop (Human Input Required)

- None. All decisions are recorded in architecture.md (D-01–D-31) and were accepted on 2026-10-16.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Coding Agent):
- [x] `approved: true` is set in the YAML frontmatter.
- [x] The `<agent_context>` block is complete and validated.
- [x] §4 Technical Grounding contains 100% real, verified file paths. (Existing paths verified; planned paths for new files accepted by the human at Gate 1, 2026-10-16.)
- [x] §6 AI Interrogation Loop is empty (all human answers integrated into the spec).
- [x] 0 "TBDs" exist in the document.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered.
