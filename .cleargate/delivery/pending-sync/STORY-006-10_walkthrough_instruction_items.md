---
story_id: STORY-006-10
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: "CR-003 C1 (text), C2, C3, D1–D3, A1 and A5, with its five Open Question answers (approved 2026-10-17) · SPRINT-03 Gate 1 decisions 3, 12, 14, 16, 21 (plans/gate1-decisions.md; approved at Gate 1, 2026-10-17) and consistency-audit findings 9, 14, 17, 18 · SPRINT-03 decomposition brief (contracts K1, K8, K9, K11; shared files: 006-10 → 006-12 → 006-09 on WIKI.md and SETUP.md, 006-11 last; SETUP.md after the step-4 table edits 002-09 → 003-10 → 005-09, gate1-decisions technical call) · STORY-002-09 R1–R2 (the `ai`-mode ask and prompt rules) · SPRINT-02 walkthrough notes, walkthrough-wiki (rows 0.9c, 3.2, 4.2, 7.3, 7.8, 7.14, 8.6, 8.13, 11.6, 11.10, 11.27d) · architecture.md §5.2, §7.2 · verified templates/system/{WIKI,SETUP}.md, templates/system/profiles/management.md, templates/kb_instructions.management.md, templates/skills/wiki-search/SKILL.md, templates/agents/*/wiki-{extractor,writer}.*, src/ingest/permissions.ts, src/ingest/registry.ts, src/ingest/kind-rules.ts, src/commands/search.ts, src/agents/enforce/{claude,codex}.ts, test/templates/*.red.node.test.ts, test/templates/structure.ts"
actor: AI coding agent (main agent or sub-agent) operating the wiki
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-002-09
  - STORY-003-10
  - STORY-003-12
  - STORY-004-07
  - STORY-005-01
  - STORY-005-02
  - STORY-005-04
  - STORY-005-09
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-17T09:05:51Z
updated_at: 2026-10-17T10:02:56Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-17T10:06:20Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-006-10
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-17T10:06:19Z
  sessions: []
---

# STORY-006-10: CR-003 rules, permissions and search text
**Complexity:** L2 — about a dozen text changes in WIKI.md (sections "Register", "Triage and extract", "Search", "Answering questions", "Proposing rule changes"), SETUP.md steps 3 and 4, the profile, the kb seed and the six sub-agent files, plus one content test and two authorised red-test edits. No code. Split from the first draft of this story (Gate 1 decision 3); the writing, answering and onboarding half is STORY-006-12.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent running a wikeeper wiki (for this human: product management), I want the instructions to say exactly how whitelist origins and `kb_instructions.md` lines are written, when an approval already counts and when my harness will still ask, which searches skip miss logging, how `--mark` combines with other filters, and how a rule change is named and logged, so that I stop guessing and the CLI's own checks (the whitelist, `lint --rules`) agree with what I write.

### 1.2 Detailed Requirements

- **R1 — C2, whitelist format (row 4.2a).** This paragraph is added verbatim to WIKI.md section "Register" (after its bullet list) and to SETUP.md step 4 (right after the sentence "For `whitelist`, agree `ingest.whitelist.kinds` and `ingest.whitelist.origins` with the user.", `templates/system/SETUP.md:55`). The two copies are identical after whitespace is normalised. Every claim in it is what `matchesOrigin` (`src/ingest/permissions.ts:61`), `isPathEntry` (`:57`), `compileGlob` (`:28`), `matchesKind` (`:86`) and `fileOrigin` (`src/ingest/registry.ts:58`) implement:

  > In `whitelist` mode a source runs without asking when its origin matches an entry of `ingest.whitelist.origins` or its kind is listed in `ingest.whitelist.kinds`; any other source is denied (exit code 4), even with `--approved`. A kind entry is a source-kind id and matches every version of that kind (`meeting-notes`); a source started without `--kind` passes while kind entries exist, and `wikeeper ingest facts` then checks its kind. An origin entry that contains `/`, or starts with `.` or `~`, is a path glob and matches only files. It is matched against the whole path: a file inside the repository by its path from the repository root (`docs/meetings/**`, never `./docs/meetings/**`), any other file by its absolute path (`~/Documents/notes/*.md`, where `~/` is the home folder). `*` matches within one folder, `**` across folders and `?` one character. Any other entry is a host name, without scheme, port or path, and matches only URLs, ignoring case: `docs.example.com` matches that host only, and `*.example.com` matches its subdomains but not `example.com` itself. Never start a host with `.`: that makes it a path. Text on stdin (`-`) never matches an origin.

  SETUP.md step 4's mode list (`templates/system/SETUP.md:43`) says that in `whitelist` mode "everything else asks", but the CLI denies it (architecture.md §7.2 and D-07; `src/ingest/permissions.ts:144`), and `--approved` does not override the denial. That line becomes "everything else is denied (exit code 4)".
