-- Dev/test bootstrap, run as a superuser. Creates the two application roles (D-02) and
-- recreates an empty public schema owned by ql_owner. Passwords here are local-dev only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ql_owner') THEN
    CREATE ROLE ql_owner LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ql_app') THEN
    CREATE ROLE ql_app LOGIN;
  END IF;
END $$;

-- ql_owner policies must never reach ql_app through role membership.
REVOKE ql_owner FROM ql_app;
ALTER ROLE ql_owner PASSWORD 'ql_owner_dev' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER ROLE ql_app   PASSWORD 'ql_app_dev'   NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO ql_owner, ql_app', current_database());
END $$;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION ql_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ql_app;
