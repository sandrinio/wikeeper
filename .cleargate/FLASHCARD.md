# ClearGate Flashcards

One-liner gotcha log. Newest first. Grep by tag (e.g. `grep '#schema'`).
Active cards have no marker; `[S]` = stale, `[R]` = resolved (see `.claude/skills/flashcard/SKILL.md` Rules 7–8).
Format: `YYYY-MM-DD · #tags · [marker]? lesson`

---

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
