---
story_id: STORY-009-03
parent_epic_ref: EPIC-009
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T09:45:20Z
ambiguity: 🟢 Low
context_source: "EPIC-009 (Draft, pending Gate 1) §2 'Agent instructions' and 'Docs' bullets, §1 success metric 4 (part-4 walkthrough: files from 0.3.0, the agent tells the user and runs update only after a yes), §6 Q3 · SPRINT-04 plans/decomposition-epic-009.md (K16 consumed; shared files: WIKI.md, architecture.md, README.md after 007-07 and 008-06) · sprint plan SPRINT-04 §1 behavioural criterion · STORY-009-01 (the status `version` bullet, the messages, the two doctor ids) and STORY-009-02 (`upgrade [--check]`, the hand commands) · STORY-007-07 R5, R10, R11, §1.4 Q4 and STORY-008-06 R5, R8, R9 (where their text and doc edits go, the D-37 entry) · verified at 6b75807: templates/system/WIKI.md (307 lines, 14 sections; section 'Lint and status' at :271), architecture.md (§2 :14, §3 :23, §7.7 :425, §10 :463, §11 :481, §13 :511, last entry D-36 at :550), README.md (CLI table :115-128, decision range :164), test/templates/wiki-protocol.red.node.test.ts (:27 COMMANDS, :133 fourteen sections, :146 vocabulary, :166 400 lines), test/templates/structure-sprint-03.red.node.test.ts:142 (the COMMANDS anchor), test/templates/structure.ts (checkCommands :190, checkDoctorIds :200, doctorCheckIds :213, checkPaths, SECTION_RE :272, DOCUMENTED_FORMS :467), test/templates.test.ts (:173 command tree, :243 runAllChecks), test/templates/sprint-03-commands.red.node.test.ts:307 · FLASHCARD 2026-10-17 #templates #vocabulary, #templates #sections"
actor: AI coding agent
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-009-02
  - STORY-008-06
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-18T09:30:00Z
updated_at: 2026-10-18T09:30:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T09:46:12Z
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
  last_stamp: 2026-10-18T11:46:18Z
  sessions:
    - session: 47c84598-2a59-4cfa-a987-cfe39161376b
      model: claude-opus-5-5
      input: 0
      output: 0
      cache_read: 0
      cache_creation: 0
      ts: 2026-10-18T10:23:42Z
---

# STORY-009-03: Upgrade instructions and docs
**Complexity:** L2 — text only, plus the structural tests that keep it honest:
- one WIKI.md paragraph;
- architecture.md (§2, §3, §7.7, §10, §11, a decision entry);
- a README section and table row;
- one `DOCUMENTED_FORMS` entry, one command-tree pin, one re-scoped red test, and one QA-Red content test.

It lands last on WIKI.md, architecture.md and README.md, after STORY-007-07 and STORY-008-06.

## 1. The Spec (The Contract)

### 1.1 User Story
As an AI coding agent running a wikeeper wiki (for this human: product management), I want WIKI.md to tell me what the version notices mean, to tell the user once, and to ask before I run `wikeeper upgrade` or `wikeeper update`. As a reader of the docs, I want architecture.md and the README to say what the check sends, how to turn it off and how upgrading works. Together, the user hears about a new version or stale project files exactly once, and nothing is installed or rewritten without their yes.

