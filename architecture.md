# wikeeper — Architecture

> **Status:** Draft v0.3 · 2026-10-16
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
│   ├── SETUP.md               # setup instructions (agent reads once)
│   ├── WIKI.md                # wiki protocol: ingest / query / lint
│   ├── profiles/
│   │   └── management.md      # seed capture rules + page types
│   └── templates/             # page templates: person, project, risk, decision, source
├── config.yml                 # USER-OWNED — permissions, hooks, agents
├── kb_instructions.md         # USER-OWNED — what to capture; evolves over time
├── me.md                      # USER-OWNED, gitignored — who the agent works with (§5.4)
├── index.md                   # CLI-generated catalog of pages
├── log.md                     # CLI-maintained, append-only event log
├── raw/                       # immutable: <id>.<ext> (original), <id>.meta.json, <id>.facts.json, <id>.md (optional)
└── pages/                     # agent-written knowledge (management profile shown)
    ├── team.md
    ├── risks.md
    ├── glossary.md
    ├── projects/<name>.md
    ├── decisions/<slug>.md
    └── sources/<source-id>.md
```

**[Open]** Obsidian (Karpathy's suggested viewer) ignores dot-folders, so `.wiki/pages/` is invisible to it. Option: a `content_dir` config key that moves `pages/`, `raw/`, `index.md`, `log.md` to a visible folder.

### 4.1 Ownership matrix **[Proposed]**

| Path | Owner | `init` | `update` | `remove` | `remove --purge` |
|---|---|---|---|---|---|
| `.wiki/system/**` | package | create | replace | delete | delete |
| Injected blocks in agent files (§6) | package | inject if absent | leave as is | strip | strip |
| Agent skills, hook and permission entries (§6.3, §6.6) | package | create | replace | delete | delete |
| `config.yml` | user | create if missing | never | keep | delete |
| `kb_instructions.md` | user | seed from profile if missing | never | keep | delete |
| `me.md` (gitignored) | user | written during setup | never | keep | delete |
| `index.md`, `log.md` | user (CLI-maintained) | create if missing | never | keep | delete |
| `raw/**`, `pages/**` | user | create dirs | never | keep | delete |

`--purge` requires typed confirmation. New config options introduced by `update` get defaults in code, so `config.yml` never needs rewriting.

## 5. Instruction files

Two kinds of instruction **[Agreed]**, plus the user's evolving rules:

| File | Owner | Read when | Answers |
|---|---|---|---|
| `system/SETUP.md` | package | once, after `init` | *How do I get this wiki running for this user?* |
| `system/WIKI.md` | package | before any ingest / query / lint | *How do I operate the wiki?* (process) |
| `kb_instructions.md` | user | during every ingest | *What should I capture, and where?* (content) |

The process lives in package files so improvements ship with `update`; the content rules live in a user file so they survive it. **[Proposed]**

### 5.1 SETUP.md — agent bootstrap

1. Ask the user's name, how they'd like to be addressed, and their role; write `me.md` (§5.4).
2. Confirm the purpose and pick a profile (`management`).
3. Draft `kb_instructions.md` from the profile and `me.md`; ask about team, active projects, things never to capture.
4. Agree the permission mode (§7.2) and write it to `config.yml`.
5. Run `wikeeper doctor` to verify agent wiring.
6. Offer a first ingest.
7. Run `wikeeper setup --done` (stamps `setup_completed_at` in `config.yml`).

### 5.2 kb_instructions.md — what to capture **[Agreed]**

Capture rules are keyed by **source kind** (what the content *is*: meeting notes, status report, PRD, contract, email thread, chat excerpt), not by file format. A PDF and a link of the same meeting notes follow the same rule; format only matters for conversion to text.

The agent keeps offering additions to this file as it meets new kinds of information (§9).

**Questions are the root [Proposed].** Every rule exists to answer a question the wiki must answer: a question with no rule is a gap, a rule serving no question is bloat. Entities are defined separately from source kinds, so a new kind of source maps onto existing entities. **[Leaning, not agreed]** The agent drafts the questions itself from the profile and the user's first sources, and revises them from what the user actually asks (§9); the user approves changes rather than writing them.

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

### 5.3 Management profile — seed pages **[Agreed scope, Proposed detail]**

| Page | Holds | Why management needs it |
|---|---|---|
| `team.md` | people, roles, ownership, reporting lines, availability | Most management questions are about people: who owns X, who decides, who is overloaded, who to ask |
| `projects/<name>.md` | goals, scope, timeline, status, project-specific risks, stakeholders | Project-specific knowledge in one place per project |
| `risks.md` | cross-project risk register: description, likelihood/impact, owner, mitigation, status | General risks that don't belong to one project |
| `decisions/<slug>.md` | what was decided, by whom, when, alternatives, rationale | Decisions are the most-asked-about and most-forgotten facts |
| `glossary.md` | terms, acronyms, codenames | Lets the agent read future sources correctly |

`team.md` is sensitive. The profile ships a default *Never capture* list, and **[Open]** whether `team.md` can be marked private (gitignored).

### 5.4 User profile — `me.md` **[Proposed]**

A short page about the person the agent works with. It is personal, so it is gitignored: in a shared repo each person has their own, while their shared, factual entry (name, role) lives in `team.md`.

```md
---
type: me
person: "[[Alex Morgan]]"          ← their entry in team.md
---
address as: Alex
role: Head of Product, Platform
reports to: [[Dana Lee]] · direct reports: [[Ana Kim]], [[Luka B.]]
my projects: [[Atlas]], [[Billing v2]]
timezone: Europe/Berlin · language: English · week starts: Monday
answer style: short, tables over prose, risks first
```

| Field | What it enables |
|---|---|
| name, address as, `person` link | Addressing the user by name, and resolving "I"/"me" in chat to the same person meeting notes call "Alex" — so "Action: Alex to send budget" becomes *you owe the budget* |
| role, my projects | The main input for the agent drafting the wiki's questions itself (§5.2), and for deciding what is worth capturing |
| reports to, direct reports | Separates what to escalate from what to delegate, and whose updates matter most |
| timezone, week start | Turns "next Friday" in a source into a date — every fact is dated |
| language, answer style | How answers and reports are written |

Questions this unlocks: *What do I owe, and to whom? What's waiting on me? What did my reports change this week?*

- Only what the user says about themselves, offered for approval like any other change. Never inferred: no personality, mood or performance notes.
- Kept to ~15 lines, because it is read at the start of every session (§6.5).

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

### 6.5 Pointer block **[Proposed]**

"Never modify an existing block" means `update` can't reach anything inside it. So the block is a short pointer that rarely changes; the real protocol lives in `system/WIKI.md`, which `update` replaces.

```md
<!-- WIKI:START v1 — managed by wikeeper -->
## Project Wiki
This repo has a knowledge wiki in `.wiki/`.
- If `.wiki/config.yml` has no `setup_completed_at`, read `.wiki/system/SETUP.md` and finish setup first.
- Otherwise, before ingesting, querying or editing anything under `.wiki/`, read `.wiki/system/WIKI.md`.
- Never write to `.wiki/pages/` outside `wikeeper ingest start` / `wikeeper ingest finish`.
- If `.wiki/me.md` exists, read it at the start of a session: it describes who you are working with.
<!-- WIKI:END -->
```

Edge cases handled by `wikeeper doctor`: markers deleted but text kept (warn about duplicate on next `init`); block version older than the package (report, don't rewrite); file line endings and BOM preserved.

### 6.6 Harness enforcement — opt-in **[Proposed]**

All three agents can run a hook before a tool call and block it. `init --enforce` uses that to turn instructions into rules:

- **Write guard.** A pre-tool hook blocks edits to `.wiki/pages/**` unless an ingest is open (lock file present). Written to `.claude/settings.json`, `.agents/hooks.json`, `.codex/hooks.json`.
- **Permission mode → harness rules.** `ai` → allow `npx wikeeper *` without prompting. `ask` → the harness itself prompts the user when the agent runs `wikeeper ingest start` (Claude `permissions.ask`, Codex `prefix_rule(decision="prompt")`). The harness prompt *is* the approval, so the chat-approval + `--approved` fallback (§7.2) is only needed where no rule file exists (Antigravity).

Opt-in because it merges into the user's own settings files, Codex only honours it in trusted projects with each hook approved, and Antigravity IDE hook reliability is unconfirmed.

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

Whitelist match keys — source kind, origin (path/domain), or both — are **[Open]**.

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
wikeeper ingest apply <id>      take lock, snapshot pages, print facts + brief
  … writer updates pages …
wikeeper ingest finish <id>
  POST-HOOK
  1. diff pages against snapshot → created / updated / deleted
  2. validate: every changed page cites the source id; no writes outside pages/
  3. regenerate index.md; append log.md entry
  4. run user post_ingest hooks (e.g. git commit)
  5. lint
  6. print metadata report, release lock

wikeeper ingest abort <id>      restore pages from snapshot, release lock;
                                --drop also deletes the registered source
```

- **The lock covers the write phase only.** Extraction doesn't touch pages, so it can run in parallel; concurrent writes would make the snapshot diff unable to attribute changes.
- **Whitelist rules on source kind** (if used, §12) are checked as soon as the kind is known: at `start` when `--kind` is given, otherwise at `facts`.

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
resolved:  "AK" = [[Ana Kim]] · "the launch" = [[Atlas]]
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

### 7.7 Reading helper — `wikeeper read` **[Proposed]**

Conversion is not part of ingest: the CLI stores originals as they are. `wikeeper read <file|url>` prints markdown for formats the agent can't read well itself.

| Input | Libraries |
|---|---|
| URL | `fetch` → `linkedom` → `defuddle` (main content as markdown, plus title, author, date) |
| DOCX | `mammoth` → `turndown` + GFM tables |
| PDF | `unpdf` (pdf.js for Node) |

About 8 MB together, each loaded only when its format is read. Still needed because most agents can't open DOCX, and agents' own web tools often return a summary rather than the full page (Claude Code's WebFetch passes pages through a smaller model).

Limits, handed back to the agent:
- **Scanned PDFs** — almost no text per page → reported as "likely scanned"; the agent reads the PDF itself.
- **Pages needing JavaScript or a login** — the agent uses its own browser and passes the text on stdin.
- **`.doc`, `.pptx`, `.xlsx`** — not supported.

## 8. Knowledge model **[Proposed]**

- **Pages are organized by entity** (person, project, risk, decision), not by source, so knowledge from different sources accumulates in one place.
- **Two layers per page.** A *Summary* compiled from the facts and rewritten on every ingest; below it, *Facts* — each dated, marked decided or tentative, and cited. Replaced facts are kept, not deleted, so "what changed since…" is answerable.
- **Aliases** in frontmatter ("Ana", "Ana K.", "AK") so one person or project never becomes three pages.
- **Typed links** (`owner:: [[Ana Kim]]`, `risks:: [[vendor-delay]]`) the CLI can parse, enabling structured search.
- **Source pages** (`sources/<id>.md`) answer "what did this document change?"
- **Source ids:** `src-YYYY-MM-DD-<slug>`, suffixed on collision.
- **Citations:** wikilink to the source page at the end of each claim — `[[src-2026-10-16-q4-status]]`. Obsidian-compatible and greppable by lint.
- **Page frontmatter:** `type`, `title`, `summary`, `sources[]`, `updated`. The CLI builds `index.md` from frontmatter, so the index is deterministic.
- **Raw files are immutable.** Each ingest records the rule version it used, so when a rule changes, `wikeeper status` can list sources worth re-ingesting.

## 9. Rule evolution **[Agreed: agent offers · Proposed: mechanics]**

Proposals come from:
- a source kind with no matching rule;
- information that keeps appearing but isn't captured;
- questions `wiki_search` couldn't answer (misses are logged);
- the user's edits and rejections during ingest (strongest signal — removing "salary" from a plan suggests a *Never capture* rule).

Each proposal is a small diff the user approves. Approved → rule version bumped, changelog line added, logged. Rejected → logged so it isn't offered again. `wikeeper lint --rules` flags duplicate or contradictory rules.

## 10. CLI surface

| Command | Purpose | Status |
|---|---|---|
| `init [--profile management] [--agents …]` | scaffold `.wiki/`, inject agent blocks | Agreed |
| `update` | replace package-owned files | Agreed |
| `remove [--purge]` | remove tooling; `--purge` also deletes knowledge | Agreed |
| `ingest start / plan / facts / apply / finish / abort` | gated, three-phase ingest (§7.3) | Agreed (hooks, phases) |
| `read <file\|url>` | markdown for formats the agent can't read itself (§7.7) | Proposed |
| `status` | open ingests, sources with outdated rule versions | Proposed |
| `lint [--rules]` | broken links, uncited claims, unlogged changes, index drift, rule conflicts | Proposed |
| `search <query>` | **wiki_search** — query the wiki; also used by ingest to find pages to update | Agreed (modes Proposed) |
| `doctor` | agent wiring, duplicate blocks, config validity | Proposed |
| `setup --done` | mark setup complete | Proposed |

Every command supports `--json`: the agent is the main consumer. **[Proposed]**

## 11. Config **[Proposed shape]**

```yaml
# .wiki/config.yml
profile: management
setup_completed_at: null
agents: [claude, codex, antigravity]

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

1. **Content location** — everything in `.wiki/` (invisible to Obsidian) or a visible `content_dir`?
2. ~~**Conversion**~~ — resolved: the agent reads; the CLI offers `wikeeper read` as a helper (D-20).
3. **Whitelist keys** — source kind, origin, or both?
4. **Ambient offers** — on by default?
5. ~~**Package and binary name**~~ — resolved: `wikeeper` (D-21).
6. **Private pages** — can `team.md` be gitignored?
7. **Team use** — two people ingesting on separate branches will conflict on `log.md` and `index.md`. Per-entry log files? Regenerate index on merge?
8. **wiki_search as an MCP tool** in addition to the CLI? Needs a config file per agent (§6.2), and Codex only loads it in trusted projects.
9. **Enforcement default** — should `init` offer `--enforce` (§6.6) interactively, or leave it as a flag?
10. ~~**Delegation in Codex and Antigravity**~~ — resolved: both support sub-agents (§6.2, §7.6). Codex model ids are user-set.

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
| D-11 | Wiki instructions injected at the top of agent files, separated by markers; if present, the file is not modified. |
| D-12 | If no agent file exists, create `AGENTS.md` and ask which others to add. |
| D-13 | First profile: Management — team, project-specific knowledge, general risks. |
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
