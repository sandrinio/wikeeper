# Mid-Sprint Triage Rubric

**CR-047 · SPRINT-23 · Authoritative Reference**

This document is the authoritative rubric for classifying mid-sprint user input. It complements the operational routing table in SKILL.md §C.10 (new rubric section). Read this doc to understand *why* a class exists; read SKILL.md §C.11 (post-CR-047 renumber) to see *how* routing works in practice.

---

## Overview

When a user injects input during an active sprint (between story kickoff and story merge), the orchestrator must classify it before routing. Unclassified input leads to either silent scope creep or unnecessary story restarts. The four classes below are mutually exclusive and exhaustive.

**Classifier aid:** Classification is a keyword-heuristic rubric step — match the user's input against the keyword banks below (see also protocol §2 Classification Table) to arrive at a first-pass class. Output is advisory — the orchestrator confirms before acting. A low-confidence match (no keyword bank matches cleanly) always requires human verification.

---

## Class 1: Bug

**Definition:** The user reports that existing implemented behaviour is incorrect, broken, or regressed against the current story's acceptance spec. A bug does NOT introduce new requirements — it identifies a gap between the spec and the actual behaviour.

**Keywords (heuristic):** broken, crashes, doesn't work, does not work, regression, nothing works, not working, failed, failure, error, exception, bug, defect, broke.

**Boundary cases:**
- "The button is broken" → Bug (existing behaviour broken vs spec).
- "The button should also glow" → NOT Bug; this is Scope Change (new requirement).
- "After the deploy nothing works" → Bug (regression language).

**Worked examples:**

1. "The login button is broken — it throws a 500 error instead of returning 401."
   → Class: Bug · Route: re-open story, Dev fixes, QA re-verifies.

2. "After the deploy the email sending stopped working."
   → Class: Bug · Route: same as above.

**Routing rules:**

- Increment `qa_bounces` via `update_state.mjs <story-id> --qa-bounce`.
- Re-open the story; Developer fixes; QA re-verifies (full loop).
- Log in sprint §4 Execution Log: date + story ID + one-line description.
- Human approval: NOT required (orchestrator routes autonomously).

**Bounce-counter impact:** `qa_bounces++`. If `qa_bounces ≥ 3` → `Escalated`, halt.

---

## Class 2: Spec Clarification

**Definition:** The user asks a question or requests clarification about an existing requirement without adding new scope. The story's acceptance Gherkin remains unchanged after the clarification — at most, ambiguous language in §1.2 gets updated in place.

**Keywords (heuristic):** what does, what is, clarify, clarification, is the same as, the same as, same as, mean in, mean by, what do you mean, does it include, is this, should it.

**Boundary cases:**
- "What does 'eligible' mean in §3?" → Clarification (no new scope).
- "Is 'merged' the same as 'closed'?" → Clarification (terminology disambiguation).
- "What does 'eligible' mean — and should we also check for X?" → SPLIT: Clarification + Scope Change. Handle separately.

**Worked examples:**

1. "What does 'eligible' mean in the eligibility check requirement?"
   → Class: Clarification · Update §1.2 with the answer; no story restart.

2. "Is 'merged' the same as 'closed' for the purposes of the state machine?"
   → Class: Clarification · Add a definition note; no counter impact.

**Routing rules:**

- No counter increment.
- Update §1.2 (Acceptance Criteria) in place with the clarified definition.
- Re-run only the impacted test(s) (not full loop).
- Log in sprint §4 Execution Log: date + story ID + one-line clarification.
- Human approval: NOT required for terminology clarifications. Required if the clarification reveals a spec gap (surface to human before updating §1.2).

**Bounce-counter impact:** None.

---

## Class 3: Scope Change

**Definition:** The user introduces a net-new requirement that was not in the original story spec. Even if "obvious" or "related", if the Gherkin would need a new scenario, it is Scope Change.

