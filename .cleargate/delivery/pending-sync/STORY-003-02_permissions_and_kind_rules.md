---
story_id: STORY-003-02
parent_epic_ref: EPIC-003
parent_cleargate_id: null
sprint_cleargate_id: null
carry_over: false
status: Draft
approved: true
ambiguity: 🟢 Low
context_source: EPIC-003 §2 (permissions) · CR-002 C1 (approved 2026-10-16) · architecture.md §5.2 (source-kind lines), §7.2, §7.3, D-06, D-07, D-25 · SPRINT-02 decomposition brief contracts 2 and 4 · verified src/core/config.ts
actor: AI coding agent
complexity_label: L2
parallel_eligible: y
dep_predecessors: []
expected_bounce_exposure: low
lane: standard
db_write_set: []
deferred_verification: []
created_at: 2026-10-16T18:45:00Z
updated_at: 2026-10-16T18:45:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T19:23:59Z
  transition: ready-for-execution
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id STORY-003-02
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T17:47:43Z
  sessions: []
---

# STORY-003-02: Permission evaluation and source-kind rules
**Complexity:** L2 — two pure library modules (permission decision, `kb_instructions.md` source-kind lines). No I/O, no command.

## 1. The Spec (The Contract)

### 1.1 User Story
As a user who chose how much the agent may ingest on its own, I want one place that decides — from my `ingest.permission` mode and whitelist — whether a source is allowed, needs my approval or is denied, so that every ingest command applies my choice the same way.

### 1.2 Detailed Requirements
- **R1 — Modes.** `evaluatePermission(ingest, request)` returns `{ decision, mode, reason, matched, kind_pending }`:
  - `ai` → `allowed`, whatever `approved` is.
  - `ask` → `needs_approval` unless `approved` is true, then `allowed`. The reason tells the agent to show the user the source and rerun with `--approved`.
  - `whitelist` → R2. `approved` never overrides a whitelist denial (D-07: everything not listed is denied).
- **R2 — Whitelist.** In order: an origin entry that matches → `allowed`, `matched: { by: "origin", entry }`; else a known `kind` matching a kind entry → `allowed`, `matched: { by: "kind", entry }`; else `kind` is `null` and `whitelist.kinds` is non-empty → `allowed` with `kind_pending: true` (the kind is checked when it becomes known at `ingest facts`, architecture §7.3); else `denied`, with a reason that names the origin, the kind and the entries that were checked.
- **R3 — Origin entries.** `matchesOrigin(entry, origin, originType)`:
  - An entry containing `/`, or starting with `.` or `~`, is a **path glob**. It matches `file` origins only. `**` matches any number of path segments, `*` any run of characters within one segment, `?` one character; a leading `~/` expands to the home directory. Relative entries match repo-relative origins, absolute entries match absolute origins. Matching is case-sensitive.
  - Any other entry is a **domain pattern**. It matches `url` origins only, against the host, case-insensitively: `example.com` matches that host exactly; `*.example.com` matches any subdomain but not `example.com` itself.
  - `stdin` origins match no origin entry; chat excerpts are whitelisted by kind.
- **R4 — Kind entries ignore versions (CR-002 C1).** `matchesKind(entry, kind)` compares `normalizeKindId(entry)` with `normalizeKindId(kind)`, so `meeting-notes` matches `meeting-notes (v1)`, `meeting-notes (v2)` and later.
- **R5 — Source-kind lines.** `parseSourceKinds(text)` reads the section whose heading is `## Source kinds` (case-insensitive; text after those words on the heading line is ignored) up to the next `## ` heading. Each line of the form `<kind-id> (v<N>) → <targets>` (an optional leading `- ` or `* ` bullet; `->` accepted for `→`; the `(v<N>)` part optional, defaulting to version 1) yields `{ id, version, targets, line }`. Other lines are ignored. `findKindRule(text, kind)` returns the first rule whose id equals `normalizeKindId(kind)`, or `null`.
- **R6 — Normalisation.** `normalizeKindId(s)` trims, lowercases and drops a trailing `(vN)` with its leading spaces. `isValidKindId(s)` is true when the normalized id matches `^[a-z0-9][a-z0-9-]*$` (used by `--kind` validation in STORY-003-04/05).

