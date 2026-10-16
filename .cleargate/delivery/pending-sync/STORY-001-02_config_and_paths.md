---
story_id: STORY-001-02
parent_epic_ref: EPIC-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-001 (approved 2026-10-16) · architecture.md v0.4 · verified src/program.ts
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T13:30:00Z
updated_at: 2026-10-16T13:30:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:30:08Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-001-02
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:27:46Z
  sessions: []
---

# STORY-001-02: Config schema and path resolution
**Complexity:** L2 — two modules, YAML via the `yaml` package, known patterns.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent, I want `.wiki/config.yml` loaded with defaults and validated with precise messages, and every wiki path resolved in one place, so that every command behaves the same and a bad config tells me exactly what to fix.

### 1.2 Detailed Requirements
- **R1 — Schema and defaults.** `src/core/config.ts` defines the config per architecture.md §11 with these defaults: `profile: management`, `setup_completed_at: null`, `agents: []`, `content_dir: .wiki`, `private: []`, `enforce: false`, `ingest.permission: ask` (`ai | ask | whitelist`), `ingest.whitelist.kinds: []`, `ingest.whitelist.origins: []`, `ingest.ambient_offers: true`, `ingest.delegate: auto` (`auto | never`), `ingest.extractor_model: small`, `ingest.writer_model: medium`, `hooks.pre_ingest: []`, `hooks.post_ingest: []`, `lint.stale_after_days: 30`. A missing file yields the defaults.
- **R2 — Validation.** `loadConfig(root)` returns `{ config, warnings, errors }`. Each error carries the key path, the received value and the allowed values or rule (e.g. `ingest.permission: "sometimes" — allowed: ai, ask, whitelist`). `content_dir` must resolve inside the repository root; `lint.stale_after_days` must be a positive integer.
- **R3 — Unknown keys** produce a warning naming the key path, never an error.
- **R4 — Comment-preserving writes.** `setConfigValue(root, keyPath, value)` updates one key using the `yaml` Document API so comments and key order survive (used for `setup_completed_at`).
- **R5 — Paths.** `src/core/paths.ts`: `findRepoRoot(cwd)` walks up to the nearest directory containing `.wiki/` or `.git/`, falling back to `cwd`; `resolvePaths(root, config)` returns `{ root, wikiDir, systemDir, configFile, manifestFile, kbInstructions, meFile, contentDir, pagesDir, rawDir, logDir, indexFile }`, where pages/raw/log/index live under `content_dir`.

### 1.3 Out of Scope
- Writing a full config file during `init` (STORY-001-04).
- Interpreting the values (permissions, hooks, models) — later epics.

### 1.4 Open Questions

- None — decisions recorded in architecture.md and EPIC-001.

### 1.5 Risks

- **Risk:** Comment preservation breaks when the key is absent and must be inserted into a nested map.
- **Mitigation:** Use `doc.setIn(path, value)`; test both "key exists" and "key absent" cases.
- **Risk:** Hand-written validation drifts from the documented schema.
- **Mitigation:** One schema table in `config.ts` drives defaults, validation and allowed-value messages.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Missing config, partial config and nested working directory are different successful paths. |
| Interfaces | F | Library API only; commands consume it in later stories. |
| Data | T | `content_dir` changes where content paths resolve. |
| Rules | T | Validation rules for enums, `content_dir` containment and positive integers; unknown-key warnings. |

```gherkin
Feature: Config schema and path resolution

  @paths
  Scenario: A missing config yields the defaults
    Given a repository with .wiki/ and no config.yml
    When loadConfig runs
    Then config equals the documented defaults
    And warnings and errors are empty

  @paths @data
  Scenario: Partial config merges with defaults and moves content paths
    Given config.yml containing "content_dir: wiki" and "ingest:\n  permission: ai"
    And the working directory is a nested folder inside the repository
    When findRepoRoot and resolvePaths run
    Then root is the repository root
    And pagesDir, rawDir, logDir and indexFile are under "<root>/wiki"
    And configFile and systemDir stay under "<root>/.wiki"
    And ingest.ambient_offers is true

  @rules
  Scenario Outline: Error — invalid values are reported with key path and rule
    Given config.yml setting <key> to <value>
    When loadConfig runs
    Then errors contains one entry for "<key>" mentioning "<rule>"

    Examples:
      | key                    | value     | rule                               |
      | ingest.permission      | sometimes | allowed: ai, ask, whitelist        |
      | content_dir            | ../outside | must stay inside the repository   |
      | lint.stale_after_days  | -1        | must be a positive integer         |

  @rules
  Scenario: Unknown keys are warnings, not errors
    Given config.yml containing "colour: blue"
    When loadConfig runs
    Then warnings contains "colour"
    And errors is empty

  Scenario: Stamping a value preserves comments
    Given config.yml with a comment line above "setup_completed_at: null"
    When setConfigValue sets "setup_completed_at" to "2026-10-16T12:00:00Z"
    Then the file contains the comment line unchanged
    And setup_completed_at reads back as "2026-10-16T12:00:00Z"
```

### 2.2 Verification Steps (Manual)
- [ ] Hand-edit a config with an invalid enum and confirm the message names the key and the allowed values.
- [ ] Confirm `npm ls yaml` shows the dependency.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/core/config.ts` |
| Related Files | `src/core/paths.ts`, `test/config.test.ts`, `test/paths.test.ts`, `./package.json`, `./package-lock.json` |
| New Files Needed | Yes — `src/core/config.ts`, `src/core/paths.ts`, `test/config.test.ts`, `test/paths.test.ts` |

### 3.2 Technical Logic
- A single `SCHEMA` object describes every key: type (`string | boolean | integer | string[] | enum | map`), default, allowed values. `loadConfig` parses YAML (`yaml.parse`), walks the schema to fill defaults, collects errors/warnings, and never throws on validation problems (it throws only on YAML syntax errors, with `code: "E_CONFIG_SYNTAX"` and the line number).
- Errors and warnings are plain objects `{ key, value, message }`; mapping them to exit codes is the command layer's job, so this story does not depend on STORY-001-01.
- `content_dir` containment: `path.relative(root, path.resolve(root, content_dir))` must not start with `..` and must not be absolute.
- Return paths as absolute OS paths; expose a `toPosixRelative(root, p)` helper for output and manifests.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `loadConfig(root)` | function | None | repository root | `{ config: WikiConfig, warnings: Issue[], errors: Issue[] }` |
| `resolvePaths(root, config)` | function | None | root + config | `WikiPaths` (absolute paths) |

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 8 | defaults, merge, each validation rule, unknown key, comment-preserving write (key present and absent), root discovery |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `./architecture.md` — §11 defines the config shape this story implements.
- **Coverage of this requirement:** none — net-new modules.

## Prior work

- [[EPIC-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** Reading the YAML ad hoc in each command would duplicate defaults and produce inconsistent error messages; the agent depends on exact key-path messages to fix configs. One schema-driven loader is the smallest shared piece.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (Existing paths verified; planned paths for new files accepted by the human at Gate 1, 2026-10-16.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
