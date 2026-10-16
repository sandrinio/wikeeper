---
story_id: STORY-006-06
parent_epic_ref: EPIC-006
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-006 (approved 2026-10-16; §2 structural tests, §3 formats and caps, §5 Gherkin) · CR-002 §4 'one ingest vocabulary' scenario and the 14-line cap (approved 2026-10-16) · SPRINT-02 decomposition brief (contracts 1, 2, 11, 12, 13 — human decision 2026-10-16, no fixed pages, me.md and project.md) · verified src/program.ts, src/agents/hook-protocols.ts, src/agents/enforce/{claude,codex,antigravity}.ts, src/core/templates.ts
actor: Maintainer changing wikeeper's templates or commands
complexity_label: L2
parallel_eligible: n
dep_predecessors:
  - STORY-003-02
  - STORY-003-04
  - STORY-003-05
  - STORY-003-06
  - STORY-003-07
  - STORY-003-08
  - STORY-003-09
  - STORY-004-01
  - STORY-004-02
  - STORY-004-03
  - STORY-004-04
  - STORY-004-05
  - STORY-006-01
  - STORY-006-02
  - STORY-006-03
  - STORY-006-04
  - STORY-006-05
  - STORY-006-07
  - STORY-006-08
expected_bounce_exposure: med
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T22:00:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:57:42Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-006-06
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:56:06Z
  sessions: []
---

# STORY-006-06: Structural template tests
**Complexity:** L2 — one test file over the whole `templates/` tree, run against the real command tree and the CLI's own parsers. It runs last in the sprint, after every command and content story has merged.

## 1. The Spec (The Contract)

### 1.1 User Story
As a maintainer, I want one test that fails whenever any template names a command, flag, file or section that does not exist, breaks its agent's format, outgrows its line cap or stops parsing, so that the instructions and the CLI can never drift apart unnoticed — this sprint or later.

