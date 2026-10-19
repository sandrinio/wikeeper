---
cr_id: CR-006
parent_ref: STORY-004-02 | STORY-001-10
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Completed
approved: true
approved_by: human ("Approve (Recommended)" on the CR-006 Brief, 2026-10-19)
context_source: CI runs 39247882309, 39233999660, 39228902744 and 39232774058; local profile of the cold search; human request "we got to fix those please now" (2026-10-19)
created_at: 2026-10-19T12:20:00Z
updated_at: 2026-10-19T12:15:26Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-19T12:15:26Z
  transition: ready-to-apply
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id CR-006
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-19T12:05:16Z
  sessions: []
---

# CR-006: Timing checks that measure the code, not the CI runner

## 0.5 Open Questions

- **Question:** Where should the 500 ms search check run?
- **Recommended:** Keep the rule exactly as STORY-004-02 R8 wrote it (p95 of 30 cold searches on 500 pages under 500 ms). It runs on any developer machine and on the Linux CI runners, and is skipped on the macOS and Windows CI runners. The evidence: a cold search takes about 280 ms here (p95 about 300 ms), but the CI runners' averages range from about 185 ms (Linux) to about 475 ms (macOS), worked out from the test's run time over 31 searches. macOS failed it four times today (p95 513–615 ms) with unchanged code, and Windows averages about 385 ms. The time is real work: about half of a cold search builds the full-text index for about 4,000 sections, which is what the cache (STORY-004-06) skips. So there is no defect a small change would fix. STORY-004-02's mitigation says the lever is "the cache, not a looser budget", and this keeps the budget.
- **Alternatives:** (b) run it on every runner, with a CI-only limit of 1,000 ms; that loosens the budget on CI, which STORY-004-02 ruled out. (c) Make the cold search faster; that is a story with the Architect, since ranking must stay identical, and it doesn't fit here.
- **Human decision:** approved as recommended (2026-10-19).

- **Question:** What fixes the build-info timeout?
- **Recommended:** Give `test/build-info.test.ts` a 30 s timeout. Its tests spawn git up to four times plus Node, and on Windows runners that takes 0.4–1 s, once 6.5 s, against vitest's default of 5 s. The test checks the stamp, not speed, so the assertions stay as they are.
- **Human decision:** approved as recommended (2026-10-19).

- **Question:** How is it proven before main?
- **Recommended:** As for HOTFIX-001: on a `cr/CR-006` branch, open a draft PR to main so CI runs all six jobs. Merge to main and push only when all six pass, with search-perf shown as skipped on macOS and Windows and passing on Linux.
- **Human decision:** approved as recommended (2026-10-19).

## 1. The Context Override (Old vs. New)

**Obsolete Logic (What to Remove / Forget):**
- The search-perf check runs with the same 500 ms limit on all six CI runners, so it measures the runner as much as the code. The flashcard advice "re-run the job, and don't read it as a regression" is the workaround.
- `test/build-info.test.ts` relies on vitest's default 5 s timeout for tests that spawn git and Node.

**New Logic (The New Truth):**
- `test/search/search-perf.red.node.test.ts` runs its one check unless `CI` is `"true"` and the platform isn't Linux; on macOS and Windows CI runners vitest reports it as skipped. The 500 ms limit, the 30 runs, the warm-up and the fixture are unchanged. The other three perf files still run on all six runners.
- `test/build-info.test.ts` gives its tests a 30 s timeout; their assertions are unchanged.

## 2. Blast Radius & Invalidation

- [x] Invalidate/Update Story: none downstream. [[STORY-004-02]] (Completed) keeps its R8 rule word for word; only the CI runners that enforce it change. [[STORY-001-10]] (Completed) keeps its build-info assertions. Neither is reopened.
- [x] Invalidate/Update Epic: none.
- [x] Database schema impacts? No.

## Existing Surfaces

