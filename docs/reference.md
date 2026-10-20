# wikeeper reference

The detail behind the [README](../README.md). Your agent runs these commands for you; this page says exactly what each one does and how to change its settings.

- [CLI Command Reference](#-cli-command-reference)
- [How It Works](#-how-it-works-the-agent-thinks-the-cli-enforces)
- [Ingestion Models](#ingestion-models)
- [Permission Modes & Harness Enforcement](#-permission-modes--harness-enforcement)
- [Token Gauges](#-token-gauges)
- [Upgrading](#-upgrading)
- [Multi-Agent Compatibility](#-multi-agent-compatibility)
- [The Management Profile](#-built-for-technical-management-product--engineering)
- [Requirements & Development](#-requirements--development)

---

## 🧰 CLI Command Reference

Every command outputs human-friendly reports in the terminal and supports `--json` for deterministic agent parsing.

| Command | Description |
| :--- | :--- |
| `wikeeper init [--profile management] [--enforce]` | Scaffold `.wiki/`, wire up `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`, and install skills & sub-agents |
| `wikeeper read <file\|url> [--out <file>]` | Convert PDF, DOCX, web URLs, HTML, Markdown, or CSV into clean Markdown, with its estimated size |
| `wikeeper ingest start · plan · facts · apply · finish · abort` | Run the 3-phase transactional ingest pipeline (or `--dry-run` on `facts` to preview rule changes) |
| `wikeeper search [query]` | Full-text BM25 + structured search (`--type`, `--where`, `--status`, `--mark decided\|tentative`, `--entity`, `--since`, `--archive`, `--misses`) |
| `wikeeper lint [--rules] [--check <id>]` | Check pages (`broken-link`, `uncited-claim`, `orphan-page`, `index-drift`, `unlogged-change`, `stale-fact`, `oversized-page`) or validate `kb_instructions.md` |
| `wikeeper status` | Show active locks, unfinished sources, re-ingest candidates (from rule upgrades), pending rule suggestions, search misses, and the `tokens` section (the wiki's size and its largest pages) |
| `wikeeper rules record · list` | Record `--accepted` or `--rejected` rule proposals with SHA-256 fingerprints so rejected ideas are never re-offered |
| `wikeeper config get · set · unset` | Read and change the token limits in `.wiki/config.yml` |
| `wikeeper statusline [--install]` | Print the wiki's size on one line; `--install` adds it to Claude Code's status line |
| `wikeeper doctor` | Verify agent wiring, setup files (`me.md`, `project.md`), hook rules, and `kb_instructions.md` syntax |
| `wikeeper update` | Refresh package-owned system files, skills and hooks to the installed version without touching your knowledge base |
| `wikeeper upgrade [--check]` | Install the newest wikeeper the way you installed it (global npm, a project dependency or npx), then refresh this project's files; `--check` shows what it would run |
| `wikeeper remove [--purge]` | Remove the wiki tooling and keep your knowledge base, archive included; `--purge` also deletes it (asks first) |

---

## 🛡️ How It Works: The Agent Thinks, The CLI Enforces

1. **Read Anything (`wikeeper read`):** Converts **PDFs** (with scanned-deck detection), **DOCX** (preserving GFM tables), **web URLs**, **HTML**, and **CSV/text** into clean Markdown with title, author, and date headers.
2. **Pre-Hook Gate (`wikeeper ingest start`):** Checks SHA-256 duplicates, enforces your permission mode (`ai` / `ask` / `whitelist`), and keeps the immutable original in `.wiki/raw/`.
3. **Structured Triage (`wikeeper ingest facts`):** Your agent extracts dated facts (`decided` or `tentative`) governed by your `.wiki/kb_instructions.md` rules and validates them against a strict JSON schema.
4. **Locked Write Phase (`wikeeper ingest apply` → `finish`):**
   - Takes an exclusive write lock and snapshots `.wiki/pages/` and `.wiki/archive/`.
   - **Never loses history:** `finish` **refuses** any page edit that drops an existing fact line or omits a `[[src-...]]` citation, unless the identical line moves to `.wiki/archive/` in a clean-up you asked for. Contradictions are flagged (`contradicts:: [[src-...]]`), never overwritten.
   - Automatically rebuilds `.wiki/index.md`, writes a merge-safe event to `.wiki/log/`, and runs post-ingest lint checks.

---

## Ingestion Models

During setup, your agent explains the two ingest jobs and asks which models should do them: reading documents to extract facts, and writing those facts into wiki pages. You can keep the current choices, choose supported alternatives, or use each harness's default. The agent explains cost/quality trade-offs and checks availability where possible; it must not promise current prices or availability it cannot verify.

Once you approve, your agent saves `ingest.extractor_model` and `ingest.writer_model` in `.wiki/config.yml` and runs `wikeeper update` to refresh the helper files. These settings are shared with the team and do not change your main chat model. You are not asked again on every ingest; ask your agent whenever you want to change the choices. If a model becomes unavailable, it consults you rather than silently choosing a replacement.

The built-in choices are `small` for extraction and `medium` for writing. Those tiers map to harness-specific models; in Codex they leave model selection to the harness. Claude Code, Codex and Copilot also accept explicit model IDs; Antigravity supports the tiers, not arbitrary IDs. A mixed-harness team should use compatible tiers or inheritance rather than assume one model ID works everywhere.

An empty string (`""`) in either setting omits that helper's model line, allowing the harness/session default. Unsetting a key instead restores its built-in tier. When helpers are disabled or unavailable, the main agent handles ingestion itself, so helper model settings do not select a different model for that work.

---

## 🔐 Permission Modes & Harness Enforcement

You control what enters your knowledge base via `ingest.permission` in `.wiki/config.yml`:

| Mode | Behavior |
| :--- | :--- |
| **`ask`** *(default)* | Every ingest pauses and shows source metadata (`size`, `kind`, matched rule version) for your approval before storing. |
| **`whitelist`** | Sources matching your trusted path globs (`docs/meetings/**`) or domains (`*.example.com`) and kinds run automatically; everything else is denied. |
| **`ai`** | Your agent ingests autonomously—while still prompting before destructive actions (`abort --drop` or `apply --force-unlock`). |

> [!TIP]
> **Mechanical Guardrails (`--enforce`):** Run `wikeeper init --enforce` to install native `PreToolUse` hooks and permission rules into Claude Code, Codex and Copilot (in VS Code, its Copilot agent only: see [Multi-Agent Compatibility](#-multi-agent-compatibility)). If an agent tries to edit `.wiki/pages/` outside a locked write phase, the hook blocks the edit automatically—and `wikeeper lint` backs it up with SHA-256 `unlogged-change` detection.

---

## 📏 Token Gauges

Every size `wikeeper` shows is an estimate in tokens, printed with `≈` and within about ±15% of Claude's count. A source is 🟢, 🟡 or 🔴 against `tokens.source` (20k and 60k by default), a page against `tokens.page` (4k and 10k); the wiki total has no level. When a source reaches `tokens.source.confirm_at` (yellow by default), `wikeeper ingest start` asks for your approval before the source is read, in every permission mode. Change a limit with `wikeeper config set`, for example `wikeeper config set tokens.page.red 12k`; `wikeeper statusline` prints the wiki's size on one line.

**Fact archive.** Ordinary ingests keep every fact on its page. When a page turns 🔴, the agent offers a clean-up or a higher limit; a clean-up you ask for moves replaced and finished facts to `.wiki/archive/`, which `wikeeper search --archive` and history searches still find. Nothing is deleted.

---

## ⬆️ Upgrading

`wikeeper upgrade` installs the newest version the way you installed it (a global npm install, a project dependency or npx), then refreshes this project's files with the new version's `wikeeper update`. `wikeeper upgrade --check` shows what it would run and changes nothing.

- **By hand:** `npm install -g wikeeper@latest`, then `wikeeper update` in each project. If you installed with pnpm, yarn or bun, upgrade with that manager, then run `wikeeper update`.
- **npx:** hooks installed through npx are pinned to one version (`npx -y wikeeper@0.4.0 hook guard …`); `wikeeper upgrade` re-pins them to the new one.
- **No `sudo`:** when npm needs administrator rights, `wikeeper upgrade` changes nothing and prints the command for you to run.
- **The version check:** ingest commands ask the npm registry for the latest version at most once a day: one GET to `registry.npmjs.org/wikeeper/latest` (or your `npm_config_registry`), with a 1.5-second timeout. The answer is saved in `.wiki/.cache/update-check.json`, which is git-ignored. The request sends nothing about your wiki: no file names, pages or settings. When the registry can't be reached, the command runs as usual.
- **Your agent tells you once and asks:** when a newer version is out, it tells you once in the session and upgrades only after your yes; it never upgrades on its own. `wikeeper status` and `wikeeper doctor` also say when this project's files come from another version, and your agent asks before it refreshes them.
- **Turning it off:** `wikeeper config set update_check false`, or `WIKEEPER_NO_UPDATE_CHECK=1`, `NO_UPDATE_NOTIFIER` or `CI` in the environment. A file-version mismatch is still reported, since it needs no network.

---

## 🤝 Multi-Agent Compatibility

`wikeeper` works identically across the four major AI coding harnesses—and lets mixed teams collaborate on the same Git wiki:

| Capability | Claude Code | OpenAI Codex | Google Antigravity | GitHub Copilot |
| :--- | :--- | :--- | :--- | :--- |
| **Root Instructions** | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` / `GEMINI.md` | `AGENTS.md` |
| **Installed Skills** | `.claude/skills/` | `.agents/skills/` | `.agents/skills/` | `.agents/skills/` |
| **Extractor & Writer Sub-Agents** | `.claude/agents/` | `.codex/agents/` | `.agents/agents/` | `.github/agents/` |
| **Harness Enforcement (`--enforce`)** | `.claude/settings.json` (`PreToolUse` + `allow`/`ask`) | `.codex/hooks.json` + `.codex/rules/wikeeper.rules` | CLI gate + `unlogged-change` lint check | `.github/hooks/wikeeper.json` (`PreToolUse` guard + permit hook) |

**Copilot in VS Code:** the hooks in `.github/hooks/wikeeper.json` cover Copilot CLI and VS Code's Copilot agent, not VS Code's Local agent, which reads another hook format. With the Local agent a direct page edit is not blocked, and `wikeeper lint` still reports it as an `unlogged-change` finding. On a machine where wikeeper can't run, the hooks step aside: Copilot asks before each command as usual and page edits aren't blocked, and `wikeeper lint` still reports them.

---

## 📋 Built for Technical Management, Product & Engineering

Out of the box, `wikeeper` ships with the **Management** profile:
- **Personal Context (`.wiki/me.md`):** Gitignored profile of your name, role, and aliases—so *"Action: PM to send budget"* in meeting notes is recognized as **your** action item.
- **Shared Project Brief (`.wiki/project.md`):** Committed core terms and scope shared across the repo.
- **Self-Evolving Rules (`.wiki/kb_instructions.md`):** Maps your key questions (`Q1`, `Q2`...) to entities (`project`, `person`, `risk`, `decision`) and versioned source kinds (`meeting-notes (v2)`). When you upgrade a rule from `v1` to `v2`, `wikeeper status` automatically flags older sources as re-ingest candidates and lets you preview the diff with `wikeeper ingest facts <id> --dry-run`.

---

## 📦 Requirements & Development

- **Node.js** `>= 22.12.0`

```bash
npm install
npm test          # Unit, structural, and acceptance suite
npm run test:perf # Search, cache and status-line performance benchmarks
npm run build     # TypeScript build + commit stamp
```
