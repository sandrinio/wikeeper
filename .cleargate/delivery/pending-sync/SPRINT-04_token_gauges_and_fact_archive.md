---
sprint_id: SPRINT-04
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
lifecycle_init_mode: warn
remote_id: null
source_tool: null
status: Active
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T15:49:22Z
start_date: 2026-10-18
end_date: null
synced_at: null
created_at: 2026-10-18T07:40:00Z
updated_at: 2026-10-18T15:51:26Z
created_at_version: strategy-phase-pre-init
updated_at_version: 7546528-dirty
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T15:51:26Z
  transition: ready-for-execution
epics:
  - EPIC-007
  - EPIC-008
  - EPIC-009
proposals: []
context_source: "Carries EPIC-007 (Token gauges) and EPIC-008 (Fact archive), both approved by the human on 2026-10-18, after SPIKE-003 (Completed 2026-10-18, Win: a dependency-free estimate within ±15% of Claude Opus 5.5's real counts). Decomposed into 13 stories (STORY-007-01…07, STORY-008-01…06) from plans/decomposition.md (story set, file ownership, contracts K1–K13). EPIC-009 (Version check and upgrade, requested and approved 2026-10-18) adds STORY-009-01…03 from plans/decomposition-epic-009.md (contracts K14–K16). Sprint Design Review done 2026-10-18 before kickoff (§2, plans/waves.json); plan and Goal Acceptance Check confirmed by the human 2026-10-18."
stamp_error: no ledger rows for work_item_id SPRINT-04
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-18T12:46:28Z
  sessions: []
---

# SPRINT-04: Token gauges and fact archive

## Human decisions (2026-10-18)

- **Token counts measure content:** each document, each page and the wiki in total. What the agent loads or spends is not measured.
- **Levels:** documents and pages get green, yellow and red; the wiki total is a number with no level.
- **Defaults** (written by `init`, changeable with `wikeeper config set`): page 4k / 10k, document 20k / 60k, approval at yellow.
- **Command:** a general `wikeeper config get / set / unset`.
- **Archive:** ordinary ingests keep recording as today. Facts move to the archive only in a clean-up the user asks for. The agent tells the user once when a page turns red, and the user decides whether to raise the limit or ask for a clean-up. A deleted page's facts must survive in `pages/` or `archive/`.
- **Spike method:** real counts from `claude -p` on the human's subscription; no API keys.
- **Version check and upgrade (EPIC-009, added the same day):** wikeeper checks npm for a newer version from ingest commands (at most once a day, saved, opt-out); `wikeeper upgrade` runs npm itself; in this sprint. At Gate 1 the human approved the recommendations: only `ingest plan` and `ingest start` print the notice; npm only; the agent asks before `update` and `upgrade`.
- **Gate 1 (all 16 stories):** the human agreed with every recommendation in `plans/gate1-decisions.md` (61 decisions, 19 red-test re-scopes).

## 0. Stakeholder Brief

- **Sprint Goal:** The user always knows how big the wiki, each page and each document are in tokens, approves a large document before it is read, changes the limits from the CLI, can ask for a clean-up that moves outdated facts to an archive without losing any, and hears when a newer wikeeper is out and can upgrade with one command.
- **Business Outcome:** the wiki stays small enough to be useful as it grows. Before SPRINT-04 a long PDF could be read and every page kept growing without anyone noticing; after it, the size is visible everywhere it matters, large documents wait for a yes, and old facts can be moved out of the way and still be found, and users learn about new releases and stay on them.
- **Risks (top 3):** the conservation rule changes `ingest finish`'s core refusal, so a wrong rule would block real ingests; `wikeeper upgrade` runs npm on the user's machine, and ingest commands gain a network request; 16 stories share `status`, `search`, `lint`, the finish report and `WIKI.md`.
- **Metrics:** estimates within ±15% of Claude's real count on SPIKE-003's samples; `wikeeper statusline` p95 < 300 ms on 500 pages; no fact line can leave `pages/` except into the archive (every rule has a refusing test and a passing test); with npm unreachable, ingest commands exit as before; the part-4 real-user walkthrough finds no ❌.

## Sprint Goal

The user always knows how big the wiki, each page and each document are in tokens, approves a large document before it is read, changes the limits from the CLI, can ask for a clean-up that moves outdated facts to an archive without losing any, and hears when a newer wikeeper is out and can upgrade with one command.

