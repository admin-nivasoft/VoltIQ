# Build steps

`/build-step N` works on one step. A step is **done** only when every acceptance check below it has been run and passes. Claude updates this file as it goes.

All work goes on the branch `build/scr-04`, with one commit per step. Nothing is pushed automatically.

Status values: `todo` · `in-progress` · `done` · `blocked`

`Run with:` is the model and effort level for the main session on that step. `scripts/claude-build.sh` applies it automatically; interactively, start the session with it (see SETUP.md, "Token and cost controls"). Claude never edits these lines.

---

## Step 1 · Monorepo scaffold and contracts
Status: done
Run with: model=sonnet effort=medium

Build:
- pnpm workspace with `apps/web`, `apps/api`, `packages/contracts`, and a root `tsconfig.base.json` (strict).
- ESLint (flat config) with the data-boundary `no-restricted-imports` rule, plus Prettier, Vitest workspace and all root scripts listed in CLAUDE.md. Scripts for later steps may be placeholders that exit 0 with a message.
- `packages/contracts`:
  - zod schemas for Me, FleetSummary, PackSummary (with trend, RUL range, confidence), Alert, Page<T>, NotificationChannel, NotificationLogEntry, RolePolicy and Error;
  - an OpenAPI generator script.
- `.env.example` with every variable from D-08 and D-10.

Acceptance:
- [x] `pnpm install && pnpm lint && pnpm typecheck && pnpm test:unit` passes
- [x] A test proves that importing `pg` outside `apps/api/src/data` fails lint
- [x] A test proves the contracts contain no `supplier`, `cohort` or `cell_lot` (D-12)

## Step 2 · Database schema, RLS and seed
Status: done
Run with: model=opus effort=high

Build:
- Migrations for all tables in the plan, amended by D-01, D-03, D-06, D-07 and D-09.
- The roles `ql_owner` and `ql_app`, `ql_visible()`, ENABLE and FORCE RLS on every tenant table, and the SECURITY DEFINER functions from D-04.
- The audit table revoke from D-13.
- A deterministic seed with a fixed random seed:
  - 1 manufacturer (82 Volts) and 3 consumers (one OEM, one ESS integrator, one fleet operator), about 40 packs each;
  - 180 days of health history;
  - alerts in every severity and status, and users in every role;
  - canary names from D-12, and one `platform_admin`.
- `pnpm db:reset`.

Acceptance:
- [x] `docker compose up -d db && pnpm db:reset` works twice in a row
- [x] The D-12 database-level RLS tests pass, including the pooled-connection leak test
- [x] Inserting a health row whose consumer doesn't match its pack fails

## Step 3 · API core: config, mock auth, policy, /me
Status: done
Run with: model=opus effort=high

Build:
- Fastify app and a config module that fails at startup per D-08.
- `withTenant`, the cookie JWT, `POST /auth/mock-login`, `POST /auth/logout` and `GET /me` (user, consumer, manufacturer branding, role, effective permissions).
- The policy service on `role_policies` and `requirePermission()`.
- The error envelope, rate limiting, security headers, `/healthz` and `/readyz`.

Acceptance:
- [x] Unit tests: policy checks, and startup refuses the unsafe config combinations
- [x] Integration test: logging in as each seeded role returns the right permissions from `/me`
- [x] Without the dev env flags, `/auth/mock-login` returns 404

## Step 4 · Data layer and adapter contract tests
Status: done
Run with: model=sonnet effort=high

Build:
- The `FleetDataSource` and `AppStateRepository` interfaces (D-05), the `postgres-mock` adapter and the repository.
- The trend and near-EOL calculations from D-10.
- A shared contract test suite that any adapter can run.

Acceptance:
- [x] The contract suite passes for `postgres-mock`, including cross-tenant cases
- [x] Unit tests cover the trend edge cases: under 3 readings, flat, declining, improving

## Step 5 · Fleet, packs and alerts endpoints
Status: done
Run with: model=sonnet effort=medium

Build:
- `GET /fleet/summary`, `GET /packs` (search, allow-listed sort, paging), `GET /alerts` and `POST /alerts/{id}/acknowledge`, following the D-10 rules, with audit events.
- OpenAPI served at `/api/v1/openapi.json`.

Acceptance:
- [x] Integration tests cover every endpoint for each role: 403 for a missing permission, 404 for another consumer's alert
- [x] Acknowledging lowers the active alert count; a second acknowledgement is idempotent; acknowledging a resolved alert returns 409
- [x] The D-12 canary crawl passes

