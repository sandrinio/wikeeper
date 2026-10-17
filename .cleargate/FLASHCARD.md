# ClearGate Flashcards

One-liner gotcha log. Newest first. Grep by tag (e.g. `grep '#schema'`).
Active cards have no marker; `[S]` = stale, `[R]` = resolved (see `.claude/skills/flashcard/SKILL.md` Rules 7–8).
Format: `YYYY-MM-DD · #tags · [marker]? lesson`

---

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
