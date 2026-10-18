---
story_id: STORY-007-06
parent_epic_ref: EPIC-007
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-007 (approved 2026-10-18) §2 (`wikeeper statusline`, `--install`), §3 Performance row (p95 < 300 ms on 500 pages, npm run test:perf), agent_context rule 'never replace a Claude Code status line the user already has' · SPIKE-003 (Completed 2026-10-18) §5 (naive loop ≈10.8M chars/s) · SPRINT-04 decomposition brief (2026-10-18) contracts K1, K2, K8 and the src/program.ts merge order · Claude Code docs read 2026-10-18: code.claude.com/docs/en/statusline (stdin fields cwd / workspace.current_dir, 300 ms debounce, in-flight runs cancelled, output shown only on exit 0) and code.claude.com/docs/en/settings (precedence local > project > user, strict JSON with no comments, settings.local.json kept out of git only when Claude Code creates it, CLAUDE_CONFIG_DIR) · verified at 6b75807: src/program.ts, src/agents/enforce/guard-command.ts, src/agents/enforce/json-merge.ts, src/core/git.ts, src/commands/hook.ts, src/core/version.ts, test/search/search-perf.red.node.test.ts, test/fixtures/search/generate-wiki.ts, package.json · scratch measurements 2026-10-18 (this machine): node dist/cli.js --version cold start 150–180 ms over 5 runs; a char-code loop of the SPIKE-003 weights estimates the 500-page fixture shape (≈3.0M chars) in 13 ms p95 and reads it in 15 ms p95"
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-007-01
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T07:50:20Z
updated_at: 2026-10-18T07:50:20Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T07:58:48Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-007-06
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-18T07:58:47Z
  sessions: []
---

# STORY-007-06: `wikeeper statusline` and `--install`
**Complexity:** L2 — one new command module (`src/commands/statusline.ts`) with two modes, one registration line in `src/program.ts`, one script entry in `package.json` and a perf test. The gauge is one K1 call (`measureWiki`, STORY-007-01). `--install` reuses three existing pieces: the command-form choice (`resolveGuardForm`), the format-keeping JSON writer (`json-merge.ts`) and the git helper (`createGit`). Builds against K1/K2's frozen signatures until STORY-007-01 merges.

## 1. The Spec (The Contract)

### 1.1 User Story
As a user working in a wiki with Claude Code, I want a status line that always shows how big the wiki is and how big its largest page is, installed with one command that never overwrites a status line I already have, so that I see the wiki's size without asking for it.

### 1.2 Detailed Requirements
- **R1 — Command.** `wikeeper statusline [--install]`. `src/commands/statusline.ts` exports `collectStatusline`, `createStatuslineCommand(deps)` and `statuslineCommand`. `src/program.ts` appends `statuslineCommand` at the end of `defaultCommands` (`src/program.ts:38`) as it stands when this story merges, with one import and one entry. STORY-007-02 appends `configCommand` the same way, and the SDR orders the two.
- **R2 — Which directory.** Without `--install`:
  - When stdin is not a terminal, the command reads it as Claude Code's status-line JSON: at most 1 MB through `readPayload` (`src/commands/hook.ts:19`), and for at most 200 ms. If stdin has not ended by then, the command stops reading, releases stdin and goes on.
  - The directory is `workspace.current_dir` when that is a non-empty string, else `cwd` when it is, else `ctx.cwd`. A relative value is resolved against `ctx.cwd`. JSON that does not parse, or has neither field, means `ctx.cwd`.
  - Claude Code's docs (read 2026-10-18) say both fields hold the current working directory and that `workspace.current_dir` is preferred.
  - When stdin is a terminal, nothing is read.
- **R3 — The line (K8).** From that directory: `findRepoRoot` → `loadConfig` → `resolvePaths`. When `.wiki/config.yml` exists, it calls `measureWiki(paths)` and prints exactly one line: `wiki ≈66k tokens · 43 pages · largest page 🟡 ≈6.3k`.
  - The parts are `formatTokens(total)`, `plural(page_count, "page")` (`src/commands/doctor.ts:36`), and `levelMark(levelOf(largest.tokens, config.tokens.page))` followed by `formatTokens(largest.tokens)`.
  - With no pages it prints `wiki ≈0 tokens · 0 pages`.
  - No colour codes, and nothing on stderr.
