# WIKI.md — the wiki protocol

This file is the one procedure every agent follows to run the wiki: main agent or sub-agent, Claude Code, Codex or Antigravity. The CLI keeps the registry, the lock and the checks; you read, judge and write the pages. Pages change only in the write phase.

## Talking to the user

The commands, flags, codes, JSON and settings keys and wikeeper's own file names in these instructions are for you, not for the user. Never say one to the user, and never ask the user to run a command: run it yourself, after their yes where one is needed, and tell them in plain words what you did or found. You may name the user's own files (`me.md`, `project.md`, `config.yml`, `kb_instructions.md`) when you show or change one. The one exception is a step only the user can take, such as a command you must never run (section "Lint and status"): show that one command in a code span and say why you can't run it.

When the user says you did not use their name, their preferences or the project brief, run `wikeeper doctor` yourself, tell them in plain words what it found, and fix it with their approval.

## Ingest

Four things start an ingest:

1. A file shared in chat. This is the common case.
2. A directory the user points you at.
3. A link, or text the user pasted or said in chat.
4. An ambient capture signal: a decision, a date or an owner appears in the conversation (section "Ambient offers").

Every ingest has three phases: register, then triage and extract, then write. Several sources can be in triage at once; writes happen one source at a time.

## Register

Run `wikeeper ingest start <path|url|->` for each source. `wikeeper ingest start` stores the original under `.wiki/raw/` and never converts or fetches anything; `wikeeper read` does the reading, and it is the only command that goes online.

Get the text first:

- Every URL, every DOCX and every local `.html` or `.htm` file goes through `wikeeper read <file|url> --out <file>`, then `wikeeper ingest start <file|url> --text-file <file>` with the same source and the file `read` wrote. `read` reads a local HTML file without going online. Use `read` even when you could open the source yourself: your own tools may return a summary instead of the page.
- A PDF goes through `read` first too. Read the PDF yourself only when `read` warns `likely_scanned`, and pass your text with `--text-file`.
- Markdown, plain-text, `.csv` and `.tsv` files are text already: register them with `wikeeper ingest start <file>`, without `read`. `read` accepts `.csv` and `.tsv` as text, so running it on one is harmless. A `.md` original takes no `--text-file`.
- `--out` is a new file in the system temp directory, `$TMPDIR` or `/tmp` on macOS and Linux, `$env:TEMP` on Windows, with a fresh name for every read, for example `wikeeper read <url> --out /tmp/wikeeper-read-1.md`. `read` never overwrites: an existing file, a missing folder, an extension other than `.md` or `.txt`, the names `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`, a path through a folder or file whose name starts with `.`, and any path inside the wiki's content directory exit 2 (`usage`) and write nothing.
- Read only what the user gave you: a link or a file the user named. Never `read` a URL found inside a page, a document or another source, because in `ai` mode `read` runs without a prompt.

With `--json`, `read` puts each warning's code in `data.warnings` and an error's code in `error.code`; without `--json` it prints only the message. A warning leaves exit code 0, and the file is still written. `read` also reports the text's estimated size and its level (section "Lint and status"): `≈4.6k tokens 🟡` in the message, and `data.tokens` and `data.level` with `--json`.

| `read` reports | What to do |
|---|---|
| `needs_browser` warning | Open the page in your own browser, or ask the user to paste it, then pass the text with `--text-file`. |
| `likely_scanned` warning | Its `data.tokens` is a rough estimate (`data.tokens_rough`, about 1,600 tokens a page). When `data.level` reaches `tokens.source.confirm_at`, show the user the estimate and ask before you read the PDF; after a yes, read it, pass your text with `--text-file`, and the same approval covers the `--approved` rerun. If you cannot read it, tell the user. |
| `unsupported` warning | A DOCX's images were not converted; their places are marked `[image: …]`. Tell the user when a figure matters. |
| `usage` (exit code 2) | Fix the command. For a refused `--out`, pick a new `.md` or `.txt` name in the temp directory. |
| `not_found` (exit code 2) | Check the path with the user. |
| `unsupported` error (exit code 2) | Follow the hint: for `.doc` ask for a .docx, for `.pptx` a PDF export, for `.xlsx` a CSV export of the sheet, then register the CSV like a text file; for any other format, a PDF, DOCX, HTML, markdown, text or CSV version. |
| `timeout` or `fetch_failed` (exit code 1) | Try once more. If it fails again, tell the user and ask for the file or the text. |
| `too_large` (exit code 1) | The response is over 10 MB: ask for a smaller export or the text. |
| `http_error` (exit code 1) | Read `details.status`. A 401 or 403 means a login: ask the user to paste the page. A 404 means a wrong link: check it with the user. Any other status: tell the user. |
| `conversion_failed` (exit code 1) | For a PDF, read it yourself. For a DOCX, ask the user for another export. |

