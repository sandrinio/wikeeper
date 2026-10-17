## 2. Execution Strategy

<!-- role: architect-synth · Sprint Design Review (re-run) from 21 architect-reader digests · waves.json schema_version 2 (.cleargate/sprint-runs/SPRINT-03/plans/waves.json) · 2026-10-17 · includes decisions 22–26 and STORY-002-11 -->

### §2.1 Phase Plan

**Build set: all 21 stories.** No story is refused and none is fail-safe-serialized:
- Every digest has the required fields.
- Every `(file_surface ∪ file_creates)` is non-empty, so the BUG-033 guard passes.
- Every `db_write_set` is empty.
- `parallel_eligible: n` on 002-11, 003-11, 005-02 to 005-05, 005-08, 005-09 and 006-09 to 006-12 comes from the story files. The orchestrator did not set it, so it is an integration-order hint, as in the first run. Treating 002-11 as fail-safe would also be contradictory: it would go into a trailing wave after 006-12 and 006-11, which both depend on it.

Paths were checked against `main` on 2026-10-17:
- Every path a story edits exists today, and every path a story creates does not exist yet.
- New in this run: `src/agents/inject.ts`, `src/agents/index.ts` and `templates/agent-block.md` exist.
- `src/agents/shipped-blocks.ts`, `test/agents/shipped-blocks.test.ts`, `test/agents/block-refresh.test.ts` and `test/fixtures/read/table.csv` are absent, as expected.

**Reachability (BUG-046).** Five digests list `unreachable_surface` paths. This is unchanged from the first run:
- 003-11: `src/read/index.ts`, `test/read/read-command.test.ts`, `test/read/http-server.ts` and `test/fixtures/read/SOURCES.md`. 003-10 creates all four.
- 005-03, 005-04, 005-08: `src/lint/checks.ts` (all three), plus `test/lint/lint-command.test.ts` and `test/lint/checks.test.ts` (005-03 only). 005-02 creates them.
- 005-09: `test/agents/rule-match.test.ts`. 002-09 creates it.

Each creator is in the consumer's `dep_predecessors`. Each consumer's base carries the creator's files: C6 for 003-11 and 005-09, C7 for 005-03, C2 for 005-04 and 005-08.

006-12 also edits two files that are not on `main`: `src/agents/shipped-blocks.ts` and `test/agents/shipped-blocks.test.ts`. 002-11 creates them, and its reader reported no `unreachable_surface`. The creator is a `dep_predecessor`, and 006-12's base (C10) carries both files. As the orchestrator directed, all of these are ordering edges, so no refusal is emitted.

**Contracts (10).**
- C1–C3 are skeletons written by one Developer skeleton dispatch at the contract step. Each is one commit on one branch. Bodies throw `contract stub Cn`, and constants carry their frozen values.
- C4–C10 are each cut from the owner's own Developer commit as soon as that Developer reports done.
- The owners of C1–C3 build from their own contract, so the skeleton is the merge base and consumers merge without add/add conflicts.
- Frozen exports per contract are listed in `waves.json`. They are never renamed or retyped.
- C10 is new. C9 now stacks on C10 instead of C8. C1–C8 are unchanged.

