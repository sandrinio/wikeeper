---
sprint_id: SPRINT-01
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
lifecycle_init_mode: warn
remote_id: null
source_tool: null
status: Draft
start_date: null
end_date: null
synced_at: null
created_at: 2026-10-16T13:40:00Z
updated_at: 2026-10-16T13:40:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
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
