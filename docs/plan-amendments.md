# Plan amendments: binding fixes from the audit

These amend `docs/architecture-plan.md`. Where the two disagree, this file wins. IDs (D-nn) are cited in code comments and commit messages.

## Critical

### D-01 · Consumer roles cannot change the role policy
- Remove `permissions.manage` from `consumer_admin`. Add a mock-only role, `platform_admin`, that belongs to no consumer. It holds `permissions.manage` and appears in the dev login switcher only.
- Store the policy in a Postgres table, `role_policies (version int primary key, policy jsonb, created_by, created_at)`, not in a file. The API reads the latest version and caches it for 10 s. `config/permissions.json` is the seed for version 1.
- `PUT /admin/permissions` validates the new policy with zod, inserts a new version and writes an audit event. Old versions are never overwritten.
- Remove `users.manage` until a user-management feature exists.
- Starting policy:

```json
{
  "version": 1,
  "roles": {
    "fleet_manager":  ["fleet.view", "alerts.view", "alerts.acknowledge", "packs.view", "channels.manage_own"],
    "technician":     ["fleet.view", "alerts.view", "packs.view", "channels.manage_own"],
    "consumer_admin": ["fleet.view", "alerts.view", "alerts.acknowledge", "packs.view", "channels.manage_own", "notifications.view_log"],
    "platform_admin": ["permissions.manage"]
  }
}
```

### D-02 · Row-level security that holds under connection pooling
- Two database roles:
  - `ql_owner` owns the schema and runs migrations.
  - `ql_app` is `NOSUPERUSER NOBYPASSRLS`, owns nothing and gets only the grants it needs.
