# SPRINT-04 — Design review of the drafts, round 2 (DRAFTS mode)

role: designer · 2026-10-18 · round 2 of 2 · the 16 stories, EPIC-007/008/009, the sprint plan and `plans/waves.json`
after the 21 planner fixes and the plan confirmation (decisions 62–65), against `docs/ux.md` v1 and `docs/ux-map.md`.
Round 1: `design/SPRINT-04-design-drafts.md`.

**Result: NEEDS-CHANGES, small.** All 23 round-1 findings and both human decisions landed where they were meant to.
4 planner fixes remain (2 come from round-1 fix text, 1 is a cross-story test break, 1 was missed in round 1) and 1
needs the human (the H1 follow-up, which adds a file to STORY-007-02). `docs/ux-map.md` is refreshed to the planned
shapes, as asked.

---

## 1. Round-1 findings: status

Every place listed in round 1 was checked, by reading and by grep across `pending-sync/`, `plans/` and `docs/`
(no `run "wikeeper …"` hint, no `🟡 ≈` / `🔴 ≈` prefix mark, no `(20000)` limit and no `final-status` is left, apart
from decision 63's own wording).

| # | Status | Checked in |
|---|---|---|
| P1 | applied | 009-01 R9, K14 text, S1, S4 rows, §2.2; 009-02 R10; 009-03 R1, S2; EPIC-009 §2 and Gherkin; decomposition-epic-009 K14 comments |
| P2 | applied | 009-01 R8, S4, §2.2; 009-03 R1 ("its `version:` line") |
| P3 | applied | 007-06 R3, S1 row 1; 007-07 R5 (b) 2 and "session (R5)"; EPIC-007 §2; decomposition K8 |
| P4 | applied | 007-05 R2, S1, S5 row 1; 008-05 R5, S1 row 2, S3 |
| P5 | applied | 007-05 R2, S1; 008-05 R5, S1 row 3, S3 |
| P6 | applied (decision 62) | 007-01 R2, S2, K1 block, tasks, §4.1; 007-03 R4, S5, §2.2, §3.3; 007-04 S2 row 1; 007-05 R2, R7, §3.2, §3.3; 008-05 R5, §3.1–§3.3; decomposition K1, K7; `formatLimit` is in contract C1's frozen exports |
| P7 | applied | 008-02 R9, S5; 008-04 R9, its Gherkin, §3.2; 008-05 R5; 008-06 S2, §1.5; EPIC-008 Gherkin |
| P8 | applied | 007-06 R8, R9, R10, R12, R13; S3 row 4 and S4 still hold |
| P9 | applied | 009-02 R6 (npx outside a wiki), R8 (all five codes); S4 fragments and EPIC-009's Gherkin still hold |
| P10 | applied (decision 63) | 008-05, 008-06, EPIC-008, consistency-audit, decomposition; ux-map N6 updated now |
| P11 | applied | 008-05 R5, S3 |
| P12 | applied | 007-02 R3, S4 rows 1 and 3 |
| P13 | applied | 007-02 R6, R7 |
| P14 | applied | 007-02 R9, S1; 008-01 R6 (S4 holds). The next step is real once 008-04 lands: `unlogged-change` reports an archive file "in no ingest log event" |
| P15 | applied | 007-07 R5 (b) 4; 008-06 R5 (a) from-text (matches 007-07 exactly) and "telling (R5)"; EPIC-008 |
| P16 | applied | 007-07 R5 (b) 2, §2.2 |
| P17 | applied as written | 009-03 R1, "failure (R1)". The text has gaps: see R2-P2 |
| P18 | applied | 007-07 R5 (b) 2, R13; line 4 replaced by H2 |
| P19 | applied | 007-07 R2 (c); its phrases hold |
| P20 | applied | 008-06 R8 (g) |
| P21 | applied | 007-07 R5 (b) 4; 008-05 R8 (b) and 008-06 R5 (d), byte-equal (checked by script) |
| P22 | applied | 009-03 R1, "one question (R1)" |
| P23 | applied | EPIC-007 §4 and Gherkin |
| H1 | applied as decided (decision 64) | 007-02 R1, R11, S5 last row, task list; 007-06 keeps `(E_CONFIG_SYNTAX)`; follow-ups in R2-P1 and R2-H1 |
| H2 | applied (decision 65) | 007-07 R1 (198 characters, measured), "session (R1)", plan-confirmation bullet; EPIC-007 §2 "once setup is done" |

---

## 2. Findings: planner fixes

**R2-P1 — [ux.md §3.2, §4.5] H1 follow-up (b): the syntax-error message spans lines, and its next step comes after
a code frame.** STORY-007-02 R11.
- yaml's message ends with ` at line L, column C:` and a code frame. Measured on the S5 row's `tokens: [unclosed`
  (yaml 2.9.1), R11 as written gives this `error.message`:

  ```
  config.yml syntax error at line 2: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 1:

  tokens: [unclosed

  ^
  : fix the YAML syntax in .wiki/config.yml
  ```
- Fix: the one helper that builds the message (007-02 §3.2) uses the first line of the parser's message, without
  yaml's ` at line L, column C:` suffix. This is the SPRINT-02 rule for `frontmatter_yaml` (`frontmatterMessage`,
  `src/ingest/validate.ts:26–28`; FLASHCARD 2026-10-17 `#yaml #parser`). Result:

  ```
  config.yml syntax error at line 2: Flow sequence in block collection must be sufficiently indented and end with a ]: fix the YAML syntax in .wiki/config.yml
  ```
