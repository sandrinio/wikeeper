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

## Mid-Sprint Amendments

_(populated by Architect on CR:scope-change or CR:approach-change; never rewrite, only append. Format: '<ISO-ts> · <ID> · <one-line note>')_

- 2026-10-16T21:18Z · STORY-006-02 · CR:spec-clarification — R12 and the "remove keeps project.md" scenario: `data.kept` contains `.wiki/me.md` and `.wiki/project.md` and stays sorted by code unit (was "right after"; `remove` sorts `kept`, and `.wiki/pages` sorts between them).
- 2026-10-16T21:18Z · STORY-006-01, STORY-006-02 · test-fixture detail — Gherkin setups "`init --yes` in an empty repository" pass `--agents claude` (without it `init` exits 5 before writing). Not a spec gap.
- 2026-10-16T21:18Z · STORY-004-01 · approach — keep yaml's default `prettyErrors` (`prettyErrors: false` sets no `linePos`); line numbers come from `linePos[0].line`.
- 2026-10-16T21:18Z · C10 · approach — the search command skeleton carries a third set of insertion-point anchors where the search request is built.
- 2026-10-16T21:18Z · contracts · the skeleton dispatch is split: C1–C4 and C10 now (M1 plan); C5–C9, C11, C12 with the M2 plan, before wave 3.
- 2026-10-16T21:36Z · STORY-003-03 · CR:spec-clarification — the "hook that runs too long" scenario uses `timeoutMs 1200` (was 300: a node child's cold start under full-suite load misses 300 ms); the "returns within 2 s" bound is unchanged.
- 2026-10-16T21:36Z · C14 · `contract/S-02-init-prepare` cut at 37f497d (STORY-001-08's Developer commit, QA PASS, unchanged at merge).
