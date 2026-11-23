# Closed-Loop Quality Platform — Requirements Document (excerpt)

> Source: older SCR-era requirements (Nov 13, 2026), converted to Markdown for `bpte/docs/`.
> **This is an excerpt.** Kept in full: roles, SCR-01, SCR-03, platform requirements (PLT-IN, PLT-AN, PLT-AL, PLT-AD), data requirements, non-functional requirements, traceability. **Left out** (Later for BPTE, or already in `docs/` from the SCR-04 build): SCR-02 Cohort analysis, SCR-04 Consumer fleet health, SCR-05 Warranty claim review. The full text is in the 82 Volts project docs.
> Where this conflicts with `bpte/CLAUDE.md`, that file wins.

**Conventions**

- IDs: screen requirements are SCR-nn-FR-nn; platform requirements PLT-xx-nn; non-functional NFR-nn.
- Priority: Must, Should, Could. Phase: P1 pilot, P2 core loop, P3 extend.
- Sample values in the prototype are illustrative. Bracketed items such as [__ hours] are to be agreed with the client.

## 2. Users, roles and permissions

Access is role-based and tenant-scoped. A manufacturer is a tenant. Each consumer is a sub-tenant that sees only the packs assigned to it.

| Role | Tenant | SCR-01 Overview | SCR-02 Cohorts | SCR-03 Pack 360 | SCR-04 Fleet health | SCR-05 Claims |
| --- | --- | --- | --- | --- | --- | --- |
| Quality engineer | Manufacturer | View | View, open investigation | View, add to investigation, notify consumer | View any consumer (read-only) | View |
| Quality head | Manufacturer | View | All quality actions, propose limit change | All | View (read-only) | View |
| Procurement | Manufacturer | View | View, export supplier evidence | View birth record | — | — |
| Warranty officer | Manufacturer | View | View | View | View (read-only) | Decide: approve, request info, reject |
| Leadership | Manufacturer | View | View | View | — | View |
| Manufacturer admin | Manufacturer | All | All | All | View (read-only) | View, plus user, consumer and rule setup (PLT-AD) |
| Consumer fleet manager | Consumer | — | — | — | View own packs, acknowledge alerts | Raise and track own claims |
| Consumer technician | Consumer | — | — | — | View own packs | Raise claims |
| Consumer admin | Consumer | — | — | — | All, plus own users | All own claims |

A dash means no access: the screen and its menu entry are hidden.

## 4. SCR-01 Quality overview

The manufacturer's home screen. Users: all manufacturer roles.

**Layout:** sidebar menu · title with period selector · four headline tiles · cohort alert list with Investigate buttons · fleet SoH chart by build month · recent pack anomalies table.

| ID | Requirement | Acceptance criteria | Priority | Phase |
| --- | --- | --- | --- | --- |
| SCR-01-FR-01 | Period selector filters every tile, list and chart on the screen | Options: last 90 days, last 12 months, all time; changing it refreshes all panels within 3 s | Must | P2 |
| SCR-01-FR-02 | Headline tiles: packs in the field, fleet average SoH, open cohort alerts, warranty claims in the period | Each value matches the underlying records; clicking a tile opens the related screen pre-filtered | Must | P1 |
| SCR-01-FR-03 | Cohort alert list, sorted by severity then pack count | Each row shows severity (High, Medium, Low as text and colour), cohort name, finding and affected pack count | Must | P2 |
| SCR-01-FR-04 | Investigate opens SCR-02 with that alert's cohort selected | The cohort tab and side panel on SCR-02 show the chosen alert | Must | P2 |
| SCR-01-FR-05 | Fleet SoH by build month chart | One line per build month, SoH against months in service; hover shows value and pack count | Should | P2 |
| SCR-01-FR-06 | Recent pack anomalies table: pack serial, consumer, signal, time detected | Newest first; 10 rows with paging; serial links to SCR-03 for that pack | Must | P1 |
| SCR-01-FR-07 | Empty and loading states | With no alerts the list says so plainly; panels show a loading state, never stale numbers without a timestamp | Must | P1 |
| SCR-01-FR-08 | Data freshness | The screen shows when analytics were last refreshed | Should | P2 |

