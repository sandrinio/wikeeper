---
story_id: STORY-005-02
parent_epic_ref: EPIC-005
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
ambiguity: 🟢 Low
context_source: EPIC-005 (approved 2026-10-16) §0 rules, §2, §3, §5 · architecture.md §8 (citations, frontmatter-built index), §10, D-28 · SPRINT-03 decomposition brief (K1 types, K2 owner) · CR-003 E2 · verified src/wiki/parse-page.ts, src/search/aliases.ts, src/ingest/index-builder.ts, src/ingest/lint-hook.ts, src/ingest/log.ts, src/commands/doctor.ts, src/core/output.ts, src/program.ts · probed read-only against ~/walkthrough-wiki/.wiki (20 pages, 242 fact lines) on 2026-10-17
actor: AI coding agent
complexity_label: L3
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T09:05:32Z
updated_at: 2026-10-17T09:05:32Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:07:46Z
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
  last_stamp: 2026-10-17T09:07:46Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: ""
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-17T08:45:48Z
---

# STORY-005-02: `wikeeper lint`: check registry, `broken-link`, `orphan-page`, `uncited-claim`, `index-drift`
**Complexity:** L3 — a new subsystem: the check registry and `runLint` (contract K2, owned here), the `lint` command, and four page checks over the parsed pages and `index.md`. No in-sprint upstream; until STORY-005-01 merges it builds against K1's frozen types.

## 1. The Spec (The Contract)

### 1.1 User Story
As a user whose agent keeps the wiki, I want one read-only command that lists broken links, uncited claims, pages nothing links to and an out-of-date `index.md`, each with a check id, file and line, so that I can see where the wiki has decayed, and so that a script can fail on real errors.

### 1.2 Detailed Requirements
- **R1 — Registry (K2).** `src/lint/checks.ts` exports `LintCheck`, `LintContext`, `PAGE_CHECKS`, `RULE_CHECKS` and `runLint` (§3.3). This story's page checks, in registry order:

  | id | severity | reports |
  |---|---|---|
  | `broken-link` | error | a body wikilink that resolves to no page (R5) |
  | `uncited-claim` | error | a fact line or prose claim with no source citation (R7) |
  | `orphan-page` | warning | a page no other page links to (R6) |
  | `index-drift` | warning | `index.md` differs from what `index rebuild` would write (R8) |

  `RULE_CHECKS` starts empty; STORY-005-04 fills it, and STORY-005-03 appends `unlogged-change` and `stale-fact` to `PAGE_CHECKS`. Each later check is one import and one array entry. Check ids are stable: no story renames them.
- **R2 — `runLint(ctx, { scope, checks })`.**
  - It takes the scope's registry. With `checks`, it keeps only those ids, in registry order. An id that is not in the scope's registry throws `WikeeperError(USAGE, "usage", 'unknown check "<id>"; page checks: <ids>')`. For `--rules`, the message reads `rule checks: <ids>`, or `rule checks: none yet` when the registry is empty.
  - It runs the selected checks one after another and collects their findings.
  - When `ctx.only` is set, it keeps only findings whose `path` is in `ctx.only`. Findings without a `path` are dropped then.
  - It sorts by `path` (findings without one first), then `line` (without one first), then `id`, then `message`, in code-unit order (`compareCodeUnits`).
  - A check's findings carry the check's own id and declared severity. A check may also emit `info` findings that say what it could not check.
- **R3 — Finding location.** C9's `LintFinding` (`src/ingest/lint-hook.ts:4`) gains the optional field `line?: number` (additive, owned here). `line` is the 1-based line in the file, with frontmatter lines counted, as the parser numbers `Page.facts[].line` and `Page.links[].line`. For page checks, `path` is the page path relative to `pages/`, POSIX, as `Page.path`. A finding about a whole page has a `path` and no `line`. A finding about a file that is not a page (`index-drift`) has neither. Rule findings (STORY-005-04) point into `kb_instructions.md` with `line` only.
- **R4 — Link resolution** (shared by R5 and R6). A wikilink target is `Page.links[].target`, which the parser has already stripped of `|alias`, `#heading` and `.md` (`linkTarget`, `src/wiki/parse-page.ts:104`). The target resolves to page P when `normalizeName(target)` equals one of P's keys:
  - P's path without `.md` (`projects/atlas`);
  - P's file name without `.md` (`atlas`). This is how a citation `[[src-…]]` resolves to `sources/src-….md`;
  - the names and aliases that `entityKeys` (`src/search/aliases.ts:22`) gives for each entity `pageEntities(P)` returns. That is the page title (frontmatter `title`, else the first `#` heading, else the file name), the frontmatter `aliases`, and each entity section's heading and `aliases::` values.

  So a link resolves exactly when `search --entity` would find its target, and the path form also resolves. A key shared by several pages resolves to all of them.
