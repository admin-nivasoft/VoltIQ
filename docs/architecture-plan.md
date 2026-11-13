# 82V QualityLoop — Consumer Fleet Health: Architecture Plan

Nov 13, 2026 · @Ashwin

## Summary

We will build SCR-04 (Consumer fleet health) of 82V QualityLoop as a mock-first, full-stack app: a React + TypeScript + Tailwind frontend, a Node.js + TypeScript API structured as a modular monolith, and PostgreSQL. All data, login and notifications are mocked. Every external dependency sits behind an interface, so real battery providers, API providers and notification services replace the mocks without any frontend change.

Decisions agreed so far:

- **Scope:** SCR-04 only. Claims, pack detail pages, replacement planning, asset mapping and API keys are deferred.
- **Stack:** React + TypeScript + Tailwind; Node.js + TypeScript API; PostgreSQL now, TimescaleDB later if telemetry-style history needs it.
- **Data layer:** a separate, provider-neutral data layer. The frontend and API depend on its interface, never on a vendor or database.
- **Login:** mocked, with a switcher across consumers and roles. Entra ID or another provider plugs in later.
- **Roles:** fleet manager, technician, consumer admin. What each can do lives in a JSON permission file that can be toggled at runtime.
- **Notifications:** email, SMS and webhook are mocked behind one provider interface with canned responses.
- **Architecture:** three containers (web, api, db) run with Docker Compose. Telemetry ingestion and analytics are separate services for later; they are not part of this build.
- **Product name:** 82V QualityLoop, with the portal titled "82V QualityLoop · Fleet Health". The name is one config value.
- **Demo data:** about 3 consumers with about 40 packs each. Open values from the documents use configurable placeholders.

## Scope of the first build

Seven of the eleven SCR-04 requirements are built in this release; four are deferred. IDs and priorities come from the Requirements Document.

| ID | Requirement | Priority | This build | Note |
| --- | --- | --- | --- | --- |
| SCR-04-FR-01 | A consumer sees only its own packs | Must | Built | Consumer ID comes from the token; row-level security in Postgres; cross-tenant tests in CI |
| SCR-04-FR-02 | Branding: consumer and manufacturer name, logo | Should | Built, basic | Top bar with consumer name and "packs supplied by" line; placeholder 82 Volts logo from config |
| SCR-04-FR-03 | Headline tiles: packs in service, average SoH, active alerts, packs nearing end of life | Must | Built | Near-end-of-life threshold is a placeholder of 6 months; active alerts drop on acknowledge |
| SCR-04-FR-04 | Plain-language alerts with a recommended action | Must | Built | Consumer-facing text only; no cohort or supplier names stored or returned |
| SCR-04-FR-05 | Acknowledge an alert | Must | Built | Records who and when; role-gated by the permission file |
| SCR-04-FR-06 | Pack table: asset, serial, SoH with trend, remaining life, warranty status; search and sort | Must | Built | Declining packs marked in text and icon, not colour alone |
| SCR-04-FR-07 | Map packs to own vehicle or asset IDs, CSV bulk upload | Should | Deferred | Asset ID shown read-only from seed data |
| SCR-04-FR-08 | Raise claim from a pack row | Should | Deferred | P3; belongs with SCR-05 |
| SCR-04-FR-09 | Alert channels per user: email, SMS, webhook, with test message and failure log | Must | Built, mocked | Mock providers behind one interface; deterministic mock failure to exercise the log |
| SCR-04-FR-10 | Replacement planning export | Could | Deferred | P3 |
| SCR-04-FR-11 | Consumer REST API with per-consumer keys | Should | Deferred | The internal API is versioned and documented, which prepares this |

## System architecture

&#91;embedded content: system architecture · 3 containers, 1 data boundary\]

Three containers run under Docker Compose: the web app, the API and PostgreSQL. Inside the API, routes and the notification dispatcher reach data only through the data provider interface, which is the boundary that lets providers change. The ingestion and analytics services are not built now; when they exist they write to the same database and the dashboard does not change.

## Data provider layer

The data layer is the only code that knows where data comes from. The API and the frontend depend on a provider-neutral interface and a canonical data model, so changing the database, the battery provider or the API provider means writing a new adapter and nothing else.

