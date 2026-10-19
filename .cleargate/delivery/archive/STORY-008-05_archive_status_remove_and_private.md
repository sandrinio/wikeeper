---
story_id: STORY-008-05
parent_epic_ref: EPIC-008
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: "Completed"
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-008 (approved 2026-10-18) §2 (`wikeeper status`: archive size next to the wiki total, archive_candidates by page red limit and final status; Ownership and privacy: remove keeps archive/, --purge deletes it, private: hides the archive file), §5 (final_status scenario), §6 (the agent only tells the user; the CLI moves nothing) · SPRINT-04 decomposition brief, contract K13 (owned), K9 (consumed: paths.archiveDir), K1/K2 (consumed: estimateTokens, formatTokens, levelMark, measureWiki, config.tokens.page, STORY-007-01), K7 (consumed: StatusData.tokens, STORY-007-05, lands first in src/commands/status.ts) · verified src/commands/status.ts, src/lint/staleness.ts, src/wiki/parse-page.ts, src/core/gitignore.ts, src/commands/remove.ts, src/commands/init.ts, src/commands/update.ts, src/core/config.ts · red tests that pin the touched output (test/gitignore.red.node.test.ts:56, test/help.red.node.test.ts:72, test/remove.red.node.test.ts, test/status.red.node.test.ts) read 2026-10-18"
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-008-01
  - STORY-007-01
  - STORY-007-05
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T08:02:00Z
updated_at: 2026-10-18T08:02:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T08:02:19Z
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
  model: claude-opus-5-5
  last_stamp: 2026-10-18T11:49:55Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-18T10:23:59Z
---

# STORY-008-05: `status` archive size and candidates; `remove`, `--purge` and `private:` cover the archive
**Complexity:** L2 — two read-only additions to `collectStatus` (`src/commands/status.ts`) that reuse STORY-007-05's page measurement and the `stale-fact` status rules (exported from `src/lint/staleness.ts`), plus two small housekeeping changes: the `private:` mirror in `managedIgnoreEntries` (`src/core/gitignore.ts`) and `archive/` in `remove`'s keep and purge lists (`src/commands/remove.ts`). Consumes K9 (STORY-008-01), K1/K2 (STORY-007-01) and K7 (STORY-007-05).

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent starting a session, I want `wikeeper status` to show how big the archive is and which pages or entities could move to it, so that I can tell the user once and let them decide on a clean-up or a higher limit. As the user who owns the wiki, I want `remove` to keep my archive, `--purge` to delete it with the rest, and my `private:` pages to stay out of git in the archive too.

### 1.2 Detailed Requirements
- **R1 — Archive size (K13).** `StatusData.archive = { pages: number; tokens: number }`.
  - `pages` counts the `.md` files under `archive/`, listed with `listPageFiles(paths.archiveDir)`: dot segments are skipped, and a missing folder gives 0.
  - `tokens` is the sum of `estimateTokens` (K1) over their text.
  - Wiki totals (`StatusData.tokens`, K7) do not include the archive.
- **R2 — Archive candidates (K13).** `StatusData.archive_candidates` lists two kinds of entry. Only `pages/` pages are considered; an archive page is never a candidate.
  - **Size.** Each `pages/` page whose tokens are at or above `config.tokens.page.red` (K2) gives `{ path, reason: "size", tokens }`. The tokens come from the same `measureWiki` result that `StatusData.tokens` uses (K7), so the page is not measured twice.
  - **Final status.** An entity (`pageEntities`) on a `pages/` page is a candidate when all three hold:
    - its status is final: the status is the entity's last `status::` typed link, or for a page entity with none, its frontmatter `status`; it is final when its first word is in `FINAL_STATUSES` (case-insensitive), as `stale-fact` reads it;
    - it has at least one fact line;
    - its newest fact date is more than `lint.stale_after_days` days before today, counted in UTC days as `stale-fact` counts them.
  - A final_status entry is `{ path, reason: "final_status", status, entity, last_dated }`. `status` is the value as written; `entity` is the entity name; `last_dated` is the newest fact date. `entity` and `last_dated` are additive to K13 (§1.4 Q1).
  - **Order.** By `path` in code-unit order; on one page, the size entry first, then final_status entries in page order.
