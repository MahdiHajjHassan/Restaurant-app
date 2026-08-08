import { test as base } from "@playwright/test";
import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";
import { hashPassword } from "@/core/auth/password";
import { site } from "./urls";

/*
 * A restaurant per Playwright project, for the tests that write.
 *
 * WHY THIS EXISTS
 *
 * `test.describe.configure({ mode: "serial" })` serialises a file WITHIN one
 * project. It does not and cannot reach across projects: `chromium` and
 * `mobile` are two independent runs of the same file, and with more than one
 * worker they execute at the same time. Both used to sign in as the same owner
 * and toggle the same seeded dish, so one run flipped Hummus to sold-out while
 * the other was asserting it started available -- a failure that reads exactly
 * like a product bug and is not one.
 *
 * Dropping to `workers: 1` would hide it at the cost of slowing the read-only
 * public specs, which are genuinely parallel-safe. Instead each project gets
 * its own tenant, its own owner, and its own login identifiers, so there is no
 * shared row left to race over. The seeded demo tenants stay read-only for the
 * whole suite.
 *
 * Provisioning runs as the migration role, like scripts/db/seed.sql: creating a
 * restaurant is an operator action, not an application one, and the app role
 * deliberately cannot write outside a tenant context.
 */

config({ path: ".env.local", quiet: true });

export const SANDBOX_PASSWORD = "demo-password-123";

/** Platform-wide operator identity, scoped to each tenant by membership. */
export const OPERATOR_EMAIL = "operator@platform.test";

export interface Sandbox {
  /** The restaurant this project's admin tests own outright. */
  id: string;
  slug: string;
  /** Display name, as the admin header renders it. */
  name: string;
  /** Its public site origin. */
  site: string;
  /** An owner of `id` and of nothing else, so login lands straight on it. */
  owner: string;
  password: string;
  /**
   * An address with no account, for the enumeration test. Per-project because
   * the login rate limiter counts failures per email: a shared address
   * accumulates one failure per project per run and eventually answers "too
   * many attempts" instead of the message under test.
   */
  unknownEmail: string;
  /** A real restaurant this owner has no membership in. */
  rival: { id: string; dish: string };
}

/** Only appears if the admin's authorization check has failed. */
const RIVAL_DISH = "Manakish Zaatar";

/**
 * One tenant per project AND per parallel slot.
 *
 * The project alone is not enough once more than one spec file writes. Three of
 * them do, and Playwright is free to run them on different workers of the same
 * project at the same time -- both would then provision the same slug and reset
 * each other's menu mid-test, which is the original bug wearing a different hat.
 *
 * `parallelIndex` rather than `workerIndex`: it is the slot number, bounded by
 * the worker count and reused when a worker restarts, so the number of tenants
 * stays small instead of growing with every crash.
 */
function slugFor(projectName: string, parallelIndex: number): string {
  const cleaned = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `e2e-${cleaned}-${parallelIndex}`;
}

