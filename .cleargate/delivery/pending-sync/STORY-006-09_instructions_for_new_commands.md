---
story_id: STORY-006-09
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: "EPIC-006 (archived; instruction content for every command) · EPIC-005 §2 (lint, lint --rules, status, rules record/list, ingest facts --dry-run; CR-002 D1 and CR-003 D4–D5 scope additions) · CR-002 D1 (approved 2026-10-16) · SPRINT-03 Gate 1 decisions 5, 8 (local `.html` / `.htm` files added 2026-10-17), 10, 11, 12, 13, 15, 17 (owner STORY-005-09), 20, 21, 24, 26 (plans/gate1-decisions.md; approved at Gate 1, 2026-10-17) and consistency-audit findings 9, 10, 11, 12, 14, 16 · the instruction text handed to this story by STORY-003-10 §1.3, STORY-005-03 §1.3, STORY-005-05 R6–R7, STORY-005-07 §1.5 · SPRINT-03 decomposition brief (contracts K2–K7; shared files: 006-10 → 006-12 → 006-09 on WIKI.md and SETUP.md, 006-11 last) · SPIKE-001 (the human's deck is an outlined-text PDF: `read` warns likely_scanned) · architecture.md §7.7 (read), §9 (rule evolution), §10 · SPRINT-02 walkthrough notes, formapass_management (rows 8.12, 11.4, 11.27c) · verified templates/system/{WIKI,SETUP}.md, templates/skills/*/SKILL.md, templates/agents/*/wiki-writer.*, templates/agent-block.md, src/ingest/registry.ts, src/ingest/permissions.ts, src/ingest/source-id.ts, src/commands/ingest-start.ts, src/commands/ingest-facts.ts, src/core/config.ts, test/templates/*.red.node.test.ts, test/templates/structure.ts"
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
  - STORY-005-08
  - STORY-005-09
  - STORY-006-10
  - STORY-006-12
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T09:05:51Z
updated_at: 2026-10-17T10:12:10Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:14:36Z
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
  last_stamp: 2026-10-17T11:50:49Z
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
**Complexity:** L2 — WIKI.md gains one section and edits in five others, SETUP.md gains two sentences, the `wiki-ingest` skill one section name; plus one content test and two authorised red-test edits. The text must match six command surfaces frozen as contracts K2–K7 and the instruction points their owner stories hand to it.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent running a wikeeper wiki (for this human: Formapass product management — marketing, sales, presentations and drafting initiatives), I want WIKI.md and SETUP.md to tell me when to run `read`, `lint`, `lint --rules`, `status`, `rules record` / `rules list` and `ingest facts --dry-run`, and what to do with each warning, error, finding and status field they report, so that I can ingest web pages, DOCX and PDF files safely, keep the wiki healthy, and never offer a rule change the user already turned down.

### 1.2 Detailed Requirements