### 1.3 Out of Scope
- Reading `config.yml` or `kb_instructions.md` from disk, and turning decisions into exit codes — the commands do that (STORY-003-04, 003-05, 003-06).
- The harness permission rules in agent settings (`--enforce`, STORY-002-06 and CR-001).
- `lint --rules` checks that whitelist kinds name existing kinds (CR-002 C1, second half — EPIC-005, SPRINT-03).

### 1.4 Open Questions

- None. Decisions recorded with their rationale:
  - **Entry type from its shape** (path glob vs domain) instead of a prefix syntax — the config shape in architecture.md §11 already writes `"docs/meetings/**"` and `"*.atlassian.net"` side by side in one list.
  - **Case-sensitive path globs** — the same rule on every OS keeps decisions reproducible; users write entries the way the paths appear in the repo.
  - **Kinds-only whitelist without `--kind` is allowed provisionally** — architecture §7.3 says kind rules are checked at `start` when `--kind` is given, otherwise at `facts`; denying at `start` would make kinds-only whitelists unusable for sources whose kind the agent learns while reading.

### 1.5 Risks

- **Risk:** A hand-rolled glob differs from what users expect from `.gitignore`-style patterns.
- **Mitigation:** Only `**`, `*` and `?` are supported and documented in the reason text of denials; tests pin `docs/meetings/**` against nested and sibling paths.

## 2. The Truth (Executable Tests)

### 2.1 Acceptance Criteria (Gherkin)

**SPIDR coverage.**

| Axis | Cover | Reason |
|---|---|---|
| Paths | T | `parseSourceKinds` and `evaluatePermission` are separate successful entry points over the same kind ids. |
| Interfaces | F | Library only. |
| Data | T | Origin matching differs by origin type (file, URL, stdin) and entry shape (path glob, domain). |
| Rules | T | Each mode's rule, the whitelist order, version-insensitive kinds, the kind-pending rule and the denial rule. |

```gherkin
Feature: Permission evaluation and source-kind rules

  @rules
  Scenario Outline: Each mode decides
    Given ingest.permission "<mode>"
    When evaluatePermission runs for origin "docs/q4.pdf" with approved <approved>
    Then the decision is "<decision>"

    Examples:
      | mode | approved | decision       |
      | ai   | false    | allowed        |
      | ask  | false    | needs_approval |
      | ask  | true     | allowed        |

  @data
  Scenario Outline: Origin entries match by shape
    Given whitelist origins ["docs/meetings/**", "~/Downloads/*.pdf", "*.atlassian.net"]
    When evaluatePermission runs in whitelist mode for <origin_type> origin "<origin>" with no kind
    Then the decision is "<decision>"

    Examples:
      | origin_type | origin                                   | decision |
      | file        | docs/meetings/2026/q4.md                 | allowed  |
      | file        | docs/notes.md                            | denied   |
      | file        | Docs/Meetings/q4.md                      | denied   |
      | file        | <home>/Downloads/q4.pdf                  | allowed  |
      | url         | https://acme.atlassian.net/wiki/q4       | allowed  |
      | url         | https://ACME.Atlassian.net/wiki/q4       | allowed  |
      | url         | https://atlassian.net/wiki/q4            | denied   |
      | stdin       | stdin                                    | denied   |

  @rules
  Scenario Outline: Kind entries ignore the version, and an unknown kind is checked later
    Given whitelist kinds ["meeting-notes"] and no origins
    When evaluatePermission runs in whitelist mode for origin "docs/x.md" with kind <kind>
    Then the decision is "<decision>" and kind_pending is <pending>

    Examples:
      | kind                 | decision | pending |
      | "meeting-notes (v1)" | allowed  | false   |
      | "meeting-notes (v2)" | allowed  | false   |
      | "status-report"      | denied   | false   |
      | null                 | allowed  | true    |

  @paths
  Scenario: Source-kind lines are parsed from kb_instructions.md
    Given kb_instructions.md whose "## Source kinds" section holds "meeting-notes (v2) → decision, risk", "- status-report -> project.status" and a prose line
    And a "## Write policy" section holding "contract (v3) → decision"
    When parseSourceKinds runs
    Then it returns meeting-notes version 2 with targets "decision, risk", and status-report version 1
    And findKindRule for "Meeting-Notes (v1)" returns the meeting-notes rule
    And findKindRule for "contract" returns null
    And isValidKindId is true for "status-report (v2)" and false for "status report"

  @rules
  Scenario: Error — the whitelist denies an unlisted source even when approved
    Given whitelist origins ["docs/meetings/**"] and kinds ["status-report"]
    When evaluatePermission runs in whitelist mode for origin "docs/notes.md", kind "meeting-notes" and approved true
    Then the decision is "denied"
    And the reason names "docs/notes.md", "meeting-notes", "docs/meetings/**" and "status-report"
```

