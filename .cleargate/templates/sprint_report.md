---
sprint_id: "SPRINT-NN"
status: "Draft"
generated_at: "<ISO-8601>"
generated_by: "Reporter agent"
template_version: 2
---

<!-- Sprint Report v2 Template — template_version: 2 -->
<!-- Event-type vocabulary (STORY-013-05 / protocol §§2–17):
     User-Review: UR:review-feedback | UR:bug
     Change-Request: CR:bug | CR:spec-clarification | CR:scope-change | CR:approach-change
     Circuit-breaker: test-pattern | spec-gap | environment
     Lane-Demotion: LD
     These tokens appear verbatim in §2 CR Change Log and §3 Execution Metrics tallies. -->

# SPRINT-<NN> Report: <Sprint Title>

**Status:** Shipped | Partial | Blocked
**Window:** YYYY-MM-DD to YYYY-MM-DD (N calendar days)
**Stories:** N planned / M shipped / K carried over

---

## §1 What Was Delivered

### User-Facing Capabilities
<!-- One bullet per user-visible outcome, grouped by business goal. Do NOT list stories here. -->
- <capability>

### Internal / Framework Improvements
<!-- Infrastructure, tooling, or agent-contract changes not visible to end users. -->
- <improvement>

### Carried Over
<!-- Stories that did not reach Done/Escalated/Parking Lot. If none, state "None." -->
- None

---

## §2 Story Results + CR Change Log

<!-- One block per story. For bounces, list each round-trip as a CR event with the exact token.
     CR event types: CR:bug | CR:spec-clarification | CR:scope-change | CR:approach-change
     UR event types: UR:review-feedback | UR:bug
     Each CR:bug and UR:bug counts toward Bug-Fix Tax (§3). CR:scope-change increments arch_bounces. -->

### STORY-NNN-NN: <Title>
- **Status:** Completed | Escalated | Parking Lot | Carried Over
- **Complexity:** L<n>
- **Commit:** `<sha>`
- **Bounce count:** qa=N arch=N total=N
- **CR Change Log:**
  | # | Event type | Description | Counter delta |
  |---|---|---|---|
  | 1 | CR:bug | <description> | qa_bounces +1 |
- **UR Events:**
  | # | Event type | Feedback | Tax impact |
  |---|---|---|---|
  | 1 | UR:review-feedback | <feedback> | none (enhancement) |

---

## §3 Execution Metrics

<!-- Tallies use the locked event-type vocabulary:
     Bug-Fix Tax = (CR:bug count + UR:bug count) / total story count × 100
     Enhancement Tax = UR:review-feedback count / total story count × 100
     First-pass success rate = stories with qa_bounces=0 AND arch_bounces=0 / total stories × 100
     Token divergence: compare ledger-primary vs task-notification-tertiary; flag if delta >20% -->

| Metric | Value |
|---|---|
| Stories planned | N |
| Stories shipped (Done) | N |
| Stories escalated | N |
| Stories carried over | N |
| Fast-Track Ratio | N% |
| Fast-Track Demotion Rate | N% |
| Hotfix Count (sprint window) | N |
| Hotfix-to-Story Ratio | N |
| Hotfix Cap Breaches | N |
| LD events | N |
| Total QA bounces | N |
| Total Arch bounces | N |
| CR:bug events | N |
| CR:spec-clarification events | N |
| CR:scope-change events | N |
| CR:approach-change events | N |
| UR:bug events | N |
| UR:review-feedback events | N |
| Circuit-breaker fires: test-pattern | N |
| Circuit-breaker fires: spec-gap | N |
| Circuit-breaker fires: environment | N |
| **Bug-Fix Tax** | N% |
| **Enhancement Tax** | N% |
| **First-pass success rate** | N% |
| Token source: ledger-primary | N tokens |
| Token source: story-doc-secondary | N tokens |
| Token source: task-notification-tertiary | N tokens |
| Token divergence (ledger vs task-notif) | N% |
| Token divergence flag (>20%) | YES / NO |

---

## §4 Observe Phase Findings

> Populated from sprint plan §4 Execution Log entries dated within the Observe window
> [last-story-merge-timestamp, sprint-close-timestamp]. Reporter date-filters and groups by event type.
>
> SKIP THIS SECTION ENTIRELY (no header, no body) if all three subsections are empty.
> Output a single line in its place: "Observe phase: no findings."

