---
cr_id: CR-001
parent_ref: EPIC-002 | STORY-002-06
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Completed
approved: true
context_source: SPRINT-01 walkthrough (walkthrough-wiki test session, 2026-10-16) · architecture.md §6.6 line 271 (verified) · STORY-002-06 R2/R3 + §2.1 table (verified) · src/agents/enforce/{claude,codex}.ts (verified)
complexity_label: L1
created_at: 2026-10-16T17:10:00Z
updated_at: 2026-10-16T17:10:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 4
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:24:07Z
  transition: ready-to-apply
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: f0dd9d1108fa755ffb8c56a7202995a15fabc29deda30e44eb34fccf6dc9f352
stamp_error: no ledger rows for work_item_id CR-001
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:03:24Z
  sessions: []
---

# CR-001: `ai` mode allows only ingest commands, not every wikeeper command

## 0.5 Open Questions

- **Question:** Should this land in SPRINT-01 or SPRINT-02?
- **Recommended:** SPRINT-01, before the 0.1.0 release. Today `ai` mode auto-approves `wikeeper remove --purge --confirm wikeeper`, so a prompt-injected source could delete the wiki and its raw sources without the harness asking. The change is about 4 lines of code plus tests, and the goal says `update`, `remove` and `doctor` must "manage it safely". This is a `CR:approach-change`, not a bug, because the current rule matches architecture.md §6.6.
- **Human decision:** SPRINT-01, before 0.1.0 (human, 2026-10-16, SPRINT-02 planning).

- **Question:** What exactly should `ai` mode allow?
- **Recommended:** Only the ingest commands, `wikeeper ingest …` and `npx wikeeper ingest …`, which is what "the AI decides what to ingest" means.
  - Every other wikeeper command (`init`, `update`, `remove`, `doctor`, `setup`) goes through the harness's normal permission handling.
  - The top-level `read` command (EPIC-003) and `search` (EPIC-004) are added to the allow list by the stories that build them, not now.
- **Human decision:** Approved as recommended (human, 2026-10-16): `ai` allows only `wikeeper ingest …` and `npx wikeeper ingest …`; `read` and `search` are added by the stories that build them.

## 1. The Context Override (Old vs. New)

**Obsolete Logic (What to Remove / Forget):**
- architecture.md §6.6: "`ai` → allow `npx wikeeper *` without prompting."
- STORY-002-06 R2/R3 and its §2.1 table row for `ai`: Claude `permissions.allow` gets `"Bash(npx wikeeper *)"` and `"Bash(wikeeper *)"`; Codex gets `prefix_rule(pattern=["npx","wikeeper"], decision="allow")` and `prefix_rule(pattern=["wikeeper"], decision="allow")`.

**New Logic (The New Truth):**
- `ai` → allow only the ingest commands without prompting:
  - **Claude** `permissions.allow`: `"Bash(npx wikeeper ingest *)"` and `"Bash(wikeeper ingest *)"`.
  - **Codex** `.codex/rules/wikeeper.rules`: `prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")` and `prefix_rule(pattern=["wikeeper","ingest"], decision="allow")`.
- `ask` and `whitelist` are unchanged.
- Antigravity is unchanged: it has no project rule file.
- Re-running `wikeeper update` in a repository that has the old broad rules replaces them with the narrow ones. The existing stale-identity removal already handles this, and it must be tested.

## 2. Blast Radius & Invalidation

- [x] Update Story: STORY-002-06 (Done in SPRINT-01): R2/R3 and the §2.1 `ai` table row change as above. **Gate reset for its QA-Red tests:** this CR explicitly authorises editing `test/agents/enforce.red.node.test.ts`, lines 233–234, 252, 513–514 and 532–533 (the old `ai` assertions), and nothing else in that file (513 added 2026-10-17 as a spec clarification: it holds the first old `ai` identity; M5 plan).
- [x] Update Epic: EPIC-002 (the `--enforce` bullet stays valid; no text change needed); architecture.md §6.6, line 271 (rewrite the `ai` sentence).
- [x] Downstream: EPIC-003 `read` and EPIC-004 `search` stories must add their own allow rules for `ai` mode. Note it in their decomposition.
- [ ] Database schema impacts? No.

## Existing Surfaces

