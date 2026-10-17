# wikeeper — Architecture

> **Status:** Draft v0.4 · 2026-10-16 · all open questions resolved
> **Legend:** **[Agreed]** decided in discussion · **[Proposed]** recommended, not yet confirmed · **[Open]** needs a decision (see §12)

---

## 1. Purpose

An npm package that installs a Karpathy-style LLM wiki into any repository. The user's AI coding agent maintains a persistent, interlinked markdown knowledge base built from sources the user provides — links, PDFs, docs, chat — instead of re-deriving knowledge every session.

*What* gets captured depends on what the user is using the agent for. The first supported purpose is **Management** (project / product management).

## 2. Principles

1. **The agent thinks, the CLI enforces.** The CLI is deterministic: scaffolding, source registration, hashing, permission checks, diffing, index/log maintenance, lint, search. It makes no LLM calls and needs no API keys. Reading, judging and writing are done by the user's own agent. **[Proposed]**
2. **Instructions are advice; the CLI is the gate.** Anything that must hold — permissions, accurate ingest reports — is enforced by a CLI command, not by prompt text. **[Proposed]**
3. **Every fact is traceable** to an immutable raw source, chat excerpts included. **[Proposed]**
4. **The user owns the knowledge.** `update` may replace package-owned files; it never touches user-owned files. `remove` never deletes knowledge. **[Proposed]**
5. **Agent-agnostic.** Same behaviour under Claude Code, Antigravity and Codex. **[Agreed]**
6. **Read a source once.** Whoever already has a source in context extracts from it; agents hand each other facts, not sources. **[Agreed]**

## 3. Distribution

- Published to npm as **`wikeeper`** (binary `wikeeper`), MIT licence, public repo `github.com/sandrinio/wikeeper`. **[Agreed]**
- Everything the agent needs — instructions, profiles, templates, commands, scripts — ships with the package and is scaffolded under `.wiki/`. **[Agreed]** Exception: the agent wiring files in §6.3, which must sit where each agent looks for them. **[Proposed]**
- Lifecycle: `init`, `update`, `remove`. **[Agreed]**

## 4. Directory layout

```
.wiki/
├── system/                    # PACKAGE-OWNED — replaced by `update`
│   ├── SETUP.md               # setup instructions (once per repo)
│   ├── ONBOARDING.md          # onboarding instructions (once per person)
│   ├── WIKI.md                # wiki protocol: ingest / query / lint
│   ├── profiles/
│   │   └── management.md      # suggestions: questions, entity types, source kinds
│   └── templates/             # me.md, project.md and the source page template
├── config.yml                 # USER-OWNED — permissions, hooks, agents
├── kb_instructions.md         # USER-OWNED — what to capture; evolves over time
├── me.md                      # USER-OWNED, gitignored — who the agent works with (§5.4)
├── project.md                 # USER-OWNED, committed — what the wiki covers (§5.5)
├── index.md                   # CLI-generated catalog of pages (deterministic; rebuildable)
├── log/                       # one file per event — merge-safe; `log.md` is a generated, gitignored view
├── raw/                       # immutable: <id>.<ext> (original), <id>.meta.json, <id>.facts.json, <id>.md (optional)
└── pages/                     # agent-written knowledge; page names come from kb_instructions.md
    ├── <pages named in kb_instructions.md, Entities>
    └── sources/<source-id>.md   # the only page the package names (one per ingest)
```

