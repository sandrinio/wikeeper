# SPRINT-04 — Design review of the drafts (DRAFTS mode)

role: designer · 2026-10-18 · 16 story drafts (STORY-007-01 … 007-07, 008-01 … 008-06, 009-01 … 009-03) against
`docs/ux.md` v1 and `docs/ux-map.md`. Context: EPIC-007/008/009, the sprint plan, `plans/gate1-decisions.md` (61
decisions, 19 re-scopes). No transcripts and no ux-map edits.

**Result: NEEDS-CHANGES.** 23 findings the planner can fix, 2 for the human. 9 cross-flow notes.

"Planner fixes" means the change is story wording only: it reverses none of the 61 decisions and changes none of the 19
re-scope rows. The red tests involved are new ones that QA-Red will write from the Gherkin. Each planner fix lists every
place the same text appears, so one edit pass catches them all. The places in `docs/ux-map.md` are updated by the
designer at VERIFY, and are listed only for reference.

---

## 1. Findings: planner fixes

### Hints and line shapes (CLI output)

**P1 — [ux.md §3.3] The version hints quote the command.** Inherited from EPIC-009 §2 and K14.
- Stories: 009-01 R9 and the K14 `availableMessage` text (used in R6, R8 and R10); 009-02 R10; 009-03 R1 (quotes K14).
- Now:
  - `wikeeper 0.4.1 is available (installed 0.4.0): run "wikeeper upgrade"`
  - `this project's wikeeper files are from 0.3.0 (installed 0.4.0): run "wikeeper update"`
  - `this project was updated by wikeeper 0.4.0 (installed 0.3.0): run "wikeeper upgrade"`
  - `other projects that use this wikeeper: run "wikeeper update" in each ("wikeeper status" there says so)`
- Fix:
  - `wikeeper 0.4.1 is available (installed 0.4.0): run wikeeper upgrade`
  - `this project's wikeeper files are from 0.3.0 (installed 0.4.0): run wikeeper update`
  - `this project was updated by wikeeper 0.4.0 (installed 0.3.0): run wikeeper upgrade`
  - `other projects that use this wikeeper: run wikeeper update in each (wikeeper status there says so)`
- Same text in:
  - 009-01: R9 `:125–126`; Gherkin S1 `:242`, `:246`, `:247`; S4 rows `:299–301`; §2.2 `:318`.
  - 009-02: R10 `:142`.
  - 009-03: R1 `:69` (the quoted warning); Gherkin S2 `:193` ("a line ending in 'run "wikeeper update"'").
  - EPIC-009: §2 `:106`, `:108`, `:109`; Gherkin `:199`, `:217`.
  - plans/decomposition-epic-009.md: K14 comments `:41–44`.
  - ux-map: J2a, J7 rows 1, 2, 6 and 7.
- Doctor's `fix: run wikeeper upgrade` / `run wikeeper update` (009-01 R10) is already bare. After the fix, all of
  them agree.

**P2 — [ux.md §3.4] The version lines in `status` have no label.**
- Story: 009-01 R8. Every other `status` line reads `label: value`.
- Now: two bare lines, `availableMessage(…)` and the `versionMismatch` message.
- Fix: put `version: ` in front of each, e.g. `version: wikeeper 0.4.1 is available (installed 0.4.0): run wikeeper
  upgrade`. The text after the label stays K14's, so the agent still recognises it (§4.4).
- Same text in:
  - 009-01: Gherkin S4 `lines` column (3 rows); §2.2 `:318`.
  - 009-03: R1 ("`wikeeper status` prints the same line") becomes "prints the same text on its `version:` line"; its
    Gherkin S2 `:193` still holds, because it checks "ending in".
  - ux-map: J4 row "then …", J7 rows 6 and 7.

**P3 — [ux.md §3.9] The status line puts the level mark before its figure.** Inherited from EPIC-007 §2.
- Story: 007-06 R3. A single line is not a list of pages, so the mark follows the figure.
- Now: `wiki ≈66k tokens · 43 pages · largest page 🟡 ≈6.3k`, with "`levelMark(…)` followed by `formatTokens(…)`".
- Fix: `wiki ≈66k tokens · 43 pages · largest page ≈6.3k 🟡`, with "`formatTokens(largest.tokens)` followed by a space
  and `levelMark(…)`".
- Same text in:
  - 007-06: R3 `:66–67`; Gherkin S1 row 1 `:180` becomes `" tokens · 3 pages · largest page " + formatTokens(a.md) +
    " 🟡\n"`.
  - 007-07: R5 (b) 2 `:85`; Gherkin "session (R5)" phrase `:199`.
  - EPIC-007: §2 `:128`.
  - plans/decomposition.md: `:85`.
  - ux-map: J4 row 2.

