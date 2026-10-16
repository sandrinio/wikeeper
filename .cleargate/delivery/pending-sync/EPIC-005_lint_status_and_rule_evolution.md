---
epic_id: EPIC-005
parent_ref: INITIATIVE-001
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: architecture.md v0.4 §5.2, §8, §9, §10 (D-14, D-31) · INITIATIVE-001
owner: Sandro Suladze
target_date: null
created_at: 2026-10-16T13:15:00Z
updated_at: 2026-10-16T13:15:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T13:22:47Z
  transition: ready-for-decomposition
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id EPIC-005
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T13:11:55Z
  sessions: []
---

# EPIC-005: Lint, status and rule evolution

## 0. AI Coding Agent Handoff

```xml
<agent_context>
  <objective>Build the wiki's health and evolution tooling: `lint` for pages, `lint --rules` for kb_instructions.md, `status`, a rule-proposal log so rejected proposals are not re-offered, and a facts dry-run diff for previewing rule changes on old sources.</objective>
  <architecture_rules>
    <rule>Report only: lint never rewrites pages or kb_instructions.md (the one repair, `index rebuild`, lives in EPIC-003).</rule>
    <rule>kb_instructions.md is user-owned; the CLI parses it but only the agent edits it, after user approval (D-14).</rule>
    <rule>Uses the shared page parser from EPIC-004 and the log format from EPIC-003.</rule>
    <rule>Every check has an id, a severity (error / warning) and a --json form; errors give a non-zero exit code.</rule>
  </architecture_rules>
  <target_files>
    <file path="src/lint/checks.ts" action="create" />
    <file path="src/lint/links.ts" action="create" />
    <file path="src/lint/citations.ts" action="create" />
    <file path="src/lint/unlogged.ts" action="create" />
    <file path="src/lint/staleness.ts" action="create" />
    <file path="src/lint/rules-lint.ts" action="create" />
    <file path="src/kb/parse-instructions.ts" action="create" />
    <file path="src/commands/lint.ts" action="create" />
    <file path="src/commands/status.ts" action="create" />
    <file path="src/commands/rules.ts" action="create" />
    <file path="src/ingest/facts.ts" action="modify" />
  </target_files>
</agent_context>
```

## 1. Problem & Value

**Why are we doing this?**
A wiki that only grows decays: broken links, uncited claims, changes made outside an ingest, stale dates, and capture rules that drift into duplicates or stop serving any question. The agent and the user need a cheap, mechanical way to see that, and a memory of which rule changes were already rejected.

**Success Metrics (North Star):**
- Each lint check has at least one fixture that triggers it and one that passes.
- A rule proposal rejected once is reported as "previously rejected" when the same fingerprint is proposed again.

## 2. Scope Boundaries

**✅ IN-SCOPE (Build This)**
- [ ] `lint`: broken wikilinks, orphan pages, claims without a citation, pages changed without a log entry, `index.md` out of date, volatile facts (status, dates) older than a configurable age.
- [ ] `lint --rules`: parse `kb_instructions.md` (questions, entities, source kinds, write policy, never-capture, changelog); flag duplicate rules, rules pointing at unknown entities, questions no rule serves, rules serving no question, changelog/version mismatches.
- [ ] `status`: open ingests and locks, raw sources never finished, sources ingested under an older rule version (re-ingest candidates), pending rule proposals, setup state.
- [ ] `rules record --accepted|--rejected --kind <k> --summary <text>`: proposal decisions written to `log/` with a fingerprint; `rules list`.
- [ ] `ingest facts <id> --dry-run`: diff new facts against the stored facts file without storing.
- [ ] Fill the lint hook point called by `ingest finish`.

**❌ OUT-OF-SCOPE (Do NOT Build This)**
- Automatic fixes; LLM-based contradiction detection (the writer agent flags contradictions).
- Knowledge-quality evaluation and benchmarks (later phase, per INITIATIVE-001).

## 3. The Reality Check (Context)

| Constraint Type | Limit / Rule |
|---|---|
| Safety | Read-only over pages and kb_instructions.md; writes only `log/` events. |
| Output | Stable check ids so the agent and CI can filter them. |
| Sequencing | After EPIC-003 (log, facts) and EPIC-004 (page parser). |

## Existing Surfaces

- **Surface:** `src/program.ts` — command registry for `lint`, `status`, `rules`.
- **Coverage of this epic's scope:** none — net-new tooling.

## Prior work

- [[INITIATIVE-001]] (parent). No other prior work found.

## Why not simpler?

- **Smallest existing surface that could carry this epic:** none — net-new abstraction required.
- **Why isn't extension / parameterization / config sufficient?** A markdown link checker covers broken links only. Uncited claims, unlogged changes, stale rule versions and question/rule coverage depend on wikeeper's own page format, log and kb_instructions structure, so the checks have to know that format.

## 4. Technical Grounding (The "Shadow Spec")

**Affected Files:**
- `src/lint/{checks,links,citations,unlogged,staleness,rules-lint}.ts` — checks and registry.
- `src/kb/parse-instructions.ts` — kb_instructions.md parser.
- `src/commands/{lint,status,rules}.ts` — command surfaces.
- `src/ingest/facts.ts` — add `--dry-run` diff.

**Data Changes:**
- `rule-proposal` events in `log/`: `{ kind, summary, fingerprint, decision, at }`.
- Config: `lint.stale_after_days` (default 30).

## 5. Acceptance Criteria

```gherkin
Feature: Lint, status and rule evolution

  Scenario: Lint finds an uncited claim and a broken link
    Given a page with a fact line without a source link and a link to a missing page
    When I run "wikeeper lint --json"
    Then the output lists check "uncited-claim" and check "broken-link" with file and line

  Scenario: Lint detects a change made outside an ingest
    Given pages/team.md edited after the last log entry that touched it
    When I run "wikeeper lint"
    Then check "unlogged-change" names pages/team.md

  Scenario: Rules lint finds a question no rule serves
    Given kb_instructions.md with question Q4 that no source-kind rule references
    When I run "wikeeper lint --rules --json"
    Then check "question-without-rule" names Q4

  Scenario: Status lists re-ingest candidates
    Given sources ingested under meeting-notes v1 while the rule is now v2
    When I run "wikeeper status --json"
    Then those source ids are listed as re-ingest candidates

  Scenario: A rejected proposal is remembered
    Given a rule proposal recorded as rejected
    When the same proposal is recorded again
    Then "wikeeper rules list" marks it "previously rejected"

  Scenario: Error — lint exits non-zero on errors
    Given a wiki with one broken link
    When I run "wikeeper lint --json"
    Then the command exits with code 1
```

## 6. AI Interrogation Loop (Human Input Required)

- None. All decisions are recorded in architecture.md (D-14, D-28, D-31) and were accepted on 2026-10-16.

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
