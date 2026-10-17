---
story_id: STORY-006-09
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
ambiguity: 🟡 Medium
context_source: "EPIC-006 (archived; instruction content for every command) · EPIC-005 §2 (lint, lint --rules, status, rules record/list, ingest facts --dry-run; CR-002 D1 and CR-003 D4–D5 scope additions) · CR-002 D1 (approved 2026-10-16) · SPRINT-03 decomposition brief (human decisions 2026-10-17: read --out, design calls; commands and flags at the end of SPRINT-03; contracts K2–K7; shared files: 006-10 before 006-09 on WIKI.md, 006-11 last) · architecture.md §7.7 (read), §9 (rule evolution), §10 · SPRINT-02 walkthrough notes, formapass_management (rows 8.12, 11.4, 11.27c) · verified templates/system/{WIKI,SETUP}.md, templates/skills/*/SKILL.md, templates/agents/*/wiki-writer.*, templates/agent-block.md, src/agents/enforce/{claude,codex}.ts, src/commands/ingest-facts.ts, test/templates/*.red.node.test.ts, test/templates/structure.ts"
actor: AI coding agent (main agent or sub-agent) operating the wiki
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-003-10
  - STORY-003-11
  - STORY-005-02
  - STORY-005-03
  - STORY-005-04
  - STORY-005-05
  - STORY-005-06
  - STORY-005-07
  - STORY-006-10
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T09:05:51Z
updated_at: 2026-10-17T09:05:51Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T09:13:36Z
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
  last_stamp: 2026-10-17T09:13:36Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: ""
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-17T08:47:12Z
---

# STORY-006-09: Instructions for `read`, `lint`, `status` and `rules`
**Complexity:** L2 — WIKI.md gains one section and edits in four others, SETUP.md gains two sentences, the `wiki-ingest` skill one section name; plus one content test. The text must match six command surfaces frozen as contracts K2–K7.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent running a wikeeper wiki (for this human: Formapass product management — marketing, sales, presentations and drafting initiatives), I want WIKI.md and SETUP.md to tell me when to run `read`, `lint`, `lint --rules`, `status`, `rules record` / `rules list` and `ingest facts --dry-run`, and what to do with what they report, so that I can ingest web pages, DOCX and PDF files, keep the wiki healthy, and never offer a rule change the user already turned down.

### 1.2 Detailed Requirements

