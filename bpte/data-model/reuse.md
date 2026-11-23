# Reuse of existing code

Design only. No migration or contracts file edited in this pass. Applied migrations `db/migrations/1731510000001..0004` stay as they are; every change below is a new migration later.

## Kept
| Item | Where | Why |
| --- | --- | --- |
| `manufacturers` table | 0001 | Becomes the tenant (E01) |
| RLS pattern: ENABLE + FORCE, `ql_visible()`, `set_config(..., true)` in `withTenant` | 0002 | Same isolation, new key |
| `ql_app` owns nothing; column-level grants | 0003 | Unchanged principle |
| `audit_events` append-only, `audit_platform_event()` | 0001, 0003 | Kept; tenant column changes |
| `role_policies` versioned, `role_policy_publish()` | 0001, 0003 | Kept; role names change |
| `auth_find_user()` | 0003 | Kept; returns manufacturer_id |
| `common.ts`, `error.ts`, `page.ts`, `openapi.ts`, `me.ts` | packages/contracts/src | Shape rules unchanged; `me` gets manufacturer and new roles |
| `notification_*` tables, `notifications.ts` | 0001, 0004 | Kept, marked Later (PLT-AL-03) |

## Changed (by new migrations / contracts edits)
| From | To | Change |
| --- | --- | --- |
| `app.consumer_id`, `ql_visible(cid)` | `app.manufacturer_id` | New function or replace `ql_visible` body in a new migration; fails closed as now |
| `consumers` | `holder` (E12) | No longer the tenant. Gets `manufacturer_id` as tenant key; `type` becomes a tag |
| `users.consumer_id`, roles | `users.manufacturer_id`; manufacturer_id NOT NULL; roles battery_manager, admin (82 Volts support access `[__]` open, not a null-tenant row) | Data connector is a separate entity, not a user |
| `packs` | `battery` (E04) + `battery_identifier` (E05) + `deployment` (E14) | serial -> factory_serial; asset_id -> deployment; `warranty_expires_on` moves to Later (M5) |
| `pack_health` | `health_result` (E20) | One row per metric; `model_version` -> `calc_version_id`; `signals` kept |
| `alerts` | `warning` (E21) + `warning_rule` (E22) | Adds rule_id/version, evidence |
| `list_consumer_ids()` | `list_manufacturer_ids()` | For pipelines |
| `fleet.ts`, `alerts.ts`, `policy.ts` | Fleet view, Battery view, warning, roles | Add `source` and freshness on every figure |
| `db/seed/seed.sql` | New synthetic seed | Owned with test-data-agent; canary consumers B/C become canary manufacturers |

## Dropped
| Item | Reason |
| --- | --- |
| RUL columns in `pack_health` (`rul_months_low/high`) as a first-release figure | RUL is Later (PLT-AN-03). Old rows kept, not shown |
| `consumers.type` CHECK list | Becomes a tag |
| Consumer-portal-only contract fields (warranty status on fleet list) | M4/M5 Later |
No table is deleted; old tables stay until a later migration retires them after data is moved.

## Old checks that forbid supplier or lot data (retire or narrow)
| Check | File | Action |
| --- | --- | --- |
| Contracts must not contain supplier/cohort/cell_lot (D-12) | `packages/contracts/test/no-internal-data.test.ts` | Retire for manufacturer schemas; keep a narrowed version for the Later consumer view |
| Canary crawl regex `supplier|cohort|cell lot` on OpenAPI doc | `apps/api/src/modules/fleet/endpoints.int.test.ts` (line ~354) | Drop the supplier/lot part; keep the cross-tenant canary part |
| D-12 RLS tests and canary seed | `apps/api/src/data/__tests__/rls.int.test.ts` | Keep isolation tests; re-key to manufacturer |
| Guard hook supplier rule | `.claude/hooks/guard.mjs` (rule 4) | Already marked retired; confirm removed |
| Reviewer "forbidden data" item | `.claude/agents/tenant-security-reviewer.md` item 6 | Narrow to the consumer view |
| Plan text | `docs/plan-amendments.md` D-12, `docs/architecture-plan.md` lines ~120, ~188, `docs/build-steps.md` | History; leave, note superseded |
| Auditor FR-04 note | `.claude/agents/requirements-auditor.md` | Old SCR-04; leave as history |
These files are outside `bpte/data-model/`; the owning agents or the lead make the change.
