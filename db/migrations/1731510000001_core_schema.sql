-- Up Migration
-- Core schema (plan amended by D-01, D-03, D-06, D-07, D-09, D-10, D-13).

CREATE TABLE manufacturers (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL,
  logo_url  text
);

CREATE TABLE consumers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  type             text NOT NULL CHECK (type IN ('oem', 'ess_integrator', 'fleet_operator')),
  manufacturer_id  uuid NOT NULL REFERENCES manufacturers (id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- platform_admin belongs to no consumer (D-01); every other role must have one.
CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id  uuid REFERENCES consumers (id),
  name         text NOT NULL,
  email        text NOT NULL UNIQUE,
  role         text NOT NULL CHECK (role IN ('fleet_manager', 'technician', 'consumer_admin', 'platform_admin')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, consumer_id),
  CHECK ((role = 'platform_admin') = (consumer_id IS NULL))
);

CREATE TABLE packs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id           uuid NOT NULL REFERENCES consumers (id),
  serial                text NOT NULL UNIQUE,
  spec                  text NOT NULL,
  asset_id              text,
  status                text NOT NULL DEFAULT 'in_service' CHECK (status IN ('in_service', 'out_of_service', 'retired')),
  -- Warranty status (Active / Expiring / Expired) is derived from this date at read time (D-10).
  warranty_expires_on   date NOT NULL,
  UNIQUE (id, consumer_id)
);

CREATE TABLE pack_health (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pack_id          uuid NOT NULL,
  consumer_id      uuid NOT NULL,
  recorded_at      timestamptz NOT NULL,
  soh_pct          numeric(4, 1) NOT NULL CHECK (soh_pct BETWEEN 0 AND 100),
  rul_months_low   numeric(5, 1) NOT NULL CHECK (rul_months_low >= 0),
  rul_months_high  numeric(5, 1) NOT NULL,
  model_version    text NOT NULL,
  confidence       numeric(4, 3) CHECK (confidence BETWEEN 0 AND 1),
  signals          jsonb,
  CHECK (rul_months_high >= rul_months_low),
  FOREIGN KEY (pack_id, consumer_id) REFERENCES packs (id, consumer_id)
);
CREATE INDEX pack_health_pack_time_idx ON pack_health (pack_id, recorded_at DESC);
CREATE INDEX pack_health_consumer_time_idx ON pack_health (consumer_id, recorded_at DESC);

CREATE TABLE alerts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id          uuid NOT NULL,
  pack_id              uuid NOT NULL,
  severity             text NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  title                text NOT NULL,
  description          text NOT NULL,
  recommended_action   text NOT NULL,
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  acknowledged_by      uuid,
  acknowledged_at      timestamptz,
  model_version        text NOT NULL,
  confidence           numeric(4, 3) CHECK (confidence BETWEEN 0 AND 1),
  signals              jsonb,
  UNIQUE (id, consumer_id),
  FOREIGN KEY (pack_id, consumer_id) REFERENCES packs (id, consumer_id),
  FOREIGN KEY (acknowledged_by, consumer_id) REFERENCES users (id, consumer_id),
  CHECK ((status = 'open') = (acknowledged_at IS NULL AND acknowledged_by IS NULL) OR status = 'resolved')
);
CREATE INDEX alerts_consumer_status_idx ON alerts (consumer_id, status, created_at DESC);

CREATE TABLE notification_channels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  consumer_id  uuid NOT NULL,
  type         text NOT NULL CHECK (type IN ('email', 'sms', 'webhook')),
  target       text NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  -- consumer_id first so a cross-tenant insert fails on the composite FK, not on a uniqueness
  -- error that would reveal another tenant's row. Equivalent to UNIQUE (user_id, type) (D-14).
  UNIQUE (consumer_id, user_id, type),
  FOREIGN KEY (user_id, consumer_id) REFERENCES users (id, consumer_id)
);

-- Outbox (D-07). Alert creation inserts jobs in the same transaction.
CREATE TABLE notification_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id      uuid NOT NULL,
  alert_id         uuid NOT NULL,
  user_id          uuid NOT NULL,
  channel          text NOT NULL CHECK (channel IN ('email', 'sms', 'webhook')),
  target           text NOT NULL,
  attempts         int NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  UNIQUE (consumer_id, alert_id, user_id, channel),
  FOREIGN KEY (alert_id, consumer_id) REFERENCES alerts (id, consumer_id),
  FOREIGN KEY (user_id, consumer_id) REFERENCES users (id, consumer_id)
);
CREATE INDEX notification_jobs_due_idx ON notification_jobs (next_attempt_at) WHERE status = 'pending';

-- alert_id is null for test messages.
CREATE TABLE notification_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id  uuid NOT NULL,
  alert_id     uuid,
  kind         text NOT NULL CHECK (kind IN ('alert', 'test')),
  channel      text NOT NULL CHECK (channel IN ('email', 'sms', 'webhook')),
  status       text NOT NULL CHECK (status IN ('sent', 'failed')),
  attempt      int NOT NULL DEFAULT 1,
  error        text,
  at           timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (alert_id, consumer_id) REFERENCES alerts (id, consumer_id)
);
CREATE INDEX notification_log_consumer_time_idx ON notification_log (consumer_id, at DESC);

-- consumer_id is null for platform-level events such as a role policy change.
CREATE TABLE audit_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consumer_id  uuid REFERENCES consumers (id),
  user_id      uuid REFERENCES users (id),
  FOREIGN KEY (user_id, consumer_id) REFERENCES users (id, consumer_id),
  action       text NOT NULL,
  object       text NOT NULL,
  at           timestamptz NOT NULL DEFAULT now()
);

-- Not tenant-scoped: the policy is global (D-01, D-11). Versions are never overwritten.
CREATE TABLE role_policies (
  version     int PRIMARY KEY CHECK (version >= 1),
  policy      jsonb NOT NULL,
  created_by  uuid REFERENCES users (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
-- Forward-only: applied migrations are immutable (CLAUDE.md non-negotiable 10).
