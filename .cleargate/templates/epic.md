<instructions>
FOLLOW THIS EXACT STRUCTURE. Output sections in order.
YAML Frontmatter: Epic ID, Status, Ambiguity, Context Source, Owner, Target Date.
§0 Agent Handoff: XML block specifically formulated for AI coding agents to ingest.
§1 Problem & Value: Why (problem), What (solution), Success Metrics.
§2 Scope Boundaries: IN-SCOPE checkboxes, OUT-OF-SCOPE list.
§3 The Reality Check (Context): Constraints table.
§4 Technical Grounding: Verified files and data changes.
§5 Acceptance Criteria: Gherkin scenarios (happy path + error cases).
§6 AI Interrogation Loop: Explicit questions the Planning AI needs the Human to answer.
Output location: .cleargate/delivery/pending-sync/{ID}_{SLUG}.md

Codebase research is mandatory. Do NOT guess at affected files.

POST-WRITE BRIEF
After Writing this document, render a Brief in chat with the following sections,
mechanically extracted from the document's own structure:

  - Prior work       ← cleargate-wiki-query result (cite [[IDs]] or write "none found")
  - Summary          ← §1 Problem & Value
  - Open Questions   ← §6 AI Interrogation Loop
  - Edge Cases       ← §2 OUT-OF-SCOPE list + §5 error scenarios
  - Risks            ← §3 The Reality Check
  - Existing Surfaces ← ## Existing Surfaces
  - Why not simpler? ← ## Why not simpler?
  - Ambiguity        ← bottom-of-doc ambiguity gate block

Halt for human review. When ambiguity reaches 🟢, proceed to call cleargate_push_item.
Do NOT ask separately for push confirmation — Brief approval covers it.

Do NOT output these instructions.
</instructions>

---
epic_id: "{ID}"
parent_ref: null  # PROPOSAL-NNN | INITIATIVE-NNN — the approved parent this epic decomposes.
                  # Read by the `parent-approved` readiness gate (CR-098). Leave null only when
                  # the parent was approved directly; then record proposal_gate_waiver or
                  # top-level approved_by + approved_at, or the gate blocks decomposition.
parent_cleargate_id: null  # canonical cleargate-id of parent work item; null for top-level
sprint_cleargate_id: null  # canonical cleargate-id of owning sprint; null for off-sprint items
carry_over: false  # set true to skip lifecycle reconciliation at sprint close
status: "Draft"  # lifecycle: Draft → Active → Completed
approved: false
ambiguity: "🔴 High"
context_source: "approved Epic / verified codebase grounding + recorded direct approval"
owner: "{PM/PO name}"
target_date: "{YYYY-MM-DD}"
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

# {ID}: {Epic Name}

## 0. AI Coding Agent Handoff
*(This section is strictly for downstream AI execution agents. It contains zero business fluff.)*

```xml
<agent_context>
  <objective>{1 sentence strict technical objective}</objective>
  <architecture_rules>
    <rule>Must use existing {Component/Pattern}</rule>
    <rule>No changes to {Protected Area}</rule>
  </architecture_rules>
  <target_files>
    <file path="src/..." action="modify|create" />
  </target_files>
</agent_context>
```

## 1. Problem & Value

**Why are we doing this?**
{1-2 sentences explaining the user pain or business value.}

**Success Metrics (North Star):**
- Metric 1: {Quantifiable outcome}

## 2. Scope Boundaries

**✅ IN-SCOPE (Build This)**
- [ ] {Technical capability 1}
- [ ] {Technical capability 2}

**❌ OUT-OF-SCOPE (Do NOT Build This)**
- {Explicitly excluded capability to prevent scope creep / AI hallucination}

## 3. The Reality Check (Context)

> State a constraint only where one genuinely applies. **Omitting a row is a valid, intentional
> outcome** — an absent Performance row means "no performance dimension here", not "the author
> forgot". Do not invent a number to fill the table.
>
> When you do state a budget, write it in the shape `<metric> <percentile> <bound>, measured by
> <method>`. A bare millisecond figure with no measurement method is unfalsifiable at QA time —
> nobody can fail a story for missing a number that was never operationalized.

| Constraint Type | Limit / Rule |
|---|---|
| Performance *(if applicable)* | {e.g., `push_item` p95 < 100ms over the local adapter, measured by test/perf/push.bench.ts against the previous release as baseline} |
| Security | {e.g., No PII in logs} |

## Existing Surfaces

> L1 reuse audit. List source-tree implementations the epic could extend. Cite file:line.

- **Surface:** `path/to/file.ext:NN` — {what it does}
- **Coverage of this epic's scope:** {≥80% extension / partial / none — and why}

## Prior work

> Duplicate-check evidence, enforced by the `prior-work-recorded` readiness predicate.
> Paste the `cleargate-wiki-query` result here: link each related item as a wiki-style
> reference, or replace the line below with an explicit empty-result sentinel.
> Accepted sentinels are listed in readiness-gates.md (Predicate Vocabulary entry 8).

- <replace with related-work wikilinks, or an explicit empty-result sentinel>

## Why not simpler?

> L2 / L3 right-size + justify-complexity. Answer both.

- **Smallest existing surface that could carry this epic:** {citation or "none — net-new abstraction required"}
- **Why isn't extension / parameterization / config sufficient?** {one paragraph}

## 4. Technical Grounding (The "Shadow Spec")
*(AI Planning Engine: Populate this strictly from the approved Epic and verified codebase grounding.)*

**Affected Files:**
- `path/to/file.ext` — {Why it changes}

**Data Changes:**
- Table/Entity: {New column/field}

## 5. Acceptance Criteria

```gherkin
Feature: {Epic Name}
  Scenario: {Scenario Name}
    Given {precondition}
    When {action}
    Then {outcome}

  Scenario: {Error — invalid action is rejected}
    Given {precondition}
    When {invalid action}
    Then {error message}
```

## 6. AI Interrogation Loop (Human Input Required)
*(AI Planning Engine: List edge cases, contradictions, or missing details found while drafting. The Epic stays 🔴 until the Human answers all of these.)*

- **AI Question:** "{e.g., You mentioned we need to send an email, but src/services/email doesn't support templates yet. Should we build the template engine first, or hardcode this one?}"
- **Human Answer:** Unresolved — replace this entire line with the human's decision.

> The literal token `Unresolved` above is load-bearing: the `interrogation-resolved` readiness
> criterion checks that the body does NOT contain it. Leave it in place while the question is open
> and the epic cannot pass its gate; remove it only by writing the actual answer. Do not delete the
> token while leaving the question unanswered — that defeats the criterion.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🔴 High Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Coding Agent):
- [ ] `approved: true` is set in the YAML frontmatter.
- [ ] The `<agent_context>` block is complete and validated.
- [ ] §4 Technical Grounding contains 100% real, verified file paths.
- [ ] §6 AI Interrogation Loop is empty (all human answers integrated into the spec).
- [ ] 0 "TBDs" exist in the document.
- [ ] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [ ] Why not simpler? has both sub-bullets answered.