## 6. SCR-03 Pack 360

One pack's complete story: how it was built and how it is behaving. Users: quality, procurement (birth record only), warranty.

**Layout:** back link to the cohort · pack serial with anomaly and status badges · Add to investigation and Notify consumer buttons · birth record panel · field health tiles and SoH trend chart · cell voltage grid for the affected module.

| ID | Requirement | Acceptance criteria | Priority | Phase |
| --- | --- | --- | --- | --- |
| SCR-03-FR-01 | Find a pack by serial number or by scanning its QR code | Exact serial match opens the pack in under 2 s; QR scan works on a tablet camera | Must | P1 |
| SCR-03-FR-02 | Header: serial, pack spec, owning consumer and site, active anomaly badges | Badges name the anomaly in text (e.g. "Anomaly: cell 37") | Must | P1 |
| SCR-03-FR-03 | Birth record: build date, line, shift, cell supplier, cell lot, grade spread, EOL result and date, BMS firmware, dispatched-to | A field on an active cohort alert is marked as such; missing data shows "not recorded" | Must | P2 |
| SCR-03-FR-04 | View all cell records: per cell serial, lot, OCV, IR, capacity, grade, slot | Table of every cell in the pack; exportable | Must | P2 |
| SCR-03-FR-05 | Field health tiles: SoH, cycles, estimated remaining life, maximum temperature in last 30 days | Remaining life shows its confidence range; tiles show last-updated time | Must | P1 |
| SCR-03-FR-06 | SoH trend chart: this pack against its cohort and the fleet | Selectable range; anomaly events marked on the timeline | Should | P1 |
| SCR-03-FR-07 | Cell voltage grid per module, outlier cells highlighted | Outlier rule configurable (default: deviation from module median beyond [__ mV]); highlight uses text and border, not colour alone | Must | P1 |
| SCR-03-FR-08 | Anomaly explanation in plain words, e.g. how far a cell sits below its neighbours and since when | Generated from the detection result; states the signal and the trend | Should | P2 |
| SCR-03-FR-09 | Add to investigation links the pack to an open 8D record | User picks from open investigations or creates one | Should | P2 |
| SCR-03-FR-10 | Notify consumer sends a service advisory to the owning consumer | Appears in SCR-04 alerts and by the consumer's chosen channel; button confirms when sent; action audited | Must | P2 |

## 9. Platform requirements behind the screens

### Data ingestion (PLT-IN)

| ID | Requirement | Acceptance criteria | Priority | Phase |
| --- | --- | --- | --- | --- |
| PLT-IN-01 | Ingest BMS telemetry from edge gateways over MQTT: cell voltages and temperatures, current, SoC, cycles, balancing and fault events | Sustains [__] messages per second; per-device authentication; out-of-order and duplicate messages handled | Must | P1 |
| PLT-IN-02 | Buffer and replay when the gateway or cloud is offline | No data loss for outages up to [24] hours | Must | P1 |
| PLT-IN-03 | Load formation, OCV, IR and EOL test data by file drop or OPC-UA | Files validated; rejects reported with reasons | Must | P2 |
| PLT-IN-04 | Load MES build records, ERP lots and dispatch records by API or extract | Daily at minimum; each pack linked to its cells, lots and consumer | Must | P2 |
| PLT-IN-05 | Data quality checks with a coverage report per pack | Gaps, stuck sensors and implausible values flagged; coverage % visible to admins | Must | P1 |

### Analytics (PLT-AN)