- **R4 — Outside a wiki.** When the resolved root has no `.wiki/config.yml`, it prints nothing and exits 0. Claude Code then shows no status line (its docs: no output leaves the status line blank).
- **R5 — Errors inside a wiki.** Any error after the root is found, such as a `config.yml` syntax error or an unreadable `pages/`, prints `wiki size unavailable (<code>): run wikeeper doctor` and exits 0. `<code>` is the error's `code` when it is a string, else `error` (§1.4 Q5). Claude Code shows output only after exit 0, so a failing exit would leave the line blank with no hint.
- **R6 — Read-only and uncached.** Without `--install`, the command creates, changes and deletes no file. It keeps no cache: it measures on every run (§1.4 Q1).
- **R7 — Performance (EPIC-007 §3).** On the seed-1 500-page wiki from `test/fixtures/search/generate-wiki.ts`, `wikeeper statusline` run in-process through `runCli` has p95 under 300 ms over 30 timed runs after one warm-up run. This is asserted in `test/statusline-perf.red.node.test.ts`, which `npm run test:perf` runs. Node's start-up is not part of the measurement (see §1.5).
- **R8 — `--install`: which command.** `--install` needs an initialised wiki at `findRepoRoot(ctx.cwd)` (`not_initialised`, exit 1, otherwise) and never reads stdin. The command it writes depends on `resolveGuardForm({ root })` (`src/agents/enforce/guard-command.ts:35`), the same first-match order as the guard hook:
  - `path` → `wikeeper statusline`
  - `local` → `"<root>/node_modules/.bin/wikeeper" statusline`: an absolute path with forward slashes, in double quotes (§1.4 Q2)
  - `npx` → `npx -y wikeeper@<npmVersion(package version)> statusline` (`src/core/version.ts:28`), plus a warning that npx adds start-up time on every redraw and that `npm i -g wikeeper` (or a dev dependency) makes the line faster.
