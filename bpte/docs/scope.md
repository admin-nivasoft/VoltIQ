# BPTE: Battery passport, BMS tracking, dashboard. Scope Document

> Rewritten from `scope-old.md` (kept unchanged). Where this conflicts with `bpte/CLAUDE.md`, that file wins.
> Terms match `bpte/data-model/` (entities, metrics, ID matching).
> No targets, timelines, effort or prices are set here. Missing facts are `[__]`.

## 1. Purpose

One record per battery for its whole life, in three parts:

1. **Birth**: factory data (cells, supplier lots, build line and date, test results, firmware) captured into a battery passport.
2. **Ops**: field data from the battery's BMS (voltage, current, temperature, charge, cycles, faults), plus where the battery is deployed and who holds it.
3. **Dashboard**: birth and ops data combined and calculated, shown to the battery manager.

The battery ID joins all three. If the factory ID and the BMS ID do not match, the join breaks. This is the main dependency (see `data-model/id-matching.md`).

This is the foundation of the Closed-Loop Quality platform. It covers M1 (birth record) and M2 (field data and health). The loop itself (M3 to M6) is "Later" and builds on the same data.

## 2. Objectives

Measures are set once discovery confirms the data. No targets yet.

| Objective | Success measure | Target |
| --- | --- | --- |
| One passport per battery | Batteries with a birth record matched to a BMS ID | [__] |
| See field health | Batteries with health, cycles and warnings on the dashboard | [__] |
| Trust the data | Data coverage per battery is shown; every figure shows its source and freshness | [__] |
| Warn early, by rule | Rule-based warnings raised on the data received | [__] |
| Keep manufacturers apart | No manufacturer sees another's data | Checked by automated tests |

Objectives for cohort root cause, recalls, warranty, consumer visibility and compliance are Later (section 5).

## 3. Users

| Role | Who | What they need |
| --- | --- | --- |
| Battery manager | Main user, manufacturer | Fleet view and battery view: health, cycles, warnings, data coverage, birth record, where the battery is and who holds it |
| Admin | Manufacturer | Adds users, connects batteries, manages access. Importing birth data and managing warning rules: to confirm |
| Data connector | Not a person: a secure login for BMS data | Sends BMS data for one manufacturer only |
| 82 Volts | Builds and supports the product | Support access to be agreed; data role [__] |

Later: the manufacturer's own customers (holders) get their own view. Earlier quality, procurement, warranty, compliance and consumer roles are Later.

## 4. In scope (first release)

Priority: **Must** = needed for the first release to work. **Should** = high value, planned. **Could** = if room.

### M1. Birth record (Birth)

| ID | Capability | Priority |
| --- | --- | --- |
| M1.1 | Register each cell by serial number, with supplier, lot, receipt date and incoming inspection results | Must |
| M1.2 | Capture formation and aging data per cell: OCV, internal resistance (IR), capacity grade | Must |
| M1.3 | Record build: cell-to-module-to-pack mapping and slot position, line, station, shift, operator, BMS firmware | Must |
| M1.4 | Store end-of-line (EOL) test results per battery, with pass/fail and failure reason | Must |
| M1.5 | Search and view a battery's full birth record from its factory ID, BMS ID or QR code | Must |
| M1.6 | Cell grading and matching suggestions based on IR and capacity spread | Should |

Cell, supplier and lot data are captured now. Comparing across them is Later (M3).

### M2. Field data and health (Ops and Dashboard)

| ID | Capability | Priority |
| --- | --- | --- |
| M2.1 | Take in BMS data per battery: cell voltages, temperatures, current, SoC, cycle count, balancing and fault events. Unknown BMS fields are stored, not dropped | Must |
| M2.2 | Link each BMS stream to its battery by ID; records that do not match one battery are held apart and listed | Must |
| M2.3 | Estimate SoH per pack and per cell, with trend history (original ID; per-battery SoH is now M2.9) | Later |
| M2.4 | Detect anomalies: a cell drifting from its siblings, rising IR, abnormal heat, repeated faults (original ID; rule-based warnings are now M2.10) | Later |
| M2.5 | Estimate remaining useful life (RUL) (original ID) | Later |
| M2.6 | Usage profile: depth of discharge, charge rates, temperature exposure | Should |
| M2.7 | Record where each battery is deployed and who holds it, with history (deployment; new ID) | Should |
| M2.8 | Data coverage per battery: share of expected data received, gaps (new ID) | Must |
| M2.9 | Health (SoH) per battery, with trend history (new ID) | Must |
| M2.10 | Rule-based warnings: high temperature, cell imbalance, low or falling health, repeated faults, no data (new ID) | Must |

Admin duties (users, roles, audit, warning rules) are proposed for the first release through SCR-07, to confirm. Their old M7 IDs are listed under Later.

### Screens

