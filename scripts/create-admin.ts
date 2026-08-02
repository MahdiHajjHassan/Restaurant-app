/**
 * Creates or updates an admin user and grants them a restaurant.
 *
 *   node scripts/create-admin.ts <email> <password> <tenant-slug> [owner|staff]
 *
 * Imports the real hashing code rather than reimplementing it: a script with
 * its own copy of the password format is a script that silently drifts and
 * produces hashes the application cannot verify.
 */
import { config } from "dotenv";
import { Pool } from "pg";
import { hashPassword } from "../src/core/auth/password.ts";

config({ path: ".env.local", quiet: true });

const [email, password, slug, role = "owner"] = process.argv.slice(2);

if (!email || !password || !slug) {
  console.error(
    "Usage: node scripts/create-admin.ts <email> <password> <tenant-slug> [owner|staff]",
  );
  process.exit(1);
}

const connectionString =
  process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("MIGRATION_DATABASE_URL or DATABASE_URL must be set.");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

try {
  const passwordHash = await hashPassword(password);
  const normalised = email.trim().toLowerCase();

  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (email, name, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [normalised, normalised.split("@")[0], passwordHash],
  );
  const createdUser = user.rows[0];
  if (!createdUser) throw new Error("Upsert returned no user row");

  const tenant = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM tenants WHERE slug = $1",
    [slug],
  );
  const targetTenant = tenant.rows[0];
  if (!targetTenant) {
    console.error(`No tenant with slug "${slug}". Run the seed first.`);
    process.exit(1);
  }

  await pool.query(
    `INSERT INTO memberships (tenant_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [targetTenant.id, createdUser.id, role],
  );

  console.log(
    `${normalised} can now administer ${targetTenant.name} as ${role}.`,
  );
} finally {
  await pool.end();
}
