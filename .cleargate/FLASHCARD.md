# ClearGate Flashcards

One-liner gotcha log. Newest first. Grep by tag (e.g. `grep '#schema'`).
Active cards have no marker; `[S]` = stale, `[R]` = resolved (see `.claude/skills/flashcard/SKILL.md` Rules 7–8).
Format: `YYYY-MM-DD · #tags · [marker]? lesson`

---

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
