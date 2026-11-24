# BPTE data dictionary

Logical types: `uuid`, `text`, `int`, `decimal`, `bool`, `date`, `timestamp` (UTC, with zone), `doc` (key-value document), `enum(...)`, `list<T>`.
Postgres mapping (platform: PostgreSQL for now): `timestamp` = `timestamptz`, `doc` = `jsonb`, `decimal` = `numeric`, `list<T>` = array or `jsonb`, `enum` = text with CHECK. Table location: each section below is a Postgres schema: Bronze = `bronze.<table>`, Silver = `silver.<table>`, Gold = `gold.<table>`, Reference = `public.<table>`. Access only through the storage interface (see `entities.md` "Storage"). RLS and non-null `manufacturer_id` in every schema. Phase order: birth first (P1), BMS second (P2); `silver.battery` rows come from birth records or Admin entries only.
Common columns, on every table unless noted:

| Column | Type | Notes |
| --- | --- | --- |
| `manufacturer_id` | uuid, required | Tenant. Set from the verified login or connector, never from the payload. |
| `created_at` | timestamp | When the platform wrote the row. |
| `source` | enum(bms, calculated, registered) | On every table that holds figures. |
| `extra` | doc | Bronze and silver records from outside systems. Unknown fields kept here. |
| `tags` | doc | Classifications (chemistry, form factor, grade, use case...). Keys `[__]` until discovery. |
| `lineage` | doc | Silver/gold: bronze IDs or batch IDs the row came from. |

Units: SI unless the BMS sends otherwise; the raw unit is kept in bronze and the converted unit stated per field here. BMS units `[__]` until protocol documents arrive.

## Reference

### manufacturer (E01)
| Field | Type | Key | Notes |
| --- | --- | --- | --- |
| manufacturer_id | uuid | PK | |
| name | text | | First manufacturer `[__]` |
| logo_url | text, optional | | Kept from SCR-04 |
| data_region | text | | `[__]` (India residency per project docs) |

### user (E02)
| Field | Type | Key | Notes |
| --- | --- | --- | --- |
| user_id | uuid | PK | |
| manufacturer_id | uuid, required | | Never null. No null-tenant user rows |
| name, email | text | email unique | |
| role | enum(battery_manager, admin) | | Plain names: Battery manager, Admin. How 82 Volts support gets access (per-manufacturer support account, break-glass, separate ops path) is `[__]` open; it is not a null-tenant user row |

### data_connector (E03)
| Field | Type | Key | Notes |
| --- | --- | --- | --- |
| connector_id | uuid | PK | |
| manufacturer_id | uuid, required | | Never null; the connector writes only for this manufacturer |
| label | text | | |
| auth_ref | text | | Reference to the credential in the secret store; never the secret |
| status | enum(active, disabled) | | |

### metric_definition (E24) and calculation_version (E25): see `metrics.md`. Both carry a required `manufacturer_id`.

Rule: `manufacturer_id` is required and non-null on every table, reference tables included. Platform defaults are copied per manufacturer at onboarding.

### warning_rule (E22)
| Field | Type | Key | Notes |
| --- | --- | --- | --- |
| rule_id, version | text, int | PK (with manufacturer_id) | Versions never overwritten |
| manufacturer_id | uuid, required | PK | Never null; key is (manufacturer_id, rule_id, version) |
| name, description | text | | Plain words |
| metric_id | text | | Input metric |
| condition | doc | | Comparator and threshold; thresholds `[__]` |
| severity | enum(high, medium, low) | | Shown with text and icon |
| recommended_action | text | | |
| active_from | timestamp | | |
| created_by | uuid | | Audited (PLT-AL-01) |

### audit_event (E26): kept from SCR-04; `consumer_id` becomes `manufacturer_id`.

## Bronze

### ingestion_batch (E27)
| Field | Type | Key | Notes |
| --- | --- | --- | --- |
| batch_id | uuid | PK | |
| manufacturer_id | uuid | | |
| channel | enum(bms_stream, factory_file, dispatch_file, manual) | | |
| connector_id | uuid, optional | | For BMS |
| received_at | timestamp | | |
| file_name, file_hash | text, optional | | For files |
| status | enum(received, parsed, rejected) | | Reject reasons in `notes` |

### raw_bms_message (E15)
| Field | Type | Key | Notes |
| --- | --- | --- | --- |
| raw_message_id | uuid | PK | |
| manufacturer_id | uuid | | From connector |
| batch_id | uuid | | |
| connector_id | uuid | | |
| device_id_raw | text | | BMS ID exactly as sent |
| message_seq | text, optional | | Sequence number if BMS sends one `[__]` |
| device_time_raw | text, optional | | As sent |
| received_at | timestamp | | Platform clock |
| payload | doc or bytes | | Unchanged body |
| payload_hash | text | | For duplicate detection |
| schema_hint | text, optional | | Protocol/version if known `[__]` |

