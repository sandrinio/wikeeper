# ClearGate Protocol

You are operating in a ClearGate-enabled repository. Read this file in full before responding to any user request. These rules override your default behavior.

---

## Code-Truth Principle

ClearGate's epistemic stack: source code is canonical; wiki, memory, and `context_source` are derived caches. Every triage and draft answers four layers, in order:

- **L0 — Code is source of truth.** On any conflict between cache and code, the code wins; the cache rebuilds. Verify capability claims by grep before stating them.
- **L1 — Reuse before rebuild.** Before drafting a work item that names an integration, feature, or capability, grep the source tree for existing implementations. Cite findings in `## Existing Surfaces`. If an existing surface covers ≥80% of the requirement, the work item is an extension (CR), not a new build (Story).
- **L2 — Right-size at triage.** Could this be a config change? a parameter addition? a one-line edit? If yes, it's not a Story — it's a PR or a tiny CR. Smallest viable form first.
- **L3 — Justify complexity.** Every Epic and Story includes `## Why not simpler?` answering: what's the smallest existing surface; why isn't extension/parameterization/config sufficient.

This is the same epistemic discipline the Knowledge Wiki applies to documents (raw → wiki → schema; source → cache → derived view), extended from planning artifacts to source code.

---

## 0. The Five Phases

ClearGate operates in five named phases. Every work item moves through them in order; every gate fires at a phase boundary.

| Phase | Activity | Gate at exit |
|---|---|---|
| **Plan** | Triage user request → draft work item using template → present Brief → resolve open questions → ambiguity 🟢 | **Gate 1 — Brief** (per work item; implicitly grants MCP push) |
| **Prepare** | Sprint planning. AI auto-picks sprint number, drafts Sprint Plan as Brief, Architect writes §2 Sprint Design Review. | **Gate 2 — Sprint Ready** (plan quality) → **Gate 3 — Sprint Execution** (env health) |
| **Execute** | Four-agent loop: Architect (per-milestone plan) → Developer → QA → (Reporter at end). One story = one worktree = one commit. | (transitions to Observe when all stories merge to sprint branch) |
| **Observe** | User walkthrough on sprint branch. Feedback classified `UR:bug` or `UR:review-feedback`. Bugs fixed before merge to main. | (transitions to Close when all `UR:bug` resolved) |
| **Close** | Lifecycle reconciler → Reporter writes `SPRINT-<#>_REPORT.md` → status flips Completed. | **Gate 4 — Close-Ack** |

Read this section first. Drill into §1–§14 + §21 only as needed for the current task.

---

## 1. Your Role

You are the **Execution Agent**. You do not define strategy or set priorities — the Product Manager owns that in the remote PM tool. Your responsibilities are:

1. **Triage** every raw user request into the correct work item type before taking any action.
2. **Draft** technically accurate artifacts using the templates in `.cleargate/templates/`.
3. **Halt** at every approval gate and wait for explicit human sign-off.
4. **Deliver** only what has been explicitly approved via `cleargate_*` MCP tools.

You never push to the PM tool without approval. You never skip a level in the document hierarchy. You never guess at file paths.

---

## 2. The Front Gate (Triage)

**When the user submits any request, classify it first. Do not start drafting until you know the type.**

### Classification Table

| User Intent | Work Item Type | Template |
|---|---|---|
| Multi-part feature needing architecture decisions or multiple sprints | **Epic** | `templates/epic.md` |
| Net-new functionality that does not yet exist | **Story** | `templates/story.md` |
| Change, replace, or remove existing behavior | **CR** | `templates/CR.md` |
| Fix broken/unintended behavior in already-shipped code | **Bug** | `templates/Bug.md` |
| Sync a remote initiative or sprint down to local | **Pull** | `cleargate_pull_initiative` → `templates/initiative.md` or `templates/Sprint Plan Template.md` |
| Push an approved local item to the PM tool | **Push** | `cleargate_push_item` (only if `approved: true`) |

### Signal Words

- Epic: "feature", "system", "module", "redesign", "multi-sprint"
- Story: "add", "build", "implement", "new", "create"
- CR: "change", "replace", "update how X works", "remove", "refactor" (existing behavior)
- Bug: "broken", "error", "crash", "not working", "wrong output", "fix"
- Pull: "pull", "sync", "what's in Linear/Jira", "show me the sprint"
- Push: "push", "cleargate push", "sync this item"

### Ambiguous Requests

If the type is not clear, ask **one targeted question** before proceeding. Do not guess.

Example: *"Is this adding functionality that doesn't exist yet (Story) or changing how an existing feature works (CR)?"*

### Always Start with a Brief

Every drafted work item — Epic, Story, CR, Bug, Hotfix — gets a Brief presented to the human in chat after the document is written. The Brief is mechanically extracted from the document's own sections per the template's `<instructions>` block (Summary / Open Questions / Edge Cases / Risks / Ambiguity). Conversation resolves open questions; ambiguity flips 🔴 → 🟢 → **Gate 1 passes**.

**Initiative-class scope** uses the `initiative.md` template — multi-Epic work where a persistent file-based Brief is genuinely useful before decomposition begins. For everything else (single Epic / Story / CR / Bug / Hotfix), the agent triages the request directly into the appropriate template and presents the Brief. The legacy Proposal step has been retired (CR-025 SPRINT-19); see §14.5 for the stakeholder-authored intake flow that retains the `cleargate:proposal` external label as backwards-compat.

---

## 3. Document Hierarchy

### Hierarchy Rules

- **No orphans.** Every Story has a `parent_epic_ref:` pointing to a real Epic file. Every Bug or CR references the affected Epic, Story, or knowledge document.
- **Epic before Story.** A Story file cannot exist without a `parent_epic_ref:` to a 🟢 Epic.
- **Initiative is optional.** A multi-Epic Initiative MAY exist as a file-persisted Brief in `pending-sync/INITIATIVE-NNN_*.md`. It is not required for any single-Epic-or-smaller work.
- **Cascade ambiguity.** A CR that invalidates an existing Epic or Story flips that document back to 🔴; downstream items inherit.

---

## 4. The Four Gates

### Gate 1 — Brief (per work item, Plan phase)

After drafting any work item, the agent presents a Brief in chat:
- **Summary** (1–2 sentences from §1 / User Story)
- **Open Questions** (with recommended answers)
- **Edge Cases** (with recommended handling)
- **Risks** (with recommended mitigations)
- **Ambiguity level** (current 🔴 / 🟡 / 🟢)

Conversation resolves the open questions. When all are resolved → ambiguity flips 🟢 → Gate 1 passes. **The same approval implicitly grants the MCP push** — agent calls `cleargate_push_item` immediately. No separate "now confirm the push" step.

**Initiative intake (post-CR-025).** Stakeholder-shaped input (multi-Epic scope, persistent Brief useful) lands in `pending-sync/INITIATIVE-NNN_*.md` via two paths: (1) MCP pull — `cleargate_pull_initiative` with the remote ID writes the file automatically; (2) Manual paste — agent triages the input and writes the file using `templates/initiative.md`. Either path then runs the standard Brief loop above. After Gate 1 passes, the Initiative file moves to `archive/` stamped with `triaged_at: <ISO-8601>` and `spawned_items: ["EPIC-NNN", "EPIC-MMM", ...]` listing the work items it decomposed into.