- **R1 — `read` in WIKI.md section "Register" (contract K7; architecture.md §7.7; human design call 2026-10-17: instruction text uses `--out`).** (a) The intro sentence (`templates/system/WIKI.md:18`) says `wikeeper ingest start` stores the original and never converts or fetches anything, and `wikeeper read` does the reading. (b) A bullet: a URL, DOCX or PDF — get its text with `wikeeper read <file|url> --out <file>`, writing to a temporary file outside `.wiki/`, then register it with `wikeeper ingest start <file|url> --text-file <file>`; markdown and plain-text files need no `read`. `read` is used even when the agent could open the source itself (§1.4 Q3). `read` is the only wikeeper command that goes online. (c) The `--text-file` bullet (`:21`) says the text comes from `wikeeper read` or from text the agent already has; "A URL needs `--text-file`" stays. (d) One line per `ReadWarning` code of K7: `likely_scanned` — the PDF has little or no text layer: read the PDF yourself if your agent can, write the text to a file and pass it with `--text-file`, otherwise tell the user; `needs_browser` — the page needs JavaScript or a login: use your own browser or ask the user to paste the page, then pass the text with `--text-file`; `truncated` — only part of the source was read: tell the user before you register it; `unsupported` — `.doc`, `.pptx` and `.xlsx` are not read: ask the user for a PDF, DOCX or text export. (e) The "Link" row of section "Delegation" (`:175`) says the main agent gets the text with `wikeeper read` (section "Register") instead of "fetches the text".
- **R2 — `status` in a new WIKI.md section `## Lint and status` (contract K5; EPIC-005 §2; walkthrough row 8.12).** The section sits between "Proposing rule changes" and "Log and index". It says: run `wikeeper status` once per session, before the first ingest, and whenever the user asks what is open or pending in the wiki (§1.4 Q1). It names each `--json` field of K5 with what to do: `open_ingest` and `stale_lock` — finish or abort that ingest (section "Write phase"), and use `wikeeper ingest apply <id> --force-unlock` for a stale lock only with the user's approval; `unfinished_sources` — offer to continue each one, or to drop it with `wikeeper ingest abort <id> --drop` once the user agrees; `reingest_candidates` — sources ingested under an older rule version: offer to re-ingest them with `wikeeper ingest start <path|url> --reingest` (a URL through `wikeeper read` again); `pending_rule_suggestions` — what finished ingests could not capture, by source: propose rule changes for it (section "Proposing rule changes"); `setup` and `misses` — for information (`wikeeper search --misses` lists the misses).
- **R3 — `lint` in section "Lint and status" (contracts K2, K3; CR-002 D1).** It says: `wikeeper lint` checks the pages and reports findings; it never changes anything. `wikeeper ingest finish` already reports the findings for the pages it changed. Run `wikeeper lint` after a merge or pull that touched the wiki (after `wikeeper index rebuild`) and when the user asks whether the wiki is in good shape. It exits 1 when any finding is an error. `wikeeper lint --check <id>` reruns one check, for example `wikeeper lint --check unlogged-change`. Then a table `| Finding | What to do |` with exactly one row per id in `PAGE_CHECKS` (`src/lint/checks.ts`) when this story merges — `broken-link`, `orphan-page`, `uncited-claim`, `index-drift` (STORY-005-02), `unlogged-change`, `stale-fact` (STORY-005-03) — each first cell the id in a code span:
  - `broken-link`: a `[[…]]` link resolves to no page, entity or alias; fix the link in a write phase.
  - `orphan-page`: no other page links to the page; link it from a related page in a write phase, or tell the user.
  - `uncited-claim`: a claim or fact line has no `[[src-…]]` citation; in a write phase, cite the source that supports it, or remove the claim when no source does.
  - `index-drift`: `.wiki/index.md` is out of date; run `wikeeper index rebuild`.
  - `unlogged-change`: the page changed outside an ingest, usually through a shell write the guard cannot see (section "Write phase"); show the user the change; to keep it, record it with a chat-excerpt ingest; to drop it, restore the page's last ingested version from git, with their approval.
  - `stale-fact`: a status or date fact is older than `lint.stale_after_days` (default 30); ask the user whether it still holds, or offer to ingest a newer source.

  After the table: pages change only in a write phase, so a page finding is fixed in the next ingest that touches the page, or, when the user wants it fixed now, in a chat-excerpt ingest of their instruction (STORY-006-10 R15); `index-drift` is the one exception. Lint check ids are written as "`<id>` finding", never "`<id>` check" (`test/templates/structure.ts:194` reads that form as a doctor check id).
