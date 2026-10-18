// src/agents/shipped-blocks.ts
// Contract C10 (owner STORY-002-11). Every pointer block a wikeeper release shipped, normalised (no BOM, LF, no
// trailing line break), oldest first; the last entry is the current templates/agent-block.md. Append-only: a change
// to the template appends its text here and its sha256 to SHIPPED_BLOCK_SHA256 in test/agents/shipped-blocks.test.ts.
// Never edit, remove or reorder an entry. Consumer: STORY-006-12 (appends the third entry).
export const SHIPPED_BLOCKS: readonly string[] = [
    // SPRINT-01 (STORY-002-01; shipped in the SPRINT-01 close 3876726)
    [
      "<!-- WIKI:START v1 — managed by wikeeper -->",
      "## Project Wiki",
      "This repo has a knowledge wiki in `.wiki/`.",
      "- If `.wiki/config.yml` has no `setup_completed_at`, read `.wiki/system/SETUP.md` and finish setup first.",
      "- Otherwise, before ingesting, querying or editing anything under `.wiki/`, read `.wiki/system/WIKI.md`.",
      "- Never write to `.wiki/pages/` outside `wikeeper ingest start` / `wikeeper ingest finish`.",
      "- If `.wiki/me.md` exists, read it at the start of a session: it describes who you are working with.",
      "<!-- WIKI:END -->",
    ].join("\n"),
    // SPRINT-02 (STORY-006-01; shipped in the SPRINT-02 close a0f0550)
    [
      "<!-- WIKI:START v1 — managed by wikeeper -->",
      "## Project Wiki",
      "Managed by wikeeper — edit outside this block only.",
      "This repo has a knowledge wiki in `.wiki/`; its content folder is set by `content_dir` in `.wiki/config.yml`.",
      "If `.wiki/config.yml` has no `setup_completed_at`, follow `.wiki/system/SETUP.md` first.",
      "Otherwise read `.wiki/system/WIKI.md` before ingesting, searching or editing anything in the wiki (skills: `wiki-ingest`, `wiki-search`).",
      "At the start of every session read `.wiki/me.md` and `.wiki/project.md`; if `.wiki/me.md` is missing, first onboard the user with `.wiki/system/ONBOARDING.md`.",
      "Wiki pages change only in an ingest's write phase, between `wikeeper ingest apply <id>` and `wikeeper ingest finish <id>`.",
      "If `wikeeper ingest` is unavailable, do not write pages; tell the user.",
      "You may edit, with the user's approval: `.wiki/config.yml`, `.wiki/kb_instructions.md`, `.wiki/me.md`, `.wiki/project.md`.",
      "Package-owned, never edit: `.wiki/system/`, the wiki skills, the wiki sub-agents and wikeeper's entries in agent settings files.",
      "<!-- WIKI:END -->",
    ].join("\n"),
    // SPRINT-03 (STORY-006-12; Gate 1 decision 22: search before answering, offer captures)
    [
      "<!-- WIKI:START v1 — managed by wikeeper -->",
      "## Project Wiki",
      "Managed by wikeeper — edit outside this block only.",
      "This repo has a knowledge wiki in `.wiki/`; its content folder is set by `content_dir` in `.wiki/config.yml`.",
      "If `.wiki/config.yml` has no `setup_completed_at`, follow `.wiki/system/SETUP.md` first.",
      "Otherwise read `.wiki/system/WIKI.md` before ingesting, searching or editing anything in the wiki (skills: `wiki-ingest`, `wiki-search`).",
      "At the start of every session read `.wiki/me.md` and `.wiki/project.md`; if `.wiki/me.md` is missing, first onboard the user with `.wiki/system/ONBOARDING.md`.",
      "Before you answer a question about the project or draft material for it, search the wiki with `wikeeper search`, even when the user does not mention the wiki.",
      "When a decision, a date, an owner or a commitment comes up in conversation and is not in the wiki, offer to capture it (`.wiki/system/WIKI.md`, section \"Ambient offers\").",
      "Wiki pages change only in an ingest's write phase, between `wikeeper ingest apply <id>` and `wikeeper ingest finish <id>`.",
      "If `wikeeper ingest` is unavailable, do not write pages; tell the user.",
      "You may edit, with the user's approval: `.wiki/config.yml`, `.wiki/kb_instructions.md`, `.wiki/me.md`, `.wiki/project.md`.",
      "Package-owned, never edit: `.wiki/system/`, the wiki skills, the wiki sub-agents and wikeeper's entries in agent settings files.",
      "<!-- WIKI:END -->",
    ].join("\n"),
    // SPRINT-04 (STORY-007-07)
    [
      "<!-- WIKI:START v1 — managed by wikeeper -->",
      "## Project Wiki",
      "Managed by wikeeper — edit outside this block only.",
      "This repo has a knowledge wiki in `.wiki/`; its content folder is set by `content_dir` in `.wiki/config.yml`. Once set up, open each session with the size `wikeeper statusline` prints, not an error.",
      "If `.wiki/config.yml` has no `setup_completed_at`, follow `.wiki/system/SETUP.md` first.",
      "Otherwise read `.wiki/system/WIKI.md` before ingesting, searching or editing anything in the wiki (skills: `wiki-ingest`, `wiki-search`).",
      "At the start of every session read `.wiki/me.md` and `.wiki/project.md`; if `.wiki/me.md` is missing, first onboard the user with `.wiki/system/ONBOARDING.md`.",
      "Before you answer a question about the project or draft material for it, search the wiki with `wikeeper search`, even when the user does not mention the wiki.",
      "When a decision, a date, an owner or a commitment comes up in conversation and is not in the wiki, offer to capture it (`.wiki/system/WIKI.md`, section \"Ambient offers\").",
      "Wiki pages change only in an ingest's write phase, between `wikeeper ingest apply <id>` and `wikeeper ingest finish <id>`.",
      "If `wikeeper ingest` is unavailable, do not write pages; tell the user.",
      "You may edit, with the user's approval: `.wiki/config.yml`, `.wiki/kb_instructions.md`, `.wiki/me.md`, `.wiki/project.md`.",
      "Package-owned, never edit: `.wiki/system/`, the wiki skills, the wiki sub-agents and wikeeper's entries in agent settings files.",
      "<!-- WIKI:END -->",
    ].join("\n"),
];
