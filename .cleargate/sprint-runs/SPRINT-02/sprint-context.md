---
sprint_id: "SPRINT-02"
created_at: "2026-10-16T20:50:22.441Z"
last_updated: "2026-10-16T21:19:00.000Z"
---

# Sprint Context

Per-sprint audit artefact. Populated at sprint init (M1 planning) and re-touched after each story merges. Referenced from every Developer/QA/Architect task brief so all agents start from the same baseline.

## Sprint Goal

An agent takes a real source from "ingest this" to cited wiki pages through `wikeeper ingest`, under all three permission modes, finding what the wiki already knows with `wikeeper search`, guided by the real SETUP.md, ONBOARDING.md and WIKI.md.

## Goal Acceptance Check

Confirmed by the human on 2026-10-16 together with the sprint plan (SPRINT-02 plan, "Goal Acceptance Check"). The goal is met when all four hold on `sprint/S-02`:

1. `test/e2e/ingest.test.ts` (STORY-003-09) passes on Linux, macOS and Windows CI: a file, a directory, a chat excerpt and a URL with agent-supplied text each complete start → facts → apply → finish under `ai`, `ask` and `whitelist`.
2. The search performance test (STORY-004-02) reports p95 < 500 ms on 500 generated pages.
3. The structural template test (STORY-006-06) passes: every command and flag the templates name exists in `--help`, every referenced file and section exists.
4. Walkthrough (qualitative): in `~/Documents/Dev/formapass_management`, `wikeeper remove` then `wikeeper init`; onboarding writes `me.md`, setup writes `project.md` for the Formapass product and drafts `kb_instructions.md`; the agent ingests sources from `~/Documents/Dev/doc_processor/.cleargate/wiki` (`product-state.md`, `roadmap.md`, and a directory such as `initiatives/` through `ingest plan`) and answers product questions with citations. No ❌ in the notes.

## Locked Versions

Frozen dependency versions for this sprint. Orchestrator populates from `package.json` snapshots at sprint init; Developers must not upgrade these mid-sprint without an explicit CR.

| Package | Version |
|---------|---------|
| Node    | `>=22.12.0` (CI: ubuntu, macos, windows × 22, 24) |
| TypeScript | `^7.0.2` |
| vitest | `^5.0.5` |
| commander | `^15.0.0` (15.0.0 installed) |
| yaml | `^2.9.1` (2.9.1 installed) |
| @types/node | `^22.20.5` |
| minisearch | added by STORY-004-02 (the only new runtime dependency this sprint) |

## Test Stack

Repo-derived test conventions. Written best-effort by `cleargate init` (detector); the
orchestrator may correct any field per-sprint. Agents read this block as OVERRIDING their
built-in defaults — Developer/QA/Architect use these values, not any hardcoded runner.

| Field | Value |
|-------|-------|
| Backend runner    | `npm test` (vitest run) |
| Frontend runner   | _(none — single-stack CLI)_ |
| Typecheck command | `npm run typecheck` (tsc --noEmit) |
| Red-test naming   | `test/**/*.red.node.test.ts` (immutable after QA-Red) |

_If unresolved at init: leave the table stubbed. The pre-gate scan emits a one-line
"test_stack unresolved — populate sprint_context.md §Test Stack" advisory and treats the
typecheck/test gate as advisory (not FAIL) until populated. (§0.5 backstop decision.)_

## Cross-Cutting Rules

Sprint-wide architecture rules and UI/API tokens that every story must honour. Populated from the parent Epic's `<architecture_rules>` block.

1. No LLM calls and no network in any SPRINT-02 command (`read` is SPRINT-03). Node ≥ 22.12, ESM, TypeScript.
2. Every command supports `--json`, uses `emitResult` / `emitError` and the existing `ExitCode` values (0 ok, 1 error, 2 usage, 3 needs_approval, 4 denied, 5 needs_input).
3. Windows, macOS and Linux: `node:path` everywhere, no case-differing file names, LF line endings, no `:` in file names (timestamps included).
4. Package-owned vs user-owned files follow architecture.md §4.1; the manifest is the single source of truth for what the package owns. Never modify user-owned files or text outside WIKI markers; an existing block is never refreshed (D-11).
5. Contract-first build: frozen exports in `waves.json` `contracts[]` (and the M-plan skeleton blocks) are never renamed or retyped; owners replace bodies only.
6. Red tests are re-scoped by QA-Red only, never by the Developer. `init --yes` with no agents exits 5: fixtures that need agent files pass `--agents <name>`.
7. Path and id lists in `--json` output are sorted by code unit (`compareCodeUnits`); never assert "X right after Y" in a sorted list.