## Step 6 · Notifications
Status: done
Run with: model=sonnet effort=medium

Build:
- `NotificationProvider` and the mock email, SMS and webhook providers (a target containing "fail" always fails).
- The provider registry, which fails at startup on an unknown value.
- The D-07 outbox and worker, the channel endpoints, the test message endpoint, `GET /notification-log` and `POST /dev/simulate-alert` (D-04).

Acceptance:
- [x] Unit tests: retries with backoff, idempotent jobs, only users with `alerts.view` notified
- [x] Integration test: a simulated alert to a "fail" target produces 3 attempts in the log and status failed
- [x] Integration test: jobs survive an API restart (stop the worker, start it again, and the jobs complete)

## Step 7 · Frontend shell
Status: done
Run with: model=sonnet effort=medium

Build:
- Vite app, router, a TanStack Query client polling every 30 s, and an API client typed from contracts that sends the `X-Requested-With` header.
- The dev login switcher behind `VITE_MOCK_AUTH`, the layout with the branded top bar, the `<Can>` component, and shared loading, empty and error components.

Acceptance:
- [x] Component tests: `<Can>` hides controls; the error and empty states render
- [x] A production build with `VITE_MOCK_AUTH=false` contains no switcher code (checked by grepping the bundle)

## Step 8 · Fleet health screen
Status: done
Run with: model=sonnet effort=medium

Build:
- Headline tiles, the alert list with Acknowledge, and the pack table with search, sort, trend (text and icon), RUL range with confidence, and warranty status.
- The card layout below 768 px.
- The "last refreshed" time.

Acceptance:
- [x] Component tests for each panel, including empty and error states
- [x] Playwright: sign in as fleet manager, acknowledge an alert, and the tile count drops; as technician there is no Acknowledge button
- [x] axe reports no serious or critical issues at 390, 768 and 1440 px

## Step 9 · Settings
Status: todo
Run with: model=sonnet effort=low

Build:
- The notification channels form with validation and a test-send button that shows the result.
- The delivery log view for consumer admins.
- The role policy editor for `platform_admin`.

Acceptance:
- [ ] Playwright: save channels, send a test to a "fail" target, and see the failure in the log
- [ ] Playwright: a consumer admin cannot reach the policy editor; the API returns 403
- [ ] axe passes on the settings pages

## Step 10 · Containers, CI and docs
Status: todo
Run with: model=sonnet effort=low

Build:
- Dockerfiles: the api, and the web app as a static build behind Nginx with the `/api` proxy.
- `docker-compose.yml` that brings up web, api and db, migrated and seeded, with one command.
- GitHub Actions CI running verify, e2e against Compose, and image builds.
- README: setup, the demo script, the D-11 assumptions and the placeholders.

Acceptance:
- [ ] `docker compose up --build` from a clean clone serves a working demo at http://localhost:8080
- [ ] `pnpm verify && pnpm test:e2e` passes
- [ ] The requirements-auditor agent reports every built SCR-04 requirement as covered

---

## Decisions taken during the build
_Claude appends one line per decision: date, step, decision, reason._
- 2026-11-13 · step 1 · `signals` in the Alert contract is a fixed whitelist (unknown keys stripped), not a free record · jsonb contents could otherwise leak internal quality data.
- 2026-11-13 · step 1 · RolePolicy schemas reject `permissions.manage` on any role but `platform_admin`, and any other permission on `platform_admin` · enforces D-01 in the contract.
- 2026-11-13 · step 1 · Channel request body (`NotificationChannelInput`) has no `id`; upsert key is (user from token, type) · stops cross-user overwrite inside a consumer.
- 2026-11-13 · step 1 · ESLint boundary also bans dynamic `import()`, `createRequire`, more DB/notification SDKs, and sets `noInlineConfig` · closes bypasses found in review.
- 2026-11-13 · step 1 · `.env.example` leaves `JWT_SECRET` empty and comments out the mock/dev flags · fail closed (D-08). `JWT_TTL_HOURS`, `COOKIE_SECURE` and the owner DB URL in the API env are removed or marked migration-only.
- 2026-11-13 · step 1 · `pnpm verify` is green while `test:integration` is a placeholder · step 2 must replace it; the placeholder must never survive step 2.
- 2026-11-13 · step 1 · DB-level tests (D-12) live under `apps/api/src/data/__tests__` so the boundary rule needs no exception for tests.