Then register:

- Add `--kind <kind>` when you know the source kind.
- Add `--text-file <file>` for the source's text: the file `wikeeper read` wrote, or text you already have. A URL needs `--text-file`.
- A chat excerpt goes on stdin with `-`.
- `--title` and `--provided-by` record a title and who supplied the source.
- A duplicate reports the prior ingest. Use `--reingest` only when the user asks for it.
- exit code 3 (`needs_approval`): ask in chat, telling the user in plain words what needs their yes, never the command's raw output or codes. With `--json`, `error.details.cause` says why: `permission` (show the origin, size in bytes, kind and rule), `size` or `both`. A `size` approval comes in every permission mode when the source's estimate reaches `tokens.source.confirm_at`: show the estimate, its level and the limit from `error.details.size`, and say the estimate is rough when `rough` is true (a PDF without a text layer, counted at about 1,600 tokens a page). Rerun with `--approved` only after the user agrees. One chat approval of this exact source (same path and size) covers the `--approved` rerun, so do not ask again. If the user declines, stop: nothing was stored.
- A 🔴 source, at or above `tokens.source.red`: when you ask, offer two ways to keep it out of your own context, in plain words: a helper reads it and hands back only the facts (the `wiki-extractor` sub-agent, section "Delegation"; never name it to the user), or you read only the parts the user picks and tell them the rest is not captured. Without sub-agents, offer only the second.
- exit code 4 (`denied`): tell the user in plain words why it was refused; nothing was stored.
- Permission prompts: with `enforce` on, your harness may ask the user before a command runs (in `ask` mode before `wikeeper ingest start`; in `ai` mode before `wikeeper ingest abort <id> --drop` and `wikeeper ingest apply <id> --force-unlock`, or before every `wikeeper ingest abort` in Codex). Get the user's approval in chat before you drop a source or take over a lock; the harness prompt that follows is the harness's own and is not a second approval to request in chat.
- A directory: run `wikeeper ingest plan <dir>`, show the user the plan in plain words, not the command's raw output, with each file's estimate and the total, say which estimates are rough, and get approval. Then run `wikeeper ingest start <file>` for each approved new file, with `--approved` when the plan marks it `needs_approval`: the plan approval covers them. When `ingest start` still exits 3 for `size`, the exact count reached `tokens.source.confirm_at` although the plan's estimate did not: ask about that file as above.

In `whitelist` mode a source runs without asking when its origin matches an entry of `ingest.whitelist.origins` or its kind is listed in `ingest.whitelist.kinds`; any other source is denied (exit code 4), even with `--approved`. A kind entry is a source-kind id and matches every version of that kind (`meeting-notes`); a source started without `--kind` passes while kind entries exist, and `wikeeper ingest facts` then checks its kind. An origin entry that contains `/`, or starts with `.` or `~`, is a path glob and matches only files. It is matched against the whole path: a file inside the repository by its path from the repository root (`docs/meetings/**`, never `./docs/meetings/**`), any other file by its absolute path (`~/Documents/notes/*.md`, where `~/` is the home folder). `*` matches within one folder, `**` across folders and `?` one character. Any other entry is a host name, without scheme, port or path, and matches only URLs, ignoring case: `docs.example.com` matches that host only, and `*.example.com` matches its subdomains but not `example.com` itself. Never start a host with `.`: that makes it a path. Text on stdin (`-`) never matches an origin, so a chat capture (`wikeeper ingest start -`) runs only when its kind is in `ingest.whitelist.kinds`. With no kind entries, a chat capture is denied at `wikeeper ingest start`.

## Triage and extract

