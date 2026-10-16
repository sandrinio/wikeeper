---
story_id: STORY-001-04
parent_epic_ref: EPIC-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-001 (approved 2026-10-16) · architecture.md v0.4 · verified src/program.ts
actor: Developer installing wikeeper in a repo
complexity_label: L3
parallel_eligible: n
dep_predecessors: ["STORY-001-01", "STORY-001-02", "STORY-001-03"]
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T13:30:00Z
updated_at: 2026-10-16T13:30:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:30:08Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-001-04
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:28:49Z
  sessions: []
---

# STORY-001-04: `wikeeper init`
**Complexity:** L3 — cross-cutting: uses config, paths, manifest, templates and output; introduces the integration hook point and the managed `.gitignore` block. Depends on STORY-001-01, 001-02 and 001-03.

## 1. The Spec (The Contract)

### 1.1 User Story
As a developer installing wikeeper in a repo, I want one command that sets up the wiki folder safely and can be re-run at any time, so that my agent has everything it needs and nothing I already wrote is ever overwritten.

### 1.2 Detailed Requirements
- **R1 — Command.** `wikeeper init [--profile <name>] [--agents <list>] [--yes]` is registered in the command registry. `--profile` defaults to `management`; any other value is a usage error (exit 2) listing the available profiles, and nothing is written.
- **R2 — Layout.** Creates `.wiki/system/` (every file under `templates/system/`), `.wiki/config.yml`, `.wiki/kb_instructions.md`, and under the content directory `raw/`, `pages/`, `log/` (each with `.gitkeep`) and `index.md`. `content_dir` from an existing `config.yml` is honoured.
- **R3 — Seeding user-owned files.** `config.yml` (profile, agents), `kb_instructions.md` (from `templates/kb_instructions.management.md`) and `index.md` (from `templates/index.md`) are written only if missing; existing ones are never modified.
- **R4 — Manifest.** `.wiki/system/manifest.json` lists every package-owned file with sha256 and kind `system`.
- **R5 — `.gitignore`.** `src/core/gitignore.ts` writes a managed block between `# >>> wikeeper >>>` and `# <<< wikeeper <<<` containing `me.md`, the generated `log.md`, every `private` page, `.lock`, `.snapshots/` and `.cache/`, with paths adjusted for `content_dir`. An existing block is replaced in place; text outside it is preserved byte-for-byte; a missing `.gitignore` is created.
- **R6 — Integration hook point.** `src/core/integrations.ts` exposes `registerIntegration({ name, init?, update?, remove?, doctor? })` and `runIntegrations(phase, ctx)`. `init` runs every registered `init` handler once after scaffolding, with `{ root, paths, config, options }`. The default registry is empty (EPIC-002 registers into it).
- **R7 — Idempotent.** A second `init` on the same tree changes zero bytes (manifest and `.gitignore` included).
- **R8 — Output.** Human summary; `--json` returns `{ created: [...], skipped: [...], manifest }` with posix paths relative to the root.

### 1.3 Out of Scope
- Agent wiring, interactive agent selection and the `--enforce` question (EPIC-002 integration handlers).
- Real template content (EPIC-006).
- `me.md` creation (written by the agent during setup, EPIC-006).

### 1.4 Open Questions

- None — decisions recorded in architecture.md and EPIC-001.

### 1.5 Risks

- **Risk:** Non-deterministic output (timestamps, map ordering) breaks idempotency.
- **Mitigation:** No timestamps in generated files; sorted manifest; the idempotency scenario hashes the whole tree.
- **Risk:** `src/program.ts` is also edited by STORY-001-05 to 001-07.
- **Mitigation:** Registration is one line per command in the module list; stories run sequentially after this one.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Fresh install and re-run are distinct successful paths. |
| Interfaces | F | CLI only. |
| Data | T | `content_dir` changes where content is created and what `.gitignore` lists. |
| Rules | T | User-owned files and text outside the managed block must never change. |

