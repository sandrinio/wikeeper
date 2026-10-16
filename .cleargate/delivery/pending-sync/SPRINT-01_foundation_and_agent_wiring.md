---
sprint_id: SPRINT-01
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
lifecycle_init_mode: warn
remote_id: null
source_tool: null
status: Active
start_date: 2026-10-16
end_date: null
synced_at: null
created_at: 2026-10-16T13:40:00Z
updated_at: 2026-10-16T14:12:48Z
created_at_version: strategy-phase-pre-init
updated_at_version: 8f1132e-dirty
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:52:33Z
  transition: ready-for-execution
epics:
  - EPIC-001
  - EPIC-002
proposals: []
context_source: Decomposes EPIC-001 (STORY-001-01…07) and EPIC-002 (STORY-002-01…06), both approved 2026-10-16 under INITIATIVE-001.
stamp_error: no ledger rows for work_item_id SPRINT-01
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:53:02Z
  sessions: []
---

# SPRINT-01: Foundation and agent wiring

## 0. Stakeholder Brief

- **Sprint Goal:** `npx wikeeper init` installs a working `.wiki/` and wires it into Claude Code, Codex and Antigravity; `update`, `remove` and `doctor` manage it safely.
- **Business Outcome:** wikeeper becomes installable for real: one command sets up the wiki, the agent instruction block, skills and sub-agent definitions, with an opt-in write guard. Instruction text is placeholder until EPIC-006.
- **Risks (top 3):** `src/program.ts` touched by most stories; hook payload formats for Codex and Antigravity unverified; merging into users' settings files.
- **Metrics:** second `init` changes 0 bytes; `update` / `remove` change 0 user-owned files; CI green on Linux, macOS and Windows; release `0.1.0` cut from the sprint result.

## Sprint Goal

Make `npx wikeeper init` produce a safe, idempotent install that every supported agent picks up, with lifecycle commands that never touch the user's knowledge.

## 1. Consolidated Deliverables

| Story ID | Title | Lane | Milestone | Parallel? | Bounce Exposure |
|---|---|---|---|---|---|
| `STORY-001-01` | CLI core — command registry, `--json` output and exit codes | standard | M1 | y | med |
| `STORY-001-02` | Config schema and path resolution | standard | M1 | y | med |
| `STORY-001-03` | Ownership manifest and template loader | standard | M1 | y | low |
| `STORY-002-01` | Block injection engine | standard | M1 | y | low |
| `STORY-001-04` | `wikeeper init` | standard | M2 | n | med |
| `STORY-002-02` | Agent detection and target files | standard | M2 | y | med |
| `STORY-002-03` | Install skills and sub-agent definitions | standard | M2 | y | med |
| `STORY-002-05` | `wikeeper hook guard` command | standard | M2 | y | med |
| `STORY-001-05` | `wikeeper update` | standard | M3 | n | low |
| `STORY-001-06` | `wikeeper remove` and `--purge` | standard | M3 | n | med |
| `STORY-001-07` | `wikeeper doctor` and setup state | standard | M3 | n | low |
| `STORY-002-04` | Integration wiring and doctor checks | standard | M4 | n | med |
| `STORY-002-06` | `--enforce` — hooks and permission rules in agent settings | standard | M4 | n | med |

Milestones follow the dependency chain: M1 has no predecessors; M2 needs M1 (`init` needs config, manifest and CLI core); M3 needs `init`; M4 needs every lifecycle command plus 002-01…03 and 002-05, and 002-06 follows 002-04.

## 2. Execution Strategy

_Written by the Architect during Sprint Design Review, before Gate 2._

Wave plan: `.cleargate/sprint-runs/SPRINT-01/plans/waves.json` (schema_version 2).

### 2.1 Phase Plan

N = 13: reader/synth fan-out, contract-first. Contract branches are `contract/S-01-<slug>`; a story that needs code not yet written is cut from a contract instead of `sprint/S-01`.

