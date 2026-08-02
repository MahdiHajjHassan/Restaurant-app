import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "@/core/db/client";
import { TENANT_SCOPED_TABLES } from "@/core/db/schema";
import { InvalidTenantIdError, withTenant } from "@/core/db/tenant";
import { createMenuRepository } from "@/core/menu/repository";

/**
 * The isolation suite.
 *
 * One restaurant reading another's data is the one failure that would end this
 * product, so this file attacks the boundary on purpose rather than merely
 * exercising the happy path. Critically, several tests bypass the repository
 * layer entirely and issue raw SQL -- if they pass, Row-Level Security is
 * genuinely holding on its own rather than being carried by a WHERE clause
 * somewhere above it.
 */

/** Resolves to the rejection reason, failing loudly if the promise succeeds. */
async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the operation to be rejected, but it succeeded");
}

/**
 * Drizzle wraps driver errors, so the PostgreSQL SQLSTATE lives on the cause.
 * Walks the chain to find it.
 */
function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === "object" && "code" in current) {
      const { code } = current as { code?: unknown };
      if (typeof code === "string") return code;
    }
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return undefined;
}

/** Unprivileged runtime role -- the one real requests use. */
let db: Database;
let appPool: Pool;

/** Owner role. Used only to seed and clean, never to assert. */
let adminPool: Pool;

let tenantA: string;
let tenantB: string;

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

  await adminPool.query("TRUNCATE TABLE tenants CASCADE");

  const seeded = await adminPool.query<{ id: string }>(
    `INSERT INTO tenants (slug, name, currency, timezone)
     VALUES ('alpha-grill', 'Alpha Grill', 'USD', 'Asia/Beirut'),
            ('beta-bistro', 'Beta Bistro', 'LBP', 'Asia/Beirut')
     RETURNING id`,
  );
  tenantA = seeded.rows[0]!.id;
  tenantB = seeded.rows[1]!.id;

  // Each tenant gets a category and an item, created through the real API.
  for (const [tenantId, label] of [
    [tenantA, "Alpha"],
    [tenantB, "Beta"],
  ] as const) {
    await withTenant(db, tenantId, async (session) => {
      const repo = createMenuRepository(session);
      const category = await repo.createCategory({ nameEn: `${label} Mains` });
      await repo.createItem({
        categoryId: category.id,
        nameEn: `${label} Burger`,
        basePriceMinor: 1250,
      });
    });
  }
});

afterAll(async () => {
  await adminPool.query("TRUNCATE TABLE tenants CASCADE");
  await Promise.all([appPool.end(), adminPool.end()]);
});

describe("repository layer (isolation layer 1)", () => {
  it("returns only the session tenant's categories", async () => {
    const names = await withTenant(db, tenantA, async (session) => {
      const rows = await createMenuRepository(session).listCategories();
      return rows.map((row) => row.nameEn);
    });

    expect(names).toEqual(["Alpha Mains"]);
  });

  it("gives each tenant a different view of the same table", async () => {
    const forB = await withTenant(db, tenantB, async (session) =>
      (await createMenuRepository(session).listItems()).map((i) => i.nameEn),
    );

    expect(forB).toEqual(["Beta Burger"]);
  });

  it("cannot fetch another tenant's item by its id", async () => {
    const foreignId = await withTenant(db, tenantB, async (session) => {
      const [item] = await createMenuRepository(session).listItems();
      return item!.id;
    });

    const result = await withTenant(db, tenantA, async (session) =>
      createMenuRepository(session).setItemAvailability(foreignId, false),
    );

    expect(result).toBeNull();
  });

  it("rejects a malformed tenant id instead of running unscoped", async () => {
    await expect(
      withTenant(db, "not-a-uuid", async () => "unreachable"),
    ).rejects.toBeInstanceOf(InvalidTenantIdError);
  });
});

describe("row-level security (isolation layer 2, repository bypassed)", () => {
  it("filters raw unscoped SQL to the session tenant", async () => {
    // No WHERE clause at all. Anything returned here comes from RLS alone.
    const rows = await withTenant(db, tenantA, async (session) =>
      session.tx.execute<{ name_en: string }>(
        sql`SELECT name_en FROM categories`,
      ),
    );

    expect(rows.rows.map((r) => r.name_en)).toEqual(["Alpha Mains"]);
  });

  it("returns nothing when no tenant context is set — fails closed", async () => {
    // Outside withTenant, so app.tenant_id was never set. The dangerous failure
    // mode would be returning every tenant's rows; assert it returns none.
    const rows = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM categories`,
    );

    expect(rows.rows[0]?.count).toBe("0");
  });

  it("blocks writing a row into another tenant", async () => {
    const error = await captureError(
      withTenant(db, tenantA, async (session) =>
        session.tx.execute(sql`
          INSERT INTO categories (tenant_id, name_en)
          VALUES (${tenantB}::uuid, 'Smuggled')
        `),
      ),
    );

    // 42501 is insufficient_privilege -- what a WITH CHECK violation raises.
    // Asserting the SQLSTATE rather than the message pins the *reason* for the
    // rejection: a test matching on text would still pass if the insert began
    // failing for some unrelated cause, quietly stopping the check on RLS.
    expect(pgErrorCode(error)).toBe("42501");
  });

  it("blocks reassigning a row to another tenant", async () => {
    const error = await captureError(
      withTenant(db, tenantA, async (session) =>
        session.tx.execute(sql`
          UPDATE categories SET tenant_id = ${tenantB}::uuid
        `),
      ),
    );

    expect(pgErrorCode(error)).toBe("42501");
  });

  it("releases the tenant context when the transaction ends", async () => {
    // Pooled connections are reused. If the setting outlived its transaction,
    // the next request on that connection would inherit another tenant's scope.
    await withTenant(db, tenantA, async () => undefined);

    const rows = await db.execute<{ value: string | null }>(
      sql`SELECT current_setting('app.tenant_id', true) AS value`,
    );
    const value = rows.rows[0]?.value;

    expect(value === null || value === "").toBe(true);
  });
});

describe("policy coverage", () => {
  // A new tenant-scoped table added without a policy is a silent data leak.
  // This makes that mistake fail CI instead.
  it.each(TENANT_SCOPED_TABLES)("%s has RLS enabled and a policy", async (table) => {
    const enabled = await adminPool.query<{ rowsecurity: boolean }>(
      "SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = $1",
      [table],
    );
    const policies = await adminPool.query(
      "SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1",
      [table],
    );

    expect(enabled.rows[0]?.rowsecurity, `${table} RLS`).toBe(true);
    expect(policies.rowCount, `${table} policy count`).toBeGreaterThan(0);
  });

  it("every table carrying tenant_id is either scoped or a declared exception", async () => {
    // Both of these carry tenant_id but must stay outside RLS, because each is
    // read BEFORE a tenant context can exist: `domains` resolves a hostname to
    // a tenant, and `memberships` answers which restaurants a signed-in user
    // may administer. Listing them here means a future unprotected table fails
    // this test rather than quietly joining the exemption.
    const DELIBERATELY_UNSCOPED = ["domains", "memberships"];

    const { rows } = await adminPool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'tenant_id'
       ORDER BY table_name`,
    );

    const unaccountedFor = rows
      .map((r) => r.table_name)
      .filter(
        (name) =>
          !DELIBERATELY_UNSCOPED.includes(name) &&
          !(TENANT_SCOPED_TABLES as readonly string[]).includes(name),
      );

    expect(unaccountedFor).toEqual([]);
  });
});