- **R5 — `broken-link` (error).** It judges every body wikilink in `Page.links`: prose links, typed-link targets, fact citations and `contradicts::` targets. Frontmatter, fenced code and inline code are not judged, because the parser does not collect links there. Each distinct target on a line that resolves to no page gives one finding at that line:
  - `[[<target>]] does not resolve to a page`;
  - for a target that matches `CITATION_RE` (`src/wiki/parse-page.ts:10`): `[[<id>]] cites a source with no page sources/<id>.md`. WIKI.md write step 4 requires the source page, and `finish` already warns when it is missing (`src/ingest/validate.ts:58`).
- **R6 — `orphan-page` (warning).** A page is an orphan when no other page has a body wikilink that resolves to it (R4). These do not count as links to it: the page's links to itself, `index.md` (generated, and it lists every page), `log/`, and frontmatter `sources`. Each orphan gives one finding with a `path` and no `line`: `no other page links to it`.
- **R7 — `uncited-claim` (error).** A citation is a body wikilink whose target matches `CITATION_RE`. These are the lines that must carry one:
  - **Fact lines** (`Page.facts`). Each fact must cite in its text part: `Fact.sources` must be non-empty. It holds only the citations before ` · contradicts::`, so a fact whose only source link is its `contradicts::` target is uncited. The finding is at the fact's line: `fact line has no [[src-…]] citation`.
  - **Prose claims.** Every other body line belongs to a claim block unless it is structural. Structural lines are:
    - blank lines;
    - headings;
    - typed-link lines (`key::`, with or without a value; the parser keeps only those with a value, so `aliases::` is matched by the same key pattern here);
    - fence lines and the lines inside fenced code blocks;
    - lines inside HTML comments (`<!--` … `-->`);
    - thematic breaks (`---`, `***`, `___`).

    A claim block is one of:
    - a list item: a line that starts, after optional indentation, with `-`, `*`, `+`, `<n>.` or `<n>)`, plus the lines after it up to the next blank, structural, fact or list-item line;
    - a paragraph: a maximal run of other consecutive lines.

    Fact lines end any block and are judged alone. A block needs a citation on at least one of its lines. The finding is at the block's first line: `claim has no [[src-…]] citation`. A wrapped paragraph therefore needs one citation, and WIKI.md's own example passes ("Atlas relaunches … The launch is planned for 2026-11-17 [[src-…]].").
  - **Not judged:** frontmatter, and pages whose errors include `frontmatter_yaml`. When the closing `---` is missing, the parser reads the YAML as body. `finish` and `index rebuild` already report these pages.
- **R8 — `index-drift` (warning).**
  - The expected text is `buildIndex(ctx.pages)` (`src/ingest/index-builder.ts:25`), exactly what `writeIndex` and `index rebuild` write.
  - The current text is `index.md` with a leading BOM removed and CRLF changed to LF. A Windows checkout with `core.autocrlf` is not drift.
  - There is drift when `index.md` is missing or the two texts differ. It gives one finding with no `path` and no `line`:
    - `index.md is missing: run wikeeper index rebuild`;
    - otherwise `index.md is out of date for <n> page(s) (<paths>): run wikeeper index rebuild`. These are the pages whose entry line (`- [<title>](pages/<path>)…`, path URL-decoded) is in one text but not the other. Up to five paths are listed, then `and <k> more`;
    - when only lines other than entries differ: `index.md is out of date: run wikeeper index rebuild`.
  - It is a whole-wiki finding, so it is dropped when `only` is set (R2).
