# Setup

Run this once per repository, with the user, in conversation. Do the steps in order and do not skip ahead. No page is created during setup: the pages, entity types and questions come from the conversation, not from this file.

## 1. Onboard the user

Follow `.wiki/system/ONBOARDING.md`. It writes `.wiki/me.md` and returns here at step 2.

If `.wiki/me.md` already exists, show it to the user and ask whether it is still right instead of onboarding again.

Done when `.wiki/me.md` exists and the user has confirmed it.

## 2. The project

Write `.wiki/project.md` from the template `.wiki/system/templates/project.md`.

1. Ask what the project is, or draft the file from a document the user names (a README, a product summary).
2. Fill the four sections and keep only stable facts: what it is, its scope, where things live and the core terms. Status, dates, decisions, people and the roadmap go into pages through ingests, never into this file.
3. Show the draft and wait for the user's approval before writing it.

If `.wiki/project.md` already exists, show it and ask what has changed. The file is committed and shared with everyone in the repository.

Done when `.wiki/project.md` is written and approved.

## 3. What the wiki answers

Adapt the seeded `.wiki/kb_instructions.md` to this project.

1. Draft the questions the wiki must answer yourself, from `.wiki/project.md`, the "uses the wiki for" line of `.wiki/me.md` and the suggestions in `.wiki/system/profiles/management.md`. Offer only the suggestions that fit this project.
2. Draft the entities that answer those questions, each with the page it lives on.
3. Draft the source kinds in the form `<kind-id> (v1) → <targets>`.
4. Draft the Never-capture list.
5. Show the result and let the user approve or change it, then write it to `.wiki/kb_instructions.md`.

No page is created in this step.

## 4. Permission mode

Ingests change the wiki, so the user decides who approves them. Explain the three modes of `ingest.permission`:

- `ai`: the agent runs ingests without asking.
- `ask`: the agent asks the user before each ingest starts.
- `whitelist`: ingests of the agreed source kinds and origins run without asking, everything else asks.

An unset `ingest.permission` means `ask`, and `enforce` is off unless the user chose it at `init`.

With `enforce` on, the agents' own settings carry the mode. With `enforce` off, only the CLI enforces it. Show this table of what each mode installs when `enforce` is on:

| Mode | Claude Code (.claude/settings.json) | Codex (.codex/rules/wikeeper.rules) | Antigravity |
|---|---|---|---|
| `ai` | `permissions.allow`: `Bash(npx wikeeper ingest *)`, `Bash(wikeeper ingest *)` | `prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")`, `prefix_rule(pattern=["wikeeper","ingest"], decision="allow")` | no project rule file; approval happens in chat |
| `ask` | `permissions.ask`: `Bash(npx wikeeper ingest start *)`, `Bash(wikeeper ingest start *)` | `prefix_rule(pattern=["npx","wikeeper","ingest","start"], decision="prompt")`, `prefix_rule(pattern=["wikeeper","ingest","start"], decision="prompt")` | no project rule file; approval happens in chat |
| `whitelist` | — | — | no project rule file; approval happens in chat |

For `whitelist`, agree `ingest.whitelist.kinds` and `ingest.whitelist.origins` with the user.

Apply the choice by writing the keys to `.wiki/config.yml`, then run `wikeeper update` so the agents' settings match. Do not turn `enforce` on here; only explain its effect.

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
