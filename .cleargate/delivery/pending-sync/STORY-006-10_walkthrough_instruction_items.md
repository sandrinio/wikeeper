---
story_id: STORY-006-10
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: false
ambiguity: 🟡 Medium
context_source: "CR-003 C2, C3, D1–D3, E1–E10 and A1, with its five Open Question answers (approved 2026-10-17) · CR-002 D1 (approved 2026-10-16) · SPRINT-03 decomposition brief (human decisions 2026-10-17; commands at the end of SPRINT-03; contracts K1, K3, K8, K11; shared files: 006-10 before 006-09 on WIKI.md, 006-11 last) · SPRINT-02 walkthrough notes, formapass_management (rows 0.9, 1.2, 2.4, 3.2, 4.2, 7.1, 7.3, 7.14, 7.15, 7.17, 8.9, 10.3, 11.4, 11.6, 11.10, 11.20, 11.26, 11.27) · architecture.md §5.2, §7.2, §7.6 · verified templates/system/{WIKI,SETUP,ONBOARDING}.md, templates/system/templates/me.md, templates/system/profiles/management.md, templates/kb_instructions.management.md, templates/skills/wiki-ingest/SKILL.md, templates/agents/*/wiki-{extractor,writer}.*, src/ingest/permissions.ts, src/ingest/registry.ts, src/ingest/kind-rules.ts, src/agents/enforce/index.ts, test/templates/*.red.node.test.ts, test/templates/structure.ts"
actor: AI coding agent (main agent or sub-agent) operating the wiki
complexity_label: L3
parallel_eligible: n
dep_predecessors:
  - STORY-005-01
  - STORY-005-02
  - STORY-005-03
  - STORY-004-07
  - STORY-003-12
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
  last_gate_check: 2026-10-17T09:10:29Z
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
  last_stamp: 2026-10-17T09:10:34Z
  sessions: []
---

# STORY-006-10: CR-003 instruction items — whitelist format, approvals, the kb line format and the walkthrough text fixes
**Complexity:** L3 — about twenty small text changes across thirteen template files, each tied to one walkthrough row, and no code. The width, not the depth, makes it L3; §1.4 Q1 recommends a split into two L2 stories.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent running a wikeeper wiki (for this human: Formapass product management — marketing, sales, presentations and drafting initiatives), I want the instructions to answer every question the SPRINT-02 walkthrough left open — how whitelist origins are written, when an approval already counts, how `kb_instructions.md` lines are written, how pages are named, ordered and cited, and how a correction after `finish` is made — so that I stop guessing, and two agents given the same source write the same pages.

### 1.2 Detailed Requirements

Requirements are grouped so the split recommended in §1.4 Q1 is mechanical. **Group A** (rules, permissions and search: R1–R10) edits WIKI.md sections "Register", "Triage and extract", "Search" and "Proposing rule changes", SETUP.md steps 3 and 4, the profile, the kb seed and the six sub-agent files. **Group B** (writing, answering and onboarding: R11–R18) edits WIKI.md sections "Write phase", "Page format" and "Answering questions", the `wiki-ingest` skill, ONBOARDING.md and the `me.md` template. R19 holds for both.

**Group A**

- **R1 — C2, whitelist format (row 4.2a).** This paragraph is added verbatim to WIKI.md section "Register" (after its bullet list) and to SETUP.md step 4 (right after the sentence "For `whitelist`, agree `ingest.whitelist.kinds` and `ingest.whitelist.origins` with the user.", `templates/system/SETUP.md:55`). The two copies are identical after whitespace is normalised. Every claim in it is what `matchesOrigin` (`src/ingest/permissions.ts:61`), `isPathEntry` (`:57`), `compileGlob` (`:28`), `matchesKind` and `fileOrigin` (`src/ingest/registry.ts:58`) implement:

  > In `whitelist` mode a source runs without asking when its origin matches an entry of `ingest.whitelist.origins` or its kind is listed in `ingest.whitelist.kinds`; any other source is denied (exit code 4), even with `--approved`. A kind entry is a source-kind id and matches every version of that kind (`meeting-notes`); a source started without `--kind` passes while kind entries exist, and `wikeeper ingest facts` then checks its kind. An origin entry that contains `/`, or starts with `.` or `~`, is a path glob and matches only files. It is matched against the whole path: a file inside the repository by its path from the repository root (`docs/meetings/**`, never `./docs/meetings/**`), any other file by its absolute path (`~/Documents/notes/*.md`, where `~/` is the home folder). `*` matches within one folder, `**` across folders and `?` one character. Any other entry is a host name, without scheme, port or path, and matches only URLs, ignoring case: `docs.example.com` matches that host only, and `*.example.com` matches its subdomains but not `example.com` itself. Never start a host with `.`: that makes it a path. Text on stdin (`-`) never matches an origin.

  Found while drafting: SETUP.md step 4 (`templates/system/SETUP.md:43`) says that in `whitelist` mode "everything else asks", but the CLI denies it (architecture.md §7.2 and D-07; STORY-003-02 R2; `src/ingest/permissions.ts:144`), and `--approved` does not override the denial. That line becomes "everything else is denied".

