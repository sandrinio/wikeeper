# Readiness Gates

This file is the single source of truth for ClearGate's machine-checkable readiness gates. Each gate entry declares the `{work_item_type, transition}` pair it governs, along with a list of criteria expressed in the closed-set predicate vocabulary defined below. The predicate evaluator in `cleargate-cli/src/lib/readiness-predicates.ts` (STORY-008-02) reads these YAML blocks and evaluates them against a target document's frontmatter and body. Gate check results are cached in the document's own frontmatter under `cached_gate_result:` by `cleargate gate check <file>`.

---

## Predicate Vocabulary

There are exactly **12 predicate shapes**. No other shapes are recognized; a check string that does not match one of these forms throws a parse error at evaluation time.

**1. `frontmatter(<ref>).<field> <op> <value>`**
Reads a frontmatter field from a document. `<ref>` is either `.` (the document being evaluated) or a frontmatter key that **names another document** (e.g. `parent_ref`). `<op>` is one of `==`, `!=`, `>=`, `<=`. `<value>` is a literal string, number, or boolean. Example: `frontmatter(parent_ref).approved == true` reads the document named by the evaluated document's `parent_ref` key and asserts its `approved` field equals `true`.

A naming `<ref>` resolves through exactly one mechanism, in this order:
1. **Work-item id** — `INITIATIVE-001`, `PROPOSAL-012`, `EPIC-043`, `STORY-033-03`. Matched by filename stem (`<ID>.md` or `<ID>_<Name>.md`) under `.cleargate/delivery/pending-sync/`, then `.cleargate/delivery/archive/`.
2. **Relative path** — resolved against the citing document's directory, then the project root, then the two delivery directories.

CR-098: `<ref>` used to be `context_source`, which meant three incompatible things at once — the definition above called it a path, `discovery-checked` read it as an opaque presence flag, and every template shipped it as prose. BUG-008's prose-vs-path heuristic existed only to guess between them, and is now deleted. `context_source` keeps the one meaning it always had in practice: prose evidence, read only by `discovery-checked` as a presence flag. Naming the parent is `parent_ref`'s job.

Two rules follow, and they are deliberately asymmetric:
- **`<ref>` unset** → the gate looks for a recorded direct approval: `proposal_gate_waiver` carrying `approved_by` + `approved_at` (or a non-empty scalar), or top-level `approved_by` + `approved_at`. This is the documented route for an item whose parent was approved directly with no Proposal/Initiative on disk.
- **`<ref>` set but unresolvable** → hard fail, no waiver escape. Naming a parent that is not on disk is a broken reference, not an approval.

**2. `body contains "<string>"` / `body does not contain "<string>"`**
Performs a case-sensitive substring search on the document body (everything after the frontmatter block). The negated form `body does not contain` passes when the string is absent. Example: `body does not contain 'TBD'` fails if the literal string `TBD` appears anywhere in the body.

**3. `section(<N>) has <count> <item-type>`**
Splits the document body on `## ` heading boundaries (1-indexed) and counts items of a given type within section N. `<count>` is an expression like `≥1`, `≥3`, or `0` (exact zero). `<item-type>` is one of:
- `checked-checkbox` — lines matching `- [x]`
- `unchecked-checkbox` — lines matching `- [ ]`
- `listed-item` — lines matching `- ` regardless of checkbox state (bullet-precise; use when checkbox/task-list semantics are required, e.g. DoD)
- `declared-item` — any line that declares a structured item: bullet lines (`- ...`), table data rows (`| ... |` lines following a `|---|`-style separator within the section), or definition-list terms (lines matching `**Item:**`, `Item:`, `*Item*:` etc.). Use `declared-item` when the gate cares only that the author declared at least N entries in section N, regardless of presentation format (table vs bullet vs def-list).

Example: `section(2) has ≥1 checked-checkbox` asserts that the second `##` section contains at least one checked markdown checkbox. Example: `section(3) has ≥1 declared-item` passes when §3 contains at least one bullet, table data row, or definition-list term.

