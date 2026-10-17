---
story_id: STORY-003-10
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
ambiguity: 🟡 Medium
context_source: EPIC-003 (approved 2026-10-16; §0 `read` objective, §2 `read` and CR-002 C2 bullets, §3 Network and Dependencies rows, §1 `read` metric) · architecture.md §7.6, §7.7, §10, D-20 · CR-002 C2 · CR-001 · SPRINT-03 decomposition brief (human decisions 2026-10-17, `--out` design call, contracts K7 and K9) · verified src/program.ts, src/commands/ingest-start.ts, src/agents/enforce/claude.ts, src/agents/enforce/codex.ts, src/core/output.ts, src/core/exit-codes.ts, src/core/paths.ts, src/search/engine.ts, templates/system/SETUP.md, ./package.json, test/e2e/pack.ts · linkedom 0.18.13, defuddle 0.19.5, turndown 7.2.4 checked on npm 2026-10-17
actor: AI coding agent
complexity_label: L3
parallel_eligible: y
dep_predecessors:
  - STORY-002-09
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T09:06:15Z
updated_at: 2026-10-17T09:06:15Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:09:16Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
draft_tokens:
  input: 0
  output: 0
  cache_creation: 0
  cache_read: 0
  model: null
  last_stamp: 2026-10-17T09:08:59Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: ""
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-17T08:46:21Z
---

# STORY-003-10: `wikeeper read` — command, URL reading, limits, `ai`-mode allow rule
**Complexity:** L3. This is a new command and the first network access in the CLI, with a timeout, a size cap and an error for each failure. It also adds three runtime dependencies, loaded lazily; a format dispatcher that STORY-003-11 fills; an `--out` writer with safety rules; and the CR-002 C2 allow rule in two enforce writers plus the SETUP.md preview row. Only the allow-rule part waits for STORY-002-09.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent given a link or a document I can't read well myself, I want one command that turns it into clean markdown with its title, author and date, so that I can extract facts from the whole page and pass the text to `wikeeper ingest start --text-file`.

### 1.2 Detailed Requirements
- **R1 — Command.** `wikeeper read [source] [--out <file>] [--json]`, registered in `src/program.ts` as `readCommand` (one import, one `defaultCommands` entry). `source` is a file path or an `http://` / `https://` URL.
  - The argument is optional for commander and checked in the action, so a missing source exits 2 with code `usage` and the envelope's command is `read`. Commander's own usage errors fire before `preAction` and would report `wikeeper` (FLASHCARD 2026-10-17 `#cli #commander`).
  - `-` (stdin) is refused with exit 2 `usage`: `read` takes a file or a URL.
  - `read` does not need an initialised wiki and reads no config, except to protect the wiki's content directory (R8).
- **R2 — Format dispatch** (`src/read/index.ts`, contract K7).
  - **URL or file.** A source matching `^[A-Za-z][A-Za-z0-9+.-]*://` (the same test as `src/commands/ingest-start.ts:130`) is a URL. Only `http:` and `https:` are accepted; any other scheme exits 2 with `usage`.
  - **URL format.** It comes from the response's `Content-Type`:

    | Content-Type | Format |
    |---|---|
    | `text/html`, `application/xhtml+xml` | html |
    | `text/markdown` | markdown |
    | `text/plain` | text |
    | `application/pdf` | pdf |
    | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | docx |

    Any other or missing type falls back to the extension of the final URL's path. If that is unknown too, the read exits 2 with `unsupported`.
  - **File format.** It comes from the extension, case-insensitive:

    | Extension | Format |
    |---|---|
    | `.html`, `.htm` | html, read locally with no network |
    | `.md`, `.markdown` | markdown |
    | `.txt` | text |
    | `.docx` | docx |
    | `.pdf` | pdf |
  - **Unsupported.** `.doc`, `.pptx` and `.xlsx` exit 2 with `unsupported` and a hint (`UNSUPPORTED_HINTS`):
    - `.doc`: "`.doc` (Word 97–2003) is not supported: save it as .docx"
    - `.pptx`: "`.pptx` is not supported: export it to PDF and read the PDF"
    - `.xlsx`: "`.xlsx` is not supported: export the sheet as CSV and read that file yourself"

    Any other extension, or none, exits 2 with `unsupported` and a message naming the supported formats.
  - **Missing file or directory.** A missing file exits 2 with `not_found`; a directory exits 2 with `usage`.
  - **DOCX and PDF branches.** They call `convertDocx(bytes)` and `convertPdf(bytes)`. In this story both throw exit 2 `unsupported` ("reading .docx files is not available yet", "reading .pdf files is not available yet"). STORY-003-11 replaces these two function bodies and nothing else in the dispatcher (K7).
- **R3 — Pass-through** (markdown and text).
  - Bytes are decoded as UTF-8, or as UTF-16 LE/BE when the file starts with that byte-order mark. A UTF-8 BOM is dropped.
  - CRLF and lone CR become LF, and trailing whitespace at the end is removed. The content is otherwise unchanged.
  - `title`, `author` and `date` are `null`, and no header is added.
