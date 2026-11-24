# BPTE Requirements Document (excerpt)

> Rewritten from `requirements-old.md` (kept unchanged). Where this conflicts with `bpte/CLAUDE.md`, that file wins. Terms match `bpte/data-model/`.
> **Gap, noted once:** the source is an excerpt. The text of SCR-02 (cohort analysis), SCR-04 (consumer fleet health) and SCR-05 (warranty claims) is not in this repo. They are listed as Later with their IDs only. Their detail is not invented here.
> No targets, timelines or prices are set. Missing facts are `[__]`.

**Conventions**

- IDs: screen requirements SCR-nn-FR-nn; platform PLT-xx-nn; non-functional NFR-nn. Scope modules M1 to M7 as in `scope.md`.
- Priority: Must, Should, Could. Phase (confirmed): P1 Birth and join (M1), P2 Connect and see (M2), Later. These P1 and P2 replace the old P1/P2/P3 in `scope-old.md`. Anything that needs birth data or a battery record is P1 or later; BMS ingestion, health, warnings and coverage are P2.
- **Proposed, to confirm** (not fact): the roles table, the admin duties, "secret shown once" (SCR-07-FR-02), append-only vs tamper-evident audit (PLT-AD-04), SCR-01-FR-01 period options, the OPC-UA and MES/ERP deferrals (PLT-IN-03, -04), and in-app-only warnings (PLT-AL-03).
- **Platform (confirmed):** PostgreSQL, with bronze, silver and gold as separate schemas behind one storage interface; lakehouse is Later. Language TypeScript; tests Vitest.
- **Source label** on every dashboard figure, using the data-model values: **bms** (BMS-reported; shown as BMS), **calculated** (names method and version; shown as Calc), **registered** (from factory or dispatch records; shown as Reg). The tables below use the display names. Each figure also shows its freshness time.
- "Later" means kept for a later release. Not built now. IDs are never reused.

## 2. Users, roles and permissions

Roles and access below are proposed, to confirm. Access is role-based. A manufacturer is a tenant. The tenant comes from the signed-in user or the Data connector, never from the request.

| Role | SCR-01 Fleet view | SCR-03 Battery view | SCR-06 Birth data import | SCR-07 Admin |
| --- | --- | --- | --- | --- |
| Battery manager | View | View | View import results | - |
| Admin | View | View | Import | All |
| Data connector | - | - | - | Sends BMS data only (no screen) |

A dash means no access; the screen and menu entry are hidden. 82 Volts support access: [__].

Later: SCR-02 Cohort analysis, SCR-04 Consumer fleet health, SCR-05 Claims. The older roles (quality engineer, quality head, procurement, warranty officer, leadership, consumer fleet manager, consumer technician, consumer admin) are Later with those screens.

## 4. SCR-01 Fleet view

The Battery manager's home screen. Users: Battery manager, Admin.

**Layout:** menu, title with period selector, headline tiles, warnings list, fleet health chart, recent warnings table.

| ID | Requirement | Acceptance criteria | Source | Priority | Phase |
| --- | --- | --- | --- | --- | --- |
| SCR-01-FR-01 | Period selector filters every tile, list and chart | Options proposed, to confirm: last 90 days, last 12 months, all time; all panels refresh together | - | Must | P2 |
| SCR-01-FR-02 | Headline tiles: batteries in the field, fleet average Health (reported by BMS), batteries with open warnings, batteries with no recent data | Each value matches the records; each tile shows its source label and freshness; tile opens the related list pre-filtered | Field count Reg; Health BMS (`soh_reported_pct`); warnings Calc; last data Calc | Must | P2 |
| SCR-01-FR-03 | Cohort alert list | Later | - | Later | Later |
| SCR-01-FR-04 | Investigate opens SCR-02 | Later | - | Later | Later |
| SCR-01-FR-05 | Fleet SoH by build month chart (build-month grouping is a cohort view) | Later | - | Later | Later |
| SCR-01-FR-06 | Recent warnings table: battery ID, holder, rule, time detected | Newest first; paging; ID links to SCR-03; severity shown as text and icon, not colour alone | Calc | Must | P2 |
| SCR-01-FR-07 | Empty and loading states | With no warnings the list says so plainly; never stale numbers without a timestamp | - | Must | P2 |
| SCR-01-FR-08 | Data freshness | Screen shows when calculations were last refreshed and the data coverage | Calc | Should | P2 |
| SCR-01-FR-09 | Fleet list with filters by tag (for example chemistry, use case), holder and site | Filters come from tags, not fixed columns; columns show source labels | Reg, Calc | Should | P2 |

