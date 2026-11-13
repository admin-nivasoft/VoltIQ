-- Deterministic demo seed, run as ql_owner after migrations (FORCE RLS binds the owner too, so
-- each consumer's rows are written with that consumer set). Every value is derived from md5()
-- hashes, so two runs produce the same data. Timestamps are relative to the run time.
BEGIN;

CREATE FUNCTION pg_temp.h(seed text) RETURNS numeric LANGUAGE sql IMMUTABLE AS
$$ SELECT (('x' || substr(md5(seed), 1, 7))::bit(28)::int)::numeric / 268435456 $$;

INSERT INTO manufacturers (id, name, logo_url)
VALUES ('f0000000-0000-4000-8000-000000000001', '82 Volts', '/assets/82volts-logo.svg');

INSERT INTO role_policies (version, policy, created_by, created_at) VALUES (1, '{"version":1,"roles":{"fleet_manager":["fleet.view","alerts.view","alerts.acknowledge","packs.view","channels.manage_own"],"technician":["fleet.view","alerts.view","packs.view","channels.manage_own"],"consumer_admin":["fleet.view","alerts.view","alerts.acknowledge","packs.view","channels.manage_own","notifications.view_log"],"platform_admin":["permissions.manage"]}}'::jsonb, NULL, now());

DO $$
DECLARE
  cons record;
  fm uuid;
BEGIN
  FOR cons IN
    SELECT * FROM (VALUES
      (1, 'a0000000-0000-4000-8000-000000000001'::uuid, 'Aurora Motors (OEM)',               'oem',            'A'),
      (2, 'b0000000-0000-4000-8000-000000000002'::uuid, 'CANARY-CONSUMER-B ESS Integrator',  'ess_integrator', 'B'),
      (3, 'c0000000-0000-4000-8000-000000000003'::uuid, 'CANARY-CONSUMER-C Fleet Operator',  'fleet_operator', 'C')
    ) AS v(idx, id, name, type, code) ORDER BY idx
  LOOP
    PERFORM set_config('app.consumer_id', cons.id::text, true);
    fm := ('e000000' || cons.idx || '-0000-4000-8000-000000000001')::uuid;

    INSERT INTO consumers (id, name, type, manufacturer_id)
    VALUES (cons.id, cons.name, cons.type, 'f0000000-0000-4000-8000-000000000001');

    INSERT INTO users (id, consumer_id, name, email, role) VALUES
      (fm,                                                         cons.id, 'Fleet Manager ' || cons.code, 'fleet.manager.'   || lower(cons.code) || '@example.test', 'fleet_manager'),
      (('e000000' || cons.idx || '-0000-4000-8000-000000000002')::uuid, cons.id, 'Technician '    || cons.code, 'technician.'      || lower(cons.code) || '@example.test', 'technician'),
      (('e000000' || cons.idx || '-0000-4000-8000-000000000003')::uuid, cons.id, 'Admin '         || cons.code, 'consumer.admin.'  || lower(cons.code) || '@example.test', 'consumer_admin');

    INSERT INTO packs (id, consumer_id, serial, spec, asset_id, status, warranty_expires_on)
    SELECT md5('pack-' || cons.code || '-' || n)::uuid,
           cons.id,
           'QL-' || cons.code || '-' || lpad(n::text, 4, '0'),
           CASE WHEN cons.code <> 'A' AND n = 1 THEN 'CANARY-CONSUMER-' || cons.code || ' spec' ELSE (ARRAY['LFP-48V-100Ah', 'NMC-72V-60Ah', 'LFP-400V-250kWh'])[1 + n % 3] END,
           CASE WHEN n <= 36 THEN 'ASSET-' || cons.code || '-' || lpad(n::text, 3, '0') END,
           CASE WHEN n IN (38, 39) THEN 'out_of_service' WHEN n = 40 THEN 'retired' ELSE 'in_service' END,
           current_date + ((n * 37) % 760 - 200)
    FROM generate_series(1, 40) AS n;

    -- 61 readings per pack, every 3 days over 180 days. Class by n % 5:
    -- 0 declining (near end of life), 1 improving, otherwise gently drifting down.
    INSERT INTO pack_health (pack_id, consumer_id, recorded_at, soh_pct, rul_months_low, rul_months_high,
                             model_version, confidence, signals)
    SELECT p.id, p.consumer_id,
           now() - make_interval(days => 180 - 3 * k),
           round(least(100, greatest(40,
             88 + 10 * pg_temp.h('s0' || p.id)
             + (CASE (right(p.serial, 4)::int % 5) WHEN 0 THEN -1.6 WHEN 1 THEN 0.8 ELSE -0.15 END) / 30.0 * (3 * k)
             + (pg_temp.h(p.id || ':' || k) - 0.5) * 0.3))::numeric, 1),
           round((CASE WHEN right(p.serial, 4)::int % 5 = 0 THEN 1 + ((right(p.serial, 4)::int / 5) % 5)
                       ELSE 8 + right(p.serial, 4)::int % 13 END + (180 - 3 * k) / 30.0)::numeric, 1),
           round((CASE WHEN right(p.serial, 4)::int % 5 = 0 THEN 1 + ((right(p.serial, 4)::int / 5) % 5)
                       ELSE 8 + right(p.serial, 4)::int % 13 END + (180 - 3 * k) / 30.0 + 3 + right(p.serial, 4)::int % 4)::numeric, 1),
           'ql-health-1.3.0',
           round((0.6 + 0.35 * pg_temp.h('c' || p.id || ':' || k))::numeric, 3),
           jsonb_build_object(
             'capacity_fade',   round((pg_temp.h('cf' || p.id || ':' || k) * 5)::numeric, 2),
             'resistance_rise', round((pg_temp.h('rr' || p.id || ':' || k) * 4)::numeric, 2))
    FROM packs p CROSS JOIN generate_series(0, 60) AS k;

    -- 12 alerts: every severity x status combination appears at least once.
    INSERT INTO alerts (id, consumer_id, pack_id, severity, title, description, recommended_action, status,
                        created_at, acknowledged_by, acknowledged_at, model_version, confidence, signals)
    SELECT md5('alert-' || cons.code || '-' || i)::uuid,
           cons.id,
           md5('pack-' || cons.code || '-' || (1 + (i * 7) % 40))::uuid,
           sev,
           (CASE WHEN cons.code <> 'A' AND i = 2 THEN 'CANARY-CONSUMER-' || cons.code || ' alert: ' ELSE '' END) || (CASE sev WHEN 'high' THEN 'Battery health is dropping faster than expected'
                     WHEN 'medium' THEN 'Battery is ageing faster than similar packs'
                     ELSE 'Small change in battery behaviour' END),
           (CASE sev WHEN 'high' THEN 'This pack has lost capacity quickly over the last few weeks and may not last its planned service life.'
                     WHEN 'medium' THEN 'This pack is losing capacity a little faster than expected. It is still within normal limits.'
                     ELSE 'We noticed a small change in how this pack charges. No action is needed right now.' END),
           (CASE sev WHEN 'high' THEN 'Arrange an inspection within 7 days and plan a replacement.'
                     WHEN 'medium' THEN 'Review how this pack is used and recheck in 30 days.'
                     ELSE 'No action needed. Keep monitoring.' END),
           st,
           now() - make_interval(days => i * 5, hours => i),
           CASE WHEN st <> 'open' THEN fm END,
           CASE WHEN st <> 'open' THEN now() - make_interval(days => i * 5, hours => i) + interval '6 hours' END,
           'ql-health-1.3.0',
           round((0.65 + 0.3 * pg_temp.h('ac' || cons.code || i))::numeric, 3),
           jsonb_build_object('capacity_fade', round((pg_temp.h('acf' || cons.code || i) * 5)::numeric, 2))
    FROM generate_series(1, 12) AS i,
         LATERAL (SELECT (ARRAY['high', 'medium', 'low'])[1 + (i - 1) % 3] AS sev,
                         (ARRAY['open', 'acknowledged', 'resolved'])[1 + ((i - 1) / 3) % 3] AS st) AS x;

    INSERT INTO notification_channels (id, user_id, consumer_id, type, target, enabled)
    VALUES (md5('channel-' || cons.code)::uuid, fm, cons.id, 'email', 'fleet.manager.' || lower(cons.code) || '@example.test', true);

    INSERT INTO notification_jobs (id, consumer_id, alert_id, user_id, channel, target, attempts, status)
    VALUES (md5('job-' || cons.code)::uuid, cons.id, md5('alert-' || cons.code || '-4')::uuid, fm, 'email',
            'fleet.manager.' || lower(cons.code) || '@example.test', 1, 'sent');

    INSERT INTO notification_log (id, consumer_id, alert_id, kind, channel, status, attempt) VALUES
      (md5('log1-' || cons.code)::uuid, cons.id, md5('alert-' || cons.code || '-4')::uuid, 'alert', 'email', 'sent', 1),
      (md5('log2-' || cons.code)::uuid, cons.id, NULL, 'test', 'email', 'sent', 1);

    INSERT INTO audit_events (consumer_id, user_id, action, object) VALUES
      (cons.id, fm, 'login', 'session'),
      (cons.id, fm, 'alert.acknowledge', 'alert:' || md5('alert-' || cons.code || '-4'));
  END LOOP;
END $$;

-- The one platform_admin: no consumer (D-01). The owner_platform_admin policy permits this insert.
INSERT INTO users (id, consumer_id, name, email, role)
VALUES ('d0000000-0000-4000-8000-000000000001', NULL, 'Platform Admin', 'platform.admin@example.test', 'platform_admin');

COMMIT;
