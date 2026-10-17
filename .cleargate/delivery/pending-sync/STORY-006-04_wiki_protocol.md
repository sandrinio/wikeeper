---
story_id: STORY-006-04
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-006 (approved 2026-10-16; CR-002 scope addition) · CR-002 B4, B7 (approved 2026-10-16) · architecture.md §7.1–7.6, §8, §9, D-04–D-08, D-16–D-19, D-26, D-28 · SPRINT-02 decomposition brief (commands at end of SPRINT-02; contracts 1, 3, 7, 8, 11, 12, 13 — human decision 2026-10-16, no fixed pages) · verified templates/system/WIKI.md, src/core/config.ts
actor: AI coding agent (main agent or sub-agent) operating the wiki
complexity_label: L3
parallel_eligible: y
dep_predecessors:
  - STORY-004-01
  - STORY-003-06
  - STORY-006-02
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-17T07:30:08Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 3
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T07:30:41Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: 127724c34e476e03828d495c602e6cd6d81d40731703b2acc059a7fff85390ab
stamp_error: no ledger rows for work_item_id STORY-006-04
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:53:27Z
  sessions: []
---

# STORY-006-04: WIKI.md — the wiki protocol
**Complexity:** L3 — one long instruction file that must match the final SPRINT-02 command surface (EPIC-003, EPIC-004) exactly, plus a test that checks its structure, vocabulary and embedded examples against the CLI's own parsers and validator.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent, I want one protocol file that tells me how to register a source, triage and extract facts, run the write phase, delegate, offer ambient ingests, search, answer questions, propose rule changes and keep the log and index straight, so that every agent — main or sub-agent, Claude Code, Codex or Antigravity — runs the wiki the same way.

