# Closed-Loop Quality Analytics — Scope Document

> Source: older SCR-era scope (Nov 13, 2026). Wider than BPTE. For BPTE, M1 and M2 are the target; M3 to M7 are "Later". Where this conflicts with `bpte/CLAUDE.md`, that file wins.

## 1. Purpose and background

This document defines the scope of a Closed-Loop Quality Analytics platform. The platform links each battery's manufacturing history to its performance in the field, so that early failures are traced to their root cause and fixed at the source.

Today a battery manufacturer holds two disconnected datasets. Factory systems know which cells, supplier lots, test results, line and shift went into each pack. Per-battery telemetry shows how each pack performs, ages and fails at the customer's site. Because nothing connects the two, root-cause analysis is manual and slow, and the same defect can keep getting built into new packs for months.

The platform serves two user groups:

- **Battery manufacturers:** quality, production, procurement, warranty and leadership teams.
- **Battery consumers:** the businesses that buy and operate the packs, such as EV and two-wheeler OEMs, energy storage (ESS) integrators, fleet operators and service partners.

## 2. Objectives and success measures

Targets are placeholders to agree with the client once a baseline has been measured in Phase 1.

| Objective | Success measure | Target |
| --- | --- | --- |
| Find root causes faster | Median time from field failure to confirmed root cause | [__ days → __ days] |
| Reduce early-life failures | Field failure rate in the first 12 months, per 1,000 packs | [__% reduction] |
| Lower warranty cost | Warranty cost as a share of revenue; share of claims settled with telemetry evidence | [__%] |
| Strengthen supplier management | Supplier lots with a field-performance score | 100% of active lots |
| Contain recalls | Time to list every affected pack serial number | [< __ hours] |
| Give consumers visibility | Consumers active on the portal; health alerts acknowledged | [__ accounts] |
| Meet compliance needs | Packs with a complete digital record exportable as a battery passport | 100% of in-scope packs |

## 3. Users and what they need

The platform is multi-tenant. A manufacturer is the primary tenant, and each of its consumers gets a separate, restricted view showing only the packs it owns.

### Battery manufacturer

| Persona | What they need from the platform |
| --- | --- |
| Quality head / QA engineer | Find degradation patterns, trace them to lot, line and shift, and run root-cause investigations (8D/CAPA) |
| Production manager | See line and shift performance, and cell grading and matching results |
| Process / test engineer | Tune end-of-line and grading acceptance limits against field outcomes |
| Procurement / supplier quality | Field-performance scorecards per supplier and per lot, with evidence for claims |
| Warranty and service | Judge claims with usage evidence: abuse, over-temperature, deep discharge |
| Leadership | Quality, warranty and fleet-health KPIs on one page |
| Compliance officer | Battery passport data and regulatory reports |
| Platform admin | Users, roles, consumer tenants and data-sharing rules |

### Battery consumer

| Persona | What they need from the platform |
| --- | --- |
| OEM / ESS integrator quality team | Health of the packs they bought, early-warning alerts, quality evidence from the supplier |
| Fleet or asset operator | Health (SoH) and remaining-life view per pack, safety alerts, replacement planning |
| Service partner / technician | Pack diagnostics, alert history, warranty claim submission |
| Consumer admin | Their own users and the packs or sites they can see |

End drivers and individual owners are not direct users in this scope.

## 5. In scope: functional modules

Priority: **Must** = needed for the closed loop to work · **Should** = high value, planned for the first release · **Could** = later phase.

### M1. Pack genealogy and birth record (manufacturer)

| ID | Capability | Priority |
| --- | --- | --- |
| M1.1 | Register each cell by serial number, with supplier, lot, receipt date and incoming inspection results | Must |
| M1.2 | Capture formation and aging data per cell: OCV, internal resistance (IR), capacity grade | Must |
| M1.3 | Record pack build: cell-to-module-to-pack mapping and slot position, line, station, shift, operator, BMS firmware | Must |
| M1.4 | Store end-of-line (EOL) test results per pack, with pass/fail and failure reason | Must |
| M1.5 | Search and view a pack's full birth record from its serial or QR code | Must |
| M1.6 | Cell grading and matching suggestions based on IR and capacity spread | Should |

### M2. Field telemetry and health (manufacturer and consumer)

| ID | Capability | Priority |
| --- | --- | --- |
| M2.1 | Ingest per-battery telemetry: cell voltages, temperatures, current, SoC, cycle count, balancing and fault events | Must |
| M2.2 | Link each telemetry stream to its pack serial and owning consumer | Must |
| M2.3 | Estimate State of Health (SoH) per pack and per cell, with trend history | Must |
| M2.4 | Detect anomalies: a cell drifting from its siblings, rising IR, abnormal heat, repeated faults | Must |
| M2.5 | Estimate remaining useful life (RUL) | Should |
| M2.6 | Usage profiling: depth of discharge, charge rates, temperature exposure | Should |

