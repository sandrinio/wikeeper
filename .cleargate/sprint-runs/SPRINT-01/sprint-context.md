---
sprint_id: "SPRINT-01"
created_at: "2026-10-16T14:12:24.211Z"
last_updated: "2026-10-16T14:12:24.211Z"
---

# Sprint Context

Per-sprint audit artefact. Populated at sprint init (M1 planning) and re-touched after each story merges. Referenced from every Developer/QA/Architect task brief so all agents start from the same baseline.

## Sprint Goal

`npx wikeeper init` installs a working `.wiki/` and wires it into Claude Code, Codex and Antigravity; `update`, `remove` and `doctor` manage it safely.

## Goal Acceptance Check

Confirmed by the human on 2026-10-16 together with the sprint plan. The goal is met when all five hold on `sprint/S-01`:

1. From the packed package (`npm pack` → install the tarball), in three fixture repos — empty, existing `AGENTS.md` with user content, existing `CLAUDE.md` — `wikeeper init --json --agents claude,codex,antigravity` exits 0 (non-interactive runs need an explicit agent list — STORY-002-02 R6; clarified 2026-10-16 from the M2 plan) and produces the architecture.md §6.3 file set: `.wiki/`, the WIKI block, skills and sub-agents for Claude Code, Codex and Antigravity. No byte outside the WIKI markers changes; no `CLAUDE.md` is created.
2. A second `init` changes 0 bytes.
3. `update` and `remove` change 0 user-owned files; after `remove`, no wikeeper-owned file or block remains.
4. `doctor --json` exits 0 after `init` and reports the problem after a WIKI block is deleted.
5. CI passes on Linux, macOS and Windows.

## Locked Versions

Frozen dependency versions for this sprint. Orchestrator populates from `package.json` snapshots at sprint init; Developers must not upgrade these mid-sprint without an explicit CR.

| Package | Version |
|---------|---------|
| Node    | `>=22.12.0` (CI: 22, 24) |
| TypeScript | `^7.0.2` |
| vitest | `^5.0.5` |
| commander | `^15.0.0` |
| @types/node | `^22.20.5` |
| yaml | added by STORY-001-02 (only new runtime dependency this sprint) |

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

1. No LLM calls and no network calls in the CLI. Node ≥ 22.12, ESM, TypeScript; `node:path` everywhere (Windows CI).
2. Package-owned vs user-owned files follow architecture.md §4.1; the manifest is the single source of truth for what the package owns. Never modify user-owned files or text outside WIKI markers.
3. Every command supports `--json` and returns a stable exit code: 0 ok, 1 error, 2 usage, 3 needs_approval, 4 denied, 5 needs_input.
4. Agent wiring is called only through the `registerIntegration` / `runIntegrations` hook point (frozen form: single object `{ name, init?, update?, remove?, doctor? }`).
5. An agent file whose WIKI markers already exist is never modified (D-11). The block goes at the top, after frontmatter; line endings and BOM preserved. `init` never creates `CLAUDE.md` (D-32).
6. If no agent file exists, create `AGENTS.md` and ask which others to add (D-12); non-interactive runs exit 5.
7. Settings-file merges keep every user key and write a `.bak` first; `--enforce` is opt-in, default no (D-30). The hook guard fails open with a warning (D-33).
8. Instruction, skill and sub-agent text is placeholder; EPIC-006 supplies the real text next sprint.
9. Contract-first build: frozen exports in `waves.json` `contracts[]` are never renamed or retyped; owners replace bodies only.

## Active FLASHCARD Tags

FLASHCARD tags that appear in any story's `<agent_context>` for this sprint. Auto-populated by grepping `.cleargate/FLASHCARD.md` at sprint init. Agents: grep the flashcard file for each tag listed here before starting work.

- `#cli #npm` — publish gotchas (staged `0.0.0-stage` placeholder, EOTP in non-TTY, name-similarity rule). Relevant to the 0.1.0 release only.

## Adjacent Implementations (Reuse First)

Exported helpers and modules from already-merged stories in this sprint. The Architect updates this section after each story merges. Developers check here before writing new helpers — if the module already exists, import it; duplication is a kick-back criterion.