- **R4 — `lint --rules` in section "Lint and status" (EPIC-005 §2; CR-002 C1; CR-003 D4).** It says: `wikeeper lint --rules` checks `.wiki/kb_instructions.md`: the line format, rules that duplicate each other or name an unknown entity, questions no rule serves, rules that serve no question, changelog lines that do not match the versions, and whitelist kinds that name no kind. Run it after every approved change to that file and when `wikeeper doctor` warns that the file does not parse. Each finding becomes a proposal (section "Proposing rule changes"); never edit the file without the user's approval. No rule-check id is named (STORY-005-04 owns them; STORY-006-11 R3 verifies any id a template names).
- **R5 — The `finish` report (contract K3).** WIKI.md section "Write phase" step 9 (`:48`) adds: the report also lists lint findings for the pages this ingest changed; they never fail `finish`; section "Lint and status" says what to do with them. The writer prompts are unchanged: they already return the report of the last ingest command unchanged (`templates/agents/claude/wiki-writer.md:27`).
- **R6 — Rule decisions and the dry run in WIKI.md section "Proposing rule changes" (contracts K4, K6; architecture.md §9).** (a) The list of where proposals come from (`:213–219`) adds `wikeeper status` pending rule suggestions (as part of "information that keeps appearing and is never captured") and `wikeeper lint --rules` findings. (b) Before offering a proposal, run `wikeeper rules list` and do not offer one the user rejected before for the same kind, unless they bring it up again. (c) To show what a changed rule would do to a source already ingested, extract its facts again from `.wiki/raw/` under the proposed rule and run `wikeeper ingest facts <id> --file <facts.json> --dry-run`: it prints the facts that would be added, removed and changed, and stores nothing; show that diff with the proposal. (d) Record every decision with `wikeeper rules record --accepted --kind <kind> --summary "<one line>" --from <source-id>` or `wikeeper rules record --rejected --kind <kind> --summary "<one line>" --from <source-id>`; `--from` names the source whose pending suggestions led to the proposal, so `wikeeper status` stops listing them, and is left out otherwise; when a proposal is offered again, reuse its earlier summary so the CLI can report it as previously rejected. `--kind` follows §1.4 Q2. (e) Approved: edit the file, bump that kind's `(vN)` version, add a line under `## Rule changelog`, record it with `--accepted`, then offer to re-ingest the sources `wikeeper status` lists as re-ingest candidates. Rejected: record it with `--rejected` and change nothing in the file; the line "add a changelog line marking it rejected" (`:224`) goes. The section keeps ".wiki/kb_instructions.md", "changelog", "version", "rejected" and ".wiki/system/ONBOARDING.md" (`test/templates/wiki-protocol.red.node.test.ts:123`), and STORY-006-10 R5's dated-facts sentence.
- **R7 — After a merge (WIKI.md section "Log and index", `:230`).** After `wikeeper index rebuild`, run `wikeeper lint`; an `unlogged-change` finding on a page a teammate edited by hand is handled as R3 says.
- **R8 — SETUP.md.** Step 2, item 1 (`templates/system/SETUP.md:17`): a document the user names that is a URL, DOCX or PDF is read with `wikeeper read <file|url> --out <file>` first. Step 3 gains a last item after the user approves and the file is written: run `wikeeper lint --rules`, go through its findings with the user, and fix the file with their approval before step 4.
- **R9 — `wiki-ingest` skill (`templates/skills/wiki-ingest/SKILL.md:8–10`).** The list of WIKI.md sections to read adds "Lint and status"; the short summary says a URL, DOCX or PDF is read with `wikeeper read` before `wikeeper ingest start`. Frontmatter and description are unchanged.
- **R10 — Vocabulary.** The text names exactly these forms and no other SPRINT-03 form: `wikeeper read <file|url> --out <file>`, `wikeeper ingest start <file|url> --text-file <file>`, `wikeeper status`, `wikeeper lint`, `wikeeper lint --rules`, `wikeeper lint --check <id>`, `wikeeper rules list`, `wikeeper rules record --accepted|--rejected --kind <kind> --summary "<one line>" [--from <source-id>]`, `wikeeper ingest facts <id> --file <facts.json> --dry-run`; the K5 field names `open_ingest`, `stale_lock`, `unfinished_sources`, `reingest_candidates`, `pending_rule_suggestions`, `setup`, `misses`; the K7 warning codes; and only page-check ids that `PAGE_CHECKS` holds.
- **R11 — Invariants.** (a) Every command, flag and section named exists when this story merges, so `test/templates.test.ts:113` stays clean. (b) WIKI.md has 14 `##` sections and at most 400 lines (`test/templates/wiki-protocol.red.node.test.ts:161`). (c) `templates/agent-block.md` and the six sub-agent files are not touched; the 14-line cap (CR-002) and the shared writer text (STORY-006-05 R6) hold. (d) The SETUP.md step 4 preview table is not touched (§1.3). (e) Every SPRINT-02 red test stays green, except STORY-006-11 R6 (c) and (d) — the WIKI.md section list and the SETUP.md command list — applied by this story's QA-Red once authorised (STORY-006-11 §1.4 Q1, Q2).