| ID | Screen | Part | Users | Status |
| --- | --- | --- | --- | --- |
| SCR-01 | Fleet view | Dashboard | Battery manager, Admin | First release |
| SCR-03 | Battery view | Dashboard (birth and ops) | Battery manager, Admin | First release |
| SCR-06 | Birth data import | Birth | Admin | First release (new) |
| SCR-07 | Admin | All | Admin | First release (new) |
| SCR-02 | Cohort analysis | Dashboard | Battery manager | Later |
| SCR-04 | Consumer fleet health (consumer portal) | Dashboard | [__] (to confirm) | Later |
| SCR-05 | Warranty claim review | Dashboard | [__] (to confirm) | Later |

SCR-01 and SCR-03 keep their IDs; their content changes. SCR-06 and SCR-07 are new IDs.

### Source labels

Every dashboard figure says where it came from, with a freshness time:

Labels follow the data-model source values (display names in brackets):

- **bms** (BMS-reported): sent by the BMS as is.
- **calculated** (Calc): calculated by us. It names its method and version.
- **registered** (Reg): entered or loaded from factory or dispatch records (for example rated capacity, build date).

Some figures may be either, for example SoH and cycles: BMS if the BMS sends it, Calc if not. The screen says which applies to that battery.

### Data layers

In the first release the layers are separate PostgreSQL schemas behind one storage interface. Bronze keeps raw data as received and never edited. Silver is matched to the passport, cleaned and tagged. Gold holds calculated results. Raw data is kept so any calculation can be redone. Every record carries the manufacturer ID from day one.

## 5. Later (IDs kept, no detail)

| ID | Name | Status |
| --- | --- | --- |
| M3.1 | Compare field health across cohorts | Later |
| M3.2 | Automatic cohort alerts | Later |
| M3.3 | Root-cause workbench | Later |
| M3.4 | Correlate factory test values with field outcomes | Later |
| M3.5 | Supplier and lot scorecards | Later |
| M3.6 | Link investigations to CAPA / 8D records | Later |
| M3.7 | Recall scoping | Later |
| M4.1 | Fleet health dashboard for owned packs | Later |
| M4.2 | Safety and early-warning alerts with acknowledgement | Later |
| M4.3 | Pack detail page | Later |
| M4.4 | Replacement and maintenance planning | Later |
| M4.5 | Consumer API | Later |
| M5.1 | Consumer warranty claim | Later |
| M5.2 | Claim evidence pack | Later |
| M5.3 | Manufacturer claim review workflow | Later |
| M5.4 | Return and teardown findings feedback | Later |
| M6.1 | Data for a digital battery passport per pack | Later |
| M6.2 | Passport export and QR access | Later |
| M6.3 | EPR and regulatory reports | Later |
Note: M7 comes from `scope-old.md`; `bpte/CLAUDE.md` names only M1 to M6.

| ID | Name | Status |
| --- | --- | --- |
| M7.1 | Tenant management | Later |
| M7.2 | Role-based access control and single sign-on | Later |
| M7.3 | Data-sharing rules | Later |
| M7.4 | Audit log of data access and changes | Later |
| M7.5 | Configurable thresholds, alert rules and notification channels | Later |
| M2.3, M2.4, M2.5 | Per-pack and per-cell SoH, anomaly detection, remaining useful life (original definitions) | Later |
| SCR-02, SCR-04, SCR-05 | Cohort, consumer fleet health, claims screens | Later |
| PLT-AN-03, -04, -05 | Remaining life, cohort engine, factory-to-field correlation | Later |
| PLT-AL-02, -03, -04 | Timed safety alerts, extra channels, repeat suppression | Later |
| PLT-AD-01, -03, -05 | Consumer onboarding, data-sharing rules, passport export | Later |
| Other | ML predictions, consumer API, native mobile apps | Later |

Admin duties (users, roles, audit, warning rules) are proposed for the first release through SCR-07, to confirm. See requirements.md.

## 6. Out of scope

- BMS hardware, BMS firmware, or changes to how the battery measures data.
- Edge gateway hardware supply and installation.
- Replacing the manufacturer's MES, ERP or quality system.
- Real-time control of batteries, such as remote shutdown or charge limiting.
- Native mobile apps.
- Apps for end drivers or individual owners.
- Cell chemistry R&D and electrochemical modelling.
- Recycling and second-life features.
- Legal certification of the battery passport.
- For the first release, also not built: consumer portal, supplier/lot/line comparison, recall and warranty workflows, ML predictions, regulatory passport exports (all Later, section 5).

## 7. Data scope and integrations

| Source | Data | Method | Frequency | Owner |
| --- | --- | --- | --- | --- |
| Battery BMS | Voltages, temperatures, current, SoC, cycles, balancing, faults | Target is MQTT into Azure IoT Hub; what the BMS exposes is `[__]` | `[__]` | Manufacturer |
| Birth data (cells, build, formation, EOL, lots) | Cell, lot, build and test records | File import (SCR-06); where it lives today `[__]` | Per batch `[__]` | Manufacturer |
| Deployment | Battery, site, holder, dates | Dispatch file or admin entry; `[__]` | `[__]` | Manufacturer |

