import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Database client factory.
 *
 * node-postgres deliberately, not a serverless HTTP driver: Row-Level Security
 * relies on `SET LOCAL app.tenant_id` holding for the life of a transaction,
 * and that requires a real session on a real connection. Using the same driver
 * locally and against Neon means RLS behaves identically in dev, CI, and
 * production -- a tenant-isolation bug that only appears in production is the
 * one bug this product cannot afford.
 */
export type Database = ReturnType<typeof createDatabase>["db"];

export interface DatabaseOptions {
  connectionString: string;
  /** Cap the pool; serverless runtimes open many short-lived instances. */
  maxConnections?: number;
}

export function createDatabase({
  connectionString,
  maxConnections = 10,
}: DatabaseOptions) {
  const pool = new Pool({
    connectionString,
    max: maxConnections,
  });

  const db = drizzle(pool, { schema });

  return { db, pool };
}

/** Round-trips a trivial query. Used by health checks and CI wiring tests. */
export async function checkConnection(pool: Pool): Promise<boolean> {
  const result = await pool.query("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