### 1.2 Detailed Requirements
The text names only the commands, options and fields that exist at the end of SPRINT-04: the decomposition brief's list, plus STORY-009-02's `wikeeper upgrade [--check]`. Line numbers are at `6b75807`. Edits go on the tree with STORY-007-07 and STORY-008-06 merged.
- **R1 — WIKI.md, section "Lint and status" (§1.4 Q2).** One paragraph, placed after STORY-007-07's four paragraphs (R5 (b), the fourth as STORY-008-06 R5 (a) edits it) and before "The fields of the `--json` output of `wikeeper status`". Exactly:
  "Ingest commands ask npm for a newer version at most once a day. While one is out, `wikeeper ingest plan` and `wikeeper ingest start` add the warning `wikeeper 0.4.1 is available (installed 0.4.0): run wikeeper upgrade`, `wikeeper status` prints the same text on its `version:` line and sets `version.latest`, and `wikeeper doctor` reports it as the `update-available` check. Tell the user once in the session and ask whether to upgrade; on a yes, run `wikeeper upgrade`. It installs the new version with npm the way the running copy was installed, then runs `wikeeper update` in this repository as the new version. Never upgrade unasked, and do not bring it up again in that session unless the user asks. When a newer version is out and this project's files are older too, ask once, whether to upgrade: it refreshes the files as well. When several of these are due at once, tell them in one message after the user's request is done: a red page and its clean-up candidates first, then the version question. When `wikeeper upgrade` fails, tell the user in plain words what failed and whether anything was installed. If `error.details.command` starts with `sudo`, uses pnpm, yarn or bun, is to be run as administrator, or needs npm, which was not found, show the user that one command in a code span and say why you don't run it; when they say it is done, run `error.details.then` if it is set (their reply is the yes for it). Offer to run any other `error.details.command`, such as `wikeeper update` after `update_failed`. When it is null, say in plain words what the message asks: to try again later, or to update the folder it runs from. When `wikeeper status` says the project's files are from another version (`version.files`, and the `version-mismatch` check in `wikeeper doctor`), tell the user and, on a yes, run the command it names: `wikeeper update` when the files are older, `wikeeper upgrade` when the installed version is older. Ask before `wikeeper update` too: besides wikeeper's own files under `.wiki/system/`, it rewrites the hooks and the pointer block in `AGENTS.md` and `CLAUDE.md`."
  - The quoted warning is K14's `availableMessage("0.4.1", "0.4.0")` verbatim.
  - Two names are doctor ids that STORY-009-01 always emits: "the `update-available` check" and "the `version-mismatch` check" (`checkDoctorIds`, `test/templates/structure.ts:200`).
  - The paragraph never writes "wikeeper" before a lowercase word that is not a command (FLASHCARD 2026-10-17 `#templates #vocabulary`), and never uses the word "section" (`SECTION_RE`, `test/templates/structure.ts:272`; FLASHCARD `#templates #sections`).
- **R2 — WIKI.md, the `version` status bullet.** STORY-009-01 wrote it (its R8, §1.4 Q7), ending "Handle them as said above". This story checks that it is present and unchanged, and changes nothing in it. Nothing else in WIKI.md changes: no new section, and no text in "Register", the pointer block (14 of 14 lines), SETUP.md, ONBOARDING.md, the skills or the sub-agent prompts.
- **R3 — architecture.md.**
  - (a) §2 principle 1 (`architecture.md:16`): after "It makes no LLM calls and needs no API keys." add "It reaches the network only for `read` of a URL and for the daily version check (§3), and runs npm only in `upgrade`."
  - (b) §3 (`:27`): "Lifecycle: `init`, `update`, `remove`." becomes "Lifecycle: `init`, `update`, `upgrade`, `remove`." Then a new bullet, "Version check and upgrade **[Built — SPRINT-04]**", which covers:
    - the check: before each `ingest` subcommand, at most once a day per project; one GET to `https://registry.npmjs.org/wikeeper/latest` (or `npm_config_registry`) that sends nothing about the wiki; a 1.5 s timeout; the answer, success or failure, saved for 24 hours in the wiki's git-ignored cache folder; a failure is silent and never changes a command;
    - who shows it: `ingest plan` and `ingest start` warn; `status` and `doctor` report from the saved answer, and also, without the network, when the manifest's `package_version` differs from the installed version;
    - the off switches: `update_check: false`, `WIKEEPER_NO_UPDATE_CHECK`, `NO_UPDATE_NOTIFIER` and `CI`;
    - `upgrade`: global npm, the project's `node_modules` or npx; the new version's `update` runs in a child process; pnpm, yarn, bun and source checkouts get the command to run by hand; it never runs `sudo`; the agent runs it only after the user agrees (D-38).
  - (c) §7.7 (`:425`): "`read` is the only command that uses the network." becomes "`read` and the daily version check (§3) are wikeeper's only network uses."
  - (d) §10 (`:463`):
    - new row `upgrade [--check]` | install the newest wikeeper the way it was installed, then `update` this project (§3) | Built (SPRINT-04);
    - the `status` row adds "versions (installed, newer on npm, the project's files)";
    - the `doctor` row adds "version checks".
  - (e) §11 (`:481`): after the `enforce:` line, `update_check: true          # ingest commands ask npm once a day for a newer version (§3)`.
  - (f) §13: a new last row: "D-38 | Ingest commands check npm for a newer wikeeper at most once a day, opt-out and never failing a command; `wikeeper upgrade` runs npm only when the user asks, never with `sudo`, and then runs the new version's `update`." The number is the next free one after STORY-008-06's D-37 (§1.4 Q5). D-09 (`init`, `update`, `remove`) is history and stays as written.
