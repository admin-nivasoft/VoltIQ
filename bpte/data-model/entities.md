# BPTE entities

Status: design draft (Nov 23, 2026). Platform: PostgreSQL for now (user decision). Bronze, silver and gold are separate Postgres schemas `bronze`, `silver`, `gold`; reference tables stay in `public`. Code: TypeScript, tests in Vitest.

## Phases
- **P1 "Birth and join" (M1).** Birth records and Admin entries create batteries and their identifiers. A battery exists before any BMS data arrives.
- **P2 "Connect and see" (M2).** BMS data is matched to existing batteries. BMS data never creates a battery; data that matches no battery is held in `silver.unmatched_record` until an Admin links it or a birth record arrives (then it is re-matched).

## Storage
- One storage interface per layer (bronze write/read, silver upsert/read, gold write/read). Pipelines and the API call the interface only; they never name tables or schemas directly.
- The implementation lives in `apps/api/src/data/**` and the pipelines' data layer (`apps/pipelines/src/data/**`, path to confirm by pipeline-agent). The data-boundary rule applies: only these folders import `pg`, `kysely` or a vendor SDK.
- A lakehouse (platform and table format still open) can replace the Postgres schemas later behind the same interface.
- RLS (FORCE, policy on `manufacturer_id` via `app.consumer_id`/renamed setting in `withTenant`) and non-null `manufacturer_id` apply to every table in all three schemas and in `public`.
Field-level detail: `data-dictionary.md`. ID rules: `id-matching.md`. Calculations: `metrics.md`. Existing code: `reuse.md`.

## Rules that apply to every entity
- **Tenant key.** Every record carries `manufacturer_id`, including bronze rows. It is set by the ingestion path from the authenticated Data connector or the signed-in user, never from the payload body. A record without it is rejected and logged.
- **Source label.** Every figure carries `source` = `bms` (from BMS), `calculated`, or `registered` (entered or loaded from factory/dispatch records), plus a freshness timestamp (`observed_at` or `calculated_at`).
- **Extensions.** Every bronze and silver record that comes from an outside system has `extra` (key-value document). Fields we do not recognise go there. Nothing is dropped.
- **Classifications are tags.** Chemistry, form factor, use case, grade and similar go in `tags` (key-value), not fixed columns.
- **Bronze is append-only.** Never updated or deleted. Silver and gold can be rebuilt from bronze.
- **Calculated figures** name a `metric_id` and `calc_version_id`.

## Layers
| Layer | Holds | Edited? |
| --- | --- | --- |
| Bronze | Raw messages and files exactly as received, plus receipt metadata | Never |
| Silver | Records matched to a battery, cleaned, de-duplicated, typed, tagged | Rebuilt from bronze; corrections are new versions |
| Gold | Calculated results (health, cycles, warnings, coverage) | Recomputed per calculation version |
| Reference | Tenant, users, metric definitions, calculation versions | Admin-managed; versioned, never overwritten. Every row has a non-null manufacturer_id; platform defaults are copied per manufacturer at onboarding |