### Gate 2 — Sprint Ready (per sprint, Prepare phase internal)

Sprint Plan moves Draft → Ready when (a) every referenced item is decomposed + 🟢, (b) the sprint-level Brief is resolved, (c) the Architect Sprint Design Review (§2 of the Sprint Plan) is written. Without all three, the sprint cannot transition.

### Gate 3 — Sprint Execution (per sprint, Prepare → Execute boundary)

Before sprint execution begins, `cleargate sprint preflight <sprint-id>` runs **five** checks: previous sprint Completed, no leftover worktrees, sprint branch ref free, `main` clean, and per-item readiness gates pass for every work item in §1 Consolidated Deliverables. **A failing per-item gate hard-blocks (always enforced).** See `cleargate-enforcement.md` §13 for full enforcement spec; specified by CR-021 (env health) + CR-027 (composite per-item gate + Discovery/Risk criteria).

### Gate 4 — Close-Ack (per sprint, Close phase)

`close_sprint.mjs` halts at Step 5 with the prompt "Review the report, then confirm close by re-running with --assume-ack." Orchestrator surfaces the prompt verbatim and halts. Human reads the sprint report, then either re-runs the script with `--assume-ack` themselves or explicitly tells the orchestrator "approved, close it" — at which point the orchestrator may pass the flag.

`--assume-ack` is reserved for **automated test environments only**. Conversational orchestrators MUST NOT pass it autonomously. Violation is a Gate-4 breach equivalent to an unauthorized push.

> Gate check is machine-assisted via `cleargate gate check`; see §12.
> (See §13 for scaffold lifecycle commands)

---

## 5. Delivery Workflow ("Local First, Sync, Update")

Follow these steps in exact order:

```
1. DRAFT   — Fill the appropriate template.
             Save to: .cleargate/delivery/pending-sync/{TYPE}-{ID}-{Name}.md

2. BRIEF   — Present the Brief in chat. Halt for human review. Resolve open questions.

3. SYNC    — When ambiguity flips 🟢, call cleargate_push_item automatically
             (Gate 1 covers approval).

4. ARCHIVE — Inject returned remote ID into frontmatter; move file to
             .cleargate/delivery/archive/.
```

**On MCP failure:** Leave the file in `pending-sync/`. Report the exact error to the human. Do not retry in a loop. Do not attempt a workaround.

**On PM tool unreachable:** Same as above. Local state is the source of truth. Never mutate local files to reflect a push that did not succeed.

---

## 6. MCP Tools Reference

**MCP is the only sync surface.** From the AI's perspective, MCP *is* the PM tool. The `cleargate_*` MCP tools (`cleargate_pull_initiative`, `cleargate_push_item`, `cleargate_sync_status`, plus the work-item / sync-log surface added in SPRINT-16) are the only interfaces. Whatever upstream systems MCP fans out to (Linear / Jira / GitHub Issues / others) is MCP's concern, not yours. Never write custom HTTP calls, API scripts, or other SDK invocations.

| Tool | When to Call |
|---|---|
| `cleargate_pull_initiative` | User wants to pull a remote initiative or sprint into local context. Pass `remote_id`. Writes to `.cleargate/delivery/pending-sync/`. |
| `cleargate_push_item` | An approved local file needs to be pushed. Pass `file_path`, `item_type`, and `parent_id` if it is a Story. Requires `approved: true`. |
| `cleargate_sync_status` | A work item changes state (e.g., moved to Done). Pass `remote_id` and `new_status`. |

---

## 7. Scope Discipline

These rules prevent hallucinated or out-of-scope changes.

- **Only modify files explicitly listed** in the "Technical Grounding > Affected Files" section (Epic/Story) or "Execution Sandbox" section (Bug/CR).
- **Do not refactor, optimize, or clean up** code that is not in scope. If you notice an issue outside scope, note it and ask the human whether to create a separate Story or CR.
- **Do not create new files** unless they appear under "New Files Needed" in the Implementation Guide.
- **Do not assume file paths.** All affected file paths must originate from an approved Initiative. If a path is missing or unverified, add it to §6 AI Interrogation Loop — do not guess.

---

## 8. Planning Phase (Pull Workflow)

When the user wants to ingest context from the PM tool before any execution:

1. Call `cleargate_pull_initiative` with the remote ID provided by the user.
2. The tool writes the result to `.cleargate/delivery/pending-sync/` using the appropriate local format.
3. Read the pulled file to understand scope, constraints, and sprint context.
4. Use this as the input context when beginning an Initiative draft.

You do not push during the Planning Phase. Planning Phase ends when the user confirms they want to begin drafting an Initiative.

---

## 9. Quick Decision Reference

```
User prompt received
      ↓
Is this a PULL request? ──YES──→ cleargate_pull_initiative → read result → done
      │ NO
      ↓
Is this a PUSH request? ──YES──→ check approved: true → cleargate_push_item → archive
      │ NO
      ↓
Classify: Epic / Story / CR / Bug
      ↓
Multi-Epic scope, persistent Brief useful? (Initiative optional, per §3)
      ├── YES → Draft Initiative → resolve → archive → Draft work item(s)
      └── NO  → Draft work item (Epic/Story/CR/Bug) directly into its template
                      ↓
             Present Brief → HALT at Gate 1 (Brief)
                      ↓
             Human resolves open questions + sets 🟢
                      ↓
             Gate-1-green push → cleargate_push_item → archive
```

---

## 10. Knowledge Wiki Protocol

The Knowledge Wiki is the compiled awareness layer at `.cleargate/wiki/`. Read it before reading raw delivery files — it surfaces relationships and status that individual raw files do not expose. The wiki is always derived: when a raw file under `.cleargate/delivery/**` contradicts a wiki page, the raw file wins.

---

### §10.1 Directory Layout

```
.cleargate/wiki/
  index.md            ← master page registry (one row per page)
  log.md              ← append-only audit log of all ingest events
  product-state.md    ← synthesised product health snapshot
  roadmap.md          ← synthesised roadmap view
  active-sprint.md    ← synthesised current-sprint progress
  open-gates.md       ← synthesised blocked-item registry
  epics/              ← one page per Epic (EPIC-NNN.md)
  stories/            ← one page per Story (STORY-NNN-NN.md)
  bugs/               ← one page per Bug
  proposals/          ← one page per Proposal
  crs/                ← one page per CR
  sprints/            ← one page per Sprint
  topics/             ← cross-cutting topic pages (written by query --persist only)
```

---

### §10.2 Three Operations

**ingest**

Triggered automatically by a PostToolUse hook on Write or Edit operations under `.cleargate/delivery/**`. When the hook is unavailable, every agent that writes a raw delivery file must invoke the `cleargate-wiki-ingest` subagent directly (protocol-rule fallback — see §10.9). On each ingest: one per-item wiki page is created or updated, one YAML event is appended to `log.md`, and every synthesis page affected by the item is recompiled (`product-state.md`, `roadmap.md`, `active-sprint.md`, `open-gates.md`). Ingest is always safe to re-run.

**query**

Invoked automatically at triage (read-only). Searches the wiki index and existing pages to surface related work items before any new draft begins. Explicit queries use `cleargate wiki query <terms>`. Append `--persist` to write the result as a topic page at `wiki/topics/<slug>.md`. Topic pages are never written by ingest — only by `query --persist`.

