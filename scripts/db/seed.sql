-- Demo tenants for local development.
--
--   psql -U postgres -h localhost -d restaurant_platform_dev -f scripts/db/seed.sql
--
-- Runs as the owner role, which is not subject to the RLS policies -- seeding
-- is an operator action, not an application one.
--
-- Idempotent: safe to re-run.
--
-- Two tenants on purpose. A single demo tenant hides exactly the bug this
-- platform cannot afford, because every query looks correct when there is only
-- one restaurant's data to return.

-- ─── Alpha Grill: active, USD, English default ────────────────────────────

INSERT INTO tenants (slug, name, status, currency, timezone, default_locale)
VALUES ('alpha-grill', 'Alpha Grill', 'active', 'USD', 'Asia/Beirut', 'en')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO domains (tenant_id, hostname, is_primary, verified_at)
SELECT id, 'alpha-grill.localhost', true, now() FROM tenants WHERE slug = 'alpha-grill'
ON CONFLICT (hostname) DO NOTHING;

-- ─── Beta Bistro: active, LBP, Arabic default ─────────────────────────────

INSERT INTO tenants (slug, name, status, currency, timezone, default_locale)
VALUES ('beta-bistro', 'Beta Bistro', 'active', 'LBP', 'Asia/Beirut', 'ar')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO domains (tenant_id, hostname, is_primary, verified_at)
SELECT id, 'beta-bistro.localhost', true, now() FROM tenants WHERE slug = 'beta-bistro'
ON CONFLICT (hostname) DO NOTHING;

-- ─── Gamma Cafe: suspended, and an UNVERIFIED domain ──────────────────────
-- Exercises the two paths that are easy to get wrong: a suspended tenant must
-- explain itself rather than 404, and an unverified domain must not resolve at
-- all -- otherwise anyone could point DNS here and serve a lookalike site.

INSERT INTO tenants (slug, name, status, currency, timezone, default_locale)
VALUES ('gamma-cafe', 'Gamma Cafe', 'suspended', 'USD', 'Asia/Beirut', 'en')
ON CONFLICT (slug) DO UPDATE SET status = EXCLUDED.status;

INSERT INTO domains (tenant_id, hostname, is_primary, verified_at)
SELECT id, 'gamma-cafe.localhost', true, now() FROM tenants WHERE slug = 'gamma-cafe'
ON CONFLICT (hostname) DO NOTHING;

INSERT INTO domains (tenant_id, hostname, is_primary, verified_at)
SELECT id, 'unverified.localhost', false, NULL FROM tenants WHERE slug = 'alpha-grill'
ON CONFLICT (hostname) DO NOTHING;

-- ─── Menu content ─────────────────────────────────────────────────────────

WITH tenant AS (SELECT id FROM tenants WHERE slug = 'alpha-grill')
INSERT INTO categories (tenant_id, name_en, name_ar, sort_order)
SELECT tenant.id, c.name_en, c.name_ar, c.sort_order
FROM tenant, (VALUES
  ('Starters', 'المقبلات', 0),
  ('Grills',   'المشاوي', 1),
  ('Drinks',   'المشروبات', 2)
) AS c(name_en, name_ar, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE tenant_id = tenant.id
);

WITH tenant AS (SELECT id FROM tenants WHERE slug = 'beta-bistro')
INSERT INTO categories (tenant_id, name_en, name_ar, sort_order)
SELECT tenant.id, c.name_en, c.name_ar, c.sort_order
FROM tenant, (VALUES
  ('Breakfast', 'الفطور', 0),
  ('Pastries',  'المعجنات', 1)
) AS c(name_en, name_ar, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE tenant_id = tenant.id
);

-- Prices are minor units. 1250 = $12.50; LBP has no minor unit, so 350000 is
-- 350,000 LBP. The exponent comes from the currency at render time.
WITH ctx AS (
  SELECT c.id AS category_id, c.tenant_id, c.name_en AS category
  FROM categories c
  JOIN tenants t ON t.id = c.tenant_id
  WHERE t.slug = 'alpha-grill'
)
INSERT INTO items (tenant_id, category_id, name_en, name_ar, description_en, base_price_minor, sort_order, badges)
SELECT ctx.tenant_id, ctx.category_id, i.name_en, i.name_ar, i.description_en, i.price, i.sort_order, i.badges
FROM ctx
JOIN (VALUES
  ('Starters', 'Hummus',         'حمص',        'Chickpea, tahini, olive oil',     650, 0, ARRAY['vegetarian']),
  ('Starters', 'Fattoush',       'فتوش',       'Garden salad, sumac, crisp bread', 800, 1, ARRAY['vegetarian']),
  ('Grills',   'Chicken Taouk',  'شيش طاووق',  'Marinated chicken skewers',       1450, 0, ARRAY[]::text[]),
  ('Grills',   'Lamb Kafta',     'كفتة',       'Minced lamb, parsley, onion',     1650, 1, ARRAY['spicy']),
  ('Drinks',   'Fresh Lemonade', 'ليموناضة',   'Lemon, mint',                      450, 0, ARRAY[]::text[])
) AS i(category, name_en, name_ar, description_en, price, sort_order, badges)
  ON i.category = ctx.category
WHERE NOT EXISTS (
  SELECT 1 FROM items WHERE tenant_id = ctx.tenant_id
);

-- Split shift plus a segment crossing midnight, so the "Open now" logic has a
-- real case to be tested against rather than a tidy 09:00-17:00.
WITH tenant AS (SELECT id FROM tenants WHERE slug = 'alpha-grill')
INSERT INTO opening_hours (tenant_id, day_of_week, opens_at, closes_at)
SELECT tenant.id, h.dow, h.opens::time, h.closes::time
FROM tenant, (VALUES
  (1, '11:00', '15:00'), (1, '18:00', '23:00'),
  (2, '11:00', '15:00'), (2, '18:00', '23:00'),
  (3, '11:00', '15:00'), (3, '18:00', '23:00'),
  (4, '11:00', '15:00'), (4, '18:00', '23:00'),
  (5, '11:00', '15:00'), (5, '18:00', '01:00'),
  (6, '12:00', '01:00')
) AS h(dow, opens, closes)
WHERE NOT EXISTS (
  SELECT 1 FROM opening_hours WHERE tenant_id = tenant.id
);

INSERT INTO contact_settings (tenant_id, address_en, address_ar, phone, whatsapp)
SELECT id, 'Hamra Street, Beirut', 'شارع الحمرا، بيروت', '+961 1 000 000', '+961 70 000 000'
FROM tenants WHERE slug = 'alpha-grill'
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO theme_settings (tenant_id, preset, font_pair)
SELECT id, 'list', 'default' FROM tenants WHERE slug IN ('alpha-grill', 'beta-bistro')
ON CONFLICT (tenant_id) DO NOTHING;
