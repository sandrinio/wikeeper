---
cr_id: CR-009
parent_ref: CR-008
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
context_source: Designer PLAN/VERIFY cross-flow notes on CR-008 (2026-10-20, docs/ux-map.md §4 and table H); the user chose these four to become a CR on 2026-10-20 ("do as you recommend"). Not yet approved for implementation.
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

# CR-009: What users are told about enforce in Copilot and trusted folders

## 0.5 Open Questions

- **Question:** Where does the user hear that the folder must be trusted: in `init`'s output, in SETUP.md step 5, or both?
- **Recommended:** SETUP.md step 5, after `wikeeper doctor`: for each `*-trust` info, the agent tells the user in plain words to trust the folder in that coding agent. `init` is often run by the agent itself, so its output may never reach the user.
- **Human decision:** pending.

- **Question:** How does doctor stop counting the Copilot file's `version` key as a hook?
- **Recommended:** give non-entry items such as `version` their own manifest kind, so doctor counts only `hook` and `rule` entries; `wikeeper update` re-records an existing file's `version` item under the new kind.
- **Human decision:** pending.

## 1. The Context Override (Old vs. New)

**Obsolete Logic (What to Remove / Forget):**
- `copilot-trust` says to start a new session "whenever wikeeper update changes the guard command", wording copied from Codex. In Copilot the permit hook's command also changes with every permission-mode change, and Copilot reads the hook file once per session.
- Nobody tells the user to trust the folder: `init --enforce` prints nothing about it, SETUP.md step 5 fixes only doctor errors, and step 6 passes on only `setup-files` findings. Without trust, Copilot, Codex and Antigravity run none of the hooks.
- doctor's enforce summary counts `.github/hooks/wikeeper.json`'s `version` key as a hook: `copilot: .github/hooks/wikeeper.json (2 hooks, 1 rule)`, and `--json` lists `"version"` among the hooks.
- The docs say only that `--enforce` blocks direct page edits; they don't say what happens for a teammate whose wikeeper can't run.

**New Logic (The New Truth):**
- `copilot-trust` says to start a new session whenever `wikeeper update` changes the hook file (designer proposal: `… trust the folder, then start a new session whenever wikeeper update changes this file`).
- When `enforce` is on, setup tells the user, in plain words, to trust the project folder in each configured coding agent that needs it (Copilot, Codex, Antigravity), and why: until then the protections don't run.
- doctor counts only real hook and rule entries: a Copilot wiki with enforce on reports `(1 hook, 1 rule)`.
- `docs/reference.md`'s Copilot note says what enforce does on a machine where wikeeper can't run (designer proposal: "On a machine where wikeeper can't run, the hooks step aside: Copilot asks before each command as usual and page edits aren't blocked, and `wikeeper lint` still reports them.").

## 2. Blast Radius & Invalidation

- [ ] Invalidate/Update Story: none; extends [[CR-008]] (not yet Completed).
- [ ] Invalidate/Update Epic: [[EPIC-002]] (Completed) owns doctor's enforce summary and the trust checks; it stays closed.
- [x] Database schema impacts? No config change. The manifest may gain an entry kind for `version` (Open Questions).
- The trust instruction changes SETUP.md, so its hash pins move again (archive R11, upgrade R2, token R14).
- Codex's and Antigravity's trust checks get the same treatment in setup.
- Other designer notes stay out of this CR and remain recorded in `docs/ux-map.md` §4: the permit reasons' shape, the guard's `unknown --agent "undefined"`, ux.md naming `hook permit`, a word-list row for helper models, skipping the model question when helpers don't run, and `init` leaving an old pointer block.

## Existing Surfaces

- **Surface:** `src/agents/doctor-checks.ts:194` — `checkCopilotTrust` and its message.
- **Surface:** `src/commands/doctor.ts:322` — the per-file hook and rule lists behind the `enforce: on — …` summary.
- **Surface:** `src/agents/enforce/copilot.ts` — the `version` item, recorded with kind `hook`.
- **Surface:** `templates/system/SETUP.md` — step 5 (`Run wikeeper doctor. Fix every error it reports before continuing.`).
- **Surface:** `docs/reference.md` — the "Copilot in VS Code" note under the multi-agent table.
- **Why this CR extends rather than rebuilds:** the checks, the summary and the setup step exist; only their wording, one count and one instruction change.

## Prior work

- [[CR-008]] — Copilot as a fourth agent; its verification results list these four as designer cross-flow notes, not fixed there.
- [[EPIC-002]] — agent integration, including doctor's enforce summary and the trust checks.

## 3. Execution Sandbox

**Modify:**
- `src/agents/doctor-checks.ts`
- `src/commands/doctor.ts`
- `src/agents/enforce/copilot.ts`
- `src/agents/enforce/index.ts` (only if the `version` item gets its own kind)
- `templates/system/SETUP.md`
- `docs/reference.md`
- `test/templates/archive-instructions.red.node.test.ts`, `test/templates/token-instructions.red.node.test.ts`, `test/templates/upgrade-instructions.red.node.test.ts` — SETUP.md hash pins only.

**Add:**
- `test/agents/copilot-notices.test.ts`

**Designer-owned:** `docs/ux-map.md` table H (H6) and J1 step 11a.

## 4. Verification Protocol

**Command/Test:** `npm run typecheck && npm test && npm run build`. Manual check in a scratch copy of `~/Documents/Dev/wikeeper-testbed`: `init --agents claude,copilot --enforce`, `doctor`, then a permission change, `update` and `doctor` again.

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One way through each check and each setup step. |
| Interfaces | T | doctor's human line and its `--json` both carry the count. |
| Data | T | Codex, Antigravity and Copilot each need trust; Claude Code does not. |
| Rules | T | A new session after any change to the hook file; trust before the hooks run. |

```gherkin
Feature: What users are told about enforce in Copilot and trusted folders

  @rules
  Scenario: The Copilot trust note covers permission changes
    Given a Copilot wiki with enforce on
    When doctor runs
    Then copilot-trust says to start a new session whenever wikeeper update changes the hook file

  @data @rules
  Scenario Outline: Setup tells the user to trust the folder
    Given enforce is on and "<agent>" is configured
    When setup reaches step 5 and doctor reports "<check>"
    Then the agent tells the user, in plain words, to trust this folder in that coding agent, and why

    Examples:
      | agent       | check             |
      | copilot     | copilot-trust     |
      | codex       | codex-trust       |
      | antigravity | antigravity-trust |

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
| Unit tests | 4 | One per scenario; the outline counts as one, with its three rows. |
| Integration tests | 1 | doctor through runCli on a scratch wiki for the count, human and `--json`. |
| E2E / acceptance tests | 0 | Designer VERIFY drives setup step 5 in a testbed copy; no real Copilot session is available. |

---

## Context Source

**context_source:** Designer cross-flow notes on CR-008 (PLAN and VERIFY, 2026-10-20), recorded in `docs/ux-map.md` §4 and table H; the user chose these four on 2026-10-20.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🔴 High Ambiguity — draft; two open questions and no approval yet**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] "Obsolete Logic" to be evicted is explicitly declared.
- [ ] All impacted downstream Epics/Stories are identified and reverted to 🔴 High Ambiguity.
- [x] Execution Sandbox contains exact file paths.
- [x] Verification command is provided.
- [ ] `approved: true` is set in the YAML frontmatter.
- [x] Existing Surfaces cites at least one source-tree path the CR extends.
