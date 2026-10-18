---
epic_id: EPIC-008
parent_ref: null
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T07:08:09Z
ambiguity: 🟢 Low
context_source: "The human's request in chat, 2026-10-18: semantically prune outdated data, keeping it in an archive · agreed design from the same chat (merged with a second agent's review): archive, never delete; the agent judges, the CLI checks · architecture.md v0.4 §2, §4, §4.1, §7.3, §7.4, §8 · codebase as cited"
owner: Sandro Suladze
target_date: null
created_at: 2026-10-17T23:20:00Z
updated_at: 2026-10-17T23:20:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T07:09:19Z
  transition: ready-for-decomposition
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id EPIC-008
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-18T07:09:36Z
  sessions: []
---

# EPIC-008: Fact archive

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Let the wiki shrink without losing knowledge, when the user asks: in a clean-up the user requests, replaced facts and finished entities move from `pages/` to `archive/` (same paths, same page format); ordinary ingests keep recording as today; `ingest finish` lets a fact line leave a page only when the identical line is in the archive; the index, default search and page lint skip the archive; `search --archive` and history searches include it; `status` lists archive candidates.</objective>
  <architecture_rules>
    <rule>Archive, never delete: a fact line dropped from a page must be in `archive/`; every fact line of a deleted page must still be in `pages/` or `archive/`; no fact line ever leaves `archive/`. `ingest finish` enforces all three.</rule>
    <rule>The agent judges which facts are replaced or finished; the CLI makes no judgement and moves nothing itself (architecture.md §2 principle 1).</rule>
    <rule>Facts move to the archive only in a clean-up the user asks for. Ordinary ingests keep recording as today: a replaced fact stays on the page. The user is kept aware of sizes (EPIC-007) and decides whether to raise a limit or ask for a clean-up.</rule>
    <rule>A clean-up is a chat-excerpt ingest of the user's decision, with the existing write phase (`ingest apply` … `ingest finish`), so lock, snapshot, abort, log, report and lint apply unchanged.</rule>
    <rule>`archive/` sits in the content folder next to `pages/` and follows `content_dir`. It is user-owned like `pages/` (architecture.md §4.1).</rule>
  </architecture_rules>
  <target_files>
    <file path="src/core/paths.ts" action="modify" />
    <file path="src/ingest/snapshot.ts" action="modify" />
    <file path="src/ingest/diff.ts" action="modify" />
    <file path="src/ingest/validate.ts" action="modify" />
    <file path="src/ingest/report.ts" action="modify" />
    <file path="src/commands/ingest-finish.ts" action="modify" />
    <file path="src/ingest/index-builder.ts" action="modify" />
    <file path="src/search/engine.ts" action="modify" />
    <file path="src/commands/search.ts" action="modify" />
    <file path="src/lint/links.ts" action="modify" />
    <file path="src/lint/unlogged.ts" action="modify" />
    <file path="src/commands/status.ts" action="modify" />
    <file path="src/core/gitignore.ts" action="modify" />
    <file path="src/commands/remove.ts" action="modify" />
    <file path="templates/system/WIKI.md" action="modify" />
    <file path="templates/skills/wiki-search/SKILL.md" action="modify" />
    <file path="architecture.md" action="modify" />
    <file path="README.md" action="modify" />
  </target_files>
