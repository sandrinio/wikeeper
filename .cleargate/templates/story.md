<instructions>
FOLLOW THIS EXACT STRUCTURE. Output sections in order 1-4.
YAML Frontmatter: Story ID, Parent Epic, Status, Ambiguity, Context Source, Actor, Complexity Label.
§1 The Spec: User Story + Detailed Requirements + Out of Scope.
§2 The Truth: Gherkin acceptance criteria + manual verification steps.
§2.1 also carries a SPIDR coverage table (axes: Paths, Interfaces, Data, Rules) directly above the Gherkin block. Paths = more than one *successful* way through (the baseline error scenario is not a path). Interfaces = more than one surface exposes the behaviour (CLI / API / UI / hook). Data = behaviour differs by data type, shape or volume — usually a Scenario Outline with Examples. Rules = a business rule constrains the outcome — one scenario per rule, including breaking it. Tag each covered scenario with the matching `@paths` / `@interfaces` / `@data` / `@rules` marker directly above `Scenario:` / `Scenario Outline:`. There is no Spike row: open discovery is chartered as a SPIKE item before this Story is written.
§3 Implementation Guide: Files to modify, technical logic, API contract. Sourced from the approved Epic and verified codebase grounding.
Task Breakdown: one `- [ ] <action>` row per executable step, in execution order. REQUIRED at L3 and above, optional at L2, omit the section entirely at L1. An absent section passes the gate; a present-but-empty one fails. Task Breakdown rows implement the Gherkin scenarios in §2.1; no row is written for an axis marked F.
§4 Quality Gates: Minimum test expectations + Definition of Done checklist.
Output location: .cleargate/delivery/pending-sync/{ID}_{SLUG}.md

Document Hierarchy Position: LEVEL 2 (Proposal → Epic → Story)

Complexity Labels:
L1: Trivial — Single file, <1hr, known pattern
L2: Standard — 2-3 files, known pattern, ~2-4hr (default)
L3: Complex — Cross-cutting, spike may be needed, ~1-2 days
L4: Uncertain — Requires probing/spiking, >2 days

Granularity Rubric (run this check BEFORE emitting a story during epic-decomposition):
A candidate story is **too small** — file a CR or submit the PR directly — if ANY signal trips:
  • Could this be a config change, a parameter addition, or a one-line edit? If yes, this is not a Story.
  • The change touches one already-existing function/class and the diff fits in <30 LOC.
  • The work amounts to renaming, formatting, or moving without behavior change.
A candidate story is too big — emit two stories instead, with consecutive IDs (e.g. STORY-007-03 and STORY-007-04, never 03a/03b) — if ANY signal trips:
  • §1.2 Detailed Requirements joins unrelated user goals with "and also" / "additionally".
  • §2.1 Gherkin would need >5 scenarios covering unrelated behaviors.
  • §3.1 Files-to-touch span unrelated subsystems (e.g. API + UI + migration in one story).
  • Complexity would land at L4 (>2 days). L4 is a planning smell — split, or carve out a SPIKE to bound the discovery first.
  • `complexity_label: L3` AND `expected_bounce_exposure: high`. L3+high consistently hits developer-agent wall-time limits (observed in SPRINT-09 on STORY-013-02/03/04, all Sonnet 4.6 stream-timeouts). Split into two L2 stories OR escalate the single L3 to Opus at dispatch — the decomposition default is to split.
When a too-big signal trips, split along one SPIDR axis: Paths → one story per path, happy path first; Interfaces → one story per interface, cheapest first; Data → simplest data subset first; Rules → ship with the rule relaxed, add it in the follow-up.
Also split the inverse: two candidate stories that each touch the same 1-2 files with overlapping scenarios should merge into one L1/L2.
At epic-decomposition time there are no remote IDs yet — splits and merges are free. Prefer two focused L1/L2 stories over one L3. Prefer L3 over L4.
When the rubric is ambiguous, surface the decision to the human as a one-liner ("candidate covers A+B — split into X and Y?") rather than guessing.