### 2.2 Verification Steps (Manual)
- [ ] Read the denial reason for an unlisted file and confirm it tells a user which entry to add.

## 3. The Implementation Guide

### 3.1 Context & Files

> **Pre-commit gate input:** this table is the authoritative file surface for the story's commit (cleargate-enforcement.md §6, always enforced). Every file staged in this story's commit must appear in the Value column, or be covered by `.cleargate/scripts/surface-whitelist.txt`. Non-path rows (e.g. "Mirrors", "New Files Needed: Yes/No") are ignored by the parser.

| Item | Value |
|---|---|
| Primary File | `src/ingest/permissions.ts` |
| Related Files | `src/ingest/kind-rules.ts` |
| Test Files | `test/ingest/permissions.test.ts`, `test/ingest/kind-rules.test.ts` |
| New Files Needed | Yes — all four files above |

### 3.2 Technical Logic
- Glob → `RegExp`, compiled once per entry: escape regex metacharacters, then `**/` → `(?:.*/)?`, trailing `/**` → `(?:/.*)?`, remaining `**` → `.*`, `*` → `[^/]*`, `?` → `[^/]`; anchored `^…$`. The home directory comes from an optional `homeDir` argument (default `os.homedir()`, POSIX-separated) so tests are deterministic.
- URL host from `new URL(origin).hostname`; an origin that does not parse as a URL never matches a domain pattern.
- `normalizeKindId`: `s.trim().toLowerCase().replace(/\s*\(v\d+\)$/, "")`.
- Kind line regex: `^\s*(?:[-*]\s+)?([A-Za-z0-9][A-Za-z0-9-]*)\s*(?:\(v(\d+)\))?\s*(?:→|->)\s*(.*?)\s*$`; ids are normalized before they are returned. Lines inside fenced code blocks are ignored.
- `permissions.ts` declares the origin-type union inline (`"file" | "url" | "stdin"`), structurally identical to `OriginType` in STORY-003-01, so this story has no upstream.
- Reasons are full sentences; STORY-003-04 prints them unchanged and puts them in the error `details`.

### 3.3 API Contract (if applicable)

Frozen exports (consumers: STORY-003-04, 003-05, 003-06; 006-03 must produce kind lines `parseSourceKinds` accepts):

