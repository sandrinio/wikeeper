# SPRINT-02 — Decomposition brief

Written by the orchestrator at SPRINT-02 planning (2026-10-16), before story drafting. It fixes the story set, the scope of each story, the files each one owns and the cross-story contracts, so the stories can be drafted in parallel and the Sprint Design Review can form contracts from them. Story files are the source of truth once drafted; this file records why they were cut this way.

## Human decisions (2026-10-16)

- **Scope:** SPRINT-02 = EPIC-003 without `read` + EPIC-004 + EPIC-006 + CR-002 items A1–A7, B1–B7, C1 (whitelist half). `read` (with CR-002 C2) and EPIC-005 (with CR-002 D1 and the `lint --rules` half of C1) move to SPRINT-03.
- **CR-001** lands in SPRINT-01, before 0.1.0. After it, `ai` mode allows only `wikeeper ingest …` / `npx wikeeper ingest …` (Claude `permissions.allow`, Codex `prefix_rule`). New commands the agent runs routinely add their own allow rule in the story that builds them.
- **CR-002** approved with its recommended answers: pointer block cap is **14 lines**; `init`/`update` add each `.bak` path they write to the managed `.gitignore` block and `remove` takes it out; `me.md` is loaded by the block's "read `.wiki/me.md` at session start" line plus a SETUP.md step that checks it works.

## Commands that exist at the end of SPRINT-02

`init`, `update`, `remove`, `doctor`, `setup`, `hook guard`, `ingest start | plan | facts | apply | finish | abort`, `index rebuild`, `search`.
Instruction text written this sprint references **only these**. `read`, `lint`, `status` and `rules` arrive in SPRINT-03 together with the instruction text that mentions them.

## Story set (25)