- **R9 — Command.** `wikeeper lint [--rules] [--check <id>]… [--json]`. It lives in `src/commands/lint.ts` and is registered with one import and one `lintCommand` entry in `defaultCommands` (`src/program.ts:33`), after `ingestCommand`.
  - **Steps.** Find the repository root, load config and paths, then `assertInitialised` (exit 1, `not_initialised`). Build the `LintContext`:
    - `pages`: `loadPages(paths.pagesDir)`, not the search corpus, which writes `.wiki/.cache/`;
    - `kb`: `(await loadInstructions(paths))?.kb ?? null` (K1);
    - `log`: `readLogEvents(paths).events`. Its skipped files become envelope warnings `<file>: <reason>`, as in `index rebuild`;
    - `now`: `deps.now()`.

    Then run `runLint` with scope `pages`, or `rules` with `--rules`. `--check` is repeatable.
  - **JSON:** `{ ok: true, command: "lint", data: { scope, findings, counts: { error, warning, info } }, warnings }`.
  - **Human output:**
    - first line: `checked <n> page(s) with <k> check(s)`. With `--rules` it is `checked <repo-relative kb_instructions.md> with <k> check(s)`;
    - then one line per finding, `findingLine(f, scope, paths)` (§3.3): `<label> <id> <location>: <message>`, with the doctor's labels `[error]`, `[warn]`, `[info]` (`src/commands/doctor.ts:274`). The location is `<repo-relative pages dir>/<path>[:<line>]` for a page finding, and `<repo-relative kb_instructions.md>:<line>` for a rules finding with a line. When there is no location, the line is `<label> <id>: <message>`;
    - last line: `<n> error(s), <n> warning(s), <n> info`, built with `plural` (`src/commands/doctor.ts:35`).
  - **Exit codes:** 1 when `counts.error > 0`, through `ctx.setExitCode` after `emitResult`, as `doctor` does (`src/commands/doctor.ts:323`). Otherwise 0. Usage errors exit 2.
- **R10 — Read-only** (EPIC-005 safety rule). Lint writes no file at all: no page, `index.md`, `log/` event, `log.md`, `kb_instructions.md`, lock, snapshot or `.wiki/.cache/`. It runs while an ingest holds the write lock and reports what it finds.

### 1.3 Out of Scope
- `unlogged-change`, `stale-fact`, page hashes and the real `finish` lint hook (STORY-005-03). The content of `lint --rules` (STORY-005-04). The kb parser (STORY-005-01).
- Fixes. Lint never rewrites anything; `index rebuild` (EPIC-003) is the only repair.
- A check for the parser's page errors (frontmatter YAML or fields, fact status or date). They stay `finish` and `index rebuild` warnings. A follow-up can add one.
- Attachments and embeds. WIKI.md pages carry none, so a link to a non-page file (`![[diagram.png]]`) is reported as broken.
- Heading anchors: `[[Atlas#Facts]]` is checked against Atlas only.
- Limiting a lint run to given pages on the command line. `ctx.only` is set only by the `finish` hook (STORY-005-03).
- Instruction text that names `lint` (STORY-006-09).

### 1.4 Open Questions

- None. Decided while drafting, against the code and the acmeworks wiki:
  - Severities are as in R1. `broken-link` is an error (EPIC-005 §5). `uncited-claim` is an error, because WIKI.md says "End every claim with the citation". `orphan-page` and `index-drift` are warnings: nothing in them is false, and `index rebuild` repairs the index.
  - A citation whose source page is missing is a broken link (R5).
  - A paragraph needs one citation, not one per line (R7).
  - Typed-link lines are not claims (R7). In the real wiki they carry no citations.
  - `path` is relative to `pages/` (R3), like `Page.path`, `ctx.only` and the ingest log's `created` and `updated`.
  - The index comparison ignores line endings (R8).

### 1.5 Risks

