# SPRINT-04 testbed wiki

## What it is

`~/Documents/Dev/wikeeper-testbed` is a git repository with a wiki made by the released wikeeper 0.3.0. Its owner is a fictional product manager, "Test User", Head of Product at Quillmoor, a fictional small software company that makes software for cafés, bistros and guesthouses. Quillmoor has two products:

- **atlas**, a web portal for venue owners whose launch keeps slipping because of a payments vendor;
- **beta**, a QR ordering app that shipped in August 2026.

The content is product management: meeting notes, two sales pipeline exports, a marketing plan, an investor-deck outline, an initiative draft, leadership decisions, a vendor-delay email thread, status updates, a team roster, a webinar landing page and a bilingual glossary. Some of it is in Georgian.

Every name, company, number and date in it is invented. Email addresses use the reserved `example` domains. Nothing is copied from the maintainer's private wiki or from earlier walkthrough notes.

**This testbed replaces the maintainer's private wiki for all testing.** Manual checks, designer journeys and the human's real-user walkthrough (part 4) use a scratch copy of the testbed, never the private wiki or its backup tarball. The SPRINT-04 plan (its Goal Acceptance Check and its constraints) and the stories' manual checks point at a scratch copy of the testbed and use the counts in "Sizes" below.

## How it was built

- **wikeeper:** `wikeeper --version` printed `0.3.0+3c119d2`. That is the global npm install of 0.3.0, the release commit "pin npm 11 in the release workflow". `npx` was not needed.
- **Init:** `git init`, then `git config user.name "Test User"` and `git config user.email test@example.com`. Then `wikeeper init --agents claude --profile management --enforce`. `management` is the only profile 0.3.0 offers. With no `CLAUDE.md`, init wrote the WIKI block to `AGENTS.md`, which Claude Code v2.1.277 and later reads.
- **Driving the agent:** onboarding, setup and every ingest ran in headless Claude Code (2.1.302) inside the testbed:
  - one fresh `env -u ANTHROPIC_API_KEY claude -p` session per task, with `--resume` for the user's follow-up answers, on the subscription login and never with `--bare`;
  - `--setting-sources project,local`, so the user's own settings and plugins stayed out;
  - `--strict-mcp-config` with a single permission stand-in, passed by `--permission-prompt-tool`, and `--permission-mode manual`.
- **The prompts** were plain requests that never named wikeeper or its commands, for example "I'd like to set up my wiki for managing our products" or "Here's the beta launch retro from the end of August, please add it: inbox/…". One ingest request was in Georgian, and the agent answered in Georgian.
- **The permission stand-in** answered every harness prompt and logged it. It allowed everything except paths outside the testbed and the temp directory, `git push`, settings files and recursive `rm`. Out of 433 prompts it declined one: the agent's `rm -rf` of its own temp folder.
  - Headless runs ignore the project's `permissions.allow` entries, because the workspace was never trusted interactively ("Ignoring N permissions.allow entries … this workspace has not been trusted"). So the stand-in also answered the read-only `wikeeper` commands that `enforce` normally allows.
- **Onboarding answers:** name Test User, addressed as "Test", Head of Product at Quillmoor (a fictional city, about 30 people). English by default, Georgian when the user writes Georgian. Short answers with sources. Timezone: a UTC+4 timezone.
- **Setup choices:**
  - The rules in `kb_instructions.md` were drafted with the user. There is one page per product, feature, account, campaign, deck, initiative and vendor, plus shared `decisions.md`, `people.md`, `risks.md`, `investors.md`, `glossary.md` and, added later, `forecasts.md`.
  - Permission mode `ai`, and `people.md` stays in git.
  - `setup_completed_at` is set.