- **Build set:** all 13 stories build in parallel once their base contract exists. None refused, none empty, no DB writes.
- **Serial merges:** the six `parallel_eligible: n` stories (001-04, 001-05, 001-06, 001-07, 002-04, 002-06) each merge in their own trailing wave, in dependency order.

**Contracts.** Stacked; one Developer skeleton dispatch writes C1–C8 in order, one commit and one branch per contract.

| Contract | Branch | Base | Owner | Frozen exports | Consumers |
|---|---|---|---|---|---|
| C1 | `contract/S-01-cli-core` | `sprint/S-01` | 001-01 | `emitResult`, `emitError`, `ExitCode`, `WikeeperError`, `createProgram(commands = defaultCommands)`, `defaultCommands: Array<{ register(program: Command): void }> = []` | 001-04/05/06/07, 002-02/04/05 |
| C2 | `contract/S-01-config` | C1 | 001-02 | `loadConfig`, `setConfigValue`, `findRepoRoot`, `resolvePaths`, `toPosixRelative` | 001-04/07, 002-02/03/05/06 |
| C3 | `contract/S-01-manifest` | C2 | 001-03 | `findPackageRoot`, `templatesDir`, `listTemplateFiles`, `copyTemplate`, `writeManifest`, `readManifest`, `diffManifest`, `sha256File` | 001-04/05/06/07, 002-03/06 |
| C4 | `contract/S-01-init` | C3 | 001-04 | `registerIntegration({ name, init?, update?, remove?, doctor? })`, `runIntegrations(phase, { root, paths, config, options })`, `applyManagedBlock(text, entries)`, `GITIGNORE_BLOCK_START = '# >>> wikeeper >>>'`, `GITIGNORE_BLOCK_END = '# <<< wikeeper <<<'` | 001-05/06/07, 002-04 |
| C5 | `contract/S-01-inject` | C4 | 002-01 | `injectBlock`, `stripBlock`, `injectIntoFile`, `stripFromFile` | 002-04 |
| C6 | `contract/S-01-detect` | C5 | 002-02 | `detectAgentFiles`, `resolveTargets`, `resolveAgents`, `AGENT_FILE_READERS` | 002-04 |
| C7 | `contract/S-01-skills` | C6 | 002-03 | `mapModel`, `installSkills`, `installSubagents` | 002-04 |
| C8 | `contract/S-01-agents-index` | C7 | 002-04 | `agentsIntegration = { init, update, remove, doctor }` registered via `registerIntegration({ name: 'agents', ...agentsIntegration })`; empty `src/agents/doctor-checks.ts` | 002-06 |

Skeleton rules:
- A skeleton commit touches only the owner's frozen-export files — no tests, templates, `package.json` or lockfile.
- Bodies throw `contract stub Cn`, except: C1 `createProgram` keeps a working register loop (`src/cli.ts` and `test/program.test.ts` call it); C4 `registerIntegration` / `runIntegrations` are no-ops (they run at module load and in every lifecycle command).
- Owners keep frozen names and types and replace only the bodies.

| Story | Base | Upstream | Layer | Wave |
|---|---|---|---|---|
| 001-01 | C1 (own) | — | 0 | wave1 |
| 001-02 | `sprint/S-01` | — | 0 | wave1 |
| 001-03 | `sprint/S-01` | — | 0 | wave1 |
| 002-01 | `sprint/S-01` | — | 0 | wave1 |
| 002-02 | C2 | 001-01, 001-02 | 1 | wave2 |
| 002-03 | C3 | 001-01, 001-02, 001-03 | 1 | wave2 |
| 002-05 | C2 | 001-01, 001-02 | 1 | wave2 |
| 001-04 | C4 (own) | 001-01, 001-02, 001-03 | 1 | wave3 |
| 001-05 | C4 | 001-01…001-04 | 2 | wave4 |
| 001-06 | C4 | 001-01…001-04 | 2 | wave5 |
| 001-07 | C4 | 001-01…001-04 | 2 | wave6 |
| 002-04 | C8 (own) | 001-01…001-07, 002-01, 002-02, 002-03 | 3 | wave7 |
| 002-06 | C8 | 001-01…001-04, 002-01…002-05 | 4 | wave8 |

