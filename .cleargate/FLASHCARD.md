# ClearGate Flashcards

One-liner gotcha log. Newest first. Grep by tag (e.g. `grep '#schema'`).
Active cards have no marker; `[S]` = stale, `[R]` = resolved (see `.claude/skills/flashcard/SKILL.md` Rules 7–8).
Format: `YYYY-MM-DD · #tags · [marker]? lesson`

---

2026-10-19 · #ci #perf · Since CR-006, search-perf runs locally and on Linux CI only; a miss there is real, not runner noise.
2026-10-19 · #test-harness #worktree · A fresh git worktree has no node_modules; run npm ci in it before tests, or e2e rows fail.
2026-10-19 · #release #npm · Re-creating the GitHub repo breaks npm trusted publishing (publish PUT returns E404, no "Signed provenance" line); re-add the trusted publisher on npmjs.com, then re-run the failed release run (same tag).
2026-10-19 · #ci #perf #macos · search-perf p95 (500 ms) fails on GitHub macOS runners about half the time (513–615 ms) with unchanged code; re-run the job, and don't read it as a regression.
2026-10-19 · #hotfix #gate · Hotfix gate sections are positional: a `## Prior work` heading goes after Rollback, Anomaly needs `- ` bullets, Verification lines must start `- [ ]` (the template's `1. - [ ]` fails).
2026-10-19 · #qa #red-test #templates · A pointer-block line change also breaks phrase pins ("open each session", "before any text") and whole-line maps, not only the line constants: grep the phrases, then prove the re-scope set by applying the template edits to a temp copy of the worktree and running the full suite there.
2026-10-19 · #walkthrough #instructions · An agent told to show a command's output "before any text" still batches the command with others and narrates first; say when to write it ("start each session with X and write its line before any other step or text").
2026-10-19 · #qa #red-test #planning · A plan's "old" pin value can be wrong (token-instructions R14(e) was 880e3e88 at base, the plan said a69f2714): re-scope a pinned hash by its content anchor, and derive the new value by applying the plan's edits to a temp copy of templates/ and hashing that.
2026-10-19 · #red-test #templates #pointer-block · The raw sha256 of templates/agent-block.md is pinned in archive-instructions.red R11 (e), upgrade-instructions.red R2 and writing-and-answering-text.red R14: a pointer-block change re-scopes all three, plus any WIKI.md phrase a red row checks.
2026-10-19 · #red-test #shipped-blocks · Plant old pointer blocks with SHIPPED_BLOCKS.find(by sha256), never by index: it also catches an entry edited in place instead of appended.
2026-10-19 · #walkthrough #instructions · "Open each session with X" reads to the agent as "run X", not "show X": say where the output goes ("in your first reply"), and put a must-tell rule where a question-only session reads it.
2026-10-18 · #red-test #docs #planning · A red row that pins a growing range (README's `D-01`–`D-NN`) breaks when a later story in the sprint adds an entry; pin "ends at NN or later" and drop any bare `D-NN` phrase that only the range contained, or plan the re-scope with the later story at Gate 1.
2026-10-18 · #qa #cli #npx · npx cannot run a .tgz directly (`npx -y <tgz>` fails, permission denied); test an npx install with `npx -y --package=<tgz> -- wikeeper …`.
2026-10-18 · #windows #cli · Node >= 24 prints DEP0190 when spawn gets an args array with shell: true; join the checked constant args into one command line and spawn it with no args array.
2026-10-18 · #cli #contract · Every runner call after an install step needs its own catch: an uncaught rejection surfaces as error.code = err.code (e.g. ENOENT) with details null, outside the command's frozen error codes.
2026-10-18 · #qa #scratch · A scratch vitest or npm probe needs its own folder with its own package.json and cacheDir: the shared scratchpad can hold another agent's package.json and a dangling node_modules link.
2026-10-18 · #test-harness #hook · runIngestUpdateCheck(new Command()) throws at getOutputContext (program IO not bound) and its own catch swallows it, so the test passes without testing anything; test hooks through runCli/createProgram (runIngest in the harness) with io.cwd.
2026-10-18 · #red-test #search #archive · An archived search hit keeps path without archive/ and carries file .wiki/archive/… and archived: true (K11): match archived hits on file or archived, never on an archive/ path.
2026-10-18 · #git #merge #contract · git can merge two pushes into the same array (formatReport) without a conflict but in the wrong order; after a re-sync, run the order test (lines[i+1]) even when merge-tree is clean
2026-10-18 · #pre-gate #red-test · the post-flight 'red modified after QA-Red' scan counts the QA-Red commit and the re-sync merge's red files; prove Developer edits with `git diff <qa-red-sha> HEAD` and `git diff sprint/S-NN HEAD` on each flagged file
2026-10-18 · #qa #testbed · testbed beta.md has no status:: or frontmatter status, so the final_status manual check cannot list beta without adding one
2026-10-18 · #qa #fixtures · A red file that shares one tokens.page.red: 100 config across size and final_status scenarios turns a long section-entity fixture into a size candidate too; give final_status rows a limit above the page's measured tokens
2026-10-18 · #init #config #red-test · init writes the tokens block, so `config get` (from_default = key unset) never marks fresh-repo values as default
2026-10-18 · #privacy #json · settingsError(json-merge.ts:23) puts V8's JSON.parse message in the error, and V8 quotes up to about 10 characters of the file for unexpected-token errors (e.g. '..."tusLine": ~/x.sh}" is not valid JSON'). Any 'never print settings content' rule needs that detail sanitised.
2026-10-18 · #test-harness #stdin · To check that a bounded stdin read releases a real pipe, start the built CLI from a script with stdin=PIPE and never close it, then time the node process alone. Timing a shell pipeline like '(sleep N) | node ...' measures the sleep, not node.
2026-10-18 · #test-harness · Don't hardcode compressed zip byte counts from fixtures in tests; derive them or re-measure when the fixture changes
2026-10-18 · #qa #red-test #fixtures · a live row that opens with a text assertion cannot show its live logic is sound on baseline; smoke it once with the text asserts stubbed in a throwaway copy, then delete the copy
2026-10-18 · #red-test #fixtures · a status fixture page is measured with the real estimateTokens; a source link costs ~15 tokens, so keep fixtures under tokens.page.red or give the row its own config
2026-10-18 · #qa #red-test #lint · index-drift row for 'index without archived line' passes before the check counts the archive, so assert the drift warning (red) and pin the rebuild row as the other side
2026-10-18 · #red-test #fixtures · size fixtures must be built with the real estimateTokens (sized), never a per-word constant guess; approx 12k measured 9.7k
2026-10-18 · #qa #fixtures · Scratch dirs in the shared scratchpad collide with other agents; use a story-unique name (qa-<story>-copy), never tb
2026-10-18 · #qa #red-test · config-command reds assert json.command and error.code per row; at baseline an unknown `config` subcommand exits 2 with command 'wikeeper', so exit code alone proves nothing
2026-10-18 · #qa #test-harness #perf · With several worktree suites running (load avg ~50), 5 s timeouts hit git/spawn tests in random files and search p95 fails: rerun failures alone with --testTimeout=60000, run test:perf when load drops.
2026-10-18 · #qa #red-test · a guard row that already passes at baseline (e.g. a rename accepted today) needs a new-field assertion like data.archived to be red
2026-10-18 · #search #qa · a fact's text keeps its trailing [[src-…]] citation; human changes lines must strip it to match the Gherkin lines
2026-10-18 · #search #fixtures · archive pages share path and entity key with live ones; every map and key set needs a tree prefix
2026-10-18 · #qa #red-test #cli · remove --help wraps the --purge description; normalise whitespace before asserting help text
2026-10-18 · #templates #coverage · DOCUMENTED_FORMS counts only code spans with "wikeeper <cmd> … --flag"; a bare `--flag` bullet never satisfies checkCoverage.
2026-10-18 · #lint #finish · The finish lint hook runs before the snapshot and lock are removed: unlogged-change judges in snapshot mode during finish.
2026-10-18 · #lint #only · oversized-page pre-filters on ctx.only itself; a new onlyArchive filter must leave `only` set for it.
2026-10-18 · #vitest #config · vitest 5 reads vitest.config.* from its root only (no parent lookup): a worktree without the file runs without its test.env.
2026-10-18 · #esm #cycle · doctor → update-check → read/url → ingest/report → doctor once report imports plural: never call an imported function at module top level there.
2026-10-18 · #ux #doctor · A doctor message ending ": run …" plus a fix: line prints the step twice (decision 66); check every new doctor check.
2026-10-18 · #red-test #ts · Call a widened factory through a cast or `as never` deps, so typecheck stays green at the QA-Red commit.
2026-10-18 · #templates #walkthrough #update · A project reads its own .wiki/system/WIKI.md, which only update replaces: text about stale files reaches the agent one release late; test it with updated files and a hand-set manifest version.
2026-10-18 · #contract #red-test · A story built on a text contract lacks parallel chains' code: merge the sprint branch before QA-Red when its red file imports their modules.
2026-10-18 · #qa #red-test #ci · CI checks out at fetch depth 1, so a red test cannot git show <base>:path; pin LF-normalised sha256s in a named it().
2026-10-18 · #docs #test-harness · architecture.md has '## ' lines inside ```md fences: a section splitter must skip fenced blocks.
2026-10-18 · #readme #unicode · README emoji headings may carry U+FE0F and ranges use U+2013: write red literals with \u escapes.
2026-10-18 · #red-test #test-harness · snapshotTree helpers must skip symlinks: init --agents claude links skills dirs, readFile gives EISDIR
2026-10-18 · #qa #red-test #fixtures · Story 007-04 quotes fixture sizes (report docx document.xml 2841 B, article.html 1225 B) that differ from the repo (2851 B, 1237 B); compute expected figures from the fixture bytes, never hardcode them
2026-10-18 · #red-test #contract · Red tests that size fixtures with estimateTokens fail on the C1 stub before reaching the code under test; the real estimator is only exercised after STORY-007-01 is merged in.
2026-10-18 · #red-test #lint #test-harness · afterEach setLintHook(null) with no beforeEach restore makes finish lint warnings order-dependent
2026-10-18 · #test-harness #git · macOS sed has no \n in replacements; use python for multi-line source edits
2026-10-18 · #qa #red-test #templates · When a red test pins a shipped block, keep BLOCK_LINES and PINS as the old release and add a separate new-line constant for the re-scoped template compare
2026-10-18 · #qa #test-harness #enforce · init does not create CLAUDE.md or AGENTS.md on its own: write a team file first when a test needs the pointer block
2026-10-18 · #qa #red-test #contract · a literal dynamic import of a module that does not exist yet leaves one tsc TS2307 error on the red file until the Developer creates the module; expected, not a defect
2026-10-18 · #test-harness #worktree · A worktree's node_modules holds only caches (packages resolve from the main checkout): run npm ci in it before tests that build with tsc or install the packed package.
2026-10-18 · #red-test #ts · A red test importing a module its build branch lacks breaks typecheck there: reach unbuilt code through the CLI instead.
2026-10-18 · #contract #qa · Never catch errors from a contract stub that 'never throws': the catch turns the stub into a passing test.
2026-10-18 · #test-harness #macos · Build expected child paths from the paths as given, not from realpath (/var resolves to /private/var).
2026-10-18 · #fs #tokens · Buffer.toString/readFile utf8 keep a BOM, TextDecoder drops it: every page token figure must decode the same way.
2026-10-18 · #contract #config · C1 is type-only for config: DEFAULT_CONFIG.tokens is undefined at runtime until 007-01's schema lands; red on the base is not a wiring gap.
2026-10-18 · #red-test #tokens · read --out appends "\n": take expected token counts from data.markdown, not the written file.
2026-10-18 · #cli #stdin · Destroying stdin on a race timeout rejects the pending for-await read: catch the read promise before racing.
2026-10-18 · #search #archive · A combined --archive index must renumber archive doc ids: wrapIndex looks hits up by docs[r.id] (src/search/engine.ts).
2026-10-18 · #search #aliases · Backlinks for an archive-only entity need an empty page list, or a live page at the same path is taken for the entity's own.
2026-10-18 · #contract #esm · check `src/core/version.ts` already exists before writing a new file; contract steps append, never overwrite
2026-10-18 · #test-harness · setup-files.red S5 can time out at 5s under full-suite load; rerun before blaming a change
2026-10-18 · #templates #qa · A story's red phrase breaks when a later story edits that sentence in place; pin only the part that survives.
2026-10-18 · #ux #templates · Agent text for a failed command must cover every error code; 'otherwise try again later' strands the ones it forgot.
2026-10-18 · #ux #wording · Story-drafted CLI messages drift: they quote commands and end in periods. Spec hints as `run wikeeper x`, lowercase, no period (docs/ux.md §3.2–3.3).
2026-10-18 · #ux #templates · "Show the user what it printed" leaks commands to the user; say what to tell in plain words, and name the one command the user must run, if any.
2026-10-18 · #ux #cli · One fact, one shape across commands: `wiki ≈66k tokens · 43 pages`, `<path> ≈6.3k 🟡`, limits through formatLimit (20k) (docs/ux.md §3.4, §3.8–3.9).
2026-10-17 · #release #npm #ci · npm 12 prints `npm pack --json` as an object keyed by package name, not an array; release.yml pins npm@11 (>= 11.5.1 for trusted publishing). `npm publish --dry-run` passes dry-run down to the tests' own `npm pack` (no tarball): simulate a release with `npm publish --registry=http://127.0.0.1:9/` instead.
2026-10-17 · #qa #red-test #enforce · The `read` allow pair exists only in ai mode, while the lint/status/rules-list allow rules are in every mode; a per-mode assertion must not demand `read` in ask or whitelist.
2026-10-17 · #qa #red-test · Red rows that read a CLI form out of template text and run it live need a scratch copy with the planned text applied, to prove them green before the red commit.
2026-10-17 · #qa #test-harness · structure.ts finding lines are 1-based (i+1): a text line inserted two below a heading reports heading index + 3.
2026-10-17 · #test-harness #finish · finish refuses a page that does not cite [[<this ingest's id>]] (validation_failed, details.uncited); every page a fixture writer changes must cite the ingest's own id.
2026-10-17 · #read #output · read's human output prints only warning:/error: messages; codes (likely_scanned, http_error) and details.status are only in --json (data.warnings[].code, error.code).
2026-10-17 · #templates #structure · A check added to runAllChecks runs in every real-tree caller (templates.test.ts, other stories' red S4); build it on a tree that already has the text it checks.
2026-10-17 · #templates #sections · SECTION_RE reads "section" plus up to 40 characters plus a double quote; a --summary "<one line>" span after the word "section" is read as a section name; keep "section" out of that sentence.
2026-10-17 · #goal #acceptance · The Goal Acceptance Check's "006-11 coverage check" (a fixture per lint id) matched no story requirement; check each acceptance clause against a story R before the last wave.
2026-10-17 · #test-harness #reingest · A re-ingest of a temp copy outside the repository records origin as the absolute POSIX path; compare with copy.split(path.sep).join("/").
2026-10-17 · #pre-gate #red-test #contract · A story cut from another story's contract commit carries that owner's QA-Red files, and the post-flight 'red modified' scan counts them; diff them against the owner's QA-Red commit before routing a bounce.
2026-10-17 · #contract #merge · To prove a re-sync merge has no hand edits, compare `git merge-tree --write-tree <p1> <p2>` with `<merge>^{tree}`; equal trees mean a dependent built on the same contract stays valid.
2026-10-17 · #test-harness #ingest · isSourceId rejects ids like src-open; lock and snapshot unit tests need src-YYYY-MM-DD-slug ids, or readLock reports the lock unreadable.
2026-10-17 · #git #worktree · git stash is shared by every worktree of a repo: a parallel Developer's pop can swap another story's edits into yours; never stash, use a patch file or a temp commit.
2026-10-17 · #qa #test-harness · runCli takes cwd from io.cwd; a top-level cwd option is ignored and init runs in the worktree itself; copy lint-command.test.ts run().
2026-10-17 · #test-harness #finish · finish warnings are in the envelope's top-level json.warnings, not json.data.warnings; IngestReport has no warnings field.
2026-10-17 · #pre-gate #incidents · run_script.sh inside a story worktree writes incidents to <worktree>/.cleargate/sprint-runs/_off-sprint/.script-incidents (no .active there), not the sprint dir.
2026-10-17 · #e2e #read · A packed-run "clean stdout" row needs stdout === --json data.markdown + "\n"; startsWith(title) misses trailing library output.
2026-10-17 · #qa #red-test · A red scenario mixing text asserts with a live CLI run: put the text asserts first and prove the live half fails on a scratch copy without them, or it never runs at baseline.
2026-10-17 · #qa #red-test · A red text test that mirrors a Developer-owned paragraph needs one canary assertion on the new text, or a green-at-baseline row hides a no-op Developer.
2026-10-17 · #test-harness #enforce · After a mode change, update appends the new rule lines at the end of the settings file; assert containment, not tail position.
2026-10-17 · #templates #vocabulary · wiki-protocol.red checkVocabulary reads every "wikeeper <word>" in WIKI.md prose; "a wikeeper command runs" fails as an unknown command; write "a command".
2026-10-17 · #templates #kb · SETUP step-3 format spans (<entity> <fields> → …) do not parse; end each item with "Example(s):" so a test can split format from examples.
2026-10-17 · #shipped-blocks #test-harness · shipped-blocks.test.ts:56 hard-coded "entry 2"; every append broke it; tests of append-only lists use .length, never literal indexes.
2026-10-17 · #shipped-blocks #ts · The SPRINT-03 pointer block's line 9 has double quotes: escape them in the SHIPPED_BLOCKS literal; the sha256 is of the unescaped text.
2026-10-17 · #skills #red-test · The wiki-ingest skill must keep the literals "one at a time", "facts file", "Write the brief" and "into its task" (skills-subagents S2, walkthrough-fixes C8).
2026-10-17 · #test-harness #worktrees · A scratch copy linked to a worktree's node_modules breaks when DevOps tears the worktree down mid-run; link the main checkout's node_modules after its npm ci.
2026-10-17 · #read #pdf · unpdf 1.9 (pdf.js 6.4.299) throws on a Node Buffer ("provide binary data as Uint8Array") and detaches the array it gets; pass new Uint8Array(bytes).
2026-10-17 · #read #pdf · pdf.js 6.4 has no PDFDocumentProxy.destroy() and no isEvalSupported option (TS2353); close with pdf.loadingTask.destroy().
2026-10-17 · #read #docx · turndown drops <img src=""> entirely and the GFM plugin gives a headerless table an empty header row; add an img rule and promote the first row.
2026-10-17 · #lint #test-harness · finish registers its lint hook at module load; one setLintHook(null) leaves the rest of that file without it: set the hook in beforeEach.
2026-10-17 · #lint #fixtures · A [[src-…]] citation with no pages/sources/<id>.md is a broken-link error; an exit-0 lint fixture needs the source page or headings-only pages.
2026-10-17 · #red-test #lint · A "no <id> finding" row passes before <id> is registered; run --check <id> and assert json.ok before asserting absence.
2026-10-17 · #shell #zsh · In zsh "$T:src/x" applies the :s modifier and set -- $v does not split; write "${T}:src/x" and run loops under bash -c.
2026-10-17 · #qa #dod · A Developer commit that only turns the red tests green leaves the §4.1 unit-test minimum unmet; red tests alone do not satisfy DoD.
2026-10-17 · #contract #test-harness · A contract that fixes the layout of a QA-Red test helper binds QA-Red, not the Developer (who may not restructure red files); check it at TPV.
2026-10-17 · #qa #test-harness · While several worktree suites run, full `npm test` at default workers times out 3-5 git-spawning tests at 5 s; re-run with --maxWorkers=4 before judging.
2026-10-17 · #qa #red-test · A red row that asserts an empty findings list passes vacuously when the stub errors; assert json.ok first.
2026-10-17 · #test-harness #init · init seeds .gitkeep in .wiki/raw and .wiki/log; an "empty dir" assertion on an initialised wiki must ignore dotfiles or compare with a before-listing.
2026-10-17 · #red-test #manifest · update always rewrites manifest.package_version; assert the one manifest entry under test, never the whole manifest, after update.
2026-10-17 · #update #manifest · pruneDeconfigured treated a deleted agent file as deconfigured: it warned "already gone" and dropped the manifest block entry.
2026-10-17 · #qa #red-test #encoding · A BOM is not part of any line: strip it before START_RE (^ with the m flag) or the block is not found in a BOM+CRLF file.
2026-10-17 · #test-harness #fs · hashTree-style walks must hash only dirent.isFile() entries; a symlink or dir entry makes readFile throw EISDIR.
2026-10-17 · #test-harness #ingest · ingest start --json puts the source id at data.id, not data.source_id; non-TTY stdin via Readable.from is unreliable, use --file.
2026-10-17 · #log #test-harness · writeLogEvent's "-2" suffix sorts before the base name ("-" < "."): equal-at events read back in reverse; give each test event its own now.
2026-10-17 · #read #defuddle · defuddle/node Defuddle() returns a Promise, drops the h1 that repeats the title, drops tiny data: images and keeps big ones as ![alt](data:…).
2026-10-17 · #read #fixtures · defuddle resolves relative links against the page URL; an HTML fixture read over http and from a file needs absolute links only.
2026-10-17 · #lint #red-test · A registry story's red file must filter findings to its own check ids (or pass --check): later checks add findings and red files are immutable.
2026-10-17 · #red-test #contract · Rows a later story's body replaces (stub branches, list lengths) belong in Developer tests, never in an immutable red file.
2026-10-17 · #test-harness #http · A local test server with a never-answering route must closeAllConnections() before close(), or afterAll hangs.
2026-10-17 · #enforce #red-test · A SPRINT-03 red file that pins exact rule lists (enforce-prompts.red) breaks for every later rule story; list it in the re-scope table.
2026-10-17 · #test-harness #perf · test/setup-files.red.node.test.ts S1 times out at 5 s when several worktree suites run at once; it passes alone. Re-run it alone before blaming a story.
2026-10-17 · #qa #test-harness · macOS sed -i needs '' and cited line numbers go stale; match rows by pattern, not by line number.
2026-10-17 · #qa #red-test #contract · A red test asserted claudeDecision === "prompt" but contract C5's type is "ask"; check red expectations against the frozen contract type.
2026-10-17 · #qa #red-test · A red Outline that shares one init across rows needs its temp dirs cleaned in afterAll; afterEach deletes them after row 1.
2026-10-17 · #test-harness #red-test · init seeds .wiki/raw/.gitkeep; assert raw/ holds no source files, never that raw/ does not exist.
2026-10-17 · #esm #contract #lint · A check module that value-imports its registry (checks.ts ↔ links.ts) throws "Cannot access X before initialization" when loaded first; registry-only value imports.
2026-10-17 · #cli #commander #qa · Commander wraps command and option descriptions at 80 columns in --help (addHelpText is not wrapped); match help with whitespace collapsed.
2026-10-17 · #cli #commander · A variadic option (--check <id...>) also concatenates repeated uses (--check a --check b → ["a","b"]); no collector needed.
2026-10-17 · #ts #contract · .includes() on an `as const` tuple rejects a string argument; widen with (LIST as readonly string[]).includes(s).
2026-10-17 · #windows #test-harness · Overriding PATH for a child: delete every key whose upper-case form is PATH first (Windows has Path), then set PATH.
2026-10-17 · #templates #subagents · wiki-writer text must stay identical in all 3 agents (006-05 R6, red S3): name each agent's tools in one sentence.
2026-10-17 · #yaml #parser · yaml prettyErrors end " at line L, column C:" plus a code frame; keep line 1 and strip the suffix for one-line findings.
2026-10-17 · #pre-commit #surface-gate · The surface gate isn't wired as a git or Claude hook here; QA-Verify's file-list diff is the only surface check.
2026-10-17 · #walkthrough #templates · Structural template tests miss wrong semantics: WIKI.md called --status fact status; only a real agent run caught it.
2026-10-17 · #test-harness #perf · search-perf p95 also fails (532–630 ms) in a plain full vitest run, not only with stories in parallel.
2026-10-17 · #pre-gate #red-test · 'red tests modified after QA-Red' fires on a red file the branch created; check its blob at the qa-red commit.
2026-10-17 · #templates #sections · A section target named in a non-system file is a structure.ts finding; R4 covers only .wiki/system/ files.
2026-10-17 · #qa #red-test · Vite resolves a variable dynamic-import specifier from the root (/src/…); use a literal path in a red test's load().
2026-10-17 · #ingest #hooks · runUserHooks stops at the first failed command; call it once per command when every post step must run.
2026-10-17 · #test-harness #templates · yaml warns on unquoted {{model}} in frontmatter; replace the token before parseYaml in a checker.
2026-10-17 · #templates #paths · listTemplateFiles("") returns "/agent-block.md" with a leading slash; strip it or list per top-level dir.
2026-10-17 · #cli #plural · plural(n, "miss") prints "misss"; spell irregular plurals by hand (`n === 1 ? "miss" : "misses"`).
2026-10-17 · #e2e #test-harness · Two e2e files building into the shared dist/ race in parallel vitest workers; tsc --outDir a temp stage.
2026-10-17 · #ci #windows · CI runs only on PRs and main pushes; open the sprint→main draft PR early to see Windows before close.
2026-10-17 · #templates #sections · Skills cite WIKI.md sections unqualified ("sections "A" and "B""); resolve to the last named protocol file.
2026-10-17 · #contract #merge · A consumer can merge its owner's Developer commit before the owner merges; the later re-sync gives the same tree.
2026-10-17 · #qa #red-test · runGuard's HookResponse.stdout is optional (claude allow() has none): red helpers read `res.stdout ?? ""`.
2026-10-17 · #qa #red-test · writeLogEvent takes `permission` as a string ("ai"); the {mode, approved, …} object is source meta only.
2026-10-17 · #qa #templates · parsePage takes (text, relPath), not (path, text); a swapped scratch check parses silently with no errors.
2026-10-17 · #search #since · Date.parse rolls 2026-02-30 over to Mar 2 and accepts T24:00; check the calendar and the hours before trusting it.
2026-10-17 · #snapshot #fs · fs.cp copies symlinks as links; pass a filter that skips them so the snapshot copy matches hashTree.
2026-10-17 · #search #filters · entityHit hits carry no entity key; map a filter-only hit back by (path, line, entity name).
2026-10-17 · #qa #red-test · Unknown-option rows exit 2 usage at baseline; assert json.command === "search" to keep them red.
2026-10-17 · #git #merge · Insert-only edits with one unchanged line between them merge cleanly; edits on adjacent lines conflict.
2026-10-17 · #qa #test-harness · Under parallel story load the full suite can hit 5 s timeouts (setup-files git tests): rerun before blaming the diff.
2026-10-17 · #qa #red-test · Usage-error red rows pass spuriously when the subcommand is unknown (also exit 2): assert the message hint too.
2026-10-17 · #qa #test-harness · search-perf p95 hit ~600 ms with 4 story suites running at once and passed alone: re-run the file isolated.
2026-10-17 · #cli #test-harness · The JSON error envelope puts `command` at top level, not in `error`; red tests read json.command.
2026-10-17 · #paths #ingest · isInside is strict (a dir is not inside itself); a walk that skips the content dir must also test equality.
2026-10-17 · #search #cache · minisearch 7.2 MiniSearch.loadJS(toJSON(), opts) restores identical scores; reloaded toJSON() key order differs.
2026-10-17 · #cli #commander · `--type ""` reaches the action as ""; check `!== undefined`, never truthiness, or the empty-value error never fires.
2026-10-17 · #ingest #plan · Apply the hidden-name skip only below the walked dir: the walkthrough's source dir sits under `.cleargate/`.
2026-10-17 · #qa #red-test · A red test can pass a deps field the Developer adds later and still typecheck: `SearchDeps & { onRebuild: () => void }`.
2026-10-17 · #qa #red-test · Re-scope immutable reds by content anchors, not plan line numbers; sort both sides for set equality.
2026-10-17 · #test-harness #vitest · vitest 5 has no `bench` export; in *.bench.ts use the test-context bench(name, fn).run().
2026-10-17 · #search #perf · Sequential loadPages on 500 pages costs ~160 ms; parallel readFile keeps search p95 under 500 ms under load.
2026-10-17 · #contract #insertion-point · Locals that consumers reassign at their anchors must be `let` in the layout contract, not `const`.
2026-10-17 · #git #doctor · git check-ignore -z dies without --stdin ("-z only makes sense with --stdin"); pass paths NUL-terminated on stdin.
2026-10-17 · #enforce #qa · A new allow rule in every mode breaks the CR-001/002-06 rule-list red tests; that story's QA-Red re-scopes them.
2026-10-17 · #cli #commander · Commander usage errors fire before preAction (command "wikeeper"); throw WikeeperError(USAGE) in the action instead.
2026-10-17 · #gitignore · The managed block writes `.wiki/me.md` with no leading slash (formatEntry adds `/` only to slash-less names).
2026-10-17 · #kind-rules #templates · parseSourceKinds doesn't skip HTML comments; keep `## Source kinds` comments single-line, starting `<!--`.
2026-10-17 · #yaml #templates · A `<…>` placeholder containing `: ` or ` #` breaks YAML frontmatter; keep frontmatter placeholders plain.
2026-10-17 · #qa #red-test #windows · Fixture names differing only by case (b.md/B.md) collide on macOS/Windows; use distinct letters.
2026-10-17 · #test-harness #red-test · Timeout tests around node -e children flake below ~2 s; cold start under full-suite load exceeds 300 ms.
2026-10-17 · #qa #test-harness · Drive init/remove red tests via runCli's default program so the agents integration registers; needs .git.
2026-10-17 · #qa #red-test · A cap check passes at baseline on a short input; pad the input to the cap in-test so the over-cap case is real.
2026-10-17 · #qa #red-test · QA-Red can't fixture implementation-private specs (enforce SPECS lines files); cover them in Developer unit tests.
2026-10-17 · #shell #macos · BSD sed needs `sed -i ''`; after a failed scripted edit in an && chain, re-check git diff.
2026-10-17 · #yaml #parser · yaml 2.x parseDocument with prettyErrors: false sets no linePos; keep the default, read linePos[0].line.
2026-10-17 · #remove #qa · remove --json sorts data.kept/data.removed by code unit; never assert "X right after Y" in them.
2026-10-17 · #cli #test-harness · init --yes with no agents exits 5 before writing; fixtures needing agent files pass --agents <name>.
2026-10-17 · #codex #toml #templates · Sub-agent text: no \, no """, no {{model}}; renderModelLine drops any line containing {{model}}.
2026-10-17 · #test-harness #windows · Tests that inject platform: linux must not build PATH entries from os.tmpdir(); a win32 host path has a drive-letter colon.
2026-10-17 · #qa #test-harness · To test stale-rule removal, hand-build the legacy settings and manifest state; a test relying on init no longer exercises it.
2026-10-17 · #test-harness #worktrees · npm test in the main checkout also runs tests under .worktrees/; counts double while a worktree exists.
2026-10-17 · #qa #remove · remove --json puts warnings at top-level json.warnings, not data.warnings; assert both.
2026-10-17 · #qa #red-test · Before approving a fix that changes documented output, grep *.red.node.test.ts for the old output; immutable asserts need a gate reset.
2026-10-17 · #enforce #test-harness · Codex/Antigravity hooks.json ignore ingest.permission; only a guard-command change (npx re-pin via runUpdate packageVersion) rewrites them.
2026-10-16 · #windows #test-harness · Split/join PATH with the injected platform's path module (path.win32), not the host delimiter.
2026-10-16 · #qa #hooks · Default-off scenarios (Enter, non-TTY) pass at baseline; pair each with an on-path test or it guards nothing.
2026-10-16 · #test-harness #integrations · Import-time registerIntegration breaks tests that reset, then lazily import program.js; register in runCli.
2026-10-16 · #reuse #plan · Reuse-table rows added after a plan override its "private helper" advice; recheck plans after each merge.
2026-10-16 · #pre-gate #qa-red · Red-modified scan diffs vs the sprint base, so a new red file always flags; confirm via git diff <red-sha> HEAD.
2026-10-16 · #hooks #npm · npx prepends node_modules/.bin dirs to PATH while it runs; skip them when deciding a bin is "on PATH".
2026-10-16 · #windows #test-harness · Spawn npm as process.execPath + npm_execpath; a .cmd without shell throws EINVAL on Node >= 20.
2026-10-16 · #manifest · A same-path manifest upsert erases sibling entries with other identities; key hook/rule entries by identity.
2026-10-16 · #fs #windows · Detect agent files via readdir+stat, not existsSync: case-insensitive FS finds CLAUDE.md for claude.md.
2026-10-16 · #test-harness #stdin · Readable.from([str]) yields strings; share one readline reader per stdin, never open two.
2026-10-16 · #hooks #cli · Commander usage errors exit 2 = deny in a PreToolUse guard; make options optional + allowUnknownOption.
2026-10-16 · #qa #cli · Red tests that JSON.parse stdout must pass --json; parsing plain output pushes human text onto stderr.
2026-10-16 · #qa #contract · Working C1 skeleton bodies make QA-Red runtime scenarios pass at baseline; only non-skeleton parts stay red.
2026-10-16 · #pre-gate #deps · new_deps FAIL is expected for a plan-named dependency (yaml); post-flight passes when plan, package.json, lock agree.
2026-10-16 · #encoding #bom · Write BOM as \uFEFF escapes in TS literals, never a raw invisible U+FEFF character.
2026-10-16 · #config #yaml · YAML `key:` with no value parses as null — leaf validators error, map nodes default; emit explicit [] in generators.
2026-10-16 · #test-harness #windows #macos · Red tests must not rely on case-differing filenames (b.md vs B.md); case-insensitive FS merges them.
2026-10-16 · #qa #test-harness · Red tests for missing modules: literal dynamic import() in a load() helper so each test fails alone, not the suite.
2026-10-16 · #inject #bom · A BOM before the START marker defeats ^ in a multiline regex; split the BOM off before matching.
2026-10-16 · #cli #npm · First publish shows `0.0.0-stage` stub for minutes (staged publishing) — wait; 0.0.1 isn't live yet.
2026-10-16 · #recipe #cli #npm · Non-TTY `npm publish` fails EOTP; wrap it: `script -q /dev/null npm publish --auth-type=web`.
2026-10-16 · #cli #npm · npm view 404 ≠ name free: names equal after stripping `-._` are rejected (agentwiki vs agent-wiki).
