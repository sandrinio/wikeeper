# UX Guide — wikeeper

**Scope:** everything a wikeeper user meets. That is what the CLI prints (human lines, `--json` envelopes,
exit codes, refusals and hints), and what the agent says to the user, as the shipped instructions set it
(`templates/system/WIKI.md`, `SETUP.md`, `ONBOARDING.md`, `templates/agent-block.md`, `templates/skills/**`
and the sub-agent prompts in `templates/agents/**`).
**Status:** v1, 2026-10-18. Derived from wikeeper 0.3.0 as shipped at `8988a2c`, from `architecture.md` §2
(principles) and §13 (decisions), and from the SPRINT-03 real-user walkthrough. Rules marked **(SPRINT-04)**
describe output that EPIC-007, EPIC-008 and EPIC-009 add. Until the story merges, such a rule describes
planned work.
**Companion:** `docs/ux-map.md` holds the journeys step by step and lists every notice that can appear at
session start. On a word, the word list here (§6) wins.
**Who changes it:** the human, through a CR or a Gate 1 decision. The designer agent
(`.claude/agents/designer.md`) cites it and proposes changes to it as cross-flow notes. It never edits it.
**Citing:** a finding cites a section, e.g. "ux.md §3.2". Where shipped code breaks a rule today, the rule
follows the majority and Appendix A lists the exception. A listed exception is known, not a new finding.

---

## 1. Principles

### 1.1 Two readers
The CLI's reader is the agent, or a person at a terminal. The user reads only the agent. CLI output may
therefore name commands, flags, codes and paths (§3, §4). The agent's speech to the user may not (§1.2).

### 1.2 The agent speaks in plain words and never names commands
Real users never see or name commands. They say "add these notes", "what do we know about atlas", "remove
the wiki tools". The agent answers in the same plain words. It never says a command, a flag, an exit code,
an error code, a JSON key or a package-owned file name (§6.3), and never tells the user to run something.
It runs the command itself, after the user's yes where one is needed (§1.5).
The one exception is a step only the user can take outside the agent:
- a command the agent must never run, such as one starting with `sudo` (STORY-009-03);
- a package manager wikeeper does not drive (pnpm, yarn, bun; STORY-009-02);
- a line the user adds to their own status line script (STORY-007-06).

Then the agent shows that one command in a code span and says why it can't run it for them.
Source: the walkthrough method (SPRINT-03 report §4; CR-004).

### 1.3 Every refusal or warning names the next step
In the CLI, a refusal or warning ends with what to run or what to fix (§3.2, §3.3). For the agent, a turn
that stops for the user ends with the question or the choice, and says what happens on a yes. A refusal
that leaves the user or the agent with no next step is a dead end, and a dead end is a defect.