| id | branch | base | owner | content | direct consumers | cut when |
|---|---|---|---|---|---|---|
| C1 | `contract/S-03-kb-parser` | `sprint/S-03` | 005-01 | skeleton `src/kb/parse-instructions.ts`; `KB_SECTION_KEYS`, `KB_PROPOSAL_SECTION_KEYS` and `KB_ISSUE_CODES` keep their real values | 005-02, 005-04, 005-05, 005-06, 006-10, 006-11 | contract step, first |
| C2 | `contract/S-03-lint` | C1 | 005-02 | Skeleton `src/lint/checks.ts`, `links.ts`, `citations.ts` and `src/commands/lint.ts`. `lint` (`--rules`, `--check <id...>`, `--json`) is registered in `src/program.ts`, and `LintFinding` gets `line?: number`. `PAGE_CHECKS` holds 005-02's four checks, then an INSERTION POINT for 005-03 (directly after `indexDriftCheck`), an unchanged separator line, and an INSERTION POINT for 005-08 (last). `RULE_CHECKS` holds an INSERTION POINT for 005-04. The import block has one INSERTION POINT per consumer. 005-02 leaves every INSERTION POINT line as it is. | 005-04, 005-08, 006-10, 006-11 (005-03 via C7; 006-12 and 006-09 via C8) | after C1 |
| C3 | `contract/S-03-rule-decisions` | C1 | 005-06 | skeleton `src/kb/rule-decisions.ts` and `src/commands/rules.ts`; `rules record` and `rules list` registered with their options | 005-05 | after C1 |
| C4 | `contract/S-03-version` | `sprint/S-03` | 001-10 | Developer commit: `package.json` 0.3.0, `package-lock.json`, `scripts/build-info.mjs`, `test/e2e/pack.ts` | 003-10 (via C5) | 001-10 Developer done |
| C5 | `contract/S-03-enforce` | C4 | 002-09 | 002-09's Developer commit merged onto C4 (the two stories share no file): rule arrays, SETUP.md `ai` row, enforce red tests, `test/agents/rule-match.ts`, `rule-match.test.ts` | 003-10 | 001-10 and 002-09 Developers done |
| C6 | `contract/S-03-read` | C5 | 003-10 | Developer commit: `src/read/*` (DOCX and PDF stub branches; `.csv` / `.tsv` read as `text`), read tests and fixtures, lockfile, the `read` rule | 003-11, 005-09 | 003-10 Developer done |
| C7 | `contract/S-03-lint-impl` | C2 | 005-02 | Developer commit: the real registry plus `test/lint/lint-command.test.ts` (fixture helper) and `checks.test.ts` | 005-03 | 005-02 Developer done |
| C8 | `contract/S-03-text-rules` | C2 | 006-10 | Developer commit (text only): WIKI.md, SETUP.md, profile, kb seed, six sub-agent prompts, shared red-test re-scopes R6(a)/(b) | 006-12 (via C10) | 006-10 Developer done |
| **C10** | `contract/S-03-shipped-blocks` | C8 | 002-11 | 002-11's Developer commit merged onto C8 (no shared file with C1, C2 or 006-10's commit). It carries `src/agents/shipped-blocks.ts`, with `SHIPPED_BLOCKS` frozen: append-only, oldest first. It also carries `test/agents/shipped-blocks.test.ts`, with `SHIPPED_BLOCK_SHA256` frozen, plus the `inject.ts` refresh functions and the `index.ts` update change. | 006-12 | 006-10 and 002-11 Developers done; before C9 |
| C9 | `contract/S-03-text-writing` | **C10** | 006-12 | Developer commit (text only): WIKI.md, SETUP.md, `wiki-ingest/SKILL.md`, plus 002-11's commit through C10 | 006-09 | 006-12 Developer done |

**When each build starts.**
- **At once**, after the contract step (15 stories):
  - from `sprint/S-03`: 001-10, 002-09, 002-10, 002-11, 003-12, 004-07, 005-07
  - from C1: 005-01
  - from C2: 005-02, 005-04, 005-08, 006-10, 006-11
  - from C3: 005-05, 005-06
- **When a Developer-commit contract is cut:**
  - 003-10 (C5)
  - 003-11 and 005-09 (C6)
  - 005-03 (C7)
  - 006-12 (C10, which needs both 006-10's and 002-11's Developer commits)
  - 006-09 (C9)

**Base and upstream per story.** Upstream is the union of three sets:
- the story's `dep_predecessors`;
- the earlier story of each real collision;
- every contract owner in the story's base stack.

Every real-collision edge already exists as a `dep_predecessors` edge, so the predicate adds no new edge.

