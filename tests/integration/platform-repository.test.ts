import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/core/db/client";
import { findRestaurant, listRestaurants } from "@/core/platform/repository";

/**
 * The operator's data access, against a real PostgreSQL.
 *
 * These tables sit OUTSIDE Row-Level Security on purpose -- a tenant, its
 * domains and its memberships are all read before any tenant context can
 * exist. That makes correctness here entirely a matter of explicit queries,
 * with no policy underneath to catch a mistake, which is why it is tested
 * against the real database rather than a mock.
 *
 * Cleanup is scoped to this file's own slugs. It must NEVER truncate: other
 * integration files run concurrently and would lose their fixtures mid-test.
 */

const PREFIX = "plat-repo";
let db: Database;
let appPool: Pool;
let adminPool: Pool;

async function reset(): Promise<void> {
  await adminPool.query("DELETE FROM tenants WHERE slug LIKE $1", [
    `${PREFIX}-%`,
  ]);
  await adminPool.query("DELETE FROM users WHERE email LIKE $1", [
    `%@${PREFIX}.test`,
  ]);
}

beforeAll(async () => {
  const appUrl = process.env.DATABASE_URL;
  const adminUrl = process.env.MIGRATION_DATABASE_URL;
  if (!appUrl || !adminUrl) {
    throw new Error("DATABASE_URL and MIGRATION_DATABASE_URL must be set");
  }
  ({ db, pool: appPool } = createDatabase({
    connectionString: appUrl,
    maxConnections: 5,
  }));
  adminPool = new Pool({ connectionString: adminUrl, max: 2 });
  await reset();
});

afterAll(async () => {
  await reset();
  await Promise.all([appPool.end(), adminPool.end()]);
});

describe("reading restaurants", () => {
  it("lists a restaurant with its primary domain", async () => {
    const { rows } = await adminPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, name, status, currency, timezone, default_locale)
       VALUES ($1, 'Plat Repo One', 'active', 'USD', 'Asia/Beirut', 'en')
       RETURNING id`,
      [`${PREFIX}-one`],
    );
    const tenantId = rows[0]!.id;
    await adminPool.query(
      `INSERT INTO domains (tenant_id, hostname, is_primary, verified_at)
       VALUES ($1, $2, true, now()), ($1, $3, false, NULL)`,
      [tenantId, `${PREFIX}-one.example.test`, `extra.${PREFIX}.test`],
    );

    const listed = await listRestaurants(db);
    const found = listed.find((row) => row.id === tenantId);

    expect(found?.name).toBe("Plat Repo One");
    expect(found?.status).toBe("active");
    // The primary, not merely the first: the console shows the operator where
    // this restaurant actually lives.
    expect(found?.primaryDomain).toBe(`${PREFIX}-one.example.test`);
  });

  it("returns one restaurant with every domain it has", async () => {
    const { rows } = await adminPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, name, status, currency, timezone, default_locale)
       VALUES ($1, 'Plat Repo Two', 'trial', 'LBP', 'Asia/Beirut', 'ar')
       RETURNING id`,
      [`${PREFIX}-two`],
    );
    const tenantId = rows[0]!.id;
    await adminPool.query(
      `INSERT INTO domains (tenant_id, hostname, is_primary, verified_at)
       VALUES ($1, $2, true, now()), ($1, $3, false, NULL)`,
      [tenantId, `${PREFIX}-two.example.test`, `custom.${PREFIX}.test`],
    );

    const detail = await findRestaurant(db, tenantId);

    expect(detail?.defaultLocale).toBe("ar");
    expect(detail?.currency).toBe("LBP");
    expect(detail?.domains).toHaveLength(2);
    const custom = detail?.domains.find((d) => d.hostname.startsWith("custom"));
    // Unverified, and therefore not resolving. The console must show that.
    expect(custom?.verifiedAt).toBeNull();
  });

  it("returns null for a tenant that does not exist", async () => {
    const missing = await findRestaurant(
      db,
      "00000000-0000-4000-8000-000000000000",
    );
    expect(missing).toBeNull();
  });
});
