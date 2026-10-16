<instructions>
USE THIS TEMPLATE TO CHARTER A SPIKE — bounded, timeboxed discovery work undertaken
BEFORE a Story or Epic can be written, because the answer to a specific question is
not yet known. A spike runs pre-sprint by doctrine: it resolves an unknown before a
sprint claims the work that unknown might spawn.

THIS TEMPLATE IS THE OPPOSITE OF EVERY OTHER TEMPLATE IN THIS DIRECTORY. Every other
template is a spec-before-execution contract: it asks for acceptance criteria, a file
surface, or a Definition of Done before its own Ambiguity Gate can turn green. A
spike's premise is that none of those can be written yet. ITS AMBIGUITY GATE IS
INVERTED: reaching green here does NOT mean the answer in Section 1 is known. It means
the question is sharp, the timebox is set, and the kill criteria are falsifiable enough
that bounded discovery can safely start. State that inversion again in the rendered
gate block at the bottom of the file — this instructions block is stripped from every
authored instance, so a reader of the finished charter never sees this paragraph.

FOLLOW THIS EXACT STRUCTURE. Output sections in order 1-5.
YAML Frontmatter: Spike ID, timebox, kill criteria, spawned items, concluded-at, plus
the standard sync-attribution block (copied from initiative.md).
Section 1 The Question: the single unresolved question this spike exists to answer.
Not a task list, not a plural.
Section 2 Timebox & Kill Criteria: the wall-clock bound the spike may not exceed, and
the falsifiable condition or conditions that end it early — win or lose.
Section 3 Decision Unblocked: the decision this spike's answer unblocks, and who —
which Epic, Story, or human sponsor — is waiting on it.
Section 4 Decision Log: append-only. One entry per discovery round, added DURING the
spike as findings accumulate — never written in a single pass before work starts.
Section 5 Outcome & Spawned Items: the concluding verdict plus the work items it
spawned, and the archive handoff.
Output location: .cleargate/delivery/pending-sync/{ID}_{SLUG}.md

POST-WRITE BRIEF
After Writing this document, render a Brief in chat with the following sections,
mechanically extracted from the document's own structure:

  - Prior work    ← cleargate-wiki-query result (cite [[IDs]] or write "none found")
  - Summary        ← Section 1 The Question
  - Open Questions ← Section 1 The Question (any sub-questions not yet folded in)
  - Edge Cases     ← Section 2 Timebox & Kill Criteria (conditions that end it early)
  - Risks          ← Section 3 Decision Unblocked (who is blocked while this runs)
  - Ambiguity      ← bottom-of-doc ClearGate Ambiguity Gate block

Halt for human review. When ambiguity reaches green, proceed to call cleargate_push_item.
Do NOT ask separately for push confirmation — Brief approval covers it.

Do NOT output these instructions.
</instructions>

---
spike_id: "{ID}"
parent_cleargate_id: null  # canonical cleargate-id of parent work item; null for top-level
status: "Draft"  # lifecycle: Draft → In Progress → Completed
approved: false
ambiguity: "🔴 High"
context_source: "approved Epic / verified codebase grounding + recorded direct approval"
area: null  # local-only tag; never propagates to H1 or body
timebox: null  # e.g. "48h", or an explicit start/end ISO-8601 pair; set before flipping ambiguity to green
kill_criteria: null  # falsifiable condition(s) that end the spike early, win or lose; set before flipping ambiguity to green
spawned_items: []
concluded_at: null
created_at: "{ISO}"
updated_at: "{ISO}"
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

# {ID}: {SLUG}

## 1. The Question

> State the single unresolved question this spike exists to answer, in one or two
> sentences. If the sentence needs "and" to hold together, it is two questions —
> split into two spikes rather than widen this one.

The question as drafted must be falsifiable: a reader unfamiliar with the surrounding
work should be able to tell, from the sentence alone, what evidence would answer it
one way and what evidence would answer it the other way. A question phrased as an
open-ended investigation ("look into the caching layer") is not sharp enough to pass
the gate below; a question phrased as a yes/no or a choice between named options is.

Once drafted, write the question itself as a single bulleted line beneath this
guidance, rather than as continued prose — the readiness gate below counts bulleted
lines in this section, not paragraphs.

## 2. Timebox & Kill Criteria

**Timebox:** State a wall-clock or working-day bound this spike may not exceed without
returning to its sponsor for renewal, or an explicit start/end pair. A spike with no
stated timebox is exploration, not a charter, and the gate below cannot turn green.

**Kill criteria:** State the condition, or conditions, that end the spike early — win
or lose. A kill criterion that can never actually trigger during the timebox above is
decorative; if nothing written here could stop the spike before the timebox expires,
this section is not done yet.

Once both are set, write the timebox as one bulleted line and the kill criteria as
one or more further bulleted lines beneath the labels above, rather than as
paragraphs — the readiness gate below counts bulleted lines in this section, not the
bold labels or the prose that follows them.

## 3. Decision Unblocked

Name the decision this spike's answer unblocks, and identify who is waiting on it —
the Epic, Story, or human sponsor that cannot proceed until Section 5 is filled in. A
spike with nothing waiting on its answer is exploration for its own sake, not a
charter, and should be recorded as a note rather than drafted here.

## 4. Decision Log

> Append-only. Add one row per discovery round, during the spike, as findings
> accumulate. This table starts empty and grows as work happens — it is never
> written in a single pass before the timebox above begins.

| Round | Date | Finding | Confidence |
|---|---|---|---|

## 5. Outcome & Spawned Items

State the concluding verdict here: the answer to Section 1's question, or the reason
the spike was killed early against Section 2's criteria. Record every resulting work
item as a `spawned_items` entry in the frontmatter above, using its canonical id
(Epic, Story, CR, or Bug). On conclusion, set `concluded_at` in the frontmatter and
move this file to `.cleargate/delivery/archive/`, mirroring the Initiative lifecycle —
the spike's job ends the moment its answer is recorded and handed off.

Once decided, write the verdict as a bulleted line beneath this paragraph, rather
than as continued prose — the readiness gate below counts bulleted lines in this
section, not paragraphs.

## Prior work

> Duplicate-check evidence, enforced by the `prior-work-recorded` readiness predicate.
> Paste the `cleargate-wiki-query` result here: link each related item as a wiki-style
> reference, or replace the line below with an explicit empty-result sentinel.
> Accepted sentinels are listed in readiness-gates.md (Predicate Vocabulary entry 8).

- <replace with related-work wikilinks, or an explicit empty-result sentinel>

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🔴 High Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

**This gate is inverted relative to every other template in this directory. Reaching
green here does NOT mean the answer to Section 1 is known — it means the question is
sharp, the timebox is set, and the kill criteria are falsifiable enough that bounded
discovery can safely start.**

Requirements to pass to Green (Ready for Discovery):
- [ ] Section 1 states a single, falsifiable question — not a task list, not a plural.
- [ ] Section 2's timebox is a concrete bound, and its kill criteria are conditions that could actually trigger.
- [ ] Section 3 names both the decision this spike unblocks and who is waiting on it.
- [ ] Section 4 is present as an empty append-only table — no entries yet; it fills during the spike.
- [ ] `approved: true` is set in the YAML frontmatter.
