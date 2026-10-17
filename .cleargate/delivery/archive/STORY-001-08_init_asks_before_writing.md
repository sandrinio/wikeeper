---
story_id: STORY-001-08
parent_epic_ref: EPIC-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
ambiguity: 🟢 Low
context_source: CR-002 A1 (approved 2026-10-16; SPRINT-01 walkthrough) · EPIC-001 · verified src/commands/init.ts, src/agents/index.ts, src/core/integrations.ts, src/agents/enforce/index.ts
actor: Developer running `wikeeper init` in a terminal
complexity_label: L2
parallel_eligible: y
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:40:00Z
updated_at: 2026-10-16T18:40:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 3
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:23:57Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: e4cffc5d7d6d637dfbd0446948ebbc5783cef57b0408923ca408b091fa0386ba
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: claude-opus-5-5
  last_stamp: 2026-10-16T17:47:49Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-16T17:41:44Z
---

# STORY-001-08: `init` asks every question before writing
**Complexity:** L2 — reorders `init` so the agents and `--enforce` questions run before the first write; one new integration phase. Extends STORY-001-04, STORY-002-04 and STORY-002-06.

## 1. The Spec (The Contract)

### 1.1 User Story
As a developer running `wikeeper init` in a terminal, I want every question asked before anything is written, so that pressing Ctrl-C at a prompt leaves my repository exactly as it was.

### 1.2 Detailed Requirements
- **R1 — Questions first.** In an interactive `init`, the agents question (`Which agents do you use?`) and the `--enforce` question (`ENFORCE_QUESTION`) are both asked before `init` creates or changes any file or directory. Today `src/commands/init.ts` writes `.wiki/` (system files, seeds, `.gitignore`, manifest) and only then calls `runIntegrations("init")`, which asks both questions.
- **R2 — Answers are applied once.** Each question is asked once. After the last answer, `init` writes `.wiki/`, the agent wiring and (when enabled) the enforce entries exactly as it does today for the same answers, and asks nothing more.
- **R3 — Failures during the questions write nothing.** A `needs_input` (exit 5), or a settings parse error found while the questions run (exit 1), leaves the tree byte-identical because nothing has been written yet. The existing rollback in `init.ts` stays for failures after the first write.
- **R4 — Non-interactive runs unchanged.** With `--yes`, `--json` or a non-TTY stdin, `init` asks nothing and produces the same files and report as before this story.

### 1.3 Out of Scope
- Handling SIGINT inside wikeeper. Ctrl-C keeps its default behaviour; this story makes sure there is nothing to undo when it arrives.
- Prompts in other commands (`remove --purge` already confirms before removing anything).
- The settings-file report and `.bak` changes of STORY-002-08, which builds on this story's `init.ts`.

### 1.4 Open Questions

- None. CR-002 A1 states the rule; the mechanism reuses the `preflight` hook STORY-002-06 added for the same reason.

### 1.5 Risks

- **Risk:** The prepared state must reach `init` without changing the `PhaseHandler` signature.
- **Mitigation:** Key it in a module-level `WeakMap` by the `IntegrationOptions` object that `init.ts` passes to both phases (§3.2); no exported signature changes, only the additive `prepare` phase.
- **Risk:** A "nothing on disk while the prompt waits" test passes at baseline if it only checks the end state, because today's rollback already restores the tree after a `needs_input` (flashcard `#qa #hooks`: default-off scenarios pass at baseline).
- **Mitigation:** The test inspects the tree at the moment the prompt text appears on stderr, while stdin is still open (scenario 1), and pairs it with the completed path (scenario 2).

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Interactive run that completes vs non-interactive run; both must keep today's result. |
| Interfaces | F | CLI only. |
| Data | F | Behaviour does not vary by data shape; the two prompts are covered as Outline rows of one rule. |
| Rules | T | Nothing is written while any question is pending; failures during the questions leave the tree identical. |