| Story | Base | Upstream | Layer |
|---|---|---|---|
| 001-10 | `sprint/S-03` | — | 0 |
| 002-09 | `sprint/S-03` | — | 0 |
| 002-10 | `sprint/S-03` | — | 0 |
| 003-12 | `sprint/S-03` | — | 0 |
| 004-07 | `sprint/S-03` | — | 0 |
| 005-01 | C1 | — | 0 |
| **002-11** | `sprint/S-03` | 002-10 | 1 |
| 003-10 | C5 | 001-10, 002-09 | 1 |
| 005-02 | C2 | 005-01 | 1 |
| 005-06 | C3 | 004-07, 005-01 | 1 |
| 005-07 | `sprint/S-03` | 003-12 | 1 |
| 003-11 | C6 | 001-10, 002-09, 003-10 | 2 |
| 005-03 | C7 | 003-12, 004-07, 005-01, 005-02 | 2 |
| 005-04 | C2 | 005-01, 005-02 | 2 |
| 005-05 | C3 | 005-01, 005-06 | 2 |
| 005-08 | C2 | 005-01, 005-02 | 2 |
| 005-09 | C6 | 001-10, 002-09, 003-10, 005-02, 005-05, 005-06 | 3 |
| 006-10 | C2 | 002-09, 003-10, 003-12, 004-07, 005-01, 005-02, 005-04, 005-09 | 4 |
| 006-12 | **C10** | 002-09, **002-11**, 003-12, 005-01, 005-02, 005-03, 005-09, 006-10 | 5 |
| 006-09 | C9 | **002-11**, 003-10, 003-11, 005-01, 005-02, 005-03, 005-04, 005-05, 005-06, 005-07, 005-08, 005-09, 006-10, 006-12 | 6 |
| 006-11 | C2 | all 20 other stories | 7 |

**Integration.** Each layer is one derived wave (see Wave Assignment). Stories merge one at a time. Within a multi-story wave they merge in any order.

**Re-sync rule.** Some stories cannot pass all their tests on their base alone:
- Stories built on skeletons hit stubs that throw: 005-02, 005-04, 005-05, 005-06, 005-08.
- The instruction and structural stories are checked by the real-tree template test. `test/templates/structure.ts` `commandTree()` resolves every `wikeeper …` reference in the templates against the registered program, so any command or option not yet merged fails it. This applies to:
  - 005-09 (`lint`, `status` and `rules list` must be registered; decision 17)
  - 006-10, 006-12, 006-09 and 006-11
- **New:** 002-11 is built without 002-10's `src/agents/index.ts` edit.

Each of these stories merges `sprint/S-03` into its branch once its upstream has merged. It then runs the full suite plus QA-Verify on that tree. Until then, red results caused only by unmerged upstream are expected.

**Critical path: 8 integration layers (L0–L7), unchanged.**
- **Longest integration chain:** 005-01 or 004-07 → 005-06 → 005-05 → 005-09 → 006-10 → 006-12 → 006-09 → 006-11.
- **Longest build-wait chains:** two chains of three Developer cycles each:
  - 001-10 + 002-09 → 003-10 → 005-09
  - 006-10 + 002-11 → 006-12 → 006-09 (002-11 now runs alongside 006-10 as an input to C10)
- 002-10 → 002-11 → 006-12 adds no layer. 002-11 sits in L1, and 006-12 stays in L5 because of 006-10.
- Waves 4–8 have one story each. The predicate does not force that. The human-approved shared-file orders for the enforce files, SETUP.md and WIKI.md do, and so does the 006-10 → 005-09 edge, which the human kept.

### §2.2 Merge Ordering

Collision kinds:
1. Ordered schema or migration journal (none in this sprint).
2. Lockfile or single-writer generated artifact.
3. Shared file whose edits must be applied in order.

"Insert-only" means each story adds its own lines, which resolves at integration by keeping both.