### raw_factory_file / raw_factory_row (E16)
| Field | Type | Key | Notes |
| --- | --- | --- | --- |
| raw_file_id | uuid | PK | file |
| raw_row_id | uuid | PK | row |
| manufacturer_id, batch_id | uuid | | |
| kind | enum(birth, cell, lot, test, firmware, dispatch, other) | | |
| row_number | int | | |
| row | doc | | Every column as received |
| row_hash | text | | |

## Silver

### battery (E04)
| Field | Type | Key | Notes |
| --- | --- | --- | --- |
| battery_id | uuid | PK | Platform ID; never shown as the only identifier |
| manufacturer_id | uuid | | |
| factory_serial | text | unique per manufacturer | Primary factory ID |
| spec | text | | Model / spec name |
| status | enum(registered, in_service, out_of_service, retired) | | `registered` = birth data only |
| tags | doc | | |
| first_seen_bms_at | timestamp, optional | | |
| source | registered | | |

### battery_identifier (E05)
| Field | Type | Key | Notes |
| --- | --- | --- | --- |
| identifier_id | uuid | PK | |
| manufacturer_id | uuid | unique with type + norm value | |
| battery_id | uuid | | |
| id_type | enum(factory_serial, bms_id, qr_tag, asset_tag, other) | | |
| id_value_raw | text | | As received |
| id_value_norm | text | | After normalisation (`id-matching.md`) |
| valid_from, valid_to | timestamp | | BMS board swap ends one, starts another |
| source | registered | | |
| link_method | enum(exact, normalised, manual) | | |
| linked_by | uuid, optional | | Admin for manual links |

### birth_record (E06)
| Field | Type | Notes |
| --- | --- | --- |
| birth_record_id, battery_id, manufacturer_id | uuid | |
| version | int | New version if factory re-sends |
| build_date | date | |
| build_line, station, shift | text | |
| firmware_at_build | text | |
| cell_count | int | |
| rated_capacity_ah, nominal_voltage_v | decimal | Values `[__]` from factory |
| eol_result | enum(pass, fail, unknown) | |
| eol_tested_at | timestamp | |
| source | registered | |
| extra, lineage | doc | |

### cell (E07)
| Field | Type | Notes |
| --- | --- | --- |
| cell_id, battery_id, manufacturer_id | uuid | |
| cell_serial | text | |
| lot_id | uuid, optional | |
| slot | text | Position (module/index) |
| ocv_v, ir_mohm, capacity_ah | decimal | Formation values |
| grade | text (also tag) | |
| formation_date | date | |
| source | registered | |

### supplier (E08), cell_lot (E09)
Two tables. Both carry a required, non-null `manufacturer_id`; a supplier or lot is never shared across manufacturers (the same real supplier is one row per manufacturer).

supplier (E08)
| Field | Type | Notes |
| --- | --- | --- |
| supplier_id | uuid | PK |
| manufacturer_id | uuid, required | |
| supplier_name | text | |

cell_lot (E09)
| Field | Type | Notes |
| --- | --- | --- |
| lot_id | uuid | PK |
| manufacturer_id | uuid, required | Must equal the supplier's manufacturer_id |
| supplier_id | uuid | |
| lot_code | text | |
| receipt_date | date | |
| inspection | doc | Incoming inspection results |

### factory_test_result (E10)
| Field | Type | Notes |
| --- | --- | --- |
| test_result_id, manufacturer_id | uuid | |
| battery_id or cell_id | uuid | One required |
| test_type | enum(formation, ocv, ir, eol, other) | |
| tested_at | timestamp | |
| result | enum(pass, fail, unknown) | |
| values | doc | Measured values with units |
| failure_code | text, optional | |
| source | registered | |

### firmware_record (E11)
| Field | Type | Notes |
| --- | --- | --- |
| firmware_record_id, battery_id, manufacturer_id | uuid | |
| version | text | |
| observed_from | timestamp | |
| source | enum(registered, bms) | From birth data or reported by BMS |

### holder (E12), site (E13), deployment (E14)
| Field | Type | Notes |
| --- | --- | --- |
| holder_id, manufacturer_id | uuid | |
| holder name, type | text, tag | Type was `oem / ess_integrator / fleet_operator`; now a tag |
| site_id, manufacturer_id, holder_id | uuid | |
| site name, location | text, doc | Location detail `[__]` |
| deployment_id, battery_id, site_id, holder_id, manufacturer_id | uuid | |
| asset_id | text, optional | Holder's own ID |
| from_date, to_date | timestamp | `to_date` null = current. Reassignment closes old row (history kept) |
| recorded_via | enum(dispatch_record, customer_entry, admin) | `[__]` which is used |
| source | registered | |

