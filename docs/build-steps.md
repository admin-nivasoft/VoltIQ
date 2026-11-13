# Build steps

`/build-step N` works on one step. A step is **done** only when every acceptance check below it has been run and passes. Claude updates this file as it goes.

All work goes on the branch `build/scr-04`, with one commit per step. Nothing is pushed automatically.

Status values: `todo` · `in-progress` · `done` · `blocked`

`Run with:` is the model and effort level for the main session on that step. `scripts/claude-build.sh` applies it automatically; interactively, start the session with it (see SETUP.md, "Token and cost controls"). Claude never edits these lines.

---

## Step 1 · Monorepo scaffold and contracts
Status: todo
Run with: model=sonnet effort=medium

Build:
- pnpm workspace with `apps/web`, `apps/api`, `packages/contracts`, and a root `tsconfig.base.json` (strict).
- ESLint (flat config) with the data-boundary `no-restricted-imports` rule, plus Prettier, Vitest workspace and all root scripts listed in CLAUDE.md. Scripts for later steps may be placeholders that exit 0 with a message.
- `packages/contracts`:
  - zod schemas for Me, FleetSummary, PackSummary (with trend, RUL range, confidence), Alert, Page<T>, NotificationChannel, NotificationLogEntry, RolePolicy and Error;
  - an OpenAPI generator script.
- `.env.example` with every variable from D-08 and D-10.

Acceptance:
- [ ] `pnpm install && pnpm lint && pnpm typecheck && pnpm test:unit` passes
- [ ] A test proves that importing `pg` outside `apps/api/src/data` fails lint
- [ ] A test proves the contracts contain no `supplier`, `cohort` or `cell_lot` (D-12)

## Step 2 · Database schema, RLS and seed
Status: todo
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
- [ ] `docker compose up -d db && pnpm db:reset` works twice in a row
- [ ] The D-12 database-level RLS tests pass, including the pooled-connection leak test
- [ ] Inserting a health row whose consumer doesn't match its pack fails

## Step 3 · API core: config, mock auth, policy, /me
Status: todo
Run with: model=opus effort=high

Build:
- Fastify app and a config module that fails at startup per D-08.
- `withTenant`, the cookie JWT, `POST /auth/mock-login`, `POST /auth/logout` and `GET /me` (user, consumer, manufacturer branding, role, effective permissions).
- The policy service on `role_policies` and `requirePermission()`.
- The error envelope, rate limiting, security headers, `/healthz` and `/readyz`.

Acceptance:
- [ ] Unit tests: policy checks, and startup refuses the unsafe config combinations
- [ ] Integration test: logging in as each seeded role returns the right permissions from `/me`
- [ ] Without the dev env flags, `/auth/mock-login` returns 404

## Step 4 · Data layer and adapter contract tests
Status: todo
Run with: model=sonnet effort=high

Build:
- The `FleetDataSource` and `AppStateRepository` interfaces (D-05), the `postgres-mock` adapter and the repository.
- The trend and near-EOL calculations from D-10.
- A shared contract test suite that any adapter can run.

Acceptance:
- [ ] The contract suite passes for `postgres-mock`, including cross-tenant cases
- [ ] Unit tests cover the trend edge cases: under 3 readings, flat, declining, improving

## Step 5 · Fleet, packs and alerts endpoints
Status: todo
Run with: model=sonnet effort=medium

Build:
- `GET /fleet/summary`, `GET /packs` (search, allow-listed sort, paging), `GET /alerts` and `POST /alerts/{id}/acknowledge`, following the D-10 rules, with audit events.
- OpenAPI served at `/api/v1/openapi.json`.

Acceptance:
- [ ] Integration tests cover every endpoint for each role: 403 for a missing permission, 404 for another consumer's alert
- [ ] Acknowledging lowers the active alert count; a second acknowledgement is idempotent; acknowledging a resolved alert returns 409
- [ ] The D-12 canary crawl passes

## Step 6 · Notifications
Status: todo
Run with: model=sonnet effort=medium

Build:
- `NotificationProvider` and the mock email, SMS and webhook providers (a target containing "fail" always fails).
- The provider registry, which fails at startup on an unknown value.
- The D-07 outbox and worker, the channel endpoints, the test message endpoint, `GET /notification-log` and `POST /dev/simulate-alert` (D-04).

Acceptance:
- [ ] Unit tests: retries with backoff, idempotent jobs, only users with `alerts.view` notified
- [ ] Integration test: a simulated alert to a "fail" target produces 3 attempts in the log and status failed
- [ ] Integration test: jobs survive an API restart (stop the worker, start it again, and the jobs complete)

## Step 7 · Frontend shell
Status: todo
Run with: model=sonnet effort=medium

Build:
- Vite app, router, a TanStack Query client polling every 30 s, and an API client typed from contracts that sends the `X-Requested-With` header.
- The dev login switcher behind `VITE_MOCK_AUTH`, the layout with the branded top bar, the `<Can>` component, and shared loading, empty and error components.

Acceptance:
- [ ] Component tests: `<Can>` hides controls; the error and empty states render
- [ ] A production build with `VITE_MOCK_AUTH=false` contains no switcher code (checked by grepping the bundle)

## Step 8 · Fleet health screen
Status: todo
Run with: model=sonnet effort=medium

Build:
- Headline tiles, the alert list with Acknowledge, and the pack table with search, sort, trend (text and icon), RUL range with confidence, and warranty status.
- The card layout below 768 px.
- The "last refreshed" time.

Acceptance:
- [ ] Component tests for each panel, including empty and error states
- [ ] Playwright: sign in as fleet manager, acknowledge an alert, and the tile count drops; as technician there is no Acknowledge button
- [ ] axe reports no serious or critical issues at 390, 768 and 1440 px

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

## Blockers
_Claude records anything that stopped a step, and what is needed to unblock it._