### 4.1 Bugs Found (UR:bug)
| Date | Description | Resolution | Commit |

### 4.2 Hotfixes Triggered
| ID | Trigger | Resolution | Commit |

### 4.3 Review Feedback (UR:review-feedback)
| Date | Description | Status (folded / deferred) | Deferred to / Rationale |

---

## §5 Lessons

<!-- Flashcards added during this sprint window, grouped by tag.
     Preserve the stale-detection pass from reporter.md §5b — stale-candidate symbols
     from each card are surfaced here for human approval. Do NOT modify FLASHCARD.md. -->

### New Flashcards (Sprint Window)

| Date | Tags | Lesson |
|---|---|---|
| YYYY-MM-DD | #tag | <lesson> |

### Flashcard Audit (Stale Candidates)
<!-- For each active card with no [S]/[R] marker, symbols extracted and grepped.
     Candidates below have ALL extracted symbols absent from the current repo. -->

| Card (date · lead-tag · lesson head) | Missing symbols | Proposed marker |
|---|---|---|

If zero candidates: No stale flashcards detected.

### Supersede Candidates
<!-- Newer cards whose lesson directly contradicts an older card's advice. -->

| Newer card | Older card | Proposed marker for older |
|---|---|---|

---

## §6 Framework Self-Assessment

<!-- Rate each dimension: Green (working well) / Yellow (friction) / Red (blocking).
     "Tooling" subsection MUST include token-divergence finding if §3 divergence flag = YES. -->

### Templates
| Item | Rating | Notes |
|---|---|---|
| Story template completeness | Green/Yellow/Red | |
| Sprint Plan Template usability | Green/Yellow/Red | |
| Sprint Report template (this one) | Green/Yellow/Red | |

### Handoffs
| Item | Rating | Notes |
|---|---|---|
| Architect → Developer brief quality | Green/Yellow/Red | |
| Developer → QA artifact completeness | Green/Yellow/Red | |
| QA → Orchestrator kickback clarity | Green/Yellow/Red | |

### Skills
| Item | Rating | Notes |
|---|---|---|
| Flashcard gate adherence | Green/Yellow/Red | |
| Adjacent-implementation reuse rate | Green/Yellow/Red | |

### Process
| Item | Rating | Notes |
|---|---|---|
| Bounce cap respected | Green/Yellow/Red | |
| Three-surface landing compliance | Green/Yellow/Red | |
| Circuit-breaker fires (if any) | Green/Yellow/Red | |

### Lane Audit
<!-- Filled by Reporter at sprint close. One row per fast-lane story. -->

| Story | Files touched | LOC | Demoted? | In retrospect, was fast correct? (y/n) | Notes |
|---|---|---|---|---|---|
| `STORY-NNN-NN` | N | N | y / n | y / n | |

### Hotfix Audit
<!-- Filled by Reporter at sprint close. One row per hotfix merged during the sprint window. -->

| Hotfix ID | Originating signal | Files touched | LOC | Resolved-by SHA | Could this have been a sprint story? (y/n) | If y — why was it missed at planning? |
|---|---|---|---|---|---|---|
| `HOTFIX-NN` | <signal> | N | N | `<sha>` | y / n | |

### Hotfix Trend
<!-- Filled by Reporter at sprint close. -->

<!-- TBD: Reporter fills at sprint close -->

<Reporter writes a one-paragraph narrative summarising the rolling 4-sprint hotfix count
and a monotonic-increase flag (yes/no). Empty by default — leave the placeholder text
intact for sprints with no hotfixes.>

### Tooling
| Item | Rating | Notes |
|---|---|---|
| run_script.sh diagnostic coverage | Green/Yellow/Red | |
| Token ledger completeness | Green/Yellow/Red | |
| Token divergence finding | Green/Yellow/Red | If §3 divergence >20%: Red — ledger=N task-notif=N delta=N% |

---

## §7 Change Log

<!-- Append one line per material revision to this report after initial generation. -->

| Date | Author | Change |
|---|---|---|
| YYYY-MM-DD | Reporter agent | Initial generation |