- **Risk:** STORY-005-03 and STORY-005-04 append to `src/lint/checks.ts` while this story is open.
- **Mitigation:** Each appends one import and one array entry, and check ids and order are fixed here. The Sprint Design Review sequences them.
- **Risk:** `src/kb/parse-instructions.ts` (K1) does not exist when this story starts.
- **Mitigation:** The command uses only `loadInstructions` and the `KbInstructions` type, frozen in K1. The contract stub comes from the Sprint Design Review, or STORY-005-01 merges first. This story does not create or edit that file.
- **Risk:** `uncited-claim` is too strict for hand-written navigation lines ("See [[Atlas]]") and fails `lint` with exit 1.
- **Mitigation:** The rule is WIKI.md's own. A read-only probe of the acmeworks wiki, with the SPRINT-02 parser and these rules (2026-10-17), gave zero `uncited-claim` and zero `broken-link` findings over 20 pages and 242 fact lines, and no index drift.
- **Risk:** Hub pages are orphans by design. The same probe finds `decisions.md` and `glossary.md`.
- **Mitigation:** It is a warning, so the exit code stays 0, and linking the page from any other page clears it.
- **Risk:** Fixture names that differ only by case collide on macOS and Windows (flashcard `#windows #test-harness`).
- **Mitigation:** Fixtures use distinct letters. Resolution is case-insensitive anyway (`normalizeName`).

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | All page checks, a `--check` subset, the `--rules` scope, and a run restricted by `ctx.only`. |
| Interfaces | T | Human output and `--json` show the same findings. The `finish` hook surface is STORY-005-03's. |
| Data | T | Each check decides by page content: link forms, fact and prose citations, orphan and index states (Outline). |
| Rules | T | Exit 1 only on an error finding; read-only; an unknown check id is a usage error. |

```gherkin
Feature: wikeeper lint — check registry and page checks

  @rules
  Scenario: Lint finds an uncited claim and a broken link
    Given an initialised wiki whose pages/team.md has, at line 12, the fact line "- 2026-10-15 · decided · The product lead runs QA." with no source link
    And pages/team.md links "[[Nobody Here]]" at line 14, and no page has that path, file name, title, alias or entity name
    When I run "wikeeper lint --json"
    Then data.findings holds { id: "uncited-claim", severity: "error", path: "team.md", line: 12 } and { id: "broken-link", severity: "error", path: "team.md", line: 14 }
    And data.scope is "pages" and data.counts.error is 2
    And the command exits with code 1

  @data
  Scenario Outline: Each page check decides by the page format
    Given an initialised wiki with <pages>
    When I run "wikeeper lint --json"
    Then the findings of check "<check>" are <findings>

    Examples:
      | pages | check | findings |
      | projects/atlas.md linking "[[Product]]" (an alias of people/product-lead.md), "[[projects/atlas]]", "[[Vendor delay]]" (an entity section of risks.md) and "[[src-2026-10-16-q4]]", with pages/sources/src-2026-10-16-q4.md present | broken-link | empty |
      | projects/atlas.md citing "[[src-2026-10-16-gone]]", with no pages/sources/src-2026-10-16-gone.md | broken-link | one, at that line, naming "sources/src-2026-10-16-gone.md" |
      | a fact line whose only source link follows " · contradicts::" | uncited-claim | one, at the fact line |
      | a paragraph wrapped over two lines with "[[src-2026-10-16-q4]]" at the end of the second, the lines "owner:: [[Product Lead]]" and "aliases::", and a fenced code block | uncited-claim | empty |
      | a list item "- Created the Atlas page." with no citation | uncited-claim | one, at that line |
      | broken.md, whose frontmatter has no closing --- line | uncited-claim | empty |
      | people/tester.md that no other page links to, and risks.md that links only to itself | orphan-page | two warnings without a line, for "people/tester.md" and "risks.md" |
      | an index.md entry for risks.md edited by hand | index-drift | one warning without a path naming "risks.md", and none after "wikeeper index rebuild" |
      | index.md deleted | index-drift | one warning "index.md is missing: run wikeeper index rebuild" |
      | index.md rewritten with CRLF line endings and otherwise unchanged | index-drift | empty |

  @paths @interfaces
  Scenario: --check narrows the run, and human output names each finding's file and line
    Given the wiki of "Lint finds an uncited claim and a broken link", plus people/tester.md that no other page links to
    When I run "wikeeper lint --check broken-link"
    Then stdout has the line "[error] broken-link .wiki/pages/team.md:14: [[Nobody Here]] does not resolve to a page"
    And stdout has no uncited-claim or orphan-page line, and its last line is "1 error, 0 warnings, 0 info"
    And "wikeeper lint" prints "[warn] orphan-page .wiki/pages/people/tester.md: no other page links to it"
    And "wikeeper lint --check orphan-page --check broken-link --json" lists the orphan-page finding for "people/tester.md" before the broken-link finding for "team.md"
    And runLint with ctx.only ["people/tester.md"] returns only the orphan-page finding for "people/tester.md"
    And "wikeeper lint --rules --json" exits 0 with data.scope "rules" and no page check id in data.findings

  @rules
  Scenario: Lint is read-only
    Given an initialised wiki where every check of this story has a finding, with log/ events and no .wiki/.cache/
    And a copy of it whose write lock is held by an applied ingest
    When I run "wikeeper lint" and "wikeeper lint --json" in each
    Then every file in each repository has the same sha256 as before, and no file or directory was added or removed

  @rules
  Scenario Outline: Error — lint exits 1 on an error finding and 2 on bad usage
    Given <repo>
    When I run "wikeeper lint <args> --json"
    Then the command exits with code <exit> and <result>

    Examples:
      | repo | args | exit | result |
      | an initialised wiki with one broken link | | 1 | ok is true and data.counts is { error: 1, warning: 0, info: 0 } |
      | an initialised wiki whose only finding is an orphan page | | 0 | data.counts.warning is 1 |
      | a wiki just initialised, with no pages | | 0 | data.findings is empty |
      | an initialised wiki | --check no-such-check | 2 | error code "usage", and the message names "no-such-check" and "broken-link" |
      | an initialised wiki | --rules --check broken-link | 2 | error code "usage" |
      | an empty git repository | | 1 | error code "not_initialised" |
```

