---
story_id: STORY-005-04
parent_epic_ref: EPIC-005
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-005 (approved 2026-10-16) §2 `lint --rules` · CR-002 C1, lint half (approved 2026-10-16) · CR-003 D3, D4 (approved 2026-10-17) · architecture.md §5.2 (questions are the root), §9 · SPRINT-03 decomposition brief contracts K1, K2 · SPRINT-03 gate1-decisions.md item 15 (approved at Gate 1, 2026-10-17) and the repository-relative finding-path call · consistency audit findings 5, 13, 14 · verified src/ingest/permissions.ts, src/core/config.ts, src/commands/doctor.ts, src/ingest/lint-hook.ts, test/doctor.red.node.test.ts, test/setup-files.red.node.test.ts and ~/Documents/Dev/formapass_management/.wiki/kb_instructions.md (2026-10-17)
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-005-01
  - STORY-005-02
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T08:59:29Z
updated_at: 2026-10-17T10:23:44Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:24:24Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-005-04
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T10:24:26Z
  sessions: []
---

# STORY-005-04: `wikeeper lint --rules`, and `doctor` warns when `kb_instructions.md` does not parse
**Complexity:** L2 — one module of pure checks over STORY-005-01's parsed file, registered in STORY-005-02's `RULE_CHECKS`, plus one `doctor` check. Depends on STORY-005-01 (K1) and STORY-005-02 (K2 registry and command). No other SPRINT-03 story edits `src/commands/doctor.ts`.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent that proposes rule changes to my user, I want `wikeeper lint --rules` to find duplicate rules, rules that point at unknown entities, questions no rule serves, rules that serve no question, changelog/version mismatches and whitelist kinds that name no source kind, and `doctor` to tell me when `kb_instructions.md` does not parse, so that the capture rules stay consistent as they grow.

### 1.2 Detailed Requirements
- **R1 — Registry.** `src/lint/rules-lint.ts` exports `RULES_LINT_CHECKS`, one `LintCheck` (K2) per id below, all with `scope: "rules"`. `src/lint/checks.ts` appends them to `RULE_CHECKS` with one import and one array entry (`...RULES_LINT_CHECKS`). Each check reads only `ctx.kb`, `ctx.config` and `ctx.paths` and writes nothing (EPIC-005 safety rule). Each finding is a K2 `LintFinding` with the check's id and severity, `path` relative to the repository root in POSIX form (`.wiki/kb_instructions.md`, `.wiki/config.yml`) and `line` when the problem has one. Every rules finding has a `path`, `missing-file` and `unknown-whitelist-kind` included; both files live under `.wiki/`, so the path does not change with `content_dir`. In human output, STORY-005-02's `findingLine` prints the location as `<path>[:<line>]`: `[error] duplicate-rule .wiki/kb_instructions.md:44: …`, `[warn] unknown-whitelist-kind .wiki/config.yml: …`.

  | Check id | Severity | Reports |
  |---|---|---|
  | `missing-file` | error | `.wiki/kb_instructions.md` does not exist (R9) |
  | `missing-section` | error | K1 issue: no `## Questions…`, `## Entities` or `## Source kinds` section |
  | `malformed-question` | error | K1 issue: a `Q<n>` line with no question text |
  | `malformed-entity` | error | K1 issue: an `## Entities` line with an arrow that is not an entity line |
  | `unknown-question-ref` | error | K1 issue: an entity refers to a question the file does not define |
  | `ambiguous-line` | warning | K1 issue: a prose line with an arrow, or a commented-out kind line ingest still reads |
  | `duplicate-rule` | error | R3 |
  | `unknown-entity` | error | R4 |
  | `unknown-field` | warning | R4 |
  | `question-without-rule` | warning | R5 |
  | `rule-without-question` | warning | R6 |
  | `changelog-version-mismatch` | warning | R7 |
  | `unknown-whitelist-kind` | warning | R8 (CR-002 C1) |

  Errors are lines the CLI cannot use as written, or two lines that conflict; warnings are gaps, bloat or bookkeeping slips that still work. With K2, any error makes `lint --rules` exit 1.
