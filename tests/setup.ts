import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Point every test at the dedicated test database.
 *
 * Integration tests truncate tables. Without this redirect, a developer running
 * the suite locally would silently wipe their development data -- and the tests
 * would still pass, which is the worst possible failure mode.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
if (process.env.TEST_MIGRATION_DATABASE_URL) {
  process.env.MIGRATION_DATABASE_URL = process.env.TEST_MIGRATION_DATABASE_URL;
}

process.env.PLATFORM_DOMAIN ??= "localhost:3000";
process.env.STORAGE_DRIVER ??= "local";