SCR-01-FR-03 to -05 keep their IDs and are Later (cohort alerts, M3).

## 6. SCR-03 Battery view

One battery's story: how it was built and how it is behaving. Users: Battery manager, Admin.

**Layout:** back link, battery ID with warning and status badges, birth record panel, deployment panel, field health tiles and SoH trend chart, cell voltage grid.

| ID | Requirement | Acceptance criteria | Source | Priority | Phase |
| --- | --- | --- | --- | --- | --- |
| SCR-03-FR-01 | Find a battery by factory ID, BMS ID or QR code | Any known ID opens the same battery; response time `[__]` | - | Must | P1 |
| SCR-03-FR-02 | Header: battery ID, spec, holder and site, active warning badges | Badges name the warning in text (for example "Warning: high temperature"); badges appear in P2 | Reg, Calc | Must | P1 |
| SCR-03-FR-03 | Birth record: build date, line, shift, cell supplier, cell lot, grade spread, EOL result and date, BMS firmware | Missing data shows "not recorded"; each field labelled Reg | Reg | Must | P1 |
| SCR-03-FR-04 | View all cell records: per cell serial, lot, OCV, IR, capacity, grade, slot | Table of every cell; exportable | Reg | Must | P1 |
| SCR-03-FR-05 | Field health tiles: Health (reported by BMS), Cycles (reported by BMS), maximum temperature in last 30 days, last data received | Each tile shows its source label and freshness; calculated `soh_pct` and `cycle_count` are not computed in the first release (Later, method `[__]`); remaining life with confidence range is Later | Health BMS (`soh_reported_pct`); Cycles BMS (`cycle_count_reported`); others per tile | Must | P2 |
| SCR-03-FR-06 | Health (reported by BMS) trend chart for this battery | Selectable range; warning events marked. Comparison to cohort and fleet is Later (M3) | BMS (`soh_reported_pct`) | Should | P2 |
| SCR-03-FR-07 | Cell voltage grid per module, outlier cells highlighted | Outlier rule configurable (default: deviation from module median beyond [__ mV]); highlight uses text and border, not colour alone | Calc | Must | P2 |
| SCR-03-FR-08 | Warning explanation in plain words: which rule, the value, and since when | Generated from the rule result; states the signal and trend | Calc | Should | P2 |
| SCR-03-FR-09 | Add to investigation (8D) | Later | - | Later | Later |
| SCR-03-FR-10 | Notify consumer | Later | - | Later | Later |
| SCR-03-FR-11 | Deployment panel: current site and holder, with history | From and to dates shown; labelled Reg | Reg | Should | P1 |
| SCR-03-FR-12 | Data coverage and ID match status | Shows coverage percent, gaps and which IDs are linked | Calc | Must | P2 |

## 7. SCR-06 Birth data import (new)

Admin loads factory files into the birth record. Users: Admin (results viewable by Battery manager).

| ID | Requirement | Acceptance criteria | Source | Priority | Phase |
| --- | --- | --- | --- | --- | --- |
| SCR-06-FR-01 | Upload a birth, test, lot or dispatch file | File kept as received (bronze); file formats `[__]` | Reg | Must | P1 |
| SCR-06-FR-02 | Validate on load and report rejects with reasons | Row-level reasons; good rows are not blocked by bad rows | - | Must | P1 |
| SCR-06-FR-03 | Show unmatched records (ID matched no battery or more than one) | List with the reason; Admin can resolve by rule in `data-model/id-matching.md` | - | Must | P1 |
| SCR-06-FR-04 | Import history | Who, when, file, rows loaded, rows rejected | - | Should | P1 |
| SCR-06-FR-05 | Unknown columns are stored, not dropped | Held in the record's extra fields | - | Must | P1 |

