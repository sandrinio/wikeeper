---
story_id: STORY-003-04
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-003 §2 (ingest start, exit codes 3/4, --approved, --reingest), §3 (network only in read), §5 (ask-mode scenario) · architecture.md §7.1–7.3, D-04, D-06–D-08, D-20 · CR-001 (ai allow rule covers wikeeper ingest *) · SPRINT-02 decomposition brief contracts 3–6 · verified src/program.ts, src/core/output.ts, src/commands/hook.ts
actor: AI coding agent
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-003-01
  - STORY-003-02
  - STORY-003-03
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T22:39:16Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 4
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T22:39:37Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 642ad46a122cae370a9db6c4ad1f36c6c92721a76ae13304f3675bfbc681055d
stamp_error: no ledger rows for work_item_id STORY-003-04
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:50:26Z
  sessions: []
---

# STORY-003-04: `wikeeper ingest start`
**Complexity:** L3 — the first ingest command: creates the `ingest` command group and composes the registry, permission evaluation, kind rules and `pre_ingest` hooks into the REGISTER phase. Depends on STORY-003-01, 003-02 and 003-03.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent that has been given a file, a link or something said in chat, I want one command that checks it against the user's permission mode, stores it once with its metadata and tells me which capture rule applies, so that I can extract facts from it knowing the ingest is allowed and traceable.

### 1.2 Detailed Requirements
- **R1 — Command group.** `src/commands/ingest.ts` registers `wikeeper ingest` in `src/program.ts` (one import and one `defaultCommands` entry) and registers its subcommands from an `ingestSubcommands` list, one line per subcommand; each subcommand lives in `src/commands/ingest-<verb>.ts`. This story adds `start`; STORY-003-05, 003-06, 003-08 and 003-09 add one line each. `wikeeper ingest` with no subcommand prints the group's help.
- **R2 — Usage.** `wikeeper ingest start <source> [--kind <kind>] [--approved] [--reingest] [--text-file <file|->] [--title <text>] [--provided-by <user|agent>] [--json]`, where `<source>` is a file path, an `http(s)://` URL, or `-` for text on stdin (a chat excerpt). The repository must be initialised (`.wiki/config.yml` exists), otherwise exit 1 with code `not_initialised`; an invalid config exits 1 as in other commands.
- **R3 — Resolving the source.**
  - **File:** resolved against the working directory; it must be a regular file. A directory → exit 2 pointing to `wikeeper ingest plan`. A file inside the wiki itself (`.wiki/` or the content directory) → exit 2. `--text-file` optionally supplies the text the agent read (a PDF's text, a DOCX's text), refused for `.md` originals (STORY-003-01 R4).
  - **URL:** wikeeper does not fetch it — no SPRINT-02 command uses the network. The agent passes the text it read with `--text-file <file>` or `--text-file -` (stdin); without it → exit 2 explaining that. The URL is recorded as the origin (normalized), the text as `raw/<id>.md`. Schemes other than `http`/`https` → exit 2.
  - **`-`:** the whole of stdin is the excerpt, stored as `raw/<id>.md`. Empty stdin, a TTY stdin, or `--text-file` together with `-` → exit 2.
  - Stdin is read only when asked for (`-` or `--text-file -`), at most 10 MB; more → exit 2.
- **R4 — Labels and kind.** The id label is `--title` when given, else the file name without extension, else the URL's last path segment (or its host), else `chat-excerpt`. `--kind` must satisfy `isValidKindId` (else exit 2) and is stored normalized. The rule for the kind is looked up in `.wiki/kb_instructions.md` with `findKindRule`; its version becomes `rule_version`. A kind with no rule is still allowed, with a warning telling the agent to propose one (architecture §7.4).
- **R5 — Duplicates.** The source is hashed and compared with `findDuplicate` over `listSources`. A duplicate without `--reingest` stores nothing, exits 0 and reports `status: "duplicate"` with the prior source's `id`, `captured_at`, `origin` and the match (`sha256` or `origin`). With `--reingest`, a new source is registered whose `reingest_of` names the prior id. `--reingest` never touches the prior source's files: it writes only new `raw/<new-id>.*` files (exclusive `wx` creates, STORY-003-01 R6) and leaves the prior id's original, meta, text and facts files byte-identical. New files outside `pages/` are allowed during another ingest's write phase (STORY-003-09 R3 counts only modified or deleted ones), so `--reingest` is safe while `.wiki/.lock` is held, and like any `start` it does not check the lock.
- **R6 — Permission.** `evaluatePermission(config.ingest, { origin, originType, kind, approved })` decides, after the duplicate check (architecture §7.3 order):
  - `needs_approval` → exit 3, code `needs_approval`, nothing stored; `details` hold the source metadata the user needs to decide (origin, origin type, size, sha256, kind and rule) and the reason; the human message shows the same in one line.
  - `denied` → exit 4, code `denied`, nothing stored; `details` hold the reason and the matched/checked entries.
  - `allowed` → the decision is stored in `meta.permission` (mode, approved, matched, kind_pending).
