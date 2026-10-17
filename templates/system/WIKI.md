# WIKI.md — the wiki protocol

This file is the one procedure every agent follows to run the wiki: main agent or sub-agent, Claude Code, Codex or Antigravity. The CLI keeps the registry, the lock and the checks; you read, judge and write the pages. Pages change only in the write phase.

## Ingest

Four things start an ingest:

1. A file shared in chat. This is the common case.
2. A directory the user points you at.
3. A link, or text the user pasted or said in chat.
4. An ambient capture signal: a decision, a date or an owner appears in the conversation (section "Ambient offers").

Every ingest has three phases: register, then triage and extract, then write. Several sources can be in triage at once; writes happen one source at a time.

## Register

Run `wikeeper ingest start <path|url|->` for each source. The CLI stores the original under `.wiki/raw/` and never converts or fetches anything.

- Add `--kind <kind>` when you know the source kind.
- Add `--text-file <file>` for text you already read, for example a PDF you extracted or a page you fetched. A URL needs `--text-file`.
- A chat excerpt goes on stdin with `-`.
- `--title` and `--provided-by` record a title and who supplied the source.
- A duplicate reports the prior ingest. Use `--reingest` only when the user asks for it.
- exit code 3 (`needs_approval`): show the returned metadata, ask in chat, and rerun with `--approved` only after the user agrees.
- exit code 4 (`denied`): tell the user the reason; nothing was stored.
- A directory: run `wikeeper ingest plan <dir>`, show the plan, get approval, then run `wikeeper ingest start` for each approved new file.

## Triage and extract

1. Read `.wiki/index.md`, then run `wikeeper search` for the entities and terms the source names (`--entity` for people and projects). Find out what the wiki already knows.
2. Pick the source kind. Its rule in `.wiki/kb_instructions.md` (`## Source kinds`) decides what to extract and where it goes. No rule for the kind: propose one (section "Proposing rule changes").
3. Extract facts. Each fact is routed to an entity and a page, is dated, is marked `decided` or `tentative`, and carries its anchor in the source. Note what the source holds that no rule covers.
4. Submit with `wikeeper ingest facts <id> --file <facts.json>`, or on stdin. The CLI validates the file (section "Facts file").

## Write phase

One source at a time. A `wiki-writer` works from the facts file and the brief in its task (section "Brief").

1. Run `wikeeper ingest apply <id>`. It takes the lock and prints the brief's `ingest` line and the facts. A lock held by another ingest: wait or ask the user. `--force-unlock` is for stale locks only.
2. Reconcile each fact against the existing pages as new, confirms, updates or contradicts, and resolve aliases to the entity they name.
3. Create new pages in the shapes of section "Page format", with the page names and entity types listed under Entities in `.wiki/kb_instructions.md`.
4. Only `sources/<id>.md` starts from `.wiki/system/templates/source.md`.
5. End every claim with the citation `[[<id>]]`.
6. Flag a contradiction with both sources; never overwrite the earlier fact.
7. Write nothing outside `pages/`.
8. Write and edit pages only with your file-edit tools: Write or Edit in Claude Code, `apply_patch` in Codex, `write_to_file` or `replace_file_content` in Antigravity. Never write a page from the shell: no redirection, heredoc or `sed`.
9. Run `wikeeper ingest finish <id>` and show the user its report. The report holds metadata only.

If `finish` fails, fix the pages it names and rerun it, or run `wikeeper ingest abort <id>` (`--drop` also deletes the registered source). Once `finish` exits 0 the ingest is closed: change nothing under `pages/`; a fix needs a new ingest. Pages never change outside this phase. If `wikeeper ingest` cannot run, write nothing and tell the user.

## Facts file

`raw/<id>.facts.json` is one JSON object. The schema is `.wiki/system/schemas/facts.schema.json`. Unknown keys are errors.