```ts
interface FleetDataProvider {
  getConsumer(consumerId: string): Promise<Consumer>;
  getFleetSummary(consumerId: string): Promise<FleetSummary>;
  listPacks(consumerId: string, q: PackQuery): Promise<Page<PackSummary>>;
  listAlerts(consumerId: string, q: AlertQuery): Promise<Page<Alert>>;
  acknowledgeAlert(consumerId: string, alertId: string, userId: string): Promise<Alert>;
}
```

Rules that keep the boundary real:

- **Canonical model.** `Pack`, `Alert`, `FleetSummary` and related types live in a shared contracts package. Adapters translate vendor payloads into them; the UI never sees vendor field names.
- **Selected by configuration.** `DATA_PROVIDER=postgres-mock` for this build. Further adapters register under new names.
- **One door.** Only the `data-provider` module may import the database client or a vendor SDK. A lint rule fails the build if any other module does.
- **Shared contract tests.** One test suite runs against every adapter, so a new provider is accepted only if it behaves like the existing ones.
- **Consumer scoping is a parameter, not a filter.** Every method takes `consumerId`, taken from the verified token, never from the request body.

Adapters expected over time:

| Adapter | Source | When |
| --- | --- | --- |
| `postgres-mock` | Seeded Postgres tables plus a simulator for new alerts | This build |
| `postgres-analytics` | Health results and anomalies written by the analytics service | When analytics exists |
| `vendor-bms-rest` | A battery provider's REST feed, mapped to the canonical model | Per provider |
| `iot-stream` | Time-series store such as TimescaleDB | If history volume needs it |

## API contract

The API is versioned under `/api/v1`, JSON only, with request and response schemas defined once in the shared contracts package (zod) and published as OpenAPI. The consumer is always derived from the token, never from a URL or body field.

| Method and path | Purpose | Permission |
| --- | --- | --- |
| `POST /auth/mock-login` | Issue a dev token for a seeded user (disabled outside mock mode) | none |
| `GET /me` | Current user, consumer, branding, role and effective permissions | any signed-in user |
| `GET /fleet/summary` | The four headline tiles | `fleet.view` |
| `GET /alerts` | Alerts, filter by status and severity, paged | `alerts.view` |
| `POST /alerts/{id}/acknowledge` | Acknowledge; records who and when | `alerts.acknowledge` |
| `GET /packs` | Pack table: search, sort, page | `packs.view` |
| `GET /notification-channels` | The user's own channels | `channels.manage_own` |
| `PUT /notification-channels` | Save the user's channels | `channels.manage_own` |
| `POST /notification-channels/test` | Send a mock test message | `channels.manage_own` |
| `GET /admin/permissions` | Read the role permission file | `permissions.manage` |
| `PUT /admin/permissions` | Replace it; validated, audited | `permissions.manage` |
| `POST /dev/simulate-alert` | Create a mock alert for demos (disabled outside mock mode) | mock mode only |
| `GET /healthz` | Liveness and readiness | none |

Conventions:

- **Errors:** `{ "error": { "code", "message", "details"? } }` with standard status codes; 403 for a missing permission, 404 for another consumer's resource so existence is not revealed.
- **Lists:** `page`, `pageSize` (default 25, maximum 100), `sort`, and a total count.
- **Responses carry timestamps** such as `asOf`, so the screen can show when data was last refreshed.
- **Updates reach the screen by polling** (30 seconds) in this build. Server-sent events can follow without a contract change.

## Database model

PostgreSQL holds the mock data and the app's own state. Every consumer-owned table carries `consumer_id`, and row-level security restricts each request to its own consumer.

| Table | Key columns | Notes |
| --- | --- | --- |
| `consumers` | id, name, type (OEM, ESS integrator, fleet operator), manufacturer name, logo URL | Sub-tenants of the manufacturer |
| `users` | id, consumer\_id, name, email, role | Seeded; role is one of the three |
| `packs` | id, consumer\_id, serial, spec, asset\_id, warranty\_status | One row per pack assigned to a consumer |
| `pack_health` | pack\_id, consumer\_id, recorded\_at, soh\_pct, rul\_months\_low, rul\_months\_high | History table; latest row feeds the pack table; the remaining-life range follows NFR-09 |
| `alerts` | id, consumer\_id, pack\_id, severity, title, description, recommended\_action, status, created\_at, acknowledged\_by, acknowledged\_at | Consumer-facing text only |
| `notification_channels` | user\_id, consumer\_id, type, target, enabled | Per user |
| `notification_log` | id, consumer\_id, alert\_id, channel, status, attempts, error, sent\_at | Delivery results and failures |
| `audit_events` | id, consumer\_id, user\_id, action, object, at | Logins, acknowledgements, permission changes |