- **R7 — Register, then pre-hooks.** The source is registered (STORY-003-01), then `config.hooks.pre_ingest` runs with `runUserHooks` (STORY-003-03) in the repo root. If any hook fails or times out, the registration is removed with `removeSource`, the command exits 1 with code `pre_ingest_failed`, and `details.hooks` holds the hook results.
- **R8 — Result.** Success exits 0 with `IngestStartResult` (§3.3): status, id, the stored meta, the rule, the permission decision, hook results, the kinds `kb_instructions.md` defines (`available_kinds`, so the agent can pick one) and the next command, `wikeeper ingest facts <id> < facts.json`. The human output is three short lines: what was registered, rule and permission, next step.

### 1.3 Out of Scope
- `ingest plan`, `facts`, `apply`, `finish`, `abort` (STORY-003-05, 003-06, 003-08, 003-09).
- Fetching URLs or converting documents (`wikeeper read`, SPRINT-03).
- Harness permission rules: CR-001 already allows `wikeeper ingest …` in `ai` mode and STORY-002-06 asks for `ingest start` in `ask` mode; nothing changes here.

### 1.4 Open Questions

- None. Decisions recorded with their rationale:
  - **URL text comes from the agent** (`--text-file`), because EPIC-003 §3 reserves the network for `read`; the agent already holds the page when the user gives it a link (architecture §7.6), and SPRINT-03's `read` will feed the same flag.
  - **Stdin only on request** (`-`, `--text-file -`): agent harnesses often leave stdin open but empty, and an implicit read would hang.
  - **A duplicate exits 0** with `status: "duplicate"` — it is an expected outcome, not a failure; the agent reads `status` and the prior id.
  - **A failing `pre_ingest` hook rolls back the registration** — the hook acts as a gate, and a half-registered source would make the retry look like a duplicate.

### 1.5 Risks

- **Risk:** `src/program.ts` is touched by several SPRINT-02 stories (001-09, 003-07, 004-02).
- **Mitigation:** One import and one array entry, re-applied at integration (the SPRINT-01 pattern).
- **Risk:** Nested commands lose the global `--json` or the `ingest start` command name in error envelopes.
- **Mitigation:** `getOutputContext` already resolves `optsWithGlobals()` and the full command path; a test asserts `"command": "ingest start"` in a JSON error envelope.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | File, URL-with-text and stdin excerpt are three successful ways to register. |
| Interfaces | F | CLI only. |
| Data | T | Stored raw files and recorded fields differ per source shape. |
| Rules | T | Ask-mode approval, whitelist denial, duplicate/`--reingest`, pre-hook rollback, usage rules. |