## Active FLASHCARD Tags

FLASHCARD tags that appear in any story's `<agent_context>` for this sprint. Auto-populated by grepping `.cleargate/FLASHCARD.md` at sprint init. Agents: grep the flashcard file for each tag listed here before starting work.

- `#qa #red-test`, `#qa #test-harness`, `#test-harness #worktrees`, `#test-harness #windows` — SPRINT-01 lessons on red tests, the vitest worktree double-count and Windows hosts.
- `#yaml #parser`, `#remove #qa`, `#cli #test-harness`, `#codex #toml #templates` — recorded 2026-10-17 from the M1 plan.

## Adjacent Implementations (Reuse First)

Exported helpers and modules from already-merged stories in this sprint. The Architect updates this section after each story merges. Developers check here before writing new helpers — if the module already exists, import it; duplication is a kick-back criterion.

| Story | Module / Export | Path |
|-------|----------------|------|
| (populated as stories merge) | | |
| SPRINT-01 D.5 | `isInside` (the one containment check — `src/agents/hook-protocols.ts` only re-exports it), `fromPosixRelative`, `toPosixRelative`, `findRepoRoot`, `resolvePaths`, `ResolvedPaths` (`rawDir`, `pagesDir`, `lockFile`, `meFile`) | `src/core/paths.ts` |
| SPRINT-01 D.5 | `compareCodeUnits` — the one locale-free sort (ids, page paths, report lists) | `src/core/compare.ts` |
| SPRINT-01 D.5 | `readPackageVersion` (the one package.json version reader); `templatesDir`, `findPackageRoot`, `listTemplateFiles`, `copyTemplate` | `src/core/templates.ts` |
| SPRINT-01 STORY-001-01 | `ExitCode` (`USAGE` 2, `NEEDS_APPROVAL` 3, `DENIED` 4, `NEEDS_INPUT` 5), `WikeeperError` | `src/core/exit-codes.ts` |
| SPRINT-01 STORY-001-01 | `emitResult`, `emitError`, `getOutputContext`, `CliIO`, `OutputContext` | `src/core/output.ts` |
| SPRINT-01 STORY-001-01 | `CommandModule`, `defaultCommands`, `createProgram`, `runCli` (registers the agents integration for the default program) | `src/program.ts` |
| SPRINT-01 STORY-001-02 | `loadConfig`, `DEFAULT_CONFIG`, `setConfigValue`, `formatConfigIssue`, `WikeeperConfig`, `IngestPermission` (`hooks`, `ingest.whitelist`, `ingest.delegate` live here) | `src/core/config.ts` |
| SPRINT-01 STORY-001-03 | `sha256File`, `readManifest`, `writeManifest`, `serializeManifest`, `diffManifest`, `Manifest`, `ManifestEntry` | `src/core/manifest.ts` |
| SPRINT-01 STORY-001-04 | `runIntegrations`, `registerIntegration`, `resetIntegrations`, `IntegrationContext`, `IntegrationOptions`, `DoctorCheck`, `DoctorSeverity` (`info` exists) | `src/core/integrations.ts` |
| SPRINT-01 STORY-001-04/06 | `applyManagedBlock`, `managedIgnoreEntries`, `stripManagedBlock`, `GITIGNORE_BLOCK_START`/`END` | `src/core/gitignore.ts` |
| SPRINT-01 STORY-002-01 | `WIKI_START_V1`, `WIKI_START_PREFIX`, `WIKI_END`, `injectBlock`, `stripBlock` | `src/agents/inject.ts` |
| SPRINT-01 STORY-002-02 | `createLineReader` (one per stdin — never two), `createAskAgents`; `detectAgentFiles`, `resolveAgents`, `resolveTargets`, `needsInputError`, `AgentFile`, `AgentSource` | `src/agents/ask-agents.ts`, `src/agents/detect.ts` |
| SPRINT-01 STORY-002-03 | `renderModelLine` (drops any line containing `{{model}}`), `SUBAGENT_NAMES`, `SUBAGENT_TARGETS`, `installSubagents`; `installSkills` | `src/agents/subagents.ts`, `src/agents/skills.ts` |
| SPRINT-01 STORY-002-04 | `agentsIntegration`, `ensureAgentsIntegration`, `AGENTS_EXTENSIONS`, `AgentsState`; `AGENT_CHECKS`, `AGENT_CHECK_IDS`, `readBlockSignature`, `AgentCheckInput` | `src/agents/index.ts`, `src/agents/doctor-checks.ts` |
| SPRINT-01 STORY-002-05 | `GUARD_REASON`, `HOOK_ADAPTERS`, `resolveTarget` | `src/agents/hook-protocols.ts` |
| SPRINT-01 STORY-002-06 | `CLAUDE_ENFORCE`, `CODEX_ENFORCE`, `ANTIGRAVITY_ENFORCE`, `EnforceItem` (006-02's preview table is checked against these) | `src/agents/enforce/{claude,codex,antigravity}.ts` |
| SPRINT-01 STORY-002-06 | `enforceExtension`, `ENFORCE_QUESTION`, `resolveEnforce`, `askYesNo`; private `IDENTITY_RE`, `selectorMatch`, `isOwned`, `isBackup` (002-07 reuses them in-module for `inspectOwnedEntries`) | `src/agents/enforce/index.ts` |
| SPRINT-01 STORY-002-06 | `loadJsonDoc` (strict parse, throws `settings_invalid`), `saveJsonDoc`, `settingsError`, `JsonDoc` | `src/agents/enforce/json-merge.ts` |
| SPRINT-01 test pattern | `treeHash` (path + bytes hash), `pathWith` (PATH stub), `tty()` (isTTY stdin) — test-local helpers; copy the pattern, do not import across test files | `test/agents/enforce.test.ts:31-89` |
| SPRINT-01 STORY-002-05 | `readPayload(stream, max)` — size-capped stdin reader (`null` when larger than `max`); `ingest start` (`-`, `--text-file -`) and `ingest facts` reuse it with a 10 MB cap | `src/commands/hook.ts:19` |
| SPRINT-02 STORY-004-01 (merged bdea22c) | `parsePage`, `loadPages` (sorted by path, dot entries skipped), `listPageFiles`, `buildBacklinks`, `pageEntities`, `owningEntityKey`, `linkTarget`, `normalizeName`, `CITATION_RE`; types `Page`, `PageFrontmatter`, `PageSection`, `TypedLink`, `Fact`, `FactStatus`, `WikiLink`, `PageError`, `Entity`, `Backlink`. `Page.title` = frontmatter title, else first `# ` heading, else file name | `src/wiki/parse-page.ts` |
| SPRINT-02 STORY-003-02 (merged c6e1ba7) | `evaluatePermission`, `matchesOrigin`, `matchesKind`, `PermissionResult`; `parseSourceKinds` (reads only the `## Source kinds` section, skips fenced code, does **not** skip HTML comments), `findKindRule`, `normalizeKindId`, `isValidKindId`, `SourceKindRule` | `src/ingest/permissions.ts`, `src/ingest/kind-rules.ts` |
| SPRINT-02 STORY-003-01 (merged 926ede8) | `SOURCE_ID_PATTERN`, `isSourceId`, `slugify`, `formatIdDate`, `makeSourceId`; `registerSource`, `readMeta`, `listSources`, `removeSource`, `findDuplicate`, `hashSource`, `hashText`, `normalizeUrl`, `fileOrigin`; types `SourceMeta`, `SourcePermission`, `RegisterInput`, `OriginType`, `DuplicateMatch` | `src/ingest/source-id.ts`, `src/ingest/registry.ts` |
| SPRINT-02 STORY-003-03 (merged 9b67b9d) | `runUserHooks`, `hookFailed`, `substituteSourceId`, `USER_HOOK_TIMEOUT_MS` (60 000), `USER_HOOK_OUTPUT_LIMIT`; types `UserHookResult`, `UserHookPhase` | `src/ingest/user-hooks.ts` |
| SPRINT-02 STORY-006-02 (merged 23e05f9) | `ResolvedPaths.projectFile` (`<wikiDir>/project.md`); `remove` lists it under `kept`. SETUP.md step-4 preview table is checked against `CLAUDE_ENFORCE` / `CODEX_ENFORCE` at run time (`test/templates/setup.red.node.test.ts:89-135`) | `src/core/paths.ts:13,47`, `templates/system/SETUP.md:49-53` |
| SPRINT-02 STORY-002-07 (merged 8ae85e7) | `configKeyIsSet(root, keyPath)`; `ENFORCE_JSON_FILES`, `inspectOwnedEntries`; `plural(n, word)` ("1 result" / "2 results"), `DoctorState`; doctor guard order — a new core check goes after `manifest-drift` (ends `doctor.ts:208`), never into `AGENT_CHECK_IDS` | `src/core/config.ts:198`, `src/agents/enforce/index.ts:50,374`, `src/commands/doctor.ts:34` |
| SPRINT-02 STORY-001-08 (merged 857a739; C14 = 37f497d) | `IntegrationPhase` `"prepare"`, `Integration.prepare`, `runIntegrations("prepare", ctx)`, `agentsIntegration.prepare`; every question is asked before the first write (`init.ts:139`) | `src/core/integrations.ts`, `src/agents/index.ts`, `src/commands/init.ts` |
| SPRINT-02 STORY-001-09 (merged 9d900b8) | root `.configureHelp({ showGlobalOptions: true })` (`program.ts:48`): every subcommand, nested ones included, lists the global `--json`; a command never adds a local `--json` | `src/program.ts` |
| SPRINT-02 STORY-004-02 (merged f0863a3; C13 = bd9e44e) | `executeSearch`, `createSearchCommand(deps)`, `searchCommand`; `searchWarnings(data)` — a warning goes into `executeSearch`'s `warnings` local (seeded from `corpus.warnings`, `search.ts:51`), never a module-level array; `buildDocs`, `createSearchIndex`, `loadSearchCorpus` (parallel page reads), `makeSnippet`, `hitSources`, `EMPTY_FILTERS` (copy before use); `MINISEARCH_OPTIONS` = constructor options only (query options stay private `SEARCH_OPTIONS`); C10 types. `ranked` and `data` in `executeSearch` are `let` | `src/commands/search.ts`, `src/search/engine.ts` |
| SPRINT-02 STORY-004-02 (test fixture) | `generateWiki(root, { seed, pages })` writes `.wiki/config.yml` + lowercase-unique pages (seed 1 × 500 = the perf fixture; no page contains "atlas"); `mulberry32` | `test/fixtures/search/generate-wiki.ts` |
| SPRINT-02 STORY-003-07 (merged 84236ed) | `writeLogEvent`, `readLogEvents(paths, { type, sourceId, since })` (sorted; `sourceId` matches the event's `source_id`, `log.ts:229`), `renderLogView`, `regenerateLogView`, `LOG_EVENT_TYPES`; types `LogEvent`, `IngestLogEvent`, `AbortLogEvent`, `MissLogEvent`, `RuleProposalLogEvent`, `StoredLogEvent`, `LogFilter`, `LogReadResult`; `buildIndex`, `writeIndex`, `INDEX_TYPE_ORDER`; `indexCommand` (`index rebuild`) | `src/ingest/log.ts`, `src/ingest/index-builder.ts`, `src/commands/index.ts` |
| SPRINT-02 STORY-006-08 (merged 7c68a71) | `createGit(root, run?)`, `execFileRunner`, `GitRunner` (optional `input`), `IgnoreRule` — the only place wikeeper runs git; `checkSetupFiles`, `SETUP_FILES_CHECK_ID` (`setup-files`): every doctor run on an initialised repo adds 1–3 `setup-files` entries (collapse repeated ids, accept `info`) | `src/core/git.ts`, `src/core/setup-files.ts` |
| SPRINT-02 STORY-006-03 (merged 017bc79) | kb seed: `## Source kinds` holds one comment and parses to `[]` — a test that needs a kind rule writes its own line; page template `templates/system/templates/source.md`; profile `templates/system/profiles/management.md` | `templates/kb_instructions.management.md`, `templates/system/**` |
| SPRINT-02 STORY-002-08 (merged a73bffc) | `backupPaths(manifest)`; `managedIgnoreEntries(paths, config, backups = [])` (keeps `.wiki/.cache/`, `gitignore.ts:83`); `PhaseReport.backed_up?` / `IntegrationRunResult.backed_up` merged like `created` | `src/core/gitignore.ts:73,103`, `src/core/integrations.ts:38,58` |
| SPRINT-01 remove | private `exists` (lstat), `rmdirIfEmpty`, `dirsDeepestFirst`, `filesUnder`; `data.removed` / `kept` deduplicated and sorted at the end (`remove.ts:242-246`) — STORY-004-06 reuses them in-module for the `.wiki/.cache/` cleanup | `src/commands/remove.ts:56,65,75,92` |
| SPRINT-01 STORY-001-01 | `RunCliOptions { commands?, io? }`: a custom command list skips `ensureAgentsIntegration` — inject `createSearchCommand(deps)` / `createIngestCommand([...])` to pass deps; drive `init` / `remove` through the default program | `src/program.ts:74-83` |

## Mid-Sprint Amendments

_(populated by Architect on CR:scope-change or CR:approach-change; never rewrite, only append. Format: '<ISO-ts> · <ID> · <one-line note>')_

- 2026-10-16T21:18Z · STORY-006-02 · CR:spec-clarification — R12 and the "remove keeps project.md" scenario: `data.kept` contains `.wiki/me.md` and `.wiki/project.md` and stays sorted by code unit (was "right after"; `remove` sorts `kept`, and `.wiki/pages` sorts between them).
- 2026-10-16T21:18Z · STORY-006-01, STORY-006-02 · test-fixture detail — Gherkin setups "`init --yes` in an empty repository" pass `--agents claude` (without it `init` exits 5 before writing). Not a spec gap.
- 2026-10-16T21:18Z · STORY-004-01 · approach — keep yaml's default `prettyErrors` (`prettyErrors: false` sets no `linePos`); line numbers come from `linePos[0].line`.
- 2026-10-16T21:18Z · C10 · approach — the search command skeleton carries a third set of insertion-point anchors where the search request is built.
- 2026-10-16T21:18Z · contracts · the skeleton dispatch is split: C1–C4 and C10 now (M1 plan); C5–C9, C11, C12 with the M2 plan, before wave 3.
- 2026-10-16T21:36Z · STORY-003-03 · CR:spec-clarification — the "hook that runs too long" scenario uses `timeoutMs 1200` (was 300: a node child's cold start under full-suite load misses 300 ms); the "returns within 2 s" bound is unchanged.
- 2026-10-16T21:36Z · C14 · `contract/S-02-init-prepare` cut at 37f497d (STORY-001-08's Developer commit, QA PASS, unchanged at merge).
- 2026-10-16T22:01Z · STORY-004-02 · CR:spec-clarification — §3.1 gains three QA-Red re-scoped red files (`test/agents/enforce-ai-rules.red.node.test.ts`, `test/agents/enforce.red.node.test.ts`, `test/templates/setup.red.node.test.ts:353`): the search allow rule in all three modes (human decision) falsifies their exact rule lists.
- 2026-10-16T22:01Z · STORY-004-02 · approach — additive exports `searchWarnings(data)` (`src/commands/search.ts`) and `MINISEARCH_OPTIONS` (`src/search/engine.ts`); no frozen C10 export changes; both join C13 for 004-06.
- 2026-10-16T22:01Z · STORY-006-08 · CR:spec-clarification — R5 uses `git check-ignore -v -n -z --no-index --stdin` (NUL-terminated path on stdin; `-z` needs `--stdin`) and `GitRunner` gains an optional `input?: string`; R1: the git-availability `info` and the `ok` entry carry no `file`. Test-fixture detail: the managed block line is `.wiki/me.md` (no leading slash).
- 2026-10-16T22:01Z · M2 · approach — every M2 story merges `sprint/S-02` into its branch right after the cut from its waves.json base (all upstream merged), so QA-Red and the Developer work on real code, not stubs.
- 2026-10-16T22:39Z · STORY-003-04 · CR:spec-clarification — the "denied and malformed starts" scenario reads the envelope's top-level `command` ("ingest start"), not `error.command`: `emitError` writes `{ok, command, error:{code,message,details}}` (`src/core/output.ts`, SPRINT-01) and the story's risk note and test table already say `"command": "ingest start"`. QA-Red re-scopes `test/ingest/ingest-start.red.node.test.ts` lines 127, 206, 217 to `json.command`.
- 2026-10-16T22:41Z · STORY-004-06 · CR:spec-clarification — `SearchDeps` gains optional `onRebuild?: () => void`, forwarded by `executeSearch` (one line, `src/commands/search.ts:49-50`); §3.1 Modified Files lists `src/commands/search.ts`. Additive to C10/C13; 004-04/05 unaffected (M3 Open decision 2).
- 2026-10-16T22:41Z · STORY-004-03 · approach — edits outside the C10 anchors: step-4 `total`/`results` (filter-only searches return entity hits) and the `renderHuman` header (no `for ""` without a query); additive exports `parseFilterValue`, `describeFilters`; `hasFilters` excludes `since` (M3 Open decision 3).
- 2026-10-16T22:41Z · STORY-003-05 · CR:spec-clarification — R3's in-plan duplicate is an earlier `new` file; a copy of an earlier denied file is evaluated on its own (§1.4 rationale assumes the earlier file registers). No Gherkin row changes (M3 Open decision 5a).
- 2026-10-16T22:41Z · M3 · approach — 004-06 and 004-03 cut now (C13/C10 are ancestors of `sprint/S-02`, fast-forward); 003-05 and 003-06 cut when 003-04 merges. Merge order 003-05 → 003-06 → 004-06 → 004-03; the ingest pair may swap, 004-06 may go earlier, 004-06 precedes 004-03.
