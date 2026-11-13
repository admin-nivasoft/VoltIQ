-- Up Migration
-- Row-level security that holds under connection pooling (D-02).

-- One place to widen later for manufacturer users (D-06). With the setting missing or empty,
-- nullif() yields NULL, the comparison is NULL, and the row is not visible: fails closed.
CREATE FUNCTION ql_visible(cid uuid) RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT cid = nullif(current_setting('app.consumer_id', true), '')::uuid $$;

ALTER TABLE consumers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumers             FORCE  ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 FORCE  ROW LEVEL SECURITY;
ALTER TABLE packs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE packs                 FORCE  ROW LEVEL SECURITY;
ALTER TABLE pack_health           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pack_health           FORCE  ROW LEVEL SECURITY;
ALTER TABLE alerts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts                FORCE  ROW LEVEL SECURITY;
ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels FORCE  ROW LEVEL SECURITY;
ALTER TABLE notification_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_jobs     FORCE  ROW LEVEL SECURITY;
ALTER TABLE notification_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log      FORCE  ROW LEVEL SECURITY;
ALTER TABLE audit_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events          FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON consumers
  USING (ql_visible(id)) WITH CHECK (ql_visible(id));
CREATE POLICY tenant_isolation ON users
  USING (ql_visible(consumer_id)) WITH CHECK (ql_visible(consumer_id));
CREATE POLICY tenant_isolation ON packs
  USING (ql_visible(consumer_id)) WITH CHECK (ql_visible(consumer_id));
CREATE POLICY tenant_isolation ON pack_health
  USING (ql_visible(consumer_id)) WITH CHECK (ql_visible(consumer_id));
CREATE POLICY tenant_isolation ON alerts
  USING (ql_visible(consumer_id)) WITH CHECK (ql_visible(consumer_id));
CREATE POLICY tenant_isolation ON notification_channels
  USING (ql_visible(consumer_id)) WITH CHECK (ql_visible(consumer_id));
CREATE POLICY tenant_isolation ON notification_jobs
  USING (ql_visible(consumer_id)) WITH CHECK (ql_visible(consumer_id));
CREATE POLICY tenant_isolation ON notification_log
  USING (ql_visible(consumer_id)) WITH CHECK (ql_visible(consumer_id));
CREATE POLICY tenant_isolation ON audit_events
  USING (ql_visible(consumer_id)) WITH CHECK (ql_visible(consumer_id));

-- Narrow, role-targeted policies. They never apply to ql_app.
-- 1. The SECURITY DEFINER lookups (D-04) run as ql_owner, which FORCE RLS also binds, so they
--    need a read-only view of users and consumers.
CREATE POLICY owner_lookup ON users      FOR SELECT TO ql_owner USING (true);
CREATE POLICY owner_lookup ON consumers  FOR SELECT TO ql_owner USING (true);
-- 2. The seed must be able to create the consumer-less platform_admin user.
CREATE POLICY owner_platform_admin ON users FOR INSERT TO ql_owner
  WITH CHECK (consumer_id IS NULL AND role = 'platform_admin');
-- 3. Platform-level audit events (no consumer) are written only by the definer function
--    audit_platform_event(), which runs as ql_owner. ql_app has no such path of its own.
CREATE POLICY platform_audit ON audit_events FOR INSERT TO ql_owner
  WITH CHECK (consumer_id IS NULL);

-- role_policies is global, not tenant data. RLS stops a request running inside a tenant context
-- from writing it: ql_app can read it, and writes go through role_policy_publish() (D-01).
ALTER TABLE role_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_policies FORCE  ROW LEVEL SECURITY;
CREATE POLICY read_all     ON role_policies FOR SELECT TO ql_app   USING (true);
CREATE POLICY owner_read   ON role_policies FOR SELECT TO ql_owner USING (true);
CREATE POLICY owner_insert ON role_policies FOR INSERT TO ql_owner WITH CHECK (true);

-- Down Migration
-- Forward-only: applied migrations are immutable (CLAUDE.md non-negotiable 10).