### 2.2 Verification Steps (Manual)
- [ ] Copy `~/walkthrough-wiki` to a scratch directory and run `wikeeper lint` there. Expect 0 errors, `orphan-page` warnings for `decisions.md` and `glossary.md`, and no `index-drift`.
- [ ] In the copy, delete a citation from one fact line and add `[[Nobody]]` to a page. Read the human output: each line names `.wiki/pages/<file>:<line>`, and the exit code is 1.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/lint/checks.ts` |
| Related Files | `src/commands/lint.ts`, `src/lint/links.ts`, `src/lint/citations.ts`, `src/ingest/lint-hook.ts`, `src/program.ts`, `test/lint/checks.test.ts`, `test/lint/links.test.ts`, `test/lint/citations.test.ts`, `test/lint/lint-command.test.ts` |
| New Files Needed | Yes — `src/lint/checks.ts`, `src/lint/links.ts`, `src/lint/citations.ts`, `src/commands/lint.ts`, `test/lint/checks.test.ts`, `test/lint/links.test.ts`, `test/lint/citations.test.ts`, `test/lint/lint-command.test.ts` |

### 3.2 Technical Logic
- **`src/lint/checks.ts`.** It holds the types, `PAGE_CHECKS = [brokenLinkCheck, uncitedClaimCheck, orphanPageCheck, indexDriftCheck]`, `RULE_CHECKS = []`, `runLint` (R2) and `countFindings`. It also holds `indexDriftCheck` (R8), so the files stay within EPIC-005's `src/lint/` list. The index check reads `paths.indexFile` (ENOENT means missing), normalises the text, and compares it with `buildIndex(ctx.pages)`. Entry lines match `^- \[.*\]\(pages/([^)]+)\)`, and the captured path is passed through `decodeURIComponent`, which reverses `encodePath` (`src/ingest/index-builder.ts:11`).
- **`src/lint/links.ts`.** `linkResolver(pages)` builds one `Map<normalizedKey, pagePath[]>` from R4's keys, using `pageEntities` (`src/wiki/parse-page.ts:381`) and `entityKeys`. A `WeakMap` keyed by the `ctx.pages` array lets `broken-link` and `orphan-page` share one build per run. `orphan-page` collects, for each page, the set of other pages with a link that resolves to it.
- **`src/lint/citations.ts`.** `claimBlocks(page)` walks the lines of each section's `text`, numbered as `lineOf` does (`src/wiki/parse-page.ts:453`): section 0 starts at `sections[0].line`, and section i > 0 at `sections[i].line + 1`. It tracks fences with the parser's rule (3+ backticks or tildes open; the same character, at least as long, with nothing after it, closes) and HTML comments. Fact lines are the `line` values of `page.facts`. A block is cited when one of its lines is the `line` of a `page.links` entry whose target matches `CITATION_RE`. The parser has already blanked inline code and skipped fences for links, so no wikilink is re-parsed here.
- **`src/commands/lint.ts`.** `createLintCommand(deps)` follows `src/commands/search.ts`: `getOutputContext`, `findRepoRoot`, `loadConfig`, `resolvePaths`. Then it builds the context (R9), validates and runs (`runLint` throws the usage error), calls `emitResult`, and then `ctx.setExitCode`. `--check` uses the repeatable collector that `search --where` uses. `findingLine` is exported because `finish` uses it (STORY-005-03).
- **`src/ingest/lint-hook.ts`.** Add `line?: number` to `LintFinding`. Nothing else changes (C9 stays frozen).
- **Read-only.** No module in this story imports `writeFile`, `mkdir`, `rm` or `loadSearchCorpus`, whose cache write is at `src/search/engine.ts:284`. The read-only scenario's test hashes the repository with `hashTree(root)` (`src/ingest/snapshot.ts:52`) before and after.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper lint` | CLI | None | `--rules`, `--check <id>` (repeatable), `--json` | `LintData` (below); exit 1 when any finding is an error |