## Entity list
| # | Entity | Layer | Key | Purpose |
| --- | --- | --- | --- | --- |
| E01 | Manufacturer (tenant) | Reference | `manufacturer_id` | The customer. Root of tenant separation. |
| E02 | User | Reference | `user_id` | Battery manager, Admin. Belongs to exactly one manufacturer (required, never null). 82 Volts support access model `[__]` open; not a null-tenant user row. |
| E03 | Data connector | Reference | `connector_id` | Machine login for BMS data. One manufacturer. |
| E04 | Battery (passport) | Silver | `battery_id` | One record per battery for its whole life. Created only from a birth record or an Admin entry (P1). |
| E05 | Battery identifier | Silver | (`manufacturer_id`, `id_type`, `id_value_norm`) | Factory ID, BMS ID, QR/tag IDs; links any ID to `battery_id`. |
| E06 | Birth record | Silver (from bronze file loads) | `birth_record_id` | Build date, line, station, shift, spec, firmware at build. |
| E07 | Cell | Silver | `cell_id` | Cell serial, lot, formation values, slot in battery. |
| E08 | Supplier | Silver | `supplier_id` | Cell supplier. |
| E09 | Cell lot | Silver | `lot_id` | Supplier lot, receipt date, incoming inspection. |
| E10 | Factory test result | Silver | `test_result_id` | Formation, OCV, IR, EOL test per battery or cell. |
| E11 | Firmware record | Silver | `firmware_record_id` | BMS firmware version over time (build and field updates). |
| E12 | Holder | Silver | `holder_id` | Who holds the battery (manufacturer's customer). Was `consumers`. |
| E13 | Site | Silver | `site_id` | Where a battery is deployed. |
| E14 | Deployment | Silver | `deployment_id` | Battery at site with holder, from/to dates. History kept. |
| E15 | Raw BMS message | Bronze | `raw_message_id` | Each BMS message as received. |
| E16 | Raw factory file / row | Bronze | `raw_file_id`, `raw_row_id` | Each birth, test or dispatch file and its rows as received. |
| E17 | Telemetry reading | Silver | (`manufacturer_id`, `battery_id`, `signal`, `observed_at`, `cell_index`) | Cleaned BMS values. |
| E18 | BMS event | Silver | `event_id` | Faults, balancing and other BMS events. |
| E19 | Unmatched record | Silver (quarantine) | `unmatched_id` | BMS (or other) records whose ID matched no battery or several. Never creates a battery. |
| E20 | Health result | Gold | `health_result_id` | SoH, cycles, max temperature, etc. per battery per period. |
| E21 | Warning | Gold | `warning_id` | Rule-based warning on a battery. Was `alerts`. |
| E22 | Warning rule | Reference | (`manufacturer_id`, `rule_id`, `version`) | Rule definition with thresholds `[__]`. |
| E23 | Data coverage | Gold | (`battery_id`, `period_start`) | Share of expected data received, gaps, stuck sensors. |
| E24 | Metric definition | Reference | (`manufacturer_id`, `metric_id`, `version`) | Metric dictionary entry. |
| E25 | Calculation version | Reference | `calc_version_id` | Code + parameters that produced a gold result. |
| E26 | Audit event | Reference | `audit_event_id` | Who did what. Append-only. Kept from SCR-04. |
| E27 | Ingestion batch | Bronze | `batch_id` | One load or one connector session; for replay and lineage. |

## Relationships
- Manufacturer 1..n Battery, User, Data connector, Holder, Site, Supplier.
- Battery 1..n Identifier; 1..1 Birth record (more versions allowed if the factory re-sends); 1..n Cell; 1..n Test result; 1..n Firmware record; 1..n Deployment.
- Cell n..1 Cell lot n..1 Supplier.
- Deployment n..1 Site, n..1 Holder.
- Raw BMS message 1..n Telemetry reading / BMS event (after matching) or 1 Unmatched record.
- Health result, Warning, Data coverage n..1 Battery, n..1 Calculation version, n..1 Metric definition (health) or Warning rule (warning).

## Deferred entities ("Later", IDs kept)
| Entity | Module / requirement | Status |
| --- | --- | --- |
| Cohort, cohort alert | M3, PLT-AN-04, SCR-01-FR-03..05, SCR-02 | Later |
| Investigation (8D) | M3, SCR-03-FR-09 | Later |
| Consumer-facing view, data-sharing rules | M4, PLT-AD-03, SCR-04 | Later |
| Warranty claim, warranty terms | M5, SCR-05 | Later |
| Passport export mapping | M6, PLT-AD-05 | Later |
| RUL with confidence range, ML anomaly | PLT-AN-03, PLT-AN-02 (ML part) | Later |
| Notification channels and delivery | PLT-AL-03 | Later (tables kept, see reuse.md) |
| Repeat-warning suppression | PLT-AL-04 | Later |

Supplier, lot and cell are captured now (birth data, M1). Comparison across them is Later.