</agent_context>
```

## 1. Problem & Value

**Why are we doing this?**
Pages only grow, line by line. A replaced fact stays on the page (WIKI.md "Page format"), and `ingest finish` refuses any change that drops a fact line ([[CR-003]] B1). The one way out is deleting a whole page, which `finish` doesn't check, so all its facts are lost without a warning. The writer and every answer read whole pages, so old dates and finished work cost tokens on every read and crowd out what is current. When the user decides it is time, they want outdated knowledge moved out of the way and kept, not deleted.

**Success Metrics (North Star):**
- No fact line is ever lost: every line removed from `pages/`, dropped or on a deleted page, is still in `pages/` or `archive/`, enforced at `ingest finish`.
- After an archive pass, the pages the user archived drop below the page yellow limit (EPIC-007), and their current facts are unchanged.
- "What changed since …" questions still find archived facts.

## 2. Scope Boundaries

**✅ IN-SCOPE (Build This)**
- [ ] **`archive/` folder** in the content folder: `archive/<same path as in pages/>`, in the same page format (frontmatter, Facts, citations). A whole finished entity page can move there too.
- [ ] **Conservation rule at `ingest finish`:**
  - A fact line dropped from `pages/<p>.md` is allowed only when the identical line (the same `factKey`) is in `archive/<p>.md` after the write.
  - A deleted page is allowed only when each of its fact lines is still somewhere in `pages/` or `archive/` after the write. Merging a duplicate page into another one keeps working; deleting a page whose facts are nowhere else is refused with `fact lines dropped`, naming the page and the lines.
  - A fact line dropped from `archive/`, or an archive page deleted, is refused (`archived fact lines dropped`). The lock is kept so the writer can restore it, as today.
- [ ] **Write phase covers `archive/`:**
  - `ingest apply` snapshots it with `pages/`.
  - `ingest abort` restores both.
  - The diff lists archive changes, and archive writes are not "outside pages/".
  - Archive pages need valid frontmatter, but they don't need to cite the current source; their lines keep their own citations.
- [ ] **The finish report** adds `archived N fact lines · M pages` (metadata only, D-08).
- [ ] **What skips the archive:**
  - `index.md` is built from `pages/` only. One line gives the number of archived pages and points to `search --archive`.
  - Default search skips it. `search --archive` includes archived pages, and their hits carry `archived: true`.
  - `--since` and `--entity` include archived facts, marked archived, so history questions still work.
  - The search cache keys on the archive too.
- [ ] **Lint:**
  - A link to a name that exists only in `archive/` is not broken.
  - A name in both resolves to the live page.
  - Orphan, uncited-claim and stale-fact checks skip `archive/`.
  - `unlogged-change` covers `archive/` too.
- [ ] **`wikeeper status`** shows the archive's size next to the wiki total (EPIC-007), and lists `archive_candidates`, which the agent tells the user about and the user decides on:
  - pages at or above the page red limit (EPIC-007);
  - entities with a final status whose newest fact is older than `lint.stale_after_days`. Final statuses are the ones in `FINAL_STATUSES`, e.g. shipped, closed, done.
- [ ] **Agent instructions** (`WIKI.md`, wiki-search skill):
  - How the writer moves a fact line: cut it from the page, add it unchanged to the archive file, and leave a link on the page to its archive.
  - Before deleting a page, move each of its fact lines unchanged to the page it merges into, or to the archive.
  - Ordinary ingests keep recording as today: a replaced fact stays on the page, and nothing moves to the archive.
  - When a page turns red or `status` lists candidates, tell the user once, with both choices: raise the limit (`wikeeper config set tokens.page.red …`) or ask for a clean-up. Never start a clean-up the user didn't ask for.
  - How to run a clean-up: the user's decision on stdin to `ingest start -`, then the write phase.
  - When to search with `--archive`.
- [ ] **Ownership and privacy:**
  - `remove` keeps `archive/`, and `remove --purge` deletes it.
  - A `private:` entry also hides that page's archive file from git.
- [ ] **Docs:** `architecture.md` (§4 layout, §4.1 ownership, §8 knowledge model, a new decision entry) and the README.

**❌ OUT-OF-SCOPE (Do NOT Build This)**
- Deleting facts, or any automatic archive move made by the CLI.
- Model-based judgement inside the CLI of what is outdated; the agent judges.
- Deleting content for good inside an ingest, for example a sensitive line ingested by mistake. That stays a hand edit outside an ingest, which `unlogged-change` reports, as it is for a single line today.
- Compressing or summarising archived facts.
- Archiving raw sources or source pages (`sources/<id>.md`).

## 3. The Reality Check (Context)

| Constraint Type | Limit / Rule |
|---|---|
| Safety | The conservation rule is the only way a fact line can leave `pages/`. It is checked by `ingest finish` and covered by tests for move, drop and restore. |
| Compatibility | Wikis without `archive/` behave exactly as today. The rule that refuses dropped fact lines stays unchanged unless the line is in the archive. |
| Traceability | Every move has a source and a log entry (principle 3): the user's clean-up decision, captured from chat. |
| Sequencing | After EPIC-007, which provides the page gauge and red limit used for candidates. |

## Existing Surfaces

- **Surface:** `src/ingest/validate.ts:44` — `validateIngest` builds the `dropped` list (`fact lines dropped`). The conservation rule changes this check. It reads only created and updated pages (`src/ingest/validate.ts:53`), so deleted pages are never checked today.
- **Surface:** `src/ingest/snapshot.ts:71` — `takeSnapshot` copies `pages/` only; `hashOutside` (`src/ingest/snapshot.ts:58`) tracks `index.md`, `log/` and `raw/`.
- **Surface:** `src/ingest/index-builder.ts:25` — `buildIndex`.
- **Surface:** `src/search/engine.ts:240` — `loadSearchCorpus` lists `pages/` only.
- **Surface:** `src/lint/links.ts:14` — `linkResolver`; `src/lint/staleness.ts:11` — `FINAL_STATUSES`.
- **Surface:** `src/core/gitignore.ts:73` — `managedIgnoreEntries` (`private:` entries); `src/commands/remove.ts:216` — the content folders `remove` keeps and `--purge` deletes.
- **Coverage of this epic's scope:** about 80% extension. The write phase, snapshot, diff, report, search, lint and status all exist; the new part is a second page tree and the rule linking it to `pages/`.

## Prior work

- No prior work on an archive folder or on moving facts out of pages (cleargate-wiki-query, 2026-10-18).
- [[CR-003]] (B1) and [[STORY-003-12]]: added the `fact lines dropped` refusal that this epic relaxes into the conservation rule.
- [[STORY-005-08]]: the stale-fact check and `FINAL_STATUSES`, reused for candidates.
- [[STORY-005-03]]: `unlogged-change`, which must cover `archive/`.
- [[EPIC-004]] and [[STORY-004-06]]: search and its cache, which gain `--archive`.
- [[EPIC-007]]: the page gauge and limits.

## Why not simpler?

- **Smallest existing surface that could carry this epic:** the ingest write phase (`src/commands/ingest-apply.ts`, `src/commands/ingest-finish.ts`) with `validateIngest`.
- **Why isn't extension / parameterization / config sufficient?** It is mostly extension: no new lifecycle commands. An archive pass reuses the chat-excerpt ingest WIKI.md already uses for corrections. That gives it a lock, snapshot, abort, log entry and report for free. Two things can't be config:
  - a second page tree that default reads skip;
  - the conservation rule. Without the rule, allowing dropped lines would let a full-page rewrite lose facts silently, which is the reason [[CR-003]] made it a refusal.

## 4. Technical Grounding (The "Shadow Spec")

**Affected Files:**
- `src/core/paths.ts` — `archiveDir` (`<content_dir>/archive`).
- `src/ingest/snapshot.ts`, `src/ingest/diff.ts` — snapshot, restore and diff `archive/` with `pages/`.
- `src/ingest/validate.ts` — the conservation rule (dropped lines and deleted pages) and archived-line protection; archive pages exempt from citing the source.
- `src/ingest/report.ts`, `src/commands/ingest-finish.ts` — archived counts in the report.
- `src/ingest/index-builder.ts` — `pages/` only, plus the archived-pages line.
- `src/search/engine.ts`, `src/commands/search.ts` — `--archive`, archived facts in `--since` and `--entity`, the cache key.
- `src/lint/links.ts`, `src/lint/unlogged.ts` — link resolution and unlogged changes for `archive/`.
- `src/commands/status.ts` — `archive_candidates`.
- `src/core/gitignore.ts`, `src/commands/remove.ts` — privacy, remove and purge.
- `templates/system/WIKI.md`, `templates/skills/wiki-search/SKILL.md` — instructions.
- `architecture.md`, `README.md` — docs.

**Data Changes:**
- New folder `<content_dir>/archive/`, user-owned, mirroring `pages/` paths.
- JSON fields:
  - `ingest finish` report: `archived: { facts, pages }`
  - `status`: `archive_candidates: [{ path, reason: "size" | "final-status", tokens?, status? }]`
  - search hits: `archived: boolean`
- `index.md` gains one line when archived pages exist.

## 5. Acceptance Criteria

```gherkin
Feature: Fact archive

  Scenario: A replaced fact moves to the archive
    Given pages/projects/atlas.md has the fact line "- 2026-09-01 · tentative · atlas ships 2026-10-15 [[src-a]]"
    And the user asks for a clean-up, and its write phase cuts that line and adds it unchanged to archive/projects/atlas.md
    When I run "wikeeper ingest finish <id>"
    Then it exits 0, and the report says "archived 1 fact lines · 0 pages"

  Scenario: Default search skips the archive; --archive and history include it
    Given that archived line
    When I run "wikeeper search 2026-10-15"
    Then no hit comes from archive/
    When I run "wikeeper search 2026-10-15 --archive --json"
    Then a hit from archive/projects/atlas.md has archived true
    And "wikeeper search --entity atlas --json" lists the fact marked archived

  Scenario: A finished entity is an archive candidate
    Given pages/projects/beta.md has status:: shipped and its newest fact is 45 days old, with lint.stale_after_days 30
    When I run "wikeeper status --json"
    Then archive_candidates lists projects/beta.md with reason "final-status"

  Scenario: A link to an archived page is not broken
    Given beta's page was moved whole to archive/projects/beta.md and another page links [[beta]]
    When I run "wikeeper lint --json"
    Then no broken-link finding names [[beta]]

  Scenario: Error — a fact line dropped without archiving is refused
    Given a write phase that deletes a fact line from pages/projects/atlas.md and does not add it to the archive
    When I run "wikeeper ingest finish <id>"
    Then it exits 1 with "fact lines dropped", names the line, and keeps the lock

  Scenario: Error — a line removed from the archive is refused
    Given a write phase that deletes a line from archive/projects/atlas.md
    When I run "wikeeper ingest finish <id>"
    Then it exits 1 with "archived fact lines dropped" and keeps the lock

  Scenario: Merging a duplicate page is allowed
    Given pages/people/designer.md and pages/people/design-lead.md describe the same person
    And a write phase copies every fact line of design-lead.md into designer.md and deletes design-lead.md
    When I run "wikeeper ingest finish <id>"
    Then it exits 0

  Scenario: Error — deleting a page whose facts are nowhere else is refused
    Given a write phase that deletes pages/projects/beta.md and copies none of its fact lines elsewhere
    When I run "wikeeper ingest finish <id>"
    Then it exits 1 with "fact lines dropped", names projects/beta.md and its lines, and keeps the lock

  Scenario: Abort restores pages and archive
    Given a write phase that moved lines into the archive
    When I run "wikeeper ingest abort <id>"
    Then pages/ and archive/ match the snapshot
```

## 6. AI Interrogation Loop (Human Input Required)

- None. On 2026-10-18 the human decided that ordinary ingests keep recording as today; the user is kept aware of sizes and either raises a limit or asks for a clean-up (§0 rules, §2 agent instructions).

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Coding Agent):
- [x] `approved: true` is set in the YAML frontmatter.
- [x] The `<agent_context>` block is complete and validated.
- [x] §4 Technical Grounding contains 100% real, verified file paths.
- [x] §6 AI Interrogation Loop is empty (all human answers integrated into the spec).
- [x] 0 "TBDs" exist in the document.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered.
