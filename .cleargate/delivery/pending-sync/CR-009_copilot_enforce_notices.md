---
cr_id: CR-009
parent_ref: CR-008
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
context_source: Designer PLAN/VERIFY cross-flow notes on CR-008 (2026-10-20, docs/ux-map.md §4 and table H); the user chose four to become a CR on 2026-10-20 ("do as you recommend") and dropped the folder-trust one the same day. Not yet approved for implementation.
created_at: 2026-10-20T11:14:49Z
updated_at: 2026-10-20T11:14:49Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-20T11:15:38Z
  transition: ready-to-apply
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id CR-009
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-20T11:15:38Z
  sessions: []
---

# CR-009: What users are told about enforce in Copilot

## 0.5 Open Questions

- **Question:** Where does the user hear that the folder must be trusted: in `init`'s output, in SETUP.md step 5, or both?
- **Recommended:** SETUP.md step 5, after `wikeeper doctor`: for each `*-trust` info, the agent tells the user in plain words to trust the folder in that coding agent.
- **Human decision:** dropped (2026-10-20): folder trust is VS Code's own prompt, which the user meets there; wikeeper does not tell them about it. Out of scope for this CR.

- **Question:** How does doctor stop counting the Copilot file's `version` key as a hook?
- **Recommended:** give non-entry items such as `version` their own manifest kind, so doctor counts only `hook` and `rule` entries; `wikeeper update` re-records an existing file's `version` item under the new kind.
- **Human decision:** pending.

## 1. The Context Override (Old vs. New)

**Obsolete Logic (What to Remove / Forget):**
- `copilot-trust` says to start a new session "whenever wikeeper update changes the guard command", wording copied from Codex. In Copilot the permit hook's command also changes with every permission-mode change, and Copilot reads the hook file once per session.
- doctor's enforce summary counts `.github/hooks/wikeeper.json`'s `version` key as a hook: `copilot: .github/hooks/wikeeper.json (2 hooks, 1 rule)`, and `--json` lists `"version"` among the hooks.
- The docs say only that `--enforce` blocks direct page edits; they don't say what happens for a teammate whose wikeeper can't run.

**New Logic (The New Truth):**
- `copilot-trust` says to start a new session whenever `wikeeper update` changes the hook file (designer proposal: `… trust the folder, then start a new session whenever wikeeper update changes this file`).
- doctor counts only real hook and rule entries: a Copilot wiki with enforce on reports `(1 hook, 1 rule)`.
- `docs/reference.md`'s Copilot note says what enforce does on a machine where wikeeper can't run (designer proposal: "On a machine where wikeeper can't run, the hooks step aside: Copilot asks before each command as usual and page edits aren't blocked, and `wikeeper lint` still reports them.").

## 2. Blast Radius & Invalidation

- [ ] Invalidate/Update Story: none; extends [[CR-008]] (not yet Completed).
- [ ] Invalidate/Update Epic: [[EPIC-002]] (Completed) owns doctor's enforce summary; it stays closed.
- [x] Database schema impacts? No config change. The manifest may gain an entry kind for `version` (Open Questions).
- Telling the user to trust the folder is out of scope (human decision, §0.5): VS Code asks for it itself.
- Other designer notes stay out of this CR and remain recorded in `docs/ux-map.md` §4: the permit reasons' shape, the guard's `unknown --agent "undefined"`, ux.md naming `hook permit`, a word-list row for helper models, skipping the model question when helpers don't run, and `init` leaving an old pointer block.

## Existing Surfaces

- **Surface:** `src/agents/doctor-checks.ts:194` — `checkCopilotTrust` and its message.
- **Surface:** `src/commands/doctor.ts:322` — the per-file hook and rule lists behind the `enforce: on — …` summary.
- **Surface:** `src/agents/enforce/copilot.ts` — the `version` item, recorded with kind `hook`.
- **Surface:** `docs/reference.md` — the "Copilot in VS Code" note under the multi-agent table.
- **Why this CR extends rather than rebuilds:** the check, the summary and the docs note exist; only one message, one count and one docs sentence change.

## Prior work

- [[CR-008]] — Copilot as a fourth agent; its verification results list these as designer cross-flow notes, not fixed there.
- [[EPIC-002]] — agent integration, including doctor's enforce summary.

## 3. Execution Sandbox

**Modify:**
- `src/agents/doctor-checks.ts`
- `src/commands/doctor.ts`
- `src/agents/enforce/copilot.ts`
- `src/agents/enforce/index.ts` (only if the `version` item gets its own kind)
- `docs/reference.md`

**Add:**
- `test/agents/copilot-notices.test.ts`

**Designer-owned:** `docs/ux-map.md` table H (H4, H6).

## 4. Verification Protocol

**Command/Test:** `npm run typecheck && npm test && npm run build`. Manual check in a scratch copy of `~/Documents/Dev/wikeeper-testbed`: `init --agents claude,copilot --enforce`, `doctor`, then a permission change, `update` and `doctor` again.

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One way through each check. |
| Interfaces | T | doctor's human line and its `--json` both carry the count. |
| Data | F | Only Copilot's file and check change; no other agent or data shape is involved. |
| Rules | T | A new session after any change to the hook file; the docs say what enforce does without wikeeper. |

```gherkin
Feature: What users are told about enforce in Copilot

  @rules
  Scenario: The Copilot trust note covers permission changes
    Given a Copilot wiki with enforce on
    When doctor runs
    Then copilot-trust says to start a new session whenever wikeeper update changes the hook file

  @interfaces
  Scenario: doctor counts only real hooks
    Given a Copilot wiki with enforce on
    When doctor runs, with and without --json
    Then the Copilot file is reported with 1 hook and 1 rule
    And the JSON hook list does not contain "version"

  @rules
  Scenario: The docs say what enforce does without wikeeper
    When a reader opens docs/reference.md's Copilot note
    Then it says the hooks step aside on a machine where wikeeper can't run, and lint still reports page edits
```

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 3 | One per scenario. |
| Integration tests | 1 | doctor through runCli on a scratch wiki for the count, human and `--json`. |
| E2E / acceptance tests | 0 | No real Copilot session is available; designer VERIFY runs doctor in a testbed copy. |

---

## Context Source

**context_source:** Designer cross-flow notes on CR-008 (PLAN and VERIFY, 2026-10-20), recorded in `docs/ux-map.md` §4 and table H; the user chose four on 2026-10-20 and dropped the folder-trust one.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🔴 High Ambiguity — draft; one open question and no approval yet**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] "Obsolete Logic" to be evicted is explicitly declared.
- [ ] All impacted downstream Epics/Stories are identified and reverted to 🔴 High Ambiguity.
- [x] Execution Sandbox contains exact file paths.
- [x] Verification command is provided.
- [ ] `approved: true` is set in the YAML frontmatter.
- [x] Existing Surfaces cites at least one source-tree path the CR extends.