### telemetry_reading (E17)
| Field | Type | Key | Notes |
| --- | --- | --- | --- |
| manufacturer_id, battery_id | uuid | key part | |
| signal | text | key part | e.g. pack_voltage, pack_current, cell_voltage, cell_temp, soc, cycle_count. List `[__]` |
| cell_index | int, optional | key part | For per-cell signals |
| observed_at | timestamp | key part | Device time, corrected (see late data) |
| value | decimal | | Converted unit |
| unit | text | | |
| quality | enum(ok, suspect, rejected) | | Plausibility check result |
| quality_reason | text, optional | | |
| received_at | timestamp | | |
| raw_message_id | uuid | | Lineage |
| extra | doc | | Unknown fields from the message |
| source | bms | | |

### bms_event (E18)
| Field | Type | Notes |
| --- | --- | --- |
| event_id, battery_id, manufacturer_id, raw_message_id | uuid | |
| event_code | text | As sent; meaning table `[__]` |
| kind | enum(fault, balancing, other) | |
| observed_at, received_at | timestamp | |
| extra | doc | |
| source | bms | |

### unmatched_record (E19)
| Field | Type | Notes |
| --- | --- | --- |
| unmatched_id, manufacturer_id | uuid | |
| origin | enum(bms, factory, dispatch) | |
| raw_ref | uuid | raw_message_id or raw_row_id |
| id_type, id_value_raw, id_value_norm | text | |
| reason | enum(no_match, several_matches, invalid_id) | |
| candidates | list<uuid> | For several_matches |
| status | enum(open, linked, discarded) | Discarded = hidden from silver, still in bronze |
| first_seen_at, last_seen_at, count | timestamp, int | |

## Gold

### health_result (E20)
| Field | Type | Notes |
| --- | --- | --- |
| health_result_id, battery_id, manufacturer_id | uuid | |
| metric_id | text | From metric dictionary |
| value | decimal | |
| unit | text | |
| period_start, period_end | timestamp | |
| calculated_at | timestamp | Freshness |
| calc_version_id | uuid | |
| inputs_coverage | decimal | Share of expected input present |
| signals | doc | Contributing inputs (NFR-09) |
| source | calculated | Always. Gold is calculated-only |

Gold holds only calculated values. BMS-reported values (e.g. `soh_reported_pct`, `cycle_count_reported` from telemetry_reading signals) stay in silver and are never copied into gold. The serving layer joins silver (reported) and gold (calculated); every field carries its own source. Calculated `soh_pct` and `cycle_count` are not computed in the first release (method `[__]`). Fleet aggregates (metrics.md, "Fleet aggregates") record their own calc_version_id.

### warning (E21)
| Field | Type | Notes |
| --- | --- | --- |
| warning_id, battery_id, manufacturer_id | uuid | |
| rule_id, rule_version | text, int | |
| severity | enum(high, medium, low) | |
| title, description, recommended_action | text | |
| status | enum(open, acknowledged, resolved) | |
| triggered_at, acknowledged_at, resolved_at | timestamp | |
| acknowledged_by | uuid | |
| evidence | doc | Values that triggered it |
| calc_version_id | uuid | |
| source | calculated | |

### data_coverage (E23)
| Field | Type | Notes |
| --- | --- | --- |
| battery_id, manufacturer_id | uuid | |
| period_start, period_end | timestamp | |
| expected_messages | int | Needs BMS send frequency `[__]` |
| received_messages, duplicates, late, rejected | int | |
| gaps | list<doc> | from/to |
| stuck_signals | list<text> | |
| last_received_at | timestamp | |
| calc_version_id | uuid | |
| source | calculated | |

## Late, duplicate and out-of-order messages
1. **Bronze stores everything**, including duplicates and late messages. Nothing is rejected at bronze except a missing tenant.
2. **Duplicate** = same `manufacturer_id`, same normalised BMS ID, and either the same `message_seq` (if the BMS sends one) or the same `payload_hash`. Silver keeps the first received; later copies are counted in `data_coverage.duplicates`.
3. **Same key, different value** (same battery, signal, cell, observed_at): not a duplicate. Silver keeps the latest received, marks `quality = suspect`, and keeps both in bronze.
4. **Out of order**: silver orders by `observed_at`, not `received_at`. Arrival order does not matter.
5. **Late**: a message whose `observed_at` falls in a period already calculated. Silver accepts it; the gold period is marked stale and recalculated on the next run. Late window `[__]`; beyond it, the message is kept in silver but gold is only recomputed on an explicit reprocess.
6. **Device clock**: if `observed_at` is in the future beyond `[__]` or before the battery's build date, `quality = suspect` and the reading is excluded from gold. Rule tolerance `[__]`.
7. **Missing device time**: use `received_at`, flag `quality = suspect`, reason `no_device_time`.
8. **Reprocessing** replays bronze for a battery and period; it is idempotent (same input gives the same silver and gold rows).
