-- Take `memberships` out of RLS, deliberately.
--
-- The policy on this table failed closed exactly as designed, and that is what
-- exposed the problem: "which restaurants may this user administer?" is the
-- query that DECIDES the tenant context, so it necessarily runs before one
-- exists. Under RLS it matched nothing, and every owner was told they had no
-- restaurant.
--
-- `memberships` is authorization metadata, structurally the same as `domains`:
-- both map an outside identifier (a hostname, a user) onto a tenant, and both
-- must be readable before any tenant is known. Neither holds customer data.
--
-- What protects it instead:
--   * Both queries filter on user_id, which comes from the session cookie and
--     never from client input.
--   * findMembership() takes an explicit (user_id, tenant_id) pair, and every
--     admin Server Action calls it before touching tenant data.
--   * The tables that actually hold restaurant data keep their policies, so
--     the second isolation layer still stands where it matters.
--
-- The alternative -- a second privileged connection just for this read -- would
-- put an RLS-bypassing pool in the application, which is a far larger footgun
-- than an unprotected join table.

ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON memberships;
