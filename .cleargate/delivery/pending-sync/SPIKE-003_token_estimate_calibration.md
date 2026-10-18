---
spike_id: SPIKE-003
parent_cleargate_id: null
status: Completed
approved: true
approved_by: Sandro Suladze
approved_at: 2026-10-18T07:08:09Z
ambiguity: 🟢 Low
context_source: "The human's request in chat, 2026-10-18: show how many tokens the wiki and each document take, with green/yellow/red levels, and ask before a large document is read · agreed plan: spike first, then EPIC-007 (token gauges) and EPIC-008 (fact archive) · architecture.md v0.4 §2 principle 1 (the CLI makes no model calls and needs no API keys)"
area: tokens
timebox: 1 working day from the start of discovery
kill_criteria: "Win: the dependency-free estimate is within ±20% of the highest real count among Claude Opus 5.5, OpenAI GPT-6.x and Gemini 4 Argon on every sample. Switch: it misses on a language, and one tokenizer library is within ±20% on every sample. Lose: neither is within ±20% on Georgian. Blocked: no model's real counts can be obtained within ±5%."
spawned_items: []
concluded_at: 2026-10-18T07:35:49Z
created_at: 2026-10-17T23:20:00Z
updated_at: 2026-10-17T23:20:00Z
created_at_version: strategy-phase-pre-init
updated_at_version: strategy-phase-pre-init
server_pushed_at_version: null
cached_gate_result:
  pass: true
  failing_criteria: []
  last_gate_check: 2026-10-18T07:09:27Z
  transition: ready-to-investigate
pushed_by: null
pushed_at: null
last_pulled_by: null
last_pulled_at: null
last_remote_update: null
source: local-authored
last_synced_status: null
last_synced_body_sha: null
stamp_error: no ledger rows for work_item_id SPIKE-003
draft_tokens:
  input: null
  output: null
  cache_creation: null
  cache_read: null
  model: null
  last_stamp: 2026-10-18T07:36:10Z
  sessions: []
---

# SPIKE-003: Token estimate calibration

## 1. The Question

- Is a dependency-free estimate (characters counted per script, each script with its own weight) within ±20% of the highest real token count among the supported agents' models — Claude Opus 5.5 (Claude Code), OpenAI GPT-6 Astra and GPT-6.1 Sol (Codex), Gemini 4 Argon (Antigravity) — on English, Russian and Georgian text, or does wikeeper have to bundle a tokenizer library to get there?

## 2. Timebox & Kill Criteria

**Timebox:**
- 1 working day from the start of discovery.

**Kill criteria:**
- Win: the estimate is within ±20% of the highest of the models' counts on every sample. Stop; EPIC-007 uses it with no new dependency.
- Switch: the estimate misses ±20% on a language, and one tokenizer library is within ±20% on every sample. Stop; EPIC-007 needs that library, and the human approves the dependency by name (as in SPRINT-03).
- Lose: neither gets within ±20% on Georgian. Stop; EPIC-007 shows the measured error next to each estimate, and the limits allow for it.
- Blocked: no model's real counts can be obtained within ±5%. Stop and return to the sponsor. When only some vendors' counts can be obtained, the verdict covers those, and the missing ones are named in §5.

**Method.** Run everything in the session scratchpad and install nothing in the repo.

- **Real counts,** with no API keys:
  - **Claude:** `claude -p --output-format json --model claude-opus-5-5` on the human's subscription. Run it once with an empty prompt and once with the sample as the prompt. The difference in total input tokens (input, cache creation and cache read) is the sample's count. Repeat the empty run three times to check that the baseline is stable.
  - **OpenAI and Gemini:** the same difference method with `codex exec --json` and `gemini -p --output-format json`, both installed, when the human is signed in with a subscription and the output reports input tokens.
  - OpenAI's open tokenizer, when it covers GPT-6.x.
  - The walkthrough work documents go only through Claude, which already processed them in the walkthrough. Codex and Gemini get the public articles only. Claude's tokenizer isn't public, so no library can reproduce Claude's counts; a library qualifies for "Switch" only by these measurements.
- **Samples:**
  - one public article each in English, Russian and Georgian;
  - the walkthrough work documents used in the SPRINT-03 walkthrough, run through `wikeeper read`;
  - the pages and `index.md` of the SPRINT-03 walkthrough wiki.
- **What's recorded:** counts only. No sample text is committed, and personal documents are never used.
- **Secondary data,** recorded but not part of the verdict:
  - how far apart the three models' counts are for each language, which shows how much the "highest of" rule costs;
  - Claude's count per page for two scanned PDFs. EPIC-007 needs this to estimate a PDF whose text can't be extracted.

## 3. Decision Unblocked