- Same text in: 007-02 R11 (add "the first line of the parser's message, without its ` at line L, column C:`
  suffix"); S5 last row (its "starts with" and "ends with" still hold; add "and has no line break"); §4.1 (the R11
  message row).
- No other story or decision changes: decision 64 asks only that both throw sites end with the step.

**R2-P2 — [ux.md §1.3, §1.2] The agent's failure instructions send four failure paths to "try again later".**
STORY-009-03 R1, from round 1's P17 text.
- R1 shows `error.details.command` only when it starts with `sudo` or uses pnpm, yarn or bun, and otherwise offers
  to try again later. Against 009-02 R8, that strands four paths:
  - `npm_failed` on win32 (EACCES/EPERM): `command` is `npm install -g …`, "in a terminal run as administrator";
  - `npm_missing`: npm cannot be found, so trying later fails again;
  - `upgrade_unsupported` for a project install `package.json` does not list: `command` is `npm install --save-dev
    wikeeper@<v>`, which the agent could offer to run;
  - `upgrade_unsupported` for a source checkout: `command` is null and the message says to update that folder.
- Fix: replace the two sentences "If `error.details.command` starts with `sudo` … otherwise offer to try again later."
  with:

  > If `error.details.command` starts with `sudo`, uses pnpm, yarn or bun, is to be run as administrator, or needs
  > npm, which was not found, show the user that one command in a code span and say why you don't run it; when they
  > say it is done, run `error.details.then` if it is set (their reply is the yes for it). Offer to run any other
  > `error.details.command`, such as `wikeeper update` after `update_failed`. When it is null, say in plain words
  > what the message asks: to try again later, or to update the folder it runs from.

- Checked against R1's own rules: no "section", and every "wikeeper" is followed by a command. "failure (R1)"
  phrases still hold.

**R2-P3 — [DRAFTS cross-story: a WIKI.md paragraph one story writes and another edits] 007-07's red phrase breaks
when 008-06 merges.** Not a ux.md rule, but it turns the sprint branch red.
- 007-07 Gherkin "red page (R5)" pins "never change a limit yourself". 008-06 R5 (a) rewrites it as "never change a
  limit or start a clean-up yourself". 008-06 R11 (f) says no red test changes.
- Fix: 007-07's phrase becomes "never change a limit", a substring of both texts.
- Also in 007-07: R5 (c) and (d) say "this story checks them". QA-Red should check them by phrase, not byte-equal,
  because 008-06 R5 (b) rewrites the `oversized-page` row. The other pinned phrases of 007-05, 007-07 and 008-05 were
  checked against every later edit, and they all hold.

**R2-P4 — [ux.md §3.2] Missed in round 1: a refusal whose next step follows `; `.** STORY-007-02 R8.
- Now: `tokens must be a mapping in .wiki/config.yml; fix it by hand`.
- Fix: `tokens must be a mapping in .wiki/config.yml: fix it by hand`. No Gherkin row pins the text (S5 checks only
  the code `config_invalid`).

---

## 3. Findings: human decides