```ts
// src/ingest/permissions.ts
import type { WikeeperConfig } from "../core/config.js";
export type PermissionDecision = "allowed" | "needs_approval" | "denied";
export interface PermissionRequest {
  origin: string;                         // as SourceMeta.origin records it
  originType: "file" | "url" | "stdin";
  kind: string | null;
  approved: boolean;
}
export interface WhitelistMatch { by: "kind" | "origin"; entry: string }
export interface PermissionResult {
  decision: PermissionDecision;
  mode: WikeeperConfig["ingest"]["permission"];
  reason: string;
  matched: WhitelistMatch | null;
  kind_pending: boolean;
}
export function evaluatePermission(
  ingest: Pick<WikeeperConfig["ingest"], "permission" | "whitelist">,
  request: PermissionRequest,
  options?: { homeDir?: string },
): PermissionResult;
export function matchesOrigin(entry: string, origin: string, originType: "file" | "url" | "stdin", options?: { homeDir?: string }): boolean;
export function matchesKind(entry: string, kind: string): boolean;

// src/ingest/kind-rules.ts
export interface SourceKindRule {
  id: string;        // normalized, e.g. "meeting-notes"
  version: number;   // 1 when the line has no (vN)
  targets: string;   // text after the arrow, trimmed
  line: number;      // 1-based line number in the file
}
export function normalizeKindId(kind: string): string;
export function isValidKindId(kind: string): boolean;
export function parseSourceKinds(text: string): SourceKindRule[];
export function findKindRule(text: string, kind: string): SourceKindRule | null;
```

## 4. Quality Gates

### 4.1 Minimum Test Expectations

| Test Type | Minimum Count | Notes |
|---|---|---|
| Unit tests | 6 | glob compile (`**` at start, middle, end; `?`); domain patterns (exact, wildcard, apex, case); `normalizeKindId`; `isValidKindId`; kind lines inside a code fence ignored; whitelist order (origin before kind). |
| Integration tests | 0 | Pure functions. |
| E2E / acceptance tests | 5 | One per Gherkin scenario (Outline rows counted once). |

### 4.2 Definition of Done (The Gate)
- [ ] Minimum test expectations (§4.1) met.
- [ ] All Gherkin scenarios from §2.1 covered.
- [ ] Peer/Architect Review passed.

## Existing Surfaces

- **Surface:** `src/core/config.ts:17` — `ingest.permission` (`IngestPermission`, line 6) and `ingest.whitelist { kinds, origins }` (line 18), with defaults and validation at `src/core/config.ts:56`. This story reads that shape; it does not change it.
- **Surface:** `./templates/kb_instructions.management.md` — placeholder seed with the `## Source kinds` heading this parser reads; real kind lines arrive in STORY-006-03.
- **Coverage of this requirement:** partial — the config schema exists; the decision logic and the kind parser are net-new.

## Prior work

- [[EPIC-003]] (parent), [[CR-002]] (item C1: whitelist kinds ignore the version), [[CR-001]] (harness rules for `ai` mode, which complement but do not replace this CLI-side check). The SPRINT-02 wiki duplicate check found no other prior work.

## Why not simpler?

- **Smallest existing surface that could carry this:** `src/core/config.ts` (it already validates `ingest.permission`).
- **Why isn't extension / parameterization / config sufficient?** Config validation only checks that values are well-formed; it cannot decide a specific source. `start`, `plan` and `facts` all need the same decision, and `facts` needs it again once the kind is known, so a shared pure function is the minimum that keeps the three commands consistent. The kind parser sits beside it because the whitelist's version-insensitive matching (CR-002 C1) and the rule lookup at `start` share one notion of a kind id.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

Requirements to pass to Green (Ready for Execution):
- [x] Gherkin scenarios completely cover all detailed requirements in §1.2.
- [x] Implementation Guide (§3) maps to specific, verified file paths from the approved Epic and verified codebase grounding. (`src/ingest/permissions.ts` is an EPIC-003 §4 planned path; `src/ingest/kind-rules.ts` is the decomposition brief's contract 2 path.)
- [x] No "TBDs" exist anywhere in the specification or technical logic.
- [x] Existing Surfaces cites at least one source-tree path or explicitly states "none — net-new."
- [x] Why not simpler? has both sub-bullets answered (no "TBD" / no "{}").