- **R4 — README.md.**
  - (a) The CLI table (`README.md:115–128`).
    - The `update` row's description becomes "Refresh package-owned system files, skills and hooks to the installed version without touching your knowledge base".
    - A new row after it: `` `wikeeper upgrade [--check]` `` | "Install the newest wikeeper the way you installed it (global npm, a project dependency or npx), then refresh this project's files; `--check` shows what it would run".
  - (b) A new section, "## ⬆️ Upgrading", directly after the CLI reference (after STORY-007-07's and STORY-008-06's sections, if they sit there), covering:
    - `wikeeper upgrade` and `wikeeper upgrade --check`;
    - by hand: `npm install -g wikeeper@latest`, then `wikeeper update` in each project; pnpm, yarn and bun users upgrade with their manager, then run `wikeeper update`;
    - npx users' hooks are pinned to a version, and `upgrade` re-pins them;
    - the check: ingest commands ask the npm registry at most once a day, one GET to `registry.npmjs.org/wikeeper/latest` (or your `npm_config_registry`); the answer is saved in `.wiki/.cache/update-check.json` (git-ignored); the request sends nothing about your wiki: no file names, pages or settings;
    - your agent tells you once and asks, and never upgrades on its own; `wikeeper status` and `wikeeper doctor` also say when this project's files come from another version;
    - turning it off: `wikeeper config set update_check false`, or `WIKEEPER_NO_UPDATE_CHECK=1`, `NO_UPDATE_NOTIFIER` or `CI` in the environment.
  - (c) The decision-log range (`README.md:164`, `D-01`–`D-37` after STORY-008-06) becomes `D-01`–`D-38`.
- **R5 — Structural template tests.**
  - `DOCUMENTED_FORMS` (`test/templates/structure.ts:467`) gains `upgrade`.
  - `test/templates.test.ts` pins command `upgrade` with option `--check` in the command tree, next to its SPRINT-03 pins (`:173`).
  - QA-Red writes `test/templates/upgrade-instructions.red.node.test.ts` from §2.1.