- `source_id`: the id from `ingest start`.
- `kind`: the source kind id.
- `rule_version`: the rule's version number from `.wiki/kb_instructions.md`, or `null` when no rule exists.
- `facts`: a list of facts. Each has `entity` (`<type>:<name>`, lowercase type), `field`, `value` (string, number or boolean), `status` (`decided` or `tentative`), `as_of` (a real date, YYYY-MM-DD), `anchor` (where in the source), `page` (path relative to `pages/`, ends in `.md`) and `exists` (true when the page already exists).
- `new_entities`: entities that have no page yet. Optional.
- `uncovered`: information the source holds that no rule captures. Optional.

```json
{
  "source_id": "src-2026-10-16-q4-status",
  "kind": "status-report",
  "rule_version": 2,
  "facts": [
    {
      "entity": "project:atlas",
      "field": "target_date",
      "value": "2026-11-17",
      "status": "tentative",
      "as_of": "2026-10-15",
      "anchor": "p.3, Timeline: \"launch now targeting Nov 17\"",
      "page": "projects/atlas.md",
      "exists": true
    },
    {
      "entity": "risk:vendor-delay",
      "field": "owner",
      "value": "Product Lead",
      "status": "decided",
      "as_of": "2026-10-15",
      "anchor": "p.4, Risks table, row 2",
      "page": "risks.md",
      "exists": false
    }
  ],
  "new_entities": ["risk:vendor-delay"],
  "uncovered": ["budget burn per project; no rule captures it"]
}
```

## Brief

The main agent writes the brief into the writer's task when it hands over the write phase: it carries what the user said, which the facts file does not hold. It has four lines, always in this order: `ingest` (the id and the facts file), `user said` (what the user said about the source), `resolved` (names the user resolved to entities) and `focus` (what to capture and what to ignore). `wikeeper ingest apply` prints only the `ingest` line; no command takes the other three. A main agent that writes the pages itself needs no brief.

```text
ingest:    src-2026-10-16-q4-status   facts: raw/src-2026-10-16-q4-status.facts.json
user said: "Q4 plan from the leadership offsite; Atlas has slipped"
resolved:  "PL" = [[Product Lead]] · "the launch" = [[Atlas]]
focus:     dates and owners; ignore the budget appendix
```

## Page format

Every page starts with frontmatter: `type`, `title`, `summary`, `aliases`, `sources` and `updated`. It must be valid YAML, or `wikeeper ingest finish` refuses the page: quote a value that contains `: `, as in `summary: "Atlas: the portal relaunch"`. Below it are two layers.

- Summary: rewritten on every ingest so it is true today.
- Facts: one dated line each, marked `decided` or `tentative`, with a citation. A replaced fact stays in the list; the newer line carries the change.

Typed links are lines of the form `key:: [[target]]`. Link an entity by its name or an alias (`[[Product Lead]]`), never by path, because `wikeeper search --entity` resolves names and aliases.

A fact line is `- YYYY-MM-DD · decided|tentative · <text> [[src-…]]`. A fact that contradicts another adds ` · contradicts:: [[src-…]]` after its citation.

Two page shapes exist. A single-entity page has one entity; its frontmatter `type` is the entity type.

```md
---
type: project
title: Atlas
summary: Customer portal relaunch; launch planned for 2026-11-17.
aliases: [Atlas launch, the portal]
sources: [src-2026-10-16-q4-status]
updated: 2026-10-16
---
# Atlas
owner:: [[Product Lead]]
risks:: [[Vendor delay]]

## Summary
Atlas relaunches the customer portal for self-service clients. The launch is planned for 2026-11-17 [[src-2026-10-16-q4-status]].

## Facts
- 2026-10-15 · tentative · Launch targets 2026-11-17. [[src-2026-10-16-q4-status]]
- 2026-09-30 · decided · Scope is the self-service portal only. [[src-2026-09-30-kickoff]]
- 2026-10-14 · tentative · Launch slips to December. [[src-2026-10-14-vendor-call]] · contradicts:: [[src-2026-10-16-q4-status]]
```

A multi-entry page, such as a people page or a risk register, has one `##` entry per entity. Each entry starts with `type::` and `aliases::` typed links. The frontmatter `type` names the collection (`risk-register`), never the entry type, or `wikeeper search --type risk` would return the page too.

