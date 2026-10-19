<instructions>
USE THIS TEMPLATE FOR EMERGENCY HOTFIXES ONLY — production anomalies requiring immediate fix outside the sprint cycle. Hotfix discipline: ≤2 files, ≤30 LOC net.

FOLLOW THIS EXACT STRUCTURE. Output sections in order 0.5–4.
YAML Frontmatter: Hotfix ID, severity, originating signal, lane: "hotfix".
§0.5 Open Questions: Capture any remaining ambiguity before merge.
§1 Anomaly: Expected vs. Actual behavior.
§2 Files Touched: ≤2 files (constraint from EPIC-022 §3).
§3 Verification Steps: Non-empty before merging (blocks merge if empty).
§4 Rollback: Git revert instructions.
Output location: .cleargate/delivery/pending-sync/HOTFIX-001_windows-home-path-test.md

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
hotfix_id: HOTFIX-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
approved_by: "human (Brief approved as written, 2026-10-19)"
severity: P1
originating_signal: ci-failure
created_at: 2026-10-19T09:20:55.691Z
created_at_version: strategy-phase-pre-init
merged_at: "2026-10-19T09:57:00Z"
commit_sha: "99bbf42"
verified_by: "CI run 39232774058 on draft PR #1 (6/6 jobs, attempt 3)"
lane: hotfix
draft_tokens:
  input: null
  output: null
  cache_read: null
  cache_creation: null
  model: null
  sessions: []
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-19T09:22:07Z
  transition: ready-for-merge
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
---

# HOTFIX-001: Windows home-path test mixes separators

## 0.5 Open Questions

- **Question:** Fix the test or the code?
- **Recommended:** The test only. `shownUserFile` compares against `path.sep`, and in real use both of its inputs come from the host `path` module (`os.homedir()` and `path.join`, which on Windows also turns `/` into `\`), so `~/.claude/settings.json` is shown correctly on Windows. The test passes home as the POSIX string `"/h"` but builds the file with `path.join`, which gives `\h\.claude\settings.json` on Windows, so the two never match.
- **Human decision:** approved as recommended (2026-10-19).

- **Question:** How is the fix proven before it reaches main, when macOS can't reproduce it?
- **Recommended:** On a `hotfix/HOTFIX-001` branch, open a draft PR to main so CI runs all six jobs (ubuntu, macOS, Windows × Node 22, 24). The Windows jobs stopped at `npm test`, so `test:perf` and `build` have not run on Windows for SPRINT-04 yet. If any other step fails there, stop and report rather than widen this hotfix. Merge to main only when all six pass, then push the `v0.4.0` tag.
- **Human decision:** approved as recommended (2026-10-19).

## 1. Anomaly

- **Expected Behavior:** `npm test` passes on every CI platform, as it does on ubuntu and macOS.

- **Actual Behavior:** CI run 39228902744 (main at 12bf729) fails on windows-latest, Node 22 and 24: `test/statusline.test.ts > user settings file > shows the home directory as ~` expects `~/.claude/settings.json` and gets `/h/.claude/settings.json`. It is the only failing test (185 of 186 files pass). Reproducible on every Windows run.

## 2. Files Touched

Hotfix discipline: ≤2 files, ≤30 LOC net (EPIC-022 §3).

- `test/statusline.test.ts` — line 70: build the home argument with the host path module too (`path.join("/h")`), so the file path and home share one separator on every platform. One line changed; no product code.

## 3. Verification Steps

> Rule: §3 must be non-empty before merging. An empty §3 blocks merge at review time.

- [x] 1. Locally: `npm run typecheck`, `npm test` and `npm run test:perf` pass on macOS.
- [x] 2. Draft PR CI: `test (windows-latest, 22)` and `test (windows-latest, 24)` pass, including `test:perf` and `build`.
- [x] 3. Draft PR CI: the four ubuntu and macOS jobs still pass; the commit changes only `test/statusline.test.ts`.

**Result (2026-10-19):** fix commit 99bbf42, merged to main as c9af2f4. Local macOS: typecheck, 2306 tests and 5 perf tests pass. CI run 39232774058 on draft PR #1: both Windows jobs pass, including `test:perf` and `build`. macOS Node 22 failed twice on `test/search/search-perf.red.node.test.ts` (p95 524 ms, then 513 ms, against 500 ms; the same job passed on main at 12bf729 an hour earlier and this commit doesn't touch search) and passed on the third attempt; the other five jobs passed first time.

## 4. Rollback

If the hotfix introduces a regression, revert by running `git revert <commit-sha>` on the sprint or main branch. The original anomaly will reappear; escalate to a sprint story for a permanent fix. No data migrations are involved unless noted in §2 above.

## Prior work

none found: the wiki has no Windows or statusline entry. Related lessons in `.cleargate/FLASHCARD.md`: the #ci #windows card ("open the sprint→main draft PR early to see Windows before close", not applied in SPRINT-04) and the #windows #test-harness cards on host path modules. The code under test is from STORY-007-06 (SPRINT-04).

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Merge):
- [x] Anomaly is deterministically reproducible (§1 filled).
- [x] Files Touched list is ≤2 files (§2 filled).
- [x] Verification Steps (§3) are non-empty.
- [x] `approved: true` is set in the YAML frontmatter.