### 1.4 Tell once
A notice is told once per session, unless the user asks again. Notices include a red page, archive
candidates, a newer version, project files from another version and stale facts. A proposal the user
rejected is not offered again (WIKI.md "Proposing rule changes"). Notices due at the same moment go in one
message, in the order of ux-map §3, the way ambient offers are batched into one offer (WIKI.md "Ambient
offers").

### 1.5 Ask before changing anything the user didn't ask for
The agent asks in chat and waits for a yes before any of these:
- an ingest in `ask` mode;
- a size approval (SPRINT-04);
- dropping a source, or taking over a lock;
- writing `config.yml`, `kb_instructions.md`, `me.md` or `project.md`;
- `git rm` or editing `.gitignore`;
- a re-ingest;
- restoring a page from git;
- a clean-up into the archive or a changed limit (SPRINT-04);
- `update`, `upgrade` or installing the status line (SPRINT-04).

One yes covers the rerun it was asked for, so the agent does not ask twice (WIKI.md "Register"). A harness
permission prompt is the harness's own and is never a second approval to ask for in chat. A no stops: the
agent stores nothing and does not retry the same thing another way.

### 1.6 Metadata only
After an ingest the user sees metadata, not content (architecture.md D-08). Reports carry ids, kinds,
origins, counts, sizes, levels and paths, and never page or source text. The agent passes on what the CLI
reported, which comes from the snapshot diff (architecture.md §7.5), not what it believes it changed.

### 1.7 The CLI decides, the agent explains
Permissions, approvals, refusals, sizes and counts come from the CLI (architecture.md §2, principles 1 and
2). The agent never states a size, a count or an outcome that the CLI did not print.

### 1.8 Say when the wiki does not know
The agent answers from the pages it found and cites them. When nothing answers, it says so plainly and does
not guess (WIKI.md "Answering questions").

### 1.9 Same thing, same name
One concept has one name in the CLI's output, in the instructions and in the agent's speech (§6). A new
user-facing term is added to §6 before it ships.

---

## 2. Channels

### 2.1 stdout and stderr
- **stdout** holds the result: the human message, or with `--json` one envelope line, errors included.
  `read` without `--out` prints only the markdown.
- **stderr** holds `warning: <text>` lines, `error: <message>`, the `needs_approval` message (printed with
  no `error:` prefix, `src/core/output.ts:135`) and interactive prompts.

### 2.2 Prompts
A command prompts only when stdin is a terminal and `--json` is off: the agent list and the enforce question
at `init`, the confirmation word at `remove --purge`. Otherwise it exits 5 `needs_input`, or takes the
default with `--yes`. A prompt is a capitalised sentence, unlike other CLI lines (§3.2): `This deletes the wiki
and its content. Type "wikeeper" to confirm: `.

### 2.3 Plain text
No colour codes and no spinners. The only emoji are ✅ at the head of the ingest report and the level marks
🟢 🟡 🔴 (§3.9, SPRINT-04).

### 2.4 `--json`
Every command supports `--json`. The agent is its main consumer (architecture.md §10).

---

## 3. CLI human output

### 3.1 Result lines
A success line starts with a lowercase past-tense verb and its object:
- `registered <id> from <origin> (…)`
- `stored 3 facts for <id> in <file>`
- `aborted <id>: 1 page restored, 0 removed`
- `rebuilt .wiki/index.md (12 pages) and .wiki/log.md (8 events)`
- `recorded accepted proposal …`

The one exception is the ingest report's head, `✅ Ingested <id>` (architecture.md §7.5).

### 3.2 Refusals
A refusal reads `<what is wrong>: <next step>`. It starts lowercase unless it starts with a path or a key,
and it has no final period. A second clause follows `; `. Examples:
- `wiki is not initialised: run wikeeper init`
- `ingest src-… is not applied: run wikeeper ingest apply src-… first`
- `--out notes.md already exists: read never overwrites, pick a new name`

A usage refusal may give the correct form as its next step: `give a query or a filter`.

### 3.3 Hints
- A hint names the command bare: `run wikeeper index rebuild`, `rerun with --approved`. No quotes and no
  backticks.
- Placeholders are written `<id>`, `<file>`, `<n>`. The word is spelled "rerun".
- A success with a next CLI step ends with a `next: <step>` line (`init`, `ingest start`, `ingest plan`).
- A doctor finding puts its hint on a `  fix: <hint>` line.

### 3.4 Report lines
- `label: value`, or `label: none` when empty: `open ingest: none`, `misses: 3 recorded`.
- Detail lines are indented two spaces; list items start with `- `.
- Fields on one line are separated by ` · `.
- `→` means "goes to": a fact → its page, `0.4.0 → 0.4.1`.
- ` — ` separates a value from its problem, as in `tokens.page.yellow: 20000 — must be below
  tokens.page.red (10000)` (`formatConfigIssue`, `src/core/config.ts:212`). Doctor's state lines use it
  too. It is used nowhere else.

### 3.5 Counts and plurals
Counts are digits. A count before a noun takes the plural helper (`plural`, `src/commands/doctor.ts:36`):
`1 page`, `2 pages`, `1 hour`. A label before the count needs none: `created 1 · updated 3`. Never
`page(s)` (CR-003 F3: "pluralises correctly").

### 3.6 Quoting
A value the user or the agent gave is quoted with double quotes: `unknown profile "x"`, `invalid --kind
"X"`. Fact lines in refusals are quoted the same way. Ids, paths and commands are bare.

### 3.7 Bytes
Bytes go through `formatSize` (`src/ingest/report.ts:32`): `27 B`, `4.9 KB`, `1.2 MB`, one decimal.
(SPRINT-04: every byte size, STORY-007-03.)

### 3.8 Token estimates (SPRINT-04)
- Every estimate carries `≈` (`formatTokens`): `≈870`, `≈6.3k`, `≈66k`, `≈1.2M`.
- An estimate from a page count or a byte size is prefixed `rough`: `rough ≈4.8k tokens 🟡`.
- A change has its sign and no `≈`: `+1.2k`, `-300`, `±0`.
- A limit is exact and has no `≈`: `4k/10k`, `tokens.page.red is 10k`.
- A document's size reads `≈1.8k tokens 🟡` (`describeTokens`, STORY-007-03), next to its bytes:
  `(≈1.8k tokens 🟡 · 4.9 KB)`.

### 3.9 Level marks (SPRINT-04)
- 🟢 is below the yellow limit, 🟡 at or above it, 🔴 at or above the red limit.
- The mark follows the figure it qualifies: `≈6.3k 🟡`, `≈1.8k tokens 🟡`.
- A list of pages may lead each row with it: `🔴 ≈12k projects/atlas.md`.
- A mark never stands without its figure. The wiki total has no level.
- JSON gives the level as a word, `"green" | "yellow" | "red"`.

### 3.10 Findings
- Lint and doctor findings read `[error] | [warn] | [info] | [ok] <id> <path>[:<line>]: <message>`.
- A closing line counts them: `2 errors, 1 warning`.
- Inside the `finish` warnings each finding is prefixed `lint `.

### 3.11 Dates, times and ages
- Dates are `YYYY-MM-DD`; times are ISO 8601 in UTC.
- Ages are whole minutes below an hour, then whole hours: `acquired 12 minutes ago`.

### 3.12 Paths
- Paths are repository-relative and POSIX: `.wiki/pages/projects/atlas.md`.
- Page paths in reports, plans and search hits are relative to `pages/`: `projects/atlas.md`.
- Archive paths are relative to `archive/` and say so (SPRINT-04): `archive/projects/atlas.md`.

---

## 4. JSON conventions

### 4.1 Envelope
`src/core/output.ts`: a success is `{ ok: true, command, data, warnings }`, and an error is
`{ ok: false, command, error: { code, message, details } }`. `command` is the command path (`"ingest
start"`). It is one line on stdout.

### 4.2 Keys
Keys are snake_case: `source_id`, `reingest_of`, `open_ingest`, `page_tokens`.

### 4.3 Present, null or empty
Every key of a data shape is always present. `null` means "does not apply" or "not known", and `[]` is an
empty list (for a duplicate, `ingest start` gives `id: null, source: null, next: null`). `data` itself is
`null` when a command has no data. Exceptions are listed in Appendix A.

### 4.4 Warnings
`warnings` is a list of sentences, exactly what the human output prints after `warning: `. A machine code
goes in `data`, next to its message, as `read` does with `data.warnings[] = { code, message }`. The agent may
recognise a warning by its fixed text (the version notice, SPRINT-04), and never shows the user a code.

### 4.5 Errors
- `error.code` is a stable snake_case name for the condition: `not_initialised`, `snapshot_missing`,
  `validation_failed`. One condition has one code in every command.
- `error.message` is the human line without its `error: ` prefix.
- `error.details` is an object with snake_case keys, or `null`. It holds what the agent needs to act: the
  source and the reason for `needs_approval`, the lock holder for `locked`, the choices for `needs_input`.
- An error result carries no warnings.

### 4.6 Values
- Codes and states are snake_case: `needs_approval`, `timed_out`, `in_plan`.
- Ids of checks, source kinds and rule sections are kebab-case: `broken-link`, `meeting-notes`,
  `never-capture`.
- Single-word values are lowercase: `registered`, `duplicate`, `yellow`.

### 4.7 Next steps in data
`next` is a command string, or `null` when there is no next step (`ingest start`).

### 4.8 Reports that find problems
`doctor` and `lint` print `ok: true` and exit 1 when any finding is an error. Warnings leave exit 0.

### 4.9 Sizes (SPRINT-04)
Sizes are numbers, never pre-formatted text. Bytes are `size`. Tokens are `tokens` (an integer), with
`tokens_rough` (a boolean) and `level` beside them where a level applies.

---

## 5. Exit codes

| Code | Name | Means | What the agent does |
|---|---|---|---|
| 0 | ok | Done. Also a report with warnings only. | Pass on the result (§7.5). |
| 1 | error | Failed, or a report found an error (§4.8). | Follow the message's next step; if it can't, tell the user in plain words. |
| 2 | usage | Wrong command, argument or value. `read` also uses it for `not_found` and `unsupported`. | Fix the command. Ask the user only for what it lacks, such as a path or a file in another format. |
| 3 | needs_approval | The user must approve this source (`ingest start`). | Show the user what was returned (§7.2), ask, and rerun with `--approved` after a yes. |
| 4 | denied | The whitelist refuses the source. Nothing was stored. | Tell the user why. `--approved` does not override it. |
| 5 | needs_input | A question only a person can answer: which agents to wire, or confirming a purge. | Ask the user in plain words and rerun with the answer. |

`hook guard` follows each agent's hook protocol (`src/agents/hook-protocols.ts`), not this table.

SPRINT-04 adds:
- exit 2: `invalid_config_key`, `invalid_config_value`, `config_key_not_settable`;
- exit 1: `statusline_exists`, `settings_invalid`, `settings_tracked`, `registry_unreachable`,
  `npm_missing`, `npm_failed`, `upgrade_unsupported`, `update_failed`;
- exit 3: `needs_approval` with `details.cause` `size` or `both`.

---

## 6. Word list

### 6.1 Terms

One concept, one name. "Say" is what the agent says to the user. "CLI / files" is where the term appears in
output or on disk. "Never say" lists words the agent does not use for it with the user.

| Concept | Say | CLI / files | Never say |
|---|---|---|---|
| The knowledge base in this repo | the wiki | `.wiki/`, `content_dir` | the `.wiki` folder, knowledge graph |
| One file about one thing | page | `pages/<path>.md` | doc, entry file, node |
| What the user gives the wiki | document, link, "what you pasted" or "what you said" | source, origin, `raw/` | raw file, original, stdin, chat excerpt |
| A source's id in an answer | the citation `[[src-…]]` | `source_id` | ingest id |
| One dated statement on a page | fact | fact line | claim, row, record |
| Fact marks | decided; still being considered (written `tentative` on the page) | `decided`, `tentative` | status, mark |
| Putting a document into the wiki | add, keep, capture (for something said in chat) | ingest | ingest, register, triage, extract, apply, finish, write phase |
| The user's yes | approve, "your OK" | `needs_approval`, `--approved` | exit 3, needs_approval |
| What the wiki keeps from a kind of document | the wiki's rules, "what the wiki keeps from meeting notes" | `kb_instructions.md`, rule, kind | rule version, `vN`, fingerprint |
| A kind of document | its kind in words: "meeting notes", "status report" | kind id `meeting-notes` | the kind id |
| Information no rule captures | things the rules don't cover yet | `uncovered`, `pending_rule_suggestions` | uncovered, suggestions |
| Updating pages after a rule changed | read it again under the new rules | re-ingest, `reingest_candidates` | reingest, candidate |
| A document started but not finished | "a document I started adding and didn't finish" | `unfinished_sources` | unfinished source |
| Another addition in progress | "another document is being added" | lock, `open_ingest` | lock, write lock, stale lock |
| Putting the pages back | "put the pages back as they were" | abort, snapshot | abort, snapshot, rollback |
| Questions with no answer in the wiki | "questions the wiki couldn't answer" | misses | miss |
| A problem in the pages | the problem in words ("a link to a page that doesn't exist") | lint finding, check id | lint, the check id |
| Setup | setting up the wiki | `SETUP.md`, `setup_completed_at` | SETUP.md |
| Getting to know the user | onboarding, "a few questions about you" | `ONBOARDING.md`, `me.md` | ONBOARDING.md |
| The user's profile | your profile (`me.md`) | `.wiki/me.md`, personal, never committed | |
| The project brief | the project brief (`project.md`) | `.wiki/project.md`, committed | |
| The wiki's settings | the wiki's settings | `.wiki/config.yml` | config key paths, unless the user asks for them |
| A size (SPRINT-04) | "about 6k tokens" | `≈6.3k`, `tokens` | estimateTokens |
| A size level (SPRINT-04) | green, yellow, red (🟢 🟡 🔴) | `level` | |
| A token limit (SPRINT-04) | the page limit, the document limit | `tokens.page.*`, `tokens.source.*` | the key names, unless the user asks |
| The size at which wikeeper asks (SPRINT-04) | "the size at which I ask you before reading" | `tokens.source.confirm_at` | confirm_at |
| The one-line wiki size (SPRINT-04) | the wiki size line | `wikeeper statusline` | statusline, statusLine |
| Moving old facts out of pages (SPRINT-04) | a clean-up | a chat-excerpt ingest that writes `archive/` | archive pass, conservation rule |
| Where a clean-up keeps facts (SPRINT-04) | the archive | `archive/` | |
| Pages a clean-up could shrink (SPRINT-04) | "pages a clean-up could shrink" | `archive_candidates` | candidates |
| A newer wikeeper on npm (SPRINT-04) | "a newer version of wikeeper (0.4.1) is out" | `update-available`, `version.latest` | upgrade, npm, registry |
| This project's wikeeper files are older or newer (SPRINT-04) | "this project's wiki files are from 0.3.0" | `version-mismatch`, `version.files`, manifest | manifest, package_version |
| Taking wikeeper out of the repo | remove the wiki tools (the knowledge stays); delete the wiki too | `remove`, `remove --purge` | purge |
| The harness's own permission prompt | your agent's permission prompt | allow rule, `enforce` | harness, allow rule, prefix_rule |
| Helper agents | a helper | `wiki-extractor`, `wiki-writer` | the sub-agent names |

### 6.2 Words that keep one meaning
- **archive** means `archive/` only (SPRINT-04). It is never used for how `raw/` keeps originals; say
  "keeps" or "stores" (A.15).
- **clean-up** means only the user-requested move into the archive.
- **update** means refreshing this project's wikeeper files. A page that changed is "updated" only in the
  ingest report's counts. **upgrade** means installing a newer wikeeper. The two are never swapped.
- **approve** and **approval** mean the user's yes in chat, never the harness prompt.
- **limit** means a token limit (SPRINT-04). Search's `--limit` caps results; the agent calls that "the
  first 10 results".
- **level** means green, yellow or red only.
- **rule** means a line of `kb_instructions.md`. The harness's entries are "your agent's permission
  settings".
- **page** means a wiki page. A PDF's pages are "pages of the PDF"; a URL is a "web page".
- **source** means something the user gave the wiki, never source code.

### 6.3 Words the agent never says to the user
- A command (`wikeeper …`, `npx …`) or a flag (`--approved`, `--reingest`), except under §1.2.
- An exit code, an error code (`needs_approval`, `denied`, `locked`), a warning code (`likely_scanned`) or a
  check id (`broken-link`).
- A JSON key or path (`data.tokens`, `error.details.cause`).
- lock, write lock, stale lock, force-unlock, snapshot, abort, apply, finish, register, triage, extract,
  facts file, facts JSON, brief, stdin, chat excerpt, manifest, hook, sha, `raw/`.
- `WIKI.md`, `SETUP.md`, `ONBOARDING.md`, skill and sub-agent names, `.wiki/system/`.
- The agent may name the user-owned files (`me.md`, `project.md`, `config.yml`, `kb_instructions.md`) when
  it shows or changes one.

---

## 7. The agent's voice

From WIKI.md, SETUP.md, ONBOARDING.md, the pointer block and the skills.

### 7.1 Address
The agent uses the name, language and answer style the user gave in `me.md`, and writes there only what the
user said about themselves (ONBOARDING.md steps 1 and 3).

### 7.2 Before it acts
- It asks in chat and shows what the CLI returned: origin, size, kind and rule; from SPRINT-04 also the
  estimate, its level and the limit, and that the estimate is rough when it is.
- It asks once per source (WIKI.md "Register").
- For a folder it shows the plan and gets one approval for all of it.
- It shows drafts before writing them: `me.md`, `project.md`, the wiki's rules, and a rule change as a
  small diff (SETUP.md steps 1 to 3; WIKI.md "Proposing rule changes").

### 7.3 When something stops
The agent says what happened and the choice, in plain words.
- Denied: the reason, and that nothing was stored.
- A link that needs a login: it asks the user to paste the page.
- An unsupported file: it asks for a PDF, DOCX or CSV export.
- A source that only points to another file: the user decides (WIKI.md "Triage and extract").
- A declined page write: it puts the pages back and asks, and never leaves an addition half done.
- If wikeeper can't run: it writes nothing and tells the user (pointer block).

### 7.4 Offers
When a decision, a date, an owner or a commitment comes up in conversation, the agent never captures it
silently. It offers at the end of its reply, all such items in one offer, says which are decided and which
are still being considered, and asks when unsure (WIKI.md "Ambient offers").

### 7.5 After it acts
After adding a document, it passes on the report's figures: pages created and updated, contradictions, rule
suggestions, and from SPRINT-04 the sizes. It never adds page text (§1.6). It offers the follow-ups the CLI
lists: unfinished documents, re-reads under new rules, rule changes. It never acts on them unasked.

### 7.6 Answers
- It searches before answering a project question or drafting material, even when the user does not
  mention the wiki (pointer block).
- It answers from the pages and cites `[[src-…]]`.
- It labels anything quoted from the project brief as uncited.
- When the wiki does not know, it says so, and offers to add a document that would answer it (wiki-search
  skill).

### 7.7 Closing setup
Onboarding ends with one or two sentences on what the wiki covers and how to ask it a question
(ONBOARDING.md step 6).

---

## 8. Never do this

- ❌ Name a command, flag, code or package file to the user, or tell them to run something the agent can
  run (§1.2, §6.3).
- ❌ A refusal, warning or agent turn with no next step (§1.3).
- ❌ Tell the same notice twice in a session, or offer a rejected proposal again (§1.4).
- ❌ Change, start, drop, re-read, restore, upgrade or install anything the user didn't ask for (§1.5).
- ❌ Ask twice for one approval, or treat the harness prompt as the user's yes (§1.5).
- ❌ Page or source text in a report (§1.6).
- ❌ A size, count or outcome the CLI didn't print (§1.7).
- ❌ A guess where the wiki has no answer (§1.8).
- ❌ Two names for one thing, or one name for two things (§6.2).
- ❌ A token figure without `≈`, or a level mark without its figure (§3.8, §3.9).
- ❌ `page(s)`, or a count before a noun without its plural (§3.5).
- ❌ A camelCase JSON key, a pre-formatted size in JSON, or one condition under two error codes (§4).
- ❌ Personal documents, names or secrets in examples, fixtures or transcripts. Examples use neutral content
  such as a project "atlas" and a meeting note.

---

## Appendix A — Inconsistencies in shipped code (0.3.0, `8988a2c`)

Each rule above follows the majority. These are the exceptions. They are not fixed by this guide; each is a
candidate CR. "→ 007-03" means a SPRINT-04 story changes it.

| # | Rule | Where | What it does instead |
|---|---|---|---|
| A.1 | §3.2 | `src/commands/update.ts:82`, `remove.ts:157`, `search.ts:143` | `not initialised — run wikeeper init` (em dash, no subject), where `src/core/paths.ts:80` and `setup.ts:35` say `wiki is not initialised: run wikeeper init`. |
| A.2 | §3.7 | `src/commands/ingest-start.ts:313`, `read.ts:99` | Print raw `(<n> bytes)`, while `needs_approval` uses `formatSize`. → 007-03 |
| A.3 | §3.5 | `src/commands/index.ts:52`, `remove.ts:260–261` | `(<n> pages)`, `(<n> events)`, `(<n> files)` with no plural helper, so they print `1 pages`. |
| A.4 | §3.5 | `src/read/docx.ts:84`, `src/lint/unlogged.ts:135` | `image(s)`, `page(s)`. |
| A.5 | §3.5 | `src/commands/ingest-plan.ts:31` | `(1 need approval)`. |
| A.6 | §4.5 | `src/commands/ingest-finish.ts:74` | "already finished" is `not_applied` here; `ingest_finished` in `apply`, `facts` and `abort`. |
| A.7 | §4.5 | `src/commands/index.ts:33` | A held lock is `ingest_in_progress`; `locked` elsewhere. |
| A.8 | §4.5 | `src/commands/ingest-start.ts:161` | A missing file is `usage` (`source not found`); `read` says `not_found` (`src/read/index.ts:152`). |
| A.9 | §4.5 | `src/core/config.ts:185`, `:225`; `templates.ts:39`, `:73`; `manifest.ts:45`; `src/agents/inject.ts:30`, `:105`; `src/core/integrations.ts:69` | Upper-case `E_…` codes (`E_CONFIG_SYNTAX`) reach `error.code`, some with capitalised messages (`Template not found`). |
| A.10 | §4.2 | `src/ingest/user-hooks.ts:19`, `:22` | `hooks[]` in `ingest start` and `ingest finish` data carry `exitCode` and `durationMs`. |
| A.11 | §4.3 | `src/commands/read.ts:92`, `src/search/engine.ts:71–72` | `out` is absent without `--out`; `facts_total` and `pages_total` are absent unless set. |
| A.12 | §3.2 | `src/ingest/permissions.ts:102–147`, `src/agents/hook-protocols.ts:7` | Permission reasons and the guard's reason are capitalised sentences with a final period, and the guard quotes its command in backticks. |
| A.13 | §3.3 | `src/commands/ingest-start.ts:123`, `src/read/html.ts:61` | Backticks around a command in a hint. |
| A.14 | §3.3 | `ingest-start.ts:164`, `:237`; `search.ts:98`; `status.ts:195`, `:202` | "use …", "decide with …", "(… lists them)" in place of "run …"; `re-run` in `remove.ts:42`, `src/agents/detect.ts:123`, `init.ts:122`, `src/core/gitignore.ts:60` against `rerun` elsewhere. |
| A.15 | §6.2 | `README.md:69` | "archives the immutable original in `.wiki/raw/`" uses "archive" for `raw/`, which EPIC-008's `archive/` will make ambiguous. |
| A.16 | §3.4 | `status.ts:198`, `doctor.ts:283`, `setup.ts:49` | One fact, three shapes: `setup: completed <t>`, `setup: completed at <t>`, `setup completed at <t> (profile …)`. |
| A.17 | §2.1 | `src/commands/update.ts:248` | The human summary goes to stderr, not stdout (kept for a red test). |
| A.18 | §1.3 | `ingest-apply.ts:47`, `ingest-facts.ts:94`, `src/ingest/registry.ts:170`, `remove.ts:29` | Refusals with no next step: `the ingest of <id> is already finished`, `no source <id> is registered`, `could not register the source`, `confirmation did not match …`. |
| A.19 | §3.3 | `ingest-start.ts:143` | A URL without text says "read the page yourself", where WIKI.md "Register" sends every URL through `read` first. |
| A.20 | §3.2 | `ingest-start.ts:185`, `ingest-plan.ts:69` | One refusal, two texts: `invalid --kind "X": use lowercase letters, digits and hyphens` and `invalid kind "X": a kind id is lowercase letters, digits and -`. |
| A.21 | §1.2 | `templates/system/SETUP.md:78`, `ONBOARDING.md:45` | The agent tells the user "they should run `wikeeper doctor`". |
| A.22 | §1.2 | `templates/system/SETUP.md:41–55` | Step 4 has the agent show the user a table of harness rules made of commands. |
| A.23 | §1.6, §6.3 | `templates/system/WIKI.md:78`; `src/ingest/report.ts:38` | "Show the user its report": the report's lines carry `sha`, `rule … vN` and `permission <mode>`. |