How EPIC-007 counts tokens: a weighted character estimate with its measured error, or a bundled tokenizer library. EPIC-007's estimator (`src/core/tokens.ts`) waits on this answer. Its other parts (limits in config, the `config` command, where sizes are shown) can be planned meanwhile. Sponsor: Sandro Suladze.

## 4. Decision Log

| Round | Date | Finding | Confidence |
|---|---|---|---|
| 1 | 2026-10-18 | Method works without API keys. `claude -p` (Opus 5.5, subscription, tools and settings off, empty folder) has a baseline of 2,897 tokens, identical across three runs; a sample's count is the total input minus the baseline. On a ChatGPT account Codex refuses GPT-6 Astra and GPT-6.1 Sol and allows GPT-6 Luna, used as the GPT-6 proxy (baseline 15,285, stable). Gemini CLI refuses individual accounts (moved to Antigravity, which has no headless count). | High |
| 2 | 2026-10-18 | Claude counts highest on every sample. GPT-6 Luna is 0.58–0.61× Claude on English, 0.72–0.75× on Russian, 0.46–0.50× on Georgian. The "highest of" rule therefore means Claude's count. | High |
| 3 | 2026-10-18 | The earlier rough rule (ASCII ÷ 4, every other character 1 token) misses by −53% to +109%. Real sizes are larger than it said: the walkthrough wiki is ≈66k tokens, not 43k; its largest page ≈6.3k, not 3.3k; its median page ≈870, not 517; `index.md` ≈5.1k, not 3.3k. | High |
| 4 | 2026-10-18 | A per-class weighted count, fitted on 12 samples, is within 6.6% on 4 held-out public articles (English, Russian, two Georgian); the worst leave-one-out error over all 16 is 19.6%. With rounded weights fitted on all 16, the worst error is 13.9% (a markdown-table document, under-counted). Long runs of one punctuation mark (lines such as `______`) must count as one unit, or documents with such lines are over-counted. | Medium-high |
| 5 | 2026-10-18 | A scanned page with no text layer (150 dpi) costs Claude about 1,550 tokens to read (a 3-page read minus a 1-page read). | Medium |

## 5. Outcome & Spawned Items

**Verdict: Win** for Claude and OpenAI GPT-6. EPIC-007 uses a dependency-free estimate; no tokenizer library is needed. Gemini 4 Argon is not covered (§4 round 1), and GPT-6 Astra and Sol were not measured directly; Luna stands in for the GPT-6 family.

**The estimate** (for `src/core/tokens.ts`):
1. Replace each run of three or more of the same punctuation mark with nothing, and count the runs.
2. Count the rest by class and add up the weights:

| Class | Weight per unit |
|---|---|
| ASCII letter | 0.32 |
| ASCII digit | 0.62 |
| Whitespace run | 0.51 |
| ASCII punctuation | 0.88 |
| Repeated-punctuation run (step 1) | 0.30 |
| Cyrillic letter | 0.37 |
| Georgian letter | 0.74 |
| Any other character | 0.38 |

- Measured error on the 16 samples: within ±14% (worst: a markdown-table document, under-counted). Shown as "≈" with "±15%" in `WIKI.md` and the README.
- A naive JavaScript loop runs at about 10.8M characters a second, so 500 pages take about 160 ms. A character-code loop should be faster; the statusline budget (300 ms p95) is checked by EPIC-007's perf test.
- A PDF with no text layer: about 1,600 tokens per page.

**Spawned items:** none. EPIC-007 is updated with the estimate, the error and the measured sizes. No sample text is committed; the samples and scripts stayed in the session scratchpad.

## Prior work

- No prior work on token estimation (cleargate-wiki-query, 2026-10-18).
- [[SPIKE-001]]: precedent for a Georgian-text spike with kill criteria. It tested text extraction, not token counts.
- [[SPRINT-03]]: each new npm dependency was approved by name. The token ledger's totals diverge from the session total, so they can't serve as ground truth here.

---

## ClearGate Ambiguity Gate (🟢 / 🟡 / 🔴)
**Current Status: 🟢 Low Ambiguity**

*Evaluate each criterion against its literal text. If you substituted an interpretation, leave the box unchecked and surface the substitution in the Brief.*

**This gate is inverted relative to every other template in this directory. Reaching
green here does NOT mean the answer to Section 1 is known — it means the question is
sharp, the timebox is set, and the kill criteria are falsifiable enough that bounded
discovery can safely start.**

Requirements to pass to Green (Ready for Discovery):
- [x] Section 1 states a single, falsifiable question — not a task list, not a plural.
- [x] Section 2's timebox is a concrete bound, and its kill criteria are conditions that could actually trigger.
- [x] Section 3 names both the decision this spike unblocks and who is waiting on it.
- [x] Section 4 is present as an empty append-only table — no entries yet; it fills during the spike.
- [x] `approved: true` is set in the YAML frontmatter.