Isolation: each request runs in a transaction that sets `app.consumer_id` from the verified token, and the policy on every consumer-owned table is `consumer_id = current_setting('app.consumer_id')`. The application database role cannot bypass it.

The model deliberately has no cohort, supplier or cell-lot columns, so internal quality data cannot leak into this portal (SCR-04-FR-04).

TimescaleDB later: `pack_health` is already time-keyed, so it can become a hypertable with continuous aggregates and no change to the API or the frontend.

## Access control and mocked login

What each role may do is data, not code: a small JSON file maps the three consumer roles to named permissions, and a policy layer in the API enforces it on every request. Starting policy, taken from the role matrix in the Requirements Document:

```json
{
  "version": 1,
  "roles": {
    "fleet_manager":  ["fleet.view", "alerts.view", "alerts.acknowledge", "packs.view", "channels.manage_own"],
    "technician":     ["fleet.view", "alerts.view", "packs.view", "channels.manage_own"],
    "consumer_admin": ["fleet.view", "alerts.view", "alerts.acknowledge", "packs.view", "channels.manage_own", "users.manage", "permissions.manage"]
  }
}
```

How it works:

- **Policy service** loads `config/permissions.json` at startup and keeps it in memory. A route guard such as `requirePermission('alerts.acknowledge')` checks the caller's role against it.
- **Runtime toggle.** `PUT /admin/permissions` validates a new file against a schema, applies it immediately and records an audit event. No restart.
- **The frontend follows the API.** `GET /me` returns the effective permissions, and the UI shows or hides controls from that list. The server is always the authority.
- **Tenant scoping is not toggleable.** Seeing only your own consumer's packs is enforced in the data layer regardless of the policy file.
- **Mocked login.** `POST /auth/mock-login` issues a signed dev token for a seeded user. The UI offers a switcher across consumers and roles. The API refuses to start with mock auth when `NODE_ENV=production`.
- **Replacing login later.** Authentication sits behind an `AuthProvider` interface. Entra ID or the consumer's own identity provider becomes a new implementation; the policy layer is unchanged.

## Notifications (mocked)

All three channels are mocked behind one interface, so a real email, SMS or webhook service later is a new class and a config change.

```ts
interface NotificationProvider {
  channel: 'email' | 'sms' | 'webhook';
  send(msg: NotificationMessage): Promise<DeliveryResult>;
}
```

- **Mock providers.** Each returns a canned result after a short simulated delay. A target containing the word "fail" always returns a failure, so the failure path can be demonstrated and tested.
- **Dispatcher.** When an alert is created, the dispatcher looks up each user's enabled channels and sends through the matching provider. Failed sends are retried up to 3 times, then logged with the error to `notification_log` (SCR-04-FR-09, PLT-AL-03).
- **Test message.** `POST /notification-channels/test` sends a sample message through the chosen channel and returns the result, which the Settings screen shows.
- **Registry.** Providers are chosen by config (`NOTIFY_EMAIL=mock`, and so on). An unknown value fails at startup instead of silently dropping alerts.
- **Demo.** `POST /dev/simulate-alert` creates a new alert for a chosen consumer so acknowledging and notification fan-out can be shown live.

Not in this build: repeat-alert suppression (PLT-AL-04), Microsoft Teams (manufacturer users only) and any real delivery.

## Frontend architecture

A single-page app built with Vite, React 18, TypeScript and Tailwind, organised by feature so each area can change without touching the others.

- **Server state:** TanStack Query, polling every 30 seconds. No provider or vendor field names appear anywhere in the UI, only the shared contract types.
- **Routing:** React Router with two areas, Fleet health (home) and Settings (notification channels, and role permissions for those allowed).
- **Permission-aware UI:** a `<Can permission="alerts.acknowledge">` component reads the permissions from `GET /me`. Hidden controls are a convenience; the API enforces the rule.
- **Fleet health screen**, following the SCR-04 mock layout: top bar with consumer name and "packs supplied by" line; four headline tiles; alert list with Acknowledge buttons; searchable, sortable pack table with SoH trend and remaining-life range.
- **Dev login switcher:** a clearly marked panel to pick consumer and role, shown only in mock mode.
- **Accessibility (NFR-07):** WCAG 2.1 AA. Severity, trend and status are always shown as text and an icon, never colour alone. Full keyboard use and screen-reader labels.
- **Responsive (NFR-08):** tested at 390, 768 and 1440 px widths, since the consumer portal must work on a phone.
- **Freshness:** the screen shows when the data was last refreshed, with explicit loading, empty and error states (SCR-01-FR-07 conventions applied here).

