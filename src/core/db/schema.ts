/**
 * Drizzle schema.
 *
 * Intentionally empty in Phase 0 -- the foundation is being verified before any
 * tables exist. Phase 1 adds the tenant core here: tenants, domains, users,
 * memberships, categories, items, item_variants, theme_settings,
 * contact_settings, opening_hours, media -- each with a tenant_id and an RLS
 * policy keyed on `current_setting('app.tenant_id')`.
 */

export {};
