# Setup

Run this once per repository, with the user, in conversation. Do the steps in order and do not skip ahead. No page is created during setup: the pages, entity types and questions come from the conversation, not from this file.

## 1. Onboard the user

Follow `.wiki/system/ONBOARDING.md`. It writes `.wiki/me.md` and returns here at step 2.

If `.wiki/me.md` already exists, show it to the user and ask whether it is still right instead of onboarding again.

Done when `.wiki/me.md` exists and the user has confirmed it.

## 2. The project

Write `.wiki/project.md` from the template `.wiki/system/templates/project.md`.

1. Ask what the project is, or draft the file from a document the user names (a README, a product summary). Read a URL, a DOCX or a local `.html` or `.htm` file with `wikeeper read <file|url> --out <file>` first, and a PDF too; when `read` warns `likely_scanned`, read the PDF yourself (`.wiki/system/WIKI.md`, section "Register").
2. Fill the four sections and keep only stable facts: what it is, its scope, where things live and the core terms. Status, dates, decisions, people and the roadmap go into pages through ingests, never into this file.
3. Show the draft and wait for the user's approval before writing it.

If `.wiki/project.md` already exists, show it and ask what has changed. The file is committed and shared with everyone in the repository.

Done when `.wiki/project.md` is written and approved.

## 3. What the wiki answers

Adapt the seeded `.wiki/kb_instructions.md` to this project.

1. Draft the questions the wiki must answer yourself, from `.wiki/project.md`, the "uses the wiki for" line of `.wiki/me.md` and the suggestions in `.wiki/system/profiles/management.md`. Offer only the suggestions that fit this project. Write each under `## Questions this wiki must answer` as one line in the form `Q<n> <question>`; a `.` or `:` after the number is allowed. A question that dated facts answer ends with ` (dated facts)`. Examples: `Q1 What is the status of initiative X?`, `Q2 What was decided about X, and why?`, `Q3 What changed since <date>? (dated facts)`.
2. Draft the entities that answer those questions, each with the page it lives on. Write each under `## Entities` as one line in the form `<entity> <fields> → <page> <question refs>`: the fields are comma-separated, and `->` works as the arrow. A page name with `<…>` holds one entity per page; a fixed page name holds one `##` entry per entity. Examples: `initiative owner, status, target date → initiatives/<id>.md Q1`, `decision what, why, decided by, date → decisions.md Q2`.
3. Draft the source kinds under `## Source kinds`, one line each in the form `<kind-id> (v1) → <targets>`. A bare target (`decision`) means every field listed for that entity under `## Entities`; `entity.field` (`project.status`) means that field only. Example: `meeting-notes (v1) → decision, initiative.status`.
4. Write routing notes and exclusions under `## Source kinds` on `note:` lines. The CLI never reads a `note:` line as a rule. Example: `note: an epic is not an initiative; bugs are not captured.`
5. Draft the Never-capture list.
6. Show the result and let the user approve or change it, then write it to `.wiki/kb_instructions.md`.
7. After the user approves and the file is written, run `wikeeper lint --rules`, go through its findings with the user, and fix the file with their approval before step 4.

No page is created in this step.

## 4. Permission mode

Ingests change the wiki, so the user decides who approves them. Explain the three modes of `ingest.permission`:

- `ai`: the agent runs ingests without asking. With `enforce` on, the harness still asks the user before the two steps that delete or take over work: `wikeeper ingest abort <id> --drop` and `wikeeper ingest apply <id> --force-unlock` in Claude Code, and every `wikeeper ingest abort` in Codex, whose rules match only the start of a command.
- `ask`: the agent asks the user before each ingest starts.
- `whitelist`: ingests of the agreed source kinds and origins run without asking, everything else is denied (exit code 4).

An unset `ingest.permission` means `ask`, and `enforce` is off unless the user chose it at `init`.

With `enforce` on, the agents' own settings carry the mode. With `enforce` off, only the CLI enforces it. Show this table of what each mode installs when `enforce` is on:

| Mode | Claude Code (.claude/settings.json) | Codex (.codex/rules/wikeeper.rules) | Antigravity |
|---|---|---|---|
| `ai` | `permissions.allow`: `Bash(npx wikeeper ingest *)`, `Bash(wikeeper ingest *)`, `Bash(npx wikeeper read *)`, `Bash(wikeeper read *)`, `Bash(npx wikeeper search *)`, `Bash(wikeeper search *)`, `Bash(npx wikeeper lint *)`, `Bash(wikeeper lint *)`, `Bash(npx wikeeper status *)`, `Bash(wikeeper status *)`, `Bash(npx wikeeper rules list *)`, `Bash(wikeeper rules list *)`; `permissions.ask`: `Bash(npx wikeeper ingest *--drop*)`, `Bash(wikeeper ingest *--drop*)`, `Bash(npx wikeeper ingest *--force-unlock*)`, `Bash(wikeeper ingest *--force-unlock*)` | `prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")`, `prefix_rule(pattern=["wikeeper","ingest"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","ingest","abort"], decision="prompt")`, `prefix_rule(pattern=["wikeeper","ingest","abort"], decision="prompt")`, `prefix_rule(pattern=["npx","wikeeper","read"], decision="allow")`, `prefix_rule(pattern=["wikeeper","read"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")`, `prefix_rule(pattern=["wikeeper","search"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","lint"], decision="allow")`, `prefix_rule(pattern=["wikeeper","lint"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","status"], decision="allow")`, `prefix_rule(pattern=["wikeeper","status"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","rules","list"], decision="allow")`, `prefix_rule(pattern=["wikeeper","rules","list"], decision="allow")` | no project rule file; approval happens in chat |
| `ask` | `permissions.ask`: `Bash(npx wikeeper ingest start *)`, `Bash(wikeeper ingest start *)`; `permissions.allow`: `Bash(npx wikeeper search *)`, `Bash(wikeeper search *)`, `Bash(npx wikeeper lint *)`, `Bash(wikeeper lint *)`, `Bash(npx wikeeper status *)`, `Bash(wikeeper status *)`, `Bash(npx wikeeper rules list *)`, `Bash(wikeeper rules list *)` | `prefix_rule(pattern=["npx","wikeeper","ingest","start"], decision="prompt")`, `prefix_rule(pattern=["wikeeper","ingest","start"], decision="prompt")`, `prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")`, `prefix_rule(pattern=["wikeeper","search"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","lint"], decision="allow")`, `prefix_rule(pattern=["wikeeper","lint"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","status"], decision="allow")`, `prefix_rule(pattern=["wikeeper","status"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","rules","list"], decision="allow")`, `prefix_rule(pattern=["wikeeper","rules","list"], decision="allow")` | no project rule file; approval happens in chat |
| `whitelist` | `permissions.allow`: `Bash(npx wikeeper search *)`, `Bash(wikeeper search *)`, `Bash(npx wikeeper lint *)`, `Bash(wikeeper lint *)`, `Bash(npx wikeeper status *)`, `Bash(wikeeper status *)`, `Bash(npx wikeeper rules list *)`, `Bash(wikeeper rules list *)` | `prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")`, `prefix_rule(pattern=["wikeeper","search"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","lint"], decision="allow")`, `prefix_rule(pattern=["wikeeper","lint"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","status"], decision="allow")`, `prefix_rule(pattern=["wikeeper","status"], decision="allow")`, `prefix_rule(pattern=["npx","wikeeper","rules","list"], decision="allow")`, `prefix_rule(pattern=["wikeeper","rules","list"], decision="allow")` | no project rule file; approval happens in chat |

For `whitelist`, agree `ingest.whitelist.kinds` and `ingest.whitelist.origins` with the user.

In `whitelist` mode a source runs without asking when its origin matches an entry of `ingest.whitelist.origins` or its kind is listed in `ingest.whitelist.kinds`; any other source is denied (exit code 4), even with `--approved`. A kind entry is a source-kind id and matches every version of that kind (`meeting-notes`); a source started without `--kind` passes while kind entries exist, and `wikeeper ingest facts` then checks its kind. An origin entry that contains `/`, or starts with `.` or `~`, is a path glob and matches only files. It is matched against the whole path: a file inside the repository by its path from the repository root (`docs/meetings/**`, never `./docs/meetings/**`), any other file by its absolute path (`~/Documents/notes/*.md`, where `~/` is the home folder). `*` matches within one folder, `**` across folders and `?` one character. Any other entry is a host name, without scheme, port or path, and matches only URLs, ignoring case: `docs.example.com` matches that host only, and `*.example.com` matches its subdomains but not `example.com` itself. Never start a host with `.`: that makes it a path. Text on stdin (`-`) never matches an origin, so a chat capture (`wikeeper ingest start -`) runs only when its kind is in `ingest.whitelist.kinds`. With no kind entries, a chat capture is denied at `wikeeper ingest start`.

Agree with the user which source kinds chat captures use, such as `chat-excerpt` when step 3 kept that profile suggestion, and list them in `ingest.whitelist.kinds`.

Apply the choice by writing the keys to `.wiki/config.yml`, then run `wikeeper update` so the agents' settings match. Do not turn `enforce` on here; only explain its effect. To turn `enforce` off, set `enforce: false` in `.wiki/config.yml` and run `wikeeper update`, which removes wikeeper's hook and rules from each agent's settings.

## 5. Wiring

Run `wikeeper doctor`. Fix every error it reports before continuing.

## 6. Session start

Run `wikeeper doctor` again and check two things:

- The `setup-files` check reports no error or warning: `.wiki/me.md` is present, ignored and not committed; `.wiki/project.md` is present and not ignored, because it is shared with the team.
- Doctor reports the WIKI block in every agent file.

For each `setup-files` finding, quote it to the user and follow its `fix:` line. Never run `git rm` or edit `.gitignore` without the user's approval.

Tell the user that from the next session on the agent reads both files at the start and addresses them by their chosen name. If it does not, they should run `wikeeper doctor`.

## 7. First source

Offer to ingest a first source the user names, for example the document step 2 was drafted from. Start it with `wikeeper ingest start` and follow `.wiki/system/WIKI.md`, section "Ingest". Nothing from the setup conversation itself is ingested.

## 8. Finish

Run `wikeeper setup --done`. Setup is complete.
