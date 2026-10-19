---
sprint_id: "SPRINT-04"
status: "Draft"
generated_at: "2026-10-19T06:30:00Z"
generated_by: "Reporter agent"
template_version: 2
---

<!-- role: reporter -->

# SPRINT-04 Report: Token gauges and fact archive

**Status:** Shipped (19/19 Done; `sprint/S-04` not yet merged to main: Gate 4 pending, `close_sprint.mjs` Step 2.8 waits for the human)
**Window:** 2026-10-18 to 2026-10-19 (two calendar days; first ledger row 2026-10-18 15:52Z, last 2026-10-19 06:24Z; walkthrough, BUG-003, consolidation, the new-user test, BUG-004 and BUG-005 in between)
**Stories:** 16 planned / 16 shipped / 0 carried over, plus BUG-003, BUG-004 and BUG-005 (added mid-sprint, all shipped): 19/19 Done
**Branch:** `sprint/S-04` at `c3077e8` (BUG-004 and BUG-005 archived as Completed). The first report was written at `17aaaa7`; this refresh adds the new-user test, BUG-004 and BUG-005. Consolidation `f919a74` kept. Nothing has been pushed. Steps 1-2.7 of close passed for the 17 items of the first report (lifecycle clean, 81 artifacts); close must be re-run for the 19.
**Epics:** EPIC-007 (7 stories; BUG-004 and BUG-005 are filed under it), EPIC-008 (6), EPIC-009 (3); all three archived at close prep.

---

## §1 What Was Delivered

### User-Facing Capabilities
- **Sizes in tokens.** A dependency-free estimator (STORY-007-01) gives each document, page and the wiki a figure shown as `≈12k`. `status` shows the wiki and page sizes, the finish report and search hits carry them, `read` and `ingest start` show a document's size, `ingest plan` estimates, and `wikeeper statusline` (with `--install`) renders `wiki ≈70k tokens · 56 pages · largest page ≈6.5k 🟡`. Documents and pages have green/yellow/red levels; the wiki total is a number with no level.
- **Approval before a large document.** `ingest start` exits 3 (`needs_approval`) for a source above the approval limit and registers it only with `--approved`.
- **Limits from the CLI.** `wikeeper config get | set | unset` (STORY-007-02); `init` writes the five token limits (page 4k/10k, document 20k/60k, approval at yellow).
- **Fact archive.** Outdated facts move to `.wiki/archive/` in the write phase (008-01); `ingest finish` enforces a conservation rule so no fact is lost (008-02); `index.md` is built from `pages/` only and `search --archive` plus history searches find archived facts (008-03); lint covers the archive (008-04); `status` shows the archive size and candidates, and `remove`, `--purge` and `private:` cover the archive (008-05).
- **Version check and upgrade.** One npm registry GET at most once a day (1.5 s timeout, 64 KB cap, never blocks a command); `status` and `doctor` warn that project files are older than the installed version; `wikeeper upgrade` (and `--check`) updates the install (009-01, 009-02).
- **Agent text and docs.** WIKI.md, SETUP.md, skills, sub-agent prompts, pointer block, README and architecture.md explain sizes, the red-page notice, the archive and the upgrade flow (007-07, 008-06, 009-03). Allow rules cover the new read-only commands. Package version 0.3.0 to 0.4.0 (`0.4.0+<sha>` stamp); npm publish is a separate step after Gate 4.
- **BUG-003 fix.** The pointer block's line 4 now says to show the size in the first reply and where the red-page rule lives; `update` replaces the 0.3.0 and unreleased 0.4.0 blocks and leaves a hand-edited one.
- **BUG-004 fix (from the new-user test).** Setup measures a named document with `read` and tells the user its size in tokens before reading it (the 29k-token PRD in the test was read after only "~75 KB"); no size is guessed before it is measured; the agent no longer names commands, flags, codes or settings keys to the user; setup steps number 1 to 8 without restarting; the permission patterns are used, not shown as a table. Merged `0b547ad`. Its re-walk passed every rule but one (the size line was first text in 0 of 3 fresh sessions).
- **BUG-005 fix.** The pointer block and WIKI.md now say when to write the size line: start each session with the check and write its line before any other step or text. Re-walk: size line first text in 3 of 3 fresh sessions; the red-page notice told once in plain words (two pages named, both choices), no command named. Merged `f9a7a09`.

### Internal / Framework Improvements
- 10 frozen contracts (`contract/S-04-*` branches, C1-C10) and `plans/waves.json` let builds start before upstream merges; execution waves labelled A-U in the log. The 10 contract branches are kept after close.
- Consolidation `f919a74` (code-simplifier, QA consolidation mode GREEN): shared `installedVersion` / `filesVersion` / `readFilesVersion` in `core/update-check` (used by status, doctor, upgrade), one `rootOf`, search `hitFile` reusing lint's `pagePath` / `archivePath`, one `copyTree` in `takeSnapshot`, merged duplicate blocks in ingest apply, ingest finish, upgrade and `parseConfigValue`. No output, envelope, exit code or file format change.
- Tests: 1684 at kickoff; 2034 after wave L; 2287 after the last story; 2294 (1 win32-only skip) after BUG-003 and consolidation; 2306 after BUG-004; 2311 (1 skip, 190 files) after BUG-005. `npm run test:perf` 5/5 at each merge.
- Privacy: before kickoff all testing moved to the fictional testbed and private names were removed from the tree and, with approval, from the git history (0 hits; 1684/1684 tests after the rewrite); the repository was recreated and clean history pushed.
- No new runtime dependency.

