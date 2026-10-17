# Knowledge Base Instructions

purpose: management

## Questions this wiki must answer

Q1 Why does initiative X exist, and who asked for it?
Q2 Where does initiative X stand today?
Q3 What was agreed about X, and on what grounds?
Q4 What has changed since a given date?
Q5 What comes next, and when?
Q6 Which risks are still open?
Q7 What does the team mean by term X?

## Entities

Each line reads `<entity> <fields> → <page> <question refs>`. A page with a `<…>` placeholder holds one entity per page; a fixed page name holds one `##` entry per entity.

initiative purpose, sponsor, status, plan → initiatives/<name>.md Q1 Q2 Q5
milestone what, initiative, target date, completed date, status → roadmap.md Q2 Q5
epic goal, status → epics.md Q2 Q5
decision what, why, decided by, date → decisions.md Q3
risk owner, likelihood, impact, mitigation, status → risks.md Q6
term meaning, aliases → glossary.md Q7

Q4 is answered by the dated fact lines on every page, through `wikeeper search --since <date>`, so it needs no entity of its own.

## Capture signals

- Decisions and the reasons given.
- New owners and status changes.
- Target dates and slipped dates.
- Plans and next steps.
- Risks, blockers and open problems.
- New names, acronyms and terms.

## Source kinds

status-update (v2) → initiative.status, milestone.status, epic.status
roadmap (v2) → milestone, epic
initiative-doc (v1) → initiative, initiative.purpose, decision, risk, term
meeting-notes (v1) → decision, risk, initiative.status, milestone
email-thread (v1) → decision, risk, initiative.status

In tracker exports, a sprint is a milestone, an epic is an epic, and only a top-level initiative is an initiative. Bugs and chores are engineering detail and are not captured. Record each item's own status, not the heading it sits under.

## Write policy

- Status and dates keep their history.
- The newest decided fact wins the summary.
- Tentative facts never change the summary.
- Every fact is cited.
- Contradictions are flagged with both sources, never overwritten.

## Never capture

- Compensation.
- Health.
- Personal life.
- Performance judgements of individuals.
- Customer data: names, emails, phone numbers and account details.
- Secrets: passwords, API keys, tokens, certificates and `.env` contents.

## Rule changelog

Seeded from the management profile; each source kind starts at v1 when it is drafted.
- 2026-10-17: questions, entities, source kinds and Never capture drafted at setup; all five source kinds start at v1.
- 2026-10-17: status-update v2, roadmap v2: sprints are milestones, epics get their own entity (epics.md), roadmap no longer targets initiatives; bugs and chores are not captured. Reason: the first roadmap ingest filed every epic as an initiative.
