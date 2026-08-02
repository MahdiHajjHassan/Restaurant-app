-- Bootstrap local PostgreSQL for development.
--
--   psql -U postgres -h localhost -f scripts/db/bootstrap.sql
--
-- Creates the runtime role and the dev + test databases.
--
-- app_user is deliberately NOT a superuser and carries NOBYPASSRLS. Row-Level
-- Security is our second tenant-isolation layer, and it silently does nothing
-- when the connecting role is privileged -- which is exactly how teams end up
-- believing they have RLS when they do not. Migrations run as `postgres` (the
-- table owner); the application only ever connects as app_user.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user
      LOGIN PASSWORD 'app_dev_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

SELECT 'CREATE DATABASE restaurant_platform_dev OWNER postgres'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'restaurant_platform_dev')\gexec

SELECT 'CREATE DATABASE restaurant_platform_test OWNER postgres'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'restaurant_platform_test')\gexec