- **R1 — `read` in WIKI.md section "Register" (contract K7; architecture.md §7.7; Gate 1 decisions 5, 8 and 26; STORY-003-10 §1.3 and STORY-003-11; audit findings 9 and 10).**
  - (a) The intro sentence (`templates/system/WIKI.md:18`) says `wikeeper ingest start` stores the original and never converts or fetches anything; `wikeeper read` does the reading, and it is the only wikeeper command that goes online.
  - (b) When: every URL, every DOCX and every local `.html` / `.htm` file goes through `wikeeper read <file|url> --out <file>`, then `wikeeper ingest start <file|url> --text-file <file>`; `read` reads a local HTML file with no network (STORY-003-10 R2). A PDF goes through `read` first, and the agent reads the PDF itself only when `read` warns `likely_scanned` (decision 8; the human's Formapass deck draws its Georgian text as shapes, so `read` flags it, SPIKE-001). `read` is used even when the agent could open the source itself (§1.4 Q3). Markdown, plain-text, `.csv` and `.tsv` files are text already and need no `read`: register them with `wikeeper ingest start <file>`; `read` accepts `.csv` and `.tsv` as text too, so running it on one is harmless (STORY-003-10 R2, R3; Gate 1 decision 26, §1.4 Q10). A `.md` original takes no `--text-file` (`ingest start` refuses it, `src/ingest/registry.ts:111`).
  - (c) `--out` (decision 5; STORY-003-10 R8): write to a new file in the system temp directory, `$TMPDIR` or `/tmp` on macOS and Linux, `$env:TEMP` on Windows, with a fresh name for every read, for example `wikeeper read <url> --out /tmp/wikeeper-read-1.md`. `read` never overwrites: an existing file, a missing folder, an extension other than `.md` or `.txt`, the names `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`, a path through a folder or file whose name starts with `.`, and any path inside the wiki's content directory exit 2 (`usage`) and write nothing.
  - (d) Read only what the user gave: a link or file the user named. Never `read` a URL found inside a page, a document or another source, because in `ai` mode `read` runs without a prompt (STORY-003-10 R10).
  - (e) The `--text-file` bullet (`:21`) says the text comes from `wikeeper read` or from text the agent already has; "A URL needs `--text-file`" stays.
  - (f) A table with the header row `` | `read` reports | What to do | `` after the bullets, one row per code, exactly as STORY-003-10 §1.3 hands them over. Warnings (exit 0; the file is still written): `needs_browser` — open the page in your own browser, or ask the user to paste it, then pass the text with `--text-file`; `likely_scanned` — read the PDF yourself and pass the text with `--text-file`; if you cannot, tell the user; the `unsupported` warning — a DOCX's images were not converted and their places are marked `[image: …]`; tell the user when a figure matters. Errors (`error.code`): `usage` (exit 2) — fix the command; for a refused `--out`, pick a new `.md` or `.txt` name in the temp directory; `not_found` (exit 2) — check the path with the user; the `unsupported` error (exit 2) — follow the hint: for `.doc` ask for a .docx, for `.pptx` a PDF export, for `.xlsx` a CSV export of the sheet, then register the CSV like a text file, for any other format a PDF, DOCX, HTML, markdown, text or CSV version; `timeout` or `fetch_failed` (exit 1) — try once more, and if it fails again, tell the user and ask for the file or the text; `too_large` (exit 1) — the response is over 10 MB: ask for a smaller export or the text; `http_error` (exit 1) — read `details.status`: a 401 or 403 means a login, so ask the user to paste the page; a 404 means a wrong link, so check it with the user; any other status, tell the user; `conversion_failed` (exit 1) — for a PDF, read it yourself; for a DOCX, ask the user for another export. No `truncated` row: no command emits it (STORY-003-10 R7).
  - (g) The "Link" row of section "Delegation" (`:175`) says the main agent gets the text with `wikeeper read` (section "Register") instead of "fetches the text".
- **R2 — `status` in a new WIKI.md section `## Lint and status` (contract K5; EPIC-005 §2; walkthrough row 8.12; Gate 1 decisions 11, 17, 20, 24; audit finding 16).** The section sits between "Proposing rule changes" and "Log and index". It says:
  - Run `wikeeper status` once per session, before the first ingest, and whenever the user asks what is open or pending in the wiki. The pointer block gets no `status` line (decision 20).
  - `wikeeper status`, `wikeeper lint` and `wikeeper rules list` only read; with `enforce` on they run without a permission prompt in every mode (decision 17, STORY-005-09). `wikeeper rules record` writes a log event, so your harness may ask first.
  - One line per `--json` field of K5:
    - `open_ingest` and `stale_lock`: an ingest holds the write lock. Finish or abort it (section "Write phase") when it is yours; otherwise wait or ask the user. When `stale_lock` is true, run `wikeeper ingest apply <id> --force-unlock` only with the user's approval.
    - `unfinished_sources`: registered sources with no finished ingest. An aborted source stays listed until it is finished or dropped (decision 11). Offer to continue each one, or to drop it with `wikeeper ingest abort <id> --drop` once the user agrees.
    - `reingest_candidates`: sources finished under an older rule version. Offer to re-ingest each from its `origin` (STORY-005-05 R6), from the repository root: `wikeeper ingest start <origin> --reingest`, with `wikeeper read <origin> --out <file>` and `--text-file <file>` first when the origin is a URL or a file that section "Register" sends through `read`. An origin `stdin` was text from chat: pass its stored text, `.wiki/raw/<source_id>.md`, on stdin to `wikeeper ingest start - --reingest`. When the origin is gone, the text falls back on what `.wiki/raw/` keeps (Gate 1 decision 24, §1.4 Q9):
      - **A file origin that is missing, moved or changed.** Missing or moved: `read` reports `not_found`, `ingest start` reports "source not found". Changed: the `--json` output of `ingest start <origin> --reingest` has `source.reingest_of` null, because a changed file has a new hash and a file is linked by its hash only (`src/ingest/registry.ts:94–101`, `src/commands/ingest-start.ts:275`); drop that registration with `wikeeper ingest abort <id> --drop` and tell the user the file changed (ingest the new version as a new source only if they ask). Then copy the stored original, `.wiki/raw/<source_id><ext>` (the `original` name in `.wiki/raw/<source_id>.meta.json`), into a new folder in the system temp directory under the origin's file name, and run `wikeeper ingest start <copy> --kind <kind> --reingest` with the candidate's `kind`, after `wikeeper read <copy> --out <file>` and with `--text-file <file>` when section "Register" sends that file type through `read`. The copy is needed because `ingest start` refuses a path inside the wiki (`src/commands/ingest-start.ts:166`). It is byte-identical, so `ingest start` finds the source by its sha256 and the new source joins its re-ingest family (`findDuplicate`, `src/ingest/registry.ts:94`; `reingest_of`, `src/commands/ingest-start.ts:275`). The new source's `origin` is the temp path (`fileOrigin`, `src/ingest/registry.ts:58`).
      - **The copy in `whitelist` mode.** Its temp path matches no origin entry, and `--approved` does not override a whitelist denial (`src/ingest/permissions.ts:114–151`; it counts only in `ask` mode, `:105`). `--kind` lets a kind entry of `ingest.whitelist.kinds` allow the copy at `ingest start` (`:125–135`), before any facts are extracted; without it the kind would be checked only at `ingest facts`, which removes a denied source (`src/commands/ingest-facts.ts:110–135`). When the kind is not listed, `ingest start` denies the copy (exit 4): tell the user that the re-ingest needs the kind in `ingest.whitelist.kinds` of `.wiki/config.yml`, and change the file only with their approval; otherwise leave the source as it is.
      - **A URL origin whose `read` fails** (exit 1, after one more try). `.wiki/raw/` keeps no copy of the page, only the text given with `--text-file`, as `.wiki/raw/<source_id>.md` (`original` is null; `src/commands/ingest-start.ts:147–153`, `src/ingest/registry.ts:125–126`). Pass that file as `--text-file .wiki/raw/<source_id>.md` to `wikeeper ingest start <origin> --reingest`. No copy is needed: `ingest start` checks only the source path against the wiki, not `--text-file` (`src/commands/ingest-start.ts:108–119`, `:166`). The origin stays the URL, so a whitelist host entry still matches, and the same text hash or the same URL links the new source to the family (`src/ingest/registry.ts:94–99`). Stdin would record the origin as `stdin`, and a copy run as a file would record a temp path, so neither is used (orchestrator call within decision 24).
      - **Nothing stored** (no `.wiki/raw/<source_id>.*` file): tell the user.
    - `pending_rule_suggestions`: what finished ingests could not capture, by source. Propose rule changes for them (section "Proposing rule changes").
    - `setup`: when `completed_at` is null, offer `.wiki/system/SETUP.md`; when `me` is false, offer `.wiki/system/ONBOARDING.md`.
    - `misses`: how many searches found nothing; `wikeeper search --misses` lists them, and they feed rule proposals.
- **R3 — `lint` in section "Lint and status" (contracts K2, K3; CR-002 D1; Gate 1 decision 10; audit findings 9, 11, 12).**
  - It says: `wikeeper lint` checks the pages and reports findings; it never changes anything. Each finding names its check id, the file from the repository root and, when known, the line (STORY-005-02 R3). It exits 1 when any finding is an error. `wikeeper ingest finish` already reports the `broken-link`, `uncited-claim` and `unlogged-change` findings for the pages it changed (STORY-005-03 R5). Run `wikeeper lint` after a merge or pull that touched the wiki (after `wikeeper index rebuild`) and when the user asks whether the wiki is in good shape. `wikeeper lint --check <id>` reruns one check, for example `wikeeper lint --check unlogged-change`.
  - Then a table `| Finding | What to do |` with one row per id in `PAGE_CHECKS` (`src/lint/checks.ts`) when this story merges, each first cell the id in a code span. Row order is free: STORY-006-11 R3 compares the ids with the registry as a set, and this story writes no check of its own for the table (audit finding 12).
    - `broken-link`: a `[[…]]` link resolves to no page, entity or alias; fix the link in a write phase.
    - `uncited-claim`: a claim or fact line has no `[[src-…]]` citation; in a write phase, cite the source that supports it, or remove the claim when no source does.
    - `orphan-page`: no other page links to the page; link it from a related page in a write phase, or tell the user.
    - `index-drift`: `.wiki/index.md` is out of date; run `wikeeper index rebuild`.
    - `unlogged-change`: the page changed outside an ingest: a shell write the guard cannot see (section "Write phase"), a hand edit, a `post_ingest` hook, or a git merge that combined two ingests' edits. Show the user the change. To keep a hand or shell edit, record it with a chat-excerpt ingest whose write phase updates that page, for example by adding the cited fact line; an ingest that leaves the page as it was at apply does not clear the finding (audit finding 11; STORY-005-03 §1.3). To drop the edit, restore the page's last ingested version from git, with the user's approval. A merged page stays reported until the next ingest updates it (decision 10): tell the user, and do not restore it, because that would lose one branch's ingest. Hooks in `hooks.post_ingest` of `.wiki/config.yml` must not edit pages: page hashes are taken before the hooks run.
    - `stale-fact`: a status, or a tentative planned date, was last dated more than `lint.stale_after_days` days ago (default 30, STORY-005-08). Ask the user whether it still holds, or offer to ingest a newer source; a confirmation the user gives in chat is ingested as a chat excerpt whose write phase adds a dated fact line.
  - After the table: pages change only in a write phase, so a page finding is fixed in the next ingest that touches the page or, when the user wants it fixed now, in a chat-excerpt ingest of their instruction (STORY-006-12 R5); `index-drift` is the one exception. Lint check ids are written as "`<id>` finding", never "`<id>` check" (`test/templates/structure.ts:194` reads that form as a doctor check id).
- **R4 — `lint --rules` in section "Lint and status" (EPIC-005 §2; CR-002 C1; CR-003 D4; STORY-005-04; Gate 1 decision 15).** It says: `wikeeper lint --rules` checks `.wiki/kb_instructions.md` and the whitelist kinds in `.wiki/config.yml`: the line format, rules that duplicate each other or name an unknown entity or field, questions no rule serves, entities no question needs, changelog lines that do not match the versions, and whitelist kinds that name no kind. It exits 1 when any finding is an error. Run it after every approved change to that file and when `wikeeper doctor` warns that the file has parse issues (its `kb-instructions-valid` check). Each finding becomes a proposal (section "Proposing rule changes"); never edit the file without the user's approval. An `ambiguous-line` finding on a source-kind line inside an HTML comment means `wikeeper ingest` still reads that rule: propose deleting the line or turning it into a `note:` line. No other rule-check id is named.
- **R5 — The `finish` report (contract K3).** WIKI.md section "Write phase" step 9 (`:48`) adds: the report also lists the lint findings for the pages this ingest changed; they never fail `finish`; section "Lint and status" says what to do with them. The writer prompts are unchanged: they already return the report of the last ingest command unchanged (`templates/agents/claude/wiki-writer.md:27`).
- **R6 — Rule decisions and the dry run in WIKI.md section "Proposing rule changes" (contracts K4, K6; architecture.md §9; Gate 1 decisions 12, 13; audit findings 9, 14).**
  - (a) The list of where proposals come from (`:213–219`) adds `wikeeper status` pending rule suggestions (as part of "information that keeps appearing and is never captured") and `wikeeper lint --rules` findings.
  - (b) Before offering a proposal, run `wikeeper rules list` and do not offer one the user rejected before (same kind and summary), unless they bring it up again.
  - (c) To show what a changed rule would do to a source already ingested, finished or not (decision 13), extract its facts again from `.wiki/raw/` under the proposed rule into a facts file in the system temp directory, keeping each anchor a quote from the source so unchanged facts pair up (STORY-005-07 §1.5), and run `wikeeper ingest facts <id> --file <facts.json> --dry-run`: it prints the facts that would be added, removed and changed, and stores nothing. Show that diff with the proposal.
  - (d) Record every decision with `wikeeper rules record --accepted --kind <kind> --summary "<one line>" --from <source-id>` or `wikeeper rules record --rejected --kind <kind> --summary "<one line>" --from <source-id>`. `<kind>` is the proposal's kind as the same section states it (STORY-006-10 R7: a source-kind id, or `questions`, `entities`, `capture-signals`, `write-policy` or `never-capture`). `--from` names the source whose pending suggestions led to the proposal, so `wikeeper status` stops listing them, and is left out otherwise. One decision with `--from` clears every pending item of that source, so decide every item of a source before recording with `--from` (STORY-005-05 R7). When a proposal is offered again, reuse its earlier summary so the CLI can report it as previously rejected.
  - (e) Approved: edit the file, bump that kind's `(vN)` version, add the changelog line in the form STORY-006-10 R7 gives, run `wikeeper lint --rules`, record it with `--accepted`, then offer to re-ingest the sources `wikeeper status` lists as re-ingest candidates. Rejected: record it with `--rejected` and change nothing in the file; the line "add a changelog line marking it rejected" (`:224`) goes. The section keeps ".wiki/kb_instructions.md", "changelog", "version", "rejected" and ".wiki/system/ONBOARDING.md" (`test/templates/wiki-protocol.red.node.test.ts:125`), and STORY-006-10's dated-facts, kind and changelog text.
- **R7 — After a merge (WIKI.md section "Log and index", `:230`; Gate 1 decision 10).** After `wikeeper index rebuild`, run `wikeeper lint`. Pages that both branches' ingests changed are reported as `unlogged-change` until the next ingest updates them, as section "Lint and status" says.
- **R8 — SETUP.md.** Step 2, item 1 (`templates/system/SETUP.md:17`): a document the user names that is a URL, a DOCX or a local `.html` / `.htm` file is read with `wikeeper read <file|url> --out <file>` first; a PDF too, and the agent reads the PDF itself when `read` warns `likely_scanned` (`.wiki/system/WIKI.md`, section "Register"). Step 3 gains a last item: after the user approves and the file is written, run `wikeeper lint --rules`, go through its findings with the user, and fix the file with their approval before step 4.
- **R9 — `wiki-ingest` skill (`templates/skills/wiki-ingest/SKILL.md:8–10`).** The list of WIKI.md sections to read adds "Lint and status"; the short summary says a URL, a DOCX, an HTML file or a PDF is read with `wikeeper read` before `wikeeper ingest start`, and a markdown, text, CSV or TSV file is registered directly. Frontmatter, description and STORY-006-12's "Who does what" are unchanged.
- **R10 — Vocabulary.** The text names exactly these SPRINT-03 forms and no other: `wikeeper read <file|url> --out <file>`, `wikeeper ingest start <file|url> --text-file <file>`, `wikeeper ingest start <origin> --reingest`, `wikeeper ingest start <copy> --kind <kind> --reingest` (the R2 fallback; a form of its own, because it adds `--kind`), `wikeeper ingest start - --reingest`, `wikeeper status`, `wikeeper lint`, `wikeeper lint --rules`, `wikeeper lint --check <id>`, `wikeeper rules list`, `wikeeper rules record --accepted|--rejected --kind <kind> --summary "<one line>" [--from <source-id>]` (written as two forms), `wikeeper ingest facts <id> --file <facts.json> --dry-run`; the K5 field names `open_ingest`, `stale_lock`, `unfinished_sources`, `reingest_candidates` (with `origin`), `pending_rule_suggestions`, `setup`, `misses`; the `read` codes `needs_browser`, `likely_scanned`, `unsupported`, `usage`, `not_found`, `timeout`, `fetch_failed`, `too_large`, `http_error`, `conversion_failed`; the page-check ids `PAGE_CHECKS` holds; and the rule-check id `ambiguous-line`.
- **R11 — Invariants.** (a) Every command, flag and section named exists when this story merges, so `test/templates.test.ts:113` stays clean. (b) WIKI.md has 14 `##` sections and at most 400 lines (`test/templates/wiki-protocol.red.node.test.ts:161`). (c) `templates/agent-block.md` and the six sub-agent files are not touched; the 14-line cap (CR-002) and the shared writer text (STORY-006-05 R6) hold. (d) The SETUP.md step 4 preview table is not touched (§1.3). (e) Every SPRINT-02 red test stays green, except STORY-006-11 R6 (c) and (d) — the WIKI.md section list and the SETUP.md command list — which this story's QA-Red applies.

### 1.3 Out of Scope
- The CR-003 instruction items: the whitelist format, approvals, `ai`-mode prompts, kb line format, `--no-miss`, `--mark`, the proposal kind and changelog form (STORY-006-10), and page naming, fact lines, corrections and the `unlogged-change` sentence in "Write phase" (STORY-006-12). Both land first.
- The SETUP.md step 4 preview-table rows for the `read`, ask and read-only rules: STORY-003-10 (K7), STORY-002-09 (K9) and STORY-005-09 (decision 17), in the same change as the enforce writers, because `test/templates/setup.red.node.test.ts` S2 compares the table with `CLAUDE_ENFORCE` and `CODEX_ENFORCE` at run time.
- The allow rules for `status`, `lint` and `rules list` themselves (STORY-005-09, decision 17), which land before this story; this story only says they do not prompt.
- The finding-table check against the registry (STORY-006-11 R3 (b), audit finding 12).
- The command behaviour itself (STORY-003-10, 003-11, 005-02 … 005-08) and the other structural-test extensions (STORY-006-11).

### 1.4 Open Questions

The brief's design calls (`read --out`, page-hash baseline, the K1 format) are settled and not reopened here.

- **Question:** Q1. The brief says `status` runs at session start. The only always-loaded text is the pointer block (12 of 14 lines at 40018c5; 14 of 14 once STORY-006-12 adds its two lines, Gate 1 decision 22). Should the block gain a line "run `wikeeper status` at session start"?
- **Recommended:** No. WIKI.md section "Lint and status" says to run it once per session before the first ingest; the agent reads WIKI.md before any wiki work, and the `wiki-ingest` skill lists the section.
- **Decision:** No `status` line in the pointer block (14-line cap); WIKI.md says to run `status` once per session before the first ingest — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q2. `wikeeper rules record` requires `--kind` (contract K4), but some proposals change no source kind: a new question from onboarding, a new entity, a Never-capture line from a user's correction. What does the agent pass?
- **Recommended:** The proposal's kind as STORY-006-10 R7 defines it (R6 (d)).
- **Decision:** A source-kind id, or one of the section keys STORY-005-01 freezes for non-kind proposals: `questions`, `entities`, `capture-signals`, `write-policy`, `never-capture` — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q3. The brief says `read` is for a URL, DOCX or PDF "it can't read itself". Claude Code can open PDFs and fetch pages. Should the agent use `read` anyway?
- **Recommended:** Yes, as architecture.md §7.7 argues: an agent's web tool may return a summary instead of the page, and `--out` gives `--text-file` the file as it is (R1 (b)).
- **Decision:** The agent uses `read` for every URL, every DOCX and every local `.html` / `.htm` file; for a PDF it runs `read` first and reads the PDF itself when `read` warns `likely_scanned` (Gate 1 decision 8) — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q4. After a git merge combines two ingests' edits to one page, the page matches neither recorded hash. What does WIKI.md tell the agent?
- **Recommended:** That such pages are reported until their next ingest, and are not restored (R3, R7).
- **Decision:** `lint` reports `unlogged-change` (error) on such a page until the next ingest updates it; WIKI.md explains it — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q5. Is an aborted source still "unfinished" in `wikeeper status`, so the text must offer `--drop` for it?
- **Recommended:** Yes (R2).
- **Decision:** A source is unfinished until an `ingest` event for it exists; `abort` events do not finish a source — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q6. Can the dry run preview a rule change on a source whose ingest is finished? Today `ingest facts` refuses a finished ingest (`src/commands/ingest-facts.ts:84`).
- **Recommended:** Yes; R6 (c) relies on it.
- **Decision:** `ingest facts --dry-run` works on finished sources; it stores nothing and removes nothing (STORY-005-07) — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q7. Do `status`, `lint` and `rules list` prompt for permission in Claude Code and Codex?
- **Recommended:** No, once their allow rules exist; R2 says so.
- **Decision:** The read-only `lint`, `status` and `rules list` get allow rules in every permission mode, like `search`; `rules record` gets none (owner STORY-005-09, a predecessor of this story; Gate 1 decision 17) — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q8. The new section and the new SETUP.md commands break two SPRINT-02 red tests (the WIKI.md section list, the SETUP.md command list). May this story's QA-Red apply STORY-006-11 R6 (c) and (d)?
- **Recommended:** Yes; this story is the one whose text needs them.
- **Decision:** Authorised as recommended: the QA-Red step of the story that first needs a re-scope makes it; this story applies R6 (c) and (d), and STORY-006-11 verifies them — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q9. A re-ingest candidate's origin can be gone: the file deleted, moved or changed, or the URL failing. `ingest start` refuses a path inside the wiki (`src/commands/ingest-start.ts:166`), so the agent cannot point it at `.wiki/raw/`. What does WIKI.md tell the agent?
- **Recommended:** Copy the stored original from `.wiki/raw/` to the system temp directory and re-ingest the copy with `--reingest`; the same hash joins the source's re-ingest family (R2).
- **Decision:** Gate 1 decision 24: when a re-ingest candidate's origin file is missing, moved or changed, or its URL fails, the agent copies the stored original from `.wiki/raw/` to the system temp directory and re-ingests the copy with `--reingest` — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q10. `read` now reads `.csv` and `.tsv` as text, and its `.xlsx` hint says to export the sheet as CSV and read the CSV (STORY-003-10 R2). What does the agent text say?
- **Recommended:** CSV and TSV files are registered directly like `.txt` (they need no `read`, which accepts them anyway); for `.xlsx`, ask for a CSV export (R1 (b), (f), R8, R9). Orchestrator call within decision 26, 2026-10-17: `read` accepting CSV removes a needless error, and a text file needs no conversion.
- **Decision:** Gate 1 decision 26: `read` treats `.csv` and `.tsv` as text, like `.txt`; the `.xlsx` hint becomes "export the sheet as CSV and read the CSV"; this story writes the agent-facing text — _approved (human, 2026-10-17, Gate 1)_

### 1.5 Risks

- **Risk:** The text describes command surfaces drafted in parallel; a late rename, a different page-check id, a changed `read` code or a missing `origin` field makes it wrong.
- **Mitigation:** Every owner story is upstream; the forms are exactly contracts K2–K7 and the owners' hand-off lists; STORY-006-11 fails on any unknown command, flag or lint id and on a finding table that differs from `PAGE_CHECKS`; §2.1 runs `read`, `status`, `lint`, `rules record` and the dry run against the CLI.
- **Risk:** The "Register" section grows long with the `read` table.
- **Mitigation:** One row per code, one sentence each; target about 70 added lines across WIKI.md, so it stays well under 400 lines with STORY-006-10's and 006-12's additions.
- **Risk:** The R2 fallback records the temp path as the new source's `origin`, and in `whitelist` mode a copy passes only by its kind.
- **Mitigation:** The new source joins the old one's re-ingest family by hash, so the family keeps the real origin in `raw/`; a later candidate for it uses the same fallback, because the temp copy is gone by then. R2 passes `--kind` so a whitelist denial comes at `ingest start`, before any extraction, and tells the agent to ask the user.
- **Risk:** The new section and two new SETUP.md commands break SPRINT-02 red tests (WIKI.md section list, SETUP.md command list).
- **Mitigation:** STORY-006-11 R6 (c) and (d), authorised (§1.4 Q8) and applied by this story's QA-Red.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | Two ways to register a source: through `read --out` and `--text-file`, or directly for markdown and text. |
| Interfaces | T | The same guidance reaches the agent through WIKI.md, SETUP.md and the `wiki-ingest` skill. |
| Data | T | One row per command form and file part; one row per `read` code. |
| Rules | T | A kept edit must be recorded by an ingest that updates the page; rejected proposals are recorded and not re-offered; the dry run stores nothing. |

```gherkin
Feature: Instructions for read, lint, status and rules

  @data @interfaces
  Scenario Outline: Each new command form lands in its file and part
    Given the templates tree after this story
    Then <part> of <file> contains <phrases>

    Examples:
      | item              | file                                  | part                             | phrases                                                                                                             |
      | read (R1)         | templates/system/WIKI.md              | section "Register"               | "wikeeper read <file\|url> --out <file>", "wikeeper ingest start <file\|url> --text-file <file>", "$env:TEMP", "fresh name", ".tsv" |
      | read codes (R1)   | templates/system/WIKI.md              | section "Register"               | "`needs_browser`", "`likely_scanned`", "`not_found`", "`timeout`", "`fetch_failed`", "`too_large`", "`http_error`", "`conversion_failed`", ".pptx", "CSV export" |
      | link row (R1)     | templates/system/WIKI.md              | section "Delegation"             | "wikeeper read"                                                                                                     |
      | status (R2)       | templates/system/WIKI.md              | section "Lint and status"        | "wikeeper status", "once per session", "`origin`", "wikeeper ingest start - --reingest", "`pending_rule_suggestions`", "wikeeper ingest start <copy> --kind <kind> --reingest", "--text-file .wiki/raw/<source_id>.md", "`ingest.whitelist.kinds`" |
      | lint (R3)         | templates/system/WIKI.md              | section "Lint and status"        | "wikeeper lint", "wikeeper lint --check unlogged-change", "never changes", "post_ingest"                             |
      | lint --rules (R4) | templates/system/WIKI.md              | section "Lint and status"        | "wikeeper lint --rules", "`kb-instructions-valid` check", "`ambiguous-line` finding"                                |
      | finish (R5)       | templates/system/WIKI.md              | section "Write phase"            | "Lint and status"                                                                                                   |
      | rules (R6)        | templates/system/WIKI.md              | section "Proposing rule changes" | "wikeeper rules list", "wikeeper rules record --accepted", "wikeeper rules record --rejected", "--from", "every item" |
      | dry run (R6)      | templates/system/WIKI.md              | section "Proposing rule changes" | "--dry-run", "stores nothing", "quote"                                                                              |
      | merge (R7)        | templates/system/WIKI.md              | section "Log and index"          | "wikeeper index rebuild", "wikeeper lint", "`unlogged-change`"                                                      |
      | setup (R8)        | templates/system/SETUP.md             | step 2                           | "wikeeper read", "`likely_scanned`"                                                                                 |
      | setup (R8)        | templates/system/SETUP.md             | step 3                           | "wikeeper lint --rules"                                                                                             |
      | skill (R9)        | templates/skills/wiki-ingest/SKILL.md | body                             | "\"Lint and status\"", "wikeeper read"                                                                              |

  @paths
  Scenario: A source reaches ingest start through read, or directly
    Given WIKI.md section "Register"
    Then a URL, a DOCX or a local HTML file goes through "wikeeper read <file|url> --out <file>" and then "--text-file <file>", a PDF goes through read first, and a markdown, plain-text, CSV or TSV file is registered without read
    And the "read" table names no "truncated"
    When, in a temp wiki, "wikeeper read" runs on report.docx from test/fixtures/read/make-fixtures.ts with "--out" set to a new file in a fresh temp directory, and "wikeeper ingest start" runs on the same DOCX with "--text-file" and "--approved"
    Then both exit 0 and .wiki/raw/ holds the original and the text
    When "wikeeper read" runs again with the same "--out" file
    Then it exits 2 with code "usage" and the file is unchanged, as the text says

  @rules @interfaces
  Scenario: The status and lint guidance matches what the commands report
    Given WIKI.md section "Lint and status"
    Then every field that opens a status-field bullet is a key of the data of "wikeeper status --json", run in a temp wiki, and every key of that data is named, with "origin" named for re-ingest candidates
    And the "index-drift" row names "wikeeper index rebuild", and every other row names a write phase, an ingest or the user
    And the "unlogged-change" row names a shell write, section "Write phase", a merge and "hooks.post_ingest", and says the ingest that keeps an edit must update the page
    When, in that wiki, a finished page is changed with a shell write and a chat-excerpt ingest is then applied and finished without updating that page
    Then "wikeeper lint --check unlogged-change" still reports the page
    When a second chat-excerpt ingest adds a cited fact line to that page and finishes
    Then "wikeeper lint --check unlogged-change" reports nothing for it
    When, in that wiki, a file source with a kind is ingested and finished, its origin file is deleted, its stored original is copied to a new folder in the system temp directory outside the repository, and the section's "wikeeper ingest start <copy> --kind <kind> --reingest" form runs on the copy with "--json"
    Then it exits 0, data.source.reingest_of is that source's id, and data.source.origin is the copy's absolute path

  @rules
  Scenario: Rule decisions are listed first, recorded every time, and previewed without storing
    Given WIKI.md section "Proposing rule changes"
    Then "wikeeper rules list" appears before the first "wikeeper rules record"
    And the approved bullet names the version bump, the changelog line, "wikeeper lint --rules" and "--accepted"
    And the rejected bullet names "--rejected" and no changelog line
    When, in a temp wiki, the section's "wikeeper rules record --rejected" form runs twice with the same kind and summary
    Then "wikeeper rules list --json" marks the second decision previously_rejected
    When the section's "wikeeper ingest facts <id> --file <facts.json> --dry-run" form runs on a finished ingest of that wiki
    Then it exits 0 and raw/<id>.facts.json is byte-identical

  Scenario Outline: Error — a form the CLI does not have fails the checks
    Given a copy of the templates directory where WIKI.md section "Lint and status" contains <text>
    When the checks of test/templates/structure.ts run on the copy
    Then they fail naming <named> and its line

    Examples:
      | text                                      | named                                       |
      | "`wikeeper status --all`"                 | "\"--all\" is not an option of \"status\""  |
      | "`wikeeper read <url> --output <file>`"   | "\"--output\" is not an option of \"read\"" |
```

### 2.2 Verification Steps (Manual)
- [ ] Part-3 walkthrough in `~/Documents/Dev/formapass_management`: hand the agent the Formapass deck PDF (`FormaPass — პრეზენტაცია (ქართ.).pdf`) and a Formapass web page; check it runs `wikeeper read … --out …` into the temp directory for each, reads the deck itself after the `likely_scanned` warning, registers both with `--text-file`, and asks for a PDF export when handed the `.pptx`.
- [ ] Start a new session and ask "what is open in the wiki?"; check the agent runs `wikeeper status` once and explains the pending rule suggestions from the SPRINT-02 ingests.
- [ ] Write one page line with a shell redirect, run `wikeeper lint`, and check the agent shows the `unlogged-change` finding and offers to keep it through a chat-excerpt ingest that updates the page, or to restore it.
- [ ] Reject a rule proposal, then ingest a source that raises the same gap; check the agent does not offer it again.
- [ ] Propose a change to the `roadmap` rule and check the agent previews it with `wikeeper ingest facts <id> --file <facts.json> --dry-run` on the finished SPRINT-02 roadmap ingest.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `templates/system/WIKI.md` |
| Related Files | `templates/system/SETUP.md`, `templates/skills/wiki-ingest/SKILL.md` |
| Test Files (new) | `test/templates/sprint-03-commands.red.node.test.ts` |
| Re-scoped SPRINT-02 red tests (STORY-006-11 R6 (c), (d), applied by this story's QA-Red) | `test/templates/wiki-protocol.red.node.test.ts`, `test/templates/setup.red.node.test.ts` |
| New Files Needed | `test/templates/sprint-03-commands.red.node.test.ts` |

- **Notes on the files above:**
  - Test files: `test/templates/sprint-03-commands.red.node.test.ts` (QA-Red).

### 3.2 Technical Logic
- Start from WIKI.md, SETUP.md and the skill as STORY-006-10 and STORY-006-12 leave them. Edit "Register" (R1), "Write phase" step 9 (R5), "Delegation" Link row (R1 (g)), "Proposing rule changes" (R6), add "Lint and status" (R2–R4), then "Log and index" (R7). Then SETUP.md steps 2 and 3 (R8) and the skill (R9).
- Keep each status field, `read` code and finding to one line or row; target about 70 added lines, so WIKI.md stays well under 400.
- Section references use the existing form `section "<Heading>"` inside WIKI.md, and `.wiki/system/WIKI.md`, section "…" elsewhere, so `checkSections` (`test/templates/structure.ts:317`) resolves them.
- The QA-Red test splits sections as `test/templates/wiki-protocol.red.node.test.ts:43` and SETUP steps as `test/templates/setup.red.node.test.ts:40` do. It runs the CLI in-process with `runCli` in temp git repos (as `doctorCheckIds`, `test/templates/structure.ts:202`, does) for the four live checks; the shell write is a plain `writeFile` on the page. It builds the DOCX with STORY-003-11's generator, and uses `runAllChecks` from `test/templates/structure.ts` for the error outline. It reads no `PAGE_CHECKS` ids: the finding-table check is STORY-006-11's (R3 (b)).
- QA-Red applies STORY-006-11 R6 (c) and (d) exactly, by content anchors, and lists them in its commit message.
- No code changes.

### 3.3 API Contract (if applicable)

Not applicable — template text. Consumes read-only: `PAGE_CHECKS` and the finding line (K2), the `finish` lint hook (K3), the `status --json` fields with `origin` (K5), `rules record` / `rules list` and the `--kind` keys (K4), `ingest facts --dry-run` (K6), `read`, its `--out` rules and its codes (K7).

## Task Breakdown

- [ ] QA-Red: apply STORY-006-11 R6 (c) to `test/templates/wiki-protocol.red.node.test.ts` and R6 (d) to `test/templates/setup.red.node.test.ts` -> R11
- [ ] QA-Red: write `test/templates/sprint-03-commands.red.node.test.ts` from the five scenarios in §2.1 -> R1–R10
- [ ] Write the `read` bullets, the `read` table and the Delegation Link row -> R1
- [ ] Write section "Lint and status": status use and fields, lint usage, the finding table, `lint --rules` -> R2, R3, R4
- [ ] Add the finding pointer to "Write phase" step 9 and the lint step to "Log and index" -> R5, R7
- [ ] Rewrite the decision and dry-run part of "Proposing rule changes" -> R6
- [ ] Update SETUP.md steps 2 and 3 and the `wiki-ingest` skill -> R8, R9
- [ ] Run `npm test` in full; check `test/templates.test.ts` reports no finding -> R10, R11

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 1 | The section and table-row reader used by the content checks (first cells of a table under a heading) |
| Integration tests | 4 | `read` → `ingest start --text-file` with the `--out` refusal; `status --json` keys; the `unlogged-change` keep path and the stored-original re-ingest; `rules record` repeat with the finished-ingest dry run; each in-process against a temp git repo with fixture files, no network |
| E2E / acceptance tests | 18 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately (13 + 1 + 1 + 1 + 2) |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `npm test` passes in full, with no SPRINT-02 red test changed beyond STORY-006-11 R6 (c) and (d).
- [ ] `test/templates.test.ts` reports no finding on the merged tree.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/system/WIKI.md:16` — section "Register" (`:18` intro, `:21` the `--text-file` bullet); `:48` — "Write phase" step 9; `:175` — the Delegation "Link" row; `:211` — "Proposing rule changes" (`:213` its sources, `:224` the rejected line); `:226` — "Log and index" (`:230` after a merge).
- **Surface:** `templates/system/SETUP.md:17` — step 2, drafting `project.md` from a document; `:25` — step 3.
- **Surface:** `templates/skills/wiki-ingest/SKILL.md:8` — the list of WIKI.md sections to read.
- **Surface:** `templates/agents/claude/wiki-writer.md:27` — the writer returns the last ingest report unchanged, so `finish`'s findings reach the main agent without a prompt change.
- **Surface:** `src/ingest/registry.ts:111` — `ingest start` refuses `--text-file` for a markdown original; `src/ingest/registry.ts:25` — the origin forms (`stdin` among them) a re-ingest candidate carries.
- **Surface:** `src/commands/ingest-start.ts:166` — `ingest start` refuses a source inside the wiki; `:108` — `--text-file` is read without that check; `:275` — `reingest_of` is the duplicate's id; `src/ingest/registry.ts:94` — `findDuplicate` (sha256, then URL origin); `:125` — the stored original `raw/<id><ext>` and text `raw/<id>.md`; `src/ingest/permissions.ts:114` — the whitelist checks the R2 fallback meets.
- **Surface:** `src/commands/ingest-facts.ts:84` — `ingest facts` refuses a finished ingest today; K6's dry run skips that refusal (§1.4 Q6).
- **Surface:** `src/core/config.ts:74` — `hooks.post_ingest`; `src/core/config.ts:77` — `lint.stale_after_days`, default 30.
- **Coverage of this requirement:** partial — WIKI.md, SETUP.md and the skill exist; nothing in them names the SPRINT-03 commands, because STORY-006-04 R2 kept them out until they exist.

## Prior work

- [[EPIC-006]] (parent, archived), [[EPIC-005]] (lint, status, rule decisions, dry run), [[EPIC-003]] (`read`), [[CR-002]] (D1: lint is the shell-write backstop), [[CR-003]] (D4, D5: doctor and status), [[STORY-006-04]] (WIKI.md; R2 kept SPRINT-03 commands out; R14 recorded rejections as changelog lines until a decision command existed), [[STORY-006-02]] (SETUP.md), [[STORY-006-05]] (skills and sub-agents), [[STORY-006-10]] and [[STORY-006-12]] (land first on WIKI.md), [[STORY-003-10]], [[STORY-005-03]], [[STORY-005-05]], [[STORY-005-07]] (the instruction points they hand to this story), [[STORY-005-09]] (the allow rules R2 describes), [[SPIKE-001]] (the deck PDF). Wiki index and `.cleargate/FLASHCARD.md` checked 2026-10-17: no existing story documents these commands.

## Why not simpler?

- **Smallest existing surface that could carry this:** WIKI.md sections "Register", "Proposing rule changes" and "Log and index", plus one new section for lint and status.
- **Why isn't extension / parameterization / config sufficient?** The commands report; only the instructions tell the agent when to run them and what to do with each code, finding, status field and decision. One new section keeps lint and status in one place the skill can name, instead of spreading the finding actions over sections the agent reads for other reasons.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding.
- [x] No "TBDs" exist anywhere in the specification or technical logic. (None; the §1.4 decisions were approved at Gate 1 on 2026-10-17.)
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
