---
story_id: STORY-008-06
parent_epic_ref: EPIC-008
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-008 §0 rules, §2 'Agent instructions' and 'Docs' bullets, §6 human decision (approved by the human 2026-10-18, Gate 1: ordinary ingests keep recording as today; the agent tells the user once when a page turns red or status lists candidates and offers both choices; never starts a clean-up unasked; a clean-up is a chat-excerpt ingest of the user's decision) · EPIC-007 (approved 2026-10-18; page limits) · SPIKE-003 (Completed 2026-10-18) · SPRINT-04 decomposition brief, plans/decomposition.md (contracts K9–K13; the commands at the end of SPRINT-04; shared files 007-07 → 008-06) · STORY-007-07 (the size text this story builds on) · verified 2026-10-18: templates/system/WIKI.md, templates/skills/wiki-search/SKILL.md, templates/agents/*/wiki-writer.*, templates/system/schemas/facts.schema.json, src/ingest/validate.ts, src/lint/citations.ts, src/lint/links.ts, src/lint/staleness.ts, src/commands/status.ts, test/templates/structure.ts, test/templates/sprint-03-commands.red.node.test.ts, test/templates/writing-and-answering-text.red.node.test.ts, architecture.md, README.md"
actor: AI coding agent (main agent or sub-agent) operating the wiki
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-008-02
  - STORY-008-03
  - STORY-008-04
  - STORY-008-05
  - STORY-007-07
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T08:00:00Z
updated_at: 2026-10-18T08:00:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T08:08:43Z
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
  last_stamp: 2026-10-18T11:50:28Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: ""
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-18T10:23:32Z
---

# STORY-008-06: Archive instructions and docs
**Complexity:** L2 — text in five WIKI.md sections and one wiki-search skill sentence, architecture.md and the README, one `DOCUMENTED_FORMS` entry and one QA-Red content test. No new command, section or red-test re-scope. It lands after STORY-007-07 on the same files and builds on its size text.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent running a wikeeper wiki (for this human: product management), I want WIKI.md and the wiki-search skill to tell me that ordinary ingests keep every fact on its page, how to tell the user about red pages and archive candidates and offer both choices, how to run a clean-up when the user asks for one, how to move a fact line or a whole page to `archive/` and delete a page without losing a line, what each refusal means, and when to search the archive, so that the wiki shrinks only when the user decides and no fact is ever lost.

### 1.2 Detailed Requirements

The text names only the commands and flags that exist at the end of SPRINT-04. It starts from WIKI.md and the skill as STORY-007-07 leaves them. Each quoted text below is the text to write; WIKI.md lines are cited at `6b75807`.

- **R1 — The clean-up (EPIC-008 §0, §2, §6; K9, K10).** WIKI.md section "Write phase" gains, after the paragraph that starts "If `finish` fails" (`templates/system/WIKI.md:80`):
  - "A clean-up moves facts the user no longer needs on a page into `archive/`, which keeps them. Run one only when the user asks for it, and never start one yourself; an ordinary ingest moves nothing to `archive/`. In a clean-up:"
  - "- Pick what to move: fact lines that a newer line on the same page replaced, and the fact lines of entities with a final status, such as shipped, closed or done (the whole page when the page is that entity). Keep the newest line of each fact and everything still open. Show the user the lines and pages, and move only what they approve."
  - "- Run `wikeeper ingest start -` with the user's decision on stdin, adding `--kind <kind>` as section "Ambient offers" says, then `wikeeper ingest facts <id>` with a facts file whose `facts` list is empty, then the write phase. Do it yourself: a `wiki-writer` writes only under `pages/`."
  - "- To move a fact line, cut it from `pages/<path>` and add it unchanged to `archive/<path>`, the same path under `archive/`. An archive page has the page's frontmatter, a `summary` saying it holds archived facts, and the moved lines under `## Facts`, oldest first; on a multi-entry page, keep each line under its entry's `##` heading. On the page, put the typed line `archive:: [[archive/<path>]]` with its typed links, `<path>` written without `.md` (for example `archive:: [[archive/projects/atlas]]`); it is the one link written by path, because it names the archive page, not an entity. Rewrite the Summary if it named a moved fact, and add the clean-up's source id to `sources`."
  - "- To move a whole page, create `archive/<path>` with all of its text and delete `pages/<path>`. Links to it still resolve."
  - "- Write `sources/<id>.md` and run `wikeeper ingest finish <id>`. Its report adds `archived N fact lines · M pages`. When a page is still 🔴, tell the user."
  - "A later source about an archived entity gets a new page in `pages/`; leave its archive page as it is."
- **R2 — Deleting a page (K10).** In the paragraph at `:80`, "Deleting a whole page stays allowed, and the report counts it." becomes: "Before you delete a page, for example to merge a duplicate into another page, copy each of its fact lines unchanged to the page it merges into; in a clean-up you may move them to `archive/` instead. `finish` refuses a deleted page whose fact lines are nowhere else in `pages/` or `archive/`, with `fact lines dropped`, naming the page and its lines."
- **R3 — Ordinary ingests keep recording as today (EPIC-008 §6).**
  - (a) Step 6 (`:75`) ends with: "Only merging a duplicate page and a clean-up move lines off a page (below)."
  - (b) Step 7 (`:76`) becomes: "7. Write nothing outside `pages/`, except `archive/` in a clean-up (below)."
  - (c) Section "Page format" (`:141`): after "A replaced fact stays in the list; the newer line carries the change." add "Only a clean-up the user asks for moves facts to `archive/` (section "Write phase")."
- **R4 — The refusals (K10).** In the paragraph at `:80`:
  - (a) "When `finish` refuses with `fact lines dropped`, put each named line back exactly as it was and run `wikeeper ingest finish <id>` again; the lock is still held." becomes: "When `finish` refuses with `fact lines dropped`, put each named line back exactly as it was or, in a clean-up, add it unchanged to `archive/<path>`; then run `wikeeper ingest finish <id>` again; the lock is still held. When it refuses with `archived fact lines dropped`, put each named line back in its archive page exactly as it was, or restore the deleted archive page: no line ever leaves `archive/`."
  - (b) "change nothing under `pages/`." becomes "change nothing under `pages/` or `archive/`."
- **R5 — Telling the user (EPIC-008 §2, §6; K13). WIKI.md section "Lint and status", on STORY-007-07's text.**
  - (a) STORY-007-07 R5 (b) 4: "and offer to raise the page limit for them; on a yes, run `wikeeper config set tokens.page.red <n>`" becomes "and offer both choices in plain words: you raise the page limit for them (on a yes, `wikeeper config set tokens.page.red <n>`), or they ask for a clean-up, which moves replaced and finished facts to `archive/` and keeps them (section "Write phase")"; "never change a limit yourself" becomes "never change a limit or start a clean-up yourself". "Once in the session" keeps STORY-007-07 §1.4 Q3's meaning.
  - (b) The `oversized-page` row (STORY-007-07 R5 (d)) becomes: "| `oversized-page` | A page is at or above `tokens.page.red`. Tell the user once in the session, as said above: they raise the limit or ask for a clean-up; an ordinary ingest never shrinks a page. |"
  - (c) A status-field bullet after `tokens`: "- `archive`: the size of `archive/`: its `pages` and estimated `tokens`. They are not counted in `tokens`, and a search skips them unless it runs with `--archive`."
  - (d) A status-field bullet after it: "- `archive_candidates`: pages a clean-up could shrink, each with its `reason`: `size` (at or above `tokens.page.red`) or `final_status` (an entity with a final status whose newest fact is older than `lint.stale_after_days`). Tell the user about them once in the session: for `size`, the red-page notice above, told once with it; for `final_status`, a clean-up that moves that entity's fact lines to `archive/` (the whole page when the entity is the page), or leaving it. Never start a clean-up yourself." (A final_status candidate can be a section entity on a page with live entities, STORY-008-05 R2, so "moves the whole page" was changed by the consistency audit, 2026-10-18.)
  - (c) and (d) must land in the commit that adds the `archive` and `archive_candidates` status keys (§1.4 Q2). Under the recommended answer STORY-008-05 writes them with this text (its R8 carries it verbatim), and this story checks them and changes nothing else in them.
- **R6 — Searching the archive (K11).**
  - (a) WIKI.md section "Search", a bullet after `--since` (`:226`): "- `--archive`: also search `archive/`, where clean-ups keep replaced and finished facts; its hits carry `archived: true`. `--since` and `--entity` always include archived facts, marked `archived: true`."
  - (b) Section "Answering questions", after the numbered list (`:239`): "When a question is about the past, such as an earlier plan, date or owner, and the pages do not answer it, search again with `--archive`."
- **R7 — wiki-search skill.** `templates/skills/wiki-search/SKILL.md:10`, after STORY-007-07's sentence, gains: "When a question about the past finds no answer, search again with `--archive` (section "Search")." Frontmatter, description and the named sections are unchanged, and the skill still says nothing of `--no-miss` (`test/templates/rules-and-search-text.red.node.test.ts:299`).
- **R8 — Docs.**
  - (a) `architecture.md` §4 (`:29`): the tree gains `archive/` above `pages/`, "facts moved out of pages/ in a clean-up; same paths and page format (§8)"; the `content_dir` sentence (`:52`) lists `archive/` with `pages/`, `raw/`, `index.md` and `log/`.
  - (b) §4.1 (`:66`): the `raw/**`, `pages/**` row covers `archive/**` (user-owned, kept by `remove`, deleted by `remove --purge`).
  - (c) §7.3 (`:304`): `ingest apply` snapshots pages and the archive, `ingest abort` restores both, and `finish`'s validate step names the conservation rule.
  - (d) §8 (`:441`): the "Two layers per page" bullet says replaced facts stay until a clean-up the user asks for moves them to `archive/`; a new "Archive" bullet: same paths and page format; a dropped line must be in `archive/` at the same path, a deleted page's lines must be somewhere in `pages/` or `archive/`, no line leaves `archive/`; the index, default search and page lint skip it; `search --archive`, `--since` and `--entity` include it; `status` lists candidates; the agent judges, the CLI checks.
  - (e) §10 (`:463`): the `search` row adds `--archive`; the `remove [--purge]` row says `remove` keeps `archive/` and `--purge` deletes it. §11 (`:481`): the `content_dir` comment lists `archive/`.
  - (f) §13 (`:511`): "D-37 | Outdated facts move from pages/ to archive/ only in a clean-up the user asks for. `ingest finish` refuses a fact line that leaves pages/ without reaching archive/, and any line that leaves archive/." (the next free number if another entry lands first).
  - (g) `README.md`: How It Works item 2 (`README.md:69`) says "keeps the immutable original in `.wiki/raw/`" in place of "archives the immutable original in `.wiki/raw/`", so "archive" keeps one meaning; item 4 (`README.md:71–74`) says the snapshot covers `.wiki/archive/` and that `finish` refuses a dropped fact line unless the identical line moves to `.wiki/archive/` in a clean-up you asked for; the CLI table's `search` row adds `--archive` and the `remove` row says the archive is kept; a short "Fact archive" paragraph (ordinary ingests keep every fact, the agent offers a clean-up or a higher limit when a page turns 🔴, nothing is deleted); the decision-log range (`README.md:164`) becomes `D-01`–`D-37`.
- **R9 — Structural template tests.** `DOCUMENTED_FORMS` (`test/templates/structure.ts:467`) gains `search --archive`. QA-Red writes `test/templates/archive-instructions.red.node.test.ts` from §2.1.
- **R10 — Vocabulary.** The new text names exactly: `wikeeper search --archive`, `wikeeper ingest start -`, `wikeeper ingest facts <id>`, `wikeeper ingest finish <id>`, `wikeeper config set tokens.page.red <n>`; the fields `archived: true`, `archive`, `archive_candidates`, `reason`, `size`, `final_status`, `pages`, `tokens`; the refusals `fact lines dropped` and `archived fact lines dropped`; the report text `archived N fact lines · M pages`; the typed line `archive:: [[archive/<path>]]`; the paths `archive/` and `archive/<path>`, written like `pages/` and never as `.wiki/archive/`, which `checkPaths` reports as unknown (`test/templates/structure.ts:238`).
- **R11 — Invariants.** (a) Every command, flag and section named exists when this story merges (`test/templates.test.ts:113`). (b) WIKI.md keeps its 14 `##` sections and at most 400 lines. (c) The Delegation table keeps its four rows (`test/templates/writing-and-answering-text.red.node.test.ts:351`). (d) "Write phase" keeps "fact lines dropped", "new dated line", "exactly as it was", "wikeeper ingest start -", "correction" and "change nothing under `pages/`" (the same file, `:233–234`). (e) The pointer block, SETUP.md, the six sub-agent prompts and the wiki-ingest skill are not touched. (f) No red test changes.

### 1.3 Out of Scope
- The archive behaviour itself: paths, guard, snapshot and diff (STORY-008-01), the conservation rule and the report counts (STORY-008-02), index and search (STORY-008-03), lint (STORY-008-04), status, `remove`, `--purge` and `private:` (STORY-008-05).
- The size text, the session line, the allow rules and version 0.4.0 (STORY-007-07).
- Changing the sub-agent prompts: a clean-up's write phase is the main agent's (§1.4 Q3).
- Deleting a fact for good, such as a sensitive line ingested by mistake: that stays a hand edit outside an ingest, which `unlogged-change` reports (EPIC-008 §2, out of scope).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question:** Q1 (the same question as STORY-008-04 §1.4 Q2). EPIC-008 says the writer leaves "a link on the page to its archive". What form? `[[projects/atlas]]` or `[[Atlas]]` names the live page, because links resolve to the live page first (K12).
- **Recommended (agreed with STORY-008-04 by the consistency audit, 2026-10-18):** the typed line `archive:: [[archive/<path>]]`, `<path>` without `.md` (R1). STORY-008-04 R3 gives every archive page the extra link key `archive/<path>`, which no live page has, so the link resolves to the archive page and `broken-link` catches a wrong path. Being a `key::` line, it is not a claim (`TYPED_RE`, `src/lint/citations.ts:17`), so it needs no inline citation; a bare prose `[[archive/…]]` line would be an `uncited-claim` error. It follows WIKI.md's typed-link form `key:: [[target]]` (`templates/system/WIKI.md:143`), with one stated exception to "never by path". The draft's first answer, `archive:: archive/<path>` with no brackets, is checked by nothing and is not a link. Alternative: a markdown link with a relative path (`[archived facts](../../archive/projects/atlas.md)`), clickable on GitHub but depth-dependent and checked by nothing.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question:** Q2. STORY-008-05 adds `archive` and `archive_candidates` to `status --json`. On its tree the check that status bullets equal the status keys (`test/templates/sprint-03-commands.red.node.test.ts:307`) fails until WIKI.md has the two bullets, and this story merges later. Who writes them?
- **Recommended:** STORY-008-05, in the commit that adds the keys, with the text of R5 (c) and (d), the same answer as STORY-007-07 Q4 for `tokens` and `oversized-page`. WIKI.md's order becomes 007-05 → 008-05 → 007-07 → 008-06. STORY-008-05 R8 now carries the text verbatim (consistency audit, 2026-10-18).
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question:** Q3. Who writes a clean-up? The `wiki-writer` prompts say "Write only under .wiki/pages" and "Keep every fact line a page already has" (`templates/agents/claude/wiki-writer.md:13`, the same in all three agents), and the writer never sees the user's decision.
- **Recommended:** The main agent, which holds the decision; the prompts stay as they are (R1, second bullet). A clean-up is rare and user-driven; giving the writer archive rules would change six prompts whose text must stay identical across agents.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question:** Q4. EPIC-008 says the agent judges what is replaced or finished. Does it move what it judged, or show it first?
- **Recommended:** Show the lines and pages and move only what the user approves (R1, first bullet), before `ingest start`, so the decision on stdin is the approved list and the source records what the user chose.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

Settled and not reopened: the conservation rules (K10), what default search and lint skip (K11, K12), the candidate reasons (K13), and the merge order 007-07 → 008-06 on WIKI.md, the wiki-search skill, architecture.md and README.md. "Once in the session" follows STORY-007-07 §1.4 Q3.

- **DRAFTS review (designer, 2026-10-18):** wording aligned with docs/ux.md — the red-page clause starts from STORY-007-07's new text and offers both choices in plain words, with the agent running `wikeeper config set tokens.page.red <n>` on a yes (R5 (a), §2.1 "telling (R5)"); the `size` reason points at the red-page notice, told once with it, still byte-equal to STORY-008-05 R8 (b) (R5 (d)); README item 2 says "keeps" for `.wiki/raw/`, so "archive" means only `archive/` (R8 (g)); the report counts take the plural helper (`archived 1 fact line · 0 pages`; §1.5, §2.1 scenario 2). No decision changed.

- **Plan confirmation (human, 2026-10-18):**
  - P10: the candidate reason is `final_status`, snake_case like every code (R5 (d), R10, §2.1 "telling (R5)" and scenario 4, §3.3, Existing Surfaces); R5 (d) stays byte-equal to STORY-008-05 R8 (b).

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** The text describes four surfaces drafted in parallel (K10–K13); a renamed refusal, field or reason makes it wrong.
- **Mitigation:** Every owner story is a predecessor; scenarios 2–4 run a clean-up, the refusals and `status` and compare the names the text uses with the real output.
- **Risk:** Scenario 2's report counts assume K10 counts a whole moved page as one archived page plus its fact lines, and a moved line as a fact line only (EPIC-008 §5: one moved line reports "archived 1 fact line · 0 pages").
- **Mitigation:** QA-Red takes the counts from STORY-008-02's frozen definition; only the expected numbers change if it differs.
- **Risk:** A clean-up's facts file has an empty `facts` list. The schema allows it (no `minItems`, `templates/system/schemas/facts.schema.json:31`), but no ingest has used one.
- **Mitigation:** Scenario 2 runs one from `ingest start -` to `ingest finish`; a refusal there goes back to the owner of that step.
- **Risk:** Every live page a clean-up changes must cite the clean-up's source, or `finish` reports it uncited (`citesSource`, `src/ingest/validate.ts:36`).
- **Mitigation:** R1 tells the agent to add the source id to `sources`; scenario 2 checks it.
- **Risk:** STORY-007-07 changes the same paragraphs first; a stale base drops its text.
- **Mitigation:** STORY-007-07 is a predecessor; this story edits its sentences in place and scenario 1 checks both stories' phrases.
- **Risk:** WIKI.md grows to about 342 of 400 lines.
- **Mitigation:** One sentence per rule; scenario 1's last step checks the cap.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.** One row per axis. `T` = at least one scenario below carries the axis tag
(`@paths`, `@interfaces`, `@data`, `@rules`). `F` = no scenario carries it, and the row states
why. There is no Spike row: open discovery is chartered as a SPIKE item (`templates/spike.md`)
before this item is written.

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | A clean-up moves single fact lines or a whole page; a merge moves lines to another live page. |
| Interfaces | T | The same guidance reaches the agent through WIKI.md and the wiki-search skill, and the reader through architecture.md and the README. |
| Data | T | One row per instruction and file part; one row per refusal. |
| Rules | T | No line leaves `pages/` without reaching `archive/`, none leaves `archive/`, a deleted page's lines must survive, and a form the CLI lacks fails the checks. |

```gherkin
Feature: Archive instructions and docs

  @data @interfaces
  Scenario Outline: Each archive instruction lands in its file and part
    Given the templates tree and docs after this story
    Then <part> of <file> contains <phrases>

    Examples:
      | item              | file                                  | part                        | phrases |
      | clean-up (R1)     | templates/system/WIKI.md              | section "Write phase"       | "only when the user asks", "never start one yourself", "move only what they approve", "wikeeper ingest start -", "`facts` list is empty", "a `wiki-writer` writes only under `pages/`" |
      | moving (R1)       | templates/system/WIKI.md              | section "Write phase"       | "`archive/<path>`", "unchanged", "`archive:: [[archive/<path>]]`", "`sources`", "oldest first" |
      | whole page (R1)   | templates/system/WIKI.md              | section "Write phase"       | "To move a whole page", "Links to it still resolve", "`archived N fact lines · M pages`" |
      | deleting (R2)     | templates/system/WIKI.md              | section "Write phase"       | "Before you delete a page", "the page it merges into", "nowhere else in `pages/` or `archive/`" |
      | ordinary (R3)     | templates/system/WIKI.md              | section "Write phase"       | "an ordinary ingest moves nothing to `archive/`", "except `archive/` in a clean-up" |
      | ordinary (R3)     | templates/system/WIKI.md              | section "Page format"       | "A replaced fact stays in the list", "Only a clean-up the user asks for" |
      | refusals (R4)     | templates/system/WIKI.md              | section "Write phase"       | "`fact lines dropped`", "`archived fact lines dropped`", "exactly as it was", "no line ever leaves `archive/`", "change nothing under `pages/` or `archive/`" |
      | telling (R5)      | templates/system/WIKI.md              | section "Lint and status"   | "offer both choices", "or they ask for a clean-up", "never change a limit or start a clean-up yourself", "`final_status`", "Never start a clean-up yourself" |
      | status lines (R5) | templates/system/WIKI.md              | section "Lint and status"   | "- `archive`: ", "- `archive_candidates`: ", "`reason`", "`lint.stale_after_days`" |
      | search (R6)       | templates/system/WIKI.md              | section "Search"            | "`--archive`", "`archived: true`", "`--since`", "`--entity`" |
      | answering (R6)    | templates/system/WIKI.md              | section "Answering questions" | "about the past", "`--archive`" |
      | skill (R7)        | templates/skills/wiki-search/SKILL.md | body                        | "`--archive`", "about the past", "`page_tokens`" |
      | architecture (R8) | architecture.md                       | §4, §4.1 and §8             | "archive/", "`archive/**`", "clean-up" |
      | architecture (R8) | architecture.md                       | §13                         | "D-37", "only in a clean-up the user asks for" |
      | README (R8)       | README.md                             | body                        | ".wiki/archive/", "--archive", "D-37" |

  @paths
  Scenario Outline: A clean-up run as the text says is accepted
    Given a temp git wiki with ingest.permission "ai" whose finished ingests wrote <setup>
    When the agent runs "wikeeper ingest start -" with "<decision>" on stdin, "wikeeper ingest facts <id>" with an empty facts list and "wikeeper ingest apply <id>"
    And it moves <what> as section "Write phase" says, adds the source id to the changed pages' sources and writes sources/<id>.md
    Then "wikeeper ingest finish <id>" exits 0 and its report says "<report>"
    And "wikeeper lint --json" reports no broken-link, uncited-claim or unlogged-change finding
    And "wikeeper search <term>" has no hit from archive/, and "wikeeper search <term> --archive --json" has a hit from <archived> with archived true

    Examples:
      | setup                                                                  | decision                                 | what                                                                  | report                          | term       | archived                  |
      | pages/projects/atlas.md with "atlas ships 2026-10-15" and a newer date | Archive the replaced Atlas launch date.  | that line to archive/projects/atlas.md, with "archive:: [[archive/projects/atlas]]" on the page | archived 1 fact line · 0 pages | 2026-10-15 | archive/projects/atlas.md |
      | pages/projects/beta.md with status:: shipped and two fact lines, linked as [[Beta]] from another page | Archive the finished Beta project. | the whole page to archive/projects/beta.md                            | archived 2 fact lines · 1 page | beta       | archive/projects/beta.md  |

  @rules @data
  Scenario Outline: The refusals the text names, and the recovery it gives
    Given a temp git wiki with finished pages projects/atlas.md, projects/beta.md, people/designer.md, people/design-lead.md and archive/projects/atlas.md
    And an open write phase in which <change>
    When I run "wikeeper ingest finish <id> --json"
    Then it <result>
    And after <recovery>, "wikeeper ingest finish <id>" exits 0

    Examples:
      | change                                                              | result                                                                       | recovery |
      | a fact line is deleted from pages/projects/atlas.md and not archived | exits 1 with "fact lines dropped", names the line and keeps the lock        | the line is put back exactly as it was |
      | a line is deleted from archive/projects/atlas.md                     | exits 1 with "archived fact lines dropped" and keeps the lock               | the line is put back exactly as it was |
      | pages/projects/beta.md is deleted and its lines are nowhere else     | exits 1 with "fact lines dropped", names projects/beta.md and its lines     | its lines are added unchanged to archive/projects/beta.md |
      | every fact line of people/design-lead.md is copied to people/designer.md and design-lead.md is deleted | exits 0                                         | nothing more |

  @rules @interfaces
  Scenario: The status guidance matches what status reports
    Given a temp git wiki whose pages/projects/gamma.md has status:: shipped and a newest fact 45 days old, with lint.stale_after_days 30
    When I run "wikeeper status --json"
    Then the fields that open a status bullet in section "Lint and status" are exactly the keys of data, "archive" and "archive_candidates" among them
    And data.archive_candidates lists projects/gamma.md with reason "final_status", and the reasons the "archive_candidates" bullet names are exactly "size" and "final_status"
    And WIKI.md keeps its fourteen sections in order and at most 400 lines, its Delegation table keeps four rows, and the files R11 (e) names are byte-identical to the base

  @rules
  Scenario Outline: Error — a form the CLI does not have, or a missing one, fails the checks
    Given a copy of the templates directory where <change>
    When the checks of test/templates/structure.ts run on the copy
    Then they report <finding>

    Examples:
      | change                                                              | finding |
      | WIKI.md section "Search" contains "`wikeeper search --archived`"    | '"--archived" is not an option of "search"', with its line |
      | no template names "wikeeper search --archive"                       | '"wikeeper search --archive" is named by no template' |
```

### 2.2 Verification Steps (Manual)
- [ ] Walkthrough in a scratch copy of the testbed (`testbed.md`, Making a scratch copy), one fresh copy per session where a session's changes affect the next: ingest a status update that replaces a date, for example one that moves atlas GA again; check that the old line stays on the page and nothing moves to the archive.
- [ ] Lower `tokens.page.red` to 6k so that `decisions.md` and `risks.md` are 🔴 (testbed.md "Pages for specific checks"); check that the agent says so once, offers both choices, and starts nothing. Decline both and check that it does not repeat itself in that session.
- [ ] Ask for a clean-up of the replaced atlas GA dates (testbed.md "Superseded facts"); check that the agent shows what it would move, waits for approval, records the decision as a chat ingest, moves only the approved lines, and shows the report's archived counts.
- [ ] Ask about an old date that only the archive holds, such as an atlas GA date the clean-up moved; check that the agent searches again with the archive before saying the wiki does not know.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `templates/system/WIKI.md` |
| Related Files | `templates/skills/wiki-search/SKILL.md`, `architecture.md`, `README.md` |
| Test Files | `test/templates/structure.ts` |
| New Files Needed | `test/templates/archive-instructions.red.node.test.ts` (written by QA-Red) |

- **Read, not edited:** `templates/agents/*/wiki-writer.*` (§1.4 Q3), `templates/skills/wiki-ingest/SKILL.md` (it already lists "Write phase" and "Lint and status"), `src/ingest/validate.ts`, `src/lint/citations.ts`, `src/lint/links.ts`, `src/lint/staleness.ts` (`FINAL_STATUSES`).
- **Red tests:** none re-scoped. The status-field check (`test/templates/sprint-03-commands.red.node.test.ts:307`) passes once R5 (c) and (d) are in, whoever writes them (§1.4 Q2).

### 3.2 Technical Logic
- **Base.** Start from the tree with STORY-007-07 and 008-02 … 008-05 merged (and, under Q2, 008-05's two WIKI.md bullets). Edit "Write phase" (R1–R4) in reading order: steps 6 and 7, the failure paragraph, then the clean-up paragraph and its bullets; then "Page format" (R3 (c)), "Search" and "Answering questions" (R6), "Lint and status" (R5 (a), (b)), and the skill (R7). STORY-007-07's sentences are edited in place, not repeated.
- **No new section.** The clean-up lives in "Write phase", because it is a write phase; the section list, the skill lists and their red tests stay as they are. The clean-up uses bullets, not numbers, so it does not read as steps 10 onward.
- **Paths.** Write `archive/` and `archive/<path>` like `pages/`, never `.wiki/archive/` (R10). Section references use `section "<Heading>"`; no sentence puts "section" within 40 characters of a quoted string that is not a heading (FLASHCARD `#templates #sections`).
- **QA-Red test.** `test/templates/archive-instructions.red.node.test.ts` reads sections as `test/templates/sprint-03-commands.red.node.test.ts:59` does and runs the CLI in-process with `runCli` in temp git repos (FLASHCARD `#qa #test-harness`: `runCli` takes its cwd from `io.cwd`). The pages in scenarios 2 and 3 come from real finished ingests, so their page hashes are recorded and `unlogged-change` stays quiet. Scenario 2 builds the facts file as `{ source_id, kind, rule_version: null, facts: [] }`. The error outline uses `runAllChecks` on a copy of the templates, as `test/templates.test.ts:100` does. Text assertions come before the live runs (FLASHCARD `#qa #red-test`).
- **Docs last.** architecture.md and README.md as R8.

### 3.3 API Contract (if applicable)

No new command, option or export; `DOCUMENTED_FORMS` gains `search --archive`. Consumed, frozen: K9 (`archive/` paths, snapshot and restore), K10 (`fact lines dropped` with deleted pages, `archived fact lines dropped`, the report's `archived` counts and line, archive pages exempt from citing the source), K11 (`search --archive`, `archived: true`, `--since` and `--entity` with archived facts, the index line), K12 (links resolve over pages and archive, live first), K13 (`archive`, `archive_candidates` with `size` and `final_status`).

## Task Breakdown

- [ ] QA-Red: write `test/templates/archive-instructions.red.node.test.ts` from the five scenarios in §2.1 -> R1–R11
- [ ] Edit WIKI.md "Write phase": steps 6 and 7, the failure paragraph, the clean-up paragraph -> R1, R2, R3, R4
- [ ] Edit WIKI.md "Page format", "Search" and "Answering questions" -> R3, R6
- [ ] Edit WIKI.md "Lint and status": the red-page paragraph and `oversized-page` row; check the `archive` and `archive_candidates` bullets -> R5
- [ ] Add the `--archive` sentence to the wiki-search skill -> R7
- [ ] Append `search --archive` to `DOCUMENTED_FORMS` -> R9
- [ ] Update architecture.md §4, §4.1, §7.3, §8, §10, §11, §13 and the README -> R8
- [ ] Run `npm test` in full; check `test/templates.test.ts` reports no finding -> R10, R11

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 1 | `DOCUMENTED_FORMS` holds `search --archive` and `checkCoverage` finds it named |
| Integration tests | 3 | Scenarios 2, 3 and 4 in temp git wikis, in-process with `runCli`, no network |
| E2E / acceptance tests | 24 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately (15 + 2 + 4 + 1 + 2) |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `npm test` passes in full with no red test changed; `test/templates.test.ts` reports no finding on the merged tree.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/system/WIKI.md:75` — step 6, "never move it to another page"; `:76` — step 7, "Write nothing outside `pages/`"; `:80` — the failure paragraph with `fact lines dropped`, "Deleting a whole page stays allowed" and the chat-excerpt correction; `:141` — "A replaced fact stays in the list"; `:226` — the `--since` option; `:236` — "Answering questions".
- **Surface:** `templates/skills/wiki-search/SKILL.md:10` — the skill body R7 extends.
- **Surface:** `templates/agents/claude/wiki-writer.md:13` — the writer writes only under `.wiki/pages` (same in the Antigravity and Codex prompts).
- **Surface:** `src/lint/citations.ts:17` — `TYPED_RE`: a typed line is not a claim; `src/lint/links.ts:14` — `linkResolver` keys pages by path and names, so a name or path link reaches the live page first; STORY-008-04 R3 adds the `archive/<path>` key that only an archive page has, which the R1 typed line uses.
- **Surface:** `src/ingest/validate.ts:36` — `citesSource`; `:53` — every created or updated page must cite the ingest's source.
- **Surface:** `templates/system/schemas/facts.schema.json:31` — `facts` is an array with no `minItems`.
- **Surface:** `src/lint/staleness.ts:11` — `FINAL_STATUSES`, which the `final_status` candidates use.
- **Surface:** `test/templates/structure.ts:238` — `CLI_DIRS`; `:467` — `DOCUMENTED_FORMS`; `test/templates/sprint-03-commands.red.node.test.ts:302` — the status-field check.
- **Surface:** `./architecture.md` §4, §4.1, §7.3, §8, §10, §11, §13; `./README.md` How It Works and the CLI table.
- **Coverage of this requirement:** partial — every section exists; nothing in the templates names `archive/`, a clean-up or `--archive` yet, and "Write phase" still says a whole page may be deleted freely.

## Prior work

- Duplicate check (cleargate-wiki-query, 2026-10-18): nothing overlaps beyond [[EPIC-008]] (parent), [[EPIC-007]] (the page limits and the red-page choice) and [[SPIKE-003]].
- Builds on: [[STORY-007-07]] (the size text it edits in place), [[STORY-006-12]] (fact-line rules, the `fact lines dropped` recovery and the chat-excerpt correction in "Write phase"), [[STORY-006-09]] ("Lint and status", the status bullets and the finding table), [[STORY-006-11]] (`DOCUMENTED_FORMS`), [[CR-003]] and [[STORY-003-12]] (the `fact lines dropped` refusal this epic relaxes), [[STORY-005-08]] (`FINAL_STATUSES`).

## Why not simpler?

- **Smallest existing surface that could carry this:** WIKI.md sections "Write phase", "Lint and status" and "Search".
- **Why isn't extension / parameterization / config sufficient?** It is extension only: sentences in existing sections, one skill sentence and one form in a list. The CLI checks that no fact is lost but cannot judge what is outdated or ask the user; only the instructions keep ordinary ingests from moving facts, tell the agent when to offer a clean-up, and say how to move a line so that `finish` accepts it.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Gate 1: the human approved every §1.4 recommendation on 2026-10-18 (`plans/gate1-decisions.md`).

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding.
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
