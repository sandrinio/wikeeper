# UX Map — wikeeper

**What this is:** how wikeeper fits together for the person using it, journey by journey. Each step shows
who acts, what the user says, what the agent runs, what the CLI prints (a human line, or a JSON key), what
the agent tells the user, and the next step. §3 lists every notice that can appear at session start, so
collisions are visible.
**Who keeps it:** the designer agent (`.claude/agents/designer.md`) updates it after VERIFY and JOURNEY
reviews. People may edit it too.
**How it relates to the guide:** `docs/ux.md` says how output and speech are shaped, and this map says where
each one appears. On a word, `docs/ux.md` §6 wins.
**Status:**
- Seeded 2026-10-18 from wikeeper 0.3.0 (`8988a2c`) and the approved SPRINT-04 stories. A step marked
  "(SPRINT-04, STORY-NNN-NN)" is planned until that story merges.
- Refreshed 2026-10-18 (designer, DRAFTS round 2) to the shapes the SPRINT-04 stories state after the
  DRAFTS fixes and the plan confirmation (decisions 62–65). SPRINT-04 has no VERIFY or JOURNEY review, so
  every SPRINT-04 line here is **planned, not yet seen** in a built CLI.
- Refreshed 2026-10-20 (designer, VERIFY of CR-008, with CR-007's setup text): J1 steps 11–11a and table H
  (hooks under `enforce`) are **seen** in a build of the uncommitted tree and one headless Claude Code
  session. No real Copilot session was run.
- Refreshed 2026-10-20 (designer, VERIFY of CR-009): table H rows H4 and H6 were **seen** again in a build of
  the uncommitted CR-009 tree, in scratch copies of the testbed. CR-009 applied three of the §4 notes.
- Example content is neutral: a project "atlas", a project "beta", Monday's meeting notes, a Q4 plan PDF.
- Commands appear here because this map is for the people building wikeeper. The agent never says them to
  the user (ux.md §1.2).

---

## 1. Roles

| Role | Who | What they see |
|---|---|---|
| **User** | The person working with their agent, for example a product manager. Not technical about the CLI. | Only what the agent says. |
| **Agent** | The main agent in Claude Code, Codex, Antigravity or Copilot, following the pointer block and `WIKI.md`. | The CLI's human output or `--json`. |
| **Helpers** | `wiki-extractor` (`ingest.extractor_model`, default `small`) and `wiki-writer` (`ingest.writer_model`, default `medium`) sub-agents. | Their task text and the CLI. They never talk to the user. |
| **Installer** | Whoever runs `npx wikeeper init` in a terminal (README quickstart). | The CLI's human output and its prompts. |

---

## 2. Journeys

**Every journey ends with an obvious next step.** A journey that stops is a dead end (ux.md §1.3).

### J1 — First setup and onboarding
- **Starts:** wikeeper is installed in a repository and nobody has set the wiki up.
- **Steps:**

| # | User says | Agent runs | CLI prints | Agent tells the user | Next |
|---|---|---|---|---|---|
| 1 | (Installer, in a terminal) | `npx wikeeper init` | the prompts `Which agents do you use? …` and `Enable --enforce …? [y/N]`, then `initialised .wiki/: 31 created, 0 updated, 0 unchanged` and `next: ask your agent to read .wiki/system/SETUP.md` | — | 3 |
| 1b | "Set up a project wiki here." | `wikeeper init` (no terminal) | exit 5 `needs_input`: `no agents configured: re-run with --agents <list> (choices: claude, codex, antigravity, copilot)`; `details.choices` | "Which coding agents does your team use here: Claude Code, Codex, Antigravity, Copilot?" | 2 |
| 2 | "Claude Code and Codex." | `wikeeper init --agents claude,codex --yes` | the line of step 1 | "The wiki is installed. Let's set it up: a few questions about you first." | 3 |
| — | (SPRINT-04, STORY-007-01) | `init` | `config.yml` now holds the commented `tokens:` block | — | — |
| 3 | "Let's finish setting up the wiki." | reads the pointer block: no `setup_completed_at`, no `me.md` | — | "What's your name, how should I address you, and what's your role?" (it may suggest the git user name, and writes it only after a yes) | 4 |
| 4 | answers | — | — | Asks what they'll ask the wiki and what they're working on, then their language, answer style and timezone. | 5 |
| 5 | answers | — | — | Shows the draft of `me.md`: "Shall I save this?" | 6 |
| 6 | "Yes." | writes `.wiki/me.md`; `wikeeper doctor` | no `setup-files` finding about `me.md`; still `[info] setup-files: .wiki/project.md is missing: setup writes it (.wiki/system/SETUP.md)` | "Saved. From the next session I'll greet you as you asked." | 7 |
| 7 | — | — | — | "What is the project? You can point me to a README or a product summary." | 8 |
| 8 | names a document | `wikeeper read <file> --out <tmp>` (for a PDF, DOCX, HTML or URL) | `wrote <tmp> (… bytes, pdf)`; (SPRINT-04, STORY-007-03) `wrote <tmp> (≈2.1k tokens 🟢 · 8.2 KB · pdf)` | Shows the draft project brief: "Is this right?" | 9 |
| 9 | "Yes." | writes `.wiki/project.md` | — | Shows the questions the wiki should answer, the things it tracks and the kinds of documents it reads: "Does this fit?" | 10 |
| 10 | "Drop the budget question." | writes `kb_instructions.md`; `wikeeper lint --rules` | `checked .wiki/kb_instructions.md with 13 checks`, `0 errors, 0 warnings, 0 info` | Goes through any problems with the user, then: "Who should approve what goes into the wiki: me, you each time, or only agreed kinds of documents?" | 11 |
| 11 | "Ask me each time." | writes `ingest.permission: ask`; `wikeeper update`; then (SETUP.md step 5) reads `ingest.extractor_model`, `ingest.writer_model`, `agents` and the installed helper files | stderr `updated: 2 replaced, 0 added, 0 removed` (A.17) | Seen 2026-10-20 (Claude Code, in a Claude Code + Copilot wiki): "Two helpers do the work when a document is added to the wiki. Your chat model stays the same whatever you pick here." Then, for each job ("reading a document and pulling out facts", "writing those facts into wiki pages"), the current choice and the model it gives in each coding agent (Claude Code: Haiku, Sonnet; Copilot: GPT-6 Luna, Claude Sonnet 5.5; Codex: "Codex's own default model"). Then the three choices: keep them, another model (the trade-off, no prices, and that one name may not work in every coding agent), or "your coding agent's own default model". Then "I can't check from here which models your accounts can use, so please confirm in each tool's model picker", and "Tell me what you want for each job. Once you say yes, I'll save the choices and refresh the helpers." | 11a |
| 11a | "Keep them as they are." | writes `ingest.extractor_model: small` and `ingest.writer_model: medium` (`""` for "your coding agent's own default model"); `wikeeper update`; reads its warnings and the helper files; `wikeeper doctor` | `already up to date`, or `updated: <n> replaced, …`; a model that is unsupported or replaced is settled with the user before step 12 | Seen: "The helpers stay as they were. In Claude Code, Haiku reads documents and pulls out facts and Sonnet writes the pages. In Copilot, GPT-6 Luna reads and Claude Sonnet 5.5 writes. … You can ask me to change these models at any time." It does not ask again (ux.md §1.5). When a helper file changed, it says the new choices take effect once the user starts a new session. Then (planned, SETUP.md step 7): "Want to add a first document?" | J2, or 12 |
| 12 | "Later." | `wikeeper setup --done` | `setup completed at 2026-10-18T09:12:00Z (profile management)` | One or two sentences on what the wiki covers and how to ask it a question. | J3, J4 next session |

- **Ends with:** a set-up wiki and a profile; the next session greets the user by name (J4).
- **Ingest model choice (CR-007, CR-008):** asked once, in setup step 5, for all configured coding agents, not on every ingest. The user asks again later through WIKI.md "Delegation", which points back to step 5 (the run seen above came in that way, in an already set-up wiki). Said forms (SETUP.md step 5): "helpers", "a smaller, faster model" (`small`), "a mid-sized model" (`medium`), "Codex's own default model" (either tier in Codex), "your coding agent's own default model" (`""`). It never says harness, tier or the setting names unless the user asks. Shared settings must work across a mixed team: Antigravity takes only tiers, and an explicit id is not assumed to work everywhere. If availability cannot be checked, the agent says so and asks the user to confirm in their model picker. A model failure later is never silently replaced. When helpers cannot run, the agent says it does both jobs itself.
- **Rules:** ux.md §1.5 (drafts shown first), §7.1, §7.7. Appendix A.21: SETUP.md step 6 and ONBOARDING.md
  step 5 currently have the agent tell the user to run `wikeeper doctor`. Appendix A.22: SETUP.md step 4
  shows the user a table of harness rules.

### J2 — Adding a document
- **Starts:** the user shares a file, a link, a folder or a fact in chat.
- **J2a, a file shared in chat (`ai` mode):**

| # | User says | Agent runs | CLI prints | Agent tells the user | Next |
|---|---|---|---|---|---|
| 1 | "Here are the notes from Monday's atlas meeting." (`docs/meetings/atlas-weekly.md`) | `wikeeper status` (once per session, before the first ingest) | J4's status lines | any notice due (§3) | 2 |
| 2 | — | `wikeeper ingest start docs/meetings/atlas-weekly.md --kind meeting-notes` | `registered src-2026-10-18-atlas-weekly from docs/meetings/atlas-weekly.md (4980 bytes)`, `rule meeting-notes v1; permission ai: allowed`, `next: …`; JSON `data.status: "registered"` | — | 3 |
| — | (SPRINT-04, STORY-007-03) | | first line `… (≈1.8k tokens 🟢 · 4.9 KB)`; `data.source.tokens`, `data.source.level` | — | — |
| — | (SPRINT-04, STORY-009-01; planned) | | maybe `warning: wikeeper 0.4.1 is available (installed 0.4.0): run wikeeper upgrade` | nothing now: told once, after this request is done (J7 step 1) | — |
| 3 | — | `wikeeper search --no-miss --entity atlas`, then `wikeeper ingest facts <id> --file <tmp>` | `stored 6 facts for <id> in .wiki/raw/<id>.facts.json; new entities: 1, uncovered: 1` | — | 4 |
| 4 | — | (writer) `wikeeper ingest apply <id>`, page edits, `wikeeper ingest finish <id>` | `✅ Ingested <id>`, `kind … · origin … · 4.9 KB · sha …`, `rule meeting-notes v1 · permission ai`, `created 1 · updated 3 · deleted 0 · contradictions 1 · rule suggestions 1` | — | 5 |
| — | (SPRINT-04, STORY-007-05) | | fifth line `wiki ≈66k tokens (+1.2k) · largest page projects/atlas.md ≈6.3k 🟡` | — | — |
| 5 | — | — | — | "Added Monday's atlas notes: one new page, three updated. One point disagrees with the October status report; I've marked both on the atlas page. The notes also have budget figures the wiki doesn't keep yet. Want me to propose a rule for them?" | rule proposal, or done |

- **J2b, `ask` mode:**

| # | User says | Agent runs | CLI prints | Agent tells the user | Next |
|---|---|---|---|---|---|
| 1 | as J2a | `wikeeper ingest start …` | exit 3 on stderr, no `error:`: `docs/meetings/atlas-weekly.md needs approval (4.9 KB, kind meeting-notes, rule meeting-notes v1): ingest.permission is ask: show the user the source "…" and rerun with --approved once they agree.`; `error.details.source` | "Before I add it: Monday's atlas notes (4.9 KB, meeting notes). OK to add them to the wiki?" | 2 or 3 |
| — | (SPRINT-04, STORY-007-03) | | the size part reads `(≈1.8k tokens 🟢 · 4.9 KB, …)`; `error.details.cause: "permission"`, `error.details.size` | the estimate in words: "about 1.8k tokens" | — |
| 2 | "Yes." | the same command with `--approved` | as J2a step 2 | — (no second question) | J2a 3 |
| 3 | "No, not those." | — | — | "OK, I won't add them. Nothing was stored." | done |

- **J2c, a large document (SPRINT-04, STORY-007-03, STORY-007-07):**

| # | User says | Agent runs | CLI prints | Agent tells the user | Next |
|---|---|---|---|---|---|
| 1 | "Add the Q4 plan." (`q4-plan.pdf`, 40 pages) | `wikeeper read q4-plan.pdf --out <tmp>` | `wrote <tmp> (≈31k tokens 🟡 · 120.4 KB · pdf)`; `data.tokens`, `data.level` | — | 2 |
| 2 | — | `wikeeper ingest start q4-plan.pdf --text-file <tmp> --kind status-report` | (planned) exit 3 on stderr, no `error:`: `q4-plan.pdf needs approval (≈31k tokens 🟡 · 1.2 MB, <kind part>): it is at or above the approval limit tokens.source.yellow (20k): show the user the estimate and rerun with --approved once they agree.`; `error.details.cause: "size"`, `error.details.size: { tokens, rough: false, level: "yellow", limit: 20000, confirm_at: "yellow" }`. In `ask` mode the reason is the permission's, then ` It is also at or above the approval limit tokens.source.yellow (20k).` (`cause: "both"`) | "The Q4 plan is large: about 31k tokens, yellow (I ask from 20k). Shall I add it?" In `ask` mode (`cause: "both"`) this is the one question. | 3 or 4 |
| 2b | — | as 2, a 🔴 source (≥ 60k) | (planned) as 2, `🔴` and `level: "red"` | Also offers, in plain words and never naming the sub-agent (STORY-007-07 R2 (c)): "a helper reads it and hands me only the facts", or "I read only the sections you pick, and the rest isn't captured" (without helpers, only the second). | 3 or 4 |
| 3 | "Yes." | rerun with `--approved` | registered | — | J2a 3 |
| 4 | "No." | — | — | "OK, I didn't add it. Nothing was stored." | done |

- **J2d, a scanned PDF:**

| # | User says | Agent runs | CLI prints | Agent tells the user | Next |
|---|---|---|---|---|---|
| 1 | "Here's the signed vendor agreement." (`agreement.pdf`, a scan) | `wikeeper read agreement.pdf --out <tmp>` | `warning: likely scanned: 3 of 3 pages have almost no extractable text (pages 1–3); read the PDF yourself, wikeeper does not do OCR`; `data.warnings[0].code: "likely_scanned"` | — | 2 or 3 |
| — | (SPRINT-04, STORY-007-03) | | `wrote <tmp> (rough ≈4.8k tokens 🟢 · 2.4 KB · pdf)`; `data.tokens_rough: true` | "rough" is said with the size whenever it is asked about | — |
| 2 | — | reads the PDF itself, writes its text to a new temp file, `wikeeper ingest start agreement.pdf --text-file <file>` | registered (counted from that text, not rough) | — | J2a 3 |
| 3 | — | (cannot read the scan) | — | "This PDF is a scan with no text in it, and I can't read it. Could you send a text version or the original document?" | the user sends one, then J2a |

- **Other ways in:**
  - **A link:** `wikeeper read <url> --out <tmp>`. A `needs_browser` warning means the agent opens the page
    in its own browser, or asks: "That page needs a login. Could you paste its text here?" `http_error` 401
    or 403 is the same; a 404 is "That link doesn't open. Could you check it?"
  - **An unsupported file:** a `.pptx` gives exit 2 `unsupported`. The agent asks: "I can't read slides
    directly. Could you export the deck as a PDF?"
  - **A folder:** `wikeeper ingest plan docs/meetings` prints `<path>: new (needs approval)` lines,
    `totals: 12 new (12 need approval), 2 duplicate, 0 denied` and a `next:` line. (SPRINT-04,
    STORY-007-04) adds `<path>: new · ≈1.8k tokens 🟢` and `new files: rough ≈40k tokens in total`. The
    agent asks once: "12 new documents, about 40k tokens in all (a rough count), and 2 already in the wiki.
    Add the 12?" On a yes it runs `ingest start <file> --approved` for each. (SPRINT-04) When one still
    exits 3 for size, it asks about that file alone (J2c).
  - **Something said in chat:** "We moved the atlas launch to 17 November." At the end of its reply the agent
    offers: "Shall I note in the wiki that the atlas launch moved to 17 November? That sounds decided." On a
    yes: `wikeeper ingest start - --kind chat-excerpt` with the excerpt on stdin, then J2a 3. It ends with
    "Noted."
  - **A declined page write:** the harness prompt is refused mid-write. The agent runs `ingest abort <id>`
    and asks: "I stopped before changing any page. Shall I try again?"
- **Ends with:** the report in plain words (ux.md §7.5) and any offer it raised.

### J3 — Asking a question
- **Starts:** the user asks about the project, or asks for a draft that needs project facts.

| # | User says | Agent runs | CLI prints | Agent tells the user | Next |
|---|---|---|---|---|---|
| 1 | "Who owns the vendor delay risk on atlas?" | `wikeeper search "vendor delay owner" --json` | `data.results[]` with `path`, `section`, `snippet`, `sources`; human `2 results for "vendor delay owner"`, `1. risks.md › Vendor delay` | — | 2 |
| — | (SPRINT-04, STORY-007-05) | | each hit carries `page_tokens` | of a 🔴 page it reads only the parts it needs | — |
| 2 | — | reads the pages | — | The answer, with `[[src-…]]` citations. | follow-up |
| 3 | "And who decided the November date?" | `wikeeper search …` | `no results for "…"` (a miss is recorded) | "The wiki doesn't say who decided it. If you have the meeting notes where it was agreed, I can add them." | J2 |
| 4 | "What changed on atlas since 1 October?" | `wikeeper search --entity atlas --since 2026-10-01` | `changes since 2026-10-01: 5 facts, 2 page changes`, then `- 2026-10-15 · tentative · …` lines | The changes by date, decided and still being considered kept apart, with citations. | follow-up |
| — | (SPRINT-04, STORY-008-03) | | archived facts included and marked `(archived)`; `FactView.archived` | — | — |
| 5 | "What was the first launch date we planned?" | `wikeeper search …`, then (SPRINT-04, STORY-008-06) again with `--archive` | an archived hit `1. projects/atlas.md › Timeline (archived)`; `archived: true` | The earlier date, cited, and that it was replaced later. | follow-up |
| 6 | "What is atlas, in a sentence?" (no page answers) | `wikeeper search …` | no results | A sentence from the project brief, labelled as from the brief and not from a cited source. | follow-up |

- **Ends with:** a cited answer, or a plain "the wiki doesn't know" with an offer.

### J4 — Session start
- **Starts:** a new session in a repository with a wiki.

| # | User says | Agent runs | CLI prints | Agent tells the user | Next |
|---|---|---|---|---|---|
| 1 | first message | reads `me.md` and `project.md` (pointer block) | — | addresses the user as `me.md` says | 2 |
| 1b | — | `me.md` missing | — | starts onboarding (J1 steps 3–6) | J1 |
| 2 | — | (SPRINT-04, STORY-007-06, STORY-007-07; planned) only once setup is done (`setup_completed_at` set): `wikeeper statusline` | `wiki ≈66k tokens · 43 pages · largest page ≈6.3k 🟡`; with no pages `wiki ≈0 tokens · 0 pages`; outside a wiki nothing; on an error `wiki size unavailable (E_CONFIG_SYNTAX): run wikeeper doctor` (any error code), exit 0 | opens its first reply with the line (pointer-block line 4). Before setup is done it shows no size line: setup comes first (J1). On the error line it does not show it: once it has read WIKI.md it runs `wikeeper doctor` and says in plain words what is wrong | 3 |
| 3 | — | before the first ingest, or when asked what's pending: `wikeeper status` | `open ingest: none`, `unfinished sources: none`, `re-ingest candidates: none`, `pending rule suggestions: none`, `setup: completed … · me.md present · project.md present`, `misses: 3 recorded (…)` | the notices due, in §3 order, in one message after the user's request is done | 4 |
| — | (SPRINT-04, STORY-007-05, STORY-008-05, STORY-009-01; planned) | | then `tokens: wiki ≈66k · 43 pages · index.md ≈5.1k`, `  limits: page 4k/10k · source 20k/60k, approval at yellow` (`no size approval` for `confirm_at: never`), `  largest pages:` and up to five `    projects/atlas.md ≈6.3k 🟡` lines (left out with no pages), `archive: none` or `archive: ≈12k tokens · 3 pages`, `archive candidates: none` or J6 step 4's lines, and, only when due, `version: wikeeper 0.4.1 is available (installed 0.4.0): run wikeeper upgrade` and `version: this project's wikeeper files are from 0.3.0 (installed 0.4.0): run wikeeper update` | — | — |
| 4 | the request | — | — | answers it (J2, J3 …) | — |

- **Ends with:** the user's request answered, with notices told once.

### J5 — A page over its limit (SPRINT-04, STORY-007-05, STORY-007-07, STORY-008-06)
- **Starts:** a page reaches the red page limit (10k by default). It shows in the finish report, the size
  line, `status`, an `oversized-page` finding or an archive candidate with reason `size`.

| # | User says | Agent runs | CLI prints | Agent tells the user | Next |
|---|---|---|---|---|---|
| 1 | — | `wikeeper ingest finish <id>` | (planned) `   wiki ≈71k tokens (+2.4k) · largest page projects/atlas.md ≈12k 🔴`; `warning: lint [warn] oversized-page .wiki/pages/projects/atlas.md: page is ≈12k tokens (tokens.page.red is 10k)` | Once in the session, however many of the five signals show the page (STORY-007-07 R5 (b) 4, as STORY-008-06 R5 (a) edits it): "The atlas page is now about 12k tokens, over the 10k page limit. I can raise the limit for you, or do a clean-up that moves replaced and finished facts to the archive, where they're kept. Or leave it as it is." | 2, 3 or 4 |
| 2 | "Raise it to 15k." | (STORY-007-02) `wikeeper config set tokens.page.red 15k` | (planned) `set tokens.page.red to 15000 (was 10000)`; `data: { key, value: 15000, previous: 10000, changed: true }` | "Done: pages turn red from 15k now." | done |
| 2b | "Make it 3k." | `wikeeper config set tokens.page.red 3k` | exit 2 `invalid_config_value`: `tokens.page.yellow: 4000 — must be below tokens.page.red (3000)` | "That would put red below yellow, which is 4k. Shall I set yellow to 2k as well?" | 2 |
| 3 | "Clean it up." | — | — | J6 | J6 |
| 4 | (nothing) | — | — | not raised again this session | — |
| 5 | "Stop asking me about big documents." | `wikeeper config set tokens.source.confirm_at never` | (planned) `set tokens.source.confirm_at to never (was yellow)` | "OK, I won't ask about a document's size any more." | done |

- **Ends with:** a raised limit, a clean-up, or the page left, chosen by the user. The agent never changes
  a limit itself.

### J6 — A clean-up into the archive (SPRINT-04, EPIC-008)
- **Starts:** the user asks for a clean-up, from J5 or an archive candidate. The agent never starts one
  itself (STORY-008-06 R1).

| # | User says | Agent runs | CLI prints | Agent tells the user | Next |
|---|---|---|---|---|---|
| 1 | "Clean up the atlas page." | reads the page | — | Lists the lines it would move (facts a newer line replaced, finished items) and keeps the newest of each: "Move these 7 to the archive?" | 2 |
| 2 | "Yes, but keep the vendor ones." | `wikeeper ingest start - --kind chat-excerpt` (the decision on stdin), `wikeeper ingest facts <id>` (empty `facts`), `wikeeper ingest apply <id>` | `stored 0 facts for <id> …`; (STORY-008-01) `data.snapshot.archive` | — | 3 |
| 3 | — | cuts the lines into `archive/projects/atlas.md`, adds `archive:: [[archive/projects/atlas]]`, writes `sources/<id>.md`, `wikeeper ingest finish <id>` | (planned; STORY-008-02) `   archived 5 fact lines · 0 pages` (plural helper: `archived 1 fact line · 0 pages`, `archived 2 fact lines · 1 page`); (STORY-007-05) `   wiki ≈64k tokens (-7.1k) · largest page …` | "Moved 5 old facts from the atlas page to the archive. The page is now about 5k tokens, yellow. They still come up when you ask about the past." | done |
| 3b | — | as 3, a line cut but not archived | exit 1 `validation_failed`: `… fact lines dropped (a replaced fact stays in the list; a clean-up moves it unchanged to archive/<same path>): projects/atlas.md ("…")`; lock kept | — (puts the line back or archives it, reruns finish) | 3 |
| 3c | — | a line removed from the archive | exit 1: `archived fact lines dropped (no line leaves archive/): archive/projects/atlas.md ("…")` | — (restores it, reruns finish) | 3 |
| 4 | — | `wikeeper status` | (planned; STORY-008-05) `archive: ≈7.1k tokens · 1 page`; `archive candidates: 1`, `  projects/beta.md · Beta: status shipped, last dated 2026-08-30 (lint.stale_after_days is 30)`, `  nothing moves to the archive until the user asks for a clean-up` (with a `size` entry, `  projects/atlas.md ≈12k 🔴 (tokens.page.red is 10k)` and the line gains `; to raise the page limit instead, run wikeeper config set tokens.page.red <n>`); JSON `{ path: "projects/beta.md", reason: "final_status", status: "shipped", entity: "Beta", last_dated: "2026-08-30" }` | Once in the session: "Beta shipped in August and nothing has come in about it since. Move its page to the archive, or leave it?" A `size` entry is not a second notice: it is J5 step 1, told once with it. | 1 or done |

- **Ends with:** smaller pages, nothing deleted, and archived facts still found by history questions (J3
  step 5).

### J7 — A new version, and files out of date (SPRINT-04, EPIC-009)
- **Starts:** an ingest command's daily check finds a newer version, or `status` or `doctor` sees this
  project's files come from another version.

| # | User says | Agent runs | CLI prints | Agent tells the user | Next |
|---|---|---|---|---|---|
| 1 | — | any `ingest plan` or `ingest start` (STORY-009-01; planned) | `warning: wikeeper 0.4.1 is available (installed 0.4.0): run wikeeper upgrade` (stderr; the same sentence in `warnings`) | Once in the session, after the user's request is done (STORY-009-03 R1): "A newer version of wikeeper is out (0.4.1; you have 0.4.0). Shall I upgrade it?" When this project's files are older too, this is the one question: the upgrade refreshes the files as well (no separate step 6 question). | 2 or 5 |
| 2 | "Yes." | (STORY-009-02; planned) `wikeeper upgrade`, after the harness prompt (no allow rule) | `upgraded wikeeper 0.4.0 → 0.4.1 with npm install -g and updated this project's files`, `other projects that use this wikeeper: run wikeeper update in each (wikeeper status there says so)` | "Upgraded to 0.4.1 and refreshed this project's wiki files. Other projects that use it will offer the same refresh when you open them." | done |
| 3 | — | `upgrade` fails (planned) | exit 1 `npm_failed`: `npm install failed (exit 243); nothing was changed: to upgrade by hand, run sudo npm install -g wikeeper@0.4.1, then run wikeeper update in this project`, then `  npm error code EACCES` and npm's other last lines; `details.command: "sudo npm install -g wikeeper@0.4.1"`, `details.then: "wikeeper update"` | "The upgrade needs administrator rights, which I don't use. To do it yourself, run `sudo npm install -g wikeeper@0.4.1` in a terminal, then tell me and I'll refresh this project's files." (ux.md §1.2 exception; the reply "done" is the yes for `then`) | 4 |
| 3b | — | a pnpm install (planned) | exit 1 `upgrade_unsupported`: `wikeeper runs from <dir>, <how>, which wikeeper upgrade does not handle; nothing was run: to upgrade by hand, run pnpm add -g wikeeper@0.4.1, then run wikeeper update in this project`; `details.command: "pnpm add -g wikeeper@0.4.1"` | "wikeeper was installed with pnpm, which I don't drive. Run `pnpm add -g wikeeper@0.4.1`, then tell me and I'll refresh this project's files." | 4 |
| 3c | — | the new version's update fails (planned) | exit 1 `update_failed`: `wikeeper 0.4.1 is installed, but its update failed: run wikeeper update in this project`, then the child's last lines | "0.4.1 is installed, but refreshing this project's files failed. Shall I try the refresh again?" | 4 |
| 3d | — | the registry can't be reached (planned) | exit 1 `registry_unreachable`: `could not reach the npm registry (ENOTFOUND); nothing was changed: try again later`; `details.command: null` | "I couldn't reach npm, so nothing changed. Shall I try again later?" | 5 |
| 4 | "Done." | `wikeeper update` | stderr `updated: 12 replaced, 1 added, 0 removed` | "Refreshed this project's wiki files." | done |
| 5 | "Not now." | — | — | not raised again this session | — |
| 6 | — | `wikeeper status` (STORY-009-01; planned) | `version: this project's wikeeper files are from 0.3.0 (installed 0.4.0): run wikeeper update`; `version.files: "0.3.0"`; doctor `[warn] version-mismatch` with `  fix: run wikeeper update` | "This project's wiki files are from 0.3.0, older than the installed 0.4.0. Shall I refresh them? It updates wikeeper's own instructions and its block in AGENTS.md; your pages aren't touched." (STORY-009-03) Not asked when step 1 is due too. | 4 or 5 |
| 7 | — | `wikeeper status` (planned) | `version: this project was updated by wikeeper 0.4.1 (installed 0.4.0): run wikeeper upgrade`; doctor `  fix: run wikeeper upgrade` | "Someone refreshed this project with wikeeper 0.4.1, and you have 0.4.0. Shall I upgrade yours?" | 2 or 5 |

- **Ends with:** the user on the current version, or a no that holds for the session.

### J8 — Removing wikeeper
- **Starts:** the user wants the wiki tools out of the repository, or the whole wiki gone.

| # | User says | Agent runs | CLI prints | Agent tells the user | Next |
|---|---|---|---|---|---|
| 1 | "Take the wiki tools out of this repo, but keep what we've collected." | `wikeeper remove` | `removed wikeeper tooling (14 files); knowledge kept`; `data.kept` (SPRINT-04, STORY-008-05: includes `archive/`) | "Done. The wiki tools are gone; the pages, sources and archive are still in `.wiki/`." | done |
| 2 | "Delete the wiki completely." | — | — | "This deletes the wiki and everything in it: pages, sources, archive, your profile and the settings. It can't be undone. Delete it?" | 3 |
| 3 | "Yes." | `wikeeper remove --purge --confirm wikeeper` | `removed wikeeper and purged the wiki (212 files)` | "The wiki is deleted." | done |
| 3b | — | `wikeeper remove --purge` without `--confirm` | exit 5 `needs_input`: `remove --purge deletes the wiki: re-run with --confirm wikeeper` | asks as in step 2 | 3 |

- **Ends with:** the tools gone and the knowledge kept, or, after an explicit yes, everything gone.

### H — Hooks under `enforce` (no user turn)
- **Starts:** with `enforce` on, the coding agent runs wikeeper's hooks before a file edit or a shell command.
  Hooks follow each agent's protocol, not ux.md §4–§5. The user meets only the agent's own prompt, or nothing.
- **Seen** 2026-10-20 in a build of the uncommitted CR-008 tree, by piping payloads into the hooks and
  running the installed commands through `sh`. No real Copilot session was run, and the `windows` form was not run.
  H4 and H6 were seen again on 2026-10-20 in a build of the uncommitted CR-009 tree, in testbed copies.

| # | When | Hook runs | CLI prints | What the agent and the user meet |
|---|---|---|---|---|
| H1 | Copilot edits a page outside an ingest | `wikeeper hook guard --agent copilot \|\| true` (`.github/hooks/wikeeper.json`; `windows`: `…; exit 0`) | stdout `` {"permissionDecision":"deny","permissionDecisionReason":"Wiki pages can only change during an ingest's write phase. Run `wikeeper ingest apply <id>` first — see .wiki/system/WIKI.md, section \"Write phase\".","hookSpecificOutput":{…the same…}} ``, exit 0 (A.12 shape) | the edit is refused; the agent starts the write phase (WIKI.md "Write phase"), or J2's declined page write |
| H2 | Copilot runs a shell command | `wikeeper hook permit --agent copilot --permission <mode> \|\| true` | a wikeeper command it has a rule for: `` {"permissionDecision":"allow","permissionDecisionReason":"Allowed by the wiki's permission mode `ingest.permission` in .wiki/config.yml.",…} ``, or `"ask"` with `` "The wiki's permission mode `ingest.permission` in .wiki/config.yml asks you before this command." `` (`ingest start` in `ask`; `--drop` and `--force-unlock` in `ai`); any other command, including `npx --package=… wikeeper …` and a path to a wikeeper: nothing, exit 0 | allow: no prompt; ask: Copilot's own prompt, showing that reason; nothing: Copilot's own permission flow |
| H3 | the permit hook cannot decide | as H2 | stdout empty, exit 0, stderr `warning: wikeeper hook permit left the command to the agent's permission settings: <detail>`, where `<detail>` is `no --agent given` (also for a bare `--agent`), `unknown --agent "cursor"`, `no permit hook for --agent "claude"`, `no payload on stdin`, `payload larger than 1 MB`, `payload is not valid JSON`, or the error on one line, such as `config.yml syntax error at line 18: …: fix the YAML syntax in .wiki/config.yml`. `--json` changes nothing. No command or payload text appears in it (canary checked). | Copilot's own permission flow |
| H4 | a teammate whose wikeeper is missing, or older than `hook permit` (0.4.0) | as H1, H2 | stderr `sh: wikeeper: command not found`, or `error: unknown command 'permit'` and `warning: wikeeper hook guard allowed the write: unknown --agent "copilot"`; `\|\| true` makes each hook exit 0 with nothing on stdout | Copilot is not blocked: it shows its own prompts for wikeeper commands, and page edits are not guarded (lint's `unlogged-change` still finds them). For an older wikeeper the next step is J7 step 7, from `status` or `doctor`. Seen again with CR-009: also when the `wikeeper` on `PATH` cannot start (`exec: node: not found`), exit 0 with nothing on stdout. Since CR-009 `docs/reference.md`'s Copilot note says so: "On a machine where wikeeper can't run, the hooks step aside: Copilot asks before each command as usual and page edits aren't blocked, and `wikeeper lint` still reports them." |
| H5 | the guard cannot decide | `wikeeper hook guard` | `warning: wikeeper hook guard allowed the write: <detail>`; a missing `--agent` prints `unknown --agent "undefined"` (§4) | — |
| H6 | `doctor` in a Copilot wiki with `enforce` on | `wikeeper doctor` | Seen with CR-009: `enforce: on — claude: .claude/settings.json (1 hook, 20 rules); copilot: .github/hooks/wikeeper.json (1 hook, 1 rule)` (with all four agents, `codex: .codex/hooks.json (1 hook), .codex/rules/wikeeper.rules (18 rules); antigravity: .agents/hooks.json (1 hook)` sit between them); JSON `state.enforce.agents[]` gives Copilot `{ file: ".github/hooks/wikeeper.json", hooks: ["hooks.PreToolUse[guard:copilot]"], rules: ["hooks.PreToolUse[permit:copilot]"] }`, with no `version`; `[info] copilot-trust: Copilot runs .github/hooks only after this folder is trusted, and reads the file once per session: trust the folder, then start a new session whenever wikeeper update changes this file`; with the file's `version` key deleted, the count stays `(1 hook, 1 rule)` and doctor adds `[warn] enforce-entry-missing: .github/hooks/wikeeper.json is missing wikeeper entries: version` and `  fix: run wikeeper update` (exit 0), which `update` restores; in `ask` also `[info] copilot-ask-fallback: Copilot cannot ask when nobody is there to answer, so an ingest that needs approval is refused in an autopilot or cloud session; start it from an interactive session` | nothing by itself: SETUP.md step 5 fixes errors only (§4) |

- **Ends with:** the agent's own permission flow deciding whatever wikeeper does not, and a teammate
  without a working wikeeper never blocked by the hooks.

---

## 3. Session-start notices

What the agent may have to tell the user at the start of a session, or at the first `status` of a session
(WIKI.md: before the first ingest, or when the user asks what is pending). They are told once each and
together in one message, in this order (ux.md §1.4).

Planned SPRINT-04 order of one reply (decisions 64–65; STORY-007-07 R1, R5 (b) 4; STORY-008-05 R8 (b);
STORY-009-03 R1), not yet seen:
1. **N3**, the size line, opens the first reply, only once setup is done.
2. **N1, N2** when due: they take the session (on a fresh wiki there is no N3 yet).
3. **N4**, before the request, because it blocks an ingest.
4. The answer to the user's request.
5. **N5 with N6 `size`**: one red-page notice per page, however many signals show it.
6. **N6 `final_status`**.
7. **N7 with N8**: one version question; with the files older and a newer version out, only "upgrade".
8. **N9, N10, N11**, the follow-ups WIKI.md already has.
9. One closing question.

| # | Notice | Comes from | When | What the agent tells the user | Collides with |
|---|---|---|---|---|---|
| N1 | Onboarding | pointer block; `status` `setup.me: false`; doctor `setup-files` | `me.md` is missing | starts onboarding (J1) | N2, N3 |
| N2 | Setup not finished | pointer block; `status` `setup: not completed` | no `setup_completed_at` | offers setup (J1) | N1, N3 |
| N3 | Wiki size line (SPRINT-04, STORY-007-06, STORY-007-07; planned) | `wikeeper statusline`; pointer-block line 4 "Once set up, start each session with `wikeeper statusline` and write its line before any other step or text; on 🔴 follow WIKI.md "Lint and status"." | every session start once `setup_completed_at` is set | the line `wiki ≈66k tokens · 43 pages · largest page ≈6.3k 🟡`, at the top of the first reply; never the `wiki size unavailable (…)` line | N1 on a teammate's clone (setup done, no `me.md`): the line, then onboarding; N5 when the largest page is 🔴 (the line shows the mark, the notice comes after the request) |
| N4 | Another document is being added | `status` `open_ingest`, `stale_lock` | an ingest holds the lock | its own: finishes or puts the pages back; another's: waits or asks; a stale one is taken over only after a yes | — |
| N5 | A red page (SPRINT-04, STORY-007-05, STORY-007-07, STORY-008-06; planned) | statusline 🔴; `status` `tokens.largest`; the finish report's largest page; `oversized-page` (lint and the finish warnings); a `size` archive candidate | a page at or above `tokens.page.red` | J5 step 1, once in the session however many of these show it; both choices in plain words (raise the limit on a yes, or a clean-up the user asks for) | N3 (same page), N6 `size` (told with it) |
| N6 | Archive candidates (SPRINT-04, STORY-008-05, STORY-008-06; planned) | `status` `archive_candidates`; `reason` `size` or `final_status` | `size`: the same pages as N5; `final_status`: an entity with a final status and no fact newer than `lint.stale_after_days` | for `size`, nothing of its own: the N5 notice, told once with it; for `final_status`, J6 step 4, once in the session | N5 |
| N7 | A newer version (SPRINT-04, STORY-009-01, STORY-009-03; planned) | `ingest plan`, `ingest start` warning; `status` `version:` line and `version.latest`; doctor `update-available` | the daily check found one | J7 step 1, once in the session, after the user's request is done | N8: one question, to upgrade; itself across commands: told once |
| N8 | Files from another version (SPRINT-04, STORY-009-01, STORY-009-03; planned) | `status` `version:` line and `version.files`; doctor `version-mismatch` | the manifest's version differs from the installed one | J7 steps 6–7 | N7: when both are due, only N7's question is asked |
| N9 | Unfinished documents | `status` `unfinished_sources` | a registered source with no finished ingest | offers to finish each, or to drop it after a yes | N10, N11 |
| N10 | Re-reads under new rules | `status` `reingest_candidates` | a rule changed after a source was ingested | offers to read each again | N9, N11 |
| N11 | Things the rules don't cover | `status` `pending_rule_suggestions` | a finished ingest left `uncovered` items | proposes rule changes, one small diff at a time | N9, N10 |
| N12 | Questions the wiki couldn't answer | `status` `misses` | a search found nothing | nothing by itself: misses feed rule proposals (N11) | — |
| N13 | Stale facts | `lint` `stale-fact` | only when lint runs (after a merge, or on request) | asks whether a status or planned date still holds | — |

**Known collisions.** These are cross-flow notes; see §4. "Planned" means a SPRINT-04 story now settles it
in its text; nothing here has been seen in a built CLI yet.
1. One red page can surface five ways in a session: the size line, the finish report's largest page, the
   `oversized-page` warning, `status` `tokens.largest` and a `size` archive candidate. All must give one
   notice (N5 with N6). Planned: STORY-007-07 R5 (b) 4 ("once in the session, however many of these show
   it") and the `archive_candidates` bullet (STORY-008-05 R8 (b) = STORY-008-06 R5 (d): "the red-page notice
   above, told once with it").
2. N7 and N8 together, with the files older and a newer version out, become two questions. `upgrade`
   already refreshes the files, so one question would do. Planned: STORY-009-03 R1 ("ask once, whether to
   upgrade: it refreshes the files as well").
3. On a fresh wiki, N3's `wiki ≈0 tokens · 0 pages` came before the setup question. Planned: decision 65
   (STORY-007-07 R1): the size line waits until setup is done.
4. The first `status` of a session can raise N4 and N9–N11 together with N5–N8: a pile-up in one reply.
   Partly planned: STORY-009-03 R1 puts the notices due together in one message after the request, a red
   page and its clean-up candidates first, then the version question. It does not place N9–N11; the order
   list above does (CR "One ordered notice list in status").
5. `status`'s human output (STORY-008-05 R5) ended its candidate list with `tell the user once: …`, an
   instruction to the agent inside CLI output. Planned: one line, `  nothing moves to the archive until the
   user asks for a clean-up`, with `; to raise the page limit instead, run wikeeper config set
   tokens.page.red <n>` when a `size` entry exists.

---

## 4. Cross-flow notes

The designer adds a note here whenever a review spots something outside the story under review: a journey
that ends without a next step, a word used two ways, notices that pile up. Each note proposes a CR and
never blocks the story under review.

| Date | From review of | Note | Proposed CR |
|---|---|---|---|
| 2026-10-18 | seeding the map | §3 collision 1: one red page, up to five signals. WIKI.md should say they are one notice. (Planned in SPRINT-04: STORY-007-07 R5 (b) 4, STORY-008-05 R8 (b).) | One notice per red page |
| 2026-10-18 | seeding the map | §3 collision 2: when the files are older and a newer version is out, ask once, to upgrade. (Planned in SPRINT-04: STORY-009-03 R1.) | One question for upgrade and refresh |
| 2026-10-18 | seeding the map | §3 collision 3: skip the size line until setup is done. (Decided at the plan confirmation, decision 65; STORY-007-07 R1.) | Size line after setup |
| 2026-10-18 | seeding the map | ux.md Appendix A.21–A.23: SETUP.md and ONBOARDING.md name commands to the user, and WIKI.md shows the raw report. | Plain words in setup and reports |
| 2026-10-20 | CR-008 PLAN | The permit hook's reasons (H2) have A.12's shape: a capital letter, a final period and a key in backticks. The `ask` reason shows in Copilot's own prompt and names `ingest.permission` and `.wiki/config.yml`. Left alone so it keeps one shape with `GUARD_REASON`. Proposed: `allowed by the wiki's permission mode (ingest.permission in .wiki/config.yml)` and `the wiki asks for your OK before this command (ingest.permission in .wiki/config.yml)`, with the guard's reason changed the same way. | One shape and plain words for the reasons wikeeper gives harness prompts |
| 2026-10-20 | CR-008 PLAN | The guard prints `unknown --agent "undefined"` when `--agent` is missing, a value nobody gave (ux.md §3.6); the permit hook says `no --agent given` (H5, H3). | Hook fallbacks say "no --agent given" |
| 2026-10-20 | CR-008 PLAN | ux.md §5 and §2.4 name only `hook guard` as following the hook protocol and having no `--json`; `hook permit` does the same (H3: `--json` changes nothing). | Name hook permit in the guide's hook exceptions |
| 2026-10-20 | CR-008 PLAN | §6 has no row for the helpers' models (CR-007). The words SETUP.md step 5 now gives, which the agent used in the run seen at J1 step 11: "a smaller, faster model", "a mid-sized model", "your coding agent's own default model"; CLI/files `ingest.extractor_model`, `ingest.writer_model`, `small`, `medium`, `""`; never say tier, inherit, harness/session default, or the key names unless asked. | Word-list row for helper models |
| 2026-10-20 | CR-008 PLAN | When `ingest.delegate` is `never`, step 5 still asks the user to choose models that nothing will use. | Skip the model question when helpers don't run |
| 2026-10-20 | CR-008 VERIFY | `copilot-trust` (H6) says to start a new session "whenever wikeeper update changes the guard command". In Copilot the permit hook's command changes too, with every permission change: seen as `--permission ask` → `--permission ai` after `update`. Copilot reads the file once per session, so the old mode holds until a new session. Harmless today, because the CLI still asks in `ask`. The copied Codex wording is right for Codex only, whose rules are a separate file. Proposed: `… trust the folder, then start a new session whenever wikeeper update changes this file`. **Applied by CR-009** with that text (seen in its VERIFY, H6). | Copilot trust note covers the permit hook (applied: CR-009) |
| 2026-10-20 | CR-008 VERIFY | The trust step reaches nobody. `init --enforce` prints nothing about it, SETUP.md step 5 fixes only doctor errors, and step 6 passes on only `setup-files` findings. So a Copilot, Codex or Antigravity user is never told to trust the folder, and without that step the hooks don't run. The same holds for Codex and Antigravity today. **Dropped by the human** on 2026-10-20 as out of scope: folder trust is VS Code's own prompt, which the user meets there (CR-009 §0.5). | Tell the user to trust the folder when enforce is on (dropped: out of scope) |
| 2026-10-20 | CR-008 VERIFY | doctor counts the hook file's `version` key as a hook: `copilot: .github/hooks/wikeeper.json (2 hooks, 1 rule)` for a file holding the guard and the permit hook; JSON `state.enforce.agents[].files[].hooks` is `["hooks.PreToolUse[guard:copilot]", "version"]`. An agent passing it on (ux.md §1.7) gives a wrong count. **Applied by CR-009**: seen `(1 hook, 1 rule)` and no `version` in JSON; the manifest keeps the entry, so `enforce-entry-missing` and removal behave as before (H6). | Doctor counts only real hooks (applied: CR-009) |
| 2026-10-20 | CR-008 VERIFY | Because every Copilot hook command ends in `\|\| true` (decided 2026-10-20), a teammate whose wikeeper is missing or old is not blocked (H4), as in Claude Code. The README and the reference's enforce tip still say only that the hook blocks direct edits. Proposed sentence for the reference's Copilot note: "On a machine where wikeeper can't run, the hooks step aside: Copilot asks before each command as usual and page edits aren't blocked, and `wikeeper lint` still reports them." **Applied by CR-009** in the reference's Copilot note, with that sentence; the README and the enforce tip are unchanged (see the CR-009 VERIFY row below). | Say what enforce does on a teammate without wikeeper (applied: CR-009) |
| 2026-10-20 | CR-008 VERIFY | Real-agent run (J1 step 11a, testbed copy). `init --agents claude,copilot --enforce` on a wiki set up with 0.3.0 left the AGENTS.md pointer block at its 0.3.0 text, recorded 0.4.0 in the manifest, and still printed `next: ask your agent to read .wiki/system/SETUP.md`. The `update` in step 5 then rewrote the block, and the agent told the user "The main change is a new instruction to run `wikeeper statusline` at the start of each session" (ux.md §1.2). No instruction tells it to say this. Nothing says how to describe the other files `update` refreshed. | init refreshes the pointer block; plain words for what update refreshed |
| 2026-10-20 | CR-009 VERIFY | With `enforce` on, `config set ingest.permission ask` prints `set ingest.permission to ask (was ai)` (JSON `warnings: []`) and leaves `.claude/settings.json` and `.github/hooks/wikeeper.json` on the old mode (`--permission ai`). doctor then says `ingest permission: ask`, `0 errors, 0 warnings` and does not notice that the files are behind. Only SETUP.md step 4 says to run `update` after a mode change, and WIKI.md doesn't. So the new `copilot-trust` advice ("whenever wikeeper update changes this file") reaches only the setup path. Harmless today, because the CLI still gates `ingest start`. Proposed: `config set` of `ingest.permission` (or `enforce`) ends with `next: run wikeeper update`, and doctor warns when an agent's entries don't match the mode (ux.md §1.3, §3.3). | A permission change says to refresh the agents' settings |
| 2026-10-20 | CR-009 VERIFY | doctor's human findings read `[info] copilot-trust: <message>` with no path, unlike ux.md §3.10 (`<id> <path>: <message>`) and lint, which prints it. JSON has `file`. In the human line, the trust note's "the file" and "this file" name no file. This holds for every doctor check and is not in Appendix A. | Doctor findings show their path (or list it in Appendix A) |
| 2026-10-20 | CR-009 VERIFY | doctor counts Copilot's permit hook as `1 rule` (JSON `rules: ["hooks.PreToolUse[permit:copilot]"]`), as it counts Claude's and Codex's permission rules. But `docs/reference.md` (table: "`PreToolUse` guard + permit hook"), the new step-aside sentence ("the hooks"), H2 and the command `hook permit` all call it a hook (ux.md §1.9). Only a reader comparing doctor with the docs meets this. | One name for Copilot's permit hook in doctor and the docs |
| 2026-10-20 | CR-009 VERIFY | The step-aside sentence is in the reference's Copilot note only, under the label "Copilot in VS Code:", though it holds for Copilot CLI too. The README (line 47) and the reference's enforce tip (line 74) still say only that the hook blocks direct edits. Claude Code's guard (`wikeeper hook guard --agent claude`, no `\|\| true`) is not blocking either when wikeeper can't run (H4). | Say what enforce does without wikeeper, for every agent |

---

## 5. Open UX questions

1. Should `status` give one ordered notice list (a `notices` key), so the agent doesn't rebuild §3's order
   from many keys?
2. Should the finish report have a plain-words form for the user, given that WIKI.md says "show the user
   its report" and the report carries `sha`, `rule … vN` and `permission <mode>` (ux.md A.23)?
3. Is the size line (N3) wanted on every session start, or only when it changed since the last session?
