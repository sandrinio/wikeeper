# SPRINT-03 — Decomposition brief

> **Superseded in parts (2026-10-17).** The drafting agents and the consistency audit corrected several contracts and the shared-file list; see `consistency-audit.md` and `gate1-decisions.md`. The 20 story files are the source of truth; this brief records the starting point.
> STORY-005-05's read-only allow rules for `lint`, `status` and `rules list` were split into STORY-005-09 (gate1-decisions split 4, 2026-10-17).

Written by the orchestrator at SPRINT-03 planning (2026-10-17), before story drafting. It fixes the story set, the scope of each story, the files each one owns and the cross-story contracts, so the stories can be drafted in parallel and the Sprint Design Review can form contracts from them. Story files are the source of truth once drafted; this brief is their common input.

## Human decisions (2026-10-17)

- **Scope:** EPIC-005 in full, `read` (EPIC-003, with CR-002 C2), CR-002 C1's `lint --rules` half and D1, and CR-003 A–F, all in SPRINT-03.
- **`read` dependencies** approved: `linkedom`, `defuddle`, `mammoth`, `turndown` (+ a GFM tables plugin), `unpdf`; each loaded only when its format is read. `read` is the only command that uses the network (20 s timeout, 10 MB cap). Tests never use the internet: a local HTTP server and fixture files.
- **Version:** `package.json` moves to `0.3.0`. Publishing is a separate human step after Gate 4.
- **CR-003** approved with its five recommended answers: `search --no-miss`; `finish` refuses dropped fact lines; `ai` mode prompts for `abort --drop` and `apply --force-unlock`; `search --mark decided|tentative`; `--version` prints `<version>+<commit>`.
- **Walkthrough part 3** (Goal check): headless in `~/walkthrough-wiki`, any PDF on the machine for `read`, sources from the `~/product_repo` ClearGate wiki. The human uses wikeeper for product management, so the walkthrough asks such questions.

Orchestrator design calls (told to the human 2026-10-17; each story Brief restates its own):
- `unlogged-change` compares page hashes recorded by `finish`, not file times (a fresh clone resets every mtime). Pages whose newest log event has no hash (pre-SPRINT-03 ingests) are the baseline: no finding until an ingest records a hash for them.
- The `kb_instructions.md` parser accepts the format real files already use (see contract K1) and adds two markers: `note:` lines and a trailing `(dated facts)` on a question.
- `read <file|url> --out <file>` writes the markdown to a file; without `--out` it prints to stdout. Instruction text uses `--out` (PowerShell redirection re-encodes output).

## Commands that exist at the end of SPRINT-03

SPRINT-02's set (`init`, `update`, `remove`, `doctor`, `setup`, `hook guard`, `ingest start | plan | facts | apply | finish | abort`, `index rebuild`, `search`) plus `read`, `lint` (with `--rules`), `status`, `rules record | list`. Instruction text names only these. New flags: `search --no-miss`, `search --mark`, `ingest facts --dry-run`, `lint --rules`, `lint --check <id>`, `read --out`.

## Story set (16)