- **R3 — One status rule.** `src/lint/staleness.ts` exports what `stale-fact` already uses, and both callers use these exports: `isFinalStatus(value)` (today's private `isFinal`, `:37`), `entityStatus(page, entity)` (today's `statusOf`, `:42`) and `daysSince(date, now)` (the UTC-day age at `:71`). `stale-fact` findings do not change.
- **R4 — Read-only.** `status` still creates, changes and deletes no file (STORY-005-05 R2), and it moves nothing: candidates are for the agent to tell the user, who decides (EPIC-008 §6).
- **R5 — Human output.** Directly after the wiki-size lines STORY-007-05 adds:
  - `archive: none`, or `archive: <formatTokens(tokens)> tokens · <plural(n, "page")>`, e.g. `archive: ≈12k tokens · 3 pages`: the figure first, then the count, as the wiki-size line puts them.
  - `archive candidates: none`, or `archive candidates: <n>`, then one line per entry:
    - size: `  <path> <formatTokens(tokens)> 🔴 (tokens.page.red is <formatLimit(red)>)`, the `<path> ≈<n> <mark>` shape STORY-007-05 uses for a page and its size, with K1's `formatLimit` (`src/core/tokens.ts`, STORY-007-01), as in the `oversized-page` message (`100` → `100`, `10000` → `10k`);
    - final status: `  <path> · <entity>: status <status>, last dated <last_dated> (lint.stale_after_days is <n>)`;
    - then one line, `  nothing moves to the archive until the user asks for a clean-up; to raise the page limit instead, run wikeeper config set tokens.page.red <n>`, with the part after `; ` only when at least one size entry exists. When to tell the user, and how often, is WIKI.md's (R8 (b)).
- **R6 — `private:` covers the archive (K13).** For each `private:` entry inside `pages/`, `managedIgnoreEntries` (`src/core/gitignore.ts:73`) also adds its mirror under `archive/`. The mirror is `path.resolve(paths.archiveDir, entry)`, made repository-relative and passed through `formatEntry` like the `pages/` entry.
  - Mirrors and `pages/` entries are sorted together in the private group, so `.wiki/archive/team.md` comes before `.wiki/pages/team.md`.
  - An entry outside `pages/` keeps its one existing warning and gets no mirror.
  - `init` and `update` write the block, so an existing install gains the mirrors at its next `wikeeper update`.
- **R7 — `remove` keeps the archive; `--purge` deletes it (K13).**
  - `paths.archiveDir` joins `remove`'s kept candidates (`src/commands/remove.ts:231`), so `data.kept` lists it when it exists.
  - `--purge` deletes it. Inside `.wiki/` it goes with `.wiki/`. For a `content_dir` outside `.wiki/`, it joins the owned list (`:216`), and an emptied content folder is removed as today.
  - The `--purge` description becomes `also delete .wiki/ (config.yml, kb_instructions.md, me.md) and the wiki content: pages/, archive/, raw/, index.md, log/, in .wiki/ or content_dir (needs confirmation)`. It keeps every token `test/help.red.node.test.ts:76` checks.
  - With `content_dir: .` the archive is `<repo>/archive/`; whether that needs a guard is STORY-008-01 §1.4 Q3 (recommended: no code, as for `pages/`).
- **R8 — The two WIKI.md status bullets (STORY-008-06 R5 (c), (d) and §1.4 Q2; recommended answer, approved at Gate 1 on 2026-10-18).** On this story's tree `test/templates/sprint-03-commands.red.node.test.ts:307` fails until WIKI.md section "Lint and status" opens a bullet for each new status key. So this story writes in `templates/system/WIKI.md`, after the `tokens` bullet (STORY-007-05 R10), exactly:
  - (a) "- `archive`: the size of `archive/`: its `pages` and estimated `tokens`. They are not counted in `tokens`, and a search skips them unless it runs with `--archive`."
  - (b) "- `archive_candidates`: pages a clean-up could shrink, each with its `reason`: `size` (at or above `tokens.page.red`) or `final_status` (an entity with a final status whose newest fact is older than `lint.stale_after_days`). Tell the user about them once in the session: for `size`, the red-page notice above, told once with it; for `final_status`, a clean-up that moves that entity's fact lines to `archive/` (the whole page when the entity is the page), or leaving it. Never start a clean-up yourself."
  - Nothing else in WIKI.md changes here; STORY-008-06 checks the two bullets. WIKI.md's merge order is 007-05 → 008-05 → 007-07 → 008-06. "The red-page notice above" points at the red-page paragraph that STORY-007-07 writes and STORY-008-06 extends. The bare `--archive` is no command reference for the template checks, but it names STORY-008-03's flag, so this story preferably merges after STORY-008-03 (merge order only, not a dependency).

