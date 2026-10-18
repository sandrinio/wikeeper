# SPRINT-04 — Consistency audit of the 13 drafted stories (EPIC-007, EPIC-008)

Run 2026-10-18, before Gate 1. Inputs: `plans/decomposition.md`, STORY-007-01 … 007-07 and STORY-008-01 … 008-06, EPIC-007, EPIC-008, SPIKE-003 §5, the SPRINT-04 plan, the Granularity Rubric of `.cleargate/templates/story.md`. Claims were checked against the source tree at `6b75807`.

No story's `approved:` or Ambiguity status was changed, and no question was decided: where a choice belongs to the human, it stays (or was added) as an open question in that story's §1.4, with a recommendation. The SPRINT-04 plan and the epics were not edited. Every edited story passes `cleargate gate check`. `decomposition.md` now carries the agreed contracts (each change marked "(amended at drafting, pending Gate 1)"), the corrected upstreams and scope lists, and a complete shared-file table.

## Issues

1. **STORY-007-01, 007-06: estimator speed.** 007-06's p95 < 300 ms budget relies on `estimateTokens` being a char-code loop (≈13 ms on the 500-page fixture, against ≈275 ms for SPIKE-003's naive loop). 007-01 R1 only *allowed* one. **Fixed:** 007-01 R1 now *requires* step 2 to be one char-code loop with no per-character regex and cites the budget; §1.5 says "requires"; 007-06 Q1 and its risk now point at 007-01 R1.
2. **STORY-007-01 Q1: narrow or wide reading of SPIKE-003.** §5 says "runs of the same punctuation mark"; the script that produced ±14% removes runs of any non-letter symbol. No other story relies on the narrower reading: consumers compute expected counts with `estimateTokens`, and 007-07's text says only "SPIKE-003's weighted character count". EPIC-007 §2 repeats §5's wording; the epic was not edited. **Recorded in 007-01 Q1; human decision, see Gate 1 list.**
3. **STORY-007-05, 007-07: WIKI.md lines for `tokens` and `oversized-page`.** 007-07 Q4 moves the `tokens` status bullet and the `oversized-page` finding-table row into 007-05, but 007-05 had neither the text nor the file. Without them, 007-05's own tree fails `sprint-03-commands.red` S3 (`:307`) and `findingTableFindings` (`test/templates.test.ts:113`). **Fixed:** 007-05 gains R10 with 007-07 R5 (c), (d) verbatim, `templates/system/WIKI.md` in §3.1, a task row, two DoD lines, and a `Then` in scenario 1 (so the "Gherkin covers §1.2" box stays true). 007-07 Q4 and R5 now state the order 007-05 → 008-05 → 007-07 → 008-06. Accepted side effect: "as said above" points at 007-07's paragraph, which lands later on the sprint branch. *Still depends on 007-07 Q4.*
4. **STORY-008-05, 008-06: WIKI.md bullets for `archive` and `archive_candidates`.** Same pattern as issue 3: 008-06 Q2 moves the bullets into 008-05, which did not have them. **Fixed:** 008-05 gains R8 with 008-06 R5 (c), (d) verbatim, the file in §3.1, a task row, a DoD line, and a `Then` in scenario 3. *Still depends on 008-06 Q2.*
5. **STORY-008-05, 008-06: the final_status candidate text.** 008-06 told the agent that the clean-up for a `final_status` candidate "moves the whole page". But 008-05 R2 also lists section entities on pages that still hold live entities (008-05 Q1's `## Gamma` example). **Fixed in both:** the bullet now reads "a clean-up that moves that entity's fact lines to `archive/` (the whole page when the entity is the page)", and 008-06 R1's "Pick what to move" bullet now says the same.
6. **STORY-008-04 Q2, 008-06 Q1: the form of a page's link to its archive.** The code shows:
   - `linkResolver` keys a page by its path without `.md`, its names and its aliases (`src/lint/links.ts:14`). So 008-04 R3's extra `archive/<path>` key, which no live page has, makes `[[archive/projects/atlas]]` resolve. 008-06's premise ("a `[[…]]` link cannot name the archive page") is wrong once R3 lands.
   - A prose line holding only that link is an `uncited-claim` error (`src/lint/citations.ts:82`). 008-04's own finish scenario had to add `[[src-…]]` to avoid it.
   - A `key::` line is never a claim (`TYPED_RE`, `:17`) and still puts its link in `page.links` (`src/wiki/parse-page.ts:326`).
   - Search backlinks are keyed by the link text (`buildBacklinks`, `:460`), so search is unaffected.
   - 008-06's bracket-less `archive:: archive/<path>` is checked by nothing, and EPIC-008 asks for "a link".

   **Picked:** the typed line `archive:: [[archive/<path>]]`, with `<path>` written without `.md`. **Fixed in both stories:** 008-04 Q2 (with the evidence), R3, and the finish scenario (the page now cites through frontmatter `sources`, and the scenario also asserts no `uncited-claim`); 008-06 Q1, R1 (stating the one exception to WIKI.md:143's "never by path"), R10, scenarios 1 and 2, and the Existing Surfaces note. *Human confirms, see Gate 1 list.*
7. **STORY-007-05: `oversized-page` position.** It was to be registered right after `indexDriftCheck`, at index 4. That breaks `test/lint/checks.test.ts:26`, which expects `unlogged-change` at index 4 and was not in 007-05's file list. **Fixed:** it is now registered after `unloggedChangeCheck` and before `staleFactCheck`, so `stale-fact` stays last (stale-fact.red `:241`). Findings are sorted by path, so output does not change.
8. **STORY-007-05: no lint fixture.** `structure-sprint-03.red` R8 (`:205`) and `test/lint/check-fixtures.test.ts:11` require a `LINT_FIXTURES` entry for every registered check id, and 007-05 had none. **Fixed:** an `oversized-page` trigger and pass fixture in `test/lint/check-fixtures.ts` (scope, files, task, DoD).
9. **STORY-007-05: no QA-Red file.** Every other code story names its `*.red.node.test.ts`, and the pre-commit file surface needs it. **Fixed:** `test/wiki-sizes.red.node.test.ts` (the five scenarios, QA-Red). The Developer keeps the four unit-test files.
10. **STORY-007-01, 007-02, 007-06: who writes the scenario tests.** 007-01 and 007-02 listed a red file but had task rows that left its author unclear or gave the scenarios to the Developer. 007-06 had the Developer write scenarios 1, 3, 4 and 5. **Fixed:** in all three, QA-Red writes the red file from §2.1 and the Developer writes the §4.1 unit tests. 007-06 gains `test/statusline.red.node.test.ts`.
11. **STORY-007-05, 008-03: `pageTokens(path)` with two trees.** An archive page has its live namesake's path, so 007-05's `SearchCorpus.pageTokens(path)` cannot tell which file is meant, and 008-03 promised the archive page's figure without saying how. **Fixed:** 008-03 widens it to `pageTokens(path, archived?)`, the `page_tokens` pass passes `hit.archived`, and a unit test is added. 007-05 notes the change. K7 and K11 are updated.
12. **STORY-008-03: missing upstream.** 008-03 consumes K7 (`page_tokens`, `SearchHitBase`) and must merge after 007-05 in three search files, but had only 008-01 as predecessor. **Fixed:** `dep_predecessors` gains STORY-007-05, and so does the brief's story table. No cycle results (007-05 → 008-03 → 008-04).
13. **STORY-008-05, 008-01: a red test 008-05 breaks.** `test/settings-reports.red.node.test.ts:96` passes `private: ["secret.md"]` with a hand-built `ResolvedPaths` literal that has no `archiveDir` (`:84`). R6's mirror then throws (`path.resolve(undefined, …)`), and the expected tail at `:103` lacks the mirror anyway. 008-05 listed this file as "stays green unmodified"; 008-01 had only flagged the literal. **Fixed in the spec:** the test is now the second re-scope under 008-05 Q2, and 008-01's risk points there. *Authorisation is the human's, see the re-scope list.*
14. **STORY-008-05: limit display.** The size-candidate line printed the raw `tokens.page.red`, while the `oversized-page` message uses `formatLimit` (`10k`). **Fixed:** 008-05 uses `formatLimit` and reads the limit from `data.tokens.limits.page.red`. The Gherkin values (`100`) are unchanged.
15. **STORY-008-01, 008-05: `content_dir: .` and `remove --purge`.** `archiveDir` is `<contentDir>/archive`, so with `content_dir: .` it is `<repo>/archive/`. `pages/` has the same exposure today: `--purge` already deletes `<root>/pages`, `raw`, `log`, `index.md` and `log.md` (`src/commands/remove.ts:213–227`). The difference is that a user's own `archive/` would be adopted silently at the 0.4.0 upgrade: guarded, snapshotted, searched, counted, flagged by lint and purged. **Proposed:** keep the path with no code; the first `wikeeper lint` names every adopted file, and `--purge` names `archive/`. The alternative is a `doctor` / `update` warning. Recorded as 008-01 Q3; 008-05 R7 and its risk reference it. *Human decision, see Gate 1 list.*
16. **STORY-007-03, 008-02: one red file, two stories.** Both re-scope tests in `test/ingest/ingest-follow-ups.red.node.test.ts` (`:234` and `:172`). 008-02's DoD said the file differs from `6b75807` only inside its own test, which is false once 007-03 merges. **Fixed:** each story names the other's test, both apply by test name in either order, and 008-02's DoD is reworded.
17. **STORY-007-05, 008-02: report line order.** 007-05 said "a fifth line"; 008-02 puts `archived …` between the counts line and the `wiki ≈` line and still spoke of a "four-line test". **Fixed:** 007-05 R5 states the order (K7/K10), and 008-02's `report.test.ts` note now refers to 007-05's five lines.
18. **STORY-007-02, 009-01 (cross-epic): pinned key count.** 007-02's scenario pinned "the 21 leaves … to `tokens.source.confirm_at`", and STORY-009-01 adds `update_check` later in this sprint. **Fixed:** tests take the list from `configLeafKeys()`, the root error message says "every leaf key", and the unit note says "21 at this story's merge".
19. **STORY-007-07, 007-03, EPIC-007: nobody owns asking before a scanned PDF is read.** 007-03's mitigation for a likely-scanned PDF (ask before the agent reads it itself) pointed at 007-07, and 007-07 did not have it. Without it, EPIC-007's success metric ("a source at `confirm_at` never reaches extraction without approval") fails for scans. **Added 007-07 Q7** with recommended text for the `likely_scanned` row; 007-03's risk points there. *Human decision, see Gate 1 list.*
20. **STORY-008-04 Q4: missing files.** `src/commands/ingest-finish.ts`, `src/ingest/lint-hook.ts` and `src/lint/paths.ts` were not in 008-04's scope or the shared table. **Fixed in the brief** (finish order 008-01 → 007-05 → 008-02 → 008-04). Q4 now asks only for confirmation.
21. **STORY-008-05 Q3: missing file.** `src/lint/staleness.ts` was not in 008-05's scope. **Fixed in the brief** (edited by 008-05 only; read by 007-05 and 008-04). Q3 now asks only for confirmation.
22. **Brief: shared-file table.**
    - `src/ingest/report.ts` listed 008-01, which does not edit it.
    - Missing rows: `package.json` (007-06 → 007-07), `src/search/filters.ts` (007-05 → 008-03), `test/templates/structure.ts` (007-07 → 008-06), `test/ingest/report.test.ts` (007-05 → 008-02), `test/ingest/finish-lint.test.ts` (007-05 → 008-04), the shared red file of issue 16, `src/read/pdf.ts` (007-03 only), `src/lint/staleness.ts` (008-05 only), the overlapping architecture.md sections (§10 and §11, edited by both 007-07 and 008-06) and README's CLI table.

    **Fixed:** the table has one row per file with a merge order and notes which arrows are merge order only.
23. **Brief: scope lists.**
    - 007-07 listed `src/agents/enforce/codex.ts`, which it reads but does not edit.
    - Both docs stories had incomplete architecture.md section lists (007-07 adds §6.5; 008-06 adds §7.3, §10, §11 and §13).
    - 008-01 was missing `ingest-apply.ts` and `ingest-abort.ts`; 008-03 was missing `aliases.ts`; 007-03 was missing `pdf.ts`; 007-06 was missing `package.json`; 007-05 was missing `filters.ts`, WIKI.md and the fixture.

    **Fixed in the brief.**
24. **Brief: K1–K13 lagged the drafts.** Every deviation the stories declare is now written into the contract text. Examples: K2 `tokenLimitIssues` and `initialConfigText`; K3 `config_key_not_settable` and `config_invalid`; K4 `tokens_rough` and `pages`; K5 the nullable `sourceTokens`; K6 the nullable `tokens`, `level` and totals; K7 `change: number | null`; K8 its refinements; K9 the optional `PageDiff.archive`; K10 `archived` and the N or M rule; K11 its additions; K12 the optional `archivePages`; K13 `entity` and `last_dated`. Producers and consumers agree: no consumer story still assumed an original contract after fixes 11 and 12. **Fixed** (marked, pending Gate 1).
25. **STORY-007-07: stale risk mitigations.** Two risks still deferred to the SDR points that other stories already answer: the stdin wait (007-06 R2 bounds the read at 200 ms and 1 MB) and `config get tokens` on a map key (007-02 R5). **Fixed:** the mitigations cite them.
26. **STORY-007-04: no authorisation question.** Its red re-scope of `ingest-plan.red` `:128` had no §1.4 question asking for authorisation, unlike the other stories. **Added Q3.**
27. **Granularity (rubric).** Every story has five scenarios or fewer (008-01 has 4, the rest 5), and none is L4 or L3 with high exposure.
    - 007-05 trips "subsystems span" (status, report, search, lint).
    - 008-05 trips "unrelated goals" (candidates plus housekeeping).
    - 007-07 asks the same about its allow rules (Q6).

    **Recommendation, not split:** keep all three. 007-05's surfaces each gain one figure from one call; 008-05's housekeeping alone would trip the too-small rule; 007-07's rules exist for its text. Recorded as 007-05 Q5 and 008-05 Q4. *Human decision.*
28. **STORY-008-05: names a flag from 008-03.** Its bullet names `--archive`, which 008-03 adds. Template checks do not read a bare flag, so no test fails, but the text would run ahead of the CLI. **Fixed as a merge-order note** (008-05 preferably after 008-03), not a dependency.
29. **SPRINT-04 plan table differs from the stories' frontmatter.** 007-01 is "n / low" there and "y / med" in the story; 008-02 is "high" there and "med" in the story; the other parallel flags differ too. The plan is the orchestrator's file and was not edited. The table below gives the story values; the SDR sets them finally. *For the orchestrator.*
30. **STORY-008-06: outdated surface note.** Its Existing Surfaces said an archive page "cannot be told apart by a link". **Fixed** to cite 008-04 R3's `archive/<path>` key.

**Count:** 30 issues. 25 fixed (1, 3–14, 16–18, 20–26, 28, 30); for 3, 4, 6, 13, 20 and 21 the human still confirms the recommended answer at Gate 1. 5 left for the human (2, 15, 19, 27, 29), plus the authorisations in the re-scope list.

## Gate 1 decisions

One line each, with the recommended answer. Merged entries name every story that asks.

### EPIC-007 — Token gauges
1. **007-01 Q1** — The estimator follows SPIKE-003's script: any repeated non-letter symbol is a run, regex without the `u` flag. **Rec: follow the script.**
2. **007-01 Q2** — A hand-written yellow ≥ red keeps both values and is reported, not reset to the defaults. **Rec: keep both values.**
3. **007-02 Q1** — `config set` / `unset content_dir` is refused (`config_key_not_settable`) with move instructions. **Rec: refuse.**
4. **007-02 Q2** — `enforce`, `setup_completed_at` and `profile` are settable; `enforce` gets an "after `wikeeper update`" warning. **Rec: allow all three.**
5. **007-03 Q1** — For a likely-scanned PDF, `read`'s `tokens` is pages × 1,600 with `tokens_rough: true`. **Rec: yes.**
6. **007-03 Q2 + 007-04 Q2** — Sources that cannot be counted or estimated get `tokens: null`, no size check, and "not counted" / "not estimated". This covers `.pptx`, images, a broken PDF or DOCX, and plan duplicates and denied files. **Rec: null.**
7. **007-03 Q3 (b)** — The `ask`-mode approval line also shows the estimate (`(≈2 tokens 🟢 · 6 B, …)`). **Rec: yes.** Alternative: today's text when `cause` is `permission`.
8. **007-04 Q1** — The DOCX plan estimate is the compressed size of `word/document.xml` ÷ 2, not the whole file ÷ 3. **Rec: `word/document.xml`.**
9. **007-05 Q1** — `IngestReport.tokens.change` is `number | null`, null on a rerun whose snapshot is gone. **Rec: nullable.**
10. **007-05 Q2** — `oversized-page` also runs in the `ingest finish` lint (`FINISH_CHECKS`). **Rec: yes.**
11. **007-05 Q3** — `page_tokens` is computed at search time for the returned hits only, never cached (cache version 1 kept). **Rec: compute.**
12. **007-05 Q4** — The finish report's "largest page" is the wiki's largest page. **Rec: the wiki's.**
13. **007-05 Q5 + 007-07 Q6** — Granularity: 007-05 (four surfaces) and 007-07 (text plus allow rules) stay one story each. **Rec: keep.** Optional cut: search `page_tokens` out of 007-05.
14. **007-06 Q1** — `statusline` keeps no cache; the budget rests on 007-01's char-code loop. **Rec: no cache.**
15. **007-06 Q2** — The `local` form writes an absolute `"<root>/node_modules/.bin/wikeeper" statusline`. **Rec: absolute path.**
16. **007-06 Q3** — `--install` treats wikeeper's own line in `.claude/settings.local.json` as its own: identical → "already installed", different → replaced. **Rec: yes.**
17. **007-06 Q4** — `--install` refuses a committed `.claude/settings.local.json` (`settings_tracked`) and adds it to `.git/info/exclude` when it is not ignored. **Rec: yes.**
18. **007-06 Q5** — An error inside a wiki prints `wiki size unavailable (<code>): run wikeeper doctor` and exits 0. **Rec: yes.**
19. **007-07 Q1** — The session-start line is appended to pointer-block line 4, with the C10 shipped-block append and re-scope row (g). **Rec: pointer block.**
20. **007-07 Q2** — `statusline` stays in `READ_ONLY_COMMANDS` (its rule also covers `--install`), with no ask rule. **Rec: keep.**
21. **007-07 Q3** — "Tell the user once" about a red page means once per session. **Rec: per session.**
22. **007-07 Q7 (new)** — WIKI.md's `likely_scanned` row: ask before reading a scanned PDF whose rough estimate reaches `confirm_at`. **Rec: yes, with the drafted text.**
23. **007-01 Q3, 007-03 Q3, 007-04 Q3, 007-07 Q5** — Authorise EPIC-007's red-test re-scopes (rows 1–11 below). **Rec: authorise as listed.**

### Both epics
24. **007-07 Q4 + 008-06 Q2** — The story that adds a status key or page check writes its WIKI.md lines: 007-05 R10 and 008-05 R8. WIKI.md merge order: 007-05 → 008-05 → 007-07 → 008-06. **Rec: yes.**

### EPIC-008 — Fact archive
25. **008-01 Q1** — With an older snapshot (no archive copy), `abort` leaves `archive/` untouched and warns, and the diff treats it as empty. **Rec: yes.**
26. **008-01 Q3 (new; 008-05 refers to it)** — With `content_dir: .` the archive is `<repo>/archive/`. **Rec: keep the path, add no code.** Alternative: a `doctor` / `update` warning.
27. **008-02 Q2** — The report shows `archived N fact lines · M pages` when N > 0 or M > 0. **Rec: yes.**
28. **008-03 Q1** — The search cache stays one file, version 1, with `archive_files`, `archive_pages` and `archive_docs` added. **Rec: one file.**
29. **008-03 Q2** — `--entity` finds an entity that exists only in the archive (`EntityMatch.archived`). **Rec: yes.**
30. **008-03 Q3** — The index line is singular for one archived page. **Rec: yes.**
31. **008-03 Q4** — An empty `--archive` search records a miss as today, without an `archive` key. **Rec: yes.**
32. **008-04 Q1** — `broken-link` also checks archive pages; the fix is an alias on the live page. **Rec: yes.**
33. **008-04 Q2 + 008-06 Q1** — A page links to its archive with the typed line `archive:: [[archive/<path>]]`, `<path>` without `.md`. **Rec: this form.**
34. **008-04 Q3** — `LintContext.archivePages` is optional (an immutable red test builds the literal). **Rec: optional.**
35. **008-04 Q4 + 008-05 Q3** — Confirm the added file surfaces: 008-04 gets `ingest-finish.ts`, `lint-hook.ts` and `lint/paths.ts`; 008-05 exports helpers from `lint/staleness.ts`. **Rec: confirm.**
36. **008-05 Q1** — Final-status candidates carry `entity` and `last_dated`. **Rec: yes.**
37. **008-05 Q4** — Granularity: the housekeeping stays in 008-05. **Rec: keep.**
38. **008-06 Q3** — The main agent writes a clean-up; the `wiki-writer` prompts stay unchanged. **Rec: main agent.**
39. **008-06 Q4** — The agent shows what it would move, and moves only what the user approves. **Rec: yes.**
40. **008-01 Q2, 008-02 Q1, 008-05 Q2** — Authorise EPIC-008's red-test re-scopes (rows 12–16 below). **Rec: authorise as listed.**

## Red-test re-scopes to authorise

Each is QA-Red's, by test name and content anchor on the merged tree (line numbers at `6b75807` are a guide), and changes only what is listed.

| # | Red file | Test (anchor) | Owner (question) | Exact change |
|---|---|---|---|---|
| 1 | `test/config.red.node.test.ts` | "DEFAULT_CONFIG has the documented R1 defaults" (`:19`) | 007-01 (Q3) | The expected object gains `tokens: { page: { yellow: 4000, red: 10000 }, source: { yellow: 20000, red: 60000, confirm_at: "yellow" } }`; nothing else. |
| 2 | `test/read/read.red.node.test.ts` | "stdout, --out, --json, the /app warning and ingest start --text-file" (`:195`) | 007-03 (Q3 a) | `wrote page.md (${bytes.length} bytes, html)` → `wrote page.md (${describeTokens(n, level, false)} · ${formatSize(bytes.length)} · html)`, where `n` = `estimateTokens` of the written markdown and the level is under default limits. |
| 3 | `test/ingest/ingest-follow-ups.red.node.test.ts` **(shared with #13)** | "STORY-003-12 S3 approval request is a question" (`:234`) | 007-03 (Q3 b) | `(6 B, ${named})` → `(${describeTokens(…)} · 6 B, ${named})` for `hello` under default limits; the rest of the line, the exit code and the JSON assertions stay. |
| 4 | `test/ingest/ingest-plan.red.node.test.ts` | "S1: directory plan marks duplicates and denied files; stores nothing" (`:128`) | 007-04 (Q3) | `totals` gains `tokens` (`estimateTokens` of `docs/meetings/a.md`), `tokens_rough: false` and `not_estimated: 0`. |
| 5 | `test/templates/wiki-protocol.red.node.test.ts` | `COMMANDS` (`:27`) | 007-07 (Q5, row a) | Add `"config"` and `"statusline"` after `"rules"`. |
| 6 | `test/agents/enforce-ai-rules.red.node.test.ts` | `READ_ONLY_CLAUDE` (`:50`), `READ_ONLY_CODEX` (`:58`) | 007-07 (Q5, row b) | Append `Bash(npx wikeeper statusline *)`, `Bash(wikeeper statusline *)`, `Bash(npx wikeeper config get *)`, `Bash(wikeeper config get *)` / the four matching `prefix_rule` lines. |
| 7 | `test/agents/enforce-prompts.red.node.test.ts` | `READ_ONLY_CLAUDE` (`:58`), `READ_ONLY_CODEX` (`:66`) | 007-07 (Q5, row c) | Same as #6. |
| 8 | `test/agents/enforce.red.node.test.ts` | `READ_ONLY_CLAUDE` (`:49`), `READ_ONLY_CODEX` (`:57`); "CLAUDE_ENFORCE items per permission mode" (`:565–568`, `:579–582`, `:584`) | 007-07 (Q5, row d) | Same as #6; the two inline lists gain the four identities after `rules list`; the whitelist count goes from 9 to 13. |
| 9 | `test/templates/setup.red.node.test.ts` | S5 (`:353`) | 007-07 (Q5, row e) | The `missing [...]` text gains the four Claude rules after `Bash(wikeeper rules list *)`. |
| 10 | `test/templates/structure-sprint-03.red.node.test.ts` | S4 (`:155`, `:174`) | 007-07 (Q5, row f) | `"Bash(wikeeper rules list *)]"` → `"Bash(wikeeper config get *)]"`; `"toHaveLength(9)"` → `"toHaveLength(13)"`. |
| 11 | `test/templates/writing-and-answering-text.red.node.test.ts` | "templates/agent-block.md is exactly R14's 14 lines" (`:457–465`) | 007-07 (Q5, row g; only if Q1 = pointer block) | Line 4 compared as 007-07 R1 sets it; `not.toContain("wikeeper status")` becomes "names no `wikeeper status` command" (so `statusline` is allowed). `BLOCK_LINES`, `PINS` and the `SHIPPED_BLOCKS[2]` test are unchanged. |
| 12 | `test/paths.red.node.test.ts` | "resolvePaths with default config returns the full documented set" (`:42`) | 008-01 (Q2) | The expected object gains `archiveDir: path.join(w, "archive")`; nothing else. |
| 13 | `test/ingest/ingest-follow-ups.red.node.test.ts` **(shared with #3)** | "deleted page: accepted and reported" (`:172`) | 008-02 (Q1) | Before `finish`, also write `archive/roadmap.md` with frontmatter and the deleted page's fact line unchanged. The name and both assertions (exit 0, `data.deleted` `["roadmap.md"]`) stay. |
| 14 | `test/gitignore.red.node.test.ts` | "managedIgnoreEntries lists the default entries in fixed order" (`:56`) | 008-05 (Q2) | The expected list gains `".wiki/archive/team.md"` before `".wiki/pages/team.md"`. |
| 15 | `test/settings-reports.red.node.test.ts` **(new, found by this audit)** | "appends sorted, deduplicated backups after the fixed entries and before private entries" (`:96`) | 008-05 (Q2) | The literal (`:84`) gains `archiveDir: path.resolve("/r/.wiki/archive")`; the expected tail (`:103`) gains `".wiki/archive/secret.md"` before `".wiki/pages/secret.md"`. |

- **Red file edited by two stories:** `test/ingest/ingest-follow-ups.red.node.test.ts` (#3 by 007-03, #13 by 008-02). They touch different tests and apply in either merge order.
- **Conditional extra:** if 007-07 Q2 takes its alternative (an ask rule for `statusline --install`), about 15 more assertions need re-scoping (each `permissions.ask` equality, `enforce-prompts.red:301`, `enforce.red:307`). The recommendation avoids them.
- No other story re-scopes a red test: 007-02, 007-05, 007-06, 008-03, 008-04 and 008-06 keep every red file unchanged. Two of these depend on fixes above: 007-05 stays clean thanks to issues 7 and 8, and 008-04 keeps `LintContext.archivePages` optional (Q3).

## Sprint-plan table

| Story ID | complexity | scenarios | dep_predecessors | parallel | bounce exposure |
|---|---|---|---|---|---|
| STORY-007-01 | L2 | 5 | — | y | med |
| STORY-007-02 | L2 | 5 | 007-01 | n | low |
| STORY-007-03 | L3 | 5 | 007-01 | n | med |
| STORY-007-04 | L2 | 5 | 007-03 | n | med |
| STORY-007-05 | L3 | 5 | 007-01 | n | med |
| STORY-007-06 | L2 | 5 | 007-01 | n | med |
| STORY-007-07 | L3 | 5 | 007-02, 007-03, 007-04, 007-05, 007-06 | n | med |
| STORY-008-01 | L3 | 4 | — | y | med |
| STORY-008-02 | L2 | 5 | 008-01 | n | med (the plan says high; worth keeping high at the SDR so it runs early) |
| STORY-008-03 | L3 | 5 | 008-01, 007-05 (added) | n | med |
| STORY-008-04 | L2 | 5 | 008-01, 008-03, 007-05 | n | med |
| STORY-008-05 | L2 | 5 | 008-01, 007-01, 007-05 | n | med |
| STORY-008-06 | L2 | 5 | 008-02, 008-03, 008-04, 008-05, 007-07 | n | med |

- There is no cycle. The two roots, 007-01 and 008-01, run in parallel.
- Merge-order-only constraints (no dependency), for the SDR waves:
  - `ingest-finish.ts`: 008-01 → 007-05 → 008-02 → 008-04.
  - WIKI.md: 007-05 → 008-05 → 007-07 → 008-06; 008-05 preferably after 008-03.
  - `package.json`: 007-06 → 007-07.
