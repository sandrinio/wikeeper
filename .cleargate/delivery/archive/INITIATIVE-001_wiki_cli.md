---
initiative_id: INITIATIVE-001
remote_id: null
source_tool: manual-paste
status: Triaged
synced_at: null
triaged_at: 2026-10-16T13:08:06Z
spawned_items: ["EPIC-001", "EPIC-002", "EPIC-003", "EPIC-004", "EPIC-005", "EPIC-006"]
created_at: 2026-10-16T12:00:00Z
updated_at: 2026-10-16T12:00:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-16T11:59:27Z
  transition: ready-for-decomposition
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: manual-paste
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id INITIATIVE-001
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-16T11:59:07Z
  sessions: []
---

# INITIATIVE-001: Wiki CLI — Karpathy-style LLM wiki for AI agents

> Captured from the design conversation of 2026-10-16. Detailed design: `architecture.md` (Draft v0.2), whose decision log (D-01…D-15) records what was agreed.

## 1. User Flow

**Install and setup**
- The user runs `npx <pkg> init` in a repository.
- The CLI scaffolds everything under `.wiki/`, injects a short, marked wiki-instructions block at the top of the agent files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`), and installs the wiki skills. If no agent file exists, it creates `AGENTS.md` and asks which others to add. Files that already contain the block are not modified.
- In the next agent session, the agent sees setup isn't finished and follows the setup instructions: asks the user's name, how to address them and their role (written to `me.md`); confirms the purpose (Management); drafts the capture instructions (`kb_instructions.md`); agrees the ingest permission mode; checks the wiring; offers a first ingest.

**Ingest: the user provides a source**
- The user gives the agent a link, PDF, document or pasted text.
- The agent starts an ingest through the CLI. The pre-hook checks for duplicates and permission (`ai` / `ask` / `whitelist`), stores the raw source and snapshots the wiki.
- In `ask` mode the agent shows the source's metadata and asks; in `whitelist` mode listed sources are allowed and everything else is denied.
- The agent works out what kind of source it is, extracts what `kb_instructions.md` says to capture, and updates the wiki pages with a citation per fact.
- The agent finishes the ingest. The post-hook works out what changed, checks it, updates the index and log, and shows the user the metadata of what was ingested.
- Where the agent met information the instructions don't cover, it offers an addition to `kb_instructions.md`.

**Ingest: the agent notices something in chat**
While working, the agent spots something worth keeping (a decision, an owner change, a deadline, a risk) and offers to ingest it. On approval, the chat excerpt goes through the same flow as any other source.

**Query**
The user asks a question; the agent uses `wiki_search`, answers with citations, and the CLI logs questions the wiki couldn't answer.

**Lifecycle**
`update` refreshes the package's own files and never touches the user's knowledge. `remove` removes the tooling and keeps the knowledge; `remove --purge` deletes everything after confirmation.

## 2. Diagrams

```
                      ┌──────────── wiki ingest start (pre-hook) ────────────┐
 link / PDF / doc ──▶ │ dedupe → permission (ai|ask|whitelist) → store raw   │
 chat excerpt     ──▶ │ → snapshot pages → return ingest id + matching rule  │
                      └───────────────────────────┬──────────────────────────┘
                                                  ▼
                      agent: classify → extract → reconcile → write pages (cited)
                                                  ▼
                      ┌──────────── wiki ingest finish (post-hook) ──────────┐
                      │ diff pages → validate citations → index + log → lint │
                      │ → metadata report to user                            │
                      └───────────────────────────┬──────────────────────────┘
                                                  ▼
                      agent offers kb_instructions.md additions (user approves)

 Ownership:  .wiki/system/**  + agent wiring  → package (replaced by update)
             config, kb_instructions, me.md, pages, raw, index, log → user (never touched)
```

## 3. End-to-End Verbal Description

An npm package that installs a Karpathy-style LLM wiki into any repository and gives the user's AI agent — Claude Code, Antigravity or Codex — everything it needs to maintain it: setup instructions, wiki operating instructions, an evolving capture-rules file, page templates, skills, and a CLI. The CLI is deterministic plumbing: it scaffolds, registers raw sources, enforces permissions around every ingest with a pre-hook and a post-hook, keeps the index and log, searches, lints, and reports. The agent does the reading and writing. What gets captured depends on the user's purpose; the first purpose is Management, with team, project-specific knowledge, general risks and decisions, plus a short profile of the user so the agent can address them by name and recognise them in documents. All tooling is built now; knowledge-base quality is tested and improved in a later phase.

## 4. Business Outcome

The user's agent keeps a persistent, cited, growing knowledge base for the user's purpose instead of re-deriving context every session — installable in any repo with one command and working the same across the three major coding agents.

## 5. Success Criteria

- `init` in an empty repo and in a repo with existing agent files produces working wiring for Claude Code, Antigravity and Codex; running `init` again changes nothing.
- A link, PDF, document and pasted text can each be ingested end to end under all three permission modes, with the metadata report produced by the CLI.
- `update` never modifies user-owned files; `remove` never deletes knowledge without `--purge`.
- `wiki_search`, `lint`, `status` and `doctor` exist, and every command supports `--json`.
- Knowledge-base quality is out of scope for this initiative's done-ness; it is evaluated and improved afterwards.

## 6. Open Questions for AI Triage

- Content location: everything inside `.wiki/` (invisible to Obsidian) or a visible content folder?
- Conversion of PDF/DOCX/URL to text: done by the CLI or by the agent?
- Whitelist matching: by source kind, origin (path/domain), or both?
- Ambient ingest offers: on by default?
- Package and binary name.
- Private pages: can `team.md` be kept out of git (as `me.md` is)?
- Team use: two people ingesting on separate branches will conflict on the log and index.
- `wiki_search` also as an MCP tool, or CLI only?
- Harness enforcement (`--enforce` hooks and permission rules): offered during `init` or flag only?

---

## Stakeholder Authoring Notes (not pushed)

- Initiative is the **stakeholder-input artifact**, not an AI-authored draft.
  See `.cleargate/knowledge/cleargate-protocol.md` Plan-phase intake (post-CR-025).
- The AI never invokes `cleargate_push_item` on this file. Push semantics are
  one-way: Initiative is **pulled**, Epic / Story / CR / Bug / Hotfix are **pushed**.
- After triage, this file moves to `archive/` with `triaged_at` + `spawned_items`
  stamped. The PM tool retains source-of-truth for content; the repo retains
  the audit trail.
