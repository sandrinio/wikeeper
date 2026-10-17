# Knowledge Base Instructions

purpose: management

## Questions this wiki must answer

Q1 What is initiative X for?
Q2 What is the status of initiative X?
Q3 What was decided about X, and why?
Q4 What changed since date D?
Q5 What is planned next?
Q6 Which risks are open?
Q7 What does Acme term X mean?

## Entities

Each line reads `<entity> <fields> → <page> <question refs>`. A page with a `<…>` placeholder holds one entity per page; a fixed page name holds one `##` entry per entity.

initiative purpose, status, plan → initiatives/<name>.md Q1 Q2 Q5
milestone what, initiative, target date, completed date, status → roadmap.md Q2 Q5
epic status → epics.md Q2 Q5
decision what, why, decided by, date → decisions.md Q3
risk owner, likelihood, impact, mitigation, status → risks.md Q6
term meaning, aliases → glossary.md Q7

Q4 has no entity of its own: every fact line is dated, so `wikeeper search --since <date>` answers it across all pages.

## Capture signals

- Decisions.
- Changes of owner or status.
- Dates and deadlines.
- Plans and next steps.
- Risks and open problems.
- New names and terms.

## Source kinds

product-state (v2) → initiative.status, milestone.status, epic.status
roadmap (v2) → milestone, epic
initiative-doc (v1) → initiative, initiative.purpose, decision, risk, term
meeting-notes (v1) → decision, risk, initiative.status, milestone
email-thread (v1) → decision, risk, initiative.status

In cleargate tracker sources, a SPRINT-NN is a milestone, an EPIC-NNN is an epic, and only an INITIATIVE-NNN is an initiative. Bugs, CRs and spikes are engineering detail and are not captured. Record each item's own status, not the heading it is listed under.

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
- Patient data: names, ID numbers, diagnoses, and images or extracts of real filled forms.
- Secrets: passwords, API keys, tokens, certificates and `.env` contents.

## Rule changelog

Seeded from the management profile; each source kind starts at v1 when it is drafted.
- 2026-10-17: questions, entities, source kinds and Never capture drafted at setup; all five source kinds start at v1.
- 2026-10-17: product-state v2, roadmap v2: sprints are milestones, epics get their own entity (epics.md), roadmap no longer targets initiatives; bugs, CRs and spikes are not captured. Reason: the part 1 roadmap ingest turned 54 epics into initiatives.