| Shared file | Stories | Order | Rationale |
|---|---|---|---|
| `package.json`, `package-lock.json` | 001-10, 003-10, 003-11 | 001-10 → 003-10 → 003-11 | Kind 2. Each story builds on the previous one's Developer commit (C4 → C5 → C6), so each lockfile is produced on top of the earlier one. Regenerate on the merged tree only if the owner changed the lockfile after its contract was cut. |
| `src/agents/enforce/claude.ts`, `codex.ts` | 002-09, 003-10, 005-09 | 002-09 → 003-10 → 005-09 | Kind 3. 002-09 rewrites the `ai`-mode ingest rules and adds the ask/prompt rules. 003-10 appends `read` directly after them. 005-09 appends the read-only allow rules after `search` (rule order from the Gate 1 technical calls). Bases C5 and C6. |
| `templates/system/SETUP.md` | 002-09, 003-10, 005-09, 006-10, 006-12, 006-09 | 002-09 → 003-10 → 005-09 → 006-10 → 006-12 → 006-09 | Kind 3. Step-4 table: one line per mode (`:51–53`), rewritten by 002-09, then 003-10, then 005-09 (C5, C6). Prose: 006-10 (step 3, the step-4 bullets `:41–43`, now including the decision-25 whitelist text), then 006-12, then 006-09 (C8, C10, C9). 006-10's prose and 005-09's rows are separate hunks. |
| `test/agents/enforce-ai-rules.red.node.test.ts`, `enforce.red.node.test.ts`, `test/agents/enforce.test.ts` | 002-09, 003-10, 005-09 | 002-09 → 003-10 → 005-09 | Kind 3. Each story re-scopes the same rule-list assertion lines (decision 21). C5, C6. |
| `test/agents/rule-match.test.ts` | 002-09, 005-09 | 002-09 → 005-09 | 002-09 creates the file; 005-09 adds rows on top (C6). |
| `test/templates/setup.red.node.test.ts` | 003-10, 005-09, 006-09 | 003-10 → 005-09 → 006-09 | 003-10 edits `:353` and 005-09 the `ai`-row assertions; 005-09 builds on top via C6. 006-09 edits `:196` and `:203`, different lines, and re-applies them at integration. |
| `test/templates.test.ts` | 002-09, 005-09, 006-11 | 002-09 → 005-09 → 006-11 | 002-09 adds the `*` unit row; 005-09 builds on top via C6. 006-11's rows are insert-only and re-applied at its re-sync. |
| `test/templates/structure.ts` | 002-09, 006-11 | 002-09 → 006-11 | 002-09 changes reference extraction (`*` → union of subcommand options). 006-11 adds new exported checks (`DOCUMENTED_FORMS`, `checkCoverage`, `checkLintIds`, `checkKbSeeds`): insert-only. |
| `src/program.ts` | 001-10, 003-10, 005-02, 005-06, 005-05 | free (layers put 001-10 first and 005-05 last) | Not a real collision. 001-10 edits `VERSION` (`:27`) and the help footer (`:55`). Each command story appends one import and one `defaultCommands` entry (`:33`): insert-only, keep every line. The `lint` and `rules` lines come from the C2 and C3 commits and match the owners' lines. |
| **`src/agents/index.ts`** | 002-10, 002-11 | 002-10 → 002-11 | **New.** Not shown to be a real collision. The digests name no shared region, and 002-11 consumes nothing from 002-10. The order comes from `dep_predecessors`. 002-10 changes doctor messages; 002-11 adds the block refresh to `update`, which today skips the block (decision 23). 002-11 builds from `sprint/S-03`, re-applies its edit on top of 002-10's at integration, and re-syncs on 002-10's merge before QA-Verify. |
| **`src/agents/shipped-blocks.ts`, `test/agents/shipped-blocks.test.ts`** | 002-11, 006-12 | 002-11 → 006-12 | **New.** Kind 3. 002-11 creates the append-only list of shipped block bodies and its sha256 pins. 006-12 appends one entry and one pin on top (C10). It never edits or reorders an earlier entry. |
| `src/read/index.ts`, `test/read/read-command.test.ts`, `test/read/http-server.ts`, `test/fixtures/read/SOURCES.md` | 003-10, 003-11 | 003-10 → 003-11 | Kind 3. 003-10 creates them; 003-11 replaces the DOCX/PDF stub branches and extends the tests on top (C6). 003-10's new `test/fixtures/read/table.csv` is not shared. |
| `src/lint/checks.ts` | 005-02, 005-03, 005-04, 005-08 | 005-02 first; the other three in any order | 005-02 creates the file. The other three are insert-only at their own C2 insertion points: 005-03 after `indexDriftCheck`, 005-08 at the end of `PAGE_CHECKS`, 005-04 in `RULE_CHECKS`. |
| `test/lint/lint-command.test.ts`, `test/lint/checks.test.ts` | 005-02, 005-03 | 005-02 → 005-03 | Kind 3. 005-03 extends 005-02's fixture helper (C7). |
| `src/ingest/log.ts` | 004-07, 005-03, 005-06 | 004-07 first (`dep_predecessors`); 005-03 and 005-06 in any order | Not a real collision. 004-07 edits the `miss` case (`:122–123`) and 005-06 the `default` rule-proposal branch on the next lines (`:124–125`): adjacent, keep both. 005-03's `IngestLogEvent.page_hashes` (`:13–26`) and `isPageHashes` are a separate hunk. |
| `test/ingest/log.test.ts` | 004-07, 005-03 | 004-07 → 005-03 | Appended cases; keep both. |
| `src/commands/ingest-finish.ts` | 003-12, 005-03 | 003-12 → 005-03 | Separate hunks: 003-12's validation block (`:141–156`), 005-03's `FINISH_CHECKS`, `finishLintHook` and module-load `setLintHook`. 005-03 re-applies at integration. |
| `src/commands/ingest-facts.ts` | 003-12, 005-07 | 003-12 → 005-07 | 003-12 rewrites the help text (`:40–42`). 005-07's `--dry-run` option lands on the next line: adjacent, keep both, and match 003-12's wording. |
| `templates/system/WIKI.md` | 006-10, 006-12, 006-09 | 006-10 → 006-12 → 006-09 | Kind 3 (order approved by the human). C8, C10, C9. |
| `templates/skills/wiki-ingest/SKILL.md` | 006-12, 006-09 | 006-12 → 006-09 | Kind 3. C9. |
| Six sub-agent prompts (`templates/agents/{claude,antigravity}/wiki-{extractor,writer}.md`, `templates/agents/codex/wiki-{extractor,writer}.toml`) | 006-10, 006-12 | 006-10 → 006-12 | Kind 3. C8 (through C10). |
| `test/templates/wiki-protocol.red.node.test.ts` | 006-10, 006-09 | 006-10 → 006-09 | Kind 3. 006-10 edits `:26`, `:74`, `:141`, `:242–248`; 006-09 edits `:11–25` and `:131`. Lines `:25` and `:26` are adjacent, so 006-09 builds on top via C9. |