- **R4 — HTML** (`src/read/html.ts`).
  - **Decoding.** The charset comes from `Content-Type`, else from a `<meta charset>` or `http-equiv` charset in the first 1024 bytes, else UTF-8. An unknown label falls back to UTF-8.
  - **Conversion.** `parseHTML` from `linkedom`, then `Defuddle(document, url, { markdown: true, useAsync: false })` from `defuddle/node`. `url` is the final URL after redirects, or the file's `file://` URL. `useAsync: false` stops defuddle's site extractors from making their own requests (R6).
  - **Body and metadata.** The body is defuddle's `content`. `title` and `author` are defuddle's values, `null` when empty. `date` is defuddle's `published` as `YYYY-MM-DD` when it parses as a date, else `null`.
  - **Inline images.** An image whose source is a `data:` URI becomes `[image: <alt>]` (or `[image]` without alt text), so inline images don't flood the markdown.
  - **Needs a browser.** When the body has fewer than 20 words (`NEEDS_BROWSER_MIN_WORDS`; a word is a run of letters or digits), the result carries the warning `needs_browser` with this message: "the page has almost no main content (N words); it probably needs JavaScript or a login. Open it in your own browser and pass the text to `wikeeper ingest start <url> --text-file <file>`". The exit code stays 0 and the markdown is still returned, because K7 models this as a `ReadWarning` on a successful `ReadResult`.
- **R5 — Header** (`withHeader`, §1.4 Q2, drafted as recommended). For html, and from STORY-003-11 also for docx and pdf, `readSource` puts a header before the body:
  - If the body's first non-empty line is a heading whose text equals the title (trimmed, case-insensitive), that heading stays first. Otherwise `# <title>` comes first, when a title is known.
  - Next comes one line `Author: <author> · Date: <date>`, with only the known parts. It is left out when neither is known.
  - Header lines and the body are separated by blank lines.
  - This keeps the title in the markdown: defuddle removes a first heading that repeats the title.
