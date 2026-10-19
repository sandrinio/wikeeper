# wikeeper

[![npm version](https://img.shields.io/npm/v/wikeeper?color=10b981&label=npm)](https://www.npmjs.com/package/wikeeper)
[![CI](https://github.com/sandrinio/wikeeper/actions/workflows/ci.yml/badge.svg)](https://github.com/sandrinio/wikeeper/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D22.12-38bdf8.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A project wiki your coding agent keeps up to date, with every fact tied to its source.**

Give Claude Code, OpenAI Codex or Google Antigravity your project's material: meeting notes, PDFs, Word documents, web pages. The agent reads it and writes what matters onto plain Markdown pages in your repository: decisions, dates, owners and risks, each linked to the source it came from. wikeeper is the tool the agent works through. It checks every change, so facts don't get lost, overwritten or left without a source.

It's for people who run projects, such as leads, product managers and managers, and already use a coding agent as an assistant. It's the Karpathy-style LLM wiki, with the checks that a folder of notes lacks.

## Start

In your project folder:

```bash
npx wikeeper init
```

Then open your agent and talk to it as usual:

```text
You:   Let's finish setting up the wiki.
Agent: asks who you are and what the project is, then sets up what to capture.

You:   Here's our Q4 roadmap PDF and yesterday's standup notes.
Agent: asks before it adds each one, then updates the project and risk pages.

You:   What slipped since October 1st, and who owns the vendor risk?
Agent: answers from the wiki and links each fact to its source.
```

## What you can count on

- **Every fact names its source.** A page change that adds a fact without a link to its source is refused.
- **Nothing is lost.** A change that drops an existing fact is refused. Old facts move to an archive only when you ask for a clean-up, and they stay searchable there.
- **Contradictions are kept, not overwritten.** When a new source disagrees with an old one, both stay, and the conflict is marked.
- **You decide what goes in.** By default the agent asks before it adds each source. You can trust certain folders or sites instead, or let it add freely.
- **Sizes stay visible.** Sources and pages show their size in tokens, and a large document needs your yes before the agent reads it.
- **The wiki stays healthy.** Broken links, facts without sources, stale facts and pages that grow too large are caught and reported.
- **Plain files, no API keys.** Pages are Markdown with `[[links]]`: they open in Obsidian and diff in git, with no database. wikeeper calls no AI service; the agent you already run does the reading.

## Works with

Claude Code, OpenAI Codex and Google Antigravity, and a mixed team can share one wiki through git. `wikeeper init` adds a short block to your `CLAUDE.md`, `AGENTS.md` or `GEMINI.md` and installs the agent's skills. With `wikeeper init --enforce`, Claude Code and Codex are also blocked from editing wiki pages directly, outside wikeeper's checks.

## Updates and privacy

When a newer wikeeper is out, your agent tells you once and upgrades only after your yes. To find out, wikeeper asks the npm registry at most once a day; the request sends nothing about your wiki. To turn it off, run `wikeeper config set update_check false` or set `WIKEEPER_NO_UPDATE_CHECK=1`.

## More

- [Reference](https://github.com/sandrinio/wikeeper/blob/main/docs/reference.md): every command, permission modes, size limits, the fact archive, upgrading and development.
- [Architecture](https://github.com/sandrinio/wikeeper/blob/main/architecture.md): the full design and its decision log (`D-01`–`D-38`).

Requires Node.js 22.12 or later. Planned and built in the open with [ClearGate](https://www.npmjs.com/package/cleargate).

## License

[MIT](LICENSE) © Sandro Suladze