### 1.2 Detailed Requirements
- **R1 — Sections (contract 11).** `templates/system/WIKI.md` replaces the placeholder with these `##` sections, in this order: `Ingest`, `Register`, `Triage and extract`, `Write phase`, `Facts file`, `Brief`, `Page format`, `Delegation`, `Ambient offers`, `Search`, `Answering questions`, `Proposing rule changes`, `Log and index`. The guard deny message (STORY-006-01) and the skills (STORY-006-05) reference them as `.wiki/system/WIKI.md, section "<Heading>"`.
- **R2 — Vocabulary (CR-002 B4).** Commands named are only those that exist at the end of SPRINT-02 (`init`, `update`, `remove`, `doctor`, `setup`, `hook`, `ingest start | plan | facts | apply | finish | abort`, `index rebuild`, `search`); ingest verbs only `start`, `plan`, `facts`, `apply`, `finish`, `abort`. No `read`, `lint`, `status` or `rules` (SPRINT-03).
- **R3 — Ingest (§7.1–7.3, D-04, D-17).** The four triggers (file shared in chat — the common case, directory, link, ambient); the three phases (register → triage & extract → write); several sources may be in triage at once, writes are one at a time.
- **R4 — Register (§7.2, §7.3).** `wikeeper ingest start <path|url|->` with `--kind` when the kind is known and `--text-file` for text the agent already read (the CLI stores originals and never converts or fetches); a chat excerpt goes on stdin with `-`; a duplicate reports the prior ingest and is re-ingested with `--reingest` only when the user asks; exit code 3 (`needs_approval`) → show the returned metadata, ask in chat, rerun with `--approved` only after the user agrees; exit code 4 (`denied`) → tell the user the reason, nothing was stored; a directory → `wikeeper ingest plan <dir>`, show the plan, get approval, then `start` each approved file.
- **R5 — Triage and extract (§7.4 steps 1–3, D-18).** Read `.wiki/index.md` and run `wikeeper search` for the entities and terms the source names; pick the source kind whose rule in `.wiki/kb_instructions.md` decides what to extract and where; no matching rule → propose one; extract facts routed to an entity and page, each dated, marked decided or tentative, with its anchor in the source; note uncovered information; submit with `wikeeper ingest facts <id>`.
- **R6 — Write phase (§7.4 steps 4–6, §7.5, D-08, contract 8).** One source at a time: `wikeeper ingest apply <id>` takes the lock and prints the brief's `ingest` line and the facts; reconcile each fact as new / confirms / updates / contradicts and resolve aliases; create new pages in the shapes of section "Page format", with the page names and entity types listed under Entities in `.wiki/kb_instructions.md` (contract 13: the package ships no fixed pages); only source pages start from `.wiki/system/templates/source.md`; end every claim with the citation `[[<id>]]`; write `sources/<id>.md`; flag contradictions with both sources, never overwrite; write nothing outside `pages/`; write and edit pages only with the agent's file-edit tools (Write or Edit in Claude Code, `apply_patch` in Codex, `write_to_file` or `replace_file_content` in Antigravity), never from the shell (redirection, heredoc, `sed`) (walkthrough row 8.4); run `wikeeper ingest finish <id>` and show the user its report (metadata only); if `finish` fails, fix the pages it names and rerun it, or run `wikeeper ingest abort <id>` (`--drop` also deletes the registered source); once `finish` exits 0 the ingest is closed and nothing under `pages/` changes — a fix needs a new ingest. Pages never change outside this phase; if `wikeeper ingest` is unavailable, write nothing and tell the user.
- **R7 — Facts file (§7.4).** Describes every field and carries one complete JSON example; points to `.wiki/system/schemas/facts.schema.json` (contract 12).
- **R8 — Brief (§7.4).** The fixed template — `ingest`, `facts`, `user said`, `resolved`, `focus` — with one example. The main agent writes the brief into the writer's task; `wikeeper ingest apply` prints only the `ingest` line and no command takes the other fields; a main agent that writes the pages itself needs no brief (walkthrough rows 7.21, 8.2; CR review-feedback 2026-10-17).
- **R9 — Page format (§8, contracts 1 and 13).** Frontmatter `type`, `title`, `summary`, `aliases`, `sources`, `updated`; the two layers (Summary rewritten every ingest; Facts dated, decided/tentative, cited, replaced facts kept); typed links `key:: [[target]]`; the fact-line syntax and the contradiction flag exactly as STORY-004-01 defines them. Two page shapes, since no page templates ship besides `source.md`: a single-entity page, whose frontmatter `type` is the entity type; and a multi-entry page (for example a people page or a risk register) holding one `##` section per entry, each starting with `type:: <entity type>` and `aliases::` typed links, because STORY-004-01 R8 types a section entity only from its own `type::` link, which `search --type` filters on. One example of each shape. Frontmatter must be valid YAML, or `wikeeper ingest finish` refuses the page (STORY-003-09 R10); a value containing `: ` is quoted.
- **R10 — Delegation (§7.6, D-16, D-19).** A table for the four cases (file shared in chat, something said in chat, directory, link) naming who triages/extracts and who writes; `wiki-extractor` (small tier) extracts and submits facts and never writes pages; `wiki-writer` (medium tier) receives the brief, which the main agent writes into its task, and the facts file path — facts, not sources — and runs `apply` → pages → `finish`; with `ingest.delegate: never`, or where the agent cannot delegate, the main agent runs both phases with the same steps and facts file.
- **R11 — Ambient offers (§7.1, D-26).** On a capture signal, offer at the end of the reply, batched; say which items are decided and which are being considered; ask when unsure; on approval ingest the excerpt with `wikeeper ingest start -`; `ingest.ambient_offers: false` turns offers off.
- **R12 — Search.** `wikeeper search "<query>"` and its options `--type`, `--where key=value`, `--status`, `--entity`, `--since`, `--misses`, `--json`, each described as built by STORY-004-02…004-05: `--status` matches an entity's `status::` link or its page's frontmatter `status` (STORY-004-03 R3), not a fact's `decided`/`tentative` (walkthrough row 8.11, UR:bug 2026-10-17); used at triage and to answer questions.
- **R13 — Answering questions.** Search first, read the pages returned, answer with `[[src-…]]` citations, say plainly when the wiki does not know; a search with no results is logged as a miss automatically.
- **R14 — Proposing rule changes (§9, D-14).** Where proposals come from (a source kind with no rule, information that keeps appearing uncaptured, misses, the user's corrections, and a user's answers during onboarding in `.wiki/system/ONBOARDING.md`, STORY-006-07); a proposal is a small diff to `.wiki/kb_instructions.md` the user approves; approved → bump that kind's version and add a changelog line; rejected → add a changelog line marking it rejected, so it is not offered again.
- **R15 — Log and index (CR-002 B7, D-28).** `log/` holds one file per event, is committed and is merge-safe; `log.md` is a generated view and is gitignored; `index.md` is generated from page frontmatter and never edited by hand; after a merge or pull that touched the wiki, run `wikeeper index rebuild`.

### 1.3 Out of Scope
- SETUP.md (STORY-006-02), the pointer block (STORY-006-01), skills and sub-agent prompts (STORY-006-05).
- Text about `read`, `lint`, `status` and rule-decision commands — added in SPRINT-03 with those commands.
- Checking flags and section references across all templates against the real CLI (STORY-006-06).
- Knowledge-quality tuning (INITIATIVE-001 §5).

### 1.4 Open Questions

- None. Two choices were called out for the Brief and accepted by the human on 2026-10-16: the writer sub-agent runs `apply` and `finish` itself (R10), and rejected rule proposals are recorded as changelog lines until SPRINT-03 adds a command that logs decisions (R14).

