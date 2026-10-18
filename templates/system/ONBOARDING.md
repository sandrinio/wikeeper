# Onboarding

Talk to the user in plain words: `.wiki/system/WIKI.md`, section "Talking to the user". Coming from SETUP.md, these steps are all its step 1: do not number them to the user.

Run this once per person, with the user, in conversation. You get here in two ways: from `.wiki/system/SETUP.md` step 1, and on its own whenever there is a missing `.wiki/me.md` at session start. Do the steps in order. `.wiki/me.md` is personal and is never committed.

## 1. Who the user is

Ask the user their name, how they want to be addressed and their role.

Write only what the user says about themselves, never anything you inferred. You may suggest a value you can see (for example the git user name), and you write it only after the user confirms it.

Done when the user has given, or declined to give, each of the three.

## 2. What they use the wiki for

Ask what they will ask the wiki and what they are working on. These become the `uses the wiki for` and `working on` lines.

If the answers name questions that `.wiki/kb_instructions.md` does not cover:

- If `.wiki/config.yml` has a `setup_completed_at`, propose them as described in `.wiki/system/WIKI.md`, section "Proposing rule changes". Never edit `.wiki/kb_instructions.md` directly, because it is shared with everyone in the repository.
- If setup is not finished, keep them for SETUP.md step 3, which drafts the questions.

Done when both lines are answered and any new questions are proposed or kept.

## 3. How they like answers

Ask the language, the answer style (for example short, or detailed with sources) and the timezone.

Done when the user has answered or skipped each.

## 4. Write me.md

Write `.wiki/me.md` from `.wiki/system/templates/me.md`. Leave out every line the user has not given a value for. Extra preferences the user gives go under a final `## Other` heading, one `key: value` line each. Show the file and wait for the user's approval before writing it.

Later changes to `.wiki/me.md` are made only with the user's approval.

Done when `.wiki/me.md` is written and approved.

## 5. Check that me.md loads

Run `wikeeper doctor`.

- If its `setup-files` check reports `.wiki/me.md` as committed or not ignored, tell the user in plain words what doctor found and not to commit `me.md`. Offer to follow the finding's `fix:` line yourself, which names the cause: a committed file, a missing ignore block, or a rule that re-includes the file; a `fix:` line that names a command is yours to run, not the user's. Follow it only with the user's approval; never remove a file from git or edit `.gitignore` without it.
- Check that doctor reports the WIKI block in every agent file.

Tell the user that from the next session on the agent reads `me.md` at the start and addresses them by their chosen name, and that if it does not, they can tell you and you will check the setup. SETUP.md step 6 re-checks this together with `project.md`.

Done when doctor reports no finding about `.wiki/me.md` and the WIKI block is present everywhere.

## 6. Continue

If `.wiki/config.yml` has no `setup_completed_at`, continue with `.wiki/system/SETUP.md, section "2. The project"`.

If `setup_completed_at` is set, onboarding is finished. Tell the user in one or two sentences what the wiki covers, from `.wiki/project.md`, and how to ask it a question.