Suggested folders: `app/` (routes, providers), `features/fleet`, `features/alerts`, `features/packs`, `features/settings`, `components/ui`, `lib/api` (generated client).

## Security and testing

Tenant isolation is the property that must never fail, so it is enforced in three places and tested in CI (NFR-05, SCR-04-FR-01).

- **Token:** the consumer comes from the verified token only.
- **Data layer:** every provider method takes the consumer ID, and Postgres row-level security backs it up.
- **Responses:** DTOs are whitelists. A test asserts that no cohort, supplier or other-consumer name appears in any response.

Other controls: schema validation on every input (zod), rate limiting, standard security headers, strict CORS, secrets from environment variables only (Key Vault on Azure later), and audit events for logins, acknowledgements and permission changes.

Test layers:

| Layer | Tool | What it proves |
| --- | --- | --- |
| Unit | Vitest | Policy checks, dispatcher retries, mock provider behaviour |
| Provider contract | Vitest | Every data adapter satisfies the same interface behaviour |
| API integration | Vitest + Postgres container | Endpoints, permissions, cross-tenant access returns 404 |
| Component | Testing Library | Permission-aware controls, empty and error states |
| End to end | Playwright | Switch role, acknowledge an alert, send a test message; axe accessibility check |

## Repository, containers and path to Azure

One monorepo (pnpm workspaces) so the frontend, API and shared contracts change together.

```text
82v-qualityloop/
  apps/web/                 React + TypeScript + Tailwind
  apps/api/                 Node.js + TypeScript (modules: access, fleet, alerts,
                            notifications, data-provider, audit)
  packages/contracts/       shared zod schemas and types, OpenAPI output
  config/permissions.json   role permission policy
  db/migrations, db/seed/   schema, row-level security, demo data
  docker-compose.yml        web, api, db
  .github/workflows/        CI
```

- **Docker Compose:** `web` (static build behind Nginx), `api`, and `db` (PostgreSQL 16). One command starts the whole demo with seeded data.
- **CI (GitHub Actions):** lint, type check, unit and integration tests, build, and container image build on every push.
- **Configuration:** environment variables only; a documented `.env.example`.
- **Azure later:** Container Apps for web and api, Azure Database for PostgreSQL (TimescaleDB if needed), Key Vault for secrets, Application Insights for monitoring, Entra ID replacing mock login. Ingestion and analytics services are added beside the API and write to the same tables, which the data provider reads. No dashboard change is needed.

## Build plan

The build runs in ten steps, each ending in something that can be run or tested.

1. Scaffold the monorepo, tooling and the shared contracts package.
2. Database: migrations, row-level security and seed data (3 consumers, about 40 packs each, alerts).
3. API core: mock login, the permission policy layer and `GET /me`.
4. Data provider interface, the `postgres-mock` adapter and the shared contract tests.
5. Fleet endpoints: summary, packs and alerts, including acknowledge.
6. Notifications: provider interface, mock providers, dispatcher, channels, test message and log.
7. Frontend shell: dev login switcher, layout, permission-aware components.
8. Fleet health screen: tiles, alert list, pack table.
9. Settings: notification channels, and the role permission toggle for admins.
10. Cross-tenant and accessibility tests, Docker Compose, CI and README.

## Risks, assumptions and open items

The main risk is practical: this workspace has package installs switched off, so code can be written here but dependencies cannot be installed, built or run until that is resolved.

- **Build environment.** Either allow package installs in the network settings (a new chat picks up the change), or run the install and build on your own machine from the repository we produce.
- **Assumption:** the technician role may manage its own notification channels. The Requirements Document does not say; it is one line in the permission file.
- **Assumption:** the permission file is global for all consumers. Per-consumer overrides would need a small schema change. Decide if needed.
- **Placeholders** (configurable): near end of life = under 6 months; severities High, Medium, Low; warranty status Active, Expiring, Expired.
- **Still open in the source documents:** the warranty terms model, consumer sign-in method, and which birth-record fields consumers may see. None blocks this mocked build.
- **Deferred:** asset mapping and CSV upload, claims, replacement planning, consumer API keys, repeat-alert suppression, real notification delivery.