- **R6 — Fetching** (`src/read/url.ts`).
  - **Request.** One `GET` per read, with `User-Agent: Mozilla/5.0 (compatible; wikeeper; +https://github.com/sandrinio/wikeeper)` and `Accept: text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8`. Redirects are followed (fetch's default).
  - **Timeout.** 20 s for the whole request, from connect to the last byte (`DEFAULT_TIMEOUT_MS`). Exceeding it exits 1 with `timeout`.
  - **Size cap.** 10 MB of decoded body (`DEFAULT_MAX_BYTES`). A `Content-Length` above the cap fails before the body is read. A body that grows past the cap is cancelled. Either way the read exits 1 with `too_large` and `details: { limit_bytes }`. The cap applies to URLs only; local files have no limit (EPIC-003 §3 sets network limits).
  - **Failures.** A non-2xx final status exits 1 with `http_error` and `details: { status, url }`. A DNS, connection, TLS or redirect-loop failure exits 1 with `fetch_failed` and `details: { url, cause }`.
  - **Tests.** `opts.fetch` replaces the global `fetch`. Nothing else in `read`, and none of its libraries, makes a request.
- **R7 — Output.**
  - **Without `--out`.** stdout is the markdown plus one `\n`, and nothing else.
  - **With `--out <file>`.** The file holds the markdown plus `\n`, UTF-8 without BOM, LF only. In human mode stdout is one line, `wrote <file> (<n> bytes, <format>)`, where `<file>` is the path as given.
  - **With `--json`.** The envelope is `{ ok, command: "read", data, warnings }`. `data` is the `ReadResult` plus `out` (the absolute path) when `--out` was given; `warnings` holds the messages of `data.warnings`.
  - **Warnings.** In human mode they go to stderr as `warning: <message>` (`emitResult`, `src/core/output.ts:90`).
  - **Errors.** They go through `emitError` (`src/core/output.ts:110`): the JSON error envelope on stdout, or `error: …` on stderr, and nothing else.
  - **`truncated`.** `ReadWarning.code` keeps K7's union, but no SPRINT-03 path emits `truncated`: a response over the cap fails (R6).
- **R8 — Safe `--out`** (§1.4 Q1, drafted as recommended). `read` runs without a prompt in `ai` mode (R10), so `--out` must not let a prompt-injected page overwrite files or plant agent configuration. `--out` exits 2 with `usage`, and nothing is written, when:
  - the path already exists;
  - its parent directory does not exist;
  - its extension is not `.md` or `.txt`;
  - its file name is `AGENTS.md`, `CLAUDE.md` or `GEMINI.md` (case-insensitive);
  - the path relative to the working directory has a segment that starts with `.`, other than `..`. That covers hidden directories such as `.wiki/`, `.claude/`, `.codex/`, `.agents/`, `.git/` and `~/.ssh/`;
  - the path is inside the wiki's content directory: `content_dir` from `.wiki/config.yml` when the repository has one (`findRepoRoot` and `isInside`, `src/core/paths.ts:26`, `:69`).

  The checks run before the source is read. The file is created with the `wx` flag, so a file that appears in between is not overwritten.
- **R9 — Lazy loading and the network rule.** `linkedom`, `defuddle` and `turndown` load only through `await import()` inside the HTML branch (the pattern at `src/search/engine.ts:175`). `wikeeper --help` and every other command load none of them. The read modules hold the only network code, so `read` remains the only command that uses the network.
- **R10 — `ai`-mode allow rule** (CR-002 C2, CR-001). After STORY-002-09 merges, in `ai` mode only and next to that mode's ingest rules:
  - **Claude:** `permissions.allow` gets `Bash(npx wikeeper read *)` and `Bash(wikeeper read *)`, with identities `permissions.allow[<rule>]`.
  - **Codex:** `.codex/rules/wikeeper.rules` gets `prefix_rule(pattern=["npx","wikeeper","read"], decision="allow")` and `prefix_rule(pattern=["wikeeper","read"], decision="allow")`.
  - **Other modes and agents.** `ask` and `whitelist` get no read rule, so the harness asks before each read there. The search rules and Antigravity (which has no project rule file) are unchanged.
  - **Lifecycle.** `update` adds or removes the rules by identity when the mode changes, and `remove` takes them out like every other tagged entry.
  - **SETUP.md.** The `ai` row of the step-4 preview table in `templates/system/SETUP.md` (line 51) lists the new rules, because `test/templates/setup.red.node.test.ts` S2 (line 243) compares that table with the writers at run time.
- **R11 — Dependencies.** Add `linkedom` `^0.18.13`, `defuddle` `^0.19.5` and `turndown` `^7.2.4` to `dependencies` and update the lockfile (facts in §3.4).
  - `turndown` is a direct dependency because defuddle's markdown conversion `require`s it while defuddle lists it only as optional.
  - STORY-003-11 adds `mammoth`, `@joplin/turndown-plugin-gfm` and `unpdf`.

### 1.3 Out of Scope
- DOCX and PDF conversion (STORY-003-11). OCR, converting `.doc`/`.pptx`/`.xlsx`, a headless browser, cookies or logins (EPIC-003 §2 out of scope).
- Reading stdin; a size limit for local files; proxy settings (Node's `fetch` decides); caching fetched pages.
- Instruction text for `read` in WIKI.md, the skills and the rest of SETUP.md (STORY-006-09). This story edits only the `ai` row of SETUP.md's step-4 preview table.
- Storing anything. `read` never writes under `.wiki/` and never registers a source; `ingest start --text-file` does that.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1):** Where may `--out` write? The decomposition brief's design call says only that `--out <file>` writes the markdown to a file. In `ai` mode `wikeeper read *` runs without a prompt (R10), so a prompt-injected page could make the agent run `wikeeper read <evil-url> --out ~/.zshrc`, or create `.claude/skills/x/SKILL.md` or a missing `CLAUDE.md` with the page's text.
- **Recommended:** Apply the rules in R8:
  - new files only;
  - a `.md` or `.txt` extension;
  - not `AGENTS.md`, `CLAUDE.md` or `GEMINI.md`;
  - no hidden-directory segment;
  - not inside the wiki's content directory.

  This follows CR-001's rule that an auto-allowed command must not be able to damage the user's files. Agents use a fresh name for each read (the instruction text in STORY-006-09 can name the system temp directory). The alternative is to overwrite like `curl -o`, which is simpler but turns the `ai`-mode allow rule into an unprompted write to any path.
- **Human decision:** (pending)

- **Question (Q2):** Should the markdown carry the title, author and date, or should they appear only in `--json`?
- **Recommended:** Add a header (R5): `# <title>` unless the body already starts with that heading, then `Author: … · Date: …` with the known parts. An agent using `--out` gets the file only, and `raw/<id>.md` should keep what the page said about itself; the date matters for dated facts. `--json` still returns the three fields separately, and `markdown` is the same text in all three outputs.
- **Human decision:** (pending)

Already decided; cited, not reopened:
- The dependencies, "only `read` uses the network", the 20 s timeout, the 10 MB cap and "tests never use the internet" (human, 2026-10-17, decomposition brief).
- `--out` exists because PowerShell redirection re-encodes output (orchestrator design call, 2026-10-17).
- The allow rule is added in `ai` mode only (CR-001 Q2, CR-002 C2).
- The type shapes, and "needs a browser" as a warning rather than an error (contract K7).

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** defuddle is at 0.x and changes often (0.19.5 published 2026-10-10). A patch release could change the headings or tables it produces.
- **Mitigation:** `^0.19.5` stays on 0.19.x, the lockfile and `npm ci` pin CI, and the tests assert structure (heading, list and table lines present; nav and footer gone), not byte-exact output.
- **Risk:** In `ai` mode `read` runs without a prompt. It can fetch any URL (a query string can carry data out) and read any supported file outside the project.
- **Mitigation:** This is the scope the human chose for `ai` (CR-001, CR-002 C2). `ask` and `whitelist` keep the prompt, and R8 stops `--out` from being used to write config. The instruction text (STORY-006-09) can tell the agent to read only what the user gave it.
- **Risk:** The install grows more than architecture.md §7.7's "about 8 MB", which counts top-level packages only. This story's three packages and their dependencies come to about 16 MB unpacked: turndown's Node DOM `@mixmark-io/domino` is 7.7 MB and defuddle's optional `temml` is 2.2 MB. All six `read` packages come to about 23 MB (npm, 2026-10-17).
- **Mitigation:** Lazy loading keeps start-up unchanged, and the wikeeper tarball itself does not grow. The dev report records the measured size.
- **Risk:** STORY-002-09 first rewrites the lines this story edits in `claude.ts`, `codex.ts`, SETUP.md's preview row and the enforce red tests.
- **Mitigation:** The allow-rule tasks run after merging the sprint branch with STORY-002-09 into the story branch. The rules are added by identity, and QA-Red re-scopes only the exact-list assertions (FLASHCARD 2026-10-17 `#enforce #qa`).
- **Risk:** The packed-CLI helper links the repository's `node_modules` into the unpacked package (`test/e2e/pack.ts:37`), so e2e tests cannot prove that the libraries install from the tarball.
- **Mitigation:** S3 checks that the packed `package.json` lists them under `dependencies`, and the DoD runs `npm pack --dry-run`.
- **Risk:** On Windows, `node --import C:\…\register.mjs` treats `C:` as a URL scheme, which would break the module trace.
- **Mitigation:** `test/e2e/module-trace.ts` passes `pathToFileURL(file).href`.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.** One row per axis. `T` = at least one scenario below carries the axis tag
(`@paths`, `@interfaces`, `@data`, `@rules`). `F` = no scenario carries it, and the row states
why. There is no Spike row: open discovery is chartered as a SPIKE item (`templates/spike.md`)
before this item is written.

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A URL, a redirected URL and a local file are successful ways to read the same page. |
| Interfaces | T | stdout, `--out`, `--json`; the Claude and Codex settings files expose the allow rule. |
| Data | T | Behaviour differs by content type, extension and encoding (Outline), and by failure kind (error Outline). |
| Rules | T | Lazy loading and one request per read; the timeout and size cap; safe `--out`; the allow rule only in `ai` mode. |

```gherkin
Feature: wikeeper read — command, URL reading and limits

  @paths @data
  Scenario Outline: Each supported input becomes markdown
    Given a local HTTP server on 127.0.0.1 serving test/fixtures/read/ and a working directory without .wiki/
    When I run "wikeeper read <input> --json"
    Then the exit code is 0 and the envelope's command is "read"
    And data.format is "<format>", data.title is <title> and the codes in data.warnings are <warnings>
    And data.markdown <markdown>

    Examples:
      | input                             | format   | title       | warnings          | markdown                                                              |
      | http://127.0.0.1:<port>/article   | html     | "Q4 status" | []                | starts with "# Q4 status"                                             |
      | article.html                      | html     | "Q4 status" | []                | equals data.markdown of the /article row                              |
      | http://127.0.0.1:<port>/moved     | html     | "Q4 status" | []                | equals data.markdown of the /article row (/moved answers 302)         |
      | http://127.0.0.1:<port>/cafe      | html     | "Café"      | []                | contains "Crème brûlée" (windows-1252, charset in Content-Type)       |
      | http://127.0.0.1:<port>/app       | html     | "Acme App"  | ["needs_browser"] | has fewer than 20 words                                               |
      | http://127.0.0.1:<port>/notes.txt | text     | null        | []                | equals notes.txt (served as text/plain)                               |
      | notes-bom.md                      | markdown | null        | []                | equals notes.md without its final newline (notes-bom.md = BOM + notes.md) |
      | notes-crlf.txt                    | text     | null        | []                | has the lines of notes-crlf.txt and no "\r"                           |
      | notes-utf16.txt                   | text     | null        | []                | equals the text of the UTF-16LE file                                  |

  @interfaces
  Scenario: The article keeps its structure on stdout, in --out and in --json
    Given the /article page has the title "Q4 status", the meta author "Ana Kim", article:published_time "2026-10-01T09:00:00Z", a nav menu with "Pricing", an h1 "Q4 status", an h2 "Risks" with the bullet list "Vendor delay" and "Hiring", a table with header cells "Item", "Owner", "Due" and two rows, and a footer with "Privacy"
    When I run "wikeeper read http://127.0.0.1:<port>/article"
    Then stdout begins with the lines "# Q4 status", "", "Author: Ana Kim · Date: 2026-10-01", ""
    And it contains "## Risks", the lines "- Vendor delay" and "- Hiring", and a GFM table whose header row is "| Item | Owner | Due |" followed by a separator row
    And it contains neither "Pricing" nor "Privacy", and stderr is empty
    When I run "wikeeper read http://127.0.0.1:<port>/article --out page.md"
    Then page.md has no BOM and no "\r" and is byte-identical to the first run's stdout
    And stdout is exactly one line "wrote page.md (<n> bytes, html)", where <n> is the size of page.md
    When I run "wikeeper read http://127.0.0.1:<port>/article --out page2.md --json"
    Then data has title "Q4 status", author "Ana Kim", date "2026-10-01", format "html", warnings [], out set to the absolute path of page2.md, and markdown equal to page.md without its final newline
    When I run "wikeeper read http://127.0.0.1:<port>/app"
    Then the exit code is 0 and stderr has a line starting "warning: the page has almost no main content"
    When, in an initialised wiki with ingest.permission "ai", I run "wikeeper ingest start http://127.0.0.1:<port>/article --text-file page.md --json"
    Then the exit code is 0 and data.status is "registered"

  @rules
  Scenario: The read libraries load only when read converts HTML, and only read touches the network
    Given the packed CLI (test/e2e/pack.ts) run under a module-resolution trace (test/e2e/module-trace.ts)
    When I run "wikeeper --help" and then "wikeeper ingest --help"
    Then no resolved module path contains "node_modules/linkedom/", "node_modules/defuddle/" or "node_modules/turndown/"
    When I run "wikeeper read article.html"
    Then the resolved paths include "node_modules/linkedom/" and "node_modules/defuddle/"
    And the packed package.json lists linkedom "^0.18.13", defuddle "^0.19.5" and turndown "^7.2.4" under dependencies
    When readSource reads http://127.0.0.1:<port>/article with the real fetch passed as opts.fetch while globalThis.fetch throws
    Then it returns format "html", and the server logged exactly one request, "GET /article"

  @rules @data
  Scenario Outline: Error — limits, bad sources and unsafe --out targets fail cleanly
    Given <setup>
    When I run "wikeeper read <args> --json" through runCli with createReadCommand(<deps>)
    Then the exit code is <exit>, error.code is "<code>" and the envelope's command is "read"
    And stdout holds only that JSON line, and no file was created or changed

    Examples:
      | setup                                                          | args                                      | deps               | exit | code         |
      | a route /slow that never answers                               | http://127.0.0.1:<port>/slow              | { timeoutMs: 300 } | 1    | timeout      |
      | a route /big that sends Content-Length 2048                    | http://127.0.0.1:<port>/big               | { maxBytes: 1024 } | 1    | too_large    |
      | a route /stream that streams 4096 bytes without Content-Length | http://127.0.0.1:<port>/stream            | { maxBytes: 1024 } | 1    | too_large    |
      | a route /gone that answers 404                                 | http://127.0.0.1:<port>/gone              | defaults           | 1    | http_error   |
      | a port with no listener                                        | http://127.0.0.1:<closed-port>/x          | defaults           | 1    | fetch_failed |
      | a route /logo that answers image/png                           | http://127.0.0.1:<port>/logo              | defaults           | 2    | unsupported  |
      | an empty working directory                                     | ftp://example.com/notes.txt               | defaults           | 2    | usage        |
      | an empty working directory                                     | (no source)                               | defaults           | 2    | usage        |
      | an empty working directory                                     | -                                         | defaults           | 2    | usage        |
      | an empty working directory                                     | missing.pdf                               | defaults           | 2    | not_found    |
      | a directory docs/                                              | docs                                      | defaults           | 2    | usage        |
      | a file data.xyz                                                | data.xyz                                  | defaults           | 2    | unsupported  |
      | a file report.docx (the branch STORY-003-11 fills)             | report.docx                               | defaults           | 2    | unsupported  |
      | a file report.pdf (the branch STORY-003-11 fills)              | report.pdf                                | defaults           | 2    | unsupported  |
      | notes.md and an existing page.md                               | notes.md --out page.md                    | defaults           | 2    | usage        |
      | notes.md and no folder drafts/                                 | notes.md --out drafts/page.md             | defaults           | 2    | usage        |
      | notes.md                                                       | notes.md --out page.json                  | defaults           | 2    | usage        |
      | notes.md                                                       | notes.md --out CLAUDE.md                  | defaults           | 2    | usage        |
      | notes.md and a folder .claude/skills/x/                        | notes.md --out .claude/skills/x/SKILL.md  | defaults           | 2    | usage        |
      | notes.md and a wiki with content_dir "kb" and kb/pages/        | notes.md --out kb/pages/notes.md          | defaults           | 2    | usage        |

  @rules @interfaces
  Scenario Outline: ai mode allows read without a prompt; ask and whitelist do not
    Given an empty git repository with ingest.permission "<mode>" and a wikeeper binary on PATH
    When I run "wikeeper init --agents claude,codex --enforce --json"
    Then the read rules are <installed>: "Bash(npx wikeeper read *)" and "Bash(wikeeper read *)" in .claude/settings.json permissions.allow, and 'prefix_rule(pattern=["npx","wikeeper","read"], decision="allow")' and 'prefix_rule(pattern=["wikeeper","read"], decision="allow")' in .codex/rules/wikeeper.rules
    And the step-4 preview row for "<mode>" in templates/system/SETUP.md matches CLAUDE_ENFORCE and CODEX_ENFORCE
    When I set ingest.permission to "<next>" and run "wikeeper update --json"
    Then the read rules are <after_update> in both files
    And after "wikeeper remove --json" neither file contains a read rule

    Examples:
      | mode      | installed | next | after_update |
      | ai        | present   | ask  | absent       |
      | ask       | absent    | ai   | present      |
      | whitelist | absent    | ai   | present      |
```

### 2.2 Verification Steps (Manual)
- [ ] Read a long real article with `wikeeper read <url> --out <tmp>/article.md` and compare it with the page in a browser: the main text is complete, nav and ads are gone, and headings, lists and tables are kept.
- [ ] Read the login page of any JavaScript-only web app and check the "needs a browser" warning.
- [ ] In Claude Code with enforce on: in `ai` mode, ask the agent to read a link and confirm no permission prompt appears; in `ask` mode, confirm the harness asks.
- [ ] On Windows PowerShell, run `wikeeper read <url> --out page.md` and check that page.md is UTF-8, not UTF-16.
- [ ] Record in the dev report the size the new packages add to `node_modules` (`du -sh` of each).

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/commands/read.ts` |
| Related Files | `src/read/index.ts`, `src/read/url.ts`, `src/read/html.ts` |
| Modified Files | `src/program.ts`, `src/agents/enforce/claude.ts`, `src/agents/enforce/codex.ts`, `templates/system/SETUP.md` (the step-4 `ai` row only, after STORY-002-09), `./package.json`, `./package-lock.json` |
| Test Files | `test/read/read-command.test.ts`, `test/read/url.test.ts`, `test/read/html.test.ts`, `test/read/http-server.ts`, `test/e2e/read.test.ts`, `test/e2e/module-trace.ts`, `test/agents/enforce.test.ts` |
| Fixtures | `test/fixtures/read/article.html`, `test/fixtures/read/app-shell.html`, `test/fixtures/read/notes.md`, `test/fixtures/read/SOURCES.md` |
| Re-scoped red tests (QA-Red) | `test/agents/enforce-ai-rules.red.node.test.ts` (lines 127, 139, 181, 184, 234, 235), `test/agents/enforce.red.node.test.ts` (lines 260, 520–526, 544–548), `test/templates/setup.red.node.test.ts` (line 353). These are the exact `ai` rule lists, at `16ec56f`; STORY-002-09 edits the same lines first, so QA-Red re-scopes them on the merged tree. |
| New Files Needed | Yes — `src/commands/read.ts`, `src/read/index.ts`, `src/read/url.ts`, `src/read/html.ts`, every test file above except `test/agents/enforce.test.ts`, and the four fixtures |

### 3.2 Technical Logic
- **Command.** Use the factory pattern of `src/commands/search.ts:266`: `createReadCommand(deps?: ReadDeps)` returns a `CommandModule`, and `readCommand` is the default instance. The action does the following, in order:
  1. Validate the source (R1).
  2. If `--out` is given, validate it (R8) before any read or fetch.
  3. `readSource(source, { cwd: ctx.cwd, ...deps })`.
  4. Write `--out` with `writeFile(abs, text, { flag: "wx" })`.
  5. `emitResult`.

  Errors are `WikeeperError`s with `ExitCode.USAGE` or `ExitCode.ERROR` and the codes in §3.3.
- **`readSource`.**
  1. Classify the source as a URL or a file.
  2. A URL goes to `fetchSource`, and its format comes from the content type, else the URL extension. A file is `stat`ed (missing → `not_found`, directory → `usage`), its format comes from the extension, and its bytes are read.
  3. Branch on the format: `passThrough(bytes)`, `readHtml(bytes, …)`, `convertDocx(bytes)` or `convertPdf(bytes)`.
  4. Every branch except pass-through returns a `Converted`, and `readSource` assembles the `ReadResult` with `withHeader`.

  Line endings are normalised to LF in one place, after the branch.
- **`fetchSource`.**
  - `const signal = AbortSignal.timeout(timeoutMs)` is passed to `fetch`, and the same signal covers reading the body. A rejection whose `name` is `"TimeoutError"` becomes `timeout`.
  - Check `content-length` against `maxBytes` first.
  - Then read `response.body` with a reader, counting bytes. Past `maxBytes`, call `reader.cancel()` and throw `too_large`. The cap is enforced by cancelling, not by aborting the signal, so the two errors stay distinct.
  - `!response.ok` becomes `http_error`. Any other `TypeError` from `fetch` becomes `fetch_failed`, with `cause` set to `err.cause?.code ?? err.message`.
- **`readHtml`.**
  1. Decode the bytes (R4).
  2. `const { parseHTML } = await import("linkedom")`, then `const { Defuddle } = await import("defuddle/node")`. defuddle's `./node` export is CommonJS with the named export `Defuddle`, which Node's ESM import resolves.
  3. `parseHTML(html).document`, then `await Defuddle(document, url, { markdown: true, useAsync: false })`.
  4. Map the fields, replace `data:` image links, count words for `needs_browser`.

  Do not pass the HTML string to `Defuddle`: string input is deprecated in 0.19.
- **`--out` checks.** Resolve against `ctx.cwd`. For the content-directory check, run `findRepoRoot(ctx.cwd)`, then `loadConfig(root)` (on a config error, fall back to the default `content_dir`), then `resolvePaths`. The hidden-segment check runs on `path.relative(ctx.cwd, abs).split(path.sep)`; on Windows across drives that is the absolute path, which is checked the same way.
- **Allow rule.** `CLAUDE_ENFORCE.items` pushes the read pair inside the `ai` branch, after the ingest rules. In `codex.ts`, a `READ_LINES` constant is appended after the `ai` lines, so the lines are the `ai` lines, then the read lines, then `SEARCH_LINES`. Identities follow the existing pattern (`src/agents/enforce/claude.ts:32`, `src/agents/enforce/codex.ts:38`), so `update`'s identity diff and `remove` work unchanged.
- **Test server** (`test/read/http-server.ts`). `startFixtureServer(): Promise<{ url(path): string; requests: string[]; close() }>` uses `node:http` on `127.0.0.1` with port 0. It serves these routes:

  | Route | Response |
  |---|---|
  | `/article` | `article.html` |
  | `/moved` | 302 to `/article` |
  | `/cafe` | windows-1252 bytes built in the test, with `charset=windows-1252` |
  | `/app` | `app-shell.html` |
  | `/notes.txt` | `text/plain` |
  | `/slow` | never answers |
  | `/big` | `Content-Length` larger than the cap |
  | `/stream` | chunked |
  | `/gone` | 404 |
  | `/logo` | `image/png` |

  Every request is logged as `METHOD /path`. STORY-003-11 adds routes for PDF and DOCX.
- **Fixtures.** `article.html`, `app-shell.html` and `notes.md` are UTF-8 with LF and committed. The encoded variants are written by the tests into temp directories, because `.gitattributes` (`* text=auto eol=lf`) would normalise a committed CRLF file and may treat a UTF-16 file as binary:
  - `notes-bom.md` (a UTF-8 BOM followed by `notes.md`);
  - `notes-crlf.txt`;
  - `notes-utf16.txt` (UTF-16LE with BOM);
  - the windows-1252 page.

  `SOURCES.md` states that every fixture was written for wikeeper and holds no third-party content, in the format of `test/fixtures/hooks/SOURCES.md`.
- **Module trace** (`test/e2e/module-trace.ts`).
  - `traceCli(cli, args, cwd)` writes `register.mjs`, which calls `register("./hooks.mjs", import.meta.url, { data: { out } })` from `node:module`.
  - It also writes `hooks.mjs`, whose `resolve(specifier, context, next)` appends each resolved `url` to `out`.
  - It then spawns `process.execPath --import <pathToFileURL(register.mjs)> <cli> …args` and returns `{ code, stdout, stderr, resolved: string[] }`.
  - `module.register` is available on Node 22.12.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper read [source]` | CLI | None | `source` (file path or `http(s)` URL), `--out <file>`, `--json` | envelope `{ ok, command: "read", data: ReadCommandData, warnings }`. Errors exit 2 with `usage`, `not_found` or `unsupported`, or exit 1 with `timeout`, `too_large`, `http_error` or `fetch_failed`. |

Frozen exports of `src/read/index.ts` (contract K7; consumers: STORY-003-11 replaces the bodies of `convertDocx` and `convertPdf`, and STORY-006-09 documents the command):

```ts
export type ReadFormat = "html" | "docx" | "pdf" | "markdown" | "text";
export interface ReadWarning { code: "likely_scanned" | "needs_browser" | "truncated" | "unsupported"; message: string }
export interface ReadResult { markdown: string; title: string | null; author: string | null; date: string | null; format: ReadFormat; warnings: ReadWarning[] }
export interface ReadOptions { cwd: string; timeoutMs?: number; maxBytes?: number; fetch?: typeof fetch }
/** What a converter branch returns; readSource adds the header (R5). */
export interface Converted { body: string; title: string | null; author: string | null; date: string | null; warnings: ReadWarning[] }
export const DEFAULT_TIMEOUT_MS: 20_000;
export const DEFAULT_MAX_BYTES: number; // 10 * 1024 * 1024
export const UNSUPPORTED_HINTS: Readonly<Record<".doc" | ".pptx" | ".xlsx", string>>;
export function readSource(input: string, opts: ReadOptions): Promise<ReadResult>;
export function withHeader(converted: Converted): string;
export function formatFromExtension(ext: string): ReadFormat | null;
export function formatFromContentType(contentType: string | null): ReadFormat | null;
export function convertDocx(bytes: Uint8Array): Promise<Converted>; // stub: throws unsupported; STORY-003-11 replaces the body
export function convertPdf(bytes: Uint8Array): Promise<Converted>;  // stub: throws unsupported; STORY-003-11 replaces the body
```

`src/read/url.ts`:

```ts
export const USER_AGENT: string;
export interface FetchedSource { bytes: Uint8Array; contentType: string | null; finalUrl: string }
export function fetchSource(url: URL, opts: { timeoutMs: number; maxBytes: number; fetch: typeof fetch }): Promise<FetchedSource>;
```

`src/read/html.ts`:

```ts
export const NEEDS_BROWSER_MIN_WORDS: 20;
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string;
export function readHtml(bytes: Uint8Array, opts: { url: string; contentType: string | null }): Promise<Converted>;
export function countWords(markdown: string): number;
```

`src/commands/read.ts`:

```ts
import type { CommandModule } from "../program.js";
import type { ReadResult } from "../read/index.js";
export interface ReadDeps { timeoutMs?: number; maxBytes?: number; fetch?: typeof fetch }
/** --json data: the ReadResult, plus `out` when --out was given (additive optional field, owned here). */
export interface ReadCommandData extends ReadResult { out?: string }
export function createReadCommand(deps?: ReadDeps): CommandModule;
export const readCommand: CommandModule;
```

Additions to K7, called out as the owner story allows: `Converted`, `withHeader`, `UNSUPPORTED_HINTS`, the two format helpers, and `ReadCommandData.out`. Nothing in K7 is renamed or retyped.

### 3.4 Dependency check (npm, 2026-10-17)

| Package | Version | License | Unpacked | Dependencies | Module format, Node 22 ESM | DOM / native |
|---|---|---|---|---|---|---|
| `linkedom` | 0.18.13 | ISC | 0.91 MB | css-select, cssom, html-escaper, htmlparser2, uhyphen | `"type": "module"`, `exports.import` → `./esm/index.js`; engines node >= 16 | is the DOM; no native code |
| `defuddle` | 0.19.5 | MIT | 2.76 MB | commander ^12 (its own CLI; nested copy), mathml-to-latex; optional: linkedom, turndown, temml | no `type`; `exports["./node"]` has only an `import` condition → `dist/node.js`, CommonJS with named export `Defuddle`, loads from ESM | needs a DOM `Document` (linkedom); no native code; `useAsync` must be `false` to stop its own fetches |
| `turndown` | 7.2.4 | MIT | 0.19 MB | @mixmark-io/domino (7.7 MB, its Node DOM parser) | CommonJS `main`, no `exports` (Node ignores `module`), default export `TurndownService`; engines node >= 18 | no native code; no bundled types (STORY-003-11 handles them) |

All transitive licenses are permissive (MIT, ISC, BSD-2-Clause, `MIT OR GPL-3.0-or-later` for jszip in STORY-003-11). None of the packages needs a native build or a postinstall step.

## Task Breakdown

- [ ] Add `linkedom` `^0.18.13`, `defuddle` `^0.19.5` and `turndown` `^7.2.4` to `dependencies` and update the lockfile -> R11
- [ ] Write `test/read/http-server.ts`, the committed fixtures and `SOURCES.md` -> R2, R4
- [ ] Implement `src/read/url.ts`: request headers, timeout, Content-Length and streamed cap, error mapping -> R6
- [ ] Implement `src/read/html.ts`: decoding, lazy linkedom and defuddle, metadata, `data:` images, `needs_browser` -> R4, R9
- [ ] Implement `src/read/index.ts`: classify the source, the dispatch tables, `UNSUPPORTED_HINTS`, pass-through, the DOCX/PDF stubs, `withHeader` -> R2, R3, R5
- [ ] Implement `src/commands/read.ts`: argument and `--out` checks, the `wx` write, the three output modes; register it in `src/program.ts` -> R1, R7, R8
- [ ] Write `test/read/*.test.ts` for the Outline in S1, S2 and the error Outline S4, plus the unit tests in §4.1
- [ ] Write `test/e2e/module-trace.ts` and `test/e2e/read.test.ts` (S3) -> R9, R11
- [ ] Merge the sprint branch with STORY-002-09 into the story branch; add the read pair to the `ai` branch in `claude.ts` and `codex.ts`; extend `test/agents/enforce.test.ts` -> R10
- [ ] Add the read rules to the `ai` row of SETUP.md's step-4 preview table; `test/templates/setup.red.node.test.ts` S2 passes on the merged tree -> R10
- [ ] Write the S5 Outline test (init, update across modes, remove)

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 10 | `withHeader` (title already the first heading; title not present; author or date only; nothing known); `decodeHtml` (header charset, meta charset, unknown label); `countWords`; `data:` image replacement; `formatFromContentType` with parameters and case; `formatFromExtension`; each `--out` refusal reason; `DEFAULT_TIMEOUT_MS === 20_000` and `DEFAULT_MAX_BYTES === 10 * 1024 * 1024` and the command's default instance uses them. |
| Integration tests | 0 | A local `node:http` server on 127.0.0.1 and temp directories only; no test opens a connection anywhere else. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). S3 runs the packed CLI; the others run in-process through `runCli`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Exports match §3.3 exactly (names and types).
- [ ] `wikeeper --help` lists `read`, and its help shows `--json` (`test/help.red.node.test.ts` S1).
- [ ] `npm pack --dry-run` shows no files beyond `dist/` and `templates/`; `package.json` and the lockfile agree on the three dependencies.
- [ ] No test reaches a host other than 127.0.0.1.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts:33` — `defaultCommands`, where `readCommand` is added.
- **Surface:** `src/commands/ingest-start.ts:92` — `--text-file`, which receives `read`'s output; `src/commands/ingest-start.ts:140` — URL sources need agent text today ("wikeeper does not fetch URLs"); `src/commands/ingest-start.ts:130` — the URL test reused by R2.
- **Surface:** `src/core/output.ts:90` — `emitResult` (envelope, stderr warnings); `src/core/output.ts:110` — `emitError`.
- **Surface:** `src/core/exit-codes.ts:1` — `ExitCode.ERROR` (1) and `USAGE` (2) used for every read failure.
- **Surface:** `src/agents/enforce/claude.ts:30` — the `ai` branch of `CLAUDE_ENFORCE.items`; `src/agents/enforce/codex.ts:3` — `AI_LINES`, combined at `src/agents/enforce/codex.ts:36`.
- **Surface:** `src/search/engine.ts:175` — the dynamic-import pattern for a runtime dependency.
- **Surface:** `src/core/paths.ts:26` — `findRepoRoot`; `src/core/paths.ts:69` — `isInside`, used by the `--out` content-directory check.
- **Surface:** `src/commands/search.ts:266` — the command-factory pattern with injected deps.
- **Surface:** `templates/system/SETUP.md:51` — the `ai` row of the step-4 preview table.
- **Surface:** `test/e2e/pack.ts:13` — `packCli`, used by S3.
- **Coverage of this requirement:** partial — registration, output, exit codes, enforce plumbing and the packed-CLI helper exist; fetching, conversion and the command are net-new.

## Prior work

- [[EPIC-003]] (parent; `read` scope, the Network row, the `read` metric). [[CR-002]] (C2: this story adds the `ai`-mode allow rule). [[CR-001]] (`ai` allows only ingest commands; `read` and `search` add their own rules). [[STORY-003-04]] (`ingest start --text-file`, which deferred URL fetching to `read`). [[STORY-004-02]] (the search allow rule and the dynamic-import pattern this story follows). [[SPRINT-03]] (sprint plan). The `cleargate-wiki-query` duplicate check (2026-10-17) found no shipped or planned implementation of `read` other than this story and STORY-003-11.

## Why not simpler?

- **Smallest existing surface that could carry this:** `wikeeper ingest start <url> --text-file <file>` (`src/commands/ingest-start.ts:92`), where the agent fetches and converts the source itself.
- **Why isn't extension / parameterization / config sufficient?** That path depends on the agent's own tools. Claude Code's WebFetch passes pages through a smaller model and returns a summary, not the page (architecture.md §7.7), and most agents can't open DOCX at all. The CLI therefore has to fetch and convert by itself, with limits it controls. defuddle is the smallest library that gives the main content, metadata and markdown in one call. It needs a DOM, and linkedom is the lightest one it accepts. The command stays a separate helper, not part of `ingest`, because conversion is not part of ingest (D-20).

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (EPIC-003 §4 names `src/commands/read.ts` and `src/read/url.ts`; `src/read/index.ts` follows contract K7; `src/read/html.ts` and the test files are new and listed as new.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Open: §1.4 Q1 (`--out` safety) and Q2 (metadata header) await the human. The draft follows the recommended answers.