```gherkin
Feature: wikeeper ingest start

  @paths @data
  Scenario Outline: Each source shape is registered under ai mode
    Given an initialised repository with ingest.permission "ai"
    And kb_instructions.md with the source-kind line "status-report (v2) → project.status, risk"
    When I run "wikeeper ingest start <args> --json" <stdin>
    Then the exit code is 0 and data.status is "registered"
    And data.id is "src-<today>-<slug>" and raw/ holds <stored>
    And data.source has origin_type "<origin_type>" and rule_version <rule_version>
    And the warnings are <warnings>
    And data.next is "wikeeper ingest facts <data.id> < facts.json"
    And "wikeeper ingest --help" lists "start"

    Examples:
      | args                                              | stdin                              | slug            | stored                      | origin_type | rule_version | warnings                                   |
      | docs/q4.pdf --kind status-report                  | with no input                      | q4              | <id>.pdf and <id>.meta.json | file        | 2            | none                                       |
      | https://acme.example.com/q4 --text-file page.md   | with no input                      | q4              | <id>.md and <id>.meta.json  | url         | null         | none                                       |
      | - --kind chat-excerpt --title vendor-decision     | with "We decided to drop vendor X" | vendor-decision | <id>.md and <id>.meta.json  | stdin       | null         | one naming kind "chat-excerpt" as unruled  |

  @rules
  Scenario: Ask mode requires approval
    Given an initialised repository with ingest.permission "ask"
    When I run "wikeeper ingest start notes.md --json"
    Then the exit code is 3 and error.code is "needs_approval"
    And error.details.source has origin "notes.md", its size and sha256
    And raw/ is unchanged
    When I run "wikeeper ingest start notes.md" without --json
    Then stderr shows the origin, the size and the reason on one line
    When I rerun it with "--approved --json"
    Then the exit code is 0 and data.source.permission has mode "ask" and approved true

  @rules
  Scenario: A duplicate is reported, and --reingest registers it again
    Given notes.md was registered as "src-2026-10-16-notes"
    When I run "wikeeper ingest start notes.md --json"
    Then the exit code is 0, data.status is "duplicate" and data.prior.id is "src-2026-10-16-notes" with match "sha256"
    And raw/ is unchanged
    When I rerun it with "--reingest" while .wiki/.lock is held by another source
    Then a new source is registered whose reingest_of is "src-2026-10-16-notes"
    And every raw/src-2026-10-16-notes.* file is byte-identical and .wiki/.lock is unchanged

  @rules
  Scenario: A failing pre_ingest hook rolls the registration back
    Given hooks.pre_ingest ["node -e \"process.exit(1)\""] and ingest.permission "ai"
    When I run "wikeeper ingest start notes.md --json"
    Then the exit code is 1 and error.code is "pre_ingest_failed"
    And error.details.hooks[0].status is "failed"
    And raw/ holds no file for the source

  @rules
  Scenario Outline: Error — denied and malformed starts store nothing
    Given <repo>
    When I run "wikeeper ingest start <args> --json" <stdin>
    Then the exit code is <exit>, error.code is "<code>" and the envelope's top-level command is "ingest start"
    And no file was created under raw/

    Examples:
      | repo                                               | args                                          | stdin                 | exit | code            |
      | a wiki in whitelist mode allowing docs/meetings/** | docs/notes.md                                 | with no input         | 4    | denied          |
      | a wiki in whitelist mode allowing docs/meetings/** | https://acme.example.com/q4                   | with no input         | 2    | usage           |
      | a wiki in whitelist mode allowing docs/meetings/** | ftp://acme.example.com/q4 --text-file page.md | with no input         | 2    | usage           |
      | a wiki in whitelist mode allowing docs/meetings/** | docs                                          | with no input         | 2    | usage           |
      | a wiki in whitelist mode allowing docs/meetings/** | .wiki/index.md                                | with no input         | 2    | usage           |
      | a wiki in whitelist mode allowing docs/meetings/** | -                                             | with empty input      | 2    | usage           |
      | a wiki in whitelist mode allowing docs/meetings/** | - --text-file -                               | with "text"           | 2    | usage           |
      | a wiki in whitelist mode allowing docs/meetings/** | -                                             | with 11 MB of text    | 2    | usage           |
      | a wiki in whitelist mode allowing docs/meetings/** | docs/meetings/a.md --text-file a.txt          | with no input         | 2    | usage           |
      | a wiki in whitelist mode allowing docs/meetings/** | docs/notes.md --kind "status report"          | with no input         | 2    | usage           |
      | a repository without .wiki/                        | notes.md                                      | with no input         | 1    | not_initialised |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo in `ask` mode, ask Claude Code to ingest a file and confirm it shows the metadata, asks, and reruns with `--approved`.
- [ ] Read the human (non-`--json`) output of a registration and of a denial.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/commands/ingest-start.ts` |
| Related Files | `src/commands/ingest.ts` |
| Modified Files | `src/program.ts` |
| Test Files | `test/ingest/ingest-start.test.ts` |
| New Files Needed | Yes — all files above except `src/program.ts` (one import and one `defaultCommands` entry) |

### 3.2 Technical Logic
- Command factory in the `setup.ts` style: `createIngestStartCommand(deps: { now?: () => Date } = {})` returns an `IngestSubcommand`; `ingestStartCommand` is the default instance.
- Order of work: load config/paths → resolve source (no writes) → validate `--kind` → read `kb_instructions.md` (missing → rule `null`, `available_kinds: []`, warning) → `hashSource` → `listSources` + `findDuplicate` → `evaluatePermission` → `registerSource` → `runUserHooks("pre_ingest", …)` → on failure `removeSource` and throw → emit result.
- Errors are `WikeeperError` with `ExitCode.NEEDS_APPROVAL` / `DENIED` / `USAGE` / `ERROR` and codes `needs_approval`, `denied`, `usage`, `pre_ingest_failed`, `not_initialised`; `emitError` renders them (`details` in the JSON envelope).
- Stdin: reuse `readPayload(ctx.stdin, 10 * 1024 * 1024)` from `src/commands/hook.ts:26` (null → too large, exit 2); strip a leading BOM.
- "Inside the wiki" check: `isInside(paths.wikiDir, abs) || isInside(paths.contentDir, abs)` with `isInside` from `src/agents/hook-protocols.ts:43`.
- `provided_by` defaults to `user`; `--provided-by agent` is for ambient offers (architecture §7.1).