**Goal Acceptance Check (confirmed by the human with the plan, 2026-10-18):**
1. *Mechanical*, on the merged `sprint/S-04` tree: `npm run typecheck`, `npm test` and `npm run test:perf` pass; `wikeeper --version` prints `0.4.0` with the build stamp; in a scratch copy of the testbed (`.cleargate/sprint-runs/SPRINT-04/testbed.md`, Making a scratch copy), `wikeeper status --json` reports `tokens.page_count` 56 and `tokens.wiki`, which counts the pages only, within ±15% of 73,369 (Claude's real count of the testbed's 56 pages, without `index.md`; testbed.md "Sizes"), and `version.files` is `0.3.0` (the testbed's manifest is from 0.3.0) with a line telling the user to run `wikeeper update`.
2. *Behavioural*: walkthrough part 4 (real user, in a scratch copy of the testbed, one fresh copy per session where a session's changes affect the next; a fresh session per task; plain requests that never name wikeeper; the large document, the red-page limit and the outdated facts are the ones testbed.md lists) ends with no ❌. It must show the agent, unprompted: showing the wiki's size at the start of a session; not reading a document above the approval limit before the user says yes, and telling the user its size; changing a limit when the user asks in plain words; telling the user once about a red page; when the user asks for a clean-up, moving outdated facts to the archive with `ingest finish` passing and the facts still found by a history search; and, with the project's files from 0.3.0, telling the user they are out of date and running `update` only after a yes. (A newer version than 0.4.0 can't exist on npm during the walkthrough, so `upgrade` is checked by tests with an injected fetch and npm runner.)

## 1. Consolidated Deliverables

| Item | Type | Title | Decomposed? | Notes |
|---|---|---|---|---|
| `EPIC-007` | Epic | Token gauges | yes (007-01…07) | Estimator from SPIKE-003. |
| `EPIC-008` | Epic | Fact archive | yes (008-01…06) | Uses EPIC-007's page limits for candidates. |
| `EPIC-009` | Epic | Version check and upgrade | yes (009-01…03) | Added and approved 2026-10-18. |
| `SPIKE-003` | Spike | Token estimate calibration | done | Completed before the sprint (Win). |

**Story set (16):**

<!-- cleargate:ignore-ids -->
| Story ID | Title | Lane | Wave | Parallel? | Bounce Exposure |
|---|---|---|---|---|---|
| STORY-007-01 | Token estimator, `tokens` limits in config, limits written by `init` | standard | W1 | y | med |
| STORY-007-02 | `wikeeper config get / set / unset` | standard | W2 | n | low |
| STORY-007-03 | Document size in `read` and the size approval at `ingest start` | standard | W2 | n | med |
| STORY-007-04 | Estimates in `ingest plan` | standard | W3 | n | med |
| STORY-007-05 | Wiki and page sizes: `status`, the finish report, search hits, `oversized-page` lint | standard | W2 | n | med |
| STORY-007-06 | `wikeeper statusline` and `--install` | standard | W2 | n | med |
| STORY-007-07 | Token instructions, allow rules for `statusline` and `config get`, docs, 0.4.0 | standard | W4 | n | med |
| STORY-008-01 | The archive in the write phase: paths, guard, snapshot, abort, diff, page hashes | standard | W1 | y | med |
| STORY-008-02 | The conservation rule at `ingest finish`, archive validation, archived counts | standard | W3 | n | high |
| STORY-008-03 | Index and search: `index.md` from `pages/` only, `search --archive`, history searches | standard | W3 | n | med |
| STORY-008-04 | Lint covers the archive | standard | W4 | n | med |
| STORY-008-05 | `status` archive size and candidates; `remove`, `--purge` and `private:` | standard | W3 | n | med |
| STORY-008-06 | Archive instructions and docs | standard | W5 | n | med |
| STORY-009-01 | Version check and version warnings | standard | W4 | n | med |
| STORY-009-02 | `wikeeper upgrade` | standard | W5 | n | med |
| STORY-009-03 | Upgrade instructions and docs | standard | W6 | n | low |
<!-- /cleargate:ignore-ids -->

Waves are from the Sprint Design Review (§2, `plans/waves.json`); lanes, parallel flags and bounce exposure are the drafting values, confirmed by the review's lane audit (§2.4). Upstreams and shared files are in `.cleargate/sprint-runs/SPRINT-04/plans/decomposition.md` and, for EPIC-009, `plans/decomposition-epic-009.md`.

### Not in this sprint

- Gemini 4 Argon token counts (no headless count for individual accounts) and direct counts for GPT-6 Astra and Sol (the ChatGPT account allows only GPT-6 Luna).
- Status lines for Codex and Antigravity; they get the size line at session start through the instructions.
- Deleting content for good inside an ingest, and any archive move made by the CLI or without the user asking.
- Upgrading through pnpm, yarn or bun; upgrading automatically or in the background; the new version in the status line.
- Publishing to npm: a separate step the human approves after Gate 4.
- CR (to file after SPRINT-04): one snake_case code per condition — rename the six upper-case E_ codes together (docs/ux.md Appendix A.9); changes --json output.
- CR (to file after SPRINT-04): Figures next to a limit never round onto it (design review C1).
- CR (to file after SPRINT-04): Permission reasons in the refusal shape (A.12) (design review C2).
- CR (to file after SPRINT-04): One phrase for a size the CLI could not measure (design review C3).
- CR (to file after SPRINT-04): Guide: one shape for a page and its size; limit forms (design review C4).
- CR (to file after SPRINT-04): index.md lines follow the hint rules, only if wanted (design review C5).
- CR (to file after SPRINT-04): Say limits as "the document limit, 20k" (design review C6).
- CR (to file after SPRINT-04): Plain words in setup and reports, already in ux-map §4 (design review C7).
- CR (to file after SPRINT-04): One ordered notice list in status (design review C8).
- CR (to file after SPRINT-04): Status version line always shown (design review round 2, C10).
- CR (to file after SPRINT-04): Version-mismatch examples that can occur, a doc fix at close (design review round 2, C11).
- CR (to file after SPRINT-04): One ordered notice list in status, extended to N4 and N9–N11 (design review round 2, C12; extends C8).
- CR (to file after SPRINT-04): settings and config parse errors quote part of the user's file — `settingsError` (`src/agents/json-merge.ts:23`) passes V8's JSON.parse message through, which can quote about 10 characters; sanitise it to the position only (found by STORY-007-06's QA).

## 2. Execution Strategy

<!-- role: architect-synth · Sprint Design Review (re-run) from 16 architect-reader digests · waves.json schema_version 2 (.cleargate/sprint-runs/SPRINT-04/plans/waves.json) · 2026-10-18 · run before kickoff: no sprint/S-04 branch, no state.json, .active still SPRINT-03 · includes the human's two changes: WIKI.md order accepted; the package.json orders 007-07 → 009-01 and 007-06 → 007-07 dropped (6 waves) -->

### §2.1 Phase Plan

**Build set: all 16 stories.** None is refused and none is fail-safe-serialized:
- Every digest has the required fields. One exception in form only: 007-04 and 008-05 carry `file_creates` in a reader note, not in the JSON. Both notes name the paths, which are already in `file_surface`. The note is taken as the field value, so the collision metadata is known.
- Every `(file_surface ∪ file_creates)` is non-empty, so the BUG-033 guard passes.
- Every `db_write_set` is empty.
- `parallel_eligible: n` on 14 stories comes from the story files, not from the orchestrator. It is an integration-order hint, as in SPRINT-03. Treating those stories as fail-safe would also contradict the dependencies: 007-02, for example, would trail 007-07, which depends on it.

**Paths, checked against `main` at `8988a2c` on 2026-10-18 and re-checked after the story edits.** After normalisation (§2.3) the digests hold 166 story × path entries, the same set as the first run:
- 123 are tracked.
- 43 are untracked, absent and not gitignored. Each one is in its own story's `file_creates`.
- No path is created by two stories.
- No `contract/S-04-*` branch exists yet.

**Reachability (BUG-046): no refusal.**
- 007-07, 008-06 and 009-03 now list their new red test only under "New Files Needed". `collision_surface.sh` reports no unreachable path for them (re-run 2026-10-18).
- Two digests still list `unreachable_surface`. Every entry is a parsing artefact, not a path missing from a worktree:

| Story | Entry | What it is |
|---|---|---|
| 007-01 | `test/tokens.red.node.test.ts (new)` | label suffix; the path is in 007-01's `file_creates` |
| 007-01 | `test/config.red.node.test.ts (re-scope … :19` | prose suffix; the path is tracked (re-scope #1) |
| 009-01 | `test/config.red.node.test.ts:19 "…"`, `test/doctor.red.node.test.ts:84 (S1)`, `…:43` | line anchors on tracked files |
| 009-01 | `Change it to the version in package.json` | a prose sentence, not a path |

None is gitignored or inside a nested repository, and the script reported neither. A worktree cut from any planned base contains every tracked path, and each story creates its own new paths. So the refusal string is not emitted.

**Contracts (10).** Unchanged from the first run; dropping the two `package.json` orders changes no contract.
- C1–C3 are skeletons, written by one Developer skeleton dispatch at the contract step. Each is one commit on one branch. Bodies throw `contract stub Cn`, and constants carry their frozen values.
- C4–C10 are each cut from the owner's own Developer commit when that Developer reports done, before its QA-Verify.
- Owners of C1–C3 build from their own contract, so the skeleton is the merge base and consumers merge without add/add conflicts.
- Frozen exports are listed in `waves.json`. They are never renamed or retyped.

| id | branch | base | owner | content | direct consumers | cut when |
|---|---|---|---|---|---|---|
| C1 | `contract/S-04-tokens` | `sprint/S-04` | 007-01 | Skeleton `src/core/tokens.ts`: every K1 export, `PDF_TOKENS_PER_PAGE = 1600`. `src/core/config.ts` is type-only: `TokenConfirmAt`, `WikeeperConfig.tokens`, and a throwing `tokenLimitIssues`. No SCHEMA, `walk`, `validateLeaf` or `init.ts` change; those are 007-01's own. | 007-05, 007-06 (007-03 and 007-04 via C2) | contract step, first |
| C2 | `contract/S-04-source-size` | C1 | 007-03 | Skeleton `src/ingest/source-size.ts` (`sourceTokens`, `describeTokens`), plus the additive K5 exports appended to `src/ingest/permissions.ts`: `SourceLimits`, `SizeCheck`, `checkSourceSize`, `sizeLimitText`. | 007-04 | contract step, after C1 |
| C3 | `contract/S-04-update-check` | `sprint/S-04` | 009-01 | Skeleton `src/core/update-check.ts`: all K14 exports, `UPDATE_CHECK_TTL_MS`, `UPDATE_CHECK_TIMEOUT_MS`, `REGISTRY_VERSION_RE`. It also moves `compareVersions`, unchanged, to `src/core/version.ts`, and `doctor.ts` re-exports it (a final body, written once). It must not import from `doctor.ts` (009-01 notes the import cycle). | 009-02 | contract step |
| C4 | `contract/S-04-config` | C1 | 007-01 | 007-01's Developer commit: the real estimator, the `tokens` SCHEMA with the `token-count` leaf, the private `normalizeLeaf`, `init.ts`, and red re-scope #1. | 007-02 | 007-01's Developer done |
| C5 | `contract/S-04-archive` | `sprint/S-04` | 008-01 | 008-01's Developer commit: K9 (`archiveDir`, guard, snapshot/restore, `PageDiff.archive`, `archive_hashes`), and red re-scope #12. | 008-02 | 008-01's Developer done |
| C6 | `contract/S-04-sizes` | C4 | 007-05 | Cut from C4, then C5 merged in, then story/STORY-007-05 merged in at its Developer commit. The three share only `ingest-finish.ts`, in separate hunks. Carries K7 (status `tokens`, report figures, `page_tokens`, `oversized-page`, `FINISH_CHECKS`) and 007-05's WIKI.md bullet and row. | 008-03, 008-05 | 007-01, 008-01 and 007-05 Developers done |
| C7 | `contract/S-04-search-archive` | C6 | 008-03 | 008-03's Developer commit: K11 (`buildIndex(pages, { archived })`, `search --archive`, `pageTokens(path, archived?)`). | 008-04 | 008-03's Developer done |
| C8 | `contract/S-04-archive-status` | C6 | 008-05 | Cut from story/STORY-008-05 at its Developer commit, then C3 merged in (no shared file). Carries K13, 008-05's two WIKI.md bullets, and the K14 skeleton. | 009-01 | 008-05's Developer done |
| C9 | `contract/S-04-token-text` | C6 | 007-07 | Text contract: cut from C6, then story/STORY-007-07 merged in at its Developer commit. The WIKI.md hunks are separate from 007-05's, and C6 holds no `package.json` edit. Carries 007-07's text and 007-05's `oversized-page` row, which 008-06 rewrites. | 008-06 | 007-07's Developer done, and C6 exists |
| C10 | `contract/S-04-archive-text` | C9 | 008-06 | Text contract: 008-06's Developer commit (WIKI.md, SKILL.md, architecture.md, README.md, `DOCUMENTED_FORMS`). | 009-03 | 008-06's Developer done |

**When each build starts.**
- **At once**, after the contract step (8 of 16):
  - from `sprint/S-04`: 007-07, 008-01
  - from C1: 007-01, 007-05, 007-06
  - from C2: 007-03, 007-04
  - from C3: 009-02
- **After one Developer cycle:**
  - 007-02 (C4)
  - 008-02 (C5)
  - 008-03 and 008-05 (C6, which needs the 007-01, 008-01 and 007-05 Developers)
- **After two Developer cycles:**
  - 008-04 (C7)
  - 009-01 (C8)
  - 008-06 (C9)
- **After three Developer cycles:** 009-03 (C10).

**Base and upstream per story.** Upstream is the union of three sets:
- the story's `dep_predecessors`;
- the earlier side of each real collision, plus the orchestrator's kept merge orders;
- every contract owner in the story's base stack.

Changed rows are in bold.

| Story | Base | Upstream | Layer |
|---|---|---|---|
| 007-01 | C1 | — | 0 |
| 008-01 | `sprint/S-04` | — | 0 |
| 007-02 | C4 | 007-01 | 1 |
| 007-03 | C2 | 007-01 | 1 |
| 007-05 | C1 | 007-01, 008-01 | 1 |
| 007-06 | C1 | 007-01 | 1 |
| 007-04 | C2 | 007-01, 007-03 | 2 |
| 008-02 | C5 | 007-05, 008-01 | 2 |
| 008-03 | C6 | 007-01, 007-05, 008-01 | 2 |
| 008-05 | C6 | 007-01, 007-05, 008-01 | 2 |
| 007-07 | `sprint/S-04` | 007-02, 007-03, 007-04, 007-05, 007-06 | 3 |
| 008-04 | C7 | 007-01, 007-05, 008-01, 008-02, 008-03 | 3 |
| **009-01** | C8 | 007-01 … 007-06, 008-01, 008-05 (**007-07 removed**) | **3** |
| 008-06 | C9 | 007-01, 007-05, 007-07, 008-01, 008-02, 008-03, 008-04, 008-05 | 4 |
| **009-02** | C3 | 009-01 | **4** |
| **009-03** | C10 | 007-01, 007-05, 007-07, 008-01, 008-06, 009-01, 009-02 | **5** |

**Integration.**
- Each layer is one derived wave (see Wave Assignment). Stories merge one at a time; within a multi-story wave, any order.
- Recommended orders inside a wave (merge orders only, not edges):
  - **Wave 3:** 008-02 first, because its bounce exposure is high and later `finish` work should run on its rule. Then 008-03 before 008-05, because 008-05's WIKI.md bullet names `--archive`.
  - **Wave 4:** 007-07 before 009-01 when both are ready. This keeps the accepted WIKI.md order as written. Either order is safe: the two share only WIKI.md and `package.json`, in separate hunks.

**Re-sync rule.** Some stories cannot pass all their tests on their base alone:
- **Skeleton bases with throwing bodies:** 007-03, 007-04, 007-05, 007-06 (C1, C2) and 009-02 (C3).
  - When the owner's Developer reports done, the consumer may merge story/<owner> into its branch for local runs. The later re-sync gives the same tree (FLASHCARD 2026-10-17 #contract #merge).
- **Real-tree template checks:**
  - 007-07 needs `config` and `statusline` registered, 007-05's bullet and row, and the `read`, `start` and `plan` size messages.
  - 008-06 needs `search --archive` and the behaviour of 008-02 to 008-05.
  - 009-03 needs `upgrade`, plus 009-01's bullet and messages.
- **Hunks re-applied on an upstream's bytes:**
  - 007-05: `ingest-finish.ts`, on 008-01's.
  - 008-02: `report.ts`, `report.test.ts` and the two finish report literals, on 007-05's; the shared red file, on 007-03's.
  - 008-04: `ingest-finish.ts`, on 008-02's.
  - 009-01: `config.ts` and `doctor.ts` on 007-02's, `ingest-start.ts` on 007-03's, `ingest-plan.ts` on 007-04's, and the `test:perf` line on 007-06's. If 007-07 merges first in wave 4, also WIKI.md and `package.json` beside 007-07's (separate hunks). Its `config set update_check false` row needs 007-02's command.
  - 007-02, 007-06 and 009-02: `src/program.ts` appends.
- Each of these stories merges `sprint/S-04` into its branch once its upstream has merged. It then runs the full suite plus QA-Verify on that tree. Until then, reds caused only by unmerged upstream are expected.

**Critical path: 6 integration layers (L0–L5).** Four chains tie at six stories:
- 007-01 → 007-03 → 007-04 → 007-07 → 008-06 → 009-03
- 007-01 → 007-03 → 007-04 → 009-01 → 009-02 → 009-03
- 008-01 → 007-05 → 008-03 → 008-04 → 008-06 → 009-03
- 008-01 → 007-05 → 008-05 → 009-01 → 009-02 → 009-03

**Build waits.** Wave 4 now holds two three-deep build chains:
- 007-05 → 008-03 → 008-04
- 007-05 → 008-05 → 009-01 (new: 009-01 moved up from wave 5)

The 007-05 / 007-07 → 008-06 → 009-03 chain feeds waves 5–6. 007-05's Developer commit gates C6, so it gates six later builds:
- Start 007-05 first.
- Dispatch 008-03 and 008-05 the moment C6 is cut.

**Plan §1 table.** Wave is the wave number: 009-01 → W4, 009-02 → W5, 009-03 → W6, the rest unchanged. Parallel? is `y` for the 15 stories in multi-story waves and `n` for 009-03. 008-02's exposure `high` matches its story file.

### §2.2 Merge Ordering

Collision kinds:
1. Ordered schema or migration journal (none in this sprint).
2. Lockfile or single-writer generated artifact.
3. Shared file whose edits must be applied in order.

"Re-apply" means the later story builds without the earlier one's bytes and resolves the hunk at its re-sync.

| Shared file | Stories | Order | Rationale |
|---|---|---|---|
| `src/core/config.ts` | 007-01, 007-02, 009-01 | 007-01 → 007-02 → 009-01 | Kind 3. 007-02's `parseConfigValue` calls 007-01's private `normalizeLeaf` and reads the `token-count` leaf (C4). 009-01 puts `update_check` after `enforce`, on 007-01's tree (C8 ⊃ C6 ⊃ C4). It re-applies beside 007-02's helpers, a separate region. |
| `test/config.red.node.test.ts` | 007-01, 009-01 | 007-01 → 009-01 | Kind 3: re-scope #16 adds `update_check` after #1's `tokens` in the same expected object. 009-01's base carries #1. |
| `package.json` | 007-06, 007-07, 009-01 | 007-06 → 009-01; 007-07 free | **Changed.** 007-06 → 009-01 is kind 3: the same `test:perf` line (`:46`), where 009-01 appends after 007-06's file (re-apply). 007-07 changes only `version` (`:3`), plus `package-lock.json`, of which it is the single writer: a separate hunk from both. Both `package.json` arrows that involved 007-07 are dropped (the human, 2026-10-18). 007-07 still integrates after 007-06, but through its dependency (it documents `statusline`), not through this file. |
| `src/program.ts` | 007-02, 007-06, 009-02 | free (wave 2, wave 2, wave 5) | Not a real collision. Each appends one import and one `defaultCommands` entry; keep every line. |
| `src/commands/doctor.ts` | 007-02, 009-01 | 007-02 → 009-01 | **Added at plan confirmation (the human, 2026-10-18, decision 66).** Separate hunks: C3's `compareVersions` re-export near `:42`; 007-02's `config-valid` syntax-error branch at `:151–156` (R12: `fix` from `CONFIG_SYNTAX_FIX`, the step dropped from the message); 009-01's two checks after the integrations guard (`:215`) and the `loadConfig` result it keeps from the `config-valid` step. 009-01 builds from C8, without 007-02's bytes, and re-applies beside the branch at re-sync; 007-02 is already its upstream. |
| `src/commands/status.ts` | 007-05, 008-05, 009-01 | 007-05 → 008-05 → 009-01 | Kind 3. 008-05's step and lines go after 007-05's size step (C6). 009-01's `version` step goes after 008-05's, and 009-01 widens `collectStatus` and `createStatusCommand` (C8). |
| `src/commands/ingest-start.ts`, `ingest-plan.ts` | 007-03 / 007-04, 009-01 | 007-03 → 009-01; 007-04 → 009-01 | 009-01 adds `availableMessage` to `warnings`, one small hunk each. It re-applies on the size fields at re-sync. |
| `src/commands/ingest-finish.ts` | 008-01, 007-05, 008-02, 008-04 | 008-01 → 007-05 → 008-02 → 008-04 | Regions: 008-01, the ingest event (`archive_hashes`, `:192–205`). 007-05, `FINISH_CHECKS` (`:41`) and the report literals (`:107`, `:242`). 008-02, the refusal (`:163–173`) and `archived` in both literals. 008-04, `finishLintHook` (`:42–49`) and `runLintHook` (`:229`). 007-05 → 008-04 is kind 3 (adjacent `:41`/`:42`; C7 carries 007-05). The other arrows are re-applies. |
| `src/ingest/report.ts`, `test/ingest/report.test.ts` | 007-05, 008-02 | 007-05 → 008-02 | Adjacent insertions: both extend `IngestReport` and the `base` literal. The `formatReport` order is fixed by K7/K10: counts, `archived` (008-02), `wiki ≈` (007-05). 008-02 re-applies on C5 (see §2.3). |
| `test/ingest/ingest-follow-ups.red.node.test.ts` | 007-03, 008-02 | either | Different tests (`:234`, `:172`), each re-scoped by name. Not a collision. |
| `src/search/engine.ts`, `search.ts`, `filters.ts` | 007-05, 008-03 | 007-05 → 008-03 | Kind 3: 008-03 widens 007-05's `pageTokens(path)` to `(path, archived?)`, plus the `page_tokens` pass (C6). |
| `src/lint/checks.ts`, `test/ingest/finish-lint.test.ts` | 007-05, 008-04 | 007-05 → 008-04 | Kind 3. `oversized-page` is registered after `unlogged-change`, and `FINISH_CHECKS` gains it. Then 008-04 adds `archivePages`, `onlyArchive`, the `index-drift` count and the archive early return (C7 ⊃ C6). |
| `templates/system/WIKI.md` | 007-05, 008-05, 007-07, 009-01, 008-06, 009-03 | 007-05 → 008-05 → 007-07 → {009-01, 008-06} → 009-03 (accepted 2026-10-18) | Status bullets: `tokens` after `misses` (007-05), `archive` and `archive_candidates` after it (008-05, C6), `version` after them (009-01, C8). Finding table: 007-05's `oversized-page` row is rewritten by 008-06 R5(b) (C9). Paragraphs: 007-07's first paragraph and four new ones; 008-06 edits the fourth (C9); 009-03's paragraph follows them (C10). 007-07 → 009-01 is a merge order inside wave 4, not an edge: they never touch the same lines, and neither do 008-06 and 009-01. |
| `templates/skills/wiki-search/SKILL.md` | 007-07, 008-06 | 007-07 → 008-06 | Kind 3: sentences on `:10` (C9). |
| `architecture.md`, `README.md` | 007-07, 008-06, 009-03 | 007-07 → 008-06 → 009-03 | Kind 3: §10, §11 and the CLI table are edited by all three; D-37, then D-38 (C9, C10). |
| `test/templates/structure.ts` | 007-07, 008-06, 009-03 | 007-07 → 008-06 → 009-03 | Kind 3: `DOCUMENTED_FORMS` appends, each on the last (C9, C10). |
| `test/templates.test.ts`, `test/templates/wiki-protocol.red.node.test.ts` | 007-07, 009-03 | 007-07 → 009-03 | Kind 3: the command-tree pins, and `COMMANDS` gaining `config`, `statusline` (#5), then `upgrade` (#19). C10 carries 007-07's edits through C9. |

Single writers, not in the table: `package-lock.json`, `templates/agent-block.md`, `src/agents/shipped-blocks.ts`, `SETUP.md` and `enforce/claude.ts` (all 007-07); `src/lint/staleness.ts` (008-05); `src/read/pdf.ts` (007-03); `src/core/paths.ts` and `src/ingest/log.ts` (008-01); `vitest.config.ts` and `version.ts` (009-01, through C3). `doctor.ts` is no longer a single writer: see its row (007-02 → 009-01).

### §2.3 Shared-Surface Warnings

- **Merge-order cycle: resolved by the human (2026-10-18).**
  - The plan ordered WIKI.md 009-01 → 007-07 and `package.json` 007-07 → 009-01: a cycle.
  - The human accepted the WIKI.md order 007-05 → 008-05 → 007-07 → {009-01, 008-06} → 009-03 and dropped the `package.json` arrow 007-07 → 009-01.
  - 007-06 → 007-07 on `package.json` constrains nothing (separate lines, `:46` and `:3`), so it is dropped too. The two stories stay ordered by 007-07's dependency.
  - 009-01 now integrates in wave 4, next to 007-07, so the plan has 6 waves.
- **009-01's manual check runs on a scratch copy with the version set to 0.4.0.**
  - The check expects `installed 0.4.0` and `files … 0.3.0`, but 009-01 may now merge before 007-07's bump.
  - In the scratch clone used for the walkthrough, set the version to 0.4.0 (for example `npm version 0.4.0 --no-git-tag-version`), then `npm link` or run `node <clone>/dist/cli.js`.
  - The bump stays in the scratch copy and is never committed. Its `package.json` change is not 009-01's.
- **007-05 is the hub.**
  - It writes four surfaces (status, finish report, search, lint), and C6 gates six builds.
  - If 007-05 bounces at QA-Verify after C6 is cut, each C6/C7/C8/C9 consumer re-syncs on 007-05's merge before its own QA-Verify.
  - With 009-01 in wave 4, two three-deep build chains (via 008-03 and via 008-05) must finish before that wave.
- **008-02, high exposure: the conservation rule changes `finish`'s core refusal.**
  - It builds early, from C5, as soon as 008-01's Developer is done, and merges first in wave 3.
  - QA-Verify runs the full suite, `test/e2e` included, on the re-synced tree. That tree holds 007-05's `finish-tokens` tests. Their delete row removes "old.md, a page with no fact lines", so it is compatible with the rule; checked.
  - Every later fixture that deletes a page must first copy that page's fact lines to `archive/`. This applies to 008-04's archive-lint finish scenario, and to 008-06 and 009-03 if they run `finish`.
- **Finish report line order (007-05, 008-02).** 008-02 builds without 007-05's `wiki ≈` line. At re-sync, the final order is counts, then `archived …` (only when N or M > 0), then `wiki ≈…`. Both fields stay in both `IngestReport` literals and in the `base` literal of `report.test.ts`.
- **Snapshot layout (007-05, 008-01).**
  - 007-05 measures `<wikiDir>/.snapshots/<id>/pages` only. 008-01 adds `<snapshot>/archive` beside it, which must never be counted in `change`.
  - Any `SnapshotInfo` literal that 007-05 writes on C1 must gain `archive: {}` at its re-sync, as 008-01 does in `test/ingest/finish.test.ts:31`.
- **`normalizeLeaf` is private.** 007-02 calls it inside `config.ts` (the reader's flag). C4 freezes its name and signature even though no export check can see it. 007-01 must not rename it after C4 is cut.
- **009-01: the network and `vitest.config.ts`.**
  - From 009-01's merge (wave 4) on, every `ingest` subcommand runs the `preAction` check. The new `vitest.config.ts` turns it off through `WIKEEPER_NO_UPDATE_CHECK=1`.
  - The config must set only `test.env` and keep vitest's default include and exclude. If `exclude` is ever set, spread `configDefaults.exclude`.
  - QA-Verify for 009-01 looks for tests that spawn the CLI with an `env` literal that drops `process.env`. Such a test would ask npm, with a 1.5 s timeout.
  - The config reaches 007-07 and 008-04 if they merge after 009-01 in wave 4. 008-06, 009-02 and 009-03 re-sync onto it.
- **`src/program.ts` appends (007-02 and 007-06 in wave 2; 009-02 in wave 5).** The second merge conflicts on adjacent lines (FLASHCARD #git #merge). Keep both. A lost command line breaks every real-tree template test.
- **`src/commands/doctor.ts` (007-02 in wave 2 → 009-01 in wave 4; decision 66).** Three separate hunks: C3's re-export near `:42`, 007-02's `config-valid` syntax-error branch at `:151–156`, and 009-01's checks after `:215`. 009-01 builds from C8 without 007-02's branch, so at its re-sync it keeps that branch as 007-02 left it: `fix` is `CONFIG_SYNTAX_FIX`, and the message carries no step.
- **007-07, pointer block and enforce in one commit.**
  - The pointer block's line 4 change goes with the fourth `SHIPPED_BLOCKS` entry and its sha256 pin. The block stays at 14 of 14 lines and ≤200 characters per line. Escape quotes in the literal (FLASHCARD #shipped-blocks).
  - `READ_ONLY_COMMANDS`, the three SETUP.md rows and red re-scopes #6–#10 land together.
- **Stacked bases carry owners' QA-Red files.** This applies to 007-02, 008-02 to 008-06, 009-01 and 009-03. The pre-gate "red modified" scan must diff those files against each owner's QA-Red commit before routing a bounce (FLASHCARD #pre-gate #red-test #contract).
- **Skeleton bodies throw; they never work** (FLASHCARD 2026-10-16 #qa #contract). The exceptions are frozen constants and the `compareVersions` move in C3, which is existing code, unchanged.
- **Load.** Eight builds start at once.
  - Full-suite git tests time out under load: re-run with `--maxWorkers=4` before blaming a diff.
  - `test:perf` now has four files (search, cache, `statusline`, `update-check`). Run it alone.
  - Never `git stash` (FLASHCARD #git #worktree).
- **Reachability flags.**
  - Fixed: 007-07, 008-06 and 009-03 now list their red test only under "New Files Needed", and `collision_surface.sh` reports nothing unreachable for them.
  - Still flagged: 007-01's `(new)` row and its `(re-scope …` cell, and 009-01's three line anchors and one prose sentence. They are harmless (§2.1). The same relabelling would silence them; that is the orchestrator's call.
- **Input normalisation.**
  - Stripped:
    - `./` prefixes: `package.json`, `vitest.config.ts`, `architecture.md`, `README.md`
    - suffixes: ` (new)`, ` (QA-Red)`, ` (Developer)`, ` (written by QA-Red)`, `(re-scope …`
    - line anchors: `:19 "…"`, `:84 (S1)`, `:43`
  - Dropped as non-paths:
    - 007-05: "the four new test files and test/wiki-sizes.red.node.test.ts" (its path is already listed)
    - 009-01: "Change it to the version in package.json"
  - Kept after stripping: 007-01's `test/config.red.node.test.ts`, which is the file shared with 009-01.
- **Plan text.** The sprint plan's §2 still holds the first-run (7-wave) block. Replace it with this one, and move 009-01, 009-02 and 009-03 in the §1 Wave column (§2.1).

**Dependency-edge recommendations** (story files unchanged):
1. Applied: both `package.json` arrows that involved 007-07 are dropped (the human, 2026-10-18).
2. 008-03 before 008-05 (wave 3) and 007-07 before 009-01 (wave 4) stay merge orders within a wave. They are not edges, so they cost nothing.
3. No missing edge found. Checked:
   - 007-05's finish fixtures against the conservation rule;
   - `test/settings-reports.red.node.test.ts:84` builds its paths literal `as never`, so `archiveDir` breaks no typecheck when 008-01 merges;
   - the `DEFAULT_CONFIG` spreads in `test/lint/check-fixtures.ts:115` survive C1's `WikeeperConfig.tokens`;
   - no path is created by two stories;
   - no test pins the package version (007-07 R12), so 009-01 does not need 0.4.0 on its tree.

### §2.4 Lane Audit

| Story | Lane | Rationale (≤80 chars) |
|---|---|---|
| _(none)_ | | |

All 16 stories are `standard`, and none is fast-eligible:
- Every story fails check 4: each has 4 or 5 `Scenario:` blocks, several of them Outlines.
- Every story fails check 1: each touches more than 2 files.
- Only 007-02 and 009-03 pass check 6 (exposure `low`), and both still fail checks 1 and 4.
- Three stories touch security-relevant surfaces (check 2):
  - 007-07 changes permission enforcement.
  - 007-06 writes the user's Claude settings.
  - 009-02 runs npm on the user's machine.
- Check 3 passes for all stories: no new dependency.

### §2.5 ADR-Conflict Flags

ADR source: `architecture.md` §2 principles and the D-01–D-36 decision log, plus `gate1-decisions.md` and the flashcards.

- **[[CR-003]] B1 vs EPIC-008 (008-02).** `finish` refusing any dropped fact line becomes the conservation rule. Approved with EPIC-008 on 2026-10-18; decision D-37 is written by 008-06. Not open.
- **The network rule vs EPIC-009 (009-01, 009-03).** [[EPIC-003]] and `architecture.md:425` say "`read` is the only command that uses the network". Approved with EPIC-009; covered by:
  - D-38, the §7.7 change and the §2 principle-1 text (009-03);
  - the `src/read/url.ts` header comment (009-01 R13).
  - D-38 follows D-37 because 009-03 merges after 008-06 (decision 60). Not open.
- **Principle 3 (traceable facts) vs K10/K12.** Archive pages are exempt from citing the current source, and `uncited-claim` skips them. No conflict: the conservation rule moves fact lines unchanged, so their `[[src-…]]` citations go with them.
- **Principle 4 (`remove` never deletes knowledge) vs 008-05 `--purge`.** `--purge` already deletes `pages/` today (audit issue 15). Deleting `archive/` too is consistent. With `content_dir: .`, a user's own `archive/` is adopted silently (decision 26, approved). Not open.
- **§6.3 install set vs `statusline --install` (007-06).** It writes `.claude/settings.local.json` and `.git/info/exclude`, outside the manifest-tracked install set. It runs only when the user asks; `remove` and `update` leave it alone (007-06 R13 and scope). No decision is broken, but 007-07 R11 does not list §6.3. Add the file to §6.3 in the close-out doc refresh.
- **Principle 2 (the CLI is the gate).** The size approval is enforced by the CLI (exit 3, `needs_approval`). "Tell the user once" and "never start a clean-up yourself" are advice by the human's decision, and `finish`'s conservation rule is the gate that keeps facts. No conflict.
- **SPRINT-03 decisions 22–23 and D-11 / §6.5 (007-07).** Line 4 is appended without a new line (decision 19), so the 14-line cap holds. The `SHIPPED_BLOCKS` append keeps `update`'s refresh of unedited blocks. Not open.
- **Principle 1 (no LLM calls, no API keys).** The npm registry request is neither. SPIKE-003's samples stay out of the repository. No conflict.

## Wave Assignment

| Wave | Stories | Parallel? | Rationale |
|------|---------|-----------|-----------|
| wave1 | STORY-007-01, STORY-008-01 | Yes | integration layer 0: no upstream; 007-01 builds from its own skeleton C1, 008-01 from `sprint/S-04`; no shared path |
| wave2 | STORY-007-02, STORY-007-03, STORY-007-05, STORY-007-06 | Yes | integration layer 1: 007-02 from C4 (`config.ts` on 007-01's); 007-03 from its own C2; 007-05 and 007-06 from C1; 007-05 also after 008-01 (`ingest-finish.ts`, separate hunks, re-applied); the only shared path is `src/program.ts`, insert-only |
| wave3 | STORY-008-02, STORY-008-03, STORY-008-05, STORY-007-04 | Yes | integration layer 2: 008-02 from C5 (report hunks re-applied on 007-05's), 008-03 and 008-05 from C6, 007-04 from C2; no shared path among the four; merge 008-02 first (exposure high), 008-03 before 008-05 |
| wave4 | STORY-007-07, STORY-008-04, STORY-009-01 | Yes | integration layer 3: 007-07 from `sprint/S-04` (text, rules, docs, 0.4.0); 008-04 from C7; 009-01 from C8 (status and bullets on 008-05's, plus K14). 007-07 and 009-01 share only WIKI.md and `package.json`, in separate hunks, not a real collision; merge 007-07 first when both are ready. 009-01's manual check runs on a scratch copy with the version set to 0.4.0 |
| wave5 | STORY-008-06, STORY-009-02 | Yes | integration layer 4: 008-06 from C9 (on 007-07's text and 007-05's row); 009-02 from C3 since the contract step, one `src/program.ts` append; no shared path |
| wave6 | STORY-009-03 | No | integration layer 5: upstream 009-02, 008-06, 009-01; builds from C10 (WIKI.md, docs, `DOCUMENTED_FORMS` and `COMMANDS` on top); merges last |

## 4. Execution Log

- 2026-10-18 · Gate 2: the human confirmed the plan (6 waves, 10 contracts, 16 stories) and the Goal Acceptance Check, after the designer's DRAFTS rounds 1–2 and plan-confirmation decisions 62–66. Before kickoff: all testing moved to the fictional testbed (`testbed.md`); private names and content removed from the tree and, with the human's approval, from the whole git history (rewrite verified: 0 hits, 1684/1684 tests); the GitHub repository was recreated by the human's decision and the clean history pushed (CI green; release workflow paused for the tag, nothing published).
- 2026-10-18 · Kickoff: preflight 5/5 pass; devops reachable; `sprint/S-04` cut from main at 7546528; `init_sprint.mjs SPRINT-04 --stories <16>` → state.json with 16 stories, all standard, `.active` = SPRINT-04 (init first refused the plan as unapproved; `approved: true` recorded from the human's confirmation); Goal Acceptance Check, versions, test stack and 11 cross-cutting rules written to sprint-context.md; status Active; dashboard at http://localhost:4713.
- 2026-10-18 · Contract step: one Developer skeleton dispatch wrote C1 `contract/S-04-tokens` aa2d814, C2 `contract/S-04-source-size` 91501d1 (on C1), C3 `contract/S-04-update-check` ed6a47a (on `sprint/S-04`); typecheck at every tip, 1684/1684 tests on C2 and C3; no deviation (`compareVersions` appended to the existing `src/core/version.ts`). 2 flashcards recorded.
- 2026-10-18 · M3 plan (`plans/M3.md`). CR:spec-clarification: STORY-007-02's `content_dir` refusal also names `archive/` (under `content_dir` since 008-01); red tests not yet written. Stale "not yet approved" footers in 008-03 and 008-05 corrected. Plan decisions accepted: a hand-written yellow-above-red pair is not marked `(default)`; an archived hit passes `--since` on its own facts; live entries sort before archived ones on a tie; 008-05 measures the archive with `measureWiki`. Known gap: `index-drift` misreports wikis with archive pages between the 008-03 and 008-04 merges (no shipped release in between). 2 flashcards recorded.
- 2026-10-18 · M1 plan (`plans/M1.md`, 007-01/03/04/05/06). CR:spec-clarification: STORY-007-07 R5 (e) adds `oversized-page` to WIKI.md's list of findings `ingest finish` reports (007-05 adds the check but may not edit that sentence; Gherkin row and task added). Accepted: the Architect's 007-06 wording where the story and designer pin none (QA-Red asserts code and key phrases); 007-04 uses the three-argument `estimateFile`; 007-05's `page_tokens` pass sits before miss recording; 007-01's oracle test is written from R1, not from SPIKE-003's script. 4 flashcards recorded.
- 2026-10-18 · M2 plan (`plans/M2.md`, 008-01/007-07/009-02). CR:spec-clarification: STORY-007-07 gains Gate 1 decision 22 (Q7), approved but missing from its body (R2 (e) `likely_scanned` row, R13 `data.tokens_rough`, scenario-1 row); STORY-008-01's timing check names a scratch copy of the testbed. Accepted: 007-07's QA-Red runs at the start (Group A rows pass on its own branch, Group B after 007-02…06 merge; seven listed structural failures expected until then, no stub registrations); 009-02 detects the install without `npm root -g` when nothing newer is out, and "project files are newer" is a warning; neither C10 name appears in commits or comments. 3 flashcards recorded.
- 2026-10-18 · Wave A (build-only, one workflow run, 8 stories; worktrees cut from C1: 007-01/05/06, C2: 007-03/04, `sprint/S-04` 05da80c: 008-01/007-07, C3: 009-02). BUILT: 007-03 9a815cf, 007-04 0ddd49d, 007-05 838b9a0, 007-06 516f8ba, 008-01 9df9c09, 007-07 640c64f, 009-02 e4c8b73 (failures only from C1/C2/C3 stubs or not-yet-merged upstreams, as planned). 007-01 BLOCKED on two red-test defects (snapshotTree read symlinked skill dirs; S5 ran `init --yes` with `agents: []`, which exits 5 by design), implementation kept uncommitted for resume; 007-05 reported an order-dependent red test (`setLintHook(null)` never restored). Worktrees had no installed packages (tests resolved them from the main checkout; tsc-building and packed e2e tests could not run): `npm ci` run in all 8. Contract C5 `contract/S-04-archive` cut at 9df9c09. Wave B launched: QA-Red fixes for 007-01 and 007-05, 008-01 QA-Verify.
- FLASHCARD-REJECT 2026-10-18 — "init --yes with agents: [] exits 5 needs_input; tests need --agents or a config with agents" — reason: duplicate of the 2026-10-17 #cli #test-harness card.
- 2026-10-18 · Wave A flashcards: 8 approved, the two worktree node_modules cards merged into one, 1 rejected (above).
- 2026-10-18 · Wave B (one run): 007-01 BUILT 145e170 after QA-Red fixed both red defects (ae312da), full suite 1738/0; 007-05 red file fixed (8c80eb6, `setLintHook(finishLintHook)` in beforeEach), no code change; 008-01 GREEN (QA PASS 4/4, full suite 1712 + one load timeout that passes alone; post-flight scan clean). Contract C4 `contract/S-04-config` cut at 145e170. Wave C launched: 007-01 QA-Verify.
- FLASHCARD-REJECT 2026-10-18 — "snapshotTree helpers must skip symlinks (init creates dir symlinks); init --yes needs agents…" — reason: duplicate of the wave A snapshotTree card and the 2026-10-17 init card. FLASHCARD-REJECT 2026-10-18 — "afterEach setLintHook(null) wipes the module-load hook…" — reason: duplicate of the wave A setLintHook card. The 007-07 report's variant of the worktree node_modules card is covered by the merged card.
- 2026-10-18 · M5 plan (`plans/M5.md`, 009-03). Accepted: Step 0 merges `sprint/S-04` into 009-03's branch after 009-01 and 009-02 merge, before QA-Red, and Step 5 again before QA-Verify; README `remove` gets its own row in 008-06 (passed to the M4 Architect); the plan's architecture.md §3 and README prose (no designer pass: docs/ux.md binds CLI output and agent text); unchanged-file checks by sha256 pins (CI fetch depth 1). Goal-check note for the human: in a project whose files are from 0.3.0 the agent follows 0.3.0's WIKI.md, which says nothing about versions, so walkthrough rows U1/U2 test 0.3.0's text plus 0.4.0's CLI line, and U3/U4 test 009-03's new paragraph; if U1/U2 show ❌, the options are a wording change to the files-older line or acceptance as a one-time 0.3.0 → 0.4.0 limit. 5 flashcards recorded.
- 2026-10-18 · Wave C: 007-01 GREEN (QA PASS 5/5, full suite 1738/0, scan clean). Testbed check: `measureWiki` gives 56 pages, 70,319 tokens (−4.2% against Claude's 73,369), index 7,559, largest `decisions.md` 6,529. 008-01 merged ff82c27 (DevOps; 298/298 on its files, typecheck clean). Contract C6 `contract/S-04-sizes` 352d5dc = C4 + C5 + story/STORY-007-05 at 8c80eb6, clean merges; full suite 1790/1794: the 4 failures are 007-05 red tests whose fixtures are too small for the real estimator (a "12k" page measures 9,770, below red at 10k), to be fixed by QA-Red when 007-05 integrates. Wave D launched (build): 008-02 from C5, 008-03 and 008-05 from C6.
- 2026-10-18 · 007-01 merged 1a58b9a (full suite 1769/0). Wave E launched: 007-03 and 007-06 integrate, 007-05 cut-merge + QA-Red fixture fix + verify, 007-02 full cycle from `sprint/S-04` 201a2c5 (its upstream 007-01 is merged, so it needs no C4 base).
- 2026-10-18 · M4 plan (`plans/M4.md`, 008-04/009-01/008-06). CR:spec-clarification: STORY-008-06 R6 (a) names `wikeeper search "launch date" --archive` (checkCoverage counts only spans that name the command, so `DOCUMENTED_FORMS`' new `search --archive` would otherwise fail "every check is clean"); 008-06 R5 (e) adds the archive alias sentence to the `broken-link` row, which Gate 1 decision 32 assigned to it; STORY-009-01 R10's doctor warnings print the step once, on the `fix:` line (decision 66's rule); 009-01 Q7's WIKI.md order corrected to the sprint plan's. Accepted: Step 0 cut-merges for all three; 008-06 splits README's `update`/`remove` row (M5's fallback `remove` wording); 009-01's manual check may make one real registry request from a scratch copy; the plan's flagged choices (invalid `update_check` reason, no check for a non-registry installed version, available line before the files line, `fetchLatestVersion` error strings incl. `ENOTFOUND`, `CI=""` turns the check off). 7 flashcards recorded.
- 2026-10-18 · Contract C9 `contract/S-04-token-text` f942fa8 = C6 + story/STORY-007-07 at 640c64f (clean; failures only from unmerged upstreams). Wave F launched: 008-06 build from C9.
- 2026-10-18 · Wave D (build): 008-02 BUILT f4d4e05 (all 356 ingest tests pass; deviation: the M3 plan's seeded property test was not written; it is required before 008-02 integrates); 008-03 BUILT dab98ac (24/24 search-archive reds; display strips a fact's trailing citation in the human changes line, as the Gherkin expects); 008-05 BLOCKED on a red fixture (roadmap.md measures 109 tokens against a test red limit of 100, so a size candidate correctly appears beside final_status), implementation committed df72334. Contract C7 `contract/S-04-search-archive` cut at dab98ac; 008-04 worktree cut from C7. 4 flashcards recorded.
- 2026-10-18 · Wave E: 007-03 GREEN 5c70b85 (integrated; QA PASS 5/5; testbed: the 26k PRD estimates 28,866 🟡, `ingest start` exits 3 naming `tokens.source.yellow (20k)`, `--approved` registers it), 007-06 GREEN d75fbe7 (integrated; QA PASS; test:perf pass), 007-05 GREEN 749f78a (cut-merge 7ca9e64, QA-Red rebuilt the size fixtures with the real estimator; 1794/0; test:perf 2/2 once load dropped; its QA report file was not written, so QA re-verifies before merge), 007-02 GREEN c201862 (QA PASS 6/6, 1782/0). Machine load ~50 with three runs in parallel: 5 s timeouts in random git-spawning files, each passing alone. Merge order: 007-03, 007-02, then 007-05 (after its QA report), then 007-06 re-integrates (src/program.ts is shared with 007-02) and merges.
- 2026-10-18 · Wave E flashcards: 3 approved; 5 load-timeout cards merged into one (duplicates of the 2026-10-17 timeout cards).
- 2026-10-18 · Wave G (build): 008-05 BUILT (QA-Red fixture fix 763a138 on implementation df72334; 1821 pass, only 007-05's 4 known fixture tests fail on C6); 008-04 BUILT 990728f (1862 pass; every 008-02-dependent row already passes on C7). Contract C8 being built (story/STORY-008-05 + C3). 2 flashcards recorded.
- 2026-10-18 · Wave F (build): 008-06 BUILT ff19aa9 (WIKI.md 333 lines, edits W1–W9 incl. the `--archive` example and the broken-link alias row; 30 failures, all from unmerged upstreams). Contract C10 `contract/S-04-archive-text` cut at ff19aa9. 1 flashcard recorded.
- 2026-10-18 · Contract C8 `contract/S-04-archive-status` 0e83247 = story/STORY-008-05 763a138 + C3 (clean; 1821/1825, only 007-05's 4 known tests); 009-01 cut from C8, wave H launched (build). Merged: 007-03 fb35d25, 007-02 93e7565 (clean, serial; typecheck clean; full-suite failures load-only: search p95 1100–1290 ms under load, 600–670 ms alone at load ~36 against 500 ms — re-run on a quiet machine before close). 4/16 Done. Wave I launched: 007-06 re-sync (src/program.ts shared with 007-02) and 007-04 integrate.
- 2026-10-18 · 007-05 QA report re-verified (PASS 5/5; testbed `tokens: wiki ≈70k · 56 pages · index.md ≈7.6k`, copy unchanged by `status`; search p95 fails 5 of 12 runs at load 18–40, also once on the base without 007-05). 007-05 merged 3f6c43c (clean; 1857/1857 with the perf flake re-run alone). 5/16 Done. Wave J launched: 008-02 (adds the M3 plan's seeded property test, then integrates), 008-03 and 008-05 integrate.
- 2026-10-18 · Wave H (build): 009-01 BUILT e599c1c (1839 pass; expected: update-check.red S3 needs 007-02's `config` command, plus 007-05's 4 fixture tests on C8; update-check perf 2/2). Its Developer compared against a `git stash` of its own changes, against the standing rule (the stash is shared by every worktree): `git stash list` is empty afterwards and no other worktree has stray changes; Developer and integrate prompts now forbid stash explicitly.
- 2026-10-18 · Wave I: 007-06 GREEN c410166 (re-sync over 007-02's `src/program.ts`; QA PASS 4/4; test:perf 3/3; scan flagged red files changed by merge → Architect post-flight PASS); 007-04 GREEN 87f3e67 (integrated; QA PASS 5/5; Architect post-flight PASS). Merging 007-06 then 007-04. 3 flashcards recorded.
- 2026-10-18 · Merged 007-06 63ba64c and 007-04 d774484 (clean; full suite 1913/0; test:perf 3/3 incl. statusline p95). 7/16 Done (EPIC-007 except 007-07). Wave K launched: 007-07 integrate (all upstreams merged; Group B rows and structural checks must pass now).
- 2026-10-18 · Wave J: 008-02 GREEN 6c9b29a (seeded property test added ee6ecef, integrated; QA PASS 5/5, all 31 M3 table cases mapped; 1905/0; Architect post-flight PASS — red files changed only by the re-sync merge), 008-03 GREEN cfc42c1 (QA PASS 5/5; test:perf passes once load drops; the base also fails p95 under load), 008-05 GREEN 8369257 (QA PASS 5/5; archive_candidates bullet byte-identical to 008-06 R5 (d); Architect post-flight PASS). Testbed gap: beta.md carries no status, so beta cannot appear as a final_status candidate without a status update (walkthrough note).
- 2026-10-18 · Wave K: 007-07 BLOCKED at integration (merge efc7dfb clean): its red row expected every `config get tokens` line "(default)" after `init --yes`, but 007-01's init writes the five limits and 007-02 marks only unset keys. CR:spec-clarification, resolved for the owners' approved semantics: the row now expects `tokens.page.red` marked after the unset; QA-Red re-scopes that row; no code change.
- 2026-10-18 · Waves J–K flashcards: 5 approved, 2 timeout duplicates rejected (covered by the merged load card).
- 2026-10-18 · Wave L: 007-07 GREEN a4cc11a (QA-Red re-scoped the one default-marking row; full suite 1992/0 on the integrated tree; every Group B row and structural template check passes). Merged 008-02 49ed7aa, 008-03 bde0ffa, 008-05 9e797ee (clean, serial; 2034/2034; test:perf 3/3). 10/16 Done. Merging 007-07 (WIKI.md shared with 008-05); wave M: 008-04 integrate.
- FLASHCARD-REJECT 2026-10-18 — "doctor-messages.red tests with git setup can hit the 5s timeout…" — reason: covered by the merged load-timeout card.
- 2026-10-18 · 007-07 merged ed62139 (clean over 008-05's WIKI.md bullets; templates and agents 655/655; full suite 2112 + one timeout that passes alone). EPIC-007 complete. 11/16 Done. Wave N launched: 009-01 integrate (config.ts, doctor.ts, status.ts, ingest commands, package.json, WIKI.md shared; conflict rules per owner).
- 2026-10-18 · Wave M: 008-04 GREEN 0e64c96 (integrated; QA PASS 5/5; testbed: a page moved whole to the archive, `[[archive/<path>]]` resolves, lint clean, no index-drift). Merged 008-04 e735ac1 (clean; 2148/0). 12/16 Done. Wave O launched: 008-06 integrate.
- 2026-10-18 · Wave O: 008-06 BLOCKED at integration (merge 1ea08f8 clean): two red rows filtered `search --archive` hits by `path === "archive/…"`, while the merged owner 008-03 (K11, its own red test) returns `path` without the prefix plus `file: .wiki/archive/…` and `archived: true`. Red-test defect against the owner's contract: QA-Red re-scopes the two rows (wave P); no code change. 1 flashcard recorded (reworded as a rule).
- 2026-10-18 · Wave P: 008-06 GREEN 9c8b983 (QA-Red re-scoped the two archive-hit rows to `file`; QA PASS 24/24 rows; 2181/0; checkCoverage finds `wikeeper search "launch date" --archive`). Merging 008-06.
- FLASHCARD-REJECT 2026-10-18 — "filter archive search hits on `file`…" — reason: duplicate of the wave O card.
- 2026-10-18 · 008-06 merged 0665a7c (clean; templates 356/356; full suite 2184/2184). EPIC-008 complete. 13/16 Done.
- 2026-10-18 · Wave N: 009-01 GREEN 1737395 (integrated at cc565fd; QA PASS 5/5; 2149/0; test:perf pass). Architect post-flight FAIL once, test-only: a 'does nothing outside a wiki' unit test passed without testing anything (`runIngestUpdateCheck(new Command())` throws at `getOutputContext` and its own catch swallows it), plus a missing config-syntax-error hook test; the Developer fixed both, then QA and post-flight passed. The 'red modified after QA-Red' flag was again a false positive (`git diff db1bc36 HEAD` empty). Merged 9f8e939 (clean over 008-06's WIKI.md; version-status bullet directly after archive_candidates; templates 356/356; full suite 2225/0). 14/16 Done. 1 flashcard recorded (3 flagged: 1 kept, 2 duplicates). Wave Q launched: 009-02 integrate (`src/program.ts` conflict: sprint/S-04's commands plus `upgrade` last).
- 2026-10-18 · Wave Q: 009-02 GREEN e775409 (integrated at 38f0c3a; `src/program.ts` resolved as planned; QA PASS 5/5; 2267/0, 1 win32-only skip; test:perf 5/5; testbed scratch copy with a temp-prefix install: `--check` reports global/local/npx correctly, manifest 0.4.0 after `upgrade`; the machine's own global wikeeper stays 0.3.0). Architect post-flight FAIL once: (1) the update-step runner calls had no catch, so a rejection surfaced as `ENOENT` with details null, outside K16's five codes; (2) DEP0190 on Node >= 24 for shell spawns with an args array; (3) four `--check` human lines named a command upgrade never runs or gave no next step (ux.md §1.3, §8); (4) no EPERM test. The Developer fixed all four, then QA and post-flight passed; red file unchanged since cc93f1a. Merged 4bc6173 (clean; 2267/0; `--help` lists `upgrade`). 15/16 Done. 4 flashcards recorded (5 flagged, 1 duplicate). Wave R launched: 009-03 (Step 0 cut-merge is a fast-forward, since C10 ff19aa9 is an ancestor of sprint/S-04; re-scope #19; no Step 5 re-sync needed, as every other story is merged).
- 2026-10-18 · Wave R: 009-03 Step 0 cut-merge a81f4f1 (fast-forward; 2262/0); QA-Red 2c28645 (new upgrade-instructions red file + re-scope #19; scan clean). BLOCKED at the Developer (spec-contradiction): STORY-008-06's red row in `test/templates/archive-instructions.red.node.test.ts` pins README's decision range `D-01`–`D-37`, while 009-03 R4 (c) (Q5, approved) makes it `D-01`–`D-38`. CR:spec-clarification: the later approved text stands; QA-Red re-scopes that one assertion to a range from D-01 ending at D-37 or later (re-scope #20, sprint-execution §C.0.2 step 6; recorded in 009-03 §1.4 and §3.1); no code or decision change. The Developer's hunks stay applied, uncommitted, in the worktree. Wave S launched: QA-Red re-scope #20, then the Developer commits, QA-Verify, post-flight. 1 flashcard recorded.
- FLASHCARD-REJECT 2026-10-18 — "Before reporting, apply the plan's text hunks to a scratch copy…" — reason: duplicate of the 2026-10-17 `#qa #red-test` scratch-copy card.
- FLASHCARD-REJECT 2026-10-18 — "architecture.md has `## ` lines inside fenced code…" — reason: duplicate of the 2026-10-18 `#docs #test-harness` card.
- 2026-10-18 · Wave S: QA-Red re-scope #20, first attempt 652674b (scan clean). Developer BLOCKED again: the orchestrator's re-scope instruction kept the bare `D-37` phrase, which README names only inside the range, so it fails once the range is `D-01`–`D-38` (orchestrator error, not an agent defect). Story §1.4 note corrected; wave T launched: QA-Red drops the bare phrase too (the range assertion, ending at D-37 or later, covers it; architecture.md's §13 D-37 test is unchanged), then the Developer commits. 2 flashcards folded into the range card.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| The conservation rule refuses a legitimate ingest (a page renamed, merged, or moved whole to the archive). | STORY-008-02 has a passing test for each of these and a refusing test for each rule; the refusal keeps the lock, so the writer can fix the page, as today. |
| The estimate is calibrated against Claude only; Gemini is unmeasured. | Claude counts highest of the measured models, so the gauges over-report for Codex rather than under-report. The ±15% error is stated in `WIKI.md` and the README. |
| Counting a PDF at `ingest start` runs `read`'s extraction and takes time. | `read`'s timeout and size limits apply; `ingest plan` extracts nothing; in the normal flow `start` counts the `--text-file` `read` already wrote. |
| `wikeeper statusline` runs on every redraw of Claude Code's status line. | p95 < 300 ms on 500 pages, enforced by `npm run test:perf` (STORY-007-06). |
| Several stories edit `status`, `search`, `lint`, the finish report and `WIKI.md`. | Merge order in §2.2; the SDR fixes contracts and waves. |
| The human's own `~/.claude/settings.json` already sets a status line. | `statusline --install` refuses and prints how to add the wiki line to the existing one; it never replaces one. |
| The version check slows or breaks ingest (offline, behind a proxy, in an agent sandbox). | One request a day at most, a 1.5 s timeout, failures saved and silent; the check never changes a result or exit code (STORY-009-01 tests with a fetch that never answers). |
| `wikeeper upgrade` runs npm on the user's machine and can fail halfway. | It runs only when the user asks, never with `sudo`; npm's error and the command to run by hand are shown; `update` runs only after npm succeeds. Tests use an injected npm runner. |

## Metrics & Metadata
- **Expected Impact:** the user sees the wiki's size at every session start and every document's size before it is read; pages can shrink again without losing a fact.
- **Priority Alignment:** requested by the human after real use (2026-10-18). EPIC-007 first; EPIC-008 builds on its page limits.

---

## Execution Guidelines (Local Annotation — Not Pushed)

- **Starting Point:** STORY-007-01 and STORY-008-01 have no upstream and unblock everything else. EPIC-009's stories merge late: they share `config`, `status`, the ingest commands and `WIKI.md` with EPIC-007 and EPIC-008.
- **Relevant Context:** `plans/decomposition.md` (contracts K1–K13), `plans/decomposition-epic-009.md` (K14–K16), SPIKE-003 §5 (the estimator), EPIC-007, EPIC-008 and EPIC-009.
- **Constraints:** no new runtime dependency; the CLI makes no model calls; no test reaches npm or runs npm; never replace a user's status line; the samples and scripts from SPIKE-003 stay out of the repository; walkthroughs run as a real user, never with personal documents. All testing uses a scratch copy of the fictional testbed (`.cleargate/sprint-runs/SPRINT-04/testbed.md`); no agent runs anything in, reads from or changes any other wiki on this machine, and no repo text names one, quotes its content, or names a person.
- **Release:** `package.json` moves to `0.4.0` (STORY-007-07). Publishing is a separate step after Gate 4.
