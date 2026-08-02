import { createDatabase } from "@/core/db/client";
import { env } from "@/env";

/**
 * Composition root for the database.
 *
 * Cached on globalThis because Next.js hot-reload re-evaluates modules on every
 * edit; without this, a long dev session leaks a connection pool per reload
 * until Postgres refuses new connections.
 */
const globalForDb = globalThis as unknown as {
  __restaurantDb?: ReturnType<typeof createDatabase>;
};

const instance =
  globalForDb.__restaurantDb ??
  createDatabase({ connectionString: env.DATABASE_URL });

if (env.NODE_ENV !== "production") {
  globalForDb.__restaurantDb = instance;
}

export const db = instance.db;
export const pool = instance.pool;
