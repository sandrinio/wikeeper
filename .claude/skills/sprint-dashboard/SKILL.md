---
name: sprint-dashboard
description: |
  Render, serve, or stop the branded sprint-progress dashboard
  (`cleargate sprint dashboard`). Use when a human wants a visual view of the
  active sprint's story states, milestone/wave grouping, token spend by agent,
  worktrees, and dispatch reports. Triggers: explicit user phrases "show me the
  dashboard", "open the sprint dashboard", "sprint progress view"; started
  automatically (best-effort) after `cleargate sprint init` succeeds. Not for
  CI/automation — this is a human-facing visual surface, not a data source other
  tooling should scrape (use `state.json` / `token-ledger.jsonl` directly for that).
---

# Sprint Dashboard — Branded Progress View (CR-084, CR-097, CR-101, CR-102)

A self-contained, zero-network HTML view of the active sprint. Ships inside the
`cleargate` CLI binary (`src/dashboard/{collect,render,serve,open,daemon,snapshot}.ts`)
— no separate tool file, no payload sync beyond this skill.

## The four modes

| Command | What it does |
|---|---|
| `cleargate sprint dashboard` | Writes `.cleargate/sprint-runs/<id>/dashboard.html` and exits. Opens nothing. The artifact/CI path, and what the SubagentStop hook calls. |
| `cleargate sprint dashboard --open` | Ensures a **background** dashboard is running, opens it in the browser, exits 0. This is the one you want. |
| `cleargate sprint dashboard --serve` | Runs the server in **this terminal** and blocks until Ctrl-C. The escape hatch. |
| `cleargate sprint dashboard --stop` | Terminates the background dashboard and drops its record. |

`--port <n>` applies to `--open` and `--serve`. Default `4713`.

## It updates itself (CR-101)

The page polls `/data` every ~2s and patches the DOM in place — no reload, no
flicker, scroll position and open modals preserved. Two independent things keep
it current:

- **The live server** re-runs `collect()` on every request, so a served page is
  never stale by more than one poll tick.
- **The snapshot** (`dashboard.html`) is re-rendered whenever its inputs change:
  after `cleargate state update`, and by the SubagentStop token-ledger hook after
  each agent completes. Both are best-effort and can never change an exit code.

**A `file://` snapshot cannot refresh itself** — the poller only fires against a
server (relative fetch URL, deliberate no-op off `file://`). That is why `--open`
starts a server instead of opening the file, and why `sprint init` does too.

## Lifecycle

`sprint init` starts the background dashboard and it opens itself once listening.
It records `{pid, port, root, sprintId, startedAt}` in
`.cleargate/sprint-runs/<id>/.dashboard.json` — written by the server itself on
`listen`, so a record only ever exists for a process that actually bound a port.

It stops on any of:

- `cleargate sprint dashboard --stop`
- `cleargate sprint close` (best-effort teardown)
- the `.active` sentinel no longer naming its sprint (re-checked every 30s)
- 30 minutes with no HTTP request — override with `CLEARGATE_DASHBOARD_IDLE_MS`

Suppress the whole thing at init with `--no-dashboard` or `CLEARGATE_NO_DASHBOARD=1`.

**Port conflicts.** `/healthz` answers `{service, root, sprintId, pid}`. Reuse
requires **both** `service` and `root` to match, so a *different* ClearGate
checkout's dashboard on 4713 is correctly seen as foreign and the daemon walks
to 4714, 4715, … (10 tries). Before CR-101 the probe checked only `service`, so
a second repo silently adopted the first repo's dashboard and showed another
project's sprint.

## Data sources

All best-effort — a missing or malformed input degrades to an empty panel, never
a crash, and anything that made the page less true than it looks is reported in
the accuracy-warning block under the header (CR-097).

- `state.json` — story states → done/active/blocked/queued counts.
- the sprint plan's pipe-table (`pending-sync/` then `archive/`) — story titles +
  milestone/wave grouping.
- `token-ledger.jsonl` — token spend by agent (sums `delta.*`, never
  `session_total` — the latter double-counts across rows). Frequently absent;
  an empty panel is normal, not an error.
- `sprint-context.md` — the `## Sprint Goal` paragraph, shown as the subtitle.
- `git worktree list` — active `.worktrees/STORY-*` checkouts.
- `reports/` — per-story and per-role dispatch-report counts.
- `SPRINT-NN_REPORT.md` presence — a flag surfaced in the Reports panel.

## Visual system (CR-102) — do not "fix" this back

The dashboard uses **flat, hairline-bordered, square-cornered cards**, a
**monospace register for all data** (ids, counts, labels, timestamps), uppercase
letter-spaced section heads, and a dense item grid. There are **no shadows and no
border-radius** on structural elements; the one round thing is the in-progress
state dot.

This is deliberate and per-surface: the dashboard is a dense, read-only
instrument, and the hairline *is* the structure (the stat grid's 1px gap is the
rule). The admin console keeps its rounded, shadowed cards — this divergence does
not extend to it.

The **ClearGate palette is unchanged** — all sixteen `--cg-*` colour tokens carry
their `design-guide.md` values byte-for-byte, and a test asserts it. Adding a
colour token, a shadow, or a non-zero radius fails `cr102.node.test.ts`.

There is intentionally **no dark theme**. Its absence is a decision, not an
oversight.

## Troubleshooting

**Blank story titles, or every story lumped under a single "All stories" group**
⇒ the sprint plan's pipe-table column headers don't match what the collector
looks for (`Story ID` + `Title` cells in the header row, optionally `Milestone`
or `Wave` for grouping — parsed by header **name**, not position, so column order
and extra columns are fine). Everything else (state, counts, tokens, worktrees,
reports) still renders correctly from `state.json` regardless. Fix by renaming
the plan table's header row to include `Title` and (`Milestone` or `Wave`) cells.

**The browser tab shows a different project's sprint** ⇒ you are on a build older
than CR-101. Upgrade, or pass `--port` explicitly.

**`--open` printed a URL but no tab appeared** ⇒ the daemon was already running
and your browser reused an existing tab. `--stop` then `--open` forces a fresh one.

**Port 4713 in use by something that isn't us** ⇒ the daemon scans up to 4722;
if all ten are taken it errors. Pass `--port <n>`.
