---
sprint_id: "SPRINT-03"
created_at: "2026-10-17T12:26:32.485Z"
last_updated: "2026-10-17T12:40:00.000Z"
---

# Sprint Context

Per-sprint audit artefact. Populated at sprint init (M1 planning) and re-touched after each story merges. Referenced from every Developer/QA/Architect task brief so all agents start from the same baseline.

## Sprint Goal

An agent keeps the wiki healthy and complete and uses it without being told: `wikeeper lint` and `lint --rules` find page and rule problems, `wikeeper status` shows open work, re-ingest candidates and pending rule suggestions, rule decisions are remembered, `wikeeper read` turns web pages, DOCX, PDF and CSV files into text the agent can ingest, and in a fresh session the agent searches the wiki before answering and offers to capture new decisions.

## Goal Acceptance Check

Confirmed by the human on 2026-10-17 together with the sprint plan ("confirmed. start the sprint"). The goal is met when both hold on the merged `sprint/S-03` tree:

1. Mechanical: `npm run typecheck`, `npm test` (`test/e2e` included) and `npm run test:perf` pass; `wikeeper --version` prints `0.3.0` with the build stamp; STORY-006-11's coverage check passes, so every EPIC-005 lint check id has a fixture that triggers it and one that passes; the `read` tests convert the HTML, DOCX, PDF and CSV fixtures.
2. Behavioural (walkthrough part 3): run as a real user in `~/walkthrough-wiki`, a fresh session per task, plain product-management requests that never name wikeeper or WIKI.md, some permission prompts declined; the orchestrator keeps `wikeeper-test-notes-sprint-03.md`. No ❌ in the notes. The agent, unprompted: searches the wiki before answering a project question or drafting material; offers to capture a decision or date mentioned in passing; reads a web page, a DOCX and a PDF with `read` and ingests them; checks `status` / `lint` and acts on what they report; handles a declined permission prompt without leaving a half-finished ingest.

## Locked Versions

Frozen dependency versions for this sprint. Orchestrator populates from `package.json` snapshots at sprint init; Developers must not upgrade these mid-sprint without an explicit CR.

| Package | Version |
|---------|---------|
| Node    | `>=22.12.0` (CI: ubuntu, macos, windows × 22, 24) |
| TypeScript | `^7.0.2` |
| vitest | `^5.0.5` |
| commander | `^15.0.0` |
| yaml | `^2.9.1` |
| minisearch | `^7.2.0` |
| @types/node | `^22.20.5` |
| linkedom, defuddle, turndown | `^0.18.13`, `^0.19.5`, `^7.2.4` — added by STORY-003-10 (approved; [[SPIKE-001]]) |
| mammoth, unpdf, @joplin/turndown-plugin-gfm | `^1.13.0`, `^1.9.0`, `^1.0.68` — added by STORY-003-11 (approved) |
| package version | `0.3.0` (STORY-001-10); npm publish is a separate step after Gate 4 |

## Test Stack

| Field | Value |
|-------|-------|
| Backend runner    | `npm test` (vitest run; excludes `*-perf.red.node.test.ts`) · perf: `npm run test:perf` |
| Frontend runner   | _(none — single-stack CLI)_ |
| Typecheck command | `npm run typecheck` (tsc --noEmit) |
| Red-test naming   | `test/**/*.red.node.test.ts` (immutable after QA-Red) |

## Cross-Cutting Rules

1. No LLM calls in the CLI. Only `wikeeper read` uses the network (20 s timeout, 10 MB cap); tests never use the internet (local HTTP server, fixture files). Each `read` library is loaded only when its format is read. Node ≥ 22.12, ESM, TypeScript.
2. Every command supports `--json`, uses `emitResult` / `emitError` and the existing `ExitCode` values (0 ok, 1 error, 2 usage, 3 needs_approval, 4 denied, 5 needs_input). A command never adds a local `--json`.
3. Windows, macOS and Linux: `node:path` everywhere, no case-differing file names, LF line endings, no `:` in file names. Lint finding paths are repo-relative POSIX.
4. Package-owned vs user-owned files follow architecture.md §4.1; never modify user-owned files or text outside WIKI markers. Exception approved at Gate 1 (decision 23, STORY-002-11): `update` replaces a pointer block that is byte-for-byte a shipped block; an edited block is left alone with a warning (exit code unchanged); a deleted block is never recreated. The pointer block stays ≤ 14 lines.
5. Contract-first build: frozen exports in `plans/waves.json` `contracts[]` are never renamed or retyped; owners replace bodies only. Built-on-stub stories re-sync on `sprint/S-03` after their upstream merges and re-run the full suite before QA-Verify.
6. Red tests are re-scoped by QA-Red only, never by the Developer (Gate 1 decision 21; table in STORY-006-11 R6). `init --yes` with no agents exits 5: fixtures that need agent files pass `--agents <name>`.
7. Path and id lists in `--json` output are sorted by code unit (`compareCodeUnits`); never assert "X right after Y" in a sorted list.
8. Instruction text (WIKI.md, SETUP.md, skills, sub-agent prompts, pointer block) names only commands, options and output fields that exist on the merged tree; the wiki-writer text stays identical across the three agents; Codex TOML prompts contain no `\`, no `"""` and no `{{model}}`.
9. Gate 1 decisions 1–26 in `plans/gate1-decisions.md` are binding; a story's `- **Decision:**` lines quote them.

## Active FLASHCARD Tags

Agents: grep `.cleargate/FLASHCARD.md` for each tag before starting work.

- `#contract #merge`, `#git #merge`, `#e2e #test-harness`, `#test-harness #perf` — contract re-sync, `src/program.ts` append conflicts, e2e builds into a temp stage, the load-sensitive search p95 test.
- `#enforce #test-harness`, `#manifest`, `#kind-rules #templates`, `#templates #subagents`, `#codex #toml #templates`, `#walkthrough #templates`, `#test-harness #integrations` — SPRINT-02 lessons the SDR cites (§2.3, §2.5).

## Adjacent Implementations (Reuse First)

Exported helpers and modules from merged work. Rows carried from SPRINT-01/02 (the code wins on any conflict); the Architect appends SPRINT-03 rows as stories merge. Developers check here before writing new helpers — if the module already exists, import it; duplication is a kick-back criterion.

| Story | Module / Export | Path |
|-------|----------------|------|
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