- `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on every tenant table.
- Policy shape. Write it as a function so one place can be widened later (D-06):
  `ql_visible(consumer_id) := consumer_id = nullif(current_setting('app.consumer_id', true), '')::uuid`
  With the setting missing, the function returns NULL, so the query sees no rows (fails closed).
- `consumers` uses `ql_visible(id)`.
- Every request runs in `withTenant(consumerId, fn)`: `BEGIN; SELECT set_config('app.consumer_id', $1, true); …; COMMIT`. A plain `SET` is forbidden.

### D-03 · The database enforces that tenant columns agree
- Add `UNIQUE (id, consumer_id)` on `packs`, `alerts` and `users`.
- Use composite foreign keys:
  - `pack_health (pack_id, consumer_id) → packs (id, consumer_id)`
  - `alerts (pack_id, consumer_id) → packs`
  - `notification_channels (user_id, consumer_id) → users`
  - `notification_log (alert_id, consumer_id) → alerts`, with `alert_id` nullable for test messages

### D-04 · Narrow privileged paths, no BYPASSRLS
- **Login lookup:** a `SECURITY DEFINER` function, `auth_find_user(user_id uuid)`, owned by `ql_owner`. It returns only `(id, consumer_id, role, name)`. `ql_app` gets EXECUTE on it and nothing else extra.
- **Dispatcher and simulator:** a `SECURITY DEFINER` function, `list_consumer_ids()`, returns all consumer IDs. The worker then does all work inside `withTenant(id, …)`, one consumer at a time.
- **`POST /dev/simulate-alert`** is the one documented exception to the token-only rule. It takes `consumerId` in the body, requires a `platform_admin` token, and exists only under D-08 conditions.

## High

### D-05 · Split the data layer in two
- `FleetDataSource` (swappable): `getFleetSummary`, `listPacks`, `listAlerts`, `getAlert`. The adapter is chosen by `DATA_PROVIDER=postgres-mock`.
- `AppStateRepository` (always Postgres): alert acknowledgement and status, notification channels, outbox and log, audit events, role policies, consumer and manufacturer branding.
- Both live under `apps/api/src/data/`, and both take `consumerId` as their first parameter.
- The shared contract test suite runs against `FleetDataSource` adapters and includes cross-tenant cases.
- Pack-to-consumer assignment is owned by our database even when health data comes from a vendor. Adapters join the vendor's health data onto our assignments; they never trust a vendor's owner field.

### D-06 · Model the manufacturer now
- Add a `manufacturers (id, name, logo_url)` table and `consumers.manufacturer_id`. Branding (the "packs supplied by" line) is read from it. Drop the manufacturer name and logo columns from `consumers` and the logo config value.
- Manufacturer users' read-only SCR-04 access is out of scope. It will come later by widening `ql_visible()` with an `app.manufacturer_id` setting. Write no code that assumes it will never happen.

### D-07 · Notifications go through an outbox
- Create `notification_jobs (id, consumer_id, alert_id, user_id, channel, target, attempts, next_attempt_at, status)` with `UNIQUE (alert_id, user_id, channel)` for idempotency. Alert creation inserts the jobs in the same transaction.
- A worker in the API process polls with `FOR UPDATE SKIP LOCKED`, inside `withTenant`. It makes up to 3 attempts with backoff (1 s, 5 s, 25 s) and writes every attempt to `notification_log`.
- Only users whose role has `alerts.view` receive notifications.
- `notification_log` gets a `kind` column (`alert` or `test`).
- Add the endpoint `GET /notification-log` (permission `notifications.view_log`, scoped to the consumer, paged).
- Message text comes only from the alert's consumer-facing fields.
- Validate targets by channel type: an email address, an E.164 phone number, or an https URL. Note for later: real webhook delivery must block private IP ranges (SSRF).

### D-08 · Mock features fail closed
- Mock login and `/dev/*` are registered only when `AUTH_PROVIDER=mock` **and** `ENABLE_DEV_ENDPOINTS=true`.
- The API refuses to start if `AUTH_PROVIDER=mock` while `NODE_ENV=production`, or if `JWT_SECRET` is missing or shorter than 32 characters.
- Tokens are HS256 with an 8-hour expiry, sent in an httpOnly, `SameSite=Strict`, `Secure` (except on localhost) cookie.
- Nginx serves the web app and proxies `/api` on the same origin, so no CORS is configured.
- State-changing requests must carry the header `X-Requested-With: ql`.
- The dev login switcher is included only when `VITE_MOCK_AUTH=true` at build time, so it is tree-shaken out otherwise.

### D-09 · Model transparency (NFR-09, PLT-AN-06)
- `pack_health` and `alerts` get `model_version text not null`, `confidence numeric(4,3)` and `signals jsonb`. Seed them with plausible mock values.
- The contracts expose them, and the UI shows confidence next to remaining life.

## Medium

### D-10 · Definitions (all values configurable)
- **Packs in service:** packs assigned to the consumer with `status = 'in_service'`. Add a `packs.status` column.
- **Average SoH:** the mean of each in-service pack's latest `soh_pct`, rounded to 1 decimal.
- **Near end of life:** `rul_months_low < NEAR_EOL_MONTHS` (default 6). This uses the conservative end of the range.
- **Trend:** the least-squares slope of SoH over the last 90 days, in points per 30 days:
  - below `TREND_DECLINING` (default -0.5): Declining
  - above +0.5: Improving
  - otherwise: Stable
  - fewer than 3 readings: "Not enough data"
- **Alert status:** `open → acknowledged → resolved`. Active alerts are those with status `open`. Acknowledging an already acknowledged alert returns 200 with the original acknowledgement unchanged. Acknowledging a resolved alert returns 409.
- **Placeholders:**
  - Severities: High, Medium, Low.
  - Warranty status: Active, Expiring (under 90 days), Expired.

### D-11 · Assumptions to flag in the README
- Technicians have `alerts.view` and `channels.manage_own`. The role matrix only says "View own packs".
- The policy is global; per-consumer overrides are deferred.
- FR-05's "manufacturer sees acknowledgement on SCR-03" is supported by the data (`acknowledged_by`, `acknowledged_at`) but has no UI in this build.

### D-12 · Tests that can actually fail
- **Canary crawl:** seed distinctive names (for example `CANARY-CONSUMER-B`) for consumers B and C. Signed in as A, call every GET endpoint with every query variant, and assert that no B or C ID or name appears anywhere.
- **Database-level tests as `ql_app`:**
  - With no setting, every tenant table returns 0 rows.
  - With A set, only A's rows come back.
  - After `withTenant(A)` finishes, the same pooled connection has no setting.
  - Inserting with a mismatched `consumer_id` and `pack_id` fails.
- A test fails if any contracts schema or migration contains `supplier`, `cohort` or `cell_lot`.

### D-13 · The audit log is append-only
- `REVOKE UPDATE, DELETE ON audit_events FROM ql_app`.
- Audit events record login, acknowledgement, policy change, channel change and test send.

## Low

### D-14 · UI and API details
- Below 768 px the pack table becomes a card list, with the same data and the same sort and search.
- `/healthz` reports liveness. `/readyz` also checks the database with `SELECT 1`.
- `notification_channels` has `id uuid` as its primary key and `UNIQUE (user_id, type)`.
- Rate limiting uses `@fastify/rate-limit`, in memory: 300 requests per minute per user, and 10 per minute on mock-login.

### D-15 · Deployment notes for later
- Azure resources go in an Azure India region (NFR-06).
- Per-instance rate limiting and the in-process outbox worker are fine for a single replica. Scaling out needs Redis for rate limits; the outbox already works with several workers.