- **R9 — `--install`: never replace (K8).** It reads three settings files: `.claude/settings.local.json` and `.claude/settings.json` under the root, and the user file. The user file is `$CLAUDE_CONFIG_DIR/settings.json` when `CLAUDE_CONFIG_DIR` is set and non-empty, else `~/.claude/settings.json` (Claude Code's docs: `CLAUDE_CONFIG_DIR` moves the home-directory settings).
  - A file "sets a status line" when its top-level `statusLine` is present and not `null`.
  - When any of the three does, except for R10's case, the command exits 1 with code `statusline_exists` and changes no file. `details.files` lists the files in that order. Project files are shown relative to the root; the user file is shown as an absolute path with the home directory written as `~`.
  - The message names the files and says how to add the wiki line to the existing command:
    ```
    a status line is already set in ~/.claude/settings.json; nothing was changed.
    To show the wiki size too, make that status line command also print what `<cmd>` prints for the same input. In a shell script:
      input=$(cat)
      … your current status line, reading "$input" …
      printf '%s' "$input" | <cmd>
    Claude Code shows each printed line as its own row.
    ```
    `<cmd>` is the R8 command. The existing command is never printed.
  - Settings files are strict JSON (Claude Code's docs). A file that is not valid JSON, comments included, exits 1 with `settings_invalid` (`settingsError`, `src/agents/enforce/json-merge.ts:23`) and nothing is changed, because the command cannot tell whether that file sets a status line.
- **R10 — Its own line (§1.4 Q3).** When only `.claude/settings.local.json` sets a status line, and that line is `{ type: "command", command }` whose command runs wikeeper's `statusline` (it matches `/(^|[\s"'/])wikeeper(@[^\s"']+)?["']?\s+statusline\s*$/`):
  - If the command equals the R8 command, the command exits 0 with `already installed`, and the file stays byte-identical.
  - Otherwise, for example an older pinned npx version or a different form, `statusLine` is replaced with the R8 value and exit is 0.
- **R11 — Writing, keeping the format.** It loads `.claude/settings.local.json` with `loadJsonDoc` and writes it with `saveJsonDoc(doc, next, { backup: false })` (`src/agents/enforce/json-merge.ts:53`, `:90`), creating `.claude/` when it is missing.
  - `statusLine: { type: "command", command }` is added as the last top-level key, or replaced in place (R10). Every other key, the key order, the indentation, the line endings, the BOM and the final newline stay as they were.
  - No `.bak` is written: the file only gains or updates one key, and a backup would be an extra file that nothing ignores.
- **R12 — Keeping the file personal (§1.4 Q4).** Before writing, it checks the file against git with `createGit(root)` (`src/core/git.ts:42`):
  - **Tracked** (`isTracked`): exit 1 with code `settings_tracked`, and nothing is changed. A status line in a committed file would reach everyone.
  - **Not ignored** (`ignoreRule` returns `null` or a negated rule): after writing, append `/.claude/settings.local.json` to the repository's own exclude file. Its path comes from `git rev-parse --git-path info/exclude`, run through `execFileRunner` (`src/core/git.ts:23`). The output says so. Claude Code's docs say it keeps this file out of git only when it creates the file itself, and that a file made any other way must be ignored by hand.
  - **No git, or not a work tree:** write the file, and warn that it could not be checked against git.
- **R13 — `--install` output.** On success it prints `added the wiki status line to .claude/settings.local.json: <cmd>`, followed by `Claude Code shows it at its next status line update. To remove it, delete "statusLine" from .claude/settings.local.json.`
  - JSON `data`: `{ installed: boolean /* false when already installed */, replaced: boolean, file: ".claude/settings.local.json", command: string, form: "path" | "local" | "npx", excluded: boolean }`.
- **R14 — Metadata only (D-08).** The line and the install output carry sizes, levels, file names and the command. They never contain page text or the contents of the user's settings.

### 1.3 Out of Scope
- Status lines for Codex and Antigravity: they get the line at session start through the instructions (EPIC-007 §2, STORY-007-07).
- The allow rule for `statusline` and the instruction text that shows the gauge at session start (STORY-007-07).
- Managed settings (`managed-settings.json`, MDM, server-managed). They outrank the local file, so a managed status line hides this one, but nothing is replaced.
- Linked git worktrees. Claude Code reads the main checkout's `.claude/settings.local.json` there, and `--install` writes the file under the current root only.
- `wikeeper remove` and `wikeeper update` leave `.claude/settings.local.json` alone. After a remove, the line prints nothing, because there is no wiki any more.
- A cache of page sizes (§1.4 Q1), and showing `index.md` or the source limits in the line.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1):** Does `statusline` need a cache to meet p95 < 300 ms on 500 pages?
- **Recommended:** No cache, so the command stays read-only and has nothing to invalidate.
  - A scratch run on 2026-10-18 measured the fixture's shape (500 pages, ≈3.0M chars): parallel reads take 15 ms p95, and a char-code loop of SPIKE-003's weights takes 13 ms p95.
  - SPIKE-003's naive loop (≈10.8M chars/s) would take ≈275 ms on the same text, so the budget depends on STORY-007-01 writing `estimateTokens` as a char-code loop without per-character regular expressions. STORY-007-01 R1 now requires it (consistency audit, 2026-10-18).
  - If the perf test still fails, the fix belongs in the estimator, not in a cache.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2, form):** For the `local` form, the guard hook uses `"$CLAUDE_PROJECT_DIR"/node_modules/.bin/wikeeper` (`src/agents/enforce/guard-command.ts:70`). Claude Code documents that variable for hooks, but not for status-line commands. What should the status line use?