### Goal Acceptance Check (evidence)
The check has two parts (sprint-context.md). This section records evidence only; the verdict is spoken in the Brief, not written here.
1. **Mechanical: PASS** (§4 log entry "Goal Acceptance Check, mechanical part"). On the merged tree: typecheck, full suite (2287/0 at the time) and `test:perf` (5/5) pass; a packed build prints `0.4.0+30eb5dd`; on a testbed scratch copy `tokens.page_count` is 56, `tokens.wiki` is 70,319 (-4.2% against 73,369, inside +/-15%), `version.files` is `0.3.0`, and the human `status` output prints the line telling the user to run `wikeeper update`. The copy was unchanged afterwards.
2. **Behavioural: walkthrough part 4, "ends with no ❌".** Run by the orchestrator at the human's choice (orchestrator walkthrough notes; 18 headless turns, about $9.02, 15 before BUG-003 and 3 re-walk turns). Rows as written:
   - Size at session start: first pass ❌ (shown in 1 of 5 fresh sessions); after BUG-003, ✅ 3 of 3 (shown, not always first); after BUG-004 the line was first text in 0 of 3 fresh sessions; after BUG-005 (`0.4.0+706b88d`, three copies after `update`) it is first text in 3 of 3. In 2 of those 3 it also opens the answer, so it shows twice (review feedback, §4.3).
   - Large document not read before a yes, size told: ✅ (with a 🟡 peek of about 4 KB of 75 KB before asking, recorded as review feedback).
   - Limit changed in plain words: ✅.
   - Red page told once: first pass ❌ in a fresh session; after BUG-003, ✅ (told once in the first reply, both pages named, nothing changed); after BUG-005, ✅ again (told once, in plain words, both pages over the limit and both choices, no command, flag, code or settings key named).
   - Clean-up moves outdated facts to the archive, `ingest finish` clean, facts found by `search --archive`: ✅.
   - Project files from 0.3.0: `update` ran only after a yes (✅), but the agent told the user they were out of date in 1 of 3 copies, weakly and without a question; the "no" path was never reached. **This row still shows a ❌/🟡; BUG-004 and BUG-005 did not touch it.** Cause: with 0.3.0 files the agent follows 0.3.0's WIKI.md, which knows no `version` key, and `status --json` carries no warning to relay. The human accepted it as a one-time 0.3.0 to 0.4.0 limit (UR:review-feedback, §4.3). It was accepted, not fixed.
   - `upgrade` against a newer npm version is covered by tests with an injected fetch and npm runner, as the check states.