- **R2 — C3, one approval covers the rerun (rows 7.3, 7.14).** In WIKI.md section "Register", the exit code 3 bullet (`templates/system/WIKI.md:25`) says: show the user what `wikeeper ingest start` returned (origin, size, kind and rule, as STORY-003-12 R4 prints them) and ask in chat; rerun with `--approved` only after the user agrees; one chat approval of this exact source (same path and size) covers the `--approved` rerun, so do not ask again. The directory bullet (`:27`) says to run `wikeeper ingest start <file> --approved` for each approved new file, because the plan approval covers them (row 7.14). The terms "exit code 3", "--approved" and "exit code 4" stay (`test/templates/wiki-protocol.red.node.test.ts:154`).
- **R3 — C1 text, the `ai`-mode prompts (rows 0.9c, 4.2d; STORY-002-09 R1, R2; Gate 1 decision 16).** The text states exactly the rules STORY-002-09 installs with `enforce` on:
  - SETUP.md step 4, the `ai` bullet (`templates/system/SETUP.md:41`, today "`ai`: the agent runs ingests without asking.", which becomes wrong): "`ai`: the agent runs ingests without asking. With `enforce` on, the harness still asks the user before the two steps that delete or take over work: `wikeeper ingest abort <id> --drop` and `wikeeper ingest apply <id> --force-unlock` in Claude Code, and every `wikeeper ingest abort` in Codex, whose rules match only the start of a command."
  - WIKI.md section "Register" gains one bullet after the exit code 4 bullet: "Permission prompts: with `enforce` on, your harness may ask the user before a wikeeper command runs (in `ask` mode before `wikeeper ingest start`; in `ai` mode before `wikeeper ingest abort <id> --drop` and `wikeeper ingest apply <id> --force-unlock`, or before every `wikeeper ingest abort` in Codex). Get the user's approval in chat before you drop a source or take over a lock; the harness prompt that follows is the harness's own and is not a second approval to request in chat."
  - The SETUP.md step 4 preview table is not edited here (§1.3).
- **R4 — D1, the kb line format (row 3.2a; contract K1).** SETUP.md step 3, items 1–3 (`templates/system/SETUP.md:29–31`), show each line format with these exact example lines in code spans:
  - Questions, under `## Questions this wiki must answer`: `Q<n> <question>`, where a `.` or `:` after the number is allowed. Examples: `Q1 What is the status of initiative X?`, `Q2 What was decided about X, and why?`, `Q3 What changed since <date>? (dated facts)`.
  - Entities, under `## Entities`: `<entity> <fields> → <page> <question refs>`, fields comma-separated, `->` accepted for the arrow. Examples: `initiative owner, status, target date → initiatives/<id>.md Q1`, `decision what, why, decided by, date → decisions.md Q2`. A page name with `<…>` holds one entity per page; a fixed name holds one `##` entry per entity.
  - Source kinds, under `## Source kinds`: `<kind-id> (v1) → <targets>`. Example: `meeting-notes (v1) → decision, initiative.status`.

  The profile (`templates/system/profiles/management.md`) gains one prose line under `## Questions`: "Each line reads `Q<n> <question>`. A question that dated facts answer, such as what changed since a date, ends with ` (dated facts)` and needs no entity." Its five question lines keep the `Q1 Who owns…` form, because `test/templates/profile.red.node.test.ts:131` matches `^Q\d+\s+\S`. Its `## Source kinds` section gains, as its first line, one single-line HTML comment that states the kind-line format, the bare-target rule (R6) and `note:` lines (R5); no other line is added there, because `profile.red.node.test.ts:182` and `test/templates/structure.ts:404` reject any non-comment line that is not a kind rule. The kb seed (`templates/kb_instructions.management.md:7`, `:11`, `:23`) keeps one HTML comment per drafted section, still matching `^<!--.*SETUP\.md.*step 3.*-->$` (`profile.red.node.test.ts:58`), and each comment gains its section's format: "One line each: Q<n> <question>, ending in (dated facts) when dated facts answer it."; "One line each: <entity> <fields> → <page> <question refs>."; "One line each: <kind-id> (v1) → <targets>; note: lines hold routing notes and exclusions." Every comment stays on one line and starts with `<!--`, so `parseSourceKinds` (whose kind-line pattern needs a letter or digit first, `src/ingest/kind-rules.ts:10`) never reads it as a rule.
