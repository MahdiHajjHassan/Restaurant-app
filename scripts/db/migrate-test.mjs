import { spawnSync } from "node:child_process";
import { config } from "dotenv";

/*
 * Apply migrations to the TEST database.
 *
 * `npm run db:migrate` reads MIGRATION_DATABASE_URL, which points at the
 * development database locally -- so the test database silently falls behind.
 * The integration suite then runs against a stale schema and fails in ways that
 * look like application bugs rather than a missing column.
 *
 * CI does not need this: there, MIGRATION_DATABASE_URL already points at the
 * test database because it is the only database that exists.
 */
config({ path: ".env.local", quiet: true });

const url = process.env.TEST_MIGRATION_DATABASE_URL;

if (!url) {
  console.error(
    "TEST_MIGRATION_DATABASE_URL is not set. Copy .env.example to .env.local.",
  );
  process.exit(1);
}

const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, MIGRATION_DATABASE_URL: url },
});

process.exit(result.status ?? 1);