**`N` is a position, not a printed ordinal.** Sections are counted in document order over `## ` headings, so a template whose first heading is `## 0.5 Open Questions` or `## 0. AI Coding Agent Handoff` shifts every later section by one — and unnumbered headings (`## Existing Surfaces`, `## Prior work`, `## Why not simpler?`) consume positions too. `## 3. Execution Sandbox` in `CR.md` is `section(6)`, not `section(3)`. Inserting any `## ` heading into a gated template renumbers every criterion below it. The pinning test (`cleargate-cli/test/docs/gate-section-index-pinning.node.test.ts`) enumerates every `section(N)` criterion and asserts it resolves to the heading its id names — it is what turns that renumbering into a build break. Update the fixture there in the same commit as any template heading change.

**4. `file-exists(<path>)`**
Asserts that a file exists on disk at the given path, resolved relative to the project root. Example: `file-exists(.cleargate/knowledge/cleargate-protocol.md)` passes when that file is present in the working tree.

**5. `link-target-exists(<[[WORK-ITEM-ID]]>)`**
Reads `.cleargate/wiki/index.md` and asserts that the wiki index contains a reference to the given ID. Passes when the wiki has an entry for the linked item, meaning it has been ingested at least once. Example: `link-target-exists([[EPIC-008]])` passes when EPIC-008 appears in the compiled wiki index.

**6. `status-of(<[[ID]]>) == <value>`**
Resolves the given ID via the wiki index, reads that page's compiled frontmatter `status:` field, and compares it to `<value>`. Status values in the live corpus are textual strings (`Draft`, `Ready`, `Active`, `Done`) — not emoji. Example: `status-of([[EPIC-008]]) == Active` passes when EPIC-008's wiki page has `status: Active`. Note: this predicate returns `unknown` (evaluates to fail) when the wiki index is stale and the item is not yet compiled. Run `cleargate wiki build` before relying on `status-of` predicates.

**7. `existing-surfaces-verified`**
Closed-set predicate (no parameters). Locates the `## Existing Surfaces` section in the document body, extracts path-shaped substrings via regex, asserts each cited path exists on disk relative to the project root. Passes when section is absent (defers to `reuse-audit-recorded`) OR all cited paths exist OR section contains a "no overlap found" / "no existing surface" / "no prior implementation" / "audit returned empty" sentinel. Sandbox-rejected paths (escaping project root) are treated as missing. Example: `existing-surfaces-verified` against an Epic body whose `## Existing Surfaces` cites `cleargate-cli/src/lib/work-item-type.ts:detectWorkItemTypeFromFm` passes when that path exists.

**8. `prior-work-recorded`**
Closed-set predicate (no parameters). STORY-051-07: backstops the duplicate-check discipline with a machine check. Locates the `## Prior work` section in the document body. Passes when the section is absent (migration grace for items authored before this predicate existed). When present, passes only if it records real evidence: a `[[WORK-ITEM-ID]]` wikilink, or one of the empty-result sentinels `none found` / `no prior work` / a standalone `none`. Fails, naming the missing evidence, when the section is present but contains neither — this is the case a freshly template-authored, never-filled-in `## Prior work` section hits, because the scaffolded body is deliberately token-free. Example: `prior-work-recorded` against a story whose `## Prior work` section reads `- [[STORY-003-05]]` passes; the same section left as the unedited template placeholder fails.

**9. `ambiguity-gate-resolved`**
Closed-set predicate (no parameters). STORY-051-07: backstops the "Ambiguity Gate criteria are evaluated literally" discipline with a machine check. Locates the `## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)` section by heading-title **prefix** match (the parenthetical emoji suffix means an exact-equality match never fires). Passes when the section is absent. When present, reads the `Current Status:` line: if it does not claim 🟢, passes (no self-contradiction to flag at 🟡/🔴). If it claims 🟢, passes only when the section has zero `- [ ]` unchecked checkboxes; fails, naming the unchecked count, otherwise. Example: a Status line reading `Current Status: 🟢 Low` with one remaining `- [ ]` box fails; checking that box flips the predicate to pass.

