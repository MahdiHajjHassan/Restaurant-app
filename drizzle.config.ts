import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });

/**
 * Migrations run as the OWNER role (MIGRATION_DATABASE_URL), not as the
 * application's app_user. app_user holds DML rights only, so it cannot create
 * tables -- and, more importantly, cannot drop an RLS policy.
 */
const connectionString =
  process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "MIGRATION_DATABASE_URL (or DATABASE_URL) must be set. Copy .env.example to .env.local.",
  );
}

export default defineConfig({
  schema: "./src/core/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: connectionString },
  strict: true,
  verbose: true,
});