1. Read `.wiki/index.md`, then run `wikeeper search --no-miss` for the entities and terms the source names (`--entity` for people and projects). Find out what the wiki already knows.
2. Pick the source kind. Its rule in `.wiki/kb_instructions.md` (`## Source kinds`) decides what to extract and where it goes; follow the `note:` lines under `## Source kinds` together with it. A bare target (`decision`) means every field listed for that entity under `## Entities`; `entity.field` (`project.status`) means that field only. No rule for the kind: propose one (section "Proposing rule changes").
3. Extract facts. Each fact is routed to an entity and a page, is dated, is marked `decided` or `tentative`, and carries its anchor in the source. Note what the source holds that no rule covers. A page name with a `<…>` placeholder under `## Entities` is filled with the entity's id when the source gives one (`initiatives/initiative-005.md`), otherwise with its title as a lowercase, hyphenated slug.
4. Submit with `wikeeper ingest facts <id> --file <facts.json>`, or on stdin. The CLI validates the file (section "Facts file").

A source that only points to another file ("read … for the rest") or is cut short: report it to the user, who decides whether to ingest the real file instead. Write nothing for it until they decide.

## Write phase

One source at a time. A `wiki-writer` works from the facts file and the brief in its task (section "Brief").

1. Run `wikeeper ingest apply <id>`. It takes the lock and prints the brief's `ingest` line and the facts. A lock held by another ingest: wait or ask the user. `--force-unlock` is for stale locks only.
2. Reconcile each fact against the existing pages as new, confirms, updates or contradicts, and resolve aliases to the entity they name. Add an alias to a page only when a fact carries it.
3. Create new pages in the shapes of section "Page format", with the page names and entity types listed under Entities in `.wiki/kb_instructions.md`.
4. Only `sources/<id>.md` starts from `.wiki/system/templates/source.md`.
5. End every claim with the citation `[[<id>]]`. Cite only what the source says: the rules in `.wiki/kb_instructions.md` and the project brief are not sources, so nothing that comes only from them goes on a page.
6. Flag a contradiction with both sources; never overwrite the earlier fact. Keep every fact line an updated page had at apply. An update or a correction is a new dated line, and the old line stays as it was: never reword, redate or re-mark it, and never move it to another page. Moving a line within the page, or changing its list marker or spacing, is fine. Only merging a duplicate page and a clean-up move lines off a page (below).
7. Write nothing outside `pages/`, except `archive/` in a clean-up (below).
8. Write and edit pages only with your file-edit tools: Write or Edit in Claude Code, `apply_patch` in Codex, `write_to_file` or `replace_file_content` in Antigravity. Never write a page from the shell: no redirection, heredoc or `sed`. With `enforce` on, the write guard sees only the file-edit tools, so a shell write is not blocked, and `wikeeper lint` reports it later as an `unlogged-change` finding.
9. Run `wikeeper ingest finish <id>` and pass on its figures to the user in plain words: pages created and updated, contradictions, rule suggestions and sizes. Never paste the report, and leave out its sha, rule version and permission mode. The report holds metadata only. It also lists the lint findings for the pages this ingest changed; they never fail `finish`, and section "Lint and status" says what to do with them. Its `wiki ≈… tokens` line gives the wiki's size after the ingest, the change and the largest page.

If `finish` fails, fix the pages it names and rerun it, or run `wikeeper ingest abort <id>` (`--drop` also deletes the registered source). When `finish` refuses with `fact lines dropped`, put each named line back exactly as it was or, in a clean-up, add it unchanged to `archive/<path>`; then run `wikeeper ingest finish <id>` again; the lock is still held. When it refuses with `archived fact lines dropped`, put each named line back in its archive page exactly as it was, or restore the deleted archive page: no line ever leaves `archive/`. Before you delete a page, for example to merge a duplicate into another page, copy each of its fact lines unchanged to the page it merges into; in a clean-up you may move them to `archive/` instead. `finish` refuses a deleted page whose fact lines are nowhere else in `pages/` or `archive/`, with `fact lines dropped`, naming the page and its lines. Once `finish` exits 0 the ingest is closed: change nothing under `pages/` or `archive/`. A correction after `finish` comes in as a chat-excerpt ingest: run `wikeeper ingest start -` with the user's correction on stdin, then triage and the write phase, so every page change has a source and a log entry; its write phase adds the corrected fact as a new line (step 6). Pages never change outside this phase. If `wikeeper ingest` cannot run, write nothing and tell the user.

