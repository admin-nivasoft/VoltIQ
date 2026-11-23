# Metric dictionary

Location: definitions and calculation versions in `public` (reference); results in `gold.*`. Calculations are TypeScript in `apps/pipelines`, tested with Vitest; `calculation_version` records the code version. D-10 trend values stay `[__]`. Metrics need BMS data, so they run in P2 "Connect and see" (M2).

Every gold figure names a metric and a calculation version. Definitions are versioned; a changed formula is a new version, old results keep their version. No thresholds or targets are set here; they are `[__]` until discovery confirms the BMS data.

## metric_definition (reference)
| Field | Type | Notes |
| --- | --- | --- |
| metric_id | text | Stable name, e.g. `soh_pct` |
| version | int | Key with metric_id |
| manufacturer_id | uuid, required | Never null. Key is (manufacturer_id, metric_id, version). Platform defaults are copied into each manufacturer at onboarding; later edits change only that manufacturer's copy |
| label | text | Plain name shown on screen |
| unit | text | |
| formula | text | Method in words or pseudo-code |
| inputs | list<text> | Silver signals or other metrics |
| source | enum(bms, calculated, registered) | |
| status | enum(draft, active, retired) | |
| created_at, created_by | timestamp, uuid | |

## calculation_version (reference)
| Field | Type | Notes |
| --- | --- | --- |
| calc_version_id | uuid | |
| manufacturer_id | uuid, required | Never null; matches the metric_definition it points to |
| metric_id, metric_version | text, int | |
| code_ref | text | Code commit or package version |
| parameters | doc | Values used (thresholds, windows) |
| created_at | timestamp | |

## Metrics, first release (all version 1, draft)
| metric_id | Label | Unit | Source | Inputs | Formula / method |
| --- | --- | --- | --- | --- | --- |
| `soc_pct` | State of charge | % | bms | BMS SoC signal | Latest valid reading in period. If the BMS does not send SoC: `[__]` |
| `cycle_count` | Cycles | count | bms or calculated | BMS cycle counter; else pack current | BMS counter if sent. Otherwise calculated: proposed, to confirm; method details `[__]` (e.g. an equivalent-full-cycle count, not sourced). Which applies `[__]` |
| `soh_pct` | Health (SoH) | % | bms or calculated | BMS SoH if sent; else capacity estimate, rated capacity (birth record) | BMS value if sent. Otherwise calculated: proposed, to confirm; method details `[__]` (capacity-vs-rated ratio is a candidate, not sourced). Capacity estimation method `[__]` (needs BMS data). Validation against reference tests `[__]` (PLT-AN-01) |
| `soh_trend` | Health trend | `[__]` | calculated | `soh_pct` history | Proposed, to confirm: least-squares slope as in SCR-04 D-10 (docs/plan-amendments.md, consumer-portal plan); window `[__]`, minimum points `[__]`, unit `[__]` for BPTE |
| `max_temp_c` | Max temperature | deg C | calculated | cell/pack temperature readings | Max of quality=ok readings in period (SCR-03-FR-05 uses 30 days) |
| `cell_voltage_spread_mv` | Cell voltage spread | mV | calculated | cell voltages | Max minus min cell voltage at the same observed_at; reported as max over period |
| `cell_voltage_outlier` | Cell voltage outlier | flag per cell | calculated | cell voltages | Deviation from module median beyond `[__ mV]` (SCR-03-FR-07) |
| `fault_count` | Faults | count | calculated | bms_event kind=fault | Count in period, by event_code |
| `energy_throughput_kwh` | Energy throughput | kWh | calculated | pack voltage, current | Proposed, to confirm; method details `[__]` (integration of pack power over time is a candidate, not sourced). Requires send interval `[__]` |
| `data_coverage_pct` | Data coverage | % | calculated | received vs expected messages | received_unique / expected x 100; expected needs BMS send frequency `[__]` |
| `last_seen_at` | Last data received | timestamp | calculated | silver received_at | Max received_at for battery |
| `rated_capacity_ah` | Rated capacity | Ah | registered | birth record | As registered |
| `build_date` | Build date | date | registered | birth record | As registered |

## Requirement-to-metric gaps
- `energy_throughput_kwh` has no requirement that asks for it. Keep as draft or drop: `[__]` lead decision.
- M2.6 usage profile has no metric defined. Inputs and formula `[__]`.

## Warning rules (first release, rule-based, all `[__]` thresholds)
| rule_id | Uses metric | Condition | Severity |
| --- | --- | --- | --- |
| `high_temp` | `max_temp_c` | above `[__]` | `[__]` |
| `cell_imbalance` | `cell_voltage_spread_mv` | above `[__]` | `[__]` |
| `soh_low` | `soh_pct` | below `[__]` | `[__]` |
| `soh_declining` | `soh_trend` | slope below `[__]` | `[__]` |
| `repeated_faults` | `fault_count` | at least `[__]` in `[__]` | `[__]` |
| `no_data` | `last_seen_at` | older than `[__]` | `[__]` |
"Alerts within 5 minutes" (PLT-AL-02) is an unconfirmed target, not a requirement here.

## Later (IDs kept)
| Metric | Requirement | Status |
| --- | --- | --- |
| Remaining useful life with range | PLT-AN-03 | Later |
| ML anomaly detection (drift, rising IR) | PLT-AN-02 (ML part) | Later |
| Cohort fade vs fleet | PLT-AN-04, M3 | Later |
| Factory-to-field correlation | PLT-AN-05 | Later |
| Per-cell SoH | PLT-AN-01 (per cell) | Later `[__]` confirm |