```gherkin
Feature: init asks every question before writing

  @rules
  Scenario Outline: nothing is on disk while a question is waiting
    Given an empty git repository and a terminal stdin that stays open
    When I run "wikeeper <args>" and send "<answers>"
    And stderr shows "<prompt>"
    Then the repository tree is byte-identical to before the run

    Examples:
      | args                 | answers | prompt                   |
      | init                 |         | Which agents do you use? |
      | init                 | 1       | Enable --enforce         |
      | init --agents claude |         | Enable --enforce         |

  @paths
  Scenario: answered questions are applied after the last question
    Given an empty git repository and a terminal stdin
    When I run "wikeeper init" and answer "1" to the agents question and "y" to the enforce question
    Then the exit code is 0
    And .wiki/config.yml lists agents "claude" and "enforce: true"
    And .claude/settings.json holds the guard hook

  @paths
  Scenario: non-interactive init asks nothing and is unchanged
    Given an empty git repository
    When I run "wikeeper init --json --agents claude,codex --yes"
    Then stderr shows no question
    And the created files and the JSON report are the same as before this story

  Scenario: Error — a malformed settings file is found during the questions
    Given a repository with ".claude/settings.json" containing "{ not json"
    When I run "wikeeper init --agents claude" in a terminal and answer "y" to the enforce question
    Then the exit code is 1 naming ".claude/settings.json"
    And the repository tree is byte-identical to before the run
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch repo, run `wikeeper init` in a real terminal, press Ctrl-C at the agents prompt, and confirm `git status --porcelain --ignored` shows nothing new.
- [ ] Repeat with `wikeeper init --agents claude` and Ctrl-C at the enforce prompt.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `src/commands/init.ts` |
| Related Files | `src/core/integrations.ts`, `src/agents/index.ts`, `test/init.test.ts`, `test/agents/integration.test.ts` |
| New Files Needed | Yes — `test/init-prompts.test.ts` |

### 3.2 Technical Logic
- **Prepare phase (`src/core/integrations.ts`).** `IntegrationPhase` adds `"prepare"`; `Integration` adds `prepare?: (ctx: IntegrationContext) => Promise<void>`; `runIntegrations("prepare", ctx)` awaits each registered `prepare` in registration order and returns the empty result (no report merge). A `prepare` handler may prompt and may throw; it never writes.
- **Agents integration (`src/agents/index.ts`).** `prepare` detects agent files, resolves the agents (flag → config → prompt), throws `needs_input` when unresolved, runs every `AgentsExtension.preflight` (the enforce decision with its prompt, and the strict parse of every JSON settings file `init` would touch), then closes the run's one stdin reader. `init` reuses the prepared state; when called without a prior `prepare` (direct calls in tests), it prepares first, so existing callers keep working.
- `init.ts` (`execInit`): after the read-only pre-pass (profile, config, templates, `.gitignore` decode; lines 70–128) and before `// 6. package-owned system files` (line 154), build `options: IntegrationOptions` with `manifest: { package_version, files: [...(old?.files ?? [])] }`, then `await runIntegrations("prepare", { root, paths, config, options })`. Set `options.manifest = working` just before the existing `runIntegrations("init", …)` (line 222) and pass the same `options` object.
- `integrations.ts`: extend `IntegrationPhase` and `Integration`; in `runIntegrations`, a `prepare` branch awaits each handler in order and returns the empty result (no report merge).
- `agents/index.ts`: move the head of `init()` (lines 221–236: line reader, `detectAgentFiles`, `resolveAgents`, `needsInputError`, extension `preflight`) into a `prepare(ctx)` function that stores `{ r, existing, state }` in `const prepared = new WeakMap<IntegrationOptions, Prepared>()` and closes the reader in a `finally`. `init()` takes `prepared.get(ctx.options) ?? await prepare(ctx)` and continues at `resolveTargets` (line 238). Add `prepare` to `agentsIntegration` and to the `AgentsIntegration` interface.
- `state.lines` is non-null only inside `prepare`; `enforceExtension.init` calls `decide()`, which returns the cached decision for the same `AgentsState`, so it never prompts again (`src/agents/enforce/index.ts:347`).
- Test harness: a `PassThrough` with `isTTY = true` as stdin; resolve a promise when stderr receives the prompt text, hash the tree (`treeHash` pattern from `test/agents/enforce.test.ts`), then `end()` stdin. One readline reader per stdin (flashcard `#test-harness #stdin`).

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `runIntegrations("prepare", ctx)` | function | None | `IntegrationContext` | `IntegrationRunResult` (all lists empty) |
| `wikeeper init` | CLI | None | unchanged flags | unchanged `InitResult` |

## Task Breakdown

- [x] Add the `prepare` phase to `IntegrationPhase`, `Integration` and `runIntegrations` -> R1
- [x] Split the agents integration's `init` into `prepare` + `init` with the `WeakMap` hand-off and reader close -> R1, R2
- [x] Call `prepare` in `execInit` before the first write and reuse the options object for `init` -> R1, R2, R3
- [x] Write the open-stdin prompt tests (Outline rows), the completed-path test, the non-interactive regression and the malformed-settings test -> R1, R2, R3, R4

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 2 | `runIntegrations("prepare")` order and empty result; agents `init` without a prior `prepare` still resolves agents. |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 6 | One per Gherkin scenario, Outline rows counted separately (3 + 1 + 1 + 1). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/e2e/goal.test.ts` and the STORY-002-06 preflight tests stay green.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/commands/init.ts:154` — writes package-owned system files before any question is asked.
- **Surface:** `src/commands/init.ts:222` — `runIntegrations("init", …)` runs the agents and enforce prompts after the core writes.
- **Surface:** `src/agents/index.ts:221` — the agents integration opens the stdin reader, resolves agents and runs extension `preflight` inside `init`.
- **Surface:** `src/core/integrations.ts:6` — `IntegrationPhase` (`init | update | remove | doctor`).
- **Surface:** `src/agents/enforce/index.ts:363` — `enforceExtension.preflight`, which already asks the enforce question and parses settings before any agent write.
- **Coverage of this requirement:** partial — the agent-side writes already wait for the questions (STORY-002-06 rework); the core `.wiki/` writes in `init.ts` do not.

## Prior work

- [[EPIC-001]] (parent), [[CR-002]] item A1. Extends [[STORY-001-04]] (`init`), [[STORY-002-04]] (agents integration) and [[STORY-002-06]] (`preflight`). The wiki duplicate check found no other prior work.

## Why not simpler?

- **Smallest existing surface that could carry this:** `AgentsExtension.preflight` in `src/agents/index.ts:33`.
- **Why isn't extension / parameterization / config sufficient?** `preflight` runs inside the agents integration's `init`, which `init.ts` calls only after it has written `.wiki/`. Moving the core writes after `runIntegrations("init")` would break integrations that need the core files and manifest to exist. A read-only `prepare` phase called before the first write is the smallest change that puts every question first.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding.
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