### 1.3 Out of Scope
- Moving anything to the archive, and any automatic clean-up (EPIC-008 §2 out of scope).
- The wiki total, page levels and `largest` (STORY-007-05), and the `config` command (STORY-007-02).
- Instruction text telling the agent when and how to tell the user about candidates (STORY-008-06). This story writes only the two WIKI.md bullets of R8.
- Stale open statuses: those stay `stale-fact` lint findings (STORY-005-08), not candidates.
- Candidates based on the archive itself, or on `index.md` size.

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1, contract K13 shape):** K13's entry is `{ path; reason; tokens?; status? }`. A final status often belongs to a section entity (`## Gamma` with `type::` and `status:: done`) on a page that holds live entities too, so `path` alone does not say which entity is finished, or since when.
- **Recommended:** Add `entity` and `last_dated` to final_status entries (R2), so the agent can say "Gamma is done and has nothing newer than 2026-08-15". Size entries stay `{ path, reason, tokens }`.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2, immutable red test):** `test/gitignore.red.node.test.ts:56` asserts the exact `entries` list for `private: ["team.md"]`, ending in `.wiki/pages/team.md`. Mirroring the entry (R6) changes that list whatever the order.
- **Recommended:** This story's QA-Red re-scopes that one expectation to `[…, ".wiki/log.md", ".wiki/archive/team.md", ".wiki/pages/team.md"]`, by content anchor, and records it in the red-test re-scope table. A story's QA-Red re-scoping an older red row has precedent (FLASHCARD 2026-10-17 `#enforce #qa`, `#qa #red-test`). `test/gitignore.test.ts:20` (`slice(-2)` is the `pages/` entries) keeps passing with this order.
- **Second red file (consistency audit, 2026-10-18):** `test/settings-reports.red.node.test.ts`, "appends sorted, deduplicated backups after the fixed entries and before private entries" (`:96`), passes `private: ["secret.md"]` with a hand-built `ResolvedPaths` literal (`:84`, `as never`) that has no `archiveDir`. R6 then calls `path.resolve(undefined, …)` and throws, and the expected tail `[".claude/settings.json.bak", ".codex/hooks.json.bak", ".wiki/pages/secret.md"]` (`:103`) also lacks the mirror. Recommended: re-scope that one test the same way: the literal gains `archiveDir: path.resolve("/r/.wiki/archive")`, and the tail gains `".wiki/archive/secret.md"` before `".wiki/pages/secret.md"`. Alternative: derive the mirror from `paths.contentDir` (which the literal has) instead of `paths.archiveDir`; the tail still changes, so the re-scope is needed either way.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q3, file surface):** The final_status rule needs `stale-fact`'s private helpers. `src/lint/staleness.ts` is not in the decomposition brief's file list for 008-05.
- **Recommended:** Export the three helpers (R3) instead of copying them. `stale-fact`'s behaviour and the file's other exports (`FINAL_STATUSES`, `staleFactCheck`) are unchanged, and STORY-008-04 does not edit this file. The consistency audit (2026-10-18) has added the file to this story's scope in the decomposition brief; confirm at Gate 1.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q4, granularity; consistency audit 2026-10-18):** The rubric's "unrelated goals joined" and "subsystems span" signals trip: `status` candidates for the agent, and housekeeping (`private:` mirror, `remove` keep and purge) for the owner. Split the housekeeping out?
- **Recommended:** Keep one story. R6 and R7 add one folder to three existing lists (about 10 lines), which on its own would trip the rubric's too-small signal (a parameter addition under 30 lines). The Gherkin stays at five scenarios and the complexity at L2.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **DRAFTS review (designer, 2026-10-18):** wording aligned with docs/ux.md — the archive line puts the figure first and takes the plural helper (`archive: ≈12k tokens · 3 pages`; R5, §2.1 scenarios 1 and 3); a size candidate uses STORY-007-05's page shape, path then figure then mark (`projects/atlas.md ≈100 🔴 (tokens.page.red is 100)`; R5, §2.1 scenarios 1 and 3); the two hint lines become one, with no "tell the user once:" in the CLI's output (R5, §2.1 scenario 3, §4.1); the `size` reason in the `archive_candidates` bullet points at the red-page notice, told once with it (R8 (b) and its note; the bullet stays equal to STORY-008-06 R5 (d)). No decision changed.

