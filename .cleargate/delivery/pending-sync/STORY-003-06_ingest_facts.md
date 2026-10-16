---
story_id: STORY-003-06
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-003 (approved 2026-10-16) · architecture.md §7.2, §7.3, §7.4 (facts file) · SPRINT-02 decomposition brief contracts 2–4, 6, 7, 12 · verified src/core/templates.ts, src/commands/init.ts, src/core/exit-codes.ts
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors:
  - STORY-003-01
  - STORY-003-02
  - STORY-003-04
  - STORY-003-07
  - STORY-006-02
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T18:45:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:19:10Z
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
  last_stamp: 2026-10-16T17:48:58Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-16T17:41:31Z
---

# STORY-003-06: `wikeeper ingest facts` and the facts schema
**Complexity:** L2 — one validator module, one subcommand and one shipped JSON Schema. Consumes the registry, permissions, kind rules and log reader.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent that has read a source, I want to hand the facts I extracted to the CLI and have them checked against a fixed schema, so that the writer agent (or I, later) can write pages from a validated facts file without re-reading the source.

### 1.2 Detailed Requirements
- **R1 — Command.** `wikeeper ingest facts <id> [--file <path>] [--json]` reads one JSON document from stdin, or from `--file` when given. Output data: `{ source_id, file, replaced, kind, rule_version, facts, new_entities, uncovered }` where `file` is `raw/<id>.facts.json` relative to the repo root and the last three are counts.
- **R2 — Shipped schema.** `templates/system/schemas/facts.schema.json` (JSON Schema 2020-12) documents the format of architecture.md §7.4 and is installed by `init`/`update` to `.wiki/system/schemas/facts.schema.json`. Top level: `source_id` (string), `kind` (a kind id accepted by `isValidKindId`, STORY-003-02), `rule_version` (integer ≥ 1, or `null` when no rule exists for the kind), `facts` (array, may be empty), optional `new_entities` and `uncovered` (arrays of non-empty strings). Each fact: `entity` (`<type>:<name>`, type `[a-z][a-z0-9-]*`), `field` (non-empty string), `value` (string, number or boolean), `status` (`decided` or `tentative`), `as_of` (a real calendar date `YYYY-MM-DD`), `anchor` (non-empty string), `page` (a POSIX path relative to `pages/` ending in `.md`, without `..` segments, a leading `/` or `\`), `exists` (boolean). Unknown keys are errors at both levels.
- **R3 — Validation without a new dependency.** A hand-written validator in `src/ingest/facts.ts` implements exactly the schema; it reports every problem at once, each as `{ path, message }` with paths like `facts[2].status`. A unit test loads the shipped schema and asserts its `required` lists, `enum` values and property names equal the validator's exported constants, so the two cannot drift.
- **R4 — Preconditions.** The source must be registered (`raw/<id>.meta.json` exists) — else exit 1, code `unknown_source`. The document's `source_id` must equal `<id>` — else exit 1, code `source_id_mismatch`. The ingest must not be finished (no `ingest` log event names `<id>`) — else exit 1, code `ingest_finished`. When `--kind` was given at `start` (`SourceMeta.kind` is not null), the facts `kind` must match it after `normalizeKindId` — else exit 1, code `kind_mismatch`. Invalid JSON or schema errors → exit 1, code `invalid_facts`, with the error list in `details` and the human message naming `.wiki/system/schemas/facts.schema.json`. Nothing is stored on any refusal.
- **R5 — Kind permission at `facts`.** Exactly when `start` left the whitelist kind check open (`SourceMeta.permission.kind_pending` is true), the source is re-evaluated with `evaluatePermission(config.ingest, { origin: meta.origin, originType: meta.origin_type, kind, approved: true })` (approval, when needed, was given at `start`). `denied` → `removeSource(paths, id)` (STORY-003-01) deletes the provisionally registered source (`raw/<id>.<ext>`, `raw/<id>.meta.json` and `raw/<id>.md` if present), then exit 4, code `denied`, reason from the evaluator, `details.removed` = the file names `removeSource` returned, and no facts file. A denied source therefore leaves nothing in `raw/` that a later `ingest start` of the same file would report as a duplicate (architecture.md §7.3: kind rules are checked at `facts` when `--kind` was not given; denied sources store nothing). If `removeSource` throws, the exit is still 4 and the message names the files left in `raw/`. (Human request, 2026-10-16.) When `kind_pending` is false no re-evaluation happens.
- **R6 — Rule version.** The kind's rule is looked up in `.wiki/kb_instructions.md` with `findKindRule`. No rule → warning "no rule for kind <k> in kb_instructions.md; propose one" (and `rule_version` must be `null`, else a warning that it is ignored). A rule whose version differs from `rule_version` → warning naming the current version. Neither blocks storage.
- **R7 — Storage and resubmission.** The validated document is written to `raw/<id>.facts.json` (2-space JSON, LF, trailing newline; `new_entities` and `uncovered` normalised to `[]`) via a temp file and rename. Facts may be resubmitted until the ingest is finished; a resubmission replaces the file and reports `replaced: true`. (`ingest finish`, STORY-003-09, refuses when the facts changed after `apply`, using the hash `apply` records.)
- **R8 — Library exports** for `apply`, `finish` and the end-to-end test: `validateFacts`, `readFacts`, `writeFacts`, `factsFilePath` and the types in §3.3.

### 1.3 Out of Scope
- What the agent extracts and how (EPIC-006 WIKI.md).
- `ingest facts <id> --dry-run` diffing against stored facts (EPIC-005, SPRINT-03).
- Freezing facts during the write phase — enforced at `finish` by STORY-003-09 from the hash STORY-003-08 records.
- Checking that `page` targets exist or that `exists` is truthful (the writer reconciles; lint checks later).

### 1.4 Open Questions

- None — architecture.md §7.3–7.4 fix the command and format; the schema location follows decomposition contract 12; no new dependency is needed for a schema this small.

### 1.5 Risks

- **Risk:** The shipped schema and the validator drift apart, and agents that follow the schema get rejected.
- **Mitigation:** R3's agreement test; the schema is the documentation agents read, the validator the enforcement.
- **Risk:** Strict unknown-key rejection bounces agents that add helpful extra fields.
- **Mitigation:** The error names the key and the allowed keys, so the agent fixes it in one retry; WIKI.md (STORY-006-04) documents the format.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Facts arrive on stdin or from `--file`. |
| Interfaces | F | CLI only. |
| Data | T | Invalid documents differ by which field is wrong; all problems are reported together. |
| Rules | T | Kind permission at `facts`, resubmission until finish, the refusal rules of R4. |

```gherkin
Feature: wikeeper ingest facts

  @paths
  Scenario Outline: Valid facts are stored
    Given a registered source "src-2026-10-16-q4-status" started with --kind "status-report"
    And kb_instructions.md has the rule "status-report (v2) → project.status, project.target_date, risk"
    And a facts document for it with kind "status-report", rule_version 2, two facts and one uncovered item
    When I run "wikeeper ingest facts src-2026-10-16-q4-status --json" with the document <input>
    Then the exit code is 0
    And raw/src-2026-10-16-q4-status.facts.json holds the document with new_entities []
    And the data reports facts 2, uncovered 1 and replaced false
    And no warnings are reported
    And .wiki/system/schemas/facts.schema.json, installed by "wikeeper init", parses as JSON Schema 2020-12

    Examples:
      | input                    |
      | on stdin                 |
      | via --file facts.json    |

  @rules
  Scenario Outline: Resubmitting before finish replaces the facts; a missing or newer rule is a warning
    Given a source "src-2026-10-16-chat" registered without --kind, with facts already stored
    And kb_instructions.md whose only source kind is "status-report (v2) → project.status, risk"
    When I run "wikeeper ingest facts src-2026-10-16-chat --json" with kind "<kind>" and rule_version <version>
    Then the exit code is 0 and the data reports replaced true
    And a warning contains "<warning>"

    Examples:
      | kind          | version | warning                       |
      | status-report | 1       | v2                            |
      | chat-excerpt  | null    | no rule for kind chat-excerpt |

  @data
  Scenario: Error — every schema problem is reported and nothing is stored
    Given a registered source without stored facts
    When I submit facts where facts[0].status is "maybe", facts[1] has no "anchor" and the top level has an extra key "notes"
    Then the exit code is 1 with error code "invalid_facts"
    And details list "facts[0].status", "facts[1].anchor" and "notes"
    And the message names ".wiki/system/schemas/facts.schema.json"
    And no facts file exists

  @rules
  Scenario: Error — the whitelist denies the kind learned at facts
    Given permission mode "whitelist" with kinds ["meeting-notes"] and origins ["docs/**"]
    And a source registered from "notes/contract.md" without --kind, so its meta has permission.kind_pending true
    When I submit facts with kind "contract"
    Then the exit code is 4 with error code "denied"
    And no facts file exists
    And raw/ holds no file of that source, and details.removed lists its original and meta files
    And a new "wikeeper ingest start notes/contract.md" is not reported as a duplicate

  @rules
  Scenario Outline: Error — facts are refused for the wrong ingest
    Given <state>
    When I run "wikeeper ingest facts <id> --json" with an otherwise valid document whose source_id is "<doc_id>" and kind "<kind>"
    Then the exit code is 1 with error code "<code>"
    And no facts file is written or changed

    Examples:
      | state                                                     | id                   | doc_id               | kind          | code               |
      | no source "src-2026-10-16-ghost" is registered            | src-2026-10-16-ghost | src-2026-10-16-ghost | status-report | unknown_source     |
      | source "src-2026-10-16-a" is registered                   | src-2026-10-16-a     | src-2026-10-16-b     | status-report | source_id_mismatch |
      | source "src-2026-10-16-a" was started with --kind "meeting-notes" | src-2026-10-16-a | src-2026-10-16-a | status-report | kind_mismatch      |
      | an ingest log event names "src-2026-10-16-a"              | src-2026-10-16-a     | src-2026-10-16-a     | status-report | ingest_finished    |
```

### 2.2 Verification Steps (Manual)
- [ ] Ask an agent to extract facts from a short meeting note after reading `.wiki/system/schemas/facts.schema.json`, submit them, and read the error list for a deliberately broken document.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/ingest/facts.ts` |
| Related Files | `src/commands/ingest-facts.ts`, `src/commands/ingest.ts`, `templates/system/schemas/facts.schema.json`, `test/ingest/facts.test.ts`, `test/ingest/ingest-facts.test.ts` |
| New Files Needed | Yes — `src/ingest/facts.ts`, `src/commands/ingest-facts.ts`, `templates/system/schemas/facts.schema.json`, `test/ingest/facts.test.ts`, `test/ingest/ingest-facts.test.ts` |

### 3.2 Technical Logic
- **Order of checks** (first failure wins, except schema errors, which are collected): read input → JSON parse (`invalid_facts`, one error at path `$`) → `readMeta` (`unknown_source`) → `readLogEvents(paths, { type: "ingest", sourceId: id })` non-empty (`ingest_finished`) → `validateFacts` (`invalid_facts`) → `source_id` (`source_id_mismatch`) → kind vs `meta.kind` (`kind_mismatch`) → `evaluatePermission` when `meta.permission.kind_pending` (`denied`: `removeSource`, then exit 4) → rule-version warnings → `writeFacts`.
- **Validator.** Plain functions over `unknown`; export the constants `FACTS_KEYS`, `FACTS_REQUIRED`, `FACT_KEYS`, `FACT_REQUIRED`, `FACT_STATUSES` and the regexes, and build both the validator and the agreement test on them. `as_of` must round-trip through `Date.UTC` (rejects `2026-02-30`).
- **Reading stdin.** Reuse the stdin reader pattern of `src/commands/hook.ts` (`readPayload`), with a 10 MB cap; when stdin is a TTY and `--file` is absent, exit 2 (`usage`) with "pipe the facts JSON on stdin or pass --file".
- **Atomic write.** Write `raw/<id>.facts.json.tmp-<pid>` then `rename`; `replaced` is whether the target existed before.
- **Hash.** `writeFacts` returns the file's sha256 (via `sha256File`, `src/core/manifest.ts:50`) so `apply` can record it without re-reading.
- **Registration.** `src/commands/ingest-facts.ts` exports `ingestFactsCommand: IngestSubcommand`; append it to `ingestSubcommands` in `src/commands/ingest.ts` (one line plus one import, STORY-003-04 §3.3).
- **Schema location.** `templates/system/**` is installed to `.wiki/system/**` by `init` (`src/commands/init.ts:95`) and `update`, so no install code changes. This refines EPIC-003 §4's `templates/schemas/facts.schema.json`, which `init` would not install.

### 3.3 API Contract (if applicable)

Frozen exports (consumers: STORY-003-08 `apply`, 003-09 `finish` and the end-to-end test, EPIC-005 `--dry-run`):

```ts
// src/ingest/facts.ts
import type { ResolvedPaths } from "../core/paths.js";

export const FACT_STATUSES: readonly ["decided", "tentative"];
export type FactStatus = (typeof FACT_STATUSES)[number];
export interface Fact {
  entity: string; field: string; value: string | number | boolean; status: FactStatus;
  as_of: string; anchor: string; page: string; exists: boolean;
}
export interface FactsFile {
  source_id: string; kind: string; rule_version: number | null;
  facts: Fact[]; new_entities: string[]; uncovered: string[];
}
export interface FactsError { path: string; message: string }
export type FactsValidation = { ok: true; value: FactsFile } | { ok: false; errors: FactsError[] };

export const FACTS_SCHEMA_REL: ".wiki/system/schemas/facts.schema.json";
export function validateFacts(input: unknown): FactsValidation;
export function factsFilePath(paths: ResolvedPaths, sourceId: string): string;
export function readFacts(paths: ResolvedPaths, sourceId: string): Promise<FactsFile | null>;
export function writeFacts(paths: ResolvedPaths, facts: FactsFile): Promise<{ file: string; replaced: boolean; sha256: string }>;
```

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper ingest facts <id>` | CLI | None | facts JSON on stdin or `--file <path>`; `--json` | `{ source_id, file, replaced, kind, rule_version, facts, new_entities, uncovered }` |

```ts
// src/commands/ingest-facts.ts
import type { IngestSubcommand } from "./ingest.js";
export const ingestFactsCommand: IngestSubcommand;
```

Consumed (frozen in their stories' §3.3): `readMeta(paths, id): Promise<SourceMeta | null>` with `origin`, `origin_type`, `kind` and `permission.kind_pending` (STORY-003-01); `evaluatePermission(ingest, request)` → `PermissionResult.decision` / `reason`, `findKindRule(text, kind)` → `SourceKindRule.version`, `normalizeKindId`, `isValidKindId` (STORY-003-02); `removeSource(paths, id)` for the R5 denial (STORY-003-01); `IngestSubcommand` and `ingestSubcommands` (STORY-003-04); `readLogEvents` (STORY-003-07).

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | schema ↔ validator agreement; each fact field rule; calendar-date check; page path rule; unknown keys at both levels; error paths |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/template-loader.red.node.test.ts` passes unchanged after STORY-006-02's re-scope (Sprint Design Review: the new `templates/system/schemas/facts.schema.json` breaks its exact file list; STORY-006-02 is upstream and re-scopes it; this story does not edit it).
- [ ] Peer/Architect Review passed.
- [ ] No new runtime dependency in `package.json`.

## Existing Surfaces

- **Surface:** `src/core/exit-codes.ts:6` — `ExitCode.DENIED` (4) already exists for R5.
- **Surface:** `src/commands/init.ts:95` — `init` installs every file under `templates/system/` into `.wiki/system/`, which ships the schema with no install change.
- **Surface:** `src/commands/hook.ts:26` — `readPayload`, a capped stdin reader to follow for R1.
- **Surface:** `src/core/manifest.ts:50` — `sha256File`, reused for the hash `apply` records.
- **Coverage of this requirement:** partial — exit codes, install path and helpers exist; the validator, schema and command are net-new.

## Prior work

- [[EPIC-003]] (parent), [[EPIC-005]] (`ingest facts --dry-run` builds on `validateFacts`/`readFacts`). No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** The facts file is the handoff between agents (D-16): without validation at submission, a malformed file only surfaces when the writer agent fails mid-write. A JSON Schema validator library would add a dependency for about a dozen rules; a hand-written validator plus an agreement test gives the same guarantee.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (EPIC-003 §4 amended to the decomposition-brief paths after the human accepted them, 2026-10-16.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
