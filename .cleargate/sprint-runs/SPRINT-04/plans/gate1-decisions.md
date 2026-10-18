# SPRINT-04 — Gate 1 decisions

Status: **approved** — the human agreed with every recommendation on 2026-10-18 ("agree with recommendations"), including all 19 red-test re-scopes. Items 1–40 come from `consistency-audit.md`; items 41–61 from the EPIC-009 drafting. Items 62–65 were decided by the human at the plan confirmation on 2026-10-18 (section "Plan confirmation").

## EPIC-007 and EPIC-008 (from the consistency audit)

One line each, with the recommended answer. Merged entries name every story that asks.

### EPIC-007 — Token gauges
1. **007-01 Q1** — The estimator follows SPIKE-003's script: any repeated non-letter symbol is a run, regex without the `u` flag. **Rec: follow the script.**
2. **007-01 Q2** — A hand-written yellow ≥ red keeps both values and is reported, not reset to the defaults. **Rec: keep both values.**
3. **007-02 Q1** — `config set` / `unset content_dir` is refused (`config_key_not_settable`) with move instructions. **Rec: refuse.**
4. **007-02 Q2** — `enforce`, `setup_completed_at` and `profile` are settable; `enforce` gets a "run wikeeper update" warning. **Rec: allow all three.**
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
40. **008-01 Q2, 008-02 Q1, 008-05 Q2** — Authorise EPIC-008's red-test re-scopes (rows 12–15 below). **Rec: authorise as listed.**

## EPIC-009 — Version check and upgrade