- **R6 — Re-scoped red test (§1.4 Q4).** `COMMANDS` in `test/templates/wiki-protocol.red.node.test.ts:27` gains `"upgrade"` after the last entry (after STORY-007-07's `"config"` and `"statusline"`). Without it, the vocabulary check at `:146` reports every `wikeeper upgrade` in WIKI.md. These anchors still hold:
  - the `/"read", "lint", "status", "rules"/` anchor of `test/templates/structure-sprint-03.red.node.test.ts:142`;
  - the "one SPRINT-03 vocabulary" and "fourteen sections" titles.
- **R7 — Invariants.**
  - (a) WIKI.md keeps its 14 `##` sections in order and at most 400 lines (`test/templates/wiki-protocol.red.node.test.ts:133`, `:166`).
  - (b) `runAllChecks` on the real templates finds nothing (`test/templates.test.ts:243`): every command and option the new text names exists, every doctor id it names is reported, and every `.wiki/` path it names is known.
  - (c) The status bullets still equal the keys of `status --json` (`test/templates/sprint-03-commands.red.node.test.ts:307`).
  - (d) Every red test passes, changed only as R6 says.

### 1.3 Out of Scope
- The pointer block, SETUP.md, ONBOARDING.md, the skills and the sub-agent prompts (R2).
- An allow or ask rule for `upgrade` (STORY-009-02 §1.4 Q6).
- Any CLI behaviour: the check, the messages and `upgrade` belong to STORY-009-01 and STORY-009-02.
- Publishing 0.4.0 (a human step after Gate 4).

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question (Q1, EPIC-009 §6 Q3):** When `status` says the project's files are from an older version, should the agent run `wikeeper update` on its own, since `update` changes only wikeeper's own files?
- **Recommended:** No. It tells the user and asks first, as for `upgrade` (R1), because `update` also rewrites the hooks and the pointer block in `CLAUDE.md` and `AGENTS.md`. This is what the sprint's behavioural check expects: with files from 0.3.0, the agent tells the user and runs `update` only after a yes. Alternative: WIKI.md lets the agent run `update` unasked and report what it changed.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q2, where the text goes):** WIKI.md section "Lint and status" is where `status` is read once per session (`templates/system/WIKI.md:273`). STORY-007-07 adds four paragraphs there, and STORY-008-06 edits the fourth. Where does the upgrade text go?
- **Recommended:** One paragraph after those four, before the list of status fields (R1). The agent meets it where it reads `status`, the `version` bullet's "as said above" resolves to it, and no new section is needed: the section list is pinned (`test/templates/wiki-protocol.red.node.test.ts:133`). Nothing goes in "Register": the warning reaches the agent in `ingest plan`'s and `ingest start`'s output, and the paragraph names both.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q3):** Should WIKI.md tell the agent to run `wikeeper upgrade --check` before asking the user?
- **Recommended:** No. `upgrade` has no allow rule (STORY-009-02 §1.4 Q6), so `--check` would add a second permission prompt before the real one. The notice already names both versions. `--check` is documented in the README and in `upgrade --help`.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q4, immutable red test):** `test/templates/wiki-protocol.red.node.test.ts:27` (`COMMANDS`, STORY-006-04, re-scoped by STORY-006-11 and STORY-007-07) lists every command WIKI.md may name. May this story's QA-Red add `"upgrade"`?
- **Recommended:** Yes, only that entry, by content anchor (R6), as STORY-007-07 row (a) does for `config` and `statusline`.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **Question (Q5, decision number):** Which number does the decision entry take?
- **Recommended:** D-38, the next free number after STORY-008-06's D-37; if another entry lands first, the next free one. The README range follows it. The lifecycle decision D-09 stays as written, and D-38 extends it.
- **Human decision:** _approved as recommended (human, 2026-10-18, Gate 1; `plans/gate1-decisions.md`)_

- **DRAFTS review (designer, 2026-10-18):** wording aligned with docs/ux.md — the quoted warning names `wikeeper upgrade` bare, and `status` prints the same text on its `version:` line (R1, §2.1 scenario 2, Why not simpler?); the failure sentences tell the user in plain words what failed, show only a `sudo`, pnpm, yarn or bun command in a code span, and offer `wikeeper update` again after `update_failed` (R1, §2.1 "failure (R1)"); two sentences ask once when a newer version is out and the files are older too, and put notices due at once into one message after the request (R1, §2.1 "one question (R1)"). Still one paragraph (§1.4 Q2). No decision changed. Round 2: the failure sentences cover every STORY-009-02 R8 path: a command to be run as administrator (win32) or one that needs npm, which was not found, is shown in a code span like a `sudo` one; any other `error.details.command` (such as `wikeeper update` after `update_failed`, or `npm install --save-dev` for a project install `package.json` does not list) is offered to run; a null command is told in plain words (try again later, or update the folder it runs from) (R1; R2-P2). The "failure (R1)" phrases still hold, checked.