- **Plan confirmation (human, 2026-10-18):**
  - P6: size candidate lines print the limit with K1's `formatLimit` from `src/core/tokens.ts` (STORY-007-01), not from `src/lint/size.ts` (R5, §3.1, §3.2, §3.3).
  - P10: the reason code is snake_case, `reason: "final_status"` (R2, R8 (b), §2.1 scenario 2, §3.3 and the frontmatter `context_source`), as `docs/ux.md` §4.6 asks for a code.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** With `content_dir: .`, the archive is `<repo>/archive/`, a common folder name. `--purge` would delete a user's own `archive/` folder, as it deletes a root `pages/` or `log/` today.
- **Mitigation:** `--purge` needs the confirmation word and its description names `archive/` (R7). The resolution is STORY-008-01 §1.4 Q3, where the archive path is decided (recommended: keep `<content_dir>/archive`, as `--purge` already treats `<root>/pages/` with `content_dir: .`).
- **Risk:** `src/commands/status.ts` is edited by STORY-007-05 first (`tokens`). Its human lines and `measureWiki` call are not written yet.
- **Mitigation:** This story merges after 007-05, places its lines after 007-05's wiki-size lines, and reads the size candidates from 007-05's `measureWiki` result rather than measuring again (R2).
- **Risk:** On a real wiki the final_status list can be long, for example a project page with many shipped sections.
- **Mitigation:** One line per entity, sorted by path; the agent reads `--json` and tells the user once (R5 hint; STORY-008-06).
- **Risk:** `status`'s read-only test hashes the whole repository; reading the archive must not create a cache or index.
- **Mitigation:** R1 and R2 use only `listPageFiles`, `readFile`, `parsePage` and the K1 functions; the read-only scenario runs with an archive present.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | `remove` and `remove --purge` are two successful ways through for the archive folder. |
| Interfaces | T | `status` human and `--json` output; `init` and `update` both write the `.gitignore` block. |
| Data | T | No archive, one archive page; pages below and at the red limit; page and section entities; `content_dir` `.wiki`, `wiki` and `.`. |
| Rules | T | Candidate rules (at or above red; final status older than `lint.stale_after_days`), status writes nothing, the private mirror, keep and purge. |

"(N tokens)" in a row means `estimateTokens` of that file's text is N; tests build the text to that count, or take N from `estimateTokens`.