**lint**

Enforcement run. Checks for drift between wiki pages and their raw source files. Exits non-zero on any violation; a non-zero exit halts at Gate 1 (Brief) — where the Gate-1-green push (`cleargate_push_item`) also fires. Run with `--suggest` to receive candidate cross-ref patches without blocking (exits 0).

---

### §10.3 Exclusions

Ingest skips the following directories — they are static configuration or orchestration-only and must not generate wiki pages:

- `.cleargate/knowledge/`
- `.cleargate/templates/`
- `.cleargate/sprint-runs/`
- `.cleargate/hook-log/`

---

### §10.4 Page Schema

Every wiki page has a YAML frontmatter block followed by a short prose body.

```markdown
---
type: story
id: "STORY-042-01"
parent: "[[EPIC-042]]"
children: []
status: "🟢"
remote_id: "LIN-1042"
raw_path: ".cleargate/delivery/archive/STORY-042-01_name.md"
last_ingest: "2026-04-19T10:00:00Z"
last_ingest_commit: "a1b2c3d4e5f6..."
repo: "planning"
last_contradict_sha: ""  # optional — populated by ingest Phase 4 (§10.10)
---

# STORY-042-01: Short title

Summary in one or two sentences.

## Blast radius
Affects: [[EPIC-042]], [[service-auth]]

## Open questions
None.
```

Field notes:

- `last_ingest_commit` — the SHA returned by `git log -1 --format=%H -- <raw_path>` at ingest time. Used for idempotency (see §10.7).
- `repo` — derived from `raw_path` prefix: `cleargate-cli/` → `cli`; `mcp/` → `mcp`; `.cleargate/` or `cleargate-planning/` → `planning`. Never manually set.
- `last_contradict_sha` (optional) — populated by ingest Phase 4 (§10.10). Pages without this field MUST continue to pass lint. Value is the SHA returned by `git log -1 --format=%H -- <raw_path>` at the moment Phase 4 last ran.

---

### §10.5 Backlink Syntax

Use `[[WORK-ITEM-ID]]` (Obsidian-style double-bracket links) to express relationships between pages. Every parent/child pair declared in frontmatter must have a corresponding backlink in the body of each page. `cleargate wiki lint` verifies bidirectionality: a `parent:` entry without a matching `[[parent-id]]` reference in the parent's `children:` list is a lint violation.

---

### §10.6 `log.md` Event Shape

One YAML list entry is appended to `wiki/log.md` on every ingest. Fields:

```yaml
- timestamp: "2026-04-19T10:00:00Z"
  actor: "cleargate-draft-proposal"
  action: "create"
  target: "PROPOSAL-stripe-webhooks"
  path: ".cleargate/delivery/pending-sync/PROPOSAL-stripe-webhooks.md"
```

- `timestamp` — ISO 8601 UTC.
- `actor` — subagent name (e.g. `cleargate-wiki-ingest`) or `vibe-coder` for manual writes.
- `action` — one of `create`, `update`, `delete`, `approve`.
- `target` — work-item ID (e.g. `STORY-042-01`).
- `path` — absolute path to the raw source file.

---

### §10.7 Idempotency Rule

Re-ingesting a file is a no-op when **both** of the following are true:

(a) The file content is byte-identical to the content at last ingest.
(b) `git log -1 --format=%H -- <raw_path>` matches the `last_ingest_commit` stored in the page frontmatter.

Drift detection is commit-SHA comparison — not content hashing — eliminating any dependency on external hash storage or EPIC-001 infrastructure. If either condition is false, ingest proceeds and the page is overwritten.

---

### §10.8 Gate Enforcement

`cleargate wiki lint` exits non-zero and blocks execution at:

- **Gate 1 (Brief):** lint must pass before the agent proceeds past the Brief halt.
- **The Gate-1-green push:** lint must pass before `cleargate_push_item` is called.

Lint checks performed:

- Orphan pages — wiki pages whose `raw_path` no longer exists.
- Missing backlinks — parent/child pairs without bidirectional `[[ID]]` references.
- `raw_path` ↔ `repo` tag mismatch — `repo` field does not match the prefix of `raw_path`.
- Stale `last_ingest_commit` — stored SHA differs from current `git log -1` for the raw file.
- Invalidated topic citations — a `wiki/topics/*.md` page cites an item that has been archived or status-set to cancelled.

The gate-check hook (§12.5) runs before ingest; staleness (§12.4) is a lint error.

---

### §10.9 Fallback Chain

Ingest reliability follows a three-level fallback:

1. **PostToolUse hook (primary)** — fires automatically on every Write or Edit under `.cleargate/delivery/**`. No agent action required.
2. **Protocol rule (secondary)** — when the hook is unavailable (e.g. non-Claude-Code environment), every agent that writes a raw delivery file must explicitly invoke the `cleargate-wiki-ingest` subagent before returning.
3. **Lint gate (tertiary)** — `cleargate wiki lint` catches any missed ingest at Gate 1 (Brief) or the Gate-1-green push and refuses to proceed until the page is up to date.

---

### §10.10 Wiki Contradiction Detection

After each ingest pass recompiles synthesis pages (Phase 3), the ingest subagent runs an optional Phase 4 contradiction check on any freshly ingested page whose `status` is `Draft` or `In Review`. Phase 4 is synchronous and advisory — it never blocks ingest, never causes a non-zero exit, and never modifies anything other than the wiki page's `last_contradict_sha` field and the append-only `wiki/contradictions.md` log.

Rules:

- **Trigger point.** Phase 4 fires after Phase 3 (synthesis recompile) completes, once per ingested page, only when the page status is `Draft` or `In Review`. All other statuses (`Approved`, `Done`, `Active`, etc.) are skipped silently.
- **Neighborhood rule.** The neighborhood for a given draft page consists of: (1) all pages explicitly cited via `[[ID]]` in the raw draft body, (2) the draft's parent epic page, and (3) any sibling stories under the same parent epic. The neighborhood is capped at 12 pages; when more than 12 qualify, the closest-cited pages take priority and the finding record sets `truncated: true`.
- **Idempotency rule.** Phase 4 is skipped when `last_contradict_sha` stored on the wiki page equals `git log -1 --format=%H -- <raw_path>` at the moment Phase 4 would run. A match means the draft has not changed since the last contradiction check; no re-check is needed.
- **Status filter.** Only `Draft` and `In Review` raw-file statuses trigger Phase 4. The filter reads the raw frontmatter `status` field, not the wiki page's emoji status field.
- **Advisory exit.** Phase 4 always exits 0. Contradiction findings are written to `wiki/contradictions.md` as an append-only YAML log (see §10.10 schema). No gate is blocked. A future enforcing-mode proposal must clear the calibration precondition (see below) before Phase 4 may exit non-zero.
- **Subagent contract.** Phase 4 invokes the `cleargate-wiki-contradict` subagent with `{ draft_path, neighborhood: string[] }` inputs. The subagent emits zero or more `contradiction: <draft-id> vs <neighbor-id> · <claim-summary ≤80 chars>` lines plus one paragraph of reasoning per finding, then exits 0.
- **Log schema.** Each finding appended to `wiki/contradictions.md` has the keys: `draft`, `neighbor`, `claim`, `ingest_sha`, `truncated`, `label`. The `label` field is `null` until a human applies `true-positive`, `false-positive`, or `nitpick`.

