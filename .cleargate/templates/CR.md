<instructions>
FOLLOW THIS EXACT STRUCTURE. Output sections in order 1-4.
YAML Frontmatter: CR ID, Parent Ref (Epic or Story being changed), Status, Approved gate.
Use this template when CHANGING an existing feature. For net-new functionality, use story.md instead.
§1 The Context Override: What to remove/forget + the new truth. AI agents hallucinate when old context conflicts with new requests.
§2 Blast Radius & Invalidation: Which downstream items does this CR break? A CR acts as a "Gate Reset" on affected items.
§3 Execution Sandbox: Exact file paths to modify.
Task Breakdown: one `- [ ] <action>` row per executable step, in execution order. REQUIRED at L3 and above, optional at L2, omit the section entirely at L1. An absent section passes the gate; a present-but-empty one fails. Task Breakdown rows implement the Gherkin scenarios in §4; no row is written for an axis marked F.
§4 Verification Protocol: How to confirm new logic works and old logic is fully evicted. §4 also carries a SPIDR coverage table (axes: Paths, Interfaces, Data, Rules) above a Gherkin block. Paths = more than one *successful* way through (the baseline error scenario is not a path). Interfaces = more than one surface exposes the behaviour (CLI / API / UI / hook). Data = behaviour differs by data type, shape or volume — usually a Scenario Outline with Examples. Rules = a business rule constrains the outcome — one scenario per rule, including breaking it. Tag each covered scenario with the matching `@paths` / `@interfaces` / `@data` / `@rules` marker directly above `Scenario:` / `Scenario Outline:`. There is no Spike row: open discovery is chartered as a SPIKE item before this CR is written.
Output location: .cleargate/delivery/pending-sync/{ID}_{SLUG}.md

POST-WRITE BRIEF
After Writing this document, render a Brief in chat with the following sections,
mechanically extracted from the document's own structure:

  - Prior work    ← cleargate-wiki-query result (cite [[IDs]] or write "none found")
  - Summary        ← §1 The Context Override
  - Open Questions ← §0.5 Open Questions
  - Edge Cases     ← §2 Blast Radius & Invalidation
  - SPIDR          ← §4 Verification Protocol (SPIDR coverage table)
  - Risks          ← §2 Blast Radius (downstream invalidation = risk)
  - Ambiguity      ← bottom-of-doc ambiguity gate block

Halt for human review. When ambiguity reaches 🟢, proceed to call cleargate_push_item.
Do NOT ask separately for push confirmation — Brief approval covers it.

Do NOT output these instructions.
</instructions>

---
cr_id: "{ID}"
parent_ref: "EPIC-NNN | STORY-NNN-NN"
parent_cleargate_id: null  # canonical cleargate-id of parent work item; null for top-level
sprint_cleargate_id: null  # canonical cleargate-id of owning sprint; null for off-sprint items
carry_over: false  # set true to skip lifecycle reconciliation at sprint close
status: "Draft | In Review | Approved | Completed"
approved: false
context_source: "approved Epic / verified codebase grounding + recorded direct approval"
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

# {ID}: {Change Request Name}

## 0.5 Open Questions

> Populate during drafting. Resolve every entry before flipping ambiguity to 🟢.

- **Question:** {edge case, contradiction, or missing detail}
- **Recommended:** {agent's proposed answer}
- **Human decision:** {populated during Brief review}

## 1. The Context Override (Old vs. New)
*(AI agents hallucinate when old context conflicts with new requests. Explicitly declare what to evict.)*

**Obsolete Logic (What to Remove / Forget):**
- {e.g., We no longer use Stripe for this flow.}

**New Logic (The New Truth):**
- {e.g., Route all payments through PayPal.}

## 2. Blast Radius & Invalidation
*(A CR acts as a "Gate Reset" — all affected downstream items revert to 🔴 High Ambiguity.)*

- [ ] Invalidate/Update Story: [Link]
- [ ] Invalidate/Update Epic: [Link]
- [ ] Database schema impacts? {Yes/No — describe}

## Existing Surfaces

> L1 reuse audit. List source-tree implementations this CR extends or modifies. Cite file:line.
> Cite paths with at least one '/' separator; root files use './name.ext'. Bare filenames and dotted code references are ignored.

- **Surface:** `path/to/file.ext:NN` — {what it does today}
- **Why this CR extends rather than rebuilds:** {one paragraph — required when the change names a capability that already exists somewhere in the tree}

## Prior work

> Duplicate-check evidence, enforced by the `prior-work-recorded` readiness predicate.
> Paste the `cleargate-wiki-query` result here: link each related item as a wiki-style
> reference, or replace the line below with an explicit empty-result sentinel.
> Accepted sentinels are listed in readiness-gates.md (Predicate Vocabulary entry 8).

- <replace with related-work wikilinks, or an explicit empty-result sentinel>

## 3. Execution Sandbox
*(Restrict the agent's scope to prevent unrelated refactoring.)*

**Modify:**
- `src/...`

## Task Breakdown

> **Required at L3 and above. Optional at L2. Omit the whole section at L1.**
> An absent section passes the gate; a section that is present but carries no task rows does not.
> Write one row per executable step, in execution order:
> `- [ ] <action>` with an optional trailing `-> <requirement-id>`. The requirement reference is
> reserved for grounding ids and is not interpreted today.

## 4. Verification Protocol
*(How do we confirm new logic works and old logic is completely removed?)*

**Command/Test:** `npm test ...`

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
Feature: {Change Request Name}

  Scenario: {New logic holds}
    Given {precondition}
    When {action under new logic}
    Then {expected new behavior}

  Scenario: {Obsolete logic is gone}
    Given {precondition}
    When {action that used to trigger old logic}
    Then {old behavior no longer occurs}
```

**Test layers.** Declare all three below. `0` is a valid, explicit answer and must carry a reason in the Notes column; an absent row is not a decision.

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | {N} | {e.g., "1 per changed function"} |
| Integration tests | {N} | {e.g., "1 per *.integration.node.test.ts scenario — real Postgres/Redis, no mocks"} |
| E2E / acceptance tests | {N} | {e.g., "1 per Gherkin scenario"} |

---

## Context Source

> Discovery audit. Populated from the approved Epic, verified codebase grounding, and recorded direct approval.

**context_source:** {approved Epic / verified codebase grounding + recorded direct approval}

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🔴 High Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [ ] "Obsolete Logic" to be evicted is explicitly declared.
- [ ] All impacted downstream Epics/Stories are identified and reverted to 🔴 High Ambiguity.
- [ ] Execution Sandbox contains exact file paths.
- [ ] Verification command is provided.
- [ ] `approved: true` is set in the YAML frontmatter.
- [ ] Existing Surfaces cites at least one source-tree path the CR extends.
