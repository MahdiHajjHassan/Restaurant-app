-- Row-Level Security: the second, independent tenant-isolation layer.
--
-- Layer one is the repository API, which cannot be constructed without a tenant
-- context. This is what catches the day someone bypasses it -- a raw query, a
-- new endpoint, a mistake in a migration script. Defence in depth is warranted
-- here specifically because one restaurant reading another's data is the single
-- failure that would end this product.
--
-- Design notes:
--
--   * `current_setting('app.tenant_id', true)` returns NULL when unset rather
--     than raising, and NULLIF maps an empty string to NULL too. `tenant_id =
--     NULL` evaluates to NULL, so the row is filtered out. The policy therefore
--     FAILS CLOSED: forget to set the context and you get zero rows, never
--     somebody else's rows.
--
--   * WITH CHECK mirrors USING so a write cannot smuggle a row into another
--     tenant. Reads and writes are equally constrained.
--
--   * No FORCE ROW LEVEL SECURITY. Policies already apply to app_user because
--     it does not own these tables, and that is the boundary that matters. The
--     owner role stays unrestricted so migrations and seeding can work.
--
--   * tenants, domains and users are deliberately excluded: host-to-tenant
--     resolution has to read them BEFORE any tenant context can exist, and they
--     hold no cross-tenant customer data.

DO $$
DECLARE
  target text;
  tenant_scoped text[] := ARRAY[
    'memberships',
    'media',
    'categories',
    'items',
    'item_variants',
    'theme_settings',
    'contact_settings',
    'opening_hours'
  ];
BEGIN
  FOREACH target IN ARRAY tenant_scoped LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', target);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO PUBLIC '
      'USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
      'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      target
    );
  END LOOP;
END
$$;

-- The runtime role gets DML only. It cannot create, alter or drop anything --
-- so a compromised application connection cannot disable a policy above.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_user;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_user;