```gherkin
Feature: wikeeper init

  @paths
  Scenario: init scaffolds a fresh repository
    Given a git repository without .wiki/ and a registered test integration
    When I run "wikeeper init --profile management --yes --json"
    Then .wiki/ contains system/, config.yml and kb_instructions.md
    And .wiki/ contains raw/, pages/, log/ and index.md
    And .wiki/system/manifest.json lists every file under .wiki/system/ except itself with its sha256 and kind "system"
    And .gitignore contains the wikeeper managed block
    And the test integration's init handler ran once with the resolved paths
    And the JSON "created" list names every file written

  @paths
  Scenario: init is idempotent
    Given a repository where "wikeeper init --yes" has already run
    When I run "wikeeper init --yes --json" again
    Then the hash of every file in the repository is unchanged
    And the JSON "created" list is empty

  @rules
  Scenario: Existing user files are left alone
    Given a custom .wiki/kb_instructions.md and a .gitignore with the line "node_modules/"
    When I run "wikeeper init --yes"
    Then .wiki/kb_instructions.md is byte-identical
    And .gitignore still starts with "node_modules/" and contains exactly one wikeeper managed block

  @data
  Scenario: content_dir moves content and ignore paths
    Given .wiki/config.yml containing "content_dir: wiki" and "private: [team.md]"
    When I run "wikeeper init --yes"
    Then wiki/ contains raw/, pages/, log/ and index.md
    And .wiki/system/ exists
    And the managed .gitignore block lists "wiki/log.md" and "wiki/pages/team.md"

  Scenario: Error — unknown profile is rejected
    Given a repository without .wiki/
    When I run "wikeeper init --profile research --json"
    Then the exit code is 2
    And the JSON error lists "management" as the available profile
    And no file was created
```

### 2.2 Verification Steps (Manual)
- [ ] Run `npx wikeeper init --yes` from a packed tarball in an empty temp repo and inspect the tree.
- [ ] Run it again and confirm `git status` shows no changes.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/commands/init.ts` |
| Related Files | `src/core/gitignore.ts`, `src/core/integrations.ts`, `src/program.ts`, `templates/kb_instructions.management.md`, `templates/index.md`, `test/init.test.ts`, `test/gitignore.test.ts` |
| New Files Needed | Yes — all of the above except `src/program.ts` |

### 3.2 Technical Logic
1. Resolve root (`findRepoRoot`), load config (defaults if absent), validate `--profile` against the known list `["management"]` before touching disk.
2. Resolve paths; create directories with `mkdir({ recursive: true })`.
3. Copy every `templates/system/**` file to `.wiki/system/`; write only when bytes differ (keeps mtimes and idempotency).
4. Seed user-owned files only when missing; record which were created vs skipped.
5. Write the manifest (sorted, no timestamps); skip the write when bytes are identical.
6. Apply the managed `.gitignore` block (`applyManagedBlock(text, entries)` is a pure function; write only on change).
7. `runIntegrations("init", ctx)`; collect their created/skipped entries into the result.
8. Emit through `src/core/output.ts`; errors through `WikeeperError`.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper init` | CLI | None | `--profile <name>`, `--agents <list>`, `--yes`, `--json` | `{ created: string[], skipped: string[], manifest: string }` |

## Task Breakdown

- [ ] Add `templates/kb_instructions.management.md` and `templates/index.md` placeholders.
- [ ] Implement `src/core/integrations.ts` (register, run, reset-for-tests).
- [ ] Implement `applyManagedBlock` in `src/core/gitignore.ts` with unit tests (create, replace, preserve).
- [ ] Implement `src/commands/init.ts` steps 1–8 and register it in `src/program.ts`.
- [ ] Write the five Gherkin scenarios as tests in `test/init.test.ts` using temp repositories.
- [ ] Run typecheck, tests and build; run the manual verification steps.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 4 | `applyManagedBlock` create / replace / preserve; integration registry |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario, running the CLI program in-process. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts` — command registry (from STORY-001-01) where `init` is registered.
- **Coverage of this requirement:** partial — registration only; the command is net-new.

## Prior work

- [[EPIC-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/program.ts`.
- **Why isn't extension / parameterization / config sufficient?** A plain "copy the template folder" command would overwrite user files on re-run, leave no record of what it installed, and give EPIC-002 nowhere to plug in agent wiring. The manifest, the managed `.gitignore` block and the integration hook point are each the minimum for safe re-runs, clean removal and extensibility.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (Existing paths verified; planned paths for new files accepted by the human at Gate 1, 2026-10-16.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