```gherkin
Feature: The archive in status, remove and private

  @data @rules
  Scenario Outline: status shows the archive size and the pages at or above the red limit
    Given config tokens.page yellow 50 and red 100
    And <files>
    When I run "wikeeper status --json"
    Then data.archive is <archive>
    And data.archive_candidates is <candidates>
    And "wikeeper status" prints a line that, trimmed, is "<line>"

    Examples:
      | files                                                                         | archive                  | candidates                                                  | line                                                   |
      | pages/team.md (20 tokens) and no archive/                                     | { pages: 0, tokens: 0 }  | []                                                          | archive: none                                          |
      | pages/team.md (20 tokens) and archive/projects/atlas.md (40 tokens)           | { pages: 1, tokens: 40 } | []                                                          | archive: ≈40 tokens · 1 page                           |
      | pages/projects/atlas.md (100 tokens) and archive/projects/atlas.md (40 tokens) | { pages: 1, tokens: 40 } | [{ path: "projects/atlas.md", reason: "size", tokens: 100 }] | projects/atlas.md ≈100 🔴 (tokens.page.red is 100) |
      | pages/projects/atlas.md (99 tokens)                                           | { pages: 0, tokens: 0 }  | []                                                          | archive candidates: none                               |
      | pages/team.md (20 tokens) and archive/projects/big.md (500 tokens)            | { pages: 1, tokens: 500 } | []                                                         | archive candidates: none                               |

  @rules @data
  Scenario Outline: Entities with a final status and no recent fact are candidates
    Given lint.stale_after_days 30 and today 2026-10-18
    And <page>
    When I run "wikeeper status --json"
    Then data.archive_candidates is <candidates>

    Examples:
      | page                                                                                                         | candidates                                                                                                          |
      | pages/projects/beta.md (title Beta, frontmatter status: shipped), newest fact 2026-09-17                     | [{ path: "projects/beta.md", reason: "final_status", status: "shipped", entity: "Beta", last_dated: "2026-09-17" }] |
      | pages/projects/beta.md (title Beta, frontmatter status: shipped), newest fact 2026-09-18                     | []                                                                                                                  |
      | pages/projects/beta.md (title Beta, "status:: active"), newest fact 2026-06-01                               | []                                                                                                                  |
      | pages/roadmap.md with a section "## Gamma" ("type:: project", "status:: Done — merged"), newest Gamma fact 2026-08-15 | [{ path: "roadmap.md", reason: "final_status", status: "Done — merged", entity: "Gamma", last_dated: "2026-08-15" }] |
      | pages/projects/beta.md (frontmatter status: shipped) with no fact lines                                      | []                                                                                                                  |
      | archive/projects/delta.md (frontmatter status: shipped), newest fact 2026-01-01, and no pages/ page          | []                                                                                                                  |

  @interfaces @rules
  Scenario: status prints the archive and its candidates, and writes nothing
    Given config tokens.page yellow 50 and red 100, lint.stale_after_days 30, and today 2026-10-18
    And pages/projects/atlas.md (100 tokens), pages/projects/beta.md (title Beta, frontmatter status: shipped, newest fact 2026-09-01, 30 tokens) and archive/projects/atlas.md (40 tokens)
    When I run "wikeeper status"
    Then the exit code is 0
    And it prints "archive: ≈40 tokens · 1 page" and "archive candidates: 2"
    And it prints "  projects/atlas.md ≈100 🔴 (tokens.page.red is 100)"
    And it prints "  projects/beta.md · Beta: status shipped, last dated 2026-09-01 (lint.stale_after_days is 30)"
    And it prints "  nothing moves to the archive until the user asks for a clean-up; to raise the page limit instead, run wikeeper config set tokens.page.red <n>"
    And no file in the repository was created, changed or deleted
    And templates/system/WIKI.md section "Lint and status" has the R8 bullets starting "- `archive`: " and "- `archive_candidates`: "

  @data @rules @interfaces
  Scenario Outline: A private entry also keeps its archive file out of git
    Given a git repository whose .wiki/config.yml is "<config>"
    When I run "wikeeper <command>"
    Then the managed block of .gitignore <lines>

    Examples:
      | config                                | command                                                    | lines                                                                                                                                        |
      | private: [team.md, people/]           | init --yes                                                 | ends with ".wiki/archive/people", ".wiki/archive/team.md", ".wiki/pages/people", ".wiki/pages/team.md", and "git check-ignore -q .wiki/archive/team.md" exits 0 |
      | content_dir: wiki, private: [team.md] | init --yes                                                 | contains "wiki/archive/team.md" and "wiki/pages/team.md"                                                                                     |
      | content_dir: ., private: [team.md]    | init --yes                                                 | contains "archive/team.md" and "pages/team.md"                                                                                               |
      | private: [team.md]                    | update, on an install whose block lists only ".wiki/pages/team.md" | now also contains ".wiki/archive/team.md"                                                                                            |
      | private: [../x.md]                    | init --yes                                                 | has no line for x.md, and the run warns once 'private entry "../x.md" is outside pages/; not ignored'                                        |

  @paths @data
  Scenario Outline: remove keeps archive/; --purge deletes it
    Given an initialised wiki with content_dir "<dir>" and the file <dir>/archive/projects/atlas.md
    And <extra>
    When I run "wikeeper remove <flags> --json"
    Then the exit code is 0 and <outcome>

    Examples:
      | dir   | extra           | flags                      | outcome                                                                              |
      | .wiki | nothing else    |                            | .wiki/archive/projects/atlas.md is unchanged and data.kept contains ".wiki/archive"  |
      | wiki  | nothing else    |                            | wiki/archive/projects/atlas.md is unchanged and data.kept contains "wiki/archive"    |
      | .wiki | nothing else    | --purge --confirm wikeeper | .wiki/ does not exist                                                                |
      | wiki  | nothing else    | --purge --confirm wikeeper | wiki/ does not exist                                                                 |
      | wiki  | wiki/mine.txt   | --purge --confirm wikeeper | wiki/archive/ does not exist and wiki/mine.txt is unchanged                          |
```