**Calibration plan.** Phase 4 enters advisory-only mode unconditionally for an initial 30-day calibration window. A future enforcing-mode proposal may be filed only after the advisory log contains at least 20 human-labeled findings with a true-positive rate of ≥ 80%. Until that precondition is met, any proposal to make Phase 4 exit non-zero is out of scope.

---

## 11. Document Metadata Lifecycle

Every work item file managed by ClearGate carries timestamp and version fields that track when it was created, last modified, and last pushed to the remote PM tool. This section defines those fields, how they are populated, and when they are frozen.

---

### §11.1 Field Semantics

| Field | Type | Description |
|---|---|---|
| `created_at` | ISO 8601 UTC string | Timestamp set once on first `cleargate stamp` invocation. Never updated after creation. |
| `updated_at` | ISO 8601 UTC string | Timestamp updated on every `cleargate stamp` invocation that changes the file. Equal to `created_at` at creation time. |
| `created_at_version` | string | Codebase version string at time of first stamp. See §11.3 for format. Never updated after creation. |
| `updated_at_version` | string | Codebase version string at time of most recent stamp. Equal to `created_at_version` at creation time. |
| `server_pushed_at_version` | string \| null | Codebase version string at the time this file was last successfully pushed via `cleargate_push_item`. `null` until the first push succeeds. Present on write-template files (epic/story/bug/CR/proposal) only. |

---

### §11.2 Stamp Invocation Rule

After any Write or Edit operation on a file under `.cleargate/delivery/`, the author must invoke:

```
cleargate stamp <path>
```

This updates `updated_at` and `updated_at_version` in place. The `created_at` and `created_at_version` fields are set on the first invocation and are never overwritten thereafter.

In Claude Code environments, a PostToolUse hook fires automatically on Write/Edit under `.cleargate/delivery/**` and calls `cleargate stamp` without any agent action (hook wiring is STORY-008-06 scope, M3). Until that hook is active, every agent that writes a delivery file must call `cleargate stamp` explicitly before returning.

---

### §11.3 Dirty-SHA Convention

The version string embedded in `created_at_version` and `updated_at_version` is produced by `getCodebaseVersion()` (STORY-001-03). Its format follows this precedence:

1. If inside a git repo and `git status --porcelain` is non-empty (uncommitted changes present): `<short-sha>-dirty` (e.g. `a3f2e91-dirty`).
2. If inside a git repo and the working tree is clean: `<short-sha>` (e.g. `a3f2e91`), where `<short-sha>` is the 7-character output of `git rev-parse --short HEAD`.
3. If no git repo is present but a `package.json` is found in an ancestor directory: the `version` field value from that file (e.g. `1.4.2`).
4. If neither is available: the literal string `"unknown"`, and a warning is emitted to stderr.

The `-dirty` suffix signals that the version string was captured from a working tree with uncommitted changes. Consumers comparing version strings must treat `a3f2e91-dirty` and `a3f2e91` as belonging to the same base commit but different workspace states.

---

### §11.4 Archive Immutability

Files that have been moved to `.cleargate/delivery/archive/` are frozen. `cleargate stamp` is a no-op on any path matching `.cleargate/delivery/archive/`. No fields are written, no file bytes change.

Rationale: archived files represent the accepted state at push time. Retroactively updating their timestamps would break the audit trail used by the wiki lint stale-detection check (§11.6).

---

### §11.5 Git-Absent Fallback

When `cleargate stamp` runs outside a git repository (e.g. a freshly unzipped scaffold before `git init`), the version resolution falls back in order:

1. Walk up from the current working directory looking for a `package.json`. If found, use its `version` field as the version string.
2. If no `package.json` ancestor exists, use the literal string `"unknown"` and emit a warning to stderr: `"cleargate stamp: cannot determine codebase version — no git repo or package.json found"`.

The `"unknown"` value is valid frontmatter; downstream consumers (stamp, lint, wiki-ingest) must accept it without error.

---

### §11.6 Stale Detection Threshold

A wiki page for a work item is considered **stale** when the following condition holds:

> The number of merge commits in `git log --merges <updated_at_version>..HEAD -- <raw_path>` is ≥ 1.

That is: if at least one merge commit has landed on the default branch since the file was last stamped, the wiki page is out of date and `cleargate wiki lint` reports a stale-detection violation.

Implementation notes:
- `updated_at_version` must be a resolvable git ref (short SHA or tag). If the value is `"unknown"` or `"strategy-phase-pre-init"`, lint skips the stale check for that file and emits a warning rather than an error.
- The `-dirty` suffix is stripped before resolving the ref: `a3f2e91-dirty` → `a3f2e91`.
- This check is consumed by `cleargate wiki lint` (STORY-008-07) and the wiki-ingest subagent's idempotency evaluation (§10.7).

---

### §11.7 Hierarchy Keys

Two optional frontmatter keys declare canonical hierarchy for every work item (STORY-015-06):

- `parent_cleargate_id: <string | null>` — the canonical ClearGate ID of the parent work item (e.g. `"EPIC-022"`). Use for items that belong to an epic or parent story. Null for top-level items.
- `sprint_cleargate_id: <string | null>` — the canonical ClearGate ID of the owning sprint (e.g. `"SPRINT-15"`). Null for off-sprint or speculative items.

**Relationship to legacy keys.** The existing fields `parent_ref`, `parent_epic_ref`, `sprint_id`, and `sprint` remain the **authoritative** source of parent/sprint membership until a future deprecation sprint explicitly retires them. `parent_cleargate_id` and `sprint_cleargate_id` are additive mirrors — consumers must not assume both forms are always present simultaneously. A future deprecation notice will be added to this section when the legacy keys are retired.

**Propagation.** The `cleargate push` command forwards both keys into the `cleargate_push_item` MCP call payload via the existing `payload.*` shallow-clone path. The `cleargate wiki ingest` command copies them verbatim into the compiled wiki page frontmatter. The backfill script `.cleargate/scripts/backfill_hierarchy.mjs` sniffs legacy keys to populate missing values one-time on existing corpus files.

**Idempotency contract.** Both keys default to `null` in templates. The backfill script skips any file where both keys are already non-null. Re-running the backfill is a byte-identical no-op.

---

## 12. Token Cost Stamping & Readiness Gates

### §12.1 Overview
Two-capability bundle: (1) `draft_tokens` frontmatter stamp populated by a PostToolUse hook from the sprint token ledger; (2) closed-set predicate engine + `cleargate gate check` CLI writing `cached_gate_result` into frontmatter, blocking wiki-lint on enforcing types (Epic/Story/CR/Bug), advising on Proposals.

### §12.2 Token stamp semantics
- Idempotent within a session (re-stamp = no-op when last_stamp + totals unchanged).
- Accumulative across sessions: `sessions[]` gains one entry per session; top-level totals are sums; `model` is comma-joined across distinct values.
- Missing ledger row → `draft_tokens:{…null…, stamp_error:"<reason>"}` — never fabricate.
- Archive-path stamping is a no-op (freeze-on-archive).
- Sprint files record only planning-phase tokens; story tokens attribute to their own files (no double-count).

