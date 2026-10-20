---
cr_id: CR-007
parent_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Approved
approved: true
context_source: Verified setup and model-mapping code; user approved implementation and explicitly kept completed historical items closed on 2026-10-20.
created_at: 2026-10-20T08:20:27Z
updated_at: 2026-10-20T08:20:27Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
source: local-authored
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-20T10:30:17Z
  transition: ready-to-apply
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: claude-opus-5-5
  last_stamp: 2026-10-20T10:30:16Z
  sessions:
    - session: eb8400d2-bb8a-4f0e-85f7-1cd886731bab
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-20T09:57:30Z
---

# CR-007: User-approved ingestion models

## 0.5 Open Questions

- Resolved by the user: consult during setup, remember the choice, and apply the behavior to all supported agents.
- Implementation boundaries approved by the user; completed historical items remain closed by explicit human decision.

## 1. The Context Override (Old vs. New)

**Obsolete Logic (What to Remove / Forget):**
- Setup proceeds to the first source without discussing the models used by the extractor and writer.
- Installed tier defaults are treated as if the user chose them.

**New Logic (The New Truth):**
- During setup, before the first-source offer, the agent explains the extractor and writer roles and asks the user which models to use for each.
- Show the existing selections and explain the cost/quality trade-off in plain words. The user may keep them, choose supported alternatives, or inherit the harness/session default. Do not claim a model is cheapest or available without current evidence; if availability cannot be checked, say so and ask the user to confirm it in their harness.
- Do not change model settings until the user approves both choices. An explicit "keep the current choices" is approval, not a reason to reprompt.
- Save approved choices in the existing `ingest.extractor_model` and `ingest.writer_model` config keys, run `wikeeper update`, inspect its warnings, and tell the user if a selection was not applied as requested.
- Apply this conversation to Claude Code, Codex, Antigravity, and Copilot, respecting their existing mapping capabilities. Explain that these settings affect ingest helpers, not the main chat model.
- Remember the choice through configuration. Do not ask on each ingest; revisit it only if the user requests a change or an unavailable/unsupported selection needs resolution.
- Add the conversation within existing setup step 5 before its wiring verification, retaining the eight numbered steps. Existing completed wikis are not forced to redo setup.

## 2. Blast Radius & Invalidation

- Extends [[EPIC-006]] and the setup flow of [[STORY-006-02]], using model configuration installed by [[STORY-002-03]] under [[EPIC-002]].
- These are completed historical items. No active sprint or downstream execution item is invalidated; do not reopen or relabel completed work automatically.
- Shared config applies to every configured harness. For a mixed team, explain portable tiers and inheritance; do not write one harness-specific ID as though all harnesses support it.
- Antigravity accepts tiers but not arbitrary explicit IDs. Codex omits a model line for tiers. Explain these differences rather than promising identical model selection everywhere.
- No new per-harness override schema, model discovery service, pricing catalog, API calls, or automatic model switching.
- Non-interactive `init` remains non-interactive. This is an agent-guided setup requirement, not a new CLI permission gate.
- Exact prices and model availability change. Recommendations must acknowledge uncertainty and never equate fact-line preservation checks with a guarantee of semantic accuracy.
- Existing template hash pins must change only for the intentionally updated setup text.
- Database/config schema impacts: none. Main chat model, permission mode, guard behavior, and ingest commands remain unchanged.

## Existing Surfaces

- `templates/system/SETUP.md:65` already writes user-approved configuration and runs `wikeeper update`; step 5 verifies wiring before step 7 offers the first source.
- `src/core/config.ts:73` defines the two existing ingest model settings.
- `src/agents/model-tiers.ts:23` maps tiers and explicit IDs, omits the model for an empty value, and reports unsupported Antigravity IDs.
- `src/agents/subagents.ts:63` reads the configured extractor/writer choices when installing helper files.
- **Why this CR extends rather than rebuilds:** configuration, rendering, and update already exist. The missing behavior is consultation and confirmation in the shared setup instructions, so this does not require another model-selection subsystem.

## Prior work

- [[EPIC-006]] and [[STORY-006-02]] own shared setup instructions.
- [[EPIC-002]] and [[STORY-002-03]] already provide configurable ingest helper models.
- No prior setup-time model consultation found in the checked wiki, raw archive, flashcards, or current setup template.
- The required wiki-query subagent was invoked but could not start because its configured model alias `haiku` is unavailable. A direct wiki/raw-source duplicate check supplied the evidence above; no model override was attempted.

## 3. Execution Sandbox

**Modify:**
- `templates/system/SETUP.md` - model consultation within existing step 5, before wiring verification.
- `templates/system/WIKI.md` - remember choices and revisit on user request or model availability problems, without per-ingest prompting.
- `docs/reference.md` - explain setup-time model choice and existing configuration keys.
- `test/templates/archive-instructions.red.node.test.ts` - intentionally changed setup hash only.
- `test/templates/token-instructions.red.node.test.ts` - intentionally changed setup hash only.
- `test/templates/upgrade-instructions.red.node.test.ts` - intentionally changed setup hash only.