| Story | Module / Export | Path |
|-------|----------------|------|
| STORY-001-01 | `ExitCode`, `WikeeperError` | `src/core/exit-codes.ts` |
| STORY-001-01 | `emitResult`, `emitError`, `getOutputContext`, `bindProgramIO`, `defaultIO`, `getRequestedExitCode`, `OutputContext`, `CliIO` | `src/core/output.ts` |
| STORY-001-01 | `createProgram`, `defaultCommands`, `CommandModule`, `runCli`, `VERSION` | `src/program.ts` |
| STORY-001-02 | `loadConfig`, `setConfigValue`, `DEFAULT_CONFIG`, `WikeeperConfig`, `formatConfigIssue` | `src/core/config.ts` |
| STORY-001-02 | `findRepoRoot`, `resolvePaths`, `toPosixRelative`, `ResolvedPaths`; since D.5: `isInside`, `fromPosixRelative` | `src/core/paths.ts` |
| D.5 consolidation | `compareCodeUnits` (the one string comparator) | `src/core/compare.ts` |
| D.5 consolidation | `readPackageVersion` (the one package.json version reader) | `src/core/templates.ts` |
| STORY-001-03 | `findPackageRoot`, `templatesDir`, `listTemplateFiles`, `copyTemplate` (optional `baseDir`) | `src/core/templates.ts` |
| STORY-001-03 | `readManifest`, `writeManifest`, `diffManifest`, `sha256File`, `serializeManifest`, `Manifest`, `ManifestEntry`, `ManifestKind` | `src/core/manifest.ts` |
| STORY-002-01 | `injectBlock`, `stripBlock`, `injectIntoFile`, `stripFromFile` | `src/agents/inject.ts` |
| STORY-002-02 | `AGENT_NAMES`, `AgentName`, `isAgentName` | `src/agents/agent-names.ts` |
| STORY-002-02 | `detectAgentFiles`, `readersOf`, `resolveTargets`, `parseAgentList`, `resolveAgents`, `needsInputError`, `AGENT_FILES`, `AgentFile`, `AgentTarget` | `src/agents/detect.ts` |
| STORY-002-02 | `createLineReader` (one per stdin — never two), `LineReader`, `parseAgentSelection`, `createAskAgents` | `src/agents/ask-agents.ts` |
| STORY-002-03 | `mapModel`, `MODEL_TIERS`, `TIER_MODELS` | `src/agents/model-tiers.ts` |
| STORY-002-03 | `installSkills`, `skillConflicts`, `upsertManifestEntry` (drops every entry with the same path), `SHARED_AGENT`, `SHARED_SKILLS_DIR`, `CLAUDE_SKILLS_DIR`, `InstallResult` | `src/agents/skills.ts` |
| STORY-002-03 | `installAgentAssets`, `installSubagents`, `subagentConflicts`, `renderModelLine`, `SUBAGENT_NAMES`, `SUBAGENT_TARGETS` | `src/agents/subagents.ts` |
| STORY-002-05 | `HOOK_ADAPTERS`, `parsePatchPaths`, `resolveTarget`, `isInside` (re-export of `src/core/paths.ts` since D.5 — reuse, never re-implement), `failOpen`, `GUARD_REASON` | `src/agents/hook-protocols.ts` |
| STORY-002-05 | `hookCommand`, `runGuard`, `readPayload` | `src/commands/hook.ts` |
| STORY-001-04 | `initCommand`, `createInitCommand`, `runInit`, `PROFILES` | `src/commands/init.ts` |
| STORY-001-04 | `applyManagedBlock`, `managedIgnoreEntries`, `GITIGNORE_BLOCK_START`, `GITIGNORE_BLOCK_END` | `src/core/gitignore.ts` |
| STORY-001-04 | `registerIntegration`, `runIntegrations`, `resetIntegrations`, `IntegrationContext`, `PhaseReport`, `DoctorCheck` | `src/core/integrations.ts` |
| STORY-001-05 | `updateCommand`, `createUpdateCommand({ templatesDir })` (test seam for "newer package"), `runUpdate`, `formatBackupStamp` | `src/commands/update.ts` |
| STORY-001-06 | `removeCommand`, `CONFIRM_WORD`; `stripManagedBlock`, `GitignoreStripStatus` | `src/commands/remove.ts`, `src/core/gitignore.ts` |
| STORY-001-07 | `doctorCommand`, `createDoctorCommand`, `runDoctor`, `compareVersions`, `checkNodeVersion`; `setupCommand` | `src/commands/doctor.ts`, `src/commands/setup.ts` |
| STORY-002-04 | `agentsIntegration`, `ensureAgentsIntegration` (runCli registers it), `AGENTS_EXTENSIONS`, `AgentsExtension`, `AgentsState`, `PromptLines` | `src/agents/index.ts` |
| STORY-002-04 | `AGENT_CHECK_IDS`, `AGENT_CHECKS`, `AgentCheckInput`, `readBlockSignature`, `checkAgentBlocks`, `checkClaudeAgentsMdOnly`, `checkSkillLinks`, `checkCodexTrust` | `src/agents/doctor-checks.ts` |
| STORY-002-06 | `enforceExtension`, `resolveEnforce`, `askYesNo`, `applyEnforce`, `removeEnforce`, `ENFORCE_QUESTION` | `src/agents/enforce/index.ts` |
| STORY-002-06 | `loadJsonDoc`, `saveJsonDoc`, `mergeJsonFile`, `upsertArrayItem`, `removeArrayItems`, `pruneEmptyPath`, `settingsError` (strict JSON merge, `.bak`, format-preserving) | `src/agents/enforce/json-merge.ts` |
| STORY-002-06 | `resolveGuardForm`, `guardCommand`; `snapshotForRollback` (agent-side init rollback) | `src/agents/enforce/guard-command.ts`, `src/agents/rollback.ts` |

## Mid-Sprint Amendments

_(populated by Architect on CR:scope-change or CR:approach-change; never rewrite, only append. Format: '<ISO-ts> · <ID> · <one-line note>')_
2026-10-17T00:00:00Z · CR-001 · CR:approach-change from the walkthrough: `ai` mode auto-allows only `wikeeper ingest …` and `npx wikeeper ingest …`; every other wikeeper command goes through the harness's normal permission handling (human, 2026-10-16).
2026-10-17T00:00:00Z · BUG-001 · walkthrough UR:bug: `applyManagedBlock` inserts a new block at the top of a non-empty file that has no final line break, so `remove` restores the exact bytes (STORY-001-06 R2).
2026-10-17T00:00:00Z · BUG-002 · walkthrough UR:bug: no `.bak` for a settings file wikeeper created; `removeEnforce` deletes the recorded `.bak` when it deletes or restores the file (STORY-002-06 R7, Goal Acceptance Check item 3).