## 8. SCR-07 Admin (new)

Admin duties in this section are proposed, to confirm.

Users: Admin.

| ID | Requirement | Acceptance criteria | Source | Priority | Phase |
| --- | --- | --- | --- | --- | --- |
| SCR-07-FR-01 | Manage users and roles (Battery manager, Admin) | Changes audited | - | Must | P1 |
| SCR-07-FR-02 | Manage Data connectors: create, rotate secret, disable | Each connector belongs to one manufacturer; secret shown once (proposed, to confirm) | - | Must | P2 |
| SCR-07-FR-03 | Connect batteries: register a battery and its IDs | Links factory ID and BMS ID to one battery | Reg | Must | P1 |
| SCR-07-FR-04 | Warning rules and thresholds | Thresholds `[__]`; changes audited and versioned | - | Must | P2 |
| SCR-07-FR-05 | Data coverage and ingestion status per connector | Last data received, coverage, rejects | Calc | Should | P2 |
| SCR-07-FR-06 | Audit log view | Searchable | - | Must | P1 |

## 9. Platform requirements behind the screens

### Data ingestion (PLT-IN)

| ID | Requirement | Acceptance criteria | Priority | Phase |
| --- | --- | --- | --- | --- |
| PLT-IN-01 | Ingest BMS data from the Data connector: cell voltages and temperatures, current, SoC, cycles, balancing and fault events | Rate [__] messages per second; per-connector authentication; out-of-order and duplicate messages handled; unknown fields stored; raw message kept (bronze); manufacturer ID set from the connector, not the payload | Must | P2 |
| PLT-IN-02 | Buffer and replay when the connector or cloud is offline | No data loss for outages up to [__] hours | Must | P2 |
| PLT-IN-03 | Load formation, OCV, IR and EOL test data by file import (SCR-06). OPC-UA deferral: proposed, to confirm (old text had file drop or OPC-UA) | Files validated; rejects reported with reasons | Must | P1 |
| PLT-IN-04 | Load build records, lots and dispatch records by file import. MES and ERP API or extract deferral: proposed, to confirm (old text had API or extract) | Each battery linked to its cells, lots and holder; unmatched records quarantined | Must | P1 |
| PLT-IN-05 | Data quality checks with a coverage report per battery | Gaps, stuck sensors and implausible values flagged; coverage percent visible to Admin | Must | P2 |

### Analytics (PLT-AN)

| ID | Requirement | Acceptance criteria | Priority | Phase |
| --- | --- | --- | --- | --- |
| PLT-AN-01 | Health per battery: "Health (reported by BMS)" (`soh_reported_pct`, source BMS, silver). Calculated `soh_pct` (source Calc, gold) is Later; not computed in the first release. If the BMS sends no value, health shows "not recorded" | Calculated method `[__]`; validated against [__] reference capacity tests; error within [±__%]. Per-cell SoH is Later `[__]` | Must | P2 |
| PLT-AN-02 | Rule-based warnings: high temperature, cell imbalance, low or falling health (soh_low rule uses `soh_reported_pct` in the first release), repeated faults, no data | Each warning states its rule and value; thresholds `[__]`. ML detection (drift, rising IR) is Later | Must | P2 |
| PLT-AN-03 | Remaining useful life with a confidence range | Later | Later | Later |
| PLT-AN-04 | Cohort comparison engine | Later | Later | Later |
| PLT-AN-05 | Factory-to-field correlation | Later | Later | Later |
| PLT-AN-06 | Calculation versioning | Every gold result records its metric ID and calculation version; raw data kept so a result can be redone | Must | P2 |

### Warnings (PLT-AL)