- **Recommended:** An absolute path to `<root>/node_modules/.bin/wikeeper`. `.claude/settings.local.json` is personal to this machine, so an absolute path is safe there. `path` and `npx` stay as the guard writes them.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q3, contract K8):** K8 says `--install` refuses whenever `.claude/settings.local.json` already sets `statusLine`. Then a second run, or an upgrade that changes the pinned npx version, would refuse wikeeper's own line. Should it?
- **Recommended:** No. Only in the local file, a line whose command runs wikeeper's `statusline` counts as wikeeper's own: an identical one exits 0 "already installed", and a different one is replaced (R10). Any other status line, in any of the three files, is refused as K8 says.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q4):** Claude Code keeps `.claude/settings.local.json` out of git only when it creates the file itself. How does `--install` keep the file personal when wikeeper creates it?
- **Recommended:** Refuse when the file is tracked. When it is not ignored, add `/.claude/settings.local.json` to the repository's `.git/info/exclude`: personal, never committed, and the shared `.gitignore` stays untouched (R12). The alternative is to warn only and leave the ignore rule to the user.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q5, contract K8):** K8 defines only the outside-a-wiki output. What should an error inside a wiki print, for example a broken `config.yml`?
- **Recommended:** One line, `wiki size unavailable (<code>): run wikeeper doctor`, with exit 0 (R5). A non-zero exit or empty output leaves Claude Code's status line blank with no hint.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** The budget is in-process, but Claude Code starts a new process on every redraw. On this machine `node dist/cli.js --version` takes 150–180 ms, because `src/program.ts` loads every command module. The `npx` form adds npx's own start-up on top.
- **Mitigation:** Claude Code debounces updates by 300 ms and cancels a run that is still going, so a 200–250 ms process still updates. `--install` warns on the `npx` form (R8). Splitting program loading so `statusline` loads less is a follow-up, not part of this story.
- **Risk:** The budget depends on STORY-007-01's estimator speed (§1.4 Q1).
- **Mitigation:** STORY-007-01 R1 requires the char-code loop and cites this budget. The perf test runs in this story, so a slow estimator shows before the sprint ends.
- **Risk:** Tests could read or write the human's real `~/.claude/settings.json`. Git tests could also pick up the human's global excludes: Claude Code adds `**/.claude/settings.local.json` there, which would make the "not ignored" case unreachable on this machine.
- **Mitigation:** `createStatuslineCommand` takes `userSettingsFile`, `guardForm` and `runGit` in its deps. The tests pass a temp file, and a git runner that sets `GIT_CONFIG_GLOBAL` and `XDG_CONFIG_HOME` to an empty temp location. The DoD checks that no test touches the real files.
- **Risk:** A stdin that is never closed, such as a non-terminal parent that writes nothing, would keep the process alive.
- **Mitigation:** The 200 ms read bound in R2. On timeout the command destroys or unrefs stdin, so the process can exit.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | `--install` has three successful paths: first install, already installed, and replacing wikeeper's own older line. |
| Interfaces | T | The line is read from Claude Code's stdin JSON or from a terminal, and printed as human text or as `--json`. |
| Data | T | stdin shapes (`workspace.current_dir`, `cwd` only, invalid JSON, none); an empty wiki; settings files with other keys, other indentation and CRLF; invalid JSON. |
| Rules | T | Never replace another status line; keep the file personal; the 300 ms p95 budget; the line writes nothing. |

Expected figures are computed in the tests with K1's `estimateTokens`, `formatTokens`, `levelOf` and `levelMark` on the fixture files.