- **Surface:** `test/search/search-perf.red.node.test.ts:28` — the cold-search p95 check; `:39` asserts `p95 < 500`.
- **Surface:** `test/build-info.test.ts:47` — the `scripts/build-info.mjs` suite; `:48` is the test that timed out on Windows.
- **Surface:** `.github/workflows/ci.yml:28` — runs `npm run test:perf` on all six runners; unchanged.
- **Why this CR extends rather than rebuilds:** both checks stay and keep their assertions; only where the search check runs and how long the build-info tests may take change.

## Prior work

- none found: the wiki has no entry on the perf checks, CI flakiness or build-info. The grep of `.cleargate/delivery/archive/` finds [[STORY-004-02]] (the 500 ms rule and its mitigation), [[STORY-004-07]] and [[SPRINT-03]] (the check fails in a full parallel run; re-run it alone), [[STORY-001-10]] (build-info) and [[HOTFIX-001]] (the macOS failures on its draft PR). FLASHCARD has the #ci #perf #macos card (2026-10-19) and two #test-harness #perf cards (2026-10-17).

## 3. Execution Sandbox

**Modify:**
- `test/search/search-perf.red.node.test.ts`
- `test/build-info.test.ts`

## 4. Verification Protocol

**Command/Test:** `npm run typecheck && npm test && npm run test:perf` locally (search-perf runs and passes), then `CI=true npx vitest run test/search/search-perf.red.node.test.ts` on macOS (1 skipped), then the draft PR's CI: all six jobs pass.

**Result (2026-10-19):** commit e2ad747, merged to main as c6bae18. Local macOS: typecheck clean; 2306 passed, 1 skipped; `test:perf` 5/5 with search-perf run; `CI=true` skips it (and the fixture isn't generated), `CI=false` runs it. CI run 39250158952 on draft PR #2: all six jobs pass; `test:perf` is 5 passed on both Linux jobs (search-perf 7.7 s and 9.6 s for 31 searches) and 4 passed, 1 skipped on both macOS and both Windows jobs; build-info's slowest test took 0.36 s and 0.86 s on Windows.

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One way through: the test runs, or vitest skips it. |
| Interfaces | F | Tests only; no CLI, hook or agent text changes. |
| Data | F | The fixture is unchanged. |
| Rules | T | Where the 500 ms rule is enforced, and the build-info timeout. |

```gherkin
Feature: Timing checks that measure the code, not the CI runner

  @rules
  Scenario: The 500 ms rule still runs on developer machines and Linux CI
    Given CI is unset, or CI is "true" on Linux
    When npm run test:perf runs
    Then the search-perf check runs with p95 under 500 ms over 30 cold searches on 500 pages

  @rules
  Scenario: macOS and Windows CI runners skip only that check
    Given CI is "true" on macOS or Windows
    When npm run test:perf runs
    Then vitest reports the search-perf check as skipped
    And the cache, status-line and update-check perf checks still run

  @rules
  Scenario: The build-info tests have time to spawn git
    Given test/build-info.test.ts
    Then its tests run with a 30 s timeout
    And their assertions are unchanged
```

**Test layers.**

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 0 | Test-only change; no product code. |
| Integration tests | 0 | Nothing runs differently in the product. |
| E2E / acceptance tests | 2 | The search-perf check (run locally, skipped with `CI=true` on macOS) and the five build-info tests. |

---

## Context Source

**context_source:** CI runs 39247882309 (attempt 1: macOS Node 22 p95 574 ms; Windows Node 24 build-info 6.5 s timeout), 39233999660 (macOS Node 24 p95 615 ms), 39228902744 and 39232774058; per-runner run times of the search-perf test; a local CPU profile of 30 cold searches (index build about 53%, page parsing about 13%); the human's request "we got to fix those please now" (2026-10-19).

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] "Obsolete Logic" to be evicted is explicitly declared.
- [x] All impacted downstream Epics/Stories are identified and reverted to 🔴 High Ambiguity.
- [x] Execution Sandbox contains exact file paths.
- [x] Verification command is provided.
- [x] `approved: true` is set in the YAML frontmatter.
- [x] Existing Surfaces cites at least one source-tree path the CR extends.
