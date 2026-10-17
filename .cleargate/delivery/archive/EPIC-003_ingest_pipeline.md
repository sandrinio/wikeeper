---
epic_id: EPIC-003
parent_ref: INITIATIVE-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Completed
approved: true
ambiguity: 🟢 Low
context_source: architecture.md v0.4 §7 (D-04–D-08, D-16–D-20, D-25, D-28) · INITIATIVE-001 · npm libraries checked 2026-10-16
owner: Sandro Suladze
target_date: null
created_at: 2026-10-16T13:15:00Z
updated_at: 2026-10-16T13:15:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: 8
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:22:46Z
  transition: ready-for-decomposition
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: baffde9319126a3927727d534f61ca15e479880fcf92c0097e279810182d9bfd
stamp_error: no ledger rows for work_item_id EPIC-003
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:11:07Z
  sessions: []
---

# EPIC-003: Ingest pipeline

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Implement the gated three-phase ingest (register → facts → write) with pre- and post-hooks, permission modes, raw-source registry, lock and snapshot, diff-based report, merge-safe log and deterministic index; plus the `wikeeper read` conversion helper.</objective>
  <architecture_rules>
    <rule>Raw files are immutable once written; the CLI never converts during ingest (D-20).</rule>
    <rule>The lock covers the write phase only (apply → finish/abort); register and facts may run in parallel (D-17).</rule>
    <rule>The finish report is computed from the snapshot diff, never from agent claims (D-08).</rule>
    <rule>Permission modes ai / ask / whitelist; whitelist entries match kind and/or origin; unmatched sources are denied (D-06, D-07, D-25).</rule>
    <rule>One log file per event under log/; log.md is a generated, gitignored view; index.md is rebuilt deterministically from page frontmatter (D-28).</rule>
    <rule>Only `read` may touch the network.</rule>
  </architecture_rules>
  <target_files>
    <file path="src/ingest/source-id.ts" action="create" />
    <file path="src/ingest/registry.ts" action="create" />
    <file path="src/ingest/permissions.ts" action="create" />
    <file path="src/ingest/plan.ts" action="create" />
    <file path="src/ingest/facts.ts" action="create" />
    <file path="src/ingest/lock.ts" action="create" />
    <file path="src/ingest/snapshot.ts" action="create" />
    <file path="src/ingest/diff.ts" action="create" />
    <file path="src/ingest/validate.ts" action="create" />
    <file path="src/ingest/index-builder.ts" action="create" />
    <file path="src/ingest/log.ts" action="create" />
    <file path="src/ingest/report.ts" action="create" />
    <file path="src/ingest/user-hooks.ts" action="create" />
    <file path="src/commands/ingest.ts" action="create" />
    <file path="src/commands/index.ts" action="create" />
    <file path="src/commands/read.ts" action="create" />
    <file path="src/read/url.ts" action="create" />
    <file path="src/read/docx.ts" action="create" />
    <file path="src/read/pdf.ts" action="create" />
    <file path="templates/schemas/facts.schema.json" action="create" />
    <file path="package.json" action="modify" />
  </target_files>
