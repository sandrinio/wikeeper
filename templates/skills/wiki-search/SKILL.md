---
name: wiki-search
description: Use when the user asks who owns or decides something, what is at risk, why something was decided, what changed since a date, or asks about a person, project or term the wiki may know. Use it before answering from memory, so the answer comes from the wiki with citations.
---

# Answer from the wiki

Before you answer from memory, look in the wiki. Run `wikeeper search <query> --json` with the key words of the question, read the pages it points to, and answer from them.

Follow `.wiki/system/WIKI.md`, sections "Search" and "Answering questions". Cite the pages your answer rests on. If the wiki does not know, say so instead of guessing, and offer to ingest a source that would answer it. Check each hit's `page_tokens` before you read its page (section "Search").