### §12.3 Readiness gates
- Central definitions: `.cleargate/knowledge/readiness-gates.md` keyed by `{work_item_type, transition}`.
- Predicates are a CLOSED set (6 shapes): `frontmatter(...)`, `body contains`, `section(N) has count`, `file-exists`, `link-target-exists`, `status-of`. No shell-out, no network.
- Severity: Proposal = advisory (exit 0, records `pass:false` without blocking). Epic/Story/CR/Bug = enforcing (exit non-zero at CLI; wiki lint refuses).

### §12.4 Enforcement points
- v1: `wiki lint` only. MCP-side `push_item` enforcement is deferred post-PROP-007.
- Staleness: `cached_gate_result.last_gate_check < updated_at` → lint error for ALL types (catches silent hook failures).

### §12.5 Hook lifecycle
- PostToolUse `stamp-and-gate.sh` chains `stamp-tokens → gate check → wiki ingest` on every Write/Edit under `.cleargate/delivery/**`. Exit always 0.
- SessionStart `session-start.sh` pipes `cleargate doctor --session-start` (≤100 LLM-tokens, ≤10 items + overflow pointer) into context.
- Every invocation logs to `.cleargate/hook-log/gate-check.log`; `cleargate doctor` surfaces last-24h failures.

### §12.6 Cross-references
- §4 Phase Gates: "Gate 1 (Brief) is machine-checked via `cleargate gate check`; see §12."
- §10.8 Wiki-lint enforcement: extended by the gate-check hook; staleness check added per §12.4.

---

## 13. Scaffold Manifest & Uninstall

### §13.1 Overview
Three-surface model: package manifest (shipped in `@cleargate/cli`), install snapshot (`.cleargate/.install-manifest.json` written at init), current state (live FS). Drift is classified pairwise into 4 states (clean / user-modified / upstream-changed / both-changed) + `untracked` for user-artifact tier. SHA256 over normalized content (LF / UTF-8 no-BOM / trailing-newline) is the file identifier.

### §13.2 Install
`cleargate init` copies the bundled payload, then writes `.cleargate/.install-manifest.json`:

```json
{
  "cleargate_version": "0.2.0",
  "installed_at": "2026-04-19T10:00:00Z",
  "files": [
    {"path": ".cleargate/knowledge/cleargate-protocol.md", "sha256": "…", "tier": "protocol", "overwrite_policy": "merge-3way", "preserve_on_uninstall": "default-remove"}
  ]
}
```

If a `.cleargate/.uninstalled` marker exists at init time, init prompts "Detected previous ClearGate install … Restore preserved items? [Y/n]". Y = blind-copy preserved paths back into the new install (v1); mismatches log a warning and do not fail.

### §13.3 Drift detection
`cleargate doctor --check-scaffold` compares the three surfaces and writes `.cleargate/.drift-state.json` (daily-throttled refresh). SessionStart-triggered refresh runs at most once per day. Agent never auto-overwrites on upstream-changed drift — it emits a one-line advisory at triage; `cleargate upgrade` is always human-initiated. `user-artifact` tier (sha256: null) is silently skipped in drift output; surfaces only in uninstall preview.

### §13.4 Upgrade
`cleargate upgrade [--dry-run] [--yes] [--only <tier>]` drives a three-way merge for `merge-3way` policy files. Per-file prompt: `[k]eep mine / [t]ake theirs / [e]dit in $EDITOR`. Execution is incremental: successes are committed to disk + `.install-manifest.json` updated before the next file is processed; a mid-run error leaves earlier successes intact.

### §13.5 Uninstall
`cleargate uninstall [--dry-run] [--preserve …] [--remove …] [--yes] [--path <dir>] [--force]` is preservation-first. Defaults: `.cleargate/delivery/archive/**`, `FLASHCARD.md`, `sprint-runs/*/REPORT.md`, `pending-sync/**` → keep. `.cleargate/knowledge/`, `.cleargate/templates/`, `.cleargate/wiki/`, `.cleargate/hook-log/` → remove. Safety rails: typed confirmation (project name), single-target (no recursion into nested `.cleargate/`), refuse on uncommitted manifest-tracked changes without `--force`, CLAUDE.md marker-presence check. Always-removed (no prompt): `.claude/agents/*.md`, ClearGate hooks, `flashcard/` skill, CLAUDE.md CLEARGATE block, `@cleargate/cli` in `package.json`, `.install-manifest.json`, `.drift-state.json`. Writes `.cleargate/.uninstalled` marker:

```json
{
  "uninstalled_at": "2026-04-19T11:00:00Z",
  "prior_version": "0.2.0",
  "preserved": [".cleargate/FLASHCARD.md", ".cleargate/delivery/archive/**"],
  "removed": [".cleargate/knowledge/cleargate-protocol.md"]
}
```

Future `cleargate init` in the same dir detects this marker and offers restore.

### §13.6 Publishing notes
`MANIFEST.json` is built at `npm run build` (prebuild step in `cleargate-cli/package.json`) and shipped in the npm tarball (`files[]`). Never computed at install time. `generate-changelog-diff.ts` diffs `MANIFEST.json` between the previous published version and the current one at release time; CHANGELOG.md auto-opens with a "Scaffold files changed" block per release. Content-identical entries (path-moved-only, metadata-changed-only) are collapsed to avoid noise.

---

## 14. Multi-Participant Sync

### §14.1 Sync matrix & authority split

**Rule:** Remote is authoritative for status, assignees, and comments; local is authoritative for work-item body.

When both sides change the same field, the authoritative side wins without prompt (except body+body — see §14.2). This split prevents accidental overwrites of carefully authored local prose while still tracking PM-tool state transitions faithfully. Source: EPIC-010 §4 authority table; `cleargate-cli/src/commands/sync.ts` conflict-detector snapshot shape.

### §14.2 Conflict resolution

**Rule:** content+content → interactive 3-way merge prompt; status+status → remote-wins silently; delete+edit (either direction) → refuse; unrecognized conflict shape → `halt`.

Nine conflict states are recognized (`content-content`, `status-status`, `remote-delete-local-edit`, `local-delete-remote-edit`, `remote-only`, `local-only`, `remote-status-only`, `local-content-only`, `unknown`). Resolution values are `three-way-merge`, `remote-wins`, `local-wins`, `refuse`, `halt`, `remote-only-apply`, `local-only-apply`. The `halt` resolution surfaces an actionable error rather than silently discarding data. Source: `cleargate-cli/src/lib/conflict-detector.ts`; `cleargate-cli/src/commands/sync.ts:307-367`.

### §14.3 Sync ordering invariant

**Rule:** `cleargate sync` MUST execute pull → classify → resolve → push in that order; reversal amplifies conflicts.

Executing a push before all pulls are complete risks overwriting a remote state change that the local resolve step would have otherwise detected. The 6-step driver enforces this order at the code level; a unit test asserts step ordering as a dataflow invariant. Source: `cleargate-cli/src/commands/sync.ts` driver doc comment (steps 1–6); R2 mitigation.

### §14.4 Identity resolution precedence

**Rule:** `.cleargate/.participant.json` → `CLEARGATE_USER` env → `git config user.email` → `host+user` fallback.

Identity is per-repo, not global, so two participants on the same machine with different `.participant.json` files get distinct attribution. The env var override allows CI or scripted sync. Source: `cleargate-cli/src/lib/identity.ts`; R5 mitigation.