- **CR:spec-clarification (orchestrator, 2026-10-18, mid-sprint):** STORY-008-06's README row in `test/templates/archive-instructions.red.node.test.ts` pins the literal `` `D-01`–`D-37` ``, the range after STORY-008-06, so it contradicts this story's R4 (c) (`` `D-01`–`D-38` ``, Q5). Both stories are approved and README's range ends at the newest entry, so this story's text stands. QA-Red re-scopes that test's two README phrases, `` `D-01`–`D-37` `` and the bare `D-37` (README names D-37 only inside the range), to one assertion: README's range starts at `D-01` and ends at D-37 or later (re-scope #20, sprint-execution §C.0.2 step 6: a red test that another story's legitimate additions over-constrain). The test's name, its other phrases and the architecture.md §13 D-37 test are unchanged. No decision changed.

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** Prose like "a newer wikeeper is out" or "the wikeeper version" fails the vocabulary check: `wikeeper` followed by a lowercase word that is not a command (FLASHCARD 2026-10-17 `#templates #vocabulary`).
- **Mitigation:** R1's text is fixed and checked word by word: every `wikeeper` is followed by a command, a version number or `'s`. The README and architecture.md are not scanned, but use the same wording.
- **Risk:** WIKI.md, architecture.md and README.md are edited by STORY-007-07 and STORY-008-06 first, and by STORY-009-01 (the bullet). The cited lines drift.
- **Mitigation:** Merge order 007-05 → 008-05 → 009-01 → 007-07 → 008-06 → 009-03 on WIKI.md, and 007-07 → 008-06 → 009-03 on the docs. Every edit is placed by a content anchor (a sentence or a heading), never by a line number.
- **Risk:** The doctor ids named in R1 exist only if STORY-009-01 emits them on every run.
- **Mitigation:** STORY-009-01 R10 always emits both, and `checkDoctorIds` fails here if not. Scenario 3 runs it.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One reading path: the text is read, not chosen between. The error paths are in scenario 4 (Data). |
| Interfaces | T | The guidance reaches the agent through WIKI.md (and, through the CLI, the messages it quotes), and the reader through architecture.md and the README. |
| Data | T | Planted wrong text (an unknown option, an unknown command, an unknown doctor id) on a copy of the templates. |
| Rules | T | Tell once and ask before `upgrade` and `update`; never `sudo`; the text matches what the CLI prints; WIKI.md's invariants. |

```gherkin
Feature: Upgrade instructions and docs

  @interfaces
  Scenario Outline: The text says what the version check and upgrade do, where each reader looks
    Given the repository at this story's commit
    When I read <place> of <file>
    Then it contains each of <phrases>

    Examples:
      | part | file | place | phrases |
      | notice (R1) | templates/system/WIKI.md | section "Lint and status" | "at most once a day", "`wikeeper ingest plan`", "`wikeeper ingest start`", "`version.latest`", "the `update-available` check" |
      | asking (R1) | templates/system/WIKI.md | section "Lint and status" | "Tell the user once in the session and ask whether to upgrade", "on a yes, run `wikeeper upgrade`", "Never upgrade unasked", "do not bring it up again in that session" |
      | one question (R1) | templates/system/WIKI.md | section "Lint and status" | "ask once, whether to upgrade", "it refreshes the files as well", "tell them in one message after the user's request is done", "then the version question" |
      | files (R1) | templates/system/WIKI.md | section "Lint and status" | "`version.files`", "the `version-mismatch` check", "`wikeeper update` when the files are older", "`wikeeper upgrade` when the installed version is older", "Ask before `wikeeper update` too" |
      | failure (R1) | templates/system/WIKI.md | section "Lint and status" | "tell the user in plain words", "starts with `sudo`", "`error.details.command`" |
      | principles (R3 a) | architecture.md | §2 | "daily version check", "runs npm only in `upgrade`" |
      | lifecycle (R3 b) | architecture.md | §3 | "`init`, `update`, `upgrade`, `remove`", "sends nothing about the wiki", "`update_check: false`", "`WIKEEPER_NO_UPDATE_CHECK`", "`NO_UPDATE_NOTIFIER`", "`CI`", "never runs `sudo`" |
      | network (R3 c) | architecture.md | §7.7 | "`read` and the daily version check (§3) are wikeeper's only network uses" |
      | surface (R3 d, e) | architecture.md | §10 and §11 | "`upgrade [--check]`", "update_check: true" |
      | decision (R3 f) | architecture.md | §13 | "D-38", "never with `sudo`" |
      | README (R4) | README.md | body | "wikeeper upgrade [--check]", "## ⬆️ Upgrading", "registry.npmjs.org/wikeeper/latest", "nothing about your wiki", "wikeeper config set update_check false", "WIKEEPER_NO_UPDATE_CHECK=1", "NO_UPDATE_NOTIFIER", "`D-01`–`D-38`" |

  @rules
  Scenario: The text matches what the CLI prints
    Given a wiki initialised through the default program in a temp git repository, with its manifest's package_version set to "0.0.1+abc1234"
    When I run "wikeeper status", "wikeeper status --json" and "wikeeper doctor --json" there
    Then the human status has a line ending in 'run wikeeper update', and WIKI.md section "Lint and status" names "`wikeeper update` when the files are older"
    And the warning WIKI.md quotes equals availableMessage("0.4.1", "0.4.0")
    And the fields that open a status bullet in that section are exactly the keys of data, "version" among them, and the "- `version`: " bullet is byte-identical to STORY-009-01's
    And doctor's checks include "version-mismatch" with severity "warning" and "update-available"

  @rules
  Scenario: WIKI.md keeps its structure and every name in the new text exists
    Given the repository at this story's commit
    Then WIKI.md has its fourteen sections in order, at most 400 lines and an LF final newline
    And the vocabulary check of test/templates/wiki-protocol.red.node.test.ts finds nothing, with "upgrade" in COMMANDS
    And runAllChecks on templates/ with doctorCheckIds() finds nothing, and checkCoverage finds "wikeeper upgrade" named
    And templates/agent-block.md, templates/system/SETUP.md, templates/system/ONBOARDING.md, templates/skills/** and templates/agents/** are byte-identical to the base of this story

  @data
  Scenario Outline: Error — a wrong name in the text is reported with its line
    Given a copy of templates/ whose WIKI.md section "Lint and status" also contains <planted>
    When the checks of test/templates/structure.ts run on the copy
    Then they report <finding>, with the planted line

    Examples:
      | planted | finding |
      | "`wikeeper upgrade --yes`" | '"--yes" is not an option of "upgrade"' |
      | "`wikeeper upgrades`" | 'unknown command "wikeeper upgrades"' |
      | "the `version-check` check" | 'doctor check "version-check" is not reported by wikeeper doctor --json' |
```

### 2.2 Verification Steps (Manual)
- [ ] Part-4 walkthrough (sprint plan §1, real user, a fresh session). In a scratch copy of the testbed (`testbed.md`, Making a scratch copy), whose files are from 0.3.0, with 0.4.0 installed, ask a plain question that makes the agent run `wikeeper status` at session start. The agent tells the user that the project's files are out of date, asks, and runs `wikeeper update` only after a yes. Answer no once in another fresh session, in a fresh copy: the agent does not run `update` and does not bring it up again in that session.
- [ ] Read the README "Upgrading" section and architecture.md §3 against `wikeeper upgrade --help` and `wikeeper doctor` output: every command, option and switch they name exists.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `templates/system/WIKI.md` |
| Related Files | `./architecture.md`, `./README.md` |
| Test Files | `test/templates/structure.ts`, `test/templates.test.ts` |
| Re-scoped red test (QA-Red) | `test/templates/wiki-protocol.red.node.test.ts`, `test/templates/archive-instructions.red.node.test.ts` |
| New Files Needed | `test/templates/upgrade-instructions.red.node.test.ts` (written by QA-Red) |

- **Read, not edited:**
  - `src/core/update-check.ts` (`availableMessage`, the `versionMismatch` messages) and `src/commands/upgrade.ts` (`upgrade`, `--check`, the hand commands);
  - `src/commands/doctor.ts` (the two check ids), `src/commands/status.ts` (`version`);
  - `test/templates/sprint-03-commands.red.node.test.ts` (the status-field check, `:96` `statusFields`);
  - `test/templates/structure-sprint-03.red.node.test.ts:142`.
- **Re-scoped red-test assertion** (§1.4 Q4): `test/templates/wiki-protocol.red.node.test.ts:27`, `const COMMANDS = new Set([... "rules", "config", "statusline"])` after STORY-007-07, gains `"upgrade"` as its last entry. Nothing else in that file changes.

### 3.2 Technical Logic
- **Base.** Start from the tree with STORY-007-07, STORY-008-06 and STORY-009-02 merged; STORY-009-01's `version` bullet is already in WIKI.md.
  1. Add R1's paragraph, anchored after the paragraph that starts "When a page reaches 🔴" (as STORY-008-06 left it) and before "The fields of the `--json` output".
  2. Check R2's bullet.
  3. Then architecture.md (R3), the README (R4) and the tests (R5, R6).
- **Checking the text.** Before committing:
  - run `npx vitest run test/templates test/templates.test.ts`;
  - grep the new paragraph for `wikeeper [a-z]` and check that each match is a command in `COMMANDS`;
  - check that the paragraph has no "section" (R1).

  The quoted warning must equal `availableMessage("0.4.1", "0.4.0")` byte for byte (scenario 2 checks it).
- **QA-Red test.**
  - `test/templates/upgrade-instructions.red.node.test.ts` splits WIKI.md sections as `test/templates/sprint-03-commands.red.node.test.ts:59` does, and reads architecture.md sections by their `## ` headings.
  - Scenario 2 runs the CLI in-process through the default `runCli`, with `.git` present (FLASHCARD 2026-10-17 `#qa #test-harness`). It edits only `package_version` in the manifest (FLASHCARD `#red-test #manifest`: assert the entry under test, not the whole manifest). It reuses `statusFields` from `sprint-03-commands` by copying the regex.
  - Scenario 3 imports `runAllChecks`, `doctorCheckIds` and `checkCoverage` from `test/templates/structure.ts`, and reads `COMMANDS` from the wiki-protocol file as text.
  - Scenario 4 works on a copy of the templates, as `test/templates.test.ts:107` does.
  - Text asserts come before the live CLI half, and one canary assertion checks R1's new text (FLASHCARD 2026-10-17 `#qa #red-test`, the two entries on mixed and mirrored text).
- **Byte-identical files (scenario 3).** Compare with the files at the story's base commit (`git show <base>:<path>`), skipping WIKI.md, architecture.md and README.md.

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| none | — | — | — | No CLI, option or export changes; text and tests only. |

```ts
// test/templates/structure.ts — one form appended
export const DOCUMENTED_FORMS: readonly string[]; // gains "upgrade"
```

Consumed (frozen):
- K14's `availableMessage` and the `versionMismatch` messages, and STORY-009-01's `version` status bullet and doctor ids `version-mismatch` and `update-available`;
- K16's `wikeeper upgrade [--check]` (STORY-009-02).

**Deviations from the decomposition, all stated:**
1. The `version` status bullet is STORY-009-01's (its §1.4 Q7). This story checks it and does not write it.
2. The file surface adds `test/templates/structure.ts` and `test/templates.test.ts` (R5) and one re-scoped red file (R6), as STORY-007-07 R10 and STORY-008-06 R9 do.

## Task Breakdown

- [ ] QA-Red: re-scope `COMMANDS` (R6) by content anchor on the merged tree; write `test/templates/upgrade-instructions.red.node.test.ts` from the four scenarios in §2.1 -> R6, §2.1
- [ ] Add R1's paragraph to WIKI.md "Lint and status"; check R2's bullet -> R1, R2
- [ ] Update architecture.md §2, §3, §7.7, §10, §11 and §13 -> R3
- [ ] Update the README table, add "Upgrading", and change the decision range -> R4
- [ ] Append `upgrade` to `DOCUMENTED_FORMS` and pin `upgrade --check` in `test/templates.test.ts`; run `npm test` -> R5, R7

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 1 | The `test/templates.test.ts` pin: command `upgrade` has option `--check`. |
| Integration tests | 0 | Text and in-process CLI runs only. |
| E2E / acceptance tests | 4 | One per Gherkin scenario in `test/templates/upgrade-instructions.red.node.test.ts` (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] `test/templates/wiki-protocol.red.node.test.ts` passes with only the R6 change; `test/templates/structure-sprint-03.red.node.test.ts`, `test/templates/sprint-03-commands.red.node.test.ts` and `test/templates.test.ts` pass unchanged (apart from R5's pin).
- [ ] WIKI.md is at most 400 lines.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `templates/system/WIKI.md:271` — section "Lint and status", where `status` is read once per session; the R1 paragraph and STORY-009-01's bullet go here.
- **Surface:** `./architecture.md:425` — "`read` is the only command that uses the network", amended here; `./architecture.md:27` — the lifecycle line.
- **Surface:** `./README.md:115` — the CLI reference table; `./README.md:164` — the decision-log range.
- **Surface:** `test/templates/structure.ts:467` — `DOCUMENTED_FORMS`; `test/templates/structure.ts:200` — `checkDoctorIds`, which ties the doctor ids in the text to `doctor --json`.
- **Coverage of this requirement:** partial. The sections, the docs and the structural checks exist; the upgrade text and the doc entries are new.

## Prior work

- [[EPIC-009]] (parent; its §6 Q3 is §1.4 Q1 here). The duplicate check (cleargate-wiki-query, 2026-10-18, recorded in EPIC-009) found no earlier upgrade instructions.
- Builds on [[STORY-006-04]] (WIKI.md and its vocabulary test), [[STORY-006-09]] (the status-field bullets and their check), [[STORY-006-11]] (the structural checks and `DOCUMENTED_FORMS`) and [[STORY-003-10]] (the network rule amended in §7.7).
- Follows [[STORY-007-07]] and [[STORY-008-06]] on the same files (merge order 007-07 → 008-06 → 009-03); consumes [[STORY-009-01]] (messages, bullet, doctor ids) and [[STORY-009-02]] (`upgrade`).

## Why not simpler?

- **Smallest existing surface that could carry this:** the CLI's own messages, which already name `wikeeper upgrade` and `wikeeper update` (STORY-009-01), with no instruction text at all.
- **Why isn't extension / parameterization / config sufficient?** The messages say what to run, not whether to run it. An agent reading `run wikeeper upgrade` in a warning would run it unasked, which EPIC-009 forbids (§0: the agent asks first). The only place to say "tell once, ask first" is WIKI.md. The docs change because architecture.md states that only `read` uses the network, which is no longer true, and README readers need the privacy statement and the off switch. Everything goes into existing sections, with one README section added.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`test/templates/upgrade-instructions.red.node.test.ts` is this story's QA-Red file; `src/commands/upgrade.ts` and `src/core/update-check.ts` come from STORY-009-02 and STORY-009-01 in this sprint.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
- [x] §1.4 Q1–Q5 decided by the human, and EPIC-009 approved (Gate 1).