- 2026-11-13 · step 2 · DB container is published on 127.0.0.1:5442 · 5432 and 5433 are used by other local Postgres instances.
- 2026-11-13 · step 2 · FORCE RLS binds ql_owner too, so SECURITY DEFINER lookups use `TO ql_owner` policies: read-only on users/consumers, INSERT of consumer-less platform_admin, INSERT of consumer-less audit rows, and read/insert on role_policies. None apply to ql_app; a test checks that every policy reaching ql_app or PUBLIC uses `ql_visible`.
- 2026-11-13 · step 2 · Platform-level writes go through definer functions `audit_platform_event()` and `role_policy_publish()`, which refuse to run inside a tenant context and require a `platform_admin` actor · D-01: stops code running for a consumer from changing the global policy or forging platform audit events. `role_policies` has forced RLS; ql_app can only read it. Step 3's `PUT /admin/permissions` must use these functions.
- 2026-11-13 · step 2 · `audit_events` has a composite FK (user_id, consumer_id) → users · closes a tenant-column mismatch D-03 did not list.
- 2026-11-13 · step 2 · UNIQUE keys on notification_channels and notification_jobs lead with consumer_id · equivalent to D-14's UNIQUE (user_id, type), but a cross-tenant insert fails on the FK rather than a duplicate-key error that reveals another tenant's row.
- 2026-11-13 · step 2 · ql_app has column-level UPDATE only (alerts: status/acknowledged_*; channels: type/target/enabled; jobs: attempts/next_attempt_at/status), no sequence grants.
- 2026-11-13 · step 2 · Pack warranty is stored as `warranty_expires_on` and the Active/Expiring/Expired status is derived at read time from the config threshold (D-10).
- 2026-11-13 · step 2 · `db:reset` refuses non-local hosts and NODE_ENV=production.
- 2026-11-13 · step 2 · Rule for later steps: database error `detail` is never returned to clients; 23505/23503 map to a generic 404 or 409. `manufacturers` is readable by every consumer: add RLS before a second manufacturer is seeded (D-06).

- 2026-11-13 · step 3 · Every request re-checks the user (role and consumer) against the database via `auth_find_user`, so a signed token with stale or wrong claims is rejected · limits the 8 h stale-privilege window.
- 2026-11-13 · step 3 · `NODE_ENV` and `AUTH_PROVIDER` are required (no defaults) and `TRUST_PROXY` must be `false` or a proxy address, never `true` · production checks cannot be skipped by omission; per-IP rate limits stay meaningful behind Nginx.
- 2026-11-13 · step 3 · Cookie `Secure` is always on in production; elsewhere only localhost may omit it · D-08 without trusting the Host header in production.
- 2026-11-13 · step 3 · A bare `ZodError` is a 500 (server bug); only `parseInput()` turns request input into a 400 with details · stops DTO or internal field names reaching clients.
- 2026-11-13 · step 3 · `/healthz` and `/readyz` are exempt from rate limiting.
- 2026-11-13 · step 3 · Not built (outside the step): `PUT /admin/permissions` (use `role_policy_publish()` and `audit_platform_event()`), logout audit and server-side session revocation (add a `jti` denylist before Entra), real Entra settings validation, a user list for the step 7 dev switcher (hard-code the seeded ids or add a mock-only endpoint then).
- 2026-11-13 · step 3 · Nginx (step 10) must set `proxy_set_header X-Forwarded-For $remote_addr` and `Host $host`, and the API must be started with `TRUST_PROXY` set to the Nginx address.