### 1.5 Risks

- **Risk:** Flags named here (`--kind`, `--text-file`, `--reingest`, `--approved`, `--drop`, search options) drift from what STORY-003-04/05/08 and 004-02…05 finally ship.
- **Mitigation:** Build against the frozen command-surface contracts; STORY-006-06 checks every flag against the real CLI at the end of the sprint.
- **Risk:** The file is long and loads before every ingest or query.
- **Mitigation:** Keep each section procedural and short; target ≤ 400 lines (tested), well under every agent's file-size limit (architecture §6.2).
- **Risk:** `test/template-loader.red.node.test.ts:164` checks the placeholder first line of WIKI.md.
- **Mitigation:** STORY-006-02's QA-Red re-scopes it once for the sprint, dropping the placeholder-first-line check (Sprint Design Review); STORY-006-02 is upstream of this story.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Four ingest cases, each with its own delegation path. |
| Interfaces | F | One file read by agents; its consumers are tested in STORY-006-01, 006-05 and 006-06. |
| Data | T | One row per section; one row per embedded example (facts JSON, two page shapes, brief). |
| Rules | T | Section order, the SPRINT-02 command vocabulary, phase order, approval exit codes. |

```gherkin
Feature: WIKI.md — the wiki protocol

  @data @rules
  Scenario Outline: Every section exists, in order, with its required terms
    Given templates/system/WIKI.md
    Then its "##" headings are exactly the thirteen sections of R1, in order
    And section "<section>" contains <terms>

    Examples:
      | section                | terms                                                                                  |
      | Ingest                 | "shared", "directory", "link", "ambient"                                               |
      | Register               | "wikeeper ingest start", "--kind", "--text-file", "--reingest", "--approved", "wikeeper ingest plan" |
      | Triage and extract     | ".wiki/index.md", "wikeeper search", ".wiki/kb_instructions.md", "wikeeper ingest facts" |
      | Write phase            | "wikeeper ingest apply", "[[<id>]]", "sources/<id>.md", ".wiki/system/templates/source.md", "Page format", "wikeeper ingest finish", "wikeeper ingest abort", "file-edit tools", "heredoc", "change nothing under `pages/`" |
      | Facts file             | ".wiki/system/schemas/facts.schema.json"                                               |
      | Brief                  | "user said", "resolved", "focus", "main agent", "writer's task"                        |
      | Page format            | "aliases", "type::", "decided", "tentative", "valid YAML"                              |
      | Delegation             | "wiki-extractor", "wiki-writer", "ingest.delegate"                                     |
      | Ambient offers         | "wikeeper ingest start -", "ingest.ambient_offers"                                     |
      | Search                 | "--type", "--where", "--status", "--entity", "--since", "--misses", "status::"         |
      | Answering questions    | "[[src-", "miss"                                                                       |
      | Proposing rule changes | ".wiki/kb_instructions.md", "changelog", "version", "rejected", ".wiki/system/ONBOARDING.md" |
      | Log and index          | "log/", "log.md", "gitignored", "index.md", "wikeeper index rebuild"                   |

  @rules
  Scenario: One SPRINT-02 vocabulary and the right phase order
    Given templates/system/WIKI.md
    When every "wikeeper <command>" reference is extracted
    Then each is one of init, update, remove, doctor, setup, hook, ingest, index, search
    And every "wikeeper ingest <verb>" uses start, plan, facts, apply, finish or abort
    And in section "Write phase" "wikeeper ingest apply" appears before "wikeeper ingest finish"
    And section "Register" names exit code 3 with "--approved" and exit code 4
    And the file has at most 400 lines

  @data
  Scenario Outline: Embedded examples are valid
    Given the <example> example in section "<section>"
    When it is checked with <checker>
    Then <result>

    Examples:
      | example    | section     | checker                                    | result                                                                                         |
      | facts JSON | Facts file  | validateFacts from src/ingest/facts.ts        | it is accepted                                                                              |
      | single-entity page | Page format | parsePage                          | errors is empty, it has a decided fact, a tentative fact, a contradiction-flagged fact and a typed link, and every fact cites a source |
      | multi-entry page   | Page format | parsePage and pageEntities         | errors is empty, it has at least two "##" entries, and each entry is a section entity with a "type" typed link and an "aliases" typed link |
      | brief      | Brief       | the brief field check                      | it has the fields ingest, facts, user said, resolved and focus                                 |

  @paths
  Scenario: Delegation covers every ingest case and the fallback
    Given section "Delegation"
    Then its table has rows for "File shared in chat", "Something said in chat", "Directory" and "Link"
    And it says wiki-extractor never writes pages and wiki-writer runs "wikeeper ingest apply" and "wikeeper ingest finish"
    And it says the main agent runs both phases when "ingest.delegate" is "never" or it cannot delegate

  Scenario: Error — a SPRINT-03 command fails the vocabulary check
    Given a copy of WIKI.md with the line "Run `wikeeper lint` after every ingest."
    When the vocabulary check runs on it
    Then it fails naming "wikeeper lint" and the line number
```

