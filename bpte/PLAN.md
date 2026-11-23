# BPTE docs-first plan

Status: **approved and run (2026-11-23).** Results, open items and decisions are in `bpte/STATUS.md`. No code, no commit, no push.

## Gap to resolve first
The "Scope" and "Requirements" documents are **not in this repo**. `bpte/docs/` is empty. The only docs are `docs/architecture-plan.md`, `docs/plan-amendments.md`, `docs/build-steps.md`, `docs/DEMO.md` (all SCR-04). Without the originals, docs-agent can only write new documents from `bpte/CLAUDE.md`, not rewrite. See Q1.

## What changes in the docs
Written new in `bpte/docs/` (M1 and M2 only):
- `scope.md`: what is in and out of the first release, users, data layers, what "done" means. Source: `bpte/CLAUDE.md` sections "First release", "Users", "Data principles".
- `requirements.md`: numbered requirements for M1 (birth record) and M2 (field data and health). Each one has a source label and a status. Facts we lack are `[__]`.

Written in `bpte/data-model/`:
- `entities.md`, `data-dictionary.md`, `id-matching.md`, `metrics.md`
- `reuse.md`: existing code kept, changed, dropped; old tests to retire.

## What is deferred ("Later", IDs kept)
M3 cohort analytics, recall scoping, 8D; M4 consumer portal; M5 warranty; M6 passport export; ML predictions; native mobile apps; supplier, lot and line comparison; consumer API and claims workflow. Each appears once in a "Later" table with its ID and no detail.

## No-numbers rule
No targets, timelines, effort, prices or thresholds. "Alerts within 5 minutes" is listed as an unconfirmed target, not a requirement. Missing facts are `[__]`.

## Agent tasks (file paths only, each reports in 15 lines or fewer)
1. **data-model-agent (opus)**. Read: `db/migrations/*`, `db/seed/seed.sql`, `packages/contracts/src/*`, `bpte/CLAUDE.md`. Write: `bpte/data-model/*`. Cover: entities (manufacturer, battery, passport, cell, supplier lot, build record, test result, firmware, BMS reading, deployment, holder, warning, metric); bronze/silver/gold tables; manufacturer ID on every record; ID matching rules and unmatched-record handling; metric dictionary with method and version; unknown BMS fields stored. List kept, changed, dropped. List old tests that forbid supplier or lot data: `apps/api/src/modules/fleet/endpoints.int.test.ts` (supplier canary), D-12 checks, and the guard hook supplier rule. **Design only: no migrations or contracts edited in this pass.**
2. **docs-agent (sonnet)**. Read: `bpte/CLAUDE.md`, `bpte/data-model/*`, `docs/architecture-plan.md` (headings only). Write: `bpte/docs/scope.md`, `bpte/docs/requirements.md`.
3. **review-agent (sonnet)**, last. Read-only. Compare `bpte/docs/*` and `bpte/data-model/*` to `bpte/CLAUDE.md`. Report contradictions and unsupported claims, by severity.

Fix rounds: at most 2. After round 2, remaining findings go to STATUS as open.

## Deliverable
`bpte/STATUS.md`: done, unverified, open questions, decisions that need you, and "Decisions taken".

## Questions before I start
1. **Q1:** Where are the old Scope and Requirements documents? Give me a path to add, or confirm I write them new.
2. **Q2:** The data-model-agent is told "design only". Is that right, or should it also write the new migration and contracts now? (CLAUDE.md says it owns them; your command says no code yet.)

Approve, or answer the two questions, and I'll run step 2.