A clean-up moves facts the user no longer needs on a page into `archive/`, which keeps them. Run one only when the user asks for it, and never start one yourself; an ordinary ingest moves nothing to `archive/`. In a clean-up:

- Pick what to move: fact lines that a newer line on the same page replaced, and the fact lines of entities with a final status, such as shipped, closed or done (the whole page when the page is that entity). Keep the newest line of each fact and everything still open. Show the user the lines and pages, and move only what they approve.
- Run `wikeeper ingest start -` with the user's decision on stdin, adding `--kind <kind>` as section "Ambient offers" says, then `wikeeper ingest facts <id>` with a facts file whose `facts` list is empty, then the write phase. Do it yourself: a `wiki-writer` writes only under `pages/`.
- To move a fact line, cut it from `pages/<path>` and add it unchanged to `archive/<path>`, the same path under `archive/`. An archive page has the page's frontmatter, a `summary` saying it holds archived facts, and the moved lines under `## Facts`, oldest first; on a multi-entry page, keep each line under its entry's `##` heading. On the page, put the typed line `archive:: [[archive/<path>]]` with its typed links, `<path>` written without `.md` (for example `archive:: [[archive/projects/atlas]]`); it is the one link written by path, because it names the archive page, not an entity. Rewrite the Summary if it named a moved fact, and add the clean-up's source id to `sources`.
- To move a whole page, create `archive/<path>` with all of its text and delete `pages/<path>`. Links to it still resolve.
- Write `sources/<id>.md` and run `wikeeper ingest finish <id>`. Its report adds `archived N fact lines · M pages`. When a page is still 🔴, tell the user.

A later source about an archived entity gets a new page in `pages/`; leave its archive page as it is.

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
- Facts: one dated line each, marked `decided` or `tentative`, with a citation. A replaced fact stays in the list; the newer line carries the change. Only a clean-up the user asks for moves facts to `archive/` (section "Write phase"). Fact lines are ordered by date, oldest first; a new line goes in at its date.

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
- 2026-09-30 · decided · Scope is the self-service portal only. [[src-2026-09-30-kickoff]]
- 2026-10-14 · tentative · Launch slips to December. [[src-2026-10-14-vendor-call]] · contradicts:: [[src-2026-10-16-q4-status]]
- 2026-10-15 · tentative · Launch targets 2026-11-17. [[src-2026-10-16-q4-status]]
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
| Link | the main agent gets the text with `wikeeper read` (section "Register"); `wiki-extractor` or the main agent extracts | `wiki-writer`, or the main agent |

- `wiki-extractor` (small tier) extracts and submits facts and never writes pages.
- `wiki-writer` (medium tier) gets the brief, which the main agent writes into its task, and the facts file path — facts, not sources — and runs `wikeeper ingest apply`, writes the pages, and runs `wikeeper ingest finish`.
- When `ingest.delegate` is `never`, or the agent cannot delegate, the main agent runs both phases itself, with the same steps and the same facts file.

## Ambient offers

A capture signal is a decision, a date, an owner or a commitment that appears in conversation and is not in the wiki. Do not ingest it silently. At the end of your reply, offer to capture it, batching all signals of that reply into one offer. Say which items are decided and which are still being considered. When unsure whether something is worth capturing, ask.

On approval, run `wikeeper ingest start -` with the excerpt on stdin, then continue with triage and the write phase. When `.wiki/kb_instructions.md` lists a source kind for chat captures, pass its id, without the version, with `--kind` (`wikeeper ingest start - --kind <kind>`), so that in `whitelist` mode the capture is allowed or denied at `ingest start`, before any extraction (section "Register"). Setting `ingest.ambient_offers: false` in `.wiki/config.yml` turns offers off.

## Search

`wikeeper search "<query>"` finds what the wiki already knows. Options:

- `--type <type>`: only entities of that type.
- `--where key=value`: filter on a typed link value; repeatable.
- `--status <status>`: only entities whose `status::` link, or whose page frontmatter `status`, has that value, such as `open`. It does not filter facts by `decided` or `tentative`: use `--mark` for that, as in `wikeeper search --mark tentative`.
- `--mark <decided|tentative>`: only fact lines with that mark. It combines with `--type`, `--where`, `--status`, `--entity` and `--since`; a search with a text query refuses it (exit code 2).
- `--entity <name>`: a name or an alias; returns the entity, its facts, its backlinks and other matches. It is not combined with a query, `--type`, `--where` or `--status`; it combines with `--since` and `--mark`.
- `--since <date>`: YYYY-MM-DD or an ISO date-time; dated facts and pages changed by an ingest.
- `--archive`: also search `archive/`, where clean-ups keep replaced and finished facts, as in `wikeeper search "launch date" --archive`; its hits carry `archived: true`. `--since` and `--entity` always include archived facts, marked `archived: true`.
- `--misses`: list the queries that found nothing.
- `--no-miss`: do not record a miss when the search finds nothing. Use it for triage and routing searches, so that a miss records only a question someone asked the wiki.
- `--limit <n>`: cap the results.
- `--json`: machine-readable output.

With `--json`, each hit carries `page_tokens`, the estimated size of its page (section "Lint and status"). Of a 🔴 page, read only the parts the question needs.

Use search at triage and to answer questions.

## Answering questions

1. Search first.
2. Read the pages it returns.
3. Answer from them, citing the sources as `[[src-…]]`.
4. When the wiki does not know, say so plainly. Do not guess.

When a question is about the past, such as an earlier plan, date or owner, and the pages do not answer it, search again with `--archive`.

When no page answers, you may quote `.wiki/project.md`, labelled as uncited context from the project brief. The core terms in `.wiki/project.md` are the brief; term pages written by ingests hold cited terms. When the two disagree, the cited page wins: answer from it and offer the user an update to `.wiki/project.md`.

A search that finds nothing is logged as a miss automatically, unless it runs with `--no-miss`; do nothing extra. A search that answers a question never uses `--no-miss`.

## Proposing rule changes

`.wiki/kb_instructions.md` holds the rules the wiki follows. You propose changes; the user decides. Proposals come from:

- a source kind with no rule;
- information that keeps appearing and is never captured, such as the pending rule suggestions `wikeeper status` lists;
- misses from `wikeeper search --misses`;
- findings of `wikeeper lint --rules`;
- the user's corrections;
- the user's answers during onboarding in `.wiki/system/ONBOARDING.md`.

Before you offer a proposal, run `wikeeper rules list`. Do not offer a proposal the user rejected before (same kind and summary), unless the user brings it up again.

A proposal is a small diff to `.wiki/kb_instructions.md`, written in the file's line format (`.wiki/system/SETUP.md`, step 3). Show it and wait for approval. A question that dated facts answer, such as "What changed since <date>?", ends with ` (dated facts)`: it needs no entity, `wikeeper search --since <date>` answers it, and `wikeeper lint --rules` does not report it as a question no rule serves.

Every proposal has a kind: the source-kind id it adds or changes (`meeting-notes`), or, for a change to another section, that section's key: `questions`, `entities`, `capture-signals`, `write-policy` or `never-capture`. Use the same kind each time the same proposal comes back.

An approved change gets one line under `## Rule changelog`, in the form `- YYYY-MM-DD: <kind> v<N>: <change>`, with the kind's new version, for example `- 2026-10-20: meeting-notes v2: also capture action owners`. Kinds changed together are listed one after another: `- YYYY-MM-DD: <kind> v<N>, <kind> v<N>: <change>`. A change to another section names its key and no version: `- 2026-10-20: never-capture: salaries and bonuses`.

To show what a changed rule would do to a source already ingested, finished or not, extract its facts again from `.wiki/raw/` under the proposed rule into a facts file in the system temp directory, keeping each anchor a quote from the source so that unchanged facts pair up, and run `wikeeper ingest facts <id> --file <facts.json> --dry-run`. It prints the facts that would be added, removed and changed, and stores nothing. With the proposal, tell the user in plain words which facts would be added, removed and changed, not the command's raw output.

Record every decision with `wikeeper rules record --accepted --kind <kind> --summary "<one line>" --from <source-id>` or `wikeeper rules record --rejected --kind <kind> --summary "<one line>" --from <source-id>`, where `<kind>` is the proposal's kind as given above. `--from` names the source whose pending suggestions led to the proposal, so that `wikeeper status` stops listing them; leave it out otherwise. One decision with `--from` clears every pending item of that source, so decide every item of a source before you record with `--from`. When a proposal comes back, reuse its earlier summary, so that the CLI can report it as previously rejected.