41. **EPIC-009 Q1 / 009-01 Q1** — Any ingest subcommand may make the daily check; only `ingest plan` and `ingest start` print the notice. **Rec: yes.** Alternative: print it on every ingest command.
42. **EPIC-009 Q2 / 009-02 Q1** — `upgrade` installs with npm only; pnpm, yarn and bun installs are recognised and get the matching command to run by hand. **Rec: npm only.**
43. **EPIC-009 Q3 / 009-03 Q1** — The agent asks before running `wikeeper update` too, since it rewrites hooks and the pointer block. **Rec: ask first.**
44. **009-01 Q2** — The check runs from one `preAction` hook on the `ingest` group (reads config.yml a second time, 0.19 ms median). **Rec: yes.**
45. **009-01 Q3** — Tests switch the check off with a new `vitest.config.ts` that sets `WIKEEPER_NO_UPDATE_CHECK=1`; product code never looks at `VITEST`. **Rec: yes.**
46. **009-01 Q4** — The request reuses `fetchSource` (`src/read/url.ts`) with a timer; its "only network code" comment is updated. **Rec: reuse.**
47. **009-01 Q5** — `doctor` always emits `update-available` and `version-mismatch` (ok/info when nothing is wrong), after the integration checks. **Rec: yes.**
48. **009-01 Q6** — With the check off, `status` and `doctor` hide a newer version but still show a file-version mismatch; `version.latest` is the newer version or null. **Rec: yes.**
49. **009-01 Q7** — 009-01 writes WIKI.md's `version` status bullet (a red test pins bullets to the `status --json` keys). WIKI.md order: 007-05 → 008-05 → 009-01 → 007-07 → 008-06 → 009-03. **Rec: yes.**
50. **009-01 Q8** — An invalid `update_check` value (e.g. `no`) counts as off. **Rec: off.**
51. **009-02 Q2** — Install kind comes from the running package's real folder; `npm root -g` only confirms a global candidate; a symlinked install (`npm link`) is `unknown`. **Rec: yes.**
52. **009-02 Q3** — A project install passes an explicit `--save-dev` / `--save-prod` matching `package.json`; a project install `package.json` doesn't list is refused with the command to run by hand. **Rec: yes.**
53. **009-02 Q4** — The new version's `update` runs in a child process (`node <bin> update --json`, or `npx -y wikeeper@<v> update --json`); when nothing is newer but the files are older, `runUpdate` runs in-process. **Rec: yes.**
54. **009-02 Q5** — npm is started through `npm_execpath` when set, `npm.cmd` with a shell on Windows, else npm from PATH; a missing npm exits 1 with `npm_missing`. **Rec: yes.**
55. **009-02 Q6** — No allow or ask rule for `upgrade`, so the agent's host prompts the user. **Rec: none.**
56. **009-02 Q7** — `upgrade --check` exits 0 for every install kind. **Rec: yes.**
57. **009-02 Q8** — When the registry is unreachable there is no command to run by hand (`details.command` null). **Rec: yes.**
58. **009-03 Q2** — The instructions are one paragraph in WIKI.md "Lint and status", after 007-07's. **Rec: yes.**
59. **009-03 Q3** — `upgrade --check` is documented in the README only; the agent isn't told to run it. **Rec: yes.**
60. **009-03 Q5** — The architecture.md decision entry is D-38 (after 008-06's D-37). **Rec: yes.**
61. **009-01 Q9, 009-03 Q4** — Authorise EPIC-009's red-test re-scopes (rows 16–19 below). **Rec: authorise as listed.**

## Plan confirmation (human, 2026-10-18)

Decided by the human at the SPRINT-04 plan confirmation on 2026-10-18, from the designer's DRAFTS review (`design/SPRINT-04-design-drafts.md` §1 P6, P10; §2 H1, H2) and, for decision 66, its round 2 (`design/SPRINT-04-design-drafts-r2.md` §3 R2-H1). No red-test re-scope is added.

62. **P6 (007-01, 007-03, 007-04, 007-05, 008-05)** — `formatLimit(n)` moves from K7 (`src/lint/size.ts`, 007-05) to K1 (`src/core/tokens.ts`, 007-01) as an additive export; `sizeLimitText` prints `tokens.source.<confirm_at> (<formatLimit(limit)>)`, e.g. `tokens.source.yellow (20k)`. `details.size.limit` stays a number, and lines that echo config keep stored numbers. **Decided: approved.**
63. **P10 (008-05, 008-06, EPIC-008)** — The archive-candidate reason is `final_status` (snake_case, a code), not `final-status`. **Decided: approved.**
64. **H1 (007-02)** — `E_CONFIG_SYNTAX` stays; both syntax-error throw sites (`src/core/config.ts:185`, `:225`) end with `: fix the YAML syntax in .wiki/config.yml` (007-02 R11); 007-06 keeps `(E_CONFIG_SYNTAX)`. Renaming the six upper-case `E_` codes together is a CR to file after SPRINT-04. **Decided: add the next step now, keep the code.**
65. **H2 (007-07, EPIC-007)** — Pointer-block line 4 ends " Once set up, open each session with the size `wikeeper statusline` prints, not an error." (198 characters); on a wiki whose setup is not done, setup comes first and the size line waits. EPIC-007 §2 gains "once setup is done". **Decided: the designer's recommendation.**
66. **H1 follow-up (a) (007-02, 009-01)** — From the designer's DRAFTS round 2 (`design/SPRINT-04-design-drafts-r2.md` §3 R2-H1): after decision 64, `doctor` showed the syntax-error step twice, in its message and on its `fix:` line. `src/core/config.ts` exports the step as `CONFIG_SYNTAX_FIX`, which R11's message appends; doctor's `config-valid` check (`src/commands/doctor.ts:151–156`) uses it as its `fix` and drops it from its message, so the step prints once (007-02 R12). `src/commands/doctor.ts` joins 007-02's file surface and becomes a shared file, 007-02 → 009-01, in separate hunks (C3 near `:42`, 007-02 at `:151–156`, 009-01 after `:215`). No red-test re-scope is added. **Decided: fix it in 007-02, as the designer recommended (human, plan confirmation, 2026-10-18).**

## Red-test re-scopes to authorise (19)

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
| 16 | `test/config.red.node.test.ts` **(shared with #1)** | "DEFAULT_CONFIG has the documented R1 defaults" (`:19`) | 009-01 (Q9 a) | The expected object also gains `update_check: true`, after 007-01's `tokens`. |
| 17 | `test/doctor.red.node.test.ts` | the exact check-id list (`:84`) | 009-01 (Q9 b) | Append `"version-mismatch", "update-available"`. |
| 18 | `test/doctor.red.node.test.ts` | the "healthy install" fixture (`:43`) | 009-01 (Q9 c) | `package_version: "0.0.1"` → the installed version, so `version-mismatch` doesn't warn (`:85`, `:87`, `:189`). |
| 19 | `test/templates/wiki-protocol.red.node.test.ts` **(shared with #5)** | `COMMANDS` (`:27`) | 009-03 (Q4) | Append `"upgrade"`, after 007-07's `config` and `statusline`. |

- **Red file edited by two stories:** `test/ingest/ingest-follow-ups.red.node.test.ts` (#3 by 007-03, #13 by 008-02). They touch different tests and apply in either merge order.
- **Conditional extra:** if 007-07 Q2 takes its alternative (an ask rule for `statusline --install`), about 15 more assertions need re-scoping (each `permissions.ask` equality, `enforce-prompts.red:301`, `enforce.red:307`). The recommendation avoids them.
- No other story re-scopes a red test: 007-02, 007-05, 007-06, 008-03, 008-04 and 008-06 keep every red file unchanged. Two of these depend on fixes above: 007-05 stays clean thanks to issues 7 and 8, and 008-04 keeps `LintContext.archivePages` optional (Q3).