- 2026-11-13 · step 4 · Repository methods that act for a user take one `Principal { consumerId, userId }` built only from the token (`acknowledgeAlert`, `listChannels`, `saveChannels`) · a user id from a path or body can never be passed by accident. Step 5 routes must build it from `req.auth` and add a route test that a technician sending another user's id changes only their own channels.
- 2026-11-13 · step 4 · The contract suite runs twice: normally, and on a superuser connection where RLS filters nothing, so the adapter's own `consumer_id` predicates are tested. Any vendor adapter has no RLS behind it and must pass the same way.
- 2026-11-13 · step 4 · `remainingLife.confidence` is nullable in the contract; near-EOL and the range are computed from `rul_months_low/high` alone, so a missing confidence cannot hide a near-end-of-life pack (D-10, D-09).
- 2026-11-13 · step 4 · Near-EOL, average SoH and packs-in-service count only `in_service` packs. The business day for warranty status is the UTC calendar day; a malformed date throws instead of reading as active.
- 2026-11-13 · step 4 · Pack search and sort run in memory over the consumer's packs (trend needs the history window). Fine for the mock scale; a vendor or large-fleet adapter should push this into its source.
- 2026-11-13 · step 4 · New migration adds CHECKs to `notification_log` (alert kind needs an alert id, attempt >= 1). Step 6's worker must write only short fixed error codes to `notification_log.error`, never provider internals or webhook URLs.
- 2026-11-13 · step 4 · Seed now puts CANARY strings in B and C pack specs and alert titles, so the canary leak check can actually find something.
- 2026-11-13 · step 4 · `page` is capped at 100000 in the contract; `GET /notification-log` accepts only the default sort.
- 2026-11-13 · step 4 · The `test-engineer` agent was not run separately; the security review's test findings were applied instead.

- 2026-11-13 · step 5 · Permission checks run in `preHandler`, before the id is parsed or looked up, so a technician gets 403 for any alert id and existence never leaks. A malformed id is a 400 (syntax only); a valid id that is missing or another consumer's is a 404.
- 2026-11-13 · step 5 · `/api/v1/openapi.json` is public and lists only implemented endpoints (mock login and `/dev` are never documented). It does name the role `platform_admin` and permission `permissions.manage` via the shared enums; accepted, since it is not tenant data. Steps 6 and 9 add their endpoints to the document.
- 2026-11-13 · step 5 · `buildApp` records a `routeInventory`; a test fails if any `/api/v1` route (other than sign-in, sign-out, `/me` and the spec) is undocumented or has no permission guard. Later steps get this check for free.
- 2026-11-13 · step 5 · The mock adapter refuses a consumer with more than 2000 packs (it sorts and pages in memory). A real adapter, or a larger demo, must push sorting and paging into its source or cache the computed list.
- 2026-11-13 · step 5 · Carried to step 6: a route-level test that a technician sending another user's id in `PUT /notification-channels` changes only their own channels (build the Principal from `req.auth`).

- 2026-11-13 · step 6 · Outbox: the attempt is counted when a job is claimed (not when recorded), so a crash after sending still uses an attempt; a job with no attempts left, or whose channel was disabled or removed, is failed at claim time with a log row (`delivery_failed` / `channel_disabled`). Unstarted jobs in a claimed batch are handed back with their attempt returned (`releaseJobs`).
- 2026-11-13 · step 6 · Backoff: after a failure wait 1 s before attempt 2 and 5 s before attempt 3; 25 s is reserved for a 4th. All due times, leases and backoff use the database clock; the only override is a test hook that is 0 in production.
- 2026-11-13 · step 6 · Worker safety: sends time out at min(10 s, lease/4) and the provider is given an `AbortSignal`; the worker never starts a send that could outlive the lease (it reserves a recording budget); `stop()` starts nothing new and waits at most 10 s. **A real provider must honour the abort signal** (pass it to fetch), or a timed-out send may still arrive and the retry duplicate it.
- 2026-11-13 · step 6 · Known limits, accepted for the mock build: (a) an attempt lost to a crash or a lapsed lease has no `notification_log` row (the next attempt number simply skips it); (b) a user's `alerts.view` is checked when the job is queued, not again at send time (window: lease plus backoff, under a minute); (c) delivery goes to the channel's current target and fails if the channel is disabled or removed.
- 2026-11-13 · step 6 · Config: `NOTIFY_*=mock` is refused when `NODE_ENV=production`, and only `mock` exists, so a production start is impossible until a real provider is added; that is the intended fail-closed behaviour. `POST /notification-channels/test` is limited to 5 a minute per user. Still to add with a real SMS provider: a daily per-user cap and target verification before a channel is enabled. Webhook SSRF protection at connect time (resolve DNS, block private ranges, no redirects) is still deferred (D-07).
- 2026-11-13 · step 6 · `POST /dev/simulate-alert` is guarded by a preHandler (platform_admin only), audits before it acts, and is deliberately absent from OpenAPI. The route inventory test requires every `/api/v1/dev/*` route to be guarded.
- 2026-11-13 · step 6 · Nginx (step 10) and the Compose API service must run exactly one API replica or several: both are safe (SKIP LOCKED plus leases), but set `TRUST_PROXY` as noted in step 3.

