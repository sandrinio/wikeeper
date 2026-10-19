<instructions>
FOLLOW THIS EXACT STRUCTURE. Output sections in order 1-4.
YAML Frontmatter: CR ID, Parent Ref (Epic or Story being changed), Status, Approved gate.
Use this template when CHANGING an existing feature. For net-new functionality, use story.md instead.
§1 The Context Override: What to remove/forget + the new truth. AI agents hallucinate when old context conflicts with new requests.
§2 Blast Radius & Invalidation: Which downstream items does this CR break? A CR acts as a "Gate Reset" on affected items.
§3 Execution Sandbox: Exact file paths to modify.
Task Breakdown: one `- [ ] <action>` row per executable step, in execution order. REQUIRED at L3 and above, optional at L2, omit the section entirely at L1. An absent section passes the gate; a present-but-empty one fails. Task Breakdown rows implement the Gherkin scenarios in §4; no row is written for an axis marked F.
§4 Verification Protocol: How to confirm new logic works and old logic is fully evicted. §4 also carries a SPIDR coverage table (axes: Paths, Interfaces, Data, Rules) above a Gherkin block. Paths = more than one *successful* way through (the baseline error scenario is not a path). Interfaces = more than one surface exposes the behaviour (CLI / API / UI / hook). Data = behaviour differs by data type, shape or volume — usually a Scenario Outline with Examples. Rules = a business rule constrains the outcome — one scenario per rule, including breaking it. Tag each covered scenario with the matching `@paths` / `@interfaces` / `@data` / `@rules` marker directly above `Scenario:` / `Scenario Outline:`. There is no Spike row: open discovery is chartered as a SPIKE item before this CR is written.
Output location: .cleargate/delivery/pending-sync/CR-005_readme-shorter.md

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
cr_id: CR-005
parent_ref: STORY-007-07 | STORY-008-06 | STORY-009-03
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Completed
approved: true
approved_by: human ("go ahead and change it please", after the README review in chat, 2026-10-19)
context_source: approved Epic / verified codebase grounding + recorded direct approval
created_at: 2026-04-17T00:00:00Z
updated_at: 2026-10-19T11:52:43Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
draft_tokens:
  input: null
  output: null
  cache_read: null
  cache_creation: null
  model: null
  sessions: []
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-19T11:52:43Z
  transition: ready-to-apply
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
---

# CR-005: A shorter README, with the detail in docs/reference.md

## 0.5 Open Questions

- **Question:** Who is the README for?
- **Recommended:** Someone who runs a project (a lead, product manager or manager) and already uses a coding agent as an assistant. The headline says what they get, a project wiki the agent keeps and can't quietly get wrong, not "agent memory".
- **Human decision:** not answered; the human said "go ahead and change it please" to the proposal, so the recommendation stands.

- **Question:** Keep the Karpathy LLM-wiki angle for search?
- **Recommended:** One line in the intro, in the words the README already used ("Karpathy-style LLM wiki"); drop the RAG comparison table, which makes claims about named products.
- **Human decision:** as recommended (same reply).

- **Question:** Move the detail or cut it?
- **Recommended:** Move it to `docs/reference.md`, sections verbatim, so nothing is lost. Cut only the opening "Problem" section, the comparison table and the three images.
- **Human decision:** as recommended (same reply).

## 1. The Context Override (Old vs. New)

**Obsolete Logic (What to Remove / Forget):**
- The README as a full manual: 193 lines and about 1,900 words, of which about 130 lines are the command table, the ingest phases, permission modes, size limits, upgrade internals and the agent compatibility table.
- The "AI agents have amnesia" framing, the RAG / cloud-memory comparison table naming other products, and the images (the banner shows "v0.3" and the old tagline; the pipeline diagram says "Archive original in raw/").
- The License badge that uses the LICENSE file as its image, so it renders broken.