| ID | Requirement | Acceptance criteria | Priority | Phase |
| --- | --- | --- | --- | --- |
| PLT-AN-01 | SoH estimate per pack and per cell | Validated against [**] reference capacity tests; error within [±**%] | Must | P1 |
| PLT-AN-02 | Anomaly detection: cell drift, rising IR, abnormal temperature, repeated faults | False-alert rate agreed in pilot; each anomaly states its signal and evidence | Must | P1 |
| PLT-AN-03 | Remaining useful life with a confidence range | Range shown wherever RUL is shown | Should | P2 |
| PLT-AN-04 | Cohort comparison engine across birth-record attributes | Daily recompute; statistical test and minimum pack count before an alert is raised | Must | P2 |
| PLT-AN-05 | Factory-to-field correlation: which test values predict early fade | Results reviewed by client engineers before any limit is proposed | Should | P3 |
| PLT-AN-06 | Model versioning | Every result records the model version that produced it | Must | P1 |

### Alerts and notifications (PLT-AL)

| ID | Requirement | Acceptance criteria | Priority | Phase |
| --- | --- | --- | --- | --- |
| PLT-AL-01 | Rule-based alerts with severity levels, thresholds set in admin | Rule changes audited; take effect on next evaluation | Must | P1 |
| PLT-AL-02 | Safety alerts delivered within [5] minutes of the triggering data arriving | Measured end to end in testing | Must | P1 |
| PLT-AL-03 | Channels: in-app, email, SMS, webhook, Microsoft Teams for manufacturer users | Per-user preferences; delivery failures retried and logged | Must | P2 |
| PLT-AL-04 | Suppress repeat alerts for the same pack and cause | No duplicate notification within [24] hours unless severity rises | Should | P2 |

### Administration (PLT-AD)

| ID | Requirement | Acceptance criteria | Priority | Phase |
| --- | --- | --- | --- | --- |
| PLT-AD-01 | Manufacturer admin onboards consumers and assigns packs to them | Assignment by dispatch record or bulk upload; reassignment keeps history | Must | P2 |
| PLT-AD-02 | User and role management, single sign-on via Entra ID, MFA | Roles as in section 2; consumer users may use their own identity provider or email sign-in | Must | P2 |
| PLT-AD-03 | Data-sharing rules: which birth-record fields consumers can see | Default: none beyond pack spec and build date | Must | P2 |
| PLT-AD-04 | Audit log of logins, data access, exports and decisions | Searchable; retained [__ years]; tamper-evident | Must | P2 |
| PLT-AD-05 | Battery passport data export per pack | Fields mapped to the applicable regulation; validated by the client's compliance team | Could | P3 |

## 10. Data requirements

Field lists are minimums; the detailed data model follows in design.

| Entity | Key fields | Source | Used on |
| --- | --- | --- | --- |
| Supplier | ID, name | ERP | SCR-02, SCR-03 |
| Cell lot | Lot ID, supplier, receipt date, incoming inspection results | ERP, incoming QC | SCR-02, SCR-03 |
| Cell | Serial, lot, OCV, IR, capacity, grade, formation date | Formation and aging equipment | SCR-03 |
| Pack | Serial, spec, build date, line, station, shift, BMS firmware, cell-to-slot map | MES | All screens |
| EOL test | Pack serial, date, result, measured values, failure code | EOL rigs | SCR-03 |
| Consumer | ID, name, sites, users, sharing rules | Platform admin | SCR-04, SCR-05 |
| Assignment | Pack, consumer, site, asset ID, dispatch date, warranty terms | Dispatch records, consumer | SCR-03, SCR-04, SCR-05 |
| Telemetry | Pack, timestamp, cell voltages and temperatures, current, SoC, events | BMS via gateway | SCR-03, SCR-05 |
| Health result | Pack or cell, date, SoH, RUL with range, model version | Analytics | SCR-01, SCR-03, SCR-04 |
| Anomaly | Pack, cell, type, severity, detected at, evidence, status | Analytics | SCR-01, SCR-03, SCR-04 |
| Cohort alert | Grouping, cohort, finding, fade vs fleet, packs affected, status | Analytics | SCR-01, SCR-02 |
| Investigation | ID, cohort, linked packs, owner, status, actions | Platform workflow | SCR-02, SCR-03 |
| Warranty claim | ID, pack, consumer, issue, evidence pack, decision, reason, dates | Consumer, platform workflow | SCR-04, SCR-05 |
| Audit event | User, action, object, time | Platform | Admin |