**10. `task-breakdown-complete`**
Closed-set predicate (no parameters). Locates the `## Task Breakdown` section by heading title
(numeric prefixes tolerated). Passes when the section is absent — every item authored before this
criterion existed lacks it, and an L1 item omits it deliberately. When present, passes only if it
carries at least one task row (`- [ ]` or `- [x]`); a present-but-row-free section fails, naming
the gap. The optional trailing `-> <requirement-id>` on a row is accepted and not otherwise
interpreted. Example: `task-breakdown-complete` against a Story whose `## Task Breakdown` reads
`- [ ] add the predicate branch -> R5` passes; the unedited template scaffold fails.

**11. `test-layers-declared`**
Closed-set predicate (no parameters). CR-111: fires only on a document that already carries a
test-layer declaration — an `| Integration tests | ... |` row, or a `**Test layers.**` lead-in
block. **Absent → passes**, with a `not-applicable:` detail (migration grace: an item authored
before this criterion existed carries neither, and an absent row is not itself a decision worth
failing). When a declaration IS present, passes only if all three layers — Unit tests, Integration
tests, E2E / acceptance tests — are declared, every count is a non-negative integer, and every `0`
count carries a non-empty reason in its Notes cell; fails otherwise, naming the missing row or the
unreasoned zero. Reads `doc.body` only, never `doc.fm` — the criterion is registered identically
against `story`, `cr` and `bug` and must not branch on work-item type. Example: a `**Test layers.**`
table with `| Integration tests | 0 | pure function, no I/O |` passes; the same row with an empty
Notes cell, or omitted entirely, fails once the label or an Integration row has triggered the
check.