- **Upstream** = unmet dependencies ∪ earlier story in any real collision ∪ owner of every contract in the base stack.
- **Integration per story:** merge `sprint/S-01` into `story/<ID>`; on a skeleton-file conflict the owner's file wins and the consumer re-applies its lines; `npm ci` (`yaml` arrives with 001-02); full verification, then QA-Verify on the merged tree.
- Serial-dispatch hosts ignore contracts/bases and run the waves in order with upstream merged.

### 2.2 Merge Ordering (Shared-File Surface Analysis)

| Shared File | Stories | Order | Rationale |
|---|---|---|---|
| `src/program.ts` | 001-01, 002-05, 001-04, 001-05, 001-06, 001-07, 002-04 | 001-01 first, then wave order | 001-01 creates the `defaultCommands` registry and import region; every other story inserts only its own registration / `import './agents/index.js'` line, re-applied at integration. |
| `src/core/gitignore.ts` | 001-04, 001-06 | 001-04 → 001-06 | 001-06 adds `stripManagedBlock` to the file 001-04 creates and must use the same markers; 001-06 is cut from C4. |
| `src/agents/index.ts`, `src/agents/doctor-checks.ts` | 002-04, 002-06 | 002-04 → 002-06 | 002-06 wires `applyEnforce`/`removeEnforce` into 002-04's handlers and adds enforce checks; 002-06 is cut from C8. |
| `./package.json` | 001-02, 001-03 | any (wave1) | Not a real collision: 001-02 adds `yaml` to `dependencies`; 001-03 adds `"templates"` to `files`. |
| `./package-lock.json` | 001-02 | — | Only writer; worktrees use `npm ci`. |
| Contract skeleton files | owner + consumers | owner first | Owner's file wins at integration; consumers edit owner files only in the three ordered-edit rows above. |

### 2.3 Shared-Surface Warnings

