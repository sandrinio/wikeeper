# `.cleargate/` — your planning layer

This directory is ClearGate: a planning framework for AI coding agents. It holds
your work items, the rules agents follow when drafting them, and the artifacts
produced while a sprint runs.

ClearGate scaffolds **how work gets planned**. It does not replace your build
system, CI, test runner, or deployment tooling — those stay yours.

---

## Quickstart

1. **Join a project** (needed for sync; local planning works without it):
   ```
   cleargate join <invite-url>
   ```
   Run `cleargate whoami` to confirm. Without a token you can still draft, gate,
   and build the wiki locally — only `push`/`pull`/`sync` require membership.

2. **Draft a work item.** Ask your agent for what you want ("I need a story for
   rate-limiting the upload endpoint"). It picks the right template from
   `templates/`, writes the file into `delivery/pending-sync/`, and shows you a
   **Brief** — summary, open questions, edge cases, risks, ambiguity status.

3. **Answer the open questions.** The agent halts at Gate 1 and waits. This is
   the point of the framework: ambiguity gets resolved before code is written,
   not during review.

4. **Approve.** When the Ambiguity Gate reaches 🟢, set `approved: true` in the
   item's frontmatter. The readiness gate must pass — check it yourself with:
   ```
   cleargate gate check .cleargate/delivery/pending-sync/<file>.md
   ```

5. **Push.**
   ```
   cleargate push .cleargate/delivery/pending-sync/<file>.md
   ```
   The item moves to `delivery/archive/` stamped with its remote ID.

---

## The loop

**Plan** → work items land as markdown in `delivery/pending-sync/`.
**Execute** → a five-agent loop (Architect → QA-Red → Developer → QA-Verify →
Reporter, with DevOps for merge and teardown) works one story at a time.
**Deliver** → `cleargate push` syncs items to your ClearGate project.

Everything is plain markdown in your repo. It diffs, it reviews, it merges.

---

## What lives where

| Path | What it is |
|---|---|
| `delivery/pending-sync/` | Drafts and in-flight items. Work happens here. |
| `delivery/archive/` | Items already pushed or completed. |
| `templates/` | Blueprints: epic, story, CR, Bug, initiative, hotfix, sprint. |
| `knowledge/` | The rules. Start with `cleargate-protocol.md`. |
| `config.yml` | Per-repo settings. `config.example.yml` is the full reference. |
| `FLASHCARD.md` | Append-only lesson log. Agents read it before non-trivial work. |
| `scripts/` | Sprint orchestration (`close_sprint.mjs`, `init_sprint.mjs`, …). |
| `wiki/` | Compiled awareness layer. Generated — see below. |
| `sprint-runs/<id>/` | Per-sprint artifacts: plans, token ledger, report. Generated. |
| `hook-log/` | Raw hook output. Generated, gitignored. |

**The wiki is a cache, not a source.** `wiki/index.md` is the ~3k-token
orientation page an agent reads at session start to learn what already exists
before grepping. Rebuild it any time with `cleargate wiki build`; it is derived
entirely from `delivery/`. Stories are excluded by default — too granular for an
awareness layer. Add `stories` to `wiki.ingest_buckets` in `config.yml` if you
want per-story pages.

---

## What upgrades overwrite, and what is yours

`cleargate upgrade` uses `.install-manifest.json` — a snapshot written at install
time recording every scaffold file with its SHA-256 and an overwrite policy. It
tracks what ClearGate installed, so it can update those files without touching
yours.

| Policy | Applies to | On upgrade |
|---|---|---|
| `always` | agents, hooks, skills, scripts | Replaced with the new version. |
| `merge-3way` | templates, `knowledge/`, this README, `.claude/settings.json` | Merged; your edits are preserved where they don't conflict. |
| `pin-aware` | `stamp-and-gate.sh`, `session-start.sh` | Replaced, with your version pin re-substituted. |
| `skip` | `FLASHCARD.md` | Never touched. Yours. |

**Never edited by upgrade at all:** everything under `delivery/`, `wiki/`,
`sprint-runs/`, and `hook-log/`, plus `config.yml` and `.gitignore`. Your work
items and your configuration are yours; ClearGate only ever adds to `delivery/`
through commands you run.

Files ClearGate installed and later retired are pruned on upgrade — but only when
they still byte-match what was installed, so a file you edited is never silently
deleted.

---

## Commands worth knowing

```
cleargate doctor                    # health check; run this first when confused
cleargate wiki build                # rebuild the awareness layer
cleargate wiki query "<topic>"      # has this been done before?
cleargate gate check <file>         # will this item pass its readiness gate?
cleargate sprint init <file>        # open a sprint from a sprint plan
cleargate push <file>               # sync one item
cleargate sync                      # pull remote changes
```

`cleargate doctor` also lists every item currently blocked by a readiness gate
and the exact criterion each one fails.

---

## Going deeper

- `knowledge/cleargate-protocol.md` — the delivery protocol. Non-negotiable rules.
- `knowledge/readiness-gates.md` — every gate, criterion, and predicate shape.
- `knowledge/cleargate-enforcement.md` — what the hooks enforce and why a command
  exited non-zero.
- `knowledge/sprint-closeout-checklist.md` — what has to be true to close a sprint.

The root `CLAUDE.md` carries a bounded `<!-- CLEARGATE:START -->…<!-- CLEARGATE:END -->`
block with the agent-facing contract. Content outside that block is yours and
takes precedence — the block is rewritten on upgrade, everything around it is not.