**[Agreed]** Obsidian (Karpathy's suggested viewer) ignores dot-folders, so `.wiki/pages/` is invisible to it. A `content_dir` config key moves `pages/`, `raw/`, `index.md` and `log/` to a visible folder; the default stays `.wiki/`.

### 4.1 Ownership matrix **[Proposed]**

| Path | Owner | `init` | `update` | `remove` | `remove --purge` |
|---|---|---|---|---|---|
| `.wiki/system/**` | package | create | replace | delete | delete |
| Injected blocks in agent files (§6) | package | inject if absent | leave as is | strip | strip |
| Agent skills, hook and permission entries (§6.3, §6.6) | package | create | replace | delete | delete |
| `config.yml` | user | create if missing | never | keep | delete |
| `kb_instructions.md` | user | seed from profile if missing | never | keep | delete |
| `me.md` (gitignored) | user | written during onboarding | never | keep | delete |
| `project.md` | user | written during setup | never | keep | delete |
| `index.md`, `log/` | user (CLI-maintained) | create if missing | never | keep | delete |
| `raw/**`, `pages/**` | user | create dirs | never | keep | delete |

`--purge` requires typed confirmation. New config options introduced by `update` get defaults in code, so `config.yml` never needs rewriting.

## 5. Instruction files

Two kinds of instruction **[Agreed]**, plus the user's evolving rules:

| File | Owner | Read when | Answers |
|---|---|---|---|
| `system/SETUP.md` | package | once per repo, after `init` | *How do I get this wiki running?* |
| `system/ONBOARDING.md` | package | once per person, when `me.md` is missing | *Who am I working with?* |
| `system/WIKI.md` | package | before any ingest / query / lint | *How do I operate the wiki?* (process) |
| `kb_instructions.md` | user | during every ingest | *What should I capture, and where?* (content) |

The process lives in package files so improvements ship with `update`; the content rules live in a user file so they survive it. **[Proposed]**

### 5.1 SETUP.md — agent bootstrap

1. Onboard the user with `ONBOARDING.md`: name, how they'd like to be addressed, role, what they'll use the wiki for, answer style; write `me.md` (§5.4).
2. Ask what the wiki covers, or read a doc the user names; write `project.md` (§5.5) and show it for approval.
3. Draft `kb_instructions.md` — questions, entity types with their page names, source kinds, things never to capture — from `project.md`, `me.md` and the profile's suggestions (§5.3); the user approves.
4. Agree the permission mode (§7.2) and write it to `config.yml`.
5. Run `wikeeper doctor` to verify agent wiring.
6. Check that `me.md` and `project.md` will load in the next session.
7. Offer a first ingest.
8. Run `wikeeper setup --done` (stamps `setup_completed_at` in `config.yml`).

`ONBOARDING.md` runs on its own for a teammate who clones an already set-up repo: setup is done, but their gitignored `me.md` doesn't exist yet, so the pointer block sends their agent to it (§6.5). **[Agreed 2026-10-16]**

### 5.2 kb_instructions.md — what to capture **[Agreed]**

Capture rules are keyed by **source kind** (what the content *is*: meeting notes, status report, PRD, contract, email thread, chat excerpt), not by file format. A PDF and a link of the same meeting notes follow the same rule; format only matters for conversion to text.

The agent keeps offering additions to this file as it meets new kinds of information (§9).

**Questions are the root [Proposed].** Every rule exists to answer a question the wiki must answer: a question with no rule is a gap, a rule serving no question is bloat. Entities are defined separately from source kinds, so a new kind of source maps onto existing entities. **[Agreed]** The agent drafts the questions itself from `project.md`, `me.md`, the profile's suggestions and the user's first sources, and revises them from what the user actually asks (§9); the user approves changes rather than writing them. The example below is what a drafted file might look like for a management wiki; the seed ships these sections empty.

```md
# Knowledge Base Instructions
purpose: management

## Questions this wiki must answer      ← drafted and maintained by the agent
Q1 Who owns what, and who decides?
Q2 What's at risk right now, and who's on it?
Q3 Why did we decide X?
Q4 What changed since <date>?

## Entities                             ← what exists → where it lives → which Q
person   role, owns, reports_to, aliases            → team.md     Q1
project  owner, status, target_date, stakeholders   → projects/   Q1 Q2 Q4
risk     owner, likelihood, impact, mitigation      → risks.md    Q2
decision decided_by, date, alternatives, why        → decisions/  Q3

## Capture signals                      ← what the agent watches for in chat
decisions · ownership changes · deadlines · risks · team changes

## Source kinds                         ← how to read a source → which entities
meeting-notes (v2) → decision, risk, project.status, person.owns
status-report (v1) → project.status, project.target_date, risk

## Write policy
- status and dates keep their history; the newest *decided* fact wins the summary
- tentative facts never change the summary; they show as "proposed"

## Never capture
compensation · health · personal life · performance judgements of individuals

## Rule changelog
2026-10-16  meeting-notes v2: + attendees (proposed after ingest src-…)
```

### 5.3 Management profile — suggestions **[Agreed 2026-10-16]**

There are no fixed pages. The package names one page, `sources/<id>.md`, which every ingest writes. Everything else — the questions, the entity types and the pages they live on — comes from the setup conversation and the first sources, and grows through rule proposals (§9).

The profile is a list of suggestions the agent offers during setup step 3, keeping only what fits `project.md` and the user's answers:

| Suggestion | Example | Why it is offered |
|---|---|---|
| Questions | *Who owns X? What was decided about Y, and why? What changed this week?* | Questions are the root of every rule (§5.2) |
| Entity types and page names | person → a people page; project → `projects/<name>.md`; decision → `decisions/<slug>.md`; risk → a risk register; term → a glossary | Common shapes, so the agent doesn't invent a layout from scratch |
| Source kinds | `meeting-notes (v1) → …`, `status-report (v1) → …` | Starting rules the agent adapts to the chosen entities |
| Never capture | compensation, health, personal life, performance judgements of individuals | Privacy defaults (EPIC-006 §3) |

A page holding personal information can be kept out of git with `private: [<page>]` (D-27, off by default).

### 5.4 User profile — `me.md` **[Proposed]**

A short file about the person the agent works with, written during onboarding (§5.1). It is personal, so it is gitignored: in a shared repo each person has their own. It links to no page.

```md
---
type: me
---
name: <your name>
address as: PM
role: Head of Product, Platform
uses the wiki for: product decisions, release status, customer feedback
working on: Atlas, Billing v2
timezone: Europe/Berlin
language: English
answer style: short, tables over prose, risks first
```

| Field | What it enables |
|---|---|
| name, address as | Addressing the user by name, and resolving "I"/"me" in chat to the same person meeting notes call "PM" — so "Action: PM to send budget" becomes *you owe the budget* |
| role, uses the wiki for, working on | The main input for the agent drafting the wiki's questions itself (§5.2), and for deciding what is worth capturing |
| timezone | Turns "next Friday" in a source into a date — every fact is dated |
| language, answer style | How answers and reports are written |

- Only what the user says about themselves, offered for approval like any other change. Never inferred: no personality, mood or performance notes. A field the user hasn't given is left out.
- Kept to ~15 lines, because it is read at the start of every session (§6.5).

### 5.5 Project brief — `project.md` **[Agreed 2026-10-16]**

A short, committed file about what the wiki covers, written during setup step 2 from the conversation or a doc the user names, and read at the start of every session next to `me.md`.

```md
---
type: project
name: Acmeworks
aliases: [product_repo]
---
## What it is
## Scope
## Where things live
## Core terms
```

- Only stable facts: what the product or project is, for whom, what is in and out of scope, where its repos and docs live, and a handful of terms needed to read sources. Status, dates, decisions, people and the roadmap go into pages through ingests, with citations, so the brief doesn't go stale.
- Outside `pages/`: not indexed or searched; the agent changes it only with the user's approval.
- Kept to ~20 lines.

## 6. Agent integration

### 6.1 Targets **[Agreed]**

Claude Code, Antigravity, Codex. Gemini CLI reads the same files as Antigravity, but Antigravity CLI replaced it for most users on 2026-06-18, so it is supported on a best-effort basis only.

### 6.2 What each agent reads (verified 2026-10-16)

| | Claude Code | Antigravity | Codex |
|---|---|---|---|
| Instruction files | `CLAUDE.md`; `AGENTS.md` only when no `CLAUDE.md` exists (v2.1.277+) | `AGENTS.md` or `GEMINI.md`, walked up from touched files to workspace root | `AGENTS.md` (`AGENTS.override.md` first), root down to working dir |
| Size limit | ~200 lines advised | 24,000 bytes per file | 32 KiB combined |
| Skills (SKILL.md) | `.claude/skills/<n>/` | `.agents/skills/<n>/` | `.agents/skills/<n>/` |
| Hooks that can block a write | `.claude/settings.json` | `.agents/hooks.json` (IDE reliability unconfirmed) | `.codex/hooks.json` (trusted project + each hook approved) |
| Command permission rules | `.claude/settings.json` | no project file — user settings only | `.codex/rules/*.rules` (trusted project, experimental) |
| Project MCP | `.mcp.json` | `.agents/mcp_config.json` | `.codex/config.toml` (trusted project) |
| Sub-agent definitions | `.claude/agents/<n>.md` | `.agents/agents/<n>.md` | `.codex/agents/<n>.toml` |
| Sub-agent model | `model: haiku \| sonnet \| …` | `model: flash \| pro \| inherit` | `model = "<model id>"` (no aliases documented) |
| Delegates on its own | yes, by `description` | yes, by `description` | only when `AGENTS.md` or a skill tells it to |

Sources: code.claude.com/docs · antigravity.google/docs · learn.chatgpt.com/docs (Codex).

### 6.3 Install set **[Proposed]**

Agents only look in their own paths, so a few wiring files must live outside `.wiki/` (amends D-01). All are package-owned (§4.1).

| File | Read by | Content |
|---|---|---|
| `AGENTS.md` | Codex, Antigravity, Claude (when no `CLAUDE.md`) | pointer block (§6.5) |
| `CLAUDE.md` — only if it exists | Claude | pointer block |
| `GEMINI.md` — only if it exists | Antigravity, Gemini CLI | pointer block |
| `.agents/skills/wiki-{setup,ingest,search}/SKILL.md` | Codex, Antigravity, Gemini CLI | `name` + `description` + "follow `.wiki/system/…`" |
| `.claude/skills/wiki-{setup,ingest,search}` | Claude | symlink to `.agents/skills/…` (copy on Windows) |
| `.claude/agents/wiki-{extractor,writer}.md` | Claude | sub-agent definitions with model tier (§7.6) |
| `.agents/agents/wiki-{extractor,writer}.md` | Antigravity | same, `model: flash` / `pro` |
| `.codex/agents/wiki-{extractor,writer}.toml` | Codex | same; `model` omitted (inherits) unless set in `config.yml` |

- **Block in `CLAUDE.md`, not an `@AGENTS.md` import.** The import would also pull the user's own `AGENTS.md` content into Claude, changing more than the wiki.
- **Skills are the on-demand entry points.** Their descriptions let the agent load the right procedure ("ingest this PDF") without it sitting in context every session; the always-loaded block stays a few lines. The procedures themselves stay in `.wiki/system/` so `update` can ship improvements.
- **Not used:** Antigravity `.agents/rules/` (would load the text twice next to `AGENTS.md`; files without frontmatter are silently dropped), Antigravity workflows (discontinued 2026-10-19), Codex custom prompts (deprecated).

### 6.4 Injection rules **[Agreed]**

- Wiki instructions are injected at the **top** of each target file (after frontmatter, if the file has any), explicitly separated from the user's content by markers.
- If the markers already exist, the file is **not modified**.
- If none of the target files exist, `init` creates `AGENTS.md` and asks which others to add.
- `wikeeper doctor` warns when Claude is a configured agent but only `AGENTS.md` exists (needs Claude Code v2.1.277+).

### 6.5 Pointer block **[Built]**

The block is a short pointer that rarely changes; the real protocol lives in `system/WIKI.md`, which `update` replaces. `update` replaces the block itself only when it is unedited, that is, when its text matches a version wikeeper shipped (the shipped-blocks list, STORY-002-11); a block the user edited is left as it is. The block is at most 14 lines (`templates/agent-block.md`):

```md
<!-- WIKI:START v1 — managed by wikeeper -->
## Project Wiki
Managed by wikeeper — edit outside this block only.
This repo has a knowledge wiki in `.wiki/`; its content folder is set by `content_dir` in `.wiki/config.yml`.
If `.wiki/config.yml` has no `setup_completed_at`, follow `.wiki/system/SETUP.md` first.
Otherwise read `.wiki/system/WIKI.md` before ingesting, searching or editing anything in the wiki (skills: `wiki-ingest`, `wiki-search`).
At the start of every session read `.wiki/me.md` and `.wiki/project.md`; if `.wiki/me.md` is missing, first onboard the user with `.wiki/system/ONBOARDING.md`.
Before you answer a question about the project or draft material for it, search the wiki with `wikeeper search`, even when the user does not mention the wiki.
When a decision, a date, an owner or a commitment comes up in conversation and is not in the wiki, offer to capture it (`.wiki/system/WIKI.md`, section "Ambient offers").
Wiki pages change only in an ingest's write phase, between `wikeeper ingest apply <id>` and `wikeeper ingest finish <id>`.
If `wikeeper ingest` is unavailable, do not write pages; tell the user.
You may edit, with the user's approval: `.wiki/config.yml`, `.wiki/kb_instructions.md`, `.wiki/me.md`, `.wiki/project.md`.
Package-owned, never edit: `.wiki/system/`, the wiki skills, the wiki sub-agents and wikeeper's entries in agent settings files.
<!-- WIKI:END -->
```

Edge cases handled by `wikeeper doctor`: markers deleted but text kept (warn about duplicate on next `init`); block version older than the package (report, don't rewrite); file line endings and BOM preserved.

### 6.6 Harness enforcement — opt-in **[Proposed]**

All three agents can run a hook before a tool call and block it. `init --enforce` uses that to turn instructions into rules:

- **Write guard.** A pre-tool hook blocks edits to `.wiki/pages/**` unless an ingest is open (lock file present). Written to `.claude/settings.json`, `.agents/hooks.json`, `.codex/hooks.json`.
- **Permission mode → harness rules.** `ai` → allow only the ingest commands (`wikeeper ingest …`, `npx wikeeper ingest …`) without prompting; every other wikeeper command goes through the harness's normal permission handling. `ask` → the harness itself prompts the user when the agent runs `wikeeper ingest start` (Claude `permissions.ask`, Codex `prefix_rule(decision="prompt")`). The harness prompt *is* the approval, so the chat-approval + `--approved` fallback (§7.2) is only needed where no rule file exists (Antigravity).

`init` asks whether to enable it, defaulting to no. **[Agreed]** Opt-in because it merges into the user's own settings files, Codex only honours it in trusted projects with each hook approved, and Antigravity IDE hook reliability is unconfirmed.

## 7. Ingestion

### 7.1 Triggers **[Agreed]**

- **Shared in chat** (the common case) — the user attaches or pastes a file; the main agent has usually read it already.
- **Directory** — the user points to a folder. The main agent does not read the files itself (§7.6).
- **Link** — the user gives a URL.
- **Ambient** — the agent spots a capture signal (§5.2) in conversation and offers to ingest it, batched at the end of a reply. The chat excerpt is passed to the CLI on stdin and stored as a raw source like any other. The agent distinguishes *decided* from *being considered* and asks when unsure.

### 7.2 Permissions **[Agreed]**

Configurable per project:

| Mode | Behaviour |
|---|---|
| `ai` | The agent decides whether to ingest. No prompt. |
| `ask` | Every ingest needs the user's approval in chat. |
| `whitelist` | Sources matching the whitelist are allowed; everything else is denied. |

Whitelist entries match on source kind, origin (path or domain), or both. **[Agreed]**

Mechanism **[Proposed]**: the agent runs the CLI non-interactively, so the CLI can't prompt the user itself. In `ask` mode `ingest start` returns `needs_approval` with the source metadata; the agent asks in chat and reruns with `--approved`. This relies on the agent being honest; lint flags any page change without a matching log entry. Denied sources exit non-zero with a reason and nothing is stored. Where the agent's harness supports command rules, §6.6 has the harness ask the user instead.

### 7.3 Lifecycle **[Agreed: hooks, three phases · Proposed: commands]**

Ingest runs in three phases. Several sources can be in *triage & extract* at once; *write* is one source at a time.

```
REGISTER — CLI, pre-hook
wikeeper ingest start <path|url|-> [--kind <k>] [--approved] [--reingest]
  1. resolve source (file, URL, stdin for chat excerpts)
  2. hash → already ingested? report prior ingest, stop unless --reingest
  3. permission check → allowed | needs_approval | denied
  4. copy original to raw/<id>.<ext>; write raw/<id>.meta.json
     (no conversion: the agent supplies the text it read, if any, as raw/<id>.md — §7.7)
  5. run user pre_ingest hooks
  6. print ingest id, source metadata, and the rule for <k> + its version

wikeeper ingest plan <dir>      batch: list files, hash, mark duplicates and denied,
                                print the plan; then `start` per approved file

TRIAGE & EXTRACT — agent (§7.4)
wikeeper ingest facts <id> < facts.json
                                validate against the facts schema; store raw/<id>.facts.json

WRITE — writer agent, one source at a time (§7.4)
wikeeper ingest apply <id>      take lock, snapshot pages, print the brief's ingest line
                                + facts (the writer's task carries the rest of the brief)
  … writer updates pages …
wikeeper ingest finish <id>
  POST-HOOK
  1. diff pages against snapshot → created / updated / deleted
  2. validate: every changed page cites the source id and has valid frontmatter;
     no writes outside pages/
  3. regenerate index.md; write a log entry (log/<timestamp>-<id>.md)
  4. run user post_ingest hooks (e.g. git commit)
  5. lint
  6. print metadata report, release lock

wikeeper ingest abort <id>      restore pages from snapshot, release lock;
                                --drop also deletes the registered source
```

- **The lock covers the write phase only.** Extraction doesn't touch pages, so it can run in parallel; concurrent writes would make the snapshot diff unable to attribute changes.
- **Whitelist rules on source kind** (§7.2) are checked as soon as the kind is known: at `start` when `--kind` is given, otherwise at `facts`.

### 7.4 Roles and steps (specified in WIKI.md) **[Agreed: split · Proposed: detail]**

A source is read once. Whoever reads it extracts from it, and agents hand each other **facts, not sources**.

**Triage & extract** — by whoever already holds the source (§7.6)
1. **Triage** — read `index.md` and run `wiki_search` for the people, projects and terms in the source, to learn what the wiki already knows and where each piece belongs. Pick the source kind: its rule in `kb_instructions.md` decides what to extract and where it goes. No matching rule → propose one (§9).
2. **Extract** — list the facts the rule asks for, each routed to an entity and page, with its date, status (decided / tentative) and location in the source (page, section, quote). Note information the rules don't cover.
3. **Submit** with `wikeeper ingest facts`.

**Write** — by the writer agent, one source at a time
4. **Reconcile** — read the target pages; mark each fact *new / confirms / updates / contradicts*; resolve aliases.
5. **Write** — update pages with a citation per fact; write `sources/<id>.md` (summary + what this source changed). Contradictions are flagged on the page with both sources, never silently overwritten.
6. **Learn** — turn uncovered information and the user's corrections into `kb_instructions.md` proposals (§9).

Triage reads the index and search results, not whole pages: enough to route facts, cheap enough for the main agent's context. The writer reads the full target pages.

**Facts file** (`raw/<id>.facts.json`):

```json
{
  "source_id": "src-2026-10-16-q4-status",
  "kind": "status-report", "rule_version": 2,
  "facts": [
    { "entity": "project:atlas", "field": "target_date", "value": "2026-11-17",
      "status": "tentative", "as_of": "2026-10-15",
      "anchor": "p.3, Timeline: \"launch now targeting Nov 17\"",
      "page": "projects/atlas.md", "exists": true }
  ],
  "new_entities": ["risk:vendor-delay"],
  "uncovered": ["budget burn per project — no rule captures it"]
}
```

It is the handoff between agents; the plan shown to the user is generated from it; pages can be rewritten from it without re-reading the source; and it lets extraction and writing be tested separately when knowledge quality is evaluated.

**Brief** (main agent → writer), a fixed short template:

```
ingest:    src-2026-10-16-q4-status   facts: raw/src-2026-10-16-q4-status.facts.json
user said: "Q4 plan from the leadership offsite; Atlas has slipped"
resolved:  "PL" = [[Product Lead]] · "the launch" = [[Atlas]]
focus:     dates and owners; ignore the budget appendix
```

### 7.5 Report **[Agreed: metadata only]**

Generated by the CLI from the diff, so it reflects what actually changed rather than what the agent believes it changed.

```
✅ Ingested src-2026-10-16-q4-status
   kind status-report · origin ~/Downloads/Q4-status.pdf · 14pp · sha 3f9a…
   rule status-report v2 · permission whitelist
   created 1 · updated 3 · contradictions 1 · rule suggestions 1
```

### 7.6 Who does what **[Agreed]**

| Case | Triage & extract | Write |
|---|---|---|
| File shared in chat (common case) | main agent — already has it in context | writer agent, with brief |
| Something said in chat | main agent | writer agent, with brief |
| Directory | small extractor agents, one per source, in parallel; the main agent only runs `ingest plan` and gets approval | writer agent, one source at a time |
| Link | main agent if it already fetched it, otherwise an extractor | writer agent |

- **Model tiers [Proposed]:** extraction is fine on a small model; writing (contradictions, aliases) needs a mid-size one.
- **Fallback:** where the agent can't delegate, the main agent runs both phases itself, with the same steps and the same facts file.
- **All three agents can delegate (verified 2026-10-16).** Definitions per agent are in §6.3. Tier mapping:

  | Tier | Claude Code | Antigravity | Codex |
  |---|---|---|---|
  | small (extractor) | `haiku` | `flash` | parent's model unless `config.yml` names one |
  | medium (writer) | `sonnet` | `pro` | parent's model unless `config.yml` names one |

- **Codex needs to be told.** It only delegates when instructions ask, so the `wiki-ingest` skill says explicitly when to hand off to `wiki-extractor` / `wiki-writer`. It documents no model aliases, so the tier is a model id the user sets.
- **Not verified:** whether Codex sub-agents start with a fresh context (one version of its source forks the full parent history, which would cut the savings but not break anything); sub-agents in the Antigravity IDE (documented for the app and CLI only).

### 7.7 Reading helper — `wikeeper read` **[Built — SPRINT-03]**

Conversion is not part of ingest: the CLI stores originals as they are. `wikeeper read <file|url>` prints markdown for formats the agent can't read well itself (`--out <file>` writes it to a file for `ingest start --text-file`; `--json` adds title, author, date, format and warning codes). `read` is the only command that uses the network.

| Input | Libraries |
|---|---|
| URL, local `.html` / `.htm` | `fetch` (URL only) → `linkedom` → `defuddle` (main content as markdown, plus title, author, date) |
| DOCX | `mammoth` → `turndown` + GFM tables |
| PDF | `unpdf` (pdf.js for Node) |
| `.md`, `.txt`, `.csv`, `.tsv` | none: text passes through; CSV and TSV rows are not turned into a table |

About 32 MB on disk with their dependencies (measured in SPIKE-001), each group loaded only when its format is read. Still needed because most agents can't open DOCX, and agents' own web tools often return a summary rather than the full page (Claude Code's WebFetch passes pages through a smaller model).

Limits, handed back to the agent:
- **Scanned PDFs** — almost no text per page → reported as "likely scanned"; the agent reads the PDF itself.
- **Pages needing JavaScript or a login** — the agent uses its own browser and passes the text on stdin.
- **`.doc`, `.pptx`, `.xlsx`** — not supported; the `unsupported` error (exit 2) says what to ask for instead (a .docx, a PDF export, a CSV export).

## 8. Knowledge model **[Proposed]**

- **Pages are organized by entity** (person, project, risk, decision), not by source, so knowledge from different sources accumulates in one place.
- **Two layers per page.** A *Summary* compiled from the facts and rewritten on every ingest; below it, *Facts* — each dated, marked decided or tentative, and cited. Replaced facts are kept, not deleted, so "what changed since…" is answerable.
- **Aliases** in frontmatter ("PL", "the lead", "Product L.") so one person or project never becomes three pages.
- **Typed links** (`owner:: [[Product Lead]]`, `risks:: [[vendor-delay]]`) the CLI can parse, enabling structured search.
- **Source pages** (`sources/<id>.md`) answer "what did this document change?"
- **Source ids:** `src-YYYY-MM-DD-<slug>`, suffixed on collision.
- **Citations:** wikilink to the source page at the end of each claim — `[[src-2026-10-16-q4-status]]`. Obsidian-compatible and greppable by lint.
- **Page frontmatter:** `type`, `title`, `summary`, `sources[]`, `updated`. The CLI builds `index.md` from frontmatter, so the index is deterministic.
- **Raw files are immutable.** Each ingest records the rule version it used, so when a rule changes, `wikeeper status` can list sources worth re-ingesting.

## 9. Rule evolution **[Agreed: agent offers · Built: mechanics — SPRINT-03]**

Proposals come from:
- a source kind with no matching rule;
- information that keeps appearing but isn't captured;
- questions `wiki_search` couldn't answer (misses are logged);
- the user's edits and rejections during ingest (strongest signal — removing "salary" from a plan suggests a *Never capture* rule).

Each proposal is a small diff the user approves. Approved → rule version bumped, changelog line added, and `wikeeper rules record --accepted` logs it. Rejected → `wikeeper rules record --rejected` logs it so it isn't offered again; `--from <source-id>` ties the decision to the ingest that raised it, which clears that source's pending suggestions in `wikeeper status`. `wikeeper rules list` shows the decisions. `wikeeper lint --rules` checks `kb_instructions.md` and the ingest rules: duplicate rules, kinds that target unknown entities or fields, questions no rule serves and rules that serve no question, changelog versions that don't match, whitelist kinds that don't exist.

## 10. CLI surface

| Command | Purpose | Status |
|---|---|---|
| `init [--profile management] [--agents …]` | scaffold `.wiki/`, inject agent blocks | Agreed |
| `update` | replace package-owned files | Agreed |
| `remove [--purge]` | remove tooling; `--purge` also deletes knowledge | Agreed |
| `ingest start / plan / facts / apply / finish / abort` | gated, three-phase ingest (§7.3) | Agreed (hooks, phases) |
| `read <file\|url>` | markdown for formats the agent can't read itself (§7.7) | Built (SPRINT-03) |
| `status` | open ingest and stale lock, unfinished sources, re-ingest candidates (outdated rule versions), pending rule suggestions, misses | Built (SPRINT-03) |
| `lint [--rules]` | broken links, uncited claims, orphan pages, index drift, unlogged changes, stale facts; with `--rules`, rule problems (§9) | Built (SPRINT-03) |
| `rules record / list` | remember the user's decisions on proposed rule changes (§9) | Built (SPRINT-03) |
| `search <query>` | **wiki_search** — query the wiki; also used by ingest to find pages to update; `--entity`, `--type`, `--where`, `--status`, `--mark`, `--since`, `--no-miss`, `--misses` | Built |
| `doctor` | agent wiring, duplicate blocks, config validity, setup files (`me.md` ignored and not committed, `project.md` present and not ignored), `kb_instructions.md` parse | Built |
| `setup --done` | mark setup complete | Built |

Every command supports `--json`: the agent is the main consumer. **[Built]**

## 11. Config **[Proposed shape]**

```yaml
# .wiki/config.yml
profile: management
setup_completed_at: null
agents: [claude, codex, antigravity]
content_dir: .wiki              # move pages/, raw/, index.md, log/ to a visible folder (§4)
private: []                     # pages kept out of git, e.g. [people.md] (§5.3)
enforce: false                  # harness hooks + permission rules (§6.6)

ingest:
  permission: ask              # ai | ask | whitelist
  whitelist:                   # matched → allowed; everything else → denied
    kinds: [meeting-notes, status-report]
    origins: ["docs/meetings/**", "*.atlassian.net"]
  ambient_offers: true
  delegate: auto               # auto | never — §7.6
  extractor_model: small       # tier, mapped to a model per agent
  writer_model: medium

hooks:
  pre_ingest: []
  post_ingest: []              # e.g. "git add .wiki && git commit -m 'wiki: {source_id}'"
```

## 12. Open questions

None. All questions were resolved on 2026-10-16 (D-20, D-21, D-24 – D-31).

## 13. Decision log

| # | Decision |
|---|---|
| D-01 | Distributed via npm; everything ships nested under `.wiki/`. |
| D-02 | Two instruction kinds: setup (one-time) and wiki (ongoing), plus the user's evolving `kb_instructions.md`. |
| D-03 | Capture rules are keyed by source kind (content), not file format. |
| D-04 | Two ingest triggers: user-provided source, and agent-detected information offered from chat. |
| D-05 | Ingest is wrapped by a pre-hook and a post-hook. |
| D-06 | Permission modes `ai` / `ask` / `whitelist`, configurable. |
| D-07 | Whitelist: listed sources allowed, everything else denied. |
| D-08 | After ingest, the user sees metadata only, not content. |
| D-09 | CLI lifecycle commands: `init`, `update`, `remove`. |
| D-10 | Supported agents: Claude Code, Antigravity, Codex. |
| D-11 | Wiki instructions injected at the top of agent files, separated by markers; if present, the file is not modified, except that `update` replaces an unedited block with the current one (STORY-002-11, SPRINT-03). |
| D-12 | If no agent file exists, create `AGENTS.md` and ask which others to add. |
| D-13 | First profile: Management — offered as suggestions (questions, entity types, source kinds), not fixed pages (revised 2026-10-16, D-34). |
| D-14 | The agent proposes additions to `kb_instructions.md`; the user approves. |
| D-15 | The wiki has a search tool (`wiki_search`). |
| D-16 | A source is read once; agents hand each other facts, not sources. |
| D-17 | Ingest is split into triage & extract (parallel allowed) and write (one source at a time). |
| D-18 | Triage reads the wiki (index + search) to route facts before extracting; the ingestion rules decide what is extracted and where it goes. |
| D-19 | The main agent extracts when it already holds the source; directories go to smaller extractor agents; a writer agent writes, given a short brief. Without delegation support, the main agent does both. |
| D-20 | Conversion is not part of ingest. The agent reads sources; `wikeeper read` is a helper for formats it can't read. |
| D-21 | Product, npm package and binary name: `wikeeper`. |
| D-22 | MIT licence. |
| D-23 | Public repo `github.com/sandrinio/wikeeper`, including the ClearGate planning files. |
| D-24 | Content lives in `.wiki/` by default; `content_dir` moves it to a visible folder (e.g. for Obsidian). |
| D-25 | Whitelist entries match on source kind, origin (path or domain), or both. |
| D-26 | Ambient ingest offers are on by default (`ambient_offers: false` turns them off). |
| D-27 | A `private: [...]` setting keeps listed pages out of git; off by default. |
| D-28 | Merge-safe for teams: one log file per event under `log/`; `index.md` is deterministic and rebuildable after a merge. |
| D-29 | `wiki_search` is a CLI command only; an MCP tool is out of scope for now. |
| D-30 | `init` asks whether to enable `--enforce`, defaulting to no. |
| D-31 | The agent drafts the wiki's questions itself (from `project.md`, `me.md` and the profile's suggestions); the user approves changes. |
| D-32 | `init` never creates `CLAUDE.md`: `AGENTS.md` works with Claude Code too. |
| D-33 | The `--enforce` write guard fails open, with a warning, when it can't read a hook payload. |
| D-34 | No fixed pages: the package names only `sources/<id>.md`; questions, entity types and pages come from the setup conversation and the first sources. |
| D-35 | `project.md` is a committed per-repo brief of stable facts, written during setup and read at every session start. |
| D-36 | `ONBOARDING.md` runs once per person and writes their gitignored `me.md`; the pointer block sends the agent there when `me.md` is missing. |