### §14.5 Stakeholder-authored proposal flow

**Rule:** Remote items labeled `cleargate:proposal` (configurable via `CLEARGATE_PROPOSAL_LABEL` env) and absent locally land in `pending-sync/PROPOSAL-NNN-remote-<slug>.md` with `source: "remote-authored"` and `approved: false`.

This prevents external stakeholders from bypassing the approval gate: the proposal arrives locally for human review before any push. The label name is configurable so teams can map to their own PM-tool taxonomy. Source: `cleargate-cli/src/lib/intake.ts`; `cleargate-cli/src/commands/sync.ts:167-183`.

### §14.6 Comment policy

**Rule:** Comments pull as read-only snapshots, active items only (current sprint + last 30 days), rendered under `## Remote comments` with literal-string delimiters. Never pushed upstream.

Pulling comments for stale items wastes tokens and clutters archives; the 30-day window keeps recent feedback visible. The `## Remote comments` block uses byte-stable literal delimiters so repeated pulls are idempotent. A 429 rate-limit on any single item causes that item to be skipped silently. Source: `cleargate-cli/src/lib/wiki-comments-render.ts`; `cleargate-cli/src/lib/active-criteria.ts`; R4/R6 mitigations.

### §14.7 Push preconditions

**Rule:** `cleargate_push_item` requires `payload.approved === true` unless the caller passes `skipApprovedGate: true` (reserved for `sync_status` internal callers). `pushed_by` is stamped from `members.email` via JWT `sub` → member lookup, NOT the raw JWT `sub` value.

The `skipApprovedGate` bypass is an internal escape hatch for status-only updates triggered by `cleargate_sync_status`; it is not exposed as a public CLI flag. The email lookup ensures human-readable attribution independent of UUID-based JWT subjects. Source: `mcp/src/tools/push-item.ts`; flashcard `#mcp #jwt #attribution`.

### §14.8 Revert policy

**Rule:** `cleargate push --revert <id>` soft-reverts by calling `cleargate_sync_status` with `new_status: "archived-without-shipping"`; it never deletes the remote item. `--force` is required when local `status: done`.

Soft revert preserves audit history on the PM-tool side. Refusing to revert done items without `--force` prevents accidental archival of shipped work. Source: `cleargate-cli/src/commands/push.ts` revert branch; `cleargate-cli/src/cli.ts:268-273`.

### §14.9 Sync cadence

**Rule:** All sync actions are manual (`cleargate sync` / `cleargate pull <id>` / `cleargate push <file>`). The SessionStart hook SUGGESTS via `cleargate sync --check` — it never auto-pulls or auto-pushes. MCP probes are throttled to at most one per 24 hours per repo.

Auto-push without human review would bypass the approval gate; auto-pull would overwrite in-progress local edits without conflict detection. The 24-hour throttle prevents session-start latency accumulation. Throttle state is stored in `.cleargate/.sync-marker.json` with schema `{ "last_check": "<ISO-8601>" }` (v1; unknown keys are ignored on read for forward compatibility). Source: `.claude/hooks/session-start.sh`; `.cleargate/.sync-marker.json`; R7 mitigation.

## 21. Status Vocabulary

Raw work-item frontmatter `status:` values must be drawn from this canonical set:

| Status | Meaning |
|---|---|
| `Draft` | Newly authored; not yet ambiguity-gated |
| `Ready` | Ambiguity gate passed; eligible for sprint planning |
| `Approved` | Epic approved for execution |
| `Planned` | Sprint planned; not yet started |
| `Active` | Work in progress |
| `Completed` | Shipped (sprints, epics) |
| `Done` | Shipped (stories) — treated as alias of `Completed` for terminal-status checks |
| `Abandoned` | Work deliberately stopped without shipping. The artifact stays in `archive/` for historical record. Not eligible for the Active index. |
| `Closed` | Closed without shipping (administrative close) |
| `Resolved` | Bug or CR confirmed resolved |

### §21.1 Index Token Ceiling

`cleargate wiki lint` enforces a ceiling on `.cleargate/wiki/index.md` size, measured as `bytes ÷ 4` approximate tokens. Default ceiling: `8000`. Override via `.cleargate/config.yml`:

```yaml
wiki:
  index_token_ceiling: 8000
```

Exceeding the ceiling fails `cleargate wiki lint` (enforcement mode). Under `--suggest`, the usage percentage is reported but the check does not fail. Reference: EPIC-015.

### §21.2 Ingest Bucket Allowlist

By default the wiki ingests every bucket (`epics`, `stories`, `sprints`, `proposals`, `initiatives`, `crs`, `bugs`, `spikes`). A repo can narrow this to an allowlist via `.cleargate/config.yml`:

```yaml
wiki:
  ingest_buckets:
    - epics
    - sprints      # sprint reports
    - crs
    - bugs
    - initiatives
```

When set, only the listed buckets get per-item wiki pages, index rows, and synthesis listings — `cleargate wiki build`, `cleargate wiki ingest`, and the PostToolUse ingest hook all skip every other bucket (exit 0, no-op). Omit the key entirely to ingest all buckets. This is how a repo keeps high-churn `stories` (and unused `proposals`) out of the wiki while still tracking them in the raw delivery tree and sprint reports.

---

## Type & Payload Contract

Every item pushed to the MCP server (`cleargate_push_item`) must conform to the following contract. Adapter authors implementing new PM-tool integrations MUST satisfy all requirements below before the server accepts the payload.

### Open-type validator

`type` is validated as an open vocabulary (new types do not require a server upgrade):

```
z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/)
```

Applied after lowercase-normalize. Types that fail this regex are rejected at the MCP transport layer with an L1 `TYPE_INVALID` error.

### KNOWN_TYPES — advisory registry (9 entries)

These 9 types have first-class gate and reporting support. Any type outside this list passes validation but triggers an L2 `TYPE_UNKNOWN` warning in the server log.

| Type | Description |
|---|---|
| `initiative` | High-level strategic investment |
| `epic` | Feature-level work breakdown |
| `story` | Executable unit of work (one sprint, one commit) |
| `bug` | Defect report + fix |
| `cr` | Change request — scope amendment or approach change |
| `proposal` | Stakeholder-authored item awaiting triage |
| `sprint` | Sprint plan artifact |
| `sprint_report` | Sprint closeout report |
| `spike` | Bounded pre-sprint discovery charter |

### RESERVED_PAYLOAD_KEYS (5 entries)

The following keys are set exclusively by the MCP server or the CLI sync engine. Callers MUST NOT include them in `payload`; the server strips or rejects them on receipt.

| Key | Owner | Reason |
|---|---|---|
| `cleargate_id` | CLI stamp engine | Must match the frontmatter `cleargate_id` — server validates; caller cannot override |
| `pushed_by` | Server | Set from JWT `sub` → member lookup; client-supplied value is ignored |
| `pushed_at` | Server | Set to server UTC timestamp; client-supplied value is ignored |
| `last_synced_body_sha` | Sync engine | Conflict-detection cursor; tampering causes spurious diffs |
| `_version` | Server | Internal optimistic-lock counter; client tampering causes 409 |

### Minimum payload contract

Every push MUST include:

| Key | Level | Note |
|---|---|---|
| `cleargate_id` | **Required (L1 error if absent)** | `TYPE-NNN` or 5-digit numeric (see formats below) |
| `type` | **Required (L1 error if absent)** | Open vocabulary, validated by regex above |
| `title` | Recommended (L2 warning if absent) | Human-readable item title |
| `status` | Recommended (L2 warning if absent) | From §21 status vocabulary |

### `payload.origin` convention

`payload.origin` identifies the surface that produced the push. Gates fire or are bypassed based on this value:

| Value pattern | Gate behavior |
|---|---|
| `cleargate-cli` | All readiness gates run (standard path) |
| `adapter:<vendor>` | Gates bypass — adapter is assumed to have already validated externally. Example: `adapter:linear`, `adapter:jira` |
| `system:<service>` | Gates bypass — system-generated push (e.g. `system:reporter`, `system:wiki-ingest`) |
| absent / null | Treated as `cleargate-cli`; gates run |

### `cleargate_id` formats (2 valid forms)

| Format | Pattern | Example | Used for |
|---|---|---|---|
| Type-prefixed | `TYPE-NNN` (TYPE = uppercase letters, NNN = 1–5 digits) | `STORY-027-05`, `EPIC-003` | All standard work items |
| 5-digit numeric | Exactly 5 decimal digits | `00042` | Legacy PM-tool remote IDs; internal migration use only |

### L1 errorCode taxonomy (7 codes)

L1 errors cause the MCP tool call to return a structured error payload with shape `{ code, message, hint }` and HTTP 422 (or equivalent MCP error).

| Code | Condition | Hint |
|---|---|---|
| `TYPE_INVALID` | `type` fails regex validation | Normalize to lowercase-kebab; max 64 chars |
| `ID_INVALID` | `cleargate_id` does not match either valid format | Use `TYPE-NNN` or 5-digit numeric |
| `ID_MISSING` | `cleargate_id` absent from payload | Required field — stamp it before push |
| `TYPE_MISSING` | `type` absent from payload | Required field |
| `RESERVED_KEY` | Payload contains a `RESERVED_PAYLOAD_KEYS` member | Remove the key; server owns it |
| `APPROVED_GATE` | `payload.approved !== true` and `skipApprovedGate` not set | Set `approved: true` after human sign-off |
| `PROJECT_NOT_FOUND` | JWT `project_id` claim has no matching project row | Re-join with a valid invite URL |

### L2 warningCode taxonomy (3 codes)

L2 warnings are non-blocking. The push succeeds, but the server appends `[advisory: <code>]` to the item body and logs the warning.

| Code | Condition | Field |
|---|---|---|
| `TITLE_MISSING` | `title` absent or empty | `title` |
| `STATUS_MISSING` | `status` absent or not in §21 vocabulary | `status` |
| `TYPE_UNKNOWN` | `type` is not in `KNOWN_TYPES` advisory registry | `type` |

---

## Codebase / PM-Tool Boundary

**Rule:** `cleargate-cli/src/**` and `.claude/**` MUST NOT import any PM-tool SDK. PM-tool adapters live exclusively in `mcp/src/adapters/`. Credentials and connection config live in admin DB rows, configured via the admin console UI.

### Rationale

ClearGate must remain PM-tool-agnostic at the CLI and agent-definition layer so that:
1. The CLI can be installed in any repo regardless of which PM tool the team uses.
2. Agent prompts (`.claude/**`) do not hard-code vendor assumptions.
3. A new PM-tool adapter can be added by dropping a file in `mcp/src/adapters/` without touching `cleargate-cli/` or `.claude/`.

### Forbidden import patterns

Any `import` or `require` statement in `cleargate-cli/src/**/*.ts` or `.claude/**/*.{ts,sh,md}` that references the following patterns fails CI:

| Pattern | PM tool |
|---|---|
| `@linear/sdk` | Linear |
| `linear-sdk` | Linear (alt package) |
| `jira-client` | Jira |
| `node-jira-client` | Jira (alt package) |
| `jira.js` | Jira (alt package) |
| `azure-devops` | Azure DevOps |
| `@atlassian/` | Atlassian family |

### Allowed surface for PM-tool code

`mcp/src/adapters/` is the only surface where PM-tool SDK imports are permitted. Each adapter file is responsible for importing its SDK, mapping ClearGate payload shapes to PM-tool API calls, and surfacing errors as structured MCP errors.

### CI enforcement

`scripts/ci-no-pm-sdk.mjs` scans the two forbidden surfaces and exits non-zero on any match. Run via:

```
node scripts/ci-no-pm-sdk.mjs
npm run check:no-pm-sdk
```

Comments (lines starting with `//`, `#`, `/*`, or `*`) are excluded from the scan. The script prints `✓ no forbidden PM-SDK imports` on a clean tree.

---

## 22. Sprint Execution Autonomy

Once a sprint's frontmatter / state.json carries `sprint_status: "Active"`, no agent
— Orchestrator, Architect, Developer, QA, DevOps, or Reporter — MAY issue a user-facing
prompt (`AskUserQuestion`, `ExitPlanMode`, interactive stdin read) EXCEPT under one of the
five true-blocker cases below.

**Rationale:** all ambiguity is supposed to clear at Gate 2 (pre-sprint). Mid-execution
questions are evidence that Gate 2 was incomplete; the right answer is to surface those
gaps to the next sprint's Gate-2 checklist, not to interrupt current execution.

**Scope:** the contract activates at sprint Active. Architect's Sprint Design Review
(SDR) — which runs after initial Gate 2 but before sprint goes Active — is EXEMPT.

### True blockers (escalation REQUIRED)

1. **Destructive action approval.** force-push, `git reset --hard`, dropping a DB table,
   deleting an untracked file the user might own, killing a process. Ask before performing.
2. **Secret / credential handling.** Anything that would require reading from .env files,
   fetching a secret, or persisting credential material. Ask before reading or writing.
3. **User-intent decision.** A question whose answer is genuinely "what does the user
   want?" and cannot be inferred from sprint goal, story Gherkin, or prior decisions.
4. **True technical impossibility.** Required infrastructure unavailable (e.g. test DB
   unreachable, MCP down). Write blockers report AND surface to user.
5. **Spec-internal contradiction.** Story Gherkin contradicts itself, or two stories
   in the same wave specify incompatible behavior on a shared surface. Write blockers
   report — Gate-1/Gate-2 escape that human must triage.

### Not blockers — agent decides

- Choice between two reasonable implementations that both meet the acceptance Gherkin.
- Test-pattern selection within established repo precedent.
- Minor wording / UX copy choices. Default to conservative; document in dev report.
- Refactor-or-not within the touched surface. Default NO refactor.
- Library version selection within the Architect's pre-validated table.
- Error-message phrasing.
- Log-line format.

**When in doubt: write a blockers report (`STORY-NNN-NN-<agent>-blockers.md`) and
return BLOCKED. Do not interpret silence as permission to proceed on ambiguous scope.**

## 23. Execution Contract

