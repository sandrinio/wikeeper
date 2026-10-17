# SPRINT-03 — Cross-story consistency audit (2026-10-17)

> **Superseded in parts (2026-10-17).** The "Shared files" and "Red-test edits → owner" tables below are superseded by the story files and by STORY-006-11 R6, which holds the full red-test table (the read-only allow rules are STORY-005-09's). The tables are kept as the audit wrote them.

Read-only audit of the 16 first drafts, run before the Gate 1 revision. References `NNN-NN:L` mean line L of `.cleargate/delivery/pending-sync/STORY-NNN-NN_*.md` **in the first drafts** (commit 40018c5); other paths are relative to the repository root. Resolutions marked **Decided** come from `gate1-decisions.md`.

## Findings (most severe first)

1. **STORY-002-09's new ask rules break a red test and the real-tree template test, and no story owns the fix.** 002-09:67 adds `Bash(wikeeper ingest *--drop*)` and `Bash(wikeeper ingest *--force-unlock*)` to the Claude writer, and 002-09:82 puts them in the SETUP.md `ai` row. `test/templates/structure.ts:63,72-83` stops reading the command at the `*`, so it treats `--drop` as a flag of `ingest`; `checkRefs` (:162-174) then reports `"--drop" is not an option of "ingest"`, for both the writer entries (`enforceSources`, :185) and `system/SETUP.md`. That fails `test/templates.red.node.test.ts:53` (S1) and `test/templates.test.ts:113` as soon as 002-09 merges. 006-11:73 and :77 wrongly say these pass unchanged. **Fix:** 002-09 adds `test/templates/structure.ts` and a unit row in `test/templates.test.ts` to its files: when a reference has a `*` where the subcommand would be, check its flags against the union of that command's subcommand options. 006-11 R1 reworded. The S1 red test edit (if any) goes in 006-11 R6 with 002-09 as owner.

2. **STORY-005-03 makes STORY-005-02's acceptance tests wrong.** 005-02's fixtures write pages directly, not through an ingest; once `unlogged-change` (error) is a page check, each such page gets "in no ingest log event" (005-03:76). 005-02 lines :184, :214, :232, :233 then fail. **Fix:** 005-03 owns updating 005-02's `test/lint/lint-command.test.ts` and `checks.test.ts` scenarios: fixtures record ingest events with page hashes, or each assertion runs `--check <id>` for the check it tests.

3. **Turning `enforce` off is documented (006-10 R10, :86, :167) but not implemented** (`src/agents/enforce/index.ts:199` keeps the hook and rules). **Decided (item 18):** 002-09 implements it; 006-12 (the E10 text) depends on 002-09.

4. **`rules record --kind` words disagree** (005-06:92 vs 006-09:109, :86). **Decided (item 12):** the section keys frozen by 005-01 (005-01:243-245): `questions`, `entities`, `capture-signals`, `write-policy`, `never-capture`.

5. **Finding `path` base undefined and inconsistent** (005-02:79, :125 vs 005-04:60, :147-159, :108). **Decided (technical call):** every finding's `path` is repository-relative POSIX; human output prints `<path>[:<line>]`; `LintContext.only` stays relative to `pages/`.

6. **STORY-005-02 imports `loadInstructions` from 005-01's file (:117, :280, :154) but has no dependency on 005-01.** **Fix:** add STORY-005-01 to 005-02's predecessors.

7. **SPIKE-001 not reflected in STORY-003-11; its own fixture breaks the rule.** 003-11:82 counts non-whitespace characters; SPIKE-001 says count letters `\p{L}`. Fixture `report.pdf` page 2 (003-11:165) has 20 characters, so `likely_scanned` fires on 1 of 2 pages while :167 expects no warnings. Install size stated as 16/23 MB (003-10:185, 003-11:303); measured 32 MB on disk. **Fix:** R3 "fewer than 25 letters (`\p{L}`)", rename the constant, add a unit row for a digits-only page, give fixture page 2 at least 25 letters, state 32 MB. Minor: SPIKE-002 found a fresh untrusted folder ignores project settings; 002-09:196's manual check must use a trusted folder or `--settings`.

8. **Two drafts depart from recorded human decisions:** Codex `apply --force-unlock` (002-09:80, :98-99, :152 vs CR-003) and the `--status` hint scope (004-07:100-101 vs CR-003:59). **Decided (items 16, 14), flagged to the human at Gate 1.**

9. **Instruction text one story assigns to another, which that story does not carry.**
   - 003-12:95, :117 → 006-10: `finish` refuses dropped fact lines; the writer restores them and reruns; a correction adds a new line instead of editing the old one. (Now **006-12**, writing text.)
   - 002-09:91 → 006-10: text for the new `--drop` / `--force-unlock` prompts; `templates/system/SETUP.md:41` ("`ai`: the agent runs ingests without asking") becomes wrong. (Stays **006-10**, permissions text.)
   - 005-03:124, :134 → 006-09: after a merge, pages edited on both branches are reported until their next ingest; `post_ingest` hooks must not edit pages. 006-09 R7 (:87) instead says to treat such pages as hand edits.
   - 005-05:100 → 006-09: decide every item of a source before recording with `--from`.
   - 005-07:91 → 006-09: keep anchors as quotes from the source.
   - 003-10:164, :184 → 006-09: use a fresh `--out` name each time, name the temp directory, read only what the user gave.
   **Fix:** add each item to the named story.

10. **STORY-006-09's `read` text does not match 003-10/003-11.** R1(b) (:73) says only "a temporary file outside `.wiki/`", but 003-10:126-134 also refuses existing files, other extensions, hidden folders, agent files and anything inside the content directory. R1(d) treats `.doc/.pptx/.xlsx` as an `unsupported` warning; they are exit-2 errors (003-10:90); the `unsupported` warning means DOCX images were not converted (003-11:66). No guidance for `conversion_failed`, `timeout`, `too_large`, `http_error`, `fetch_failed`, `not_found`. `truncated` is documented but never emitted (003-10:125). **Fix:** rewrite R1(b), R1(d); add the error guidance; drop `truncated` from instructions (003-10 drops it from the warning union or documents it as reserved).

11. **006-09's fix for `unlogged-change` (:80, record a shell edit with a chat-excerpt ingest) does not clear the finding**: hashes are recorded only for pages the write phase creates or updates (005-03:60-62), and the apply snapshot already contains the shell edit. **Fix:** 006-09 says that ingest must update the page (e.g. add the cited fact).

12. **Red-test edit ownership and authorisation.** 003-10:328 edits `test/templates/setup.red.node.test.ts:353`, but 006-11:78, :86, :213 allow "exactly these edits, nothing else" there → 006-11 R6 adds 003-10's edit. 002-09:110 and 003-10:188, :328 edit enforce red assertions without asking → both record the authorisation question (item 21). 002-09 appends rules (:111) while 003-10:360 inserts the read rules between the ingest and search rules → **Decided:** 003-10 appends after 002-09's rules. 006-09's own red test (:223, :173, :197) and 006-11 R3(b) (:75) both build the same finding-table check, and 006-09:75 lists checks in a different order from the registry (005-02:65-70) → one check, owned by 006-11, comparing as sets.

13. **Dependency edges (no cycles).** 005-06 needs 004-07 (log.ts). 005-03 needs 004-07 (log.ts) or drop the claim. 005-04's edge to 002-09 is wrong (002-09 only imports `plural` from doctor.ts) → drop. 006-10 needs 002-09 and 003-10 (SETUP.md). 001-10 and 003-10 both edit package.json/package-lock.json → 001-10 first. Five stories add commands to `src/program.ts` → order 001-10, 003-10, 005-02, 005-05, 005-06. 005-03 does not edit `validate.ts` (003-12:55, :114 say it does → fix the text).

14. **No story gives the changelog line format that lint checks.** 005-04:84 expects an entry to name `<kind> v<N>`; 005-01:72 parses `- YYYY-MM-DD: text`; 006-10 R3 and 006-09:86 give no form. **Fix:** 006-10 states `- YYYY-MM-DD: <kind> v<N>: <change>`; 006-09 refers to it.

15. **Read-only commands prompt every time** (006-09:96, :120 defer allow rules to "a later CR"). **Decided (item 17):** 002-09 adds them. 005-06:73 cites a writer "Learn step" that does not exist → drop it.

16. **`status` re-ingest entries have no origin** (005-05:66), but 006-09:74 tells the agent to run `ingest start <path|url> --reingest`. **Fix:** 005-05 adds `origin` to each re-ingest candidate; 006-09 uses it.

17. **006-10's search text is slightly off:** :83 does not say `--mark` refuses a query (004-07:78); its `--entity` bullet rules out `--since`, which 004-07:73, :197 allow with `--entity`.

18. **Splits leave stale references.** Avoided by giving split-off stories new ids (002-10, 005-08, 006-12) and not renumbering 006-11. Red-test edits R6(a)/(b) needed by both halves of the 006-10 split: the half that lands first applies them (006-10 runs before 006-12). The 005-04 edge to 002-09 is dropped anyway (finding 13).

## Shared files, in implied order (after the decisions)

| File | Stories (order) |
|---|---|
| `package.json`, `package-lock.json` | 001-10 → 003-10 → 003-11 |
| `src/program.ts` | 001-10 → 003-10 → 005-02 → 005-05 → 005-06 |
| `src/agents/enforce/claude.ts`, `codex.ts`, `index.ts` | 002-09 → 003-10 |
| `templates/system/SETUP.md` | 002-09 (step-4 table) → 003-10 (`ai` row) → 006-10 → 006-12 → 006-09 |
| `src/commands/doctor.ts` | 005-04 only |
| `src/agents/doctor-checks.ts`, `src/core/setup-files.ts`, `src/agents/index.ts` | 002-10 only |
| `src/ingest/log.ts`, `test/ingest/log.test.ts` | 004-07 → 005-03, 005-06 |
| `src/commands/ingest-finish.ts` | 003-12 → 005-03 |
| `src/ingest/validate.ts` | 003-12 only |
| `src/commands/ingest-facts.ts` | 003-12 → 005-07 |
| `src/lint/checks.ts` | 005-02 → 005-03, 005-04, 005-08 |
| `test/lint/lint-command.test.ts`, `test/lint/checks.test.ts` | 005-02 → 005-03 |
| `src/kb/parse-instructions.ts` | 005-01 (read by 005-02, 005-04, 005-05, 006-10, 006-11) |
| `test/fixtures/kb/real-management.md` | 005-01 → 005-04 |
| `src/read/*`, `test/read/*`, `test/fixtures/read/*`, `test/e2e/module-trace.ts` | 003-10 → 003-11 |
| `test/e2e/pack.ts`, `test/e2e/goal.test.ts` | 001-10 edits; 003-10/003-11 use |
| `test/agents/enforce.test.ts` | 002-09 → 003-10 |
| `templates/system/WIKI.md`, `templates/skills/wiki-ingest/SKILL.md` | 006-10 → 006-12 → 006-09 → 006-11 (reads) |
| Sub-agent prompts, profile, kb seed | 006-10 (`--no-miss`, kb format) → 006-12 (writer text) |
| ONBOARDING.md, `me.md` template | 006-12 |
| `test/templates/structure.ts`, `test/templates.test.ts` | 002-09 (`*` handling) → 006-11 |
| `src/core/output.ts` | 003-12 only |

## Red-test edits → owner

| Red-test lines | Owner |
|---|---|
| `test/agents/enforce-ai-rules.red.node.test.ts` :127, :181 | 003-10 |
| `test/agents/enforce-ai-rules.red.node.test.ts` :139, :184, :234, :235 | 002-09, then 003-10 |
| `test/agents/enforce.red.node.test.ts` :259 | 002-09 |
| `test/agents/enforce.red.node.test.ts` :260, :520–526, :544–548 | 002-09, then 003-10 |
| `test/templates/setup.red.node.test.ts` :353 | 003-10 |
| `test/templates/setup.red.node.test.ts` :196, :203 | 006-09 |
| `test/templates/wiki-protocol.red.node.test.ts` :26, :74, :141, :242–248 | 006-10 |
| `test/templates/wiki-protocol.red.node.test.ts` :11–25, :131 | 006-09 |
| `test/templates/onboarding.red.node.test.ts` :145 | 006-12 |
| `test/search/search-misses.red.node.test.ts` :86 | 004-07 |
| `test/templates.red.node.test.ts` :53 (S1) | 002-09 (via the `structure.ts` change; edit only if the fix cannot keep S1 green) |

Plain tests to update: `test/program.test.ts:22` (001-10), `test/search/misses.test.ts:105,107` (004-07), `test/agents/enforce.test.ts:249-265` (002-09, 003-10), `test/templates.test.ts:113` (002-09), 005-02's lint tests (005-03).