**Keywords (heuristic):** also need, we also need, plus add, additionally, new requirement, add a, add an, plus, as well, in addition, new feature, extend with.

**Boundary cases:**
- "We also need a CSV export" → Scope Change (new feature).
- "Plus add audit logging" → Scope Change (additional requirement).
- "The export is broken" → NOT Scope Change; this is Bug.

**Worked examples:**

1. "We also need a CSV export alongside the existing JSON export."
   → Class: Scope Change · Quarantine into new story in `pending-sync/`. Current story unchanged.

2. "Plus add audit logging for all admin actions."
   → Class: Scope Change · Same quarantine routing.

**Routing rules:**

- **Quarantine by default.** Create a new Story file in `.cleargate/delivery/pending-sync/` for the next sprint.
- Current story proceeds UNCHANGED.
- **Goal-critical override:** if the new requirement is critical to the active sprint goal, escalate to human: *"This scope-change is goal-critical: the sprint goal is `<verbatim>` and without this change, the goal will not be met. Add to current sprint? (Adding mid-sprint requires explicit ack.)"*
- Log in sprint §4 Execution Log: date + new story ID + one-line description.
- Human approval: REQUIRED for mid-sprint addition; NOT required for quarantine.

**Bounce-counter impact:** None (quarantine path). If mid-sprint addition approved: treat as a new story dispatch (all counters reset for the new story).

---

## Class 4: Approach Change

**Definition:** The user proposes a different implementation technique or technology for the same spec. The acceptance Gherkin remains identical — only the *how* changes, not the *what*.

**Keywords (heuristic):** instead of, switch to, different way, different approach, replace with, rather than, alternative, migrate to.

**Boundary cases:**
- "Instead of polling, switch to websockets" → Approach Change (same behaviour spec, different mechanism).
- "Switch to Postgres instead of Redis for invite storage" → Approach Change (storage backend, same API).
- "Instead of storing invites, delete them" → NOT Approach Change; this is Scope Change (spec changes).

**Worked examples:**

1. "Instead of polling the API every 5 seconds, switch to websockets for real-time updates."
   → Class: Approach Change · No counter; reset Developer context; re-spawn with updated approach note.

2. "Use a different algorithm — BFS instead of DFS for the graph traversal."
   → Class: Approach Change · Same routing.

**Routing rules:**

- No counter increment.
- Reset Developer context (re-spawn Developer with the updated approach in the dispatch prompt).
- Story Gherkin and acceptance criteria remain UNCHANGED.
- Log in sprint §4 Execution Log: date + story ID + one-line approach delta.
- Human approval: NOT required if the approach is technically equivalent. Required if the approach change affects cost, timeline, or cross-story surfaces.

**Bounce-counter impact:** None.

---

## Routing Summary Table

| Class | Trigger | Counter | Human Approval | Routing Action |
|---|---|---|---|---|
| Bug | Defect vs spec | `qa_bounces++` | No | Re-open story; Dev fix; QA re-verify |
| Spec Clarification | Ambiguity question | None | No (yes if spec gap) | Update §1.2 in place; re-run impacted test |
| Scope Change | Net-new requirement | None | YES for mid-sprint add | Quarantine to next sprint (default); escalate if goal-critical |
| Approach Change | Different impl, same spec | None | No (yes if cross-story impact) | Reset Dev context; re-spawn with updated approach |

---

## Cross-References

- **SKILL.md §C.10** — NEW Mid-Sprint Triage section (operational routing table, added by CR-047).
- **SKILL.md §C.11** — Mid-cycle User Input table (pre-CR-047 §C.10; renumbered to §C.11 by this CR).
- **SKILL.md §C.3.5** — TPV Gate (Architect-only wiring check between QA-Red and Developer).

---

_This document is append-only. Add new examples or boundary cases at the bottom of the relevant class block. Do not restructure class ordering — it matches the classifier priority (bug → approach → scope → clarification)._
