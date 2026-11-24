# BPTE status

Updated: 2026-11-23. Pass: docs-first, **complete** (both fix rounds used). No code, migrations or contracts changed. Nothing committed or pushed.

## Done
- `bpte/PLAN.md` approved.
- `bpte/data-model/`: `entities.md`, `data-dictionary.md`, `id-matching.md`, `metrics.md`, `reuse.md`.
- `bpte/docs/scope.md`, `bpte/docs/requirements.md` rewritten from the `-old` files (unchanged).
- User decisions 1 to 6 applied in docs and data model (see "Decisions taken").
- Review 1: 0 blockers, 5 major, 6 minor, fixed in round 1.
- Review 2 (final, round 2): 0 blockers, 3 major, 5 minor, **left open below** (no fix rounds left).
- `reuse.md` checked against the code: every cited test and check exists and is correctly described, except one placement error (open item 8).
- Old ID ranges SCR-02-FR-01..10, SCR-04-FR-01..11, SCR-05-FR-01..09 checked against `requirements-old.md:154-156` by the lead.

## Open findings from the final review (not fixed)
Major:
1. **Answered (user, 2026-11-23):** gold stays calculated-only. BMS-reported SoH and cycles live in silver (`soh_reported_pct`, `cycle_count_reported`, labelled "reported by BMS"); the serving layer joins silver and gold and every field carries its own source. `metrics.md` and `data-dictionary.md` updated; `scope.md:102` and `requirements.md:62` still say "bms or calculated" and need the same split.
2. `entities.md:57` data_coverage key lacks `manufacturer_id`. Most tables use a bare uuid PK, and no composite tenant FK rule is stated. Fix: add one rule (tenant-composite FKs) or add `manufacturer_id` to every key. Lead's recommendation: one stated rule plus composite FKs (safer for isolation).
3. SCR-07 is confirmed, but `scope.md:76,147` and `requirements.md:85` still say its duties are "proposed". Pending your answers on the line-11 list.

Minor:
4. M2.7 (deployment, holder) sits under M2 but is delivered in P1. M2.6 usage profile and `energy_throughput_kwh` have no requirement.
5. M7.2 (roles, sign-in) and M7.4 (audit) are marked Later, but PLT-AD-02/04 and SCR-07-FR-01/06 are Must in P1.
6. The tenant setting name differs: `entities.md:13` says `app.consumer_id`, `reuse.md:20` says `app.manufacturer_id`.
7. `metrics.md:37` cites D-10 as a method, with its values kept `[__]` as you decided. No action.
8. `reuse.md:43` lists `rls.int.test.ts` under "forbids supplier/lot". It is a tenant canary (keep it); only the placement is wrong.
- Missed by `reuse.md`: `.claude/agents/test-engineer.md:9` cites D-12 as a test source. Needs a history note.

## Old checks to retire or narrow (verified in code)
| Check | Location | Action |
| --- | --- | --- |
| Contracts/OpenAPI/migrations/seed ban on supplier, cohort, cell lot | `packages/contracts/test/no-internal-data.test.ts:8-50` | Retire for manufacturer schemas; keep a narrowed version for the Later consumer view |
| OpenAPI regex `supplier\|cohort\|cell lot` | `apps/api/src/modules/fleet/endpoints.int.test.ts:354` | Drop the data-class part; keep the cross-tenant canary |
| Guard hook rule 4 | `.claude/hooks/guard.mjs:62-64` | Already retired |
| Reviewer item 6 "Forbidden data" | `.claude/agents/tenant-security-reviewer.md:20` | Narrow to the consumer view |
| Test source pointer to D-12 | `.claude/agents/test-engineer.md:9` | History note |
| Plan text | `docs/architecture-plan.md:30,120,188`, `docs/plan-amendments.md:112`, `docs/build-steps.md:28` | History; mark superseded |
| Keep (tenant canary, not a data ban) | `apps/api/src/data/__tests__/rls.int.test.ts:252-256`, `db/seed/seed.sql:22,41,75` | Re-key to manufacturer |

## Unverified
- The first data-model run was interrupted. Its files were reviewed twice since.
- The `scope.md` / `requirements.md` drafts existed before docs-agent ran (origin unknown). They were checked, fixed and reviewed twice.
- The pipelines' data-layer path `apps/pipelines/src/data/**` is assumed. pipeline-agent to confirm.
- Requirement tables show `BMS/Calc/Reg` as display names for `bms/calculated/registered`.
- The M3 to M6 sub-ID titles paraphrase `scope-old.md`.

## Decisions that need you
1. The line-11 list (7 items, sent in chat): roles and 82 Volts support access, admin duties and warning-rule ownership, "secret shown once", append-only vs tamper-evident audit, period options, file-only factory intake, in-app-only warnings.
2. Open finding 1: can SoH and cycles carry a `bms` source in gold?
3. Open finding 2: the tenant key rule (lead recommends composite tenant FKs).
4. Whether `bpte/CLAUDE.md` should drop "Platform and table format" from its open questions (now decided). The lead has not edited it.

## Open questions (discovery)
- First manufacturer and batteries.
- BMS fields, frequency, units, interface; protocol documents.
- Birth data format; does it carry rated capacity? How does the factory ID relate to the BMS ID? (Exact match only for now.)
- How deployment is recorded; the source of holder and site in P1.
- Where BMS data that matches no battery is shown in P2. Who besides Admin can resolve it?
- The battery manager's first five questions.
- Contract rights to field data from batteries owned by the manufacturer's customers.
- Retention, volumes, availability, sign-in method, 82 Volts support access.

## Decisions taken
- **User, 2026-11-23:** PostgreSQL for now. Bronze/silver/gold are separate schemas behind one storage interface; lakehouse later.
- **User:** TypeScript and Vitest.
- **User:** birth data first (P1 Birth and join, M1), BMS second (P2 Connect and see, M2).
- **User:** exit criteria kept as `[__]` placeholders.
- **User:** SCR-06 and SCR-07 confirmed for the first release.
- **User:** D-10 trend values stay `[__]`.
- **User:** data model is design only this pass.
- **Lead:** unknown numbers stay `[__]`; unsourced formula methods are marked "proposed, to confirm".
- **Lead:** ID matching is exact match only until protocol documents arrive (safer: avoids merging distinct batteries).