**P4 — [ux.md §3.4; DRAFTS "one fact, one shape"] The wiki total and the archive size are printed three ways.**
- Stories: 007-05 R2, 007-06 R3, 008-05 R5.
- Now:
  - 007-06: `wiki ≈66k tokens · 43 pages`
  - 007-05 status: `tokens: wiki ≈66k in 43 pages · index.md ≈5.1k`
  - 008-05: `archive: 3 pages · ≈12k tokens` (count first)
- Fix: figure first, then the count, separated by ` · `. The finish report's `wiki ≈66k tokens (+1.2k) · …` already
  fits.
  - 007-05: `tokens: wiki ≈66k · 43 pages · index.md ≈5.1k`
  - 008-05: `archive: ≈12k tokens · 3 pages` (`plural(n, "page")`)
- Same text in:
  - 007-05: R2 `:73`; Gherkin S1 `:172` (`ending with "in 6 pages · index.md ≈"` becomes `"· 6 pages · index.md ≈"`);
    S5 row 1 `:222` becomes `"tokens: wiki ≈0 · 0 pages · index.md ≈0"`.
  - 008-05: R5 `:77`; Gherkin S1 row 2 `:168` becomes `archive: ≈40 tokens · 1 page`; S3 `:195` the same.
  - EPIC-007: `:92` (prose).
  - ux-map: J4 row "then …", J6 row 4.

**P5 — [ux.md §3.9; DRAFTS] One page and its size get two shapes in the same `status` output.**
- Stories: 007-05 R2, 008-05 R5.
- Now:
  - 007-05: `    🔴 ≈12k projects/atlas.md`
  - 008-05: `  projects/atlas.md ≈12k tokens 🔴 (tokens.page.red is 10k)`
- Fix: one shape, `<path> ≈<n> <mark>`, the shape the finish report already uses (`largest page projects/atlas.md ≈6.3k
  🟡`). Path first, because the candidate list mixes size rows and final-status rows sorted by path.
  - 007-05: `    projects/atlas.md ≈12k 🔴`
  - 008-05: `  projects/atlas.md ≈12k 🔴 (tokens.page.red is 10k)`
