---
name: wiki-ingest
description: Use when the user shares, attaches or pastes a file, document, link, directory or text to keep, or asks to add or ingest something into the wiki. Also use when you notice a decision, an owner change, a deadline or a risk worth offering to record. Loads the procedure for turning a source into cited wiki pages.
---

# Ingest a source into the wiki

The full procedure is in `.wiki/system/WIKI.md`. Read these sections before you start: "Ingest", "Register", "Triage and extract", "Write phase", "Delegation" and "Ambient offers".

In short: register the source with `wikeeper ingest start`, triage and extract its facts, then write the pages and finish the ingest. For a directory, run `wikeeper ingest plan` first and wait for the plan to be approved. When you notice something worth keeping that the user did not hand you, offer to record it (section "Ambient offers") and do not ingest until they agree.

## Who does what

- A directory: after `wikeeper ingest plan` is approved, hand each source to its own `wiki-extractor` sub-agent, one per source, in parallel. Give each the ingest id, where to read the source and its kind.
- Every write phase: hand it to a `wiki-writer` sub-agent, one per source and one at a time, never in parallel. Give it the brief and the facts file path, not the original source.
- A file or text you have already read: extract the facts yourself, then hand the write phase to `wiki-writer`.
- If `ingest.delegate` is `never` in the config, or your agent has no sub-agents, do both the extraction and the writing yourself, following the same sections of WIKI.md.

Sub-agents do not always start with your context, so tell them everything they need in the task you give them.