| Story | Title | Source | Upstream (in-sprint) |
|---|---|---|---|
| STORY-001-08 | `init` asks every question before writing | CR-002 A1 | — |
| STORY-001-09 | `--json` in every subcommand's help; `--purge` help text | CR-002 A3, A4 | — |
| STORY-002-07 | `doctor` reporting: severities, plurals, setup/permission/enforce/hooks/`.bak` | CR-002 A2, A5 | — |
| STORY-002-08 | Settings files and backups in `init`/`update` reports; `.bak` gitignored | CR-002 A6, A7 | 001-08 (shares `init.ts`) |
| STORY-003-01 | Source ids and raw registry, duplicate detection | EPIC-003 | — |
| STORY-003-02 | Permission evaluation and source-kind rules | EPIC-003, CR-002 C1 | — |
| STORY-003-03 | User `pre_ingest` / `post_ingest` hooks | EPIC-003 | — |
| STORY-003-04 | `wikeeper ingest start` | EPIC-003 | 003-01, 003-02, 003-03 |
| STORY-003-05 | `wikeeper ingest plan <dir>` | EPIC-003 | 003-01, 003-02, 003-04 |
| STORY-003-06 | `wikeeper ingest facts` and the facts schema | EPIC-003 | 003-01, 003-02, 003-04, 003-07 (`readLogEvents` tells it an ingest is finished), 006-02 (SDR: template-loader re-scope) |
| STORY-003-07 | `index.md` builder, `log/` events, `wikeeper index rebuild` | EPIC-003 | 004-01 |
| STORY-003-08 | Write lock, snapshot, `ingest apply`, `ingest abort` | EPIC-003 | 003-04, 003-06, 003-07 |
| STORY-003-09 | `wikeeper ingest finish`, report, lint hook point, end-to-end ingest test | EPIC-003 | 003-03, 003-07, 003-08, 004-01 |
| STORY-004-01 | Page parser | EPIC-004 | — |
| STORY-004-02 | `wikeeper search` — ranked full-text, JSON schema, performance budget | EPIC-004 | 004-01, 006-02 (adds the search rows to SETUP.md's preview table) |
| STORY-004-03 | Structured filters `--type`, `--where`, `--status` | EPIC-004 | 004-02 |
| STORY-004-04 | `--entity` alias resolution with backlinks; `--since` | EPIC-004 | 004-02, 003-07 |
| STORY-004-05 | Miss logging and `search --misses` | EPIC-004 | 004-02, 003-07 |
| STORY-004-06 | On-disk search cache | EPIC-004 | 004-02 |
| STORY-006-01 | Pointer block and guard deny message | EPIC-006, CR-002 B1–B4 | — |
| STORY-006-02 | SETUP.md, `project.md` template, `ResolvedPaths.projectFile`, `wiki-setup` skill | EPIC-006, CR-002 B5, B6 | — |
| STORY-006-03 | Profile suggestions, `kb_instructions.md` seed, `source.md` page template | EPIC-006 | 004-01 (page format), 003-02 (kind rules), 006-02 (SDR: template-loader re-scope) |
| STORY-006-04 | WIKI.md — the wiki protocol | EPIC-006, CR-002 B4, B7 | command surfaces of 003-04…09, 004-02…05 (frozen as contracts), 003-06, 006-02 (SDR: template-loader re-scope) |
| STORY-006-05 | `wiki-ingest` / `wiki-search` skills, extractor and writer sub-agent prompts | EPIC-006 | — |
| STORY-006-06 | Structural template tests | EPIC-006, CR-002 B4 | every other story in this sprint |
| STORY-006-07 | ONBOARDING.md and the `me.md` template (added after the SDR, contract 13) | EPIC-006, CR-002 B5 | 006-02 (SETUP.md step 1 hands off to ONBOARDING.md) |
| STORY-006-08 | `wikeeper doctor` checks the setup files (added after the SDR, contract 13) | EPIC-006 | 006-02 (`projectFile`), 002-07 (`src/commands/doctor.ts`) |

`read` keeps the next EPIC-003 id (STORY-003-10) and is drafted with SPRINT-03.

## Cross-story contracts

These are the agreements the stories draft against. The owner story freezes the names and types; consumers never rename them.

1. **Page format and parser (owner 004-01, `src/wiki/parse-page.ts`).** Frontmatter `type`, `title`, `summary`, `aliases[]`, `sources[]`, `updated`; typed links `key:: value` (value may hold `[[target]]`), attached to the section they appear under; fact lines `- YYYY-MM-DD · decided|tentative · text [[src-…]]`, with a contradiction flag the parser exposes as a boolean; wikilinks; sections (heading, level). `parsePage(text, relPath)` never throws on bad input — it returns the page plus `errors[]`. `loadPages(pagesDir)` returns pages sorted by path; `buildBacklinks(pages)`. Entities can be whole pages (frontmatter `title` + `aliases`) or sections inside a page (heading + `aliases::` typed link, e.g. a `people.md` page of `##` entries). Consumers: 003-07, 003-09, 004-02…06, 006-03, 006-06.
2. **Source-kind rule format (owner 003-02, `src/ingest/kind-rules.ts`).** In `kb_instructions.md`, under `## Source kinds`, one line per kind: `<kind-id> (v<N>) → <targets>`. `parseSourceKinds(text)`, `normalizeKindId(s)` (drops the ` (vN)` suffix), `findKindRule(text, kind)`. The 006-03 seed must parse with it; whitelist `kinds` compare normalized ids (CR-002 C1).
3. **Registry (owner 003-01, `src/ingest/source-id.ts`, `src/ingest/registry.ts`).** Ids `src-YYYY-MM-DD-<slug>`, collision suffix `-2`, `-3`, …; `raw/<id>.<ext>` original, `raw/<id>.meta.json`, optional `raw/<id>.md`; `sha256` reused from `src/core/manifest.ts`. Raw files are never modified after `start`. **There is no mutable ingest-state file:** an ingest's phase is derived — registered (meta exists), extracted (facts file exists), applied (the lock names it), finished (an `ingest` log event names it).
4. **Permissions (owner 003-02, `src/ingest/permissions.ts`).** `evaluatePermission(ingestConfig, { origin, originType, kind, approved })` → `allowed | needs_approval | denied` plus a reason and the matching whitelist entry. Exit codes use the existing `ExitCode.NEEDS_APPROVAL` (3) and `ExitCode.DENIED` (4).
5. **User hooks (owner 003-03, `src/ingest/user-hooks.ts`).** `runUserHooks(phase, commands, { cwd, sourceId, timeoutMs })`, sequential, `{source_id}` substituted shell-safely, returns one result per command. Callers decide failure semantics: 003-04 (`pre_ingest`) and 003-09 (`post_ingest`).
6. **Ingest command group (owner 003-04, `src/commands/ingest.ts`).** Registers the `ingest` group in `src/program.ts` and holds one registration line per subcommand; each subcommand lives in `src/commands/ingest-<verb>.ts`. 003-05, 003-06, 003-08 and 003-09 each add their file and one line.
7. **Log and index (owner 003-07, `src/ingest/log.ts`, `src/ingest/index-builder.ts`).** One file per event in `log/`, named `<UTC timestamp>-<slug>.md` with no characters Windows rejects; YAML frontmatter `type: ingest | abort | miss | rule-proposal`, `at`, `source_id` when there is one, plus type-specific fields. `writeLogEvent`, `readLogEvents` (sorted, tolerant of hand-edited files), `regenerateLogView` (writes the gitignored `log.md`), `buildIndex` / `writeIndex` (deterministic, from page frontmatter). `index rebuild` regenerates `index.md` and `log.md`. Consumers: 003-08 (`abort` event), 003-09 (`ingest` event), 004-04 (`--since`), 004-05 (`miss` event).
8. **Lock and snapshot (owner 003-08, `src/ingest/lock.ts`, `src/ingest/snapshot.ts`).** The lock is `paths.lockFile` (`.wiki/.lock`); the existing guard (`src/commands/hook.ts:59`) allows page writes exactly when it exists, so the path stays. The snapshot under `.wiki/.snapshots/<id>/` holds a copy of `pages/` plus hashes of everything else in the content directory, so 003-09 can detect writes outside `pages/`.
9. **Lint hook point (owner 003-09, `src/ingest/lint-hook.ts`).** A no-op default that EPIC-005 replaces in SPRINT-03; `finish` calls it and includes its findings in the report.
10. **Search surface (owner 004-02, `src/commands/search.ts`, `src/search/engine.ts`).** 004-03, 004-04 and 004-05 add their options to `search.ts` in that order; 004-06 changes how `engine.ts` builds its index. JSON output keeps one schema across all of them.
11. **WIKI.md anchor (owners 006-01 and 006-04).** The guard deny message points to the `## Write phase` section of `.wiki/system/WIKI.md`; 006-04 must create that heading and 006-06 checks it exists.
12. **Template locations.** Everything the agent reads at run time ships under `templates/system/**` (installed to `.wiki/system/**` by `init`/`update`): the facts schema at `templates/system/schemas/facts.schema.json`, page templates and the `me.md` template under `templates/system/templates/`, the profile at `templates/system/profiles/management.md`. This refines the EPIC-003/006 §4 paths `templates/schemas/…` and `templates/me.md`, which `init` would not install.

## Shared files (for the Sprint Design Review)

| File | Stories |
|---|---|
| `src/program.ts` | 001-09, 003-04, 003-07, 004-02 |
| `src/commands/ingest.ts` | 003-04 (creates), 003-05, 003-06, 003-08, 003-09 |
| `src/commands/search.ts` | 004-02 (creates), 004-03, 004-04, 004-05 |
| `src/search/engine.ts` | 004-02, 004-06 |
| `src/commands/init.ts` | 001-08, 002-08 |
| `src/agents/enforce/*` | 002-08, 004-02 (search allow rule) |
| `src/commands/doctor.ts`, `src/agents/doctor-checks.ts` | 002-07 |
| `src/agents/hook-protocols.ts` | 006-01 |
| `package.json`, `package-lock.json` | 004-02 (full-text search dependency) |

## Constraints for every story

- No LLM calls and no network in any SPRINT-02 command (`read` is the only network user, and it is in SPRINT-03).
- Every command supports `--json`, uses `emitResult` / `emitError` and the existing `ExitCode` values.
- Windows, macOS and Linux: `node:path` everywhere, no case-differing file names in tests, LF line endings, timestamps in file names without `:`.
- SPRINT-01 must close before SPRINT-02 starts (BUG-001, BUG-002, CR-001, D.5 consolidation, CI on three OSes, Gate 4). Stories build on `main` after that close.

## Sprint Design Review outcome (2026-10-16)

14 contracts (C1–C14), 11 waves, 5 milestones, all lanes `standard`: `waves.json` and sprint plan §2. Changes from this brief: `test/template-loader.red.node.test.ts` is re-scoped once, by STORY-006-02's QA-Red, which is now upstream of 003-06, 006-03 and 006-04; contract 6 is realised as `IngestSubcommand { register(group) }` plus an `ingestSubcommands` array with insertion points (C5); the log event types and `validateFacts` are named in C6 and C7.

## Human decisions (2026-10-16, after the Sprint Design Review)

- **Accepted as recommended:** stale lock by age only (`STALE_LOCK_MS` 2 h, STORY-003-08); D-11 kept, so the new pointer block reaches fresh installs only and 0.1.0 users are told to re-run `init` (STORY-006-01); the writer sub-agent runs `ingest apply` and `ingest finish`, and rejected rule proposals become changelog lines until SPRINT-03 (STORY-006-04); `--reingest` writes only new raw files and does not check the lock (STORY-003-04); EPIC-003 §4 amended to the story paths; STORY-001-09 and STORY-004-04 kept as sized; the CR-001/CR-002 "downstream reverted" boxes stay unchecked; the Goal Acceptance Check as proposed, with the walkthrough run in `~/walkthrough-wiki` (fresh `remove` + `init`) ingesting sources from `~/product_repo/.cleargate/wiki`.
- **No fixed pages.** The package names no knowledge page except `sources/<id>.md`, which `finish` requires. Questions, entity types and page names come from the setup conversation and the first sources; the profile only offers suggestions. This replaces the `team.md` entry written at setup, the five seed pages of architecture.md §5.3 and their page templates.
- **Two setup files and an onboarding procedure** (contract 13): `.wiki/me.md` per person, `.wiki/project.md` per repo, `.wiki/system/ONBOARDING.md` run once per person.

## Contract 13 — setup files (human decision, 2026-10-16)

| File | Scope | Git | Written by | Template | Cap |
|---|---|---|---|---|---|
| `.wiki/me.md` | one per person | ignored (already in the managed block) | the agent, during onboarding, approved by the user | `.wiki/system/templates/me.md` | 15 lines |
| `.wiki/project.md` | one per repo | committed | the agent, during setup, from the conversation or a doc the user names, approved by the user | `.wiki/system/templates/project.md` | 20 lines |
| `.wiki/system/ONBOARDING.md` | package-owned, replaced by `update` | committed | the package | — | — |

- **`me.md`.** Frontmatter exactly `type: me`. Body: `key: value` lines `name`, `address as`, `role`, `uses the wiki for`, `working on`, `timezone`, `language`, `answer style`. A value the user has not given is left out (one rule, stated in the template). It links to no page; the `person:` key of CR-002 B5 is dropped because there is no team page.
- **`project.md`.** Frontmatter exactly `type: project`, `name`, `aliases` (list). Sections in this order: `## What it is` (what it does, for whom, what problem it solves), `## Scope` (what this wiki covers and what it does not), `## Where things live` (repos, docs, trackers the user ingests from), `## Core terms` (a handful the agent needs to read sources). Only stable facts: no status, dates, decisions, people or roadmap; those go into pages through ingests, with citations. It is outside `pages/`: not indexed, not searched, not guarded; the agent changes it only with the user's approval.
- **`ONBOARDING.md`** (once per person): who the user is, what they will use the wiki for, how they like answers; writes `me.md` and shows it for approval; checks that `me.md` is gitignored and will load next session; when the answers suggest questions `kb_instructions.md` lacks, proposes them (WIKI.md, section "Proposing rule changes") and never edits that shared file directly; then, if `.wiki/config.yml` has no `setup_completed_at`, continues with SETUP.md step 2, otherwise ends.
- **`SETUP.md`** (once per repo), steps in order: 1 onboard the user (follow `.wiki/system/ONBOARDING.md`); 2 the project (write `project.md`); 3 what the wiki answers (draft Questions, Entities with their page names, Source kinds and Never capture in `kb_instructions.md` from `project.md`, `me.md` and the profile's suggestions; the user approves); 4 permission mode (preview table unchanged); 5 wiring (`wikeeper doctor`); 6 session start (both files exist, `me.md` ignored, the block present in every agent file); 7 first source (offer an ingest; WIKI.md section "Ingest"); 8 finish (`wikeeper setup --done`).
- **Pointer block** (STORY-006-01): the session-start line reads `.wiki/me.md` and `.wiki/project.md`, and onboards the user with `.wiki/system/ONBOARDING.md` first when `me.md` is missing; the editable-files line adds `.wiki/project.md`.
- **Profile** (`.wiki/system/profiles/management.md`, STORY-006-03): suggestions only — example questions, entity types with suggested page names, source kinds in the contract 2 form, a default Never-capture list — and the instruction to offer what fits `project.md` and the user's answers. The profile id stays `management`; `--profile` and `config.yml` are unchanged.
- **kb seed** (`templates/kb_instructions.management.md`, STORY-006-03): the seven headings of 006-03 R2; Questions, Entities and Source kinds are empty apart from a comment that SETUP.md step 3 drafts them; Capture signals, Write policy and Never capture hold general defaults; the changelog has one seed line. An ingest with no kind rule already works with a warning (STORY-003-04 R4, STORY-003-06 R6).
- **Page templates:** only `templates/system/templates/source.md`. `me.md` and `project.md` are not page templates and are not parsed with `parsePage`. Page shapes (single-entity pages, multi-entry pages whose `##` entries start with `type::` and `aliases::`) are documented in WIKI.md, section "Page format" (STORY-006-04).
- **Code:** `ResolvedPaths.projectFile` = `<wikiDir>/project.md` and `remove` lists it under kept when present, like `me.md` (STORY-006-02). `remove --purge` already deletes it with `.wiki/`.
- **Structural test** (STORY-006-06): a `.wiki/…` path a template names must be under `.wiki/system/`, one of the five runtime files (`me.md`, `project.md`, `kb_instructions.md`, `config.yml`, `index.md`) or a location the CLI creates (`.wiki/` itself, `pages/`, `raw/`, `log/`, `log.md`, `.lock`, `.snapshots/`, `.cache/`); anything else, such as `.wiki/team.md`, is a finding. Caps: `me.md` 15 lines, `project.md` 20 lines. Page templates are the files under `templates/system/templates/` except `me.md` and `project.md`. Every doctor check a template names as `` `<id>` check `` must be reported by `wikeeper doctor --json`.
- **Doctor** (STORY-006-08, human decision after the second Brief): check `setup-files` — `me.md` missing → info; committed → error (`git rm --cached`); not ignored → warning with the cause (a `!` rule, a missing or malformed wikeeper block → `init`, a block without `me.md` → `update`); `project.md` missing after `setup --done` → warning, before → info; `project.md` ignored → warning naming the rule; no git or no repository → info, git parts skipped. `update` is unchanged (STORY-002-08 R4). SETUP.md step 6 and ONBOARDING.md step 5 run `wikeeper doctor` and follow the `fix:` lines with the user's approval; they do not run git themselves. The git helper (`src/core/git.ts`) is the only place wikeeper runs git.
- **Stories:** STORY-006-02 = SETUP.md, `project.md` template, `projectFile`, `wiki-setup` skill; STORY-006-07 (new) = ONBOARDING.md and the `me.md` template; STORY-006-03 = profile suggestions, kb seed, `source.md`; STORY-006-01, 006-04 and 006-06 follow. Test fixtures that name `team.md` or `risks.md` (STORY-004-01, 004-03, 004-04, 003-08) are arbitrary example pages and stay.