### Carried Over
No story or bug is carried over. Proposed follow-ups (not signed off; see §4.3 and the plan's "Not in this sprint"): the CR ideas listed in §4.3, a lighter path for text-only fixes in SPRINT-05 (§4.3, §6), the Gate-4 `architecture.md` / doc refresh checklist, and the 0.4.0 npm publish (separate approval).

**Handoff for the human (only the human edits `docs/ux.md`):** `docs/ux.md` Appendix A.21, A.22 and A.23 are fixed by BUG-004 and need the human's edit to the guide.

---

## §2 Story Results + CR Change Log

Each story is one merge on `sprint/S-04` (SHA from the plan §4). All 19 lanes are `standard`. `state.json` records qa=0 arch=0 for all 19; it does not capture the red-test defects, blocked integrations and Architect post-flight FAILs the plan log records, which are written out below as CR events (no CR token was recorded for them at the time; classification here is the Reporter's reading of the log). Complexity is not recorded in the bundle.

### STORY-007-01: Token estimator, `tokens` limits, limits written by `init`
- **Status:** Completed. **Commit:** `1a58b9a`. **Bounce count:** qa=0 arch=0 (state.json)
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | red-test defect (no CR token) | Two red defects: `snapshotTree` read symlinked skill dirs; S5 ran `init --yes` with `agents: []` (exits 5 by design). Fixed by QA-Red (`ae312da`); implementation kept and resumed | none recorded |
- **UR Events:** none

### STORY-007-02: `config get | set | unset`
- **Status:** Completed. **Commit:** `93e7565`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | `content_dir` refusal also names `archive/` (under `content_dir` since 008-01); found in the M3 plan before red tests | none |
- **UR Events:** none

### STORY-007-03: Document size in `read` and the size approval at `ingest start`
- **Status:** Completed. **Commit:** `fb35d25`. **Bounce count:** qa=0 arch=0
- **CR Change Log:** none. **UR Events:** none

### STORY-007-04: `ingest plan` estimates
- **Status:** Completed. **Commit:** `d774484`. **Bounce count:** qa=0 arch=0
- **CR Change Log:** none (Architect post-flight PASS). **UR Events:** none

### STORY-007-05: Wiki and page sizes in `status`, finish report, search hits, lint
- **Status:** Completed. **Commit:** `3f6c43c`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | red-test defect (no CR token) | Order-dependent red test (`setLintHook(null)` never restored); fixed by QA-Red `8c80eb6` | none recorded |
  | 2 | red-test defect (no CR token) | Four red fixtures too small for the real estimator (a "12k" page measured 9,770, below red at 10k); QA-Red rebuilt them with `estimateTokens` | none recorded |
- **UR Events:** none. QA report file was not written the first time; QA re-verified before merge.

### STORY-007-06: `wikeeper statusline` and `--install`
- **Status:** Completed. **Commit:** `63ba64c`. **Bounce count:** qa=0 arch=0
- **CR Change Log:** none (re-synced once over 007-02's `src/program.ts`; Architect post-flight PASS). **UR Events:** none

### STORY-007-07: Token instructions, allow rules, docs, 0.4.0
- **Status:** Completed. **Commit:** `ed62139`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | R5 (e) adds `oversized-page` to WIKI.md's finish-findings list (M1 plan) | none |
  | 2 | CR:spec-clarification | Gate 1 decision 22 (Q7) approved but missing from the body: `likely_scanned` row, `data.tokens_rough`, scenario-1 row (M2 plan) | none |
  | 3 | CR:spec-clarification | Blocked at integration: red row expected every `config get tokens` line "(default)" after `init --yes`; resolved to the owners' semantics, QA-Red re-scoped the row | none |
- **UR Events:** none

### STORY-008-01: The archive in the write phase
- **Status:** Completed. **Commit:** `ff82c27`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | Timing check names a scratch copy of the testbed (M2 plan) | none |
- **UR Events:** none

### STORY-008-02: Conservation rule at `ingest finish`
- **Status:** Completed. **Commit:** `49ed7aa`. **Bounce count:** qa=0 arch=0
- **CR Change Log:** none. Deviation at build: the M3 plan's seeded property test was not written; added (`ee6ecef`) before integration. **UR Events:** none

### STORY-008-03: `index.md` from `pages/` only, `search --archive`, archived facts in history searches
- **Status:** Completed. **Commit:** `bde0ffa`. **Bounce count:** qa=0 arch=0
- **CR Change Log:** none. **UR Events:** none

### STORY-008-04: Lint covers the archive
- **Status:** Completed. **Commit:** `e735ac1`. **Bounce count:** qa=0 arch=0
- **CR Change Log:** none. Closes the known `index-drift` gap between the 008-03 and 008-04 merges. **UR Events:** none

### STORY-008-05: Archive in `status`; `remove`, `--purge`, `private:` cover the archive
- **Status:** Completed. **Commit:** `9e797ee`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | red-test defect (no CR token) | Build BLOCKED on a red fixture (roadmap.md measured 109 tokens against a test red limit of 100); QA-Red fixed (`763a138`) | none recorded |
- **UR Events:** none

### STORY-008-06: Archive instructions and docs
- **Status:** Completed. **Commit:** `0665a7c`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | R6 (a) names `wikeeper search "launch date" --archive`; R5 (e) adds the archive alias sentence to the `broken-link` row (M4 plan) | none |
  | 2 | red-test defect (no CR token) | Blocked at integration: two red rows filtered archive hits by `path === "archive/…"` against owner 008-03's contract (K11: `file`, `archived: true`); QA-Red re-scoped both rows | none recorded |
- **UR Events:** none

### STORY-009-01: Version check and version warnings
- **Status:** Completed. **Commit:** `9f8e939`. **Bounce count:** qa=0 arch=0 (state.json)
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | R10 doctor warnings print the step once, on the `fix:` line; Q7's WIKI.md order corrected (M4 plan) | none |
  | 2 | Architect post-flight FAIL (test-only) | A "does nothing outside a wiki" test passed without testing anything (`runIngestUpdateCheck(new Command())` throws and its own catch swallows it); a config-syntax-error hook test was missing. Developer fixed both | not recorded in state.json |
- **UR Events:** none. The Developer compared against a `git stash` of its own changes, against the standing rule; no damage found, stash now forbidden in prompts.

### STORY-009-02: `wikeeper upgrade`
- **Status:** Completed. **Commit:** `4bc6173`. **Bounce count:** qa=0 arch=0 (state.json)
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | Architect post-flight FAIL (code) | Four findings: update-step runner calls had no catch (rejection surfaced as `ENOENT` with null details, outside K16's five codes); DEP0190 on Node >= 24; four `--check` lines named a command upgrade never runs or gave no next step (ux.md §1.3, §8); no EPERM test. Developer fixed all four | not recorded in state.json |
- **UR Events:** none

### STORY-009-03: Upgrade instructions and docs
- **Status:** Completed. **Commit:** `30eb5dd`. **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | Blocked at the Developer: 008-06's red row pinned README's range `D-01`-`D-37`, 009-03 R4 (c) makes it `D-01`-`D-38`; later approved text stands; QA-Red re-scope #20 | none |
  | 2 | CR:spec-clarification | Orchestrator error, not an agent defect: the first re-scope instruction kept a bare `D-37` phrase that only the range contained; Developer blocked again; wave T had QA-Red drop it (`abb6f9e`) | none |
- **UR Events:** none

### BUG-003: Session-start size line not shown (walkthrough UR:bug)
- **Status:** Completed. **Commit:** `26ffa53` (green `8c2dcb6`). **Bounce count:** qa=0 arch=0
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | Re-scopes #21-#24 (two more than the bug named: token-instructions.red's WIKI.md phrase and archive-instructions.red's agent-block.md pin), recorded as BUG-003 Q5; QA-Red `cb5fc34` | none |
- **UR Events:**
  | # | Event type | Feedback | Tax impact |
  |---|---|---|---|
  | 1 | UR:bug | Size line shown at session start in 1 of 5 fresh sessions (the agent read "open each session with the size" as "run `statusline`") | Bug-Fix Tax +1 |
  | 2 | UR:bug | Red page not told in a fresh question-only session (the red-page rule lives only in WIKI.md "Lint and status"). Same cause as row 1; one fix | counted with row 1 as one bug item; Bug-Fix Tax +1 for the second row |

### BUG-004: Setup size gap and agent voice (new-user test UR:bug)
- **Status:** Completed. **Commit:** `109abf3` (QA-Red `de6cf14`, merge `0b547ad`). **Bounce count:** qa=0 arch=0. Architect plan `plans/M7.md` (wave V GREEN); the plan took about 40 minutes.
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | M7 plan corrections C1-C4 accepted as wording fixes: C1 "sizes the CLI printed" passes the sealed vocabulary checks; C2 temp-folder `--out`; C3 measure without `--json` (which prints the whole text); C4 "Use" the permission table, not "Show" | none |
  | 2 | CR:scope-change (human decision Q9) | The human chose to fix five more sentences that contradict the plain-words rule; the Architect's grep added five of the same defect, included under that decision | none recorded |
  | 3 | CR:spec-clarification | Re-scopes #25-#30 (Q10) by QA-Red; the plan's scratch proofs: Developer edits alone, 16 fail in 6 sealed files; edits plus re-scopes, 2289 pass, 1 skip. QA-Red re-derived all nine plan hashes and they matched | none |
- **UR Events:**
  | # | Event type | Feedback | Tax impact |
  |---|---|---|---|
  | 1 | UR:bug | New-user test: setup read a 29k-token PRD (over the 20k limit) after saying only "~75 KB", and guessed "roughly 19k" before measuring (SETUP.md step 2 had no size check) | Bug-Fix Tax +1 |
  | 2 | UR:review-feedback | Same test: commands and flags named to the user (`doctor` told to the user), step numbers restarting, the permission-pattern table shown, a narration line before the size line. The human chose fix now, in the same item | Enhancement Tax +1 |
- **Verification:** Developer full suite 2306 passed, 1 skipped, 189 files; `test:perf` 5; QA PASS with scratch-build checks (fresh `init`, `update` of a 0.3.0 testbed copy with doctor clean, `read --out` without `--json` registers nothing); post-flight scan 0. Re-walk (`0.4.0+011f640`): setup measured the PRD and asked before reading it (about 29k, yellow) and offered parts; no unmeasured size; no command, flag, code or settings key in 15 texts; steps 1 to 8 without restart; three ingests clean, lint 0, doctor clean. One rule failed: size line first text in 0 of 3 fresh sessions, which became BUG-005.

### BUG-005: Size line not the first text of a fresh session (BUG-004 re-walk UR:bug)
- **Status:** Completed. **Commit:** `582c2f9` (QA-Red `1de7f93`, merge `f9a7a09`). **Bounce count:** qa=0 arch=0. **No Architect plan** (human decision Q2; a first for this project).
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:spec-clarification | QA-Red found the re-scopes itself, by phrase and hash grep, in six sealed red files, and proved the set complete by running the full suite on a temp copy with the template edits applied. The wording was tested first by the orchestrator in scratch copies (8 of 8; a fitted 199-unit version was first in 2 of 3, so line 3 took the clause instead) | none |
- **UR Events:**
  | # | Event type | Feedback | Tax impact |
  |---|---|---|---|
  | 1 | UR:bug | BUG-004 re-walk: size line first text in 0 of 3 fresh sessions (two narration lines first, one never shown) | Bug-Fix Tax +1 |
  | 2 | UR:review-feedback | BUG-005 re-walk: in 2 of 3 sessions the size line also opens the answer, so it shows twice | Enhancement Tax +1 (not fixed; §4.3) |
- **Verification:** Developer full suite 2311 passed, 1 skipped, 190 files; `test:perf` 5; QA PASS with scratch-build `init` and `update` checks; post-flight scan 0. Files changed by the fix: `templates/agent-block.md`, `templates/system/WIKI.md`, `src/agents/shipped-blocks.ts` (new block appended), `architecture.md`, `docs/ux-map.md`, one test. Re-walk: size line first text 3 of 3; the red session told the user once in plain words.

---

## §3 Execution Metrics

| Metric | Value |
|---|---|
| Stories planned | 16 (+ BUG-003, BUG-004, BUG-005 added mid-sprint = 19 work items) |
| Stories shipped (Done) | 19 (16 stories + 3 bug items) |
| Stories escalated | 0 |
| Stories carried over | 0 |
| Fast-Track Ratio | 0% (all 19 `standard`) |
| Fast-Track Demotion Rate | N/A (no fast-lane story) |
| Hotfix Count (sprint window) | 0 (`wiki/topics/hotfix-ledger.md` absent; fallback to 0) |
| Hotfix-to-Story Ratio | 0 |
| Hotfix Cap Breaches | 0 |
| LD events | 0 |
| Total QA bounces | 0 (state.json); see "Unrecorded round-trips" below |
| Total Arch bounces | 0 (state.json); 2 post-flight FAILs in the log (009-01, 009-02). BUG-005 ran with no Architect plan; BUG-004 had one (M7, about 40 minutes) |
| CR:bug events | 0 (none tagged with the token) |
| CR:spec-clarification events | 9 as rows in §2 (007-02; 007-07 x3; 008-01; 008-06; 009-01; 009-03 x2) plus BUG-003 re-scopes (#21-#24), BUG-004 (C1-C4 wording corrections; re-scopes #25-#30) and BUG-005 (re-scopes found by QA-Red); the plan log has 6 plan/wave-level entries before BUG-003 |
| CR:scope-change events | 1 (BUG-004 Q9, five more sentences by human decision; untagged in the log) |
| CR:approach-change events | 0 |
| UR:bug events | 4 rows, 3 bug items (BUG-003 two rows, BUG-004, BUG-005) |
| UR:review-feedback events | 6 (§4.3: 3 from the walkthrough, 1 from the new-user test, 2 from the BUG-005 re-walk and BUG-004 plan cost) |
| Circuit-breaker fires: test-pattern | 0 |
| Circuit-breaker fires: spec-gap | 0 |
| Circuit-breaker fires: environment | 0 |
| **Bug-Fix Tax** | 15.8% (3 bug items / 19); 21.1% if all 4 UR:bug rows are counted |
| **Enhancement Tax** | 31.6% (6 / 19); 2 of the 6 (new-user wording findings) were folded into BUG-004 rather than deferred |
| **First-pass success rate** | 100% by state.json (19/19 at qa=0, arch=0). By the plan log, 11/19 (57.9%) passed with no BLOCKED build, red-test fix, or post-flight FAIL (BUG-003, BUG-004 and BUG-005 count as passes: their re-scopes were planned QA-Red work); the 8 others are 007-01, 007-05, 007-07, 008-05, 008-06, 009-01, 009-02, 009-03 |
| Token source: ledger-primary | see split below |
| Token source: story-doc-secondary | N/A (no `token_usage` / `draft_tokens` in the dev/qa reports) |
| Token source: task-notification-tertiary | N/A (not supplied). Out of ledger (orchestrator notes, corrected 2026-10-19: a resumed `claude -p` session reports a running total, so each session counts once at its last figure; the earlier $13.20 figures summed running totals): walkthrough 18 headless turns, about $9.02; new-user test 12 turns, about $4.78; BUG-004 re-walk 15 turns, about $5.68; BUG-005's scratch experiments 11 sessions, about $5.03; BUG-005 re-walk 3 turns, about $1.87; all headless, about $26.38; designer DRAFTS runs (designer is not in the ledger's dispatch allow-list, CR-004). Headless walkthrough spend is not in the token ledger |
| Token divergence (ledger vs task-notif) | not computable (no task-notification total) |
| Token divergence flag (>20%) | YES, on the sprint-work vs sprint-total comparison (below) |

### Token cost (CR-035 split)

```
Token cost (sprint work, dev+qa+architect): 24,300,268,009   (pre-computed; NOT reliable, see below)
Token cost (Reporter analysis pass):        TBD — see token-ledger.jsonl post-dispatch
Token cost (sprint total):                  1,163,615,322    (bundle sprint_total_tokens; the first report read 1,054,390,072, so +109,225,250 since)
```

The sprint-work figure is about 20.9x the sprint total, which cannot be true (work is a subset of the total); the first report had 17.7x. The ledger's delta rows were summed over rows that mostly carry no attribution, and the same session's tokens appear to be counted across many rows. Treat 1,163,615,322 as the only usable figure, cumulative and orchestrator-session based; subagent work run in that session is inside it, not beside it. Caveat on reconciliation: at the time of this refresh `.session-totals.json` holds a single session entry (1,363,546 tokens, last row 06:24Z) that does not reconcile with the bundle's total, so the bundle value is used unreconciled. Divergence flag: YES (work vs total, far above 20%); because the Reporter-pass figure is TBD it is a Yellow finding here and in §6 Tooling.

**Attribution refusal (BUG-069).** No per-agent or per-story cost table is published. The `agent_type` census of the 478 ledger rows is: unattributed 443 (92.7%), devops 17, architect 8, qa 3, cleargate-wiki-query 3, reporter 2, developer 1, code-simplifier:code-simplifier 1. Rows with `agent_type: "unattributed"` carry an empty `story_id` and `work_item_id`: no dispatch marker was written for those dispatches. The share did not improve with BUG-004 and BUG-005 (the 88 rows added since the first report are almost all unattributed). The census is the finding. No historical row was repaired or rewritten.

Cost in USD is not stated: with 93% of rows unattributed and no current rate table in the bundle, any figure would be invented. The only dollar figures available are the headless walkthrough turns above, which are outside the ledger.

Wall time: first ledger row 2026-10-18 15:52:55Z, last 2026-10-19 06:24:17Z (about 14.5 h elapsed, with an idle night in between; the 5 h 14 min of the first report ended at 21:06Z). BUG-004's Architect plan took about 40 minutes; BUG-005 skipped that step.

**Unrecorded round-trips.** `state.json` shows zero bounces everywhere, yet the plan log has 6 blocked or redone steps tied to red-test defects and 2 Architect post-flight FAILs. Counters undercount the sprint's rework (see §6).

---

## §4 Observe Phase Findings

> Window: after the last story merge (`30eb5dd`, wave T) to the BUG-005 archive commit (`c3077e8`), 2026-10-18 to 2026-10-19. Source: sprint plan §4 and the orchestrator walkthrough notes (kept outside the repo; not copied here).

### 4.1 Bugs Found (UR:bug)
| Date | Description | Resolution | Commit |
|---|---|---|---|
| 2026-10-19 | Size line at session start shown in 1 of 5 fresh sessions, and the red-page notice missing in a fresh session; one cause (pointer-block line 4 "open each session with the size" read as "run `statusline`"; red-page rule only in WIKI.md "Lint and status") | BUG-003: line 4 reworded, `SHIPPED_BLOCKS` entry added, `update` replaces the old blocks. Re-walk with three fresh sessions: size line opens the first reply 3 of 3; with the page red limit at 6k the reply opens with the size, ends by naming both red pages and the two choices, nothing changed | `8c2dcb6` (merge `26ffa53`) |
| 2026-10-19 | New-user test (fresh throwaway folder, setup through the first source, a fresh session): setup read a 29k-token PRD without telling its size in tokens and guessed the size before measuring (SETUP.md step 2 had no size check) | BUG-004: setup measures a named document first and asks above the limit; no unmeasured size. Re-walk passed | `109abf3` (merge `0b547ad`) |
| 2026-10-19 | BUG-004 re-walk: the size line was the first text in 0 of 3 fresh sessions (two narration lines first, one never shown) | BUG-005: line 3/4 and one WIKI.md sentence say when to write the line (before any other step or text); wording tested 8 of 8 in scratch copies first. Re-walk: first text in 3 of 3 | `582c2f9` (merge `f9a7a09`) |

### 4.2 Hotfixes Triggered
| ID | Trigger | Resolution | Commit |
|---|---|---|---|
| (none) | — | — | — |

### 4.3 Review Feedback (UR:review-feedback)
| Date | Description | Status (folded / deferred) | Deferred to / Rationale |
|---|---|---|---|
| 2026-10-19 | Project files from 0.3.0: the agent told the user they were out of date in 1 of 3 copies, only from the human `status` output, without asking; never via `status --json`; "no" path never reached | Accepted by the human as a one-time 0.3.0 to 0.4.0 limit (0.3.0's WIKI.md knows no `version` key; from 0.4.0 on the agent is told). README's Upgrading section says to run `wikeeper update` after installing | CR idea: the files-older line in `status --json` warnings |
| 2026-10-19 | The agent names commands and flags to the user (`wikeeper doctor`, `wikeeper config set …`, `--archive`) against docs/ux.md's agent voice | Folded into BUG-004 (plain-words rule; the new-user test saw it again). Re-walk: no command, flag, code or settings key in 15 texts; BUG-005 re-walk the same | Whether the CR idea is closed is the human's call; docs/ux.md A.21-A.23 need the human's edit |
| 2026-10-19 | The agent peeked about 4 KB of a 75 KB document (`head -c 3000`, `sed` on 40 lines) before asking for approval; WIKI.md does not forbid it | Partly folded: BUG-004 makes setup measure a document before reading it. The general WIKI.md rule for later ingests is not shown as changed in the bundle | CR idea stays open unless the human says BUG-004 covers it |
| 2026-10-19 | New-user test wording findings (commands and flags named, step numbers restarting, the permission-pattern table, a narration line before the size line) | Folded into BUG-004 (fix now, human decision) | n/a |
| 2026-10-19 | BUG-005 re-walk: in 2 of 3 sessions the size line also opens the answer, so it shows twice | Deferred (not a goal row) | CR idea: say once at session start whether the answer repeats the line |
| 2026-10-19 | Architect cost of a text-only fix: BUG-004's plan took about 40 minutes for texts the orchestrator could test in scratch copies. BUG-005 ran with no Architect and QA-Red found and proved the re-scopes itself (wave W GREEN, 0 bounces) | Proposal | A lighter path for text-only fixes in SPRINT-05 (human to decide; not designed here) |

**Follow-up CR ideas for the next sprint** (orchestrator list): rename the six `E_` codes (also in the plan's "Not in this sprint"; changes `--json`); the files-older line in `status --json` warnings; the WIKI.md large-source rule; the agent-voice rule; plus the plan's design-review CRs C1-C8, C10-C12 and the `settingsError` sanitising CR (V8 `JSON.parse` messages can quote about 10 characters of the user's file; found by STORY-007-06's QA).

**Other observations.**
- Re-walk samples are small: BUG-003, BUG-004 and BUG-005 were each validated on 3 fresh sessions for a non-deterministic repro. The size-line result went 1 of 5, 0 of 3, then 3 of 3.
- Text-only fixes still touch many sealed files: BUG-004 re-scoped #25-#30 across 6 sealed red files; BUG-005 touched six red files, with the pointer-block hash pinned in three of them.
- Headless walkthrough spend (18 turns plus the new-user test and re-walks) is not in the token ledger.
- Seven more `.script-incidents/` files exist since the first report (2026-10-18 21:57Z to 22:36Z, the M7 planning window): five `npx` runs that exited 1 (three only printed a Node warning about collection-valued keys; two were `vitest` runs of the 12-row `bug-004-shape` red file failing 12/12, the expected red result in the Architect's scratch proof) and one `node` run that exited 1 with `state.json not found` under a mistaken SPRINT-04 path. All are scratch probes, not deliverables.
- Walkthrough samples were small (1 to 5 sessions per row); the BUG-003 fix was validated on 3 sessions for a non-deterministic repro (4 of 5 before).
- Machine load of about 50 with several parallel runs produced 5 s timeouts in random git-spawning files and `search` p95 failures (1100-1290 ms under load, 600-670 ms alone at load about 36, against 500 ms); each passed when rerun alone or when load dropped. The final `test:perf` was 5/5.
- The post-flight "red modified after QA-Red" flag was a false positive more than once (proved by `git diff <qa-red-sha> HEAD`).
- One script incident: a scratch probe run outside the wrapper path failed with `ERR_MODULE_NOT_FOUND` (`src/core/compare.js` in the 007-01 worktree). It was a throwaway probe, not a sprint deliverable. See §6 Tooling.
- Testbed gap: `beta.md` carries no status, so beta cannot appear as a `final_status` candidate without adding one.

---

## §5 Lessons

### New Flashcards (Sprint Window)

The bundle's flashcard slice was empty ("no date window"). 69 cards in `.cleargate/FLASHCARD.md` carry the dates 2026-10-18 and 2026-10-19 (63 + 6; 6 are dated 2026-10-19, 3 of them added by BUG-004 and BUG-005); the log records many more proposed and rejected duplicates. Grouped by theme, with the most load-bearing ones:

| Date | Tags | Lesson |
|---|---|---|
| 2026-10-19 | #walkthrough #instructions | "Open each session with X" reads to the agent as "run X", not "show X": say where the output goes ("in your first reply") and put a must-tell rule where a question-only session reads it |
| 2026-10-19 | #qa #red-test #templates | A pointer-block line change also breaks phrase pins ("open each session", "before any text") and whole-line maps; grep the phrases, then prove the re-scope set by applying the template edits to a temp copy of the worktree and running the full suite there (BUG-005) |
| 2026-10-19 | #walkthrough #instructions | An agent told to show a command's output "before any text" still batches the command with others and narrates first; say when to write it ("start each session with X and write its line before any other step or text") (BUG-005) |
| 2026-10-19 | #qa #red-test #planning | A plan's "old" pin value can be wrong (token-instructions R14(e) was 880e3e88 at base, the plan said a69f2714): re-scope a pinned hash by its content anchor and derive the new value from a temp copy of `templates/` (BUG-004) |
| 2026-10-19 | #red-test #templates #pointer-block | The sha256 of `templates/agent-block.md` is pinned in three red files; a pointer-block change re-scopes all three plus any WIKI.md phrase a red row checks |
| 2026-10-19 | #red-test #shipped-blocks | Plant old pointer blocks with `SHIPPED_BLOCKS.find(by sha256)`, never by index |
| 2026-10-18 | #red-test #docs #planning | A red row that pins a growing range (README's `D-01`-`D-NN`) breaks when a later story adds an entry; pin "ends at NN or later" or plan the re-scope at Gate 1 |
| 2026-10-18 | #red-test #fixtures | Size fixtures must be built with the real `estimateTokens`; "approx 12k" measured 9.7k (5 related cards) |
| 2026-10-18 | #qa #test-harness #perf | Under load (~50) 5 s timeouts and search p95 failures hit random files; rerun alone, run `test:perf` when load drops |
| 2026-10-18 | #templates #walkthrough #update | A project reads its own `.wiki/system/WIKI.md`, replaced only by `update`: text about stale files reaches the agent one release late |
| 2026-10-18 | #cli #contract | Every runner call after an install step needs its own catch or the error falls outside the frozen codes |
| 2026-10-18 | #windows #cli | Node >= 24 prints DEP0190 for `spawn` with an args array and `shell: true` |
| 2026-10-18 | #test-harness #hook | `runIngestUpdateCheck(new Command())` throws and its catch swallows it; test hooks through `runCli` / `createProgram` |
| 2026-10-18 | #privacy #json | `settingsError` passes V8's `JSON.parse` message through; it can quote about 10 characters of the user's file |
| 2026-10-18 | #ux #templates | "Show the user what it printed" leaks commands to the user; say what to tell in plain words |
| 2026-10-18 | #git #merge #contract | Two pushes into one array can merge without conflict in the wrong order; run the order test after a re-sync |

Themes by count: #red-test (about 22 cards), #qa (about 15), #test-harness (about 14), #fixtures, #templates, #ux, #contract. The dominant lesson is red-test fragility: pinned bytes, ranges, fixture sizes and shared files forced the re-scopes numbered up to #24 in the plan (#20 in wave T, #21-#24 for BUG-003) and several red-file fixes.

### Flashcard Audit (Stale Candidates)

Not run in this dispatch. The bundle carries no flashcard slice and the Capability Surface forbids broad repo searches without `CLEARGATE_REPORTER_BROADFETCH=1`. Surfaced as a footnote: the stale-detection pass could not be filled. `FLASHCARD.md` was not modified.

### Supersede Candidates

| Newer card | Older card | Proposed marker for older |
|---|---|---|
| (none) | — | — |

No directly contradicting pair was found from the card text read. The log rejected 9 candidate cards as duplicates during the sprint (FLASHCARD-REJECT entries in §4 of the plan).

---

## §6 Framework Self-Assessment

### Templates
| Item | Rating | Notes |
|---|---|---|
| Story template completeness | Yellow | Three stories needed `CR:spec-clarification` fixes for a decision approved at Gate 1 but missing from the body (007-07 decision 22, stale "not yet approved" footers in 008-03/008-05) |
| Sprint Plan Template usability | Green | §4 log carried every wave, SHA and decision; the plan's "Not in this sprint" fed the CR list directly |
| Sprint Report template (this one) | Yellow | The CR/UR vocabulary fits walkthrough events, but red-test defects and post-flight FAILs have no event token, so they appear as untagged rows |

### Handoffs
| Item | Rating | Notes |
|---|---|---|
| Architect → Developer brief quality | Green | M1-M6 plans caught 6 spec issues before red tests were written; 009-02 and 009-01 post-flight FAILs were test and error-handling gaps |
| Developer → QA artifact completeness | Yellow | 007-05's first QA report file was missing; one Developer used `git stash` against the standing rule; 008-02 skipped a planned property test |
| QA → Orchestrator kickback clarity | Yellow | Red files shipped fixtures that did not measure what they claimed (007-01, 007-05, 008-05, 008-06); one orchestrator instruction (re-scope #20) was itself wrong |

### Skills
| Item | Rating | Notes |
|---|---|---|
| Flashcard gate adherence | Green | 69 cards dated 2026-10-18/19, 9 duplicates rejected with reasons |
| Adjacent-implementation reuse rate | Green | Consolidation `f919a74` found only 6 small duplicates after the 16 stories and BUG-003 (it ran before BUG-004 and BUG-005); token formatting and config lookups were already shared |

### Process
| Item | Rating | Notes |
|---|---|---|
| Bounce cap respected | Green | No story reached a cap; `state.json` shows 0 everywhere. Yellow caveat: the counters miss red-test fix rounds and post-flight FAILs |
| Three-surface landing compliance | Green | Lifecycle reconciler clean at close prep (81 artifacts, before BUG-004 and BUG-005); 19 items archived once BUG-004 and BUG-005 were archived at `c3077e8`; the reconciler has to be re-run |
| Circuit-breaker fires (if any) | Green | None |
| Goal check against the walkthrough | Yellow | The first walkthrough pass found a real bug (BUG-003) that unit tests could not catch; it also showed that the 0.3.0 row cannot be fixed by 0.4.0 code. The rows were run by the orchestrator, not by a separate real user. The new-user test, asked by the human, found a gap (BUG-004) that neither the unit tests nor the walkthrough rows covered, and the re-walk of it found the next one (BUG-005): each fix needed a fresh behavioural pass |
| Running BUG-005 with no Architect plan | Green | Human decision Q2. The wording was tested first in scratch copies (8 of 8); QA-Red found the re-scopes by phrase and hash grep and proved the set complete on a temp copy (full suite with the template edits); 0 bounces, wave W GREEN, post-flight scan 0. One run, one text-only fix: too small a sample to make it the rule, but it is the evidence for the lighter-path proposal (§4.3). The risk the Architect plan covers (a missed pin) was caught by the temp-copy proof, not by a second reader |
| Text-only fix cost | Yellow | BUG-004's Architect plan took about 40 minutes and its re-scopes #25-#30 touched six sealed files; sealed phrase and hash pins make a one-sentence wording change a multi-file re-scope |

### Lane Audit
No story was ever assigned `lane: fast`.

| Story | Files touched | LOC | Demoted? | In retrospect, was fast correct? (y/n) | Notes |
|---|---|---|---|---|---|
| (none) | — | — | — | — | — |

### Hotfix Audit
| Hotfix ID | Originating signal | Files touched | LOC | Resolved-by SHA | Could this have been a sprint story? (y/n) | If y — why was it missed at planning? |
|---|---|---|---|---|---|---|
| (none) | — | — | — | — | — | — |

### Hotfix Trend
0 hotfixes this sprint. `wiki/topics/hotfix-ledger.md` does not exist; prior reports for SPRINT-01..03 record no hotfixes in the bundle. Rolling 4-sprint count: 0; monotonic-increase flag: no.

### Tooling
| Item | Rating | Notes |
|---|---|---|
| run_script.sh diagnostic coverage | Yellow | Eight incident JSONs in `.script-incidents/`. The first (`20261018T163105Z-536d10b16fbb.json`, exit 1, `ERR_MODULE_NOT_FOUND` for `src/core/compare.js` in the 007-01 worktree) was a throwaway scratch probe. Seven more came in the M7 planning window (`20261018T215708Z-809456c24689`, `T220312Z-9062e166f94e`, `T220409Z-86758a926670`, `T221940Z-44dad1c84cc3`, `T222020Z-809456c24689`, `T222031Z-86758a926670`, `T223601Z-7e8ab703bbe3`): Node warnings, expected red-file failures and one wrong `state.json` path; none a deliverable. Worktrees without installed packages caused wave A's tsc and packed-e2e failures until `npm ci` ran in all 8 |
| Token ledger completeness | Red | 443 of 478 rows (92.7%) are `unattributed` with empty `story_id`; only 35 rows are attributed; the dispatch marker was not written for most dispatches. Per-agent and per-story cost cannot be published |
| Token divergence finding | Yellow | Pre-computed sprint-work 24,300,268,009 vs sprint-total 1,163,615,322 (work exceeds total by 20.9x, a double-count); Reporter pass is TBD. `.session-totals.json` currently holds one unrelated small session. Out-of-ledger spend (corrected): walkthrough about $9.02, new-user test about $4.78, BUG-004 re-walk about $5.68, scratch experiments about $5.03, BUG-005 re-walk about $1.87 (about $26.38 headless), designer runs |

---

## §7 Change Log

| Date | Author | Change |
|---|---|---|
| 2026-10-19 | Reporter agent | Initial generation |
| 2026-10-19 | Reporter agent | Refresh at `c3077e8`: new-user test, BUG-004 and BUG-005 added to §§1-6; token cost re-read (478 ledger rows); Goal Acceptance Check section reduced to evidence (the verdict is spoken in the Brief) |