**Add:**
- `test/templates/setup-models.test.ts` - targeted instruction-contract coverage.

**Designer-owned verification:**
- `docs/ux-map.md` - update the setup journey after UX review.

Do not modify `docs/ux.md`, change the model-tier defaults, or mix unrelated pending Copilot work into this CR.

## 4. Verification Protocol

**Commands:**
- `npm run typecheck`
- `npx vitest run test/templates`
- `npx vitest run test/agents/subagents.red.node.test.ts`

Use only the approved testbed or a scratch copy for manual wiki checks. For the UX check, exercise setup through model approval, update, and the first-source offer; distinguish instruction-contract checks from actual agent behavior.

**Verification results (2026-10-20):**
- `npm run typecheck`, `npm run build`, and `git diff --check`: passed.
- `npx vitest run test/templates test/agents/subagents.red.node.test.ts`: 416 tests passed across 20 files. Existing unquoted-template YAML warnings remain.
- Fresh neutral scratch wiki under the approved testbed: init with all four harnesses installed the updated consultation instructions. Saving empty strings for both settings and running update omitted model lines from all eight helper files; the next update was idempotent. The scratch directory was removed.
- Designer PLAN could not start because its configured `opus` alias is unavailable. No formal designer verdict or real agent-conversation transcript is claimed; that acceptance review remains pending.
- Wiki ingest updated CR-007 successfully. Wiki lint failed with 25 existing orphan/stale findings elsewhere, so no push was attempted.

**Review fix (2026-10-20, with [[CR-008]]):** a code review found that step 5 had the agent offer "the harness/session default" and show `small`/`medium` and setting names, with no plain wording for the user (docs/ux.md §6.1, §6.3). The designer's PLAN (2026-10-20) gave the wording, now applied to step 5: an intro sentence that maps each term to what the user hears, and plain-word endings for items 1, 2 and 5 and the closing paragraph. Items 3 and 4 are unchanged. Every `setup-models.test.ts` assertion still holds; the three SETUP.md hash pins moved to `bc1d2365…` (archive R11, upgrade R2) and `3a068110…` (token R14).

**SPIDR coverage**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Keep current models, choose alternatives, or inherit. |
| Interfaces | F | One shared agent-guided setup conversation; no new CLI interface. |
| Data | T | Four harnesses and their differing tier/explicit-ID support. |
| Rules | T | Approval before changes; save choices; no recurring ingest prompt. |

```gherkin
Feature: User-approved ingestion models

  @paths @rules
  Scenario: Keep current models during setup
    Given the wiki has configured extractor and writer model selections
    When setup reaches wiring before offering the first source
    Then the agent explains both roles and asks whether to keep or change the selections
    And no model setting changes before the user approves
    And keeping them explicitly counts as approval

  @paths @data @rules
  Scenario: Save compatible approved choices
    Given the user is choosing models during setup
    When the user approves supported models or harness-default inheritance
    Then the agent saves the choices in the existing two ingest model keys
    And runs wikeeper update
    And reports any model warning without pretending the requested selection succeeded
    And does not change the main chat model

  @data @rules
  Scenario: Explain unsupported and mixed-harness choices
    Given an explicit model ID is unsupported by a configured harness or availability is unverified
    When the agent recommends model choices
    Then it explains the limitation and asks the user to choose a compatible alternative
    And does not silently substitute a model
    And does not promise a shared explicit ID works across all harnesses

  @rules
  Scenario: Remember choices after setup
    Given the user approved and saved the ingest model selections during setup
    When a later ingest begins with no known model availability problem
    Then the agent uses those selections without asking again
    And changing the selections later requires the user's approval
```

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 4 | Instruction-contract checks covering the four scenarios and setup order. |
| Integration tests | 0 | No runtime installer/config changes; existing rendering coverage is rerun. |
| E2E / acceptance tests | 1 | Recorded designer setup conversation through approval, update, and first-source offer. |

## Context Source

User decisions recorded on 2026-10-20: during setup; remember the choice; all supported agents. Verified the current shared setup instructions, config keys, tier mapping, and renderer. User approved implementation and explicitly kept completed historical items closed.

## ClearGate Ambiguity Gate

**Current Status: 🟡 Medium Ambiguity - approved with an explicit downstream-reset exception**

- [x] "Obsolete Logic" to be evicted is explicitly declared.
- [ ] All impacted downstream Epics/Stories are identified and reverted to 🔴 High Ambiguity.
- [x] Execution Sandbox contains exact file paths.
- [x] Verification command is provided.
- [x] `approved: true` is set in the YAML frontmatter.
- [x] Existing Surfaces cites at least one source-tree path the CR extends.

The downstream criterion remains unchecked literally: affected historical references are identified, but completed work has not been reverted to high ambiguity. No active downstream execution is invalidated. The user explicitly approved implementation while leaving completed historical items closed.