Frozen exports (consumers: STORY-005-03, 005-04, 006-09, 006-11):

```ts
// src/ingest/lint-hook.ts (C9, additive)
export interface LintFinding { id: string; severity: "info" | "warning" | "error"; message: string; path?: string; line?: number }

// src/lint/checks.ts (K2)
import type { WikeeperConfig } from "../core/config.js";
import type { ResolvedPaths } from "../core/paths.js";
import type { StoredLogEvent } from "../ingest/log.js";
import type { KbInstructions } from "../kb/parse-instructions.js";
import type { Page } from "../wiki/parse-page.js";
export type LintScope = "pages" | "rules";
export interface LintContext {
  paths: ResolvedPaths; config: WikeeperConfig; pages: Page[]; kb: KbInstructions | null;
  log: StoredLogEvent[]; now: Date; only?: string[];   // only: page paths relative to pages/
}
export interface LintCheck { id: string; severity: "error" | "warning" | "info"; scope: LintScope; run(ctx: LintContext): Promise<LintFinding[]> }
export const PAGE_CHECKS: LintCheck[];
export const RULE_CHECKS: LintCheck[];
export function runLint(ctx: LintContext, opts: { scope: LintScope; checks?: string[] }): Promise<LintFinding[]>;
export function countFindings(findings: readonly LintFinding[]): { error: number; warning: number; info: number };
export const indexDriftCheck: LintCheck;          // "index-drift", warning

// src/lint/links.ts
export function linkResolver(pages: readonly Page[]): (target: string) => string[];   // page paths; [] = broken
export const brokenLinkCheck: LintCheck;          // "broken-link", error
export const orphanPageCheck: LintCheck;          // "orphan-page", warning

// src/lint/citations.ts
export interface ClaimBlock { line: number; kind: "fact" | "prose"; cited: boolean }
export function claimBlocks(page: Page): ClaimBlock[];
export const uncitedClaimCheck: LintCheck;        // "uncited-claim", error

// src/commands/lint.ts
import type { CommandModule } from "../program.js";
export interface LintData { scope: LintScope; findings: LintFinding[]; counts: { error: number; warning: number; info: number } }
export function findingLine(f: LintFinding, scope: LintScope, paths: ResolvedPaths): string;   // "[error] broken-link .wiki/pages/team.md:14: …"
export function createLintCommand(deps?: { now?: () => Date }): CommandModule;
export const lintCommand: CommandModule;
```

Consumed (frozen): `loadPages`, `pageEntities`, `normalizeName`, `linkTarget`, `CITATION_RE`, `Page`, `Fact`, `WikiLink` (C1, STORY-004-01); `entityKeys` (STORY-004-04); `buildIndex` (STORY-003-07); `readLogEvents`, `StoredLogEvent` (C7); `LintFinding` (C9); `loadInstructions`, `KbInstructions` (K1, STORY-005-01); `emitResult`, `getOutputContext` (`src/core/output.ts`); `plural` (`src/commands/doctor.ts`).