**Retention, to agree:** raw telemetry at full resolution for [__ months], then downsampled; birth records, health history and claims for the warranty period plus [__ years].

## 11. Non-functional requirements

| ID | Area | Requirement | Measure |
| --- | --- | --- | --- |
| NFR-01 | Scale | Support [__ packs] at launch and [**] within 3 years, at [** cells] per pack | Load test at 2× the 3-year volume |
| NFR-02 | Performance | Screens load in under 3 s; pack search under 2 s | 95th percentile, production-sized data |
| NFR-03 | Availability | Portals and APIs [99.5%] monthly | Excludes announced maintenance |
| NFR-04 | Security | Encryption in transit and at rest; secrets in Key Vault; managed identities; least-privilege roles | Annual penetration test, findings fixed before release |
| NFR-05 | Tenant isolation | Enforced in the data layer, not only the UI | Automated cross-tenant tests in every build |
| NFR-06 | Data residency | Hosted in an Azure India region unless the client requires otherwise | Confirmed in deployment review |
| NFR-07 | Accessibility | WCAG 2.1 AA: keyboard use, screen reader labels, contrast, status never shown by colour alone | Audit before each release |
| NFR-08 | Responsiveness | Usable on desktop and tablet; consumer portal usable on phone | Tested at 390, 768 and 1440 px widths |
| NFR-09 | Model transparency | Every SoH, RUL and anomaly result shows confidence and contributing signals | Reviewed in user acceptance testing |
| NFR-10 | Observability | Monitoring and tracing across ingestion, analytics and apps; alerts on pipeline delay | Dashboards in Azure Monitor and Application Insights |
| NFR-11 | Recoverability | Recovery point [1 h], recovery time [4 h] | Restore tested twice a year |

## 12. Traceability and open items

| Scope module | Screens | Requirement groups |
| --- | --- | --- |
| M1 Genealogy and birth record | SCR-03 | SCR-03-FR-03, -04 · PLT-IN-03, -04 |
| M2 Field telemetry and health | SCR-01, SCR-03, SCR-04 | SCR-03-FR-05 to -07 · PLT-IN-01, -02, -05 · PLT-AN-01 to -03 |
| M3 Closed-loop quality analytics (Later) | SCR-01, SCR-02 | SCR-01-FR-03 to -05 · SCR-02-FR-01 to -10 · PLT-AN-04, -05 |
| M4 Consumer portal (Later) | SCR-04 | SCR-04-FR-01 to -11 · PLT-AL-03 |
| M5 Warranty and service (Later) | SCR-05 | SCR-05-FR-01 to -09 |
| M6 Compliance and passport (Later) | — (export only) | PLT-AD-05 |
| M7 Administration | All | Section 2 · PLT-AD-01 to -04 · PLT-AL-01 |

**Open items**

- [ ] Agree the bracketed values: pack volumes, alert latency, retention, SoH accuracy target, availability.
- [ ] Confirm which birth-record fields consumers may see by default.
- [ ] Confirm the warranty terms model: years, cycles, SoH threshold, or a mix.
- [ ] Choose the 8D/CAPA tool to integrate with, or confirm the platform holds investigations itself.
- [ ] Confirm consumer sign-in: their own identity provider or email sign-in.
- [ ] Confirm markets served and whether a battery passport is required.
- [ ] Review and sign-off: client quality head, warranty lead and IT.
