---
name: wiki-ingest
description: Use when the user shares, attaches or pastes a file, document, link, directory or text to keep, or asks to add or ingest something into the wiki. Also use when you notice a decision, an owner change, a deadline or a risk worth offering to record. Loads the procedure for turning a source into cited wiki pages.
---

# Ingest a source into the wiki

The full procedure is in `.wiki/system/WIKI.md`. Read these sections before you start: "Ingest", "Register", "Triage and extract", "Write phase", "Delegation", "Ambient offers" and "Lint and status".

In short: read a URL, a DOCX, an HTML file or a PDF with `wikeeper read` first, then register the source with `wikeeper ingest start`; a markdown, text, CSV or TSV file is registered directly. Triage and extract its facts, then write the pages and finish the ingest. For a directory, run `wikeeper ingest plan` first and wait for the plan to be approved. When you notice something worth keeping that the user did not hand you, offer to record it (section "Ambient offers") and do not ingest until they agree.

## Who does what

- A file shared in chat: `wiki-extractor`, or you, extract the facts; `wiki-writer`, or you, write the pages.
- Something said in chat: you extract the facts, because you have the context; `wiki-writer`, or you, write the pages.
- A directory: after `wikeeper ingest plan` is approved, one `wiki-extractor` per approved file extracts, in parallel; `wiki-writer` writes each source's pages, one at a time, never in parallel.
- A link: you get the text; `wiki-extractor`, or you, extract the facts; `wiki-writer`, or you, write the pages.
- Give each `wiki-extractor` the ingest id, where to read the source and its kind. Give each `wiki-writer` the facts file path, never the original source. Write the brief (section "Brief") into its task.
- If `ingest.delegate` is `never` in the config, or your agent has no sub-agents, do both the extraction and the writing yourself, following the same sections of WIKI.md.

Sub-agents do not always start with your context, so tell them everything they need in the task you give them.

Talk to the user in plain words: `.wiki/system/WIKI.md`, section "Talking to the user".