## Task Breakdown

- [ ] Add `line?: number` to `LintFinding` in `src/ingest/lint-hook.ts` -> R3
- [ ] `src/lint/checks.ts`: types, registries, `runLint` (selection, unknown-id usage error, `only` filter, sort), `countFindings` -> R1, R2
- [ ] `src/lint/links.ts`: `linkResolver`, `broken-link`, `orphan-page` -> R4, R5, R6
- [ ] `src/lint/citations.ts`: `claimBlocks`, `uncited-claim` -> R7
- [ ] `indexDriftCheck` in `src/lint/checks.ts`: normalised compare, entry-line diff, messages -> R8
- [ ] `src/commands/lint.ts`: context build, JSON and human output, `findingLine`, exit codes; register in `src/program.ts` -> R9
- [ ] Unit tests per module, and CLI tests per Gherkin scenario in `test/lint/lint-command.test.ts`, including the repository-hash read-only test -> §2.1, R10

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 8 | `runLint`: selection order, unknown id per scope, `only` filter drops findings without a path, sort with missing path or line; resolver keys (path, file name, title, alias, entity section, case and whitespace); `broken-link` citation message and one finding per target per line; `orphan-page` self-link; `claimBlocks` (contradicts-only citation, wrapped paragraph, list-item continuation, typed-link lines with and without a value, fence, HTML comment, thematic break, unclosed frontmatter skipped); `index-drift` (missing, entry diff with decoded paths and the five-path cap, CRLF, non-entry diff); `countFindings`; `findingLine` for page, rules and location-less findings |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli` with a temp repository. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `npm run typecheck` and `npm test` pass; the SPRINT-02 tests still pass, including `test/ingest/finish.test.ts` with the extended `LintFinding`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/ingest/lint-hook.ts:4` — C9 `LintFinding`, which this story extends with `line`.
- **Surface:** `src/wiki/parse-page.ts:443` — `loadPages`; `src/wiki/parse-page.ts:381` — `pageEntities`; `src/wiki/parse-page.ts:10` — `CITATION_RE`. Links and facts already carry line numbers.
- **Surface:** `src/search/aliases.ts:22` — `entityKeys`, the name and alias rule that link resolution reuses.
- **Surface:** `src/ingest/index-builder.ts:25` — `buildIndex`, the deterministic index that `index-drift` compares with.
- **Surface:** `src/commands/doctor.ts:323` — a non-zero exit after a successful result; `src/commands/doctor.ts:274` — severity labels.
- **Surface:** `src/program.ts:33` — `defaultCommands`, where `lint` is registered.
- **Coverage of this requirement:** partial — the parser, entity keys, index builder and output conventions exist; the registry, the four checks and the command are net-new.

## Prior work

- [[EPIC-005]] (parent). It builds on [[STORY-004-01]] (page parser: links and facts with line numbers), [[STORY-004-04]] (entity names and aliases, reused for link resolution), [[STORY-003-07]] (deterministic `index.md`) and [[STORY-003-09]] (the C9 lint hook point and `LintFinding`). [[CR-002]] D1 and [[CR-003]] E2 make `lint` the backstop for shell writes; that check is STORY-005-03's. A grep of the wiki index (2026-10-17) lists only EPIC-005 and SPRINT-03 for lint; no duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/ingest/lint-hook.ts` (C9) plus the page parser. The hook point exists, but there are no checks behind it.
- **Why isn't extension / parameterization / config sufficient?** A markdown link checker cannot resolve wikeeper's targets: names, aliases and entity sections, as `search --entity` resolves them. It also does not know the fact-line and citation format or how the index is built. One registry with stable ids lets STORY-005-03 and STORY-005-04 add checks with one line each, and gives the agent and scripts ids to filter on.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2. (R1 ids and severities: scenarios 1, 2 and 5; R2: scenarios 3 and 5; R3: scenarios 1–3; R4–R8: scenarios 1–3; R9: scenarios 3 and 5; R10: scenario 4.)
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (New source files are EPIC-005 §0's `src/lint/checks.ts`, `links.ts`, `citations.ts` and `src/commands/lint.ts`; the existing paths were verified 2026-10-17.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
