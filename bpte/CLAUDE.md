# BPTE: project context

## Who is who
- **82 Volts**: the company building the product (us).
- **Customer**: the battery manufacturer. First manufacturer not yet named.
- Earlier work assumed Yulu (and Yuma Energy) as the client. That direction was scrapped; do not reuse its station, swap or rider scope.

## What we are building
A platform that keeps one record per battery through its whole life, in three parts:
1. **Birth**: factory data (cells, supplier lots, build line and date, test results, firmware) captured into a battery passport.
2. **Ops**: field data from the battery's BMS (voltage, current, temperature, charge, cycles, faults), plus where the battery is deployed and who holds it.
3. **Dashboard**: both combined and calculated, shown to the battery manager.

The battery ID joins all three. If the factory ID and the BMS ID do not match, the join breaks. This is the main dependency.

## Relationship to the quality loop
This is the **foundation** of the Closed-Loop Quality platform (project docs): it covers M1 (birth record) and M2 (field telemetry and health). The loop itself (M3 cohort analytics, recall scoping, 8D; M4 consumer portal; M5 warranty; M6 passport export) is "later", built on the same data.

## First release
- In: connect the first manufacturer's BMS data; passport per battery; bronze/silver/gold data layers; health, cycles and rule-based warnings; fleet view and battery view; login with role-based access; data coverage and source labels.
- Not yet: consumer portal, supplier/lot/line comparison, recall and warranty workflows, ML predictions, native mobile apps, regulatory passport exports.

## Users (plain names)
- **Battery manager**: main user, watches the dashboard.
- **Admin**: adds users, connects batteries, manages access.
- **Data connector**: not a person, a secure login for BMS data.
- **82 Volts**: builds and supports.
Later: the manufacturer's own customers get their own view.

## Data principles
- Medallion architecture: **bronze** raw as received and never edited; **silver** matched to the passport, cleaned, tagged; **gold** calculated results.
- Keep raw data so any calculation can be redone.
- Classifications are tags and attributes, not fixed columns.
- Every calculation records its method and version. Keep a metric dictionary.
- Every figure shows its source (from BMS, calculated, registered) and freshness.
- Manufacturer ID on every record from day one (tenant separation, enforced in the data layer).
- Unknown BMS fields are stored, not dropped.

## Architecture notes
- Target is Azure (from the project docs): BMS over MQTT into IoT Hub, factory files through Data Factory, Entra ID, Key Vault, India data residency.
- Needs on top of that: a lakehouse with a chosen table format, an ID-matching step in silver, a serving layer for the dashboard, versioned calculations.
- A faster path for warnings is only needed if the "alerts within 5 minutes" target is kept.
- Deferred for now: consumer API, claims workflow, 8D integration.

## Open questions
- Who is the first manufacturer, and which batteries?
- What does the BMS expose (fields, frequency, interface), and can we get the protocol documents?
- Where does birth data live today and in what format? Is there a matching ID?
- How is deployment recorded (customer entry or dispatch records)?
- What are the battery manager's first five questions?
- Platform and table format (for example Databricks or Fabric; Delta or Iceberg)?
- Do contracts allow use of field data from batteries the manufacturer's customers own?

## Working preferences
- Use simple words. Short, scannable answers. Business-friendly role names.
- When asked for the product view, do not bring in money or pricing.
- When asked for the engineering view, talk architecture, data and integrations.
- Do not state targets, timelines or effort for this scope until discovery confirms the data.

## Deliverables so far
- Product overview deck (3 parts, 9 slides), published as an artifact.
- Earlier station-focused page (scrapped direction), still published and private.

## Repo layout and who owns what
Design outputs go in bpte/. Code goes in the existing repo.
- bpte/docs/ : rewritten Scope and Requirements (docs-agent)
- bpte/data-model/ : data dictionary, entities, ID matching, metrics (data-model-agent). Also owns new migrations in db/migrations and schema types in packages/contracts.
- apps/pipelines/ : bronze, silver, gold (pipeline-agent)
- apps/api/ : read and write APIs (api-agent)
- apps/web/ : Fleet view and Battery view (dashboard-agent)
- bpte/tests/data/ : synthetic data (test-data-agent); bpte/tests/pipeline/, bpte/tests/tenant/, bpte/tests/e2e/ (test agents)
- bpte/PLAN.md and bpte/STATUS.md : written by the lead
Existing code is reused. Each agent edits only its own area and reports anything it needs changed elsewhere.