**12. `spidr-coverage`**
Closed-set predicate (no parameters). CR-123: fires only on a document whose body carries a line
starting at column 0 with `**SPIDR coverage.**`, outside any code fence (an opener of 3 or more
backticks or tildes, closed by the same character at a length ≥ the opener). **Absent → passes**,
with a `not-applicable:` detail (migration grace — the trigger is column-0-anchored and fence-aware
specifically so a document that merely *quotes* the lead-in inline or inside a fenced example, such
as this CR's own body, never self-fires). When present, reads the first contiguous `|`-table after
the trigger line (header and separator skipped) and requires exactly one row per axis — `Paths`,
`Interfaces`, `Data`, `Rules` (matched exactly; first row per axis wins). Fails, naming the axis and
the defect, on: a missing axis row; a Cover cell (trimmed) that is not exactly `T` or `F` (the
unfilled `{T or F}` template placeholder therefore fails); an `F` row with an empty Reason cell; a
`T` row with no scenario tagged for that axis; or an `F` row with a scenario tagged for that axis. A
`T` row with an empty Reason passes — the Reason column is mandatory only for `F`. A tag counts only
when it is one or more `@word` tokens on the line(s) directly above `Scenario:` / `Scenario
Outline:`, inside a fence opened by `` ```gherkin `` and closed by `` ``` ``; known tags are the
lowercase `@paths`, `@interfaces`, `@data`, `@rules` — unknown tags and tags outside a gherkin fence
are ignored. Reads `doc.body` only, never `doc.fm` — registered identically against `story`, `cr`
and `bug`, and never registered against `epic` (there is no Spike row: open discovery is chartered
as a SPIKE item before the gated item is written). Example: a table where `Paths = T` with an
`@paths`-tagged scenario present, and `Interfaces = F` with a populated Reason and no `@interfaces`
scenario, passes for both axes; the same table with `Paths = T` and no `@paths` scenario anywhere
fails, naming Paths.

---

## Severity Model

Gates are classified as either **advisory** or **enforcing**.

**Advisory** gates (Proposal only) emit warnings and exit 0 regardless of pass/fail. They are informational checkpoints — they record `cached_gate_result.pass: false` in the document's frontmatter so an agent can read the state, but they never block a downstream action. Crucially, a Proposal's `approved: true` field is a pure human judgment: a Vibe Coder manually sets it after reviewing the document. The gate cannot and must not intercept that. Failing an advisory gate means "the document could be stronger" — it does not mean "the human may not approve."

**Enforcing** gates (Epic, Story, CR, Bug) exit non-zero on any failing criterion. `cleargate wiki lint` refuses to mark an Epic/Story/CR/Bug as 🟢-candidate when `cached_gate_result.pass == false` or when `last_gate_check < updated_at` (stale result). This ensures every enforcing gate check is fresh at the time of promotion.

The asymmetry exists because Proposal documents are human-authored strategy artifacts where partial drafts are normal and iterative. Epics, Stories, CRs, and Bugs represent engineering commitments where incomplete specification directly causes execution failures.

---

## Gate Definitions

```yaml
- work_item_type: proposal
  transition: ready-for-decomposition
  severity: advisory
  criteria:
    - id: architecture-populated
      check: "section(2) has ≥1 listed-item"
    - id: touched-files-populated
      check: "section(3) has ≥1 listed-item"
    - id: no-tbds
      check: "body does not contain marker 'TBD'"
```

```yaml
- work_item_type: epic
  transition: ready-for-decomposition
  severity: enforcing
  criteria:
    - id: parent-approved-proposal
      check: "frontmatter(parent_ref).approved == true"
      or_group: parent-approved
    - id: parent-approved-initiative
      check: "frontmatter(parent_ref).status == 'Triaged'"
      or_group: parent-approved
    - id: no-tbds
      check: "body does not contain marker 'TBD'"
    - id: scope-in-populated
      check: "section(3) has ≥1 declared-item"
    - id: affected-files-declared
      check: "section(8) has ≥1 declared-item"
    - id: interrogation-resolved
      check: "body does not contain 'Unresolved'"
    - id: discovery-checked
      check: "frontmatter(.).context_source != null"
    - id: reuse-audit-recorded
      check: "body contains '## Existing Surfaces'"
    - id: existing-surfaces-verified
      check: "existing-surfaces-verified"
    - id: simplest-form-justified
      check: "body contains '## Why not simpler?'"
    - id: prior-work-recorded
      check: "prior-work-recorded"
    - id: ambiguity-gate-resolved
      check: "ambiguity-gate-resolved"
```

```yaml
- work_item_type: epic
  transition: ready-for-coding
  severity: enforcing
  criteria:
    - id: stories-referenced
      check: "body contains 'STORY-'"
    - id: gherkin-happy-path
      check: "body contains 'Scenario:'"
    - id: gherkin-error-path
      check: "body contains 'Scenario: Error'"
    - id: no-tbds
      check: "body does not contain marker 'TBD'"
    - id: interrogation-resolved
      check: "body does not contain 'Unresolved'"
    - id: discovery-checked
      check: "frontmatter(.).context_source != null"
```

```yaml
- work_item_type: story
  transition: ready-for-execution
  severity: enforcing
  criteria:
    - id: parent-epic-ref-set
      check: "frontmatter(.).parent_epic_ref != null"
    - id: no-tbds
      check: "body does not contain marker 'TBD'"
    - id: implementation-files-declared
      check: "section(3) has ≥1 declared-item"
    - id: dod-declared
      check: "section(5) has ≥1 listed-item"
    - id: gherkin-present
      check: "body contains 'Scenario:'"
    - id: discovery-checked
      check: "frontmatter(.).context_source != null"
    - id: reuse-audit-recorded
      check: "body contains '## Existing Surfaces'"
    - id: existing-surfaces-verified
      check: "existing-surfaces-verified"
    - id: simplest-form-justified
      check: "body contains '## Why not simpler?'"
    - id: prior-work-recorded
      check: "prior-work-recorded"
    - id: ambiguity-gate-resolved
      check: "ambiguity-gate-resolved"
    - id: task-breakdown-complete
      check: "task-breakdown-complete"
    - id: test-layers-declared
      check: "test-layers-declared"
    - id: spidr-coverage
      check: "spidr-coverage"
```

```yaml
- work_item_type: cr
  transition: ready-to-apply
  severity: enforcing
  criteria:
    - id: blast-radius-populated
      check: "section(3) has ≥1 declared-item"
    - id: no-tbds
      check: "body does not contain marker 'TBD'"
    - id: sandbox-paths-declared
      check: "section(6) has ≥1 declared-item"
    - id: discovery-checked
      check: "frontmatter(.).context_source != null"
    - id: reuse-audit-recorded
      check: "body contains '## Existing Surfaces'"
    - id: existing-surfaces-verified
      check: "existing-surfaces-verified"
    - id: prior-work-recorded
      check: "prior-work-recorded"
    - id: ambiguity-gate-resolved
      check: "ambiguity-gate-resolved"
    - id: task-breakdown-complete
      check: "task-breakdown-complete"
    - id: test-layers-declared
      check: "test-layers-declared"
    - id: spidr-coverage
      check: "spidr-coverage"
```

```yaml
- work_item_type: bug
  transition: ready-for-fix
  severity: enforcing
  criteria:
    - id: repro-steps-deterministic
      check: "section(2) has ≥3 declared-item"
    - id: severity-set
      check: "frontmatter(.).severity != null"
    - id: no-tbds
      check: "body does not contain marker 'TBD'"
    - id: discovery-checked
      check: "frontmatter(.).context_source != null"
    - id: prior-work-recorded
      check: "prior-work-recorded"
    - id: ambiguity-gate-resolved
      check: "ambiguity-gate-resolved"
    - id: task-breakdown-complete
      check: "task-breakdown-complete"
    - id: test-layers-declared
      check: "test-layers-declared"
    - id: spidr-coverage
      check: "spidr-coverage"
```

```yaml
- work_item_type: sprint
  transition: ready-for-execution
  severity: enforcing
  criteria:
    - id: risk-table-populated
      check: "body contains '| Mitigation'"
    - id: discovery-checked
      check: "frontmatter(.).context_source != null"
```

STORY-051-03 (Q7), as amended by CR-098: `discovery-checked` is self-referential (`frontmatter(.).context_source`) in **every** bucket, and `context_source` is never used to name another document. A sprint's `context_source` documents its own decomposition evidence — which `epics:`/`proposals:` it decomposes; an epic's documents its own grounding. Upstream approval is read from `parent_ref` (see the epic bucket's `frontmatter(parent_ref).approved == true` above), which is a different key precisely so that neither reading has to guess. Array-non-empty enforcement of `epics:`/`proposals:` is the `cleargate sprint init` decomposition gate's job (fails closed on `declaredNone`/`error` unless `--allow-drift`), not this predicate's — this criterion only asserts the field is populated at all.

```yaml
- work_item_type: initiative
  transition: ready-for-decomposition
  severity: advisory
  criteria:
    - id: no-tbds
      check: "body does not contain marker 'TBD'"
    - id: user-flow-populated
      check: "section(1) has ≥1 listed-item"
    - id: success-criteria-populated
      check: "section(5) has ≥1 listed-item"
```

```yaml
- work_item_type: hotfix
  transition: ready-for-merge
  severity: enforcing
  criteria:
    - id: anomaly-populated
      check: "section(2) has ≥1 listed-item"
    - id: files-touched-declared
      check: "section(3) has ≥1 declared-item"
    - id: verification-steps-nonempty
      check: "section(4) has ≥1 unchecked-checkbox"
    - id: severity-set
      check: "frontmatter(.).severity != null"
    - id: no-tbds
      check: "body does not contain marker 'TBD'"
```

```yaml
- work_item_type: spike
  transition: ready-to-investigate
  severity: advisory
  criteria:
    - id: question-stated
      check: "section(1) has ≥1 listed-item"
    - id: timebox-and-kill-criteria-set
      check: "section(2) has ≥2 listed-item"
    - id: no-tbds
      check: "body does not contain marker 'TBD'"
    - id: ambiguity-gate-resolved
      check: "ambiguity-gate-resolved"
```

```yaml
- work_item_type: spike
  transition: ready-to-conclude
  severity: advisory
  criteria:
    - id: decision-log-populated
      check: "section(4) has ≥1 declared-item"
    - id: outcome-declared
      check: "section(5) has ≥1 listed-item"
    - id: no-tbds
      check: "body does not contain marker 'TBD'"
```