### 2.2 Verification Steps (Manual)
- [ ] In a scratch copy of the testbed (`testbed.md`, Making a scratch copy), set `tokens.page.red` to 6k, below `decisions.md` and `risks.md` (testbed.md "Pages for specific checks"), add one archive page by hand, and run `wikeeper status`: the archive line, a size candidate for each of those two pages and any shipped or done entities older than 30 days are listed, beta among them (done in August with no fact since; testbed.md "beta's dates"), and `git status` in the copy is the same before and after `status`.
- [ ] In a scratch repo with `private: [team.md]`, run `wikeeper init --yes`, create `.wiki/archive/team.md`, and check that `git status --porcelain` does not list it.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/commands/status.ts` |
| Related Files | `src/lint/staleness.ts`, `src/core/gitignore.ts`, `src/commands/remove.ts` |
| Related Files (template, R8) | `templates/system/WIKI.md` |
| Related Files (tests) | `test/status.test.ts`, `test/gitignore.test.ts`, `test/remove.test.ts`, `test/lint/staleness.test.ts` |
| Related Files (re-scoped red tests) | `test/gitignore.red.node.test.ts`, `test/settings-reports.red.node.test.ts` |
| Related Files (new tests) | `test/archive-status.red.node.test.ts` |
| New Files Needed | `test/archive-status.red.node.test.ts` (QA-Red) |

- **Read, not edited:** `src/core/tokens.ts` (`estimateTokens`, `formatTokens`, `formatLimit`, `levelMark`, `measureWiki`, K1), `src/core/config.ts` (`tokens.page`, K2; `lint.stale_after_days`), `src/core/paths.ts` (`archiveDir`, K9), `src/wiki/parse-page.ts` (`listPageFiles`, `loadPages`, `pageEntities`), `src/commands/init.ts` and `src/commands/update.ts` (callers of `managedIgnoreEntries`, unchanged).
- **Red tests that must stay green, unmodified:** `test/status.red.node.test.ts` (the read-only hash and the existing lines), `test/help.red.node.test.ts` (purge tokens), `test/remove.red.node.test.ts`, `test/init.red.node.test.ts` (S4 `wiki/pages/team.md`), `test/lint/stale-fact.red.node.test.ts`, `test/templates/sprint-03-commands.red.node.test.ts` S3 (status bullets equal the status keys, R8). `test/gitignore.red.node.test.ts:56` and one test of `test/settings-reports.red.node.test.ts` (`:96`) are re-scoped by this story's QA-Red only (§1.4 Q2).

### 3.2 Technical Logic
- **Order in `collectStatus`** (`src/commands/status.ts:67`), after STORY-007-05's size step:
  1. Archive size (R1): `listPageFiles(paths.archiveDir)`, read in parallel, sum `estimateTokens`.
  2. Size entries (R2): filter 007-05's `measureWiki(paths).pages` by `tokens >= config.tokens.page.red`.
  3. Final-status entries (R2, R3): `loadPages(paths.pagesDir)`; for each page and each entity in `pageEntities(page)` with facts, `entityStatus` → `isFinalStatus` → newest fact date → `daysSince(newest, now) > config.lint.stale_after_days`.
  4. Sort (R2) and set `data.archive` and `data.archive_candidates`.
- **Staleness exports (R3).** Rename on export only (`isFinal` → `isFinalStatus`, `statusOf` → `entityStatus`), extract the age arithmetic from `staleFactCheck` (`src/lint/staleness.ts:69`–`:71`) into `daysSince`, and call the three from `staleFactCheck`. The file keeps importing `checks.ts` with `import type` only.
- **Human output (R5).** In `renderStatus` (`src/commands/status.ts:160`), after 007-05's lines; `plural(n, "page")` for the archive line, `formatTokens`, `levelMark("red")` and `formatLimit` (K1, `src/core/tokens.ts`) for size lines; the red limit is `data.tokens.limits.page.red` (K7), and `config.lint.stale_after_days` is passed to `renderStatus` with the data.
- **Gitignore (R6).** In the private loop (`src/core/gitignore.ts:89`), after the inside-`pages/` test, add `formatEntry(rel(path.resolve(paths.archiveDir, p)))` to the same `priv` set; the existing sort orders the group. With `content_dir: .` this gives `archive/team.md` (it has a slash, so `formatEntry` adds none; FLASHCARD 2026-10-17 `#gitignore`).
- **Remove (R7).** Add `paths.archiveDir` after `paths.pagesDir` in the owned list (`src/commands/remove.ts:216`) and in `keptCandidates` (`:231`); edit the `--purge` description (`:148`).
- **Fixtures.** The status rows use `createStatusCommand({ now })` for 2026-10-18. Write `.wiki/config.yml` with `tokens: { page: { yellow: 50, red: 100 } }` (K2: yellow below red). Remove rows run through `runCli`'s default program in a git repo, so the agents integration registers (FLASHCARD 2026-10-17 `#qa #test-harness`). Assert `data.kept` with `toContain`, not by neighbours (FLASHCARD 2026-10-17 `#remove #qa`).

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `wikeeper status` | CLI | None | `--json` | `StatusData` with `archive` and `archive_candidates` (K13) |
| `wikeeper remove` | CLI | None | `--purge --confirm <word>`, `--json` | `RemoveResult` (unchanged shape; `kept` may list the archive) |