```gherkin
Feature: wikeeper statusline

  @interfaces @data
  Scenario Outline: The status line shows the wiki's size
    Given <setup>
    When I run "wikeeper statusline" from <cwd> with stdin <stdin>
    Then the exit code is 0, stderr is empty and stdout is <stdout>

    Examples:
      | setup | cwd | stdin | stdout |
      | a wiki repository R with default limits and pages "a.md" of about 5k tokens, "b.md" and "c.md" under 4k each | an unrelated temp directory | {"workspace":{"current_dir":"R/notes"},"cwd":"R/notes"} | "wiki " + formatTokens(total) + " tokens · 3 pages · largest page 🟡 " + formatTokens(a.md) + "\n" |
      | the same repository R | an unrelated temp directory | {"cwd":"R"} | the same line |
      | the same repository R | R | a terminal (nothing is read) | the same line |
      | the same repository R | R | "not json" | the same line |
      | the same repository R | R | {"workspace":{"current_dir":"a temp directory with no wiki"}} | "" |
      | a wiki repository with no pages | that repository | a terminal | "wiki ≈0 tokens · 0 pages\n" |
      | a wiki repository whose .wiki/config.yml has a YAML syntax error | that repository | a terminal | "wiki size unavailable (E_CONFIG_SYNTAX): run wikeeper doctor\n" |

  @rules
  Scenario: The status line stays within its performance budget and writes nothing
    Given the seed-1 500-page wiki from test/fixtures/search/generate-wiki.ts
    When "wikeeper statusline" runs in-process through runCli once to warm up and then 30 timed times, each with stdin {"workspace":{"current_dir":"<the wiki root>"}}
    Then the p95 of the 30 durations is under 300 ms
    And every run printed one line that starts with "wiki ≈" and contains " · 500 pages · largest page "
    And no file under the wiki root was created, changed or deleted

  @paths @rules @data
  Scenario Outline: --install adds the status line to the personal settings file
    Given a wiki repository whose resolved form is "path", where no settings file but .claude/settings.local.json may set statusLine, and <local>
    And git <ignore>
    When I run "wikeeper statusline --install --json"
    Then the exit code is 0 and <result>

    Examples:
      | local | ignore | result |
      | there is no .claude/settings.local.json | ignores .claude/settings.local.json through a .gitignore rule | .claude/settings.local.json is {"statusLine":{"type":"command","command":"wikeeper statusline"}} with 2-space indent and a final newline; data.installed is true; .git/info/exclude is unchanged |
      | .claude/settings.local.json holds "permissions", uses 4-space indent and CRLF, and has no final newline | ignores it through a .gitignore rule | the parsed file equals the old object plus "statusLine" as its last key, still with 4-space indent, CRLF and no final newline; no .claude/settings.local.json.bak exists |
      | there is no .claude/settings.local.json | does not ignore it | the file is written, .git/info/exclude ends with the line "/.claude/settings.local.json", and data.excluded is true |
      | .claude/settings.local.json sets statusLine {"type":"command","command":"wikeeper statusline"} | ignores it | the file is byte-identical, data.installed is false, and the human output says the status line is already installed |
      | .claude/settings.local.json sets statusLine {"type":"command","command":"npx -y wikeeper@0.3.0 statusline"} and "permissions" | ignores it | statusLine.command is "wikeeper statusline", data.replaced is true, and "permissions" is unchanged |

  @rules
  Scenario Outline: --install never replaces a status line the user already has
    Given a wiki repository and <file> that sets statusLine to {"type":"command","command":"~/.claude/statusline.sh"}
    When I run "wikeeper statusline --install --json"
    Then the exit code is 1, json.error.code is "statusline_exists" and json.error.details.files is [<shown>]
    And every settings file is byte-identical, and no .claude/settings.local.json was created where there was none
    And "wikeeper statusline --install" names <shown> on stderr and prints the line "  printf '%s' \"$input\" | wikeeper statusline"

    Examples:
      | file | shown |
      | the user settings file (CLAUDE_CONFIG_DIR/settings.json, a temp file in the test) | that file's absolute path |
      | .claude/settings.json | ".claude/settings.json" |
      | .claude/settings.local.json | ".claude/settings.local.json" |

  @data
  Scenario Outline: Error — --install refuses what it cannot change safely
    Given <setup>
    When I run "wikeeper statusline --install --json"
    Then the exit code is 1, json.error.code is "<code>" and no file in the repository or the user settings directory changed

    Examples:
      | setup | code |
      | a wiki repository whose .claude/settings.local.json contains a "//" comment | settings_invalid |
      | a wiki repository whose user settings file is not valid JSON | settings_invalid |
      | a wiki repository whose .claude/settings.local.json is committed to git | settings_tracked |
      | a directory with no wiki | not_initialised |
```

### 2.2 Verification Steps (Manual)
- [ ] In a copy of `~/walkthrough-wiki`, run `echo '{"workspace":{"current_dir":"'"$PWD"'"}}' | wikeeper statusline` and check that it prints one line with about 43 pages.
- [ ] On the human's machine, where `~/.claude/settings.json` already sets a status line, run `wikeeper statusline --install` in that copy. Check that it exits 1, names `~/.claude/settings.json`, prints the `printf '%s' "$input" | …` hint, and that `git status` and the three settings files are unchanged (compare checksums).
- [ ] Add the hinted line to a copy of the existing status line script, run Claude Code in the copy, and check that the wiki line shows as a second row.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File (new) | `src/commands/statusline.ts` |
| Related Files | `src/program.ts`, `./package.json` |
| Test Files (new) | `test/statusline.test.ts` |
| QA-Red Tests (new) | `test/statusline.red.node.test.ts` |
| Perf test (QA-Red, new) | `test/statusline-perf.red.node.test.ts` |
| New Files Needed | `src/commands/statusline.ts`, `test/statusline.test.ts`, `test/statusline.red.node.test.ts`, `test/statusline-perf.red.node.test.ts` |