### 3.3 API Contract (if applicable)

Frozen exports (consumers: STORY-003-05, 003-06, 003-08, 003-09 add subcommands; 006-04 documents the command):

```ts
// src/commands/ingest.ts
import type { Command } from "commander";
import type { CommandModule } from "../program.js";
export interface IngestSubcommand { register(group: Command): void }
export const ingestSubcommands: IngestSubcommand[];        // [ingestStartCommand] — later stories append one entry each
export function createIngestCommand(subcommands?: readonly IngestSubcommand[]): CommandModule;
export const ingestCommand: CommandModule;                 // registered in src/program.ts defaultCommands

// src/commands/ingest-start.ts
import type { SourceMeta } from "../ingest/registry.js";
import type { PermissionResult } from "../ingest/permissions.js";
import type { SourceKindRule } from "../ingest/kind-rules.js";
import type { UserHookResult } from "../ingest/user-hooks.js";
export interface IngestStartResult {
  status: "registered" | "duplicate";
  id: string | null;                                       // null for a duplicate
  source: SourceMeta | null;
  prior: { id: string; captured_at: string; origin: string; match: "sha256" | "origin" } | null;
  rule: SourceKindRule | null;
  permission: PermissionResult | null;                     // null for a duplicate (not evaluated)
  hooks: UserHookResult[];
  available_kinds: Array<{ id: string; version: number }>;
  next: string | null;                                     // "wikeeper ingest facts <id> < facts.json"
}
export function createIngestStartCommand(deps?: { now?: () => Date }): IngestSubcommand;
export const ingestStartCommand: IngestSubcommand;
```

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper ingest start <source>` | CLI | None | `--kind`, `--approved`, `--reingest`, `--text-file <file\|->`, `--title`, `--provided-by <user\|agent>`, `--json`; stdin for `-` / `--text-file -` | `IngestStartResult`; errors: exit 3 `needs_approval`, exit 4 `denied`, exit 2 `usage`, exit 1 `pre_ingest_failed` / `not_initialised` |

## Task Breakdown

- [x] Create `src/commands/ingest.ts` (group, `ingestSubcommands`, help on bare `ingest`) and register it in `src/program.ts` -> R1
- [x] Parse options and resolve the three source shapes with their usage errors, reading stdin only on request -> R2, R3
- [x] Validate `--kind`, derive the label, look up the kind rule and `available_kinds` -> R4
- [x] Hash, list sources and handle duplicates and `--reingest` -> R5
- [x] Evaluate permission and map `needs_approval` / `denied` to exit 3 / 4 with details -> R6
- [x] Register the source, run `pre_ingest` hooks, roll back on failure -> R7
- [x] Emit `IngestStartResult` and the three-line human output -> R8
- [x] Write `test/ingest/ingest-start.test.ts` covering the five scenarios through `runCli` with injected stdin and `now`

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 3 | label derivation (title, file, URL segment, host, stdin); stdin over 10 MB; JSON error envelope carries `"command": "ingest start"`. |
| Integration tests | 0 | Temp git repositories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts:30` — `defaultCommands`, where `ingestCommand` is added.
- **Surface:** `src/core/exit-codes.ts:5` — `ExitCode.NEEDS_APPROVAL` (3) and `DENIED` (4), reserved in SPRINT-01 for this command.
- **Surface:** `src/core/output.ts:110` — `emitError` puts `WikeeperError.details` into the JSON envelope; `src/core/output.ts:74` — `getOutputContext` resolves global `--json` for nested commands.
- **Surface:** `src/commands/hook.ts:26` — `readPayload`, reused for size-capped stdin.
- **Surface:** `src/commands/setup.ts` — command-factory pattern with injected `now`.
- **Coverage of this requirement:** partial — output, exit codes and stdin reading exist; the command and its composition are net-new.

## Prior work

- [[EPIC-003]] (parent), [[CR-001]] (`ai` mode harness rule already allows `wikeeper ingest …`, so `start` needs no new allow rule). The SPRINT-02 wiki duplicate check found no other prior work.

## Why not simpler?

- **Smallest existing surface that could carry this:** a flat `ingest-start` command in `src/program.ts` without a group.
- **Why isn't extension / parameterization / config sufficient?** Architecture §7.3 defines `ingest` as a group of six phase commands that the guard message, the settings rules and the instructions all name as `wikeeper ingest <verb>` (CR-002 B4). Creating the group here, with one file per verb and one registration line each, lets the other five stories add their verbs without editing each other's code. The command itself only composes three already-tested modules.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (EPIC-003 §4 names `src/commands/ingest.ts`; the per-verb files `src/commands/ingest-<verb>.ts` follow the decomposition brief's contract 6.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