**New Logic (The New Truth):**
- `README.md` (about 70 lines): what it is and who it's for, the quickstart with the three-turn conversation, what you can count on (plain bullets), what it works with, updates and privacy, links to the reference and architecture, requirements and license.
- `docs/reference.md`: the moved sections, verbatim: how an ingest works, permission modes and `--enforce`, token gauges and the fact archive, the command reference, upgrading, multi-agent compatibility, the management profile, requirements and development.
- Links from the README to `docs/` are absolute GitHub URLs, since the npm package ships only `dist/` and `templates/` besides README, LICENSE and package.json.

## 2. Blast Radius & Invalidation

- [x] Invalidate/Update Story: none downstream. The README text that [[STORY-007-07]], [[STORY-008-06]] and [[STORY-009-03]] added moves to `docs/reference.md` verbatim; those stories are Completed and are not reopened. Their sealed README pins are re-scoped to read the README and the reference together.
- [x] Invalidate/Update Epic: none.
- [x] Database schema impacts? No.

## Existing Surfaces

- **Surface:** `./README.md:1` — the 193-line README this CR shortens.
- **Surface:** `test/templates/archive-instructions.red.node.test.ts:156` — "README (R8)" pins `.wiki/archive/`, `--archive`, `**Fact archive.**`, the raw-folder sentence, the decision range and the `update` and `remove` rows.
- **Surface:** `test/templates/upgrade-instructions.red.node.test.ts:106` — `readme()` feeds the "README (R4)" row (the Upgrading section, the registry URL, the opt-outs, `D-01`–`D-38`).
- **Surface:** `test/templates/token-instructions.red.node.test.ts:207` — "README (R11)" pins `±15%`, `wikeeper config`, `wikeeper statusline`.
- **Why this CR extends rather than rebuilds:** the moved sections keep their text, so the pinned phrases survive; only where the tests look changes.

## Prior work

- [[STORY-007-07]], [[STORY-008-06]], [[STORY-009-03]] added the README sections that move. The wiki query found nothing else. FLASHCARD cards #readme #unicode (emoji headings carry U+FE0F) and #red-test #docs (the `D-01`–`D-NN` range pin) apply.

## 3. Execution Sandbox

**Modify:**
- `README.md`
- `test/templates/archive-instructions.red.node.test.ts`
- `test/templates/upgrade-instructions.red.node.test.ts`
- `test/templates/token-instructions.red.node.test.ts`

**Create:**
- `docs/reference.md`

## 4. Verification Protocol

**Command/Test:** `npm run typecheck && npm test`, then a line check: every line removed from `README.md` is in `docs/reference.md`, or is in the dropped list in §1.

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | F | One reader path: the README, then the reference. |
| Interfaces | F | Documentation only; no CLI, hook or agent text changes. |
| Data | F | No data shapes. |
| Rules | T | The pinned phrases must still be published somewhere a reader looks. |

```gherkin
Feature: A shorter README

  @rules
  Scenario: The pinned phrases are still published
    Given README.md and docs/reference.md
    When the archive, upgrade and token README rows read both files
    Then every pinned phrase is found

  Scenario: The README is short and points to the detail
    Given the new README.md
    Then it has at most 90 lines
    And it links to docs/reference.md and architecture.md with absolute GitHub URLs
    And it has no comparison table and no command table
```

**Test layers.**

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 0 | Documentation change; no code. |
| Integration tests | 0 | Nothing runs differently. |
| E2E / acceptance tests | 3 | The three re-scoped README rows. |

---

## Context Source

**context_source:** the README review in chat (2026-10-19) and the human's approval "go ahead and change it please"; codebase grounding: `README.md`, the three test files above, `package.json` `files`.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] "Obsolete Logic" to be evicted is explicitly declared.
- [x] All impacted downstream Epics/Stories are identified and reverted to 🔴 High Ambiguity.
- [x] Execution Sandbox contains exact file paths.
- [x] Verification command is provided.
- [x] `approved: true` is set in the YAML frontmatter.
- [x] Existing Surfaces cites at least one source-tree path the CR extends.