- **`./package.json`:** only the `test:perf` script gains `test/statusline-perf.red.node.test.ts`. The `*-perf.red.node.test.ts` name already keeps it out of `npm test`. STORY-007-07 bumps `version` in the same file later (merge order 007-06 → 007-07).
- **Read, not edited:** `src/core/tokens.ts` and `src/core/config.ts` (K1, K2, STORY-007-01), `src/agents/enforce/guard-command.ts` (`resolveGuardForm`, `GuardForm`), `src/core/version.ts` (`npmVersion`), `src/core/templates.ts` (`readPackageVersion`), `src/agents/enforce/json-merge.ts` (`loadJsonDoc`, `saveJsonDoc`, `settingsError`), `src/core/git.ts` (`createGit`, `execFileRunner`, `GitRunner`), `src/commands/hook.ts` (`readPayload`), `src/commands/doctor.ts` (`plural`), `src/core/paths.ts`, `test/fixtures/search/generate-wiki.ts`.

### 3.2 Technical Logic
- **Line path.** `if (!ctx.isTTY) dir = pickDir(await readBounded(ctx.stdin, 1 << 20, deps.stdinTimeoutMs ?? 200), ctx.cwd)`. Then `collectStatusline(dir)` does `findRepoRoot` → `loadConfig` → `resolvePaths` → `stat(paths.configFile)`. ENOENT gives the empty result (R4). Otherwise it calls `measureWiki(paths)` and builds the line.
  - Everything after the root is found runs inside one try/catch that produces the R5 line.
  - `emitResult` gets `message: line ?? undefined`, so nothing is printed outside a wiki, and no `warnings`.
- **Bounded read.** `Promise.race` between `readPayload` and a timer. On timeout, call `stream.destroy?.()` (or `unref` on `process.stdin`), so an open pipe cannot keep Node alive. Clear the timer when the read wins.
- **Install path.**
  1. `root = findRepoRoot(ctx.cwd)`, then `assertInitialised`.
  2. `form = deps.guardForm?.(root) ?? resolveGuardForm({ root })`. Build the R8 command; for the `local` form, use `toPosix(path.join(root, "node_modules", ".bin", "wikeeper"))` in double quotes.
  3. Load the three files: the user file with a strict parse (`loadJsonDoc` also serves read-only, and its `existed: false` covers ENOENT), and the two project files.
  4. Apply R9 and R10 to decide refuse, already installed, replace or add.
  5. `git = createGit(root, deps.runGit ?? execFileRunner)`: `inWorkTree`, `isTracked(".claude/settings.local.json")`, `ignoreRule(...)`.
  6. `mkdir(.claude)`, then `saveJsonDoc(doc, next, { backup: false })`.
  7. When the file was not ignored, read the exclude path from `runGit(["rev-parse", "--git-path", "info/exclude"], root)`, resolve it against `root`, create its folder, and append the entry with a leading newline when the file does not end with one.
  - Steps 1–5 change nothing, so every refusal leaves every file as it was.