### M3. Closed-loop quality analytics (manufacturer) — Later for BPTE

| ID | Capability | Priority |
| --- | --- | --- |
| M3.1 | Compare field health across cohorts: supplier, lot, line, shift, build date, firmware, grade | Must |
| M3.2 | Automatic cohort alerts when a group degrades significantly faster than the fleet | Must |
| M3.3 | Root-cause workbench: drill from a failing pack to its cells, lots and process data | Must |
| M3.4 | Correlate factory test values with field outcomes, and recommend acceptance-limit changes | Should |
| M3.5 | Supplier and lot scorecards built from field performance | Should |
| M3.6 | Link investigations to CAPA / 8D records and track actions to closure | Should |
| M3.7 | Recall scoping: list every pack sharing a suspect lot or process condition, with its owner | Must |

### M4. Consumer portal (consumer) — Later for BPTE

| ID | Capability | Priority |
| --- | --- | --- |
| M4.1 | Fleet health dashboard for owned packs: SoH, alerts, RUL, by site or vehicle | Must |
| M4.2 | Safety and early-warning alerts by email, SMS or webhook, with acknowledgement | Must |
| M4.3 | Pack detail page: health history, usage profile, birth-record summary the manufacturer chooses to share | Should |
| M4.4 | Replacement and maintenance planning from projected end-of-life | Could |
| M4.5 | Consumer API for their own telematics or fleet systems | Should |

### M5. Warranty and service (both) — Later for BPTE

| ID | Capability | Priority |
| --- | --- | --- |
| M5.1 | Consumer submits a warranty claim against a pack serial | Should |
| M5.2 | Claim evidence pack built automatically: usage, abuse events, health trend | Must |
| M5.3 | Manufacturer claim review workflow: accept, reject, ask for information | Should |
| M5.4 | Return and teardown findings fed back into the root-cause workbench | Could |

### M6. Compliance and battery passport (manufacturer) — Later for BPTE

| ID | Capability | Priority |
| --- | --- | --- |
| M6.1 | Maintain the data needed for a digital battery passport per pack | Should |
| M6.2 | Export passport data in the required format, with QR access for authorised parties | Could |
| M6.3 | EPR and regulatory reports from pack records | Could |

### M7. Platform administration (both)

| ID | Capability | Priority |
| --- | --- | --- |
| M7.1 | Tenant management: the manufacturer onboards consumers and assigns packs to them | Must |
| M7.2 | Role-based access control and single sign-on | Must |
| M7.3 | Data-sharing rules: which birth-record fields each consumer may see | Must |
| M7.4 | Audit log of data access and changes | Must |
| M7.5 | Configurable thresholds, alert rules and notification channels | Must |

## 6. Out of scope

- BMS hardware, BMS firmware, or changes to how the battery measures data.
- Edge gateway hardware supply and field installation. The platform defines the gateway interface; hardware is sourced separately.
- Replacing the client's MES, ERP or quality management system. The platform integrates with them.
- Real-time control of batteries, such as remote shutdown or charge limiting.
- Native mobile apps. The portals are responsive web apps.
- Apps for end drivers or individual owners.
- Cell chemistry R&D and electrochemical modelling beyond the health and life models in M2.
- Recycling and second-life marketplace features.
- Legal certification of the battery passport. The platform supplies the data; compliance sign-off stays with the client.

## 7. Data scope and integrations

| Source | Data | Method | Frequency | Owner |
| --- | --- | --- | --- | --- |
| Battery BMS, through an edge gateway | Cell voltages and temperatures, pack current, SoC, cycles, balancing and fault events | CAN or Modbus at the gateway, MQTT to Azure IoT Hub | Near real time; rate to confirm | Consumer site, manufacturer-supplied BMS |
| Formation and aging equipment | Per-cell OCV, IR, capacity, grade | File drop or OPC-UA, through Data Factory | Per batch | Manufacturer |
| EOL test rigs | Pack test results and failure codes | File drop or OPC-UA, through Data Factory | Per pack | Manufacturer |
| MES / production records | Build mapping, line, station, shift, operator, firmware | API or database extract | Hourly or daily | Manufacturer |
| ERP / procurement | Supplier, cell lot, purchase and receipt records | API or database extract | Daily | Manufacturer |
| Sales / dispatch | Pack serial to consumer, site and dispatch date | API or file | Daily | Manufacturer |
| Warranty / service | Claims, returns, teardown findings | Platform workflow or API | On event | Manufacturer and consumer |

**Outbound:** alerts by email, SMS and webhook (and Microsoft Teams for internal users), a REST API for consumers and the client's ERP, and passport and report exports.