- **R2 — C3, one approval covers the rerun (rows 7.3, 7.14).** In WIKI.md section "Register", the exit code 3 bullet says: show the user what `wikeeper ingest start` returned (path, size, kind and rule version, as STORY-003-12 B2 prints them) and ask in chat; rerun with `--approved` only after the user agrees; one chat approval of this exact source (same path and size) covers the `--approved` rerun, so do not ask again; a permission prompt the agent's harness shows for the rerun (Claude Code's `ask` rule) belongs to the harness and is not a second approval to request in chat. The directory bullet says to run `wikeeper ingest start <file> --approved` for each approved new file, because the plan approval covers them (row 7.14; the plan's own "next" line already says so). The terms "exit code 3", "--approved" and "exit code 4" stay (`test/templates/wiki-protocol.red.node.test.ts:154`).
- **R3 — D1, the kb line format (row 3.2a; contract K1).** SETUP.md step 3, items 1–3 (`templates/system/SETUP.md:29–31`), show each line format with these exact example lines in code spans:
  - Questions, under `## Questions this wiki must answer`: `Q<n> <question>`, where a `.` or `:` after the number is allowed. Examples: `Q1 What is the status of initiative X?`, `Q2 What was decided about X, and why?`, `Q3 What changed since <date>? (dated facts)`.
  - Entities, under `## Entities`: `<entity> <fields> → <page> <question refs>`, fields comma-separated, `->` accepted for the arrow. Examples: `initiative owner, status, target date → initiatives/<id>.md Q1`, `decision what, why, decided by, date → decisions.md Q2`. A page name with `<…>` holds one entity per page; a fixed name holds one `##` entry per entity.
  - Source kinds, under `## Source kinds`: `<kind-id> (v1) → <targets>`. Example: `meeting-notes (v1) → decision, initiative.status`.

  The profile (`templates/system/profiles/management.md`) gains one prose line under `## Questions`: "Each line reads `Q<n> <question>`. A question that dated facts answer, such as what changed since a date, ends with ` (dated facts)` and needs no entity." Its five question lines keep the `Q1 Who owns…` form, because `test/templates/profile.red.node.test.ts:131` matches `^Q\d+\s+\S`. Its `## Source kinds` section gains, as its first line, one single-line HTML comment that states the kind-line format, the bare-target rule (R5) and `note:` lines (R4); no other line is added there, because `profile.red.node.test.ts:35` and `test/templates/structure.ts:404` reject any non-comment line that is not a kind rule. The kb seed (`templates/kb_instructions.management.md:7`, `:11`, `:23`) keeps one HTML comment per drafted section, still matching `^<!--.*SETUP\.md.*step 3.*-->$` (`profile.red.node.test.ts:58`), and each comment gains its section's format: "One line each: Q<n> <question>, ending in (dated facts) when dated facts answer it."; "One line each: <entity> <fields> → <page> <question refs>."; "One line each: <kind-id> (v1) → <targets>; note: lines hold routing notes and exclusions."
- **R4 — D2, `note:` lines (row 11.10).** SETUP.md step 3 gains an item after the source kinds: routing notes and exclusions go on a `note:` line under `## Source kinds`, for example `note: an epic is not an initiative; bugs are not captured.`, and the CLI never reads a `note:` line as a rule. WIKI.md section "Triage and extract" step 2 says to follow the `note:` lines under `## Source kinds` together with the kind's rule.
- **R5 — D3, targets and dated-facts questions (rows 3.2b, 3.2c).** WIKI.md section "Triage and extract" step 2 (`templates/system/WIKI.md:32`) says: a bare target (`decision`) means every field listed for that entity under `## Entities`; `entity.field` (`project.status`) means that field only. SETUP.md step 3 item 3 states the same rule. WIKI.md section "Proposing rule changes" says a proposal is written in the file's line format (`.wiki/system/SETUP.md`, step 3), and that a question answered by dated facts, such as "What changed since <date>?", ends with ` (dated facts)`: it needs no entity, `wikeeper search --since` answers it, and `wikeeper lint --rules` does not report it as a question no rule serves.
- **R6 — A1 text, `--no-miss` for triage and routing (rows 7.8, 8.6, 8.13; CR-003 Open Question 1; contract K8).** WIKI.md section "Triage and extract" step 1 (`:31`) runs `wikeeper search --no-miss` for the entities and terms the source names. WIKI.md section "Search" gains an option bullet for `--no-miss`: do not record a miss; used for triage and routing searches, so a miss records only a question someone asked the wiki. WIKI.md section "Answering questions" (`:209`) says that a search without `--no-miss` is logged as a miss automatically, and that question searches never use `--no-miss`. Extractor step 1 (`templates/agents/claude/wiki-extractor.md:12`, `templates/agents/antigravity/wiki-extractor.md:13`, `templates/agents/codex/wiki-extractor.toml:10`) reads "run wikeeper search --no-miss for the names, terms and topics the source mentions". Writer step 2 (`templates/agents/claude/wiki-writer.md:19`, `templates/agents/antigravity/wiki-writer.md:20`, `templates/agents/codex/wiki-writer.toml:17`) reads "Search the wiki with wikeeper search --no-miss before creating a page." The `wiki-search` skill is unchanged: its searches answer the user's questions, so their misses are recorded.
- **R7 — A5 text, `--mark` (rows 11.6c, 11.27d; contract K8).** Not assigned to any story by the brief; added here because the `--status` bullet otherwise sends the agent nowhere. WIKI.md section "Search" gains `--mark <decided|tentative>`: only fact lines with that mark, combinable with `--type`, `--entity` and `--since`. The `--status` bullet (`:193`) ends with "use `--mark` for that, as in `wikeeper search --mark tentative`" (the full form, so STORY-006-11's coverage check finds `search --mark`), and keeps "`status::`" and "frontmatter" (`test/templates/walkthrough-fixes.red.node.test.ts:81`). The `--entity` bullet (`:194`) says it is not combined with a query or other filters except `--mark`.
- **R8 — E7, page names (row 7.15).** WIKI.md section "Triage and extract" step 3 (`:33`) says: a page name with a `<…>` placeholder under `## Entities` is filled with the entity's id when the source gives one (`initiatives/initiative-005.md`), otherwise with its title as a lowercase, hyphenated slug.
- **R9 — E8, sources that point elsewhere (row 7.17).** WIKI.md section "Triage and extract" says: a source that only points to another file ("read … for the rest") or is cut short is reported to the user, who decides whether to ingest the real file instead; nothing is written for it until they decide. The extractor's "Return to the parent" line (`templates/agents/claude/wiki-extractor.md:22`, `templates/agents/antigravity/wiki-extractor.md:23`, `templates/agents/codex/wiki-extractor.toml:20`) adds "whether the source only points to another file".
- **R10 — E10b, turning `enforce` off (row 0.9b).** SETUP.md step 4 (`:57`) keeps "Do not turn `enforce` on here" and adds how to turn it off: set `enforce: false` in `.wiki/config.yml` and run `wikeeper update`, which removes wikeeper's hook and rules from the agents' settings. Today `update` keeps those entries for every configured agent when `enforce` is false (`src/agents/enforce/index.ts:199`), so this text needs the code change in §1.4 Q2.

**Group B**

- **R11 — E1 and E9b, `project.md` in answers (rows 10.3, 2.4).** WIKI.md section "Answering questions" says: when no page answers, the agent may quote `.wiki/project.md`, labelled as uncited context from the project brief; the core terms in `.wiki/project.md` are the brief, and term pages written by ingests hold cited terms; when the two disagree, the cited page wins: answer from it and offer the user an update to `.wiki/project.md`. Item 4 ("When the wiki does not know, say so plainly. Do not guess.") stays.
- **R12 — E2, shell writes (rows 11.4, 11.27c; CR-002 D1).** WIKI.md section "Write phase" step 8 (`:47`) adds: with `enforce` on, the write guard sees only the file-edit tools, so a shell write is not blocked; `wikeeper lint` reports it later as an `unlogged-change` finding. The id is followed by "finding", never "check": `test/templates/structure.ts:194` reads "`<id>` check" as a doctor check id.
- **R13 — E3, citations and aliases (rows 11.20, 8.9).** WIKI.md section "Write phase" step 5 (`:44`) adds: cite only what the source says; the rule text in `.wiki/kb_instructions.md` and the brief are not sources, so nothing that comes only from them goes on a page. Step 2 (`:41`) adds: add an alias to a page only when a fact carries it.
- **R14 — E4, fact order (row 11.26b).** WIKI.md section "Page format", Facts bullet (`:111`), says fact lines are ordered by date, oldest first, and a new line goes in at its date. The single-entity example's three fact lines (`:136–138`) are reordered to 2026-09-30, 2026-10-14, 2026-10-15; they keep their decided, tentative and contradiction lines (`test/templates/wiki-protocol.red.node.test.ts:175`).
- **R15 — E5, corrections after `finish` (row 11.27a).** WIKI.md section "Write phase", closing paragraph (`:50`): "a fix needs a new ingest" becomes "a correction after `finish` comes in as a chat-excerpt ingest: run `wikeeper ingest start -` with the user's correction on stdin, then triage and the write phase, so every page change has a source and a log entry". "change nothing under `pages/`" stays (`walkthrough-fixes.red.node.test.ts:91`).
- **R16 — E6, the skill matches the delegation table (rows 7.1, 11.27b).** The `wiki-ingest` skill's "Who does what" (`templates/skills/wiki-ingest/SKILL.md:12–17`) names, per case, exactly the actors of WIKI.md section "Delegation": a file shared in chat — `wiki-extractor` or the main agent extracts, `wiki-writer` or the main agent writes; something said in chat — the main agent extracts, `wiki-writer` or the main agent writes; a directory — one `wiki-extractor` per approved file, in parallel, after `wikeeper ingest plan` is approved, and `wiki-writer`, one source at a time; a link — the main agent gets the text, `wiki-extractor` or the main agent extracts, `wiki-writer` or the main agent writes. The rule-like lines "Every write phase: hand it to a `wiki-writer`" and "A file or text you have already read: extract the facts yourself" go. The body keeps "Write the brief (section "Brief") into its task", "facts file", "one at a time", `ingest.delegate` and "never" (`test/templates/skills-subagents.red.node.test.ts:92–94`, `walkthrough-fixes.red.node.test.ts:138–141`).
- **R17 — E9a, extra preferences in `me.md` (row 1.2).** The `me.md` template (`templates/system/templates/me.md:4`) states in a single-line HTML comment that extra preferences the user gives go under a final `## Other` heading, one `key: value` line each; ONBOARDING.md step 4 (`templates/system/ONBOARDING.md:32`) says the same. The template itself carries no `## Other` line (§1.4 Q3) and stays at most 15 lines.
- **R18 — E10a, ONBOARDING code span (row 0.9a).** ONBOARDING.md step 2 (`:19`) reads `` `.wiki/system/WIKI.md`, section "Proposing rule changes" ``: the code span names only the file, as SETUP.md step 7 does. This needs the re-scope of `test/templates/onboarding.red.node.test.ts:145` listed in STORY-006-11 R6.

**Both groups**

- **R19 — Invariants.** (a) Every command, flag and section the text names exists when this story merges, so `test/templates.test.ts:113` stays clean; the new names here are `wikeeper lint`, `wikeeper lint --rules`, `wikeeper search --no-miss` and `wikeeper search --mark`, and no `##` section is added to WIKI.md (STORY-006-09 adds one). (b) Each sub-agent's instruction text stays identical across Claude, Antigravity and Codex (STORY-006-05 R6), with no `\`, `"""` or `{{model}}` in it. (c) `templates/agent-block.md` is not touched; its 14-line cap (CR-002) holds. (d) WIKI.md stays at most 400 lines. (e) Every SPRINT-02 red test stays green, except the edits STORY-006-11 R6 lists for this story (wiki-protocol `COMMANDS` and S5, onboarding line 145), applied by this story's QA-Red once authorised (STORY-006-11 §1.4 Q1, Q2). (f) Plain, direct English: one rule per sentence, no new jargon.

### 1.3 Out of Scope
- Text for `read`, `lint` (beyond R12's one sentence), `lint --rules` (beyond R5's one sentence), `status`, `rules record` / `rules list`, `ingest facts --dry-run`, and the WIKI.md section that holds lint and status: STORY-006-09.
- The SETUP.md step 4 preview-table rows for the new `ai`-mode rules: STORY-002-09 (K9) and STORY-003-10 (K7), in the same change as the enforce writers, because `test/templates/setup.red.node.test.ts` S2 compares the table with `CLAUDE_ENFORCE` and `CODEX_ENFORCE` at run time (as STORY-004-02 did in SPRINT-02).
- Walkthrough rows that CR-003 does not carry: 3.2d (adapting the seeded Capture signals and Write policy), 7.7 (facts checked against `## Entities`), the `as_of` fallback for undated sources (11.10, 11.11).
- The CLI behaviour these texts describe: `--no-miss` and `--mark` (STORY-004-07), the `needs_approval` output (STORY-003-12), the K1 parser (STORY-005-01), `unlogged-change` (STORY-005-03), the `update` change behind R10 (§1.4 Q2).
- The structural-test extensions and the re-scope authorisation: STORY-006-11.

### 1.4 Open Questions

CR-003's five decisions and the brief's design calls are settled and not reopened here.

- **Question:** Q1. The Granularity Rubric's first too-big signal trips: §1.2 joins unrelated goals (whitelist format, kb format, page naming, onboarding nits). Split?
- **Recommended:** Split along §1.2's groups, with consecutive ids: STORY-006-10 "Rules, permissions and search text" (Group A, R1–R10; WIKI.md "Register", "Triage and extract", "Search", "Proposing rule changes"; SETUP.md steps 3–4; profile; seed; six sub-agent files) and STORY-006-11 "Writing, answering and onboarding text" (Group B, R11–R18; WIKI.md "Write phase", "Page format", "Answering questions"; `wiki-ingest` skill; ONBOARDING.md; `me.md` template). The structural-test story becomes STORY-006-12. Both halves are L2 and run 006-10 → 006-11 → 006-09 → 006-12. No remote ids exist yet, so renumbering is free. Keeping one story also works (all thirteen files are template text with one reviewer), at the cost of one long L3 review.
- **Human decision:** {populated during Brief review}

- **Question:** Q2. R10 (CR-003 E10b) asks SETUP.md to say how to turn `enforce` off, but no command does it: `wikeeper update` with `enforce: false` keeps wikeeper's hook and rules for every configured agent (`src/agents/enforce/index.ts:199`, `if (!enabled && agentConfigured) continue;`). What should SETUP.md say?
- **Recommended:** Add the one-condition change to STORY-002-09 (enforce follow-ups): with `enforce: false`, `update` removes wikeeper's hook and rules, as `remove` does, plus one test; SETUP.md then says "set `enforce: false` in `.wiki/config.yml` and run `wikeeper update`". The alternative needs no code but is heavy: SETUP.md says to set `enforce: false`, run `wikeeper remove`, then `wikeeper init`, which reinstalls the package files and keeps the wiki content.
- **Human decision:** {populated during Brief review}

- **Question:** Q3. CR-003 E9 says extra preferences go "under an `## Other` section" of `me.md`. A literal `## Other` line in the template fails the SPRINT-02 schema check (`test/templates/onboarding.red.node.test.ts:47–65`, body lines must be `key: value` or a comment). Where does the rule live?
- **Recommended:** In the template's single-line guidance comment and in ONBOARDING.md step 4 (R17). The user's `me.md` gets the `## Other` heading only when they give an extra preference, and the SPRINT-02 test stays as it is. The alternative adds the heading to the template and re-scopes `checkMeSchema`.
- **Human decision:** {populated during Brief review}

### 1.5 Risks

- **Risk:** The text states CLI behaviour other stories ship: `--mark` with `--entity` (004-07), the kind and rule version in the `needs_approval` output (003-12), the `unlogged-change` id (005-03), `lint --rules` not reporting a `(dated facts)` question (005-04).
- **Mitigation:** The stories are upstream (`dep_predecessors`; 005-04 is upstream of 006-09, which re-reads this text); QA-Verify checks each claim against the merged CLI; R1 and R3 are checked mechanically against `matchesOrigin` and `parseInstructions` (§2.1).
- **Risk:** SPRINT-02 red tests pin exact phrases in the files this story edits (wiki-protocol, walkthrough-fixes, skills-subagents, profile, onboarding, setup).
- **Mitigation:** §1.2 names every pinned phrase and test line it must keep; the only intended breaks are the three edits in STORY-006-11 R6, applied by this story's QA-Red once authorised; `npm test` runs in full before commit.
- **Risk:** Sub-agent texts drift between the three agents while R6 and R9 edit them.
- **Mitigation:** Edit the Claude file, copy the text verbatim to the other two, and run the shared-text check (`test/templates/skills-subagents.red.node.test.ts` S3).

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | Text only: the CLI observes no alternative flow. The approval paths of R2 are agent behaviour, checked in the part-3 walkthrough (§2.2). |
| Interfaces | T | The triage-search and delegation rules reach the agent through WIKI.md, the `wiki-ingest` skill and the sub-agent prompts of three agents. |
| Data | T | One row per item and section; whitelist examples per origin type (file, URL, stdin). |
| Rules | T | Format examples must parse with the K1 parser, whitelist examples must hold under `matchesOrigin`, SPRINT-02 pins stay. |

```gherkin
Feature: CR-003 instruction items

  @data
  Scenario Outline: Each walkthrough item lands in its file and part
    Given the templates tree after this story
    Then <part> of <file> contains <phrases>

    Examples:
      | item       | file                             | part                               | phrases                                                                                     |
      | C3 (R2)    | templates/system/WIKI.md         | section "Register"                 | "exit code 3", "same path and size", "not a second approval", "plan approval"              |
      | D1 (R3)    | templates/system/SETUP.md        | step 3                             | "`Q<n> <question>`", "`<entity> <fields> → <page> <question refs>`", "`<kind-id> (v1) → <targets>`" |
      | D2 (R4)    | templates/system/SETUP.md        | step 3                             | "`note:`", "never reads a `note:` line as a rule"                                           |
      | D3 (R5)    | templates/system/WIKI.md         | section "Triage and extract"       | "bare target", "`entity.field`", "`note:`"                                                  |
      | D3 (R5)    | templates/system/WIKI.md         | section "Proposing rule changes"   | "(dated facts)", "wikeeper search --since", "wikeeper lint --rules", ".wiki/system/SETUP.md" |
      | A1 (R6)    | templates/system/WIKI.md         | section "Search"                   | "--no-miss", "triage"                                                                       |
      | A5 (R7)    | templates/system/WIKI.md         | section "Search"                   | "wikeeper search --mark tentative", "`status::`", "frontmatter"                             |
      | E7 (R8)    | templates/system/WIKI.md         | section "Triage and extract"       | "initiatives/initiative-005.md", "slug"                                                     |
      | E8 (R9)    | templates/system/WIKI.md         | section "Triage and extract"       | "read … for the rest", "decides"                                                            |
      | E10b (R10) | templates/system/SETUP.md        | step 4                             | "enforce: false", "wikeeper update"                                                         |
      | E1 (R11)   | templates/system/WIKI.md         | section "Answering questions"      | ".wiki/project.md", "uncited", "cited page wins"                                            |
      | E2 (R12)   | templates/system/WIKI.md         | section "Write phase"              | "wikeeper lint", "`unlogged-change` finding", "shell write"                                 |
      | E3 (R13)   | templates/system/WIKI.md         | section "Write phase"              | "not sources", "only when a fact carries it"                                                |
      | E4 (R14)   | templates/system/WIKI.md         | section "Page format"              | "oldest first"                                                                              |
      | E5 (R15)   | templates/system/WIKI.md         | section "Write phase"              | "wikeeper ingest start -", "correction", "change nothing under `pages/`"                    |
      | E9a (R17)  | templates/system/templates/me.md | its guidance comment               | "## Other"                                                                                  |
      | E9a (R17)  | templates/system/ONBOARDING.md   | step 4                             | "## Other"                                                                                  |
      | E10a (R18) | templates/system/ONBOARDING.md   | step 2                             | "`.wiki/system/WIKI.md`, section \"Proposing rule changes\""                                |

  @rules @data
  Scenario Outline: The whitelist format is stated once, identically, and holds under matchesOrigin
    Given the whitelist paragraph in WIKI.md section "Register" and in SETUP.md step 4
    Then the two paragraphs are identical after whitespace is normalised
    And the paragraph and SETUP.md's mode list say that any other source is denied, even with "--approved"
    And the paragraph names "<entry>"
    And matchesOrigin("<entry>", "<origin>", "<type>", { homeDir: "/home/ana" }) is <result>

    Examples:
      | entry                  | origin                               | type  | result |
      | docs/meetings/**       | docs/meetings/2026/q4.md             | file  | true   |
      | ./docs/meetings/**     | docs/meetings/q4.md                  | file  | false  |
      | ~/Documents/notes/*.md | /home/ana/Documents/notes/a.md       | file  | true   |
      | ~/Documents/notes/*.md | /home/ana/Documents/notes/2026/a.md  | file  | false  |
      | docs.example.com       | https://DOCS.example.com:8443/a      | url   | true   |
      | *.example.com          | https://a.example.com/x              | url   | true   |
      | *.example.com          | https://example.com/x                | url   | false  |
      | docs/meetings/**       | stdin                                | stdin | false  |

  @rules
  Scenario: The kb line-format examples parse, and the seed and profile keep their SPRINT-02 shape
    Given the example lines in SETUP.md step 3, placed under "## Questions this wiki must answer", "## Entities" and "## Source kinds"
    When they are parsed with parseInstructions
    Then issues is empty
    And there are three questions and only Q3 has datedFacts true
    And there are the entities initiative and decision, the kind meeting-notes at version 1, and one note
    And templates/kb_instructions.management.md parses with parseInstructions with no issues, and each of its three drafted sections still holds one HTML comment naming SETUP.md step 3
    And the profile still has five "Q<n> " question lines, and every non-comment line under its "Source kinds" parses with parseSourceKinds

  @interfaces @rules
  Scenario: Triage and routing searches skip miss logging on every surface, and the skill matches the delegation table
    Given WIKI.md, the wiki-ingest and wiki-search skills, and the wiki-extractor and wiki-writer prompts of claude, antigravity and codex
    Then WIKI.md section "Triage and extract" step 1, every extractor's step 1 and every writer's step 2 name "wikeeper search --no-miss"
    And every extractor's return line names a source that only points to another file
    And the shared-text check of test/templates/skills-subagents.red.node.test.ts S3 passes
    And for each row of WIKI.md's "Delegation" table the wiki-ingest skill names the same actors for that case
    And the wiki-search skill does not contain "--no-miss"
    And the structural checks of test/templates/structure.ts report no finding, WIKI.md has at most 400 lines and no new "##" heading, and templates/agent-block.md is unchanged
    And every SPRINT-02 red test under test/templates/ passes, with only the edits of STORY-006-11 R6 (a), (b) and (e)

  Scenario: Error — a broken kb example is caught
    Given a copy of SETUP.md whose step 3 entity example refers to "Q9"
    When the step 3 examples are parsed with parseInstructions
    Then issues holds "unknown-question-ref" with the line of that entity
```

### 2.2 Verification Steps (Manual)
- [ ] Part-3 walkthrough in `~/Documents/Dev/formapass_management`: ingest a doc_processor initiatives folder that holds a pointer stub; check the agent reports the stub instead of extracting it (R9) and names initiative pages by id (R8).
- [ ] Ingest a Formapass sales or marketing update whose facts are older than lines already on a page; check the new lines sit in date order (R14) and carry no alias the facts lack (R13).
- [ ] Ask a positioning question that only `.wiki/project.md` answers; check the answer is labelled as uncited context from the project brief (R11).
- [ ] With `ingest.permission: whitelist` and an origin `~/Documents/Dev/doc_processor/.cleargate/wiki/**`, run `wikeeper ingest plan` on that folder; check the entries are allowed without approval (R1).

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `templates/system/WIKI.md` |
| Related Files | `templates/system/SETUP.md`, `templates/system/ONBOARDING.md`, `templates/system/templates/me.md`, `templates/system/profiles/management.md`, `templates/kb_instructions.management.md`, `templates/skills/wiki-ingest/SKILL.md`, `templates/agents/claude/wiki-extractor.md`, `templates/agents/claude/wiki-writer.md`, `templates/agents/antigravity/wiki-extractor.md`, `templates/agents/antigravity/wiki-writer.md`, `templates/agents/codex/wiki-extractor.toml`, `templates/agents/codex/wiki-writer.toml` |
| Test Files | `test/templates/walkthrough-items.red.node.test.ts` (QA-Red) |
| Re-scoped SPRINT-02 red tests (STORY-006-11 R6, applied by this story's QA-Red once authorised) | `test/templates/wiki-protocol.red.node.test.ts`, `test/templates/onboarding.red.node.test.ts` |
| New Files Needed | Yes — `test/templates/walkthrough-items.red.node.test.ts` |

### 3.2 Technical Logic
- Edit in WIKI.md order: "Register" (R1, R2), "Triage and extract" (R4, R5, R6, R8, R9), "Write phase" (R12, R13, R15), "Page format" (R14), "Search" (R6, R7), "Answering questions" (R6, R11), "Proposing rule changes" (R5). Then SETUP.md steps 3 and 4 (R1, R3, R4, R5, R10), the profile and the seed (R3), the skill (R16), ONBOARDING.md and `me.md` (R17, R18), and the six sub-agent files (R6, R9).
- Sub-agents: change the Claude file first, then copy the instruction text verbatim into the Antigravity body and the Codex `developer_instructions` block (flashcard 2026-10-17 `#codex #toml #templates`: no `\`, no `"""`, no `{{model}}`).
- Profile and seed comments stay single-line and start with `<!--` (flashcard 2026-10-17 `#kind-rules #templates`: `parseSourceKinds` does not skip HTML comments, but no comment line can match its kind-line pattern).
- The QA-Red test reads sections the way `test/templates/wiki-protocol.red.node.test.ts:43` and `test/templates/setup.red.node.test.ts:40` split them; it builds the step-3 kb text from the example code spans of items 1–4 and passes it to `parseInstructions` (`src/kb/parse-instructions.ts`, K1); it imports `matchesOrigin` from `src/ingest/permissions.ts`. It does not import `compareSubagentTexts` from the skills red test (importing a test file registers its tests twice); scenario 4 relies on that file's S3 run.
- No code changes in this story. R10's text lands only together with the `update` change chosen in §1.4 Q2.

### 3.3 API Contract (if applicable)

Not applicable — template text. Consumes `matchesOrigin` (C2, frozen in SPRINT-02), `parseInstructions` (K1) and `parseSourceKinds` (C2) read-only.

## Task Breakdown

- [ ] QA-Red: apply STORY-006-11 R6 (a) and (b) to `test/templates/wiki-protocol.red.node.test.ts` and R6 (e) to `test/templates/onboarding.red.node.test.ts`, once authorised -> R19
- [ ] QA-Red: write `test/templates/walkthrough-items.red.node.test.ts` from the five scenarios in §2.1 -> R1–R18
- [ ] Write the whitelist paragraph and the approval bullets in WIKI.md "Register"; copy the paragraph into SETUP.md step 4 -> R1, R2
- [ ] Write the kb line formats, examples and `note:` item in SETUP.md step 3; update the profile and the seed comments -> R3, R4, R5
- [ ] Write "Triage and extract" steps 1–3 and the pointer-source rule; the Search options; the dated-facts rule in "Proposing rule changes" -> R5, R6, R7, R8, R9
- [ ] Update the three extractors and three writers with identical text -> R6, R9
- [ ] Write the "Write phase", "Page format" and "Answering questions" changes; reorder the example facts -> R11, R12, R13, R14, R15
- [ ] Rewrite the skill's "Who does what"; update ONBOARDING.md steps 2 and 4 and the `me.md` comment -> R16, R17, R18
- [ ] Write SETUP.md step 4's `enforce` off sentence after the §1.4 Q2 change lands -> R10
- [ ] Run `npm test` in full; check `test/templates.test.ts` reports no finding -> R19

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 1 | The step-3 example extractor (code spans of items 1–4 into a kb text) |
| Integration tests | 0 | Content only; `matchesOrigin` and `parseInstructions` run in-process |
| E2E / acceptance tests | 29 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately (18 + 8 + 1 + 1 + 1) |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `npm test` passes in full, with no SPRINT-02 red test changed beyond STORY-006-11 R6 (a), (b) and (e).
- [ ] `test/templates.test.ts` reports no finding on the merged tree.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/system/WIKI.md:16` — section "Register"; `:29` "Triage and extract"; `:36` "Write phase"; `:106` "Page format"; `:187` "Search"; `:202` "Answering questions"; `:211` "Proposing rule changes".
- **Surface:** `templates/system/SETUP.md:25` — step 3, source-kind form only (`:31`); `:55` — the whitelist sentence; `:57` — the `enforce` sentence.
- **Surface:** `templates/system/profiles/management.md:5` — Questions; `:15` — the entity-line format; `:24` — Source kinds.
- **Surface:** `templates/kb_instructions.management.md:7` — the three drafted-section comments (`:7`, `:11`, `:23`).
- **Surface:** `templates/skills/wiki-ingest/SKILL.md:12` — "Who does what", stricter than WIKI.md.
- **Surface:** `templates/agents/claude/wiki-extractor.md:12` and `templates/agents/claude/wiki-writer.md:19` — the search steps (same text in the Antigravity and Codex files).
- **Surface:** `templates/system/ONBOARDING.md:19` — the code span; `templates/system/templates/me.md:4` — the guidance comment.
- **Surface:** `src/ingest/permissions.ts:61` — `matchesOrigin`, the behaviour R1 documents; `src/ingest/registry.ts:58` — `fileOrigin`, how a file origin is recorded.
- **Surface:** `src/agents/enforce/index.ts:199` — `update` keeps enforce entries when `enforce` is false (R10, §1.4 Q2).
- **Coverage of this requirement:** partial — every file exists and holds the SPRINT-02 text; the items add or correct sentences in place.

## Prior work

- [[CR-003]] (the items), [[CR-002]] (D1 shell-write backstop, 14-line cap), [[EPIC-006]] (parent, archived), [[EPIC-005]] (K1 parser, `lint`), [[STORY-006-02]] (SETUP.md), [[STORY-006-03]] (profile and seed), [[STORY-006-04]] (WIKI.md, its red tests), [[STORY-006-05]] (skills and sub-agents, R6 shared text), [[STORY-006-07]] (ONBOARDING.md, `me.md` schema check). Wiki index and `.cleargate/FLASHCARD.md` checked 2026-10-17: no existing story carries these items.

## Why not simpler?

- **Smallest existing surface that could carry this:** the existing sentences in the thirteen templates listed in §3.1; every item edits or adds a sentence in place.
- **Why isn't extension / parameterization / config sufficient?** The gaps are in what the instructions say, not in what the CLI does, so only text closes them. Two items are tied to code so they cannot drift: the whitelist paragraph is checked against `matchesOrigin`, and the kb examples against the K1 parser.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟡 Medium Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding.
- [ ] No "TBDs" exist anywhere in the specification or technical logic. (No TBD markers, but three open questions in §1.4 decide R10's text, R17's placement and the story's split.)
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