- Same text in:
  - 007-05: R2 `:75`; Gherkin S1 `:172` ("a trimmed line starting with "🔴 ≈" and ending with " a.md"" becomes "starting
    with "a.md ≈" and ending with " 🔴"").
  - 008-05: R5 `:79`; Gherkin S1 row 3 `:169` and S3 `:196` become `projects/atlas.md ≈100 🔴 (tokens.page.red is 100)`.
  - ux.md §3.9: its "may lead each row" example is then unused (cross-flow note C4).
  - ux-map: J4.

**P6 — [ux.md §3.8; DRAFTS] A limit is printed two ways.**
- Stories: 007-03 R4 (`sizeLimitText`), used by 007-04 R4; 007-05 R2 and R7; 008-05 R5.
- Now:
  - 007-03: `at or above the approval limit tokens.source.yellow (20000)`
  - 007-05: `tokens.page.red is 10k` and `page 4k/10k`
- Fix:
  - Move `formatLimit(n)` (007-05 §3.3: `4000` → `4k`, `1500` → `1.5k`, `1234` → `1234`) into K1, `src/core/tokens.ts`
    (007-01, additive).
  - `sizeLimitText` returns `at or above the approval limit tokens.source.<confirm_at> (<formatLimit(limit)>)`:
    `tokens.source.yellow (20k)`.
  - `details.size.limit` stays a number (§4.9). Lines that echo the file keep stored numbers: `formatConfigIssue` (§3.4)
    and `config get/set/unset`.
  - EPIC-007's own Gherkin `:243` already expects "limit 20k".
- Same text in:
  - 007-01: §3.3 K1 block (add `formatLimit`), task list.
  - 007-03: R4 `:75`; Gherkin S5 `:222` and `:223` (`(1000)` becomes `(1k)`); §2.2 `:229` (`(20000)` becomes `(20k)`);
    §3.3 comment `:307`.
  - 007-04: Gherkin S2 row 1 `:163` (`(1000).` becomes `(1k).`).
  - 007-05: R2, R7, §3.2 "Status" and §3.3. `formatLimit` is imported from `src/core/tokens.ts`; `src/lint/size.ts` no
    longer exports it.
  - 008-05: R5 `:79` (`formatLimit` from `src/core/tokens.ts`).
  - ux-map: J2c row 2.

**P7 — [ux.md §3.5] A count before a noun without its plural.**
- Stories:
  - 008-02 R9: "with no plural forms, as EPIC-008 §5 writes it".
  - 008-04 R9 and 008-05 R5: written as `page(s)` and `check(s)`.
- Gate 1 decision 27 decides when the line shows (N > 0 or M > 0), not its plural, so this is the planner's.
- Now:
  - `   archived 1 fact lines · 0 pages`, `archived 3 fact lines · 1 pages`, `archived 0 fact lines · 1 pages`
  - `checked <n> page(s) and <m> archived page(s) with <k> check(s)`
  - `archive: <n> page(s) · …`
- Fix:
  - `archived <plural(facts, "fact line")> · <plural(pages, "page")>`: `archived 1 fact line · 0 pages`, `archived 3
    fact lines · 1 page`, `archived 0 fact lines · 1 page`. Drop "with no plural forms".
  - Write the other two as `plural(n, "page")`, `plural(m, "archived page")` and `plural(k, "check")`, as
    `src/commands/lint.ts:48` already does.
- Same text in:
  - 008-02: R9 `:91`; Gherkin S5 `:235–237`.
  - 008-06: Gherkin S2 `:203–204` (`archived 1 fact line · 0 pages`, `archived 2 fact lines · 1 page`); §1.5 risk
    `:139`.
  - EPIC-008: Gherkin `:204`.
  - 008-04: R9 `:81`.
  - 008-05: R5 `:77`.
  - The generic `archived N fact lines · M pages` in 008-06 R1, R10 and in gate decision 27 can stay.

**P8 — [ux.md §3.2, §3.3] The `statusline --install` messages are capitalised sentences, with backticks around a
command and some with no next step.**
- Story: 007-06 R8, R9, R10, R12, R13.
- Now:
  - R9 refusal:

    ```
    a status line is already set in ~/.claude/settings.json; nothing was changed.
    To show the wiki size too, make that status line command also print what `<cmd>` prints for the same input. In a shell script:
    ```

    then the snippet, then `Claude Code shows each printed line as its own row.`
  - R13: `Claude Code shows it at its next status line update. To remove it, delete "statusLine" from
    .claude/settings.local.json.`
  - R8 (the npx warning), R10 (`already installed`) and R12 (the exclude note, the no-git warning) are not pinned.
- Fix (exact text):
  - R9, first line:

    ```
    a status line is already set in ~/.claude/settings.json, so nothing was changed: make that command also print what wikeeper statusline prints for the same input (each printed line is its own row), for example in a shell script:
    ```

    then the three snippet lines, each indented two spaces (`  input=$(cat)`, `  … your current status line, reading
    "$input" …`, `  printf '%s' "$input" | <cmd>`). Drop the last sentence.
  - R13, second line: `  it shows from Claude Code's next status line update; to remove it, delete "statusLine" from
    .claude/settings.local.json`
  - R10: `the wiki status line is already installed in .claude/settings.local.json`
  - R12, exclude: `  added /.claude/settings.local.json to .git/info/exclude, so git ignores it`
  - R12, no git: `could not check .claude/settings.local.json against git: keep it out of any commit, it is personal`
  - R8, npx: `the status line runs npx on every redraw, which is slow: install wikeeper with npm i -g wikeeper or as a dev
    dependency, then rerun wikeeper statusline --install`
- Same text in:
  - 007-06: Gherkin S4 `:217` (the `  printf …` line holds); S3 row 4 `:208` ("says the status line is already
    installed" holds).
  - 007-07: R5 (b) 2 (see P16).
  - ux-map: none yet.

**P9 — [ux.md §3.2, §3.3; A.14] The `upgrade` failure messages are multi-sentence and end with periods, and one hint
says "use".**
- Story: 009-02 R6 (npx outside a wiki), R8.
- Now:
  - `could not reach the npm registry (<cause>); nothing was changed. Try again later.`
  - the common tail `To upgrade by hand: <command>, then run <then> in this project.`
  - `npm was not found; nothing was changed.`
  - `npm install failed (exit <code>); nothing was changed:` followed by the npm lines
  - `wikeeper runs from <dir>, <how>, which wikeeper upgrade does not handle; nothing was run.`
  - `wikeeper <v> is installed, but its update failed:` followed by the lines
  - `npx runs the version you name: use npx -y wikeeper@<v>; there is no wiki project here to update`
- Fix (first line `<what is wrong>: <next step>`, no final period; tool output as detail lines indented two spaces,
  §3.4):
  - `could not reach the npm registry (ENOTFOUND); nothing was changed: try again later`
  - `npm was not found; nothing was changed: to upgrade by hand, run npm install -g wikeeper@0.4.1, then run wikeeper
    update in this project`
  - `npm install failed (exit 243); nothing was changed: to upgrade by hand, run sudo npm install -g wikeeper@0.4.1,
    then run wikeeper update in this project`, then `  npm error code EACCES` and the other npm lines. On win32 the
    hand step reads `run npm install -g wikeeper@0.4.1 in a terminal run as administrator`.
  - `wikeeper runs from <dir>, <how>, which wikeeper upgrade does not handle; nothing was run: to upgrade by hand, run
    pnpm add -g wikeeper@0.4.1, then run wikeeper update in this project`. For a checkout: `…; nothing was run: update
    that folder yourself, then run wikeeper update in this project`.
  - `wikeeper 0.4.1 is installed, but its update failed: run wikeeper update in this project`, then the child's lines,
    indented.
  - `nothing to upgrade here: npx runs the version you name, so run npx -y wikeeper@0.4.1; there is no wiki project
    here to update`
- Same text in: 009-02 R8 `:123–124` and the bullets after it; Gherkin S4 (every "contains" fragment still holds);
  EPIC-009 Gherkin `:45` ("shows npm's error and "sudo npm install -g …""); ux-map J7 row 3.

**P10 — [ux.md §4.6] `reason: "final-status"` is kebab-case.** Inherited from EPIC-008 K13.
- Story: 008-05 R2. `reason` is a code, so multi-word values are snake_case. Kebab-case is only for check, kind and
  section ids.
- Now: `reason: "size" | "final-status"`.
- Fix: `reason: "size" | "final_status"`.
- Same text in:
  - 008-05: R2 `:72–73`; R8 (b) `:94`; Gherkin S2 rows `:182`, `:185`; frontmatter/context `:12`; `:109`, `:117`,
    `:133`, `:282`, `:311`, `:327`.
  - 008-06: R5 (d) `:87`; R10 `:102`; Gherkin "telling (R5)" `:183`; S4 `:226`; `:272`, `:309`.
  - EPIC-008: `:191`, `:217`.
  - plans: consistency-audit `:13`; decomposition `:53`, `:94`.
  - ux-map: §3 N6.
  - Gate 1 decision 36 says "Final-status candidates" in prose only. It needs no change.

**P11 — [ux.md §3.3, §1.1, §1.4] `status` tells the agent "tell the user once:".**
- Story: 008-05 R5. The once-per-session rule belongs in WIKI.md, and 008-05 R8 (b) already says it. A person at a
  terminal reads this line too (§1.1).
- Now:
  - `  tell the user once: nothing moves to the archive until they ask for a clean-up`
  - `  or they raise the page limit: wikeeper config set tokens.page.red <n>`
- Fix: one line. `  nothing moves to the archive until the user asks for a clean-up; to raise the page limit instead,
  run wikeeper config set tokens.page.red <n>`. The part after `; ` only when a size entry exists.
- Same text in: 008-05 R5 `:81–82`; Gherkin S3 `:198–199`; ux-map §3 collision 5.

**P12 — [ux.md §3.6] An unknown config key is not quoted.**
- Story: 007-02 R3. The key is a value the agent gave, as in shipped `unknown profile "x"` (`src/commands/init.ts:74`).
- Now: `unknown config key tokens.pages.red; keys under tokens: …` and `unknown config key colour; known keys: …`.
- Fix: `unknown config key "tokens.pages.red"; keys under tokens: …` and `unknown config key "colour"; known keys: …`.
- Same text in: 007-02 R3 `:70`; Gherkin S4 rows `:216`, `:218`.

**P13 — [ux.md §3.1] The `config set` and `config unset` results don't start with a past-tense verb.**
- Story: 007-02 R6, R7.
- Now: `tokens.source.yellow: 30000 (was 20000)` and `tokens.source.yellow: back to the default 20000 (was 30000)`.
- Fix: `set tokens.source.yellow to 30000 (was 20000)` and `reset tokens.source.yellow to the default 20000 (was
  30000)`. The two no-change lines stay as they are.
- Same text in: 007-02 R6 `:93`, R7 `:98`; ux-map J5 rows 2 and 5.

**P14 — [ux.md §1.3] Two warnings name no next step.**
- 007-02 R9:
  - Now: `enforce takes effect after wikeeper update (it adds or removes the enforce entries)`.
  - Fix: `enforce takes effect once its entries are rewritten: run wikeeper update`.
  - Same text in: Gherkin S1 row "enforce" `:170`.
- 008-01 R6:
  - Now: `the snapshot of <id> was taken by an older wikeeper: archive/ was not restored`.
  - Fix: `the snapshot of <id> was taken by an older wikeeper, so archive/ was not restored: run wikeeper lint to find
    archive files this ingest left`.
  - Same text in: Gherkin S4 row 2 `:219`, whose "contains" still holds.

### What the agent says (instructions)

**P15 — [ux.md §1.2, §6.3] The red-page instruction has the agent tell the user a command.**
- Stories: 007-07 R5 (b) 4; 008-06 R5 (a) edits it.
- Now:
  - 007-07: "and say they can raise the limit with `wikeeper config set tokens.page.red <n>`"
  - 008-06: "and offer both choices: raise the limit with `wikeeper config set tokens.page.red <n>`, or ask for a
    clean-up …"
- Fix:
  - 007-07: "and offer to raise the page limit for them; on a yes, run `wikeeper config set tokens.page.red <n>`"
  - 008-06 replaces that clause with: "and offer both choices in plain words: you raise the page limit for them (on a
    yes, `wikeeper config set tokens.page.red <n>`), or they ask for a clean-up, which moves replaced and finished facts
    to `archive/` and keeps them (section "Write phase")"
- Same text in:
  - 007-07: Gherkin "red page (R5)" `:201` (all three phrases still hold).
  - 008-06: R5 (a) quotes 007-07's old clause as its "from" text, so update it to the new one; Gherkin "telling (R5)"
    `:183` ("or ask for a clean-up" becomes "or they ask for a clean-up").
  - EPIC-008: `:122` (an epic summary; optional).

**P16 — [ux.md §1.2] "Show the user what it printed" for the status-line refusal.**
- Story: 007-07 R5 (b) 2.
- The refusal carries file paths and a shell snippet. §1.2 allows only the one line the user adds to their own
  status-line script, in a code span, with the reason.
- Now: "It never replaces a status line that is already set; when it refuses, show the user what it printed."
- Fix: "It never replaces a status line that is already set. When it refuses, tell the user which settings file
  already has a status line, and show them, in a code span, the one line from the refusal they can add to that status
  line's script (`printf '%s' "$input" | …`); you never edit their status line."
- Same text in: 007-07 Gherkin "session (R5)" `:199` ("never replaces" holds); §2.2 last check `:267` ("it shows the
  refusal" becomes "it says so and shows the line to add").

**P17 — [ux.md §1.2] "Show the user its message" for a failed upgrade.**
- Story: 009-03 R1.
- The message holds codes, npm output and "nothing was changed". Also, for `update_failed` the hand command is
  `wikeeper update`, which the agent can run itself.
- Now: "When `wikeeper upgrade` fails, show the user its message: it names the command to run by hand, and a command
  that starts with `sudo` is for the user to run, never you."
- Fix:

  > When `wikeeper upgrade` fails, tell the user in plain words what failed and whether anything was installed. If
  > `error.details.command` starts with `sudo` or uses pnpm, yarn or bun, show the user that one command in a code
  > span and say why you don't run it; when they say it is done, run `error.details.then` if it is set (their reply is
  > the yes for it). After `update_failed`, offer to run `wikeeper update` again; otherwise offer to try again later.

  This keeps R1's checks: no "section", and no "wikeeper" before a lowercase word that is not a command.
- Same text in: 009-03 Gherkin "failure (R1)" `:181`. Its phrases become "tell the user in plain words", "starts with
  `sudo`", "`error.details.command`".

**P18 — [ux.md §1.2, §1.3] The session-start line shows the error form verbatim.**
- Story: 007-07 R1, with 007-06 R5.
- `wiki size unavailable (<code>): run wikeeper doctor` would reach the user, with its code and command.
- Now: line 4 sentence " At session start, show the user the line `wikeeper statusline` prints." (180 characters).
- Fix:
  - Line 4 sentence: " At session start, show the user the size line `wikeeper statusline` prints, not an error." The line is 199
    characters, under the 200 cap.
  - R5 (b) 2 gains: "If it prints `wiki size unavailable (…)` instead, do not show that line: run `wikeeper doctor` and tell the
    user in plain words what is wrong." R13 then gains `wikeeper doctor`.
  - Re-scope row (g) compares line 4 "as R1 sets it", so it still applies. If H2 is taken, H2's sentence replaces this
    one.
- Same text in:
  - 007-07: R1 `:73` (and its "(180 characters)"); Gherkin "session (R1)" `:190` (phrases hold); R9, the
    SHIPPED_BLOCKS entry, which equals the new template; R11 (a), the architecture.md §6.5 quote.
  - ux-map: J4 row 2.

**P19 — [ux.md §6.3, §6.1 "Helper agents"] A sub-agent name in what the agent offers.**
- Story: 007-07 R2 (c).
- Now: "offer two ways to keep it out of your own context. A `wiki-extractor` reads it and hands back only the facts
  (section "Delegation"), or you read only the parts …"
- Fix: "offer two ways to keep it out of your own context, in plain words: a helper reads it and hands back only the
  facts (the `wiki-extractor` sub-agent, section "Delegation"; never name it to the user), or you read only the parts
  the user picks and tell them the rest is not captured."
- Same text in: 007-07 Gherkin "red source (R2)" `:193` (all four phrases hold); ux-map J2c row 2b already says "a
  helper".

**P20 — [ux.md §6.2 "archive"; A.15] After EPIC-008 the README uses "archive" for two things.**
- Story: 008-06 R8 (g). It adds archive text to README "How It Works" but leaves item 2 (`README.md:69`). That item
  says "archives the immutable original in `.wiki/raw/`".
- Fix: 008-06 R8 (g) also changes item 2 to "keeps the immutable original in `.wiki/raw/`". This is A.15's fix.
- Same text in: 008-06 Gherkin "README (R8)" (its phrases hold).

### Notices (§1.4, ux-map §3)

**P21 — [ux.md §1.4] One red page can be told twice: once as a red page, and again as a `size` candidate.**
- Stories: 007-07 R5 (b) 4 lists four signals; 008-05 R8 (b), which equals 008-06 R5 (d), adds the fifth as its own
  "tell the user about them once".
- Fix:
  - 007-07 R5 (b) 4: after "tell the user once in the session" add ", however many of these show it".
  - 008-05 R8 (b) and 008-06 R5 (d): "for `size`, the two choices above" becomes "for `size`, the red-page notice
    above, told once with it".
- Same text in: 008-06 R5 (d) `:87`, which must stay byte-equal to 008-05 R8 (b) `:94`; 008-06 Gherkin "status lines
  (R5)" (its phrases hold).

**P22 — [ux.md §1.4] Two questions where one would do, and no order for notices due at once.**
- Story: 009-03 R1. It is the last story to edit WIKI.md "Lint and status".
- Problem:
  - With the files older and a newer version out, R1 has the agent ask to upgrade and also to update, though
    `upgrade` already runs `update` (009-02 R6).
  - No story tells the agent to put notices due together into one message, in ux-map §3 order.
- Fix: add two sentences to R1's paragraph, after "unless the user asks.":
  - "When a newer version is out and this project's files are older too, ask once, whether to upgrade: it refreshes
    the files as well."
  - "When several of these are due at once, tell them in one message after the user's request is done: a red page and
    its clean-up candidates first, then the version question."
  - Neither sentence uses "section" or puts "wikeeper" before a lowercase word. Gate 1 decision 58 (one paragraph)
    holds.
- Same text in: 009-03 R1 `:69`; add a phrase row to its Gherkin S1 "asking (R1)".

### Context text

**P23 — [ux.md §4.5, §5] EPIC-007 §4 still calls `cause` `reason`.**
- 007-03 R6 already explains the change and uses `cause`, so no story inherits the error.
- Now: EPIC-007 `:223` "the `needs_approval` details add `reason: "size"` and `limit`"; Gherkin `:243` "reason
  "size"".
- Fix: "add `cause: "permission" | "size" | "both"` and `size: { tokens, rough, level, limit, confirm_at }`"; Gherkin
  "cause "size"".

---

## 2. Findings: human decides

**H1 — [ux.md §4.5, A.9; §1.3] `E_CONFIG_SYNTAX` reaches the output of two new commands.**
- Stories: 007-02 R1 (exit 1 `E_CONFIG_SYNTAX` from `config get/set/unset`); 007-06 R5, Gherkin S1 row 7 (`wiki size
  unavailable (E_CONFIG_SYNTAX): run wikeeper doctor`).
- The message `config.yml syntax error at line N: …` also has no next step.
- Why it isn't the planner's:
  - Renaming the code only in the new commands would give one condition two codes (§4.5).
  - Renaming it at the source (`src/core/config.ts:185`, `:225`, and the match at `src/commands/doctor.ts:151`)
    changes `test/config.red.node.test.ts:113`, which pins `E_CONFIG_SYNTAX`. That needs a 20th re-scope row.
  - Gate 1 decision 18 fixed the status-line error form as `(<code>)`.
- Recommendation: add the re-scope to 007-02, which already moves `setConfigValue`'s throw into `editConfig`.
  - The code becomes `config_syntax` and the message gains `: fix the YAML syntax in .wiki/config.yml`.
  - 007-06 S1 row 7 then expects `(config_syntax)`, and decision 18's form stays.
- Alternative: accept A.9 for SPRINT-04 and file CR "One snake_case code for a config syntax error".

**H2 — [ux.md §1.4; ux-map §3 order N1, N2 before N3] On a fresh wiki the size line comes before the setup question.**
- Story: 007-07 R1. Line 4 is above line 5, the setup line.
- Problem: the first reply opens with `wiki ≈0 tokens · 0 pages` and only then starts setup.
- Why it isn't the planner's: skipping the line until setup is done narrows EPIC-007 §2 ("Show the one-line gauge at
  the start of every session"), and the sprint's behavioural check quotes it.
- Recommendation: line 4 sentence " Once set up, open each session with the size `wikeeper statusline` prints, not an
  error." It is 198 characters. It also covers P18, and replaces P18's sentence. The 007-07 Gherkin phrase "At session
  start" becomes "open each session".
- Alternative: keep P18's sentence and accept the zero line before setup. That also settles ux-map §5 question 3 for
  now.

---

## 3. The notices this sprint adds

| ux-map §3 | Added by | When it appears | Collides with | Settled by |
|---|---|---|---|---|
| N3 size line | 007-06 R3 (line), 007-07 R1 (pointer block) | first reply of every session | N1/N2 on a fresh wiki; N5 when the largest page is 🔴 (the same page in the line and the notice); the error form | H2, P18; N5 goes in the same reply |
| N5 red page | 007-05 R3, R5, R8 (report line, `oversized-page` warning), R1 (`tokens.largest`); 007-06 R3; 007-07 R5 (b) 4; 008-06 R5 (a) | the first time a 🔴 page is seen in the session | N3; N6 `size` (the same pages); the finish warning | P21, P15 |
| N6 archive candidates | 008-05 R2, R5, R8 (b) = 008-06 R5 (d) | the first `status` of the session | N5 (`size`); `status` itself saying "tell the user once" | P21, P11 |
| N7 newer version | 009-01 R6 (plan and start warning), R8 (`status`), R10 (doctor); 009-03 R1 | every plan, start, status and doctor while a newer version is saved | itself across commands (told once by 009-03 R1); N8 | P22, P1 |
| N8 files from another version | 009-01 R8, R9, R10; 009-03 R1 | every status and doctor while the manifest differs | N7: two questions where `upgrade` already refreshes | P22 |
| (question) size approval | 007-03 R5, R6; 007-04 R4, R7; 007-07 R2 (b), (d), Q7 | `ingest start` exit 3 `size`/`both`; the plan; a scanned PDF before reading | ask-mode approval (one question, `both`); a second ask after the plan (defined, 007-04 R7); scanned PDF then `--approved` rerun (one yes) | already one question each |
| (offer) 🔴 source | 007-07 R2 (c) | with a 🔴 size approval | goes in the approval message | P19 |

**Proposed session-start order** (ux-map §3, with the merges above):
0. **N3**, the size line: at the top of the first reply, and only once setup is done (H2).
1. **N1, N2**: when due, they take the session; every other notice waits until setup is done.
2. **N4**: another document is being added. It comes before the request, because it blocks an ingest.
3. The answer to the user's request.
4. **N5 with N6 `size`**: one red-page notice per page.
5. **N6 `final_status`**.
6. **N7 with N8**: one version question.
7. **N9, N10, N11**: the follow-ups already in WIKI.md.
8. One closing question.

**Exact message.** The first request of a session is "Here are the notes from Monday's atlas meeting." (ai mode, set
up). The size line shows a red largest page. `status` shows: atlas red; beta shipped and quiet since August; 0.4.1 out;
files from 0.3.0; one unfinished document. The agent's first reply:

> wiki ≈71k tokens · 43 pages · largest page ≈12k 🔴
>
> Added Monday's atlas notes: one new page, three updated.
>
> A few things while we're here:
> - The atlas page is about 12k tokens, over the 10k page limit. I can raise the limit for you, or do a clean-up that
>   moves replaced and finished facts to the archive, where they're kept. Or we leave it as it is.
> - Beta shipped in August and nothing has come in about it since. I could move its page to the archive, or leave it.
> - A newer version of wikeeper is out (0.4.1; you have 0.4.0), and this project's wiki files are from 0.3.0. Shall I
>   upgrade? That refreshes this project's files too.
> - There's a document I started adding and didn't finish, the Q4 plan. Shall I finish it?
>
> Which of these would you like, if any?

None of these notices comes up again in the session unless the user asks. A "no" to any one holds (§1.4, §1.5).

---

## 4. The 14 candidate conflicts

| # | Candidate | Verdict |
|---|---|---|
| 1 | Command quoting in hints | Confirmed: 009-01, 009-02 R10, 009-03 R1, EPIC-009 (P1); 007-06 R9 backticks (P8). Rejected for 008-03 R1: `index.md` is a markdown file outside §3's scope (note C5). |
| 2 | Level-mark position | 007-03, 007-04 `≈1.8k tokens 🟡` and the 007-05 report `≈6.3k 🟡` are compliant. Confirmed: 007-06 (P3), and 007-05 vs 008-05 (P5). |
| 3 | The wiki total in three shapes | Confirmed, with 008-05's archive size as a fourth (P4). |
| 4 | Limits in two forms | Confirmed (P6). Config echo lines keep stored numbers. |
| 5 | `archived 1 fact lines · 0 pages` | Confirmed (P7). |
| 6 | The agent naming commands | Confirmed in all four places: 007-07 R5 (b) 4 and 008-06 R5 (a) (P15), 009-03 R1 (P17), 007-07 R1 (P18, H2). Plus 007-07 R5 (b) 2 (P16). |
| 7 | `E_CONFIG_SYNTAX` in new output | Confirmed, human decides (H1). |
| 8 | Capitalised messages with final periods | Confirmed: 007-06 R9 and R13 (P8), 009-02 R8 (P9). The new reason text in 007-03 R6 and 007-04 R4 extends A.12's existing line and field in its own shape, so it is a note (C2), not a finding. |
| 9 | `final-status` | Confirmed (P10). |
| 10 | An agent instruction in CLI output | Confirmed (P11). |
| 11 | A sub-agent name | Confirmed (P19). |
| 12 | Notice collisions | Confirmed: P21, P22, H2. One order is in §3 above. |
| 13 | 3999 `≈4k 🟢` vs 4000 `≈4k 🟡`; 9999 `≈10k 🟡` | Rejected as a finding: the level comes from the estimate and `≈` marks the rounding, so no rule breaks. Note C1. |
| 14 | EPIC-007 §4 `reason` vs 007-03 `cause` | Confirmed, epic text only (P23). |

---

## 5. Cross-flow notes

| # | Note | Proposed CR |
|---|---|---|
| C1 | A figure that rounds onto a limit (`≈10k 🟡` with red at 10k, `≈4k 🟢` with yellow at 4k) reads as a contradiction. The agent may repeat it. | Figures next to a limit never round onto it |
| C2 | 007-03 R6 and 007-04 R4 add reason text in A.12's shape: a final period, and "It is also …" / "Its estimate is …" as second sentences. Fix every permission reason together. | Permission reasons in the refusal shape (A.12) |
| C3 | "not counted in tokens" (`ingest start`) and "not estimated" (`ingest plan`) name the same gap. Both were approved by Gate 1 decision 6. | One phrase for a size the CLI could not measure |
| C4 | After P5 nothing uses ux.md §3.9's "a list of pages may lead each row with it". §3.8 should say that limits print through `formatLimit` and config echoes print stored numbers. | Guide: one shape for a page and its size; limit forms |
| C5 | 008-03 R1's `index.md` line uses ` — ` and a command in backticks. That is fine for markdown, but unlike §3. | index.md lines follow the hint rules (only if wanted) |
| C6 | 007-07 R2 (b) says "show … the limit from `error.details.size`" without "in words". The agent may read out `tokens.source.yellow` (§6.1 "A token limit"). | Say limits as "the document limit, 20k" |
| C7 | WIKI.md step 9 still says "show the user its report" (A.23). After 007-05 the report also carries `lint [warn] oversized-page …` lines. | Plain words in setup and reports (already in ux-map §4) |
| C8 | The version warning arrives inside `ingest start`'s output, mid-request. ux-map J7 row 1 wants it after the request. P22's second sentence covers WIKI.md; a `notices` key in `status` would remove the guesswork (ux-map §5 question 1). | One ordered notice list in status |
| C9 | ux-map rows to refresh at VERIFY: J2a, J2c, J4, J5 rows 2 and 5, J6 rows 3 and 4, J7 rows 1–7, and §3 N3, N5–N8. They quote the shapes P1–P13 change. | none (designer task) |

## Script Incidents

None.
