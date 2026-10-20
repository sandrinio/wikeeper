---
cr_id: CR-009
parent_ref: CR-008
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Approved
approved: true
context_source: Designer PLAN/VERIFY cross-flow notes on CR-008 (2026-10-20, docs/ux-map.md §4 and table H); the user chose four to become a CR on 2026-10-20 ("do as you recommend") and dropped the folder-trust one the same day. Approved for implementation on 2026-10-20 ("go ahead").
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
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: claude-opus-5-5
  last_stamp: 2026-10-20T13:22:27Z
  sessions:
    - session: eb8400d2-bb8a-4f0e-85f7-1cd886731bab
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-20T13:14:27Z
---

# CR-009: What users are told about enforce in Copilot

## 0.5 Open Questions

- **Question:** Where does the user hear that the folder must be trusted: in `init`'s output, in SETUP.md step 5, or both?
- **Recommended:** SETUP.md step 5, after `wikeeper doctor`: for each `*-trust` info, the agent tells the user in plain words to trust the folder in that coding agent.
- **Human decision:** dropped (2026-10-20): folder trust is VS Code's own prompt, which the user meets there; wikeeper does not tell them about it. Out of scope for this CR.

- **Question:** How does doctor stop counting the Copilot file's `version` key as a hook?
- **Recommended:** leave the manifest as it is and have doctor's summary skip the file-format key, as it already skips `backup` (`src/commands/doctor.ts:314`). A new manifest kind was considered and rejected: the manifest's `version` entry is what `remove` uses to clear the key (so an emptied hook file is deleted) and what the missing-entry check (`inspectOwnedEntries`) verifies, so re-kinding it risks both. Antigravity's hook identity (`wikeeper-guard`) has no brackets, so the identity's shape can't tell hooks from file keys either.
- **Human decision:** "doctor should work for sure" (2026-10-20): the summary must be right without putting any other doctor check, `update` or `remove` at risk. Applied as recommended.

## 1. The Context Override (Old vs. New)

**Obsolete Logic (What to Remove / Forget):**
- `copilot-trust` says to start a new session "whenever wikeeper update changes the guard command", wording copied from Codex. In Copilot the permit hook's command also changes with every permission-mode change, and Copilot reads the hook file once per session.
- doctor's enforce summary counts `.github/hooks/wikeeper.json`'s `version` key as a hook: `copilot: .github/hooks/wikeeper.json (2 hooks, 1 rule)`, and `--json` lists `"version"` among the hooks.
- The docs say only that `--enforce` blocks direct page edits; they don't say what happens for a teammate whose wikeeper can't run.

**New Logic (The New Truth):**
- `copilot-trust` says to start a new session whenever `wikeeper update` changes the hook file (designer proposal: `… trust the folder, then start a new session whenever wikeeper update changes this file`).
- doctor counts only real hook and rule entries: a Copilot wiki with enforce on reports `(1 hook, 1 rule)`, and `--json` lists no `version`. The manifest still records `version`; `remove`, `update` and the `enforce-entry-missing` check behave as before.
- `docs/reference.md`'s Copilot note says what enforce does on a machine where wikeeper can't run (designer proposal: "On a machine where wikeeper can't run, the hooks step aside: Copilot asks before each command as usual and page edits aren't blocked, and `wikeeper lint` still reports them.").

## 2. Blast Radius & Invalidation

- [ ] Invalidate/Update Story: none; extends [[CR-008]] (not yet Completed).
- [ ] Invalidate/Update Epic: [[EPIC-002]] (Completed) owns doctor's enforce summary; it stays closed.
- [x] Database schema impacts? None: no config or manifest change.
- Telling the user to trust the folder is out of scope (human decision, §0.5): VS Code asks for it itself.
- Other designer notes stay out of this CR and remain recorded in `docs/ux-map.md` §4: the permit reasons' shape, the guard's `unknown --agent "undefined"`, ux.md naming `hook permit`, a word-list row for helper models, skipping the model question when helpers don't run, and `init` leaving an old pointer block.