| Story | Title | Source | Upstream (in-sprint) |
|---|---|---|---|
| STORY-005-01 | `kb_instructions.md` parser and line format | EPIC-005, CR-003 D1–D3 | — |
| STORY-005-02 | `wikeeper lint`: check registry, `broken-link`, `orphan-page`, `uncited-claim`, `index-drift` | EPIC-005 | — |
| STORY-005-03 | `unlogged-change`, `stale-fact`, page hashes in the ingest log, lint hook in `finish` | EPIC-005, CR-002 D1 | 005-02, 003-12 (both edit finish's validate step and report) |
| STORY-005-04 | `wikeeper lint --rules`; `doctor` warns when the file does not parse | EPIC-005, CR-002 C1, CR-003 D4 | 005-01, 005-02, 002-09 (doctor files) |
| STORY-005-05 | `wikeeper status`, with pending rule suggestions | EPIC-005, CR-003 D5 | 005-01, 005-06 |
| STORY-005-06 | `wikeeper rules record` / `rules list` | EPIC-005 | — |
| STORY-005-07 | `ingest facts --dry-run` | EPIC-005 | 003-12 (`ingest-facts.ts` help text) |
| STORY-003-10 | `wikeeper read`: command, URL reading, limits, `ai`-mode allow rule | EPIC-003, CR-002 C2 | 002-09 (enforce rule files) |
| STORY-003-11 | `read` for DOCX and PDF ("likely scanned") | EPIC-003 | 003-10 |
| STORY-003-12 | Ingest follow-ups: dropped fact lines refused, `needs_approval` output, help text | CR-003 B1–B3 | — |
| STORY-004-07 | Search follow-ups: `--no-miss`, `--mark`, misses count, filter-only miss text, limit note | CR-003 A1–A5 | — |
| STORY-002-09 | `ai`-mode prompts for `--drop` and `--force-unlock`, and `update` with `enforce: false` removes the rules | CR-003 C1, F3, F4 | — |
| STORY-001-10 | `--version` build stamp, version `0.3.0`, `--help` footer | CR-003 F1, F2 | — |
| STORY-006-09 | Instructions for `read`, `lint`, `status` and `rules` | EPIC-006 | command surfaces of 003-10, 005-02…07 (frozen as contracts) |
| STORY-006-10 | CR-003 instruction items, kb line format in SETUP.md and the profile | CR-003 C2, C3, D1–D3 text, E1–E10, A1 text | 005-01 (K1 format), 004-07 (flag names) |
| STORY-006-11 | Structural template tests for the SPRINT-03 commands | EPIC-006 | every other story |

Granularity: `read` splits by format family (HTML/network vs document libraries). Lint splits by data source: 005-02 needs only pages and the index; 005-03 needs the log and `finish`. EPIC-006 text splits by origin (new commands vs CR-003 items) and runs 006-10 before 006-09, because both edit WIKI.md.

## Cross-story contracts

The owner story freezes the names and types; consumers never rename them. Additive optional fields are allowed and must be called out in the owner story.

**K1. kb parser (owner 005-01, `src/kb/parse-instructions.ts`).**
`parseInstructions(text: string): KbInstructions` and `loadInstructions(paths: ResolvedPaths): Promise<{ text: string; kb: KbInstructions } | null>` (`null` when `paths.kbInstructions` is missing).
`KbInstructions = { purpose: string | null; sections: KbSection[]; questions: KbQuestion[]; entities: KbEntity[]; kinds: SourceKindRule[]; notes: KbNote[]; neverCapture: string[]; changelog: KbChangelogEntry[]; issues: KbIssue[] }`.
- `KbQuestion { id: string /* "Q4" */; text: string; datedFacts: boolean; line: number }`: a line `Q<n>` then optional `.` or `:` then the text, under `## Questions…`; a trailing ` (dated facts)` sets `datedFacts` and is stripped from `text`.
- `KbEntity { name: string; fields: string[]; page: string; questionRefs: string[]; line: number }`: a line `<entity> <comma-separated fields> → <page> <Q refs>` under `## Entities` (`->` accepted as the arrow).
- `kinds`: exactly `parseSourceKinds(text)` from `src/ingest/kind-rules.ts` (contract C2, frozen in SPRINT-02, unchanged).
- `KbNote { section: string; text: string; line: number }`: a line starting `note:` in any section, plus any other non-empty prose line in `## Questions…`, `## Entities` or `## Source kinds` that is not a question, entity or kind line (back-compatibility: existing files carry such prose).
- `KbChangelogEntry { date: string /* YYYY-MM-DD */; text: string; line: number }`: `- YYYY-MM-DD: text` under `## Rule changelog`.
- `KbIssue { line: number; code: string; message: string }`: parse problems the parser itself can see (`unknown-question-ref`, `malformed-question`, `malformed-entity`, `ambiguous-line` for a prose line containing an arrow, `missing-section`). `lint --rules` turns issues into findings.
Lines inside fenced code blocks and HTML comments are ignored, as C2 already does.

**K2. Lint registry and command (owner 005-02, `src/lint/checks.ts`, `src/commands/lint.ts`).**
`interface LintCheck { id: string; severity: "error" | "warning" | "info"; scope: "pages" | "rules"; run(ctx: LintContext): Promise<LintFinding[]> }`.
`interface LintContext { paths: ResolvedPaths; config: WikeeperConfig; pages: Page[]; kb: KbInstructions | null; log: StoredLogEvent[]; now: Date; only?: string[] /* page paths relative to pages/ */ }`.
`PAGE_CHECKS: LintCheck[]` and `RULE_CHECKS: LintCheck[]`; each later story appends its checks with one import and one array entry. `runLint(ctx, { scope, checks?: string[] }): Promise<LintFinding[]>`, sorted by path, line, id.
`LintFinding` is SPRINT-02's frozen C9 type from `src/ingest/lint-hook.ts`, with one additive optional field `line?: number` (owned here).
`wikeeper lint [--rules] [--check <id>…] [--json]`: `--rules` runs `RULE_CHECKS` instead of `PAGE_CHECKS`. JSON `{ scope, findings, counts: { error, warning, info } }`. Exit 1 when any finding has severity `error`, else 0. Read-only: lint never writes (EPIC-005 safety rule).
Until 005-01 merges, 005-02 builds against K1's frozen types (stubbed module).

**K3. Ingest log page hashes (owner 005-03, `src/ingest/log.ts`, `src/commands/ingest-finish.ts`).**
`IngestLogEvent` gains `page_hashes?: Record<string, string>`: sha256 of each created or updated page after `finish`, keyed by path relative to `pages/`. `unlogged-change` compares each page's current hash with the hash recorded by the newest ingest event that touched it; a page in no event is reported; a page whose newest event has no `page_hashes` is skipped (baseline).
005-03 also registers the real lint hook (`setLintHook`) so `finish` reports page-check findings for the changed pages; findings never change `finish`'s exit code (STORY-003-09 R8).

**K4. Rule decisions (owner 005-06, `src/kb/rule-decisions.ts`, `src/commands/rules.ts`).**
`fingerprint(kind: string, summary: string): string`: first 12 hex chars of sha256 of `normalizeKindId(kind) + "\n" + summary` with whitespace collapsed and lower-cased.
`recordDecision(paths, { kind, summary, decision: "accepted" | "rejected", sourceId?: string, at: string }): Promise<{ file: string; fingerprint: string; previouslyRejected: boolean }>` writes a `rule-proposal` log event `{ type, at, kind, summary, fingerprint, decision, source_id? }`.
`listDecisions(paths): Promise<RuleDecision[]>`, `RuleDecision { kind; summary; fingerprint; decision; at; source_id: string | null; previously_rejected: boolean }` (`previously_rejected` is true when an earlier event with the same fingerprint was `rejected`).
`wikeeper rules record (--accepted | --rejected) --kind <k> --summary <text> [--from <source-id>] [--json]`, `wikeeper rules list [--json]`.
The miss and rule-proposal summary lines in `log.ts` (`summaryLine`) are edited by 004-07 (miss) and 005-06 (rule-proposal); 004-07 lands first.

**K5. Status (owner 005-05, `src/commands/status.ts`).**
`wikeeper status [--json]`. JSON: `{ open_ingest: LockInfo | null, stale_lock: boolean, unfinished_sources: string[] /* registered, no ingest or abort event */, reingest_candidates: Array<{ source_id, kind, rule_version, current_version }>, pending_rule_suggestions: Array<{ source_id, items: string[] }>, setup: { completed_at: string | null, me: boolean, project: boolean }, misses: number }`.
Pending rule suggestions = a finished ingest whose `raw/<id>.facts.json` has a non-empty `uncovered`, and no `rule-proposal` event with that `source_id` (K4 `--from`). Re-ingest candidates compare the ingest event's `rule_version` with the current kind rule version from K1.

**K6. Facts dry run (owner 005-07, `src/ingest/facts.ts`, `src/commands/ingest-facts.ts`).**
`diffFacts(stored: FactsFile, next: FactsFile): { added: Fact[]; removed: Fact[]; changed: Array<{ before: Fact; after: Fact }> }`, facts keyed by `entity` + `field` + `anchor`. `ingest facts <id> --dry-run` validates, prints the diff, stores nothing, exits 0 (validation errors keep their existing exit code).

**K7. `read` (owner 003-10; 003-11 adds formats).**
`src/commands/read.ts` registers `read <file|url>` in `src/program.ts` (`defaultCommands`). `src/read/index.ts`: `readSource(input: string, opts: { cwd: string; timeoutMs?: number; maxBytes?: number; fetch?: typeof fetch }): Promise<ReadResult>`, `ReadResult { markdown: string; title: string | null; author: string | null; date: string | null; format: "html" | "docx" | "pdf" | "markdown" | "text"; warnings: ReadWarning[] }`, `ReadWarning { code: "likely_scanned" | "needs_browser" | "truncated" | "unsupported"; message: string }`. Format dispatch by URL scheme or file extension; `.doc`, `.pptx`, `.xlsx` → `unsupported` (usage exit). 003-10 owns `src/read/url.ts` and the dispatcher with DOCX/PDF stubs that report `unsupported`; 003-11 owns `src/read/docx.ts` and `src/read/pdf.ts` and replaces the stub branches only.
`read --out <file>` writes the markdown (UTF-8, LF); `--json` prints `ReadResult`. Libraries load through dynamic `import()` inside the format branch.
The `ai`-mode allow rule for `wikeeper read *` / `npx wikeeper read *` is added in `src/agents/enforce/claude.ts` and `codex.ts` after 002-09 merges (same arrays).

**K8. Search flags (owner 004-07).** `--no-miss` (a boolean; the story checks how commander parses and renders a `--no-` option so help shows `--no-miss` and the default stays "record"), `--mark <decided|tentative>` (filters fact lines; combinable with `--type`, `--entity`, `--since`), misses header "N misses, M distinct queries", JSON `misses` mode gains `events: number`, human output adds "showing L of T …; use --limit" when cut. Miss log summary for a filter-only miss names the filters.

**K9. Enforce rules (owner 002-09, `src/agents/enforce/claude.ts`, `codex.ts`).** `ai` mode allows the routine ingest verbs and prompts for `ingest abort … --drop` and `ingest apply … --force-unlock`; the story verifies Claude Code's rule-matching for a flag inside the command and falls back to prompting for every `abort`. `update` replaces old wikeeper rules in existing settings (the SPRINT-01 settings-merge identity rules apply).

**K10. Build stamp (owner 001-10).** The build writes the commit into the package (e.g. `dist/build-info.json`); `VERSION` in `src/program.ts` becomes `<package version>+<short sha>`, `+dev` when unknown; the install manifest's `package_version` records the same string. `package.json` version `0.3.0`. The packed-CLI e2e helper (`test/e2e/pack.ts`) must keep working.

**K11. Dropped fact lines (owner 003-12, `src/ingest/validate.ts`).** `IngestValidation` gains `dropped: Array<{ path: string; line: string }>`: fact lines present in a page's snapshot and missing from the page after the write. Any entry → `validation_failed`, lock kept, nothing logged (same path as SPRINT-02's frontmatter refusal).

## Shared files (for the SDR)

- `src/agents/enforce/claude.ts`, `codex.ts`: 002-09, then 003-10.
- `src/commands/doctor.ts`, `src/agents/doctor-checks.ts`, `src/core/setup-files.ts`: 002-09, then 005-04.
- `src/ingest/log.ts`: 004-07 (miss summary), 005-03 (`page_hashes`), 005-06 (rule-proposal summary).
- `src/commands/ingest-finish.ts`, `src/ingest/validate.ts`: 003-12, then 005-03.
- `src/commands/ingest-facts.ts`: 003-12 (help text), then 005-07.
- `src/program.ts`: 001-10 (version, footer), 003-10 (`read`), 005-02 (`lint`), 005-05 (`status`), 005-06 (`rules`) — one registration line each.
- `templates/system/WIKI.md`, `SETUP.md`, skills, sub-agent prompts: 006-10, then 006-09; 006-11 last.
- `test/templates/wiki-protocol.red.node.test.ts`: its `COMMANDS` set and S5 (`wikeeper lint` fails the vocabulary check) are SPRINT-02 red tests that SPRINT-03 makes obsolete; 006-11 re-scopes them with the human's authorisation recorded in that story.