Every sprint executes the same way: the Orchestrator runs each Architect-planned wave as
one `parallel()` Workflow — via the Workflow tool (`/workflows`) — of worktree-isolated
per-story **segments** that return a schema-typed verdict, consolidated at a serial
**barrier**. This section is the binding contract for that flow. It **inherits §22** — every
true-blocker rule, the autonomy contract, and the five true-blocker kinds carry over
unchanged; §23 adds the wave-execution-specific invariants. There is no alternate dispatch
path: if the Workflow tool is unavailable, the Orchestrator halts rather than degrading.
A host whose adapter declares `dispatchMode: serial` (no Workflow primitive) is installed
with the serial contract of §23.5 instead; it is that host's only dispatch path, not a
fallback a wave-parallel host may choose.

### 23.1 Segment verdict schema (discriminated union)

Every segment returns exactly one verdict object. The discriminant is `verdict`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `verdict` | `'GREEN' \| 'ESCALATED' \| 'BLOCKED'` | always | the discriminant |
| `storyId` | string | always | the story this segment executed (e.g. `STORY-033-04`) |
| `runId` | string | always | the segment's stable, distinct `RUN_ID` |
| `devSha` | string | always | Developer commit SHA |
| `qaSha` | string | always | QA-Verify commit SHA |
| `archSha` | string | optional | Architect-pass SHA (standard lane only) |
| `flashcards_flagged` | string[] | always (may be empty) | cards processed at the between-wave barrier |
| `counters` | `{ qa_bounces, arch_bounces, breaker_hits }` | always | all three numeric |
| `tokens` | `{ input, output, cache_creation, cache_read, model }` | always | per-segment cost the ledger consumes |
| `blocker` | `{ type, message }` | **required iff `verdict != GREEN`** | `type` ∈ the five §22 true-blocker kinds |

A `blocker.type` is one of the five §22 true-blocker kinds: `destructive`, `secret`,
`user-intent`, `technical-impossibility`, `spec-contradiction`. The validator
(`validateVerdicts`, exported from `.cleargate/scripts/launch_wave.mjs`) accepts a
well-formed verdict array and **raises a validation Error naming the offending `storyId`**
on any malformed verdict (missing required field, unknown `verdict` discriminant, or a
non-GREEN verdict without a valid `blocker`). The named segment is marked `ESCALATED` and
gets **no ledger row**; sibling GREEN verdicts consolidate normally.

### 23.2 RUN_ID attribution invariant

Per the STORY-033-01 spike, `agent()` fires `SubagentStop` with the **orchestrator**
transcript/session_id even under worktree isolation, and `PreToolUse:Task` never fires under
workflows — so per-agent transcript attribution is **dead**. The barrier therefore writes
**one ledger row per segment from `verdict.tokens`, keyed by the segment's `RUN_ID`**
(STORY-033-02 owns the write; this contract owns producing the `tokens` and the `RUN_ID`).
Each segment mints a **stable, distinct** `RUN_ID` so sibling segments never collide on the
RUN_ID-keyed `.session-totals.json` row, and so a `resumeFromRunId` replay re-keys the same
segment. The RUN_ID attribution invariant: per-story cost is attributed solely via the
verdict's `tokens` written at the barrier under the segment's `RUN_ID` — never via
`SubagentStop`, never via a dispatch marker.

### 23.3 Barrier consolidation + serial merge rule

At the barrier the Orchestrator, in order: (1) runs `validateVerdicts` over the returned
array; (2) processes the union of every segment's `flashcards_flagged[]` and writes the
`.processed-<hash>` markers **between waves** (the relocated flashcard gate — set
`SKIP_FLASHCARD_GATE=1` pre-launch, restore at the barrier); (3) **serially** merges each
GREEN `story/STORY-X` to `sprint/S-NN` — **one worktree at a time, never two concurrently**
(the shared sprint branch is a single-writer axis; per-worktree `.git` indexes mean the
pre-commit surface gate never races, but the merge does); (4) restores the prior
`SKIP_FLASHCARD_GATE` value. A mixed GREEN+ESCALATED wave merges the GREEN stories
immediately (serial), then resumes only the ESCALATED segment via `resumeFromRunId` — GREEN
segments short-circuit on resume (zero new ledger rows). Segments are **idempotent** so a
resume or partial-failure re-run produces no duplicate side effects.

### 23.4 In-segment true-blocker re-map (§22 inheritance)

A segment runs inside a `parallel()` Workflow that **cannot halt for a human mid-run**, so
the synchronous-Ask escalation form of §22 is **forbidden in-segment**. When a segment hits
a §22 destructive or secret condition (or any of the five true-blocker kinds), it RETURNS
`verdict: BLOCKED` with `blocker.type ∈ {destructive, secret, user-intent,
technical-impossibility, spec-contradiction}` and a `blocker.message`, and writes a blockers
report — it issues **no `AskUserQuestion`**. The Orchestrator halts the wave loop on the
`BLOCKED`/`ESCALATED` verdict and surfaces it to the human, then resumes via
`resumeFromRunId` after resolution. Fully autonomous up to that halt (§22 autonomy contract,
§6 Q3): once Gate 2 is signed off, every wave auto-launches with no per-wave "go"; only a
non-GREEN verdict interrupts.

### 23.5 Serial dispatch contract (`dispatchMode: serial`)

Hosts without a Workflow primitive run every wave one story at a time through `.cleargate/scripts/dispatch_serial.mjs`, their generated rendering of the sprint-execution playbook, and its `dispatch-serial.md`. §22 applies unchanged. Differences from §23.1–§23.4:

- **Verdict (§23.1).** Same envelope, validated by `validateVerdicts(verdicts, { mode: 'serial' })`. `tokens` is either the measured object or exactly `{ "metering": "unavailable" }`; a non-GREEN verdict may carry `devSha: null` / `qaSha: null` when no commit exists. GREEN still requires both SHAs. The default mode is unchanged.
- **Attribution (§23.2).** There is no RUN_ID-keyed barrier row. The host's own dispatch hook chain attributes each role dispatch; when the host exposes no verifiable usage, nothing is written to the usage ledger — never a zero row.
- **Flashcards (§23.3).** The gate runs between every pair of consecutive stories (`cleargate-enforcement.md` §4.3) and is never suppressed.
- **Merge (§23.3).** DevOps merges each GREEN story as soon as it passes — one worktree at a time.
- **Blockers (§23.4).** A non-GREEN verdict halts the loop synchronously in the orchestrator's own turn; `dispatch_serial.mjs next --resume` re-dispatches only the blocked story after the human resolves it.

## Guidance Surface Reach

A rule is only as useful as the surface it is written on. Three surfaces carry authoring
and execution guidance in this repo, and each reaches a different audience at a different
moment:

| Surface | Reaches | At what moment |
|---|---|---|
| Template `<instructions>` block | the **drafting** agent only — stripped from every authored instance | draft time |
| An agent's own `.md` (`.claude/agents/*.md`) | that **executing** agent | dispatch time |
| Always-on `CLAUDE.md` | every agent in every session | **before** a template is chosen — the only surface reachable at triage |

Authored instances carry zero `<instructions>` blocks (FLASHCARD 2026-08-25 `#agents
#scaffold #danger`, EPIC-054) — the block is stripped once drafting is done, so it never
reaches an agent that executes against the finished document. A rule an executing agent
needs cannot live only in a template; a rule needed before any template is chosen cannot
live anywhere but `CLAUDE.md`. Placing a rule on the wrong surface does not make it wrong —
it makes it unreachable by the agent who needed it.