## Existing Surfaces

- **Surface:** `src/agents/doctor-checks.ts:194` — `checkCopilotTrust` and its message.
- **Surface:** `src/commands/doctor.ts:322` — the per-file hook and rule lists behind the `enforce: on — …` summary.
- **Surface:** `src/agents/enforce/copilot.ts` — the `version` item, recorded with kind `hook`; unchanged by this CR.
- **Surface:** `docs/reference.md` — the "Copilot in VS Code" note under the multi-agent table.
- **Why this CR extends rather than rebuilds:** the check, the summary and the docs note exist; only one message, one count and one docs sentence change.

## Prior work

- [[CR-008]] — Copilot as a fourth agent; its verification results list these as designer cross-flow notes, not fixed there.
- [[EPIC-002]] — agent integration, including doctor's enforce summary.

## 3. Execution Sandbox

**Modify:**
- `src/agents/doctor-checks.ts` — the `copilot-trust` message.
- `src/commands/doctor.ts` — skip the file-format key in the enforce summary.
- `docs/reference.md` — one sentence in the Copilot note.

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
  Scenario: doctor's other checks and remove are unchanged
    Given a Copilot wiki with enforce on
    When the version key is deleted from .github/hooks/wikeeper.json
    Then doctor still reports enforce-entry-missing for it
    And when Copilot is removed from the wiki's agents, update still deletes the hook file

  @rules
  Scenario: The docs say what enforce does without wikeeper
    When a reader opens docs/reference.md's Copilot note
    Then it says the hooks step aside on a machine where wikeeper can't run, and lint still reports page edits
```

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 2 | The trust message; the docs sentence. |
| Integration tests | 2 | doctor through runCli on a scratch wiki: the count, human and `--json`; the missing-entry check and removal. |
| E2E / acceptance tests | 0 | No real Copilot session is available; designer VERIFY runs doctor in a testbed copy. |

**Verification results (2026-10-20):**
- `npm run typecheck`, `npm test` (189 files, 2357 passed, 1 skipped), `npm run build` and `git diff --check`: pass (QA-Verify, 4/4 scenarios, no regressions).
- Designer VERIFY passed with no findings (27 transcripts from a scratch build in testbed copies; no real Copilot or VS Code session). doctor prints the new trust note and `copilot: .github/hooks/wikeeper.json (1 hook, 1 rule)`; `--json` lists no `version`; with `version` deleted, `enforce-entry-missing` names it and `update` restores it; removing Copilot deletes the hook file; with no runnable wikeeper both hooks exit 0 with no output and `lint` reports the edit as `unlogged-change`. `docs/ux-map.md` H4, H6 and §4 updated.
- Cross-flow notes (not blocking), for the human to make CRs of or drop: `config set ingest.permission` with enforce on leaves the agents' files on the old mode with no next step; doctor's human lines show no path, so "this file" names no file; doctor calls the permit hook a "rule" where the docs call it a hook; the "no wikeeper" sentence sits only under the Copilot note.
- After this CR: GitHub's hooks reference (read again 2026-10-20) lists `bash`/`powershell` as the per-platform fields of a `.github/hooks` entry, and `windows` only for VS Code and agent-scoped hooks, so Copilot CLI on Windows likely runs the POSIX `command`. Follow-up CR drafted.

---

## Context Source

**context_source:** Designer cross-flow notes on CR-008 (PLAN and VERIFY, 2026-10-20), recorded in `docs/ux-map.md` §4 and table H; the user chose four on 2026-10-20 and dropped the folder-trust one.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity — approved with an explicit downstream-reset exception (EPIC-002 is Completed and stays closed)**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] "Obsolete Logic" to be evicted is explicitly declared.
- [ ] All impacted downstream Epics/Stories are identified and reverted to 🔴 High Ambiguity.
- [x] Execution Sandbox contains exact file paths.
- [x] Verification command is provided.
- [x] `approved: true` is set in the YAML frontmatter.
- [x] Existing Surfaces cites at least one source-tree path the CR extends.
