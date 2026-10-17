<!-- WIKI:START v1 — managed by wikeeper -->
## Project Wiki
Managed by wikeeper — edit outside this block only.
This repo has a knowledge wiki in `.wiki/`; its content folder is set by `content_dir` in `.wiki/config.yml`.
If `.wiki/config.yml` has no `setup_completed_at`, follow `.wiki/system/SETUP.md` first.
Otherwise read `.wiki/system/WIKI.md` before ingesting, searching or editing anything in the wiki (skills: `wiki-ingest`, `wiki-search`).
At the start of every session read `.wiki/me.md` and `.wiki/project.md`; if `.wiki/me.md` is missing, first onboard the user with `.wiki/system/ONBOARDING.md`.
Before you answer a question about the project or draft material for it, search the wiki with `wikeeper search`, even when the user does not mention the wiki.
When a decision, a date, an owner or a commitment comes up in conversation and is not in the wiki, offer to capture it (`.wiki/system/WIKI.md`, section "Ambient offers").
Wiki pages change only in an ingest's write phase, between `wikeeper ingest apply <id>` and `wikeeper ingest finish <id>`.
If `wikeeper ingest` is unavailable, do not write pages; tell the user.
You may edit, with the user's approval: `.wiki/config.yml`, `.wiki/kb_instructions.md`, `.wiki/me.md`, `.wiki/project.md`.
Package-owned, never edit: `.wiki/system/`, the wiki skills, the wiki sub-agents and wikeeper's entries in agent settings files.
<!-- WIKI:END -->