- Approved: edit the file, bump that kind's `(vN)` version and add a changelog line in that form, run `wikeeper lint --rules`, and record the decision with `--accepted`. Then offer to re-ingest the sources `wikeeper status` lists as re-ingest candidates.
- Rejected: record it with `--rejected` and change nothing in the file.

## Lint and status

Run `wikeeper status` once per session, before the first ingest, and whenever the user asks what is open or pending in the wiki. `wikeeper status`, `wikeeper lint`, `wikeeper rules list`, `wikeeper config get` and `wikeeper statusline` only read: with `enforce` on, Claude Code and Codex run them without a permission prompt in every mode. That rule also covers `wikeeper statusline --install`, which writes a settings file, so run it only as said below. `wikeeper rules record` writes a log event, and `wikeeper config set` and `wikeeper config unset` change `.wiki/config.yml`, so your harness may ask first.

Sizes are estimated tokens: how much of a context a document or a page fills. Each is printed with `≈` and is within about ±15% of Claude's count; Codex models count fewer tokens for the same text. A source is 🟢, 🟡 or 🔴 against `tokens.source` in `.wiki/config.yml` (yellow 20k and red 60k by default), a page against `tokens.page` (4k and 10k); the wiki total has no level. `wikeeper read`, `wikeeper ingest start`, `wikeeper ingest plan`, the `finish` report, search hits, `wikeeper status` and `wikeeper statusline` report sizes. Give the user only sizes the CLI printed; never estimate one yourself.

`wikeeper statusline` prints one line, for example `wiki ≈66k tokens · 43 pages · largest page ≈6.3k 🟡`. Run it first in every session and write its line to the user at once, before any other command or text; then go on with the request. If it prints `wiki size unavailable (…)` instead, do not show that line: run `wikeeper doctor` and tell the user in plain words what is wrong. When the user wants it always in view in Claude Code, run `wikeeper statusline --install` with their agreement: it adds the line to Claude Code's status line for this repo, in `.claude/settings.local.json`. It never replaces a status line that is already set. When it refuses, tell the user which settings file already has a status line, and show them, in a code span, the one line from the refusal they can add to that status line's script (`printf '%s' "$input" | …`); you never edit their status line.

`wikeeper config get tokens` shows the limits and marks the values that come from the defaults. Change a limit only when the user asks, with `wikeeper config set <key> <value>`, for example `wikeeper config set tokens.page.red 12k`; `wikeeper config unset <key>` returns a key to its default. A value is a whole number or a short form such as `20k`, and yellow stays below red. `tokens.source.confirm_at` is `yellow`, `red` or `never`: the level at which `wikeeper ingest start` asks before a source is read.