**Data retention (to confirm):** raw telemetry kept at full resolution for [__ months], then downsampled. Birth records and health history kept for the warranty period plus [__ years].

## 8. Non-functional requirements

Figures in brackets are proposed starting values to confirm during discovery.

| Area | Requirement |
| --- | --- |
| Scale | Size for [__ packs] in the field at launch, growing to [**] within 3 years, at [** cells] per pack |
| Telemetry latency | Safety anomaly alerts within [< 5 minutes] of the data arriving |
| Analytics freshness | SoH and cohort analytics refreshed at least daily |
| Availability | [99.5%] for portals and APIs; ingestion buffers data during outages, with no data loss |
| Security | Encryption in transit and at rest; Entra ID single sign-on; managed identities; secrets in Key Vault; per-device authentication at the gateway |
| Tenant isolation | A consumer can never see another consumer's packs; enforced in the data layer, not only the UI |
| Data residency | Hosted in an Azure India region unless the client requires otherwise |
| Auditability | Every access to and change of a birth record or claim decision is logged |
| Model transparency | SoH, RUL and anomaly outputs show their confidence and contributing signals |
| Usability | Responsive web for desktop and tablet; key quality views usable on the shop floor |
| Observability | Azure Monitor and Application Insights across ingestion, analytics and apps |

## 9. Delivery phases and acceptance criteria

Three phases, two gates. Each gate needs client sign-off. Durations after the pilot are set at the end of Phase 1.

**Phase 1 exit criteria (Gate 1)**

- Telemetry from [__] pilot packs ingested, with at least [95]% data coverage.
- SoH estimate per pilot pack reviewed by the client's engineers.
- At least one anomaly or cohort pattern that the client's QA team confirms is real.
- KPI baselines from section 2 recorded.

**Phase 2 exit criteria (Gate 2)**

- Every pack built on the pilot line has a complete birth record, searchable by serial.
- Cohort comparison by supplier, lot, line and shift runs on live data.
- A field failure can be traced to its lot, line and shift in under [__] hours.
- A recall scope list is produced in under [__] hours.
- At least [__] consumer accounts are using the dashboard and alerts.
- Tenant isolation passes independent security testing.

**Phase 3 exit criteria**

- Warranty claims run end to end, with an automatic evidence pack.
- Supplier scorecards are used in at least one procurement review.
- The client's compliance team validates the passport data export.
- At least one acceptance-limit recommendation is reviewed and acted on.

## 10. Assumptions, dependencies and constraints

**Assumptions**

- Each pack has a unique serial number that the BMS reports in its telemetry.
- Cell serial numbers or lot IDs are recorded at build, or can be from Phase 2 onwards.
- Telemetry already reaches a collection point, or the BMS exposes it over CAN or Modbus.
- The manufacturer's contracts let it use field telemetry from consumers' packs for quality analysis.
- At least 12 months of historical field and factory data exist to train and validate health models.

**Dependencies**

- Access to MES, ERP and test-equipment data, with named owners on the client side.
- Consumers agree to onboard to the portal and share data.
- The edge gateway is supplied and installed, where packs do not already send data.
- Subject-matter experts from quality and cell engineering are available for model validation.

**Constraints**

- Azure is the target cloud.
- Battery passport and EPR requirements must be confirmed by the client's compliance team for each market served.

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Cell-level traceability not recorded today | Loop can only trace to pack or batch level | Start at pack and lot level; add cell scanning at build in Phase 2 |
| Telemetry gaps or poor quality | Weak health estimates, false alerts | Data-quality checks at ingestion; report coverage per pack; tune thresholds in pilot |
| Too little failure history to train models | Low model accuracy at launch | Begin with rule-based and statistical cohort analysis; add ML as data builds up |
| Consumers unwilling to share data | Loss of field visibility | Make the portal valuable to them; set data-sharing terms in supply contracts |
| Factory systems hard to integrate | Delays in Phase 2 | Early discovery of each system; file-drop fallback |
| Alert fatigue | Users ignore real warnings | Severity levels, tuning in pilot, acknowledgement tracking |
| Regulatory requirements change | Rework on passport module | Keep passport data model configurable; review against regulation each release |

## 12. Open questions for the client

- [ ] Is telemetry today coming from packs in the field, from in-factory testing, or both?
- [ ] How many packs are in the field, how many are built per month, and how many cells per pack?
- [ ] Are cell serial numbers or lot IDs recorded against each pack today?
- [ ] Which MES, ERP and test systems are in use, and who owns each?
- [ ] Which consumers (OEMs, ESS integrators, fleets) would join the pilot?
- [ ] Do supply contracts allow use of field telemetry for quality analysis?
- [ ] Which markets are served, and do any require an EU battery passport?
- [ ] What warranty terms apply (period, SoH threshold), and how are claims handled today?
- [ ] Where must data be hosted?