### 1.3 Out of Scope
- The CR-003 instruction items (whitelist format, approvals, kb line format, `--no-miss`, `--mark`, page naming, corrections, the `unlogged-change` sentence in "Write phase"): STORY-006-10, which lands first.
- The SETUP.md step 4 preview-table rows for the `read` allow rule and the new `ai`-mode prompts: STORY-003-10 (K7) and STORY-002-09 (K9), in the same change as the enforce writers, because `test/templates/setup.red.node.test.ts` S2 compares the table with `CLAUDE_ENFORCE` and `CODEX_ENFORCE` at run time.
- Allow rules for the read-only `status`, `lint` and `rules list`: no story adds them, so in Claude Code and Codex each call asks for permission like `ingest apply` does today (§1.5).
- A pointer-block line for `status` (§1.4 Q1).
- The command behaviour itself (STORY-003-10, 003-11, 005-02 … 005-07) and the structural-test extensions (STORY-006-11).

### 1.4 Open Questions

The brief's design calls (`read --out`, page-hash baseline, the K1 format) are settled and not reopened here.

- **Question:** Q1. The brief says `status` runs at session start. The only always-loaded text is the pointer block (12 of 14 lines). Should the block gain a line "run `wikeeper status` at session start"?
- **Recommended:** No. WIKI.md section "Lint and status" says to run it once per session before the first ingest, and the agent reads WIKI.md before any wiki work (block line 6); the `wiki-ingest` skill lists the section. The block stays at 12 lines, and sessions that never touch the wiki get no extra permission prompt (`status` has no allow rule, §1.3).
- **Human decision:** {populated during Brief review}

- **Question:** Q2. `wikeeper rules record` requires `--kind` (contract K4), but some proposals change no source kind: a new question from onboarding, a new entity, a Never-capture line from a user's correction. What does the agent pass?
- **Recommended:** The section the proposal changes, written as a kind-like id: `--kind questions`, `--kind entities` or `--kind never-capture`; a proposal that changes a source kind passes that kind. This needs STORY-005-06 to accept any valid kind id for `--kind`, not only kinds defined in `.wiki/kb_instructions.md`; confirm it at the Sprint Design Review.
- **Human decision:** {populated during Brief review}

- **Question:** Q3. The brief says `read` is for a URL, DOCX or PDF "it can't read itself". Claude Code can open PDFs and fetch pages. Should the agent use `read` anyway?
- **Recommended:** Yes, for every URL, DOCX and PDF, as architecture.md §7.7 argues: an agent's web tool may return a summary instead of the page (Claude Code's WebFetch passes pages through a smaller model), and `--out` gives `--text-file` a file as it is. The agent reads the source itself only when `read` warns `likely_scanned` or `needs_browser` (R1 d).
- **Human decision:** {populated during Brief review}

### 1.5 Risks

- **Risk:** The text describes six command surfaces that are being drafted in parallel; a late rename, a different page-check id or a dry run that refuses a finished ingest (today `ingest facts` refuses one, `src/commands/ingest-facts.ts:84`) makes the text wrong.
- **Mitigation:** Every owner story is upstream; the forms used are exactly contracts K2–K7; STORY-006-11 fails on any unknown command, flag or lint id; QA-Verify runs the R6 (c) dry run on a finished ingest and the `rules record` repeat (§2.1).
- **Risk:** `status`, `lint` and `rules list` prompt for permission in Claude Code and Codex in every mode, because the enforce writers allow only `ingest` (in `ai`) and `search` (`src/agents/enforce/claude.ts:30–41`, `src/agents/enforce/codex.ts:3–15`).
- **Mitigation:** The text runs `status` once per session, not on every action (Q1). Adding read-only allow rules is a code change for a later CR; it is reported to the orchestrator, not done here.
- **Risk:** The new section and two new commands break SPRINT-02 red tests (WIKI.md section list, SETUP.md command list).
- **Mitigation:** STORY-006-11 R6 (c) and (d), authorised at its Gate 1 and applied by this story's QA-Red.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Two ways to register a source: through `read --out` and `--text-file`, or directly for markdown and text. |
| Interfaces | T | The same guidance reaches the agent through WIKI.md, SETUP.md and the `wiki-ingest` skill. |
| Data | T | One row per command form and file part; one finding row per page check. |
| Rules | T | Lint findings are fixed only in a write phase; rejected proposals are recorded and not re-offered. |

