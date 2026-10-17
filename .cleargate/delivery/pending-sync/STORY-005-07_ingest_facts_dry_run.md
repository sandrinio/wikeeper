---
story_id: STORY-005-07
parent_epic_ref: EPIC-005
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-005 (approved 2026-10-16) §0 objective ("a facts dry-run diff for previewing rule changes on old sources"), §2, §4 · architecture.md §7.3, §7.4 (facts file), §8 (re-ingest when a rule changes) · SPRINT-03 decomposition brief contract K6 · SPRINT-03 gate1-decisions.md items 4 and 13 (approved at Gate 1, 2026-10-17) · verified src/ingest/facts.ts, src/commands/ingest-facts.ts, src/ingest/registry.ts, src/ingest/permissions.ts · real facts files checked read-only in ~/Documents/Dev/formapass_management/.wiki/raw (9 files, 7–87 facts each, no duplicate entity+field+anchor keys)
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors:
  - STORY-003-12
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T08:52:04Z
updated_at: 2026-10-17T10:04:35Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:05:04Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-005-07
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T10:05:10Z
  sessions: []
---

# STORY-005-07: `wikeeper ingest facts <id> --dry-run`
**Complexity:** L2 — one pure function (`diffFacts`) added to `src/ingest/facts.ts` and one option with its branch in `src/commands/ingest-facts.ts`. STORY-003-12 edits the same command's help text first (merge order only; no code dependency).

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent that changed a capture rule, I want to submit a re-extraction of an already ingested source and see which facts it would add, drop or change, without storing anything, so that I can tell the user whether re-ingesting that source is worth it.

### 1.2 Detailed Requirements
- **R1 — Diff (K6).** `diffFacts(stored, next)` returns `{ added, removed, changed }`:
  - Facts are keyed by `entity`, `field` and `anchor`, compared as exact strings.
  - Facts with the same key are paired in file order (first with first); an unpaired fact of `next` is `added`, an unpaired fact of `stored` is `removed`.
  - A pair is `changed` (`{ before, after }`) when any of `value`, `status`, `as_of`, `page` or `exists` differs, else unchanged (not returned).
  - `added` and `changed` follow `next`'s order, `removed` follows `stored`'s order. The function is pure and ignores `kind`, `rule_version`, `new_entities` and `uncovered`.
- **R2 — Option.** `wikeeper ingest facts <id> [--file <path>] --dry-run [--json]`. Help: `--dry-run  check the facts and show what would change against the stored facts; store nothing`.
- **R3 — Same checks, two exceptions.** A dry run reads input and runs every check of a real submission in the same order (`src/commands/ingest-facts.ts:51–157`), with the same exit codes: `usage` (2) for missing or oversized input, `invalid_facts`, `unknown_source`, `source_id_mismatch` and `kind_mismatch` (1). The two exceptions:
  - The `ingest_finished` refusal (`src/commands/ingest-facts.ts:85`) is skipped, so a finished source can be previewed. This is the use EPIC-005 §0 names ("previewing rule changes on old sources"); a finished ingest keeps its `raw/<id>.facts.json` to compare with.
  - When the whitelist denies the kind at `facts` (`meta.permission.kind_pending`), the source is **not** removed: exit 4, code `denied`, details `{ reason, removed: [], dry_run: true }`, and the message ends `; dry run: nothing was removed`.