- **R2 — Parser issues become findings.** Each `kb.issues` entry becomes one finding of the check named by its `code`, with the issue's message; `line` is omitted when the issue's line is 0.
- **R3 — `duplicate-rule`.** A source-kind id, entity name or question id that a later line defines again gives one finding at the later line, naming the line that defines it first. For a kind, the message says ingest uses the first (`findKindRule`). All other checks use the first kind per id, the first entity per name and the first question per id, so a duplicate is reported once.
- **R4 — Targets: `unknown-entity`, `unknown-field`.** A kind rule's `targets` text splits on commas into targets; each is `<entity>` or `<entity>.<field>` (split at the first `.`). Entity names compare lower-cased. Fields compare lower-cased with runs of spaces, `_` and `-` treated as one space (`target_date` = `target date`). A kind line with targets whose entity is not in `## Entities` gives one `unknown-entity` finding at that line, naming every such target. A kind line with `<entity>.<field>` targets whose entity exists but does not list the field gives one `unknown-field` finding, naming those targets.
- **R5 — `question-without-rule` (CR-003 D3).** A question is served when it is marked `(dated facts)`, or when an entity lists it and some kind rule targets that entity (bare or `<entity>.<field>`). Each unserved question gives one finding at its line, naming the question id. The message says why: "listed by no entity; add it to an entity line or end it with "(dated facts)"", or "listed by <entities>, but no source kind targets them".
- **R6 — `rule-without-question`.** An entity that lists no question defined in the file gives one finding at its line, naming the entity and the kind rules that target it, if any: those rules capture facts no question asks for. Kind lines get no separate finding, so one unneeded entity is one item to fix.
- **R7 — `changelog-version-mismatch`.** The changelog entry form this check expects, and STORY-006-10 documents, is exactly `- YYYY-MM-DD: <kind> v<N>: <change>`; an entry for several kinds changed together lists each, `- YYYY-MM-DD: <kind> v<N>, <kind> v<N>: <change>` (the real file's line 68: `- 2026-10-17: product-state v2, roadmap v2: …`). The check reads STORY-005-01's `KbChangelogEntry.text`, the part after the date. A changelog entry mentions a kind when its text holds the kind id as a whole word (letters, digits and `-` around it do not count, so `initiative` does not match `initiative-doc`) followed by `v<N>` or `(v<N>)`. For each kind at version N > 1 with no entry mentioning it at vN: one finding at the kind line. For each entry mentioning a kind at a version above the kind's current one: one finding at the entry line. A kind at v1 needs no entry.
- **R8 — `unknown-whitelist-kind` (CR-002 C1).** Each `ingest.whitelist.kinds` entry that matches no kind rule under `matchesKind` (`src/ingest/permissions.ts:86`, version-insensitive) gives one finding on `.wiki/config.yml` with no line, naming the entry and listing the kinds the file defines. It is reported whatever `ingest.permission` is: a later switch to `whitelist` would deny those sources.
- **R9 — Missing file.** When `ctx.kb` is `null`, `missing-file` gives one finding on `.wiki/kb_instructions.md` saying to run `wikeeper init`, which restores the seed when it is missing (`src/commands/init.ts:199`). Every other rules check returns no finding.
- **R10 — `doctor` (CR-003 D4).** `checkKbInstructions(paths)` runs `loadInstructions` (K1) and returns:
  - the file exists and has no K1 issues → one check `kb-instructions-valid`, severity `ok`, message `no parse issues`;
  - the file has issues → one check `kb-instructions-valid`, severity `warning`, message `<N> parse issue(s) (first: line <L>, <code>)` for `issues[0]` (`(first: <code>)` when its line is 0), fix `run wikeeper lint --rules`;
  - the file is missing → no check.

  Both rows carry `file: ".wiki/kb_instructions.md"`. Only parse issues count: a file with R3–R8 problems and no parse issue is `ok` in `doctor`, and those problems stay in `lint --rules`, so `doctor` stays one cheap read. A warning does not change `doctor`'s exit code.

### 1.3 Out of Scope
- The `lint` command, its flags, JSON envelope, sorting and exit code (STORY-005-02, K2). Page checks (STORY-005-02, 005-03).
- Contradictory rules (architecture §9 mentions them): telling whether two rules contradict needs their meaning; the agent judges that when it proposes a change.
- Fixing anything: lint and `doctor` report only; the agent edits `kb_instructions.md` after user approval (D-14).
- Rule-decision fingerprints and "previously rejected" (STORY-005-06); pending rule suggestions in `status` (STORY-005-05).
- Parsing the file (STORY-005-01) and the format text in SETUP.md and WIKI.md (STORY-006-10).

### 1.4 Open Questions

- **Question:** A source-kind line inside a multi-line HTML comment is still a rule for ingest, because C2 skips only fenced code (`src/ingest/kind-rules.ts:29`–`36`). How do the rules checks treat it?
- **Decision:** The kinds list stays exactly what C2 returns (STORY-005-01's `kb.kinds`), so `duplicate-rule`, `unknown-entity`, `unknown-field`, `changelog-version-mismatch`, `unknown-whitelist-kind` and the served-question checks count the commented-out line as a rule, as ingest does, and STORY-005-01's `ambiguous-line` issue for it becomes one `ambiguous-line` warning at that line (R2; the commented-kind row of the first scenario) (gate1-decisions item 15) — _approved (human, 2026-10-17, Gate 1)_

- **Decision:** Every lint finding's `path`, page and rules findings alike, is relative to the repository root in POSIX form (`.wiki/pages/people.md`, `.wiki/kb_instructions.md`, `.wiki/config.yml`; content_dir-aware), human output prints `<path>[:<line>]`, and `LintContext.only` stays relative to `pages/` and is input only (R1; orchestrator technical call, gate1-decisions.md) — _approved (human, 2026-10-17, Gate 1)_

Decisions recorded with their rationale (not open):
  - **Severities (R1):** error means ingest or lint would act on something other than what the user approved (an unread line, an unknown target, a second definition); warning means the file still works but has a gap or bloat. On the real formapass file this gives exit 0 with one warning (Q4), so `lint --rules` is usable on existing wikis.
  - **"Served" goes through entities (R5).** Kind rules name entities, and entities name questions (architecture §5.2), so EPIC-005's "question Q4 that no source-kind rule references" means no kind targets an entity that lists Q4.
  - **One finding per kind line (R4)**, naming all its bad targets, so one wrong line is one item to fix.
  - **`doctor` shows no row when the file is missing (R10).** `test/doctor.red.node.test.ts:84` (SPRINT-01) pins doctor's exact check ids on a fixture with no `kb_instructions.md` and 0 warnings; a row there would break that immutable red test. `ingest start` already warns about a missing file (`src/commands/ingest-start.ts:199`) and `lint --rules` reports it as an error (R9). On a wiki from `init`, the seed exists, so the row is always shown.
  - **The changelog entry form (R7)** is fixed here so STORY-006-10 can document it: `- YYYY-MM-DD: <kind> v<N>: <change>`, the form the real file's line 68 already uses.
  - **No dependency on STORY-002-09.** That story only imports `plural` from `src/commands/doctor.ts`; it does not edit the file.

### 1.5 Risks

- **Risk:** The checks report false errors on real files, so agents stop running `lint --rules`.
- **Mitigation:** The acceptance base is STORY-005-01's copy of the formapass file, which must give exactly one warning (Q4) and none once Q4 is marked `(dated facts)`; each check's row changes one line of that file.
- **Risk:** A new `doctor` row breaks SPRINT-01/02 doctor red tests that pin check ids or count warnings.
- **Mitigation:** No row without the file (R10); with the seed the row is `ok`. `test/setup-files.red.node.test.ts:91`–`93` only requires `ids[5]` not to be `setup-files`, and the seed must parse with 0 issues (STORY-005-01). DoD runs the three doctor red files unchanged.
- **Risk:** STORY-005-02 filters findings by `ctx.only` or prints rules findings under the pages directory, and drops or mislabels them.
- **Mitigation:** R1 states the repository-relative path and the `<path>[:<line>]` human form, and §3.2 that rules checks ignore `ctx.only` (`finish` never runs `RULE_CHECKS`); the @paths scenario asserts a human line, and the Sprint Design Review confirms both with STORY-005-02's K2 implementation.
- **Risk:** Changelog entries are free text, so mention matching misses or over-matches.
- **Mitigation:** Whole-word id plus `vN`, with a unit test for `initiative` vs `initiative-doc`; the check is a warning only.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

"The clean file" is `test/fixtures/kb/real-management.md` (STORY-005-01) with line 10 ending in ` (dated facts)`; on it `lint --rules` reports nothing. Line numbers refer to that file (68 lines) or to the seed `templates/kb_instructions.management.md`.

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A fresh seed passes; `--check` runs one rules check; plain `lint` runs no rules check. |
| Interfaces | T | The same parse problem through `lint --rules --json` (per-line findings) and through `doctor` (one warning). |
| Data | T | One file change per check id (Outline). |
| Rules | T | Dated-fact questions are served; a missing file is an error and exits 1. |

```gherkin
Feature: Rules lint and the doctor parse warning

  @data
  Scenario Outline: Each rules check reports its problem
    Given an initialised wiki whose .wiki/kb_instructions.md is <base> with <change>
    When I run "wikeeper lint --rules --json"
    Then data.findings holds exactly one finding: id "<id>", severity "<severity>", path "<path>", line <line>, and a message naming "<names>"
    And the exit code is <exit>

    Examples:
      | base           | change                                                                                 | id                         | severity | path                     | line | names             | exit |
      | the clean file | line 44 replaced by "roadmap (v3) → milestone"                                         | duplicate-rule             | error    | .wiki/kb_instructions.md | 44   | line 40           | 1    |
      | the clean file | line 44 replaced by "status-report (v1) → project.status, vendor"                      | unknown-entity             | error    | .wiki/kb_instructions.md | 44   | project, vendor   | 1    |
      | the clean file | line 44 replaced by "status-report (v1) → milestone.owner"                             | unknown-field              | warning  | .wiki/kb_instructions.md | 44   | milestone.owner   | 0    |
      | the clean file | line 25 replaced by "vendor name, contact → vendors.md", line 44 by "contract (v1) → vendor" | rule-without-question | warning  | .wiki/kb_instructions.md | 25   | vendor, contract  | 0    |
      | the clean file | line 41 starting "initiative-doc (v2)" instead of "(v1)"                               | changelog-version-mismatch | warning  | .wiki/kb_instructions.md | 41   | initiative-doc v2 | 0    |
      | the clean file | line 40 starting "roadmap (v1)" instead of "(v2)"                                      | changelog-version-mismatch | warning  | .wiki/kb_instructions.md | 68   | roadmap v2        | 0    |
      | the clean file | .wiki/config.yml setting ingest.whitelist.kinds to [meeting-notes, standup]            | unknown-whitelist-kind     | warning  | .wiki/config.yml         | none | standup           | 0    |
      | the clean file | line 44 replaced by "Use roadmap → milestone for sprints"                              | ambiguous-line             | warning  | .wiki/kb_instructions.md | 44   | note:             | 0    |
      | the clean file | lines 44, 45 and 46 replaced by "<!--", "standup (v1) → decision" and "-->"            | ambiguous-line             | warning  | .wiki/kb_instructions.md | 45   | ingest            | 0    |
      | the clean file | line 25 replaced by "vendor name →"                                                    | malformed-entity           | error    | .wiki/kb_instructions.md | 25   | <page>            | 1    |
      | the clean file | line 23 replaced by "risk owner, impact → risks.md Q6 Q9"                              | unknown-question-ref       | error    | .wiki/kb_instructions.md | 23   | Q9                | 1    |
      | the clean file | line 14 replaced by "Q8"                                                               | malformed-question         | error    | .wiki/kb_instructions.md | 14   | Q8                | 1    |
      | the seed       | line 9 "## Entities" replaced by "## Entity list"                                      | missing-section            | error    | .wiki/kb_instructions.md | none | ## Entities       | 1    |

  @rules
  Scenario Outline: A question is served by an entity that a source kind targets, or by dated facts
    Given an initialised wiki whose .wiki/kb_instructions.md is test/fixtures/kb/real-management.md with <change>
    When I run "wikeeper lint --rules --json"
    Then data.findings is <findings>
    And the exit code is 0

    Examples:
      | change                                                                                                           | findings                                                                     |
      | no change                                                                                                        | one "question-without-rule" warning at line 10 naming Q4 and "(dated facts)" |
      | line 10 ending in " (dated facts)"                                                                               | empty                                                                        |
      | line 10 ending in " (dated facts)", line 14 "Q8 Who supplies X?", line 25 "vendor name, contact → vendors.md Q8" | one "question-without-rule" warning at line 14 naming Q8 and vendor          |

  @paths
  Scenario: A fresh seed passes, and each scope runs only its own checks
    Given "wikeeper init --yes" in an empty git repository
    When I run "wikeeper lint --rules --json"
    Then data.scope is "rules", data.findings is empty, data.counts is { error: 0, warning: 0, info: 0 } and the exit code is 0
    And no file under .wiki/ changed
    When line 22 of .wiki/kb_instructions.md is replaced by "status-report (v1) → project.status" and line 24 by "Use roadmap → milestone"
    And I run "wikeeper lint --rules --check unknown-entity --json"
    Then data.findings holds only the "unknown-entity" finding, with path ".wiki/kb_instructions.md" and line 22
    And "wikeeper lint --rules --check unknown-entity" prints a line starting "[error] unknown-entity .wiki/kb_instructions.md:22: "
    And "wikeeper lint --json" lists no finding with a rules check id

  @interfaces
  Scenario Outline: doctor reports a file that does not parse as one warning
    Given "wikeeper init --yes" in an empty git repository, then <change>
    When I run "wikeeper doctor --json"
    Then <row>
    And data.warnings is <warnings> and the exit code is 0

    Examples:
      | change                                                                                    | row                                                                                                                                                | warnings |
      | no change                                                                                 | one "kb-instructions-valid" check with severity "ok"                                                                                               | 0        |
      | line 12 of .wiki/kb_instructions.md replaced by "risk owner, impact → risks.md Q6 and Q7" | one "kb-instructions-valid" check with severity "warning", a message naming "line 12" and "malformed-entity", and fix "run wikeeper lint --rules" | 1        |
      | line 9 of .wiki/kb_instructions.md replaced by "## Entity list"                           | one "kb-instructions-valid" check with severity "warning" and a message naming "missing-section"                                                   | 1        |
      | line 22 of .wiki/kb_instructions.md replaced by "status-report (v1) → project.status"     | one "kb-instructions-valid" check with severity "ok" (the unknown entity is a lint finding, not a parse issue)                                     | 0        |
      | .wiki/kb_instructions.md deleted                                                          | no "kb-instructions-valid" check                                                                                                                   | 0        |

  @rules
  Scenario: Error — lint --rules reports a missing kb_instructions.md
    Given "wikeeper init --yes" in an empty git repository and .wiki/kb_instructions.md deleted
    When I run "wikeeper lint --rules --json"
    Then data.findings holds exactly one finding: id "missing-file", severity "error", path ".wiki/kb_instructions.md", and a message naming "wikeeper init"
    And the exit code is 1
```

### 2.2 Verification Steps (Manual)
- [ ] With the built CLI, run `wikeeper lint --rules` and `wikeeper doctor` in `~/Documents/Dev/formapass_management` and check that the only rules finding is `question-without-rule` for Q4 and that `doctor` shows `kb-instructions-valid` as ok.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/lint/rules-lint.ts` |
| Related Files | `src/kb/parse-instructions.ts` (`loadInstructions`, `KbInstructions` — consumed, STORY-005-01), `src/ingest/permissions.ts` (`matchesKind` — consumed), `src/ingest/lint-hook.ts` (`LintFinding` — consumed, C9 plus K2's `line?`), `src/core/paths.ts` (`toPosixRelative` — consumed), `test/fixtures/kb/real-management.md` (consumed, STORY-005-01) |
| Modified Files | `src/lint/checks.ts` (one import, one `RULE_CHECKS` entry), `src/commands/doctor.ts` (one `guard` call after `setup-files`) |
| Test Files | `test/lint/rules-lint.test.ts`, `test/lint/lint-rules-command.test.ts`, `test/doctor-kb.test.ts` |
| New Files Needed | Yes — `src/lint/rules-lint.ts` and the three test files |

### 3.2 Technical Logic
- Build lookups once per run from `ctx.kb`: first kind per id, first entity per name, first question per id, and the set of question ids. Each check is a small function over them; a helper `issueCheck(code, severity)` builds the five K1-issue checks from `kb.issues`.
- `parseTarget(t)`: trim; split at the first `.`; entity lower-cased; field normalised with `toLowerCase().replace(/[\s_-]+/g, " ").trim()`. Entity `fields` are normalised the same way before comparing.
- Changelog mention: for kind id `k`, `new RegExp("(?<![a-z0-9-])" + escape(k) + "(?![a-z0-9-])\\s*\\(?v(\\d+)\\)?", "gi")` over each entry's `text`. The search runs only for the file's own kind ids, so an entry about a kind that was removed matches nothing.
- Rules checks ignore `ctx.only`: it lists changed pages for `finish`'s page checks (K2, K3), and `finish` never runs `RULE_CHECKS`.
- Finding paths: `toPosixRelative(ctx.paths.root, ctx.paths.kbInstructions)` and `toPosixRelative(ctx.paths.root, ctx.paths.configFile)`.
- `doctor.ts`: one line right after the `setup-files` guard (`src/commands/doctor.ts:211`): `if (manifest !== null) await guard(KB_INSTRUCTIONS_CHECK_ID, () => checkKbInstructions(paths));`. `paths` is the one re-resolved after the config loads; `kbInstructions` does not depend on `content_dir`.
- Message examples (wording not frozen, ids and severities are): `source kind "roadmap" is defined again; line 40 defines it first and ingest uses that one`; `source kind "status-report" targets project, vendor, which are not entities in "## Entities"`; `entity "vendor" lists no question; source kinds that target it: contract`; `source kind "initiative-doc" is at v2, but no "## Rule changelog" entry mentions initiative-doc v2`; `ingest.whitelist.kinds entry "standup" names no source kind in .wiki/kb_instructions.md (kinds: …)`; `.wiki/kb_instructions.md is missing; run wikeeper init to restore the seed`.
- `checkKbInstructions` does not import from `src/commands/doctor.ts` (that file imports it); it pluralises `issue`/`issues` itself. `loadInstructions` throwing (e.g. the path is a directory) is caught by doctor's `guard` as an error row, the existing behaviour for every check.
- Command-level tests drive `runCli` with the default program (init needs `.git`, FLASHCARD 2026-10-17 `#qa #test-harness`) and parse the JSON envelope from stdout with `--json`.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper lint --rules` | CLI | None | `--check <id>…`, `--json` (K2, STORY-005-02) | `{ scope: "rules", findings: LintFinding[], counts: { error, warning, info } }`; exit 1 on any error |
| `wikeeper doctor` | CLI | None | `--json` | existing `DoctorResult`, plus the `kb-instructions-valid` check when the file exists |

Frozen exports of `src/lint/rules-lint.ts`:

```ts
import type { LintCheck } from "./checks.js";                 // K2 (STORY-005-02)
import type { DoctorCheck } from "../core/integrations.js";
import type { ResolvedPaths } from "../core/paths.js";

export const RULES_LINT_CHECK_IDS: readonly [
  "missing-file", "missing-section", "malformed-question", "malformed-entity", "unknown-question-ref",
  "ambiguous-line", "duplicate-rule", "unknown-entity", "unknown-field", "question-without-rule",
  "rule-without-question", "changelog-version-mismatch", "unknown-whitelist-kind",
];
export const RULES_LINT_CHECKS: readonly LintCheck[];          // appended to RULE_CHECKS
export const KB_INSTRUCTIONS_CHECK_ID = "kb-instructions-valid";
export function checkKbInstructions(paths: ResolvedPaths): Promise<DoctorCheck[]>;
export function parseTarget(target: string): { entity: string; field: string | null };
```

Consumed (frozen elsewhere): K1 `loadInstructions`, `KbInstructions`, `KbIssue` (STORY-005-01); K2 `LintCheck`, `LintContext`, `RULE_CHECKS` (STORY-005-02); `LintFinding` (C9, `src/ingest/lint-hook.ts:4`, with K2's `line?`); `matchesKind` (C2, `src/ingest/permissions.ts:86`). STORY-006-09 documents these check ids for the agent.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 9 | `parseTarget` and field normalisation; first-definition-wins lookups; changelog mention boundaries (`initiative` vs `initiative-doc`, `(v2)` form); both `question-without-rule` messages; `rule-without-question` with and without kinds that target the entity; one finding per kind line with two bad targets; whitelist entries with a version (`meeting-notes (v1)`); `kb: null` gives only `missing-file`; `checkKbInstructions` ok / warning / missing and the line-0 message form. |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/doctor.red.node.test.ts`, `test/setup-files.red.node.test.ts` and `test/doctor-reporting.red.node.test.ts` pass unchanged.
- [ ] STORY-005-01 and STORY-005-02 tests still pass.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/ingest/permissions.ts:86` — `matchesKind`, the version-insensitive kind match reused for R8.
- **Surface:** `src/core/config.ts:18` — `ingest.whitelist { kinds, origins }`; default `kinds: []` at line 60.
- **Surface:** `src/commands/doctor.ts:211` — the `setup-files` guard; the new `kb-instructions-valid` guard goes right after it. `guard` (line 88) turns a thrown check into an error row.
- **Surface:** `src/ingest/lint-hook.ts:4` — `LintFinding` (C9), the finding shape.
- **Surface:** `src/commands/init.ts:199` — seeds `kb_instructions.md` only when it is missing, so `run wikeeper init` restores it.
- **Surface:** `test/doctor.red.node.test.ts:84` — pins doctor's check ids on a fixture without `kb_instructions.md`.
- **Coverage of this requirement:** partial — kind matching, config and doctor exist; the rules checks and the doctor check are net-new.

## Prior work

- [[EPIC-005]] (parent); [[CR-002]] (C1: whitelist kinds must name existing kinds); [[CR-003]] (D3 dated-fact questions, D4 the doctor warning); [[STORY-003-02]] (`matchesKind`, `parseSourceKinds`); [[STORY-006-03]] (the seed that must pass with no findings); [[STORY-006-08]] and [[STORY-002-07]] (doctor rows and the red tests this story must keep green). No existing rules check in `src/`.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/commands/doctor.ts:211` (doctor already runs file checks) plus K2's `RULE_CHECKS`.
- **Why isn't extension / parameterization / config sufficient?** `doctor` reports one row per check and must stay a quick health read, while the rules problems are per line, need stable ids for `--check` and the agent, and must exit 1 on errors; that is the K2 lint registry. The checks reuse K1's parse, so no second parser is written, and `doctor` gets only the single parse warning CR-003 D4 asks for.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/lint/rules-lint.ts` and `src/lint/checks.ts` are EPIC-005 §0 target files, the latter created by STORY-005-02; `src/commands/doctor.ts` and the related files exist; the doctor change is EPIC-005 §2's CR-003 D4 scope addition.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Gate 1 approved by the human on 2026-10-17: every §1.4 Decision line is approved as recommended.
