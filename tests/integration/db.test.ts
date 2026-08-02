import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkConnection, createDatabase } from "@/core/db/client";

/**
 * Wiring test for the database foundation.
 *
 * The privilege assertions below are not ceremony. Row-Level Security is the
 * second of our two tenant-isolation layers, and it fails OPEN: if the runtime
 * role is ever a superuser or gains BYPASSRLS, every policy silently stops
 * applying and every test still passes. Asserting the role's privileges is the
 * only way that regression gets caught -- so it is checked here, in CI, on
 * every run.
 */
describe("database connection", () => {
  let pool: Pool;

  beforeAll(() => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. tests/setup.ts loads .env.local and redirects to TEST_DATABASE_URL.",
      );
    }
    ({ pool } = createDatabase({ connectionString, maxConnections: 2 }));
  });

  afterAll(async () => {
    await pool.end();
  });

  it("connects and round-trips a query", async () => {
    expect(await checkConnection(pool)).toBe(true);
  });

  it("runs against the test database, never the development one", async () => {
    const { rows } = await pool.query<{ current_database: string }>(
      "SELECT current_database()",
    );
    expect(rows[0]?.current_database).toBe("restaurant_platform_test");
  });

  it("connects as an unprivileged role that cannot bypass RLS", async () => {
    const { rows } = await pool.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );

    expect(rows[0]?.rolsuper, "runtime role must not be a superuser").toBe(
      false,
    );
    expect(rows[0]?.rolbypassrls, "runtime role must not bypass RLS").toBe(
      false,
    );
  });

  it("cannot create tables — DDL belongs to migrations, not the app", async () => {
    await expect(
      pool.query("CREATE TABLE should_not_exist (id int)"),
    ).rejects.toThrow(/permission denied/i);
  });
});