- 2026-11-13 · step 7 · The dev login switcher hard-codes the seeded user ids (`features/dev/mockUsers.ts`) instead of the API listing users; it and `mockLogin` exist only behind `VITE_MOCK_AUTH === 'true'`. A test builds the app with the variable unset, `false`, `TRUE` and `true` and greps the bundle for the switcher text, the seeded ids, `AUTH_PROVIDER`, `ENABLE_DEV_ENDPOINTS` and `mock-login`. The shared `api` object deliberately has no mock method.
- 2026-11-13 · step 7 · `useSession` reads cached data before the error flag, so one failed background poll never blanks a signed-in screen; only a real 401 signs the user out. Sign-out clears the session only when the server confirms it.
- 2026-11-13 · step 7 · Accessibility fixes from review: white focus ring inside the dark header (blue-700 was 2.7:1 there), a document title and a focused h1 for every page, a main landmark on loading and error screens, a persistent polite live region for loading text, `aria-disabled` instead of `disabled` on busy buttons, only a same-origin path is accepted as the logo, and requests time out after 15 s. Contrast of every colour pair in use was computed by the reviewer and passes AA (the only failure was the focus ring, now fixed).
- 2026-11-13 · step 7 · Not done yet: the return-to-where-you-were redirect after sign-in (a deep link falls back to the home page); axe checks and real-size checks arrive with the Playwright tests in step 8; the 44 px unit test only checks the class name, so real sizing is verified by hand at 390 px and by Playwright later.
- 2026-11-13 · step 7 · The web bundle includes `@ql/contracts`, which pulls in `@asteasolutions/zod-to-openapi` through `common.ts`. Acceptable for now (about 84 kB gzipped total); split the OpenAPI extension out of the shared schemas if the bundle size becomes a concern.
- 2026-11-13 · step 7 · Environment: the system disk `/` was 98% full (about 260 MB free), which made one test run fail with ENOSPC. Test scratch space now lives inside the project (`apps/web/node_modules/.cache`), on the larger volume.

- 2026-11-13 · step 8 · The fleet screen asks only for what the user may see (`fleet.view` for tiles, `alerts.view` for alerts, `packs.view` for packs); a section without its permission is not rendered and makes no request. Acknowledge is wrapped in `<Can permission="alerts.acknowledge">`.
- 2026-11-13 · step 8 · Packs sort by serial, state of health, remaining life and warranty, on both layouts; trend is shown (words, arrow, slope) but is not a sort option, because the table has no trend header and D-14 requires the same sorts in table and cards. Search and sort are done by the API.
- 2026-11-13 · step 8 · After a successful acknowledge the list and the Active alerts tile are refetched and focus returns to the Alerts heading; every Acknowledge button is disabled while one is in flight or while old rows show under a new filter. Announcements name the alert and its pack (titles repeat) and clear when the filter or page changes.
- 2026-11-13 · step 8 · If a list shrinks under you (the last alert on page 2 is acknowledged), the page steps back instead of showing an empty page with no pager. A new search starts at page 1 once the term settles.
- 2026-11-13 · step 8 · "Last refreshed" shows the oldest successful refresh among the sections on screen; Refresh is disabled and labelled while anything is fetching. A failed refresh keeps the old numbers with a visible "couldn't refresh, showing data from HH:MM:SS" notice.
- 2026-11-13 · step 8 · Playwright (`pnpm test:e2e`) drives the Chrome already installed (no browser download), against the compose database (reset before every run), the API in mock mode and the Vite dev server. It sets TMPDIR to `.tmp/` in the repo because the system disk can fill up. Step 10 re-points the same specs at the full Compose stack. axe runs at 390, 768 and 1440 px and fails on serious or critical issues; moderate and minor are not yet asserted.
- 2026-11-13 · step 8 · ESLint allows `tabIndex` on `role="region"` for the scrollable pack table (a scrollable region must be keyboard-focusable). Inline eslint-disable comments stay banned.
- 2026-11-13 · step 8 · Disk space: the system volume reached 100% during this step and blocked command output; two regenerable updater caches were deleted with the user's permission. Keep an eye on `/`.

## Blockers
_Claude records anything that stopped a step, and what is needed to unblock it._