- **R4 — Stores nothing.** A dry run creates, changes and deletes no file: no `raw/<id>.facts.json`, no `.tmp-<pid>` file, no `removeSource`, no log event. Rule-version warnings are the same as for a real submission (`src/commands/ingest-facts.ts:147`).
- **R5 — Stored facts.** The baseline is `readFacts(paths, id)`. When nothing is stored, every submitted fact is `added` and `stored` is `null`. A stored file that `readFacts` rejects exits 1 with code `invalid_facts`, and the message names the stored file (`readFacts`' own error, `src/ingest/facts.ts:181`).
- **R6 — JSON output.** Exit 0 whatever the diff. Data:
  `{ source_id, dry_run: true, finished: boolean, stored: { kind, rule_version, facts: number, uncovered: number } | null, next: { kind, rule_version, facts: number, uncovered: number }, added: Fact[], removed: Fact[], changed: Array<{ before: Fact; after: Fact }>, unchanged: number }`. `finished` is whether an `ingest` event names the id; `unchanged` is `next.facts − added − changed`.
- **R7 — Human output.**
  - `dry run for <id>: nothing stored`, plus ` (ingest finished)` when finished.
  - `stored: N facts (<kind> v<rule_version>), M uncovered`, or `stored: none`; then `submitted: …` in the same form. `no rule` replaces `v<rule_version>` when it is `null`.
  - `added A · removed R · changed C · unchanged U`.
  - One line per fact: `+ <entity> <field> = <value> (<status>, <as_of>) → <page>` for added, the same with `-` for removed, and `~ <entity> <field>: <key> <before> → <after>` for changed, one `<key> <before> → <after>` part per differing key, joined with `; `. Values print as JSON (`"on track"`, `true`, `3`).
- **R8 — Library export.** `diffFacts` and the `FactsDiff` type are exported from `src/ingest/facts.ts` beside the frozen C7 exports, which do not change.

### 1.3 Out of Scope
- Re-ingesting (`ingest start --reingest`) or deciding which sources to preview; `wikeeper status` lists candidates (STORY-005-05).
- Diffing `new_entities` or `uncovered` item by item (free text, reworded on every extraction); only their counts are shown.
- Fuzzy matching of anchors: a reworded anchor shows as one removed and one added fact.
- WIKI.md text on when to use `--dry-run` (STORY-006-09) and the command's description line (STORY-003-12).

### 1.4 Open Questions

- **Question:** K6 fixes the diff key, the return shape and "stores nothing, exits 0, validation errors keep their exit code", but not two points where a real submission differs: it refuses a finished source (`ingest_finished`, `src/commands/ingest-facts.ts:85`) and removes a source whose kind the whitelist denies (`:120`). Does a dry run do the same?
- **Decision:** No: a dry run works on finished sources, so a rule change can be previewed on an old source (EPIC-005 §0), and it stores nothing and removes nothing; on a denial it exits 4 with `removed: []` and `dry_run: true` (R3, R4) (gate1-decisions item 13) — _approved (human, 2026-10-17, Gate 1)_
- **Question:** The granularity rubric's too-small signal "a parameter addition" trips literally: the story adds one option to an existing command. Should it be folded into another story or filed as a CR?
- **Decision:** Keep it as its own L2 story, as drafted: the option needs its own branch at two checks, a new pure diff function and its own scenarios, and no other SPRINT-03 story owns `ingest facts` behaviour (STORY-003-12 edits only the command's help text and stays the predecessor for `src/commands/ingest-facts.ts`) (gate1-decisions item 4) — _approved (human, 2026-10-17, Gate 1)_

### 1.5 Risks

- **Risk:** Re-extractions word anchors differently, so most facts show as removed plus added and the diff overstates the change.
- **Mitigation:** The key is K6's; the human summary prints the counts first, and WIKI.md (STORY-006-09) tells the agent to keep anchors as quotes from the source, which do not change between extractions.
- **Risk:** Skipping the `ingest_finished` check in one branch lets a later edit skip it for real submissions too.
- **Mitigation:** A Gherkin row runs the same finished source without `--dry-run` and expects `ingest_finished`; STORY-003-06's own refusal tests keep running.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A dry run before any facts are stored, after facts are stored, and after the ingest is finished. |
| Interfaces | F | CLI only; human and `--json` output come from the same command and are both asserted below. |
| Data | T | Facts pair by entity, field and anchor; each kind of difference lands in its own list. |
| Rules | T | Nothing is stored or removed; a finished source can be previewed but not resubmitted; validation errors keep their exit codes. |

```gherkin
Feature: ingest facts --dry-run

  @rules
  Scenario: A dry run previews a rule change on a finished source and stores nothing
    Given kb_instructions.md has the source kind "meeting-notes (v2) → decision, risk, project.status, person.owns"
    And a finished ingest of "src-2026-10-10-standup" with kind "meeting-notes", rule_version 1 and stored facts F1 (project:atlas status "on track", decided, anchor "§2") and F2 (risk:vendor-delay owner "AK", anchor "§3")
    When I run "wikeeper ingest facts src-2026-10-10-standup --dry-run --json" with a document of rule_version 2 holding F1 with status "tentative" and F3 (person:ana-kim owns "Atlas", anchor "§1")
    Then the exit code is 0 and no warnings are reported
    And data.finished is true, data.stored.rule_version is 1 and data.next.rule_version is 2
    And data.added is [F3], data.removed is [F2], data.changed is [{ before: F1, after: F1 with status "tentative" }] and data.unchanged is 0
    And no file in the repository was created, changed or deleted
    When I run the same command without --dry-run
    Then the exit code is 1 with error code "ingest_finished"

  @paths
  Scenario Outline: A dry run works before and after facts are stored
    Given a registered source "src-2026-10-17-q4-status" started with --kind "status-report"
    And <stored>
    When I run "wikeeper ingest facts src-2026-10-17-q4-status --dry-run" with a valid document of 2 facts
    Then the exit code is 0
    And the output starts with "dry run for src-2026-10-17-q4-status: nothing stored"
    And it prints "<stored_line>" and "<counts_line>"
    And raw/src-2026-10-17-q4-status.facts.json <after>

    Examples:
      | stored                                            | stored_line                                  | counts_line                                       | after                    |
      | no facts are stored                               | stored: none                                 | added 2 · removed 0 · changed 0 · unchanged 0     | does not exist           |
      | facts with the same 2 facts are stored (v2, 1 uncovered) | stored: 2 facts (status-report v2), 1 uncovered | added 0 · removed 0 · changed 0 · unchanged 2 | is byte-for-byte unchanged |

  @data
  Scenario Outline: Facts are paired by entity, field and anchor
    Given stored facts for a registered source holding <before>
    And every fact is decided, as_of "2026-10-15", page "projects/atlas.md" and exists true unless the row says otherwise
    When I run "wikeeper ingest facts <id> --dry-run --json" with a document holding <after>
    Then data.added has <a> entries, data.removed has <r>, data.changed has <c> and data.unchanged is <u>
    And the human output has the line "<line>"

    Examples:
      | before                                         | after                                          | a | r | c | u | line                                                        |
      | project:atlas target_date "2026-11-01" at "p.3" | project:atlas target_date "2026-11-17" at "p.3" | 0 | 0 | 1 | 0 | ~ project:atlas target_date: value "2026-11-01" → "2026-11-17" |
      | project:atlas target_date "2026-11-01" at "p.3" | project:atlas target_date "2026-11-01" at "p.4" | 1 | 1 | 0 | 0 | - project:atlas target_date = "2026-11-01" (decided, 2026-10-15) → projects/atlas.md |
      | project:atlas target_date "2026-11-01" at "p.3" | the same fact with page "atlas.md"              | 0 | 0 | 1 | 0 | ~ project:atlas target_date: page "projects/atlas.md" → "atlas.md" |
      | two identical facts at "p.3"                    | one of them                                     | 0 | 1 | 0 | 1 | added 0 · removed 1 · changed 0 · unchanged 1               |

  @rules
  Scenario: Error — a kind denied at a dry run removes nothing
    Given permission mode "whitelist" with kinds ["meeting-notes"] and origins ["docs/**"]
    And a source registered from "notes/contract.md" without --kind, so its meta has permission.kind_pending true
    When I run "wikeeper ingest facts <id> --dry-run --json" with a document of kind "contract"
    Then the exit code is 4 with error code "denied"
    And details.removed is [] and details.dry_run is true
    And the message ends with "dry run: nothing was removed"
    And raw/ still holds the source's original and meta files, and no facts file

  @rules
  Scenario Outline: Error — validation errors keep their exit codes, and nothing is stored
    Given <state>
    When I run "wikeeper ingest facts <id> --dry-run --json" with <input>
    Then the exit code is <exit> with error code "<code>"
    And no file in the repository was created, changed or deleted

    Examples:
      | state                                                         | id                       | input                                                | exit | code               |
      | source "src-2026-10-17-a" is registered                       | src-2026-10-17-a         | a document whose facts[0].status is "maybe"          | 1    | invalid_facts      |
      | source "src-2026-10-17-a" is registered                       | src-2026-10-17-a         | a valid document whose source_id is "src-2026-10-17-b" | 1  | source_id_mismatch |
      | no source "src-2026-10-17-ghost" is registered                | src-2026-10-17-ghost     | a valid document for it                              | 1    | unknown_source     |
      | source "src-2026-10-17-a" was started with --kind "meeting-notes" | src-2026-10-17-a     | a valid document of kind "status-report"             | 1    | kind_mismatch      |
      | source "src-2026-10-17-a" has a stored facts file that is not valid JSON | src-2026-10-17-a | a valid document                                | 1    | invalid_facts      |
      | source "src-2026-10-17-a" is registered and stdin is a TTY    | src-2026-10-17-a         | no --file                                            | 2    | usage              |
```

### 2.2 Verification Steps (Manual)
- [ ] In a copy of `~/Documents/Dev/formapass_management`, pipe `raw/src-2026-10-17-initiative-001.facts.json` with `rule_version` set to 2 and one fact edited into `wikeeper ingest facts src-2026-10-17-initiative-001 --dry-run`, and check the output shows one changed fact, the `rule_version` warning, and `git status` shows no change.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/commands/ingest-facts.ts` |
| Related Files | `src/ingest/facts.ts` (adds `diffFacts`, `FactsDiff`), `test/ingest/facts-diff.test.ts`, `test/ingest/ingest-facts-dry-run.test.ts` |
| Consumed (unchanged) | `src/ingest/facts.ts` (`validateFacts`, `readFacts`), `src/ingest/log.ts` (`readLogEvents`), `src/ingest/registry.ts` (`readMeta`), `src/ingest/permissions.ts` (`evaluatePermission`), `src/ingest/kind-rules.ts` (`findKindRule`) |
| New Files Needed | Yes — `test/ingest/facts-diff.test.ts`, `test/ingest/ingest-facts-dry-run.test.ts` |

### 3.2 Technical Logic
- **Command branch.** Read `opts.dryRun` (commander's camel case for `--dry-run`). Keep the existing steps and add the branch at three points:
  1. Step 4 (`src/commands/ingest-facts.ts:84`): compute `finished`, and throw `ingest_finished` only when not a dry run.
  2. Step 9 (`:117`): on `denied` in a dry run, throw the R3 error without calling `removeSource`.
  3. Step 11 (`:160`): in a dry run, call `readFacts`, then `diffFacts(stored ?? { ...value, facts: [], new_entities: [], uncovered: [] }, value)`, and `emitResult` the R6 data; `writeFacts` is never reached.
- **Pairing.** `diffFacts` builds `Map<string, Fact[]>` from `stored`, keyed by `JSON.stringify([f.entity, f.field, f.anchor])`; walking `next`, it shifts the first stored fact with the same key. What is left in the map, in `stored` order, is `removed`.
- **Comparing.** `FACT_DIFF_FIELDS = ["value", "status", "as_of", "page", "exists"] as const`, compared with `!==` (values are scalars, C7). The human `~` line lists the fields in that order.
- **No-write test.** Hash every file under the temp repo before and after the command; the map must be equal, and no name containing `.tmp-` may exist.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper ingest facts <id> --dry-run` | CLI | None | facts JSON on stdin or `--file <path>`; `--json` | R6 data |

```ts
// src/ingest/facts.ts (additions; C7 exports unchanged)
export interface FactsDiff {
  added: Fact[];
  removed: Fact[];
  changed: Array<{ before: Fact; after: Fact }>;
}
export const FACT_DIFF_FIELDS: readonly ["value", "status", "as_of", "page", "exists"];
export function diffFacts(stored: FactsFile, next: FactsFile): FactsDiff;
```

Consumed (frozen in STORY-003-06 §3.3): `validateFacts`, `readFacts`, `Fact`, `FactsFile`, `ingestFactsCommand`.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 4 | `diffFacts`: each field in `FACT_DIFF_FIELDS` alone; key change → removed + added; duplicate keys paired in order; output order |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/ingest/ingest-facts.red.node.test.ts`, `test/ingest/facts.red.node.test.ts` and `test/ingest/facts.test.ts` pass unchanged.
- [ ] No new runtime dependency in `package.json`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/commands/ingest-facts.ts:36` — `ingestFactsCommand`: input (`:51`), registration and finished checks (`:82–87`), schema and kind checks (`:90–107`), kind permission with `removeSource` (`:110–137`), rule-version warnings (`:147`), `writeFacts` (`:160`).
- **Surface:** `src/ingest/facts.ts:19` and `:29` — `Fact` and `FactsFile`; `src/ingest/facts.ts:190` — `readFacts`, the stored baseline.
- **Coverage of this requirement:** partial (≈80% of the checks) — validation and input handling are reused as they are; the diff and the no-write branch are net-new.

## Prior work

- [[EPIC-005]] (parent). [[STORY-003-06]] built `ingest facts` and named `--dry-run` as EPIC-005 work in its §1.3; this story adds the option to that command. [[STORY-003-12]] edits the same command's help text first. [[STORY-005-05]] lists the re-ingest candidates a dry run previews. No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/commands/ingest-facts.ts:36`, the command this story extends.
- **Why isn't extension / parameterization / config sufficient?** It is an extension: one option on the existing command plus one pure function. The option is not a pass-through, though: a real submission refuses finished sources and deletes denied ones, so the dry run needs its own branch at those two points, and the diff has no existing equivalent.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding.
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1 approved by the human on 2026-10-17: every §1.4 Decision line is approved as recommended.
