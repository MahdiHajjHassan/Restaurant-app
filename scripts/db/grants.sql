-- Grant the runtime role access to a database's public schema.
-- Run once per database, connected to that database:
--
--   psql -U postgres -h localhost -d restaurant_platform_dev  -f scripts/db/grants.sql
--   psql -U postgres -h localhost -d restaurant_platform_test -f scripts/db/grants.sql
--
-- app_user gets DML only -- never DDL. It cannot create, alter, or drop tables,
-- so a compromised application connection cannot disable an RLS policy.
--
-- The ALTER DEFAULT PRIVILEGES lines matter: without them every future
-- migration would create tables that app_user cannot read, and the app would
-- break on deploy rather than in CI.

GRANT USAGE ON SCHEMA public TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_user;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