- **`src/program.ts` (001-01 vs every registration story).** Keep the `defaultCommands` array and `register(program: Command): void` shape exactly as frozen in C1; a rename forces rework in six stories.
- **`src/core/gitignore.ts` (001-04 vs 001-06).** `stripManagedBlock` removes exactly what `applyManagedBlock` writes; both use the exported `GITIGNORE_BLOCK_START/END` constants (added to 001-04's exports by the SDR), never literal marker strings.
- **`src/agents/index.ts`, `doctor-checks.ts` (002-04 vs 002-06).** 002-06's calls into `init`/`remove`/`doctor` are re-applied on top of 002-04's real bodies at integration.
- **`registerIntegration` signature.** STORY-002-04 §3.2 originally passed `(name, object)`; corrected to the frozen single-object form `registerIntegration({ name: 'agents', ...agentsIntegration })`.
- **Stub behaviour.** Consumer tests that exercise a stubbed owner fail inside the build worktree until integration; QA-Verify runs on the merged tree. A red test broken only by a stub is re-scoped by QA-Red, not the Developer.
- **002-05 ↔ 002-06 command coupling (no shared file).** The hook entry written by `guard-command.ts` must match the `wikeeper hook guard` arguments 002-05 parses; checked at 002-06 integration.
- **Windows / line endings.** Branches cut before 001-01 merges lack `.gitattributes` and the Windows runner; re-verify at integration.
- **Unreachable-surface flags (BUG-046).** All 13 digests listed unreachable paths; git confirms each is untracked, not ignored, not in a nested repo and absent on disk — net-new files declared in prose in §3.1 "New Files Needed" (which `collision_surface.sh` does not parse), or created earlier in the sprint (001-06 cut from C4, 002-06 cut from C8). No story refused.
- **§1 drift fixed.** 001-05/06/07 `Parallel?` corrected to `n` to match story frontmatter.

### 2.4 Lane Audit

| Story | Lane | Rationale (≤80 chars) |
|---|---|---|
| — | — | No fast-lane stories; all 13 are `standard`. |

### 2.5 ADR-Conflict Flags

- **None against locked decisions** (`architecture.md` D-01…D-33): 002-01/002-04 follow D-11 (existing blocks never modified); 002-02 follows D-12/D-32 (creates `AGENTS.md`, never `CLAUDE.md`); 002-05 follows D-33 (guard fails open); 002-06 follows D-30 (`--enforce` opt-in, default no).
- **Proposed sections** (§4.1 ownership matrix, §6.3, §6.5, §6.6, §11) are implemented without departure.
- **Flashcards:** only `#cli #npm` publish cards — relevant to the `0.1.0` release step, not to any story.
- **In-sprint:** one contract conflict (`registerIntegration` signature), settled by frozen C4.

### Wave Assignment

| Wave | Stories | Parallel? | Rationale |
|---|---|---|---|
| wave1 | STORY-001-01, STORY-001-02, STORY-001-03, STORY-002-01 | Yes | Layer 0; no upstream; `package.json` edits on separate keys. |
| wave2 | STORY-002-02, STORY-002-03, STORY-002-05 | Yes | Layer 1; built from C2/C3; no collision among them. |
| wave3 | STORY-001-04 | No | `parallel_eligible: n`; built from C4. |
| wave4 | STORY-001-05 | No | `parallel_eligible: n`; upstream 001-04. |
| wave5 | STORY-001-06 | No | Ordered edit on `gitignore.ts` after 001-04. |
| wave6 | STORY-001-07 | No | `parallel_eligible: n`; upstream 001-04. |
| wave7 | STORY-002-04 | No | Upstream 001-04…001-07, 002-01…002-03; built from C8. |
| wave8 | STORY-002-06 | No | Ordered edit on `agents/index.ts`, `doctor-checks.ts` after 002-04. |


## 4. Execution Log

- 2026-10-16 · Preflight: 5/5 checks pass; devops subagent reachable. Sprint branch `sprint/S-01` cut; state initialised; Goal Acceptance Check confirmed by the human.
- 2026-10-16 · SDR: BUG-046 unreachable-surface refusal not applied — every flagged path verified net-new (untracked, not ignored, absent); `collision_surface.sh` does not parse prose "New Files Needed" cells.
- 2026-10-16 · Config: `gates.typecheck/test/precommit` added to `.cleargate/config.yml` (gate commands were unconfigured and reported a silent pass).
- 2026-10-16 · M1 plan: additive exports accepted (`runCli`, `getOutputContext`, `CommandModule`, `CliIO`, `OutputContext`, `DEFAULT_CONFIG`, `ResolvedPaths.lockFile`, `injectIntoFile().created`); C1 skeleton ships working minimal output/CLI bodies instead of throwing, so command stories' tests run before 001-01 merges.
- 2026-10-16 · CR:spec-clarification (hook research, `plans/hook-protocols-research.md`): STORY-002-03 (Antigravity `mainAgent: false`), STORY-002-05 (NotebookEdit; Codex `tool_input.command`; Antigravity payload/`TargetFile`/third write tool/allow JSON; shell-applied Codex patches = accepted gap), STORY-002-06 (matchers, Antigravity hooks.json shape, extra rule forms, R5 command form, `antigravity-trust` note). No new scope.
- 2026-10-16 · Wave 1 merged: STORY-001-01 (0178008), STORY-001-02 (382f0cc, Architect post-flight PASS on planned `yaml` dep), STORY-002-01 (328e3ec), STORY-001-03 (4f87a42). 132 tests green.
- 2026-10-16 · STORY-001-03 Developer BLOCKED (spec-contradiction): a red test wrote `b.md` and `B.md` in one dir (impossible on case-insensitive FS). Routed back to QA-Red (red-test fix 0b8106f); no counter incremented.
- 2026-10-16 · FLASHCARD-REJECT 2026-10-16 — two STORY-001-03 cards on case-differing filenames — reason: duplicate of the active #test-harness #windows #macos card.
- 2026-10-16 · Orchestration deviations: sprint runtime files, agent reports and pre-gate scan output gitignored (readiness check needs a clean tree; reports committed with -f at close); orchestrator housekeeping (flashcards, sprint-context, this log, plans) committed as `chore(sprint)` commits on sprint/S-01; vitest in the main checkout runs with `--dir test` (`.worktrees/` holds other stories' tests).
- 2026-10-16 · Contract restack: C1–C3 and C5 obsolete after wave 1; C2b `contract/S-01-agent-names` (complete `src/agents/agent-names.ts`, owner 002-02) → C4 → C6 → C7 → C8 stacked on sprint/S-01 (recorded in waves.json `restack_2026_10_16`).
- 2026-10-16 · M2 plan decisions accepted: agent-names module; `init` rolls back what it created when a handler exits 5/1 (002-02 R6 / 002-03 R6 "nothing is created"); Goal Acceptance Check item 1 runs `init --json --agents claude,codex,antigravity`; init exits 1 on invalid config; `.agents/skills` installed whenever any agent is configured (R1/R2).
- 2026-10-16 · Wave 2 segments: STORY-002-02, 002-03, 002-05, 001-04 GREEN (0 bounces); STORY-001-05, 001-06, 001-07 BUILT (build-only against C4 stubs). Exports of 002-02/002-03 checked against C6/C7 skeletons: names and types identical.
- 2026-10-16 · Wave 2 merged: STORY-002-02 (c117136), STORY-002-03 (1434121), STORY-002-05 (4acaf4b), STORY-001-04 (aa8af60; src/program.ts "keep both lines" conflict resolved by DevOps under orchestrator authorisation per M1 risk 9). 244 tests green.
- 2026-10-16 · FLASHCARD-REJECT 2026-10-16 — four wave-2 cards (dynamic import()/load() helper ×2, frozen-constant red test passes at baseline, `as never` on CliIO) — reason: duplicates of active #qa #test-harness and #qa #contract cards, or a local workaround rather than a lesson.
- 2026-10-16 · M4 plan decisions accepted: (1) C8 is cut from sprint/S-01 after STORY-001-07 merges and STORY-002-06 is cut from sprint/S-01 after STORY-002-04 merges (M4 serial; supersedes the C7→C8 stack in waves.json `restack_2026_10_16`); (2) guard command order follows the 2026-10-16 spec clarification — bare `wikeeper` when on PATH (ignoring `node_modules/.bin` entries npx injects), else the repo-relative `node_modules/.bin` form, else pinned `npx -y wikeeper@<version>`; (3) STORY-002-04 adds `test/e2e/goal.test.ts`, which runs Goal Acceptance Check items 1–4 against the packed tarball (item 5 = the same test in the 3-OS CI matrix); (4) not built this sprint: doctor suggesting a dev dependency when only npx is available (002-06 §1.5 mitigation, not an R-item).
- 2026-10-16 · STORY-001-05/06/07 integration: an `integrate` mode was added to the wave workflow (merge sprint/S-01 into the story branch, re-run the full suite, fix own code only, then QA-Verify and post-flight as usual). Raw U+FEFF characters found in src/agents/inject.ts and src/core/config.ts (wave 1) and src/core/gitignore.ts (001-04) — queued for D.5 consolidation (escape as \uFEFF).
- 2026-10-16 · Integration round (w3i): STORY-001-05 GREEN (4b41691), STORY-001-06 GREEN after 1 arch bounce (18d1107 — Architect post-flight R1: private `isInside` copy replaced by the shared export from hook-protocols.ts), STORY-001-07 GREEN (1625251, Architect post-flight PASS; the red-modified flag was a scanner false positive). Red tests verified byte-identical to their QA-Red commits.
- 2026-10-16 · Known limitation (STORY-001-06 probe): `init` → `remove` on a `.gitignore` with user lines and no final newline leaves one added trailing newline (applyManagedBlock adds a separator; strip cannot tell). Goal fixtures are unaffected; surfaced to the human at walkthrough as a follow-up bug candidate.
- 2026-10-16 · Queued for D.5 consolidation: STORY-001-05 update.ts keeps a private `isInside` (same rule as 001-06 R1); one shared package-version reader instead of private copies in init/update/doctor; raw U+FEFF characters → \uFEFF escapes.
- 2026-10-16 · FLASHCARD-REJECT 2026-10-16 — duplicate scanner false-positive card (001-07) and the readPackageVersion card (a refactor task, moved to the D.5 list).
- 2026-10-16 · EPIC-001 merged: STORY-001-05 (bd9c5f1), STORY-001-06 (afa2416), STORY-001-07 (728d1ac); src/program.ts "keep both lines" conflicts resolved by DevOps under orchestrator authorisation. 294 tests green; `--help` lists init, update, remove, doctor, setup, hook. Next: STORY-002-04 (wave 7) cut from sprint/S-01.
- 2026-10-16 · STORY-002-04 GREEN (65f333b, 0 bounces; 338 tests incl. test/e2e/goal.test.ts — Goal Acceptance Check items 1–4 from the packed tarball on the 3 fixtures). Accepted plan deviation: the agents integration registers via `ensureAgentsIntegration()` called by `runCli` for the default program (duplicate-safe), not as an import-time side effect of src/agents/index.ts — two immutable red tests conflict with import-time registration; start-up behaviour per R1 is unchanged. C8 exports and the five INSERTION POINT anchors are present verbatim.
- 2026-10-16 · FLASHCARD-REJECT 2026-10-16 — 002-04 card on re-registering in beforeEach — reason: superseded by the runCli-registration card.
- 2026-10-16 · STORY-002-04 merged (6750c4a). 338 tests green; smoke: `init --json --agents claude,codex,antigravity` and `doctor --json` exit 0 in a fresh repo. Next: STORY-002-06 (wave 8) cut from sprint/S-01.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `src/program.ts` and `./package.json` are touched by most stories (command registration, dependencies). | Architect freezes the registration pattern in STORY-001-01 as a contract; later stories add one line each and merge in milestone order. |
| Codex and Antigravity hook payloads and rule-file formats are unverified (STORY-002-05, 002-06). | Architect verifies against official docs during the milestone plan; fixtures are captured from the docs; unreadable payloads follow the fail-open decision. |
| `--enforce` merges into users' own settings files. | Opt-in, `.bak` before the first change, refuse unparseable files, tagged entries removed exactly on `remove`. |
| Windows CI (symlinks, CRLF, paths) is new. | `.gitattributes` forces LF; symlink → copy fallback; `node:path` everywhere; Windows runner in CI from STORY-001-01. |
| Instruction and skill text is placeholder until EPIC-006. | Sprint outcome is the install mechanism; content lands in SPRINT-02 with EPIC-003. |

## Metrics & Metadata

- **Expected Impact:** first functional release (`0.1.0`): installable, idempotent, reversible.
- **Priority Alignment:** EPIC-001 first (everything builds on it); EPIC-002 alongside so `init` delivers the agent wiring. EPIC-003 + EPIC-006 follow in SPRINT-02, EPIC-004 + EPIC-005 in SPRINT-03.

---

## Execution Guidelines (Local Annotation — Not Pushed)

- **Starting Point:** M1 in parallel — STORY-001-01 freezes the command-registration and output contract the rest depend on.
- **Relevant Context:** `architecture.md` §4 (layout, ownership matrix), §6 (agent matrix), §11 (config); EPIC-001 and EPIC-002.
- **Constraints:** no network, no LLM calls; Node ≥ 22.12; every command `--json`; never modify user-owned files or text outside WIKI markers.