`templates/agent-block.md` has one writer (006-12), so it is not in this table. It is coupled to the shipped-blocks list; see §2.3.

### §2.3 Shared-Surface Warnings

- **`src/program.ts` append conflicts (001-10, 003-10, 005-02, 005-05, 005-06).** All command stories append at the same two anchors, so every merge after the first conflicts on adjacent lines (FLASHCARD 2026-10-17 #git #merge). DevOps keeps both lines. No command line may be lost: a lost line breaks the real-tree template test for every instruction story.
- **`src/lint/checks.ts` tail (005-03 and 005-08).** Both insert at the end of `PAGE_CHECKS` and would conflict on adjacent lines. C2's insertion points, separated by an unchanged line, keep both merges clean. The final order is `broken-link`, `uncited-claim`, `orphan-page`, `index-drift`, `unlogged-change`, `stale-fact` (005-03 R6, 005-08 R1).
- **Enforce chain (002-09 → 003-10 → 005-09).** A SETUP.md mode row or a rule array rewritten on a stale base silently drops the earlier story's rules. C5 and C6 prevent this. The same applies to every Developer-commit contract (C4–C10). If an owner bounces at QA-Verify after its contract was cut, the consumer re-syncs on the owner's merge before its own QA-Verify (FLASHCARD 2026-10-17 #contract #merge).
- **New: pointer-block refresh chain (002-11 → 006-12).**
  - 006-12 must change `templates/agent-block.md` and append its `SHIPPED_BLOCKS` entry and `SHIPPED_BLOCK_SHA256` pin in the same commit; otherwise 002-11's pin test fails on 006-12's tree.
  - QA-Red for 002-11 must take the "current" block in `test/agents/block-refresh.test.ts` from `templates/agent-block.md` (or the last list entry), not from a literal copy. 006-12 changes the template but does not own that test.
  - Any later change to the block text must append the previous body (orchestrator call within decision 23).
- **New: pointer block at its cap (006-12, decision 22).**
  - The block is 12 lines on `main`. The two new lines bring it to exactly 14, the cap enforced by `test/templates/structure.ts:388` and `test/agents/pointer-block.red.node.test.ts:53`.
  - The first heading must stay `## Project Wiki` (`pointer-block.red.node.test.ts:57`), and the `.wiki/system/WIKI.md` reference must stay (doctor's block signature).
  - No `status` line (decision 20). Lines stay ≤200 characters.
  - Any further block line needs a cap decision.
- **New: `update` and an edited block (002-11).** `test/agents/integration.red.node.test.ts:111` (S2) expects `update` to exit 0 and leave an edited block byte-identical. Decision 23 agrees (an edited block is left alone with a warning), so the warning must not change the exit code. No other test was found that pins "update never touches the block".
- **New: `src/agents/index.ts` (002-10, 002-11).** 002-11 builds without 002-10's doctor-message edit. If the two hunks touch the same region, 002-11 resolves on top at its re-sync. 002-10 is a layer-0 story, so this costs at most one re-sync.
- **New: `.csv` / `.tsv` and the `.xlsx` hint (003-10, 006-09; decision 26).**
  - 003-10 owns the code. `.csv` and `.tsv` read as format `text`, so C6's frozen `ReadFormat` is unchanged.
  - 003-10 also owns the `UNSUPPORTED_HINTS['.xlsx']` text; 006-09 owns the agent-facing wording. 006-09 checks its wording against 003-10's merged text at its re-sync.
- **New: re-ingest from the stored original (006-09; decision 24).** The text names `ingest start --reingest` and, for a URL whose `read` fails, `--text-file`. The real-tree template test resolves every `wikeeper …` reference against the registered program. QA-Red for 006-09 confirms that both options exist before writing the text.
- **New: whitelist mode and chat captures (006-10; decision 25).** 006-10's step-4 text now also covers `ingest.whitelist.kinds`. It must stay out of the step-4 table rows that 002-09, 003-10 and 005-09 rewrite. If it touches them, 006-10 resolves on top at its re-sync; it integrates after 005-09.
- **005-03's `finish` lint hook vs every `finish` test.** 005-03 calls `setLintHook(finishLintHook)` when the module loads. After that, every program that loads `finish` runs `broken-link`, `uncited-claim` and `unlogged-change` on the changed pages. 005-03 R5 already covers `test/ingest/finish.red.node.test.ts:23` and `:288`. QA-Verify for 005-03 must run the full suite, `test/e2e` included, after re-syncing on 003-12's `finish` change, not just its own test files.
- **`unlogged-change` (error) vs later lint fixtures.** Any later test that runs page-scope `wikeeper lint` on pages written outside an ingest exits 1. 005-03 fixes only 005-02's tests. QA-Red for 006-09 (`test/templates/sprint-03-commands.red.node.test.ts`) and 006-11 must record ingest events or pass `--check <id>` if they lint a page fixture.
- **001-10 vs the `read` e2e tests.** 001-10 changes `test/e2e/pack.ts` and adds `scripts/build-info.mjs`. 003-10's `test/e2e/read.test.ts` and 003-11's `test/e2e/read-documents.test.ts` must build into a temp stage, not the shared `dist/` (FLASHCARD 2026-10-17 #e2e #test-harness). The build info must be generated in that stage too.
- **001-10's guard command.** The build stamp must not reach the `npx -y wikeeper@<v>` pin (Gate 1 technical call). `test/agents/enforce.red.node.test.ts:325` matches `wikeeper@\S+`, so a leaked `+<sha>` would pass that test while making every `update` re-pin the agent hooks (FLASHCARD 2026-10-17 #enforce #test-harness). QA-Verify for 001-10 checks that `npmVersion` strips `+…`.
- **`test/templates/setup.red.node.test.ts` (003-10, 005-09, 006-09).** 006-09 re-applies `:196` and `:203` at integration. If 005-09's edits reach that range, 006-09 resolves on top of them.
- **Instruction text chain (006-10 → 006-12 → 006-09).**
  - The wiki-writer text must stay identical across the three agents (FLASHCARD 2026-10-17 #templates #subagents).
  - The Codex TOML prompts must contain no `\`, no `"""` and no `{{model}}` (FLASHCARD #codex #toml #templates).
  - Structural tests miss wrong semantics (FLASHCARD 2026-10-17 #walkthrough #templates). At re-sync, check each command, flag and output field the text names against the merged command, not only against the template test.
- **`test/templates.test.ts:113` (005-09, 006-11).** If 006-11 adds its new checks to the same real-tree `it` block that 005-09 edits, 006-11 resolves on top at its re-sync.
- **004-07 and search performance.** The search-perf p95 test fails in a plain full-suite run (FLASHCARD 2026-10-17 #test-harness #perf). Re-run it on its own before blaming 004-07's `src/search/engine.ts` change.
- **002-09 `update` with `enforce: false`.** It must remove only the hook and rules entries identified in the manifest, so the user's own settings entries survive (FLASHCARD 2026-10-16 #manifest).

**Dependency-edge recommendations** (story files unchanged):
1. *Closed: 006-10 → 005-09 is kept.* This was the first run's optional recommendation; the human was told and kept the edge. The critical path stays 8 layers.
2. *Not needed for correctness; leave as is.* Neither 005-06 → 004-07 nor 005-03 → 004-07 is needed. They edit different parts of `log.ts`, and the conflicts resolve by keeping both. Neither changes a layer.
3. *Keep 002-11 → 002-10.* It orders the shared `src/agents/index.ts` and costs nothing: 002-11 is in L1 and off the critical path.
4. *No missing edge found.* Checked:
   - `test/agents/integration.red.node.test.ts:111` agrees with decision 23.
   - `test/agents/pointer-block.red.node.test.ts` checks only ingest verbs, the cap and the heading, so 006-12's new lines need no test edit outside its surface.
   - 006-12 → 002-11 and 006-11 → 002-11 are in the digests; 006-09 gets 002-11 through C10/C9.
   - The first run's three checks still hold: `test/doctor.red.node.test.ts:84` (005-04 R10), the `finish` red tests (005-03 R5), and the manifest `package_version` fixtures.

### §2.4 Lane Audit

| Story | Lane | Rationale (≤80 chars) |
|---|---|---|
| _(none)_ | | |

All 21 stories are `standard`, and none is fast-eligible:
- Every story has 4 or 5 `Scenario:` blocks, which fails check 4. 002-11 has 4; 006-09, 006-10 and 006-12 have 5.
- Most also exceed the size cap (check 1).
- 003-10 and 003-11 add dependencies (check 3).
- 002-09, 003-10 and 005-09 change permission enforcement, a security-relevant surface (check 2). 002-11 makes `update` rewrite a block inside the user's own agent files (`CLAUDE.md`, `AGENTS.md`), which is another such surface.

### §2.5 ADR-Conflict Flags

ADR source: `architecture.md` §1–§13 (decision log D-01–D-36), plus `gate1-decisions.md` and the flashcards.

- **New: D-11 and §6.5 vs decision 23 (002-11).**
  - D-11 says "if present, the file is not modified". §6.5 says "Never modify an existing block" means `update` can't reach anything inside it.
  - 002-11 has `update` replace a block that exactly matches a shipped body.
  - The human approved this (decision 23). `gate1-decisions.md` records that D-11 and §6.5 are updated in the SPRINT-03 close doc refresh.
  - Marker `v1` and doctor are unchanged, so §6.5's doctor edge cases ("block version older than the package (report, don't rewrite)") still hold. Not open.
- **New: §7.7 read limits vs decision 26 (003-10).** `architecture.md:432` lists "`.doc`, `.pptx`, `.xlsx` — not supported". `.xlsx` stays unsupported, so there is no conflict. Its hint now says to export the sheet as CSV, and `.csv` / `.tsv` are read as text. Add both to §7.7 in the close doc refresh.
- **architecture.md §7.7 install size is out of date.** It says "about 8 MB together"; SPIKE-001 measured about 32 MB on disk (sprint plan Risks). The text is stale; no decision conflicts. Fix it in the close-out doc refresh.
- **Resolved since the first run: sprint plan §0 PDF-tables metric vs decision 7.** The orchestrator has corrected the metric; 003-11 follows decision 7 (PDF tables become one line per row).
- **D-28 (merge-safe for teams) vs decision 10.** After a git merge combines two ingests' edits to one page, `lint` reports `unlogged-change` (error) until the next ingest. The human approved this, and WIKI.md explains it (006-09). Not open.
- **§9 says `lint --rules` flags "duplicate or contradictory rules".** 005-04's 13 check ids include `duplicate-rule` but no contradiction check. §9's mechanics are `[Proposed]`, so no locked decision is broken. Note it for the doc refresh or as an EPIC-005 follow-up.
- **§10 CLI surface** lists neither `rules record | list` nor `read --out`. Update it at close.
- **CR-003 deviations approved at Gate 1:** decision 14 (the `--status` hint is narrowed) and decision 16 (Codex prompts for every `abort`; `apply --force-unlock` stays allowed). Recorded; not open.
- **FLASHCARD 2026-10-16 #test-harness #integrations vs 005-03 R5.** The flashcard says import-time registration breaks tests that reset and then lazily import, so registration belongs in `runCli`. 005-03 R5 deliberately registers the lint hook when the module loads. It records a mitigation: an `afterEach` reset, `toContain` asserts, and an immediate `[]` for an empty `changed`. Not blocking. QA-Verify runs the full suite (§2.3).
- **The decomposition brief's K1 is outdated (HTML comments).** K1 says lines inside HTML comments are ignored "as C2 already does". The flashcard (2026-10-17 #kind-rules #templates) says `parseSourceKinds` does not skip them. Decision 15 replaces K1: `kinds` stays exactly what C2 returns, and `lint --rules` reports `ambiguous-line`. 005-01 and 005-04 follow decision 15.
- **No conflict found** with:
  - Principle 1 or D-20 (no LLM calls; `read` is a helper outside ingest and the only network user);
  - D-29 (search stays CLI-only);
  - Principle 4 (the kb seed change in 006-10 affects only new `init`s; `update` never rewrites the user's `kb_instructions.md`);
  - D-06 (decision 25 documents existing `whitelist` behaviour for chat captures and changes no mode).

## Wave Assignment

| Wave | Stories | Parallel? | Rationale |
|------|---------|-----------|-----------|
| wave1 | STORY-001-10, STORY-002-09, STORY-002-10, STORY-003-12, STORY-004-07, STORY-005-01 | Yes | integration layer 0: no upstream; no shared path among the six; 005-01 builds from C1 |
| wave2 | STORY-002-11, STORY-003-10, STORY-005-02, STORY-005-06, STORY-005-07 | Yes | integration layer 1: 002-11 after 002-10 (shared `src/agents/index.ts`, re-sync), from `sprint/S-03`; 003-10 from C5 (package files and enforce chain, ordered); 005-02 from C2, 005-06 from C3; `src/program.ts` appends are insert-only |
| wave3 | STORY-003-11, STORY-005-03, STORY-005-04, STORY-005-05, STORY-005-08 | Yes | integration layer 2: 003-11 builds from C6, 005-03 from C7, 005-04 and 005-08 from C2, 005-05 from C3; `src/lint/checks.ts` inserts at separate C2 insertion points |
| wave4 | STORY-005-09 | No | integration layer 3: upstream 005-05; builds from C6 (enforce, SETUP.md rows and red tests on top); re-syncs for `lint`, `status` and `rules` registration |
| wave5 | STORY-006-10 | No | integration layer 4: upstream 005-09 (kept by the human), 005-04; builds from C2; SETUP.md prose and table are separate hunks |
| wave6 | STORY-006-12 | No | integration layer 5: upstream 006-10, 002-11; builds from C10 (006-10's text via C8, plus 002-11's shipped-blocks list and pins, appended to) |
| wave7 | STORY-006-09 | No | integration layer 6: upstream 006-12 and every command story; builds from C9 (stacked on C10) |
| wave8 | STORY-006-11 | No | integration layer 7: upstream all 20; builds from C2; verified on the final tree; merges last |