### 2.2 Verification Steps (Manual)
- [ ] Give an agent a markdown meeting note in a scratch repo and ask it to ingest it following WIKI.md only; check it runs start → facts → apply → finish and shows the CLI's report.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `templates/system/WIKI.md` |
| Test Files | `test/templates/wiki-protocol.test.ts`, `test/templates/walkthrough-fixes.red.node.test.ts` (QA-Red, R6/R8/R9/R10/R12; 2026-10-17) |
| New Files Needed | Yes — `test/templates/wiki-protocol.test.ts` |

### 3.2 Technical Logic
- Write WIKI.md to R1–R15, following architecture.md §7.1–7.6, §8 and §9; fenced code blocks for the facts example (```json), the two page examples (```md, single-entity first) and the brief example (```text).
- The test splits the file into `##` sections, checks order and required terms, extracts `wikeeper …` references from text and code, and pulls the four fenced examples out of their sections: the facts JSON goes to `validateFacts`, which STORY-003-06 exports from `src/ingest/facts.ts` (contract 3; the example's `source_id` matches the `src-YYYY-MM-DD-<slug>` form), the page examples to `parsePage` from `src/wiki/parse-page.ts` (contract 1), and the multi-entry example also to `pageEntities`, whose section entities must carry their own `type`.
- The vocabulary check is a helper taking the file text and returning offending references with line numbers, so the error scenario runs on an in-memory copy.
- No code outside the test changes: `update` already replaces `.wiki/system/WIKI.md` when the package's copy changes (STORY-001-05).

### 3.3 API Contract (if applicable)

Not applicable — content. Consumes `parsePage` and `pageEntities` (contract 1) and `validateFacts` (contract 3, STORY-003-06) read-only.

## Task Breakdown

- [x] Write sections `Ingest`, `Register`, `Triage and extract` (R3–R5) using the EPIC-003 verbs and flags.
- [x] Write `Write phase`, `Facts file`, `Brief`, `Page format` (R6–R9) with the four fenced examples (two page shapes).
- [x] Write `Delegation`, `Ambient offers` (R10, R11) with the four-case table.
- [x] Write `Search`, `Answering questions`, `Proposing rule changes`, `Log and index` (R12–R15).
- [x] Add `test/templates/wiki-protocol.test.ts`: section order and terms outline (R1, all sections).
- [x] Add the vocabulary, phase-order, exit-code and length checks, and the error scenario (R2, R4, R6).
- [x] Add the embedded-example checks against `validateFacts` and `parsePage` (R7–R9).
- [x] Add the delegation table check (R10).
- [x] Run `npm test` on the integrated tree after STORY-004-01 and STORY-003-06 merge.
- [ ] Walkthrough fixes W1–W8 (plans/M6.md): file-edit-tool and post-finish rules, the brief channel, valid-YAML note, `--status` as built -> R6, R8, R9, R10, R12

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 3 | Section splitter; reference extractor with line numbers; fenced-example extractor |
| Integration tests | 0 | Content only; parsers are called in-process |
| E2E / acceptance tests | 20 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/template-loader.red.node.test.ts` passes unchanged after STORY-006-02's re-scope (this story does not edit it).
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/system/WIKI.md:1` — placeholder line only.
- **Surface:** `src/agents/hook-protocols.ts:5` — the guard message that will point to section "Write phase" (changed by STORY-006-01).
- **Surface:** `src/core/config.ts:64` — `ingest.ambient_offers` (default true) and `src/core/config.ts:65` — `ingest.delegate` (`auto` | `never`), both named in the text.
- **Surface:** `src/core/gitignore.ts:79` — `log.md` is in the managed ignore block (R15).
- **Coverage of this requirement:** partial — the file and its install path exist; the content is placeholder.

## Prior work

- [[EPIC-006]] (parent), [[EPIC-003]] (ingest commands and the facts schema), [[EPIC-004]] (search and the page parser), [[CR-002]] (B4 one vocabulary, B7 log vs log.md). No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `templates/system/WIKI.md:1` — this story fills it in.
- **Why isn't extension / parameterization / config sufficient?** The protocol is the agent's process; it has to be text. Splitting it across the skills would duplicate it per agent and put it in files `update` handles differently; one package-owned file that every skill and sub-agent points to keeps a single source, and the test ties its examples to the CLI's own parsers.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding.
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
