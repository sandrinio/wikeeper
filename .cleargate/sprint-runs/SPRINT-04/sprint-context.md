---
sprint_id: "SPRINT-04"
created_at: "2026-10-18T15:49:23.219Z"
last_updated: "2026-10-18T15:49:23.219Z"
---

# Sprint Context

Per-sprint audit artefact. Populated at sprint init (M1 planning) and re-touched after each story merges. Referenced from every Developer/QA/Architect task brief so all agents start from the same baseline.

## Sprint Goal

The user always knows how big the wiki, each page and each document are in tokens, approves a large document before it is read, changes the limits from the CLI, can ask for a clean-up that moves outdated facts to an archive without losing any, and hears when a newer wikeeper is out and can upgrade with one command.

## Goal Acceptance Check

Confirmed by the human with the sprint plan, 2026-10-18 (sprint plan §0):

1. *Mechanical*, on the merged `sprint/S-04` tree: `npm run typecheck`, `npm test` and `npm run test:perf` pass; `wikeeper --version` prints `0.4.0` with the build stamp; in a scratch copy of the testbed (`.cleargate/sprint-runs/SPRINT-04/testbed.md`, Making a scratch copy), `wikeeper status --json` reports `tokens.page_count` 56 and `tokens.wiki`, which counts the pages only, within ±15% of 73,369 (Claude's real count of the testbed's 56 pages, without `index.md`; testbed.md "Sizes"), and `version.files` is `0.3.0` (the testbed's manifest is from 0.3.0) with a line telling the user to run `wikeeper update`.
2. *Behavioural*: walkthrough part 4 (real user, in a scratch copy of the testbed, one fresh copy per session where a session's changes affect the next; a fresh session per task; plain requests that never name wikeeper; the large document, the red-page limit and the outdated facts are the ones testbed.md lists) ends with no ❌. It must show the agent, unprompted: showing the wiki's size at the start of a session; not reading a document above the approval limit before the user says yes, and telling the user its size; changing a limit when the user asks in plain words; telling the user once about a red page; when the user asks for a clean-up, moving outdated facts to the archive with `ingest finish` passing and the facts still found by a history search; and, with the project's files from 0.3.0, telling the user they are out of date and running `update` only after a yes. (A newer version than 0.4.0 can't exist on npm during the walkthrough, so `upgrade` is checked by tests with an injected fetch and npm runner.)

## Locked Versions

Frozen dependency versions for this sprint. Developers must not upgrade these mid-sprint without an explicit CR. No new runtime dependency this sprint.

| Package | Version |
|---------|---------|
| Node    | `>=22.12.0` (CI: ubuntu, macos, windows × 22, 24) |
| TypeScript | `^7.0.2` |
| vitest | `^5.0.5` |
| @types/node | `^22.20.5` |
| commander, yaml, minisearch | `^15.0.0`, `^2.9.1`, `^7.2.0` |
| linkedom, defuddle, turndown, @joplin/turndown-plugin-gfm | `^0.18.13`, `^0.19.5`, `^7.2.4`, `^1.0.68` |
| mammoth, unpdf | `^1.13.0`, `^1.9.0` |
| package version | `0.3.0` → `0.4.0` this sprint (sprint plan, Execution Guidelines); npm publish is a separate step after Gate 4 |

## Test Stack

| Field | Value |
|-------|-------|
| Backend runner    | `npm test` (vitest run; excludes `*-perf.red.node.test.ts`) · perf: `npm run test:perf` |
| Frontend runner   | _(none — single-stack CLI)_ |
| Typecheck command | `npm run typecheck` (tsc --noEmit) |
| Red-test naming   | `test/**/*.red.node.test.ts` (immutable after QA-Red) |

## Cross-Cutting Rules

1. No model calls in the CLI. The network is used only by `wikeeper read` (20 s timeout, 10 MB cap) and, from STORY-009-01, the version check: one GET to the npm registry at most once a day, 1.5 s timeout, 64 KB cap, only from the ingest subcommands and `upgrade`; it never fails, blocks or changes a command. Tests never reach npm or the internet (local HTTP server, injected fetch and npm runner). No new runtime dependency. Node ≥ 22.12, ESM, TypeScript.
2. Every command supports `--json`, uses `emitResult` / `emitError` and the existing `ExitCode` values (0 ok, 1 error, 2 usage, 3 needs_approval, 4 denied, 5 needs_input). A command never adds a local `--json`.
3. Windows, macOS and Linux: `node:path` everywhere, no case-differing file names, LF line endings, no `:` in file names. Finding paths are repo-relative POSIX.
4. Package-owned vs user-owned files follow architecture.md §4.1. `update` never rewrites `config.yml`; `config set/unset` edit only the key they name. `statusline --install` never replaces a user's status line, and tests point `CLAUDE_CONFIG_DIR` at a temp folder.
5. Contract-first build: frozen exports in `plans/waves.json` `contracts[]` are never renamed or retyped; owners replace bodies only. Built-on-stub stories re-sync on `sprint/S-04` after their upstream merges and re-run the full suite before QA-Verify. Shared files merge in the orders of sprint plan §2.2 (e.g. `templates/system/WIKI.md`: 007-05 → 008-05 → 007-07 → {009-01, 008-06} → 009-03; in wave 4 merge 007-07 before 009-01).
6. Red tests are re-scoped by QA-Red only, never by the Developer; the approved re-scopes are listed in `plans/gate1-decisions.md`.
7. Path and id lists in `--json` output are sorted by code unit (`compareCodeUnits`); never assert "X right after Y" in a sorted list.
8. Instruction text (WIKI.md, SETUP.md, skills, sub-agent prompts, pointer block) names only commands, options and output fields that exist on the merged tree; the wiki-writer text stays identical across the three agents; Codex TOML prompts contain no `\`, no `"""` and no `{{model}}`.
9. What the CLI prints and what the agent tells the user follow `docs/ux.md`: hints as `<what is wrong>: <next step>`, lowercase, no final period, `run wikeeper …`; never name a command to the user; tell each notice once; ask before changing what the user didn't ask for; token figures as `≈12k` with the mark after; limits through `formatLimit` (`20k`). The story wording after the designer's DRAFTS rounds 1–2 is binding.
10. Gate 1 decisions 1–61 and plan-confirmation decisions 62–66 in `plans/gate1-decisions.md` are binding; a story's `- **Decision:**` lines quote them.
11. Privacy (the repo is public): no file, test, fixture, report or commit message names a real person, the maintainer's private wiki or its product, or quotes the maintainer's documents; example people are roles ("the product lead"). Manual checks and walkthroughs use a scratch copy of the fictional testbed (`testbed.md`, Making a scratch copy), never the testbed itself; no agent runs anything in, reads from or changes any other wiki on this machine, or uses files from Documents, Downloads or Desktop. A local pre-commit guard refuses private terms; never bypass it.

## Active FLASHCARD Tags

Agents: grep `.cleargate/FLASHCARD.md` for each tag before starting work.

- `#qa`, `#red-test`, `#test-harness`, `#perf`, `#fixtures` — red-test re-scopes, e2e builds into a temp stage, load-sensitive perf tests.
- `#contract`, `#git #merge` — contract re-sync and `src/program.ts` append conflicts.
- `#templates`, `#ux`, `#wording`, `#cli` — instruction text and CLI message shapes (docs/ux.md).
- `#lint`, `#finish`, `#ingest`, `#yaml`, `#enforce`, `#windows`, `#esm`, `#fs` — the areas this sprint's stories touch.

## Adjacent Implementations (Reuse First)

Exported helpers and modules from already-merged stories in this sprint. The Architect updates this section after each story merges. Developers check here before writing new helpers — if the module already exists, import it; duplication is a kick-back criterion.

| Story | Module / Export | Path |
|-------|----------------|------|
| (populated as stories merge) | | |

## Mid-Sprint Amendments

_(populated by Architect on CR:scope-change or CR:approach-change; never rewrite, only append. Format: '<ISO-ts> · <ID> · <one-line note>')_
