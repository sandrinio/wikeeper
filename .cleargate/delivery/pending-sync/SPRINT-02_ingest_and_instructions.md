---
sprint_id: SPRINT-02
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
lifecycle_init_mode: warn
remote_id: null
source_tool: null
status: Active
start_date: 2026-10-17
end_date: null
synced_at: null
created_at: 2026-10-16T17:25:00Z
updated_at: 2026-10-16T21:36:30Z
created_at_version: strategy-phase-pre-init
updated_at_version: fca928d-dirty
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T21:36:23Z
  transition: ready-for-execution
epics:
  - EPIC-001
  - EPIC-002
  - EPIC-003
  - EPIC-004
  - EPIC-006
proposals: []
context_source: "Decomposes EPIC-003 without `read` (STORY-003-01…09), EPIC-004 (STORY-004-01…06), EPIC-006 (STORY-006-01…08) and CR-002 A1–A7 (STORY-001-08, 001-09, 002-07, 002-08). Scope set by the human on 2026-10-16: `read` swapped for EPIC-004; CR-001 lands in SPRINT-01; CR-002 approved. Decomposition brief: .cleargate/sprint-runs/SPRINT-02/plans/decomposition.md."
stamp_error: no ledger rows for work_item_id SPRINT-02
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:10:28Z
  sessions: []
---

# SPRINT-02: Ingest, search and instructions

## 0. Stakeholder Brief

- **Sprint Goal:** An agent takes a real source from "ingest this" to cited wiki pages through `wikeeper ingest`, under all three permission modes, finding what the wiki already knows with `wikeeper search`, guided by the real SETUP.md, ONBOARDING.md and WIKI.md.
- **Business Outcome:** wikeeper starts doing its job. After SPRINT-01 it installs an empty shell; after SPRINT-02 the agent can set up the wiki properly, fill it from meeting notes, documents, links and chat, with provenance, permissions and a write lock, and answer questions from it.
- **Risks (top 3):** 27 stories, the largest sprint so far; EPIC-006's instructions and its structural test depend on the final EPIC-003/004 command names; the page format is shared by the parser, the index, `finish`, search and the page templates.
- **Metrics:** a file, a directory, a chat excerpt and a URL (with agent-supplied text) each complete start → facts → apply → finish under `ai`, `ask` and `whitelist` (EPIC-003 metric); search p95 < 500 ms on 500 pages (EPIC-004 metric); every command referenced in the templates exists in `--help` (EPIC-006 metric); a repeat of the formapass walkthrough — fresh `remove` + `init` in `~/Documents/Dev/formapass_management`, then ingesting sources from `~/Documents/Dev/doc_processor/.cleargate/wiki` — finds no ❌.

## Sprint Goal

Make wikeeper usable for its first real job: setting up a Management wiki, ingesting sources into it safely, and finding what it holds.

## 1. Consolidated Deliverables

Milestones, lanes and the wave plan come from the Sprint Design Review (§2). Bounce exposure is each story's `expected_bounce_exposure`.

| Story ID | Title | Lane | Milestone | Parallel? | Bounce Exposure |
|---|---|---|---|---|---|
| `STORY-001-08` | `init` asks every question before writing | standard | M1 | y | med |
| `STORY-001-09` | `--json` in every subcommand's help; `--purge` help text | standard | M1 | y | low |
| `STORY-002-07` | `doctor` reporting: severities, plurals, setup, permission, enforce, hooks, `.bak` | standard | M1 | y | med |
| `STORY-002-08` | Settings files and backups in `init`/`update` reports; `.bak` gitignored | standard | M2 | n | med |
| `STORY-003-01` | Source ids and raw registry | standard | M1 | y | low |
| `STORY-003-02` | Permission evaluation and source-kind rules | standard | M1 | y | low |
| `STORY-003-03` | User `pre_ingest` / `post_ingest` hooks | standard | M1 | y | med |
| `STORY-003-04` | `wikeeper ingest start` | standard | M2 | n | med |
| `STORY-003-05` | `wikeeper ingest plan` | standard | M3 | y | low |
| `STORY-003-06` | `wikeeper ingest facts` and the facts schema | standard | M3 | y | med |
| `STORY-003-07` | `index.md` builder, `log/` events, `wikeeper index rebuild` | standard | M2 | y | med |
| `STORY-003-08` | Write lock, snapshot, `ingest apply`, `ingest abort` | standard | M4 | y | med |
| `STORY-003-09` | `wikeeper ingest finish`, report, lint hook point, end-to-end ingest test | standard | M5 | n | med |
| `STORY-004-01` | Page parser | standard | M1 | y | med |
| `STORY-004-02` | `wikeeper search`: ranked full-text, JSON schema, performance budget | standard | M2 | y | med |
| `STORY-004-03` | Structured filters `--type`, `--where`, `--status` | standard | M3 | n | med |
| `STORY-004-04` | `--entity` alias resolution with backlinks; `--since` | standard | M4 | n | med |
| `STORY-004-05` | Miss logging and `search --misses` | standard | M5 | n | low |
| `STORY-004-06` | On-disk search cache | standard | M3 | y | low |
| `STORY-006-01` | Pointer block and guard deny message | standard | M1 | y | low |
| `STORY-006-02` | SETUP.md, `project.md` template, `wiki-setup` skill | standard | M1 | y | med |
| `STORY-006-03` | Profile suggestions, `kb_instructions.md` seed, source page template | standard | M2 | y | med |
| `STORY-006-04` | WIKI.md: the wiki protocol | standard | M4 | y | med |
| `STORY-006-05` | `wiki-ingest` / `wiki-search` skills, extractor and writer prompts | standard | M1 | y | low |
| `STORY-006-06` | Structural template tests | standard | M5 | n | med |
| `STORY-006-07` | ONBOARDING.md and the `me.md` template | standard | M2 | y | med |
| `STORY-006-08` | `doctor` checks the setup files (`me.md` ignored and not committed, `project.md` present and shared) | standard | M2 | y | med |