- **Ingests:** 15 sources from `inbox/` (14 `.md` and `.txt` files and one `.html` page), in date order. Rule changes came up during the ingests: the user approved some and declined others, so `meeting-notes`, `marketing-plan`, `pipeline-export`, `email-thread` and `status-update` are at v2. New kinds were added: `customer-feedback`, `team-roster`, `initiative-proposal` and `glossary`.
  - Four sources were re-ingested under a new rule version: the kickoff notes, the marketing plan, the September pipeline and the Stratoline thread. One chat-excerpt ingest fixed four uncited lines. That makes 20 ingests in all: 19 from files and one chat excerpt, which has no source page.
  - Several later rule proposals were left unanswered, as a busy user would leave them.
  - The headless sessions cost about $17 at API list price, billed to the subscription.

## Baseline

| Item | Value |
|---|---|
| Tag | `baseline-0.3.0` on commit `e503aa8` (two commits: "Set up the wiki", "Add sources from the inbox to the wiki") |
| Tarball | `~/Documents/Dev/wikeeper-testbed-baseline-0.3.0.tar.gz`, 598,127 bytes, sha256 `30ef4c22b1c7e9ca466f53a78e7702309f75dbc2c06d4bf6dc6e49b6e52e229d` |
| `wikeeper status` | no open ingest, no unfinished source, no re-ingest candidate; 41 pending rule suggestions from 10 sources; setup completed; no misses |
| `wikeeper lint` | 0 errors, 6 `stale-fact` warnings (beta-era and September risks, more than 30 days old) |
| `wikeeper doctor` | 0 errors, 0 warnings, one info line (`claude-agents-md-only`) |
| Package files | written by 0.3.0 (`.wiki/system/manifest.json`), for the "your files are out of date" check |

The tarball holds the whole working tree with `.git`. Unlike a clone, it also has `.wiki/me.md`, which is gitignored, and `.wiki/.cache/`.

## Sizes

These are Claude's real counts, measured with the SPIKE-003 §4 method:

- `claude -p --output-format json --model claude-opus-5-5`, with tools, settings, MCP and skills off, in an empty folder;
- each file is sent as the prompt, and its count is the total input of the first API call minus the baseline;
- an empty prompt is now refused, so the baseline is a one-character prompt, `.`. It was 2,903 tokens on all three runs, and the `.` is counted back in.

A few runs needed care:

- Five pages made the model attempt a tool call that failed and was retried, which doubled the reported usage. Those pages were counted from the first assistant event instead.
- Some runs hung and were retried.

The estimate is the SPIKE-003 §5 per-class weighted count, computed with a scratch script outside the repository and the testbed.

| What | Claude's count | Estimate | Deviation |
|---|---|---|---|
| 56 pages under `.wiki/pages/` | 73,369 | 70,318 | −4.2% |
| `.wiki/index.md` | 7,822 | 7,559 | −3.4% |
| Pages plus index | 81,191 | 77,877 | −4.1% |
| Per page, worst cases | `forecasts.md` 935 | 808 | −13.6% |
|  | a pipeline source page 1,018 | 905 | −11.1% |
|  | an atlas status source page 865 | 905 | +4.6% |

- **Every page is within ±15%.** The estimate runs low more often than high.
- **Page count is 56,** above the 35–45 aimed for. Each of the 19 file ingests wrote its own source page, and the setup made one page per entity.
- **Median page:** 874 tokens (Claude).
- **Largest page:** `decisions.md`, 6,755 tokens (estimate 6,529). Next are `risks.md` 6,475, `glossary.md` 5,685 and `people.md` 5,228.
- **No page is red** at the default page limits (4k yellow, 10k red); those four are yellow.

## Large inbox document

`inbox/atlas-prd-v2.3-full-specification.md` is a fictional atlas product requirements document. It is committed but **not ingested**.

- Size: 75,754 bytes, 25,935 tokens by Claude's count, 28,867 by the estimate (+11.3%).
- It is above the 20k approval limit and below the 60k red limit, for the "asks before reading a large document" check.
- It is the only inbox file with no source in the wiki, so a plain request such as "here's the full PRD, please add it" reaches it.