- **R5 — D2, `note:` lines (row 11.10).** SETUP.md step 3 gains an item after the source kinds: routing notes and exclusions go on a `note:` line under `## Source kinds`, for example `note: an epic is not an initiative; bugs are not captured.`, and the CLI never reads a `note:` line as a rule. WIKI.md section "Triage and extract" step 2 (`templates/system/WIKI.md:32`) says to follow the `note:` lines under `## Source kinds` together with the kind's rule.
- **R6 — D3, targets and dated-facts questions (rows 3.2b, 3.2c).** WIKI.md section "Triage and extract" step 2 says: a bare target (`decision`) means every field listed for that entity under `## Entities`; `entity.field` (`project.status`) means that field only. SETUP.md step 3 item 3 states the same rule. WIKI.md section "Proposing rule changes" (`:211`) says a proposal is written in the file's line format (`.wiki/system/SETUP.md`, step 3), and that a question answered by dated facts, such as "What changed since <date>?", ends with ` (dated facts)`: it needs no entity, `wikeeper search --since` answers it, and `wikeeper lint --rules` does not report it as a question no rule serves (STORY-005-04 R5).
- **R7 — The proposal's kind and the changelog line (Gate 1 decision 12; audit finding 14).** WIKI.md section "Proposing rule changes" says, before the approved and rejected bullets:
  - Every proposal has a kind: the source-kind id it adds or changes (`meeting-notes`), or, for a change to another section, that section's key: `questions`, `entities`, `capture-signals`, `write-policy` or `never-capture` (`KB_PROPOSAL_SECTION_KEYS`, which STORY-005-01 R3 freezes and STORY-005-06 R5 accepts for `--kind`). Use the same kind each time the same proposal comes back.
  - An approved change gets one line under `## Rule changelog`, in the form `- YYYY-MM-DD: <kind> v<N>: <change>`, with the kind's new version, for example `- 2026-10-20: meeting-notes v2: also capture action owners`; kinds changed together are listed one after another, `- YYYY-MM-DD: <kind> v<N>, <kind> v<N>: <change>` (the form STORY-005-04 R7 checks). A change to another section names its key and no version: `- 2026-10-20: never-capture: salaries and bonuses`.
  - The approved bullet (`:223`) reads "bump that kind's `(vN)` version and add a changelog line in that form". The rejected bullet (`:224`) is left for STORY-006-09, which replaces it with `wikeeper rules record --rejected` and records each decision with `--kind` set to the proposal's kind. This story names no `wikeeper rules` command.
