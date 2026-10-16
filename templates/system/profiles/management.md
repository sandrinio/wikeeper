# Management profile

This profile holds suggestions, not a structure. During SETUP.md step 3, offer only the questions, entity types and source kinds that fit `.wiki/project.md` and the user's answers. The user approves what goes into `.wiki/kb_instructions.md`. No page exists until an ingest writes it.

## Questions

Q1 Who owns or decides X?
Q2 What was decided about X, and why?
Q3 What is the status of X?
Q4 Which risks are open, and who owns them?
Q5 What does term X mean?

## Entity types

Each line reads `<entity> <fields> → <suggested page> <question refs>`. A suggested page with a `<…>` placeholder holds one entity per page. A fixed page name holds one `##` entry per entity.

person role, owns, decides → people.md Q1
project owner, status, deadline → projects/<name>.md Q1 Q3
feature owner, status, scope → features/<name>.md Q1 Q3
decision what, why, decided by, date → decisions.md Q1 Q2
risk owner, likelihood, impact, mitigation → risks.md Q4
term meaning, aliases → glossary.md Q5

## Source kinds

meeting-notes (v1) → decision, risk, project.status, person.owns
status-report (v1) → project.status, feature.status, risk
prd (v1) → feature, feature.scope, decision
contract (v1) → decision, project.deadline, term
email-thread (v1) → decision, risk, project.status
chat-excerpt (v1) → decision, risk, term

## Never capture

- Compensation.
- Health.
- Personal life.
- Performance judgements of individuals.

Ask the user what else to add.

## Private pages

Setting `private: [...]` in `.wiki/config.yml` keeps the listed pages out of git. It is off by default. Suggest it for pages about people, for example `private: [people.md]`.