```md
---
type: risk-register
title: Risks
summary: Open delivery risks with their owners and status.
sources: [src-2026-10-16-q4-status]
updated: 2026-10-16
---
# Risks

## Vendor delay
type:: risk
aliases:: vendor slip, supplier delay
owner:: [[Product Lead]]
status:: open
- 2026-10-15 · decided · The vendor delivers the payment module two weeks late. [[src-2026-10-16-q4-status]]

## Hiring gap
type:: risk
aliases:: open QA role
owner:: [[Hiring Manager]]
status:: monitoring
- 2026-10-15 · tentative · The QA role may stay open until December. [[src-2026-10-16-q4-status]]
```

## Delegation

| Case | Triage and extract | Write |
|---|---|---|
| File shared in chat | `wiki-extractor`, or the main agent | `wiki-writer`, or the main agent |
| Something said in chat | the main agent (it has the context) | `wiki-writer`, or the main agent |
| Directory | one `wiki-extractor` per approved file, in parallel | `wiki-writer`, one source at a time |
| Link | the main agent fetches the text; `wiki-extractor` or the main agent extracts | `wiki-writer`, or the main agent |

- `wiki-extractor` (small tier) extracts and submits facts and never writes pages.
- `wiki-writer` (medium tier) gets the brief, which the main agent writes into its task, and the facts file path — facts, not sources — and runs `wikeeper ingest apply`, writes the pages, and runs `wikeeper ingest finish`.
- When `ingest.delegate` is `never`, or the agent cannot delegate, the main agent runs both phases itself, with the same steps and the same facts file.

## Ambient offers

A capture signal is a decision, a date, an owner or a commitment that appears in conversation and is not in the wiki. Do not ingest it silently. At the end of your reply, offer to capture it, batching all signals of that reply into one offer. Say which items are decided and which are still being considered. When unsure whether something is worth capturing, ask.

On approval, run `wikeeper ingest start -` with the excerpt on stdin, then continue with triage and the write phase. Setting `ingest.ambient_offers: false` in `.wiki/config.yml` turns offers off.

## Search

`wikeeper search "<query>"` finds what the wiki already knows. Options:

- `--type <type>`: only entities of that type.
- `--where key=value`: filter on a typed link value; repeatable.
- `--status <status>`: only entities whose `status::` link, or whose page frontmatter `status`, has that value, such as `open`. It does not filter facts by `decided` or `tentative`.
- `--entity <name>`: a name or an alias; returns the entity, its facts, its backlinks and other matches. Not combined with a query or filters.
- `--since <date>`: YYYY-MM-DD or an ISO date-time; dated facts and pages changed by an ingest.
- `--misses`: list the queries that found nothing.
- `--limit <n>`: cap the results.
- `--json`: machine-readable output.

Use search at triage and to answer questions.

## Answering questions

1. Search first.
2. Read the pages it returns.
3. Answer from them, citing the sources as `[[src-…]]`.
4. When the wiki does not know, say so plainly. Do not guess.

A search with no results is logged as a miss automatically; do nothing extra.

## Proposing rule changes

`.wiki/kb_instructions.md` holds the rules the wiki follows. You propose changes; the user decides. Proposals come from:

- a source kind with no rule;
- information that keeps appearing and is never captured;
- misses from `wikeeper search --misses`;
- the user's corrections;
- the user's answers during onboarding in `.wiki/system/ONBOARDING.md`.

A proposal is a small diff to `.wiki/kb_instructions.md`. Show it and wait for approval.

- Approved: bump that kind's `(vN)` version and add a line under `## Rule changelog`.
- Rejected: add a changelog line marking it rejected, so it is not offered again.

## Log and index

`.wiki/log/` holds one file per event. It is committed and merge-safe. `.wiki/log.md` is a generated view and is gitignored. `.wiki/index.md` is generated from page frontmatter; never edit it by hand.

After a merge or pull that touched the wiki, run `wikeeper index rebuild`. It refuses while an ingest holds the lock.