| ID | Requirement | Acceptance criteria | Priority | Phase |
| --- | --- | --- | --- | --- |
| PLT-AL-01 | Rule-based warnings with severity levels, thresholds set in Admin | Rule changes audited; take effect on next evaluation; severity shown as text and icon | Must | P2 |
| PLT-AL-02 | Safety warnings delivered within a set time of the data arriving | **Unconfirmed target** ("within 5 minutes" in the old document). Not a requirement until the manufacturer confirms. If kept, a faster path is needed: [__] | Later | Later |
| PLT-AL-03 | Channels: email, SMS, webhook, Microsoft Teams | Old: in-app, email, SMS, webhook, Microsoft Teams; per-user preferences; delivery failures retried and logged. In-app only for the first release is proposed, to confirm | Later | Later |
| PLT-AL-04 | Suppress repeat warnings for the same battery and cause | Later | Later | Later |

### Administration (PLT-AD)

| ID | Requirement | Acceptance criteria | Priority | Phase |
| --- | --- | --- | --- | --- |
| PLT-AD-01 | Admin onboards consumers (holders' own tenants) and assigns batteries | Later. Recording a holder and site per battery is in SCR-03-FR-11 | Later | Later |
| PLT-AD-02 | Users, roles and sign-in | Roles as in section 2; sign-in method `[__]` (single sign-on via Entra ID and MFA to confirm) | Must | P1 |
| PLT-AD-03 | Data-sharing rules: which birth fields customers can see | Later | Later | Later |
| PLT-AD-04 | Audit log of logins, data access, imports and rule changes | Searchable; retained [__ years]; tamper-evident (as in the old document; "append-only" is proposed, to confirm) | Must | P1 |
| PLT-AD-05 | Battery passport data export | Later | Later | Later |

## 10. Data requirements

Field lists are minimums. Detail is in `bpte/data-model/data-dictionary.md`. Every record has the manufacturer ID.

| Entity | Key fields | Source | Layer | Used on |
| --- | --- | --- | --- | --- |
| Manufacturer, User, Data connector | IDs, role | Admin | Reference | SCR-07 |
| Battery (passport), Battery identifier | Battery ID; factory ID, BMS ID, QR | Birth files, Admin | Silver | All |
| Birth record | Build date, line, station, shift, spec, firmware | Birth files | Silver | SCR-03 |
| Cell, Supplier, Cell lot | Serial, lot, OCV, IR, capacity, grade, receipt date | Birth files | Silver | SCR-03 |
| Factory test result | Battery or cell, date, result, values, failure code | EOL and formation files | Silver | SCR-03 |
| Firmware record | Version over time | Birth files, BMS | Silver | SCR-03 |
| Holder, Site, Deployment | Battery, site, holder, from and to dates | Dispatch files or Admin | Silver | SCR-01, SCR-03 |
| Raw BMS message, raw factory file | As received | Connector, SCR-06 | Bronze | Not shown |
| Ingestion batch (E27) | Batch ID; one load or one connector session, for replay and lineage | Pipeline | Bronze | Not shown |
| Telemetry reading, BMS event | Battery, time, signal, value, event code | BMS | Silver | SCR-03 |
| Unmatched record | Raw ID, reason | Pipeline | Silver | SCR-06 |
| Health result | Battery, period, metric ID, value, source, calculation version | Calculated | Gold | SCR-01, SCR-03 |
| Warning, Warning rule | Battery, rule, severity, detected at | Calculated | Gold, Reference | SCR-01, SCR-03, SCR-07 |
| Data coverage | Battery, period, percent, gaps | Calculated | Gold | SCR-01, SCR-03, SCR-07 |
| Metric definition, Calculation version | Metric ID, version, formula, parameters | Admin, 82 Volts | Reference | All |
| Audit event | User, action, object, time | Platform | Reference | SCR-07 |

Later entities: cohort and cohort alert, investigation (8D), consumer-facing view and sharing rules, warranty claim and terms, passport export mapping, remaining life, notification channels, repeat suppression.

**Retention, to agree:** raw BMS data for [__ months]; birth records and health history for [__].

## 11. Non-functional requirements

| ID | Area | Requirement | Measure |
| --- | --- | --- | --- |
| NFR-01 | Scale | Support [__ batteries] at launch and [__] later, at [__ cells] per battery | Load test at [__] |
| NFR-02 | Performance | Screens and battery search load within [__] | Percentile and data size [__] |
| NFR-03 | Availability | [__] monthly for screens and APIs | Excludes announced maintenance |
| NFR-04 | Security | Encryption in transit and at rest; secrets in a vault; least-privilege roles | Penetration test, findings fixed before release |
| NFR-05 | Tenant isolation | A manufacturer never sees another's data; enforced in the data layer, not only the screen | Automated cross-manufacturer tests in every build |
| NFR-06 | Data residency | Azure India region unless the manufacturer requires otherwise | Confirmed in deployment review |
| NFR-07 | Accessibility | Keyboard use, screen reader labels, contrast; status never shown by colour alone | Audit before each release |
| NFR-08 | Responsiveness | Usable on desktop and tablet. Phone use is Later | Tested at widths [__] |
| NFR-09 | Calculation transparency | Every calculated figure shows its source label, method, version and freshness. Confidence ranges are Later | Reviewed in acceptance testing |
| NFR-10 | Observability | Monitoring across ingestion, calculation and apps; alert on pipeline delay | Dashboards `[__]` |
| NFR-11 | Recoverability | Recovery point [__], recovery time [__] | Restore tested [__] |
| NFR-12 | Replay | Silver and gold can be rebuilt from bronze | Replay test in every release |

## 12. Traceability and open items

| Scope module | Screens | Requirement groups |
| --- | --- | --- |
| M1 Birth record | SCR-03, SCR-06 | SCR-03-FR-03, -04, -11 · SCR-06-FR-01 to -05 · PLT-IN-03, -04 |
| M2 Field data and health | SCR-01, SCR-03 | SCR-01-FR-01, -02, -06 to -09 · SCR-03-FR-01, -02, -05 to -08, -12 · PLT-IN-01, -02, -05 · PLT-AN-01, -02, -06 · PLT-AL-01 |
| M3 Closed-loop quality analytics (Later) | SCR-01, SCR-02 | SCR-01-FR-03 to -05 · SCR-02-FR-01..10 (Later) · SCR-03-FR-09 · PLT-AN-04, -05 |
| M4 Consumer portal (Later) | SCR-04 | SCR-04-FR-01..11 (Later) · SCR-03-FR-10 · PLT-AL-03 |
| M5 Warranty and service (Later) | SCR-05 | SCR-05-FR-01..09 (Later) |
| M6 Compliance and passport (Later) | Export only | PLT-AD-05 |
| M7 Administration | SCR-07 | Section 2 · SCR-07-FR-01 to -06 · PLT-AD-02, -04 · (Later: PLT-AD-01, -03) |
| Other Later | - | PLT-AN-03, PLT-AL-02, -04 |

Order of module and screen IDs matches `scope.md`.

**Open items**

- [ ] Agree the `[__]` values: volumes, retention, SoH method and accuracy, thresholds, availability, performance.
- [ ] Confirm what the BMS sends (SoH, SoC, cycles, frequency) so each figure's source label is right.
- [ ] Confirm the "alerts within 5 minutes" target, or drop it.
- [ ] Confirm which formats the birth files use and how factory ID and BMS ID match.
- [ ] Confirm how deployment is recorded.
- [ ] Confirm sign-in method and 82 Volts support access.
- [ ] BMS-origin unmatched records need a P2 view (SCR-01 or SCR-07 coverage). SCR-06 covers birth-side records in P1. Not decided.
- [ ] Do the birth files carry rated capacity, for calculated SoH in P2 (PLT-AN-01)? [__]
- [ ] Holder and site (SCR-01-FR-06, SCR-03-FR-02, SCR-03-FR-11, all from P1) depend on how deployment is recorded. Not decided.
- [ ] Confirm the proposed items listed under Conventions.
- [ ] Review and sign-off: manufacturer's quality head and IT.