```gherkin
Feature: Instructions for read, lint, status and rules

  @data @interfaces
  Scenario Outline: Each new command form lands in its file and part
    Given the templates tree after this story
    Then <part> of <file> contains <phrases>

    Examples:
      | item              | file                                 | part                              | phrases                                                                                                   |
      | read (R1)         | templates/system/WIKI.md             | section "Register"                | "wikeeper read <file\|url> --out <file>", "wikeeper ingest start <file\|url> --text-file <file>", "outside `.wiki/`" |
      | read limits (R1)  | templates/system/WIKI.md             | section "Register"                | "`likely_scanned`", "`needs_browser`", "`truncated`", ".pptx"                                             |
      | link row (R1)     | templates/system/WIKI.md             | section "Delegation"              | "wikeeper read"                                                                                           |
      | status (R2)       | templates/system/WIKI.md             | section "Lint and status"         | "wikeeper status", "once per session", "`reingest_candidates`", "`pending_rule_suggestions`"             |
      | lint (R3)         | templates/system/WIKI.md             | section "Lint and status"         | "wikeeper lint", "wikeeper lint --check unlogged-change", "never changes"                                 |
      | lint --rules (R4) | templates/system/WIKI.md             | section "Lint and status"         | "wikeeper lint --rules", "wikeeper doctor"                                                                |
      | finish (R5)       | templates/system/WIKI.md             | section "Write phase"             | "Lint and status"                                                                                         |
      | rules (R6)        | templates/system/WIKI.md             | section "Proposing rule changes"  | "wikeeper rules list", "wikeeper rules record --accepted", "wikeeper rules record --rejected", "--from"   |
      | dry run (R6)      | templates/system/WIKI.md             | section "Proposing rule changes"  | "--dry-run", "stores nothing"                                                                             |
      | merge (R7)        | templates/system/WIKI.md             | section "Log and index"           | "wikeeper index rebuild", "wikeeper lint"                                                                 |
      | setup (R8)        | templates/system/SETUP.md            | step 2                            | "wikeeper read"                                                                                           |
      | setup (R8)        | templates/system/SETUP.md            | step 3                            | "wikeeper lint --rules"                                                                                   |
      | skill (R9)        | templates/skills/wiki-ingest/SKILL.md | body                             | "\"Lint and status\"", "wikeeper read"                                                                    |

  @paths
  Scenario: A source reaches ingest start through read, or directly
    Given WIKI.md section "Register"
    Then a URL, DOCX or PDF goes through "wikeeper read <file|url> --out <file>" and then "--text-file <file>"
    And a markdown or plain-text file is registered without read
    When, in a temp wiki, "wikeeper read" runs on the DOCX fixture of STORY-003-11 with "--out" and "wikeeper ingest start" runs on the same file with "--text-file" and "--approved"
    Then both exit 0 and .wiki/raw/ holds the original and the text

  @rules
  Scenario: Every page check has one finding row, and every fix goes through a write phase
    Given the finding table in WIKI.md section "Lint and status"
    Then its first cells are exactly the ids of PAGE_CHECKS
    And the "index-drift" row names "wikeeper index rebuild" and every other row names a write phase, an ingest or the user
    And the "unlogged-change" row names a shell write and section "Write phase"
    And the section says lint never changes anything, and no template writes a lint id followed by " check"
    And the structural checks of test/templates/structure.ts report no finding, WIKI.md has 14 "##" sections and at most 400 lines, and templates/agent-block.md and the six sub-agent files are unchanged
    And every SPRINT-02 red test under test/templates/ passes, with only the edits of STORY-006-11 R6 (c) and (d)

  @rules @interfaces
  Scenario: Rule decisions are listed first, recorded every time, and remembered
    Given WIKI.md section "Proposing rule changes"
    Then "wikeeper rules list" appears before the first "wikeeper rules record"
    And the approved bullet names the version bump, the changelog line and "--accepted"
    And the rejected bullet names "--rejected" and no changelog line
    When, in a temp wiki, the section's "wikeeper rules record --rejected" form runs twice with the same kind and summary
    Then "wikeeper rules list --json" marks the second decision previously_rejected

  Scenario Outline: Error — a form the CLI does not have fails the checks
    Given a copy of the templates directory where WIKI.md section "Lint and status" contains <text>
    When the checks run on the copy
    Then they fail naming <named> and its line

    Examples:
      | text                         | named                              |
      | "`wikeeper status --all`"    | "\"--all\" is not an option of \"status\"" |
      | "\| `dead-link` \| Fix it. \|" | "dead-link"                        |
```