</agent_context>
```

## 1. Problem & Value

**Why are we doing this?**
Ingest is where knowledge enters the wiki, and where it can be silently damaged. The CLI has to enforce permissions, keep provenance, let several sources be extracted at once while writes stay serial, and tell the user exactly what changed.

**Success Metrics (North Star):**
- A file, a directory, a URL and a chat excerpt each complete register → facts → apply → finish in end-to-end tests under all three permission modes.
- Zero page changes without a matching log entry across the test suite.
- `read` converts the DOCX, PDF and HTML fixtures with headings, lists and tables preserved.

## 2. Scope Boundaries

**✅ IN-SCOPE (Build This)**
- [ ] Source ids `src-YYYY-MM-DD-<slug>` with collision suffix.
- [ ] Raw registry: copy original, sha256, `<id>.meta.json` (origin, kind, provided_by, captured_at, size, rule_version); optional agent-read text as `<id>.md` via stdin or `--text-file`.
- [ ] Duplicate detection by hash; `--reingest`.
- [ ] Permissions: `ai` / `ask` / `whitelist`; `--approved`; exit codes 3 (needs_approval) and 4 (denied); kind rules checked at `start` with `--kind`, otherwise at `facts`.
- [ ] `ingest start <path|url|->`, `ingest plan <dir>` (new / duplicate / denied per file, JSON plan).
- [ ] `ingest facts <id>`: validate against `facts.schema.json`, store `<id>.facts.json`.
- [ ] `ingest apply <id>`: take lock, snapshot pages, print facts and the brief template.
- [ ] `ingest finish <id>`: diff, validate (every changed page cites `[[<id>]]`; no writes outside pages), rebuild `index.md`, write `log/<timestamp>-<id>.md`, regenerate `log.md`, run user hooks, call the lint hook point (EPIC-005), print the report, release lock.
- [ ] `ingest abort <id> [--drop]`; stale-lock detection (owner pid and age; human decision at SPRINT-02 planning, 2026-10-16: staleness is by age only, 2 h, because the recorded pid belongs to the already-exited `apply` process — the pid is kept for diagnostics) with `--force-unlock`.
- [ ] `index rebuild` for post-merge recovery (D-28).
- [ ] User hooks `pre_ingest` / `post_ingest` with `{source_id}` substitution and a timeout.
- [ ] `read <file|url>`: URL via fetch → linkedom → defuddle; DOCX via mammoth → turndown + GFM; PDF via unpdf; lazy-loaded; "likely scanned" when a PDF yields almost no text per page; "needs a browser" when a page yields no main content.
- [ ] CR-002 scope addition (SPRINT-02): C1 whitelist `kinds` match a source-kind id ignoring its version; C2 the `read` story adds its `ai`-mode allow rule ([[CR-002]], [[CR-001]]).

**❌ OUT-OF-SCOPE (Do NOT Build This)**
- How the agent triages, extracts and writes (EPIC-006 instructions).
- Search (EPIC-004) and the lint checks themselves (EPIC-005).
- OCR; `.doc`, `.pptx`, `.xlsx`; headless browsers; MCP.

## 3. The Reality Check (Context)

| Constraint Type | Limit / Rule |
|---|---|
| Integrity | Raw files are never modified after `start`; `finish` refuses to complete when validation fails and leaves the lock for `abort`. |
| Concurrency | Exactly one write phase at a time, enforced by an exclusive lock file. |
| Network | `read <url>`: 20 s timeout, 10 MB response cap; no other command uses the network. |
| Dependencies | defuddle, linkedom, mammoth, turndown, unpdf (~8 MB unpacked, checked on npm 2026-10-16), imported lazily so CLI start-up stays fast. |
| Sequencing | After EPIC-001; the lint hook point is filled by EPIC-005. |

## Existing Surfaces

- **Surface:** `src/program.ts` — command registry for `ingest`, `index` and `read`.
- **Surface:** `architecture.md` — §7.3 lifecycle and §7.4 facts format this epic implements.
- **Coverage of this epic's scope:** none — net-new pipeline.

## Prior work

- [[INITIATIVE-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this epic:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** A single "ingest" command that lets the agent write pages directly can't enforce permissions, can't attribute changes when sources are processed in parallel, and can't produce a trustworthy report. Splitting register / facts / write with a lock and a snapshot is the minimum that gives those guarantees.

## 4. Technical Grounding (The "Shadow Spec")

**Affected Files:**
- `src/ingest/source-id.ts`, `registry.ts` — ids, raw storage, metadata, hashing.
- `src/ingest/permissions.ts` — mode and whitelist evaluation.
- `src/ingest/plan.ts` — directory planning.
- `src/ingest/facts.ts` — schema validation and storage.
- `src/ingest/lock.ts`, `snapshot.ts`, `diff.ts`, `validate.ts` — write-phase safety.
- `src/ingest/index-builder.ts`, `log.ts`, `report.ts`, `user-hooks.ts` — post-hook.
- `src/commands/{ingest,index,read}.ts` — command surfaces; each ingest subcommand in `src/commands/ingest-<verb>.ts`, registered by `ingest.ts` (SPRINT-02 decomposition contract 6, human-accepted 2026-10-16).
- `src/ingest/lint-hook.ts` — the lint hook point `finish` calls; EPIC-005 replaces its default (contract 9, human-accepted 2026-10-16).
- `src/read/{url,docx,pdf}.ts` — converters.
- `templates/system/schemas/facts.schema.json` — facts contract (architecture.md §7.4); under `templates/system/` so `init`/`update` install it to `.wiki/system/schemas/` (contract 12, human-accepted 2026-10-16).
- `package.json` — converter dependencies.

**Data Changes:**
- `raw/<id>.<ext>`, `raw/<id>.meta.json`, `raw/<id>.facts.json`, optional `raw/<id>.md`.
- `log/<timestamp>-<id>.md` events: `ingest`, `abort`, `miss`, `rule-proposal`.
- Lock file and `.snapshots/<id>/` under `.wiki/` (gitignored).

## 5. Acceptance Criteria

```gherkin
Feature: Ingest pipeline

  Scenario: A shared file goes through all phases
    Given permission mode "ai" and a markdown source notes.md
    When the agent runs start, facts, apply, edits pages/projects/atlas.md citing the source, and runs finish
    Then raw/ holds the original, meta and facts files
    And a log entry exists for the source id
    And the report lists projects/atlas.md as updated

  Scenario: Directory plan marks duplicates and denied files
    Given permission mode "whitelist" allowing origin "docs/meetings/**"
    And docs/ containing one already-ingested file and one file outside the whitelist
    When I run "wikeeper ingest plan docs --json"
    Then each file is reported as new, duplicate or denied

  Scenario: Ask mode requires approval
    Given permission mode "ask"
    When I run "wikeeper ingest start notes.md --json"
    Then the command exits with code 3 and returns the source metadata
    And nothing is stored until it is rerun with --approved

  Scenario: Error — finish rejects an uncited change
    Given an applied ingest where pages/team.md changed without "[[<id>]]"
    When I run "wikeeper ingest finish <id>"
    Then the command exits with code 1 naming pages/team.md
    And the lock is kept

  Scenario: Error — a second apply while locked is refused
    Given an ingest in its write phase
    When I run "wikeeper ingest apply <other-id>"
    Then the command exits with code 1 naming the ingest that holds the lock

  Scenario: read converts a DOCX with a table
    Given a DOCX fixture with a heading, a list and a table
    When I run "wikeeper read fixture.docx"
    Then the output is markdown with the heading, list and a GFM table
```

## 6. AI Interrogation Loop (Human Input Required)

- None. All decisions are recorded in architecture.md (D-04–D-08, D-16–D-20, D-25, D-28) and were accepted on 2026-10-16.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Coding Agent):
- [x] `approved: true` is set in the YAML frontmatter.
- [x] The `<agent_context>` block is complete and validated.
- [x] §4 Technical Grounding contains 100% real, verified file paths. (Existing paths verified; planned paths for new files accepted by the human at Gate 1, 2026-10-16.)
- [x] §6 AI Interrogation Loop is empty (all human answers integrated into the spec).
- [x] 0 "TBDs" exist in the document.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered.
