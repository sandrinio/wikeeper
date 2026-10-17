# SPRINT-03 — Gate 1 decisions (story revision basis)

Status: **approved by the human at Gate 1, 2026-10-17 ("approved", covering every item below, revised item 12 included).** The human asked the orchestrator to fix the consistency-audit findings (2026-10-17); the answers below were drafted as recommendations and then approved as written. Every story carries them as `- **Decision:** … — _approved (human, 2026-10-17, Gate 1)_` lines.

Story set after the splits: 20 stories. Split-off stories take new ids; no story is renumbered.

## Splits
1. STORY-002-09 → **002-09** `ai`-mode prompts and `enforce: false` cleanup (items 16, 18) · **002-10** doctor messages (wiring line, setup-files sub-checks).
2. STORY-005-03 → **005-03** page hashes, `unlogged-change`, lint hook in `finish` · **005-08** `stale-fact`.
3. STORY-006-10 → **006-10** rules, permissions and search text (CR-003 C2, C3, D1–D3 text, A1/A5 text, the changelog line format) · **006-12** writing, answering and onboarding text (CR-003 E1–E10). Structural tests stay **006-11** and run last.
4. STORY-005-05 → **005-05** `status` · **005-09** read-only allow rules for `lint`, `status`, `rules list` (decision 17; added 2026-10-17: carrying the rules made 005-05 L3 with a second goal in another subsystem).
5. STORY-004-07 and STORY-005-07 stay as they are.

## Behaviour
5. `read --out` creates new `.md` / `.txt` files only: never an existing file, never `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`, no path segment starting with a dot, nothing inside the wiki's content directory; created with the `wx` flag.
6. `read` markdown starts with `# <title>` (unless the body already opens with it), then `Author: … · Date: …` with only the known parts; `--json` keeps the fields separate.
7. PDF: no table detection; each table row becomes one line. EPIC-003's "tables preserved" holds for DOCX and HTML.
8. The agent uses `read` for every URL, every DOCX and every local `.html` / `.htm` file; for a PDF it runs `read` first and reads the PDF itself when `read` warns `likely_scanned`. "Likely scanned" counts letters (`\p{L}`): fewer than 25 letters on at least half the pages (SPIKE-001).
9. `finish` treats a fact line corrected in place as dropped: the writer adds the new line and keeps the old one. Deleting a whole page stays allowed; the check is per updated page.
10. After a git merge combines two ingests' edits to one page, `lint` reports `unlogged-change` (error) until the next ingest updates that page; WIKI.md explains it.
11. `status`: a source is unfinished until an `ingest` event for it exists; `abort` events do not finish a source.
12. `rules record --kind`: a source-kind id, or one of the section keys STORY-005-01 freezes for non-kind proposals: `questions`, `entities`, `capture-signals`, `write-policy`, `never-capture`. (Revised from the singular list; the kind is part of the fingerprint.)
13. `ingest facts --dry-run` works on finished sources (preview a rule change on an old source); it stores nothing and removes nothing.
14. `search --mark` refuses a text query (exit 2) and combines with `--type`, `--entity`, `--since`. The `--status` no-result hint fires only for `decided` / `tentative` (narrows CR-003 A5; flagged to the human).
15. A source-kind line inside an HTML comment: the kinds list stays exactly what C2 returns (ingest still reads it); `lint --rules` reports the line as `ambiguous-line`.
16. Codex in `ai` mode: `apply` stays allowed (prefix rules cannot see `--force-unlock`; the CLI refuses to take a live lock), every `abort` prompts. Claude Code prompts for both `--drop` and `--force-unlock` (SPIKE-002). (Changes the CR-003 decision for Codex only; flagged to the human.)
17. The read-only `lint`, `status` and `rules list` get allow rules in every permission mode, like `search` (Claude `permissions.allow`, Codex `prefix_rule … allow`). `rules record` writes a log event and gets no allow rule. Owner: **STORY-005-09** (revised 2026-10-17: the structural template test rejects a rule for a command that is not registered yet, so the rules land after all three command stories; 005-09 depends on 005-02, 005-05 and 005-06). STORY-002-09 does not depend on any EPIC-005 story.
18. `update` with `enforce: false` removes wikeeper's hook and rules from each agent's settings (`src/agents/enforce/index.ts`). Owner: STORY-002-09.
19. `me.md` extra preferences: the rule lives in the template's guidance comment, not as a literal `## Other` heading.
20. No `status` line in the pointer block (14-line cap); WIKI.md says to run `status` once per session before the first ingest.

## Red tests
21. Re-scoping the SPRINT-01/02 red tests that SPRINT-03 makes obsolete is authorised as recommended (pending Gate 1). Each edit is made by the QA-Red step of the story that first needs it and is listed in that story; STORY-006-11 R6 holds the full table, including STORY-003-10's `test/templates/setup.red.node.test.ts:353` edit and STORY-002-09's enforce edits.

## Orchestrator technical calls
- Every lint finding's `path` is relative to the repository root, POSIX (`.wiki/pages/people.md`, `.wiki/kb_instructions.md`, `.wiki/config.yml`; content_dir-aware). `LintContext.only` stays relative to `pages/` (input only). Human output prints `<path>[:<line>]`.
- Page hashes ignore line endings and a BOM (005-03).
- The `--version` build stamp never reaches the `npx wikeeper@<version>` guard command (001-10).
- Rule order in each agent's settings: ingest allow rules, ingest ask/prompt rules (002-09), `read` allow rule (003-10), `search` allow, read-only command allow rules (005-09). Enforce files and the SETUP.md step-4 table: 002-09 → 003-10 → 005-09, then the SETUP.md text stories 006-10 and 006-12.
- `package.json` / `package-lock.json`: 001-10 before 003-10 before 003-11.
- `src/program.ts`: each command story appends its command in merge order (revised 2026-10-17; a fixed order conflicted with 005-05 depending on 005-06).