Later sources: MES and ERP by API, OPC-UA, warranty and service records.

Retention: raw BMS data kept for [__ months]; birth records and health history for [__].

## 8. Non-functional needs (summary)

Detail and IDs are in `requirements.md`. Scale, performance, availability and recovery values are `[__]`. Tenant isolation is enforced in the data layer, not only the screen. Hosting: Azure target, India data residency (to confirm). Status is never shown by colour alone.

## 9. Delivery phases

No dates. Each gate needs sign-off from the manufacturer. Thresholds are `[__]`. Phase order is confirmed: birth data first, BMS second. These P1 and P2 replace the old P1/P2/P3 in `scope-old.md`.

| Phase | Covers | Exit criteria |
| --- | --- | --- |
| P1 Birth and join | M1: birth data import, passport per battery, battery IDs, deployment and holder, users, roles and audit; Battery view (birth record, deployment) | Birth record for [__] batteries searchable by ID; unmatched records at most [__]%; cross-manufacturer tests pass |
| P2 Connect and see | M2: BMS data in, matched to a battery, health, cycles, rule-based warnings, coverage, Data connectors, Fleet view and health parts of Battery view | BMS data from [__] batteries; data coverage at least [__]%; health reviewed by the manufacturer's engineers; at least [__] warning confirmed as real |
| Later | M3 to M6 | Not planned in this release |

Dependencies between phases:

- P2 needs the battery records and IDs from P1. BMS data is matched to a battery that already exists.
- P2 calculated SoH can use rated capacity from the P1 birth record (Reg), if the birth files carry it.
- Holder and site are recorded in P1 (deployment); the source is still open.
- BMS-origin unmatched records (BMS ID with no battery) need a view in P2, in SCR-01 or in SCR-07 coverage. SCR-06 shows birth-side unmatched records in P1.

## 10. Assumptions, dependencies and constraints

**Assumptions** (all to confirm)

- Each battery has a factory ID and a BMS ID that can be matched. How is `[__]`.
- The BMS data reaches a collection point, or the BMS exposes it.
- Contracts allow use of field data from batteries the manufacturer's customers own.

**Dependencies**

- Access to the BMS protocol documents and a named owner on the manufacturer side.
- Access to birth data, with a named owner.

**Constraints**

- Azure is the target cloud. Platform for the first release: PostgreSQL, with bronze, silver and gold as separate schemas behind one storage interface. A lakehouse is Later. Language TypeScript; tests with Vitest.

## 11. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Factory ID and BMS ID do not match | The join breaks; no passport view of field data | Define ID matching rules early; list unmatched records; fix at source |
| Cell-level traceability not recorded today | Birth record only to battery or lot level | Start at battery and lot level; record cells where available |
| BMS data gaps or poor quality | Weak health figures, false warnings | Quality checks, coverage per battery, tune thresholds with the manufacturer |
| BMS does not send SoH, SoC or cycles | Figures must be calculated, and method is unproven | Show the source label; validate against reference tests `[__]` |
| Too little history for models | Low accuracy | Rule-based first; ML is Later |
| Warning fatigue | Users ignore real warnings | Severity levels; tune thresholds `[__]` |
| Data use not allowed by contract | No field data from customers' batteries | Confirm contracts before connecting |
| Manufacturer data mixed up | Serious breach | Manufacturer ID on every record; data-layer enforcement; automated cross-manufacturer tests |

## 12. Open questions

- [ ] Who is the first manufacturer, and which batteries?
- [ ] What does the BMS expose (fields, frequency, interface), and can we get the protocol documents?
- [ ] Where does birth data live today and in what format? Is there a matching ID?
- [ ] How is deployment recorded (customer entry or dispatch records)?
- [ ] What are the battery manager's first five questions?
- [ ] Do contracts allow use of field data from batteries the manufacturer's customers own?
- [ ] Are cell serial numbers or lot IDs recorded per battery today?
- [ ] Is the "alerts within 5 minutes" target kept? It is unconfirmed. If kept, a faster warning path is needed.
- [ ] Sign-in method for the manufacturer's users (own identity provider or email).
- [ ] Which markets are served, and is a passport export needed (Later)?
- [ ] Where do BMS-origin unmatched records appear in P2 (SCR-01 or SCR-07 coverage)?
- [ ] Do the birth files carry rated capacity, for calculated SoH in P2?
- [ ] What is the source of holder and site in P1, given how deployment is recorded is not yet decided?
- [ ] Confirm the proposed items: roles, admin duties, "secret shown once", append-only vs tamper-evident audit, fleet period options, OPC-UA and MES/ERP deferrals, in-app-only warnings (PLT-AL-03).