- **Refusal text.** Build it with the R8 command. Never include the existing `statusLine` value: it comes from the user's own settings.
- **Deps.** `createStatuslineCommand(deps: { userSettingsFile?: () => string; guardForm?: (root: string) => GuardForm; runGit?: GitRunner; stdinTimeoutMs?: number } = {})`. The default user file is `process.env.CLAUDE_CONFIG_DIR` when it is non-empty, else `path.join(os.homedir(), ".claude")`, joined with `settings.json`. To show it, replace a leading `os.homedir()` with `~`.
- **Tests.**
  - Run scenarios through `runCli(argv, { commands: [createStatuslineCommand(deps)], io })`, with `io.cwd` set (FLASHCARD 2026-10-17 `#qa #test-harness`: `runCli` takes cwd from `io.cwd`). Give stdin as `Readable.from([json])` with `isTTY: false`, or `{ isTTY: true }` for the terminal row.
  - Git rows use `git init` in a temp directory. The runner sets `GIT_CONFIG_GLOBAL` to an empty temp file and `XDG_CONFIG_HOME` to a temp directory, so the human's global excludes never apply.
  - Pass `--json` wherever a test parses stdout (FLASHCARD 2026-10-16 `#qa #cli`).
  - The perf test copies `test/search/search-perf.red.node.test.ts`: `generateWiki(root, { seed: 1, pages: 500 })`, one warm-up, 30 timed runs with `performance.now()`, and p95 at index `Math.ceil(0.95 * n) - 1`. It runs through the default `runCli` command list, so it measures the real registration.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper statusline` | CLI | None | stdin: Claude Code status-line JSON (optional); `--json` | one line, or nothing; `StatuslineData` |
| `wikeeper statusline --install` | CLI | None | `--json` | `InstallData` (R13); errors `statusline_exists`, `settings_invalid`, `settings_tracked`, `not_initialised` (exit 1) |

```ts
// src/commands/statusline.ts
import type { GuardForm } from "../agents/enforce/guard-command.js";
import type { GitRunner } from "../core/git.js";
import type { TokenLevel } from "../core/tokens.js";
import type { CommandModule } from "../program.js";

export interface StatuslineData {
  root: string | null; // null outside a wiki
  line: string | null; // what was printed; null outside a wiki
  wiki: number | null;
  page_count: number | null;
  largest: { path: string; tokens: number; level: TokenLevel } | null;
  error: string | null; // R5 code, else null
}
export interface InstallData {
  installed: boolean;
  replaced: boolean;
  file: ".claude/settings.local.json";
  command: string;
  form: GuardForm;
  excluded: boolean;
}
export function collectStatusline(dir: string): Promise<StatuslineData>;
export function createStatuslineCommand(deps?: {
  userSettingsFile?: () => string;
  guardForm?: (root: string) => GuardForm;
  runGit?: GitRunner;
  stdinTimeoutMs?: number;
}): CommandModule;
export const statuslineCommand: CommandModule;
```

Consumed (frozen, K1/K2 from STORY-007-01): `measureWiki`, `formatTokens`, `levelOf`, `levelMark`, `TokenLevel`, `WikeeperConfig.tokens.page`. Refinements of K8, all in §1.4: wikeeper's own line in the local file is not refused (Q3); the `local` form uses an absolute path (Q2); an error inside a wiki prints one line (Q5); a tracked local file is refused with `settings_tracked` (Q4); the user file honours `CLAUDE_CONFIG_DIR` (R9).

## Task Breakdown

- [ ] Implement the bounded stdin read, the directory choice and `collectStatusline`, with the line, the empty result and the R5 error line -> R2, R3, R4, R5, R6
- [ ] Implement `--install`: the R8 command, the three-file check, the own-line rule, the format-keeping write, and the git tracked/ignored handling with `info/exclude` -> R8, R9, R10, R11, R12, R13
- [ ] Register `statuslineCommand` at the end of `defaultCommands` in `src/program.ts` on the merged tree -> R1
- [ ] QA-Red writes `test/statusline.red.node.test.ts` (scenarios 1, 3, 4 and 5) and `test/statusline-perf.red.node.test.ts` (scenario 2); the Developer writes the §4.1 unit tests in `test/statusline.test.ts` -> R14
- [ ] Add `test/statusline-perf.red.node.test.ts` to the `test:perf` script in `package.json`, and run `npm run test:perf` with the file run alone -> R7

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | directory choice for each stdin shape, including a relative `current_dir` and a 200 ms timeout on a stream that never ends; the R8 command for `path`, `local` (a root with a space) and `npx` (a `+commit` version stripped); the R10 own-line pattern (matches `wikeeper statusline`, `npx -y wikeeper@0.4.0 statusline`, `"/x/node_modules/.bin/wikeeper" statusline`; rejects `~/.claude/statusline.sh` and `wikeeper status`); the shown path with `~`; the `CLAUDE_CONFIG_DIR` default; appending to an exclude file with and without a final newline |
| Integration tests | 0 | Temp directories and a local `git init` only; no network and no external service. |
| E2E / acceptance tests | 4 | Scenarios 1, 3, 4 and 5 through `runCli` (Outline rows counted once), in QA-Red's `test/statusline.red.node.test.ts`. Scenario 2 is the performance test below. |
| Performance test | 1 | `test/statusline-perf.red.node.test.ts`: p95 of 30 in-process `runCli(["statusline"])` runs (after one warm-up) on the seed-1 500-page fixture is under 300 ms, and the run changes no file. Baseline (scratch, 2026-10-18): reading the fixture's shape takes 15 ms p95, and a char-code estimate 13 ms p95. Node's start-up (150–180 ms) is not part of it. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `npm run test:perf` passes, with the statusline budget and both search budgets.
- [ ] No test reads or writes the real `~/.claude/settings.json`, `$CLAUDE_CONFIG_DIR` or the human's global git config.
- [ ] `test/help.red.node.test.ts` passes: `statusline --help` lists `--json` and `--install`.
- [ ] No new runtime dependency in `package.json`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/agents/enforce/guard-command.ts:35` — `resolveGuardForm`, which picks `path`, `local` or `npx`; `src/agents/enforce/guard-command.ts:63` — `guardCommand`, how the guard hook spells each form.
- **Surface:** `src/agents/enforce/json-merge.ts:53` — `loadJsonDoc` (strict JSON; keeps indent, EOL, BOM and final newline); `src/agents/enforce/json-merge.ts:90` — `saveJsonDoc` with an optional backup; `src/agents/enforce/json-merge.ts:23` — `settingsError` (`settings_invalid`, "nothing was changed").
- **Surface:** `src/core/git.ts:42` — `createGit` with `isTracked` and `ignoreRule`; `src/core/git.ts:23` — `execFileRunner`, the only place wikeeper starts git.
- **Surface:** `src/commands/hook.ts:19` — `readPayload`, the capped stdin reader the guard hook uses for Claude Code's JSON.
- **Surface:** `src/program.ts:38` — `defaultCommands`, where `statuslineCommand` is appended.
- **Surface:** `test/search/search-perf.red.node.test.ts:28` — the in-process p95 pattern; `test/fixtures/search/generate-wiki.ts` — the seed-1 500-page fixture.
- **Coverage of this requirement:** partial. Choosing the command form, writing JSON settings without losing their format, checking git and reading stdin all exist. The status line command and its install rules are new.