Performance inheritance (run during epic-decomposition):
  If the parent Epic's §3 Reality Check carries a populated Performance row AND this story's scope
  touches that budget, restate the budget in §2.1 as a Gherkin `Then` clause and add the matching
  row to §4.1 Minimum Test Expectations. A budget that stays in the Epic never reaches the agent
  writing the code, and prose that QA does not diff is decorative — §2.1 is the only landing spot
  QA-Verify actually checks.
  If the parent Epic omits the Performance row, this story states nothing. Do not invent a budget.

§0.1 v2 Decomposition Signals:
  `parallel_eligible`: "y" if this story can run concurrently with other stories in the same milestone; "n" if it has a strict predecessor dependency. Default "y". Set by Architect during Sprint Design Review.
  `expected_bounce_exposure`: "low" | "med" | "high" — predicted re-work risk derived from §2.1 scenario count + §3 file-count + ambiguity level. Default "low". Set by Architect. Used by orchestrator to sequence high-exposure stories before low-exposure ones to surface risk early.
  `lane`: "standard" | "fast" — Architect-set during Sprint Design Review per the seven-check rubric in cleargate-enforcement.md §9. Default "standard". Absent in pre-EPIC-022 stories means standard per the migration default in update_state.mjs.
  All three fields are always-on signals; defaults apply for stories authored before SPRINT-09.

POST-WRITE BRIEF
After Writing this document, render a Brief in chat with the following sections,
mechanically extracted from the document's own structure:

  - Prior work    ← cleargate-wiki-query result (cite [[IDs]] or write "none found")
  - Summary        ← §1.1 User Story
  - Open Questions ← §1.4 Open Questions
  - Edge Cases     ← §2.1 Gherkin error scenarios
  - SPIDR          ← §2.1 SPIDR coverage table
  - Risks          ← §1.5 Risks
  - Ambiguity      ← bottom-of-doc ambiguity gate block

Halt for human review. When ambiguity reaches 🟢, proceed to call cleargate_push_item.
Do NOT ask separately for push confirmation — Brief approval covers it.

Do NOT output these instructions.
</instructions>

---
story_id: "{ID}"
parent_epic_ref: "{PARENT_EPIC_ID}"
parent_cleargate_id: null  # canonical cleargate-id of parent work item; null for top-level
sprint_cleargate_id: null  # canonical cleargate-id of owning sprint; null for off-sprint items
carry_over: false  # set true to skip lifecycle reconciliation at sprint close
status: "Draft"  # lifecycle: Draft → In Review → Completed
approved: false
ambiguity: "🔴 High"
context_source: "approved Epic / verified codebase grounding + recorded direct approval"
actor: "{Persona Name}"
complexity_label: "L2"
parallel_eligible: "y"
expected_bounce_exposure: "low"
lane: "standard"
db_write_set: []  # advisory-v1 (EPIC-033 wave-planner axis 4): list table names this story writes to; default [] = no DB collision contribution; absent treated as [] by architect-synth predicate
deferred_verification: []  # optional. Heavy checks owed, run post-merge. Each: { description: <human string>, command: <shell, run from repo root>, blocks: close }. Absent/empty = no obligation (common case; fully backward-compatible).
created_at: "2026-04-17T00:00:00Z"
updated_at: "2026-04-17T00:00:00Z"
created_at_version: "strategy-phase-pre-init"
updated_at_version: "strategy-phase-pre-init"
server_pushed_at_version: null
draft_tokens:
  input: null
  output: null
  cache_read: null
  cache_creation: null
  model: null
  sessions: []
cached_gate_result:
  pass: null
  failing_criteria: []
  last_gate_check: null
# Sync attribution. Optional; stamped by `cleargate push` / `cleargate pull`.
pushed_by: null            # set by push: which user pushed
pushed_at: null            # set by push: ISO-8601 timestamp
last_pulled_by: null       # set by pull: which user pulled
last_pulled_at: null       # set by pull: ISO-8601 timestamp
last_remote_update: null   # set by pull: server's last-modified timestamp
source: "local-authored"   # flips to "remote-authored" on intake
last_synced_status: null   # required for conflict-detector; status at last sync
last_synced_body_sha: null # sha256 of body at last sync
---

# {ID}: {Story Name}
**Complexity:** {L1/L2/L3/L4} — {brief description}

## 1. The Spec (The Contract)

### 1.1 User Story
As a {Persona}, I want to {Action}, so that {Benefit}.