### 1.2 Detailed Requirements
- **R1 — Commands exist (EPIC-006 §5, CR-002 §4).** Every `wikeeper <command>[ <subcommand>]` reference (including `npx wikeeper …`) found in any file under `templates/`, in `GUARD_REASON` (`src/agents/hook-protocols.ts:5`), and in the settings entries the enforce writers produce for every permission mode (`CLAUDE_ENFORCE`, `CODEX_ENFORCE`, `ANTIGRAVITY_ENFORCE` items — rule strings, Codex `prefix_rule` patterns and the guard hook command) resolves in the command tree built by `createProgram()` (`src/program.ts:40`): the top-level command exists, and when it has subcommands the next word is one of them. Argument placeholders (`<id>`, `<dir>`, `*`, `-`) are not commands. Every doctor check a template names in the form `` `<id>` check `` (today `setup-files`, STORY-006-08) is an id that `wikeeper doctor --json` reports in a temp install.
- **R2 — Flags exist.** Every `--flag` that follows a reference within the same inline code span or code-block line is an option of that (sub)command or of the root program (`--json`, `--version`, `--help`).
- **R3 — Paths exist (contracts 12 and 13).** Every `.wiki/system/<path>` reference in the templates and in `GUARD_REASON` names a file or directory under `templates/system/`; `.wiki/system/manifest.json`, which `init` writes, is the only exception. Every other `.wiki/<path>` reference must be one of the runtime files `.wiki/me.md`, `.wiki/project.md`, `.wiki/kb_instructions.md`, `.wiki/config.yml`, `.wiki/index.md`, or a location the CLI itself creates: `.wiki/` alone, a path under `.wiki/pages/`, `.wiki/raw/` or `.wiki/log/`, `.wiki/log.md`, `.wiki/.lock`, or a path under `.wiki/.snapshots/` or `.wiki/.cache/`. Anything else (e.g. `.wiki/team.md`) is a finding, so instructions cannot point at a fixed page the package does not create.
- **R4 — Sections exist (contract 11).** Every reference of the form `<file>.md, section "<Heading>"` resolves to a `## <Heading>` line in the named `.wiki/system/` file; this covers the guard's `section "Write phase"` and every skill and sub-agent reference to WIKI.md and SETUP.md.
- **R5 — Formats (EPIC-006 §3).** Skills under `templates/skills/*/SKILL.md`: frontmatter keys exactly `name`, `description`; `name` equals the folder; description non-empty and ≤ 1024 characters. Sub-agents: Claude `.md` exactly `name`, `description`, `model`; Antigravity `.md` exactly `name`, `description`, `model`, `mainAgent` (false); Codex `.toml` exactly `name`, `description`, `model`, `developer_instructions`; `name` equals the file name; the `{{model}}` line present on its own line.
- **R6 — Caps.** `templates/agent-block.md` ≤ 14 lines (CR-002 decision 1); `templates/system/templates/me.md` ≤ 15 lines; `templates/system/templates/project.md` ≤ 20 lines (contract 13).
- **R7 — Parsers.** Page templates are the files under `templates/system/templates/` other than `me.md` and `project.md`, which are setup templates (contract 13); today that is only `source.md`. Each page template parses with `parsePage` (`src/wiki/parse-page.ts`) with an empty `errors` list. In every template that has a `## Source kinds` section (today the profile's suggestions and the kb seed), every non-blank line of that section outside an HTML comment yields a rule from `parseSourceKinds` (`src/ingest/kind-rules.ts`), matched by the rule's `line`.
- **R8 — No placeholders left.** No file under `templates/` contains the SPRINT-01 marker `placeholder: real text arrives in EPIC-006`.
- **R9 — Generic and reportable.** Each check walks the whole tree (new templates are covered without editing the test), takes the templates directory as a parameter, and reports findings as `file:line — message`; the test fails listing every finding.

### 1.3 Out of Scope
- Content-specific checks each content story already owns (SETUP.md step order and preview — 006-02; WIKI.md sections and examples — 006-04; skill triggers and shared sub-agent text — 006-05). This story re-checks only the generic rules above, across every file.
- Checking the semantics of flags (only their existence).
- Knowledge quality (INITIATIVE-001 §5).

### 1.4 Open Questions

- None — the checks are EPIC-006 §5 plus the CR-002 vocabulary scenario, extended to flags, sections and parsers so the SPRINT-02 contracts stay enforced.

### 1.5 Risks

- **Risk:** Any late rename of a command or flag in EPIC-003/004 fails this story, not the story that renamed it.
- **Mitigation:** That is the purpose; this story integrates last, and its findings name the file and line to fix. Content stories run their own vocabulary checks earlier against the frozen contract list.
- **Risk:** Reference extraction over-matches prose ("the wikeeper team").
- **Mitigation:** Only text inside inline code spans and fenced code blocks is scanned for commands and flags; prose references are not commands.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One check run; no alternative successful flows. |
| Interfaces | T | References come from three surfaces: template files, the guard's deny message and the agents' settings entries. |
| Data | T | Each file kind (skill, three sub-agent formats, page template, Source kinds section) has its own rule. |
| Rules | T | Commands, flags, paths, sections, caps and placeholders each have a rule, broken in the error scenario. |

```gherkin
Feature: Structural template tests

  @rules @interfaces
  Scenario: Every referenced command and flag exists
    Given every file under templates/, GUARD_REASON and the enforce writers' entries for ai, ask and whitelist
    When test/templates.test.ts extracts every "wikeeper <command>" reference from code spans and code blocks
    Then each command, and its subcommand where the command has subcommands, appears in the program built by createProgram
    And every "wikeeper ingest <verb>" names an existing ingest subcommand
    And every flag following a reference is an option of that command or of the root program
    And every "`<id>` check" a template names is a check id that "wikeeper doctor --json" reports in a temp install

  @rules
  Scenario: Every path and section reference resolves
    Given every file under templates/ and GUARD_REASON
    Then every ".wiki/system/<path>" reference names a file or directory under templates/system/, except ".wiki/system/manifest.json"
    And every other ".wiki/<path>" reference is .wiki/me.md, .wiki/project.md, .wiki/kb_instructions.md, .wiki/config.yml, .wiki/index.md or a location the CLI creates
    And every "<file>.md, section \"<Heading>\"" reference names a "## <Heading>" in that file
    And the guard's section "Write phase" exists in templates/system/WIKI.md

  @data
  Scenario Outline: Each file kind meets its format
    Given every <kind> file
    Then <rule>

    Examples:
      | kind                 | rule                                                                                                  |
      | skill                | its frontmatter keys are exactly name and description, name equals its folder, description ≤ 1024 characters |
      | claude sub-agent     | its frontmatter keys are exactly name, description, model, name equals its file name, the {{model}} line is present |
      | antigravity sub-agent | its frontmatter keys are exactly name, description, model, mainAgent with mainAgent false, the {{model}} line is present |
      | codex sub-agent      | its keys are exactly name, description, model, developer_instructions, the {{model}} line is present    |
      | page template        | parsePage returns an empty errors list (me.md and project.md are setup templates, not page templates) |
      | Source kinds section | every non-blank line under "Source kinds" outside an HTML comment parses with parseSourceKinds        |

  @rules
  Scenario: Always-loaded text stays small and no placeholder is left
    Given templates/agent-block.md, templates/system/templates/me.md and templates/system/templates/project.md
    Then the block has at most 14 lines, me.md at most 15 lines and project.md at most 20 lines
    And no file under templates/ contains "placeholder: real text arrives in EPIC-006"

  Scenario Outline: Error — a broken reference fails naming the template
    Given a copy of the templates directory where templates/system/SETUP.md contains <reference>
    When the structural checks run on the copy
    Then they fail with a finding naming "system/SETUP.md", its line and <named>

    Examples:
      | reference                               | named                         |
      | "`.wiki/system/MISSING.md`"             | ".wiki/system/MISSING.md"     |
      | "`.wiki/team.md`"                       | ".wiki/team.md"               |
      | "`wikeeper ingest publish <id>`"        | "ingest publish"              |
      | "`wikeeper search --owner Product`"         | "--owner"                     |
      | "WIKI.md, section \"Querying\""         | "Querying"                    |
```

### 2.2 Verification Steps (Manual)
- [ ] Rename a heading in a scratch copy of WIKI.md, run `npx vitest run test/templates.test.ts` and read the finding list.

## 3. The Implementation Guide

### 3.1 Context & Files

| Item | Value |
|---|---|
| Primary File | `test/templates.test.ts` |
| New Files Needed | Yes — `test/templates.test.ts` |

### 3.2 Technical Logic
- Command tree: `createProgram()` (`src/program.ts:40`) with the default commands; walk `program.commands` and each command's `commands`, collecting names and `options` (long flags). No CLI process is spawned.
- References: for `.md` files, scan inline code spans and fenced blocks; for `.toml`, scan `developer_instructions`; `GUARD_REASON` and enforce entries are scanned whole. Regex `(?:npx\s+)?wikeeper\s+([a-z][a-z-]*)(?:\s+([a-z][a-z-]*))?` plus the flags after it on the same line. Codex `prefix_rule(pattern=[...])` lines: tokens after `"wikeeper"` form the reference.
- Enforce entries: `CLAUDE_ENFORCE.items(cmd, mode)` (`src/agents/enforce/claude.ts:18`), `CODEX_ENFORCE.flatMap((s) => s.items(cmd, mode))` (`src/agents/enforce/codex.ts:36`), `ANTIGRAVITY_ENFORCE.items(cmd, mode)` (`src/agents/enforce/antigravity.ts:5`) for each mode, with `cmd = "wikeeper hook guard --agent <agent>"`; take every string value (rule values, hook command fields).
- Files: `listTemplateFiles` (`src/core/templates.ts:58`) over `templatesDir()`; YAML frontmatter via `yaml`; Codex TOML via the same small line reader STORY-006-05 uses (top-level `key = "value"` lines and one `developer_instructions` block).
- Each check is a function `(templatesDir) => Finding[]`; the error outline copies `templates/` to a temp dir, appends the bad line to `system/SETUP.md` and asserts the finding.

### 3.3 API Contract (if applicable)

Not applicable — test only. Consumes `createProgram`, `GUARD_REASON`, the enforce specs, `parsePage` and `parseSourceKinds` read-only.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 4 | Reference extractor (code spans, fences, TOML, prefix_rule); command-tree walker; section resolver; `.wiki/` path classifier (system, runtime, CLI-created, unknown) |
| Integration tests | 0 | Everything runs in-process over the templates tree |
| E2E / acceptance tests | 14 | 1 per Gherkin scenario in §2.1, Scenario Outline rows counted separately |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] The test passes on the integrated sprint branch with every SPRINT-02 story merged, on Linux, macOS and Windows.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/program.ts:31` — `defaultCommands`, the registry the command tree is built from; `src/program.ts:40` — `createProgram`.
- **Surface:** `src/agents/hook-protocols.ts:5` — `GUARD_REASON`.
- **Surface:** `src/agents/enforce/claude.ts:18`, `src/agents/enforce/codex.ts:36`, `src/agents/enforce/antigravity.ts:5` — pure per-mode entry builders.
- **Surface:** `src/core/templates.ts:58` — `listTemplateFiles`.
- **Surface:** `test/agents/subagents.red.node.test.ts:116` — the TOML line-format check this story generalises.
- **Coverage of this requirement:** partial — SPRINT-01 checks rendered sub-agent syntax only; nothing checks references.

## Prior work

- [[EPIC-006]] (parent), [[CR-002]] (one ingest vocabulary, 14-line cap), [[EPIC-002]] (formats fixed by STORY-002-03, settings entries by STORY-002-06). No duplicates found.

## Why not simpler?

- **Smallest existing surface that could carry this:** `test/agents/subagents.red.node.test.ts:116` checks one format rule for rendered sub-agents; it cannot see references, sections or the command tree.
- **Why isn't extension / parameterization / config sufficient?** Per-story content tests run against the frozen contract list, before the commands exist; only a test over the merged tree, reading the real command tree, proves the templates and the CLI agree — and it keeps proving it when SPRINT-03 adds `read`, `lint`, `status` and their text.

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
