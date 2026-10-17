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
| SPRINT-02 STORY-003-04 (merged b5b661c) | `createIngestStartCommand({ now? })`, `ingestStartCommand`, `IngestStartResult`; `createIngestCommand(subcommands)` / `ingestSubcommands` / `IngestSubcommand` (C5 group, anchors kept) | `src/commands/ingest-start.ts:85`, `src/commands/ingest.ts:13-37`; error envelopes carry top-level `command: "ingest start"` (exit 3 `needs_approval` with `details.source`, exit 4 `denied`) |
| SPRINT-01 remove | private `exists` (lstat), `rmdirIfEmpty`, `dirsDeepestFirst`, `filesUnder`; `data.removed` / `kept` deduplicated and sorted at the end (`remove.ts:242-246`) — STORY-004-06 reuses them in-module for the `.wiki/.cache/` cleanup | `src/commands/remove.ts:56,65,75,92` |
| SPRINT-01 STORY-001-01 | `RunCliOptions { commands?, io? }`: a custom command list skips `ensureAgentsIntegration` — inject `createSearchCommand(deps)` / `createIngestCommand([...])` to pass deps; drive `init` / `remove` through the default program | `src/program.ts:74-83` |
| SPRINT-02 STORY-003-05 (merged a5d7593) | `planDirectory(paths, config, dirAbs, { kind })`; types `IngestPlan`, `PlanEntry`, `PlanSkip`, `PlanStatus`, `PlanPrior` (C9); `ingestPlanCommand` | `src/ingest/plan.ts:12-46`, `src/commands/ingest-plan.ts:43` |
| SPRINT-02 STORY-003-06 (merged ef198e2) | `validateFacts` (never throws), `readFacts` (ENOENT → `null`; corrupt → `invalid_facts`), `writeFacts` (returns the written bytes' `sha256`), `factsFilePath` (absolute native; `usage` for a non-source id), `FACTS_SCHEMA_REL`, `FACTS_KEYS` / `FACT_KEYS`, `FACT_ENTITY_RE` / `FACT_AS_OF_RE` / `FACT_PAGE_RE`; `ingestFactsCommand`; shipped schema `templates/system/schemas/facts.schema.json` | `src/ingest/facts.ts:139,183,197,218`, `src/commands/ingest-facts.ts` |
| SPRINT-02 STORY-004-03 (merged 40d7d05) | `parseWhere`, `parseFilterValue`, `hasFilters` (excludes `since`), `describeFilters` (includes `--since`), `matchesFilters`, `entityHit` (the hit carries no entity key: map it back by path + line + name); `executeSearch` local `entityHits` (filter-only results, `let`) | `src/search/filters.ts:15-131`, `src/commands/search.ts:56-68` |
| SPRINT-02 STORY-004-06 (merged 835dfa8) | `SEARCH_CACHE_VERSION`, `searchCacheFile(paths)`, `SearchDeps.onRebuild`; `corpus.pages` / `entities` may come from the JSON cache (plain data); every CLI search writes `.wiki/.cache/search.json` unless `useCache: false`; `remove` deletes `.wiki/.cache/` | `src/search/engine.ts:97-141,235`, `src/commands/remove.ts` |
| SPRINT-01 STORY-002-05 | `runGuard({ agent, stdin, isTTY, cwd })` → `{ exitCode, stdout, stderr }`: drive the PreToolUse guard in-process (claude allow = exit 0 and empty stdout; deny = stdout JSON with `hookSpecificOutput.permissionDecision: "deny"`); page writes are allowed exactly while `.wiki/.lock` exists | `src/commands/hook.ts:31,52` |
| SPRINT-02 STORY-004-04 (merged 13bda5d; Developer commit 0b9bc3d) | `entityKeys`, `resolveEntity`, `entityBacklinks`, `toEntityMatch`, `EntityResolution`; `parseSince` (real: `invalid_since`, `{ date, instant }`), `toFactView`, `factsSince`, `pagesChangedSince`; in `search.ts` the module-private `entitySinceBound`, `renderSearch` (the human-output entry point; 004-05's misses branch is its first line), `renderEntity`, `renderChanges`, and `executeSearch`'s function-level `const sinceBound` (its block skips `req.misses`) | `src/search/aliases.ts`, `src/search/since.ts`, `src/commands/search.ts:33-83,159-213` |
| SPRINT-02 STORY-006-04 (merged a51cbec) | WIKI.md's thirteen `##` sections, the targets of every `section "…"` reference; the `md` example fences hold `## Summary`, `## Facts`, `## Vendor delay`, `## Hiring gap`, which are not sections | `templates/system/WIKI.md` (fences 118–165) |
| SPRINT-02 STORY-003-08 (merged cecd0b2) | `readLock` (unreadable = `held: true, lock: null`), `acquireLock`, `releaseLock`; `hashTree` (dot files included, symlinks skipped), `hashOutside` (`index.md`, `log/**`, `raw/**` minus `*.facts.json`, keys relative to the content dir), `takeSnapshot`, `readSnapshot` (`null` when invalid), `restoreSnapshot`, `removeSnapshot`; `ingestApplyCommand`, `ingestAbortCommand`, `buildBrief` | `src/ingest/lock.ts`, `src/ingest/snapshot.ts`, `src/commands/ingest-apply.ts`, `src/commands/ingest-abort.ts` |
| SPRINT-01 test pattern | pack-and-extract: `tsc -p tsconfig.build.json`, `npm pack --json` via `npm_execpath`, `tar -xzf`, `node_modules` junction, `spawnSync(process.execPath, [cli, …])` — 003-09's `test/e2e/pack.ts` copies it but builds into a staging dir (`--outDir`), never into the repo's `dist/` (parallel e2e files race there) | `test/e2e/goal.test.ts:15-40` |
| SPRINT-02 STORY-006-05 (test pattern) | `readTomlLines(text)` → `{ fields, instructions }` for sub-agent TOML; it lives in a red file: copy it, never import a test file | `test/templates/skills-subagents.red.node.test.ts:19-38` |
| SPRINT-02 STORY-003-07 | `index rebuild` warning format: page parse errors `<repo-relative file>: <message>`, skipped log files `<file>: <reason>` — `ingest finish` reuses it | `src/commands/index.ts:47-50` |
| SPRINT-01 D.5 (gotcha) | `listTemplateFiles("", dir)` returns `/agent-block.md` (leading slash); strip it or list per top-level entry | `src/core/templates.ts:56-78` |
| SPRINT-02 STORY-002-07 / 006-08 | `doctor --json` → `data.checks[].id` (`node-version`, `wiki-initialised`, `config-valid`, `manifest-drift`, `setup-files`, `agent-wiring`, …) — 006-06 checks template-named ids against it | `src/commands/doctor.ts` |

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
- 2026-10-16T23:13Z · STORY-004-04 · approach — (a) a `--since` date-time with an offset uses the date as written, not the UTC day; (b) `--limit` caps `changes.facts`/`changes.pages` in every mode (`total` uncapped, `entity.facts` never capped; R8 states the cap only for `--since` alone); (c) R8's "same entities" = owning entities of the kept hits and their pages; (d) unknown `--entity` with `--since` → empty `changes`; (e) `--entity ""` exits 2 `usage`; (f) `invalid_since`/exclusivity checked in the action before the wiki is read and again in `executeSearch`; (g) `FactView.section` is the fact's own heading; (h) name keys use the file name only, so path-form links are not backlinks; (j) the 004-04 block skips misses mode (M4 Open decision 2).
- 2026-10-16T23:13Z · STORY-004-04 · approach — edits outside the C10 anchors in `src/commands/search.ts`: E1 six import lines, E2 four module-private helpers after `searchWarnings`, E7 `message: renderSearch(data)`; surface unchanged (§3.1 lists the file) (M4 Open decision 3).
- 2026-10-16T23:13Z · STORY-003-08 · approach — refusal order `not_initialised` → `ingest_finished` → `unknown_source` (→ `no_facts`/`locked`); `snapshot.pages` includes dot files, symlinks neither copied nor hashed; abort event `restored` = sorted union of restored and removed; new error codes `snapshot_failed`, `restore_failed` (lock and snapshot kept), `snapshot_missing`; abort without the lock leaves a leftover snapshot and warns (M4 Open decision 4).
- 2026-10-16T23:13Z · STORY-006-04 · approach — text conventions pinned by the M4 plan: extractor regexes, exact Delegation cells, the R6 unavailable sentence, a multi-entry page's frontmatter `type` names the collection (e.g. `risk-register`), four verbatim examples (checked with `validateFacts`/`parsePage`/`pageEntities`), "link by name or alias" (M4 Open decision 5).
- 2026-10-16T23:13Z · M4 · approach — all three cut at once from the M4 commit (every upstream merged): 006-04 fast-forward, 003-08 clean cut merge, 004-04 add/add on `src/ingest/log.ts`/`index-builder.ts` → `--theirs`. Merge order 003-08 / 006-04 either way, then 004-04 (may go earlier).
- 2026-10-16T23:35Z · M5 · approach — waves 9–11 re-planned (every upstream merged): wave9 = {004-05, 003-09} in parallel, any merge order; wave10 = {006-06}, built alongside wave9 (build-only), then re-synced and verified on the tree with both, merged last. waves.json updated; no new contract (M5 Open decision 1).
- 2026-10-16T23:35Z · STORY-004-05 · approach — edits outside the C10 anchors where M4 reserved them (N1 import after line 23, N6 first line of `renderSearch`, N7 `missesUsage` at file end); `--misses --since` reuses 004-04's `sinceBound`; additive exports `listMisses(paths, bound)`, `renderMisses(data)`; `--misses` still loads the corpus; message texts and the R6 line format per M5 (M5 Open decision 2).
- 2026-10-16T23:35Z · STORY-003-09 · CR:spec-clarification — §4.1: QA-Red covers the last scenario in-process in `test/ingest/ingest-flow.red.node.test.ts`; the packed run is the Developer's `test/e2e/ingest.test.ts` (Goal check item 1's file). Approach: `pack.ts` builds into a staging dir (`tsc --outDir`), never the repo's `dist/`; check order not_initialised → usage → lock → unknown_source → R6 re-run → snapshot_missing → facts_changed → validation; the page diff ignores dot paths; `kind` = `normalizeKindId(facts.kind)`; `formatSize` B / KB / MB; additive `createIngestFinishCommand(2026-10-16T23:35:21Z)` (M5 Open decision 3).
- 2026-10-16T23:35Z · STORY-006-06 · CR:spec-clarification — §3.1 gains `test/templates/structure.ts` (shared checker) and `templates/index.md` (the SPRINT-01 placeholder becomes `buildIndex([])`'s text, else R8 fails on the merged tree). Scan rules per M5 (JSON scanned like code spans; trailing punctuation trimmed from paths; flags up to the next `wikeeper`; five section-reference forms, "last named protocol file"; headings outside fences; strip `listTemplateFiles("")`'s leading slash) (M5 Open decision 4).
- 2026-10-17T07:30Z · M6 · scope (human-approved walkthrough fixes, Goal check item 4 rows 8.2/8.3/8.4/8.11) — one fix unit `story/walkthrough-fixes` from `sprint/S-02`; QA-Red adds three red files; no existing red file changes.
- 2026-10-17T07:30Z · STORY-003-09 · CR review-feedback — R10: `finish` refuses `frontmatter_yaml`/`frontmatter_field` errors on created/updated pages (`validation_failed`, `details.invalid: [{ path, message }]`, lock kept); `IngestValidation.invalid` is additive (§3.3).
- 2026-10-17T07:30Z · STORY-003-08 · CR review-feedback — R4: `apply` prints only the brief's `ingest` line (`buildBrief` body; `data.brief` stays a string).
- 2026-10-17T07:30Z · STORY-006-04, STORY-006-05 · CR review-feedback + UR:bug — WIKI.md W1–W8 and wiki-writer T1–T3, skill S1: file-edit tools only, nothing after `finish`, brief written into the writer's task, `--status` as built. Writer text stays one shared text (006-05 R6).