async function upsertTenant(
  client: PoolClient,
  slug: string,
  name: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO tenants (slug, name, status, currency, timezone, default_locale)
     VALUES ($1, $2, 'active', 'USD', 'Asia/Beirut', 'en')
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name, status = 'active', currency = 'USD'
     RETURNING id`,
    [slug, name],
  );

  const row = result.rows[0];
  if (!row) throw new Error(`Upsert returned no tenant row for ${slug}`);
  return row.id;
}

/**
 * Rebuilds the menu and hours from scratch every time.
 *
 * Idempotence is not enough here: a run killed halfway leaves a dish sold out
 * or a price edited, and the next run then fails on the previous one's debris.
 * Deleting the categories cascades to items and variants.
 */
async function resetMenu(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("DELETE FROM categories WHERE tenant_id = $1", [tenantId]);

  await client.query(
    `WITH cat AS (
       INSERT INTO categories (tenant_id, name_en, name_ar, sort_order)
       VALUES ($1, 'Starters', 'المقبلات', 0), ($1, 'Grills', 'المشاوي', 1)
       RETURNING id, name_en
     )
     INSERT INTO items (tenant_id, category_id, name_en, name_ar,
                        description_en, base_price_minor, sort_order, badges)
     SELECT $1, cat.id, i.name_en, i.name_ar, i.description_en,
            i.price, i.sort_order, i.badges
     FROM cat
     JOIN (VALUES
       ('Starters', 'Hummus',        'حمص',       'Chickpea, tahini, olive oil',      650, 0, ARRAY['vegetarian']),
       ('Starters', 'Fattoush',      'فتوش',      'Garden salad, sumac, crisp bread',  800, 1, ARRAY['vegetarian']),
       ('Grills',   'Chicken Taouk', 'شيش طاووق', 'Marinated chicken skewers',        1450, 0, ARRAY[]::text[])
     ) AS i(category, name_en, name_ar, description_en, price, sort_order, badges)
       ON i.category = cat.name_en`,
    [tenantId],
  );

  await client.query("DELETE FROM opening_hours WHERE tenant_id = $1", [
    tenantId,
  ]);
  // Sunday and Tuesday are left closed: the hours tests write to those days.
  // Friday keeps a segment crossing midnight so 18:00-01:00 appears twice once
  // Sunday is filled in, which is what makes the Sunday-row scoping in that
  // test load bearing rather than decorative.
  await client.query(
    `INSERT INTO opening_hours (tenant_id, day_of_week, opens_at, closes_at)
     VALUES ($1, 1, '11:00', '15:00'),
            ($1, 1, '18:00', '23:00'),
            ($1, 5, '18:00', '01:00')`,
    [tenantId],
  );

  /*
   * A known theme baseline, rewritten each run rather than left alone.
   *
   * The theme editor specs change palette, pairing and preset, so a killed run
   * leaves this tenant on whatever it was mid-test and the next run asserts
   * against the previous one's debris. DO UPDATE, and overrides cleared, so
   * every run starts from the same place.
   *
   * 'paper'/'classic'/'list' are the platform defaults, which makes a spec that
   * changes something to a non-default value unambiguous.
   */
  await client.query(
    `INSERT INTO theme_settings (tenant_id, palette_id, font_pair, preset, palette, logo_id)
     VALUES ($1, 'paper', 'classic', 'list', '{}'::jsonb, NULL)
     ON CONFLICT (tenant_id) DO UPDATE
       SET palette_id = EXCLUDED.palette_id,
           font_pair  = EXCLUDED.font_pair,
           preset     = EXCLUDED.preset,
           palette    = EXCLUDED.palette,
           logo_id    = EXCLUDED.logo_id`,
    [tenantId],
  );

  /*
   * Drop uploads from previous runs.
   *
   * The dishes above were just recreated, so their image_id is already null --
   * but the `media` rows those uploads created are not reachable from anything
   * now and would accumulate one set per run forever. The objects they point at
   * stay on disk; that is dev-only cruft under a gitignored directory, and
   * chasing it would mean giving the fixture storage-adapter access for no real
   * benefit.
   */
  await client.query("DELETE FROM media WHERE tenant_id = $1", [tenantId]);
}

async function provision(
  projectName: string,
  parallelIndex: number,
): Promise<Sandbox> {
  // The app role cannot write outside a tenant context, by design.
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "MIGRATION_DATABASE_URL must be set: the browser suite provisions a " +
        "tenant per project, which is an operator-role action. Copy " +
        ".env.example to .env.local and fill it in.",
    );
  }

  const slug = slugFor(projectName, parallelIndex);
  const name = `E2E ${projectName} ${parallelIndex}`;
  const owner = `owner@${slug}.test`;
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    // Sequential awaits throughout: a transaction is pinned to one connection
    // and PostgreSQL cannot serve concurrent queries on it.
    await client.query("BEGIN");

    const tenantId = await upsertTenant(client, slug, name);

    await client.query(
      `INSERT INTO domains (tenant_id, hostname, is_primary, verified_at)
       VALUES ($1, $2, true, now())
       ON CONFLICT (hostname) DO UPDATE
         SET tenant_id = EXCLUDED.tenant_id, verified_at = now()`,
      [tenantId, `${slug}.localhost`],
    );

    await resetMenu(client, tenantId);

    const rivalId = await upsertTenant(
      client,
      `${slug}-rival`,
      `E2E ${projectName} rival`,
    );
    // No domain and no owner: this restaurant is only ever addressed by id, to
    // prove the admin refuses it.
    await client.query("DELETE FROM categories WHERE tenant_id = $1", [rivalId]);
    await client.query(
      `WITH cat AS (
         INSERT INTO categories (tenant_id, name_en, sort_order)
         VALUES ($1, 'Breakfast', 0)
         RETURNING id
       )
       INSERT INTO items (tenant_id, category_id, name_en, base_price_minor)
       SELECT $1, cat.id, $2, 75000 FROM cat`,
      [rivalId, RIVAL_DISH],
    );

    const passwordHash = await hashPassword(SANDBOX_PASSWORD);
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [owner, slug, passwordHash],
    );
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error(`Upsert returned no user row for ${owner}`);

    await client.query(
      `INSERT INTO memberships (tenant_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner'`,
      [tenantId, userId],
    );
    // Exactly one membership, so signing in redirects straight to the tenant.
    await client.query(
      "DELETE FROM memberships WHERE user_id = $1 AND tenant_id <> $2",
      [userId, tenantId],
    );

    /*
     * The platform operator, with a membership in this project's tenant.
     *
     * Per-token colour entry in the theme editor is an operator capability, and
     * `requireMembership` still applies to them -- being a platform admin does
     * not by itself grant access to a restaurant. Provisioned here rather than
     * leaning on `scripts/create-admin.ts` so the suite has no setup step
     * outside itself, and so it works against a database where that script was
     * never run.
     *
     * One shared operator identity rather than one per project: the flag is
     * platform-wide, and the memberships below are what scope it. Its password
     * is only ever correct, so it accrues no rate-limiter failures to share.
     */
    const operatorHash = await hashPassword(SANDBOX_PASSWORD);
    const operator = await client.query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash, is_platform_admin)
       VALUES ($1, 'platform operator', $2, true)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, is_platform_admin = true
       RETURNING id`,
      [OPERATOR_EMAIL, operatorHash],
    );
    const operatorId = operator.rows[0]?.id;
    if (!operatorId) throw new Error("Upsert returned no operator row");

    await client.query(
      `INSERT INTO memberships (tenant_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner'`,
      [tenantId, operatorId],
    );

    const unknownEmail = `nobody@${slug}.test`;
    // Failed attempts from earlier runs are still inside the limiter's
    // 15-minute window; left in place they answer "too many attempts" to the
    // test that asserts on the wrong-password wording.
    await client.query(
      "DELETE FROM login_attempts WHERE identifier = ANY($1::text[])",
      [[owner, unknownEmail]],
    );

    await client.query("COMMIT");

    return {
      id: tenantId,
      slug,
      name,
      site: site(`${slug}.localhost`),
      owner,
      password: SANDBOX_PASSWORD,
      unknownEmail,
      rival: { id: rivalId, dish: RIVAL_DISH },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Worker-scoped: provisioning happens once per worker that actually runs a
 * writing spec, not once per test.
 */
export const test = base.extend<object, { sandbox: Sandbox }>({
  sandbox: [
    // The empty pattern is required: Playwright reads the destructured names
    // to work out fixture dependencies, and rejects a plain parameter.
    async ({}, use, workerInfo) => {
      await use(
        await provision(workerInfo.project.name, workerInfo.parallelIndex),
      );
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