```ts
// src/commands/status.ts (additions to StatusData; K13, plus Q1)
export interface StatusData {
  // …existing fields, and tokens (K7, STORY-007-05)
  archive: { pages: number; tokens: number };
  archive_candidates: Array<
    | { path: string; reason: "size"; tokens: number }
    | { path: string; reason: "final_status"; status: string; entity: string; last_dated: string }
  >;
}

// src/lint/staleness.ts (new exports; behaviour unchanged)
export function isFinalStatus(value: string): boolean;
export function entityStatus(page: Page, entity: Entity): { value: string; line?: number } | null;
export function daysSince(date: string, now: Date): number; // UTC days, as stale-fact counts them
```

Consumed (frozen): `ResolvedPaths.archiveDir` (K9); `estimateTokens`, `formatTokens`, `formatLimit`, `levelMark`, `measureWiki` (K1) and `config.tokens.page` (K2), STORY-007-01; `StatusData.tokens` and the `measureWiki` result in `collectStatus` (K7, STORY-007-05).

## Task Breakdown

- [ ] Export `isFinalStatus`, `entityStatus` and `daysSince` from `src/lint/staleness.ts` and use them in `staleFactCheck` -> R3
- [ ] Add `archive` and `archive_candidates` to `collectStatus`, reusing 007-05's page measurement -> R1, R2, R4
- [ ] Add the archive and candidate lines to `renderStatus` -> R5
- [ ] Mirror private entries under `archive/` in `managedIgnoreEntries` -> R6
- [ ] Add `archive/` to `remove`'s owned and kept lists and to the `--purge` description -> R7
- [ ] Add the `archive` and `archive_candidates` status bullets to WIKI.md "Lint and status", with the R8 text -> R8
- [ ] QA-Red writes `test/archive-status.red.node.test.ts` from the five §2.1 scenarios and, once §1.4 Q2 is approved, re-scopes `test/gitignore.red.node.test.ts:56` and `test/settings-reports.red.node.test.ts:96` -> §2.1
- [ ] Write the §4.1 unit tests in `test/status.test.ts`, `test/gitignore.test.ts`, `test/remove.test.ts` and `test/lint/staleness.test.ts`

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | final_status rule at 30 and 31 days, with a page entity, a section entity, a typed-link status over a frontmatter status, and no facts; size rule at red − 1 and red; sort with a size and a final_status entry on one page; archive size with a dot-segment file and no `archive/`; human lines and plurals (`1 page`, `3 pages`, the hint's `; to raise the page limit instead, …` part only with a size entry); `managedIgnoreEntries` mirror order and one warning for an outside entry; `daysSince` matching `stale-fact`'s ages |
| Integration tests | 0 | Temp directories only. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once), through `runCli`. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The red tests listed in §3.1 pass unmodified; the re-scoped rows in `test/gitignore.red.node.test.ts` and `test/settings-reports.red.node.test.ts` are recorded in the red-test re-scope table (§1.4 Q2).
- [ ] WIKI.md "Lint and status" holds the R8 `archive` and `archive_candidates` bullets with exactly the R8 text, and `test/templates.test.ts` reports no finding on this story's tree.
- [ ] `remove --help` lists `archive/` and every token `test/help.red.node.test.ts:76` checks.
- [ ] No new runtime dependency in `package.json`.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/commands/status.ts:22` — `StatusData`; `src/commands/status.ts:67` — `collectStatus`; `src/commands/status.ts:160` — `renderStatus`.
- **Surface:** `src/lint/staleness.ts:11` — `FINAL_STATUSES`; `src/lint/staleness.ts:37` — `isFinal`; `src/lint/staleness.ts:42` — `statusOf`; `src/lint/staleness.ts:63` — `staleFactCheck`, whose age rule (`:71`, `:80`) the final_status candidates reuse.
- **Surface:** `src/wiki/parse-page.ts:381` — `pageEntities`; `src/wiki/parse-page.ts:432` — `listPageFiles`.
- **Surface:** `src/core/gitignore.ts:73` — `managedIgnoreEntries`, with the private loop at `:89`; called by `src/commands/init.ts:238` and `src/commands/update.ts:205`.
- **Surface:** `src/commands/remove.ts:213` — the purge branch and its owned list (`:216`); `src/commands/remove.ts:231` — the kept candidates; `src/commands/remove.ts:148` — the `--purge` description.
- **Coverage of this requirement:** ≥80% extension — status, the status rule, the gitignore block and `remove` all exist; the new parts are two status fields and one more folder in three lists.

## Prior work

- [[EPIC-008]] (parent: §2 `wikeeper status`, Ownership and privacy; §6). Sprint siblings: [[EPIC-007]] (page and wiki sizes, `tokens.page.red`) and [[SPIKE-003]] (token estimate). Consumes [[STORY-008-01]] (K9), [[STORY-007-01]] (K1, K2) and [[STORY-007-05]] (K7). Builds on [[STORY-005-05]] (`status`), [[STORY-005-08]] (`stale-fact`, `FINAL_STATUSES`), [[STORY-001-02]] and [[STORY-001-04]] (`private:` and the managed `.gitignore` block), [[STORY-002-08]] (the block's entry list), [[STORY-001-06]] (`remove`) and [[STORY-001-09]] (the `--purge` text). Duplicate check (cleargate-wiki-query, 2026-10-18): nothing overlaps beyond EPIC-007, EPIC-008 and SPIKE-003.

## Why not simpler?

- **Smallest existing surface that could carry this:** `collectStatus` (`src/commands/status.ts:67`) for the two fields; `managedIgnoreEntries` and `remove`'s two lists for housekeeping.
- **Why isn't extension / parameterization / config sufficient?** It is extension. The candidates could come from running `stale-fact` and `oversized-page` inside `status`, but neither reports what is needed: `stale-fact` skips final statuses on purpose (they are done, not stale), and lint findings are messages, not data. Exporting `stale-fact`'s status helpers keeps one rule for "final" and one day count. The housekeeping parts add one folder to existing lists; no new option or command.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`archiveDir` comes from STORY-008-01, `src/core/tokens.ts` and `config.tokens` from STORY-007-01 and `StatusData.tokens` from STORY-007-05, all in this sprint per the decomposition brief.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

Approved at Gate 1 (2026-10-18): §1.4 Q1–Q4 decided as recommended (`plans/gate1-decisions.md`); `approved` is true.