**R2-H1 — [ux.md §3.3, §3.10] H1 follow-up (a): `doctor` shows the syntax-error step twice.** STORY-007-02 R11, §1.5.
- `src/commands/doctor.ts:151–156` uses the thrown message as the finding's message and adds its own
  `fix: fix the YAML syntax in .wiki/config.yml`. After R11 and R2-P1:

  ```
  [error] config-valid .wiki/config.yml: config.yml syntax error at line 2: … end with a ]: fix the YAML syntax in .wiki/config.yml
    fix: fix the YAML syntax in .wiki/config.yml
  ```
  §3.3 puts a doctor finding's hint on its `fix:` line, not in the message too.
- **Recommended:** fix it in 007-02.
  - `src/core/config.ts` exports the step as one constant (for example `CONFIG_SYNTAX_FIX`), and R11's helper
    appends it.
  - The `config-valid` check uses that constant as `fix`, and the thrown message without its `: <fix>` tail as
    `message`. That is a two-line change.
  - No red test pins either text. `test/config.red.node.test.ts:113` checks only the code, and nothing under `test/`
    matches `fix the YAML syntax`.
- **What it changes:**
  - It adds `src/commands/doctor.ts` to 007-02's §3.1 Related Files. 007-02 is in wave 2.
  - The SDR's shared-file table gains a row, `src/commands/doctor.ts | 007-02, 009-01 | 007-02 → 009-01 | separate
    hunks`. Today sprint plan §2.3 lists `doctor.ts` among the single writers (009-01, through C3).
  - The three edits are separate hunks: C3's `compareVersions` re-export near `:42`, 007-02's `config-valid` check at
    `:151–156`, and 009-01's new checks after the integrations guard (`:215`). 009-01 already lists 007-02 upstream,
    so it rebases on it.
- **Alternative:** keep 007-02's file list. `doctor` then shows the step twice in SPRINT-04, and the de-duplication
  joins the post-sprint CR that renames the `E_` codes, which must edit `doctor.ts:151` anyway. A new Appendix A row
  would then record it as a known exception (the human's edit to ux.md).
- R2-P1 is needed under both answers, and it does not touch `doctor.ts`.

---

## 4. What the edits introduced (task 2)

- **007-01 `formatLimit`:** no conflict. It follows §3.8 (exact, no `≈`) and builds its decimal from integers. It is
  used by every line that prints a limit (007-03, 007-05, 008-05), while config echoes keep stored numbers, and it is
  in contract C1. A limit of a million prints `1000k` (there is no `M` form), the same form a user would write
  (STORY-007-01 R5 accepts only `k`).
- **007-02 R11:** R2-P1 and R2-H1.
- **007-07 R1:** 198 characters, measured. The order is as decision 65 says.
  - R5 (b) 2 needs no setup clause, because WIKI.md is read only once setup is done.
  - On a teammate's clone (setup done, no `me.md`), the size line comes first and onboarding follows. That fits the
    proposed order (§6 below).
  - On an error line at session start, the agent knows only "not an error" until it reads WIKI.md. It hides the line,
    and the next wiki command's own refusal now names the step (R11), so there is no dead end.
- **008-05 R8 (a), (b) and 008-06 R5 (c), (d):** byte-equal (script). 007-05 R10 (a), (b) and 007-07 R5 (c), (d) are
  byte-equal too.
- **008-06 R5 (a) on 007-07 R5 (b) 4:** the from-text matches, and the joined sentence offers both choices in plain
  words. See R2-P3 for its test effect.
- **009-03 R1's new sentences:** see R2-P2. The order sentence names only the red page, its candidates and the
  version question. Note C12.

---

## 5. ux-map refresh (task 4)

`docs/ux-map.md` was updated to the planned shapes, each marked "planned". No VERIFY or JOURNEY runs in SPRINT-04,
so nothing is marked seen.
- **Status:** a line saying that every SPRINT-04 line is planned, not yet seen.
- **J2a:** the version warning row has the bare hint, and the agent says nothing until the request is done.
- **J2c:**
  - row 2 has `tokens.source.yellow (20k)`, the `error.details.size` shape and the `both` tail;
  - row 2b offers a helper in plain words.
- **J4:**
  - row 2 shows the line only once setup is done, with the mark after its figure, the empty and error forms, and
    exit 0;
  - row 3 lists the new status lines (`tokens: wiki ≈66k · 43 pages · index.md ≈5.1k`, limits, largest pages,
    `archive: ≈12k tokens · 3 pages`, the `version:` lines only when due).
- **J5:**
  - row 1 tells the notice once however many signals show it, and offers to raise the limit for the user;
  - rows 2 and 5 show `set tokens.page.red to 15000 (was 10000)` and `set tokens.source.confirm_at to never (was
    yellow)`.
- **J6:**
  - row 3 uses the plural helper;
  - row 4 has `archive: ≈7.1k tokens · 1 page`, the final_status line, the single hint line, the `size` entry shape,
    and the JSON with `reason: "final_status"`.
- **J7:**
  - row 1 has the bare hint, is told once after the request, and is the one question when the files are older too;
  - row 2 has the bare hints;
  - rows 3 and 3b have the new failure lines with `details.command` and `then`;
  - new rows 3c (`update_failed`) and 3d (`registry_unreachable`);
  - rows 6 and 7 have the `version:` lines and doctor's `fix:`. Row 7 uses 0.4.1/0.4.0, a pair that can occur (C11).
- **§3:**
  - the planned order of one reply;
  - N3 shows once setup is done and collides with N1 on a teammate's clone;
  - N5 lists its five signals and is told once;
  - N6 has `final_status`, and its `size` entry is told with N5;
  - N7 is told once after the request, and N7 with N8 is one question;
  - the known collisions 1–5 each say which story settles them.
- **§4:** the three seeded notes say where SPRINT-04 settles them.

---

## 6. The notices this sprint adds (updated)

| ux-map §3 | Added by | When | Collides with | Now settled by |
|---|---|---|---|---|
| N3 size line | 007-06 R3, R5; 007-07 R1, R5 (b) 2 | first reply of a session, once setup is done | N1 on a teammate's clone; N5 (same page) | decision 65; line first, notices after the request |
| N5 red page | 007-05 R1, R5, R7, R8; 007-06 R3; 007-07 R5 (b) 4; 008-06 R5 (a), (b) | the first time a 🔴 page is seen in the session | N3; N6 `size` | 007-07 R5 (b) 4 ("however many of these show it") |
| N6 archive candidates | 008-05 R2, R5, R8 (b) = 008-06 R5 (d) | the first `status` of the session | N5 | `size` told with N5; `final_status` once |
| N7 newer version | 009-01 R6, R8, R10; 009-03 R1 | plan, start, status, doctor while a newer version is saved | itself across commands; N8 | 009-03 R1: once, after the request; one question with N8 |
| N8 files from another version | 009-01 R8, R9, R10; 009-03 R1 | status and doctor while the manifest differs | N7 | 009-03 R1 ("ask once, whether to upgrade") |
| (question) size approval | 007-03 R5, R6; 007-04 R4, R7; 007-07 R2 (b), (d), Q7 | `ingest start` exit 3 `size`/`both`; the plan; a scanned PDF before reading | ask mode (`both`), a second ask after the plan (defined) | one question each |
| (offer) 🔴 source | 007-07 R2 (c) | with a 🔴 size approval | the approval message | plain words, helper never named |

The order of one reply is now in ux-map §3 (planned).

---

## 7. Cross-flow notes (new this round)

| # | Note | Proposed CR |
|---|---|---|
| C10 | `status` prints no `version:` line when nothing is due (009-01 R8), while its other labels print `none` (§3.4: `archive: none`). A line such as `version: 0.4.0, the latest` would keep the label rule. | Status version line always shown |
| C11 | K14's example `this project was updated by wikeeper 0.4.0 (installed 0.3.0)` (EPIC-009 §2, 009-01 R9) cannot occur: 0.3.0 has no version check. 009-01's Gherkin already uses 0.5.0/0.4.0. | Version-mismatch examples that can occur (doc fix at close) |
| C12 | 009-03 R1 orders the red page, its candidates and the version question, but not N4 or N9–N11. The order list in ux-map §3 covers them, and a `notices` key would remove the guesswork. | extends "One ordered notice list in status" (C8) |

C1–C8 are in the sprint plan's "Not in this sprint" list with the round-1 titles. C9 is done (§5).

## Script Incidents

None.
