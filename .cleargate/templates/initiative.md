<instructions>
USE THIS TEMPLATE TO DOCUMENT WHAT AN INITIATIVE LOOKS LIKE — the BA/PM-authored
stakeholder-input artifact that captures business intent BEFORE AI decomposition.

WHO AUTHORS THIS: a human BA / PM / sponsor — outside the codebase OR in the upstream
PM tool (Linear / Jira / GitHub Issues). The AI does NOT author Initiatives from
scratch in the repo. This template is a cheat sheet for the human author.

HOW IT GETS INTO THE REPO (two paths):
  1. MCP pull (preferred): `cleargate_pull_initiative` fetches from the upstream PM
     tool → caches at `.cleargate/delivery/pending-sync/INITIATIVE-NNN_*.md`.
  2. Manual paste: human drops a markdown file matching this shape into
     `pending-sync/`. AI stamps `source: manual-paste` then triages.

WHAT THE AI DOES WITH IT:
  - Reads the cached/pasted Initiative.
  - Asks open questions in chat.
  - DECOMPOSES into Epic / Story / CR / Bug — NEVER edits the Initiative body.
  - On triage completion: moves the Initiative to `archive/INITIATIVE-NNN_*.md`
    with frontmatter stamps `triaged_at: <ISO-8601>` and
    `spawned_items: [EPIC-NNN, STORY-NNN-NN, ...]`.

Output location: `.cleargate/delivery/pending-sync/{ID}_{SLUG}.md`

DO NOT output these instructions in the rendered file.
</instructions>

---
initiative_id: "{ID}"
remote_id: null
source_tool: "linear | jira | github | manual-paste"
status: "{PM native status — e.g. Discovery, In Triage, Triaged, Completed}"
synced_at: null
triaged_at: null
spawned_items: []
created_at: "{ISO-8601 timestamp}"
updated_at: "{ISO-8601 timestamp}"
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
# Sync attribution. Optional; stamped by `cleargate_pull_initiative`.
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: "remote-pulled"        # or "manual-paste"
last_synced_status: null
last_synced_body_sha: null
---

# {ID}: {Initiative Name}

## 1. User Flow

{End-to-end walkthrough of what the user does — step-by-step, in plain language.
Capture the happy path first, then named alternative flows. Diagrams welcome
(see §2). No technical implementation details — that's the AI's job during
decomposition.}

## 2. Diagrams

{Embedded mermaid / asciiart / linked image. Optional but encouraged for any
flow with branching, parallel paths, or multiple actors.

Placeholder:
```
[ User ] → [ Action 1 ] → [ Outcome ]
              ↓
          [ Branch ]
```
}

## 3. End-to-End Verbal Description

{The "tell me what this does" paragraph. 3-8 sentences. Captures the intent,
the ask, and the boundary of the work. Skim-readable for a stakeholder; rich
enough that the AI can ground the first round of decomposition questions in it.}

## 4. Business Outcome

{Why this matters. 1-2 sentences linking the work to a business metric, user
need, or strategic goal. Answers "if this ships, what changes?"}

## 5. Success Criteria

- {Concrete, measurable criterion 1 — what must be true to call this done.}
- {Concrete, measurable criterion 2}
- {Concrete, measurable criterion 3 (optional)}

## 6. Open Questions for AI Triage

{Questions the BA/PM knows are unresolved and wants the AI to surface during
decomposition. The AI MAY answer in chat then propose decomposition; the AI
does NOT edit this section in the Initiative body.

- Question 1
- Question 2
}

---

## Stakeholder Authoring Notes (not pushed)

- Initiative is the **stakeholder-input artifact**, not an AI-authored draft.
  See `.cleargate/knowledge/cleargate-protocol.md` Plan-phase intake (post-CR-025).
- The AI never invokes `cleargate_push_item` on this file. Push semantics are
  one-way: Initiative is **pulled**, Epic / Story / CR / Bug / Hotfix are **pushed**.
- After triage, this file moves to `archive/` with `triaged_at` + `spawned_items`
  stamped. The PM tool retains source-of-truth for content; the repo retains
  the audit trail.