- **R8 — A1 text, `--no-miss` for triage and routing (rows 7.8, 8.6, 8.13; CR-003 Open Question 1; contract K8).** WIKI.md section "Triage and extract" step 1 (`:31`) runs `wikeeper search --no-miss` for the entities and terms the source names. WIKI.md section "Search" gains an option bullet for `--no-miss`: do not record a miss; used for triage and routing searches, so a miss records only a question someone asked the wiki. WIKI.md section "Answering questions" (`:209`) says a search without `--no-miss` is logged as a miss automatically, and question searches never use `--no-miss`. Extractor step 1 (`templates/agents/claude/wiki-extractor.md:12`, `templates/agents/antigravity/wiki-extractor.md:13`, `templates/agents/codex/wiki-extractor.toml:10`) reads "run wikeeper search --no-miss for the names, terms and topics the source mentions". Writer step 2 (`templates/agents/claude/wiki-writer.md:19`, `templates/agents/antigravity/wiki-writer.md:20`, `templates/agents/codex/wiki-writer.toml:17`) reads "Search the wiki with wikeeper search --no-miss before creating a page." The `wiki-search` skill is unchanged: its searches answer the user's questions, so their misses are recorded.
- **R9 — A5 text, `--mark` (rows 11.6a, 11.6c, 11.27d; contract K8; Gate 1 decision 14; audit finding 17).** WIKI.md section "Search" (`:187`):
  - gains `--mark <decided|tentative>`: only fact lines with that mark; it combines with `--type`, `--where`, `--status`, `--entity` and `--since`, and a search that has a text query refuses it (exits 2), as STORY-004-07 R5 and R7 build it;
  - the `--status` bullet (`:193`) ends with "use `--mark` for that, as in `wikeeper search --mark tentative`" (the full form, so STORY-006-11's coverage check finds `search --mark`), and keeps "`status::`" and "frontmatter" and no "only `decided` or `tentative`" (`test/templates/walkthrough-fixes.red.node.test.ts:81`);
  - the `--entity` bullet (`:194`) says it is not combined with a query, `--type`, `--where` or `--status` (`src/commands/search.ts:38`), and combines with `--since` and `--mark`.
- **R10 — Invariants.** (a) Every command, flag and section the text names exists when this story merges, so `test/templates.test.ts:113` stays clean; the new names are `wikeeper lint --rules`, `wikeeper search --no-miss` and `wikeeper search --mark`, and no `##` section is added to WIKI.md (STORY-006-09 adds one). (b) SETUP.md names, in code spans outside the step-4 table, only `wikeeper` commands of the SPRINT-02 list (`doctor`, `update`, `setup`, `ingest`), because STORY-006-09 widens that list (`test/templates/setup.red.node.test.ts:196`). (c) Each sub-agent's instruction text stays identical across Claude, Antigravity and Codex (STORY-006-05 R6), with no `\`, `"""` or `{{model}}` in it. (d) `templates/agent-block.md` is not touched; its 14-line cap (CR-002) holds. (e) WIKI.md stays at most 400 lines. (f) Every SPRINT-02 red test stays green, except STORY-006-11 R6 (a) and (b) on `test/templates/wiki-protocol.red.node.test.ts`, which this story's QA-Red applies (it is the first story whose text names `wikeeper lint`; audit finding 18). (g) Plain, direct English: one rule per sentence, no new jargon.

### 1.3 Out of Scope
- CR-003 E1–E10 and the writer text handed off by STORY-003-12 (dropped fact lines, corrections, page names, pointer sources, `project.md` in answers, the skill's delegation list, `me.md`, ONBOARDING, turning `enforce` off): STORY-006-12, which lands next.
- Text for `read`, the page checks of `lint`, `status`, `rules record` / `rules list`, `ingest facts --dry-run` and the WIKI.md section "Lint and status": STORY-006-09. This story gives the proposal's kind and the changelog form (R7) that 006-09's `rules record` text uses.
- The SETUP.md step 4 preview-table rows: STORY-002-09 (K9, the `ai`-mode ask and prompt rules), STORY-003-10 (K7, `read`) and STORY-005-09 (Gate 1 decision 17, the read-only allow rules), each in the same change as the enforce writers, and all three before this story's SETUP.md text, because `test/templates/setup.red.node.test.ts` S2 compares the table with `CLAUDE_ENFORCE` and `CODEX_ENFORCE` at run time.
- Walkthrough rows that CR-003 does not carry: 3.2d (adapting the seeded Capture signals and Write policy), 7.7 (facts checked against `## Entities`), the `as_of` fallback for undated sources (11.10, 11.11).
- The CLI behaviour these texts describe: `--no-miss` and `--mark` (STORY-004-07), the `needs_approval` output (STORY-003-12), the ask and prompt rules (STORY-002-09), the K1 parser (STORY-005-01), `lint --rules` (STORY-005-04).
- The structural-test extensions: STORY-006-11.

### 1.4 Open Questions

CR-003's five decisions and the brief's design calls are settled and not reopened here.

- **Question:** Q1. The Granularity Rubric's first too-big signal tripped on the first draft: it joined unrelated goals (whitelist format, kb format, page naming, onboarding nits). Split?
- **Recommended:** Split by section owner: this story keeps the rules, permissions and search text; STORY-006-12 takes the writing, answering and onboarding text; STORY-006-11 keeps its id and runs last. Order 006-10 → 006-12 → 006-09 → 006-11.
- **Decision:** Split as recommended: STORY-006-10 (CR-003 C1 text, C2, C3, D1–D3 text, A1 and A5 text, the changelog line format) and STORY-006-12 (CR-003 E1–E10 and the writer text from STORY-003-12), with STORY-006-11 last — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q2. Codex prefix rules cannot see `--force-unlock` after `<id>`. What does the `ai`-mode text say for Codex?
- **Recommended:** What STORY-002-09 R2 installs: Codex asks before every `abort` and leaves `apply` allowed; Claude Code asks for both flags (R3).
- **Decision:** Codex in `ai` mode prompts for every `wikeeper ingest abort` and keeps `apply` allowed, because the CLI refuses to take a live lock (`lock_not_stale`); Claude Code prompts for both `--drop` and `--force-unlock` (SPIKE-002). This changes CR-003's decision for Codex only and is flagged to the human — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q3. What kind does a proposal carry when it changes no source kind (a new question, entity or Never-capture line)? STORY-006-09's `rules record --kind` and the changelog line both need the word, and the kind is part of the decision's fingerprint.
- **Recommended:** The section key the parser freezes (R7).
- **Decision:** A source-kind id, or one of the section keys STORY-005-01 freezes: `questions`, `entities`, `capture-signals`, `write-policy`, `never-capture` — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q4. Which filters does `--mark` combine with, and when does the `--status` result hint fire?
- **Recommended:** As STORY-004-07 R5–R7 build it (R9).
- **Decision:** `search --mark` refuses a text query (exit 2) and combines with `--type`, `--where`, `--status`, `--entity` and `--since`; the `--status` no-result hint fires only for `decided` / `tentative`, which narrows CR-003 A5 and is flagged to the human — _approved (human, 2026-10-17, Gate 1)_

- **Question:** Q5. This story's text names `wikeeper lint`, which `test/templates/wiki-protocol.red.node.test.ts` S2 and S5 treat as unknown. May this story's QA-Red apply STORY-006-11 R6 (a) and (b)?
- **Recommended:** Yes; this story is the first whose text needs them (audit finding 18).
- **Decision:** Authorised as recommended: the QA-Red step of the story that first needs a re-scope makes it and lists it; this story applies R6 (a) and (b), and STORY-006-11 R6 holds the full table and verifies it — _approved (human, 2026-10-17, Gate 1)_

### 1.5 Risks

- **Risk:** The text states CLI behaviour other stories ship: the ask and prompt rules (002-09), the `needs_approval` line (003-12), `--mark` combinations and its refusal of a query (004-07), the section keys (005-01), `lint --rules` not reporting a `(dated facts)` question and the changelog check (005-04).
- **Mitigation:** Every owner story is a predecessor. §2.1 checks the claims mechanically: the whitelist paragraph against `matchesOrigin`, the kb examples and section keys against `parseInstructions`, the changelog example against `RULE_CHECKS`, the prompt text against the `ai` items of `CLAUDE_ENFORCE` and `CODEX_ENFORCE`, and the `--mark` refusal against the CLI.
- **Risk:** SPRINT-02 red tests pin exact phrases in the files this story edits (wiki-protocol, walkthrough-fixes, skills-subagents, profile, setup).
- **Mitigation:** §1.2 names every pinned phrase and test line it must keep; the only intended breaks are STORY-006-11 R6 (a) and (b), applied by this story's QA-Red; `npm test` runs in full before commit.
- **Risk:** A SETUP.md code span naming `wikeeper read`, `lint`, `status` or `rules` before STORY-006-09 widens the SETUP command list fails `test/templates/setup.red.node.test.ts:203`.
- **Mitigation:** R10 (b): this story's SETUP.md text names only `wikeeper ingest` forms; WIKI.md carries the `lint --rules` and `search` forms.
- **Risk:** Sub-agent texts drift between the three agents while R8 edits them.
- **Mitigation:** Edit the Claude file, copy the text verbatim to the other two, and run the shared-text check (`test/templates/skills-subagents.red.node.test.ts` S3).

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | Text only: the CLI observes no alternative flow. The approval paths of R2 and R3 are agent behaviour, checked in the part-3 walkthrough (§2.2). |
| Interfaces | T | The triage-search rule reaches the agent through WIKI.md and the sub-agent prompts of three agents; the prompt text is checked against the Claude and Codex enforce writers. |
| Data | T | One row per item and file part; whitelist examples per origin type (file, URL, stdin). |
| Rules | T | Format examples must parse with the K1 parser, whitelist examples must hold under `matchesOrigin`, the changelog example must pass the rule checks, `--mark` with a query must be refused, SPRINT-02 pins stay. |

```gherkin
Feature: CR-003 rules, permissions and search text

  @data
  Scenario Outline: Each walkthrough item lands in its file and part
    Given the templates tree after this story
    Then <part> of <file> contains <phrases>

    Examples:
      | item      | file                      | part                             | phrases                                                                                                        |
      | C1 (R3)   | templates/system/SETUP.md | step 4                           | "`wikeeper ingest abort <id> --drop`", "`wikeeper ingest apply <id> --force-unlock`", "every `wikeeper ingest abort`" |
      | C1 (R3)   | templates/system/WIKI.md  | section "Register"               | "Permission prompts", "--force-unlock", "not a second approval"                                                |
      | C2 (R1)   | templates/system/SETUP.md | step 4                           | "everything else is denied (exit code 4)"                                                                      |
      | C3 (R2)   | templates/system/WIKI.md  | section "Register"               | "exit code 3", "same path and size", "plan approval"                                                           |
      | D1 (R4)   | templates/system/SETUP.md | step 3                           | "`Q<n> <question>`", "`<entity> <fields> → <page> <question refs>`", "`<kind-id> (v1) → <targets>`"           |
      | D2 (R5)   | templates/system/SETUP.md | step 3                           | "`note:`", "never reads a `note:` line as a rule"                                                              |
      | D3 (R6)   | templates/system/WIKI.md  | section "Triage and extract"     | "bare target", "`entity.field`", "`note:`"                                                                     |
      | D3 (R6)   | templates/system/WIKI.md  | section "Proposing rule changes" | "(dated facts)", "wikeeper search --since", "wikeeper lint --rules", ".wiki/system/SETUP.md"                  |
      | kind (R7) | templates/system/WIKI.md  | section "Proposing rule changes" | "`capture-signals`", "`write-policy`", "`never-capture`", "`- YYYY-MM-DD: <kind> v<N>: <change>`"            |
      | A1 (R8)   | templates/system/WIKI.md  | section "Search"                 | "--no-miss", "triage"                                                                                          |
      | A5 (R9)   | templates/system/WIKI.md  | section "Search"                 | "wikeeper search --mark tentative", "`status::`", "frontmatter", "`--since` and `--mark`"                    |

  @rules @data
  Scenario Outline: The whitelist format is stated once, identically, and holds under matchesOrigin
    Given the whitelist paragraph in WIKI.md section "Register" and in SETUP.md step 4
    Then the two paragraphs are identical after whitespace is normalised
    And the paragraph and SETUP.md's mode list say that any other source is denied, even with "--approved"
    And the paragraph names "<entry>"
    And matchesOrigin("<entry>", "<origin>", "<type>", { homeDir: "/home/user" }) is <result>

    Examples:
      | entry                  | origin                               | type  | result |
      | docs/meetings/**       | docs/meetings/2026/q4.md             | file  | true   |
      | ./docs/meetings/**     | docs/meetings/q4.md                  | file  | false  |
      | ~/Documents/notes/*.md | /home/user/Documents/notes/a.md       | file  | true   |
      | ~/Documents/notes/*.md | /home/user/Documents/notes/2026/a.md  | file  | false  |
      | docs.example.com       | https://DOCS.example.com:8443/a      | url   | true   |
      | *.example.com          | https://a.example.com/x              | url   | true   |
      | *.example.com          | https://example.com/x                | url   | false  |
      | docs/meetings/**       | stdin                                | stdin | false  |

  @rules
  Scenario: The kb line formats, the proposal kinds and the changelog form agree with the parser and the rule checks
    Given the example lines in SETUP.md step 3, placed under "## Questions this wiki must answer", "## Entities" and "## Source kinds"
    When they are parsed with parseInstructions
    Then issues is empty, there are three questions and only Q3 has datedFacts true
    And there are the entities initiative and decision, the kind meeting-notes at version 1, and one note
    And the section keys named in WIKI.md section "Proposing rule changes" are exactly KB_PROPOSAL_SECTION_KEYS
    And the same text with the kind line "meeting-notes (v2) → decision, initiative.status" and the section's first changelog example under "## Rule changelog" gives no "changelog-version-mismatch" finding when RULE_CHECKS run on it
    And templates/kb_instructions.management.md parses with no issues, each of its three drafted sections still holds one HTML comment naming SETUP.md step 3, and the profile keeps five "Q<n> " lines and only kind rules and single-line comments under "Source kinds"

  @interfaces @rules
  Scenario: Triage searches skip miss logging, and the prompt and search text match the CLI
    Given WIKI.md, SETUP.md, the wiki-search skill, and the wiki-extractor and wiki-writer prompts of claude, antigravity and codex
    Then WIKI.md section "Triage and extract" step 1, every extractor's step 1 and every writer's step 2 name "wikeeper search --no-miss", and the wiki-search skill does not contain "--no-miss"
    And the shared-text check of test/templates/skills-subagents.red.node.test.ts S3 passes
    And the ai items of CLAUDE_ENFORCE hold permissions.ask rules containing "--drop" and "--force-unlock", and the ai lines of CODEX_ENFORCE hold a "prompt" rule for "wikeeper ingest abort" and none for "ingest apply", as SETUP.md step 4 says
    When, in a temp wiki, "wikeeper search vendor --mark tentative --json" runs
    Then it exits 2 with code "usage", as section "Search" says
    And the structural checks of test/templates/structure.ts report no finding, WIKI.md has at most 400 lines and no new "##" heading, templates/agent-block.md is unchanged, and every SPRINT-02 red test under test/templates/ passes with only the edits of STORY-006-11 R6 (a) and (b)

  Scenario: Error — a broken kb example is caught
    Given a copy of SETUP.md whose step 3 entity example refers to "Q9"
    When the step 3 examples are parsed with parseInstructions
    Then issues holds "unknown-question-ref" with the line of that entity
```

### 2.2 Verification Steps (Manual)
- [ ] Part-3 walkthrough in `~/walkthrough-wiki`: with `ingest.permission: whitelist` and an origin `~/product_repo/.cleargate/wiki/**`, run `wikeeper ingest plan` on that folder; check the entries are allowed without approval, and a file outside it is denied (R1).
- [ ] In `ai` mode with `enforce` on, in a trusted Claude Code folder (SPIKE-002: an untrusted folder ignores project settings), ask the agent to drop an unfinished source; check it asks in chat first and does not ask again after the harness prompt (R3).
- [ ] Ask "which facts are still tentative?"; check the agent runs `wikeeper search --mark tentative` and not `--status tentative` (R9).
- [ ] Approve a rule change in an ingest; check the changelog line has the R7 form and `wikeeper lint --rules` reports no changelog finding.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `templates/system/WIKI.md` |
| Related Files | `templates/system/SETUP.md`, `templates/system/profiles/management.md`, `templates/kb_instructions.management.md`, `templates/agents/claude/wiki-extractor.md`, `templates/agents/claude/wiki-writer.md`, `templates/agents/antigravity/wiki-extractor.md`, `templates/agents/antigravity/wiki-writer.md`, `templates/agents/codex/wiki-extractor.toml`, `templates/agents/codex/wiki-writer.toml` |
| Test Files | `test/templates/rules-and-search-text.red.node.test.ts` (QA-Red) |
| Re-scoped SPRINT-02 red test (STORY-006-11 R6 (a), (b), applied by this story's QA-Red) | `test/templates/wiki-protocol.red.node.test.ts` |
| New Files Needed | Yes — `test/templates/rules-and-search-text.red.node.test.ts` |

### 3.2 Technical Logic
- Edit in WIKI.md order: "Register" (R1, R2, R3), "Triage and extract" (R5, R6, R8), "Search" (R8, R9), "Answering questions" (R8), "Proposing rule changes" (R6, R7). Then SETUP.md step 3 (R4, R5, R6) and step 4 (R1, R3), the profile and the seed (R4), and the six sub-agent files (R8).
- Sub-agents: change the Claude file first, then copy the instruction text verbatim into the Antigravity body and the Codex `developer_instructions` block (flashcard 2026-10-17 `#codex #toml #templates`: no `\`, no `"""`, no `{{model}}`).
- Profile and seed comments stay single-line and start with `<!--` (flashcard 2026-10-17 `#kind-rules #templates`: `parseSourceKinds` does not skip HTML comments, but no comment line can match its kind-line pattern).
- The QA-Red test reads sections the way `test/templates/wiki-protocol.red.node.test.ts:43` and `test/templates/setup.red.node.test.ts:40` split them. It builds the step-3 kb text from the example code spans of items 1–4 and passes it to `parseInstructions` (`src/kb/parse-instructions.ts`, K1), and imports `KB_PROPOSAL_SECTION_KEYS` from the same module; it runs `RULE_CHECKS` (`src/lint/checks.ts`, K2) through `runLint` with scope `rules` on that text; it imports `matchesOrigin` from `src/ingest/permissions.ts` and the `ai` items of `CLAUDE_ENFORCE` and `CODEX_ENFORCE`; it runs the `--mark` refusal in-process with `runCli` in a temp git repo initialised with `init --yes --agents claude`. It does not import `compareSubagentTexts` from the skills red test (importing a test file registers its tests twice); scenario 4 relies on that file's S3 run.
- QA-Red applies STORY-006-11 R6 (a) and (b) exactly, by content anchors (flashcard 2026-10-17 `#qa #red-test`), and lists the lines in its commit message.
- No code changes.

### 3.3 API Contract (if applicable)

Not applicable — template text. Consumes read-only: `matchesOrigin` (C2, frozen in SPRINT-02), `parseInstructions` and the section keys (K1), `RULE_CHECKS` and `runLint` (K2, filled by STORY-005-04), `CLAUDE_ENFORCE` / `CODEX_ENFORCE` (K9), and the `search --mark` refusal (K8).

## Task Breakdown

- [ ] QA-Red: apply STORY-006-11 R6 (a) and (b) to `test/templates/wiki-protocol.red.node.test.ts` -> R10
- [ ] QA-Red: write `test/templates/rules-and-search-text.red.node.test.ts` from the five scenarios in §2.1 -> R1–R9
- [ ] Write the whitelist paragraph, the approval bullets and the permission-prompts bullet in WIKI.md "Register"; copy the paragraph into SETUP.md step 4 and fix the `ai` and `whitelist` mode lines -> R1, R2, R3
- [ ] Write the kb line formats, examples and `note:` item in SETUP.md step 3; update the profile and the seed comments -> R4, R5, R6
- [ ] Write "Triage and extract" steps 1–2, the Search options and the "Answering questions" miss sentence -> R5, R6, R8, R9
- [ ] Write the dated-facts rule, the proposal kinds and the changelog form in "Proposing rule changes" -> R6, R7
- [ ] Update the three extractors and three writers with identical text -> R8
- [ ] Run `npm test` in full; check `test/templates.test.ts` reports no finding -> R10

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 1 | The step-3 example extractor (code spans of items 1–4 into a kb text) |
| Integration tests | 1 | The `search --mark` refusal, run in-process with `runCli` against a temp git repo |
| E2E / acceptance tests | 22 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately (11 + 8 + 1 + 1 + 1) |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `npm test` passes in full, with no SPRINT-02 red test changed beyond STORY-006-11 R6 (a) and (b).
- [ ] `test/templates.test.ts` reports no finding on the merged tree.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/system/WIKI.md:16` — section "Register" (`:25` exit code 3, `:27` directory); `:29` "Triage and extract"; `:187` "Search" (`:193` `--status`, `:194` `--entity`); `:202` "Answering questions" (`:209` the miss sentence); `:211` "Proposing rule changes" (`:223` approved, `:224` rejected).
- **Surface:** `templates/system/SETUP.md:25` — step 3, source-kind form only (`:31`); `:41` — the `ai` mode line; `:43` — "everything else asks"; `:55` — the whitelist sentence.
- **Surface:** `templates/system/profiles/management.md:5` — Questions; `:15` — the entity-line format; `:24` — Source kinds.
- **Surface:** `templates/kb_instructions.management.md:7` — the three drafted-section comments (`:7`, `:11`, `:23`).
- **Surface:** `templates/agents/claude/wiki-extractor.md:12` and `templates/agents/claude/wiki-writer.md:19` — the search steps (same text in the Antigravity and Codex files).
- **Surface:** `src/ingest/permissions.ts:61` — `matchesOrigin`, the behaviour R1 documents; `src/ingest/registry.ts:58` — `fileOrigin`, how a file origin is recorded; `src/ingest/kind-rules.ts:10` — the kind-line pattern no `<!--` line can match.
- **Surface:** `src/commands/search.ts:38` — `--entity` refuses a query, `--type`, `--where` and `--status`, and allows `--since` (R9).
- **Surface:** `src/agents/enforce/claude.ts:30` and `src/agents/enforce/codex.ts:3` — the `ai`-mode rules that STORY-002-09 extends with the ask and prompt rules R3 describes.
- **Surface:** `test/templates/wiki-protocol.red.node.test.ts:26` — `COMMANDS`; `:242` — S5, re-scoped by this story's QA-Red.
- **Coverage of this requirement:** partial — every file exists and holds the SPRINT-02 text; the items add or correct sentences in place.

## Prior work

- [[CR-003]] (the items), [[CR-002]] (14-line cap), [[EPIC-006]] (parent, archived), [[EPIC-005]] (K1 parser, `lint --rules`), [[STORY-006-02]] (SETUP.md), [[STORY-006-03]] (profile and seed), [[STORY-006-04]] (WIKI.md, its red tests), [[STORY-006-05]] (skills and sub-agents, shared text), [[STORY-002-09]] (the `ai`-mode rules this text describes), [[STORY-003-10]] and [[STORY-005-09]] (the later step-4 table edits this story's SETUP.md text lands on), [[STORY-004-07]] (`--no-miss`, `--mark`), [[STORY-005-01]] (line format, section keys), [[SPIKE-002]] (Claude ask rules), [[STORY-006-12]] (the other half of the split). Wiki index and `.cleargate/FLASHCARD.md` checked 2026-10-17: no existing story carries these items.

## Why not simpler?

- **Smallest existing surface that could carry this:** the existing sentences in the ten templates listed in §3.1; every item edits or adds a sentence in place.
- **Why isn't extension / parameterization / config sufficient?** The gaps are in what the instructions say, not in what the CLI does, so only text closes them. The claims that can drift are tied to code: the whitelist paragraph to `matchesOrigin`, the kb examples and section keys to the K1 parser, the changelog form to the rule checks, the prompt text to the enforce writers.

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