- **Surface:** `src/agents/enforce/claude.ts:31`: the `ai` branch pushes `"Bash(npx wikeeper *)"` and `"Bash(wikeeper *)"`.
- **Surface:** `src/agents/enforce/codex.ts:4`: the `ai` rule lines `prefix_rule(pattern=["npx","wikeeper"], …)` and `["wikeeper"]`.
- **Surface:** `src/agents/enforce/index.ts`: `applyEnforce` stale-identity removal, which turns old rules into stale entries on `update`.
- **Why this CR extends rather than rebuilds:** only the rule strings change. Identities, the merge, stale removal, `.bak` and `remove` all work as they are.

## Prior work

- Related: [[EPIC-002]] (`--enforce` writes permission rules, D-30), [[EPIC-003]] (permission modes ai / ask / whitelist, D-06/D-07/D-25), [[BUG-002]] (same settings files, different defect). No existing item covers narrowing the `ai` rules.

## 3. Execution Sandbox

**Modify:**
- `src/agents/enforce/claude.ts`, `src/agents/enforce/codex.ts`: the rule strings.
- `test/agents/enforce.red.node.test.ts`: only the lines named in §2.
- `test/agents/enforce.test.ts`: new tests.
- `architecture.md`: §6.6 line 271.
- `.cleargate/delivery/pending-sync/STORY-002-06_enforce_settings_merge.md`: R2/R3 and the §2.1 table (record the CR).

## 4. Verification Protocol

**Command/Test:** `npm test -- test/agents/enforce.red.node.test.ts test/agents/enforce.test.ts`. Then run the full `npm test`.

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A fresh `init --enforce` and an `update` over old broad rules both end with only the narrow rules. |
| Interfaces | T | Two harness surfaces: Claude `settings.json` permissions and Codex `.rules` prefix rules. |
| Data | F | One rule set per agent; there is no data-shape variation. |
| Rules | T | `ai` must not auto-allow `remove`; `ask` and `whitelist` are unchanged. |

```gherkin
Feature: ai mode allows only ingest commands

  @paths @interfaces @rules
  Scenario Outline: init --enforce with permission ai writes only ingest allow rules
    Given a repository with config ingest.permission "ai"
    When I run "wikeeper init --json --agents <agent> --enforce --yes"
    Then <file> contains exactly the allow rules <rules>
    And no allow rule matches "wikeeper remove"

    Examples:
      | agent  | file                        | rules                                                                                                           |
      | claude | .claude/settings.json       | "Bash(npx wikeeper ingest *)", "Bash(wikeeper ingest *)"                                                         |
      | codex  | .codex/rules/wikeeper.rules | prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow"), prefix_rule(pattern=["wikeeper","ingest"], decision="allow") |

  @paths
  Scenario: update replaces old broad rules with the narrow ones
    Given .claude/settings.json holds the old allow rules "Bash(npx wikeeper *)" and "Bash(wikeeper *)" recorded in the manifest
    When I run "wikeeper update --json"
    Then permissions.allow is exactly ["Bash(npx wikeeper ingest *)", "Bash(wikeeper ingest *)"]
    And every user key in settings.json is unchanged

  @rules
  Scenario: ask and whitelist are unchanged
    Given permission "ask", then "whitelist"
    When I run "wikeeper update --json" after each change
    Then the rules match the STORY-002-06 table for that mode

  Scenario: Obsolete logic is gone — no wildcard allow remains
    Given any permission mode
    When wikeeper writes Claude or Codex permission rules
    Then no rule allows "wikeeper *" or the ["wikeeper"] / ["npx","wikeeper"] prefixes
```

**Test layers.**

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 2 | The rule spec for each writer (Claude, Codex) in `ai` mode |
| Integration tests | 0 | No external services; temp directories only |
| E2E / acceptance tests | 4 | One per Gherkin scenario (Outline counts once), via `runCli` in temp repositories |

---

## Context Source

**context_source:** Found by the test agent in the SPRINT-01 walkthrough (walkthrough-wiki session, 2026-10-16). It was confirmed against architecture.md §6.6, STORY-002-06 and `src/agents/enforce/{claude,codex}.ts`.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] "Obsolete Logic" to be evicted is explicitly declared.
- [ ] All impacted downstream Epics/Stories are identified and reverted to 🔴 High Ambiguity.
- [x] Execution Sandbox contains exact file paths.
- [x] Verification command is provided.
- [x] `approved: true` is set in the YAML frontmatter.
- [x] Existing Surfaces cites at least one source-tree path the CR extends.
