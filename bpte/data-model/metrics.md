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
| `cycle_count_reported` | Cycles (reported by BMS) | count | bms (silver) | BMS cycle counter signal | Latest valid reported value. Lives in silver; never copied into gold |
| `cycle_count` | Cycles (calculated) | count | calculated (gold) | pack current | Method `[__]` (e.g. an equivalent-full-cycle count, not sourced). Not computed in the first release |
| `soh_reported_pct` | Health (reported by BMS) | % | bms (silver) | BMS SoH signal | Latest valid reported value. Lives in silver; never copied into gold |
| `soh_pct` | Health (calculated) | % | calculated (gold) | capacity estimate, rated capacity (birth record) | Method `[__]` (capacity-vs-rated ratio is a candidate, not sourced). Validation against reference tests `[__]` (PLT-AN-01). Not computed in the first release |
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

Gold is calculated-only. The serving layer joins silver (reported) and gold (calculated); every field carries its own source. For which value the health warning rules use, see "Warning rules" below.

## Fleet aggregates (version 1, draft)
Computed per manufacturer from per-battery values (silver reported values, gold per-battery results, registered records). Each aggregate is a metric_definition with source=calculated and records its own calculation_version (parameters hold the windows and bucket widths used). Batteries without a value are excluded from a distribution, and the excluded count is shown with it.

| metric_id | Label | Unit | Source | Inputs | Formula (words; symbols) |
| --- | --- | --- | --- | --- | --- |
| `batteries_registered` | Batteries registered | count | calculated | battery records | Count of battery records for the manufacturer; `N = count(battery)` |
| `batteries_no_birth_record` | Batteries without birth record | count | calculated | battery, birth_record | Batteries entered by Admin with no birth record; `count(b : birth(b) = none)` |
| `batteries_reporting` | Batteries reporting | count | calculated | `last_seen_at` | Batteries seen within window W = `[__]`; `count(b : now - last_seen_at(b) <= W)` |
| `fleet_soh_reported_mean` | Fleet health, mean (reported by BMS) | % | calculated | `soh_reported_pct` | Mean over batteries with a value; `sum(v_b)/n`, n = batteries with a value; excluded = N - n shown |
| `fleet_soh_reported_distribution` | Fleet health distribution (reported by BMS) | % / count | calculated | `soh_reported_pct` | min, median, max, and count per bucket of width `[__]` over batteries with a value; excluded count shown |
| `fleet_cycle_count_distribution` | Fleet cycles distribution (reported by BMS) | count | calculated | `cycle_count_reported` | min, median, max, and count per bucket of width `[__]` over batteries with a value; excluded count shown |
| `fleet_data_coverage_pct` | Fleet data coverage | % | calculated | per-battery received_unique, expected | Over period P = `[__]`; `sum(received_unique_b) / sum(expected_b) x 100` |
| `batteries_with_gaps` | Batteries with data gaps | count | calculated | `data_coverage_pct`, gap lengths | `count(b : data_coverage_pct(b) < [__] or max_gap(b) > [__])` |
| `unmatched_id_count` | Unmatched IDs | count | calculated | silver.unmatched_record | `count(unmatched_record : status = open)` |
| `open_warnings_by_severity` | Open warnings by severity | count per severity | calculated | warning | `count(warning : open)` grouped by severity |

## Screen metrics: gaps, connector, imports, unknown fields (version 1, draft)
Parameters: G = silence threshold `[__]`; P = period `[__]` (set per query, recorded in calculation_version parameters). Expected counts need the BMS send interval `[__]`.

| metric_id | Label | Unit | Source | Inputs | Formula (words; symbols) | Unknowns |
| --- | --- | --- | --- | --- | --- | --- |
| `data_gaps` | Data gaps (per battery) | list of intervals (from, to, hours); max in hours | calculated | silver received_at / observed_at per battery | Silences longer than G inside P. Sort received times t_1..t_n in P (include P start and end as edges); a gap is each pair where `t_(i+1) - t_i > G`; output list of `(t_i, t_(i+1), hours)`. `max_gap(b) = max(hours)`, 0 if none. This `max_gap(b)` is the one used by `batteries_with_gaps`. Uses unique messages only (duplicates ignored) | G, P |
| `data_coverage_daily_pct` | Data coverage, daily (per battery per day) | % | calculated | received_unique, expected, per day | Same formula as `data_coverage_pct` with P = one day (tenant-defined calendar day, timezone `[__]`); `received_unique_day / expected_day x 100` | send interval, day boundary timezone |
| `connector_last_seen_at` | Connector last seen | timestamp | calculated | bronze received_at per Data connector | Max received_at over messages from the connector | none |
| `connector_messages_received` | Connector messages received | count | calculated | bronze messages per connector | Count of messages received from the connector in P | P |
| `connector_messages_rejected` | Connector messages rejected | count, grouped by reason | calculated | rejected messages with reason code | Count of rejected messages in P, grouped by reason; reason list `[__]` (to match pipeline reject codes) | P, reason codes |
| `connector_data_coverage_pct` | Connector data coverage | % | calculated | per-battery received_unique, expected for batteries the connector serves | `sum(received_unique_b) / sum(expected_b) x 100`, b over batteries served by the connector, in P | P, send interval, how a battery maps to a connector `[__]` |
| `unknown_fields_received` | Unknown BMS fields received | rows: field name, messages, batteries | calculated | `extra` of bronze/silver readings | In P, list distinct unrecognised field names found in `extra`; per field `messages = count(messages containing it)`, `batteries = count(distinct battery)`. Fields stay stored, never dropped | P |
| `import_rows_loaded` | Import rows loaded | count (per ingestion batch, E27) | calculated | ingestion batch rows | Rows from the batch written to silver | none |
| `import_rows_rejected` | Import rows rejected | count (per ingestion batch, E27) | calculated | ingestion batch rows with failure | Rows from the batch failing validation; reasons `[__]` | reject reasons |
| `import_rows_unmatched` | Import rows unmatched | count (per ingestion batch, E27) | calculated | ingestion batch rows, ID matching result | Rows loaded but with no battery match (go to unmatched_record, see id-matching.md) | none |
| `soh_reported_history` | Health reported by BMS, history | series of (observed_at, %) | bms (silver) | BMS SoH signal | No calculation. Valid reported values in time order, as received; never copied into gold | range `[__]` |

## Requirement-to-metric gaps
- `energy_throughput_kwh` has no requirement that asks for it. Keep as draft or drop: `[__]` lead decision.
- M2.6 usage profile has no metric defined. Inputs and formula `[__]`.

## Warning rules (first release, rule-based, all `[__]` thresholds)
| rule_id | Uses metric | Condition | Severity |
| --- | --- | --- | --- |
| `high_temp` | `max_temp_c` | above `[__]` | `[__]` |
| `cell_imbalance` | `cell_voltage_spread_mv` | above `[__]` | `[__]` |
| `soh_low` | `soh_reported_pct` (first release, since `soh_pct` is not computed yet). When calculated health exists, which value the rule uses is `[__]` | below `[__]` | `[__]` |
| `soh_declining` | `soh_trend` | slope below `[__]`. Not active in the first release (method unconfirmed) | `[__]` |
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