### 2.2 Verification Steps (Manual)
- [ ] Part-3 walkthrough in `~/Documents/Dev/formapass_management`: hand the agent a Formapass PDF (a pitch or a pricing sheet) and a product web page; check it runs `wikeeper read … --out …` and then `wikeeper ingest start … --text-file …` for each, and asks for a PDF export when handed a `.pptx`.
- [ ] Start a new session and ask "what is open in the wiki?"; check the agent runs `wikeeper status` and explains the pending rule suggestions from the SPRINT-02 ingests.
- [ ] Write one page line with a shell redirect, run `wikeeper lint`, and check the agent shows the `unlogged-change` finding and offers to keep it through a chat-excerpt ingest or restore it.
- [ ] Reject a rule proposal, then ingest a source that raises the same gap; check the agent does not offer it again.
- [ ] Propose a change to the `roadmap` rule and check the agent previews it with the documented `wikeeper ingest facts <id> --file <facts.json> --dry-run` on the finished SPRINT-02 roadmap ingest, and that the command accepts a finished ingest (§1.5).

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `templates/system/WIKI.md` |
| Related Files | `templates/system/SETUP.md`, `templates/skills/wiki-ingest/SKILL.md` |
| Test Files | `test/templates/sprint-03-commands.red.node.test.ts` (QA-Red) |
| Re-scoped SPRINT-02 red tests (STORY-006-11 R6, applied by this story's QA-Red once authorised) | `test/templates/wiki-protocol.red.node.test.ts`, `test/templates/setup.red.node.test.ts` |
| New Files Needed | Yes — `test/templates/sprint-03-commands.red.node.test.ts` |

### 3.2 Technical Logic
- Start from WIKI.md as STORY-006-10 leaves it. Edit "Register" (R1), "Write phase" step 9 (R5), "Delegation" Link row (R1 e), "Proposing rule changes" (R6), add "Lint and status" (R2–R4), then "Log and index" (R7). Then SETUP.md steps 2 and 3 (R8) and the skill (R9).
- Keep each status field and each finding to one line or row; target about 60 added lines, so WIKI.md stays well under 400.
- Section references use the existing form `section "<Heading>"` inside WIKI.md, and `.wiki/system/WIKI.md`, section "…" elsewhere, so `checkSections` (`test/templates/structure.ts:317`) resolves them.
- The QA-Red test splits sections as `test/templates/wiki-protocol.red.node.test.ts:43` and SETUP steps as `test/templates/setup.red.node.test.ts:40` do; imports `PAGE_CHECKS` from `src/lint/checks.ts` (K2) for the finding table; runs the CLI in-process with `runCli` in a temp git repo for the two live checks (as `doctorCheckIds`, `test/templates/structure.ts:202`, does); uses `checkCommands` from `test/templates/structure.ts` for the error outline's first row.
- No code changes.

### 3.3 API Contract (if applicable)

Not applicable — template text. Consumes, read-only: `PAGE_CHECKS` (K2), the `status --json` fields (K5), `rules record` / `rules list` (K4), `ingest facts --dry-run` (K6), `read` and its warning codes (K7).

## Task Breakdown

- [ ] QA-Red: apply STORY-006-11 R6 (c) to `test/templates/wiki-protocol.red.node.test.ts` and R6 (d) to `test/templates/setup.red.node.test.ts`, once authorised -> R11
- [ ] QA-Red: write `test/templates/sprint-03-commands.red.node.test.ts` from the five scenarios in §2.1 -> R1–R10
- [ ] Write the `read` bullets, warning lines and the Delegation Link row -> R1
- [ ] Write section "Lint and status": status fields, lint usage, the finding table, `lint --rules` -> R2, R3, R4
- [ ] Add the finding pointer to "Write phase" step 9 and the lint step to "Log and index" -> R5, R7
- [ ] Rewrite the decision part of "Proposing rule changes" -> R6
- [ ] Update SETUP.md steps 2 and 3 and the `wiki-ingest` skill -> R8, R9
- [ ] Run `npm test` in full; check `test/templates.test.ts` reports no finding -> R10, R11

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 1 | The finding-table reader (first cells of the table in "Lint and status") |
| Integration tests | 2 | The `read` → `ingest start --text-file` pair and the `rules record` repeat, run in-process against a temp git repo with fixture files; no network |
| E2E / acceptance tests | 18 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately (13 + 1 + 1 + 1 + 2) |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `npm test` passes in full, with no SPRINT-02 red test changed beyond STORY-006-11 R6 (c) and (d).
- [ ] `test/templates.test.ts` reports no finding on the merged tree.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/system/WIKI.md:16` — section "Register" (`:18` intro, `:21` the `--text-file` bullet); `:48` — "Write phase" step 9; `:175` — the Delegation "Link" row; `:211` — "Proposing rule changes" (`:224` the rejected line); `:226` — "Log and index".
- **Surface:** `templates/system/SETUP.md:17` — step 2, drafting `project.md` from a document; `:25` — step 3.
- **Surface:** `templates/skills/wiki-ingest/SKILL.md:8` — the list of WIKI.md sections to read.
- **Surface:** `templates/agents/claude/wiki-writer.md:27` — the writer returns the last ingest report unchanged, so `finish`'s findings reach the main agent without a prompt change.
- **Surface:** `src/commands/ingest-facts.ts:84` — `ingest facts` refuses a finished ingest today; K6's dry run must not (§1.5).
- **Surface:** `src/agents/enforce/claude.ts:30` — the allow rules cover `ingest` and `search` only (§1.3, §1.5).
- **Coverage of this requirement:** partial — WIKI.md, SETUP.md and the skill exist; nothing in them names the SPRINT-03 commands, because STORY-006-04 R2 kept them out until they exist.

## Prior work

- [[EPIC-006]] (parent, archived), [[EPIC-005]] (lint, status, rule decisions, dry run), [[EPIC-003]] (`read`), [[CR-002]] (D1: lint is the shell-write backstop), [[CR-003]] (D4, D5: doctor and status), [[STORY-006-04]] (WIKI.md; R2 kept SPRINT-03 commands out; R14 recorded rejections as changelog lines until a decision command existed), [[STORY-006-02]] (SETUP.md), [[STORY-006-05]] (skills and sub-agents), [[STORY-006-10]] (lands first on WIKI.md). Wiki index and `.cleargate/FLASHCARD.md` checked 2026-10-17: no existing story documents these commands.

## Why not simpler?

- **Smallest existing surface that could carry this:** WIKI.md sections "Register", "Proposing rule changes" and "Log and index", plus one new section for lint and status.
- **Why isn't extension / parameterization / config sufficient?** The commands report; only the instructions tell the agent when to run them and what to do with each finding, status field and decision. One new section keeps lint and status in one place the skill can name, instead of spreading the finding actions over sections the agent reads for other reasons.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding.
- [ ] No "TBDs" exist anywhere in the specification or technical logic. (No TBD markers, but §1.4 Q1–Q3 decide the session-start trigger, the `--kind` value and when `read` is used.)
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