When a page reaches 🔴 (the `finish` report's largest page, `tokens.largest` in `wikeeper status --json`, `wikeeper statusline` or an `oversized-page` finding), tell the user once in the session, however many of these show it: name the page and its size, and offer both choices in plain words: you raise the page limit for them (on a yes, `wikeeper config set tokens.page.red <n>`), or they ask for a clean-up, which moves replaced and finished facts to `archive/` and keeps them (section "Write phase"). Do not bring it up again in that session unless the user asks, and never change a limit or start a clean-up yourself.

Ingest commands ask npm for a newer version at most once a day. While one is out, `wikeeper ingest plan` and `wikeeper ingest start` add the warning `wikeeper 0.4.1 is available (installed 0.4.0): run wikeeper upgrade`, `wikeeper status` prints the same text on its `version:` line and sets `version.latest`, and `wikeeper doctor` reports it as the `update-available` check. Tell the user once in the session and ask whether to upgrade; on a yes, run `wikeeper upgrade`. It installs the new version with npm the way the running copy was installed, then runs `wikeeper update` in this repository as the new version. Never upgrade unasked, and do not bring it up again in that session unless the user asks. When a newer version is out and this project's files are older too, ask once, whether to upgrade: it refreshes the files as well. When several of these are due at once, tell them in one message after the user's request is done: a red page and its clean-up candidates first, then the version question. When `wikeeper upgrade` fails, tell the user in plain words what failed and whether anything was installed. If `error.details.command` starts with `sudo`, uses pnpm, yarn or bun, is to be run as administrator, or needs npm, which was not found, show the user that one command in a code span and say why you don't run it; when they say it is done, run `error.details.then` if it is set (their reply is the yes for it). Offer to run any other `error.details.command`, such as `wikeeper update` after `update_failed`. When it is null, say in plain words what the message asks: to try again later, or to update the folder it runs from. When `wikeeper status` says the project's files are from another version (`version.files`, and the `version-mismatch` check in `wikeeper doctor`), tell the user and, on a yes, run the command it names: `wikeeper update` when the files are older, `wikeeper upgrade` when the installed version is older. Ask before `wikeeper update` too: besides wikeeper's own files under `.wiki/system/`, it rewrites the hooks and the pointer block in `AGENTS.md` and `CLAUDE.md`.

The fields of the `--json` output of `wikeeper status`, and what to do with each:

- `open_ingest` and `stale_lock`: an ingest holds the write lock. Finish or abort it (section "Write phase") when it is yours; otherwise wait or ask the user. When `stale_lock` is true, run `wikeeper ingest apply <id> --force-unlock` only with the user's approval.
- `unfinished_sources`: registered sources with no finished ingest. An aborted source stays listed until it is finished or dropped. Offer to continue each one, or to drop it with `wikeeper ingest abort <id> --drop` once the user agrees.
- `reingest_candidates`: sources finished under an older rule version. Offer to re-ingest each from its `origin`, from the repository root: `wikeeper ingest start <origin> --reingest`, after `wikeeper read <origin> --out <file>` and with `--text-file <file>` when the origin is a URL or a file type that section "Register" sends through `read`. An origin `stdin` was text from chat: pass its stored text, `.wiki/raw/<source_id>.md`, on stdin to `wikeeper ingest start - --reingest`. When the origin is gone, fall back on what `.wiki/raw/` keeps:
  - A file origin that is missing, moved or changed. Missing or moved: `read` reports `not_found`, and `ingest start` reports "source not found". Changed: the `--json` output of `ingest start <origin> --reingest` has `source.reingest_of` null, because a changed file has a new hash; drop that registration with `wikeeper ingest abort <id> --drop` and tell the user the file changed (ingest the new version as a new source only if they ask). Then copy the stored original, `.wiki/raw/<source_id><ext>` (the `original` name in `.wiki/raw/<source_id>.meta.json`), into a new folder in the system temp directory under the origin's file name, and run `wikeeper ingest start <copy> --kind <kind> --reingest` with the candidate's `kind`, after `wikeeper read <copy> --out <file>` and with `--text-file <file>` when section "Register" sends that file type through `read`. The copy is needed because `ingest start` refuses a path inside the wiki; it has the same bytes, so the new source joins the old one's re-ingest family.
  - The copy in `whitelist` mode: its temp path matches no origin entry, and `--approved` does not override a whitelist denial. `--kind` lets a kind entry of `ingest.whitelist.kinds` allow the copy at `ingest start`, before any facts are extracted. When the kind is not listed, `ingest start` denies the copy (exit code 4): tell the user in plain words that the re-ingest needs this kind of document added to the ones their `config.yml` lets in without asking, and add it to `ingest.whitelist.kinds` only with their approval; otherwise leave the source as it is.
  - A URL origin whose `read` fails, after one more try: `.wiki/raw/` keeps no copy of the page, only the text, `.wiki/raw/<source_id>.md`. Pass `--text-file .wiki/raw/<source_id>.md` to `wikeeper ingest start <origin> --reingest`. No copy is needed, and the origin stays the URL, so a whitelist host entry still matches.
  - Nothing stored (no `.wiki/raw/<source_id>.*` file): tell the user.
- `pending_rule_suggestions`: what finished ingests could not capture, by source. Propose rule changes for them (section "Proposing rule changes").
- `setup`: when `completed_at` is null, offer `.wiki/system/SETUP.md`; when `me` is false, offer `.wiki/system/ONBOARDING.md`.
- `misses`: how many searches found nothing. `wikeeper search --misses` lists them, and they feed rule proposals.
- `tokens`: the wiki's size: `wiki` (all pages), `page_count`, `index` (`.wiki/index.md`), the `limits`, and the five `largest` pages, each with its `level`. A 🔴 page is handled as said above.
- `archive`: the size of `archive/`: its `pages` and estimated `tokens`. They are not counted in `tokens`, and a search skips them unless it runs with `--archive`.
- `archive_candidates`: pages a clean-up could shrink, each with its `reason`: `size` (at or above `tokens.page.red`) or `final_status` (an entity with a final status whose newest fact is older than `lint.stale_after_days`). Tell the user about them once in the session: for `size`, the red-page notice above, told once with it; for `final_status`, a clean-up that moves that entity's fact lines to `archive/` (the whole page when the entity is the page), or leaving it. Never start a clean-up yourself.
- `version`: `installed` is the version that ran this command; `latest` is a newer version on npm, from the check that ingest commands make at most once a day (null when none is known or the check is off); `files` is the version this project's files come from, as the manifest records it (null when it records none). Handle them as said above.

`wikeeper lint` checks the pages and reports findings; it never changes anything. Each finding names its check id, the file from the repository root and, when known, the line. It exits 1 when any finding is an error. `wikeeper ingest finish` already reports the `broken-link`, `uncited-claim`, `unlogged-change` and `oversized-page` findings for the pages it changed. Run `wikeeper lint` after a merge or pull that touched the wiki (after `wikeeper index rebuild`), and when the user asks whether the wiki is in good shape. `wikeeper lint --check <id>` reruns one check, for example `wikeeper lint --check unlogged-change`.

| Finding | What to do |
|---|---|
| `broken-link` | A `[[…]]` link resolves to no page, entity or alias. Fix the link in a write phase. On a page under `archive/`, never edit the line: add the old name to `aliases` of the live page that now has the entity. |
| `uncited-claim` | A claim or fact line has no `[[src-…]]` citation. In a write phase, cite the source that supports it, or remove the claim when no source does. |
| `orphan-page` | No other page links to the page. Link it from a related page in a write phase, or tell the user. |
| `index-drift` | `.wiki/index.md` is out of date. Run `wikeeper index rebuild`. |
| `unlogged-change` | The page changed outside an ingest: a shell write the guard cannot see (section "Write phase"), a hand edit, a `post_ingest` hook, or a git merge that combined two ingests' edits. Show the user the change. To keep a hand or shell edit, record it with a chat-excerpt ingest whose write phase updates that page, for example by adding the cited fact line; an ingest that leaves the page as it was at apply does not clear the finding. To drop the edit, restore the page's last ingested version from git, with the user's approval. A merged page stays reported until the next ingest updates it: tell the user, and do not restore it, because that would lose one branch's ingest. Hooks in `hooks.post_ingest` of `.wiki/config.yml` must not edit pages: page hashes are taken before the hooks run. |
| `stale-fact` | A status, or a tentative planned date, was last dated more than `lint.stale_after_days` days ago (default 30). Ask the user whether it still holds, or offer to ingest a newer source; a confirmation the user gives in chat is ingested as a chat excerpt whose write phase adds a dated fact line. |
| `oversized-page` | A page is at or above `tokens.page.red`. Tell the user once in the session, as said above: they raise the limit or ask for a clean-up; an ordinary ingest never shrinks a page. |

Pages change only in a write phase, so a page finding is fixed in the next ingest that touches the page or, when the user wants it fixed now, in a chat-excerpt ingest of their instruction. `index-drift` is the one exception.

`wikeeper lint --rules` checks `.wiki/kb_instructions.md` and the whitelist kinds in `.wiki/config.yml`: the line format, rules that duplicate each other or name an unknown entity or field, questions no rule serves, entities no question needs, changelog lines that do not match the versions, and whitelist kinds that name no kind. It exits 1 when any finding is an error. Run it after every approved change to that file, and when `wikeeper doctor` warns that the file has parse issues (its `kb-instructions-valid` check). Each finding becomes a proposal (section "Proposing rule changes"); never edit the file without the user's approval. An `ambiguous-line` finding on a source-kind line inside an HTML comment means `wikeeper ingest` still reads that rule: propose deleting the line or turning it into a `note:` line.

## Log and index

`.wiki/log/` holds one file per event. It is committed and merge-safe. `.wiki/log.md` is a generated view and is gitignored. `.wiki/index.md` is generated from page frontmatter; never edit it by hand.

After a merge or pull that touched the wiki, run `wikeeper index rebuild`. It refuses while an ingest holds the lock. Then run `wikeeper lint`: pages that both branches' ingests changed are reported as `unlogged-change` until the next ingest updates them (section "Lint and status").