Sources: EPIC-003 (without `read`), EPIC-004, EPIC-006, and CR-002 items A1–A7, B1–B7 and C1's whitelist half. CR-002 itself is not a deliverable: its items are carried by the stories above.

**Not in this sprint:**
<!-- cleargate:ignore-ids -->
- `read` (the planned tenth EPIC-003 story, with CR-002 C2) and EPIC-005 (with CR-002 D1 and C1's `lint --rules` half): the next sprint.
- `CR-001`: lands in SPRINT-01, before 0.1.0 (human, 2026-10-16).
- `BUG-001`, `BUG-002`: `UR:bug`s from the SPRINT-01 walkthrough, fixed in SPRINT-01 before its merge to `main`.
<!-- /cleargate:ignore-ids -->

## 2. Execution Strategy

_Written by the Architect during the Sprint Design Review (reader/synth fan-out, 2026-10-16)._

Wave plan: `.cleargate/sprint-runs/SPRINT-02/plans/waves.json` (schema_version 2).

### 2.1 Phase Plan

N = 25, planned contract-first with the reader/synth fan-out. Everything is cut after SPRINT-01 closes (CR-001 included). `sprint/S-02` is cut from `main`, and contract branches are named `contract/S-02-<slug>`. A story that needs code nobody has written yet is cut from a contract instead of from `sprint/S-02`.

- **Build set:** all 25 stories build in parallel.
  - 23 start once the skeleton dispatch has written C1–C12.
  - 004-06 starts when 004-02's Developer commit exists (C13), and 002-08 when 001-08's does (C14).
  - No story is refused, none has an empty surface, and none writes a DB.
- **Serial merges:** the seven `parallel_eligible: n` stories (002-08, 003-04, 003-09, 004-03, 004-04, 004-05, 006-06) each merge in a wave of their own. Each comes after the parallel wave of its layer, in dependency order. 006-06 merges last.
- **Tracks:** CLI polish (001-08, 001-09, 002-07, 002-08), ingest (003-01…09), search (004-01…06) and instructions (006-01…08). Wave 1 holds the foundations of all four.

**Contracts.** C1 is the root of two chains: ingest (C2–C9) and search (C10–C12). C13 and C14 are not skeletons; each is the owner's own Developer commit. The full signatures are in waves.json.

| Contract | Branch | Base | Owner | Frozen exports | Consumers |
|---|---|---|---|---|---|
| C1 | `contract/S-02-page-parser` | `sprint/S-02` | 004-01 | `parsePage`, `loadPages`, `listPageFiles`, `buildBacklinks`, `pageEntities`, `owningEntityKey`, `linkTarget`, `normalizeName`, `CITATION_RE`; types `Page`, `PageFrontmatter`, `PageSection`, `TypedLink`, `Fact`, `FactStatus`, `WikiLink`, `PageError`, `Entity`, `Backlink` | 003-07, 003-09, 004-02/03/04/06, 006-03, 006-04 |
| C2 | `contract/S-02-permissions` | C1 | 003-02 | `evaluatePermission`, `matchesOrigin`, `matchesKind`, `PermissionDecision/Request/Result`, `WhitelistMatch`; `parseSourceKinds`, `findKindRule`, `normalizeKindId`, `isValidKindId`, `SourceKindRule` | 003-04, 003-05, 003-06, 006-03 |
| C3 | `contract/S-02-registry` | C2 | 003-01 | `SOURCE_ID_PATTERN`, `isSourceId`, `slugify`, `formatIdDate`, `makeSourceId`; `registerSource`, `readMeta`, `listSources`, `removeSource`, `findDuplicate`, `hashSource`, `hashText`, `normalizeUrl`, `fileOrigin`; types `OriginType`, `SourceMeta`, `SourcePermission`, `RegisterInput`, `DuplicateMatch` | 003-04, 003-05, 003-06, 003-08, 003-09 |
| C4 | `contract/S-02-user-hooks` | C3 | 003-03 | `runUserHooks`, `hookFailed`, `substituteSourceId`, `USER_HOOK_TIMEOUT_MS = 60_000`, `USER_HOOK_OUTPUT_LIMIT = 65_536`; types `UserHookPhase/Status/Options/Result` | 003-04, 003-09 |
| C5 | `contract/S-02-ingest-group` | C4 | 003-04 | `IngestSubcommand { register(group: Command): void }`, `ingestSubcommands = [ingestStartCommand, …]`, `createIngestCommand(subcommands?)`, `ingestCommand`; `createIngestStartCommand(deps?)`, `ingestStartCommand`, `IngestStartResult` (incl. `id`) | 003-05, 003-06, 003-08, 003-09 |
| C6 | `contract/S-02-log-index` | C5 | 003-07 | `writeLogEvent`, `readLogEvents`, `renderLogView`, `regenerateLogView`, `LOG_EVENT_TYPES`; `buildIndex`, `writeIndex`, `INDEX_TYPE_ORDER`; types added by the SDR: `LogEventType`, `LogEvent`, `IngestLogEvent`, `AbortLogEvent`, `MissLogEvent`, `StoredLogEvent`, `LogFilter`, `LogReadResult` | 003-06, 003-08, 003-09 |
| C7 | `contract/S-02-facts` | C6 | 003-06 | `validateFacts`, `readFacts`, `writeFacts`, `factsFilePath`, `FACTS_SCHEMA_REL`, `FACT_STATUSES`, `FACTS_KEYS`/`FACTS_REQUIRED`/`FACT_KEYS`/`FACT_REQUIRED` and the field regexes; types `Fact`, `FactStatus`, `FactsFile`, `FactsError`, `FactsValidation` | 003-08, 003-09, 006-04 |
| C8 | `contract/S-02-lock-snapshot` | C7 | 003-08 | `readLock`, `acquireLock`, `releaseLock`, `STALE_LOCK_MS = 7_200_000`, `LockInfo`, `LockState`; `takeSnapshot`, `readSnapshot`, `restoreSnapshot`, `removeSnapshot`, `snapshotDir`, `hashTree`, `hashOutside`, `SnapshotInfo` | 003-09 |
| C9 | `contract/S-02-plan` | C8 | 003-05 | `planDirectory`, `IngestPlan`, `PlanEntry`, `PlanSkip`, `PlanStatus`, `PlanPrior` | 003-09 |
| C10 | `contract/S-02-search` | C1 | 004-02 | engine: `loadSearchCorpus`, `createSearchIndex`, `buildDocs`, `makeSnippet`, `hitSources`, `EMPTY_FILTERS`; types `SearchFilters`, `WhereFilter`, `SearchHit`, `SearchData`, `SearchRequest`, `SearchDeps`, `FactView`, `EntityMatch`, `SinceChanges`, `MissSummary`, `SearchDoc`, `RankedHit`, `SearchIndex`, `SearchCorpus`; command: `executeSearch`, `createSearchCommand`, `searchCommand` | 004-03, 004-04, 004-05 |
| C11 | `contract/S-02-search-log-index` | C10 | 003-07 | Same as C6: a cherry-pick of the C6 commit, so the search chain gets the log contract without the ingest owners | 004-04, 004-05 |
| C12 | `contract/S-02-since` | C11 | 004-04 | `parseSince(raw): SinceBound`, `SinceBound { date, instant }` | 004-05 |
| C13 | `contract/S-02-search-impl` | C10 | 004-02 | 004-02's Developer commit (real engine, bench, `package.json`, lockfile); `loadSearchCorpus`, `createSearchIndex`, `buildDocs`, `SearchCorpus`, `SearchIndex`, `SearchDoc` frozen as in C10 | 004-06 |
| C14 | `contract/S-02-init-prepare` | `sprint/S-02` | 001-08 | 001-08's Developer commit; `IntegrationPhase` gains `"prepare"`, `Integration.prepare(ctx)`, `runIntegrations("prepare", ctx)`, `agentsIntegration.prepare(ctx)` | 002-08 |

Skeleton rules:
- **One dispatch writes them.** A single Developer skeleton dispatch writes C1–C12 in stack order, one commit and one branch per contract (C11 is the cherry-pick of C6's commit). A skeleton touches only its owner's frozen-export files: no tests, no templates, no `package.json` or lockfile.
- **Bodies are stubs.** Bodies throw `contract stub Cn`, and constants carry their frozen values.
  - Exceptions: C5's `createIngestCommand` builds the `ingest` group and calls `register(group)` for each entry, and C10's `createSearchCommand` registers `search` (query, `--limit`, `--json`) and calls `executeSearch`.
  - C5 and C10 also add their owner's import and `defaultCommands` entry to `src/program.ts`.
- **Insertion points.**
  - C5 adds a `// INSERTION POINT STORY-<id>` comment to the `ingestSubcommands` array and to its import block for each consumer: 003-05 `plan`, 003-06 `facts`, 003-08 `apply` + `abort`, 003-09 `finish`.
  - C10 adds one per consumer in both the option chain and `executeSearch`: 004-03 `--type`/`--where`/`--status`, 004-04 `--entity`/`--since`, 004-05 `--misses` plus miss recording.
  - Owners keep the anchors exactly as written. Consumers write only at their own anchor.
- **Owners keep frozen names and types** and replace only the bodies.
  - 004-01, 003-04, 003-06, 003-08, 004-02 and 004-04 build from their own contract.
  - 003-01, 003-02, 003-03, 003-05 and 003-07 do not, because their contract sits above other owners in the stack. Their files therefore meet the consumers' skeleton copies as add/add conflicts at integration, and the owner's file wins.
- **C13 and C14** are cut from the owner's story branch at its Developer commit, before QA-Verify. If QA-Verify later changes the owner, the consumer merges the updated story branch before its own QA-Verify.

| Story | Base | Upstream | Layer | Wave | Milestone |
|---|---|---|---|---|---|
| 001-08 | `sprint/S-02` | — | 0 | wave1 | M1 |
| 001-09 | `sprint/S-02` | — | 0 | wave1 | M1 |
| 002-07 | `sprint/S-02` | — | 0 | wave1 | M1 |
| 003-01 | `sprint/S-02` | — | 0 | wave1 | M1 |
| 003-02 | `sprint/S-02` | — | 0 | wave1 | M1 |
| 003-03 | `sprint/S-02` | — | 0 | wave1 | M1 |
| 004-01 | C1 (own) | — | 0 | wave1 | M1 |
| 006-01 | `sprint/S-02` | — | 0 | wave1 | M1 |
| 006-02 | `sprint/S-02` | — | 0 | wave1 | M1 |
| 006-05 | `sprint/S-02` | — | 0 | wave1 | M1 |
| 003-07 | C1 | 004-01 | 1 | wave2 | M2 |
| 004-02 | C10 (own) | 004-01; 006-02 [c] | 1 | wave2 | M2 |
| 006-03 | C2 | 003-02, 004-01; 006-02 [c] | 1 | wave2 | M2 |
| 006-07 | `sprint/S-02` | 006-02 [c] | 1 | wave2 | M2 |
| 006-08 | `sprint/S-02` | 006-02; 002-07 [c] | 1 | wave2 | M2 |
| 003-04 | C5 (own) | 003-01, 003-02, 003-03; 004-01 [s] | 1 | wave3 | M2 |
| 002-08 | C14 | 001-08 | 1 | wave4 | M2 |
| 003-05 | C5 | 003-01, 003-02, 003-04; 003-03, 004-01 [s] | 2 | wave5 | M3 |
| 003-06 | C7 (own) | 003-01, 003-02, 003-04, 003-07; 003-03, 004-01 [s]; 006-02 [c] | 2 | wave5 | M3 |
| 004-06 | C13 | 004-02; 004-01 [s] | 2 | wave5 | M3 |
| 004-03 | C10 | 004-01, 004-02 | 2 | wave6 | M3 |
| 003-08 | C8 (own) | 003-01, 003-04, 003-06, 003-07; 003-02, 003-03, 004-01 [s] | 3 | wave7 | M4 |
| 006-04 | C7 | 003-06, 004-01; 003-01…003-04, 003-07 [s]; 006-02 [c] | 3 | wave7 | M4 |
| 004-04 | C12 (own) | 003-07, 004-01, 004-02, 004-03 | 3 | wave8 | M4 |
| 004-05 | C12 | 003-07, 004-02, 004-04; 004-01 [s] | 4 | wave9 | M5 |
| 003-09 | C9 | 003-03…003-08, 004-01; 003-01, 003-02 [s] | 4 | wave10 | M5 |
| 006-06 | `sprint/S-02` | its declared predecessors (006-07 and 006-08 added); the other stories [d] | 5 | wave11 | M5 |

- **Upstream** = unmet dependencies ∪ the earlier story in any real collision [c] ∪ the owner of every contract in the base stack [s] ∪, for 006-06 only, every other story by plan directive [d] (sprint plan Risks: "runs last"). None of the extra edges moves a story to a different layer.
- **Milestones:** M1 = wave1; M2 = waves 2–4; M3 = waves 5–6; M4 = waves 7–8; M5 = waves 9–11. Lane `standard` for all 27.
- **Integration per story:**
  1. Merge `sprint/S-02` into `story/<ID>`.
  2. On a skeleton-file conflict the owner's file wins, and the consumer re-applies only its anchor lines.
  3. On adjacent-line conflicts in `src/program.ts` or `src/commands/ingest.ts`, keep both lines.
  4. Run `npm ci` (the search dependency arrives with 004-02).
  5. Run the full suite, then QA-Verify on the merged tree.
- Hosts that dispatch serially ignore contracts and bases and run the waves in order with upstream merged.

### 2.2 Merge Ordering (Shared-File Surface Analysis)

| Shared File | Stories | Order | Rationale |
|---|---|---|---|
| `src/commands/ingest.ts` | 003-04 (creates), 003-05, 003-06, 003-08, 003-09 | 003-04 (w3) → 003-05, 003-06 (w5) → 003-08 (w7) → 003-09 (w10) | Real collision with 003-04 (the consumers insert into a file 003-04 creates); handled by C5's insertion points. The consumers' one-line inserts don't collide with each other. |
| `src/commands/search.ts` | 004-02 (creates), 004-03, 004-04, 004-05 | 004-02 (w2) → 004-03 (w6) → 004-04 (w8) → 004-05 (w9) | Real collision with 004-02; handled by C10's insertion points. The order among the three comes from their dependencies, not from the file. |
| `src/search/engine.ts`, `test/bench/search.bench.ts` | 004-02, 004-06 | 004-02 → 004-06 | Real collision: 004-06 rewrites `loadSearchCorpus`'s index build (the cache) and adds the warm bench case on 004-02's real code, so it is cut from C13. |
| `src/commands/init.ts`, `src/core/integrations.ts`, `src/agents/index.ts` | 001-08, 002-08 | 001-08 → 002-08 | Real collision: 001-08 moves every question ahead of the first write (new `prepare` phase), and 002-08's report and `.bak` changes sit in that flow, so 002-08 is cut from C14. |
| `test/init.test.ts` | 001-08, 002-08 | 001-08 → 002-08 | Each story only adds its own cases; the order follows the row above. |
| `templates/system/SETUP.md` | 006-02 (creates the real text), 004-02 (preview-table rows) | 006-02 (w1) → 004-02 (w2) | Real collision: 006-02's preview test compares the table with the enforce writers, and 004-02 adds the search allow rules, so 004-02 adds the matching rows after merging `sprint/S-02` (C10 doesn't hold 006-02's SETUP.md). Added after the SDR at the human's request. |
| `test/template-loader.red.node.test.ts` | 006-02 (sole editor); 003-06, 006-03, 006-04, 006-07 would each break it | 006-02 (w1) first | Real collision (edits that must be applied in order): one re-scope, by 006-02's QA-Red. The file is dropped from 006-03's and 006-04's surfaces, and 006-02 is added to the upstream of all four. |
| `test/paths.red.node.test.ts` | 006-02 (sole editor) | 006-02 (w1) | Not a collision: one re-scope by 006-02's QA-Red, because line 42 compares `resolvePaths` with the exact field set and `projectFile` is a new field. Found while drafting 006-02 after the SDR. |
| `src/commands/doctor.ts` | 002-07, 006-08 | 002-07 (w1) → 006-08 (w2) | Real collision, ordered: 002-07 changes severities, the summary and the JSON `state`; 006-08 adds one `setup-files` guard after `manifest-drift`. 006-08 is upstream-ordered after 002-07, so it merges onto the changed file. |
| `test/doctor.red.node.test.ts` | 006-08 (sole editor) | 006-08 (w2) | Not a collision: one re-scope by 006-08's QA-Red (line 83 check list gains `setup-files`; `info` accepted on a fresh install). 002-07 keeps it unchanged (its DoD). |
| `src/program.ts` | 001-09, 003-07, 004-02, 003-04 | wave order (w1, w2, w2, w3) | Not a real collision: three registration lines (import + `defaultCommands` entry), plus 001-09's help configuration in `createProgram`. C5 and C10 carry 003-04's and 004-02's lines. |
| `src/commands/remove.ts` | 001-09, 006-02, 004-06 | 001-09, 006-02 (w1) → 004-06 (w5) | Not a real collision: 001-09 rewrites the `--purge` help strings; 006-02 adds `project.md` to the kept list; 004-06 adds the search cache to what `remove` deletes. |
| `src/core/paths.ts` | 006-02 (adds `projectFile`); 004-01, 004-06 read it | 006-02 (w1) | Not a real collision: one additive field; readers don't use it. |
| `src/agents/enforce/index.ts` | 002-07, 002-08 | 002-07 (w1) → 002-08 (w4) | Not a real collision: 002-07 adds `inspectOwnedEntries` and `ENFORCE_JSON_FILES`; 002-08 extends the apply report. |
| `test/agents/enforce.test.ts` | 004-02, 002-08 | 004-02 (w2) → 002-08 (w4) | Each adds its own cases; 002-08 re-runs on top of 004-02's new `search` allow rule. |
| `package.json`, `package-lock.json` | 004-02 | — | Only writer. 004-01 only reads `yaml`. No skeleton touches these files; worktrees run `npm ci`; 004-06 gets the lockfile through C13. |
| Contract skeleton files | owner + consumers | owner first | The owner's file wins at integration. Consumers edit owner files only at the C5/C10 insertion points. |

### 2.3 Shared-Surface Warnings

**Command files**
- **`src/commands/ingest.ts` (003-04 vs 003-05/06/08/09).** Keep `IngestSubcommand { register(group: Command): void }` and `ingestSubcommands` exactly as frozen in C5; a rename means rework in four stories. Array order follows the CLI flow: start, plan, facts, apply, abort, finish.
- **`src/commands/search.ts` (004-02 vs 004-03/04/05).** There is one JSON schema (contract 10). `SearchRequest`, `SearchData` and `SearchFilters` are frozen in C10 with every field 004-03…05 need (`filters.type/where/status/since`, `entity`, `changes`, `misses`). Consumers fill those fields and never add new ones.
- **`src/search/engine.ts` (004-02 vs 004-06).** 004-06 keeps `loadSearchCorpus`'s signature and the `opts.useCache`/`onRebuild` behaviour that `SearchDeps.useCache` already relies on.
- **`src/program.ts` (001-09 vs every registrant).** 001-09's `--json`-in-help change must be generic: applied in `createProgram` and recursive into nested groups (`ingest <verb>`, `index rebuild`). That way no command story adds a help line of its own, and 001-09's help test should list the commands dynamically so later commands are covered when they integrate.

**CLI polish and enforce**
- **`init.ts` / `integrations.ts` / `agents/index.ts` (001-08 vs 002-08).** 002-08 puts its report and backup entries into the ask-first flow from C14, not into the old flow.
- **`src/agents/enforce/index.ts` (002-07 vs 002-08).** If 002-08 needs the list of settings files, it imports 002-07's `ENFORCE_JSON_FILES` rather than keeping a private copy (#reuse #plan).
- **Enforce allow rules (004-02 after CR-001).**
  - CR-001 rewrites `src/agents/enforce/claude.ts` and `codex.ts` in SPRINT-01, before `sprint/S-02` is cut. 004-02 writes its `search` rule in CR-001's form (Claude `permissions.allow`, Codex `prefix_rule`) and updates any exact rule-list assertions in `test/agents/enforce.test.ts`.
  - 002-08 merges after that (wave 4) and re-runs on the new rule list.

**Tests and templates**
- **`test/template-loader.red.node.test.ts`.**
  - 006-02's QA-Red replaces the exact-list assertion at line 161 (`toEqual(["system/SETUP.md", "system/WIKI.md"])`) with a containment check that still passes when files are added under `templates/system/`, and drops the placeholder-first-line check at line 164 (the LF and trailing-newline checks stay).
  - Until 006-02 merges, this test fails in the build worktrees of 003-06, 006-03 and 006-04. That is expected: 006-02 is upstream of all three, so their QA-Verify runs after it merges.
  - The other SPRINT-01 tests on `.wiki/system/**` (init, update, remove, manifest) use `toContain` or `arrayContaining`, so they are not affected.
- **SETUP.md permission preview (006-02 → 004-02).** 006-02's test builds the expected table from `CLAUDE_ENFORCE.items` and `CODEX_ENFORCE` at run time. 004-02 adds the search allow rules (all three modes), so it also adds their rows to the table, on the merged tree before QA-Verify; otherwise `test/templates/setup.test.ts` fails on integration.
- **Pointer block and doctor (006-01 vs 002-07; no shared file).** Doctor's block check (`src/agents/doctor-checks.ts:41`) matches the template's heading and the literal `.wiki/system/WIKI.md`.
  - The new block must keep `## Project Wiki` and that reference. Otherwise every repo with the 0.1.0 block, which is never refreshed (D-11), reports agent-block-missing.
  - `GUARD_REASON` must keep `wikeeper ingest apply <id>`, which `test/agents/hook-guard.red.node.test.ts:268` asserts. If it can't, that test file has to be added to 006-01's surface.
- **Setup files (006-01, 006-02, 006-07 → 006-06; contract 13).** The pointer block (006-01) and SETUP.md step 1 (006-02) name `.wiki/system/ONBOARDING.md`, which 006-07 creates; ONBOARDING.md hands back to SETUP.md step 2. Only 006-06 checks that these references resolve, on the merged tree. SETUP.md step 6 (006-02) and ONBOARDING.md step 5 (006-07) name doctor's `` `setup-files` check ``, which 006-08 adds in the same wave; 006-06 checks that every check id a template names is reported by `wikeeper doctor --json`.
- **WIKI.md anchor (006-01 → 006-04 → 006-06; contract 11).** The deny message names `## Write phase`; 006-04 creates exactly that heading, and 006-06 asserts it.
- **Template parsing (003-02 → 006-03; 004-01 → 006-03).** The `## Source kinds` lines in `templates/kb_instructions.management.md` must parse with `parseSourceKinds`. The page templates must parse with `parsePage` and produce an empty `errors[]`.
- **`test/e2e/pack.ts` (003-09).** `test/e2e/goal.test.ts` already packs the package inline. 003-09 leaves goal.test.ts unchanged, since it is the regression guard; the duplicated pack logic goes on the consolidation list.

**Contract exports**
- **Log event types (003-07 vs 003-06/08/09 and 004-04/05).**
  - Consumers use `AbortLogEvent`, `IngestLogEvent`, `MissLogEvent` and `StoredLogEvent`. These names, plus `LogEventType`, `LogEvent`, `LogFilter` and `LogReadResult`, appear in 003-07's signatures but not in its export list. The SDR added them to C6/C11.
  - `writeIndex` lives in `src/ingest/index-builder.ts`, although 003-09's digest cites `log.ts`.
- **Type ownership.**
  - 004-04 imports `Entity`, `Page`, `Fact` and `Backlink` from `src/wiki/parse-page.ts`, not from `engine.ts` (which does not re-export them); 004-04 §3.1 now says so.
  - `Fact` and `FactStatus` exist in both `parse-page.ts` (a page's fact line) and `facts.ts` (an extracted fact), with different shapes. Keep both as frozen, alias on import in files that need both (003-09), and keep the two `FactStatus` unions identical (`"decided" | "tentative"`).
- **006-04's facts validator.** 006-04 §3 didn't pin the name; it is `validateFacts(input: unknown): FactsValidation`, from C7.

**Process**
- **Stub behaviour.** Consumer tests that exercise a stubbed owner fail in the build worktree until integration, and QA-Verify runs on the merged tree. Only C5's and C10's registration code has working bodies; working skeleton bodies make red tests pass at baseline (#qa #contract). Red tests for modules that don't exist yet use a literal dynamic `import()` inside a `load()` helper (#qa #test-harness).
- **Unreachable-surface flags (BUG-046).** 21 digests listed 106 unreachable paths. The orchestrator checked each one against git:
  - 4 are tracked: `src/core/paths.ts` ×2, `package.json`, `src/core/manifest.ts`.
  - The other 102 are new files created by a SPRINT-02 story, either the story itself or an upstream owner.
  - None is ignored, untracked on disk, or inside a nested repo. The cause is the same as in SPRINT-01: `collision_surface.sh` does not parse the prose cells under "New Files Needed". No story was refused.
- **Digest clean-up.** The collision check used `file_surface_edits` ∪ `file_creates`, with the "Yes — …" cells and "(…" annotations removed. Files a story only reads count as export dependencies, not collisions:
  - 004-01: `paths.ts`, `package.json`
  - 004-02: `parse-page.ts`
  - 004-03: `engine.ts`, `parse-page.ts`
  - 004-04: `log.ts`, `parse-page.ts`, `engine.ts`
  - 004-05: `log.ts`, `since.ts`
  - 004-06: `manifest.ts`, `parse-page.ts`, `paths.ts`

### 2.4 Lane Audit

| Story | Lane | Rationale (≤80 chars) |
|---|---|---|
| — | — | No fast-lane stories; all 27 are `standard` (006-07 and 006-08 added after the SDR). |

001-09 was the only candidate. It fails check 1 (size cap): it touches 4 files, 2 of them tests, and the cap is 2 files with tests counted.

### 2.5 ADR-Conflict Flags

- **No conflicts with locked decisions** (`architecture.md` D-01…D-33):
  - 003-02 follows D-06, D-07 and D-25 (`whitelist.kinds` and `origins`; anything else is denied), and §7.2: the kind is checked at `start` when `--kind` is given, otherwise at `facts` (`kind_pending`).
  - 003-03, 003-04 and 003-09 follow D-05 (pre- and post-ingest hooks).
  - 003-07 follows D-28: one file per log event, and a deterministic, rebuildable `index.md`.
  - 003-08 follows D-17: only one source writes at a time, under the lock.
  - 004-02 follows D-15 and D-29: search is a CLI command, not an MCP tool.
  - No command makes a network or LLM call (D-20; `read` moves to SPRINT-03).
- **Needs a human decision: D-11 vs the walkthrough metric.**
  - `injectBlock` skips any file that already has a `WIKI:START` marker (`src/agents/inject.ts:52`), so `update` never refreshes the pointer block.
  - 006-01's new block (CR-002 B1–B4) therefore reaches fresh installs only, and the "repeat of the formapass walkthrough" metric needs a fresh `init` (or `remove` then `init`).
  - Having `update` refresh wikeeper's own block would change D-11.
- **Contract 12** (templates under `templates/system/**`) refines the EPIC-003/006 §4 paths. The decomposition brief records it, and it is not a departure from any decision.
- **Flashcards applied:**
  - #qa #contract and #qa #test-harness: the stub and red-test rules in §2.3.
  - #test-harness #windows #macos: no case-differing file names in 004-01's fixtures or 004-02's 500-page generator.
  - #encoding #bom: write BOMs as `﻿` escapes.
  - #reuse #plan: `ENFORCE_JSON_FILES` and the pack helper.
  - #pre-gate #deps: the pre-gate check will flag 004-02's new dependency (`new_deps`). That is expected, since the plan names it.
- **In-sprint:** the digests contain no contract conflicts. The SDR closed three gaps: the log event types, the module that holds `writeIndex`, and the `validateFacts` name.

### Wave Assignment

| Wave | Stories | Parallel? | Rationale |
|---|---|---|---|
| wave1 | STORY-001-08, 001-09, 002-07, 003-01, 003-02, 003-03, 004-01, 006-01, 006-02, 006-05 | Yes | Layer 0; no upstream; no real collision. 004-01 builds from its own C1; 006-02 alone re-scopes the template-loader test. |
| wave2 | STORY-003-07, 004-02, 006-03, 006-07, 006-08 | Yes | Layer 1; built from C1, C10 (own), C2 and `sprint/S-02`; `program.ts` lines are insert-only; 006-07 and 006-08 share no file with the others or each other. |
| wave3 | STORY-003-04 | No | `parallel_eligible: n`; layer 1; built from its own C5, which creates `ingest.ts` with the insertion points. |
| wave4 | STORY-002-08 | No | `parallel_eligible: n`; ordered edit on `init.ts`/`integrations.ts`/`agents/index.ts` after 001-08; built from C14. |
| wave5 | STORY-003-05, 003-06, 004-06 | Yes | Layer 2; one-line `ingest.ts` inserts; 004-06 built from C13 (004-02's Developer commit). |
| wave6 | STORY-004-03 | No | `parallel_eligible: n`; layer 2; inserts at its `search.ts` anchors; built from C10. |
| wave7 | STORY-003-08, 006-04 | Yes | Layer 3; built from C8 (own) and C7; no shared file. |
| wave8 | STORY-004-04 | No | `parallel_eligible: n`; layer 3; after 004-03; built from its own C12. |
| wave9 | STORY-004-05 | No | `parallel_eligible: n`; layer 4; after 004-04; built from C12. |
| wave10 | STORY-003-09 | No | `parallel_eligible: n`; layer 4; the end-to-end ingest test runs on the complete search track; built from C9. |
| wave11 | STORY-006-06 | No | `parallel_eligible: n`; layer 5; last, after every command and content story; verified on the merged tree. |

## 4. Execution Log

- 2026-10-16 · Planning: 25 stories drafted from the decomposition brief (`plans/decomposition.md`); all pass `cleargate gate check` (14 criteria). SPRINT-01 is still Active, so `.active` stays `SPRINT-01`; the planning agents' token-ledger rows are attributed to SPRINT-01.
- 2026-10-16 · SDR (reader/synth fan-out, 25 readers): BUG-046 unreachable-surface refusal not applied. All 106 flagged paths were checked against git: 4 tracked, 102 net-new and created by an in-sprint story, 0 problems. Same cause as SPRINT-01 (`collision_surface.sh` does not parse prose "New Files Needed" cells).
- 2026-10-16 · SDR corrections applied to the story files: `test/template-loader.red.node.test.ts` re-scoped by STORY-006-02 alone (row removed from 006-03 and 006-04 §3.1; DoD lines updated in 003-06, 006-02, 006-03, 006-04); STORY-006-02 added to `dep_predecessors` of 003-06, 006-03 and 006-04; STORY-004-04 §3.1 names `parse-page.ts` as the source of `Entity`/`Page`/`Fact`/`Backlink`.
- 2026-10-16 · Human adjustments before execution (6 items): STORY-003-06 R5 removes a source denied at `facts` with `removeSource`; STORY-003-09 R3 `citesSource` accepts `frontmatter.sources` and the source page itself, and STORY-006-03's `source.md` cites its source in both forms; STORY-004-01 R1 unwraps `[[…]]` in `frontmatter.sources`; STORY-004-02 adds the search rows to the SETUP.md preview table (006-02 added to its upstream, waves unchanged); STORY-003-04 R5 pins that `--reingest` writes only new raw files (lock refusal not added, see the planning Brief); open questions decided: search auto-allowed in all three modes (STORY-004-02 🟢), `me.md` template at `templates/system/templates/me.md` (STORY-006-02 🟢, EPIC-006 §4 amended).
- 2026-10-16 · Human decisions after the planning Brief: the SDR-era recommendations accepted (stale lock by age only; D-11 kept; writer runs `apply`/`finish`; `--reingest` invariant instead of a lock refusal; EPIC-003 §4 amended, so STORY-003-06/08/09 are 🟢; story sizes kept; CR boxes left unchecked; Goal Acceptance Check below). Scope change: no fixed pages, `project.md` per repo, `ONBOARDING.md` per person (decomposition contract 13). STORY-006-02 and 006-03 rewritten, 006-01/04/06 updated, STORY-006-07 added (wave 2, upstream 006-02, `waves.json` updated by the orchestrator: no layer changes, no new real collision besides the template-loader re-scope); EPIC-006, CR-002 (B5) and architecture.md (§4, §5, D-13, D-27, D-31, new D-34–D-36) amended.
- 2026-10-16 · Human decision after the second Brief: the two setup-file gaps are closed with a `wikeeper doctor` check, not by changing `update` (STORY-002-08 R4 kept). STORY-006-08 added (wave 2, upstream 006-02 and 002-07 for `src/commands/doctor.ts`; its QA-Red re-scopes `test/doctor.red.node.test.ts`); 006-02 step 6 and 006-07 step 5 now read the check instead of running `git check-ignore`; 006-06 checks that named doctor check ids exist and gains 006-08 as a predecessor; EPIC-006 §4 and scope amended; `waves.json` updated by the orchestrator (27 stories, no wave-order violation). Also: 006-02 R1 test exempts the step-4 preview table from its command list (004-02 adds search rows there); `test/paths.red.node.test.ts` re-scoped by 006-02.
- 2026-10-16 · Gate 2 (Sprint Ready): the human approved the sprint plan, the SDR and all 27 stories (`approved: true`). Kickoff waits for SPRINT-01 to close.
- 2026-10-17 · Kickoff: SPRINT-01 closed (Gate 4); preflight 5/5 pass (devops reachable — used for 4 merges this session); `sprint/S-02` cut from main at fca928d; `cleargate sprint init` → state.json with 27 stories, all standard, `.active` = SPRINT-02; Goal Acceptance Check copied into sprint-context.md; status Active.
- 2026-10-17 · M1 Architect plan (`plans/M1.md`, wave 1, 10 stories). Orchestrator decisions on its open items: (1) skeleton dispatch split — C1–C4 and C10 now, C5–C9/C11/C12 with the M2 plan before wave 3 (departs from SDR §2.1 "one dispatch writes C1–C12"; stacking unchanged); C14 is cut from 001-08's Developer commit, not a skeleton. (2) CR:spec-clarification STORY-006-02 R12 + "remove keeps project.md" scenario: `data.kept` contains `me.md` and `project.md` and stays sorted (was "right after"; `remove` sorts `kept`, `.wiki/pages` sorts between them). (3) sprint-context.md Locked Versions, Test Stack and Cross-Cutting Rules filled in (were template stubs; Locked Versions said Node ≥24 / TS ^5.8). (4) Test-fixture detail, not a spec gap: 006-01/006-02 "`init --yes` in an empty repository" setups pass `--agents claude`. (5) Approach notes accepted: 004-01 keeps yaml's default `prettyErrors` (`false` drops `linePos`); C10 carries a third insertion-point anchor set in request building. (6) Four flashcards recorded.
- 2026-10-17 · Contract step: one Developer skeleton dispatch wrote C1 `contract/S-02-page-parser` e8cfec9, C2 `contract/S-02-permissions` 063146e, C3 `contract/S-02-registry` 9437d82, C4 `contract/S-02-user-hooks` 32fc69e, C10 `contract/S-02-search` 0c5c1fa (typecheck at every tip; 414/414 at C4 and C10; no deviation). C14 `contract/S-02-init-prepare` cut at 37f497d (STORY-001-08's Developer commit).
- 2026-10-17 · Wave 1 (10 stories, one parallel workflow run): 8 GREEN first pass and merged serially (006-02 23e05f9, 003-02 c6e1ba7, 002-07 8ae85e7, 001-09 9d900b8, 001-08 857a739, 003-01 926ede8, 006-01 54e5da4, 006-05 98d185a; 532/532 tests after the last merge, typecheck clean after each). 2 stopped on red-test defects, not implementation (qa_bounces 1 each): STORY-004-01's fixture wrote `b.md` and `B.md` (one file on macOS/Windows) — QA-Red re-dispatch, fixed at 6f26b34; STORY-003-03's timeout test (timeoutMs 300) flaked under full-suite load — QA-Red re-dispatch, fixed at c80a785, with a CR:spec-clarification of the scenario's timeoutMs to 1200 (the 2 s bound unchanged). Both re-verifying without a new Developer pass. 10 flashcards processed (6 recorded, duplicates folded).

## Goal Acceptance Check (accepted by the human, 2026-10-16)

To be copied into `sprint-context.md` at kickoff.

1. `test/e2e/ingest.test.ts` (STORY-003-09) passes on Linux, macOS and Windows CI: a file, a directory, a chat excerpt and a URL with agent-supplied text each complete start → facts → apply → finish under `ai`, `ask` and `whitelist`.
2. The search performance test (STORY-004-02) reports p95 < 500 ms on 500 generated pages.
3. The structural template test (STORY-006-06) passes: every command and flag the templates name exists in `--help`, every referenced file and section exists.
4. Walkthrough (qualitative): in `~/Documents/Dev/formapass_management`, `wikeeper remove` then `wikeeper init`; onboarding writes `me.md`, setup writes `project.md` for the Formapass product and drafts `kb_instructions.md`; the agent ingests sources from `~/Documents/Dev/doc_processor/.cleargate/wiki` (`product-state.md`, `roadmap.md`, and a directory such as `initiatives/` through `ingest plan`) and answers product questions with citations. No ❌ in the notes.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| 25 stories, about twice SPRINT-01. | Four independent tracks (CLI polish, ingest, search, instructions) that meet only at the contracts in the decomposition brief; the SDR orders waves so each track's foundations land first. |
| EPIC-006's instructions and structural test need the final EPIC-003/004 command names. | The command surfaces are frozen as contracts; STORY-006-06 runs last, after every command story. |
| The page format is shared by the parser, `index.md`, `finish`, search and the page templates. | STORY-004-01 owns and freezes it in the first wave; the page templates and STORY-006-06 parse with it. |
| New runtime dependency for full-text search. | Named, version-pinned and size-checked in STORY-004-02; no other new runtime dependency. |
| CR-002 changes EPIC-001/002 code that SPRINT-01 just shipped. | Four small, separate stories; `test/e2e/goal.test.ts` stays green as the regression guard. |
| SPRINT-01 must close first: BUG-001/002, CR-001, D.5 consolidation, CI on three OSes, Gate 4. | SPRINT-02 kickoff waits for preflight check 1 (previous sprint closed). |

## Metrics & Metadata

- **Expected Impact:** first end-to-end ingest and search; release `0.2.0` cut from the sprint result.
- **Priority Alignment:** INITIATIVE-001 order, with search moved forward because the ingest triage step and the instructions depend on it (architecture.md §7.4). SPRINT-03 then finishes the CLI: `read`, `lint`, `status`, `rules`. Knowledge-base quality evaluation stays out of scope (INITIATIVE-001 §5).

---

## Execution Guidelines (Local Annotation — Not Pushed)

- **Starting Point:** the four track foundations in parallel: STORY-004-01 (page parser), STORY-003-01/02/03 (registry, permissions, hooks), STORY-001-09 (help mechanism every new command inherits), and the instruction content that needs no command names.
- **Relevant Context:** `architecture.md` §5 (instruction files), §7 (ingest flow, permissions, delegation), §8 (page format), §9 (rule evolution), §10 (CLI surface); EPIC-003, EPIC-004, EPIC-006, CR-002; `.cleargate/sprint-runs/SPRINT-02/plans/decomposition.md`; the SPRINT-01 walkthrough notes (`~/Documents/Dev/formapass_management/wikeeper-test-notes.md`).
- **Constraints:** no LLM calls and no network in any command; every command has `--json` and stable exit codes; `remove` stays exact; the agent never writes pages outside an ingest; instruction text references only commands that exist by the end of this sprint.
