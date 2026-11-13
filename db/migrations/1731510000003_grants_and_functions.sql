-- Up Migration
-- ql_app gets only the grants it needs (D-02). It owns nothing.

GRANT SELECT ON manufacturers TO ql_app;
GRANT SELECT ON consumers, users, packs, pack_health TO ql_app;
GRANT SELECT, INSERT ON alerts TO ql_app;
GRANT UPDATE (status, acknowledged_by, acknowledged_at) ON alerts TO ql_app;
GRANT SELECT, INSERT, DELETE ON notification_channels TO ql_app;
GRANT UPDATE (type, target, enabled) ON notification_channels TO ql_app;
GRANT SELECT, INSERT ON notification_jobs TO ql_app;
GRANT UPDATE (attempts, next_attempt_at, status) ON notification_jobs TO ql_app;
GRANT SELECT, INSERT ON notification_log TO ql_app;
GRANT SELECT ON role_policies TO ql_app;

-- Audit log is append-only (D-13). No UPDATE or DELETE is ever granted; the REVOKE makes it explicit.
GRANT SELECT, INSERT ON audit_events TO ql_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM ql_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON role_policies FROM ql_app;

-- D-04: login lookup. Returns only (id, consumer_id, role, name).
CREATE FUNCTION auth_find_user(p_user_id uuid)
  RETURNS TABLE (id uuid, consumer_id uuid, role text, name text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$ SELECT u.id, u.consumer_id, u.role, u.name FROM public.users u WHERE u.id = p_user_id $$;

-- D-04: dispatcher and simulator. Returns consumer IDs only; work then runs inside withTenant.
CREATE FUNCTION list_consumer_ids()
  RETURNS TABLE (id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$ SELECT c.id FROM public.consumers c ORDER BY c.id $$;

-- D-01, D-13: platform-level writes. Both refuse to run inside a tenant context and require a
-- platform_admin actor, so code running for a consumer cannot forge them.
CREATE FUNCTION audit_platform_event(p_user uuid, p_action text, p_object text)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
BEGIN
  IF nullif(current_setting('app.consumer_id', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'platform audit events cannot be written inside a tenant context' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user AND u.role = 'platform_admin') THEN
    RAISE EXCEPTION 'actor is not a platform_admin' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.audit_events (consumer_id, user_id, action, object) VALUES (NULL, p_user, p_action, p_object);
END $$;

CREATE FUNCTION role_policy_publish(p_policy jsonb, p_created_by uuid)
  RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
DECLARE v int;
BEGIN
  IF nullif(current_setting('app.consumer_id', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'the role policy cannot be changed inside a tenant context' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_created_by AND u.role = 'platform_admin') THEN
    RAISE EXCEPTION 'actor is not a platform_admin' USING ERRCODE = '42501';
  END IF;
  LOCK TABLE public.role_policies IN SHARE ROW EXCLUSIVE MODE;
  SELECT coalesce(max(version), 0) + 1 INTO v FROM public.role_policies;
  INSERT INTO public.role_policies (version, policy, created_by) VALUES (v, p_policy, p_created_by);
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION audit_platform_event(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION role_policy_publish(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_platform_event(uuid, text, text) TO ql_app;
GRANT EXECUTE ON FUNCTION role_policy_publish(jsonb, uuid) TO ql_app;

REVOKE ALL ON FUNCTION auth_find_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION list_consumer_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_user(uuid) TO ql_app;
GRANT EXECUTE ON FUNCTION list_consumer_ids() TO ql_app;

-- Down Migration
-- Forward-only: applied migrations are immutable (CLAUDE.md non-negotiable 10).
