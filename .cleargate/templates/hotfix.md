<instructions>
USE THIS TEMPLATE FOR EMERGENCY HOTFIXES ONLY — production anomalies requiring immediate fix outside the sprint cycle. Hotfix discipline: ≤2 files, ≤30 LOC net.

FOLLOW THIS EXACT STRUCTURE. Output sections in order 0.5–4.
YAML Frontmatter: Hotfix ID, severity, originating signal, lane: "hotfix".
§0.5 Open Questions: Capture any remaining ambiguity before merge.
§1 Anomaly: Expected vs. Actual behavior.
§2 Files Touched: ≤2 files (constraint from EPIC-022 §3).
§3 Verification Steps: Non-empty before merging (blocks merge if empty).
§4 Rollback: Git revert instructions.
Output location: .cleargate/delivery/pending-sync/{ID}_{SLUG}.md

POST-WRITE BRIEF
After Writing this document, render a Brief in chat with the following sections,
mechanically extracted from the document's own structure:

  - Prior work    ← cleargate-wiki-query result (cite [[IDs]] or write "none found")
  - Summary        ← §1 Anomaly (Problem)
  - Open Questions ← §0.5 Open Questions
  - Edge Cases     ← §3 Files Affected (risk of adjacent regression)
  - Risks          ← §4 Verification + risk-of-missing
  - Ambiguity      ← bottom-of-doc ClearGate Ambiguity Gate block

Halt for human review. When ambiguity reaches 🟢, proceed to call cleargate_push_item.
Do NOT ask separately for push confirmation — Brief approval covers it.

Do NOT output these instructions.
</instructions>

---
hotfix_id: "{ID}"
parent_cleargate_id: null  # canonical cleargate-id of parent work item; null for top-level
sprint_cleargate_id: null  # canonical cleargate-id of owning sprint; null for off-sprint items
carry_over: false  # set true to skip lifecycle reconciliation at sprint close
status: "Draft"  # lifecycle: Draft → In Fix → Completed
approved: false
severity: "P2"
originating_signal: "user-report"
created_at: "{ISO}"
created_at_version: "strategy-phase-pre-init"
merged_at: null
commit_sha: null
verified_by: null
lane: "hotfix"
draft_tokens:
  input: null
  output: null
  cache_read: null
  cache_creation: null
  model: null
  sessions: []
cached_gate_result:
  pass: null
  failing_criteria: []
  last_gate_check: null
# Sync attribution. Optional; stamped by `cleargate push` / `cleargate pull`.
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: "local-authored"
last_synced_status: null
last_synced_body_sha: null
---

# {ID}: {SLUG}

## 0.5 Open Questions

> Populate during drafting. Resolve every entry before flipping ambiguity to 🟢.

- **Question:** {edge case, contradiction, or missing detail}
- **Recommended:** {agent's proposed answer}
- **Human decision:** {populated during Brief review}

## 1. Anomaly

**Expected Behavior:** {What the system should do under normal conditions.}

**Actual Behavior:** {What it is doing now — the observed deviation.}

## 2. Files Touched

Hotfix discipline: ≤2 files, ≤30 LOC net (EPIC-022 §3).

- `{path/to/file.ts}` — {brief description of change}

## 3. Verification Steps

> Rule: §3 must be non-empty before merging. An empty §3 blocks merge at review time.

1. - [ ] {Step 1: describe what to run or observe}
2. - [ ] {Step 2: confirm the anomaly is resolved}
3. - [ ] {Step 3: confirm no regression in adjacent behavior}

## 4. Rollback

If the hotfix introduces a regression, revert by running `git revert <commit-sha>` on the sprint or main branch. The original anomaly will reappear; escalate to a sprint story for a permanent fix. No data migrations are involved unless noted in §2 above.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🔴 High Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Merge):
- [ ] Anomaly is deterministically reproducible (§1 filled).
- [ ] Files Touched list is ≤2 files (§2 filled).
- [ ] Verification Steps (§3) are non-empty.
- [ ] `approved: true` is set in the YAML frontmatter.