## beta's dates

- Planned GA 2026-08-17; GA 2026-08-19.
- Peak-hour latency incident 2026-08-22.
- First-week feedback 2026-08-24.
- Fix release 1.0.2 2026-08-25.
- Maintenance mode, "done as a project", 2026-08-28.

beta has no fact dated after August: `wikeeper search --entity beta --since 2026-09-01` lists 0 facts. Later pages mention beta only in passing, for example the "From beta to atlas" campaign, which is an atlas campaign.

## Pages for specific checks

- **A page that could go over a 10k limit if lowered:** `decisions.md` (6,755) and `risks.md` (6,475) both turn red if the page red limit is lowered to 6k. They also grow with every ingest of meeting notes or status updates.
- **Superseded facts:**
  - atlas GA moved 2026-11-02 → 2026-11-23 → 2026-12-07 (`products/atlas.md`, all three lines kept);
  - the Stratoline SDK v3 release moved 2026-09-21 → 2026-10-12;
  - certification moved from the week of 2026-10-19 to the week of 2026-11-02;
  - the webinar moved 2026-11-12 → 2026-12-10;
  - account stages, values and close dates changed between the 2026-09-08 and 2026-10-06 exports, for example Orrin Guesthouses 2026-10-15 → 2026-12-10;
  - the Pro price draft of €60 was replaced by €49;
  - six `contradicts::` lines are on `risks.md`, `products/atlas.md` and four feature pages.
- **Georgian notes:**
  - two Georgian sources: the beta café feedback (2026-08-24) and the Kalako Kitchen Group meeting (2026-10-09);
  - the bilingual glossary (53 terms, with the Georgian terms as aliases);
  - two accounts named by transliteration (`accounts/limonis-ezo.md`, `accounts/tsiskvilis-kutkhe.md`), which carry their English CRM names as aliases.

## Making a scratch copy

```sh
git clone ~/Documents/Dev/wikeeper-testbed <scratch> && git -C <scratch> checkout baseline-0.3.0
cp ~/Documents/Dev/wikeeper-testbed/.wiki/me.md <scratch>/.wiki/me.md   # me.md is gitignored, so a clone lacks it
```

Or extract the tarball into an empty folder, which keeps `me.md`. Then move the copy so that its path differs from the testbed's:

```sh
mkdir <scratch-parent> && tar -xzf ~/Documents/Dev/wikeeper-testbed-baseline-0.3.0.tar.gz -C <scratch-parent>
```

Three things to know about a copy:

- Without `me.md`, the agent onboards the user again.
- A copy at a new path is an untrusted workspace for Claude Code until it is opened interactively once.
- The testbed's own path holds the headless build sessions in Claude Code's session history, so `claude --continue` there would resume one. A scratch copy at another path starts clean.

## Which checks use a scratch copy

Every check that runs a command or an agent session uses a scratch copy and leaves the testbed at `baseline-0.3.0`. Even read-looking commands write: a `wikeeper search` that finds nothing records a miss, `status` and `search` refresh `.wiki/.cache/`, and `rules record` writes a log event.

- Part 1 mechanical: `wikeeper status --json` sizes and `version.files`, on 0.4.0.
- 009-01: the version set to 0.4.0 in the scratch clone of the repo, run against a scratch copy of the testbed.
- Ingests, including the large-document approval check with `inbox/atlas-prd-v2.3-full-specification.md`.
- Limit changes (`config set`) and `statusline --install`.
- The red-page notice and the archive clean-up (moving outdated facts, `ingest finish`, history search).
- `update` after the user says yes, and `upgrade`.
- The designer's JOURNEY runs and the human's part-4 walkthrough: one fresh copy per session where a session's changes would affect the next.

The testbed itself is only read: `git -C ~/Documents/Dev/wikeeper-testbed show baseline-0.3.0:<path>`, or reading its files directly. Re-tag only on purpose, and record it here.