## Prior work

- [[EPIC-007]] (parent; its §3 Performance row is R7) and [[SPIKE-003]] (estimator speed); [[EPIC-008]] does not touch the status line. The duplicate check (cleargate-wiki-query, 2026-10-18) found no earlier status line work.
- Builds on [[STORY-002-06]] (the command forms and the format-keeping JSON settings merge), [[STORY-002-05]] (Claude Code's stdin JSON, read by the guard hook), [[STORY-002-08]] (settings backups and git ignore handling), [[STORY-004-02]] (the 500-page perf fixture and the p95 method) and [[STORY-005-05]] (a read-only reporting command).
- Consumes [[STORY-007-01]] (K1, K2). Shares `src/program.ts` with [[STORY-007-02]] and `package.json` with [[STORY-007-07]].

## Why not simpler?

- **Smallest existing surface that could carry this:** `wikeeper status --json` (`src/commands/status.ts`), with the user's own script picking out the figures.
- **Why isn't extension / parameterization / config sufficient?** `status` reads the lock, the registry, every log event, every facts file and `kb_instructions.md`, which is more than a redraw every few seconds should wait for. It also prints many lines, and every user would have to write a script to turn them into one. A separate command reads only `config.yml` and the pages. `--install` adds no new mechanism: it reuses the guard's form choice, the JSON settings writer and the git helper, and its only new rules are the ones the epic asks for (never replace a status line, keep the file personal).

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/commands/statusline.ts` is a planned path in EPIC-007 §4; `src/core/tokens.ts` is created by STORY-007-01 in this sprint, per the decomposition brief.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
- [x] §1.4 Q1–Q5 decided by the human (Gate 1).