### 1.2 Detailed Requirements
- Requirement 1: {Specific behavior}
- Requirement 2: {Specific data or constraint}

### 1.3 Out of Scope
{What this story explicitly does NOT do.}

### 1.4 Open Questions

> Resolve every entry before flipping ambiguity to 🟢. Each entry pairs a question with a recommended answer.

- **Question:** {edge case, contradiction, or missing detail surfaced during drafting}
- **Recommended:** {agent's proposed answer}
- **Human decision:** {populated during Brief review}

### 1.5 Risks

> Risks specific to this Story (cross-story risks belong in the milestone plan).

- **Risk:** {what could go wrong}
- **Mitigation:** {agent's proposed mitigation}

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.** One row per axis. `T` = at least one scenario below carries the axis tag
(`@paths`, `@interfaces`, `@data`, `@rules`). `F` = no scenario carries it, and the row states
why. There is no Spike row: open discovery is chartered as a SPIKE item (`templates/spike.md`)
before this item is written.

| Axis | Cover | Reason |
|---|---|---|
| Paths | {T or F} | {…} |
| Interfaces | {T or F} | {…} |
| Data | {T or F} | {…} |
| Rules | {T or F} | {…} |

```gherkin
Feature: {Story Name}

  Scenario: {Happy Path}
    Given {precondition}
    When {user action}
    Then {system response}

  Scenario: {Error — invalid action is rejected}
    Given {precondition}
    When {invalid action}
    Then {error message}
```

### 2.2 Verification Steps (Manual)
- [ ] {e.g., "Verify API returns 200 for valid input"}
- [ ] {e.g., "Verify UI renders correctly on mobile"}

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `{filepath/to/main/component.ts}` |
| Related Files | `{filepath/to/api/service.ts}`, `{filepath/to/types.ts}` |
| New Files Needed | Yes/No — {Name of file} |

### 3.2 Technical Logic
{Describe the logic flow, e.g., "Use the existing useAuth hook to check permissions."}

### 3.3 API Contract (if applicable)

| Endpoint | Method | Auth | Request Shape | Response Shape |
|---|---|---|---|---|
| `/api/resource` | GET/POST | Bearer/None | `{ id: string }` | `{ status: string }` |

## Task Breakdown

> **Required at L3 and above. Optional at L2. Omit the whole section at L1.**
> An absent section passes the gate; a section that is present but carries no task rows does not.
> Write one row per executable step, in execution order:
> `- [ ] <action>` with an optional trailing `-> <requirement-id>`. The requirement reference is
> reserved for grounding ids and is not interpreted today.

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | {N} | {e.g., "1 per exported function"} |
| Integration tests | {N} | {e.g., "1 per *.integration.node.test.ts scenario — real Postgres/Redis, no mocks"} |
| E2E / acceptance tests | {N} | {e.g., "1 per Gherkin scenario in §2.1"} |
| Performance test *(if applicable)* | {N} | Required only when the parent Epic states a budget and §2.1 carries it as a `Then` clause. Name the measurement method and the baseline. Delete this row when the Epic states no budget. |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

> L1 reuse audit. List source-tree implementations the request could extend. Cite file:line.
> Cite paths with at least one '/' separator; root files use './name.ext'. Bare filenames and dotted code references are ignored.

- **Surface:** `path/to/file.ext:NN` — {what it does}
- **Coverage of this requirement:** {≥80% / partial / none — and why}

## Prior work

> Duplicate-check evidence, enforced by the `prior-work-recorded` readiness predicate.
> Paste the `cleargate-wiki-query` result here: link each related item as a wiki-style
> reference, or replace the line below with an explicit empty-result sentinel.
> Accepted sentinels are listed in readiness-gates.md (Predicate Vocabulary entry 8).

- <replace with related-work wikilinks, or an explicit empty-result sentinel>

## Why not simpler?

> L2 / L3 right-size + justify-complexity. Answer both.

- **Smallest existing surface that could carry this:** {citation or "none — net-new abstraction required"}
- **Why isn't extension / parameterization / config sufficient?** {one paragraph}

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🔴 High Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [ ] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [ ] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding.
- [ ] No "TBDs" exist anywhere in the specification or technical logic.
- [ ] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [ ] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").

